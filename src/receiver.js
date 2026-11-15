// 4. Receiver: rounded steel box. Two side walls with real cuts (ejection port on the right,
// 2 pin holes each side), a swept top with rounded shoulders and a matted flat, front and rear
// walls, ejector, left and right shell latches.
import {THREE, rcyl, mesh, group, latheX, rpoly, hole, circ, extrudeXY, extrudeYZ, sweepXY, rrectSection, rbox, merge, at} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {MAG_Y} from './barrel.js';

export const REC = {x0: -20.5, x1: 0, half: 1.55, wall: 0.3, top: 1.0, bottom: -5.3};
export const PIN_F = [-4.6, -4.35];
export const PIN_R = [-17.6, -4.35];
export const PORT = [-11.3, -3.0, -1.35, 0.75];

/** Path of the top edge: flat, then the rear slope down to the stock. */
function topPath() {
  const p = new THREE.Path();
  p.moveTo(0, REC.top);
  p.lineTo(-15.9, REC.top);
  p.quadraticCurveTo(-16.6, REC.top, -17.25, REC.top - 0.2);
  p.lineTo(-20.5, -0.2);
  return p.getPoints(12).map((v) => [v.x, v.y]).reverse(); // run toward +x so the left normal points up
}

export function buildReceiver() {
  const A = new Asm('receiver', 'Receiver', {offset: [0, 0, 0], delay: 0.5});
  const M = A.M;
  const {half, wall} = REC;

  // --- side walls
  const prof = () =>
    rpoly(
      [
        [0, REC.top, 0.04],
        [0, REC.bottom, 0.25],
        [-20.5, -5.0, 0.3],
        [-20.5, -0.2, 0.08],
        [-17.25, REC.top - 0.2, 0.3],
        [-16.6, REC.top, 0.3],
      ],
      0.1,
    );
  const right = prof();
  right.holes.push(hole([[PORT[0], PORT[2]], [PORT[1], PORT[2]], [PORT[1], PORT[3]], [PORT[0], PORT[3]]], 0.42));
  right.holes.push(circ(PIN_F[0], PIN_F[1], 0.21), circ(PIN_R[0], PIN_R[1], 0.21));
  const left = prof();
  left.holes.push(circ(PIN_F[0], PIN_F[1], 0.21), circ(PIN_R[0], PIN_R[1], 0.21));
  const zc = half - wall / 2;
  const body = group(0, 0, 0);
  body.add(mesh(extrudeXY(right, wall, 0.06, 28), M.steel, 0, 0, zc));
  body.add(mesh(extrudeXY(left, wall, 0.06, 28), M.steel, 0, 0, -zc));

  // --- swept top: rounded shoulders, flat crown
  const sec = [];
  const hz = half;
  const sh = 0.5; // shoulder radius
  const th = 0.62; // height of the top above the wall line
  sec.push([-0.02, -hz], [-0.02, hz]);
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    sec.push([th - sh + Math.sin(a) * sh, hz - sh + Math.cos(a) * sh]);
  }
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI / 2 + (k / 8) * (Math.PI / 2);
    sec.push([th - sh + Math.sin(a) * sh, -hz + sh + Math.cos(a) * sh]);
  }
  // built clockwise, reversed to counter-clockwise in (n, z) so the normals face out
  const topSec = sec.slice().reverse();
  const top = sweepXY(topSec, topPath());
  body.add(mesh(top, M.steel));
  // matted flat on the crown
  const flat = mesh(rbox(15.6, 0.03, 1.0, 0.01), M.rib, -8.2, REC.top + th + 0.006, 0);
  flat.material.bumpMap.repeat.set(1, 4);
  body.add(flat);

  // --- front wall: holes for the barrel extension and the magazine tube
  const fs = rpoly([[-half + wall, REC.bottom + 0.2], [half - wall, REC.bottom + 0.2], [half - wall, REC.top], [-half + wall, REC.top]], 0.05);
  fs.holes.push(circ(0, 0, 1.3), circ(0, MAG_Y, 1.38));
  body.add(mesh(extrudeYZ(fs, 0.6, 0.04, 40), M.steelSatin, -0.6, 0, 0));

  // --- rear wall with the stock bolt hole
  const rs = rpoly([[-half + wall, -4.9], [half - wall, -4.9], [half - wall, -0.35], [-half + wall, -0.35]], 0.05);
  rs.holes.push(circ(0, -2.6, 0.4));
  body.add(mesh(extrudeYZ(rs, 0.5, 0.04, 24), M.steelSatin, -20.45, 0, 0));
  // pin-hole bosses inside, so the holes read as real bores
  const boss = [];
  for (const p of [PIN_F, PIN_R]) for (const s of [1, -1]) boss.push(at(new THREE.TorusGeometry(0.25, 0.05, 8, 20), p[0], p[1], s * (half + 0.0)));
  body.add(mesh(merge(boss), M.steelSatin));
  // ejection-port edge relief: a bright worn lip around the cut
  const lip = rpoly([[PORT[0] - 0.08, PORT[2] - 0.08], [PORT[1] + 0.08, PORT[2] - 0.08], [PORT[1] + 0.08, PORT[3] + 0.08], [PORT[0] - 0.08, PORT[3] + 0.08]], 0.5);
  lip.holes.push(hole([[PORT[0], PORT[2]], [PORT[1], PORT[2]], [PORT[1], PORT[3]], [PORT[0], PORT[3]]], 0.42));
  body.add(mesh(extrudeXY(lip, 0.03, 0.01, 24), M.steelSatin, 0, 0, half + 0.006));
  // slotted screw heads, two each side, domed, slot at a random turn
  const head = latheX([[0, 0.3], [0.07, 0.3], [0.11, 0.25], [0.135, 0.14], [0.14, 0]], 28);
  const slotG = rbox(0.1, 0.62, 0.08, 0.02);
  const scr = [[-1.6, -2.0, 0.4], [-19.2, -2.3, 1.1]];
  for (const s of [1, -1])
    for (const [x, y, a] of scr) {
      const g = group(x, y, s * (half - 0.005));
      g.rotation.y = -s * Math.PI / 2; // lathe +X -> outward
      g.add(mesh(head, M.steelBright));
      g.add(mesh(slotG, M.steelInner, 0.12, 0, 0, a + s, 0, 0));
      body.add(g);
    }
  A.add(body, 'receiver');

  // --- ejector: spring-steel blade riveted inside the left wall
  const ejS = rpoly([[-5.8, -0.25], [-1.2, -0.25], [-0.7, 0.15], [-0.9, 0.45], [-5.8, 0.45]], 0.12);
  const ej = group(0, 0, 0, mesh(extrudeXY(ejS, 0.12, 0.03), M.steelBright, 0, 0, -half + wall + 0.07));
  for (const x of [-5.1, -3.6]) {
    ej.add(mesh(rcyl(0.11, 0.11, 0.5, 14), M.steelInner, x, 0.1, -half + 0.15, Math.PI / 2, 0, 0));
    ej.add(mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steelSatin, x, 0.1, -half - 0.0, -Math.PI / 2, 0, 0));
  }
  A.add(ej, 'ejector', {ex: [0, 1.5, -4.0], delay: 0.2});

  // --- shell latches: thin bent plates at the bottom front, one each side
  const latch = (s) => {
    const sh = rpoly([[-6.6, -0.25, 0.1], [-1.2, -0.25, 0.1], [-0.6, -0.6, 0.15], [-0.4, -0.2, 0.1], [-1.3, 0.25, 0.1], [-6.6, 0.25, 0.1]], 0.1);
    const g = group(0, -3.65, s * (half - wall - 0.08), mesh(extrudeXY(sh, 0.1, 0.03), M.steelBright));
    // staking dimple seen from outside
    g.add(mesh(rcyl(0.16, 0.16, 0.04, 16), M.steelSatin, -5.6, 0, s * 0.39, Math.PI / 2, 0, 0));
    return g;
  };
  A.add(latch(1), 'shell latch, right', {ex: [0, -1.6, 4.4], delay: 0.35});
  A.add(latch(-1), 'shell latch, left', {ex: [0, -1.6, -4.4], delay: 0.4});
  return A;
}
