// 2. Magazine: tube under the barrel, long coil spring (real helix, 46 turns), follower cup,
// spring retainer, knurled end cap with sling swivel.
import {THREE, rbox, mesh, group, latheX, tubeX, threadPts, spring, knurlX, merge, at} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {MAG_Y} from './barrel.js';

export function buildMagazine() {
  const A = new Asm('magazine', 'Magazine', {offset: [18, -9.5, 0], delay: 0.7});
  const M = A.M;
  const ro = 1.1;
  const ri = 0.98;

  // --- tube with threads at both ends and retainer dimples
  const tp = [
    [-0.6, ri + 0.04],
    [-0.6, ro - 0.1],
    ...threadPts(-0.55, 0.35, ro - 0.02, 0.06, 8),
    [0.5, ro],
    [44.9, ro],
    ...threadPts(45.0, 45.95, ro - 0.02, 0.06, 9),
    [46.0, ro - 0.08],
    [46.0, ri + 0.04],
    [45.9, ri],
    [-0.5, ri],
    [-0.6, ri + 0.04],
  ];
  const tube = group(0, MAG_Y, 0, mesh(latheX(tp, 56), M.steel));
  const dimples = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    dimples.push(at(new THREE.SphereGeometry(0.09, 10, 8), 44.1, Math.sin(a) * (ro - 0.03), Math.cos(a) * (ro - 0.03)));
  }
  tube.add(mesh(merge(dimples), M.steelInner));
  // inner wall shading so the bore of the tube reads dark
  tube.add(mesh(tubeX(-0.4, 45.8, ri + 0.002, ri - 0.01, 0.005, 40), M.bore));
  A.add(tube, 'magazine tube');

  // --- magazine spring: real helix, closed ground ends, stretches when fanned out
  const L = 40.9;
  const sp = mesh(spring(L, 0.78, 0.085, 46, {seg: 20, radial: 6}), M.brass, 2.7, MAG_Y, 0);
  A.add(sp, 'magazine spring', {ex: [0, -3.4, 0], scaleX: 1.22, delay: 0.1});

  // --- follower: brass cup, domed shell face, spring seat
  const fol = latheX(
    [
      [0.55, 0],
      [0.55, 0.42],
      [0.66, 0.74],
      [0.86, 0.9],
      [1.05, 0.935],
      [2.45, 0.935],
      [2.6, 0.9],
      [2.7, 0.82],
      [2.7, 0.7],
      [2.55, 0.66],
      [1.7, 0.64],
      [1.6, 0.5],
      [1.6, 0],
    ],
    40,
  );
  const folG = group(0, MAG_Y, 0, mesh(fol, M.brass));
  // anti-tilt ring groove
  folG.add(mesh(new THREE.TorusGeometry(0.94, 0.025, 8, 40), M.steelInner, 1.9, 0, 0, 0, Math.PI / 2, 0));
  A.add(folG, 'follower', {ex: [-2.5, -3.4, 0], delay: 0.15});

  // --- spring retainer: steel cup with four detent tabs
  const ret = latheX([[43.6, 0.3], [43.6, 0.9], [43.7, 0.96], [44.8, 0.96], [44.9, 0.9], [44.9, 0.5], [44.0, 0.5], [44.0, 0.3], [43.6, 0.3]], 36);
  const retG = group(0, MAG_Y, 0, mesh(ret, M.steelSatin));
  const tabs = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    tabs.push(at(rbox(0.5, 0.08, 0.22, 0.03), 44.2, Math.sin(a) * 0.97, Math.cos(a) * 0.97, a, 0, 0));
  }
  retG.add(mesh(merge(tabs), M.steelSatin));
  A.add(retG, 'spring retainer', {ex: [10.5, -3.4, 0], delay: 0.25});

  // --- magazine cap: knurled skirt, domed nose, swivel stud and loop
  const capG = group(0, MAG_Y, 0);
  capG.add(mesh(knurlX(46.05, 48.4, 1.34, 60, 0.05, 0.08), M.steelSatin));
  capG.add(mesh(latheX([[48.35, 1.3], [48.6, 1.3], [49.0, 1.18], [49.3, 0.95], [49.45, 0.6], [49.5, 0]], 48), M.steel));
  capG.add(mesh(latheX([[45.95, 1.12], [45.95, 1.26], [46.1, 1.3], [46.1, 1.12]], 48), M.steelInner));
  capG.add(mesh(latheX([[49.45, 0.32], [49.85, 0.3], [50.0, 0.25], [50.0, 0]], 20), M.steelSatin));
  const loop = mesh(new THREE.TorusGeometry(0.62, 0.09, 10, 32), M.steelSatin, 50.55, 0, 0, Math.PI / 2, 0, 0);
  capG.add(loop);
  A.add(capG, 'magazine cap', {ex: [9.5, 0, 0], delay: 0.3});

  // --- magazine plug (limits capacity), sits behind the retainer
  const plug = mesh(latheX([[33.0, 0], [33.0, 0.5], [33.1, 0.6], [42.9, 0.6], [43.0, 0.5], [43.0, 0]], 24), M.polymer, 0, MAG_Y, 0);
  A.add(plug, 'magazine plug', {ex: [5, -6.2, 0], delay: 0.2});
  return A;
}
