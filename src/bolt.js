// 5. Bolt: bolt block with locking block, extractor, firing pin and its spring and retaining pin;
// the slide plate under it; the forked elevator that lifts each shell up to the chamber.
import {THREE, rcyl, mesh, group, rbox, latheX, rodX, rpoly, hole, extrudeXY, extrudeXZ, spring, pinZ, merge, at} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {machiningTexture} from './lib/materials.js';
import {PUMP, BOLT_TRAVEL} from './forend.js';
import {PIN_F} from './receiver.js';

export function buildBolt() {
  const A = new Asm('bolt', 'Bolt', {offset: [-3, 9.5, 5.5], delay: 0.3, inner: true});
  const M = A.M;
  const ride = {pump: BOLT_TRAVEL, drive: 'b'}; // the bolt moves once the locking block has dropped

  // --- bolt block
  // fine machining lines: surface-ground flats on the block, turned rings on the head
  const mach = M.steelBright.clone();
  mach.onBeforeCompile = M.steelBright.onBeforeCompile;
  mach.customProgramCacheKey = M.steelBright.customProgramCacheKey;
  mach.bumpMap = machiningTexture().clone();
  mach.bumpMap.repeat.set(1, 0.22);
  mach.bumpScale = 0.8;
  const body = group(0, 0, 0);
  body.add(mesh(rbox(7.4, 1.9, 2.1, 0.3, 3), mach, -4.5, 0, 0));
  // bolt head: turned nose with recessed face and firing-pin hole
  body.add(
    mesh(
      latheX(
        [
          [-0.85, 0.2],
          [-0.85, 0.92],
          [-0.12, 0.92],
          [0, 0.82],
          [0, 0.45],
          [-0.12, 0.42],
          [-0.12, 0.16],
          [-0.02, 0.12],
          [-0.02, 0],
        ],
        48,
      ),
      mach,
    ),
  );
  // guide rails riding in the slide, and lightening flutes on each side
  const rails = [];
  for (const s of [1, -1]) {
    rails.push(at(rbox(6.2, 0.22, 0.25, 0.08), -4.6, -0.86, s * 0.82));
    rails.push(at(rbox(4.6, 0.16, 0.06, 0.03), -4.9, 0.25, s * 1.06));
    rails.push(at(rbox(4.6, 0.16, 0.06, 0.03), -4.9, -0.25, s * 1.06));
  }
  body.add(mesh(merge(rails), M.steelSatin));
  A.add(body, 'bolt', ride);

  // --- locking block: wedge in the top slot, rises into the barrel extension
  const lbS = rpoly([[-7.7, 0.55, 0.08], [-4.1, 0.55, 0.08], [-3.7, 0.98, 0.12], [-7.3, 0.98, 0.12]], 0.08);
  const lb = mesh(extrudeXY(lbS, 0.9, 0.06), M.steelSatin);
  A.add(lb, 'locking block', {...ride, drop: [-0.42, 'lock'], ex: [0, 2.2, 0], delay: 0.2});

  // --- extractor: claw on the right side of the bolt head, with plunger and spring
  const exS = rpoly([[-3.4, -0.18, 0.1], [-0.15, -0.18, 0.05], [0.22, 0.02, 0.06], [0.05, 0.25, 0.05], [-0.4, 0.2, 0.05], [-3.4, 0.2, 0.1]], 0.06);
  const extractor = mesh(extrudeXY(exS, 0.14, 0.035), M.steelBright, 0, 0.1, 1.12);
  A.add(extractor, 'extractor', {...ride, ex: [1.2, 0.6, 2.4], delay: 0.3});
  const exSpring = group(0, 0, 0, mesh(spring(1.0, 0.11, 0.025, 8, {seg: 14, radial: 5}), M.brass, -3.0, 0.1, 0.86));
  exSpring.add(mesh(rodX(-3.25, -2.85, 0.1, 0.03, 12), M.steelBright, 0, 0.1, 0.86));
  A.add(exSpring, 'extractor spring', {...ride, ex: [-1, 0.4, 3.8], delay: 0.35});

  // --- firing pin, its return spring and retaining pin
  const fp = group(0, 0, 0);
  fp.add(mesh(latheX([[-9.1, 0], [-9.1, 0.16], [-9.0, 0.19], [-7.6, 0.19], [-7.5, 0.24], [-7.0, 0.24], [-6.9, 0.14], [-0.4, 0.12], [-0.15, 0.06], [-0.05, 0]], 20), M.steelBright));
  A.add(fp, 'firing pin', {...ride, ex: [-7.5, 0, 0], delay: 0.1});
  const fps = mesh(spring(2.4, 0.2, 0.03, 14, {seg: 14, radial: 5}), M.brass, -6.85, 0, 0);
  A.add(fps, 'firing pin spring', {...ride, ex: [-6.0, -0.9, 0], scaleX: 1.35, delay: 0.15});
  const rp = mesh(rcyl(0.1, 0.1, 1.7, 14), M.brass, -7.85, 0.12, 0);
  A.add(rp, 'firing pin retaining pin', {...ride, ex: [0, 2.8, 0], delay: 0.25});

  // --- slide: plate under the bolt with a centre slot, side cheeks and action-bar notches
  const slideTop = rpoly([[-12.95, -1.1], [-1.2, -1.1], [-1.2, 1.1], [-12.95, 1.1]], 0.2);
  slideTop.holes.push(hole([[-12.4, -0.32], [-3.2, -0.32], [-3.2, 0.32], [-12.4, 0.32]], 0.3));
  slideTop.holes.push(hole([[-12.75, 0.82], [-11.15, 0.82], [-11.15, 1.0], [-12.75, 1.0]], 0.05));
  slideTop.holes.push(hole([[-12.75, -1.0], [-11.15, -1.0], [-11.15, -0.82], [-12.75, -0.82]], 0.05));
  const slide = group(0, 0, 0, mesh(extrudeXZ(slideTop, 0.55, 0.06, 20), M.steelSatin, 0, -1.25, 0));
  const cheek = extrudeXY(rpoly([[-10.4, -1.05], [-8.3, -1.05], [-8.3, 0.2], [-9.2, 0.75], [-10.4, 0.75]], 0.18), 0.42, 0.06);
  slide.add(mesh(cheek, M.steelSatin, 0, 0, 0.75), mesh(cheek, M.steelSatin, 0, 0, -0.75));
  // cam lug that lifts the locking block
  slide.add(mesh(rbox(1.1, 0.5, 0.8, 0.1), M.steelInner, -8.0, -0.82, 0));
  A.add(slide, 'slide', {pump: PUMP, ex: [-1, -3.0, 0], delay: 0.05}); // rides with the action bars

  // --- elevator: forked plate, pivots on the front pin, rear lifts on the pump stroke
  const el = group(PIN_F[0], PIN_F[1], 0);
  const forkTop = rpoly(
    [
      [0.5, -0.95, 0.25],
      [0.5, 0.95, 0.25],
      [-2.4, 0.95, 0.3],
      [-8.6, 0.98, 0.2],
      [-8.9, 0.75, 0.15],
      [-8.6, 0.35, 0.15],
      [-3.2, 0.32, 0.5],
      [-3.2, -0.32, 0.5],
      [-8.6, -0.35, 0.15],
      [-8.9, -0.75, 0.15],
      [-8.6, -0.98, 0.2],
      [-2.4, -0.95, 0.3],
    ],
    0.2,
  );
  const plate = mesh(extrudeXZ(forkTop, 0.18, 0.05, 16), M.steelSatin, 0, 0.72, 0);
  plate.rotation.z = 0.04;
  el.add(plate);
  // pivot tube and the two arms down to it
  el.add(mesh(pinZ(2.3, 0.3, 24), M.steelSatin));
  const arm = extrudeXY(rpoly([[-0.35, -0.2], [0.45, -0.2], [0.45, 0.82], [-0.85, 0.82]], 0.15), 0.18, 0.04);
  el.add(mesh(arm, M.steelSatin, 0, 0, 0.98), mesh(arm, M.steelSatin, 0, 0, -0.98));
  // upturned tips that cradle the shell rim
  const tip = rbox(0.5, 0.45, 0.6, 0.12);
  el.add(mesh(tip, M.steelSatin, -8.6, 0.92, 0.67), mesh(tip, M.steelSatin, -8.6, 0.92, -0.67));
  // carrier dog and its pin on the left
  const dog = extrudeXY(rpoly([[-1.4, -0.15], [0.3, -0.15], [0.5, 0.3], [-1.2, 0.35]], 0.12), 0.16, 0.04);
  el.add(mesh(dog, M.steelBright, -1.0, 0.25, -1.12));
  el.add(mesh(pinZ(0.5, 0.08, 12), M.brass, -0.4, 0.3, -1.12));
  A.add(el, 'elevator', {pumpRot: [0, 0, -0.3], drive: 'elev', ex: [0, -6.8, 1.0], rot: [-0.55, 0, 0], delay: 0.4});
  return A;
}
