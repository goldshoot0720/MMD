// HyperStage PV: a music-video renderer for every song in the lyric theatre.
//
//   /                   song menu, real-time playback with sound (the site's home page)
//   /?song=s023         play that song straight away (&t=40 to start at 40 s)
//   /?render            no playback; tools/render-pv.mjs drives window.PV frame by frame
//
// Every frame is a pure function of the song time: background → 3D cast (or .pet
// windows of close-ups) → typography → post. That is what makes offline rendering exact.
import * as THREE from 'three';
import { createDancer } from '../dance.js';
import { coupleCue, applyCouples } from '../couples.js';
import { timedCue } from '../lrc.js';
import { actorPose } from '../song-data.js';
import { songs, songById } from '../songs.js';
import { modelById, loadAsset, instantiateAsset } from '../models.js';
import { createBackground, speedLines } from './bg.js';
import { toonify } from './toon.js';
import { mix, rgb, css, CANDY } from './color.js';
import { styleFor, moodName } from './styles.js';
import { buildTimeline, findAt, smooth, lerp, clamp } from './timeline.js';
import { drawLyric, drawTitle, drawChapterTab, drawProp, drawHud, drawTicker, drawEnding, drawWindowFrame } from './type.js';

const W = 1920;
const H = 1080;
const FPS = 30;
const params = new URLSearchParams(location.search);
const renderMode = params.has('render');

