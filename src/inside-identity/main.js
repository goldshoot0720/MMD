import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Rig, makeSpec, copySpec, blendSpec } from './rig.js';
import { choreoSpec, sectionAt, idleSpec, MOVE_LABEL } from './choreo.js';
import { Stage } from './stage.js';

// sig: signature move for the 個人秀 section (sigMirror: perform it left-handed)
const CHARACTERS = [
  { file: 'Dpskmusume.fbx', name: 'Dpskmusume', color: '#ff2a4a', sig: 'vanish' },
  { file: 'Gugugaga-pose.fbx', name: 'Gugugaga', color: '#ffd23f', sig: 'guitar' },
  { file: 'Yamei.fbx', name: '牙妹 Yamei', color: '#3fd7ff', sig: 'mic' },
  { file: 'Yumei-pose.fbx', name: '魚妹 Yumei', color: '#c77dff', sig: 'heart' },
  { file: 'fengbro-pose.fbx', name: '鋒兄 Fengbro', color: '#ff8a3d', sig: 'cash' },
  { file: 'Tu-pose.fbx', name: '小塗 Tu', color: '#4dff9a', sig: 'wrench' },
  { file: 'Miabubu-pose.fbx', name: 'Miabubu', color: '#ff7ad9', sig: 'paw' },
  { file: 'Miabyby-pose.fbx', name: 'Miabyby', color: '#7a9bff', sig: 'paw', sigMirror: true },
].map((c) => ({ ...c, file: `${import.meta.env.BASE_URL}models/fbx/${c.file}` }));
// front row (first four characters) and a staggered back row behind the gaps
const SLOTS = [
  { x: -2.1, z: 0.3, yaw: 0.12 }, { x: -0.7, z: 0.6, yaw: 0.04 },
  { x: 0.7, z: 0.6, yaw: -0.04 }, { x: 2.1, z: 0.3, yaw: -0.12 },
  { x: -2.8, z: -0.85, yaw: 0.16 }, { x: -1.4, z: -0.7, yaw: 0.06 },
  { x: 1.4, z: -0.7, yaw: -0.06 }, { x: 2.8, z: -0.85, yaw: -0.16 },
];
// canon position: left-to-right rank scaled so a full canon still spans 3 steps
const byX = [...SLOTS].sort((a, b) => a.x - b.x);
SLOTS.forEach((s) => { s.k = (byX.indexOf(s) * 3) / (SLOTS.length - 1); });
const HEIGHT = 1.62;
const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(0, 1.5, 6.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 1;
controls.maxDistance = 16;

const stage = new Stage(scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const glitch = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.0015 }, time: { value: 0 }, slice: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount, time, slice; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float f = floor(time * 24.0);
      float band = floor(uv.y * 22.0);
      if (rand(vec2(band, f)) < slice) uv.x += (rand(vec2(band, f + 7.0)) - 0.5) * 0.12 * slice;
      vec2 o = vec2(amount, 0.0);
      vec3 c = vec3(texture2D(tDiffuse, uv + o).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - o).b);
      float scan = 0.95 + 0.05 * sin(vUv.y * 900.0);
      float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.5);
      gl_FragColor = vec4(c * scan * vig, 1.0);
    }`,
});
composer.addPass(glitch);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- characters ----------
const chars = [];

function toonify(mat) {
  const m = new THREE.MeshStandardMaterial({
    map: mat.map || null, color: 0xffffff, roughness: 0.85, metalness: 0,
    emissive: 0xffffff, emissiveMap: mat.map || null, emissiveIntensity: 0.28,
    transparent: mat.transparent, alphaTest: mat.alphaTest || 0, side: THREE.FrontSide,
  });
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: new THREE.Color(0xff2a4a) };
    sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n' +
      'outgoingLight += rimColor * rim * 0.9;\n#include <opaque_fragment>',
    );
  };
  return m;
}

// Fetch the FBX as bytes so we can also pull out its embedded PNG texture
// (the Hyper3D/Mixamo exports embed it but don't wire it to the material).
function fetchBytes(url, onProgress) {
  const fl = new THREE.FileLoader();
  fl.setResponseType('arraybuffer');
  return new Promise((res, rej) => fl.load(url, res, (e) => e.lengthComputable && onProgress(e.loaded / e.total), rej));
}

function embeddedPNG(buf) {
  const b = new Uint8Array(buf);
  const find = (sig, from = 0) => {
    outer: for (let i = from; i <= b.length - sig.length; i++) {
      for (let j = 0; j < sig.length; j++) if (b[i + j] !== sig[j]) continue outer;
      return i;
    }
    return -1;
  };
  const start = find([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (start < 0) return null;
  const iend = find([0x49, 0x45, 0x4e, 0x44], start);
  if (iend < 0) return null;
  return new Blob([b.subarray(start, iend + 8)], { type: 'image/png' });
}

async function loadTexture(blob) {
  const url = URL.createObjectURL(blob);
  const tex = await new THREE.TextureLoader().loadAsync(url);
  URL.revokeObjectURL(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

async function loadCharacters() {
  const loader = new FBXLoader();
  const prog = CHARACTERS.map(() => 0);
  const report = () => { $('loadBar').style.width = `${(prog.reduce((a, b) => a + b) / prog.length) * 100}%`; };
  const loaded = await Promise.all(CHARACTERS.map(async (c, i) => {
    const buf = await fetchBytes(c.file, (p) => { prog[i] = p; report(); });
    const obj = loader.parse(buf, '');
    const png = embeddedPNG(buf);
    return { obj, tex: png ? await loadTexture(png) : null };
  }));
  loaded.forEach(({ obj, tex }, i) => {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const conv = (m) => { if (!m.map && tex) m.map = tex; return toonify(m); };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    const box = new THREE.Box3().setFromObject(obj);
    const h = box.max.y - box.min.y;
    const s = HEIGHT / h;
    obj.scale.multiplyScalar(s);
    const slot = SLOTS[i];
    const baseY = -box.min.y * s;
    obj.position.set(slot.x, baseY, slot.z);
    obj.rotation.y = slot.yaw;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const rig = new Rig(obj);
    const restFootY = rig.footMinY();
    chars.push({ ...CHARACTERS[i], obj, rig, slot, baseY, restFootY, ground: 0, cur: makeSpec(), started: false, visible: true });
  });
}

// ---------- state ----------
const state = {
  mode: 'dance', playing: false, bpm: 190, offset: 0, beatClock: 0,
  mirror: true, delay: 0, smooth: 0.5, autoCam: true, fx: 1,
  lastSection: -1, lastShot: -1, spike: 0,
};
const music = $('music');
let audioCtx, analyser, freq;
let tracker = null;
const history = []; // [{t, specs}]
let lastSeen = -10;

function beatNow() {
  if (state.mode !== 'dance') return performance.now() / 1000 * 2;
  if (music.src && !music.paused) return (music.currentTime - state.offset) * state.bpm / 60;
  return state.beatClock;
}

function energy() {
  if (analyser && !music.paused) {
    analyser.getByteFrequencyData(freq);
    let s = 0;
    for (let i = 1; i < 12; i++) s += freq[i];
    return Math.min(1.4, (s / 11 / 255) * 1.5);
  }
  return state.mode === 'dance' ? (state.playing ? 0.9 : 0.4) : 0.6;
}

// ---------- camera director ----------
const SHOTS = [
  (u) => ({ p: [0, 1.5, 7 - 0.8 * u], t: [0, 1.1, 0] }),
  (u) => ({ p: [-4.2 + 1.8 * u, 0.45, 4.2], t: [0, 1.35, 0] }),
  (u, c) => close(c, u),
  (u) => { const a = -0.9 + 1.2 * u; return { p: [Math.sin(a) * 6, 3.4, Math.cos(a) * 6], t: [0, 0.9, 0] }; },
  (u) => ({ p: [0, 6.5 - 0.6 * u, 2.2], t: [0, 0.4, 0] }),
  (u) => ({ p: [4 - 1.6 * u, 1.1, 3.4], t: [0, 1.25, 0] }),
  (u, c) => close(c, u),
  (u) => ({ p: [0, 0.3, 4.6 - 0.5 * u], t: [0, 1.5, 0] }),
];
// close-ups cycle through the characters that are currently shown
const onStage = () => { const v = chars.filter((ch) => ch.visible); return v.length ? v : chars; };
function close(c, u) {
  const pool = onStage(), ch = pool[c % pool.length];
  const x = ch ? ch.obj.position.x : 0, z = ch ? ch.obj.position.z : 0;
  const lift = ch && ch.slot.z < 0 ? 0.4 : 0; // look over the front row
  return { p: [x + 0.4 - 0.5 * u, 1.4 + lift, z + 2.6 - 0.4 * u], t: [x, 1.2, z] };
}
// 個人秀: the featured character changes every two beats
const featured = (beat) => Math.floor(Math.max(0, beat) / 2);

function direct(beat, vanish, solo) {
  const len = vanish || solo ? 2 : 4;
  const n = Math.floor(beat / len);
  const u = (beat % len) / len;
  const shotIdx = vanish || solo ? 2 : n % SHOTS.length;
  const c = solo ? featured(beat) : vanish ? n : Math.floor(n / 2);
  const key = shotIdx * 100 + c + n * 1000;
  if (key !== state.lastShot) { state.lastShot = key; state.spike = 1; }
  const s = SHOTS[shotIdx](u, c);
  camera.position.set(...s.p);
  controls.target.set(...s.t);
  camera.lookAt(controls.target);
}

// ---------- UI ----------
function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function callout(text) {
  const el = $('callout'); el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  flash();
}
function setStatus(s) { $('hudStatus').textContent = s; }

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('secDance').hidden = mode !== 'dance';
  $('secCamera').hidden = mode !== 'camera';
  $('secVideo').hidden = mode !== 'video';
  $('secTrack').hidden = mode === 'dance';
  $('pip').hidden = mode === 'dance';
  $('pipLabel').textContent = mode === 'camera' ? 'CAMERA' : 'VIDEO';
  state.mirror = mode === 'camera';
  $('mirror').checked = state.mirror;
  history.length = 0;
  // foot targets only come from tracking; drop them so the rig's flat-foot default takes over
  for (const c of chars) for (const k of ['LeftFoot', 'RightFoot']) delete c.cur.dirs[k];
  if (mode !== 'dance') { if (!music.paused) togglePlay(); ensureTracker(); }
  else { tracker?.stop(); $('camBtn').textContent = '開啟攝像頭'; }
  setStatus(mode === 'dance' ? (state.playing ? '播放中' : '暫停') : '等待影像');
}

async function ensureTracker() {
  if (tracker) return tracker;
  setStatus('載入姿勢模型中…');
  const { Tracker } = await import('./tracker.js');
  tracker = new Tracker($('src'), $('pipCanvas'));
  await tracker.init(setStatus);
  return tracker;
}

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  const src = audioCtx.createMediaElementSource(music);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  freq = new Uint8Array(analyser.frequencyBinCount);
  src.connect(analyser).connect(audioCtx.destination);
}

function togglePlay() {
  state.playing = !state.playing;
  if (music.src) {
    ensureAudio();
    audioCtx.resume();
    state.playing ? music.play() : music.pause();
  }
  $('play').textContent = state.playing ? '❚❚ 暫停' : '▶ 播放';
  setStatus(state.playing ? '播放中' : '暫停');
}

function bindUI() {
  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('play').onclick = togglePlay;
  $('restart').onclick = () => { state.beatClock = 0; music.currentTime = 0; state.lastSection = -1; };
  $('bpm').oninput = (e) => { state.bpm = +e.target.value || 190; };
  $('offset').oninput = (e) => { state.offset = +e.target.value || 0; };
  const taps = [];
  $('tap').onclick = () => {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(t);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 4) {
      const bpm = Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
      state.bpm = bpm; $('bpm').value = bpm;
      // align the beat grid to the latest tap when music is playing
      if (music.src && !music.paused) {
        const beat = (music.currentTime - state.offset) * bpm / 60;
        const off = +(state.offset + (beat - Math.round(beat)) * 60 / bpm).toFixed(3);
        state.offset = off; $('offset').value = off;
      }
    }
  };
  const loadMusic = (file) => {
    if (!file) return;
    if (music.src.startsWith('blob:')) URL.revokeObjectURL(music.src);
    music.src = URL.createObjectURL(file);
    $('musicDrop').firstChild.textContent = `♪ ${file.name}`;
    state.playing = false; togglePlay();
  };
  $('musicFile').onchange = (e) => loadMusic(e.target.files[0]);
  $('camBtn').onclick = async () => {
    const t = await ensureTracker();
    if (t.stream) { t.stop(); $('camBtn').textContent = '開啟攝像頭'; setStatus('攝像頭已關閉'); return; }
    try { await t.startCamera(); $('camBtn').textContent = '關閉攝像頭'; setStatus('追蹤中'); }
    catch (err) { setStatus('無法開啟攝像頭：' + err.message); }
  };
  const loadVideo = async (file) => {
    if (!file) return;
    const t = await ensureTracker();
    await t.startFile(file);
    t.video.playbackRate = +$('rate').value;
    $('videoDrop').firstChild.textContent = `🎬 ${file.name}`;
    setStatus('追蹤中');
  };
  $('videoFile').onchange = (e) => loadVideo(e.target.files[0]);
  for (const [id, fn] of [['musicDrop', loadMusic], ['videoDrop', loadVideo]]) {
    const el = $(id);
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag'); fn(e.dataTransfer.files[0]); });
  }
  $('rate').oninput = (e) => { $('rateVal').textContent = `${(+e.target.value).toFixed(2)}×`; if (tracker) tracker.video.playbackRate = +e.target.value; };
  $('pip').onclick = () => { const v = $('src'); if (state.mode === 'video' && v.currentSrc) v.paused ? v.play() : v.pause(); };
  $('mirror').onchange = (e) => { state.mirror = e.target.checked; history.length = 0; };
  $('delay').oninput = (e) => { state.delay = +e.target.value; $('delayVal').textContent = `${state.delay.toFixed(2)}s`; };
  $('smooth').oninput = (e) => { state.smooth = +e.target.value; };
  $('autoCam').onchange = (e) => { state.autoCam = e.target.checked; };
  controls.addEventListener('start', () => { state.autoCam = false; $('autoCam').checked = false; });
  $('fx').oninput = (e) => { state.fx = +e.target.value; };
  $('toggle').onclick = () => $('panel').classList.toggle('collapsed');
  if (matchMedia('(max-width: 720px)').matches) $('panel').classList.add('collapsed');
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); if (state.mode === 'dance') togglePlay(); } });

  const box = $('chars');
  chars.forEach((c) => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" checked><i style="background:${c.color}"></i>${c.name}`;
    l.querySelector('input').onchange = (e) => { c.visible = e.target.checked; c.obj.visible = c.visible; };
    box.appendChild(l);
  });
}

