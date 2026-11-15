// 1. Barrel: long tube, threaded-look collar at the breech, ventilated rib, front and mid bead,
// barrel extension that the bolt locks into, and the barrel ring that rides over the magazine tube.
import {THREE, rcyl, mesh, group, latheX, tubeX, rbox, merge, at, threadPts, extrudeYZ} from './lib/geo.js';
import {Asm} from './lib/asm.js';

export const BORE = 0.925;
export const MAG_Y = -2.75;
export const MUZZLE = 71;
// outer radius of the barrel along x (used by the rib posts)
export function barrelR(x) {
  if (x < 4.4) return 1.62;
  if (x < 13) return 1.45;
  if (x < 30) return 1.45 + (1.08 - 1.45) * ((x - 13) / 17) ** 0.85;
  return 1.08 - (x - 30) * 0.001;
}

export function buildBarrel() {
  const A = new Asm('barrel', 'Barrel', {offset: [17, 10, 0], delay: 0.9});
  const M = A.M;

  // --- barrel tube: one lathe, collar with 14 thread grooves, chamber, taper, crown, bore
  const outer = [
    [0, BORE + 0.12],
    [0, 1.5],
    [0.12, 1.62],
    [0.4, 1.62],
    ...threadPts(0.5, 3.7, 1.64, 0.07, 14),
    [3.9, 1.62],
    [4.3, 1.62],
    [4.45, 1.52],
    [4.6, 1.45],
  ];
  // the taper is smooth: a point every 1.7 cm where it curves (13-30), every 10 cm on the straight
  for (const x of [5, 13, ...Array.from({length: 10}, (_, k) => 13 + (k + 1) * 1.7), 40, 50, 60, 70.4]) outer.push([x, barrelR(x)]);
  outer.push([70.85, barrelR(70.85)], [71, 0.99], [71, BORE + 0.05], [70.8, BORE], [0.2, BORE], [0, BORE + 0.12]);
  const tube = mesh(latheX(outer, 64), M.steel);
  const boreLiner = mesh(tubeX(0.3, 70.7, BORE + 0.002, BORE - 0.01, 0.01, 32), M.bore);
  const barrel = group(0, 0, 0, tube, boreLiner);
  // chamber flats and witness ring at the shank
  const ring = mesh(tubeX(4.62, 4.9, 1.47, 1.3, 0.03), M.steelSatin);
  barrel.add(ring);
  A.add(barrel, 'barrel', {xray: true}); // x-ray while the shot runs the bore

  // --- ventilated rib: flat matted strip on posts
  const ribGeo = [];
  const r0 = 6.6;
  const r1 = 70.7;
  const ribY = 1.86;
  const strip = rbox(r1 - r0, 0.17, 0.78, 0.05);
  // matting: shallow lengthwise grooves on the top
  ribGeo.push(at(strip, (r0 + r1) / 2, ribY, 0));
  for (let x = r0 + 1.2; x < r1 - 0.5; x += 3.6) {
    const top = ribY - 0.08;
    const base = barrelR(x) - 0.05;
    const h = top - base;
    ribGeo.push(at(rbox(0.55, h, 0.5, 0.06), x, base + h / 2, 0));
  }
  // front ramp
  ribGeo.push(at(rbox(1.2, 0.35, 0.5, 0.08), r0 + 0.4, 1.62, 0, 0, 0, -0.35));
  const rib = mesh(merge(ribGeo), M.steelSatin);
  const matte = mesh(rbox(r1 - r0 - 0.3, 0.02, 0.6, 0.008), M.rib, (r0 + r1) / 2, ribY + 0.088, 0);
  matte.material.bumpMap.repeat.set(1, 6);
  const ribG = group(0, 0, 0, rib, matte);
  A.add(ribG, 'ventilated rib', {ex: [0, 2.2, 0], delay: 0.2});

  // --- beads (brass)
  const bead = group(70.25, ribY + 0.09, 0, mesh(new THREE.SphereGeometry(0.2, 24, 16), M.brass, 0, 0.18, 0), mesh(rcyl(0.11, 0.13, 0.2, 16), M.brass, 0, 0.02, 0));
  A.add(bead, 'front bead', {ex: [1.5, 3.4, 0], delay: 0.5});
  const mid = group(38.5, ribY + 0.09, 0, mesh(new THREE.SphereGeometry(0.12, 20, 12), M.brass, 0, 0.1, 0), mesh(rcyl(0.07, 0.08, 0.12, 12), M.brass, 0, 0.01, 0));
  A.add(mid, 'mid bead', {ex: [0, 3.0, 0], delay: 0.6});

  // --- barrel extension: hardened ring the bolt locks into, sits inside the receiver front
  const ext = [
    [-3.2, 1.12],
    [-3.2, 1.24],
    [-3.1, 1.3],
    [-0.1, 1.3],
    [0, 1.24],
    [0, 1.14],
    [-2.6, 1.12],
    [-3.2, 1.12],
  ];
  const extG = group(0, 0, 0);
  // a hood over the top and the left side: open underneath (feed throat) and on the port side (ejection)
  extG.add(mesh(latheX(ext, 48, Math.PI, Math.PI / 2 + 0.6), M.steelSatin));
  // locking recess shoulder and the extractor notch
  extG.add(mesh(rbox(0.6, 0.4, 0.9, 0.06), M.steelSatin, -2.1, 1.12, 0));
  extG.add(mesh(rbox(1.2, 0.3, 0.3, 0.05), M.steelInner, -0.8, 0, -1.18));
  A.add(extG, 'barrel extension', {ex: [-6, 0.8, 0], delay: 0.3});

  // --- barrel ring (magazine hanger): webbed loop around the barrel and the magazine tube end
  const R1 = barrelR(44) + 0.28;
  const R2 = 1.42;
  const s = new THREE.Shape();
  s.moveTo(R1, 0);
  s.absarc(0, 0, R1, 0, Math.PI, false);
  s.lineTo(-R2, MAG_Y);
  s.absarc(0, MAG_Y, R2, Math.PI, Math.PI * 2, false);
  s.lineTo(R1, 0);
  s.holes.push(new THREE.Path().absarc(0, 0, barrelR(44) + 0.01, 0, Math.PI * 2, true));
  s.holes.push(new THREE.Path().absarc(0, MAG_Y, 1.14, 0, Math.PI * 2, true));
  // blued like the barrel: an extrusion has no lathe tangents, so no anisotropy (it streaked white)
  const band = M.steel.clone();
  band.onBeforeCompile = M.steel.onBeforeCompile;
  band.customProgramCacheKey = M.steel.customProgramCacheKey;
  band.anisotropy = 0;
  band.roughness = 0.4;
  const hanger = mesh(extrudeYZ(s, 2.6, 0.12, 40), band, 43.4, 0, 0);
  // weld fillet on top
  const fillet = mesh(rbox(2.0, 0.25, 0.9, 0.1), band, 44.7, R1 - 0.05, 0);
  const ringG = group(0, 0, 0, hanger, fillet);
  // 2 clamp screws on the camera-side web, slotted heads
  const yS = MAG_Y / 2;
  const zS = R1 + (R2 - R1) * (yS / MAG_Y);
  for (const x of [44.05, 45.35]) {
    ringG.add(mesh(rcyl(0.27, 0.27, 0.14, 24), band, x, yS, zS + 0.05, Math.PI / 2, 0, 0));
    ringG.add(mesh(rbox(0.07, 0.42, 0.06, 0.02), M.steelInner, x, yS, zS + 0.12));
  }
  A.add(ringG, 'barrel ring', {ex: [0, -2.4, 0], delay: 0.4});

  // --- choke tube at the muzzle (threads in, flush)
  const choke = latheX([[66.0, BORE - 0.005], [66.0, BORE + 0.02], [71.02, BORE + 0.02], [71.02, BORE - 0.06], [69.5, BORE - 0.07], [66.4, BORE - 0.005]], 40);
  const chokeG = group(0, 0, 0, mesh(choke, M.steelSatin), mesh(new THREE.TorusGeometry(BORE - 0.02, 0.025, 8, 40), M.steelBright, 71.0, 0, 0, 0, Math.PI / 2, 0));
  A.add(chokeG, 'choke tube', {ex: [7, 0, 0], delay: 0.7});
  return A;
}
