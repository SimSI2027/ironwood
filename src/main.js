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
import {createTour, TOUR_LEN, blend} from './tour.js';
import {channelsAt, createShells, strokeAt, cAtStroke, TICKS, FIRE_TICKS, tickAt, FULL_S, FIRE_END, pumpC, tOfC} from './cycle.js';
import {createFireFX, recoilAt, RECOIL, shotX} from './fire.js';
import {MAG_Y} from './barrel.js';
import {PUMP} from './forend.js';

const q = new URLSearchParams(location.search);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smr = (a, b, x) => ((x = clamp01((x - a) / (b - a))), x * x * (3 - 2 * x));

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
  asms.forEach((a) => (gun.add(a.group), a.finalize()));
  scene.add(gun);
  const meshes = [];
  gun.traverse((o) => o.isMesh && meshes.push(o));
  // pump-cycle shells: posed from the clock st.t, not hoverable (added after the hover list)
  const shells = createShells();
  gun.add(shells.group);
  const fx = createFireFX();
  gun.add(fx.group);

  // --- UI
  const ui = el('div', 'iw', null, app);
  const head = el('div', 'iw-head', '<span class="iw-brand">IRONWOOD <b>Mk I</b></span><span class="iw-dot">·</span><span class="iw-sub">Exploded view. Drag, scroll, take it apart.</span>', ui);
  const qSeg = el('span', 'iw-q', '<button data-t="high">High</button><button data-t="low">Low</button>', head);
  el('div', 'iw-rule', null, ui);
  const hint = el('div', 'iw-hint', null, ui);
  const setHint = () => (hint.textContent = `${asms.length} assemblies · ${asms.reduce((n, a) => n + a.parts.length, 0)} parts · ${meshes.length} meshes · ${S.tier} quality`);

  // --- quality tier: ?q=high|low forces it; then a remembered header choice; then a discrete GPU
  // (WebGL renderer string) starts high; else phones start low and the rest run a 1 s probe of the
  // real per-frame render cost (render + 1 px readback to sync the GPU), high when it averages < 12 ms
  const forced = ['high', 'low'].includes(q.get('q')) ? q.get('q') : null;
  let stored = null;
  try {
    stored = localStorage.getItem('ironwood.q');
  } catch (e) {}
  if (!['high', 'low'].includes(stored)) stored = null;
  const gl = S.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  const discrete = /nvidia|geforce|quadro|rtx|gtx|radeon\s*(rx|pro|r9|vii)|arc\(tm\)\s*a\d|intel.*\barc\b/i.test(gpu);
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const pre = forced || stored || (discrete ? 'high' : phone ? 'low' : null);
  S.setTier(pre || 'high');
  let probe = pre ? null : {n: 0, t0: 0, dts: []};
  const px = new Uint8Array(4);
  window.__PROBE = {gpu, discrete, tier: S.tier, by: forced ? 'url' : stored ? 'stored' : discrete ? 'gpu' : phone ? 'phone' : 'probe'};
  const showQ = () => [...qSeg.children].forEach((b) => b.classList.toggle('on', b.dataset.t === S.tier));
  qSeg.onclick = (e) => {
    const t = e.target.dataset?.t;
    if (!t) return;
    probe = null;
    S.setTier(t);
    try {
      localStorage.setItem('ironwood.q', t);
    } catch (err) {}
    showQ();
    setHint();
  };
  showQ();
  setHint();
  const lead = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lead.setAttribute('class', 'iw-lead');
  lead.innerHTML = '<polyline points="" visibility="hidden"/><circle r="2.6" visibility="hidden"/><circle r="6" class="halo" visibility="hidden"/>';
  ui.appendChild(lead);
  const [lLine, lDot, lHalo] = lead.children;
  const card = el('div', 'iw-card', '<div class="nm"></div><div class="as"></div>', ui);
  const dock = el('div', 'iw-dock', null, ui);
  // CYCLE panel: FIRE / PUMP / FULL, frame step and play, speeds, readout; one scrubber split into the
  // FIRE and PUMP segments (the active one takes 70% of the track and shows its tick labels)
  const ico = {
    prev: '<svg viewBox="0 0 16 16"><rect x="3" y="3" width="1.8" height="10"/><path d="M13 3 6 8l7 5z"/></svg>',
    play: '<svg viewBox="0 0 16 16"><path class="pl" d="M5 2.8 13.2 8 5 13.2z"/><path class="pa" d="M4.2 3h2.6v10H4.2zM9.2 3h2.6v10H9.2z"/></svg>',
    next: '<svg viewBox="0 0 16 16"><rect x="11.2" y="3" width="1.8" height="10"/><path d="M3 3l7 5-7 5z"/></svg>',
  };
  const cycEl = el(
    'div',
    'iw-cyc',
    `<label>Cycle</label><div class="iw-seg"><button data-g="fire">Fire</button><button data-g="pump">Pump</button><button data-g="full">Full</button></div>` +
      `<div class="iw-cb"><button class="iw-ib" data-a="prev" aria-label="Back one frame">${ico.prev}</button>` +
      `<button class="iw-ib iw-play" data-a="play" aria-label="Play">${ico.play}</button><button class="iw-ib" data-a="next" aria-label="Forward one frame">${ico.next}</button></div>` +
      `<div class="iw-tl"><div class="iw-segl"><b>Fire</b><b>Pump</b></div><input class="iw-range" type="range" min="0" max="1" step="0.0005" value="0" aria-label="Clock position"><div class="iw-ticks">` +
      TICKS.map((k) => `<span><i></i><b>${k.name}</b></span>`).join('') +
      `</div></div><div class="iw-spd"><button data-s="1">1x</button><button data-s="0.25" class="on">0.25x</button><button data-s="0.1">0.1x</button><button data-s="0.05">0.05x</button></div>` +
      `<output class="iw-sec">0.000 s · f 0</output>` +
      `<button class="iw-ib iw-more" aria-label="More cycle controls" aria-expanded="false"><svg viewBox="0 0 16 16"><path d="M3 6l5 5 5-5"/></svg></button>`,
    dock,
  );
  const cMore = cycEl.querySelector('.iw-more');
  cMore.onclick = () => cMore.setAttribute('aria-expanded', String(cycEl.classList.toggle('open')));
  const cRange = cycEl.querySelector('.iw-range');
  const cOut = cycEl.querySelector('.iw-sec');
  const cPlay = cycEl.querySelector('.iw-play');
  const tickEls = [...cycEl.querySelectorAll('.iw-ticks span')];
  const segL = cycEl.querySelector('.iw-segl');
  const segBtns = [...cycEl.querySelectorAll('.iw-seg button')];
  const spdBtns = [...cycEl.querySelectorAll('.iw-spd button')];
  // scrubber mapping: the FIRE segment takes w of the track, PUMP the rest
  const NF = FULL_S * 240; // frames at 240 fps over the whole clock
  const seg = {w: 0.7, drag: false, key: ''};
  const tToV = (t) => (t < FIRE_END ? (seg.w * t) / FIRE_END : seg.w + ((1 - seg.w) * (t - FIRE_END)) / (1 - FIRE_END));
  const vToT = (v) => (v < seg.w ? (FIRE_END * v) / seg.w : FIRE_END + ((1 - FIRE_END) * (v - seg.w)) / (1 - seg.w));
  cRange.addEventListener('pointerdown', () => (seg.drag = true));
  addEventListener('pointerup', () => (seg.drag = false));
  /** Place the ticks for the current split; labels only for the active segment, never overlapping (the active tick wins). */
  function layoutTicks(ti) {
    const fire = st.t < FIRE_END;
    const W = tickEls[0].parentNode.offsetWidth;
    segL.style.setProperty('--w', seg.w);
    const placed = [];
    const order = tickEls.map((e, i) => i).sort((a, b) => (a === ti ? -1 : b === ti ? 1 : a - b));
    for (const i of order) {
      const e = tickEls[i];
      const x = tToV(TICKS[i].t);
      e.style.setProperty('--x', x);
      const mine = i < FIRE_TICKS.length === fire;
      const bw = e.lastChild.offsetWidth;
      const c = x * W;
      const l = i === 0 ? c - bw - 10 : i === TICKS.length - 1 ? c + 10 : c - bw / 2;
      const ok = mine && !placed.some(([a, b]) => l < b + 8 && l + bw > a - 8);
      if (ok) placed.push([l, l + bw]);
      e.classList.toggle('hid', !ok);
    }
  }
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
    dir = null;
    if (tour.active) stopTour();
  });

  // --- state
  const st = {explode: Number(q.get('explode') ?? 0), target: Number(q.get('explode') ?? 0), t: Math.min(1, Math.max(0, Number(q.get('t') ?? 0))), fired: false};
  range.value = st.target;
  let focus = -1;
  const dim = asms.map(() => 0);
  const rim = asms.map(() => 0);
  const xr = asms.map(() => 0); // per-assembly x-ray, set from the clock
  let xg = 0; // x-ray gate: the clock is running on the assembled gun

  const HERO_DIR = new THREE.Vector3(0.42, 0.3, 1);
  const poseAll = (e, p) => asms.forEach((a) => a.pose(e, p));
  /** World corners of every visible mesh's own box: much tighter than one box round a long gun. */
  function pointsOf(obj) {
    gun.updateMatrixWorld(true);
    const pts = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld));
    });
    return pts;
  }
  /** NDC y range of the free band between the header and the dock. */
  function band() {
    const h = S.size.h;
    const top = Math.max(head.getBoundingClientRect().bottom, hint.offsetParent ? hint.getBoundingClientRect().bottom : 0) + 6;
    const bot = dock.getBoundingClientRect().top - 6;
    const lo = 1 - (2 * bot) / h;
    const hi = 1 - (2 * top) / h;
    return hi - lo > 0.5 ? [lo, hi] : [-1, 1];
  }
  /**
   * Camera {t, p} looking along dir with every point of obj inside the free band, 8% of the
   * viewport clear on each side, at any aspect. fill > 1 backs off further.
   */
  function frame(obj, dir = new THREE.Vector3(0.38, 0.3, 1), fill = 1, adjust = true) {
    const pts = pointsOf(obj);
    dir = dir.clone();
    if (adjust && camera.aspect < 0.8) dir.x += 0.6; // portrait: look further along the axis
    dir.normalize();
    const f = dir.clone().negate();
    const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
    const u = new THREE.Vector3().crossVectors(r, f);
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tx = ty * camera.aspect;
    const m = 0.16; // 8% of the viewport on each side, in NDC units
    const [b0, b1] = band();
    const W = {x0: -1 + m, x1: 1 - m, y0: b0 + m, y1: b1 - m};
    const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const P = pts.map((p) => {
      p.sub(c);
      return [p.dot(r), p.dot(u), p.dot(f)];
    });
    let ox = 0;
    let oy = 0;
    let D = Math.max(...P.map((q) => Math.hypot(q[0], q[1]))) / Math.min(tx, ty) * 1.5 + 1;
    for (let it = 0; it < 16; it++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of P) {
        const z = Math.max(q[2] + D, 1e-3);
        const x = (q[0] - ox) / (z * tx);
        const y = (q[1] - oy) / (z * ty);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      ox += ((x0 + x1) / 2 - (W.x0 + W.x1) / 2) * D * tx;
      oy += ((y0 + y1) / 2 - (W.y0 + W.y1) / 2) * D * ty;
      D *= Math.max((x1 - x0) / (W.x1 - W.x0), (y1 - y0) / (W.y1 - W.y0));
    }
    const t = c.clone().addScaledVector(r, ox).addScaledVector(u, oy);
    return {t, p: t.clone().addScaledVector(dir, D * fill)};
  }
  function flyTo(c, dur = 1.2) {
    fly = {t0: performance.now(), dur: dur * 1000, ft: controls.target.clone(), fp: camera.position.clone(), tt: c.t, tp: c.p};
  }
  function focusOn(i) {
    focus = i;
    dir = null;
    pillBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    poseAll(st.explode, channelsAt(st.t, st.fired));
    flyTo(i < 0 ? frame(gun, HERO_DIR) : frame(asms[i].group, new THREE.Vector3(0.42, 0.34, 1), 1.15));
  }

  // --- clock camera: a pure function of t. Pushes to the trigger group for Press-Strike, tracks the
  // shot down the barrel, pulls wide for Muzzle-Recoil, moves to the port for the eject. Keys are
  // framed on the assembled gun at rest.
  let ckeys = null;
  let dir = null; // {from, t0}: the camera follows the clock (FIRE/PUMP/FULL, scrubber, step)
  function clockKeys() {
    const gp = gun.position.clone();
    const gr = gun.rotation.z;
    gun.position.set(-12, 0, 0);
    gun.rotation.z = 0;
    poseAll(0, 0);
    gun.updateMatrixWorld(true);
    const wide = frame(gun, HERO_DIR);
    const trig = frame(asms[5].group, new THREE.Vector3(0.2, 0.12, 1), 1.35);
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(1, camera.aspect);
    const at = (x, y, z, d, h) => {
      const t = gun.localToWorld(new THREE.Vector3(x, y, z));
      return {t, p: t.clone().addScaledVector(d.normalize(), h / k)};
    };
    const track = (x) => at(x, 0, 0, new THREE.Vector3(-0.35, 0.32, 1), 10);
    // the port and the ejected shell's whole envelope (apex 12 cm up, landing and roll on the floor),
    // framed into the free band between the header and the dock
    const env = new THREE.Mesh(new THREE.BoxGeometry(18, 45, 38));
    env.position.set(-11, -10, 18.5);
    gun.add(env);
    const port = frame(env, new THREE.Vector3(0.3, 0.5, 1), 1.0, false);
    env.removeFromParent();
    env.geometry.dispose();
    gun.position.copy(gp);
    gun.rotation.z = gr;
    poseAll(st.explode, channelsAt(st.t, st.fired));
    return {wide, trig, track, port};
  }
  function clockCam(t, fresh = false) {
    if (fresh || !ckeys) ckeys = clockKeys();
    const K = ckeys;
    if (t < 0.11) return blend(K.wide, K.trig, smr(0, 0.03, t));
    if (t < 0.204) return blend(K.trig, K.track(t < 0.15 ? 3 : shotX(t)), smr(0.11, 0.14, t));
    if (t < 0.3) return blend(K.track(shotX(Math.min(t, 0.21))), K.wide, smr(0.204, 0.222, t)); // pulls wide through the flash
    return blend(K.wide, K.port, smr(0.3, 0.4, t));
  }
  const direct = () => !dir && (dir = {from: null, t0: 0});
  /** x-ray per phase: trigger group and receiver Press-Strike, barrel Burn-Travel, receiver in the pump. */
  function xrayAt(t) {
    const e = 0.006;
    const win = (a, b) => smr(a - e, a, t) * (1 - smr(b, b + e, t));
    return {receiver: Math.max(win(0.025, 0.115), win(0.3, 0.99)), trigger: win(0.025, 0.115), barrel: win(0.11, 0.212)};
  }

  // --- tour
  const tour = createTour({asms, gun, poseAll, frame, camera, clockCam});
  function startTour() {
    dir = null;
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
  // --- drag the forend along the barrel axis to drive the cycle: pulling back runs c 0 -> 0.5,
  // pushing forward 0.5 -> 1. Pointer-down on it disables orbit until release.
  const cyc = {playing: false, speed: 0.25, tw: null, stop: 1, mode: ''};
  let drag = null;
  const canDrag = (h) => h && h.userData.asm === 'forend' && st.explode < 0.05 && !tour.active;
  app.addEventListener(
    'pointerdown',
    (e) => {
      // capture phase on the parent: runs before OrbitControls' own listener on the canvas
      if (e.target !== canvas) return;
      setNdc(e);
      const keep = pointer;
      pointer = {x: e.clientX, y: e.clientY};
      const h = pick(true);
      pointer = keep;
      if (!canDrag(h)) return;
      controls.enabled = false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      drag = {id: e.pointerId, x: e.clientX, y: e.clientY};
      cyc.playing = false;
      cyc.tw = null;
      fly = null;
      lastInput = performance.now();
    },
    true,
  );
  function dragStroke(ds) {
    let c = pumpC(st.t);
    if (c >= 1 - 1e-4 && ds > 0) c = 0; // a finished cycle: pulling again starts the next one
    const s = Math.min(1, Math.max(0, strokeAt(c) + ds));
    if (c < 0.5) c = s >= 1 - 1e-4 ? 0.5 : cAtStroke(s, false);
    else c = s >= 1 ? 0.5 : cAtStroke(s, true);
    st.t = tOfC(c);
  }
  const axA = new THREE.Vector3();
  const axB = new THREE.Vector3();
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // the barrel axis on screen, in px per cm, at the magazine line
    const a = S.project(gun.localToWorld(axA.set(14, MAG_Y, 0)));
    const b = S.project(gun.localToWorld(axB.set(24, MAG_Y, 0)));
    const ax = (b.x - a.x) / 10;
    const ay = (b.y - a.y) / 10;
    const l2 = ax * ax + ay * ay;
    if (l2 > 1e-4) dragStroke(((e.clientX - drag.x) * ax + (e.clientY - drag.y) * ay) / l2 / PUMP);
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInput = performance.now();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    controls.enabled = true;
    if (st.t >= 0.999 || st.t <= FIRE_END + 0.001) st.t = 0; // back to closed: x-ray off
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  const engage = () => {
    // the cycle runs on the assembled gun
    if (tour.active) stopTour();
    st.target = 0;
    range.value = 0;
    lastInput = performance.now();
    direct();
  };
  cRange.addEventListener('input', () => {
    engage();
    cyc.playing = false;
    cyc.tw = null;
    st.t = vToT(Number(cRange.value));
  });
  const setSpeed = (s) => ((cyc.speed = s), spdBtns.forEach((k) => k.classList.toggle('on', Number(k.dataset.s) === s)));
  // FIRE: 0 -> 0.30 at 0.1x · PUMP: 0.30 -> 1 (ejects spent only if FIRE ran) · FULL: 0 -> 1
  cycEl.querySelector('.iw-seg').onclick = (e) => {
    const g = e.target.closest('button')?.dataset.g;
    if (!g) return;
    engage();
    cyc.tw = null;
    cyc.playing = true;
    cyc.mode = g;
    if (g === 'fire') (st.t = 0), (cyc.stop = FIRE_END), setSpeed(0.1);
    else if (g === 'pump') (st.t = FIRE_END), (cyc.stop = 1), setSpeed(0.25);
    else (st.t = 0), (cyc.stop = 1), setSpeed(0.25);
  };
  const stepTo = (to, from = st.t) => (cyc.tw = {from, to, t0: performance.now(), dur: 450});
  cycEl.querySelector('.iw-cb').onclick = (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (!a) return;
    engage();
    if (a === 'play') {
      cyc.tw = null;
      cyc.playing = !cyc.playing;
      if (cyc.playing && st.t >= cyc.stop - 1e-4) st.t = cyc.stop === FIRE_END ? 0 : 0;
      return;
    }
    // frame step: 1/240 s of the clock at 1x, on the frame grid
    cyc.playing = false;
    cyc.tw = null;
    st.t = clamp01((Math.round(st.t * NF) + (a === 'next' ? 1 : -1)) / NF);
  };
  cycEl.querySelector('.iw-spd').onclick = (e) => {
    const b = e.target.closest('button');
    if (b) setSpeed(Number(b.dataset.s));
  };
  const partByName = (n) =>
    n === 'shell' ? shells.fresh : n === 'chambered' || n === 'ejected' ? shells.chambered() : n === 'shot column' ? fx.shot : asms.flatMap((a) => a.parts).find((p) => p.name === n)?.obj;
  let lastTick = -1;
  const asmLabel = Object.fromEntries(asms.map((a, i) => [a.key, `${String(i + 1).padStart(2, '0')} · ${a.label}`]));
  function pick(force = false) {
    if (!pointer || (fly && !force)) return null;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(meshes, false);
    for (const h of hits) {
      const root = h.object.userData.partRoot;
      if (!root) continue;
      const ai = asms.findIndex((a) => a.key === root.userData.asm);
      if (dim[ai] > 0.4) continue;
      if (xr[ai] > 0.5 && root.userData.xray) continue; // x-ray: pick what is inside
      anchor.copy(root.worldToLocal(h.point.clone()));
      return root;
    }
    return null;
  }
  const cardPos = {x: 0, y: 0, side: 1, init: false};
  const hb = new THREE.Box3();
  function setHover(h, centre = false) {
    if (h === hovered) return;
    hovered = h;
    if (h && centre) anchor.copy(h.worldToLocal(hb.setFromObject(h).getCenter(new THREE.Vector3())));
    cardPos.init = false;
    S.select(h);
    card.classList.toggle('show', !!h);
    if (h) {
      card.children[0].textContent = h.userData.part;
      const al = asmLabel[h.userData.asm];
      card.children[1].textContent = !al ? 'cartridge' : al.split(' · ')[1].toLowerCase() === h.userData.part.toLowerCase() ? `assembly ${al.split(' · ')[0]}` : al;
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
  // resize: the default (whole gun) view is refitted along the current view direction
  const onResize = () => {
    S.resize();
    ckeys = null;
    if (!window.__READY || tour.active) return;
    if (focus >= 0) return flyTo(frame(asms[focus].group, new THREE.Vector3(0.42, 0.34, 1), 1.15), 0.3);
    fly = null;
    const c = frame(gun, camera.position.clone().sub(controls.target), 1, false);
    camera.position.copy(c.p);
    controls.target.copy(c.t);
  };
  addEventListener('resize', onResize);
  S.resize();
  poseAll(st.explode, 0);
  const hero = frame(gun, HERO_DIR);
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
      if (probe.t0 && now - probe.t0 > 1000) {
        const avg = probe.dts.reduce((a, b) => a + b, 0) / Math.max(1, probe.dts.length);
        S.setTier(avg < 12 ? 'high' : 'low');
        Object.assign(window.__PROBE, {avg: +avg.toFixed(1), frames: probe.dts.length, tier: S.tier});
        probe = null;
        setHint();
        showQ();
      }
    }

    if (tour.active) {
      const k = tour.at((now - tour.t0) / 1000);
      st.explode = k.explode;
      st.t = k.t;
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
    }
    out.value = st.explode.toFixed(2);
    range.style.setProperty('--p', `${(st.explode * 100).toFixed(1)}%`);
    if (!tour.active) {
      if (cyc.tw) {
        const t = clamp01((now - cyc.tw.t0) / cyc.tw.dur);
        st.t = cyc.tw.from + (cyc.tw.to - cyc.tw.from) * ease(t);
        if (t >= 1) cyc.tw = null;
      } else if (cyc.playing) {
        st.t += (dt * cyc.speed) / FULL_S;
        if (cyc.stop === FIRE_END && st.t >= FIRE_END) {
          st.t = FIRE_END; // FIRE holds at the end of the recoil, ready to pump
          cyc.playing = false;
        } else if (st.t >= 1) {
          st.t = 0;
          dir = null; // the camera stays at the port
          cyc.playing = false;
        }
      }
    }
    // cycle panel readout; x-ray the receiver while the cycle is off closed
    // fired: the last pass through FIRE got past the strike (a pump then ejects a spent shell)
    if (st.t < FIRE_END) st.fired = st.t >= 0.11;
    if (!seg.drag) seg.w += ((st.t < FIRE_END ? 0.7 : 0.3) - seg.w) * (still ? 1 : 1 - Math.exp(-dt * 10));
    const v = tToV(st.t);
    cRange.value = v;
    cRange.style.setProperty('--p', `${(v * 100).toFixed(1)}%`);
    cOut.value = `${(st.t * FULL_S).toFixed(3)} s · f ${Math.round(st.t * NF)}`;
    segBtns.forEach((b) => b.classList.toggle('on', cyc.playing && b.dataset.g === cyc.mode));
    cPlay.classList.toggle('on', cyc.playing);
    const active = st.t > 0.0005 && st.explode < 0.05;
    const ti = tickAt(st.t);
    if (ti !== lastTick) tickEls.forEach((e, i) => e.classList.toggle('on', i === ti));
    const lk = `${ti}|${seg.w.toFixed(3)}|${S.size.w}`;
    if (lk !== seg.key) layoutTicks(ti);
    seg.key = lk;
    lastTick = ti;
    xg += ((active ? 1 : 0) - xg) * (still ? 1 : 1 - Math.exp(-dt * 7));
    const xt = xrayAt(st.t);
    asms.forEach((a, i) => (xr[i] = xg * (xt[a.key] || 0)));
    poseAll(st.explode, channelsAt(st.t, st.fired));
    shells.pose(st.t, st.fired, st.t > 0 && st.explode < 0.02);
    fx.pose(st.t, st.explode < 0.02);
    // recoil: the gun kicks back and its muzzle rises about a pivot at the shoulder, then settles
    const rk = st.explode < 0.02 ? recoilAt(st.t) : 0;
    const th = RECOIL.rise * rk;
    const pv = RECOIL.pivot;
    gun.rotation.z = th;
    gun.position.set(-12 - RECOIL.kick * rk + pv.x - (pv.x * Math.cos(th) - pv.y * Math.sin(th)), pv.y - (pv.x * Math.sin(th) + pv.y * Math.cos(th)), 0);

    // dimming
    // dimming keeps each part's material (30% brightness, half opacity); the selection gets a brass rim
    const kd = still ? 1 : 1 - Math.exp(-dt * 8);
    asms.forEach((a, i) => {
      dim[i] += ((focus < 0 || focus === i ? 0 : 1) - dim[i]) * kd;
      rim[i] += ((focus === i ? 1 : 0) - rim[i]) * kd;
      a.setLook(dim[i] < 0.004 ? 0 : dim[i], rim[i] < 0.004 ? 0 : rim[i], xr[i] < 0.004 ? 0 : xr[i]);
    });
    S.key.intensity = 3.0 - 1.4 * rim[3]; // receiver close-up (pill 04): lower key and exposure so no pixel passes 92%
    S.renderer.toneMappingExposure = 1.08 - 0.65 * rim[3];

    // camera flight
    if (fly && !tour.active) {
      const t = ease(clamp01((now - fly.t0) / fly.dur));
      controls.target.lerpVectors(fly.ft, fly.tt, t);
      camera.position.lerpVectors(fly.fp, fly.tp, t);
      if (t >= 1) fly = null;
    }
    // the clock camera: eases in from wherever the camera was, then is a pure function of t
    if (dir && !tour.active && st.explode < 0.05) {
      if (!dir.from) dir = {from: {t: controls.target.clone(), p: camera.position.clone()}, t0: now};
      const k = clockCam(st.t);
      const w = ease(clamp01((now - dir.t0) / 800));
      const cm = w < 1 ? blend(dir.from, k, w) : k;
      controls.target.copy(cm.t);
      camera.position.copy(cm.p);
      fly = null;
      lastInput = now;
    }
    controls.autoRotate = !still && !tour.active && !fly && !dir && now - lastInput > 5000;
    if (!tour.active && !dir) controls.update(dt);
    else camera.lookAt(controls.target);

    // hover outline + name card
    if (!pinned && !drag) {
      const ph = tour.active ? null : pick();
      if (ph || !active) setHover(ph);
      else setHover(partByName(TICKS[ti].part) || null, true); // the active tick's part
    }
    else if (hovered && dim[asms.findIndex((a) => a.key === hovered.userData.asm)] > 0.4) {
      pinned = false;
      setHover(null);
    }
    canvas.style.cursor = drag ? 'grabbing' : canDrag(hovered) ? 'grab' : '';
    if (hovered) drawLeader(dt);
    else for (const c of [lLine, lDot, lHalo]) c.setAttribute('visibility', 'hidden');

    // shadows follow the parts, not the camera: re-render them only when something moved
    if (Math.abs(st.explode - lastE) > 1e-5 || Math.abs(st.t - lastP) > 1e-5 || Number.isNaN(lastE)) {
      S.renderer.shadowMap.needsUpdate = true;
      lastE = st.explode;
      lastP = st.t;
    }
    if (probe && probe.t0) {
      const t0 = performance.now();
      S.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      probe.dts.push(performance.now() - t0);
    } else S.render();
    if (!window.__READY) {
      window.__READY = true;
      window.__STATS = {meshes: meshes.length, parts: asms.reduce((n, a) => n + a.parts.length, 0), tris: S.renderer.info.render.triangles, tier: S.tier};
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.IRONWOOD = {asms, gun, st, focusOn, pointsOf, shells, startTour, TOUR_LEN, floor: FLOOR_Y, camera, S};
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#e66;position:fixed;left:16px;top:80px">${e.stack || e}</pre>`);
});
