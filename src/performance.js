import * as THREE from 'three';
import { coupleCue, applyCouples } from './couples.js';
import { createDancer } from './dance.js';
import bundledLrc from './wedding.lrc?raw';
import { parseLrc, timedCue } from './lrc.js';
import { models, performanceModelIds, modelById, loadAsset, instantiateAsset } from './models.js';
import { chapters, lyrics, defaultDuration, cueAt, chapterTime, castNames, actorPose } from './song-data.js';
import { showDistance, subtitleTilt, fogRange, orbitCeiling, targetHeight } from './framing.js';
import {
  $, formatClock, loadPrefs, savePrefs,
  fullscreenSupported, isFullscreen, toggleFullscreen, keepAwake,
} from './ui.js';
import './performance.css';

// ===========================================================================
// Constants
// ===========================================================================
const SONG_URL = '/audio/wedding.mp3';
const SONG_TITLE = '最瞎結婚理由';
const SHOW_TITLE = `${SONG_TITLE} · 歌詞劇場`;
const SEEK_STEP = 5;              // seconds for ← / →
const RESTART_LINE_AFTER = 1.5;   // "previous line" restarts the current one after this long
const CONFETTI_COUNT = 150;
const HEART_COUNT = 8;
const PERFORMER_COUNT = 4;
const LYRIC_SCROLL_PAUSE = 4000;  // ms to leave the lyric list alone after the user scrolls it

const COUPLE_MODES = [
  { value: 'auto', label: '隨劇情牽手／抱抱' },
  { value: 'hold', label: '兩對牽手' },
  { value: 'hug', label: '兩對抱抱' },
  { value: 'dance', label: '各自跳舞' },
];

const STORY_PROPS = {
  jackpot: '✦ 今彩 539 · 中頭獎啦！ ✦',
  wedding: '♡ DOUBLE HAPPINESS ♡',
  dance: '♡ 愛情 × 運氣 ＝ 甜蜜 ♡',
};

