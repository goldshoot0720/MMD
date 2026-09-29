// Procedural choreography: each move maps a local beat time (0..8) to a pose spec.
import * as THREE from 'three';
import { makeSpec, blendSpec, mirrorSpec } from './rig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const E = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const frac = (t) => t - Math.floor(t);
const dip = (t) => 0.5 + 0.5 * Math.cos(2 * Math.PI * t); // 1 on the beat
const hit = (t) => Math.exp(-6 * frac(t)); // sharp accent on the beat
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixV = (a, b, w) => a.clone().lerp(b, w).normalize();

function base(k = 0) {
  const s = makeSpec();
  s.dirs.LeftArm = V(0.2, -1, 0.05); s.dirs.LeftForeArm = V(0.1, -1, 0.2);
  s.dirs.RightArm = V(-0.2, -1, 0.05); s.dirs.RightForeArm = V(-0.1, -1, 0.2);
  knees(s, k);
  return s;
}

// k: knee bend 0..1, w: stance width
function knees(s, k, w = 0.07) {
  s.dirs.LeftUpLeg = V(w, -1, 0.55 * k); s.dirs.LeftLeg = V(w * 0.4, -1, -0.55 * k);
  s.dirs.RightUpLeg = V(-w, -1, 0.55 * k); s.dirs.RightLeg = V(-w * 0.4, -1, -0.55 * k);
  return s;
}

const hipsOnLeft = (s) => { s.dirs.LeftArm = V(0.75, -0.5, -0.3); s.dirs.LeftForeArm = V(-0.6, -0.55, 0.35); };

