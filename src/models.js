import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export const models = [
 ...['魚妹','小塗','鋒兄','牙妹'].map((name,i)=>({id:i+1,name:`${name} · 原版`,format:'GLB',url:`/models/${i+1}/base_basic_pbr.glb`,preview:`/models/${i+1}/preview.webp`})),
 ...[['Yamei','牙妹'],['Gugugaga-pose','Gugugaga'],['Miabyby-pose','Miabyby'],['Dpskmusume','Dpskmusume'],['Yumei-pose','魚妹'],['fengbro-pose','鋒兄'],['Tu-pose','小塗'],['Miabubu-pose','Miabubu']].map(([file,name],i)=>({id:i+5,name,format:'FBX',url:`/models/fbx/${file}.fbx`}))
];
export const performanceModelIds=[10,5,11,9];
export const modelById=id=>models.find(m=>m.id===id);
const gltfLoader=new GLTFLoader(),fbxLoader=new FBXLoader();
// onProgress receives a 0–1 fraction while the file downloads (when the server
// reports a length), so the UI can show a real progress bar for large FBX files.
export async function loadAsset(url, format = 'GLB', onProgress) {
 const progress = event => {
  if (onProgress && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
 };
 if (format === 'FBX') {
  const scene = await fbxLoader.loadAsync(url, progress);
  onProgress?.(1);
  return { scene, animations: scene.animations };
 }
 const gltf = await gltfLoader.loadAsync(url, progress);
 onProgress?.(1);
 return gltf;
}
export function instantiateAsset(asset) {
 const model=clone(asset.scene);
 model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const wrapper=new THREE.Group(),offset=new THREE.Group();
 offset.position.set(-center.x,-box.min.y,-center.z);offset.add(model);wrapper.add(offset);
 wrapper.scale.setScalar(2.8/Math.max(size.y,.001));wrapper.position.y=.04;
 model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
 return wrapper;
}
