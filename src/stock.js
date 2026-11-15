// 7. Stock: walnut buttstock with a pistol-grip curve, checkered grip panels both sides, grip cap,
// sling swivel stud, and the long stock bolt with flat and lock washers inside.
import {THREE, rcyl, mesh, group, screwX, latheX, rodX, mergeVertices} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {walnut, diamondNormal} from './lib/materials.js';

export const HEEL = [-41.65, -4.45];
export const TOE = [-42.75, -18.45];
const DEPTH = 3.3;
/** Width multiplier along the stock: slim wrist, broad butt. */
export const widthAt = (x) => {
  const t = Math.min(1, Math.max(0, (-27 - x) / 12));
  return 0.93 + 0.37 * t * t * (3 - 2 * t);
};

// --- lofted buttstock. Each station is the segment from the comb point T(u) to the belly point
// B(u) (u 0 at the receiver joint, 1 at the butt) swept into an oval (superellipse) ring of
// half-width widthAt. At the joint T and B are the receiver's rear top and bottom, so the heights match.
const JOINT = [-20.5, 0.42, -5.0]; // receiver rear: x, top (wall line -0.2 + crown 0.62), bottom
export const SE = 2.4; // cross-section exponent: an oval, a little fuller than an ellipse
const FIL = 0; // no rolled edge where the wood meets the pad: spacer and pad continue the butt outline flush
// belly: the pistol-grip curve behind the trigger guard, then one smooth line to the toe (no notch)
const BP = new THREE.SplineCurve(
  [[-20.5, -5.0], [-21.3, -6.0], [-22.6, -8.4], [-24.4, -11.4], [-26.2, -13.2], [-28.4, -14.0], [-31.5, -14.6], [-35.5, -15.8], [-39.5, -17.3], [-42.75, -18.45]].map(([x, y]) => new THREE.Vector2(x, y)),
).getSpacedPoints(600);
export function bellyY(x) {
  for (let i = 1; i < BP.length; i++) if (BP[i].x <= x) return BP[i].y + ((BP[i - 1].y - BP[i].y) * (x - BP[i].x)) / (BP[i - 1].x - BP[i].x || 1);
  return BP[BP.length - 1].y;
}
/** Station u: comb point (xt, yt), belly point (xb, yb), half-width w. The comb is one straight line. */
function station(u) {
  const xt = JOINT[0] + u * (HEEL[0] - JOINT[0]);
  const yt = JOINT[1] + u * (HEEL[1] - JOINT[1]);
  const xb = JOINT[0] + u * (TOE[0] - JOINT[0]);
  return {xt, yt, xb, yb: bellyY(xb), w: (DEPTH / 2) * widthAt((xt + xb) / 2)};
}
/** Unit oval point at angle th: [along comb-belly (1 = comb), across (z)]. */
export const ovalPt = (th) => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [Math.sign(c) * Math.abs(c) ** (2 / SE), Math.sign(s) * Math.abs(s) ** (2 / SE)];
};
/** Half-width of the butt outline (the pad follows it). */
export const BUTT_W = station(1).w;
/** Oval outline in (z, y), half-height a, half-width w, for extrudeYZ. */
export function ovalShape(a, w, n = 72) {
  const s = new THREE.Shape();
  for (let j = 0; j < n; j++) {
    const [sy, sz] = ovalPt((j / n) * Math.PI * 2);
    j ? s.lineTo(w * sz, a * sy) : s.moveTo(w * sz, a * sy);
  }
  s.closePath();
  return s;
}