export const MOVES = {
  bounce(t) {
    const s = base(0.45 * dip(t));
    const sw = Math.sin(Math.PI * t);
    s.dirs.LeftArm = V(0.3, -1, 0.45 * sw); s.dirs.LeftForeArm = V(0.15, -0.6, 0.5 + 0.3 * sw);
    s.dirs.RightArm = V(-0.3, -1, -0.45 * sw); s.dirs.RightForeArm = V(-0.15, -0.6, 0.5 - 0.3 * sw);
    s.chest = E(0, 0.15 * sw, 0); s.hips = E(0, -0.06 * sw, 0);
    s.head = E(0.12 * dip(t), 0.1 * sw, 0);
    return s;
  },
  pump(t) {
    const a = hit(t);
    const s = base(0.4 * dip(t));
    s.dirs.RightArm = V(-0.3, 0.35 + 0.6 * a, 0.6); s.dirs.RightForeArm = V(-0.1, 1, 0.25 - 0.2 * a);
    hipsOnLeft(s);
    s.chest = E(-0.08 * a, -0.15, 0.05); s.head = E(-0.15 * a + 0.05, -0.1, 0);
    return s;
  },
  clap(t) {
    const o = 1 - hit(t);
    const high = Math.floor(t / 4) % 2 === 1; // second half claps overhead
    const s = base(0.35 * dip(t));
    if (high) {
      s.dirs.LeftArm = V(0.3 + 0.35 * o, 0.9, 0.2); s.dirs.LeftForeArm = V(-0.35 + 0.6 * o, 1, 0.1);
      s.dirs.RightArm = V(-0.3 - 0.35 * o, 0.9, 0.2); s.dirs.RightForeArm = V(0.35 - 0.6 * o, 1, 0.1);
      s.head = E(-0.2, 0, 0);
    } else {
      s.dirs.LeftArm = V(0.3 + 0.3 * o, -0.35, 0.85); s.dirs.LeftForeArm = V(-0.55 + 0.8 * o, 0.1, 0.8);
      s.dirs.RightArm = V(-0.3 - 0.3 * o, -0.35, 0.85); s.dirs.RightForeArm = V(0.55 - 0.8 * o, 0.1, 0.8);
      s.head = E(0.1 * dip(t), 0, 0);
    }
    return s;
  },
  wave(t) {
    const sw = Math.sin((Math.PI * t) / 2);
    const s = base(0.3 * dip(t));
    s.dirs.LeftArm = V(0.45 + 0.35 * sw, 0.85, 0.1); s.dirs.LeftForeArm = V(0.3 + 0.7 * sw, 0.9, 0.05);
    s.dirs.RightArm = V(-0.45 + 0.35 * sw, 0.85, 0.1); s.dirs.RightForeArm = V(-0.3 + 0.7 * sw, 0.9, 0.05);
    s.chest = E(0, 0, -0.18 * sw); s.hips = E(0, 0, 0.08 * sw); s.head = E(-0.1, 0, -0.12 * sw);
    return s;
  },
  point(t) {
    const a = hit(t), left = Math.floor(t / 4) % 2 === 1;
    const s = base(0.3 * dip(t));
    knees(s, 0.35 * dip(t), 0.22);
    s.dirs.RightArm = V(-0.2, 0.2 + 0.15 * a, 1); s.dirs.RightForeArm = V(-0.1, 0.25 + 0.1 * a, 1);
    hipsOnLeft(s);
    s.chest = E(0.05 * a, 0.3, 0); s.hips = E(0, 0.12, 0); s.head = E(0, 0.15, 0);
    return left ? mirrorSpec(s) : s;
  },
  vanish(t) {
    // "Vanishment this World!" — hand over the eye, other arm flung out
    const tr = 0.04 * hit(t);
    const s = base(0);
    knees(s, 0.15, 0.3);
    s.dirs.RightArm = V(-0.35, -0.1 + tr, 0.93); s.dirs.RightForeArm = V(0.6, 0.65, -0.35);
    s.dirs.RightHand = V(0.35, 0.9, -0.1);
    s.dirs.LeftArm = V(0.85, 0.35 + tr, 0.4); s.dirs.LeftForeArm = V(0.85, 0.42, 0.3); s.dirs.LeftHand = V(0.8, 0.5, 0.3);
    s.hips = E(0, 0.18, 0); s.chest = E(-0.12, 0.3, 0.05); s.head = E(0.05, -0.1, 0.18 + tr);
    return s;
  },
  cross(t) {
    const open = smooth(3.6, 4.2, t) * (1 - smooth(7.4, 8, t));
    const a = mixSpec(crossClosed(t), crossOpen(t), open);
    return a;
  },
  jump(t) {
    const ph = t % 2;
    const air = ph > 0.5 && ph < 1.5 ? Math.sin(Math.PI * (ph - 0.5)) : 0;
    const crouch = ph <= 0.5 ? Math.sin(Math.PI * ph) : ph >= 1.5 ? Math.sin(Math.PI * (ph - 1.5)) : 0;
    const s = base(0.6 * crouch + 0.5 * air);
    s.rootY = 0.38 * air;
    s.dirs.LeftArm = V(0.5, -0.8 + 1.8 * air, 0.3); s.dirs.LeftForeArm = V(0.4, -0.6 + 1.7 * air, 0.3);
    s.dirs.RightArm = V(-0.5, -0.8 + 1.8 * air, 0.3); s.dirs.RightForeArm = V(-0.4, -0.6 + 1.7 * air, 0.3);
    s.chest = E(0.25 * crouch - 0.1 * air, 0, 0); s.head = E(-0.25 * air, 0, 0);
    return s;
  },
  step(t) {
    const sw = Math.sin((Math.PI * t) / 2);
    const s = base(0);
    const kl = Math.max(0, sw), kr = Math.max(0, -sw);
    s.dirs.LeftUpLeg = V(0.1 + 0.3 * kl, -1, 0.3 * kr); s.dirs.LeftLeg = V(0.05, -1, -0.4 * kr);
    s.dirs.RightUpLeg = V(-0.1 - 0.3 * kr, -1, 0.3 * kl); s.dirs.RightLeg = V(-0.05, -1, -0.4 * kl);
    s.rootX = 0.25 * sw;
    s.dirs.LeftArm = V(0.5, -0.7, 0.4 * -sw); s.dirs.LeftForeArm = V(0.1, 0.3, 1);
    s.dirs.RightArm = V(-0.5, -0.7, 0.4 * sw); s.dirs.RightForeArm = V(-0.1, 0.3, 1);
    s.chest = E(0, 0.2 * sw, 0.08 * sw); s.head = E(0.08 * dip(t), -0.1 * sw, 0.1 * sw);
    return s;
  },
  spin(t) {
    const sp = smooth(0, 2, t);
    const s = base(0.3 * Math.sin(Math.PI * sp));
    s.rootYaw = sp * Math.PI * 2;
    const up = smooth(2, 2.6, t);
    s.dirs.LeftArm = V(1, 0.1 + 0.9 * up, 0.1); s.dirs.LeftForeArm = V(0.8, 0.2 + 1.2 * up, 0.1);
    s.dirs.RightArm = V(-1, 0.1 + 0.9 * up, 0.1); s.dirs.RightForeArm = V(-0.8, 0.2 + 1.2 * up, 0.1);
    s.head = E(-0.15 * up, 0, 0);
    if (t > 4) { const b = MOVES.heart(t); return mixSpec(s, b, smooth(4, 4.6, t)); }
    return s;
  },
  heart(t) {
    const sw = Math.sin((Math.PI * t) / 2);
    const s = base(0.25 * dip(t));
    s.dirs.LeftArm = V(0.55, 0.8, 0.25); s.dirs.LeftForeArm = V(-0.65, 0.75, 0.15); s.dirs.LeftHand = V(-0.8, 0.2, 0.1);
    s.dirs.RightArm = V(-0.55, 0.8, 0.25); s.dirs.RightForeArm = V(0.65, 0.75, 0.15); s.dirs.RightHand = V(0.8, 0.2, 0.1);
    s.chest = E(0, 0, 0.12 * sw); s.head = E(0, 0, 0.22 * sw);
    return s;
  },
  kick(t) {
    // alternating front kicks (one per two beats) with a punch from the opposite arm
    const ph = t % 2, leftLeg = Math.floor(t / 2) % 2 === 0;
    const k = ph < 1 ? Math.sin(Math.PI * ph) : 0;
    const s = base(0.3 * dip(t));
    s.dirs.RightUpLeg = V(-0.08, -1 + 0.8 * k, 1.0 * k); s.dirs.RightLeg = V(-0.03, -1 + 0.8 * k, 0.9 * k);
    s.dirs.LeftUpLeg = V(0.1, -1, 0.15); s.dirs.LeftLeg = V(0.04, -1, -0.15);
    s.dirs.LeftArm = V(0.2, 0.05 + 0.1 * k, 0.3 + 0.7 * k); s.dirs.LeftForeArm = V(0.05 - 0.4 * (1 - k), 0.1 + 0.4 * (1 - k), 1);
    s.dirs.RightArm = V(-0.35, -0.55, 0.5); s.dirs.RightForeArm = V(0.35, 0.5, 0.7);
    s.chest = E(-0.1 * k, 0.25 * k, 0); s.hips = E(0, -0.1 * k, 0); s.head = E(0.05, 0.1 * k, 0);
    return leftLeg ? mirrorSpec(s) : s;
  },
  roll(t) {
    // disco arm roll in front of the chest, pointing to the sky on beats 4 and 8
    const phi = Math.PI * 2 * t;
    const s = base(0.35 * dip(t));
    s.dirs.LeftArm = V(0.4, -0.45, 0.75); s.dirs.LeftForeArm = V(-0.8, 0.3 * Math.sin(phi), 0.45 + 0.3 * Math.cos(phi));
    s.dirs.RightArm = V(-0.4, -0.45, 0.75); s.dirs.RightForeArm = V(0.8, -0.3 * Math.sin(phi), 0.45 - 0.3 * Math.cos(phi));
    s.chest = E(0.06 * dip(t), 0.12 * Math.sin(Math.PI * t / 2), 0); s.head = E(0.1 * dip(t), 0, 0);
    const u = t % 4, p = smooth(2.9, 3.15, u) * (1 - smooth(3.75, 4, u));
    if (p > 0) {
      const pt = base(0.2);
      knees(pt, 0.2, 0.22);
      pt.dirs.RightArm = V(-0.6, 0.85, 0.25); pt.dirs.RightForeArm = V(-0.55, 0.9, 0.2);
      hipsOnLeft(pt);
      pt.chest = E(-0.1, -0.2, 0.1); pt.hips = E(0, -0.12, 0); pt.head = E(-0.25, -0.25, 0);
      if (Math.floor(t / 4) % 2 === 1) mirrorSpec(pt);
      return mixSpec(s, pt, p);
    }
    return s;
  },
  guitar(t) {
    // air guitar: fretting hand slides along the neck, strumming hand on every half beat;
    // the second half raises the neck for a guitar-hero finish
    const st = Math.sin(2 * Math.PI * t), up = smooth(4, 4.5, t);
    const s = base(0);
    knees(s, 0.35 * dip(t), 0.22);
    s.dirs.LeftArm = mixV(V(0.75, -0.35, 0.55), V(0.6, 0.45, 0.6), up);
    s.dirs.LeftForeArm = mixV(V(0.5 + 0.15 * Math.sin(Math.PI * t / 4), 0.05, 0.85), V(0.4, 0.85, 0.45), up);
    s.dirs.RightArm = V(-0.35, -0.8, 0.45); s.dirs.RightForeArm = V(0.75, -0.35 + 0.35 * st, 0.55);
    s.hips = E(0, 0.15, 0); s.chest = E(-0.05 - 0.15 * up, 0.25, 0);
    s.head = E(0.25 * dip(t) - 0.2 * up, 0.1, 0);
    return s;
  },
  mic(t) {
    // singing into a hand mic, free arm reaching out to the crowd on each phrase
    const u = t % 4, reach = smooth(0, 2, u) * (1 - smooth(3.4, 4, u));
    const sw = Math.sin((Math.PI * t) / 2);
    const s = base(0.3 * dip(t));
    s.dirs.RightArm = V(-0.3, -0.6, 0.7); s.dirs.RightForeArm = V(0.35, 0.85, 0.35); s.dirs.RightHand = V(0.2, 0.9, 0.4);
    s.dirs.LeftArm = mixV(V(0.3, -1, 0.1), V(0.75, 0.3, 0.6), reach);
    s.dirs.LeftForeArm = mixV(V(0.1, -0.6, 0.5), V(0.7, 0.45, 0.55), reach);
    s.hips = E(0, 0.08 * sw, 0); s.chest = E(-0.05, 0.15 * sw, 0);
    s.head = E(-0.12 - 0.12 * reach, 0.1 * sw, 0.1 * sw);
    return s;
  },
  cash(t) {
    // hold a stack of bills at the chest and fling them out on every beat
    const a = hit(t), left = Math.floor(t / 4) % 2 === 1;
    const s = base(0.35 * dip(t));
    s.dirs.LeftArm = V(0.3, -0.6, 0.75); s.dirs.LeftForeArm = V(-0.55, 0.35, 0.75);
    s.dirs.RightArm = mixV(V(-0.25, -0.5, 0.8), V(-0.7, 0.25, 0.65), a);
    s.dirs.RightForeArm = mixV(V(0.35, 0.3, 0.85), V(-0.7, 0.55, 0.45), a);
    s.chest = E(-0.05 * a, -0.15 * a, 0); s.head = E(-0.1 * a, -0.2 * a, 0);
    return left ? mirrorSpec(s) : s;
  },
  wrench(t) {
    // cranking a wrench on a pipe, then a thumbs-up for the finished job
    const phi = Math.PI * t, tight = smooth(2.8, 3.2, t % 4) * (1 - smooth(3.6, 4, t % 4));
    const thumbs = smooth(6, 6.4, t);
    const s = base(0.3 * dip(t) + 0.2 * tight);
    s.dirs.RightArm = V(-0.25, -0.3, 0.9);
    s.dirs.RightForeArm = V(-0.1 + 0.45 * Math.cos(phi), 0.15 + 0.45 * Math.sin(phi), 0.9);
    s.dirs.LeftArm = mixV(V(0.25, -0.35, 0.9), V(0.5, -0.4, 0.75), thumbs);
    s.dirs.LeftForeArm = mixV(V(-0.2, 0.2, 0.95), V(0.1, 1, 0.25), thumbs);
    s.chest = E(0.15 - 0.2 * thumbs, 0.1 * tight, 0); s.head = E(0.2 - 0.3 * thumbs, 0, 0.15 * thumbs);
    return s;
  },
  paw(t) {
    // cat paws at face height, swiping left / right on alternate beats
    const a = hit(t), left = Math.floor(t) % 2 === 0;
    const s = base(0.3 * dip(t));
    const idle = { arm: V(0.35, -0.45, 0.8), fore: V(-0.05, 0.85, 0.45), hand: V(0, -0.4, 1) };
    const swipe = { arm: V(0.35, -0.15, 0.95), fore: V(0.1, 0.35, 1), hand: V(0, -0.85, 0.5) };
    const paw = (side, w) => {
      const m = side === 'Left' ? 1 : -1, flip = (v) => new THREE.Vector3(v.x * m, v.y, v.z);
      s.dirs[`${side}Arm`] = flip(mixV(idle.arm, swipe.arm, w));
      s.dirs[`${side}ForeArm`] = flip(mixV(idle.fore, swipe.fore, w));
      s.dirs[`${side}Hand`] = flip(mixV(idle.hand, swipe.hand, w));
    };
    paw('Left', left ? a : 0); paw('Right', left ? 0 : a);
    const side = left ? 1 : -1;
    s.hips = E(0, 0.1 * side, 0); s.chest = E(0.05, 0.12 * side * a, 0); s.head = E(0.05, 0.1 * side, 0.2 * side);
    return s;
  },
  flame(t) {
    // "Dark Flame Master": charge at the hip, blast forward on beat 4, flames rise on 6–8
    const r = smooth(3.7, 4.1, t), rise = smooth(6, 7.5, t);
    const s = base(0);
    knees(s, 0.55 * (1 - r) + 0.3, 0.25);
    s.dirs.RightArm = mixV(mixV(V(-0.4, -0.8, -0.2), V(-0.12, 0.05, 1), r), V(-0.3, 1, 0.3), rise);
    s.dirs.RightForeArm = mixV(mixV(V(0.3, -0.2, 0.9), V(-0.05, 0.1, 1), r), V(-0.25, 1, 0.2), rise);
    s.dirs.LeftArm = mixV(mixV(V(0.1, -0.7, 0.6), V(0.12, 0.05, 1), r), V(0.3, 1, 0.3), rise);
    s.dirs.LeftForeArm = mixV(mixV(V(-0.8, -0.1, 0.4), V(0.05, 0.1, 1), r), V(0.25, 1, 0.2), rise);
    s.dirs.LeftHand = V(0, 0.9, 0.4); s.dirs.RightHand = V(0, 0.9, 0.4);
    s.chest = E(0.1 * (1 - r) - 0.05 * r - 0.15 * rise, -0.35 * (1 - r), 0);
    s.hips = E(0, -0.15 * (1 - r), 0); s.head = E(0.05 - 0.3 * rise, -0.1 * (1 - r), 0);
    return s;
  },
};

