import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dancePose, createDancer } from '../src/dance.js';
const values=p=>Object.values(p.pose).flat();
test('all sections animate arms, knees and torso with finite bounded poses throughout the song',()=>{
 for(const action of ['intro','tease','proposal','dance','jackpot','wedding']){
  for(let t=0;t<145;t+=.137){const p=values(dancePose(t,{action}));assert.ok(p.every(v=>Number.isFinite(v)&&Math.abs(v)<Math.PI));}
  const samples=Array.from({length:64},(_,i)=>dancePose(i*.25,{action}).pose);
  for(const joint of ['LeftArm','RightArm','LeftLeg','RightLeg','Spine'])assert.ok(samples.some(p=>p[joint].some((v,i)=>Math.abs(v-samples[0][joint][i])>.01)),`${action}: ${joint}`);
 }
});
test('phrase transitions are continuous and scrubbing is stateless',()=>{
 for(const bpm of [60,120,200])for(const action of ['intro','tease','proposal','dance','jackpot','wedding']){
  for(let phrase=1;phrase<12;phrase++){
   const t=phrase*8*60/bpm;
   const a=values(dancePose(t-1e-5,{bpm,action})),b=values(dancePose(t+1e-5,{bpm,action}));
   assert.ok(a.every((v,i)=>Math.abs(v-b[i])<.001));
  }
  const a=dancePose(31.25,{bpm,action});dancePose(100,{bpm,action});assert.deepEqual(dancePose(31.25,{bpm,action}),a);
 }
});
test('rigs without supported bones degrade safely',()=>{
 const dancer=createDancer(new THREE.Group());assert.equal(dancer.supported,false);assert.equal(dancer.apply(12),null);dancer.reset();
});

test('extended choreography has distinct footwork and expressive arms throughout its cycle',()=>{
 const feet=new Set(),arms=new Set();
 for(let phrase=0;phrase<8;phrase++){
  const samples=Array.from({length:12},(_,i)=>dancePose(phrase*4+i*.125,{action:'dance'}).pose);
  feet.add(JSON.stringify(samples.map(p=>['LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'].map(k=>p[k]))));
  arms.add(JSON.stringify(samples.map(p=>['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'].map(k=>p[k]))));
  for(const joint of ['LeftUpLeg','RightUpLeg','LeftFoot','RightFoot','LeftArm','RightArm','LeftHand','RightHand']){
   assert.ok(samples.some(p=>p[joint].some((v,i)=>Math.abs(v-samples[0][joint][i])>.05)),`${phrase}: ${joint} should move`);
  }
 }
 assert.equal(feet.size,8);assert.equal(arms.size,8);
 const march=dancePose(.25,{action:'dance'}).pose;
 assert.ok(march.LeftUpLeg[0]<-.8&&march.LeftLeg[0]>1,'high knee must visibly lift and bend');
 const curl=dancePose(28.25,{action:'dance'}).pose;
 assert.ok(curl.LeftLeg[0]>1,'back curl must bend the knee');
});
