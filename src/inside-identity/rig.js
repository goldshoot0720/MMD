// Mixamo rig driver: applies a "pose spec" (character-space targets) to a skeleton.
// Character space (CS): +x = character's left, +y = up, +z = forward (toward audience).
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const ID = new THREE.Quaternion();

// bone -> candidate child bones that define its aim direction
const AIM = {
  LeftArm: ['LeftForeArm'], LeftForeArm: ['LeftHand'], LeftHand: ['LeftHandMiddle1', 'LeftHandIndex1'],
  RightArm: ['RightForeArm'], RightForeArm: ['RightHand'], RightHand: ['RightHandMiddle1', 'RightHandIndex1'],
  LeftUpLeg: ['LeftLeg'], LeftLeg: ['LeftFoot'], LeftFoot: ['LeftToeBase'],
  RightUpLeg: ['RightLeg'], RightLeg: ['RightFoot'], RightFoot: ['RightToeBase'],
};
const AIM_ORDER = Object.keys(AIM);
const FEET = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'];

export function makeSpec() {
  return {
    hips: new THREE.Quaternion(), chest: new THREE.Quaternion(), head: new THREE.Quaternion(),
    dirs: {}, rootY: 0, rootX: 0, rootYaw: 0,
  };
}

export function copySpec(out, s) {
  out.hips.copy(s.hips); out.chest.copy(s.chest); out.head.copy(s.head);
  for (const k in out.dirs) if (!s.dirs[k]) delete out.dirs[k];
  for (const k in s.dirs) (out.dirs[k] ||= new THREE.Vector3()).copy(s.dirs[k]);
  out.rootY = s.rootY; out.rootX = s.rootX; out.rootYaw = s.rootYaw;
  return out;
}