function crossClosed(t) {
  const s = base(0.2 * hit(t));
  knees(s, 0.2, 0.25);
  s.dirs.LeftArm = V(0.35, 0.05, 0.93); s.dirs.LeftForeArm = V(-0.75, 0.62, 0.18);
  s.dirs.RightArm = V(-0.35, 0.05, 0.93); s.dirs.RightForeArm = V(0.75, 0.62, 0.05);
  s.chest = E(0.15, 0, 0); s.head = E(0.3, 0, 0);
  return s;
}
function crossOpen(t) {
  const s = base(0.1);
  knees(s, 0.1, 0.3);
  s.dirs.LeftArm = V(0.9, -0.25 + 0.1 * hit(t), 0.25); s.dirs.LeftForeArm = V(0.9, -0.2, 0.3);
  s.dirs.RightArm = V(-0.9, -0.25 + 0.1 * hit(t), 0.25); s.dirs.RightForeArm = V(-0.9, -0.2, 0.3);
  s.chest = E(-0.18, 0, 0); s.head = E(-0.25, 0, 0);
  return s;
}
function mixSpec(a, b, w) { return blendSpec(makeSpec(), a, b, w); }

// Timeline of 8-beat sections. mirrorOdd: odd-indexed characters do the mirror image.
// stagger: beats of canon delay per step of a character's canon position.
// solo: every character performs their own signature move (two sections = 16 beats,
// starting on an even section so the camera's roll call begins with the first character).
export const TIMELINE = [
  { move: 'bounce' }, { move: 'bounce', mirrorOdd: true },
  { move: 'pump', mirrorOdd: true, call: '爆ぜろリアル！' }, { move: 'clap' },
  { move: 'point', mirrorOdd: true, call: '弾けろシナプス！' }, { move: 'cross', stagger: 0.25 },
  { move: 'vanish', mirrorOdd: true, call: 'Vanishment this World!' }, { move: 'wave', stagger: 0.5 },
  { move: 'step', mirrorOdd: true }, { move: 'kick', mirrorOdd: true },
  { move: 'roll', mirrorOdd: true }, { move: 'guitar', mirrorOdd: true },
  { move: 'solo', call: '個人秀' }, { move: 'solo' },
  { move: 'jump', stagger: 0.5 }, { move: 'spin', stagger: 0.5 },
  { move: 'heart', mirrorOdd: true }, { move: 'flame', stagger: 0.25, call: 'Dark Flame Master!' },
  { move: 'pump' }, { move: 'wave' },
  { move: 'cross' }, { move: 'vanish', call: 'INSIDE IDENTITY' },
];

