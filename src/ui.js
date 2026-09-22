// Small DOM helpers shared by the editor (main.js) and the lyric show (performance.js).
// Kept deliberately plain: every helper is a few lines and has no hidden state beyond
// what its name says.

export const $ = selector => document.querySelector(selector);
export const $$ = selector => Array.from(document.querySelectorAll(selector));

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = 0;

export function toast(text, { duration = 3200, tone = 'info' } = {}) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ---------------------------------------------------------------------------
// Keyboard focus rules
// ---------------------------------------------------------------------------

// True when a key press belongs to the focused control, not to a global shortcut.
// Text-like inputs and selects own every key.  Range sliders own the arrow keys
// (they move the thumb), but Space on a slider still means "play / pause".
export function keyBelongsToControl(event) {
  const el = event.target;
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = el.type;
    if (type === 'range') return event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown';
    if (type === 'checkbox' || type === 'radio') return event.code === 'Space' || event.key === 'Enter';
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// 83.4 -> "01:23"
export function formatClock(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

// 3.456 -> "00:03.46"
export function formatPrecise(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Persistent preferences (per browser).  Storage can throw in private windows
// or inside some WebViews, so every access is guarded and falls back silently.
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'hyperstage:prefs:v1';

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePrefs(patch) {
  try {
    const next = { ...loadPrefs(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preferences are a convenience only.
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export function downloadURL(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------
export const fullscreenSupported = () =>
  Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function toggleFullscreen(element) {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (element.requestFullscreen || element.webkitRequestFullscreen).call(element);
    }
  } catch {
    toast('此裝置不支援全螢幕');
  }
}

// ---------------------------------------------------------------------------
// Screen wake lock: keep a phone awake while a show is playing.
// ---------------------------------------------------------------------------
let wakeLock = null;

export async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}
