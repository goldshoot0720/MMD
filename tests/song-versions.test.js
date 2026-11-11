import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { newEffectsVersions } from '../src/new-effects-data.js';
import { buildVersions, groupSongs } from '../src/song-versions.js';
import { effectsSongs } from '../src/effects-songs.js';
import { chapters, cast, flattenLyrics, stageOrder } from '../src/song-data.js';
import { styleFor } from '../src/pv/styles.js';
import { buildTimeline, findAt } from '../src/pv/timeline.js';
import { lyricPlate } from '../src/pv/type.js';

const wedding = { id:'wedding', title:'最瞎結婚理由', subtitle:'鋒兄 × 牙妹 · 小塗 × 魚妹', tagline:'一個號碼　兩場婚禮', chapters, cast, defaultCast:[10,5,11,9], couples:true, bpm:120 };
const versions = buildVersions([wedding, ...effectsSongs]);

test('nine stable PV families each have four independent language versions',()=>{
 const groups=groupSongs(versions);
 assert.equal(groups.length,9);
 assert.equal(versions.length,36);
 assert.equal(new Set(versions.map(s=>s.id)).size,36);
 assert.deepEqual(groups.map(g=>g.number),[1,2,3,4,5,6,7,8,9]);
 assert.deepEqual(groups.map(g=>g.id),['wedding','s023','s024','s026','s027','s028','s062','s101','s102']);
 for(const group of groups){
  assert.deepEqual(group.variants.map(s=>s.language),['zh','en','ja','yue']);
  assert.equal(new Set(group.variants.map(s=>s.audio)).size,4);
  for(const song of group.variants){
   assert.ok(existsSync(new URL(`../public${song.audio}`,import.meta.url)),song.id);
   assert.equal(styleFor(song.id).pattern,styleFor(song.baseId).pattern);
   if(song.baseId==='s102')assert.deepEqual(song.cast.map(c=>c.modelId),[10,12,11,6,13]);
   assert.equal(song.cast.some(c=>c.danceStyle==='paws'),song.baseId==='s102');
  }
 }
});

test('all imported sung lines and cue starts match the original language SRT without interpolation',()=>{
 for(const song of versions){
  const source=newEffectsVersions.find(s=>s.id===song.id);
  const lyrics=flattenLyrics(song.chapters);
  assert.deepEqual(lyrics.map(l=>l.text),source.cues.map(c=>c.text),song.id);
  assert.deepEqual(song.times,source.cues.map(c=>c.time),song.id);
  assert.deepEqual(song.ends,source.cues.map(c=>c.end),song.id);
  assert.ok(song.times.every((t,i)=>t>=0&&(!i||t>song.times[i-1])));
  assert.ok(source.cues.every(c=>c.end>c.time&&c.end<song.duration+.1));
  const cues=song.times.map((time,i)=>({time,text:lyrics[i].text}));
  const timeline=buildTimeline({...song,lyrics,cues},song.duration);
  for(let i=0;i<lyrics.length;i++){
   assert.equal(timeline.lines[findAt(timeline.lines,song.times[i]+.001)].text,lyrics[i].text,`${song.id} ${i}`);
   const plate=lyricPlate(lyrics[i].text,1080,song.baseId==='s028'?58:0);
   assert.ok(plate.rows.length<=4&&plate.top+plate.block<=plate.bandBottom+1,`${song.id} caption overflows`);
   assert.ok(plate.size>=40,`${song.id} caption too small`);
  }
 }
});

test('localized jackpot stage copy survives the NewEffects import',()=>{
 const en=versions.find(s=>s.id==='s102-en');
 assert.equal(en.chapters[0].prop,'🎂 Happy 37th Birthday, Feng!');
 assert.ok(!/[\u3400-\u9fff]/u.test([en.outro,en.ending,...en.chapters.flatMap(c=>[c.title,c.prop??''])].join('')));
 assert.equal(versions.find(s=>s.id==='wedding-en').couples,true);
});

test('English and Japanese PV cues carry a smaller Chinese line below the original', () => {
 for (const song of versions) {
  if (!['en', 'ja'].includes(song.language)) {
   assert.equal(song.translations, undefined, song.id);
   continue;
  }
  const lyrics = flattenLyrics(song.chapters);
  const cues = lyrics.map(({ text }, i) => ({ text, time: song.times[i], end: song.ends[i] }));
  const timeline = buildTimeline({ ...song, lyrics, cues }, song.duration);
  for (const line of timeline.lines) {
   assert.match(line.translation, /\p{Script=Han}/u, song.id);
   const plate = lyricPlate(line.text, 1080, song.baseId === 's028' ? 58 : 0, line.translation);
   assert.ok(plate.translationSize > 0 && plate.translationSize < plate.size, song.id);
   assert.ok(plate.translationY > plate.top + plate.rows.length * plate.lineH, song.id);
   assert.ok(plate.top + plate.block <= plate.bandBottom, song.id);
  }
  if (song.id === 's102-ja') {
   const repeated = timeline.lines.filter(line => line.text === 'りょうけのおやもあつまる');
   assert.deepEqual(repeated.map(({ start, end }) => [start, end]), [
    [52.52, 56.2], [66.28, 68.67], [106.2, 110.32],
   ]);
  }
 }
});

test('the jackpot credits use the localized cast names in stage order', () => {
 const expected = {
  zh: ['喵布布', '咕咕嘎嘎', '鋒兄', '塗哥', 'ＧＰＴ娘'],
  en: ['Bu Bu', 'Gugugaga', 'Feng', 'Tu', 'GPT Musume'],
  ja: ['ブブ', 'ググガガ', 'フェン', 'トゥ', 'GPTむすめ'],
 };
 for (const song of versions.filter(s => s.baseId === 's102' && s.language in expected)) {
  assert.deepEqual(stageOrder(song.cast.length).map(i => song.pvCastNames[i]), expected[song.language]);
 }
});
