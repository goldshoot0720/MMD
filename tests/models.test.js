import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { models, performanceModelIds, modelById, instantiateAsset } from '../src/models.js';

test('all bundled cast models resolve to real assets',()=>{
 assert.equal(new Set(models.map(m=>m.id)).size,12);
 for(const m of models)assert.ok(existsSync(new URL(`../public${m.url}`,import.meta.url)),m.url);
 assert.deepEqual(performanceModelIds.map(id=>modelById(id).name),['鋒兄','牙妹','小塗','魚妹']);
});
test('performer copies have independent bones and normalization preserves authored transforms',()=>{
 const geometry=new THREE.BoxGeometry(1,2,1);
 const count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
 const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());
 const bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
 const scene=new THREE.Group();scene.scale.setScalar(100);scene.add(mesh);
 const a=instantiateAsset({scene}),b=instantiateAsset({scene});
 let first,second;a.traverse(n=>{if(n.isSkinnedMesh)first=n;});b.traverse(n=>{if(n.isSkinnedMesh)second=n;});
 assert.notEqual(first.skeleton.bones[0],second.skeleton.bones[0]);
 first.skeleton.bones[0].rotation.z=.5;assert.ok(Math.abs(second.skeleton.bones[0].rotation.z)<1e-9);
 const bounds=new THREE.Box3().setFromObject(b);
 assert.ok(Math.abs(bounds.max.y-bounds.min.y-2.8)<1e-6);
 assert.ok(Math.abs(bounds.min.y-.04)<1e-6);
 assert.equal(scene.scale.x,100);
});
