import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createDancer } from './dance.js';
import { createPerformance } from './performance.js';
import { models, modelById, loadAsset, instantiateAsset } from './models.js';
import { editorMaxDistance } from './framing.js';
import { $, $$, toast, keyBelongsToControl, formatPrecise, downloadURL, downloadBlob } from './ui.js';
import './style.css';
import './ux.css';

// ===========================================================================
// Constants
// ===========================================================================
const SCENE_LENGTH = 12;        // seconds on the editor timeline
const FRAME = 1 / 30;           // one timeline frame, used by the arrow keys
const KEY_SNAP = 0.02;          // two keyframes closer than this are the same keyframe
const TRANSFORM_KEYS = ['rotation', 'height', 'scale'];
const DEFAULT_POSE = { rotation: 0, height: 0, scale: 1 };
const MOTIONS = ['still', 'sway', 'turn', 'dance', 'float'];
const SPEEDS = [0.5, 1, 1.5, 2];

const PALETTES = {
  violet: { background: '#1d1b29', floor: 0x25222f, ring: 0xb8a4ff, swatch: '#7970ad', name: '紫夜舞台' },
  blue:   { background: '#142331', floor: 0x1d2c3b, ring: 0x7bd3ff, swatch: '#4e88ad', name: '深海舞台' },
  rose:   { background: '#2d1c29', floor: 0x382333, ring: 0xffa1c5, swatch: '#ac657d', name: '玫瑰舞台' },
  light:  { background: '#bbbbc6', floor: 0x9696a2, ring: 0xffffff, swatch: '#c5c6cd', name: '白色攝影棚' },
};

const CAMERA_VIEWS = {
  front: [0, 1.5, 8],
  side: [8, 1.5, 0],
  top: [0, 8, 0.01],
};

const RANGE_FIELDS = [
  { id: 'rotation', label: '朝向', value: 0, min: -180, max: 180, step: 1, unit: '°', digits: 0 },
  { id: 'height', label: '高度', value: 0, min: 0, max: 2, step: 0.01, unit: '', digits: 2 },
  { id: 'scale', label: '大小', value: 1, min: 0.4, max: 1.8, step: 0.01, unit: '×', digits: 2 },
];

const pad2 = n => String(n).padStart(2, '0');

// ===========================================================================
// Page markup
// ===========================================================================
function modelCardHTML({ id, name, format, preview }, index) {
  const selected = index === 0;
  return `
    <button class="model-card ${selected ? 'selected' : ''}" data-model="${id}" aria-pressed="${selected}">
      <div class="model-preview" id="thumb${id}">
        <span>${pad2(id)}</span>
        ${preview ? `<img src="${preview}" alt="${name} 預覽" loading="lazy">` : `<b>${name}</b>`}
      </div>
      <div class="model-info">
        <strong>${name}</strong>
        <span>角色 ${id} · ${format}</span>
        <i>${selected ? '●' : '＋'}</i>
      </div>
    </button>`;
}