// out = a -> b by w (out may be a)
export function blendSpec(out, a, b, w) {
  out.hips.slerpQuaternions(a.hips, b.hips, w);
  out.chest.slerpQuaternions(a.chest, b.chest, w);
  out.head.slerpQuaternions(a.head, b.head, w);
  const keys = new Set([...Object.keys(a.dirs), ...Object.keys(b.dirs)]);
  // a hand without a target rests in line with its forearm; blend toward that instead of
  // holding the other pose's hand forever (out may be a, so read the forearms up front)
  const handRest = (s, k) => k.endsWith('Hand') && s.dirs[k.slice(0, -4) + 'ForeArm']?.clone();
  const fa = {}, fb = {};
  for (const k of keys) { fa[k] = a.dirs[k] || handRest(a, k); fb[k] = b.dirs[k] || handRest(b, k); }
  for (const k of keys) {
    const va = fa[k], vb = fb[k];
    if (va && vb) (out.dirs[k] ||= new THREE.Vector3()).lerpVectors(va, vb, w).normalize();
    else if (w >= 0.5 && vb) (out.dirs[k] ||= new THREE.Vector3()).copy(vb);
    else if (w < 0.5 && va) (out.dirs[k] ||= new THREE.Vector3()).copy(va);
    else delete out.dirs[k];
  }
  out.rootY = a.rootY + (b.rootY - a.rootY) * w;
  out.rootX = a.rootX + (b.rootX - a.rootX) * w;
  // shortest angular path so a finished 360° spin doesn't unwind
  const TAU = Math.PI * 2;
  const dy = ((((b.rootYaw - a.rootYaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  out.rootYaw = a.rootYaw + dy * w;
  return out;
}

// Reflect a spec across the character's sagittal plane (left <-> right).
export function mirrorSpec(s) {
  const mq = (q) => q.set(q.x, -q.y, -q.z, q.w);
  mq(s.hips); mq(s.chest); mq(s.head);
  const d = {};
  for (const k in s.dirs) {
    const v = s.dirs[k].clone(); v.x = -v.x;
    d[k.startsWith('Left') ? 'Right' + k.slice(4) : k.startsWith('Right') ? 'Left' + k.slice(5) : k] = v;
  }
  s.dirs = d; s.rootX = -s.rootX; s.rootYaw = -s.rootYaw;
  return s;
}

// Orthonormal frame from a right vector and an approximate up vector.
export function frameQuat(right, up, out = new THREE.Quaternion()) {
  const x = _v.copy(right).normalize();
  const z = _v2.crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

export class Rig {
  constructor(root) {
    this.root = root;
    this.b = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      // three.js strips ':' from node names, so 'mixamorig:Hips' arrives as 'mixamorigHips'
      const n = o.name.replace(/^.*:/, '').replace(/^mixamorig\d*/, '');
      if (!this.b[n]) this.b[n] = o;
    });
    root.updateMatrixWorld(true);
    this.rootInv = new THREE.Quaternion();
    this._updateRootInv();
    this.restLocal = {};
    this.restCS = {};
    for (const [n, bone] of Object.entries(this.b)) {
      this.restLocal[n] = bone.quaternion.clone();
      this.restCS[n] = this.cs(bone, new THREE.Quaternion());
    }
    this.childDir = {};
    this.restDirCS = {};
    for (const n of AIM_ORDER) {
      if (!this.b[n]) continue;
      const cname = AIM[n].find((c) => this.b[c] && this.b[c].parent === this.b[n]);
      if (!cname) continue;
      this.childDir[n] = this.b[cname].position.clone().normalize();
      this.restDirCS[n] = this.childDir[n].clone().applyQuaternion(this.restCS[n]);
    }
    this.spine = ['Spine', 'Spine1', 'Spine2'].filter((n) => this.b[n]);
    this.feet = FEET.filter((n) => this.b[n]);
    this.restFootY = null;
  }

  _updateRootInv() { this.root.getWorldQuaternion(this.rootInv).invert(); }

  // bone's world rotation expressed in character space
  cs(bone, out) { return bone.getWorldQuaternion(out).premultiply(this.rootInv); }

  setCS(bone, q) {
    this.cs(bone.parent, _q3);
    bone.quaternion.copy(_q3.invert().multiply(q));
  }

  aim(n, target) {
    const bone = this.b[n], local = this.childDir[n];
    if (!bone || !local) return;
    const parentCS = this.cs(bone.parent, _q);
    const cur = _q2.copy(parentCS).multiply(bone.quaternion);
    const curDir = _v.copy(local).applyQuaternion(cur);
    const delta = _q3.setFromUnitVectors(curDir, _v2.copy(target).normalize());
    cur.premultiply(delta);
    bone.quaternion.copy(parentCS.invert().multiply(cur));
  }

  reset() {
    for (const n in this.restLocal) this.b[n].quaternion.copy(this.restLocal[n]);
  }

  apply(spec) {
    this.reset();
    this._updateRootInv();
    const q = new THREE.Quaternion();
    if (this.b.Hips) this.setCS(this.b.Hips, q.copy(spec.hips).multiply(this.restCS.Hips));
    const rel = _q.copy(spec.chest).multiply(_q2.copy(spec.hips).invert()).clone();
    this.spine.forEach((n, i) => {
      q.slerpQuaternions(ID, rel, (i + 1) / this.spine.length).multiply(spec.hips).multiply(this.restCS[n]);
      this.setCS(this.b[n], q);
    });
    if (this.b.Neck) {
      const relH = _q.copy(spec.head).multiply(_q2.copy(spec.chest).invert()).clone();
      q.slerpQuaternions(ID, relH, 0.4).multiply(spec.chest).multiply(this.restCS.Neck);
      this.setCS(this.b.Neck, q);
    }
    if (this.b.Head) this.setCS(this.b.Head, q.copy(spec.head).multiply(this.restCS.Head));
    for (const n of AIM_ORDER) {
      let t = spec.dirs[n];
      if (!t && n.endsWith('Foot') && this.restDirCS[n]) {
        // keep feet flat, following the hips' heading
        t = _v2.copy(this.restDirCS[n]).applyQuaternion(spec.hips);
        t.y = this.restDirCS[n].y;
      }
      if (t) this.aim(n, t);
    }
  }

  // lowest foot bone in world space (used to keep the character grounded)
  footMinY() {
    this.root.updateMatrixWorld(true);
    let min = Infinity;
    for (const n of this.feet) min = Math.min(min, this.b[n].getWorldPosition(_v).y);
    return min;
  }
}
