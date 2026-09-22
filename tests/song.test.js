import test from 'node:test';
import assert from 'node:assert/strict';
import { chapters, lyrics, cueAt, chapterTime, actorPose, cast, defaultDuration } from '../src/song-data.js';
test('every lyric is reachable and the exact ending remains on the last line',()=>{assert.equal(lyrics.length,33);assert.equal(defaultDuration,132);lyrics.forEach((l,i)=>{assert.equal(cueAt(i*4).text,l.text);assert.equal(cueAt(i*4+3.99).text,l.text);});assert.equal(cueAt(132).text,'那我明天也去買一張');assert.equal(cueAt(-1).index,0);});
test('chapter navigation follows cue boundaries including retimed audio',()=>{for(const duration of [132,205.7,10])chapters.forEach((chapter,i)=>{const cue=cueAt(chapterTime(i,duration),duration);assert.equal(cue.chapter,i);assert.equal(cue.line,0);});});
test('poses remain finite during full performance and deterministic when scrubbing',()=>{for(let t=0;t<=132;t+=.125){const cue=cueAt(t);for(let i=0;i<4;i++){const p=actorPose(i,t,cue);assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.y>=0);assert.deepEqual(actorPose(i,t,cue),p);}}});
test('the performer cast keeps each named character on the correct model thumbnail',()=>{assert.deepEqual(cast,[{name:'鋒兄',modelId:3},{name:'牙妹',modelId:4},{name:'小塗',modelId:2},{name:'魚妹',modelId:1}]);assert.deepEqual([...new Set(cast.map(({modelId})=>modelId))].sort((a,b)=>a-b),[1,2,3,4]);});
