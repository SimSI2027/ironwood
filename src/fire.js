// FIRE effects on the clock t (see cycle.js): spark at the primer on the strike, the glowing wad and
// shot column down the bore, the muzzle flash with a 0.1 s light, a 60-pellet shot cloud, a smoke
// puff, and the recoil curve. Every channel is a pure function of t; nothing integrates.
import * as THREE from 'three';
import {merge, at} from './lib/geo.js';
import {MUZZLE} from './barrel.js';
import {FULL_S} from './cycle.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const sm = (t) => ((t = clamp01(t)), t * t * (3 - 2 * t));
const LIGHT_T = 0.1 / FULL_S; // the muzzle light lasts 0.1 s of the clock at 1x
export const RECOIL = {kick: 1.5, rise: THREE.MathUtils.degToRad(2), pivot: new THREE.Vector3(-55, -6, 0)};

/** Recoil 0..1 over 0.21-0.30: fast kick, back through rest to one overshoot, settle. */
export function recoilAt(t) {
  const u = (t - 0.21) / 0.09;
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.18) return Math.sin(((u / 0.18) * Math.PI) / 2);
  const v = (u - 0.18) / 0.82;
  return Math.cos(1.5 * Math.PI * v) * (1 - sm(v));
}
/** Shot column front x along the bore (chamber mouth 6 -> muzzle), accelerating. */
export const shotX = (t) => 6 + (MUZZLE - 6) * clamp01((t - 0.15) / 0.06) ** 1.6;

