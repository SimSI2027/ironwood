// TOUR: a 24.2 s scripted run as a pure function of time.
// 0-2 hero · 2-9.2 the FULL clock (fire, then pump) at 0.25x (2.2-9.0, 6.8 s) · 9.2-17.2 each
// assembly in turn · 17.2-22.2 full explode on a turntable · 22.2-24.2 reassemble.
import {FULL_S} from './cycle.js';
import * as THREE from 'three';

const D = 4.2; // the clock beat is 4.2 s longer than the old two pumps
export const TOUR_LEN = 20 + D;
const C0 = 2.2;
const C1 = C0 + FULL_S / 0.25;
const DRIFT = 0.08;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sph = new THREE.Spherical();
const sph2 = new THREE.Spherical();

/** Blend two cameras {t, p} through spherical coordinates around the blended target. */
export function blend(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const t = a.t.clone().lerp(b.t, w);
  sph.setFromVector3(a.p.clone().sub(a.t));
  sph2.setFromVector3(b.p.clone().sub(b.t));
  let dth = sph2.theta - sph.theta;
  if (dth > Math.PI) dth -= Math.PI * 2;
  if (dth < -Math.PI) dth += Math.PI * 2;
  const s = new THREE.Spherical(sph.radius + (sph2.radius - sph.radius) * w, sph.phi + (sph2.phi - sph.phi) * w, sph.theta + dth * w);
  return {t, p: new THREE.Vector3().setFromSpherical(s).add(t)};
}
/** Camera orbiting a target by azimuth offset `da`. */
function orbit(c, da) {
  sph.setFromVector3(c.p.clone().sub(c.t));
  sph.theta += da;
  return {t: c.t.clone(), p: new THREE.Vector3().setFromSpherical(sph).add(c.t)};
}

export function createTour({asms, poseAll, frame, gun, clockCam}) {
  const T = {active: false, t0: 0, cams: null};
  T.start = (now) => {
    poseAll(0, 0);
    const hero = frame(gun, new THREE.Vector3(0.42, 0.3, 1));
    const rec = clockCam(1, true); // where the clock beat ends: the port
    poseAll(0.7, 0);
    const parts = asms.map((a) => frame(a.group, new THREE.Vector3(0.45, 0.36, 1), 1.15));
    poseAll(1, 0);
    const all = frame(gun, new THREE.Vector3(0.3, 0.32, 1));
    poseAll(0, 0);
    T.cams = {hero, rec, parts, all};
    T.t0 = now;
    T.active = true;
  };

  T.at = (t) => {
    const C = T.cams;
    const n = asms.length;
    let explode = 0;
    let c = 0; // the clock t
    let focus = -1;
    let cam;
    if (t < 2) {
      cam = orbit(C.hero, -0.12 * (t / 2));
    } else if (t < 5 + D) {
      c = t > C0 && t < C1 ? (t - C0) / (C1 - C0) : t >= C1 ? 1 : 0; // FULL at 0.25x
      cam = blend(orbit(C.hero, -0.12), clockCam(c), sm(2, 2.9, t)); // the clock's own camera
      if (t >= C1) c = 0;
    } else if (t < 5 + D + n) {
      const u = t - D;
      explode = 0.7 * sm(5, 6, u);
      const k = Math.min(n - 1, Math.floor(u - 5));
      focus = k;
      // each beat drifts 0.08 rad; the next beat starts from where the last one ended (no snap)
      const prev = k === 0 ? C.rec : orbit(C.parts[k - 1], DRIFT);
      cam = blend(prev, orbit(C.parts[k], DRIFT * (u - 5 - k)), sm(5 + k, 5 + k + 0.6, u));
    } else if (t < 18 + D) {
      const u = t - D;
      explode = 0.7 + 0.3 * sm(13, 14.4, u);
      const turn = orbit(C.all, -Math.PI * 1.1 * sm(13, 18, u) * 0.9);
      cam = blend(orbit(C.parts[n - 1], DRIFT), turn, sm(13, 13.9, u));
    } else {
      const u = t - D;
      explode = 1 - sm(18, 19.6, u);
      cam = blend(orbit(C.all, -Math.PI * 0.99), C.hero, sm(18, 19.9, u));
    }
    return {explode, t: c, focus, cam, done: t >= TOUR_LEN};
  };
  return T;
}
