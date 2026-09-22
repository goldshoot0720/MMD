import * as THREE from 'three';

export const couples=[[0,1],[2,3]];
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export function coupleCue(action,elapsed,remaining,mode='auto'){
 if(mode==='dance')return {pairs:[],weight:0,hug:0};
 if(mode==='hold'||mode==='hug')return {pairs:couples,weight:1,hug:mode==='hug'?1:0};
 const pairs=action==='proposal'?[couples[0]]:action==='jackpot'?[couples[1]]:action==='wedding'?couples:[];
 return {pairs,weight:smooth(elapsed/1.5)*smooth(remaining/1.5),hug:smooth((elapsed-8)/2)};
}
const pos=b=>b.getWorldPosition(new THREE.Vector3());
function turnToward(bone,child,target){
 const origin=pos(bone),from=pos(child).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
 const rotation=new THREE.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
 bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
 bone.updateWorldMatrix(false,true);
}
// Analytic two-link IK: keep bone lengths and select the elbow's bending plane.
export function solveArm(root,side,target,pole,weight=1){
 const find=name=>{let found;root.traverse(n=>{if(n.isBone&&n.name.replace(/^.*mixamorig[:_]?/i,'')===name)found=n;});return found;};
 const arm=find(side+'Arm'),elbow=find(side+'ForeArm'),hand=find(side+'Hand');
 if(!arm||!elbow||!hand)return null;
 root.updateWorldMatrix(true,true);
 const saved=[arm,elbow].map(b=>b.quaternion.clone());
 const a=pos(arm),b=pos(elbow),c=pos(hand),upper=a.distanceTo(b),lower=b.distanceTo(c);
 const direction=target.clone().sub(a),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(upper-lower)+1e-5,upper+lower-1e-5);direction.normalize();
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 const bend=pole.clone().sub(a);bend.addScaledVector(direction,-bend.dot(direction));
 if(bend.lengthSq()<1e-8)bend.set(0,0,1).addScaledVector(direction,-direction.z);
 bend.normalize();
 const elbowTarget=a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
 turnToward(arm,elbow,elbowTarget);turnToward(elbow,hand,a.clone().addScaledVector(direction,distance));
 [arm,elbow].forEach((bone,i)=>bone.quaternion.slerpQuaternions(saved[i],bone.quaternion.clone(),weight));
 root.updateWorldMatrix(true,true);
 return {error:pos(hand).distanceTo(target),hand};
}
export function applyCouples(performers,dancers,state){
 const contacts=[];
 for(const [left,right] of state.pairs){
  if(!dancers[left]?.supported||!dancers[right]?.supported)continue;
  const indices=[left,right],center=left===0?-1.65:1.65;
  indices.forEach((index,k)=>{
   const actor=performers[index],sign=k===0?-1:1;
   const spacing=THREE.MathUtils.lerp(.50,.22,state.hug);
   const target=new THREE.Vector3(center+sign*spacing,0,0);
   actor.position.lerp(target,state.weight);
   const facing=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-sign*Math.PI/2*state.hug,0));
   actor.quaternion.slerp(facing,state.weight);actor.scale.lerp(new THREE.Vector3(.78,.78,.78),state.weight);
   // Stable legs and torso during contact; arms are solved after both partners move.
   const bones=[];actor.traverse(n=>{if(n.isBone)bones.push([n,n.quaternion.clone()]);});
   const root=actor.children[0],previousY=root.position.y;
   dancers[index].apply(0,{action:'intro',intensity:0});
   bones.forEach(([bone,previous])=>bone.quaternion.slerpQuaternions(previous,bone.quaternion.clone(),state.weight));
   root.position.y=THREE.MathUtils.lerp(previousY,root.position.y,state.weight);
   actor.updateWorldMatrix(true,true);
  });
  indices.forEach((index,k)=>{
   const actor=performers[index],partner=performers[indices[1-k]],inner=k===0?'Left':'Right';
   for(const side of ['Left','Right']){
    const isInner=side===inner;
    if(!isInner&&state.hug===0)continue;
    const hold=new THREE.Vector3(center+(k===0?-.20:.20),1.50,.05);
    const hug=new THREE.Vector3(partner.position.x+(k===0?-.12:.12),k===0?1.65:1.55,0);
    // Each arm stays on its own side of the couple instead of crossing torsos.
    hug.z=(side==='Left'?-1:1)*(k===0?1:-1)*.18;
    const target=isInner?hold.lerp(hug,state.hug):hug;
    const pole=new THREE.Vector3(actor.position.x,1.05,(side==='Left'?-1:1)*(k===0?1:-1)*.8);
    if(state.hug<.5)pole.set(actor.position.x,1.1,.5);
    const result=solveArm(actor,side,target,pole,state.weight*(isInner?1:state.hug));
    if(result&&isInner&&state.hug<1){
     const finger=result.hand.children.find(b=>b.isBone&&b.name.includes('Index1'));
     if(finger){const previous=result.hand.quaternion.clone();turnToward(result.hand,finger,new THREE.Vector3(center,1.50,.05));result.hand.quaternion.slerpQuaternions(previous,result.hand.quaternion.clone(),state.weight*(1-state.hug));}
    }
    if(result)contacts.push({index,side,error:result.error,target:target.toArray()});
   }
  });
 }
 return contacts;
}
