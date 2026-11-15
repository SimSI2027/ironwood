// 3. Forend: walnut pump grip with 9 raised ribs, inner slide tube, forend nut,
// two thin action bars running back to the bolt slide in the receiver.
import {THREE, mesh, group, tubeX, knurlX, extrudeYZ, extrudeXY, rpoly, smooth, latheX} from './lib/geo.js';
import {Asm} from './lib/asm.js';
import {MAG_Y} from './barrel.js';

export const FOREND_X0 = 14.0;
export const FOREND_L = 22.5;
export const BAR_Z = 1.175;
export const PUMP = -7.5; // cm of travel for a full stroke (forend, action bars, slide)
export const BOLT_TRAVEL = PUMP; // the bolt runs exactly the slide length
// the forend's own base tone and specular (same grain as the stock): its ribs catch every light, so it
// reads lighter than the stock; measured in the default view, the average colour is within 2.5% of the stock's, per channel
const FOREND_WOOD = {tint: 0.966, specular: 0.25};

/** Ribbed C-section shell: open at the top so it hugs the barrel. */
function ribbedShell(L, Ri, Ro, open, ribs) {
  const s = new THREE.Shape();
  const a0 = Math.PI / 2 + open;
  const a1 = Math.PI / 2 - open + Math.PI * 2;
  s.absarc(0, 0, Ro, a0, a1, false);
  s.absarc(0, 0, Ri, a1, a0, true);
  s.closePath();
  let g = extrudeYZ(s, L, 0.16, 72, 260);
  const p = g.attributes.position;
  const mid = (Ri + Ro) / 2;
  const R = (x) => {
    let r = Ro - 0.04;
    // rounded rear, flared front lip
    const rear = Math.min(1, x / 1.4);
    r -= 0.32 * (1 - Math.sin((rear * Math.PI) / 2));
    const f = (x - (L - 2.0)) / 2.0;
    if (f > 0) r += 0.16 * Math.sin(Math.min(1, f * 1.4) * Math.PI * 0.75) - 0.3 * Math.max(0, f - 0.75) ** 2 * 4;
    for (let i = 0; i < ribs; i++) {
      const c = 3.2 + (i * (L - 7.2)) / (ribs - 1);
      const d = Math.abs(x - c);
      if (d < 0.55) r += 0.2 * (0.5 + 0.5 * Math.cos((d / 0.55) * Math.PI)) ** 0.6;
    }
    return r;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rho = Math.hypot(y, z);
    if (rho > mid) {
      const k = R(x) / Ro;
      p.setXYZ(i, x, y * k * 1.06, z * k);
    } else p.setXYZ(i, x, y * 1.03, z);
  }
  g = smooth(g);
  return g;
}

export function buildForend() {
  const A = new Asm('forend', 'Forend', {offset: [9, -20, 0], delay: 0.6});
  const M = A.M;
  const all = {pump: PUMP};

  // --- walnut grip
  const wood = mesh(ribbedShell(FOREND_L, 1.36, 2.08, 0.62, 9), M.wood(FOREND_WOOD), FOREND_X0, MAG_Y + 0.38, 0);
  A.add(wood, 'forend', {...all, ex: [0, -4.2, 0], delay: 0.2});

  // --- slide tube, the steel sleeve the grip is pinned to
  const st = group(0, MAG_Y, 0);
  st.add(mesh(tubeX(12.6, 38.0, 1.25, 1.13, 0.04, 48), M.steelSatin));
  // retaining ring at the rear of the grip
  st.add(mesh(tubeX(13.4, 13.95, 1.42, 1.24, 0.06, 48), M.steel));
  A.add(st, 'slide tube', all);

  // --- forend nut: knurled, threads onto the slide tube front
  const nut = group(0, MAG_Y, 0, mesh(knurlX(37.0, 38.3, 1.6, 54, 0.05, 0.07, 1.13), M.steel));
  nut.add(mesh(latheX([[38.3, 1.13], [38.3, 1.5], [38.5, 1.38], [38.55, 1.13]], 48), M.steelSatin));
  A.add(nut, 'forend nut', {...all, ex: [6.5, 0, 0], delay: 0.4});

  // --- action bars: thin straps from the slide tube back to the bolt slide, raised lug at the rear
  const barShape = rpoly(
    [
      [-12.7, -0.4, 0.15],
      [-12.7, 1.28, 0.2],
      [-11.2, 1.28, 0.2],
      [-10.8, 0.4, 0.3],
      [-6.6, 0.4, 0.1],
      [-6.3, 0.2, 0.05],
      [-5.5, 0.2, 0.05],
      [-5.2, 0.4, 0.1],
      [14.8, 0.4, 0.2],
      [14.8, -0.4, 0.2],
    ],
    0.1,
  );
  const barGeo = extrudeXY(barShape, 0.14, 0.035, 12);
  const yBar = MAG_Y + 0.3;
  const right = mesh(barGeo, M.steelSatin, 0, yBar, BAR_Z);
  const left = mesh(barGeo, M.steelSatin, 0, yBar, -BAR_Z);
  A.add(right, 'action bar', {...all, ex: [0, 1.2, 2.6], delay: 0.5});
  A.add(left, 'action bar', {...all, ex: [0, 1.2, -2.6], delay: 0.55});
  // weld blocks where the bars meet the slide tube
  const blocks = group(0, 0, 0);
  for (const z of [BAR_Z, -BAR_Z]) blocks.add(mesh(extrudeXY(rpoly([[12.6, -0.32], [14.6, -0.32], [14.6, 0.32], [12.6, 0.32]], 0.12), 0.2, 0.05), M.steel, 0, yBar, z * 1.02));
  A.add(blocks, 'bar weld', {...all, ex: [0, -1.2, 0], delay: 0.6});
  return A;
}
