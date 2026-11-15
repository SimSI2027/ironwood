// THE CLOCK: one parameter t (0..1) in two segments, FIRE 0.00-0.30 and PUMP 0.30-1.00. Every channel
// below is a hand-timed curve of t (keyframed, not a physics or mechanism simulation).
// FIRE: Ready 0 · Press 0.03-0.08 (trigger back 18 deg) · Hammer 0.08-0.11 · Strike 0.11 (pin 2 mm) ·
// Burn 0.11-0.15 · Travel 0.15-0.21 · Muzzle 0.21-0.25 · Recoil 0.21-0.30 (see fire.js).
// PUMP runs the pump cycle on its own c = (t - 0.3) / 0.7:
// 0.00 closed · 0.35 forend, action bars and bolt back (7.5 cm) · 0.43-0.46 spent shell slides out
// of the side port, then tumbles, lands and fades · 0.40-0.47 fresh shell backs out of the tube ·
// 0.47-0.55 it rises on the elevator to bore level · 0.60-1.00 forend forward, the bolt carries it in.
import * as THREE from 'three';
import {latheX} from './lib/geo.js';
import {NO_BLOOM, noBloom} from './lib/materials.js';
import {MAG_Y} from './barrel.js';
import {BOLT_TRAVEL} from './forend.js';
import {FLOOR_Y} from './stage.js';
import {HAMMER} from './trigger.js';

export const FIRE_END = 0.3; // FIRE 0..0.3, PUMP 0.3..1
export const FULL_S = 1.7; // seconds for the whole clock at 1x (FIRE 0.51 s, PUMP 1.19 s)
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const sm = (t) => ((t = clamp01(t)), t * t * (3 - 2 * t));
/** Pump c (0..1) from the clock, and back. */
export const pumpC = (t) => clamp01((t - FIRE_END) / (1 - FIRE_END));
export const tOfC = (c) => FIRE_END + (1 - FIRE_END) * c;

