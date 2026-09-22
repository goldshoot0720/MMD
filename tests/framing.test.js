import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defaultDuration, cueAt, actorPose } from '../src/song-data.js';
import { showDistance, subtitleTilt, performerReach, cameraSway, clearance, frontRow,
         orbitCeiling, targetHeight, castTop, castFloor, plateCover } from '../src/framing.js';

// OrbitControls re-clamps the camera to maxDistance on every update, so a framing test
// that only checks showDistance would pass while the shot is silently cropped.
function place(camera, target, distance, sway) {
 camera.position.set(sway, 3.05, distance);
 const radius = camera.position.distanceTo(target), ceiling = orbitCeiling(distance);
 if (radius > ceiling) camera.position.sub(target).multiplyScalar(ceiling / radius).add(target);
 camera.lookAt(target);
 camera.updateMatrixWorld(true);
}

// Stage box (not window) sizes the layout actually produces, from the CSS breakpoints.
const stages = [
 ['phone portrait 412x634', 412, 436, .31],
 ['iPhone SE2 portrait 375x553', 375, 355, .29],
 ['iPhone SE2 landscape 667x320', 667, 195, .26],
 ['phone landscape 915x270', 900, 145, .34],
 ['tablet portrait 820x1100', 565, 810, .18],
 ['tablet landscape 1180x744', 860, 500, .23],
 ['tablet landscape 1024x600', 704, 356, .31],
 ['desktop 1400x1000', 1080, 710, .22],
 ['desktop 1287x640 (150% zoom)', 967, 366, .30]
];
const step = .1;

test('the clearance constant still covers the choreography', () => {
 let widest = 0, at = null;
 for (let t = 0; t <= defaultDuration; t += step) {
  const cue = cueAt(t, defaultDuration);
  for (let i = 0; i < 4; i++) {
   const pose = actorPose(i, t, cue);
   const reach = Math.abs(pose.x) + performerReach(pose.scale) + cameraSway;
   if (reach > widest) { widest = reach; at = { t: +t.toFixed(2), performer: i, action: cue.chapterData.action }; }
   assert.ok(pose.z <= frontRow + 1e-9, `${cue.chapterData.action}: performer ${i} stands at z=${pose.z}, past the front row`);
  }
 }
 assert.ok(widest <= clearance, `choreography reaches ${widest.toFixed(3)} at ${JSON.stringify(at)}, past clearance ${clearance}`);
 // Keep the constant honest: it should not drift far above what the song needs.
 assert.ok(widest > clearance - .25, `clearance ${clearance} is ${(clearance - widest).toFixed(3)} wider than the song needs`);
});

test('no performer is cropped sideways on any stage shape', () => {
 for (const [name, w, h, share] of stages) {
  const camera = new THREE.PerspectiveCamera(36, w / h, .1, 80);
  for (let t = 0; t <= defaultDuration; t += step) {
   const cue = cueAt(t, defaultDuration);
   const shot = { action: cue.chapterData.action, fov: camera.fov, aspect: camera.aspect, stageHeight: h, subtitleShare: share };
   const distance = showDistance(shot);
   const target = new THREE.Vector3(0, targetHeight - subtitleTilt({ distance, fov: camera.fov, subtitleShare: share }), 0);
   for (const sway of [-cameraSway, cameraSway]) {
    place(camera, target, distance, sway);
    for (let i = 0; i < 4; i++) {
     const pose = actorPose(i, t, cue);
     const reach = performerReach(pose.scale);
     for (const edge of [-reach, reach]) {
      for (const y of [pose.y, pose.y + 1.2, pose.y + 2.2 * pose.scale]) {
       const ndc = new THREE.Vector3(pose.x + edge, y, pose.z).project(camera);
       assert.ok(Math.abs(ndc.x) <= 1,
        `${name}: performer ${i} at t=${t.toFixed(2)} (${cue.chapterData.action}) projects to x=${ndc.x.toFixed(3)}, off frame`);
       assert.ok(ndc.y <= 1,
        `${name}: performer ${i} at t=${t.toFixed(2)} (${cue.chapterData.action}) projects to y=${ndc.y.toFixed(3)}, over the top edge`);
      }
     }
    }
   }
  }
 }
});

test('a short stage pulls the camera in and a narrow one pushes it back', () => {
 const wide = { action: 'dance', fov: 36, aspect: 1080 / 710, stageHeight: 710 };
 assert.equal(showDistance(wide), 12.5);
 // The authored 10.5 sits a hair inside what the x=+-3 pair needs even on a desktop,
 // so the fit constraint nudges it out rather than clipping them.
 const close = showDistance({ ...wide, action: 'proposal' });
 assert.ok(close > 10.5 && close < 10.6, `proposal shot moved to ${close}`);
 // Same stage, half the height: closer, so the cast keeps its apparent size.
 assert.ok(showDistance({ ...wide, aspect: 1080 / 355, stageHeight: 355 }) < 12.5);
 // Tablet portrait is narrow enough that the fit constraint takes over.
 assert.ok(showDistance({ ...wide, aspect: 565 / 810, stageHeight: 810 }) > 12.5);
});

test('nobody stands behind the subtitle plate', () => {
 for (const [name, w, h, share] of stages) {
  const camera = new THREE.PerspectiveCamera(36, w / h, .1, 80);
  // The plate is a transparent-to-dark gradient, so only its lower part hides anything.
  const plateTop = -1 + 2 * plateCover * Math.min(.45, share);
  for (let t = 0; t <= defaultDuration; t += step) {
   const cue = cueAt(t, defaultDuration);
   const distance = showDistance({ action: cue.chapterData.action, fov: camera.fov, aspect: camera.aspect, stageHeight: h, subtitleShare: share });
   const target = new THREE.Vector3(0, targetHeight - subtitleTilt({ distance, fov: camera.fov, subtitleShare: share }), 0);
   place(camera, target, distance, 0);
   for (let i = 0; i < 4; i++) {
    const pose = actorPose(i, t, cue);
    const feet = new THREE.Vector3(pose.x, pose.y + castFloor, pose.z).project(camera);
    const head = new THREE.Vector3(pose.x, castTop, pose.z).project(camera);
    assert.ok(feet.y >= plateTop,
     `${name}: performer ${i} at t=${t.toFixed(2)} (${cue.chapterData.action}) stands at y=${feet.y.toFixed(3)}, below the plate at ${plateTop.toFixed(3)}`);
    assert.ok(head.y <= 1,
     `${name}: performer ${i} at t=${t.toFixed(2)} (${cue.chapterData.action}) reaches y=${head.y.toFixed(3)}, over the top edge`);
   }
  }
 }
});
