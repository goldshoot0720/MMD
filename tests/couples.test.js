import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { couples, coupleCue, solveArm, applyCouples } from '../src/couples.js';

test('story pairs never cross and manual modes include both couples',()=>{
 assert.deepEqual(couples,[[0,1],[2,3]]);
 assert.deepEqual(coupleCue('proposal',4,20).pairs,[[0,1]]);
 assert.deepEqual(coupleCue('jackpot',4,20).pairs,[[2,3]]);
 assert.deepEqual(coupleCue('wedding',4,20).pairs,couples);
 assert.equal(coupleCue('proposal',4,20).hug,0);
 assert.equal(coupleCue('proposal',12,20).hug,1);
 assert.equal(coupleCue('wedding',0,20).weight,0);
 assert.equal(coupleCue('wedding',20,0).weight,0);
 assert.deepEqual(coupleCue('wedding',12,20,'dance').pairs,[]);
 for(const mode of ['hold','hug'])assert.deepEqual(coupleCue('intro',0,20,mode).pairs,couples);
});
test('two-link IK reaches targets under transformed parents without changing bone lengths',()=>{
 const root=new THREE.Group();root.rotation.set(.1,.5,.2);root.scale.setScalar(.78);
 const arm=new THREE.Bone(),elbow=new THREE.Bone(),hand=new THREE.Bone();
 arm.name='mixamorigLeftArm';elbow.name='mixamorigLeftForeArm';hand.name='mixamorigLeftHand';
 elbow.position.x=.4;hand.position.x=.6;root.add(arm);arm.add(elbow);elbow.add(hand);
 const target=new THREE.Vector3(.3,.4,.1);
 assert.ok(solveArm(root,'Left',target,new THREE.Vector3(0,0,1)).error<1e-6);
 assert.equal(elbow.position.length(),.4);assert.equal(hand.position.length(),.6);
 const unreachable=solveArm(root,'Left',new THREE.Vector3(5,0,0),new THREE.Vector3(0,0,1));
 assert.ok(Number.isFinite(unreachable.error));
});
test('unsupported rigs are skipped without breaking the other pair',()=>{
 assert.deepEqual(applyCouples([],[],coupleCue('intro',0,20,'hug')),[]);
 assert.equal(solveArm(new THREE.Group(),'Left',new THREE.Vector3(),new THREE.Vector3()),null);
});