// ---------- per-frame ----------
function trackingTargets(now) {
  if (tracker) {
    const people = tracker.update(state.mirror);
    if (people) {
      if (people.length) {
        lastSeen = now;
        // lazy import is resolved by now; convert landmarks to specs
        history.push({ t: now, specs: people.map((p) => landmarksToSpec(p.world, p.norm, state.mirror)) });
      }
      $('pipLabel').textContent = `${state.mode === 'camera' ? 'CAMERA' : 'VIDEO'} · ${people.length} 人`;
    }
    tracker.draw(state.mirror);
  }
  while (history.length && history[0].t < now - 2) history.shift();
  return chars.map((c, i) => {
    if (now - lastSeen > 1 || !history.length) return idleSpec(now * 1.6);
    const want = now - state.delay * c.slot.k;
    let e = history[0];
    for (const h of history) { if (h.t <= want) e = h; else break; }
    return e.specs[i % e.specs.length];
  });
}

let landmarksToSpec = null;
import('./tracker.js').then((m) => { landmarksToSpec = m.landmarksToSpec; }).catch(() => {});

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = clock.elapsedTime;
  if (state.mode === 'dance' && state.playing && !(music.src && !music.paused)) state.beatClock += dt * state.bpm / 60;
  const beat = beatNow();
  const en = energy();

  let targets;
  let sec = null;
  if (state.mode === 'dance') {
    sec = sectionAt(beat);
    const idle = !state.playing && beat <= 0;
    targets = chars.map((c, i) => (idle ? idleSpec(now * 1.2)
      : choreoSpec(beat, i, { k: c.slot.k, sig: c.sig, sigMirror: c.sigMirror })));
    if (sec.idx !== state.lastSection) {
      if (state.lastSection !== -1 && sec.call) callout(sec.call);
      state.lastSection = sec.idx;
    }
    if (sec.move === 'solo') {
      const pool = onStage(), star = pool[featured(beat) % pool.length];
      $('hudMove').textContent = `個人秀 · ${star.name}「${MOVE_LABEL[star.sig]}」`;
    } else $('hudMove').textContent = MOVE_LABEL[sec.move];
  } else {
    targets = landmarksToSpec ? trackingTargets(now) : chars.map(() => idleSpec(now));
    $('hudMove').textContent = state.mode === 'camera' ? '攝像頭模仿' : '影片模仿';
  }
  $('hudBar').textContent = Math.floor(Math.max(0, beat) / 4) + 1;
  $('hudBeat').textContent = (Math.floor(Math.max(0, beat)) % 4) + 1;

  const rate = state.mode === 'dance' ? 22 : 30 * (1.05 - state.smooth);
  const a = 1 - Math.exp(-dt * rate);
  chars.forEach((c, i) => {
    if (!c.started) { copySpec(c.cur, targets[i]); c.started = true; }
    else blendSpec(c.cur, c.cur, targets[i], a);
    const { obj, slot, rig, cur } = c;
    obj.position.set(slot.x + cur.rootX, c.baseY, slot.z);
    obj.rotation.y = slot.yaw + cur.rootYaw;
    rig.apply(cur);
    const corr = c.restFootY - rig.footMinY();
    if (Number.isFinite(corr)) c.ground += (corr - c.ground) * Math.min(1, dt * 20);
    obj.position.y = c.baseY + c.ground + cur.rootY;
  });

  const vanish = sec?.move === 'vanish';
  if (state.autoCam) direct(beat, vanish && state.mode === 'dance', sec?.move === 'solo');
  else controls.update();

  stage.update(now, beat, en * state.fx);
  const accent = Math.exp(-6 * (beat - Math.floor(beat)));
  state.spike *= Math.exp(-dt * 8);
  glitch.uniforms.time.value = now;
  glitch.uniforms.amount.value = (0.0012 + 0.004 * accent * en + 0.012 * state.spike) * state.fx;
  glitch.uniforms.slice.value = Math.min(1, state.spike * 0.8 + (vanish ? 0.08 : 0)) * state.fx;
  bloom.strength = (0.45 + 0.35 * accent * en + (vanish ? 0.3 : 0)) * Math.min(1, state.fx);
  composer.render();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
loadCharacters()
  .then(() => {
    bindUI();
    $('loading').classList.add('done');
    setStatus('按 ▶ 播放開始跳舞');
    requestAnimationFrame(frame);
  })
  .catch((err) => {
    console.error(err);
    $('loadText').textContent = '載入失敗：' + err.message + '（請用本地伺服器開啟，而非 file://）';
  });