// ===========================================================================
// createPerformance
// ===========================================================================
export function createPerformance({ scene, camera, controls, actor, stage, ring, setTheme, onEnter, onExit, toast }) {
  const prefs = loadPrefs();
  const originalCues = parseLrc(bundledLrc);
  if (originalCues.length !== lyrics.length) throw new Error('LRC 與分鏡句數不符');
  const introLabel = originalCues[0].time.toFixed(2);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const performers = [];
  const dancers = [];
  const mixers = [];
  const resources = new Map();      // model id -> Promise<asset>
  const loadProgress = new Map();   // model id -> 0..1

  const show = {
    active: false,
    ready: false,          // all four performers are on stage
    failed: false,         // the last cast load failed
    playing: false,
    pending: false,        // waiting for audio.play() to resolve
    time: 0,
    duration: defaultDuration,
    synced: true,          // lyrics follow the bundled LRC timestamps
    audioURL: null,
    audioReady: false,
    audioName: SONG_TITLE,
    castRequest: 0,
    lastCue: -2,
    lastChapter: -2,
    welcome: true,         // show the big start card until the first play
    ended: false,          // reached the end with loop off
    lastUserScroll: 0,
    prior: null,           // editor camera / stage state to restore on exit
    lastClock: '',
    lastDanceStatus: '',
    lastCoupleStatus: '',
    lastProp: null,
  };

  const audio = new Audio();
  audio.preload = 'auto';
  audio.id = 'performance-audio';
  audio.hidden = true;
  audio.volume = clampNumber(prefs.volume, 0, 1, 1);
  audio.muted = Boolean(prefs.muted);
  document.body.append(audio);

  // -------------------------------------------------------------------------
  // Markup
  // -------------------------------------------------------------------------
  const savedCast = Array.isArray(prefs.cast) && prefs.cast.length === PERFORMER_COUNT && prefs.cast.every(id => modelById(id))
    ? prefs.cast
    : performanceModelIds;

  const entry = document.createElement('button');
  entry.id = 'performance-entry';
  entry.className = 'primary';
  entry.textContent = '♫ 歌詞演出';
  entry.title = '開啟歌詞劇場';
  $('header').insertBefore(entry, $('#save'));

  const headerExit = document.createElement('button');
  headerExit.id = 'show-exit-header';
  headerExit.textContent = '✎ 編輯器';
  headerExit.title = '返回編輯器';
  $('header').insertBefore(headerExit, $('#shot'));

  const ui = document.createElement('section');
  ui.className = 'performance-panel';
  ui.hidden = true;
  ui.setAttribute('aria-label', '歌詞劇場控制');
  ui.innerHTML = `
    <div class="show-heading">
      <div>
        <span>LYRIC THEATRE / 01</span>
        <h2>${SONG_TITLE}</h2>
        <p>鋒兄 × 牙妹 · 小塗 × 魚妹</p>
      </div>
      <button id="exit-show">返回編輯器 ↗</button>
    </div>
    <div class="show-note">原曲 MP3 × LRC 時間戳同步演出<br>含 ${introLabel} 秒前奏；字幕與分幕依音訊時間切換。</div>

    <div class="show-chapters" role="list">
      ${chapters.map((c, i) => `
        <button data-chapter="${i}" role="listitem" title="跳到 ${c.title}">
          <small>0${i + 1}</small>${c.title}<span>↗</span>
        </button>`).join('')}
    </div>

    <h3 class="panel-title">歌詞 <span>點選跳轉</span></h3>
    <div id="lyric-list">
      ${lyrics.map((l, i) => `<button data-line="${i}"><small>${String(i + 1).padStart(2, '0')}</small>${l.text}</button>`).join('')}
    </div>

    <details class="panel-group" open>
      <summary>雙人互動</summary>
      <p class="pair-names">鋒兄 ♡ 牙妹<br>小塗 ♡ 魚妹</p>
      <label class="toggle-row">互動模式
        <select id="couple-mode">
          ${COUPLE_MODES.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
        </select>
      </label>
      <p id="couple-status" class="status-line" role="status"></p>
    </details>

    <details class="panel-group" open>
      <summary>舞蹈編排</summary>
      <label class="toggle-row">骨架舞蹈<input id="dance-enabled" type="checkbox" checked></label>
      <label class="toggle-row">節奏 BPM
        <span class="stepper">
          <button type="button" data-bpm-step="-5" aria-label="BPM 減 5">−</button>
          <input id="dance-bpm" type="number" min="60" max="200" value="120" inputmode="numeric">
          <button type="button" data-bpm-step="5" aria-label="BPM 加 5">＋</button>
        </span>
      </label>
      <label class="toggle-row">動作幅度 <output id="dance-intensity-value">85%</output></label>
      <input id="dance-intensity" type="range" min="0.3" max="1" step="0.05" value="0.85">
      <p id="dance-status" class="status-line" role="status">準備骨架…</p>
      <p class="hint">原創循環編舞 · 預設 120 BPM，可依歌曲調整。無骨架模型僅呈現走位。</p>
    </details>

    <details class="panel-group">
      <summary>角色分配</summary>
      <div class="cast-map">
        ${castNames.map((name, i) => `
          <label>${name}
            <select data-cast="${i}">
              ${models.map(m => `<option value="${m.id}" ${m.id === savedCast[i] ? 'selected' : ''}>${m.name} · ${m.format}</option>`).join('')}
            </select>
          </label>`).join('')}
      </div>
      <button id="reset-cast" class="subtle">↺ 恢復預設角色</button>
    </details>

    <details class="panel-group">
      <summary>音樂與鏡頭</summary>
      <p id="audio-status" class="status-line">正在載入原曲…</p>
      <button id="song-audio" class="wide dashed">＋ 匯入歌曲音檔</button>
      <input id="audio-file" type="file" accept="audio/*" hidden>
      <div class="button-row">
        <button id="restore-song">↺ 載入原曲與 LRC</button>
        <button id="remove-audio" hidden>移除音檔</button>
      </div>
      <label class="toggle-row">分鏡鏡頭<input id="cinematic" type="checkbox" checked></label>
      <p class="hint">取消分鏡鏡頭即可自行拖曳、縮放視角。</p>
    </details>

    <details class="panel-group">
      <summary>鍵盤快捷鍵</summary>
      <dl class="shortcuts">
        <dt>Space</dt><dd>播放／暫停</dd>
        <dt>← →</dt><dd>倒退／快轉 ${SEEK_STEP} 秒</dd>
        <dt>↑ ↓</dt><dd>上一句／下一句</dd>
        <dt>[ ]</dt><dd>上一幕／下一幕</dd>
        <dt>Home</dt><dd>回到開頭</dd>
        <dt>M</dt><dd>靜音</dd>
        <dt>F</dt><dd>全螢幕</dd>
        <dt>L</dt><dd>循環播放</dd>
        <dt>C</dt><dd>分鏡鏡頭</dd>
        <dt>Esc</dt><dd>返回編輯器</dd>
      </dl>
    </details>`;
  $('main').append(ui);

  const overlay = document.createElement('div');
  overlay.className = 'show-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div id="chapter-title"></div>
    <div id="cast-labels"></div>
    <div id="story-prop"></div>
    <div class="subtitle">
      <small id="line-count"></small>
      <div id="current-lyric"></div>
      <p id="next-lyric"></p>
    </div>
    <div id="start-card" role="dialog" aria-label="開始演出">
      <div class="start-inner">
        <span class="start-kicker">LYRIC THEATRE</span>
        <strong class="start-title">${SONG_TITLE}</strong>
        <button id="start-play" class="start-button" disabled>
          <span class="start-icon" aria-hidden="true">▶</span>
          <span id="start-label">準備角色中…</span>
        </button>
        <div class="start-progress" aria-hidden="true"><i id="start-bar"></i></div>
        <p id="start-detail">載入 4 位角色與原曲</p>
        <p class="start-keys">Space 播放 · ← → 快轉 · F 全螢幕</p>
      </div>
    </div>
    <div id="seek-flash" aria-hidden="true"></div>`;
  $('#viewport').append(overlay);

  const transport = document.createElement('div');
  transport.className = 'show-transport';
  transport.hidden = true;
  transport.innerHTML = `
    <div class="show-controls">
      <button id="show-rewind" aria-label="回到起點" title="回到起點 (Home)">⏮</button>
      <button id="show-prev" aria-label="上一句" title="上一句 (↑)">⏪</button>
      <button id="show-play" class="primary" disabled title="播放／暫停 (Space)">準備角色中…</button>
      <button id="show-next" aria-label="下一句" title="下一句 (↓)">⏩</button>
      <span id="show-clock">00:00 / 00:00</span>
      <span class="show-spacer"></span>
      <span class="volume">
        <button id="show-mute" aria-label="靜音" title="靜音 (M)">🔊</button>
        <input id="show-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="音量">
      </span>
      <label class="show-loop" title="循環播放 (L)"><input id="show-loop" type="checkbox" checked> 循環</label>
      <button id="show-fullscreen" aria-label="全螢幕" title="全螢幕 (F)">⛶</button>
    </div>
    <div class="show-timeline">
      <input id="show-scrub" type="range" min="0" max="${show.duration}" step="0.01" value="0" aria-label="歌詞演出時間軸">
      <div class="show-markers" id="show-markers">
        <button data-jump="-1" class="intro-segment">前奏</button>
        ${chapters.map((c, i) => `<button data-jump="${i}" title="${c.title}">${c.title.split(' · ')[0]}</button>`).join('')}
      </div>
    </div>`;
  $('.workspace').append(transport);

  // Cached elements.
  const el = {
    play: $('#show-play'),
    prev: $('#show-prev'),
    next: $('#show-next'),
    rewind: $('#show-rewind'),
    clock: $('#show-clock'),
    scrub: $('#show-scrub'),
    loop: $('#show-loop'),
    mute: $('#show-mute'),
    volume: $('#show-volume'),
    fullscreen: $('#show-fullscreen'),
    markers: $('#show-markers'),
    chapterTitle: $('#chapter-title'),
    storyProp: $('#story-prop'),
    subtitle: overlay.querySelector('.subtitle'),
    currentLyric: $('#current-lyric'),
    nextLyric: $('#next-lyric'),
    lineCount: $('#line-count'),
    lyricList: $('#lyric-list'),
    coupleMode: $('#couple-mode'),
    coupleStatus: $('#couple-status'),
    danceEnabled: $('#dance-enabled'),
    danceBpm: $('#dance-bpm'),
    danceIntensity: $('#dance-intensity'),
    danceIntensityValue: $('#dance-intensity-value'),
    danceStatus: $('#dance-status'),
    cinematic: $('#cinematic'),
    audioStatus: $('#audio-status'),
    removeAudio: $('#remove-audio'),
    note: ui.querySelector('.show-note'),
    startCard: $('#start-card'),
    startPlay: $('#start-play'),
    startLabel: $('#start-label'),
    startBar: $('#start-bar'),
    startDetail: $('#start-detail'),
    seekFlash: $('#seek-flash'),
    viewport: $('#viewport'),
    projectTitle: $('#project-title'),
  };
  const chapterButtons = Array.from(ui.querySelectorAll('[data-chapter]'));
  const lineButtons = Array.from(ui.querySelectorAll('[data-line]'));
  const markerButtons = Array.from(transport.querySelectorAll('[data-jump]'));
  const castSelects = Array.from(ui.querySelectorAll('[data-cast]'));

  // Restore saved preferences into the controls.
  if (COUPLE_MODES.some(m => m.value === prefs.coupleMode)) el.coupleMode.value = prefs.coupleMode;
  if (typeof prefs.danceEnabled === 'boolean') el.danceEnabled.checked = prefs.danceEnabled;
  el.danceBpm.value = clampNumber(prefs.bpm, 60, 200, 120);
  el.danceIntensity.value = clampNumber(prefs.intensity, 0.3, 1, 0.85);
  if (typeof prefs.cinematic === 'boolean') el.cinematic.checked = prefs.cinematic;
  if (typeof prefs.loop === 'boolean') el.loop.checked = prefs.loop;
  el.volume.value = audio.volume;
  updateIntensityLabel();
  updateMuteButton();
  if (!fullscreenSupported()) el.fullscreen.hidden = true;

  const labels = castNames.map(name => {
    const label = document.createElement('span');
    label.textContent = name;
    $('#cast-labels').append(label);
    return label;
  });

  // -------------------------------------------------------------------------
  // Stage props: confetti, wedding arch, floating hearts
  // -------------------------------------------------------------------------
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const confettiPositions = new Float32Array(CONFETTI_COUNT * 3);
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    confettiPositions[i * 3] = Math.sin(i * 23.17) * 5;
    confettiPositions[i * 3 + 2] = Math.cos(i * 11.3) * 3;
  }
  const confettiGeometry = new THREE.BufferGeometry();
  confettiGeometry.setAttribute('position', new THREE.BufferAttribute(confettiPositions, 3));
  const confetti = new THREE.Points(confettiGeometry, new THREE.PointsMaterial({ color: 0xffd278, size: 0.045 }));
  group.add(confetti);

  const arch = new THREE.Group();
  const archMaterial = new THREE.MeshStandardMaterial({ color: 0xf5b7d9, metalness: 0.5, roughness: 0.3 });
  for (const x of [-1.6, 1.6]) {
    const curve = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.045, 12, 80, Math.PI), archMaterial);
    curve.position.set(x, 1.5, -0.8);
    arch.add(curve);
  }
  for (const x of [-2.9, -0.3, 0.3, 2.9]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 12), archMaterial);
    pillar.position.set(x, 0.75, -0.8);
    arch.add(pillar);
  }
  group.add(arch);

  const hearts = new THREE.Group();
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, 0);
  heartShape.bezierCurveTo(-0.7, 0.45, -0.5, 0.95, 0, 0.6);
  heartShape.bezierCurveTo(0.5, 0.95, 0.7, 0.45, 0, 0);
  const heartGeometry = new THREE.ShapeGeometry(heartShape);
  const heartMaterial = new THREE.MeshBasicMaterial({ color: 0xff86b6, side: THREE.DoubleSide });
  for (let i = 0; i < HEART_COUNT; i++) {
    const heart = new THREE.Mesh(heartGeometry, heartMaterial);
    heart.scale.setScalar(0.35);
    hearts.add(heart);
  }
  group.add(hearts);

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------
  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function lineStart(index) {
    if (index < 0) return 0;
    return show.synced ? originalCues[index].time : (index / lyrics.length) * show.duration;
  }

  function chapterStart(chapter) {
    if (chapter < 0) return 0;
    return show.synced
      ? originalCues[lyrics.findIndex(l => l.chapter === chapter)].time
      : chapterTime(chapter, show.duration);
  }

  function chapterEnd(chapter) {
    return chapter + 1 < chapters.length ? chapterStart(chapter + 1) : show.duration;
  }

  function currentCue(time = show.time) {
    return show.synced ? timedCue(time, show.duration, originalCues, lyrics, chapters) : cueAt(time, show.duration);
  }

  function flash(text) {
    el.seekFlash.textContent = text;
    el.seekFlash.classList.remove('show');
    void el.seekFlash.offsetWidth; // restart the CSS animation
    el.seekFlash.classList.add('show');
  }

  // -------------------------------------------------------------------------
  // Start card and play buttons
  // -------------------------------------------------------------------------
  function castProgress() {
    const ids = castSelects.map(s => Number(s.value));
    const unique = [...new Set(ids)];
    const done = unique.filter(id => (loadProgress.get(id) ?? 0) >= 1).length;
    const fraction = unique.reduce((sum, id) => sum + (loadProgress.get(id) ?? 0), 0) / unique.length;
    return { done, total: unique.length, fraction };
  }

  function refreshStartCard() {
    const audioLoading = Boolean(show.audioURL) && !show.audioReady;
    const visible = show.active && (!show.ready || show.failed || (!show.playing && (show.welcome || show.ended)));
    el.startCard.hidden = !visible;
    el.startCard.classList.toggle('loading', !show.ready && !show.failed);
    el.startCard.classList.toggle('failed', show.failed);

    if (show.failed) {
      el.startPlay.disabled = false;
      setText(el.startLabel, '重新載入角色');
      setText(el.startDetail, '角色載入失敗，請檢查網路或更換角色分配');
      el.startBar.style.width = '0%';
      return;
    }
    if (!show.ready) {
      const { done, total, fraction } = castProgress();
      el.startPlay.disabled = true;
      setText(el.startLabel, `準備角色中… ${Math.round(fraction * 100)}%`);
      setText(el.startDetail, `已就緒 ${done}/${total} 位角色${audioLoading ? ' · 音樂載入中' : ''}`);
      el.startBar.style.width = `${Math.round(fraction * 100)}%`;
      return;
    }
    el.startPlay.disabled = false;
    el.startBar.style.width = '100%';
    if (show.ended) {
      setText(el.startLabel, '再看一次');
      setText(el.startDetail, '演出結束 · 願幸福都中頭獎');
    } else {
      setText(el.startLabel, '播放演出');
      setText(el.startDetail, audioLoading ? '音樂載入中，稍候即可播放' : `${formatClock(show.duration)} · ${lyrics.length} 句歌詞 · 5 幕`);
    }
  }

  function refreshPlayButton() {
    el.play.disabled = !show.ready;
    el.play.classList.toggle('is-playing', show.playing);
    if (!show.ready) {
      setText(el.play, show.failed ? '角色載入失敗' : '準備角色中…');
    } else {
      setText(el.play, show.playing ? 'Ⅱ 暫停演出' : '▶ 播放演出');
    }
    el.play.setAttribute('aria-label', show.playing ? '暫停演出' : '播放演出');
    document.body.classList.toggle('show-playing', show.active && show.playing);
    refreshStartCard();
    updateMediaSession();
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------
  function pause() {
    show.playing = false;
    audio.pause();
    keepAwake(false);
    refreshPlayButton();
  }

  async function play() {
    if (show.failed) {
      assignCast();
      return;
    }
    if (!show.ready || show.pending) return;
    if (show.audioURL && !show.audioReady) {
      toast('音檔仍在載入，請稍候');
      return;
    }
    if (show.time >= show.duration - 0.05) seek(0);

    if (show.audioURL) {
      show.pending = true;
      try {
        audio.currentTime = show.time;
        await audio.play();
      } catch {
        show.pending = false;
        toast('音檔無法播放，請再按一次播放或換一個音檔');
        return;
      }
      show.pending = false;
      if (!show.active) {
        audio.pause();
        return;
      }
    }
    show.playing = true;
    show.welcome = false;
    show.ended = false;
    keepAwake(true);
    refreshPlayButton();
  }

  function togglePlay() {
    if (show.playing) pause();
    else play();
  }

  function seek(value) {
    show.time = Math.max(0, Math.min(show.duration, value));
    if (show.audioURL && Number.isFinite(audio.duration)) audio.currentTime = Math.min(show.time, audio.duration);
    show.lastCue = -2;
    if (show.ended && show.time < show.duration - 0.05) show.ended = false;
    update(0);
    refreshStartCard();
    updateMediaPosition();
  }

  function seekBy(seconds) {
    seek(show.time + seconds);
    flash(`${seconds > 0 ? '⏩ +' : '⏪ '}${seconds} 秒`);
  }

  function previousLine() {
    const cue = currentCue();
    const start = lineStart(cue.index);
    if (cue.index >= 0 && show.time - start > RESTART_LINE_AFTER) seek(start);
    else seek(lineStart(Math.max(-1, cue.index - 1)));
    flash('⏪ 上一句');
  }

  function nextLine() {
    const cue = currentCue();
    if (cue.index + 1 < lyrics.length) {
      seek(lineStart(cue.index + 1));
      flash('⏩ 下一句');
    }
  }

  function previousChapter() {
    const cue = currentCue();
    const start = chapterStart(cue.chapter);
    const target = cue.chapter >= 0 && show.time - start > RESTART_LINE_AFTER ? cue.chapter : cue.chapter - 1;
    seek(chapterStart(Math.max(-1, target)));
    flash(target >= 0 ? chapters[Math.max(0, target)].title : '前奏');
  }

  function nextChapter() {
    const cue = currentCue();
    if (cue.chapter + 1 < chapters.length) {
      seek(chapterStart(cue.chapter + 1));
      flash(chapters[cue.chapter + 1].title);
    }
  }

  function setLoop(value) {
    el.loop.checked = value;
    savePrefs({ loop: value });
  }

  function setVolume(value) {
    audio.volume = clampNumber(value, 0, 1, 1);
    if (audio.volume > 0 && audio.muted) audio.muted = false;
    el.volume.value = audio.volume;
    updateMuteButton();
    savePrefs({ volume: audio.volume, muted: audio.muted });
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    updateMuteButton();
    savePrefs({ muted: audio.muted });
    flash(audio.muted ? '🔇 靜音' : '🔊 取消靜音');
  }

  function updateMuteButton() {
    const silent = audio.muted || audio.volume === 0;
    el.mute.textContent = silent ? '🔇' : audio.volume < 0.5 ? '🔉' : '🔊';
    el.mute.setAttribute('aria-label', silent ? '取消靜音' : '靜音');
    el.volume.style.setProperty('--progress', `${(audio.muted ? 0 : audio.volume) * 100}%`);
  }

  function updateIntensityLabel() {
    el.danceIntensityValue.textContent = `${Math.round(Number(el.danceIntensity.value) * 100)}%`;
  }

  // Chapter segments under the scrubber are sized by real chapter length.
  function layoutMarkers() {
    const introEnd = chapterStart(0);
    markerButtons.forEach(button => {
      const chapter = Number(button.dataset.jump);
      const length = chapter < 0 ? introEnd : chapterEnd(chapter) - chapterStart(chapter);
      button.style.flexGrow = String(Math.max(0, length));
      button.hidden = length <= 0.01;
    });
  }

  // -------------------------------------------------------------------------
  // Media Session: lock screen, headset and keyboard media keys
  // -------------------------------------------------------------------------
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => play(),
      pause: () => pause(),
      seekbackward: () => seekBy(-SEEK_STEP),
      seekforward: () => seekBy(SEEK_STEP),
      previoustrack: () => previousChapter(),
      nexttrack: () => nextChapter(),
      seekto: details => seek(details.seekTime ?? show.time),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action on this browser.
      }
    }
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      if (show.active && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: SONG_TITLE,
          artist: 'HyperStage 歌詞劇場',
          album: '鋒兄 × 牙妹 · 小塗 × 魚妹',
        });
      }
      navigator.mediaSession.playbackState = show.playing ? 'playing' : 'paused';
    } catch {
      // Ignore.
    }
    updateMediaPosition();
  }

  function updateMediaPosition() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: show.duration,
        playbackRate: 1,
        position: Math.min(show.time, show.duration),
      });
    } catch {
      // Ignore.
    }
  }

  // -------------------------------------------------------------------------
  // Cast loading
  // -------------------------------------------------------------------------
  function requestAsset(id) {
    if (!resources.has(id)) {
      const model = modelById(id);
      loadProgress.set(id, 0);
      const promise = loadAsset(model.url, model.format, fraction => {
        loadProgress.set(id, Math.min(0.99, fraction));
        refreshStartCard();
      })
        .then(asset => {
          loadProgress.set(id, 1);
          refreshStartCard();
          return asset;
        })
        .catch(error => {
          resources.delete(id);
          loadProgress.delete(id);
          throw error;
        });
      resources.set(id, promise);
    }
    return resources.get(id);
  }

  async function assignCast() {
    const ticket = ++show.castRequest;
    pause();
    show.ready = false;
    show.failed = false;
    refreshPlayButton();

    const ids = castSelects.map(select => Number(select.value));
    savePrefs({ cast: ids });

    try {
      const assets = await Promise.all(ids.map(requestAsset));
      if (ticket !== show.castRequest) return;

      mixers.forEach(mixer => mixer?.stopAllAction());
      mixers.length = 0;
      dancers.length = 0;

      performers.forEach((performer, i) => {
        performer.clear();
        const model = instantiateAsset(assets[i]);
        performer.add(model);
        dancers.push(createDancer(model));
        const mixer = assets[i].animations.length ? new THREE.AnimationMixer(model) : null;
        for (const clip of assets[i].animations) mixer.clipAction(clip).play();
        mixers.push(mixer);
      });

      show.ready = true;
      refreshPlayButton();
      update(0);
    } catch (error) {
      if (ticket !== show.castRequest) return;
      show.failed = true;
      refreshPlayButton();
      toast('角色載入失敗，請重新選擇角色', { tone: 'error' });
      console.error(error);
    }
  }

  function init() {
    for (let i = 0; i < PERFORMER_COUNT; i++) {
      const performer = new THREE.Group();
      group.add(performer);
      performers.push(performer);
    }
    setupMediaSession();
    layoutMarkers();
    assignCast();
  }

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------
  function releaseAudioURL() {
    if (show.audioURL?.startsWith('blob:')) URL.revokeObjectURL(show.audioURL);
  }

  function loadAudio(url, name, useLrc) {
    pause();
    releaseAudioURL();
    show.audioReady = false;
    show.synced = useLrc;
    show.audioURL = url;
    show.audioName = name;
    el.audioStatus.textContent = '讀取音檔中…';
    refreshStartCard();

    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        removeAudio();
        toast('無法讀取音檔長度', { tone: 'error' });
        return;
      }
      show.audioReady = true;
      show.duration = audio.duration;
      el.scrub.max = show.duration;
      el.audioStatus.textContent = `${name} · ${formatClock(show.duration)}${show.synced ? ' · LRC 逐句同步' : ' · 等分字幕時間'}`;
      el.note.textContent = show.synced
        ? `原曲 MP3 × LRC 同步演出 · ${introLabel} 秒前奏 · ${lyrics.length} 句字幕`
        : '自訂音檔 · 字幕依曲長平均分配，未套用原曲 LRC';
      el.removeAudio.hidden = false;
      layoutMarkers();
      seek(0);
      if (!useLrc) toast(`已載入 ${name}`);
    };
    audio.onerror = () => {
      removeAudio();
      toast('音檔載入失敗，可按「載入原曲與 LRC」重試', { tone: 'error' });
    };
    audio.src = url;
    audio.load();
  }

  function removeAudio() {
    pause();
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.removeAttribute('src');
    audio.load();
    releaseAudioURL();
    show.audioURL = null;
    show.audioReady = false;
    show.synced = false;
    show.duration = defaultDuration;
    el.scrub.max = show.duration;
    el.audioStatus.textContent = '無音檔 · 靜音預演';
    el.note.textContent = '靜音預演 · 每句 4 秒';
    el.removeAudio.hidden = true;
    layoutMarkers();
    seek(0);
  }

  // -------------------------------------------------------------------------
  // Enter / exit
  // -------------------------------------------------------------------------
  function enter() {
    if (show.active) return;
    show.prior = {
      camera: camera.position.clone(),
      target: controls.target.clone(),
      stage: stage.scale.clone(),
      ring: ring.scale.clone(),
      autoRotate: controls.autoRotate,
      fog: { near: scene.fog.near, far: scene.fog.far },
      maxDistance: controls.maxDistance,
      title: el.projectTitle?.textContent,
    };
    onEnter();
    show.active = true;
    show.welcome = show.time < 0.05;
    group.visible = true;
    actor.visible = false;
    stage.scale.set(2.6, 1, 1.5);
    ring.scale.set(2.6, 1.5, 1);
    document.body.classList.add('show-mode');
    ui.hidden = false;
    overlay.hidden = false;
    transport.hidden = false;
    controls.autoRotate = false;
    if (el.projectTitle) el.projectTitle.textContent = SHOW_TITLE;
    show.lastChapter = -2;
    show.lastCue = -2;
    update(0);
    refreshPlayButton();
  }

  function exit() {
    if (!show.active) return;
    pause();
    if (isFullscreen()) toggleFullscreen(document.querySelector('.workspace'));
    show.active = false;
    group.visible = false;
    actor.visible = true;
    const prior = show.prior;
    stage.scale.copy(prior.stage);
    ring.scale.copy(prior.ring);
    Object.assign(scene.fog, prior.fog);
    controls.maxDistance = prior.maxDistance;
    camera.position.copy(prior.camera);
    controls.target.copy(prior.target);
    controls.autoRotate = prior.autoRotate;
    if (el.projectTitle && prior.title) el.projectTitle.textContent = prior.title;
    document.body.classList.remove('show-mode', 'show-playing');
    ui.hidden = true;
    overlay.hidden = true;
    transport.hidden = true;
    onExit();
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------
  function advanceClock(dt) {
    if (!show.playing) return;
    show.time = show.audioURL ? audio.currentTime : show.time + dt;
    const finished = show.time >= show.duration - 0.015 || (show.audioURL && audio.ended);
    if (!finished) return;

    if (el.loop.checked) {
      show.time = 0;
      if (show.audioURL) {
        audio.currentTime = 0;
        audio.play().catch(() => pause());
      }
    } else {
      show.time = show.duration;
      show.ended = true;
      pause();
    }
  }

  function onChapterChange(cue) {
    setTheme(cue.chapterData.theme);
    show.lastChapter = cue.chapter;
    setText(el.chapterTitle, cue.chapterData.title);
    chapterButtons.forEach(b => b.classList.toggle('selected', Number(b.dataset.chapter) === cue.chapter));
    markerButtons.forEach(b => b.classList.toggle('selected', Number(b.dataset.jump) === cue.chapter));
    // Re-trigger the chapter title animation.
    el.chapterTitle.classList.remove('enter');
    void el.chapterTitle.offsetWidth;
    el.chapterTitle.classList.add('enter');
  }

  function onCueChange(cue, action) {
    show.lastCue = cue.index;
    setText(el.currentLyric, cue.text);
    setText(el.nextLyric, lyrics[cue.index + 1]?.text || '— 謝幕 · 願幸福都中頭獎 —');
    const count = cue.index < 0 ? 'INTRO' : `${String(cue.index + 1).padStart(2, '0')} / ${lyrics.length}`;
    setText(el.lineCount, `${count} · ${action === 'wedding' ? '雙倍幸福' : '歌詞演繹'}`);
    el.currentLyric.classList.remove('enter');
    void el.currentLyric.offsetWidth;
    el.currentLyric.classList.add('enter');

    lineButtons.forEach(b => b.classList.toggle('selected', Number(b.dataset.line) === cue.index));

    // Keep the current line in view, unless the user is browsing the list.
    const list = el.lyricList;
    if (Date.now() - show.lastUserScroll < LYRIC_SCROLL_PAUSE || !list.clientHeight) return;
    const current = lineButtons[cue.index];
    const top = current ? current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2 : 0;
    list.scrollTo({ top: Math.max(0, top), behavior: show.playing ? 'smooth' : 'auto' });
  }

  function updateDance(cue, action) {
    const danceEnabled = el.danceEnabled.checked;
    const bpm = THREE.MathUtils.clamp(Number(el.danceBpm.value) || 120, 60, 200);
    const intensity = Number(el.danceIntensity.value);

    mixers.forEach((mixer, i) => {
      if (!danceEnabled || !dancers[i]?.supported) mixer?.setTime(show.time);
    });

    let danceName = '';
    const inIntro = cue.index < 0;
    const start = inIntro ? 0 : chapterStart(cue.chapter);
    dancers.forEach((dancer, i) => {
      if (!danceEnabled || !dancer.supported) return;
      danceName = dancer.apply(show.time, {
        action: inIntro ? 'intro' : action,
        bpm,
        intensity,
        index: i,
        offset: show.synced ? originalCues[0].time : 0,
        previousAction: cue.chapter > 0 ? chapters[cue.chapter - 1].action : 'intro',
        transition: Math.min(1, Math.max(0, show.time - start)),
      });
    });

    const skeletons = dancers.filter(d => d.supported).length;
    const status = danceEnabled ? `${danceName || '整體走位'} · ${skeletons}/${PERFORMER_COUNT} 位骨架舞者` : '原始姿勢與走位';
    if (status !== show.lastDanceStatus) {
      show.lastDanceStatus = status;
      el.danceStatus.textContent = status;
    }
    return danceEnabled;
  }

  function updatePerformers(cue, action, danceEnabled) {
    performers.forEach((performer, i) => {
      const pose = actorPose(i, show.time, cue);
      performer.position.set(pose.x, pose.y, pose.z);
      performer.rotation.set(0, pose.ry, pose.rz);
      performer.scale.setScalar(pose.scale);
    });

    const inIntro = cue.index < 0;
    const elapsed = show.time - (inIntro ? 0 : chapterStart(cue.chapter));
    const remaining = (cue.chapter + 1 < chapters.length ? chapterStart(cue.chapter + 1) : show.duration) - show.time;
    const interaction = coupleCue(inIntro ? 'intro' : action, elapsed, remaining, el.coupleMode.value);
    if (danceEnabled) applyCouples(performers, dancers, interaction);

    const eligible = interaction.pairs.filter(pair => pair.every(i => dancers[i]?.supported)).length;
    const status = !danceEnabled
      ? '開啟骨架舞蹈以使用互動'
      : interaction.pairs.length
        ? `${interaction.hug > 0.5 ? '抱抱' : '牽手'} · ${eligible} 對（需雙方有骨架）`
        : '雙人互動將隨劇情開始';
    if (status !== show.lastCoupleStatus) {
      show.lastCoupleStatus = status;
      el.coupleStatus.textContent = status;
    }
  }

  function updateProps(cue, action) {
    arch.visible = action === 'wedding';
    hearts.visible = action === 'wedding' || action === 'proposal' || action === 'dance';
    if (hearts.visible) {
      hearts.children.forEach((heart, i) => {
        heart.position.set(Math.sin(i * 7) * 3, 1 + ((show.time * 0.28 + i * 0.7) % 2.8), -0.6);
        heart.rotation.y = Math.sin(show.time + i) * 0.3;
      });
    }
    confetti.visible = action === 'jackpot' || action === 'dance' || action === 'wedding';
    if (confetti.visible) {
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        confettiPositions[i * 3 + 1] = 4.6 - ((show.time * (0.5 + (i % 5) * 0.08) + i * 0.33) % 4.5);
      }
      confettiGeometry.attributes.position.needsUpdate = true;
    }

    let prop = STORY_PROPS[action] || '';
    if (action === 'proposal' && cue.line >= 2 && cue.line <= 4) prop = '🎟 牙妹的幸運號碼';
    if (prop !== show.lastProp) {
      show.lastProp = prop;
      el.storyProp.textContent = prop;
      el.storyProp.classList.remove('enter');
      void el.storyProp.offsetWidth;
      if (prop) el.storyProp.classList.add('enter');
    }
  }

  function updateCamera(action) {
    if (!el.cinematic.checked) return;
    const viewport = el.viewport;
    const plate = el.subtitle.getBoundingClientRect();
    const share = viewport.clientHeight
      ? (viewport.getBoundingClientRect().bottom - plate.top) / viewport.clientHeight
      : 0;
    const distance = showDistance({
      action,
      fov: camera.fov,
      aspect: camera.aspect,
      stageHeight: viewport.clientHeight,
      subtitleShare: share,
    });
    Object.assign(scene.fog, fogRange(distance));
    controls.maxDistance = orbitCeiling(distance);
    camera.position.set(Math.sin(show.time * 0.12) * 0.55, 3.05, distance);
    controls.target.set(0, targetHeight - subtitleTilt({ distance, fov: camera.fov, subtitleShare: share }), 0);
    controls.update();
  }

  function updateLabels() {
    const viewport = el.viewport;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const widths = labels.map(l => l.offsetWidth);
    const heights = labels.map(l => l.offsetHeight);
    const point = new THREE.Vector3();

    const marks = performers.map((p, i) => {
      point.set(p.position.x, p.position.y + 2.8 * p.scale.y + 0.27, p.position.z).project(camera);
      return { i, x: (point.x * 0.5 + 0.5) * width, y: (-point.y * 0.5 + 0.5) * height, off: point.z > 1 };
    });

    // Paired chapters stand two performers about a label's width apart, and a narrow
    // frame (phone, browser zoom) closes that gap further while the text stays put.
    // Walk right to left and stack each name above the neighbour it would cover.
    const lane = marks.slice().sort((a, b) => a.x - b.x);
    for (let n = lane.length - 2; n >= 0; n--) {
      const current = lane[n];
      const next = lane[n + 1];
      if (current.off || next.off) continue;
      const overlapX = next.x - current.x < (widths[current.i] + widths[next.i]) / 2 + 8;
      const overlapY = Math.abs(next.y - current.y) < Math.max(heights[current.i], heights[next.i]);
      if (overlapX && overlapY) current.y = next.y - heights[current.i] - 3;
    }

    for (const mark of marks) {
      const label = labels[mark.i];
      label.style.transform = `translate(${mark.x}px, ${mark.y}px) translate(-50%, -100%)`;
      label.hidden = mark.off;
    }
  }

  function updateClock() {
    const clock = `${formatClock(show.time)} / ${formatClock(show.duration)}`;
    if (clock !== show.lastClock) {
      show.lastClock = clock;
      el.clock.textContent = clock;
    }
    el.scrub.value = show.time;
    el.scrub.style.setProperty('--progress', `${(show.time / show.duration) * 100}%`);
  }

  function update(dt) {
    if (!show.active) return;
    advanceClock(dt);

    const cue = currentCue();
    const action = cue.chapterData.action;

    if (cue.chapter !== show.lastChapter) onChapterChange(cue);
    if (cue.index !== show.lastCue) onCueChange(cue, action);

    updateClock();
    el.currentLyric.style.setProperty('--lyric-progress', `${cue.progress * 100}%`);

    const danceEnabled = updateDance(cue, action);
    updatePerformers(cue, action, danceEnabled);
    updateProps(cue, action);
    updateCamera(action);
    updateLabels();
  }

  // -------------------------------------------------------------------------
  // Keyboard (called by main.js while the show is on screen)
  // -------------------------------------------------------------------------
  function handleKey(event) {
    switch (event.key) {
      case ' ':
        togglePlay();
        return true;
      case 'ArrowLeft':
        seekBy(-SEEK_STEP);
        return true;
      case 'ArrowRight':
        seekBy(SEEK_STEP);
        return true;
      case 'ArrowUp':
        previousLine();
        return true;
      case 'ArrowDown':
        nextLine();
        return true;
      case '[':
      case 'PageUp':
        previousChapter();
        return true;
      case ']':
      case 'PageDown':
        nextChapter();
        return true;
      case 'Home':
        seek(0);
        return true;
      case 'End':
        seek(show.duration);
        return true;
      case 'm':
      case 'M':
        toggleMute();
        return true;
      case 'f':
      case 'F':
        toggleFullscreen(document.querySelector('.workspace'));
        return true;
      case 'l':
      case 'L':
        setLoop(!el.loop.checked);
        flash(el.loop.checked ? '↻ 循環：開' : '↻ 循環：關');
        return true;
      case 'c':
      case 'C':
        el.cinematic.checked = !el.cinematic.checked;
        el.cinematic.dispatchEvent(new Event('change'));
        flash(el.cinematic.checked ? '🎬 分鏡鏡頭：開' : '🎬 自由視角');
        return true;
      case 'Escape':
        // Leave fullscreen first (the browser handles that); only then exit the show.
        if (isFullscreen()) return false;
        exit();
        return true;
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Event wiring
  // -------------------------------------------------------------------------
  entry.addEventListener('click', enter);
  headerExit.addEventListener('click', exit);
  $('#exit-show').addEventListener('click', exit);

  el.play.addEventListener('click', togglePlay);
  el.startPlay.addEventListener('click', togglePlay);
  el.rewind.addEventListener('click', () => {
    pause();
    seek(0);
  });
  el.prev.addEventListener('click', previousLine);
  el.next.addEventListener('click', nextLine);
  el.scrub.addEventListener('input', event => seek(Number(event.target.value)));
  el.loop.addEventListener('change', () => savePrefs({ loop: el.loop.checked }));
  el.mute.addEventListener('click', toggleMute);
  el.volume.addEventListener('input', event => setVolume(event.target.value));
  el.fullscreen.addEventListener('click', () => toggleFullscreen(document.querySelector('.workspace')));
  const onFullscreenChange = () => {
    const on = isFullscreen();
    el.fullscreen.textContent = on ? '🗗' : '⛶';
    el.fullscreen.setAttribute('aria-label', on ? '離開全螢幕' : '全螢幕');
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  chapterButtons.forEach(button => button.addEventListener('click', () => seek(chapterStart(Number(button.dataset.chapter)))));
  markerButtons.forEach(button => button.addEventListener('click', () => seek(chapterStart(Number(button.dataset.jump)))));
  lineButtons.forEach(button => button.addEventListener('click', () => {
    show.lastUserScroll = 0; // a click is a deliberate jump: let the list follow again
    seek(lineStart(Number(button.dataset.line)));
  }));
  for (const type of ['wheel', 'touchmove']) {
    el.lyricList.addEventListener(type, () => { show.lastUserScroll = Date.now(); }, { passive: true });
  }

  castSelects.forEach(select => select.addEventListener('change', assignCast));
  $('#reset-cast').addEventListener('click', () => {
    castSelects.forEach((select, i) => { select.value = performanceModelIds[i]; });
    assignCast();
  });

  el.coupleMode.addEventListener('change', () => {
    savePrefs({ coupleMode: el.coupleMode.value });
    update(0);
  });
  el.danceEnabled.addEventListener('change', () => {
    dancers.forEach(dancer => dancer.reset());
    savePrefs({ danceEnabled: el.danceEnabled.checked });
    update(0);
  });
  el.danceBpm.addEventListener('change', () => {
    el.danceBpm.value = clampNumber(el.danceBpm.value, 60, 200, 120);
    savePrefs({ bpm: Number(el.danceBpm.value) });
    update(0);
  });
  ui.querySelectorAll('[data-bpm-step]').forEach(button => button.addEventListener('click', () => {
    el.danceBpm.value = clampNumber(Number(el.danceBpm.value) + Number(button.dataset.bpmStep), 60, 200, 120);
    savePrefs({ bpm: Number(el.danceBpm.value) });
    update(0);
  }));
  el.danceIntensity.addEventListener('input', () => {
    updateIntensityLabel();
    savePrefs({ intensity: Number(el.danceIntensity.value) });
    if (!show.playing) update(0);
  });
  el.cinematic.addEventListener('change', () => {
    savePrefs({ cinematic: el.cinematic.checked });
    if (!el.cinematic.checked) toast('自由視角：拖曳旋轉，滾輪或雙指縮放');
  });

  $('#song-audio').addEventListener('click', () => $('#audio-file').click());
  $('#audio-file').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) loadAudio(URL.createObjectURL(file), file.name, false);
  });
  el.removeAudio.addEventListener('click', removeAudio);
  $('#restore-song').addEventListener('click', () => loadAudio(SONG_URL, SONG_TITLE, true));

  // A phone going to the background should not keep singing to an empty room.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && show.playing) {
      pause();
      toast('已暫停：切換到背景時自動暫停');
    }
  });

  // Audio can also stop on its own (headphones unplugged, OS interruption).
  audio.addEventListener('pause', () => {
    if (show.playing && !audio.ended && !show.pending) {
      show.playing = false;
      keepAwake(false);
      refreshPlayButton();
    }
  });

  loadAudio(SONG_URL, SONG_TITLE, true);
  init();

  return {
    update,
    enter,
    exit,
    handleKey,
    get active() {
      return show.active;
    },
  };
}
