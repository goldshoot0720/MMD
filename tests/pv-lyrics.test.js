import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTimeline, findAt } from '../src/pv/timeline.js';
import { effectsSongs } from '../src/effects-songs.js';
import { chapters, flattenLyrics } from '../src/song-data.js';
import { parseLrc } from '../src/lrc.js';
import { lyricPlate, LYRIC_BAND } from '../src/pv/type.js';

function asSong(raw) {
  const lyrics = flattenLyrics(raw.chapters);
  const cues = raw.times.map((time, i) => ({ time, text: lyrics[i].text }));
  return { ...raw, lyrics, cues };
}

const weddingTimes = parseLrc(readFileSync(new URL('../src/wedding.lrc', import.meta.url), 'utf8')).map(cue => cue.time);
const songs = [
  asSong({ id: 'wedding', title: 'wedding', chapters, times: weddingTimes }),
  ...effectsSongs.map(asSong),
];

test('every lyric uses the same plate and stays up until the next line', () => {
  for (const song of songs) {
    const duration = song.times.at(-1) + 12;
    const timeline = buildTimeline(song, duration);
    assert.equal(timeline.lines.length, song.lyrics.length, song.id);
    for (let i = 0; i < timeline.lines.length; i++) {
      const line = timeline.lines[i];
      assert.equal(line.mode, 'plate', `${song.id} #${i}`);
      assert.ok(line.end > line.start, `${song.id} #${i}`);
      if (i + 1 < timeline.lines.length) assert.equal(line.end, timeline.lines[i + 1].start, `${song.id} gap ${i}`);
      const plate = lyricPlate(line.text, 1080, song.id === 's028' ? 58 : 0);
      assert.ok(plate.top >= plate.bandTop - 1, `${song.id} above band`);
      assert.ok(plate.top + plate.block <= plate.bandBottom + 1, `${song.id} below band`);
      assert.equal(plate.bandTop, Math.round(1080 * (1 - LYRIC_BAND)));
      assert.ok(plate.size >= 14 && plate.size <= 72);
    }
  }
});

test('s102 still has a lyric at the cuts that used to go blank or cover the cast', () => {
  const song = songs.find(item => item.id === 's102');
  const timeline = buildTimeline(song, 127);
  for (const t of [25, 28, 36, 45, 66, 77]) {
    const line = timeline.lines[findAt(timeline.lines, t)];
    assert.ok(line && t >= line.start && t < line.end, `t=${t}`);
    assert.equal(line.mode, 'plate');
  }
  assert.match(timeline.lines[findAt(timeline.lines, 36)].text, /鋒兄買單/);
});
