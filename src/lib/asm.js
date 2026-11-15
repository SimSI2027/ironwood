// One assembly = one group of named parts. Each part knows where it rests and how it fans out.
import * as THREE from 'three';
import {makeMaterials} from './materials.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Clone a material with its shader hook (Material.copy drops onBeforeCompile). */
function cloneMat(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}
/**
 * Chain a look hook onto a material: uDim scales the lit result (dimming keeps the material,
 * just darker), uRim adds a soft brass fresnel rim (selected assembly).
 */
function look(m, U) {
  const base = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.uDim = U.dim;
    sh.uniforms.uRim = U.rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDim;\nuniform float uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.95, 0.66, 0.26) * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5) * uRim;`,
      )
      .replace('#include <opaque_fragment>', 'outgoingLight *= uDim;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => key + '|look';
}

export class Asm {
  /**
   * key, label: ids. offset: where the whole assembly goes at full explode [x, y, z].
   * delay: 0..1 stagger of the assembly phase.
   */
  constructor(key, label, {offset = [0, 0, 0], delay = 0, inner = false} = {}) {
    this.inner = inner; // lives inside the receiver: no axial slide, moves only in stage 2
    this.key = key;
    this.label = label;
    this.group = new THREE.Group();
    this.group.name = key;
    this.parts = [];
    this.offset = new THREE.Vector3(...offset);
    this.delay = delay;
    this.M = makeMaterials();
    this.materials = new Set();
    this.U = {dim: {value: 1}, rim: {value: 0}};
    this.xrayMats = new Set();
    this.edges = [];
  }

  /**
   * Register a part. ex: fan-out offset [x, y, z] in assembly space. rot: fan-out rotation [rx, ry, rz].
   * delay: stagger 0..1 inside the part phase. pump: [dx] cm per unit pump stroke; pumpRot: [rx, ry, rz] per unit.
   * scaleX: stretch along X at full fan-out (springs).
   */
  add(obj, name, {ex = [0, 0, 0], rot = null, delay = 0, pump = 0, pumpRot = null, scaleX = 1, parent = null, xray = false} = {}) {
    obj.userData.part = name;
    obj.userData.asm = this.key;
    (parent || this.group).add(obj);
    this.parts.push({
      obj,
      name,
      rest: obj.position.clone(),
      restQ: obj.quaternion.clone(),
      restS: obj.scale.clone(),
      ex: new THREE.Vector3(...ex),
      rot: rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)) : null,
      pumpRot: pumpRot ? new THREE.Euler(...pumpRot) : null,
      delay,
      pump,
      scaleX,
      xray,
    });
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.partRoot = obj;
        if (o.geometry.type === 'LatheGeometry' && !Array.isArray(o.material)) o.material = this.M.tube(o.material);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => this.materials.add(m));
      }
    });
    return obj;
  }

  /** Explode e in 0..1, pump stroke p in 0..1. Assemblies split first, then parts fan out. */
  pose(e, p = 0) {
    // stage 1 (e 0-0.5): the assemblies on the axis slide apart along it, staggered.
    // stage 2 (e 0.45-1): each assembly steps to its row (trigger drops, bolt lifts), then its parts fan out.
    const a = ease(clamp01((e - this.delay * 0.12) / 0.38));
    const l = ease(clamp01((e - 0.45 - this.delay * 0.1) / 0.3));
    this.group.position.set(this.offset.x * (this.inner ? l : a), this.offset.y * l, this.offset.z * l);
    const q = new THREE.Quaternion();
    const qe = new THREE.Quaternion();
    for (const part of this.parts) {
      const b = ease(clamp01((e - 0.58 - part.delay * 0.14) / 0.28));
      part.obj.position.copy(part.ex).multiplyScalar(b).add(part.rest);
      part.obj.position.x += part.pump * p;
      part.obj.quaternion.copy(part.restQ);
      if (part.rot) {
        q.identity().slerp(part.rot, b);
        part.obj.quaternion.premultiply(q);
      }
      if (part.pumpRot && p > 0) {
        qe.setFromEuler(new THREE.Euler(part.pumpRot.x * p, part.pumpRot.y * p, part.pumpRot.z * p));
        part.obj.quaternion.multiply(qe);
      }
      part.obj.scale.copy(part.restS);
      if (part.scaleX !== 1) part.obj.scale.x *= 1 + (part.scaleX - 1) * b;
    }
  }

  /**
   * After building: x-ray parts get their own materials and brass edge lines, then every
   * material gets the dim/rim hook.
   */
  finalize() {
    this.edgeMat = new THREE.LineBasicMaterial({color: 0xf0c060, transparent: true, opacity: 0, depthWrite: false});
    for (const part of this.parts) {
      if (!part.xray) continue;
      const map = new Map();
      part.obj.traverse((o) => {
        if (!o.isMesh || o.isLineSegments) return;
        if (!map.has(o.material)) map.set(o.material, cloneMat(o.material));
        o.material = map.get(o.material);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), this.edgeMat);
        e.visible = false;
        e.raycast = () => {};
        o.add(e);
        this.edges.push(e);
      });
      map.forEach((m) => this.xrayMats.add(m));
    }
    this.materials = new Set();
    this.group.traverse((o) => o.isMesh && !Array.isArray(o.material) && this.materials.add(o.material));
    for (const m of this.materials) look(m, this.U);
  }

  /**
   * d: dim 0..1 (1 = 30% brightness, 0.5 opacity, own material kept). rim: brass rim 0..1.
   * xr: x-ray 0..1 for parts added with xray (15% opacity, brass edge lines).
   */
  setLook(d, rim = 0, xr = 0) {
    this.U.dim.value = 1 - 0.7 * d;
    this.U.rim.value = 0.45 * rim;
    for (const m of this.materials) {
      const a = (1 - 0.5 * d) * (this.xrayMats.has(m) ? 1 - 0.85 * xr : 1);
      const t = a < 0.999;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = a;
      m.depthWrite = !t;
    }
    this.edgeMat.opacity = 0.8 * xr * (1 - 0.5 * d);
    for (const e of this.edges) e.visible = xr > 0.01;
  }
}
