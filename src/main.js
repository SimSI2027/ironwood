// IRONWOOD Mk I: an exploded view of a pump-action shotgun, built entirely in code.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import fontMed from '@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2';
import fontSemi from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2';
import {createStage, FLOOR_Y, FLOOR_LOW} from './stage.js';
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

// ?render: the film. The UI is hidden, the live loop never starts, and window.seek(seconds) poses and draws
// one frame as a pure function of film time (the cutaway skill's capture.mjs steps it at 60 fps)
const film = q.has('render');

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
  S.noAO.push(fx.group.children[0]); // the effects, not the flash light
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
  const head = el('div', 'iw-head', '<span class="iw-brand">IRONWOOD <b>Mk I</b></span><span class="iw-dot">·</span><span class="iw-sub">Drag, scroll, fire, take it apart.</span>', ui);
  const qSeg = el('span', 'iw-q', '<button data-t="high">High</button><button data-t="med">Med</button><button data-t="low">Low</button>', head);
  // "?": a six-line controls card; any click elsewhere or Esc closes it
  const helpBtn = el('button', 'iw-help', '?', head);
  helpBtn.setAttribute('aria-label', 'Controls');
  helpBtn.setAttribute('aria-expanded', 'false');
  const help = el('div', 'iw-helpcard', [
    ['Drag', 'orbit · scroll or pinch to zoom'],
    ['Explode', 'take it apart, part by part'],
    ['01-08', 'fly to an assembly, the rest dim'],
    ['Hover / tap', 'name a part'],
    ['Fire · Pump · Full', 'run the cycle; drag the forend to pump'],
    ['Tour', 'a 24 s guided run; any input takes over'],
  ].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join(''), ui);
  const showHelp = (on) => (help.classList.toggle('on', on), helpBtn.setAttribute('aria-expanded', String(on)));
  helpBtn.onclick = (e) => (e.stopPropagation(), showHelp(!help.classList.contains('on')));
  addEventListener('pointerdown', (e) => !help.contains(e.target) && e.target !== helpBtn && showHelp(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && showHelp(false));
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
    S.render();
    S.crossfade(); // the tier change dissolves over 0.45 s instead of popping
    S.setTier(t);
    epoch++;
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
  // exploded view (explode 0.5 to 0.8 fades them in): one label per assembly, hairline brass leaders
  const lab = {svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'), els: [], key: ''};
  lab.svg.setAttribute('class', 'iw-lead iw-labl');
  ui.appendChild(lab.svg);
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
  controls.zoomSpeed = 0.9;
  let lastInput = performance.now();
  controls.addEventListener('start', () => {
    if (tour.active) stopTour();
    lastInput = performance.now();
    view.user = true; // the visitor orbits or zooms: OrbitControls has the camera until 5 s idle
    view.follow = null;
    view.base = null;
    dir = null;
  });

  // --- state
  const st = {explode: Number(q.get('explode') ?? 0), target: Number(q.get('explode') ?? 0), t: Math.min(1, Math.max(0, Number(q.get('t') ?? 0))), fired: false};
  range.value = st.target;
  let focus = -1;
  // every scripted move is a cubic in-out tween from wherever the value is now: no exponential chase, no pop
  const tween = (v, dur) => ({v, from: v, to: v, t0: 0, dur});
  const aim = (T, to, now, dur = T.dur) => to !== T.to && Object.assign(T, {from: T.v, to, t0: now, dur});
  const stepT = (T, now) => (T.v = still ? T.to : T.from + (T.to - T.from) * ease(clamp01((now - T.t0) / (T.dur * 1000))));
  const hold = (T, v) => Object.assign(T, {v, from: v, to: v});
  const exT = tween(st.explode, 0.6);
  let exDrag = false; // the slider under the pointer: the parts follow the hand directly
  const dimT = asms.map(() => tween(0, 0.5));
  const rimT = asms.map(() => tween(0, 0.5));
  const xgT = tween(0, 0.35);
  const hvT = tween(0, 0.22); // hover outline fade-in
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
  // --- one framing rule for every state. Usable area = the viewport minus the header (and its stats
  // line), the bottom panel and the perf overlay. The subject's projected bounds fill FILL of the usable
  // width or height (whichever binds), centred in it: the whole gun (every part, at any explode), an
  // assembly for a pill, the active part plus 60% of the gun for a FIRE or PUMP tick.
  const FILL = 0.8;
  /** Usable rectangle in CSS px. */
  function usable() {
    const W = S.size.w;
    const H = S.size.h;
    if (film) return {l: 0, r: W, t: 0, b: H}; // the film hides the UI: the whole frame is usable
    const r = {l: 0, r: W, t: Math.max(head.getBoundingClientRect().bottom, hint.offsetParent ? hint.getBoundingClientRect().bottom : 0) + 6, b: dock.getBoundingClientRect().top - 6};
    const pb = document.querySelector('.iw-perf')?.getBoundingClientRect();
    if (pb && pb.width) {
      // drop whichever strip (beside or below the overlay) leaves the larger rectangle
      const beside = (Math.min(r.r, pb.left - 8) - r.l) * (r.b - r.t);
      const below = (r.r - r.l) * (r.b - Math.max(r.t, pb.bottom + 6));
      if (beside >= below) r.r = Math.min(r.r, pb.left - 8);
      else r.t = Math.max(r.t, pb.bottom + 6);
    }
    if (r.b - r.t < 0.25 * H) r.b = r.t + 0.25 * H;
    return r;
  }
  /** The NDC window the subject's bounds are fitted to: FILL of the usable area, centred. */
  function windowOf(fill = FILL) {
    const U = usable();
    const W = S.size.w;
    const H = S.size.h;
    const cx = (U.l + U.r) / 2, cy = (U.t + U.b) / 2, hw = ((U.r - U.l) * fill) / 2, hh = ((U.b - U.t) * fill) / 2;
    return {x0: ((cx - hw) / W) * 2 - 1, x1: ((cx + hw) / W) * 2 - 1, y0: 1 - ((cy + hh) / H) * 2, y1: 1 - ((cy - hh) / H) * 2};
  }
  // each mesh's 26-direction hull in its own space, cached: a few thousand world points per frame bound the
  // whole gun like its ~150k vertices, so the framing can follow the explode slider and the sway every frame
  const DIRS = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (i || j || k) DIRS.push(new THREE.Vector3(i, j, k).normalize());
  function hullOf(o) {
    if (o.userData.hull) return o.userData.hull;
    const a = o.geometry.attributes.position;
    const best = new Float64Array(DIRS.length).fill(-Infinity);
    const arg = DIRS.map(() => new THREE.Vector3());
    const v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      for (let d = 0; d < DIRS.length; d++) {
        const dot = v.dot(DIRS[d]);
        if (dot > best[d]) (best[d] = dot), arg[d].copy(v);
      }
    }
    return (o.userData.hull = arg);
  }
  /**
   * World points bounding obj (an object, a point array, {obj, slab}, or a list of those). verts: every
   * vertex instead of the hulls (for measuring). slab [xa, xb]: only the gun between those gun-space x,
   * meshes crossing an end clipped to it (the "60% of the gun" around a tick's part).
   */
  function subjectPts(obj, verts = false) {
    gun.updateMatrixWorld(true);
    const out = [];
    const v = new THREE.Vector3();
    for (let o of [obj].flat()) {
      if (!o) continue;
      if (o.isVector3) {
        out.push(o.clone());
        continue;
      }
      if (Array.isArray(o)) {
        out.push(...o.map((p) => p.clone()));
        continue;
      }
      const slab = o.slab || null;
      if (slab) o = o.obj;
      o.traverse((m) => {
        if (!m.isMesh || m.isLineSegments) return;
        for (let p = m; p; p = p.parent) if (!p.visible) return;
        let pts;
        if (m.isInstancedMesh) pts = pointsOf(m);
        else if (verts) {
          const a = m.geometry.attributes.position;
          pts = [];
          for (let i = 0; i < a.count; i++) pts.push(v.fromBufferAttribute(a, i).clone().applyMatrix4(m.matrixWorld));
        } else pts = hullOf(m).map((p) => p.clone().applyMatrix4(m.matrixWorld));
        if (slab) {
          const loc = pts.map((p) => gun.worldToLocal(p.clone()));
          let lo = Infinity, hi = -Infinity;
          for (const p of loc) (lo = Math.min(lo, p.x)), (hi = Math.max(hi, p.x));
          if (hi < slab[0] || lo > slab[1]) return;
          pts = loc.map((p) => gun.localToWorld(p.setX(Math.min(slab[1], Math.max(slab[0], p.x)))));
        }
        for (const p of pts) out.push(p);
      });
    }
    return out;
  }
  /**
   * Camera {t, p} looking along dir with the subject's bounds filling the window (FILL of the usable
   * area, centred), at any aspect. fill > 1 backs off further. obj: anything subjectPts takes.
   */
  function frame(obj, dir = HERO_DIR, fill = 1, adjust = true, keep = []) {
    const pts = subjectPts(obj);
    dir = dir.clone();
    if (adjust && camera.aspect < 0.8) dir.x += 0.6; // portrait: look further along the axis
    dir.normalize();
    const f = dir.clone().negate();
    const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
    const u = new THREE.Vector3().crossVectors(r, f);
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tx = ty * camera.aspect;
    const W = windowOf();
    const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const P = pts.map((p) => {
      p.sub(c);
      return [p.dot(r), p.dot(u), p.dot(f)];
    });
    let ox = 0;
    let oy = 0;
    let D = (Math.max(...P.map((q) => Math.hypot(q[0], q[1]))) / Math.min(tx, ty)) * 1.5 + 1;
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
    // keep: points that must be inside the window but take no part in centring (the floor's contact shadow)
    if (keep.length) {
      const ndcY = (p, q) => {
        const z = Math.max(p.clone().sub(c).dot(f) + D, 1e-3);
        return (p.clone().sub(c).dot(u) - q) / (z * ty);
      };
      let need = 0;
      for (const p of keep) need = Math.min(need, ndcY(p, oy) - W.y0);
      let room = Infinity;
      for (const q of P) room = Math.min(room, W.y1 - (q[1] - oy) / (Math.max(q[2] + D, 1e-3) * ty));
      const dy = Math.max(need, -room); // ndc the view moves down (everything up), at most the gun's headroom
      oy += dy * D * ty;
    }
    const t = c.clone().addScaledVector(r, ox).addScaledVector(u, oy);
    return {t, p: t.clone().addScaledVector(dir, D * fill)};
  }
  // --- auto camera. view.user: the visitor is orbiting (OrbitControls drives it). Otherwise the camera is
  // the framing rule along view.base (the visitor's own direction, kept when the explode slider reframes
  // after an orbit) or the hero / pill direction, swayed +/-20 deg about the vertical while idle (never a
  // full orbit, never end-on). follow: a cubic in-out blend from where the camera was into the live framing.
  const PILL_DIR = new THREE.Vector3(0.42, 0.34, 1);
  const SWAY = THREE.MathUtils.degToRad(20);
  const SWAY_P = 24; // s per sway cycle
  const view = {user: false, base: null, follow: null, phase: 0, env: tween(0, 1.6)};
  const swayDir = (d, a) => d.clone().applyAxisAngle(camera.up, a);
  // the whole gun is framed with its ground: the dark core of the floor's contact shadow (under receiver and magazine), so
  // the contact shadow and the reflection beside it are always in the usable area under the gun
  const ground = () => [-12, 40].flatMap((x) => [-4, 4].map((z) => new THREE.Vector3(x, S.floor.position.y, z))); // the shadow's dark core
  const autoSubject = () => (focus >= 0 ? asms[focus].group : gun);
  const autoKeep = () => (focus >= 0 ? [] : ground());
  const autoDir = () => swayDir(view.base || (focus >= 0 ? PILL_DIR : HERO_DIR), SWAY * view.env.v * Math.sin(view.phase));
  function followFrom(dur = 0.9) {
    view.follow = {from: {t: controls.target.clone(), p: camera.position.clone()}, t0: performance.now(), dur: dur * 1000};
  }
  function flyTo(dur = 1.2) {
    view.user = false;
    view.base = null;
    followFrom(dur);
  }
  function focusOn(i, dur = 1.2) {
    focus = i;
    dir = null;
    pillBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    flyTo(dur);
  }

  // --- clock camera: a pure function of t. Each tick's key frames its part plus the 60% of the gun
  // centred on it (clipped to the gun's ends), posed at the tick's start; Ready and Locked frame the whole
  // gun. The camera holds a key for the first 35% of its tick, then eases (cubic in-out) to the next.
  let ckeys = null;
  let dir = null; // {from, t0}: the camera follows the clock (FIRE/PUMP/FULL, scrubber, step)
  /** The gun kicked back by rk (0..1) and its muzzle risen about the shoulder pivot. */
  function recoil(rk) {
    const th = RECOIL.rise * rk;
    const pv = RECOIL.pivot;
    gun.rotation.z = th;
    gun.position.set(-12 - RECOIL.kick * rk + pv.x - (pv.x * Math.cos(th) - pv.y * Math.sin(th)), pv.y - (pv.x * Math.sin(th) + pv.y * Math.cos(th)), 0);
  }
  function clockSubject(ti) {
    const tk = TICKS[ti];
    if (tk.name === 'Ready' || tk.name === 'Locked') return gun;
    const part = partByName(tk.part);
    const loc = subjectPts(gun).map((p) => gun.worldToLocal(p));
    let g0 = Infinity, g1 = -Infinity;
    for (const p of loc) (g0 = Math.min(g0, p.x)), (g1 = Math.max(g1, p.x));
    const L = (g1 - g0) * 0.6;
    const pc = part ? gun.worldToLocal(new THREE.Box3().setFromPoints(subjectPts(part)).getCenter(new THREE.Vector3())).x : (g0 + g1) / 2;
    const xa = Math.min(Math.max(pc - L / 2, g0), g1 - L);
    // the Muzzle tick's part includes its flash: the bloom's 15 cm past the crown
    const flash = tk.name === 'Muzzle' ? [[15, 0, 0], [15, 3, 0], [15, -3, 0], [8, 0, 4], [8, 0, -4]].map(([x, y, z]) => gun.localToWorld(new THREE.Vector3(MUZZLE + x, y, z))) : [];
    return [{obj: gun, slab: [xa, xa + L]}, part, flash];
  }
  function clockKeys() {
    const gp = gun.position.clone();
    const gr = gun.rotation.z;
    const keys = TICKS.map((tk, i) => {
      const t = Math.min(1, tk.t + 0.175 * ((TICKS[i + 1]?.t ?? 1) - tk.t) + 1e-4); // the middle of the hold
      poseAll(0, channelsAt(t, true));
      shells.pose(t, true, true);
      fx.pose(t, true);
      recoil(recoilAt(t));
      return frame(subjectPts(clockSubject(i)), HERO_DIR);
    });
    gun.position.copy(gp);
    gun.rotation.z = gr;
    poseAll(st.explode, channelsAt(st.t, st.fired));
    shells.pose(st.t, st.fired, st.t > 0 && st.explode < 0.02);
    fx.pose(st.t, st.explode < 0.02);
    return keys;
  }
  function clockCam(t, fresh = false) {
    if (fresh || !ckeys) ckeys = clockKeys();
    const i = tickAt(t);
    const t0 = TICKS[i].t;
    const t1 = i + 1 < TICKS.length ? TICKS[i + 1].t : 1;
    if (i + 1 >= TICKS.length || t1 <= t0) return ckeys[i];
    return blend(ckeys[i], ckeys[i + 1], ease(clamp01(((t - t0) / (t1 - t0) - 0.35) / 0.65)));
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
    view.follow = null;
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

  range.addEventListener('pointerdown', () => (exDrag = true));
  addEventListener('pointerup', () => (exDrag = false));
  range.addEventListener('change', () => (exDrag = false));
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
    if (!pointer || (view.follow && !force)) return null;
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

  // --- assembly labels at full explode: each is tried above and below the parts in its column, slid
  // sideways in 16 px steps, and kept only where it clears every part's screen box (6 px) and every
  // label placed before it (8 px), inside the usable area; leaders run from a point on the
  // assembly's largest part to the label's near edge
  function placeLabels() {
    if (!lab.els.length) {
      lab.els = asms.map((a, i) => el('div', 'iw-label', `<b>${String(i + 1).padStart(2, '0')}</b> ${a.label}`, ui));
      lab.svg.innerHTML = asms.map(() => '<polyline points=""/><circle r="2"/>').join('');
    }
    camera.updateMatrixWorld();
    const key = [...camera.matrixWorld.elements, st.explode, S.size.w, S.size.h].map((v) => v.toFixed(3)).join();
    if (key === lab.key) return;
    lab.key = key;
    gun.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const proj = (p) => (v.copy(p).project(camera), [(v.x * 0.5 + 0.5) * S.size.w, (-v.y * 0.5 + 0.5) * S.size.h]);
    const boxes = [];
    const anchor = [];
    asms.forEach((a, i) => {
      let best = 0;
      a.group.traverse((m) => {
        if (!m.isMesh || m.isLineSegments || !m.visible) return;
        const r = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
        for (const p of hullOf(m)) {
          const [x, y] = proj(p.clone().applyMatrix4(m.matrixWorld));
          r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
        }
        boxes.push(r);
        const area = (r.x1 - r.x0) * (r.y1 - r.y0);
        if (area > best) {
          best = area;
          m.geometry.computeBoundingBox();
          anchor[i] = proj(m.localToWorld(m.geometry.boundingBox.getCenter(new THREE.Vector3())));
        }
      });
    });
    const U = usable();
    const hit = (r, list, pad) => list.some((b) => r.x0 < b.x1 + pad && r.x1 > b.x0 - pad && r.y0 < b.y1 + pad && r.y1 > b.y0 - pad);
    const placed = [];
    const order = asms.map((a, i) => i).sort((i, j) => anchor[i][0] - anchor[j][0]);
    const kids = lab.svg.children;
    let gy0 = Infinity, gy1 = -Infinity;
    for (const b of boxes) (gy0 = Math.min(gy0, b.y0)), (gy1 = Math.max(gy1, b.y1));
    const lastX = {t: -Infinity, b: -Infinity}; // right edge of the last label on each side
    order.forEach((i) => {
      const e = lab.els[i];
      const w = e.offsetWidth;
      const h = e.offsetHeight;
      const [ax, ay] = anchor[i];
      let pick = null;
      for (const side of ay - gy0 < gy1 - ay ? ['t', 'b'] : ['b', 't']) {
        for (let k = 0; k < 24 && !pick; k++) {
          const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 16;
          const x0 = Math.min(Math.max(ax - w / 2 + dx, U.l + 8, lastX[side] + 10), U.r - 8 - w);
          // the column's parts: the label goes just past them, 18 px clear
          const col = boxes.filter((b) => b.x1 > x0 - 6 && b.x0 < x0 + w + 6);
          const y0 = side === 't' ? Math.min(ay, ...col.map((b) => b.y0)) - 18 - h : Math.max(ay, ...col.map((b) => b.y1)) + 18;
          const r = {x0, x1: x0 + w, y0, y1: y0 + h};
          if (r.y0 < U.t + 2 || r.y1 > U.b - 2 || hit(r, boxes, 6) || hit(r, placed, 8)) continue;
          pick = {r, side};
        }
        if (pick) break;
      }
      // nowhere clear: the nearest spot above the parts, inside the usable area
      if (!pick) {
        const x0 = Math.min(Math.max(ax - w / 2, U.l + 8), U.r - 8 - w);
        const y0 = Math.max(U.t + 2, Math.min(...boxes.map((b) => b.y0)) - 18 - h);
        pick = {r: {x0, x1: x0 + w, y0, y1: y0 + h}, side: 't'};
      }
      placed.push(pick.r);
      lastX[pick.side] = Math.max(lastX[pick.side], pick.r.x1);
      e.style.transform = `translate(${pick.r.x0.toFixed(1)}px, ${pick.r.y0.toFixed(1)}px)`;
      const ex = Math.min(Math.max(ax, pick.r.x0 + 6), pick.r.x1 - 6);
      const ey = pick.side === 't' ? pick.r.y1 + 3 : pick.r.y0 - 3;
      kids[i * 2].setAttribute('points', `${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
      kids[i * 2 + 1].setAttribute('cx', ax.toFixed(1));
      kids[i * 2 + 1].setAttribute('cy', ay.toFixed(1));
    });
    window.__LABELS = {placed, boxes: boxes.length, clear: placed.every((r, i) => !hit(r, boxes, 0) && !hit(r, placed.filter((q, j) => j !== i), 0))};
  }

  // --- resize and initial camera
  // resize: the default (whole gun) view is refitted along the current view direction
  const onResize = () => {
    S.resize();
    ckeys = null;
    autoKey = '';
    if (!window.__READY || tour.active || !view.user) return; // the auto camera refits on its next frame
    const c = frame(autoSubject(), camera.position.clone().sub(controls.target), 1, false);
    camera.position.copy(c.p);
    controls.target.copy(c.t);
  };
  addEventListener('resize', onResize);
  S.resize();
  poseAll(st.explode, 0);
  const hero = frame(gun, HERO_DIR, 1, true, ground());
  camera.position.copy(hero.p);
  controls.target.copy(hero.t);
  controls.update();
  if (q.has('tour')) startTour();

  const perf = q.has('perf') ? createPerf(S, {gpu, marks: MARKS, floor: S.floor, onGpu: (id, ms) => { const f = cpuOf.get(id); if (f) cpuOf.delete(id), sample(f.at, Math.max(f.cpu, ms), f.epoch); }, parts: [...meshes, ...asms.flatMap((a) => a.edges)]}) : null;
  const still = q.has('still');
  let prev = performance.now();
  let lastE = NaN;
  let lastP = NaN;
  // render on demand: a frame is drawn only when something it shows changed (scene state or camera);
  // frames where only the idle auto-turn moves the camera are drawn at 30 fps
  let lastSig = null;
  let lastCam = null;
  let swaying = false;
  let autoKey = '';
  let autoCam = null;
  let lastExF = NaN;
  // adaptive quality judges render work, not frame spacing: the cost of each drawn frame is its GPU time
  // (one TIME_ELAPSED query round S.render(), read back a few frames later; ?perf=1 sums its own pass queries
  // instead) or, where that is missing, the CPU time of the call; the larger of the two. Frames skipped by
  // render on demand or the 30 fps turn are never sampled. A median over 20 ms across 1 s of drawn frames
  // (at least 8, so one compile hitch cannot decide) drops one step (SSAO, reflection, shadow map 1024,
  // DPR 1, shadows off); it never steps back up in this visit
  const tq = !perf && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const inflight = []; // {q, cpu, at, epoch}: GPU queries not read back yet
  const cpuOf = new Map(); // perf mode: frame tag -> {cpu, at, epoch}
  const cost = []; // [t, ms] of drawn frames, last second
  let epoch = 0; // samples of frames drawn before a step or a tier change are discarded
  const sample = (at, ms, e) => {
    if (e !== epoch || !window.__READY || still) return;
    cost.push([at, ms]);
    while (cost[0][0] < at - 1000) cost.shift();
    if (cost.length < 8 || at - cost[0][0] < 900) return;
    const med = cost.map((c) => c[1]).sort((a, b) => a - b)[cost.length >> 1];
    if (med <= 20) return;
    const k = S.degrade();
    if (k) dropped.push(STEP[k]), setHint();
    epoch++;
    cost.length = 0;
  };
  const pollCost = () => {
    while (inflight.length && (inflight.length > 6 || gl.getQueryParameter(inflight[0].q, gl.QUERY_RESULT_AVAILABLE))) {
      const f = inflight.shift();
      const ready = gl.getQueryParameter(f.q, gl.QUERY_RESULT_AVAILABLE);
      const gpuMs = ready && !gl.getParameter(tq.GPU_DISJOINT_EXT) ? gl.getQueryParameter(f.q, gl.QUERY_RESULT) / 1e6 : 0;
      gl.deleteQuery(f.q);
      sample(f.at, Math.max(f.cpu, gpuMs), f.epoch);
    }
  };
  let tag = 0;
  const STEP = {ssao: 'no SSAO', reflection: 'no reflection', shadowmap: 'shadow map 1024', dpr: 'DPR 1', shadows: 'no shadows'};
  const sigOf = () => [st.explode, st.t, gun.rotation.z, gun.position.x, gun.position.y, S.renderer.toneMappingExposure, S.key.intensity, S.size.w, S.size.h, TIERS.indexOf(S.tier), Object.keys(S.cut).length, hovered ? hovered.id : -1, hvT.v, ...dim, ...rim, ...xr];
  const camOf = () => [...camera.position.toArray(), ...camera.quaternion.toArray(), camera.aspect];
  const same = (a, b, eps) => !!a && a.every((v, i) => Math.abs(v - b[i]) < eps);
  const tick = (now) => {
    const raw = now - prev;
    if (swaying && raw < 30 && !still) return requestAnimationFrame(tick);
    const dt = Math.min(0.05, raw / 1000);
    prev = now;
    if (tour.active) {
      const k = tour.at((now - tour.t0) / 1000);
      st.explode = k.explode;
      st.t = k.t;
      range.value = k.explode;
      hold(exT, k.explode);
      if (k.focus !== focus) {
        focus = k.focus;
        pillBtns.forEach((b, i) => b.classList.toggle('on', i === focus));
      }
      controls.target.copy(k.cam.t);
      camera.position.copy(k.cam.p);
      tourBtn.style.setProperty('--t', `${Math.min(100, ((now - tour.t0) / 10 / TOUR_LEN)).toFixed(1)}%`);
      if (k.done) stopTour();
    } else {
      if (exDrag) hold(exT, st.target);
      else aim(exT, st.target, now, 0.35 + 0.55 * Math.abs(st.target - exT.v));
      st.explode = stepT(exT, now);
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
    aim(xgT, active ? 1 : 0, now);
    xg = stepT(xgT, now);
    const xt = xrayAt(st.t);
    asms.forEach((a, i) => (xr[i] = xg * (xt[a.key] || 0)));
    poseAll(st.explode, channelsAt(st.t, st.fired));
    shells.pose(st.t, st.fired, st.t > 0 && st.explode < 0.02);
    fx.pose(st.t, st.explode < 0.02);
    // recoil: the gun kicks back and its muzzle rises about a pivot at the shoulder, then settles
    recoil(st.explode < 0.02 ? recoilAt(st.t) : 0);
    S.floor.position.y = FLOOR_Y + (FLOOR_LOW - FLOOR_Y) * smr(0.3, 0.75, st.explode); // clear of the dropped trigger group

    // dimming
    // dimming keeps each part's material (30% brightness, half opacity); the selection is lifted 15%
    asms.forEach((a, i) => {
      aim(dimT[i], focus < 0 || focus === i ? 0 : 1, now);
      aim(rimT[i], focus === i ? 1 : 0, now);
      dim[i] = stepT(dimT[i], now);
      rim[i] = stepT(rimT[i], now);
      a.setLook(dim[i] < 0.004 ? 0 : dim[i], rim[i] < 0.004 ? 0 : rim[i], xr[i] < 0.004 ? 0 : xr[i]);
    });
    S.key.intensity = 3.0 - 1.4 * rim[3]; // receiver close-up (pill 04): lower key and exposure so no pixel passes 92%
    const fl = 1 + 0.3 * smr(0.5, 0.8, st.explode); // exploded view: fill lights up 30% so dark parts lift off the background
    S.cool.intensity = 0.25 * S.key.intensity * fl; // the cool fill keeps 25% of the key
    S.fill.intensity = 0.35 * fl;
    S.under.intensity = 0.35 * fl;
    S.renderer.toneMappingExposure = 1.08 - 0.65 * rim[3];

    // camera: the tour's, the clock's, the visitor's (orbiting), or the framing rule (auto)
    const idle = !still && !tour.active && !cyc.playing && !cyc.tw && !drag && now - lastInput > 5000;
    if (tour.active) camera.lookAt(controls.target);
    else if (dir && st.explode < 0.05) {
      // the clock camera: eases in from wherever the camera was, then is a pure function of t
      if (!dir.from) dir = {from: {t: controls.target.clone(), p: camera.position.clone()}, t0: now};
      const k = clockCam(st.t);
      const w = ease(clamp01((now - dir.t0) / 800));
      const cm = w < 1 ? blend(dir.from, k, w) : k;
      controls.target.copy(cm.t);
      camera.position.copy(cm.p);
      camera.lookAt(cm.t);
      lastInput = now;
    } else {
      if (dir) dir.from = null; // exploded mid-cycle: the clock camera eases in again on reassembly
      const exMoving = Math.abs(st.explode - lastExF) > 1e-6;
      lastExF = st.explode;
      if (view.user && idle) flyTo(1.6); // back to the hero view, then the sway
      if (view.user && exMoving) {
        // the explode slider after an orbit: reframe every part continuously along the visitor's direction
        view.user = false;
        view.base = camera.position.clone().sub(controls.target).normalize();
        followFrom(0.5);
      }
      if (view.user) controls.update(dt);
      else {
        aim(view.env, idle && !view.base ? 1 : 0, now);
        stepT(view.env, now);
        view.phase = view.env.v > 0 ? view.phase + (dt * 2 * Math.PI) / SWAY_P : 0;
        const key = [st.explode, focus, view.phase, view.env.v, S.size.w, S.size.h, view.base ? view.base.toArray() : 0, st.t].join();
        if (key !== autoKey || !autoCam) autoCam = frame(autoSubject(), autoDir(), 1, !view.base, autoKeep());
        autoKey = key;
        let cm = autoCam;
        if (view.follow) {
          const w = ease(clamp01((now - view.follow.t0) / view.follow.dur));
          cm = blend(view.follow.from, autoCam, w);
          if (w >= 1) view.follow = null;
        }
        controls.target.copy(cm.t);
        camera.position.copy(cm.p);
        camera.lookAt(cm.t);
      }
    }

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
    // the outline and the leader fade in with the card (the leader fades out with it, from where it was)
    aim(hvT, hovered ? 1 : 0, now);
    S.outline.edgeStrength = 4.5 * stepT(hvT, now);
    lead.classList.toggle('show', !!hovered);
    if (hovered) drawLeader();
    const lv = tour.active ? 0 : smr(0.5, 0.8, st.explode);
    lab.svg.style.opacity = lv;
    lab.els.forEach((e) => (e.style.opacity = lv));
    if (lv > 0) placeLabels();

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
    swaying = !moved && camMoved && view.env.v > 0 && !view.follow && !view.user; // only the sway moves: 30 fps
    pickDirty = draw;
    if (!draw) return requestAnimationFrame(tick);
    lastSig = sg;
    lastCam = cm;
    perf?.frameStart();
    const t0 = performance.now();
    const gq = tq && gl.createQuery();
    if (gq) gl.beginQuery(tq.TIME_ELAPSED_EXT, gq);
    S.render();
    if (gq) gl.endQuery(tq.TIME_ELAPSED_EXT);
    const cpu = performance.now() - t0;
    if (gq) inflight.push({q: gq, cpu, at: now, epoch}), pollCost();
    else if (perf) cpuOf.set(++tag, {cpu, at: now, epoch}), cpuOf.size > 16 && cpuOf.delete(cpuOf.keys().next().value);
    else sample(now, cpu, epoch);
    if (!window.__READY) {
      if (perf) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // first frame = the GPU finished it
      MARKS.shaders ??= performance.now(); // until compileAsync, the shaders compile inside the first frame
      MARKS.first = performance.now();
      setTimeout(() => warmTransparent(), 300);
      MARKS.programs = S.renderer.info.programs.length;
      window.__READY = true;
      window.__STATS = {meshes: meshes.length, parts: asms.reduce((n, a) => n + a.parts.length, 0), tris: S.renderer.info.render.triangles, tier: S.tier};
    }
    perf?.frameEnd(now, tag);
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
    flip(false);
    setTimeout(() => warmTransparent(groups), 60);
  }
  await Promise.all(jobs);
  MARKS.shaders = performance.now();
  load.remove();
  if (film) startFilm();
  else requestAnimationFrame(tick);
  /**
   * The 12 s film: hero sway 2 s; FIRE at 0.1x with the x-ray (5.1 s); the eject in slow motion (PUMP
   * 0.30-0.55 at 0.25x, 1.7 s); the pump runs home (0.5 s); explode to 1 and back (2 s); the hero (0.7 s).
   */
  function startFilm() {
    ui.style.display = 'none';
    S.renderer.shadowMap.autoUpdate = true;
    const A = 2, B = A + (0.3 * FULL_S) / 0.1, C = B + (0.25 * FULL_S) / 0.25, D = C + 0.5, E = D + 2.0, END = 12;
    const deg = THREE.MathUtils.degToRad;
    const hero = (a) => frame(gun, swayDir(HERO_DIR, deg(a)), 1, true, ground());
    const lin = (a, b, x) => clamp01((x - a) / (b - a));
    function pose(T) {
      let t = 0;
      let e = 0;
      let x = 0;
      let cam;
      if (T < A) cam = hero(-10 + 20 * ease(T / A));
      else if (T < B) {
        t = 0.3 * lin(A, B, T);
        x = ease(lin(A, A + 0.4, T));
      } else if (T < C) {
        t = 0.3 + 0.25 * lin(B, C, T);
        x = 1;
      } else if (T < D) {
        t = 0.55 + 0.45 * ease(lin(C, D, T));
        x = 1 - ease(lin(C, D, T));
      } else if (T < E) {
        const u = T - D;
        e = u < 0.8 ? ease(u / 0.8) : u < 1.1 ? 1 : 1 - ease((u - 1.1) / 0.9);
      }
      if (t >= 1) t = 0;
      st.t = t;
      st.explode = e;
      st.fired = true;
      poseAll(e, channelsAt(t, true));
      shells.pose(t, true, t > 0 && e < 0.02);
      fx.pose(t, e < 0.02);
      recoil(e < 0.02 ? recoilAt(t) : 0);
      S.floor.position.y = FLOOR_Y + (FLOOR_LOW - FLOOR_Y) * smr(0.3, 0.75, e);
      const xt = xrayAt(t);
      asms.forEach((a, i) => a.setLook(0, 0, x * (xt[a.key] || 0)));
      const fl = 1 + 0.3 * smr(0.5, 0.8, e);
      S.key.intensity = 3.0;
      S.cool.intensity = 0.75 * fl;
      S.fill.intensity = 0.35 * fl;
      S.under.intensity = 0.35 * fl;
      if (!cam) {
        if (T < C) cam = blend(hero(10), clockCam(t), ease(lin(A, A + 0.7, T)));
        else if (T < D) cam = blend(clockCam(Math.min(t, 0.999)), hero(0), ease(lin(C, D, T)));
        else if (T < E) cam = frame(gun, HERO_DIR, 1, true, ground());
        else cam = hero(6 * ease(lin(E, END, T)));
      }
      controls.target.copy(cam.t);
      camera.position.copy(cam.p);
      camera.lookAt(cam.t);
      camera.updateMatrixWorld();
    }
    S.resize();
    ckeys = null;
    window.DURATION = END;
    window.FPS = 60;
    window.seek = (T) => {
      pose(Math.min(END, Math.max(0, T)));
      S.render();
    };
    window.__READY = true;
  }
  window.IRONWOOD = {asms, gun, st, focusOn, pointsOf, shells, startTour, TOUR_LEN, floor: FLOOR_Y, camera, S, controls, frame, clockCam, partByName, TICKS, tickAt, subjectPts, usable, clockSubject, autoSubject, view, direct, get hovered() { return hovered; }}; // controls + frame: for the hero and check shots
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#e66;position:fixed;left:16px;top:80px">${e.stack || e}</pre>`);
});
