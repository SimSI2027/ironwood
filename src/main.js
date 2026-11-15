// IRONWOOD Mk I: an exploded view of a pump-action shotgun, built entirely in code.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import fontMed from '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2';
import fontSemi from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2';
import {createStage, FLOOR_Y} from './stage.js';
import {buildBarrel} from './barrel.js';
import {buildMagazine} from './magazine.js';
import {buildForend} from './forend.js';
import {buildReceiver} from './receiver.js';
import {buildBolt} from './bolt.js';
import {buildTrigger} from './trigger.js';
import {buildStock} from './stock.js';
import {buildPad} from './pad.js';
import {createTour, TOUR_LEN} from './tour.js';

const q = new URLSearchParams(location.search);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

async function loadFonts() {
  const faces = [
    new FontFace('Barlow Condensed', `url(data:font/woff2;base64,${fontMed})`, {weight: '500'}),
    new FontFace('Barlow Condensed', `url(data:font/woff2;base64,${fontSemi})`, {weight: '600'}),
  ];
  await Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))).catch(() => {});
}

function el(tag, cls, html, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

async function main() {
  await loadFonts();
  const app = document.getElementById('app');
  const canvas = el('canvas', null, null, app);
  canvas.id = 'gl';
  const S = createStage(canvas);
  const {scene, camera} = S;

  // --- the object
  const asms = [buildBarrel(), buildMagazine(), buildForend(), buildReceiver(), buildBolt(), buildTrigger(), buildStock(), buildPad()];
  const gun = new THREE.Group();
  gun.position.set(-12, 0, 0);
  asms.forEach((a) => gun.add(a.group));
  scene.add(gun);
  const meshes = [];
  gun.traverse((o) => o.isMesh && meshes.push(o));

  // --- UI
  const ui = el('div', 'iw', null, app);
  const head = el('div', 'iw-head', '<span class="iw-brand">IRONWOOD <b>Mk I</b></span><span class="iw-dot">·</span><span class="iw-sub">Exploded view. Drag, scroll, take it apart.</span>', ui);
  el('div', 'iw-rule', null, ui);
  const hint = el('div', 'iw-hint', null, ui);
  const setHint = () => (hint.textContent = `${asms.length} assemblies · ${asms.reduce((n, a) => n + a.parts.length, 0)} parts · ${meshes.length} meshes · ${S.tier} quality`);

  // --- quality tier: ?q=high|low forces it; phones start low; otherwise start high and let a
  // 1 s frame-time probe at load drop to low if the median frame is slower than ~48 fps
  const forced = ['high', 'low'].includes(q.get('q')) ? q.get('q') : null;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  S.setTier(forced || (phone ? 'low' : 'high'));
  let probe = forced || phone ? null : {n: 0, t0: 0, dts: []};
  setHint();
  const lead = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lead.setAttribute('class', 'iw-lead');
  lead.innerHTML = '<polyline points="" visibility="hidden"/><circle r="2.6" visibility="hidden"/><circle r="6" class="halo" visibility="hidden"/>';
  ui.appendChild(lead);
  const [lLine, lDot, lHalo] = lead.children;
  const card = el('div', 'iw-card', '<div class="nm"></div><div class="as"></div>', ui);
  const dock = el('div', 'iw-dock', null, ui);
  const ctl = el('div', 'iw-ctl', '<label>Explode</label>', dock);
  const range = el('input', 'iw-range', null, ctl);
  Object.assign(range, {type: 'range', min: 0, max: 1, step: 0.001, value: 0});
  const out = el('output', null, '0.00', ctl);
  const tourBtn = el('button', 'iw-btn iw-tour', 'Tour', ctl);
  const pills = el('div', 'iw-pills', null, dock);
  const pillBtns = asms.map((a, i) => {
    const b = el('button', 'iw-btn', `<i>0${i + 1}</i>${a.label}`, pills);
    b.onclick = () => focusOn(focus === i ? -1 : i);
    return b;
  });
  head.title = 'IRONWOOD Mk I';

  // --- controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 12;
  controls.maxDistance = 760;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 0.45;
  controls.zoomSpeed = 0.9;
  let lastInput = performance.now();
  let fly = null;
  controls.addEventListener('start', () => {
    lastInput = performance.now();
    fly = null;
    if (tour.active) stopTour();
  });

  // --- state
  const st = {explode: Number(q.get('explode') ?? 0), target: Number(q.get('explode') ?? 0), pump: 0};
  range.value = st.target;
  let focus = -1;
  const alpha = asms.map(() => 1);

  const poseAll = (e, p) => asms.forEach((a) => a.pose(e, p));
  const box = new THREE.Box3();
  const sph = new THREE.Sphere();
  /** Camera that frames an object from the front-right 3/4. */
  function frame(obj, dir = new THREE.Vector3(0.38, 0.3, 1), fill = 0.82) {
    gun.updateMatrixWorld(true);
    box.setFromObject(obj);
    box.getBoundingSphere(sph);
    // portrait screens: the long gun fits a sphere badly side-on, so look further along its
    // axis (it foreshortens) and fill tighter
    const tall = camera.aspect < 0.8;
    if (tall) {
      dir = dir.clone();
      dir.x += 0.6;
      fill *= 1.05; // fill scales distance: >1 backs off
    }
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const f = Math.min(vf, hf);
    const dist = (sph.radius / Math.sin(f)) * fill;
    const t = sph.center.clone();
    t.y -= dist * Math.tan(vf) * (tall ? 0.06 : 0.2);
    if (tall) t.x += sph.radius * 0.1; // the near (muzzle) end grows in perspective: re-centre
    return {t, p: t.clone().add(dir.clone().normalize().multiplyScalar(dist))};
  }
  function flyTo(c, dur = 1.2) {
    fly = {t0: performance.now(), dur: dur * 1000, ft: controls.target.clone(), fp: camera.position.clone(), tt: c.t, tp: c.p};
  }
  function focusOn(i) {
    focus = i;
    pillBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    poseAll(st.explode, st.pump);
    flyTo(i < 0 ? frame(gun, undefined, 0.74) : frame(asms[i].group, new THREE.Vector3(0.42, 0.34, 1), 1.05));
  }

  // --- tour
  const tour = createTour({asms, gun, poseAll, frame, camera});
  function startTour() {
    pinned = false;
    setHover(null);
    focusOn(-1);
    fly = null;
    tour.start(performance.now());
    tourBtn.classList.add('on');
  }
  function stopTour() {
    tour.active = false;
    tourBtn.classList.remove('on');
    tourBtn.style.removeProperty('--t');
    lastInput = performance.now();
    st.target = Number(range.value);
  }
  tourBtn.onclick = () => (tour.active ? stopTour() : startTour());

  range.addEventListener('input', () => {
    st.target = Number(range.value);
    lastInput = performance.now();
    if (tour.active) stopTour();
  });

  // --- hover
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer = null;
  let hovered = null;
  let pinned = false; // touch: a tap pins the card until the next tap
  const anchor = new THREE.Vector3(); // hit point in the hovered part's local space
  const setNdc = (e) => ndc.set((e.clientX / S.size.w) * 2 - 1, -(e.clientY / S.size.h) * 2 + 1);
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = {x: e.clientX, y: e.clientY};
    setNdc(e);
  });
  canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && (pointer = null));
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = {x: e.clientX, y: e.clientY, t: performance.now()}));
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' || !down) return;
    const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 450;
    down = null;
    if (!tap) return;
    setNdc(e);
    pointer = {x: e.clientX, y: e.clientY};
    const h = pick(true);
    pinned = !!h;
    if (!h) pointer = null;
    setHover(h);
  });
  const asmLabel = Object.fromEntries(asms.map((a, i) => [a.key, `${String(i + 1).padStart(2, '0')} · ${a.label}`]));
  function pick(force = false) {
    if (!pointer || (fly && !force)) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(meshes, false);
    for (const h of hits) {
      const root = h.object.userData.partRoot;
      if (!root) continue;
      const ai = asms.findIndex((a) => a.key === root.userData.asm);
      if (alpha[ai] < 0.6) continue;
      anchor.copy(root.worldToLocal(h.point.clone()));
      return root;
    }
    return null;
  }
  const cardPos = {x: 0, y: 0, side: 1, init: false};
  function setHover(h) {
    if (h === hovered) return;
    hovered = h;
    cardPos.init = false;
    S.select(h);
    card.classList.toggle('show', !!h);
    if (h) {
      card.children[0].textContent = h.userData.part;
      const al = asmLabel[h.userData.asm];
      card.children[1].textContent = al.split(' · ')[1].toLowerCase() === h.userData.part.toLowerCase() ? `assembly ${al.split(' · ')[0]}` : al;
    }
  }
  /** Leader from the hit point: short diagonal, then a horizontal run into the card's edge. */
  function drawLeader(dt) {
    const a = S.project(hovered.localToWorld(anchor.clone()));
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const phone = S.size.w < 720;
    const dx = phone ? 34 : 54;
    const dy = phone ? 44 : 62;
    const side = a.x + dx + 26 + cw > S.size.w - 12 ? -1 : 1;
    const up = a.y - dy - ch < 70 ? -1 : 1;
    const ex = a.x + side * dx;
    const ey = a.y - up * dy;
    const tx = side > 0 ? ex + 26 : ex - 26 - cw;
    const ty = Math.min(S.size.h - ch - 8, Math.max(8, ey - ch / 2));
    const k = cardPos.init ? 1 - Math.exp(-dt * 18) : 1;
    cardPos.x += (tx - cardPos.x) * k;
    cardPos.y += (ty - cardPos.y) * k;
    cardPos.init = true;
    card.classList.toggle('flip', side < 0);
    card.style.transform = `translate(${cardPos.x.toFixed(1)}px, ${cardPos.y.toFixed(1)}px)`;
    const cx = side > 0 ? cardPos.x : cardPos.x + cw;
    const cy = cardPos.y + ch / 2;
    lLine.setAttribute('points', `${a.x},${a.y} ${ex},${cy} ${cx},${cy}`);
    for (const c of [lDot, lHalo]) {
      c.setAttribute('cx', a.x);
      c.setAttribute('cy', a.y);
    }
    const vis = a.visible ? 'visible' : 'hidden';
    for (const c of [lLine, lDot, lHalo]) c.setAttribute('visibility', vis);
  }

  // --- resize and initial camera
  const onResize = () => S.resize();
  addEventListener('resize', onResize);
  onResize();
  poseAll(st.explode, 0);
  const hero = frame(gun, new THREE.Vector3(0.42, 0.3, 1), 0.74);
  camera.position.copy(hero.p);
  controls.target.copy(hero.t);
  controls.update();
  if (q.has('tour')) startTour();

  const still = q.has('still');
  let prev = performance.now();
  let lastE = NaN;
  let lastP = NaN;
  const tick = (now) => {
    const raw = now - prev;
    const dt = Math.min(0.05, raw / 1000);
    prev = now;
    if (probe) {
      // skip the first 10 frames (shader compiles, shadow first-render), then sample one second
      probe.n++;
      if (probe.n === 11) probe.t0 = now;
      else if (probe.n > 11) probe.dts.push(raw);
      if (probe.t0 && now - probe.t0 > 1000) {
        const d = probe.dts.sort((x, y) => x - y);
        const med = d[d.length >> 1] || 0;
        if (med > 21) S.setTier('low');
        window.__PROBE = {median: +med.toFixed(1), frames: d.length, tier: S.tier};
        probe = null;
        setHint();
      }
    }

    if (tour.active) {
      const k = tour.at((now - tour.t0) / 1000);
      st.explode = k.explode;
      st.pump = k.pump;
      range.value = k.explode;
      if (k.focus !== focus) {
        focus = k.focus;
        pillBtns.forEach((b, i) => b.classList.toggle('on', i === focus));
      }
      controls.target.copy(k.cam.t);
      camera.position.copy(k.cam.p);
      tourBtn.style.setProperty('--t', `${Math.min(100, ((now - tour.t0) / 10 / TOUR_LEN)).toFixed(1)}%`);
      if (k.done) stopTour();
    } else {
      st.explode += (st.target - st.explode) * (still ? 1 : 1 - Math.exp(-dt * 9));
      st.pump += (0 - st.pump) * (1 - Math.exp(-dt * 8));
    }
    out.value = st.explode.toFixed(2);
    range.style.setProperty('--p', `${(st.explode * 100).toFixed(1)}%`);
    poseAll(st.explode, st.pump);

    // dimming
    asms.forEach((a, i) => {
      const want = focus < 0 || focus === i ? 1 : 0.25;
      alpha[i] += (want - alpha[i]) * (still ? 1 : 1 - Math.exp(-dt * 8));
      a.setOpacity(Math.abs(alpha[i] - 1) < 0.004 ? 1 : alpha[i]);
    });

    // camera flight
    if (fly && !tour.active) {
      const t = ease(clamp01((now - fly.t0) / fly.dur));
      controls.target.lerpVectors(fly.ft, fly.tt, t);
      camera.position.lerpVectors(fly.fp, fly.tp, t);
      if (t >= 1) fly = null;
    }
    controls.autoRotate = !still && !tour.active && !fly && now - lastInput > 5000;
    if (!tour.active) controls.update(dt);
    else camera.lookAt(controls.target);

    // hover outline + name card
    if (!pinned) setHover(tour.active ? null : pick());
    else if (hovered && alpha[asms.findIndex((a) => a.key === hovered.userData.asm)] < 0.6) {
      pinned = false;
      setHover(null);
    }
    if (hovered) drawLeader(dt);
    else for (const c of [lLine, lDot, lHalo]) c.setAttribute('visibility', 'hidden');

    // shadows follow the parts, not the camera: re-render them only when something moved
    if (Math.abs(st.explode - lastE) > 1e-5 || Math.abs(st.pump - lastP) > 1e-5 || Number.isNaN(lastE)) {
      S.renderer.shadowMap.needsUpdate = true;
      lastE = st.explode;
      lastP = st.pump;
    }
    S.render();
    if (!window.__READY) {
      window.__READY = true;
      window.__STATS = {meshes: meshes.length, parts: asms.reduce((n, a) => n + a.parts.length, 0), tris: S.renderer.info.render.triangles, tier: S.tier};
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.IRONWOOD = {asms, gun, st, focusOn, startTour, TOUR_LEN, floor: FLOOR_Y, camera};
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#e66;position:fixed;left:16px;top:80px">${e.stack || e}</pre>`);
});
