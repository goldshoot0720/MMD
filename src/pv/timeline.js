// Turns a song (LRC cues + chapters) into a PV timeline: timed lines, chapters, camera
// shots and typography modes. Everything here is pure data so any instant can be posed
// without knowing the frames before it.

export const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, k) => a + (b - a) * k;

export function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

export function rng(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOTS = {
  calm: ['wide', 'solo', 'face', 'orbit', 'push', 'low', 'solo'],
  hot: ['orbit', 'low', 'dutch', 'push', 'face', 'wide', 'solo', 'windows'],
  gold: ['low', 'push', 'face', 'orbit', 'crane', 'dutch'],
};
const MOOD = { tease: 'calm', proposal: 'calm', intro: 'calm', dance: 'hot', rally: 'hot', wedding: 'hot', jackpot: 'gold' };

const visibleLength = text => [...text.replace(/[\s　]/g, '')].length;

function typeMode(song, line, index) {
  const len = visibleLength(line.text);
  if (len > 20) return 'caption';
  const mood = MOOD[line.action] ?? 'calm';
  if (mood === 'hot') return len > 14 && hash(song.id, index, 'imp') < 0.35 ? 'pop' : 'impact';
  if (mood === 'gold') return 'pop';
  return len <= 18 && hash(song.id, index, 'vert') < 0.45 ? 'vertical' : 'pop';
}

export function buildTimeline(song, duration) {
  const cues = song.cues;
  const intro = cues[0].time;
  const lines = song.lyrics.map((lyric, i) => {
    const start = cues[i].time;
    const nextStart = cues[i + 1]?.time;
    const end = nextStart ?? Math.min(duration - 3, start + clamp(visibleLength(lyric.text) * 0.45, 3.5, 8));
    const chapter = song.chapters[lyric.chapter];
    return { ...lyric, text: cues[i].text || lyric.text, index: i, start, end: Math.max(end, start + 0.4), action: chapter.action };
  });
  lines.forEach((line, i) => { line.mode = typeMode(song, line, i); });

  const chapters = song.chapters.map((chapter, i) => {
    const own = lines.filter(l => l.chapter === i);
    return { ...chapter, index: i, start: own[0].start, end: own[own.length - 1].end };
  });
  const outroStart = Math.min(lines[lines.length - 1].end, duration - 2);

  // Camera shots: one per line, long lines are split, choruses cut every four beats.
  const shots = [];
  const beat = 60 / song.bpm;
  let previous = '';
  const pick = (mood, key) => {
    const pool = SHOTS[mood].filter(s => s !== previous);
    previous = pool[Math.floor(hash(song.id, key) * pool.length)];
    return previous;
  };
  if (intro > 0.5) {
    const half = intro > 6 ? intro * 0.55 : intro;
    shots.push({ start: 0, end: half, type: 'crane', seed: hash(song.id, 'intro') });
    if (half < intro) shots.push({ start: half, end: intro, type: 'windows', seed: hash(song.id, 'intro2') });
  }
  lines.forEach((line, i) => {
    const mood = MOOD[line.action] ?? 'calm';
    const length = line.end - line.start;
    const piece = mood === 'hot' ? Math.max(beat * 4, 1.6) : 5.5;
    const count = Math.max(1, Math.round(length / piece));
    for (let k = 0; k < count; k++) {
      shots.push({
        start: line.start + (length * k) / count,
        end: line.start + (length * (k + 1)) / count,
        type: pick(mood, `${i}:${k}`),
        seed: hash(song.id, i, k),
        mood,
        cut: k === 0,
      });
    }
  });
  shots.push({ start: outroStart, end: duration + 1, type: 'pullback', seed: 0.3, mood: 'calm' });
  shots[0].start = 0;
  for (let i = 0; i < shots.length - 1; i++) shots[i].end = shots[i + 1].start;

  return { song, duration, intro, lines, chapters, shots, outroStart, beat };
}

// Index of the last element whose start is <= t (binary search over sorted starts).
export function findAt(list, t) {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}