/** Forend stroke s(c): 0 forward, 1 fully back. Rises on 0-0.5 (pull), falls on 0.5-1 (push). */
export function strokeAt(c) {
  if (c <= 0.35) return 0.92 * sm(c / 0.35);
  if (c <= 0.5) return 0.92 + (0.08 * (c - 0.35)) / 0.15;
  if (c <= 0.6) return 1 - (0.04 * (c - 0.5)) / 0.1;
  return 0.96 * (1 - sm((c - 0.6) / 0.4));
}
/** Inverse of strokeAt on the pull half (c 0..0.5) or the push half (c 0.5..1). */
export function cAtStroke(s, push) {
  let lo = push ? 0.5 : 0;
  let hi = push ? 1 : 0.5;
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    const v = strokeAt(m);
    if (push ? v > s : v < s) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

const LOCK_S = 0.15; // the first 15% of forend travel drops the locking block, then the bolt moves
/** Channels for Asm.pose: f forend/bars/slide stroke, b bolt stroke, lock 0 locked..1 dropped, elev lift. */
export function channels(c) {
  const s = strokeAt(c);
  return {
    f: s,
    b: clamp01((s - LOCK_S) / (1 - LOCK_S)),
    lock: clamp01(s / LOCK_S),
    elev: sm((c - 0.47) / 0.08) * (1 - sm((c - 0.62) / 0.1)),
  };
}

// hammer: cocked lies back at 0.93 pi; fired, its tip (r 5.62) sits on the firing pin's rear (-9.1, 0)
const H_COCKED = Math.PI * 0.93;
const H_FIRED = 0.878;
const H_R = 5.62;
const C_LOCK = cAtStroke(LOCK_S, true); // push half: the locking block rises, the bolt locks
function hammerAt(t, fired) {
  if (t < FIRE_END) return t < 0.08 ? 0 : Math.min(1, ((t - 0.08) / 0.03) ** 2); // spring-driven: fastest at the pin
  if (!fired) return 0; // never fell: stays cocked, the bolt rides over it
  const c = pumpC(t);
  const b = c <= 0.5 ? channels(c).b : 1; // once re-cocked the sear holds it
  // the tip stays behind the firing pin's rear as the bolt rides back over it, then lies down cocked
  const xp = -9.1 + BOLT_TRAVEL * b - 0.06;
  const phiC = Math.acos(Math.max(-1, Math.min(1, (xp - HAMMER[0]) / H_R)));
  const phiL = H_FIRED + (H_COCKED - H_FIRED) * sm(b / 0.95);
  const phi = Math.min(H_COCKED, Math.max(phiC, phiL));
  return (H_COCKED - phi) / (H_COCKED - H_FIRED);
}
/** All channels at clock t: pump {f, b, lock, elev} plus ham (0 cocked..1 on the pin), trig (0..1 = 18 deg), pin (0..1 = 2 mm). */
export function channelsAt(t, fired) {
  const c = pumpC(t);
  const k = channels(c);
  k.ham = hammerAt(t, fired);
  if (t < FIRE_END) {
    k.trig = sm((t - 0.03) / 0.05);
    k.pin = sm((t - 0.11) / 0.004) * (1 - sm((t - 0.125) / 0.02)); // strikes, then its spring returns it onto the hammer
  } else {
    k.trig = fired ? 1 - sm((c - C_LOCK) / 0.04) : 0; // resets when the bolt locks
    k.pin = 0;
  }
  return k;
}

// ticks on the clock t: `part` is the moving part that gets the outline and name card
export const FIRE_TICKS = [
  {t: 0, name: 'Ready', part: 'trigger'},
  {t: 0.03, name: 'Press', part: 'trigger'},
  {t: 0.08, name: 'Hammer', part: 'hammer'},
  {t: 0.11, name: 'Strike', part: 'firing pin'},
  {t: 0.114, name: 'Burn', part: 'chambered'},
  {t: 0.15, name: 'Travel', part: 'shot column'},
  {t: 0.21, name: 'Muzzle', part: 'choke tube'},
  {t: 0.235, name: 'Recoil', part: 'recoil pad'}, // the label after the flash's peak (0.215): the Muzzle tick and its camera cover the flash
];
export const PUMP_TICKS = [
  {t: FIRE_END, name: 'Closed', part: 'bolt'},
  {t: +tOfC(cAtStroke(LOCK_S, false)).toFixed(3), name: 'Unlock', part: 'locking block'},
  {t: +tOfC(0.43).toFixed(3), name: 'Eject', part: 'ejected'},
  {t: +tOfC(0.5).toFixed(3), name: 'Lift', part: 'elevator'},
  {t: +tOfC(0.8).toFixed(3), name: 'Feed', part: 'shell'},
  {t: 1, name: 'Locked', part: 'action bar lock'},
];
export const TICKS = [...FIRE_TICKS, ...PUMP_TICKS];
/** Index of the active tick: the last one reached. */
export const tickAt = (t) => TICKS.reduce((k, x, i) => (t >= x.t - 1e-4 ? i : k), 0);

// --- the two shells (12 gauge look): brass head, red hull. Built along +X, centred on the origin.
const F_LEN = 6.0; // fresh: star crimp closed
const S_LEN = 6.6; // spent: crimp opened out, longer
function headGeo() {
  return latheX([[0, 0], [0, 0.97], [0.03, 1.0], [0.12, 1.0], [0.15, 0.93], [1.3, 0.925], [1.34, 0.88], [1.34, 0]], 48);
}
/** Deform a lathe along +X: f(x, theta, r) -> new r (and optional dx). */
function deform(g, f) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(y, z);
    if (r < 1e-5) continue;
    const th = Math.atan2(z, y);
    const [nr, dx = 0] = f(x, th, r);
    p.setXYZ(i, x + dx, (y * nr) / r, (z * nr) / r);
  }
  g.computeVertexNormals();
  return g;
}
function freshHull() {
  const g = latheX([[1.2, 0], [1.2, 0.905], [5.72, 0.905], [5.86, 0.87], [5.95, 0.74], [5.99, 0.45], [5.95, 0.18], [5.93, 0]], 72);
  // six-fold star crimp: folds pinch the end in
  return deform(g, (x, th, r) => {
    const t = clamp01((x - 5.7) / 0.29);
    const fold = 0.5 + 0.5 * Math.cos(th * 6);
    return [r * (1 - 0.05 * fold * t), -0.06 * fold * t * (1 - r / 0.91)];
  });
}
function spentHull() {
  const g = latheX([[1.2, 0], [1.2, 0.905], [6.42, 0.915], [6.55, 0.945], [6.6, 0.9], [6.54, 0.84], [1.5, 0.83], [1.5, 0]], 72);
  return deform(g, (x, th, r) => {
    let nr = r;
    // opened crimp: six soft creases at the mouth
    if (x > 6.0) nr *= 1 + 0.035 * Math.cos(th * 6) * clamp01((x - 6.0) / 0.5);
    // dent on one side, and a slight ovality from the ejection
    let dth = th - 0.8;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    nr -= 0.16 * Math.exp(-(((x - 3.9) / 0.75) ** 2) - (dth / 0.45) ** 2);
    nr *= 1 + 0.02 * Math.cos(th * 2);
    return [nr];
  });
}
// shells never emit (emissive 0) and never bloom; only the hull's Burn glow (uA > 0) lifts the cap
const mats = () => ({
  brass: noBloom(new THREE.MeshPhysicalMaterial({color: 0xc29a48, metalness: 1, roughness: 0.35, emissive: 0, emissiveIntensity: 0})),
  primer: noBloom(new THREE.MeshPhysicalMaterial({color: 0x9aa0a8, metalness: 1, roughness: 0.35, emissive: 0, emissiveIntensity: 0})),
});
const HULL = {color: 0xa31a1a, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3, emissive: 0, emissiveIntensity: 0};
// fired hull: 15% duller than a live one (darker, rougher, less clearcoat), scorched toward the mouth
const SPENT_HULL = {...HULL, color: new THREE.Color(0xa31a1a).multiplyScalar(0.85), roughness: 0.46, clearcoat: 0.255, vertexColors: true};
/** Hull glow: emissive that fills the hull from the base (geometry x 1.2) forward to uX, strength uA. */
function glowHull(m) {
  const U = {uX: {value: 0}, uA: {value: 0}};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGX;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGX = position.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGX;\nuniform float uX;\nuniform float uA;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(3.4, 1.15, 0.22) * uA * smoothstep(uX + 0.5, uX - 0.5, vGX);')
      .replace('#include <opaque_fragment>', 'if (uA < 0.001) ' + NO_BLOOM + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'hullglow';
  m.userData.glow = U;
  return m;
}
function shell(len, hull, hullMat, name, spent = false) {
  const M = mats();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.x = -len / 2; // pivot at the shell's centre
  g.add(inner);
  inner.add(new THREE.Mesh(headGeo(), M.brass), new THREE.Mesh(hull, glowHull(hullMat)));
  // primer: a fired one is dark, with the pin's dent in its centre
  const pp = spent ? [[0.05, 0], [0.03, 0.05], [-0.004, 0.1], [-0.012, 0.15], [-0.012, 0.22], [0.0, 0.26]] : [[-0.012, 0], [-0.012, 0.22], [0.0, 0.26]];
  if (spent) Object.assign(M.primer, {color: new THREE.Color(0x241e1b), roughness: 0.75, metalness: 0.5});
  inner.add(new THREE.Mesh(latheX(pp, 24), M.primer));
  const ms = [M.brass, M.primer, hullMat];
  if (spent) {
    // soot inside the opened mouth
    const soot = noBloom(new THREE.MeshStandardMaterial({color: 0x0d0907, roughness: 0.95, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0}));
    inner.add(new THREE.Mesh(latheX([[5.4, 0.8], [6.56, 0.83]], 48), soot));
    ms.push(soot);
  }
  g.userData.part = name;
  g.userData.mats = ms;
  g.userData.glow = hullMat.userData.glow;
  g.userData.len = len;
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.partRoot = g;
  });
  return g;
}
/** Scorch: vertex colours darken the spent hull toward its mouth. */
function scorch(g) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 1 - 0.8 * sm((p.getX(i) - 5.6) / 0.95);
    col.set([k, k * 0.92, k * 0.88], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The chambered round (live, or spent once fired) that the pump ejects, and the fresh one from the
 * tube, posed from the clock t. Add `group` to the gun so it shares the gun's frame.
 */
export function createShells() {
  const spent = shell(S_LEN, scorch(spentHull()), new THREE.MeshPhysicalMaterial(SPENT_HULL), 'spent shell', true);
  const live = shell(F_LEN, freshHull(), new THREE.MeshPhysicalMaterial(HULL), 'shell');
  const fresh = shell(F_LEN, freshHull(), new THREE.MeshPhysicalMaterial(HULL), 'shell');
  const group = new THREE.Group();
  group.add(spent, live, fresh);
  const face = (c) => BOLT_TRAVEL * channels(c).b; // bolt face x (0 when closed)
  const setOpacity = (s, a) =>
    s.userData.mats.forEach((m) => {
      const t = a < 0.999;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = a;
      m.depthWrite = !t;
    });
  // ejected shell, a pure function of pump c over its segment (0.425-0.92), no stepped keys:
  //  ride    c < 0.425       the bolt carries it back (base on the bolt face)
  //  kick    0.425-0.437     drops onto the port sill (bottom at y -1.35) and slides until its right
  //                          rim touches the wall plane z 1.55
  //  pivot   0.437-0.47      yaws base-out about its front rim point on the sill edge, accelerating to
  //                          the flight's spin rate (87 deg); every point stays inside the port's x/y
  //  flight  0.47-0.64       30 cm straight out toward +z (the camera side), base first, axis level,
  //                          0.8 cm up at most (its top stays under the receiver top 1.62), then down
  //                          to the floor; 2.5 yaw spins and a roll about its own axis, linear in time
  //  bounce  0.64-0.69 (3 cm) · roll 0.69-0.77 (4 cm, on its side) · settle · fade 0.80-0.92
  const SILL = -1.35;
  const WALL = 1.55;
  const R_SH = 0.93; // hull radius
  const C_K = 0.425;
  const C_P = 0.437;
  const C_F = 0.47;
  const C_L = 0.64;
  const C_B = 0.69;
  const C_R = 0.77;
  const SPIN = 5 * Math.PI; // 2.5 turns in flight
  const TH1 = (SPIN * (C_F - C_P)) / (C_L - C_F) / 2; // pivot end angle: its end rate = the spin rate
  const yPort = SILL + R_SH;
  const yLand = FLOOR_Y + 1.0; // on its side on the floor (brass rim radius 1.0); the gun sits at y 0
  const RANGE = 30;
  const PEAK = 0.8;
  const dH = new THREE.Vector3(0, 0, 1); // straight out of the port, toward the camera
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  const v3 = new THREE.Vector3();
  /** Shell centre for a yaw psi (positive: base toward +z) about the front rim point Q = (xb + L, yPort, WALL). */
  const aboutRim = (xb, L, psi, out) =>
    out.set(xb + L - (L / 2) * Math.cos(psi) - R_SH * Math.sin(psi), yPort, WALL + (L / 2) * Math.sin(psi) - R_SH * Math.cos(psi));
  function poseEject(s, c) {
    const L = s.userData.len;
    const xb = face(C_K);
    s.visible = c < 0.92;
    if (!s.visible) return;
    setOpacity(s, 1 - sm((c - 0.8) / 0.12));
    if (c < C_K) {
      s.rotation.set(0, 0, 0);
      return s.position.set(face(c) + L / 2, 0, 0);
    }
    if (c < C_P) {
      const k = sm((c - C_K) / (C_P - C_K));
      s.rotation.set(0, 0, 0);
      return s.position.set(xb + L / 2, yPort * k, (WALL - R_SH) * k);
    }
    if (c < C_F) {
      const psi = TH1 * ((c - C_P) / (C_F - C_P)) ** 2;
      s.rotation.set(0, psi, 0);
      return aboutRim(xb, L, psi, s.position);
    }
    const psi0 = TH1;
    const p0 = aboutRim(xb, L, psi0, v3);
    // parabola through the release (y0), 12 cm over it, landing on the floor at tau 1
    const d = yLand - p0.y;
    const B = 2 * PEAK + 2 * Math.sqrt(PEAK * (PEAK - d));
    const A = B - d;
    if (c < C_L) {
      const tau = (c - C_F) / (C_L - C_F);
      s.position.set(p0.x + dH.x * RANGE * tau, p0.y + B * tau - A * tau * tau, p0.z + dH.z * RANGE * tau);
      euler.set(2 * Math.PI * tau, psi0 + SPIN * tau, 0);
      return s.rotation.copy(euler);
    }
    // on the floor: yaw frozen where it landed, axis level
    const psiL = psi0 + SPIN;
    const land = v3.set(p0.x + dH.x * RANGE, yLand, p0.z + dH.z * RANGE);
    const tb = clamp01((c - C_L) / (C_B - C_L));
    const hop = 3 * 4 * tb * (1 - tb);
    const tr = clamp01((c - C_B) / (C_R - C_B));
    const roll = 4 * (1 - (1 - tr) ** 2);
    // roll direction: level and square to the shell's axis, on the side it was travelling
    const ax = Math.cos(psiL);
    const az = -Math.sin(psiL);
    let px = -az;
    let pz = ax;
    if (px * dH.x + pz * dH.z < 0) (px = -px), (pz = -pz);
    const slide = 2.5 * (1 - (1 - tb) ** 2); // carries on 2.5 cm through the bounce
    s.position.set(land.x + dH.x * slide + px * roll, yLand + hop, land.z + dH.z * slide + pz * roll);
    // rolling without slipping: about its own axis by roll / radius, sense from up x travel
    const sense = Math.sign(pz * ax - px * az) || 1;
    euler.set(sense * (roll / R_SH), psiL, 0);
    s.rotation.copy(euler);
  }

  // fresh shell waypoints (base x, centre y), all clear of the tube mouth (x -0.6, top y -1.65),
  // the barrel extension (x -3.2..0, hood only above y 0) and the bolt face (x -7.5 at full stroke):
  // 1 in the tube (0.8, MAG_Y) -> 2 out of the tube (-7.0: tip at -1.0, 4 mm behind the mouth, base
  // 5 mm ahead of the bolt) -> 3 up level with the bore, same x (tip rises into the open throat)
  // -> 4 forward, pushed by the bolt face into the chamber.
  const X_OUT = -7.0;
  let chambered = live;

  /** fired: FIRE ran before this pump (the round in the chamber is spent). visible: false hides all. */
  function pose(t, fired, visible = true) {
    group.visible = visible;
    if (!visible) return;
    const c = pumpC(t);
    const isSpent = t < FIRE_END ? t >= 0.15 : fired; // the crimp opens as the shot column leaves
    chambered = isSpent ? spent : live;
    (isSpent ? live : spent).visible = false;
    poseEject(chambered, c);
    // burn: the hull glows from the base forward (0.11-0.15), then cools while the shot travels
    const gl = chambered.userData.glow;
    const L = chambered.userData.len;
    if (t < 0.15) {
      gl.uA.value = t >= 0.11 ? 1 : 0;
      gl.uX.value = 1.2 + (L - 1.2 + 0.6) * clamp01((t - 0.11) / 0.04);
    } else {
      gl.uA.value = t < FIRE_END ? 1 - clamp01((t - 0.15) / 0.07) : 0;
      gl.uX.value = L + 1;
    }

    // --- fresh shell: out of the tube, onto the elevator, up to the bore, fed by the bolt
    fresh.visible = c >= 0.38;
    if (!fresh.visible) return;
    const lift = sm((c - 0.47) / 0.08);
    const y = MAG_Y * (1 - lift);
    const x = Math.max(0.8 + (X_OUT - 0.8) * sm((c - 0.4) / 0.07), face(c)); // the bolt face pushes it home
    fresh.position.set(x + F_LEN / 2, y, 0);
    fresh.rotation.set(0, 0, 0);
    setOpacity(fresh, 1);
  }
  return {group, spent, live, fresh, pose, chambered: () => chambered};
}