const STORY_PROPS = { jackpot: '✦ 今彩 539 · 中頭獎啦！ ✦', wedding: '♡ DOUBLE HAPPINESS ♡', dance: '♡ 愛情 × 運氣 ＝ 甜蜜 ♡' };

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------
const out = document.getElementById('out');
const ctx = out.getContext('2d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.domElement.id = 'gl';
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // cel shading keeps flat, saturated colours
renderer.setClearColor(0x000000, 0);
document.body.append(renderer.domElement);
const gl = renderer.domElement;

// Vignette, drawn once.
const vignette = document.createElement('canvas');
vignette.width = W; vignette.height = H;
{
  const v = vignette.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.55)');
  v.fillStyle = g;
  v.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
const windowCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

const hemi = new THREE.HemisphereLight(0xffffff, 0x302040, 1.4);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1e8, 1.8);
key.position.set(3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight(0xa995ff, 1.2);
rim.position.set(-4, 4, -4);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xff9ccf, 0.9);
rim2.position.set(5, 3, -3);
scene.add(rim2);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  for (const [at, color] of stops) r.addColorStop(at, color);
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const floorMaterial = new THREE.MeshBasicMaterial({
  map: radialTexture([[0, 'rgba(255,255,255,.95)'], [0.45, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]),
  transparent: true, depthWrite: false,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.06;
scene.add(floor);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.35 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -0.05;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);
const glowMaterial = new THREE.MeshBasicMaterial({
  map: radialTexture([[0, 'rgba(255,255,255,.9)'], [0.6, 'rgba(255,255,255,.25)'], [1, 'rgba(255,255,255,0)']]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), glowMaterial);
glowDisc.rotation.x = -Math.PI / 2;
glowDisc.position.y = -0.04;
scene.add(glowDisc);
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const rings = [3.2, 3.6].map(r => {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 8, 160), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;
  scene.add(ring);
  return ring;
});

const cast = new THREE.Group();
scene.add(cast);
const performers = Array.from({ length: 4 }, () => {
  const g = new THREE.Group();
  cast.add(g);
  return g;
});

// ---------------------------------------------------------------------------
// Song state
// ---------------------------------------------------------------------------
const assets = new Map();
let current = null; // { song, style, timeline, background, dancers, energy, names, number }

function loadModel(id) {
  if (!assets.has(id)) {
    const model = modelById(id);
    assets.set(id, loadAsset(model.url, model.format));
  }
  return assets.get(id);
}

// Loudness envelope (0..1 per frame) and onsets, from the decoded MP3.
async function analyse(url) {
  const data = await (await fetch(url)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(data);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const hop = Math.floor(audio.sampleRate / FPS);
  const frames = Math.ceil(audio.length / hop);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const end = Math.min(audio.length, (f + 1) * hop);
    for (let i = f * hop; i < end; i += 2) for (const c of channels) sum += c[i] * c[i];
    rms[f] = Math.sqrt(sum / Math.max(1, ((end - f * hop) / 2) * channels.length));
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.97)] || 1;
  const energy = new Float32Array(frames);
  const kick = new Float32Array(frames);
  let level = 0;
  for (let f = 0; f < frames; f++) {
    const v = Math.min(1, rms[f] / top);
    level = v > level ? v : level * 0.9 + v * 0.1;
    energy[f] = level;
    let avg = 0;
    for (let k = 1; k <= 8; k++) avg += rms[Math.max(0, f - k)];
    kick[f] = clamp((rms[f] - (avg / 8) * 1.15) / (top * 0.25), 0, 1);
  }
  for (let f = 1; f < frames; f++) kick[f] = Math.max(kick[f], kick[f - 1] * 0.82);
  return { energy, kick, duration: audio.duration };
}

// FBX textures decode asynchronously; rendering before they arrive paints the cast black.
async function texturesReady() {
  const textures = new Set();
  cast.traverse(node => {
    if (!node.isMesh) return;
    for (const material of [node.material].flat()) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const loaded = image => image && (image.complete === undefined ? image.width > 0 : image.complete && image.naturalWidth > 0);
  for (let tries = 0; tries < 600 && [...textures].some(t => !loaded(t.image)); tries++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const texture of textures) {
    texture.needsUpdate = true;
    renderer.initTexture(texture);
  }
  renderer.compile(scene, camera);
}

async function load(id) {
  const song = songById(id);
  if (!song) throw new Error(`unknown song ${id}`);
  const style = styleFor(song.id);
  const analysis = await analyse(song.audio);
  const ids = song.defaultCast;
  const loaded = await Promise.all(ids.map(loadModel));
  const dancers = [];
  performers.forEach((performer, i) => {
    performer.clear();
    const model = toonify(instantiateAsset(loaded[i]));
    performer.add(model);
    dancers.push(createDancer(model));
  });
  await texturesReady();
  const timeline = buildTimeline(song, analysis.duration);
  current = {
    song, style, timeline, dancers,
    energy: analysis.energy, kick: analysis.kick,
    names: song.cast.map(c => c.name),
    number: songs.indexOf(song) + 1,
    background: createBackground(W, H, style, (songs.indexOf(song) + 1) * 0.0731),
    ticker: style.pattern === 'scanlines'
      ? `${song.title} ・ ${song.chapters.map(c => c.title).join(' ・ ')} ・ `
      : '',
  };
  return { id: song.id, title: song.title, duration: analysis.duration, fps: FPS, frames: Math.ceil(analysis.duration * FPS) };
}

// ---------------------------------------------------------------------------
// Look: palette blended across chapter changes
// ---------------------------------------------------------------------------
function moodLook(mood) {
  const weights = {};
  mood.particles.forEach((kind, i) => { weights[kind] = [1, 0.7, 0.5][i] ?? 0.4; });
  return {
    top: rgb(mood.top), bottom: rgb(mood.bottom), glow: rgb(mood.glow), accent: rgb(mood.accent), ink: rgb(mood.ink),
    light: mood.light ? 1 : 0, weights,
  };
}

function lookAt(t, chapterIndex) {
  const { style, timeline } = current;
  const chapters = timeline.chapters;
  const moodOf = i => style[i < 0 ? 'calm' : moodName(chapters[i].action)];
  const now = moodLook(moodOf(chapterIndex));
  const start = chapterIndex < 0 ? 0 : chapters[chapterIndex].start;
  const k = chapterIndex < 0 ? 1 : smooth((t - start) / 1.2);
  if (k < 1) {
    const before = moodLook(moodOf(chapterIndex - 1));
    for (const field of ['top', 'bottom', 'glow', 'accent', 'ink']) now[field] = mix(before[field], now[field], k);
    now.light = lerp(before.light, now.light, k);
    const weights = {};
    for (const kind of new Set([...Object.keys(before.weights), ...Object.keys(now.weights)])) {
      weights[kind] = (before.weights[kind] ?? 0) * (1 - k) + (now.weights[kind] ?? 0) * k;
    }
    now.weights = weights;
  }
  const f = clamp(Math.floor(t * FPS), 0, current.energy.length - 1);
  now.energy = current.energy[f];
  now.kick = current.kick[f];
  return now;
}

// ---------------------------------------------------------------------------
// Cast pose
// ---------------------------------------------------------------------------
function poseCast(t) {
  const { song, timeline, dancers } = current;
  const cue = timedCue(t, timeline.duration, song.cues, song.lyrics, song.chapters, song.title);
  const action = cue.chapterData.action;
  performers.forEach((performer, i) => {
    const pose = actorPose(i, t, cue);
    performer.position.set(pose.x, pose.y, pose.z);
    performer.rotation.set(0, pose.ry, pose.rz);
    performer.scale.setScalar(pose.scale);
  });
  const inIntro = cue.index < 0;
  const chapterStart = inIntro ? 0 : timeline.chapters[cue.chapter].start;
  const next = timeline.chapters[cue.chapter + 1];
  dancers.forEach((dancer, i) => {
    dancer.apply(t, {
      action: inIntro ? 'intro' : action,
      moves: inIntro ? undefined : cue.chapterData.moves,
      previousMoves: cue.chapter > 0 ? song.chapters[cue.chapter - 1].moves : undefined,
      bpm: song.bpm,
      intensity: 0.92,
      index: i,
      offset: song.cues[0].time,
      previousAction: cue.chapter > 0 ? song.chapters[cue.chapter - 1].action : 'intro',
      transition: Math.min(1, Math.max(0, t - chapterStart)),
    });
  });
  if (song.couples) {
    const remaining = (next ? next.start : timeline.duration) - t;
    applyCouples(performers, dancers, coupleCue(inIntro ? 'intro' : action, t - chapterStart, remaining, 'auto', true));
  }
  return cue;
}

const head = i => {
  const p = performers[i];
  return new THREE.Vector3(p.position.x, p.position.y + 2.8 * p.scale.y * 0.86, p.position.z);
};

function frontRow() {
  const front = performers.map((p, i) => i).filter(i => performers[i].scale.x >= 0.74);
  return front.length ? front : [0, 1, 2, 3];
}

// ---------------------------------------------------------------------------
// Camera shots
// ---------------------------------------------------------------------------
function placeCamera(shot, t, shake) {
  const u = smooth(clamp((t - shot.start) / Math.max(0.1, shot.end - shot.start), 0, 1));
  const dir = shot.seed < 0.5 ? -1 : 1;
  const front = frontRow();
  const focus = front[Math.floor(shot.seed * 997) % front.length];
  const center = new THREE.Vector3(0, 1.25, 0);
  let pos;
  let target = center.clone();
  let roll = 0;
  let fov = 36;
  switch (shot.type) {
    case 'wide': pos = new THREE.Vector3(lerp(-1, 1, u) * dir, 2.6, lerp(10.5, 9, u)); break;
    case 'push': pos = new THREE.Vector3(0.6 * dir, 2.1, lerp(9, 5.6, u)); target = new THREE.Vector3(0, 1.4, 0); break;
    case 'solo': {
      const h = head(focus);
      pos = h.clone().add(new THREE.Vector3(lerp(-1.1, 1.1, u) * dir, -0.25, 3.8));
      target = h.clone().add(new THREE.Vector3(0, -0.45, 0));
      fov = 32;
      break;
    }
    case 'face': {
      const h = head(focus);
      pos = h.clone().add(new THREE.Vector3(lerp(-0.35, 0.35, u) * dir, 0.05, lerp(2.3, 1.9, u)));
      target = h.clone().add(new THREE.Vector3(0, -0.12, 0));
      fov = 30;
      break;
    }
    case 'low': pos = new THREE.Vector3(lerp(-2.2, 2.2, u) * dir, 0.45, 5.6); target = new THREE.Vector3(0, 1.75, 0); fov = 42; break;
    case 'orbit': {
      const a = (shot.seed - 0.5) * 1.6 + lerp(-0.55, 0.55, u) * dir;
      pos = new THREE.Vector3(Math.sin(a) * 8, 2.5, Math.cos(a) * 8);
      break;
    }
    case 'crane': pos = new THREE.Vector3(0.4, lerp(8, 2.6, u), lerp(5.5, 9.5, u)); target = new THREE.Vector3(0, lerp(0.6, 1.25, u), 0); break;
    case 'dutch': pos = new THREE.Vector3(1.8 * dir, 1.9, lerp(6.6, 6, u)); roll = 0.13 * dir; target = new THREE.Vector3(0, 1.45, 0); break;
    case 'top': pos = new THREE.Vector3(lerp(-1, 1, u), lerp(9.5, 8, u), 3.2); target = new THREE.Vector3(0, 0.6, 0); fov = 40; break;
    case 'pullback': pos = new THREE.Vector3(0, lerp(2.4, 3.6, u), lerp(8, 13, u)); break;
    default: pos = new THREE.Vector3(0, 2.6, 9.5);
  }
  pos.x += Math.sin(t * 0.7) * 0.06; // handheld drift
  pos.y += Math.sin(t * 0.9 + 1) * 0.04;
  if (shake) {
    pos.x += Math.sin(t * 91) * 0.05 * shake;
    pos.y += Math.cos(t * 77) * 0.05 * shake;
  }
  camera.fov = fov;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.rotateZ(roll);
}

function applyLights(look) {
  hemi.color.setRGB(...mix(look.glow, [255, 255, 255], 0.6).map(v => v / 255));
  hemi.groundColor.setRGB(...look.bottom.map(v => v / 255));
  rim.color.setRGB(...look.glow.map(v => v / 255));
  rim2.color.setRGB(...look.accent.map(v => v / 255));
  rim.intensity = 1 + look.energy * 0.8;
  const floorTint = look.light > 0.5 ? mix([255, 255, 255], look.accent, 0.15) : mix(look.bottom, [0, 0, 0], 0.35);
  floorMaterial.color.setRGB(...floorTint.map(v => v / 255));
  floorMaterial.opacity = look.light > 0.5 ? 0.7 : 0.95;
  glowMaterial.color.setRGB(...look.glow.map(v => (v / 255) * (0.25 + look.energy * 0.35)));
  ringMaterial.color.setRGB(...look.accent.map(v => v / 255));
  rings.forEach((ring, i) => ring.scale.setScalar(1 + look.kick * 0.04 * (i + 1)));
}

// ---------------------------------------------------------------------------
// .pet windows: close-ups of each cast member in cute app windows
// ---------------------------------------------------------------------------
const WINDOW_LAYOUT = [
  { x: 110, y: 250, w: 400, h: 560, r: -0.035 },
  { x: 560, y: 330, w: 400, h: 560, r: 0.025 },
  { x: 1010, y: 230, w: 400, h: 560, r: -0.02 },
  { x: 1460, y: 320, w: 400, h: 560, r: 0.035 },
];

function drawWindows(shot, t, look) {
  const since = t - shot.start;
  const leaving = shot.end - t;
  const bg = look.light > 0.5 ? css(mix(look.top, [255, 255, 255], 0.5)) : css(mix(look.bottom, [255, 255, 255], 0.12));
  renderer.setScissorTest(true);
  WINDOW_LAYOUT.forEach((rect, i) => {
    const k = clamp((since - i * 0.12) / 0.45, 0, 1);
    const pop = k <= 0 ? 0 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    const out = smooth(leaving / 0.3);
    const scale = pop * out;
    if (scale <= 0.01) return;
    // Close-up of performer i.
    const h = head(i);
    windowCamera.aspect = rect.w / rect.h;
    windowCamera.fov = 30;
    windowCamera.updateProjectionMatrix();
    windowCamera.position.copy(h).add(new THREE.Vector3(Math.sin(t * 0.5 + i) * 0.4, 0.15, 2.9));
    windowCamera.lookAt(h.clone().add(new THREE.Vector3(0, -0.3, 0)));
    const glY = H - rect.y - rect.h;
    renderer.setViewport(rect.x, glY, rect.w, rect.h);
    renderer.setScissor(rect.x, glY, rect.w, rect.h);
    renderer.clear();
    renderer.render(scene, windowCamera);

    const float = Math.sin(t * 1.3 + i * 1.7) * 10;
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2 + float);
    ctx.rotate(rect.r);
    ctx.scale(scale, scale);
    ctx.translate(-rect.w / 2, -rect.h / 2);
    drawWindowFrame(ctx, 0, 0, rect.w, rect.h, current.names[i], CANDY[(i * 2 + current.number) % CANDY.length], bg);
    ctx.filter = 'saturate(1.3) contrast(1.06)';
    ctx.drawImage(gl, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    ctx.filter = 'none';
    ctx.restore();
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function frame(t) {
  if (!current) return;
  const { timeline, background, song, style } = current;
  const cue = poseCast(t);
  const chapterIndex = cue.index < 0 ? -1 : cue.chapter;
  const look = lookAt(t, chapterIndex);
  const lineIndex = findAt(timeline.lines, t);
  const line = lineIndex >= 0 && t < timeline.lines[lineIndex].end && t < timeline.outroStart ? timeline.lines[lineIndex] : null;
  const shot = timeline.shots[Math.max(0, findAt(timeline.shots, t))];
  const hot = moodName(cue.chapterData.action) !== 'calm';

  applyLights(look);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  background.draw(ctx, look, t, line);

  const shake = hot ? look.kick : 0;
  if (shot.type === 'windows') {
    drawWindows(shot, t, look);
  } else {
    placeCamera(shot, t, shake);
    renderer.clear();
    renderer.render(scene, camera);
    const zoom = 1 + (hot ? look.kick * 0.025 : 0);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.filter = 'saturate(1.3) contrast(1.06)';
    ctx.drawImage(gl, -W / 2, -H / 2, W, H);
    ctx.filter = 'none';
    ctx.restore();
  }
  background.front(ctx, look, t);

  // Manga focus lines on loud hits in choruses and on the first beats of a hot chapter.
  const chapterSince = chapterIndex >= 0 ? t - timeline.chapters[chapterIndex].start : 99;
  const focus = hot ? Math.max((look.kick - 0.35) * 1.6, 1 - chapterSince / 0.7) : 0;
  if (focus > 0) speedLines(ctx, Math.min(1, focus), t, W, H, look.light > 0.5);

  // Typography.
  const inset = current.ticker ? 58 : 0;
  const intro = timeline.intro;
  const titleEnd = intro >= 3 ? (intro > 6 ? intro * 0.55 : intro) - 0.1 : 5;
  if (t < titleEnd) drawTitle(ctx, { song, style, number: current.number, total: songs.length }, t, titleEnd, look, W, H, intro < 3);
  if (chapterIndex >= 0 && t < timeline.outroStart) {
    const chapter = timeline.chapters[chapterIndex];
    drawChapterTab(ctx, chapter, chapterIndex, t, look, W);
    const prop = chapter.prop ?? (song.couples ? STORY_PROPS[chapter.action] : '');
    if (prop && !(line?.mode === 'impact')) drawProp(ctx, prop, t - chapter.start, W);
  }
  if (line) drawLyric(ctx, line, t, look, W, H, { inset, label: `♪ ${song.title}.lrc` });
  if (t > 1 && t < timeline.outroStart) drawHud(ctx, current.number, song.title, look, W);
  if (current.ticker) drawTicker(ctx, current.ticker, t, W, H);

  // Cut flashes on chorus cuts and chapter changes.
  const sinceShot = t - shot.start;
  const chapterStart = chapterIndex >= 0 ? timeline.chapters[chapterIndex].start : -9;
  const flash = Math.max(shot.cut && hot ? 0.45 * (1 - sinceShot / 0.18) : 0, 0.7 * (1 - (t - chapterStart) / 0.3));
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, flash)})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawEnding(ctx, { song, cast: current.names }, t, timeline.outroStart, timeline.duration, look, W, H);

  // Post: vignette and a fade in from black. No film grain: cel animation stays clean.
  ctx.globalAlpha = look.light > 0.5 ? 0.35 : 1;
  ctx.drawImage(vignette, 0, 0);
  ctx.globalAlpha = 1;
  if (t < 0.6) {
    ctx.fillStyle = `rgba(0,0,0,${1 - smooth(t / 0.6)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------------------
// Offline render API (tools/render-pv.mjs)
// ---------------------------------------------------------------------------
window.PV = {
  songs: songs.map(s => ({ id: s.id, title: s.title })),
  load,
  frame,
  async jpeg(quality = 0.92) {
    const blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', quality));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  },
};

// ---------------------------------------------------------------------------
// Real-time preview
// ---------------------------------------------------------------------------
const status = document.getElementById('status');
const menu = document.getElementById('menu');
const transport = document.getElementById('transport');
const scrub = document.getElementById('scrub');
const elapsedLabel = document.getElementById('elapsed');
const totalLabel = document.getElementById('total');
const playButton = document.getElementById('play');
const audio = new Audio();
let raf = 0;
let scrubbing = false;
let playToken = 0;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function mediaDuration() {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  const max = Number(scrub.max);
  return Number.isFinite(max) ? max : 0;
}

function paintTransport() {
  const duration = mediaDuration();
  const time = scrubbing ? Number(scrub.value) : (audio.currentTime || 0);
  // While a finger is down, the tick must not snap the thumb back to the playhead.
  if (!scrubbing) {
    if (duration) scrub.max = String(duration);
    scrub.value = String(Math.min(time, duration || time));
  }
  elapsedLabel.textContent = formatTime(time);
  totalLabel.textContent = formatTime(duration);
  playButton.textContent = audio.paused ? '播放' : '暫停';
}

function seek(time) {
  const duration = mediaDuration();
  const next = duration ? Math.min(duration, Math.max(0, time)) : Math.max(0, time);
  if (audio.src) audio.currentTime = next;
  if (current) frame(next);
  paintTransport();
}

function togglePlayback() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => { status.textContent = '再點一次播放'; });
  else audio.pause();
}

function showMenu() {
  playToken += 1;
  audio.pause();
  cancelAnimationFrame(raf);
  menu.hidden = false;
  transport.hidden = true;
  status.textContent = '';
}

async function play(id, at = 0) {
  const token = ++playToken;
  menu.hidden = true;
  transport.hidden = true;
  cancelAnimationFrame(raf);
  audio.pause();
  status.textContent = '載入角色與音樂中…';
  const info = await load(id);
  if (token !== playToken) return;
  history.replaceState(null, '', `?song=${id}`);
  audio.src = songById(id).audio;
  await new Promise((resolve, reject) => {
    if (audio.readyState >= 1) resolve();
    else {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', () => reject(audio.error || new Error('audio failed')), { once: true });
    }
  });
  if (token !== playToken) return;
  scrub.max = String(info.duration);
  const start = Math.min(info.duration, Math.max(0, at));
  audio.currentTime = start;
  status.textContent = '';
  frame(start);
  transport.hidden = false;
  paintTransport();
  audio.play().catch(() => { status.textContent = '點一下畫面或「播放」開始'; paintTransport(); });
  const tick = () => {
    frame(audio.currentTime || 0);
    paintTransport();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

if (!renderMode) {
  const list = document.getElementById('list');
  list.innerHTML = songs.map((s, i) => `
    <button data-song="${s.id}"><small>PV ${String(i + 1).padStart(2, '0')}</small><strong>${s.title}</strong><span>${s.tagline}</span></button>`).join('');
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-song]');
    if (button) play(button.dataset.song);
  });
  document.getElementById('back').addEventListener('click', showMenu);
  document.getElementById('rewind').addEventListener('click', () => seek((audio.currentTime || 0) - 5));
  document.getElementById('forward').addEventListener('click', () => seek((audio.currentTime || 0) + 5));
  playButton.addEventListener('click', togglePlayback);
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  addEventListener('pointerup', () => { if (!scrubbing) return; scrubbing = false; paintTransport(); });
  addEventListener('pointercancel', () => { if (!scrubbing) return; scrubbing = false; paintTransport(); });
  scrub.addEventListener('input', () => seek(Number(scrub.value)));
  out.addEventListener('click', togglePlayback);
  addEventListener('keydown', event => {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;
    if (event.key === ' ') { event.preventDefault(); togglePlayback(); }
    if (event.key === 'ArrowRight') seek((audio.currentTime || 0) + 5);
    if (event.key === 'ArrowLeft') seek((audio.currentTime || 0) - 5);
    if (event.key === 'Escape') showMenu();
  });
  const id = params.get('song');
  if (id && songById(id)) play(id, Number(params.get('t')) || 0);
  else menu.hidden = false;
} else {
  status.hidden = true;
  transport.hidden = true;
}
