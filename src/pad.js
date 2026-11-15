// 8. Recoil pad: black ribbed rubber pad, spacer plate, 2 mounting screws. Built in a frame
// aligned to the butt line (local +X points into the stock, local +Y toward the heel).
import {THREE, mesh, group, extrudeYZ, rbox, screwX, merge, at} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {HEEL, TOE, BUTT_W, SE, ovalShape} from './stock.js';

export function buildPad() {
  const A = new Asm('pad', 'Recoil pad', {offset: [-21, -1, 0], delay: 0});
  const M = A.M;
  const mid = [(HEEL[0] + TOE[0]) / 2, (HEEL[1] + TOE[1]) / 2];
  const len = Math.hypot(HEEL[0] - TOE[0], HEEL[1] - TOE[1]);
  const frame = group(mid[0], mid[1], 0); // on the butt plane: flush, no gap
  frame.rotation.z = Math.atan2(TOE[0] - HEEL[0], HEEL[1] - TOE[1]); // tilt of the butt line
  A.group.add(frame);
  const hl = len / 2;
  const W = BUTT_W; // the butt outline is an oval, half-height hl, half-width W
  const across = (y, a, w) => w * Math.max(0, 1 - Math.abs(y / a) ** SE) ** (1 / SE); // half-width at y

  // --- spacer plate: the stock's own last ring (64 points), 2.6 mm thick, square edges so the wood,
  // spacer and pad read as one surface
  const NR = 64;
  const spacer = mesh(new THREE.ExtrudeGeometry(ovalShape(hl, W, NR), {depth: 0.26, bevelEnabled: false}).rotateY(Math.PI / 2).translate(-0.26, 0, 0), M.polymer);
  A.add(spacer, 'spacer plate', {parent: frame, ex: [3.2, 0, 0], delay: 0.3});

  // --- pad body: the same outline, 2.4 cm deep behind the spacer, every back edge (heel and toe too)
  // rounded 5 mm. It runs 5 mm on into the spacer and wood, so its front bevel is buried and its full
  // outline starts exactly at the spacer's back face.
  const BEV = 0.5;
  const body = group(0, 0, 0, mesh(extrudeYZ(ovalShape(hl, W, NR), 2.4 + BEV, BEV, 72).translate(-2.66, 0, 0), M.rubber));
  // back face ribs, each as wide as the flat back at its height
  const ribs = [];
  for (let k = -5; k <= 5; k++) ribs.push(at(rbox(0.16, 0.42, 1.8 * across(k * 1.08, hl - BEV, W - BEV), 0.07), -2.7, k * 1.08, 0));
  // side ribs, both sides, on the outline
  for (let k = -4; k <= 4; k++) for (const s of [1, -1]) ribs.push(at(rbox(1.3, 0.3, 0.1, 0.04), -1.46, k * 1.15, s * (across(k * 1.15, hl, W) - 0.02)));
  body.add(mesh(merge(ribs), M.rubber));
  // screw access slits on the back
  for (const y of [4.6, -4.6]) body.add(mesh(rbox(0.05, 0.9, 0.12, 0.02), M.polymer, -2.73, y, 0));
  A.add(body, 'recoil pad', {parent: frame});

  // --- two mounting screws: heads sit inside the rubber, shanks bite the stock
  for (const [i, y] of [[0, 4.6], [1, -4.6]]) {
    const scr = group(-1.9, y, 0, mesh(screwX(4.4, 0.36, 0.17, 0.28, 18), M.steelBright));
    scr.add(mesh(rbox(0.06, 0.6, 0.1, 0.02), M.steelInner, -0.29, 0, 0));
    scr.add(mesh(rbox(0.06, 0.1, 0.6, 0.02), M.steelInner, -0.29, 0, 0));
    A.add(scr, 'pad screw', {parent: frame, ex: [5.2, 0, 0], delay: 0.5 + i * 0.1});
  }
  return A;
}
