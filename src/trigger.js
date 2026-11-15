// 6. Trigger group: housing (lower body plus two inner walls), trigger guard loop, curved trigger,
// hammer with spring and plunger, sear and its spring, disconnector, left and right connectors,
// action bar lock with release button, cross-bolt safety with detent, 3 internal pins, 2 plate pins.
import {THREE, rcyl, mesh, group, rpoly, circ, hole, extrudeXY, sweepXY, rrectSection, spring, pinZ, rodX, rbox} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {PIN_F, PIN_R} from './receiver.js';

export const HAMMER = [-12.6, -4.4];
const TRIG = [-8.6, -4.7];
const SEAR = [-10.6, -4.25];
const SAFETY = [-13.35, -5.62];

export function buildTrigger() {
  const A = new Asm('trigger', 'Trigger group', {offset: [-2, -17, 0], delay: 0.1, inner: true});
  const M = A.M;

  // --- housing: lower body under the receiver, two inner walls with pin bores and lightening cuts
  const housing = group(0, 0, 0);
  const lower = rpoly(
    [
      [-19.7, -5.22, 0.1],
      [-3.55, -5.22, 0.1],
      [-3.55, -5.75, 0.35],
      [-4.2, -6.1, 0.3],
      [-12.9, -6.12, 0.4],
      [-18.6, -6.0, 0.6],
      [-19.85, -5.6, 0.3],
    ],
    0.2,
  );
  lower.holes.push(circ(SAFETY[0], SAFETY[1], 0.27));
  housing.add(mesh(extrudeXY(lower, 3.02, 0.12, 24), M.alloy));
  const inner = rpoly(
    [
      [-19.25, -5.3, 0.1],
      [-4.0, -5.3, 0.1],
      [-4.0, -4.05, 0.3],
      [-6.9, -3.85, 0.4],
      [-10.0, -3.9, 0.2],
      [-11.6, -3.65, 0.4],
      [-14.0, -3.7, 0.3],
      [-17.0, -3.85, 0.3],
      [-19.25, -4.2, 0.3],
    ],
    0.15,
  );
  for (const p of [PIN_F, PIN_R, HAMMER, TRIG, SEAR]) inner.holes.push(circ(p[0], p[1], 0.135));
  inner.holes.push(hole([[-16.6, -5.0], [-14.2, -5.0], [-14.2, -4.3], [-16.6, -4.3]], 0.3));
  inner.holes.push(hole([[-7.6, -5.0], [-5.6, -5.0], [-5.6, -4.45], [-7.6, -4.45]], 0.25));
  const iw = extrudeXY(inner, 0.2, 0.05, 20);
  housing.add(mesh(iw, M.alloy, 0, 0, 0.92), mesh(iw, M.alloy, 0, 0, -0.92));
  A.add(housing, 'trigger housing', {xray: true}); // x-ray from press to strike

  // trigger and guard: one blued steel, no anisotropy (a sweep has no tangents, so it would streak
  // white) and no worn-edge brightening (on parts this thin every face is an edge)
  const blued = new THREE.MeshPhysicalMaterial({color: 0x252c39, metalness: 1, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.2});

  // --- trigger guard: an open U loop of a 3 mm band (8.8 mm wide), 6 cm long and 3 cm deep outside,
  // under the housing's underside (y -6.11). Both ends rise 2 mm into the housing, each on a small
  // foot, so it hangs from the housing rather than floating as a ring.
  const G = {cx: -8.85, top: -6.11, a: 3 - 0.15, b: 3 - 0.15}; // centreline: outer size minus half the band
  const guardPath = [[G.cx + G.a, G.top + 0.2]];
  for (let k = 0; k <= 48; k++) {
    const th = (k / 48) * Math.PI; // a squared-off half superellipse (n = 3): vertical at both ends
    const c = Math.cos(th);
    guardPath.push([G.cx + G.a * Math.sign(c) * Math.abs(c) ** (2 / 3), G.top - G.b * Math.sin(th) ** (2 / 3)]);
  }
  guardPath.push([G.cx - G.a, G.top + 0.2]);
  const guard = mesh(sweepXY(rrectSection(0.15, 0.44, 0.07, 3), guardPath, {samples: 120}), blued);
  for (const s of [1, -1]) guard.add(mesh(rbox(0.8, 0.22, 0.95, 0.08), blued, G.cx + s * G.a, G.top - 0.06, 0));
  A.add(guard, 'trigger guard', {ex: [0, -2.6, 0], delay: 0.15});

  // --- trigger: curved steel blade, 4 mm thick, its side face 6.4 mm tapering to 4.8 mm
  const trigger = group(TRIG[0], TRIG[1], 0);
  const tPath = [
    [0, 0.25],
    [-0.12, -0.8],
    [-0.35, -1.6],
    [-0.42, -2.45],
    [-0.15, -3.3],
    [0.35, -3.85],
  ];
  trigger.add(mesh(sweepXY(rrectSection(0.32, 0.2, 0.06, 3), tPath, {samples: 40, scale: (t) => [1 - 0.25 * t, 1]}), blued));
  trigger.add(mesh(rcyl(0.42, 0.42, 0.4, 24), blued, 0, 0, 0, Math.PI / 2, 0, 0));
  // serrations on the face
  for (let k = 0; k < 7; k++) {
    const y = -1.4 - k * 0.27;
    const x = -0.36 - 0.06 * Math.sin((k / 6) * Math.PI) + (k > 4 ? (k - 4) * 0.12 : 0);
    trigger.add(mesh(rbox(0.05, 0.05, 0.36, 0.02), blued, x + 0.29, y, 0));
  }
  A.add(trigger, 'trigger', {ex: [0, -4.4, 0], rot: [0, 0, 0.25], delay: 0.3, drive: 'trig', pumpRot: [0, 0, -0.314]}); // pulled 18 deg

  // --- hammer: pivot boss, arm, striking face, cocking notch; lies back when cocked
  const hS = rpoly(
    [
      [-0.65, -0.35, 0.3],
      [0.15, -0.9, 0.2],
      [0.85, -0.62, 0.1],
      [1.1, -0.8, 0.08],
      [1.6, -0.45, 0.2],
      [5.2, -0.32, 0.12],
      [5.45, -0.05, 0.08],
      [5.45, 0.35, 0.08],
      [5.1, 0.52, 0.15],
      [2.0, 0.55, 0.6],
      [0.55, 0.78, 0.35],
      [-0.45, 0.58, 0.3],
    ],
    0.15,
  );
  hS.holes.push(circ(0, 0, 0.135));
  const hammer = group(HAMMER[0], HAMMER[1], 0, mesh(extrudeXY(hS, 0.5, 0.07, 20), M.steelSatin));
  hammer.add(mesh(rbox(0.36, 0.7, 0.4, 0.06), M.steelBright, 5.44, 0.12, 0)); // striking face, tip at r 5.62 (the firing pin's rear)
  hammer.rotation.z = Math.PI * 0.93;
  A.add(hammer, 'hammer', {ex: [-2.0, 4.6, 0], rot: [0, 0, -0.9], delay: 0.2, drive: 'ham', pumpRot: [0, 0, -(Math.PI * 0.93 - 0.878)]}); // cocked -> on the pin

  // --- hammer spring on its plunger
  const hsp = group(0, -4.98, 0);
  hsp.add(mesh(spring(3.6, 0.22, 0.07, 15, {seg: 16, radial: 6}), M.brass, -18.3, 0, 0));
  hsp.add(mesh(rodX(-18.9, -14.2, 0.1, 0.03, 14), M.steelBright));
  hsp.add(mesh(rodX(-14.4, -13.8, 0.2, 0.06, 18), M.steelBright));
  A.add(hsp, 'hammer spring', {ex: [-2.5, -3.2, 0], scaleX: 1.2, delay: 0.25});

  // --- sear with its spring
  const searS = rpoly([[-0.45, -0.32], [1.3, -0.25], [1.62, 0.12], [1.35, 0.35], [-0.35, 0.45]], 0.1);
  searS.holes.push(circ(0, 0, 0.13));
  const sear = group(SEAR[0], SEAR[1], 0, mesh(extrudeXY(searS, 0.4, 0.05), M.steelBright));
  sear.rotation.z = Math.PI;
  A.add(sear, 'sear', {ex: [0, 3.2, 0], delay: 0.35});
  const ss = mesh(spring(0.85, 0.12, 0.025, 7, {seg: 14, radial: 5}), M.brass, -11.55, -5.2, 0, 0, 0, Math.PI / 2);
  A.add(ss, 'sear spring', {ex: [0, 2.0, 3.0], scaleX: 1.3, delay: 0.4});

  // --- disconnector and the two connectors
  const dS = rpoly([[-0.3, -0.25], [0.35, -0.2], [0.4, 0.9], [-0.95, 1.05], [-1.05, 0.7], [-0.3, 0.45]], 0.1);
  const disc = mesh(extrudeXY(dS, 0.16, 0.04), M.steelBright, TRIG[0], TRIG[1], 0.34);
  A.add(disc, 'disconnector', {ex: [0, 1.8, 3.0], delay: 0.45});
  const cS = rpoly([[-3.0, -0.12], [0.2, -0.12], [0.35, 0.18], [-2.6, 0.3], [-3.0, 0.6]], 0.07);
  const conR = mesh(extrudeXY(cS, 0.1, 0.03), M.steelSatin, TRIG[0], TRIG[1] + 0.35, 0.62);
  const conL = mesh(extrudeXY(cS, 0.1, 0.03), M.steelSatin, TRIG[0], TRIG[1] + 0.35, -0.62);
  A.add(conR, 'connector, right', {ex: [0, 1.0, 4.4], delay: 0.5});
  A.add(conL, 'connector, left', {ex: [0, 1.0, -4.4], delay: 0.5});

  // --- action bar lock: lever on the left wall, release button ahead of the guard
  const lockS = rpoly([[-11.0, -4.45], [-4.4, -4.45], [-3.9, -4.1], [-4.6, -3.85], [-10.6, -3.95]], 0.12);
  const lock = group(0, 0, 0, mesh(extrudeXY(lockS, 0.12, 0.03), M.steelSatin, 0, 0, -1.1));
  lock.add(mesh(rbox(0.5, 1.15, 0.55, 0.15), M.steel, -4.2, -5.85, -0.72));
  lock.add(mesh(spring(0.8, 0.1, 0.022, 7, {seg: 14, radial: 5}), M.brass, -10.6, -4.6, -1.1, 0, 0, -Math.PI / 2));
  A.add(lock, 'action bar lock', {ex: [0, 0.8, -4.6], delay: 0.55});

  // --- safety: cross-bolt button (brass), detent ball and spring
  const saf = group(SAFETY[0], SAFETY[1], 0);
  const sp = [[-1.85, 0], [-1.85, 0.2], [-1.78, 0.26], [-0.7, 0.26], [-0.62, 0.2], [-0.25, 0.2], [-0.18, 0.26], [1.78, 0.26], [1.85, 0.2], [1.85, 0]];
  const safety = mesh(new THREE.LatheGeometry(sp.map(([x, r]) => new THREE.Vector2(Math.max(r, 1e-4), x)), 28), M.brass);
  safety.rotation.x = Math.PI / 2; // lathe axis (Y) to Z
  saf.add(safety);
  A.add(saf, 'safety', {ex: [0, -1.2, 6.0], delay: 0.6});
  const det = group(SAFETY[0] - 0.65, SAFETY[1] + 0.15, 0, mesh(new THREE.SphereGeometry(0.1, 12, 8), M.steelBright, 0, 0.3, 0));
  det.add(mesh(spring(0.6, 0.08, 0.02, 6, {seg: 12, radial: 5}), M.brass, 0, 0.36, 0, 0, 0, Math.PI / 2));
  A.add(det, 'safety detent', {ex: [-1.2, -2.6, 4.0], delay: 0.65});

  // --- pins: 3 internal (hammer, trigger, sear) and the 2 trigger plate pins that cross the receiver
  const pin = (p, len, r, name, ex, d) => A.add(mesh(pinZ(len, r), M.brass, p[0], p[1], 0), name, {ex, delay: d});
  pin(HAMMER, 2.1, 0.13, 'hammer pin', [0, 0, 5.2], 0.7);
  pin(TRIG, 2.1, 0.13, 'trigger pin', [0, 0, 5.6], 0.75);
  pin(SEAR, 2.1, 0.12, 'sear pin', [0, 0, 6.0], 0.8);
  const dome = new THREE.SphereGeometry(0.25, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1);
  for (const [p, n] of [[PIN_F, 'front'], [PIN_R, 'rear']]) {
    const m = pin(p, 3.25, 0.2, `trigger plate pin, ${n}`, [0, 1.2, 6.6], n === 'front' ? 0.85 : 0.9);
    // domed pin ends standing proud of the receiver walls
    for (const s of [1, -1]) m.add(mesh(dome, M.brass, 0, 0, s * 1.6, s * Math.PI / 2, 0, 0));
  }
  return A;
}
