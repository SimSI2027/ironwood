// 7. Stock: walnut buttstock with a pistol-grip curve, checkered grip panels both sides, grip cap,
// sling swivel stud, and the long stock bolt with flat and lock washers inside.
import {THREE, rcyl, mesh, group, extrudeXY, smooth, screwX, latheX, rpoly, rodX} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {walnut, checkerTexture} from './lib/materials.js';

export const HEEL = [-41.65, -4.45];
export const TOE = [-42.75, -18.45];
const DEPTH = 3.3;
/** Width multiplier along the stock: slim wrist, broad butt. */
export const widthAt = (x) => {
  const t = Math.min(1, Math.max(0, (-27 - x) / 12));
  return 0.93 + 0.37 * t * t * (3 - 2 * t);
};

function stockShape() {
  const s = new THREE.Shape();
  s.moveTo(-20.5, 0.38);
  s.lineTo(-23.0, 0.3);
  s.lineTo(-41.1, -4.3);
  s.quadraticCurveTo(-41.65, -4.42, -41.68, -4.9);
  s.lineTo(-42.72, -17.95);
  s.quadraticCurveTo(-42.78, -18.5, -42.2, -18.42);
  s.quadraticCurveTo(-36.2, -16.1, -32.2, -12.6);
  s.quadraticCurveTo(-31.0, -11.6, -30.3, -12.7);
  s.lineTo(-30.0, -13.6);
  s.quadraticCurveTo(-29.8, -13.9, -29.4, -13.85);
  s.lineTo(-26.3, -13.2);
  s.quadraticCurveTo(-25.6, -13.05, -25.2, -12.5);
  s.quadraticCurveTo(-22.9, -9.0, -21.7, -7.3);
  s.quadraticCurveTo(-21.0, -6.2, -20.5, -6.0);
  s.closePath();
  return s;
}

export function buildStock() {
  const A = new Asm('stock', 'Stock', {offset: [-12, -1, 0], delay: 0.2});
  const M = A.M;

  // --- buttstock: extruded side profile with a deep rounded bevel, widened toward the butt
  let g = extrudeXY(stockShape(), DEPTH, 0.78, 48, {bevelSegments: 6});
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * widthAt(p.getX(i)));
  g = smooth(g, 1e-3);
  const wood = mesh(g, M.walnut(0.0));
  const stock = group(0, 0, 0, wood);

  // --- checkered grip panels: pointed fleur outline, diamond checkering as bump
  const tex = checkerTexture();
  tex.repeat.set(2.8, 2.8);
  tex.rotation = 0.35;
  const pm = walnut({seed: 0, dark: 0.32, bump: tex, bumpScale: 2.5});
  pm.side = THREE.DoubleSide;
  pm.roughness = 0.7;
  const panel = rpoly(
    [
      [-22.3, -3.7, 0.2],
      [-24.7, -2.1, 0.02],
      [-25.3, -3.5, 0.2],
      [-28.2, -2.7, 0.02],
      [-27.2, -5.3, 0.3],
      [-28.5, -10.7, 0.4],
      [-26.1, -11.5, 0.4],
      [-23.4, -8.3, 0.3],
      [-22.0, -6.0, 0.3],
    ],
    0.2,
  );
  const pg = new THREE.ShapeGeometry(panel, 24);
  const zf = (DEPTH / 2) * widthAt(-24) + 0.012;
  stock.add(mesh(pg, pm, 0, 0, zf), mesh(pg, pm, 0, 0, -zf));
  // border line around each panel
  const border = new THREE.MeshStandardMaterial({color: 0x1a0d06, roughness: 0.6});
  const bpts = panel.getPoints(24).map((v) => new THREE.Vector3(v.x, v.y, 0));
  const bcurve = new THREE.CatmullRomCurve3(bpts, true);
  const bgeo = new THREE.TubeGeometry(bcurve, 220, 0.025, 4, true);
  stock.add(mesh(bgeo, border, 0, 0, zf + 0.004), mesh(bgeo, border, 0, 0, -zf - 0.004));
  A.add(stock, 'buttstock');

  // --- grip cap
  const capS = rpoly([[-1.85, -0.2, 0.2], [1.85, -0.2, 0.2], [1.85, 0.2, 0.15], [-1.85, 0.2, 0.15]], 0.15);
  const capG = group(-27.85, -13.6, 0, mesh(extrudeXY(capS, 2.55, 0.15), M.polymer));
  capG.rotation.z = 0.206;
  capG.add(mesh(rcyl(0.4, 0.4, 0.06, 24), M.steelSatin, 0, -0.2, 0));
  A.add(capG, 'grip cap', {ex: [0, -2.4, 0], delay: 0.3});

  // --- sling swivel stud on the belly
  const stud = group(-38.6, -16.4, 0);
  stud.rotation.z = -0.6;
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
