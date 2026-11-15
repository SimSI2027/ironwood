// TOUR: a 20 s scripted run as a pure function of time.
// 0-2 hero · 2-5 pump the forend twice · 5-13 each assembly in turn · 13-18 full explode on a
// turntable · 18-20 reassemble.
import * as THREE from 'three';

export const TOUR_LEN = 20;
const DRIFT = 0.08;
const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sph = new THREE.Spherical();
const sph2 = new THREE.Spherical();

/** Blend two cameras {t, p} through spherical coordinates around the blended target. */
function blend(a, b, w) {
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

export function createTour({asms, poseAll, frame, gun}) {
  const T = {active: false, t0: 0, cams: null};
  const pumpCycle = (t, t0) => {
    const u = (t - t0) / 1.25;
    return u < 0 || u > 1 ? 0 : 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
  };

  T.start = (now) => {
    poseAll(0, 0);
    const hero = frame(gun, new THREE.Vector3(0.42, 0.3, 1));
    const rec = frame(asms[3].group, new THREE.Vector3(0.25, 0.22, 1), 1.0);
    rec.t.x += 9;
    rec.p.x += 9;
    rec.p.sub(rec.t).multiplyScalar(1.9).add(rec.t);
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
    let pump = 0;
    let focus = -1;
    let cam;
    if (t < 2) {
      cam = orbit(C.hero, -0.12 * (t / 2));
    } else if (t < 5) {
      cam = blend(orbit(C.hero, -0.12), C.rec, sm(2, 2.9, t));
      pump = pumpCycle(t, 2.55) + pumpCycle(t, 3.75);
    } else if (t < 5 + n) {
      explode = 0.7 * sm(5, 6, t);
      const k = Math.min(n - 1, Math.floor(t - 5));
      focus = k;
      // each beat drifts 0.08 rad; the next beat starts from where the last one ended (no snap)
      const prev = k === 0 ? C.rec : orbit(C.parts[k - 1], DRIFT);
      cam = blend(prev, orbit(C.parts[k], DRIFT * (t - 5 - k)), sm(5 + k, 5 + k + 0.6, t));
    } else if (t < 18) {
      explode = 0.7 + 0.3 * sm(13, 14.4, t);
      const turn = orbit(C.all, -Math.PI * 1.1 * sm(13, 18, t) * 0.9);
      cam = blend(orbit(C.parts[n - 1], DRIFT), turn, sm(13, 13.9, t));
    } else {
      explode = 1 - sm(18, 19.6, t);
      cam = blend(orbit(C.all, -Math.PI * 0.99), C.hero, sm(18, 19.9, t));
    }
    return {explode, pump, focus, cam, done: t >= TOUR_LEN};
  };
  return T;
}
