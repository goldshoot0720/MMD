// Run in the dev page console: await (await import('/verification/gesture-gallery.js')).gestureGallery()
// Renders every story gesture on the 鋒兄 FBX at four moments of its phrase and returns PNG data URLs.
import * as THREE from 'three';
import { modelById, loadAsset, instantiateAsset } from '../src/models.js';
import { createDancer, gestureNames } from '../src/dance.js';
export async function gestureGallery({ modelId = 10, size = 220 } = {}) {
 const model = modelById(modelId);
 const root = instantiateAsset(await loadAsset(model.url, model.format));
 const scene = new THREE.Scene();
 scene.background = new THREE.Color(0x1d1b29);
 scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 2.2), root);
 const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
 const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
 renderer.setSize(size, size);
 const dancer = createDancer(root);
 const shots = {};
 for (const name of gestureNames) {
  shots[name] = [];
  for (const [view, x, z] of [['front', 0, 6.5], ['side', 5, 4]]) {
   for (const beat of [0.5, 1.5]) {
    dancer.apply(beat / 2, { moves: [name], bpm: 120, index: 0 });
    camera.position.set(x, 1.5, z);
    camera.lookAt(0, 1.35, 0);
    renderer.render(scene, camera);
    shots[name].push({ view, beat, url: renderer.domElement.toDataURL('image/png') });
   }
  }
 }
 renderer.dispose();
 return shots;
}