export const MOVE_LABEL = {
  bounce: '律動', pump: '揮拳', clap: '拍手', point: '指向', vanish: '邪王真眼',
  cross: '交叉封印', wave: '揮舞', step: '側步', jump: '跳躍', spin: '轉圈', heart: '比心',
  kick: '前踢出拳', roll: '繞手指天', guitar: '空氣吉他', mic: '握麥高歌', cash: '撒鈔票',
  wrench: '扳手鎖螺絲', paw: '喵喵貓爪', flame: '黑炎召喚', solo: '個人秀',
};

// dancer: { k: canon position (for stagger), sig: signature move, sigMirror }
function evalSection(sec, t, i, d) {
  const st = Math.max(0, t - (sec.stagger || 0) * d.k);
  const solo = sec.move === 'solo';
  const s = MOVES[solo ? d.sig || 'bounce' : sec.move](Math.min(st, 7.999));
  if (solo ? d.sigMirror : sec.mirrorOdd && i % 2 === 1) mirrorSpec(s);
  return s;
}

// beat: global beat count, i: character index
export function choreoSpec(beat, i, dancer = {}) {
  const d = { k: i, ...dancer };
  const n = TIMELINE.length;
  const b = Math.max(0, beat);
  const idx = Math.floor(b / 8) % n;
  const t = b % 8;
  const sec = TIMELINE[idx];
  const cur = evalSection(sec, t, i, d);
  const w = smooth(0, 0.6, t - (sec.stagger || 0) * d.k);
  if (w >= 1 || b < 8) return cur;
  const prev = evalSection(TIMELINE[(idx - 1 + n) % n], 7.999, i, d);
  return blendSpec(prev, prev, cur, w);
}

export function sectionAt(beat) {
  const idx = Math.floor(Math.max(0, beat) / 8) % TIMELINE.length;
  return { idx, ...TIMELINE[idx] };
}

export const idleSpec = (time) => MOVES.bounce(time * 0.9);
