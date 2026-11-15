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
import {MAG_Y, MUZZLE} from './barrel.js';
import {PUMP} from './forend.js';
import {createPerf} from './perf.js';

const MARKS = {parsed: performance.now()}; // load milestones, ms since navigation start

const q = new URLSearchParams(location.search);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease1 = (v, to, k) => (Math.abs(to - v) < 1e-4 ? to : v + (to - v) * k); // eased, snapped when settled
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
  MARKS.fonts = performance.now();
  const app = document.getElementById('app');
  const canvas = el('canvas', null, null, app);
  canvas.id = 'gl';
  const S = createStage(canvas);
  const {scene, camera} = S;
  MARKS.stage = performance.now();

  // --- the object. Each assembly's programs start compiling in parallel (KHR_parallel_shader_compile)
  // as soon as it is built, while the next one builds on the main thread; a brass line shows progress.
  // Compiled for a render target (linear: the composer and the floor reflection render into one).
  const load = el('div', 'iw-load', '<i></i>', app);
  const jobs = [];
  let built = 0;
  const bump = () => load.firstChild.style.setProperty('--p', `${((++built / Math.max(jobs.length, 12)) * 100).toFixed(0)}%`);
  const compile = (o, rt = S.composer.readBuffer, lit = scene) => {
    S.renderer.setRenderTarget(rt);
    jobs.push(S.renderer.compileAsync(o, camera, lit).then(bump));
    S.renderer.setRenderTarget(null);
  };
  const gun = new THREE.Group();
  gun.position.set(-12, 0, 0);
  scene.add(gun);
  // the muzzle flash light first: it is in every lit program
  const fx = createFireFX();
  gun.add(fx.group);
  const asms = [buildBarrel, buildMagazine, buildForend, buildReceiver, buildBolt, buildTrigger, buildStock, buildPad].map((build) => {
    const a = build();
    gun.add(a.group);
    a.finalize();
    compile(a.group);
    return a;
  });
  MARKS.geometry = performance.now();
  const meshes = [];
  asms.forEach((a) => a.group.traverse((o) => o.isMesh && meshes.push(o)));
  // pump-cycle shells: posed from the clock st.t, not hoverable (not in the hover list)
  const shells = createShells();
  gun.add(shells.group);
  // fx: its children, not its root (the root holds the flash light, which compile() would count twice)
  [...fx.group.children.filter((o) => !o.isLight), shells.group, ...scene.children.filter((o) => o !== gun && o.isMesh)].forEach((o) => compile(o));
  // the post passes' own shaders (SSAO, bloom, outline, vignette), unlit like their full-screen quads;
  // the output pass sets its defines on its first render, so it compiles then
  const quad = new THREE.PlaneGeometry(1, 1).deleteAttribute('normal'); // like FullScreenQuad's
  S.composer.passes.forEach((p, i, all) => {
    const g = new THREE.Group();
    for (const v of Object.values(p)) for (const m of [v].flat()) if (m?.isMaterial) g.add(new THREE.Mesh(quad, m));
    if (g.children.length && i < all.length - 1) compile(g, undefined, g);
  });
  MARKS.textures = performance.now();

  // --- UI
  const ui = el('div', 'iw', null, app);
  const head = el('div', 'iw-head', '<span class="iw-brand">IRONWOOD <b>Mk I</b></span><span class="iw-dot">·</span><span class="iw-sub">Exploded view. Drag, scroll, take it apart.</span>', ui);
  const qSeg = el('span', 'iw-q', '<button data-t="high">High</button><button data-t="med">Med</button><button data-t="low">Low</button>', head);
  el('div', 'iw-rule', null, ui);
  const hint = el('div', 'iw-hint', null, ui);
  const setHint = () => (hint.textContent = `${asms.length} assemblies · ${asms.reduce((n, a) => n + a.parts.length, 0)} parts · ${meshes.length} meshes · ${{high: 'HIGH', med: 'MEDIUM', low: 'LOW'}[S.tier]} quality${dropped.map((k) => ' · ' + k).join('')} · ${gpuName}`);
  const dropped = []; // adaptive quality steps taken this visit

  // --- quality tier: ?q=high|med|low forces it; then a header choice the visitor made (key v2: tiers saved
  // by earlier builds are ignored); phones start LOW;
  // a renderer string naming NVIDIA RTX/GTX, Radeon RX, Arc or Apple M-series starts HIGH; everything
  // else (Radeon(TM) Graphics, Intel UHD/Iris, unknown strings) starts MEDIUM
  const TIERS = ['high', 'med', 'low'];
  const forced = TIERS.includes(q.get('q')) ? q.get('q') : null;
  let stored = null;
  try {
    stored = localStorage.getItem('ironwood.tier.v2');
  } catch (e) {}
  if (!TIERS.includes(stored)) stored = null;
  const gl = S.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  // the header stats line shows the GPU: the model inside ANGLE's string, else the raw string
  const gpuName = (/^ANGLE \([^,]+, (.+?)(?: \(0x[0-9a-f]+\))?(?: Direct3D.*| OpenGL.*| Vulkan.*)?, [^,]+\)$/i.exec(gpu)?.[1] || gpu).trim();
  const discrete = /\b(rtx|gtx)\b|radeon\s*rx\b|\barc\b|apple\s*m\d/i.test(gpu);
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const by = forced ? 'url' : stored ? 'stored' : phone ? 'phone' : discrete ? 'gpu' : 'default';
  S.setTier(forced || stored || (phone ? 'low' : discrete ? 'high' : 'med'));
  const px = new Uint8Array(4);
  window.__PROBE = {gpu, discrete, tier: S.tier, by};
  const showQ = () => [...qSeg.children].forEach((b) => b.classList.toggle('on', b.dataset.t === S.tier));
  qSeg.onclick = (e) => {
    const t = e.target.dataset?.t;
    if (!t) return;
    S.setTier(t);
    try {
      localStorage.setItem('ironwood.tier.v2', t);
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
  /**
   * World corners of every visible mesh's own box: much tighter than one box round a long gun.
   * verts: the mesh's own vertices instead (up to ~1500 each), so the framing margins are measured
   * from the real surfaces (the pad's back face, the muzzle), not from box corners past them.
   */
  function pointsOf(obj, verts = false) {
    gun.updateMatrixWorld(true);
    const pts = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (verts && !o.isInstancedMesh) {
        const a = o.geometry.attributes.position;
        const s = Math.ceil(a.count / 1500);
        for (let i = 0; i < a.count; i += s) pts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld));
        return;
      }
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
    return [lo, Math.max(hi, lo + 0.3)]; // the dock (cycle panel included) is never part of the usable area
  }
  /**
   * Camera {t, p} looking along dir with every vertex of obj inside the free band (header and
   * dock excluded), 8% of the viewport clear on each side, at any aspect. fill > 1 backs off further.
   * inner > 0: inside the central share `inner` of the whole area above the dock instead (both axes).
   * obj: an object, or a list of objects and point arrays.
   */
  function frame(obj, dir = new THREE.Vector3(0.38, 0.3, 1), fill = 1, adjust = true, inner = 0) {
    const pts = [obj].flat().flatMap((o) => (Array.isArray(o) ? o.map((p) => p.clone()) : pointsOf(o, true)));
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
    const a0 = b0 - 12 / S.size.h; // the dock's top edge (band() keeps 6 px clear of it)
    const my = ((1 - a0) * (1 - inner)) / 2;
    const W = inner ? {x0: -inner, x1: inner, y0: a0 + my, y1: 1 - my} : {x0: -1 + m, x1: 1 - m, y0: b0 + m, y1: b1 - m};
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
  function focusOn(i, dur) {
    focus = i;
    dir = null;
    pillBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    poseAll(st.explode, channelsAt(st.t, st.fired));
    flyTo(i < 0 ? frame(gun, HERO_DIR) : frame(asms[i].group, new THREE.Vector3(0.42, 0.34, 1), 1.15), dur);
  }

  // --- clock camera: a pure function of t. The FIRE keys hold each tick's active part inside the
  // central 60% of the area above the panel (framed at 54%, room for the recoil): a close-up on
  // trigger, hammer, firing pin and chambered shell for Press-Burn, out by the end of Burn; for Travel a side-on view of the
  // whole gun that pans with the shot (the muzzle ends at 76% of the width, 90% of the gun on screen);
  // the whole gun inside the central 60% for Muzzle-Recoil; then the port for the eject. Keys are
  // framed on the assembled gun at rest.
  let ckeys = null;
  let dir = null; // {from, t0}: the camera follows the clock (FIRE/PUMP/FULL, scrubber, step)
  const IN = 0.54;
  const SIDE = new THREE.Vector3(0.15, 0.22, 1);
  function clockKeys() {
    const gp = gun.position.clone();
    const gr = gun.rotation.z;
    gun.position.set(-12, 0, 0);
    gun.rotation.z = 0;
    poseAll(0, 0);
    gun.updateMatrixWorld(true);
    const whole = frame(gun, SIDE, 1, true, IN);
    // close-up: the trigger, the hammer cocked and fallen, the firing pin, the chambered shell
    shells.pose(0.12, false, true);
    const parts = ['trigger', 'hammer', 'firing pin'].map(partByName);
    const cocked = pointsOf(parts[1], true);
    poseAll(0, {f: 0, b: 0, lock: 0, elev: 0, ham: 1, trig: 1, pin: 1});
    const close = frame([...parts, cocked, shells.chambered()], new THREE.Vector3(0.2, 0.12, 1), 1, true, IN);
    poseAll(0, 0);
    // Travel: the whole gun side-on, then panned along camera right as the shot passes the centre
    const trav = frame(gun, SIDE);
    const camA = camera.clone();
    camA.position.copy(trav.p);
    camA.lookAt(trav.t);
    camA.updateMatrixWorld();
    const ndcX = (x) => gun.localToWorld(new THREE.Vector3(x, 0, 0)).project(camA).x;
    const xm = ndcX(MUZZLE);
    const right = new THREE.Vector3().setFromMatrixColumn(camA.matrixWorld, 0);
    const panW = (xm - 0.52) * trav.p.distanceTo(trav.t) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
    const track = (t) => {
      const w = clamp01(ndcX(shotX(t)) / xm);
      const o = right.clone().multiplyScalar(panW * w);
      return {t: trav.t.clone().add(o), p: trav.p.clone().add(o)};
    };
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
    shells.pose(st.t, st.fired, st.t > 0 && st.explode < 0.02);
    return {whole, close, track, port};
  }
  function clockCam(t, fresh = false) {
    if (fresh || !ckeys) ckeys = clockKeys();
    const K = ckeys;
    if (t < 0.125) return blend(K.whole, K.close, smr(0, 0.03, t));
    if (t < 0.204) return blend(K.close, K.track(t), smr(0.125, 0.15, t)); // out to the whole gun before Travel
    if (t < 0.3) return blend(K.track(Math.min(t, 0.21)), K.whole, smr(0.204, 0.213, t)); // pulls wide through the flash
    return blend(K.whole, K.port, smr(0.3, 0.4, t));
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
  let pickDirty = true; // the hover raycast reruns only after the pointer moved or a frame was drawn
  let lastPick = null;
  const anchor = new THREE.Vector3(); // hit point in the hovered part's local space
  const setNdc = (e) => ndc.set((e.clientX / S.size.w) * 2 - 1, -(e.clientY / S.size.h) * 2 + 1);
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = {x: e.clientX, y: e.clientY};
    pickDirty = true;
    setNdc(e);
  });
  canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && ((pointer = null), (pickDirty = true)));
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
  const cardPos = {x: 0, y: 0, side: 'r', init: false};
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
  // the hovered part's screen bounds: up to ~300 sampled vertices per mesh, cached in the part's own
  // space when it is hovered, projected each time the leader is drawn
  const hoverPts = [];
  let hoverOf = null;
  const hv = new THREE.Vector3();
  const hInv = new THREE.Matrix4();
  function partBounds() {
    hovered.updateWorldMatrix(true, false);
    if (hoverOf !== hovered) {
      hoverOf = hovered;
      hoverPts.length = 0;
      hovered.updateMatrixWorld(true);
      hInv.copy(hovered.matrixWorld).invert();
      hovered.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
        const a = o.geometry.attributes.position;
        const k = Math.ceil(a.count / 300);
        for (let i = 0; i < a.count; i += k) hoverPts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).applyMatrix4(hInv));
      });
    }
    const B = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
    for (const p of hoverPts) {
      hv.copy(p).applyMatrix4(hovered.matrixWorld).project(camera);
      if (hv.z > 1) continue;
      const x = (hv.x * 0.5 + 0.5) * S.size.w;
      const y = (-hv.y * 0.5 + 0.5) * S.size.h;
      B.x0 = Math.min(B.x0, x); B.x1 = Math.max(B.x1, x); B.y0 = Math.min(B.y0, y); B.y1 = Math.max(B.y1, y);
    }
    return B;
  }
  /**
   * Name card 40 px clear of the part's screen bounds: right, else left, else above, else below
   * (the current side is kept while it fits); the leader runs from the hit point out past the part's
   * edge and on into the card's near edge.
   */
  function drawLeader() {
    camera.updateMatrixWorld();
    const a = S.project(hovered.localToWorld(anchor.clone()));
    const B = partBounds();
    if (!(B.x1 > B.x0)) Object.assign(B, {x0: a.x, x1: a.x, y0: a.y, y1: a.y});
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const W = S.size.w;
    const H = S.size.h;
    const G = 42; // 40 px clear of the part, with 2 px for the vertex sampling
    const E = 8; // clear of the viewport edge
    const lift = S.size.w < 720 ? 20 : 32; // the card sits a little above the hit point: a diagonal, then a run
    const fits = {r: B.x1 + G + cw <= W - E, l: B.x0 - G - cw >= E, t: B.y0 - G - ch >= E, b: B.y1 + G + ch <= H - E};
    const room = {r: W - E - B.x1 - cw, l: B.x0 - E - cw, t: B.y0 - E - ch, b: H - E - B.y1 - ch};
    const side = fits[cardPos.side] ? cardPos.side : ['r', 'l', 't', 'b'].find((k) => fits[k]) || Object.keys(room).sort((p, q) => room[q] - room[p])[0];
    cardPos.side = side;
    const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    let x;
    let y;
    let pts;
    if (side === 'r' || side === 'l') {
      x = side === 'r' ? B.x1 + G : B.x0 - G - cw;
      y = cl(a.y - lift - ch / 2, E, H - ch - E);
      const cy = y + ch / 2;
      const ex = side === 'r' ? B.x1 + 14 : B.x0 - 14;
      pts = [[a.x, a.y], [ex, cy], [side === 'r' ? x : x + cw, cy]];
    } else {
      y = side === 't' ? B.y0 - G - ch : B.y1 + G;
      x = cl(a.x - cw / 2, E, W - cw - E);
      const cx = x + cw / 2;
      const ey = side === 't' ? B.y0 - 14 : B.y1 + 14;
      pts = [[a.x, a.y], [cx, ey], [cx, side === 't' ? y + ch : y]];
    }
    cardPos.x = x;
    cardPos.y = y;
    card.classList.toggle('flip', side === 'l');
    card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    lLine.setAttribute('points', pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
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

  const perf = q.has('perf') ? createPerf(S, {gpu, marks: MARKS, floor: S.floor, parts: [...meshes, ...asms.flatMap((a) => a.edges)]}) : null;
  const still = q.has('still');
  let prev = performance.now();
  let lastE = NaN;
  let lastP = NaN;
  // render on demand: a frame is drawn only when something it shows changed (scene state or camera);
  // frames where only the idle auto-turn moves the camera are drawn at 30 fps
  let lastSig = null;
  let lastCam = null;
  let turning = false;
  // adaptive quality: a mean frame time over 20 ms across 1 s of consecutive drawn frames (never the
  // 30 fps turn; rAF alternates 17/33 ms under load, so no single frame decides) drops one step
  // (SSAO, reflection, shadow map 1024, DPR 1, shadows off); it never steps back up in this visit
  let drewLast = false;
  let lastDraw = 0;
  const slow = []; // [t, ms] of consecutive drawn frames, last second
  const STEP = {ssao: 'no SSAO', reflection: 'no reflection', shadowmap: 'shadow map 1024', dpr: 'DPR 1', shadows: 'no shadows'};
  const sigOf = () => [st.explode, st.t, gun.rotation.z, gun.position.x, gun.position.y, S.renderer.toneMappingExposure, S.key.intensity, S.size.w, S.size.h, TIERS.indexOf(S.tier), Object.keys(S.cut).length, hovered ? hovered.id : -1, ...dim, ...rim, ...xr];
  const camOf = () => [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.aspect];
  const same = (a, b, eps) => !!a && a.every((v, i) => Math.abs(v - b[i]) < eps);
  const tick = (now) => {
    const raw = now - prev;
    if (turning && controls.autoRotate && raw < 30 && !still) return (drewLast = false), requestAnimationFrame(tick);
    const dt = Math.min(0.05, raw / 1000);
    prev = now;
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
      st.explode = ease1(st.explode, st.target, still ? 1 : 1 - Math.exp(-dt * 9));
    }
    out.value = st.explode.toFixed(2);
    range.style.setProperty('--p', `${(st.explode * 100).toFixed(1)}%`);
    if (!tour.active) {
      if (cyc.tw) {
        const t = clamp01((now - cyc.tw.t0) / cyc.tw.dur);
        st.t = cyc.tw.from + (cyc.tw.to - cyc.tw.from) * ease(t);
        if (t >= 1) {
          if (cyc.tw.to <= 0 || cyc.tw.to >= 1) focusOn(-1, 0.8); // reached Ready or Locked
          cyc.tw = null;
        }
      } else if (cyc.playing) {
        st.t += (dt * cyc.speed) / FULL_S;
        if (cyc.stop === FIRE_END && st.t >= FIRE_END) {
          st.t = FIRE_END; // FIRE holds at the end of the recoil, ready to pump
          cyc.playing = false;
        } else if (st.t >= 1) {
          st.t = 0; // Locked, and back to Ready: the camera eases back to the default framing over 0.8 s, all dimming clears
          cyc.playing = false;
          focusOn(-1, 0.8);
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
    xg = ease1(xg, active ? 1 : 0, still ? 1 : 1 - Math.exp(-dt * 7));
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
    // dimming keeps each part's material (30% brightness, half opacity); the selection is lifted 15%
    const kd = still ? 1 : 1 - Math.exp(-dt * 8);
    asms.forEach((a, i) => {
      dim[i] = ease1(dim[i], focus < 0 || focus === i ? 0 : 1, kd);
      rim[i] = ease1(rim[i], focus === i ? 1 : 0, kd);
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
      const ph = tour.active ? null : pickDirty ? (lastPick = pick()) : lastPick;
      if (ph || !active) setHover(ph);
      else setHover(partByName(TICKS[ti].part) || null, true); // the active tick's part
    }
    else if (hovered && dim[asms.findIndex((a) => a.key === hovered.userData.asm)] > 0.4) {
      pinned = false;
      setHover(null);
    }
    canvas.style.cursor = drag ? 'grabbing' : canDrag(hovered) ? 'grab' : '';
    if (hovered) drawLeader();
    else for (const c of [lLine, lDot, lHalo]) c.setAttribute('visibility', 'hidden');

    // shadows follow the parts, not the camera: re-render them only when something moved
    if (Math.abs(st.explode - lastE) > 1e-5 || Math.abs(st.t - lastP) > 1e-5 || Number.isNaN(lastE)) {
      S.renderer.shadowMap.needsUpdate = true;
      lastE = st.explode;
      lastP = st.t;
    }
    const sg = sigOf();
    const cm = camOf();
    const moved = !same(lastSig, sg, 1e-6);
    const camMoved = !same(lastCam, cm, 1e-5);
    const draw = moved || camMoved || still || S.renderer.shadowMap.needsUpdate;
    turning = !moved && camMoved && controls.autoRotate;
    pickDirty = draw;
    if (!draw) return (drewLast = false), requestAnimationFrame(tick);
    lastSig = sg;
    lastCam = cm;
    perf?.frameStart();
    S.render();
    if (drewLast && !still && window.__READY) {
      slow.push([now, now - lastDraw]);
      while (slow[0][0] < now - 1000) slow.shift();
      if (now - slow[0][0] > 900 && slow.reduce((a, f) => a + f[1], 0) / slow.length > 20) {
        const k = S.degrade();
        if (k) dropped.push(STEP[k]), setHint();
        slow.length = 0;
      }
    } else slow.length = 0;
    drewLast = true;
    lastDraw = now;
    if (!window.__READY) {
      if (perf) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // first frame = the GPU finished it
      MARKS.shaders ??= performance.now(); // until compileAsync, the shaders compile inside the first frame
      MARKS.first = performance.now();
      setTimeout(() => warmTransparent(), 300);
      MARKS.programs = S.renderer.info.programs.length;
      window.__READY = true;
      window.__STATS = {meshes: meshes.length, parts: asms.reduce((n, a) => n + a.parts.length, 0), tris: S.renderer.info.render.triangles, tier: S.tier};
    }
    perf?.frameEnd(now);
    requestAnimationFrame(tick);
  };
  /**
   * After the first frame: the transparent variant of every part material (dimming, x-ray, shells),
   * compiled in the background, so the first dim or x-ray does not stall on a compile.
   */
  function warmTransparent(groups = [...asms.map((a) => a.group), shells.group, ...fx.group.children.filter((o) => !o.isLight)]) {
    // one group per call (not the gun: it holds the flash light, which compile() would count twice)
    const g = groups.shift();
    if (!g) {
      // the outline pass's depth and mask programs: one outline render into the composer's buffer
      // (off screen) while nothing moves, instead of a stall on the first hovered part
      if (S.tier === 'low') return;
      const keep = S.outline.selectedObjects;
      S.outline.selectedObjects = [asms[0].parts[0].obj];
      S.outline.render(S.renderer, S.composer.writeBuffer, S.composer.readBuffer, 0, false);
      S.outline.selectedObjects = keep;
      return;
    }
    const mats = new Set();
    g.traverse((o) => o.isMesh && [o.material].flat().forEach((m) => !m.transparent && mats.add(m)));
    const flip = (t) => mats.forEach((m) => ((m.transparent = t), (m.needsUpdate = true)));
    flip(true);
    compile(g);
    if (S.tier === 'low') compile(g, null);
    flip(false);
    setTimeout(() => warmTransparent(groups), 60);
  }
  // the low tier draws the gun straight to the screen: its tone-mapped variants too
  if (S.tier === 'low') [gun, ...scene.children.filter((o) => o !== gun && o.isMesh)].forEach((o) => compile(o, null));
  await Promise.all(jobs);
  MARKS.shaders = performance.now();
  load.remove();
  requestAnimationFrame(tick);
  window.IRONWOOD = {asms, gun, st, focusOn, pointsOf, shells, startTour, TOUR_LEN, floor: FLOOR_Y, camera, S, controls, frame, clockCam, partByName, TICKS, tickAt, get hovered() { return hovered; }}; // controls + frame: for the hero and check shots
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#e66;position:fixed;left:16px;top:80px">${e.stack || e}</pre>`);
});
