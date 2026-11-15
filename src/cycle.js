// PUMP CYCLE: one parameter c (0..1) drives a keyframed, choreographed animation. It is not a
// physics or mechanism simulation: every channel below is a hand-timed curve of c.
// 0.00 closed · 0.35 forend, action bars and bolt back · 0.40 spent shell leaves the ejection
// port on an arc, tumbles, lands and fades · 0.55 a fresh shell rises on the elevator ·
// 0.60-1.00 forend forward, the bolt carries the shell in, closed.
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
    elev: sm((c - 0.5) / 0.08) * (1 - sm((c - 0.62) / 0.1)),
  };
}

export const TICKS = [
  {c: 0, name: 'Closed', part: 'bolt'},
  {c: +cAtStroke(LOCK_S, false).toFixed(3), name: 'Unlock', part: 'locking block'},
  {c: 0.4, name: 'Eject', part: 'ejector'},
  {c: 0.55, name: 'Lift', part: 'elevator'},
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
  // spent flight: kicked at 0.385 so at 0.40 it is just clear of the port, lands at 0.52
  const T0 = 0.385;
  const T1 = 0.52;
  const p0 = new THREE.Vector3(face(T0) + S_LEN / 2, 0.2, 0.4);
  const yLand = FLOOR_Y + 1.0; // lying on its side, gun group sits at y 0
  const peak = 3.5;
  // y(u) = y0 + v u - g u^2 with a peak `peak` above y0 and y(1) = yLand
  const dy = yLand - p0.y;
  const gk = (2 * peak - dy + 2 * Math.sqrt(peak * (peak - dy))) / 1;
  const vk = dy + gk;
  const land = new THREE.Vector3(p0.x - 7, yLand, p0.z + 21);
  const euler = new THREE.Euler(0, 0, 0, 'YZX');

  /** visible: false hides both (closed and idle, or exploded). */
  function pose(c, visible = true) {
    group.visible = visible;
    if (!visible) return;
    // --- spent shell: extracted with the bolt, kicked out of the port, tumbles, lands, fades
    if (c < T0) {
      spent.visible = true;
      spent.position.set(face(c) + S_LEN / 2, 0, 0);
      spent.rotation.set(0, 0, 0);
      setOpacity(spent, 1);
    } else if (c < 0.74) {
      spent.visible = true;
      const u = clamp01((c - T0) / (T1 - T0));
      euler.set(9 * u, -1.1 * u, 3 * Math.PI * u);
      if (c < T1) {
        // sideways kick first (ease-out across), ballistic in height
        spent.position.set(p0.x + (land.x - p0.x) * u, p0.y + vk * u - gk * u * u, p0.z + (land.z - p0.z) * u * (2 - u));
      } else {
        // a small bounce and roll, then rest
        const v = (c - T1) / 0.22;
        const b = Math.max(0, Math.sin(Math.min(1, v / 0.25) * Math.PI)) * 1.1 * (1 - v);
        spent.position.set(land.x - 1.2 * sm(v * 2), yLand + b, land.z + 2.4 * sm(v * 2));
        euler.x = 9 + 2.6 * sm(v * 2); // roll about its own axis only, it lies flat
      }
      spent.rotation.copy(euler);
      setOpacity(spent, 1 - sm((c - 0.6) / 0.12));
    } else spent.visible = false;

    // --- fresh shell: out of the magazine onto the elevator, lifted to the bore, fed by the bolt
    fresh.visible = c >= 0.38;
    if (!fresh.visible) return;
    const rear = -9.4; // where the elevator holds it, just ahead of the bolt face at full stroke
    let x = 0.8 - (0.8 - rear) * sm((c - 0.4) / 0.1); // base slides back out of the tube
    const lift = sm((c - 0.5) / 0.08);
    const y = MAG_Y + 0.12 + (0 - MAG_Y - 0.12) * lift;
    x = Math.max(x, face(c)); // the bolt face pushes it home
    fresh.position.set(x + F_LEN / 2, y, 0);
    fresh.rotation.set(0, 0, -0.12 * Math.sin(Math.PI * lift));
    setOpacity(fresh, 1);
  }
  return {group, spent, fresh, pose};
}
