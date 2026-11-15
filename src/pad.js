// 8. Recoil pad: black ribbed rubber pad, spacer plate, 2 mounting screws. Built in a frame
// aligned to the butt line (local +X points into the stock, local +Y toward the heel).
import {THREE, mesh, group, rpoly, extrudeXY, rbox, screwX, merge, at} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {HEEL, TOE, widthAt} from './stock.js';

export function buildPad() {
  const A = new Asm('pad', 'Recoil pad', {offset: [-21, -1, 0], delay: 0});
  const M = A.M;
  const mid = [(HEEL[0] + TOE[0]) / 2, (HEEL[1] + TOE[1]) / 2];
  const len = Math.hypot(HEEL[0] - TOE[0], HEEL[1] - TOE[1]);
  const frame = group(mid[0] - 0.03, mid[1], 0);
  frame.rotation.z = Math.atan2(TOE[0] - HEEL[0], HEEL[1] - TOE[1]); // tilt of the butt line
  A.group.add(frame);
  const hl = len / 2;
  const W = 3.3 * widthAt(-42) + 0.05;

  // --- spacer plate
  const spacer = mesh(rbox(0.26, len + 0.04, W, 0.08), M.polymer, -0.13, 0, 0);
  A.add(spacer, 'spacer plate', {parent: frame, ex: [3.2, 0, 0], delay: 0.3});

  // --- pad body: slightly convex back, rounded heel and toe
  const ps = rpoly(
    [
      [-0.26, -hl, 0.15],
      [-2.0, -hl - 0.12, 0.9],
      [-2.6, -hl + 3.0, 0.4],
      [-2.66, hl - 3.0, 0.4],
      [-2.0, hl + 0.1, 0.9],
      [-0.26, hl, 0.15],
    ],
    0.2,
  );
  const body = group(0, 0, 0, mesh(extrudeXY(ps, W, 0.42, 32, {bevelSegments: 4}), M.rubber));
  // back face ribs
  const ribs = [];
  for (let k = -5; k <= 5; k++) ribs.push(at(rbox(0.16, 0.42, W - 1.0, 0.07), -2.7, k * 1.08, 0));
  // side ribs, both sides
  for (let k = -4; k <= 4; k++) for (const s of [1, -1]) ribs.push(at(rbox(1.45, 0.3, 0.1, 0.04), -1.3, k * 1.15, s * (W / 2 - 0.02)));
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
