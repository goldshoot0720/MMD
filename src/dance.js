import * as THREE from 'three';

export const danceNames={groove:'踏步律動',wave:'交替揮手',disco:'斜向指天',clap:'胸前合拍',reach:'雙手上舉',swing:'側步擺臂',heart:'胸前收手',bow:'鞠躬謝幕'};
const sequences={intro:['groove','wave'],tease:['wave','swing'],proposal:['heart','reach','clap','wave'],dance:['disco','swing','reach','clap'],jackpot:['reach','disco','wave','swing'],wedding:['heart','clap','wave','bow']};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const blend=(a,b,k)=>Object.fromEntries(Object.keys(a).map(key=>[key,a[key].map((v,i)=>THREE.MathUtils.lerp(v,b[key][i],k))]));
function motif(name,beat,index){
 const cycle=beat*Math.PI,step=Math.sin(cycle),pulse=(1-Math.cos(cycle*2))/2;
 const p={Hips:[0,.06*Math.sin(cycle/2),.035*step],Spine:[.04*pulse,.07*step,.04*step],Spine1:[0,.04*step,0],Spine2:[0,0,.025*step],Neck:[0,0,0],Head:[.035*Math.sin(cycle*2),.08*Math.sin(cycle/2),0]};
 for(const [side,sign] of [['Left',1],['Right',-1]]){
  const lift=Math.max(0,sign*step),opposite=Math.max(0,-sign*step);
  p[side+'Shoulder']=[0,0,sign*.025*pulse];
  p[side+'Arm']=[.08*step,-sign*.15,-sign*(1.15+.12*sign*step)];
  p[side+'ForeArm']=[0,-sign*(.35+.2*opposite),0];
  p[side+'Hand']=[0,0,sign*.08*step];
  p[side+'UpLeg']=[-.25*lift,0,sign*.035];
  p[side+'Leg']=[.35*lift+.09*pulse,0,0];
  p[side+'Foot']=[-.12*lift-.06*pulse,0,0];
  if(name==='wave'){p[side+'Arm']=[0,-sign*.2,sign*(.15+.65*Math.sin(cycle/2+sign))];p[side+'ForeArm']=[0,-sign*.6,sign*.4*Math.sin(cycle*2)];}
  if(name==='disco'){const up=(1+sign*Math.sin(cycle/2))/2;p[side+'Arm']=[0,-sign*.15,-sign*1.1+sign*2*up];p[side+'ForeArm']=[0,-sign*.15,0];p.Spine[2]=.12*step;}
  if(name==='clap'){p[side+'Arm']=[0,-sign*1.15,-sign*.55];p[side+'ForeArm']=[0,-sign*(.55+.45*pulse),0];}
  if(name==='reach'){p[side+'Arm']=[0,-sign*.12,sign*(.8+.22*pulse)];p[side+'ForeArm']=[0,-sign*.15,sign*.18*pulse];p[side+'UpLeg'][0]=-.4*lift;p[side+'Leg'][0]=.6*lift;}
  if(name==='swing'){p[side+'Arm']=[0,-sign*(.25+.65*sign*step),-sign*.85];p[side+'ForeArm']=[0,-sign*.65,0];p[side+'UpLeg'][2]=sign*(.04+.12*opposite);p.Spine[1]=.15*step;}
  if(name==='heart'){p[side+'Arm']=[0,-sign*.8,-sign*.85];p[side+'ForeArm']=[0,-sign*1.4,0];p.Head[2]=.08*Math.sin(cycle/2);}
  if(name==='bow'){const bend=.5*(1-Math.cos(beat*Math.PI/4));p.Spine[0]=.4*bend;p.Spine1[0]=.2*bend;p.Head[0]=.12*bend;p[side+'Arm']=[0,0,-sign*1.35];p[side+'UpLeg']=[0,0,sign*.035];p[side+'Leg']=[.08,0,0];}
 }
 return p;
}
export function dancePose(time,{action='dance',bpm=120,offset=0,index=0,intensity=1}={}){
 const beat=Math.max(0,(time-(action==='intro'?0:offset))*bpm/60),phrase=Math.floor(beat/8),fraction=beat%8;
 const sequence=sequences[action]||sequences.dance;
 const name=sequence[phrase%sequence.length],next=sequence[(phrase+1)%sequence.length];
 const pose=blend(motif(name,beat,index),motif(next,beat,index),smooth((fraction-6)/2));
 // A fixed neutral arm angle keeps reduced intensity from returning to a T-pose.
 for(const key of Object.keys(pose))pose[key]=pose[key].map((v,i)=>{
  const neutral=key.endsWith('Arm')&&!key.endsWith('ForeArm')&&i===2?(key.startsWith('Left')?-1.2:1.2):0;
  return neutral+(v-neutral)*intensity;
 });
 return {pose,name:danceNames[name]};
}

// Convert character-space rotation deltas to each bone's original parent axes.
// Never accumulate rotations: seeking and reverse scrubbing give identical poses.
export function createDancer(root){
 root.updateWorldMatrix(true,true);
 const inverseRoot=root.getWorldQuaternion(new THREE.Quaternion()).invert(),joints=new Map();
 root.traverse(bone=>{if(!bone.isBone)return;const name=bone.name.replace(/^.*mixamorig[:_]?/i,'');
 const parentBasis=inverseRoot.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
 joints.set(name,{bone,rest:bone.quaternion.clone(),basis:parentBasis,inverse:parentBasis.clone().invert()});});
 const supported=['Hips','Spine','Head','LeftArm','RightArm','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg'].every(n=>joints.has(n));
 const feet=['LeftFoot','LeftToeBase','RightFoot','RightToeBase'].map(n=>joints.get(n)?.bone).filter(Boolean);
 const point=new THREE.Vector3(),inverse=new THREE.Matrix4();
 function floorHeight(){root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();return Math.min(...feet.map(b=>b.getWorldPosition(point).applyMatrix4(inverse).y));}
 const floor=supported?floorHeight():0,baseY=root.position.y;
 const q=new THREE.Quaternion(),euler=new THREE.Euler();
 return {supported,apply(time,options={}){
  if(!supported)return null;
  const result=dancePose(time,options);
  if(options.previousAction&&options.transition<1){const previous=dancePose(time,{...options,action:options.previousAction});result.pose=blend(previous.pose,result.pose,smooth(options.transition));}
  for(const {bone,rest} of joints.values())bone.quaternion.copy(rest);
  for(const [name,angles] of Object.entries(result.pose)){const j=joints.get(name);if(!j)continue;
   q.setFromEuler(euler.set(...angles));j.bone.quaternion.copy(j.inverse).multiply(q).multiply(j.basis).multiply(j.rest).normalize();
  }
  root.position.y=baseY;
  root.position.y+=(floor-floorHeight())*root.scale.y;
  root.updateWorldMatrix(true,true);
  return result.name;
 },reset(){for(const {bone,rest} of joints.values())bone.quaternion.copy(rest);root.position.y=baseY;}};
}