function stockGeo() {
  const NR = 64;
  const NM = 96;
  const NF = 7;
  const uf = 1 - 0.4 / 21.7; // the last 4 mm carry the rounded edge
  const us = [];
  for (let i = 0; i <= NM; i++) us.push([(uf * i) / NM, 0]);
  for (let k = 1; k <= NF; k++) us.push([uf + ((1 - uf) * k) / NF, FIL * (1 - Math.sqrt(1 - (k / NF) ** 2))]);
  const pos = [];
  const idx = [];
  const rings = [];
  for (const [u, d] of us) {
    const r = station(u);
    const m = [(r.xt + r.xb) / 2, (r.yt + r.yb) / 2];
    const e = [(r.xt - r.xb) / 2, (r.yt - r.yb) / 2];
    const ka = 1 - d / Math.hypot(e[0], e[1]);
    const ring = [];
    for (let j = 0; j < NR; j++) {
      const [sy, sz] = ovalPt((j / NR) * Math.PI * 2);
      ring.push([m[0] + e[0] * ka * sy, m[1] + e[1] * ka * sy, (r.w - d) * sz]);
    }
    rings.push({m, ring});
  }
  rings.forEach(({ring}) => ring.forEach((p) => pos.push(...p)));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < NR; j++) {
      const a = i * NR + j;
      const b = (i + 1) * NR + j;
      const c = i * NR + ((j + 1) % NR);
      const dd = (i + 1) * NR + ((j + 1) % NR);
      idx.push(a, b, c, b, dd, c);
    }
  // flat end caps with their own vertices (the joint face is hidden against the receiver)
  for (const [k, front] of [[0, true], [rings.length - 1, false]]) {
    const {m, ring} = rings[k];
    const c0 = pos.length / 3;
    pos.push(m[0], m[1], 0);
    ring.forEach((p) => pos.push(...p));
    for (let j = 0; j < NR; j++) {
      const p = c0 + 1 + j;
      const q = c0 + 1 + ((j + 1) % NR);
      front ? idx.push(c0, p, q) : idx.push(c0, q, p);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Stock surface |z| at side-view point (x, y) (away from the butt edge): solves for the station. */
function surfZ(x, y) {
  const du = (HEEL[0] + TOE[0]) / 2 - JOINT[0];
  let u = (x - JOINT[0]) / du;
  let r;
  let t;
  for (let it = 0; it < 8; it++) {
    r = station(u);
    t = (y - r.yb) / (r.yt - r.yb);
    u += (x - (r.xb + t * (r.xt - r.xb))) / du;
  }
  return r.w * Math.max(0, 1 - Math.abs(2 * t - 1) ** SE) ** (1 / SE);
}
/** Split every triangle of a non-indexed geometry into 4 (positions and uvs). */
function subdivide(g) {
  const P = g.attributes.position.array;
  const U = g.attributes.uv.array;
  const p = [];
  const uv = [];
  for (let f = 0; f < P.length / 9; f++) {
    const v = [0, 1, 2].map((k) => [P[f * 9 + k * 3], P[f * 9 + k * 3 + 1], P[f * 9 + k * 3 + 2], U[f * 6 + k * 2], U[f * 6 + k * 2 + 1]]);
    const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);
    const [a, b, c] = v;
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    for (const tri of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) for (const q of tri) p.push(q[0], q[1], q[2]), uv.push(q[3], q[4]);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return o;
}
/** Checkered panel draped on the curved side of the grip, offset 0.15 mm, one side (+z or -z). */
function panelGeo(shape, side) {
  let g = new THREE.ShapeGeometry(shape, 24).toNonIndexed();
  for (let k = 0; k < 3; k++) g = subdivide(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, side * (surfZ(p.getX(i), p.getY(i)) + 0.015));
  if (side < 0) {
    // mirrored: swap two corners of each triangle so the faces still point out
    for (const {array: A, itemSize: n} of [p, g.attributes.uv])
      for (let f = 0; f < A.length; f += 3 * n)
        for (let c = 0; c < n; c++) [A[f + n + c], A[f + 2 * n + c]] = [A[f + 2 * n + c], A[f + n + c]];
  }
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

export function buildStock() {
  const A = new Asm('stock', 'Stock', {offset: [-12, -1, 0], delay: 0.2});
  const M = A.M;

  // --- buttstock: lofted oval sections, straight comb, pistol grip, smooth belly
  const wood = mesh(stockGeo(), M.wood());
  const stock = group(0, 0, 0, wood);

  // --- checkered grip panels: pointed fleur outline, diamond checkering as bump
  const tex = diamondNormal().clone(); // checkering as a normal map: 4 diamonds per tile, ~1.8 mm pitch
  tex.repeat.set(1.4, 1.4);
  tex.rotation = 0.35;
  const pm = walnut({seed: 0, dark: 0.36});
  pm.normalMap = tex;
  pm.normalScale.set(1.1, 1.1);
  pm.side = THREE.DoubleSide;
  pm.roughness = 0.78;
  pm.clearcoat = 0; // cut checkering is matte: with the oil's clearcoat it read as a grey glassy patch side-on
  pm.sheen = 0.1;
  // the panel: a pointed lens that follows the grip curve, 0.9 cm in from the belly line and up to
  // 3.6 cm deep at its middle, from just behind the receiver to where the grip meets the belly
  const panel = new THREE.Shape();
  const edge = (x, off) => {
    const s = (bellyY(x + 0.2) - bellyY(x - 0.2)) / 0.4;
    const n = Math.hypot(s, 1);
    return [x - (s / n) * off, bellyY(x) + off / n];
  };
  const NPN = 14;
  const front = [];
  const rear = [];
  for (let k = 0; k <= NPN; k++) {
    const x = -21.5 - (5.6 * k) / NPN;
    const lens = Math.sin((Math.PI * k) / NPN) ** 0.6;
    front.push(edge(x, 0.9 + 0.25 * (1 - lens)));
    rear.push(edge(x, 0.9 + 0.25 * (1 - lens) + 2.7 * lens));
  }
  [...front, ...rear.reverse().slice(1, -1)].forEach(([x, y], i) => (i ? panel.lineTo(x, y) : panel.moveTo(x, y)));
  panel.closePath();
  stock.add(mesh(panelGeo(panel, 1), pm), mesh(panelGeo(panel, -1), pm));
  // border line around each panel, on the same surface
  const border = new THREE.MeshStandardMaterial({color: 0x1a0d06, roughness: 0.6});
  for (const s of [1, -1]) {
    const bpts = panel.getPoints(24).map((v) => new THREE.Vector3(v.x, v.y, s * (surfZ(v.x, v.y) + 0.02)));
    stock.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts, true), 220, 0.025, 4, true), border));
  }
  A.add(stock, 'buttstock');
  const slope = (x) => (bellyY(x + 0.2) - bellyY(x - 0.2)) / 0.4;

  // --- grip cap: a low oval button set into the belly where the grip ends
  const capX = -27.4;
  const capG = group(capX, bellyY(capX) + 0.1, 0, mesh(new THREE.SphereGeometry(1, 32, 16).scale(1.5, 0.3, 0.6), M.polymer));
  capG.rotation.z = Math.atan(slope(capX));
  capG.add(mesh(rcyl(0.3, 0.3, 0.06, 24), M.steelSatin, 0, -0.29, 0));
  A.add(capG, 'grip cap', {ex: [0, -2.4, 0], delay: 0.3});

  // --- sling swivel stud on the belly, square to it
  const studX = -38.6;
  const stud = group(studX, bellyY(studX) + 0.15, 0);
  stud.rotation.z = Math.atan(slope(studX));
  stud.add(mesh(rcyl(0.22, 0.32, 0.9, 20), M.steelSatin, 0, -0.35, 0));
  stud.add(mesh(new THREE.TorusGeometry(0.42, 0.1, 10, 24), M.steelSatin, 0, -1.05, 0));
  A.add(stud, 'swivel stud', {ex: [0, -3.0, 0], delay: 0.4});

  // --- stock bolt, flat washer, lock washer (inside the wood, revealed on explode)
  const ang = Math.atan2(6.4, 21);
  const H = [-41.5, -9.0];
  const bolt = group(H[0], H[1], 0, mesh(screwX(21.6, 0.62, 0.32, 0.6, 40), M.steelBright));
  // hex head
  bolt.add(mesh(rcyl(0.66, 0.66, 0.55, 6), M.steelBright, -0.3, 0, 0, 0, 0, Math.PI / 2));
  bolt.rotation.z = ang;
  A.add(bolt, 'stock bolt', {ex: [-4, -11.5, 0], delay: 0.1});
  const washer = group(H[0], H[1], 0, mesh(latheX([[0, 0.34], [0, 0.95], [0.12, 0.95], [0.12, 0.34], [0, 0.34]], 32), M.steelSatin));
  washer.rotation.z = ang;
  A.add(washer, 'washer', {ex: [-8.2, -11.5, 0], delay: 0.15});
  const lockw = group(H[0], H[1], 0, mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 24), M.steelSatin, 0.2, 0, 0, 0, Math.PI / 2, 0));
  lockw.rotation.z = ang;
  A.add(lockw, 'lock washer', {ex: [-7.1, -11.5, 0], delay: 0.2});
  // guide sleeve the bolt passes through at the receiver end
  const sleeve = mesh(rodX(-21.6, -20.55, 0.42, 0.06, 24), M.steelInner, 0, -2.6, 0);
  A.add(sleeve, 'bolt sleeve', {ex: [3.5, -4.0, 0], delay: 0.25});
  return A;
}