function rangeFieldHTML({ id, label, value, min, max, step, unit }) {
  return `
    <label class="range-label" for="${id}">${label}<output id="${id}-value">${value}${unit}</output></label>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
}

$('#app').innerHTML = `
<header>
  <a class="brand" href="./"><b class="logo">H</b> HyperStage <span>STUDIO</span></a>
  <div class="project-name"><span id="project-title">Untitled performance</span> <span class="project-tag">本機專案</span></div>
  <button id="save" title="下載 JSON 專案檔">↥ 儲存專案</button>
  <button id="shot" class="primary" title="下載目前畫面 PNG">▣ 擷取畫面</button>
</header>
<main>
  <aside class="library">
    <div class="section-heading"><h2>模型庫</h2><span class="count">${models.length}</span></div>
    <p class="muted">YOUR CAST, YOUR STAGE</p>
    <div class="model-list">${models.map(modelCardHTML).join('')}</div>
    <button id="import" class="upload">＋ 匯入 GLB／FBX 模型</button>
    <input id="file" type="file" accept=".glb,.fbx" hidden>
    <div class="library-note">
      <b>從模型，到你的舞台。</b>
      <p>拖曳旋轉視角，滾輪縮放。<br>也可把 GLB／FBX／專案 JSON 直接拖進舞台。</p>
    </div>
    <button id="load-project" class="subtle">↳ 開啟已儲存專案</button>
    <input id="project-file" type="file" accept=".json" hidden>
  </aside>

  <section class="workspace">
    <div class="viewport-bar">
      <span><i class="live-dot"></i> 舞台預覽 <small>REALTIME 3D</small></span>
      <div>
        <button id="grid" class="tool active" aria-pressed="true" title="顯示網格 (G)">▦ 網格</button>
        <button id="reset-camera" class="tool" title="重設視角 (R)">⌖ 重設視角</button>
      </div>
    </div>
    <div id="viewport">
      <div class="stage-label">SCENE 01 <span>/</span> <b id="stage-name">紫夜舞台</b></div>
      <div id="loading" role="status" aria-live="polite">
        <i class="spinner" aria-hidden="true"></i>
        <span id="loading-text">載入角色中…</span>
        <div class="loading-bar"><i id="loading-bar"></i></div>
      </div>
      <div class="view-presets">
        <button data-view="front" title="正面 (1)">正面</button>
        <button data-view="side" title="側面 (2)">側面</button>
        <button data-view="top" title="俯視 (3)">俯視</button>
      </div>
      <div class="viewport-footer">
        <span id="model-status">HYPER3D MODEL</span>
        <span>拖曳旋轉 · 右鍵平移 · 滾輪縮放</span>
      </div>
      <div id="drop-hint" hidden><div>放開以匯入<br><small>GLB／FBX 模型或 HyperStage 專案 JSON</small></div></div>
    </div>

    <section class="timeline">
      <div class="transport">
        <div>
          <button id="rewind" title="回到起點 (Home)" aria-label="回到起點">⏮</button>
          <button id="play" class="play" aria-label="播放" title="播放／暫停 (Space)">▶</button>
          <button id="loop" class="active" aria-pressed="true" title="循環播放 (L)" aria-label="循環播放">↻</button>
          <strong id="time">00:00.00</strong>
          <span class="muted">/ ${formatPrecise(SCENE_LENGTH)}</span>
        </div>
        <div>
          <select id="speed" aria-label="播放速度">
            ${SPEEDS.map(s => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s.toFixed(1)}×</option>`).join('')}
          </select>
          <button id="add-key" title="在目前時間新增關鍵影格 (K)">◇ 新增關鍵影格</button>
        </div>
      </div>
      <div class="track">
        <span class="track-name">◈ 角色變換</span>
        <div class="track-body">
          <div class="ruler">${[0, 2, 4, 6, 8, 10, 12].map(n => `<span>${pad2(n)}s</span>`).join('')}</div>
          <div class="clip">
            <span id="clip-name">靜態展示</span>
            <div id="keys"></div>
            <i id="playhead" aria-hidden="true"></i>
          </div>
          <input id="scrub" aria-label="時間軸" type="range" min="0" max="${SCENE_LENGTH}" value="0" step="0.01">
        </div>
      </div>
      <div class="timeline-bottom">
        <span id="key-summary">尚無關鍵影格 · 按 K 新增</span>
        <button id="clear-keys" class="subtle">清除關鍵影格</button>
        <span class="shortcut-hint">Space 播放 · ←→ 逐格 · K 影格 · Del 刪除 · 點 ◆ 跳轉，雙擊刪除</span>
      </div>
    </section>
  </section>

  <aside class="inspector">
    <div class="section-heading"><h2>場景設定</h2><span>⚙</span></div>
    <section>
      <h3>動態 <span>MOTION</span></h3>
      <div class="motion-grid">
        <button data-motion="still" class="selected" aria-pressed="true">◈<span>靜態展示</span></button>
        <button data-motion="sway" aria-pressed="false">〰<span>節奏搖擺</span></button>
        <button data-motion="turn" aria-pressed="false">↻<span>環繞旋轉</span></button>
        <button data-motion="dance" aria-pressed="false">♫<span>骨架舞蹈</span></button>
        <button data-motion="float" aria-pressed="false">♧<span>輕盈浮動</span></button>
      </div>
      <p class="hint">預設動態作用於整個模型；內建動畫依時間軸播放。「骨架舞蹈」需 FBX 角色。</p>
    </section>
    <section>
      <h3>模型變換 <button id="reset-transform" class="subtle">重設</button></h3>
      ${RANGE_FIELDS.map(rangeFieldHTML).join('')}
      <p class="hint" id="transform-hint">拖曳滑桿調整角色；有關鍵影格時會記錄在目前時間。</p>
    </section>
    <section>
      <h3>舞台 <span>ENVIRONMENT</span></h3>
      <div class="swatches">
        ${Object.entries(PALETTES).map(([key, p], i) => `
          <button data-theme="${key}" class="${i === 0 ? 'selected' : ''}" aria-label="${p.name}" title="${p.name}"
            aria-pressed="${i === 0}" style="--swatch:${p.swatch}"></button>`).join('')}
      </div>
      <label class="range-label" for="light">燈光強度<output id="light-value">100%</output></label>
      <input id="light" type="range" min="30" max="200" value="100">
      <label class="toggle-row">自動環繞鏡頭<input id="orbit" type="checkbox"></label>
    </section>
    <div class="info">
      <span>✧</span>
      <div>創作從這裡開始<p>以關鍵影格記錄角色的位置、朝向與大小，再播放你的場景。</p></div>
    </div>
  </aside>
</main>
<footer>
  <span><i class="live-dot"></i> <b id="status">正在準備舞台</b></span>
  <span>HYPERSTAGE <span class="muted">/ MMD-STYLE MOTION STUDIO</span></span>
  <span>WebGL · 本機處理</span>
</footer>
<div id="toast" role="status" aria-live="polite"></div>`;

// Cached elements (looked up once, used every frame).
const el = {
  viewport: $('#viewport'),
  loading: $('#loading'),
  loadingText: $('#loading-text'),
  loadingBar: $('#loading-bar'),
  status: $('#status'),
  modelStatus: $('#model-status'),
  stageName: $('#stage-name'),
  play: $('#play'),
  loop: $('#loop'),
  rewind: $('#rewind'),
  time: $('#time'),
  scrub: $('#scrub'),
  speed: $('#speed'),
  keys: $('#keys'),
  keySummary: $('#key-summary'),
  playhead: $('#playhead'),
  clipName: $('#clip-name'),
  grid: $('#grid'),
  orbit: $('#orbit'),
  light: $('#light'),
  lightValue: $('#light-value'),
  dropHint: $('#drop-hint'),
};

// ===========================================================================
// Three.js scene
// ===========================================================================
// preserveDrawingBuffer is off for speed: screenshots and thumbnails render and
// read the canvas in the same task, which is all toDataURL needs.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
el.viewport.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTES.violet.background);
scene.fog = new THREE.Fog(PALETTES.violet.background, 12, 30);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = editorMaxDistance;
controls.maxPolarAngle = Math.PI / 2 + 0.06;

function resetCamera() {
  camera.position.set(0, 2.4, 7.8);
  controls.target.set(0, 1.35, 0);
  controls.update();
}
resetCamera();

scene.add(new THREE.HemisphereLight(0xcbd0ff, 0x635472, 2));

const keyLight = new THREE.DirectionalLight(0xfff1e8, 3.5);
keyLight.position.set(3, 6, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xa995ff, 3);
rimLight.position.set(-4, 3, -2);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: PALETTES.violet.floor, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.08;
floor.receiveShadow = true;
scene.add(floor);

const stage = new THREE.Mesh(
  new THREE.CylinderGeometry(1.7, 1.8, 0.12, 96),
  new THREE.MeshStandardMaterial({ color: 0x363142, metalness: 0.35, roughness: 0.55 }),
);
stage.position.y = -0.025;
stage.receiveShadow = true;
scene.add(stage);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.72, 0.012, 8, 128),
  new THREE.MeshBasicMaterial({ color: PALETTES.violet.ring }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.038;
scene.add(ring);

const grid = new THREE.GridHelper(30, 60, 0x51495f, 0x34313e);
grid.position.y = -0.07;
scene.add(grid);

const actor = new THREE.Group();
scene.add(actor);

// ===========================================================================
// Editor state
// ===========================================================================
const state = {
  root: null,          // the instantiated model under `actor`
  mixer: null,         // AnimationMixer for models with built-in clips
  dancer: null,        // procedural skeleton dancer (FBX only)
  request: 0,          // ticket to drop stale model loads
  currentModel: 1,     // bundled model id, or 'custom'
  time: 0,
  playing: false,
  loop: true,
  motion: 'still',
  theme: 'violet',
  keys: [],            // [{ time, rotation, height, scale }]
  base: { ...DEFAULT_POSE },
};
const assetCache = new Map();

// ===========================================================================
// Model loading
// ===========================================================================
function disposeObject(object) {
  object.traverse(node => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

function showLoading(text, fraction = null) {
  el.loading.hidden = false;
  el.loading.classList.remove('failed');
  el.loadingText.textContent = text;
  el.loading.classList.toggle('indeterminate', fraction === null);
  el.loadingBar.style.width = `${Math.round((fraction ?? 0) * 100)}%`;
}

function hideLoading() {
  el.loading.hidden = true;
}

function describeModel(id, format, animations) {
  const who = id === 'custom' ? '匯入角色' : `角色 ${pad2(id)}`;
  const kind = animations.some(c => c.duration > 0.1) ? '內建動畫' : animations.length ? '骨架姿勢' : '靜態網格';
  return `${who} · ${format} · ${kind}`;
}

function markSelectedModel(id) {
  for (const button of $$('[data-model]')) {
    const selected = Number(button.dataset.model) === id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('i').textContent = selected ? '●' : '＋';
  }
}

// FBX models have no preview image, so render one the first time they load.
function captureThumbnail(id) {
  const holder = $(`#thumb${id}`);
  if (!holder || holder.querySelector('img')) return;
  applyPose();
  renderer.render(scene, camera);
  const img = new Image();
  img.src = renderer.domElement.toDataURL('image/webp', 0.7);
  img.alt = `角色 ${pad2(id)} 預覽`;
  holder.append(img);
}

async function loadModel(source, id, format = modelById(id)?.format || 'GLB') {
  const ticket = ++state.request;
  const label = id === 'custom' ? '匯入模型' : modelById(id)?.name || '角色';
  showLoading(`載入 ${label}…`, assetCache.has(source) ? 1 : 0);
  el.status.textContent = '載入模型中';

  try {
    const asset = assetCache.get(source) || await loadAsset(source, format, fraction => {
      if (ticket === state.request) showLoading(`載入 ${label}… ${Math.round(fraction * 100)}%`, fraction);
    });

    // A newer click won the race; throw this one away.
    if (ticket !== state.request) {
      if (!assetCache.has(source)) disposeObject(asset.scene);
      return false;
    }
    if (typeof id === 'number') assetCache.set(source, asset);

    if (state.root) {
      actor.remove(state.root);
      if (state.currentModel === 'custom') disposeObject(state.root);
    }
    state.root = instantiateAsset(asset);
    state.dancer = createDancer(state.root);
    actor.add(state.root);
    state.currentModel = id;

    state.mixer = asset.animations.length ? new THREE.AnimationMixer(state.root) : null;
    for (const clip of asset.animations) state.mixer.clipAction(clip).play();

    el.modelStatus.textContent = describeModel(id, format, asset.animations);
    el.status.textContent = '舞台就緒';
    markSelectedModel(id);
    hideLoading();

    if (state.motion === 'dance' && !state.dancer.supported) {
      toast('此模型沒有可用骨架，骨架舞蹈改為原始姿勢；請選 FBX 角色');
    }
    if (typeof id === 'number') captureThumbnail(id);
    return true;
  } catch (error) {
    if (ticket !== state.request) return false;
    showLoading('模型載入失敗，請重新選擇或匯入 GLB／FBX');
    el.loading.classList.add('failed');
    el.status.textContent = '載入失敗';
    toast('模型載入失敗', { tone: 'error' });
    console.error(error);
    return false;
  }
}

function loadBundledModel(id) {
  const model = modelById(id);
  if (model) return loadModel(model.url, id, model.format);
  return Promise.resolve(false);
}

async function importModelFile(file) {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.glb') && !lower.endsWith('.fbx')) {
    toast('只支援 GLB 或 FBX 模型', { tone: 'error' });
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const ok = await loadModel(url, 'custom', lower.endsWith('.fbx') ? 'FBX' : 'GLB');
    if (ok) toast(`已匯入 ${file.name}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ===========================================================================
// Motion, keyframes and pose
// ===========================================================================
function setMotion(value) {
  state.dancer?.reset();
  state.motion = value;
  if (value === 'dance' && state.dancer && !state.dancer.supported) {
    toast('此模型沒有可用骨架，請選用 FBX 角色');
  }
  for (const button of $$('[data-motion]')) {
    const selected = button.dataset.motion === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  el.clipName.textContent = $(`[data-motion="${value}"] span`).textContent;
}

function sortedKeys() {
  return [...state.keys].sort((a, b) => a.time - b.time);
}

// Linear interpolation between the keyframes around the playhead.
function currentPose() {
  if (!state.keys.length) return state.base;
  const keys = sortedKeys();
  const before = [...keys].reverse().find(k => k.time <= state.time) || keys[0];
  const after = keys.find(k => k.time >= state.time) || keys.at(-1);
  const t = before === after ? 0 : (state.time - before.time) / (after.time - before.time);
  const pose = {};
  for (const key of TRANSFORM_KEYS) pose[key] = THREE.MathUtils.lerp(before[key], after[key], t);
  return pose;
}

function applyPose() {
  const pose = currentPose();
  const cycle = state.time * Math.PI * 2;

  actor.position.set(0, pose.height, 0);
  actor.rotation.set(0, THREE.MathUtils.degToRad(pose.rotation), 0);
  actor.scale.setScalar(pose.scale);

  if (state.motion === 'sway') {
    actor.rotation.z = Math.sin(cycle / 2) * 0.09;
    actor.position.x = Math.sin(cycle / 2) * 0.17;
  }
  if (state.motion === 'turn') actor.rotation.y += cycle / 12;
  if (state.motion === 'float') actor.position.y += (1 - Math.cos(cycle / 3)) * 0.16;

  if (state.motion === 'dance' && state.dancer?.supported) {
    state.dancer.apply(state.time, { intensity: 0.85 });
  } else if (state.mixer) {
    state.mixer.setTime(state.time);
  }
}

function keyIndexAt(time) {
  return state.keys.findIndex(k => Math.abs(k.time - time) < KEY_SNAP);
}

function addKeyframe() {
  const frame = { time: state.time, ...currentPose() };
  const existed = keyIndexAt(state.time) >= 0;
  state.keys = state.keys.filter(k => Math.abs(k.time - state.time) >= KEY_SNAP);
  state.keys.push(frame);
  renderKeys();
  toast(`${existed ? '已更新' : '已記錄'} ${state.time.toFixed(2)} 秒的關鍵影格`);
}

function deleteKeyframeAt(time) {
  const index = keyIndexAt(time);
  if (index < 0) {
    toast('目前時間沒有關鍵影格');
    return;
  }
  // Keep the pose where it is when the last key goes away.
  if (state.keys.length === 1) state.base = { ...currentPose() };
  state.keys.splice(index, 1);
  renderKeys();
  updateInputs();
  toast(`已刪除 ${time.toFixed(2)} 秒的關鍵影格`);
}

function clearKeyframes() {
  if (!state.keys.length) {
    toast('目前沒有關鍵影格');
    return;
  }
  state.base = { ...currentPose() };
  const count = state.keys.length;
  state.keys = [];
  renderKeys();
  updateInputs();
  toast(`已清除 ${count} 個關鍵影格`);
}

function renderKeys() {
  el.keys.innerHTML = sortedKeys().map(k => `
    <button class="key" style="left:${(k.time / SCENE_LENGTH) * 100}%" data-key-time="${k.time}"
      title="${k.time.toFixed(2)} 秒 · 點擊跳轉，雙擊刪除" aria-label="關鍵影格 ${k.time.toFixed(2)} 秒">◆</button>`).join('');
  markActiveKey();
  const n = state.keys.length;
  el.keySummary.textContent = n ? `${n} 個關鍵影格 · 影格間線性插值` : '尚無關鍵影格 · 按 K 新增';
}

function markActiveKey() {
  for (const button of el.keys.children) {
    button.classList.toggle('current', Math.abs(Number(button.dataset.keyTime) - state.time) < KEY_SNAP);
  }
}

function updateInputs() {
  const pose = currentPose();
  for (const field of RANGE_FIELDS) {
    const value = Number(state.keys.length ? pose[field.id] : state.base[field.id]);
    $(`#${field.id}`).value = value;
    $(`#${field.id}-value`).textContent = value.toFixed(field.digits) + field.unit;
  }
}

// ===========================================================================
// Transport
// ===========================================================================
function setPlaying(value) {
  state.playing = value;
  el.play.textContent = value ? 'Ⅱ' : '▶';
  el.play.setAttribute('aria-label', value ? '暫停' : '播放');
  el.play.classList.toggle('is-playing', value);
}

function togglePlay() {
  if (!state.playing && state.time >= SCENE_LENGTH) state.time = 0;
  setPlaying(!state.playing);
}

function seek(time) {
  state.time = THREE.MathUtils.clamp(time, 0, SCENE_LENGTH);
  updateTime();
  // While paused, the sliders follow the interpolated pose under the playhead.
  if (!state.playing && state.keys.length) updateInputs();
}

function setLoop(value) {
  state.loop = value;
  el.loop.classList.toggle('active', value);
  el.loop.setAttribute('aria-pressed', String(value));
}

function updateTime() {
  const percent = `${(state.time / SCENE_LENGTH) * 100}%`;
  el.scrub.value = state.time;
  el.scrub.style.setProperty('--progress', percent);
  el.playhead.style.left = percent;
  el.time.textContent = formatPrecise(state.time);
  markActiveKey();
}

// ===========================================================================
// Theme, light, camera
// ===========================================================================
function setTheme(value) {
  const palette = PALETTES[value];
  if (!palette) return;
  state.theme = value;
  scene.background.set(palette.background);
  scene.fog.color.set(palette.background);
  floor.material.color.set(palette.floor);
  ring.material.color.set(palette.ring);
  el.stageName.textContent = palette.name;
  for (const button of $$('[data-theme]')) {
    const selected = button.dataset.theme === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function setLight(percent) {
  el.light.value = percent;
  keyLight.intensity = (3.5 * percent) / 100;
  el.lightValue.textContent = `${percent}%`;
}

function setGrid(visible) {
  grid.visible = visible;
  el.grid.classList.toggle('active', visible);
  el.grid.setAttribute('aria-pressed', String(visible));
}

function setView(view) {
  controls.target.set(0, 1.35, 0);
  camera.position.set(...CAMERA_VIEWS[view]);
  controls.update();
}

// ===========================================================================
// Screenshot and project files
// ===========================================================================
function takeScreenshot() {
  renderer.render(scene, camera);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadURL(renderer.domElement.toDataURL('image/png'), `hyperstage-${stamp}.png`);
  toast('舞台截圖已匯出');
}

function saveProject() {
  if (state.currentModel === 'custom') {
    toast('匯入模型無法存進專案；請先切換回內建角色再儲存');
    return;
  }
  const data = {
    version: 1,
    model: state.currentModel,
    base: state.base,
    motion: state.motion,
    theme: state.theme,
    keys: state.keys,
    time: state.time,
    light: Number(el.light.value),
    speed: Number(el.speed.value),
    loop: state.loop,
    grid: grid.visible,
    orbit: el.orbit.checked,
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'hyperstage-project.json');
  toast('專案已儲存');
}

function validProject(p) {
  const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const validPose = x => x && finite(x.rotation, -180, 180) && finite(x.height, 0, 2) && finite(x.scale, 0.4, 1.8);
  const vector = x => Array.isArray(x) && x.length === 3 && x.every(n => finite(n, -100, 100));
  return p
    && p.version === 1
    && modelById(p.model)
    && MOTIONS.includes(p.motion)
    && Object.hasOwn(PALETTES, p.theme)
    && validPose(p.base)
    && Array.isArray(p.keys)
    && p.keys.length <= 1000
    && p.keys.every(k => validPose(k) && finite(k.time, 0, SCENE_LENGTH))
    && finite(p.time, 0, SCENE_LENGTH)
    && finite(p.light, 30, 200)
    && SPEEDS.includes(p.speed)
    && vector(p.camera)
    && vector(p.target);
}

async function openProjectFile(file) {
  try {
    const project = JSON.parse(await file.text());
    if (!validProject(project)) throw new Error('格式錯誤');
    if (show.active) show.exit();
    if (!await loadBundledModel(project.model)) return;

    state.base = project.base;
    state.keys = project.keys.map(k => ({ time: k.time, rotation: k.rotation, height: k.height, scale: k.scale }));
    state.time = project.time;
    setMotion(project.motion);
    setTheme(project.theme);
    setLight(project.light);
    el.speed.value = project.speed;
    setLoop(Boolean(project.loop));
    setGrid(Boolean(project.grid));
    el.orbit.checked = Boolean(project.orbit);
    camera.position.fromArray(project.camera);
    controls.target.fromArray(project.target);
    controls.update();
    setPlaying(false);
    updateTime();
    updateInputs();
    renderKeys();
    toast(`已開啟專案 ${file.name}`);
  } catch {
    toast('無法開啟：請選擇有效的 HyperStage 專案 JSON', { tone: 'error' });
  }
}

// ===========================================================================
// Render loop
// ===========================================================================
function onResize() {
  const width = el.viewport.clientWidth;
  const height = el.viewport.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(onResize).observe(el.viewport);

let lastFrame = performance.now();

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (!show.active && state.playing) {
    state.time += dt * Number(el.speed.value);
    if (state.time >= SCENE_LENGTH) {
      if (state.loop) {
        state.time %= SCENE_LENGTH;
      } else {
        state.time = SCENE_LENGTH;
        setPlaying(false);
      }
    }
    updateTime();
  }

  if (!show.active) {
    applyPose();
    controls.autoRotate = el.orbit.checked;
  }
  controls.update();
  show.update(dt);
  renderer.render(scene, camera);
}

// ===========================================================================
// Event wiring
// ===========================================================================
for (const button of $$('[data-model]')) {
  button.addEventListener('click', () => loadBundledModel(Number(button.dataset.model)));
}
for (const button of $$('[data-motion]')) {
  button.addEventListener('click', () => setMotion(button.dataset.motion));
}
for (const button of $$('[data-theme]')) {
  button.addEventListener('click', () => setTheme(button.dataset.theme));
}
for (const button of $$('[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}

el.play.addEventListener('click', togglePlay);
el.rewind.addEventListener('click', () => {
  setPlaying(false);
  seek(0);
});
el.loop.addEventListener('click', () => setLoop(!state.loop));
el.scrub.addEventListener('input', event => seek(Number(event.target.value)));

// Keyframe diamonds: click jumps to the key, double-click deletes it.
el.keys.addEventListener('click', event => {
  const button = event.target.closest('[data-key-time]');
  if (!button) return;
  setPlaying(false);
  seek(Number(button.dataset.keyTime));
});
el.keys.addEventListener('dblclick', event => {
  const button = event.target.closest('[data-key-time]');
  if (button) deleteKeyframeAt(Number(button.dataset.keyTime));
});

for (const field of RANGE_FIELDS) {
  $(`#${field.id}`).addEventListener('input', event => {
    const value = Number(event.target.value);
    state.base = { ...currentPose(), [field.id]: value };
    if (state.keys.length) {
      const index = keyIndexAt(state.time);
      const frame = { time: state.time, ...state.base };
      if (index < 0) state.keys.push(frame);
      else state.keys[index] = frame;
      renderKeys();
    }
    updateInputs();
  });
}

$('#reset-transform').addEventListener('click', () => {
  state.base = { ...DEFAULT_POSE };
  state.keys = [];
  renderKeys();
  updateInputs();
  toast('已重設模型變換');
});
$('#add-key').addEventListener('click', addKeyframe);
$('#clear-keys').addEventListener('click', clearKeyframes);

el.light.addEventListener('input', event => setLight(Number(event.target.value)));
el.grid.addEventListener('click', () => setGrid(!grid.visible));
$('#reset-camera').addEventListener('click', resetCamera);
$('#shot').addEventListener('click', takeScreenshot);
$('#save').addEventListener('click', saveProject);

$('#import').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) await importModelFile(file);
});

$('#load-project').addEventListener('click', () => $('#project-file').click());
$('#project-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) await openProjectFile(file);
});

// Drag and drop onto the stage: models or project files.
let dragDepth = 0;
el.viewport.addEventListener('dragenter', event => {
  if (show.active || !event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth++;
  el.dropHint.hidden = false;
});
el.viewport.addEventListener('dragover', event => {
  if (show.active || !event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
el.viewport.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) el.dropHint.hidden = true;
});
el.viewport.addEventListener('drop', async event => {
  if (show.active) return;
  event.preventDefault();
  dragDepth = 0;
  el.dropHint.hidden = true;
  const file = event.dataTransfer.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.json')) await openProjectFile(file);
  else await importModelFile(file);
});

// Keyboard: the lyric show gets first refusal while it is on screen.
function handleEditorKey(event) {
  const step = event.shiftKey ? 1 : FRAME;
  switch (event.key) {
    case ' ':
      togglePlay();
      return true;
    case 'ArrowLeft':
      setPlaying(false);
      seek(state.time - step);
      return true;
    case 'ArrowRight':
      setPlaying(false);
      seek(state.time + step);
      return true;
    case 'Home':
      setPlaying(false);
      seek(0);
      return true;
    case 'End':
      setPlaying(false);
      seek(SCENE_LENGTH);
      return true;
    case 'k':
    case 'K':
      addKeyframe();
      return true;
    case 'Delete':
    case 'Backspace':
      deleteKeyframeAt(state.time);
      return true;
    case 'l':
    case 'L':
      setLoop(!state.loop);
      toast(state.loop ? '循環播放：開' : '循環播放：關');
      return true;
    case 'g':
    case 'G':
      setGrid(!grid.visible);
      return true;
    case 'r':
    case 'R':
      resetCamera();
      return true;
    case '1':
      setView('front');
      return true;
    case '2':
      setView('side');
      return true;
    case '3':
      setView('top');
      return true;
    default:
      return false;
  }
}

window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (keyBelongsToControl(event)) return;
  const handled = show.active ? show.handleKey(event) : handleEditorKey(event);
  if (handled) event.preventDefault();
});

// ===========================================================================
// Start
// ===========================================================================
let themeBeforeShow = state.theme;

const show = createPerformance({
  scene,
  camera,
  controls,
  actor,
  stage,
  ring,
  setTheme,
  toast,
  onEnter: () => {
    themeBeforeShow = state.theme;
    setPlaying(false);
  },
  onExit: () => setTheme(themeBeforeShow),
});

renderKeys();
updateTime();
loadModel('/models/1/base_basic_pbr.glb', 1);
show.enter();
renderer.setAnimationLoop(frame);
