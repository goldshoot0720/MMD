// MediaPipe pose tracking (webcam or local video) -> pose specs.
import * as THREE from 'three';
import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { makeSpec, frameQuat } from './rig.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

// left <-> right landmark swap table
const SWAP = Array.from({ length: 33 }, (_, i) => i);
[[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
  [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]].forEach(([a, b]) => { SWAP[a] = b; SWAP[b] = a; });

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32], [15, 19], [16, 20]];

const HEAD_PITCH_FIX = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));

export function landmarksToSpec(world, norm, mirror) {
  const P = (i) => {
    const l = world[mirror ? SWAP[i] : i];
    return new THREE.Vector3(mirror ? -l.x : l.x, -l.y, -l.z);
  };
  const vis = (i) => norm[mirror ? SWAP[i] : i].visibility ?? 1;
  const s = makeSpec();
  const lh = P(23), rh = P(24), ls = P(11), rs = P(12);
  const hipMid = lh.clone().add(rh).multiplyScalar(0.5);
  const shMid = ls.clone().add(rs).multiplyScalar(0.5);
  const up = shMid.clone().sub(hipMid);
  frameQuat(lh.clone().sub(rh), up, s.hips);
  frameQuat(ls.clone().sub(rs), up, s.chest);

  const le = P(7), re = P(8), nose = P(0);
  const r = le.clone().sub(re);
  const f = nose.sub(le.clone().add(re).multiplyScalar(0.5));
  frameQuat(r, f.clone().cross(r), s.head);
  s.head.multiply(HEAD_PITCH_FIX);

  const d = (a, b) => P(b).sub(P(a));
  s.dirs.LeftArm = d(11, 13); s.dirs.LeftForeArm = d(13, 15);
  s.dirs.RightArm = d(12, 14); s.dirs.RightForeArm = d(14, 16);
  if (vis(19) > 0.5) s.dirs.LeftHand = P(17).add(P(19)).multiplyScalar(0.5).sub(P(15));
  if (vis(20) > 0.5) s.dirs.RightHand = P(18).add(P(20)).multiplyScalar(0.5).sub(P(16));

  if (Math.min(vis(25), vis(27)) > 0.5) {
    s.dirs.LeftUpLeg = d(23, 25); s.dirs.LeftLeg = d(25, 27);
    if (vis(31) > 0.5) s.dirs.LeftFoot = d(27, 31);
  } else { s.dirs.LeftUpLeg = new THREE.Vector3(0.07, -1, 0); s.dirs.LeftLeg = new THREE.Vector3(0.03, -1, 0); }
  if (Math.min(vis(26), vis(28)) > 0.5) {
    s.dirs.RightUpLeg = d(24, 26); s.dirs.RightLeg = d(26, 28);
    if (vis(32) > 0.5) s.dirs.RightFoot = d(28, 32);
  } else { s.dirs.RightUpLeg = new THREE.Vector3(-0.07, -1, 0); s.dirs.RightLeg = new THREE.Vector3(-0.03, -1, 0); }
  for (const k in s.dirs) s.dirs[k].normalize();
  return s;
}

export class Tracker {
  constructor(videoEl, canvasEl) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.landmarker = null;
    this.stream = null;
    this.lastTime = -1;
    this.result = null;
  }

  async init(onStatus) {
    if (this.landmarker) return;
    onStatus?.('載入姿勢模型中…');
    const fs = await FilesetResolver.forVisionTasks(WASM);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numPoses: 4,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await PoseLandmarker.createFromOptions(fs, opts('GPU')); }
    catch { this.landmarker = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
    onStatus?.('姿勢模型就緒');
  }

  async startCamera() {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    await this.video.play();
  }

  async startFile(file) {
    this.stop();
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(file);
    this.video.loop = true;
    this.video.muted = false;
    await this.video.play();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    if (this.video.src?.startsWith('blob:')) URL.revokeObjectURL(this.video.src);
    this.video.removeAttribute('src');
    this.video.srcObject = null;
    this.result = null;
    this.lastTime = -1;
  }

  get active() { return !!(this.stream || this.video.currentSrc) && this.video.readyState >= 2; }

  // Returns sorted people [{world, norm}] (left-to-right as they appear on stage) or null if no new frame.
  update(mirror) {
    if (!this.landmarker || !this.active) return null;
    if (this.video.currentTime === this.lastTime) return null;
    this.lastTime = this.video.currentTime;
    const res = this.landmarker.detectForVideo(this.video, performance.now());
    const people = res.landmarks.map((norm, i) => ({ norm, world: res.worldLandmarks[i], x: (norm[23].x + norm[24].x) / 2 }));
    people.sort((a, b) => (mirror ? b.x - a.x : a.x - b.x));
    this.result = people;
    return people;
  }

  draw(mirror) {
    const { canvas, ctx, video } = this;
    const w = canvas.clientWidth * devicePixelRatio, h = canvas.clientHeight * devicePixelRatio;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    if (!this.active) return;
    // cover-fit the video
    const vr = video.videoWidth / video.videoHeight, cr = w / h;
    const dw = vr > cr ? w : h * vr, dh = vr > cr ? w / vr : h;
    const ox = (w - dw) / 2, oy = (h - dh) / 2;
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.globalAlpha = 1;
    const colors = ['#ff2a4a', '#ffd23f', '#3fd7ff', '#c77dff'];
    (this.result || []).forEach((p, pi) => {
      ctx.strokeStyle = colors[pi % 4];
      ctx.fillStyle = colors[pi % 4];
      ctx.lineWidth = 3 * devicePixelRatio;
      const pt = (i) => [ox + p.norm[i].x * dw, oy + p.norm[i].y * dh];
      for (const [a, b] of BONES) {
        if ((p.norm[a].visibility ?? 1) < 0.4 || (p.norm[b].visibility ?? 1) < 0.4) continue;
        ctx.beginPath(); ctx.moveTo(...pt(a)); ctx.lineTo(...pt(b)); ctx.stroke();
      }
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if ((p.norm[i].visibility ?? 1) < 0.4) continue;
        ctx.beginPath(); ctx.arc(...pt(i), 3.5 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.restore();
  }
}