function glowTex(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function smokeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (rnd() - 0.5) * 50, y = 64 + (rnd() - 0.5) * 50, r = 18 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(200,200,205,0.22)');
    gr.addColorStop(1, 'rgba(200,200,205,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFireFX() {
  const group = new THREE.Group();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const add = (o) => (group.add(o), o);
  const additive = (map, color) => new THREE.SpriteMaterial({map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false});
  const hot = glowTex([[0, 'rgba(255,250,235,1)'], [0.25, 'rgba(255,190,90,0.85)'], [0.6, 'rgba(255,110,30,0.25)'], [1, 'rgba(255,80,10,0)']]);

  // spark at the primer (shell base, x 0 in the gun frame)
  const spark = add(new THREE.Sprite(additive(hot, new THREE.Color(0xffd9a0).multiplyScalar(1.6)))); // core over the 0.9 bloom threshold
  spark.position.set(-0.05, 0, 0);

  // wad and shot column, glowing: one part for the name card
  const shot = add(new THREE.Group());
  shot.userData.part = 'shot column';
  const pel = new THREE.SphereGeometry(0.17, 10, 8);
  const pl = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.68;
    pl.push(at(pel.clone(), -rnd() * 2.2, Math.cos(a) * r, Math.sin(a) * r));
  }
  const shotMat = new THREE.MeshStandardMaterial({color: 0x6a6460, metalness: 0.6, roughness: 0.4, emissive: 0xff7a2a, emissiveIntensity: 2.4});
  const wadMat = new THREE.MeshStandardMaterial({color: 0xd8d0c0, roughness: 0.7, emissive: 0xff5a1a, emissiveIntensity: 1.6});
  const wadG = new THREE.CylinderGeometry(0.9, 0.9, 1.5, 28).rotateZ(Math.PI / 2).translate(-3.0, 0, 0);
  shot.add(new THREE.Mesh(merge(pl), shotMat), new THREE.Mesh(wadG, wadMat));
  shot.traverse((o) => o.isMesh && (o.userData.partRoot = shot));

  // muzzle flash: a soft warm bloom about 15 cm long, no cone and no petals: a wide faint halo, a hot
  // core at the crown and nine heavily overlapping glows along the bore line whose size and strength
  // fall off smoothly, so they merge into one elongated bloom; the light lasts 0.1 s
  const flash = add(new THREE.Group());
  flash.position.x = MUZZLE + 0.2;
  const FL = [[2.5, 0, 0, 9.0, 0.16, 0xff9a48], [0.3, 0, 0, 3.6, 0.85, 0xfff0d0]];
  for (let k = 0; k < 9; k++) {
    const u = k / 8;
    FL.push([0.6 + u * 11.5, 0, 0, 4.2 - 1.9 * u, 0.42 * (1 - u) ** 1.4 + 0.05, u < 0.4 ? 0xffc070 : 0xff9040]);
  }
  for (const [x, y, z, sc, op, col] of FL) {
    const sp = new THREE.Sprite(additive(hot, col));
    sp.position.set(x, y, z);
    sp.userData = {sc, op};
    flash.add(sp);
  }
  const light = new THREE.PointLight(0xffa24a, 0, 0, 2);
  light.position.set(MUZZLE + 3, 1, 0);
  // the light stays visible (intensity 0 when off) outside the toggled group: a light that comes and
  // goes changes every lit program's key, and the first shot would recompile them all mid-flash
  const root = new THREE.Group();
  root.add(group, light);

  // 60 pellets: fixed per-pellet direction and speed, positions are functions of t
  const N = 60;
  const cloud = add(new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshStandardMaterial({color: 0x55504c, metalness: 0.7, roughness: 0.35, emissive: 0xff8a40, emissiveIntensity: 1.5}), N));
  const P = Array.from({length: N}, () => ({a: rnd() * Math.PI * 2, r: Math.sqrt(rnd()), k: 0.9 + 0.2 * rnd(), lag: rnd() * 2.2}));
  const m4 = new THREE.Matrix4();

  // smoke: a short puff of 8 soft sprites that bloom out of the muzzle, drift a little forward and up, and fade by 0.30
  const sTex = smokeTex();
  const puffs = Array.from({length: 8}, (_, i) => {
    const s = add(new THREE.Sprite(new THREE.SpriteMaterial({map: sTex, color: 0xb8b8bc, transparent: true, depthWrite: false, opacity: 0})));
    s.userData = {i, d: 2 + rnd() * 7, up: (rnd() - 0.3) * 2.5, side: (rnd() - 0.5) * 3, s: 3 + rnd() * 3.5, rot: rnd() * 6};
    s.material.rotation = s.userData.rot;
    return s;
  });

  /** Pose everything at clock t. visible: false hides it all. */
  function pose(t, visible = true) {
    group.visible = visible && t > 0.105 && t < 0.3;
    light.intensity = 0;
    if (!group.visible) return;
    // spark: 0.11-0.125
    const us = (t - 0.11) / 0.015;
    spark.visible = us > 0 && us < 1;
    if (spark.visible) spark.scale.setScalar(2.4 * Math.sin(Math.PI * us ** 0.5));
    // shot column: 0.15-0.21
    shot.visible = t >= 0.15 && t < 0.212;
    if (shot.visible) shot.position.x = shotX(t);
    // flash: 0.21-0.25, hottest at 0.215
    const uf = (t - 0.21) / 0.04;
    flash.visible = uf > 0 && uf < 1;
    if (flash.visible) {
      const e = Math.min(1, uf / 0.12) * (1 - sm((uf - 0.12) / 0.88));
      for (const sp of flash.children) {
        sp.scale.setScalar(sp.userData.sc * (0.35 + 0.65 * e));
        sp.material.opacity = sp.userData.op * e;
      }
    }
    const ul = (t - 0.21) / LIGHT_T;
    if (ul > 0 && ul < 1) light.intensity = 1.1e4 * Math.min(1, ul / 0.08) * (1 - ul) ** 2;
    // shot cloud: leaves the muzzle at 0.21, 2.6 m out by 0.26
    const uc = (t - 0.21) / 0.05;
    cloud.visible = uc > 0 && uc < 1;
    if (cloud.visible) {
      P.forEach((p, i) => {
        const d = Math.max(0, 260 * uc * p.k - p.lag);
        const r = 0.6 * p.r + d * 0.055 * p.r;
        m4.makeTranslation(MUZZLE + d, Math.cos(p.a) * r, Math.sin(p.a) * r);
        cloud.setMatrixAt(i, m4);
      });
      cloud.instanceMatrix.needsUpdate = true;
      cloud.material.emissiveIntensity = 1.5 * (1 - uc);
    }
    // smoke: born 0.212-0.225, gone by 0.30
    for (const s of puffs) {
      const u = (t - 0.212 - s.userData.i * 0.001) / (0.3 - 0.212 - s.userData.i * 0.001);
      s.visible = u > 0 && u < 1;
      if (!s.visible) continue;
      const g = 1 - (1 - u) ** 3; // rushes out, then hangs
      s.position.set(MUZZLE + 1 + s.userData.d * g + 2 * u, s.userData.up * g + 1.5 * u, s.userData.side * g);
      s.scale.setScalar(s.userData.s * (0.3 + 0.8 * g));
      s.material.opacity = 0.45 * Math.min(1, u / 0.08) * (1 - u) ** 2;
    }
  }
  return {group: root, shot, light, pose};
}
