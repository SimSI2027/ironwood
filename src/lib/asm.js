// One assembly = one group of named parts. Each part knows where it rests and how it fans out.
import * as THREE from 'three';
import {makeMaterials} from './materials.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
const clamp01 = (t) => Math.min(1, Math.max(0, t));

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
  }

  /**
   * Register a part. ex: fan-out offset [x, y, z] in assembly space. rot: fan-out rotation [rx, ry, rz].
   * delay: stagger 0..1 inside the part phase. pump: [dx] cm per unit pump stroke; pumpRot: [rx, ry, rz] per unit.
   * scaleX: stretch along X at full fan-out (springs).
   */
  add(obj, name, {ex = [0, 0, 0], rot = null, delay = 0, pump = 0, pumpRot = null, scaleX = 1, parent = null} = {}) {
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

  /** Dim to `alpha` (1 = solid). */
  setOpacity(alpha) {
    for (const m of this.materials) {
      const t = alpha < 0.999;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = alpha;
      m.depthWrite = !t;
    }
  }
}
