// Song catalogue for the lyric theatre. Every song resolves to the same shape:
// chapters (title/theme/action/lines), lyrics, per-line LRC cues and a four-person cast.
import weddingLrc from './wedding.lrc?raw';
import { parseLrc } from './lrc.js';
import { chapters, lyrics, cast, flattenLyrics } from './song-data.js';
import { effectsSongs } from './effects-songs.js';
import { performanceModelIds } from './models.js';

export function buildSong({ times, ...song }) {
  const songLyrics = flattenLyrics(song.chapters);
  const cues = times.map((time, i) => ({ time, text: songLyrics[i]?.text }));
  if (cues.length !== songLyrics.length) throw new Error(`${song.title}：LRC 與分鏡句數不符`);
  const defaultCast = song.defaultCast ?? song.cast.map(({ modelId }) => modelId);
  return { ...song, defaultCast, lyrics: songLyrics, cues, defaultDuration: songLyrics.length * 4 };
}

const wedding = {
  id: 'wedding',
  title: '最瞎結婚理由',
  subtitle: '鋒兄 × 牙妹 · 小塗 × 魚妹',
  tagline: '一個號碼　兩場婚禮',
  audio: '/audio/wedding.mp3',
  bpm: 120,
  outro: '— 謝幕 · 願幸福都中頭獎 —',
  ending: '演出結束 · 願幸福都中頭獎',
  cast,
  defaultCast: performanceModelIds, // the FBX versions of the four named characters
  couples: true,
  chapters,
  times: parseLrc(weddingLrc).map(cue => cue.time),
};
if (wedding.times.length !== lyrics.length) throw new Error('LRC 與分鏡句數不符');

export const songs = [wedding, ...effectsSongs].map(buildSong);
export const songById = id => songs.find(song => song.id === id);
