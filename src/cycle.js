// PUMP CYCLE: one parameter c (0..1) drives a keyframed, choreographed animation. It is not a
// physics or mechanism simulation: every channel below is a hand-timed curve of c.
// 0.00 closed · 0.35 forend, action bars and bolt back (7.5 cm) · 0.43-0.46 spent shell slides out
// of the side port, then tumbles, lands and fades · 0.40-0.47 fresh shell backs out of the tube ·
// 0.47-0.55 it rises on the elevator to bore level · 0.60-1.00 forend forward, the bolt carries it in.
import * as THREE from 'three';
import {latheX} from './lib/geo.js';
import {MAG_Y} from './barrel.js';
import {BOLT_TRAVEL} from './forend.js';
import {FLOOR_Y} from './stage.js';

export const CYCLE_S = 1.2; // seconds per cycle at 1x
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const sm = (t) => ((t = clamp01(t)), t * t * (3 - 2 * t));

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

export const TICKS = [
  {c: 0, name: 'Closed', part: 'bolt'},
  {c: +cAtStroke(LOCK_S, false).toFixed(3), name: 'Unlock', part: 'locking block'},
  {c: 0.44, name: 'Eject', part: 'ejector'},
  {c: 0.52, name: 'Lift', part: 'elevator'},
  {c: 0.8, name: 'Feed', part: 'shell'},
  {c: 1, name: 'Locked', part: 'action bar lock'},
];
/** Index of the active tick: the last one reached. */
export const tickAt = (c) => TICKS.reduce((k, t, i) => (c >= t.c - 1e-4 ? i : k), 0);

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
const mats = () => ({
  brass: new THREE.MeshPhysicalMaterial({color: 0xc29a48, metalness: 1, roughness: 0.3, transparent: false}),
  primer: new THREE.MeshPhysicalMaterial({color: 0x9aa0a8, metalness: 1, roughness: 0.35}),
});
function shell(len, hull, hullMat, name) {
  const M = mats();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.x = -len / 2; // pivot at the shell's centre
  g.add(inner);
  inner.add(new THREE.Mesh(headGeo(), M.brass), new THREE.Mesh(hull, hullMat));
  const pr = new THREE.Mesh(latheX([[-0.012, 0], [-0.012, 0.22], [0.0, 0.26]], 24), M.primer);
  inner.add(pr);
  g.userData.part = name;
  g.userData.mats = [M.brass, M.primer, hullMat];
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.partRoot = g;
  });
  return g;
}

/** Spent and fresh shells, posed from c. Add `group` to the gun so it shares the gun's frame. */
export function createShells() {
  const spent = shell(S_LEN, spentHull(), new THREE.MeshPhysicalMaterial({color: 0x781616, roughness: 0.62, clearcoat: 0.1}), 'spent shell');
  const fresh = shell(F_LEN, freshHull(), new THREE.MeshPhysicalMaterial({color: 0xa31a1a, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3}), 'shell');
  const group = new THREE.Group();
  group.add(spent, fresh);
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
  // spent shell: the bolt carries it back (7.5 cm), then it slides sideways out of the port with no
  // yaw (the port is 10.9 cm long, the hull 6.6), dropping 3 mm to the port's mid-height, and only
  // tumbles once it is outside the wall at z 1.55. Lands at T1.
  const T0 = 0.425;
  const T1 = 0.55;
  const yPort = -0.3; // port spans y -1.35..0.75
  const yLand = FLOOR_Y + 1.0; // lying on its side, gun group sits at y 0
  const peak = 1.6; // height of the flat kick above the port line
  const dy = yLand - yPort;
  const gk = 2 * peak - dy + 2 * Math.sqrt(peak * (peak - dy));
  const vk = dy + gk;
  const xLand = face(T0) + S_LEN / 2 - 7;
  const zLand = 21;
  const euler = new THREE.Euler(0, 0, 0, 'YZX');

  // fresh shell waypoints (base x, centre y), all clear of the tube mouth (x -0.6, top y -1.65),
  // the barrel extension (x -3.2..0, hood only above y 0) and the bolt face (x -7.5 at full stroke):
  // 1 in the tube (0.8, MAG_Y) -> 2 out of the tube (-7.0: tip at -1.0, 4 mm behind the mouth, base
  // 5 mm ahead of the bolt) -> 3 up level with the bore, same x (tip rises into the open throat)
  // -> 4 forward, pushed by the bolt face into the chamber.
  const X_OUT = -7.0;

  /** visible: false hides both (closed and idle, or exploded). */
  function pose(c, visible = true) {
    group.visible = visible;
    if (!visible) return;
    if (c < T0) {
      spent.visible = true;
      spent.position.set(face(c) + S_LEN / 2, 0, 0);
      spent.rotation.set(0, 0, 0);
      setOpacity(spent, 1);
    } else if (c < 0.74) {
      spent.visible = true;
      const u = clamp01((c - T0) / (T1 - T0));
      const a = clamp01((u - 0.1) / 0.9); // ballistic phase starts once clear of the wall
      const w = sm((u - 0.12) / 0.88); // tumble builds after it is through the port
      euler.set(9 * w, -1.1 * w, 3 * Math.PI * w ** 1.6);
      if (c < T1) {
        const y = u < 0.1 ? yPort * sm(u / 0.05) : yPort + vk * a - gk * a * a;
        const x0 = face(c) + S_LEN / 2;
        spent.position.set(x0 + (xLand - x0) * u * u, y, zLand * u * (2 - u));
      } else {
        // a small bounce and roll, then rest
        const v = (c - T1) / 0.22;
        const b = Math.max(0, Math.sin(Math.min(1, v / 0.25) * Math.PI)) * 1.1 * (1 - v);
        spent.position.set(xLand - 1.2 * sm(v * 2), yLand + b, zLand + 2.4 * sm(v * 2));
        euler.x = 9 + 2.6 * sm(v * 2); // roll about its own axis only, it lies flat
      }
      spent.rotation.copy(euler);
      setOpacity(spent, 1 - sm((c - 0.62) / 0.12));
    } else spent.visible = false;

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
  return {group, spent, fresh, pose};
}
