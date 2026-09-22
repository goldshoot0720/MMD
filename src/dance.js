import * as THREE from 'three';

export const danceNames={groove:'踏步律動',wave:'交替揮手',disco:'斜向指天',clap:'胸前合拍',reach:'雙手上舉',swing:'側步擺臂',heart:'胸前收手',bow:'鞠躬謝幕',march:'抬膝擺臂',kick:'前踢推掌',side:'側踏展臂',cross:'交叉步揮手',shuffle:'滑步輪臂',heel:'點踵轉腕',twist:'扭步出拳',curl:'後勾腿畫圓'};
const sequences={intro:['groove','heel','march','wave'],tease:['side','cross','wave','twist','curl','shuffle'],proposal:['heart','side','clap','heel','wave','march'],dance:['march','kick','side','cross','shuffle','heel','twist','curl','disco','reach','swing'],jackpot:['kick','reach','shuffle','twist','curl','disco'],wedding:['side','cross','heart','march','wave','curl','clap','bow']};
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
  p[side+'Hand']=[.12*Math.sin(cycle+sign),sign*.10*step,sign*.16*step];
  p[side+'UpLeg']=[-.25*lift,0,sign*.035];
  p[side+'Leg']=[.35*lift+.09*pulse,0,0];
  p[side+'Foot']=[-.12*lift-.06*pulse,0,0];
  if(name==='wave'){p[side+'Arm']=[0,-sign*.2,sign*(.15+.65*Math.sin(cycle/2+sign))];p[side+'ForeArm']=[0,-sign*.6,sign*.4*Math.sin(cycle*2)];}
  if(name==='disco'){const up=(1+sign*Math.sin(cycle/2))/2;p[side+'Arm']=[0,-sign*.15,-sign*1.1+sign*2*up];p[side+'ForeArm']=[0,-sign*.15,0];p.Spine[2]=.12*step;}
  if(name==='clap'){p[side+'Arm']=[0,-sign*1.15,-sign*.55];p[side+'ForeArm']=[0,-sign*(.55+.45*pulse),0];}
  if(name==='reach'){p[side+'Arm']=[0,-sign*.12,sign*(.8+.22*pulse)];p[side+'ForeArm']=[0,-sign*.15,sign*.18*pulse];p[side+'UpLeg'][0]=-.4*lift;p[side+'Leg'][0]=.6*lift;}
  if(name==='swing'){p[side+'Arm']=[0,-sign*(.25+.65*sign*step),-sign*.85];p[side+'ForeArm']=[0,-sign*.65,0];p[side+'UpLeg'][2]=sign*(.04+.12*opposite);p.Spine[1]=.15*step;}
  if(name==='heart'){p[side+'Arm']=[0,-sign*.8,-sign*.85];p[side+'ForeArm']=[0,-sign*1.4,0];p.Head[2]=.08*Math.sin(cycle/2);}
  // Distinct footwork uses hips, knees and ankles, with opposite arm accents.
  const sweep=Math.sin(cycle/2),roll=Math.cos(cycle/2),accent=(1+sign*sweep)/2;
  if(name==='march'){
   p[side+'UpLeg']=[-.9*lift,0,sign*.04];p[side+'Leg']=[1.2*lift+.08,0,0];p[side+'Foot']=[-.3*lift,0,0];
   p[side+'Arm']=[.25*sign*step,-sign*(.2+.75*opposite),-sign*.95];p[side+'ForeArm']=[0,-sign*(.45+.7*opposite),0];
  }
  if(name==='kick'){
   p[side+'UpLeg']=[-.8*lift,.08*sign*lift,sign*.04];p[side+'Leg']=[.12+.55*Math.sin(Math.PI*lift),0,0];p[side+'Foot']=[.22*lift,0,0];
   p[side+'Arm']=[0,-sign*(.3+1.0*lift),-sign*(.9-.35*lift)];p[side+'ForeArm']=[0,-sign*(.8-.65*lift),0];p[side+'Hand']=[0,sign*.35*lift,0];
  }
  if(name==='side'){
   p[side+'UpLeg']=[-.15*lift,sign*.15*lift,sign*(.04+.32*lift)];p[side+'Leg']=[.12+.38*opposite,0,0];p[side+'Foot']=[-.12*opposite,0,-sign*.12*lift];
   p[side+'Arm']=[.15*sweep,-sign*.15,-sign*(1.15-1.0*lift)];p[side+'ForeArm']=[0,-sign*(.25+.45*opposite),0];p.Spine[2]=.12*step;
  }
  if(name==='cross'){
   p[side+'UpLeg']=[-.32*lift,-sign*.18*lift,sign*(.08-.28*lift)];p[side+'Leg']=[.12+.48*lift,0,0];p[side+'Foot']=[-.18*lift,sign*.14*lift,0];
   p[side+'Arm']=[.22*roll,-sign*(.45+.6*accent),sign*(-.5+.9*accent)];p[side+'ForeArm']=[0,-sign*.7,sign*.3*step];p.Spine[1]=.18*sweep;
  }
  if(name==='shuffle'){
   p[side+'UpLeg']=[-.36*sign*step,0,sign*.08];p[side+'Leg']=[.16+.6*lift,0,0];p[side+'Foot']=[-.3*sign*step,0,0];
   p[side+'Arm']=[.35*roll,-sign*(.55+.4*sweep),-sign*(.6+.4*roll)];p[side+'ForeArm']=[.2*sweep,-sign*(.75+.35*roll),0];p[side+'Hand']=[.25*roll,sign*.25*sweep,0];
  }
  if(name==='heel'){
   p[side+'UpLeg']=[-.4*lift,sign*.15*lift,sign*.05];p[side+'Leg']=[.1+.3*opposite,0,0];p[side+'Foot']=[-.4*lift+.15*opposite,sign*.2*lift,0];
   p[side+'Arm']=[.15*sweep,-sign*.65,-sign*.75];p[side+'ForeArm']=[0,-sign*(.8+.35*sign*step),0];p[side+'Hand']=[.4*roll,sign*.4*sweep,sign*.3*roll];
  }
  if(name==='twist'){
   p.Hips[1]=.22*step;p.Spine[1]=-.2*step;
   p[side+'UpLeg']=[-.18*lift,sign*.25*step,sign*.09];p[side+'Leg']=[.25+.25*lift,0,0];p[side+'Foot']=[-.12,sign*.3*step,0];
   p[side+'Arm']=[0,-sign*(.4+.95*lift),-sign*.55];p[side+'ForeArm']=[0,-sign*(1.1-.95*lift),0];
  }
  if(name==='curl'){
   p[side+'UpLeg']=[.22*lift,0,sign*.12];p[side+'Leg']=[.12+1.15*lift,0,0];p[side+'Foot']=[.28*lift,0,0];
   p[side+'Arm']=[.45*roll,-sign*(.35+.45*sweep),sign*(.15+.6*roll)];p[side+'ForeArm']=[0,-sign*(.3+.35*accent),sign*.2*sweep];p[side+'Hand']=[.2*roll,0,sign*.3*sweep];
  }
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
