// Run in the dev page console: await (await import('/verification/check-couples.js')).checkCouples()
import * as THREE from 'three';
import { performanceModelIds, modelById, loadAsset, instantiateAsset } from '../src/models.js';
import { createDancer } from '../src/dance.js';
import { coupleCue, applyCouples } from '../src/couples.js';
export async function checkCouples(){
 const actors=await Promise.all(performanceModelIds.map(async id=>{
  const model=modelById(id),actor=new THREE.Group();actor.add(instantiateAsset(await loadAsset(model.url,model.format)));return actor;
 }));
 const dancers=actors.map(a=>createDancer(a.children[0]));
 const pose=()=>actors.flatMap(a=>{const values=[];a.traverse(b=>{if(b.isBone)values.push(...b.quaternion.toArray());});return values;});
 const results=[];
 for(const mode of ['hold','hug','hold']){
  dancers.forEach(d=>d.apply(24,{action:'dance'}));
  const contacts=applyCouples(actors,dancers,coupleCue('intro',0,100,mode));
  const maxError=Math.max(...contacts.map(c=>c.error));
  if(contacts.length!==(mode==='hold'?4:8)||maxError>1e-5)throw new Error(`${mode}: contact failed ${maxError}`);
  const values=pose();if(!values.every(Number.isFinite))throw new Error('Non-finite pose');
  if(results.length===2&&values.some((v,i)=>Math.abs(v-results[0].pose[i])>1e-6))throw new Error('Seek is not deterministic');
  results.push({mode,maxError,contacts:contacts.length,pose:values});
 }
 return results.map(({pose,...result})=>result);
}
