import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { effectsSongs } from '../src/effects-songs.js';
import { flattenLyrics, cueAt, chapterTime, actorPose } from '../src/song-data.js';
import { timedCue } from '../src/lrc.js';
import { dancePose } from '../src/dance.js';

const actions = new Set(['tease', 'rally', 'jackpot']);

test('every imported song has matching timings, a bundled MP3 and a valid cast', () => {
  assert.equal(effectsSongs.length, 8);
  for (const song of effectsSongs) {
    const lyrics = flattenLyrics(song.chapters);
    assert.equal(song.times.length, lyrics.length, song.id);
    assert.ok(song.times.every((t, i) => i === 0 || t > song.times[i - 1]), `${song.id}: times strictly increase`);
    assert.ok(existsSync(new URL(`../public${song.audio}`, import.meta.url)), `${song.id}: audio file`);
    assert.equal(song.cast.length, 4);
    assert.ok(song.cast.every(({ modelId }) => modelId >= 5 && modelId <= 12), `${song.id}: FBX cast`);
    assert.ok(song.chapters.every(c => actions.has(c.action) && c.lines.length > 0), `${song.id}: chapters`);
    assert.ok(song.bpm >= 60 && song.bpm <= 200);
  }
});

test('each synced lyric line is reachable and chapters start where their first line starts', () => {
  for (const song of effectsSongs) {
    const lyrics = flattenLyrics(song.chapters);
    const cues = song.times.map((time, i) => ({ time, text: lyrics[i].text }));
    const end = song.times.at(-1) + 10;
    cues.forEach((cue, i) => {
      const hit = timedCue(cue.time + 0.01, end, cues, lyrics, song.chapters, song.title);
      assert.equal(hit.index, i, `${song.id} line ${i}`);
    });
    const untimed = { chapters: song.chapters, lyrics };
    song.chapters.forEach((_, i) => assert.equal(cueAt(chapterTime(i, 100, untimed), 100, untimed).chapter, i));
  }
});

test('the rally action poses and dances with finite values', () => {
  for (let t = 0; t < 60; t += 0.37) {
    for (let i = 0; i < 4; i++) {
      const pose = actorPose(i, t, { chapterData: { action: 'rally' }, line: 0 });
      assert.ok(Object.values(pose).every(Number.isFinite) && pose.y >= 0);
    }
    assert.ok(Object.values(dancePose(t, { action: 'rally' }).pose).flat().every(Number.isFinite));
  }
});

test('every chapter of every song names only known dance moves', async () => {
 const { danceNames } = await import('../src/dance.js');
 const { chapters } = await import('../src/song-data.js');
 for (const [id, list] of [['wedding', chapters], ...effectsSongs.map(s => [s.id, s.chapters])]) {
  list.forEach((c, i) => {
   assert.ok(Array.isArray(c.moves) && c.moves.length > 0, `${id} ${i}`);
   c.moves.forEach(m => assert.ok(danceNames[m], `${id} ${i}: ${m}`));
  });
 }
});
