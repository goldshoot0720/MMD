import { coupleCue, applyCouples } from './couples.js';
import { createDancer } from './dance.js';
import bundledLrc from './wedding.lrc?raw';
import { parseLrc, timedCue } from './lrc.js';
import * as THREE from 'three';
import { models, performanceModelIds, modelById, loadAsset, instantiateAsset } from './models.js';
import { chapters, lyrics, defaultDuration, cueAt, chapterTime, castNames, actorPose } from './song-data';
import { showDistance, subtitleTilt, fogRange, orbitCeiling, targetHeight } from './framing.js';
import './performance.css';

export function createPerformance({scene,camera,controls,actor,stage,ring,setTheme,onEnter,onExit,toast}) {
 const $=s=>document.querySelector(s);
 const group=new THREE.Group();group.visible=false;scene.add(group);
 const performers=[],resources=new Map(),mixers=[],dancers=[];
 let castRequest=0;
 let active=false,ready=false,playing=false,time=0,duration=defaultDuration,lastCue=-2,lastChapter=-2,audioURL=null,pending=false;
 const audio=new Audio();audio.preload='auto';audio.id='performance-audio';audio.hidden=true;document.body.append(audio);
 const originalCues=parseLrc(bundledLrc);let synced=true,audioReady=false;
 if(originalCues.length!==lyrics.length)throw Error('LRC 與分鏡句數不符');
 const introLabel=originalCues[0].time.toFixed(2);
 const entry=document.createElement('button');entry.id='performance-entry';entry.className='primary';entry.textContent='♫ 歌詞演出';$('header').insertBefore(entry,$('#save'));
 const ui=document.createElement('section');ui.className='performance-panel';ui.hidden=true;ui.innerHTML=`<div class="show-heading"><div><span>LYRIC THEATRE / 01</span><h2>最瞎結婚理由</h2><p>鋒兄 × 牙妹 · 小塗 × 魚妹</p></div><button id="exit-show">返回編輯器 ↗</button></div><div class="show-note">原曲 MP3 × LRC 時間戳同步演出<br>含 ${introLabel} 秒前奏；字幕與分幕依音訊時間切換。</div><div class="show-chapters">${chapters.map((c,i)=>`<button data-chapter="${i}"><small>0${i+1}</small>${c.title}<span>↗</span></button>`).join('')}</div><h3>雙人互動</h3><p>鋒兄 ♡ 牙妹<br>小塗 ♡ 魚妹</p><label class="toggle-row">互動模式<select id="couple-mode"><option value="auto">隨劇情牽手／抱抱</option><option value="hold">兩對牽手</option><option value="hug">兩對抱抱</option><option value="dance">各自跳舞</option></select></label><p id="couple-status" role="status"></p><h3>舞蹈編排</h3><label class="toggle-row">骨架舞蹈<input id="dance-enabled" type="checkbox" checked></label><label class="toggle-row">節奏 BPM <input id="dance-bpm" type="number" min="60" max="200" value="120" style="width:70px"></label><label class="toggle-row">動作幅度<input id="dance-intensity" type="range" min="0.3" max="1" step="0.05" value="0.85"></label><p id="dance-status" role="status">準備骨架…</p><p class="hint">原創循環編舞 · 預設 120 BPM，可依歌曲調整。無骨架模型僅呈現走位。</p><h3>角色分配</h3><div class="cast-map">${castNames.map((n,i)=>`<label>${n}<select data-cast="${i}">${models.map(m=>`<option value="${m.id}" ${m.id===performanceModelIds[i]?'selected':''}>${m.name} · ${m.format}</option>`).join('')}</select></label>`).join('')}</div><button id="song-audio">＋ 匯入歌曲音檔</button><input id="audio-file" type="file" accept="audio/*" hidden><p id="audio-status">正在載入原曲…</p><button id="restore-song">↺ 載入原曲與 LRC</button><button id="remove-audio" hidden>移除音檔</button><label class="toggle-row">分鏡鏡頭<input id="cinematic" type="checkbox" checked></label><div id="lyric-list">${lyrics.map((l,i)=>`<button data-line="${i}">${l.text}</button>`).join('')}</div>`;
 $('main').append(ui);
 const overlay=document.createElement('div');overlay.className='show-overlay';overlay.hidden=true;overlay.innerHTML='<div id="chapter-title"></div><div id="cast-labels"></div><div id="story-prop"></div><div class="subtitle"><small id="line-count"></small><div id="current-lyric"></div><p id="next-lyric"></p></div>';
 $('#viewport').append(overlay);
 const transport=document.createElement('div');transport.className='show-transport';transport.hidden=true;transport.innerHTML=`<div><button id="show-rewind" aria-label="演出回到起點">⏮</button><button id="show-play" class="primary" disabled>準備角色中…</button><span id="show-clock"></span><label><input id="show-loop" type="checkbox" checked> 循環</label></div><input id="show-scrub" type="range" min="0" max="${duration}" step="0.01" value="0" aria-label="歌詞演出時間軸"><div class="show-markers">${chapters.map((c,i)=>`<button data-jump="${i}">${c.title.split(' · ')[0]}</button>`).join('')}</div>`;
 $('.workspace').append(transport);
 const labels=castNames.map(name=>{const el=document.createElement('span');el.textContent=name;$('#cast-labels').append(el);return el;});
 const positions=new Float32Array(150*3);for(let i=0;i<150;i++){positions[i*3]=Math.sin(i*23.17)*5;positions[i*3+2]=Math.cos(i*11.3)*3;}
 const confettiGeo=new THREE.BufferGeometry();confettiGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const confetti=new THREE.Points(confettiGeo,new THREE.PointsMaterial({color:0xffd278,size:.045}));group.add(confetti);
 const arch=new THREE.Group();const archMaterial=new THREE.MeshStandardMaterial({color:0xf5b7d9,metalness:.5,roughness:.3});for(const x of [-1.6,1.6]){const mesh=new THREE.Mesh(new THREE.TorusGeometry(1.3,.045,12,80,Math.PI),archMaterial);mesh.position.set(x,1.5,-.8);arch.add(mesh);}for(const x of [-2.9,-.3,.3,2.9]){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.5,12),archMaterial);mesh.position.set(x,.75,-.8);arch.add(mesh);}group.add(arch);
 const hearts=new THREE.Group();const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-.7,.45,-.5,.95,0,.6);shape.bezierCurveTo(.5,.95,.7,.45,0,0);const heartGeo=new THREE.ShapeGeometry(shape),heartMat=new THREE.MeshBasicMaterial({color:0xff86b6,side:THREE.DoubleSide});for(let i=0;i<8;i++){const h=new THREE.Mesh(heartGeo,heartMat);h.scale.setScalar(.35);hearts.add(h);}group.add(hearts);
 function format(t){return `${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;}
 function pause(){playing=false;audio.pause();$('#show-play').textContent=ready?'▶ 播放演出':'準備角色中…';}
 async function play(){if(!ready||pending)return;if(audioURL&&!audioReady){toast('音檔仍在載入，請稍候');return;}if(time>=duration)seek(0);if(audioURL){pending=true;try{audio.currentTime=time;await audio.play();}catch{toast('音檔無法播放，請換一個音檔');pending=false;return;}pending=false;if(!active){audio.pause();return;}}playing=true;$('#show-play').textContent='Ⅱ 暫停演出';}
 function seek(value){time=Math.max(0,Math.min(duration,value));if(audioURL&&Number.isFinite(audio.duration))audio.currentTime=Math.min(time,audio.duration);lastCue=-2;update(0);}
 async function init(){for(let i=0;i<4;i++){const g=new THREE.Group();group.add(g);performers.push(g);}await assignCast();}
 async function assignCast(){
  const ticket=++castRequest;pause();ready=false;$('#show-play').disabled=true;
  const ids=Array.from(ui.querySelectorAll('[data-cast]'),s=>Number(s.value));
  try{
   const assets=await Promise.all(ids.map(id=>{if(!resources.has(id)){const m=modelById(id);resources.set(id,loadAsset(m.url,m.format).catch(e=>{resources.delete(id);throw e;}));}return resources.get(id);}));
   if(ticket!==castRequest)return;
   mixers.forEach(m=>m?.stopAllAction());mixers.length=0;dancers.length=0;
   performers.forEach((p,i)=>{p.clear();const model=instantiateAsset(assets[i]);p.add(model);dancers.push(createDancer(model));const mixer=assets[i].animations.length?new THREE.AnimationMixer(model):null;assets[i].animations.forEach(c=>mixer.clipAction(c).play());mixers.push(mixer);});
   ready=true;$('#show-play').disabled=false;pause();update(0);
  }catch(error){if(ticket!==castRequest)return;$('#show-play').textContent='角色載入失敗';toast('角色載入失敗，請重新選擇角色');console.error(error);}
 }
 let prior;
 function enter(){if(active)return;prior={camera:camera.position.clone(),target:controls.target.clone(),stage:stage.scale.clone(),ring:ring.scale.clone(),auto:controls.autoRotate,fog:{near:scene.fog.near,far:scene.fog.far},maxDistance:controls.maxDistance};onEnter();active=true;group.visible=true;actor.visible=false;stage.scale.set(2.6,1,1.5);ring.scale.set(2.6,1.5,1);document.body.classList.add('show-mode');ui.hidden=false;overlay.hidden=false;transport.hidden=false;controls.autoRotate=false;lastChapter=-2;update(0);}
 function exit(){pause();active=false;group.visible=false;actor.visible=true;stage.scale.copy(prior.stage);ring.scale.copy(prior.ring);Object.assign(scene.fog,prior.fog);controls.maxDistance=prior.maxDistance;camera.position.copy(prior.camera);controls.target.copy(prior.target);controls.autoRotate=prior.auto;document.body.classList.remove('show-mode');ui.hidden=true;overlay.hidden=true;transport.hidden=true;onExit();}
 function update(dt){if(!active)return;if(playing){time=audioURL?audio.currentTime:time+dt;if(time>=duration-.015||(audioURL&&audio.ended)){if($('#show-loop').checked){time=0;if(audioURL){audio.currentTime=0;audio.play().catch(()=>pause());}}else{time=duration;pause();}}}const cue=synced?timedCue(time,duration,originalCues,lyrics,chapters):cueAt(time,duration),act=cue.chapterData.action;
 if(cue.chapter!==lastChapter){setTheme(cue.chapterData.theme);lastChapter=cue.chapter;$('#chapter-title').textContent=cue.chapterData.title;ui.querySelectorAll('[data-chapter]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.chapter)===cue.chapter));}
 if(cue.index!==lastCue){lastCue=cue.index;$('#current-lyric').textContent=cue.text;$('#next-lyric').textContent=lyrics[cue.index+1]?.text||'— 謝幕 · 願幸福都中頭獎 —';$('#line-count').textContent=`${cue.index<0?'INTRO':String(cue.index+1).padStart(2,'0')+' / '+lyrics.length} · ${act==='wedding'?'雙倍幸福':'歌詞演繹'}`;ui.querySelectorAll('[data-line]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.line)===cue.index));const current=ui.querySelector(`[data-line="${cue.index}"]`);if(current)$('#lyric-list').scrollTop=current.offsetTop-$('#lyric-list').offsetTop-45;else $('#lyric-list').scrollTop=0;}
 $('#show-clock').textContent=`${format(time)} / ${format(duration)}`;$('#show-scrub').value=time;$('#current-lyric').style.setProperty('--lyric-progress',`${cue.progress*100}%`);
 const danceEnabled=$('#dance-enabled').checked,bpm=THREE.MathUtils.clamp(Number($('#dance-bpm').value)||120,60,200),intensity=Number($('#dance-intensity').value);
 mixers.forEach((m,i)=>{if(!danceEnabled||!dancers[i]?.supported)m?.setTime(time);});
 let danceName='';
 dancers.forEach((d,i)=>{if(danceEnabled&&d.supported){const start=cue.index<0?0:chapterStart(cue.chapter);danceName=d.apply(time,{action:cue.index<0?'intro':act,bpm,intensity,index:i,offset:synced?originalCues[0].time:0,previousAction:cue.chapter>0?chapters[cue.chapter-1].action:'intro',transition:Math.min(1,Math.max(0,time-start))});}});
 $('#dance-status').textContent=danceEnabled?`${danceName||'整體走位'} · ${dancers.filter(d=>d.supported).length}/4 位骨架舞者`:'原始姿勢與走位';
 performers.forEach((p,i)=>{const pose=actorPose(i,time,cue);p.position.set(pose.x,pose.y,pose.z);p.rotation.set(0,pose.ry,pose.rz);p.scale.setScalar(pose.scale);});
 const interaction=coupleCue(cue.index<0?'intro':act,time-(cue.index<0?0:chapterStart(cue.chapter)),(cue.chapter+1<chapters.length?chapterStart(cue.chapter+1):duration)-time,$('#couple-mode').value);
 if(danceEnabled)applyCouples(performers,dancers,interaction);
 const eligible=interaction.pairs.filter(pair=>pair.every(i=>dancers[i]?.supported)).length;
 $('#couple-status').textContent=!danceEnabled?'開啟骨架舞蹈以使用互動':interaction.pairs.length?`${interaction.hug>.5?'抱抱':'牽手'} · ${eligible} 對（需雙方有骨架）`:'雙人互動將隨劇情開始';
 arch.visible=act==='wedding';hearts.visible=act==='wedding'||act==='proposal'||act==='dance';hearts.children.forEach((h,i)=>{h.position.set(Math.sin(i*7)*3,1+(time*.28+i*.7)%2.8,-.6);h.rotation.y=Math.sin(time+i)*.3;});confetti.visible=act==='jackpot'||act==='dance'||act==='wedding';for(let i=0;i<150;i++)positions[i*3+1]=4.6-((time*(.5+(i%5)*.08)+i*.33)%4.5);confettiGeo.attributes.position.needsUpdate=true;
 $('#story-prop').textContent=act==='jackpot'?'✦ 今彩 539 · 中頭獎啦！ ✦':act==='proposal'&&cue.line>=2&&cue.line<=4?'🎟 牙妹的幸運號碼':act==='wedding'?'♡ DOUBLE HAPPINESS ♡':act==='dance'?'♡ 愛情 × 運氣 ＝ 甜蜜 ♡':'';
 const v=$('#viewport');
 if($('#cinematic').checked){const plate=$('.subtitle').getBoundingClientRect(),share=v.clientHeight?(v.getBoundingClientRect().bottom-plate.top)/v.clientHeight:0;const dist=showDistance({action:act,fov:camera.fov,aspect:camera.aspect,stageHeight:v.clientHeight,subtitleShare:share});Object.assign(scene.fog,fogRange(dist));controls.maxDistance=orbitCeiling(dist);camera.position.set(Math.sin(time*.12)*.55,3.05,dist);controls.target.set(0,targetHeight-subtitleTilt({distance:dist,fov:camera.fov,subtitleShare:share}),0);controls.update();}
 const vw=v.clientWidth,vh=v.clientHeight,lw=labels.map(l=>l.offsetWidth),lh=labels.map(l=>l.offsetHeight);
 const marks=performers.map((p,i)=>{const point=new THREE.Vector3(p.position.x,p.position.y+2.8*p.scale.y+.27,p.position.z).project(camera);return {i,x:(point.x*.5+.5)*vw,y:(-point.y*.5+.5)*vh,off:point.z>1};});
 // Paired chapters stand two performers about a label's width apart, and a narrow
 // frame (phone, browser zoom) closes that gap further while the text stays put.
 // Walk right to left and stack each name above the neighbour it would cover.
 const lane=marks.slice().sort((a,b)=>a.x-b.x);
 for(let n=lane.length-2;n>=0;n--){const cur=lane[n],next=lane[n+1];if(cur.off||next.off)continue;if(next.x-cur.x<(lw[cur.i]+lw[next.i])/2+8&&Math.abs(next.y-cur.y)<Math.max(lh[cur.i],lh[next.i]))cur.y=next.y-lh[cur.i]-3;}
 marks.forEach(m=>{const el=labels[m.i];el.style.left=`${m.x}px`;el.style.top=`${m.y}px`;el.hidden=m.off;});
 }
 $('#dance-enabled').onchange=()=>{dancers.forEach(d=>d.reset());update(0);};
 entry.onclick=enter;$('#exit-show').onclick=exit;$('#show-play').onclick=()=>playing?pause():play();$('#show-rewind').onclick=()=>{pause();seek(0);};$('#show-scrub').oninput=e=>seek(Number(e.target.value));ui.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>seek(chapterStart(Number(b.dataset.chapter))));transport.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>seek(chapterStart(Number(b.dataset.jump))));ui.querySelectorAll('[data-line]').forEach(b=>b.onclick=()=>seek(synced?originalCues[Number(b.dataset.line)].time:Number(b.dataset.line)/lyrics.length*duration));ui.querySelectorAll('[data-cast]').forEach(s=>s.onchange=assignCast);
 window.addEventListener('keydown',e=>{if(active&&e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();playing?pause():play();}});
 // Dolly back only as far as the cast needs.  The widest shot puts a performer at
 // x=±3 on the z=1.4 front row, so the frame must clear 3 + .3 body + .55 camera
 // drift at THAT depth, not at the stage centre.  A flat 1.4/aspect factor overshot
 // on portrait phones, shrinking everyone and pushing them into the 12–30 fog band.
 function chapterStart(chapter){return synced?originalCues[lyrics.findIndex(l=>l.chapter===chapter)].time:chapterTime(chapter,duration);}
 function releaseURL(){if(audioURL?.startsWith('blob:'))URL.revokeObjectURL(audioURL);}
 function loadAudio(url,name,useLrc){
  pause();releaseURL();audioReady=false;synced=useLrc;audioURL=url;$('#audio-status').textContent='讀取音檔中…';
  audio.onloadedmetadata=()=>{if(!Number.isFinite(audio.duration)||audio.duration<=0){removeAudio();toast('無法讀取音檔長度');return;}audioReady=true;duration=audio.duration;$('#show-scrub').max=duration;$('#audio-status').textContent=name+' · '+format(duration)+(synced?' · LRC 逐句同步':' · 等分字幕時間');$('.show-note').textContent=synced?`原曲 MP3 × LRC 同步演出 · ${introLabel} 秒前奏 · 33 句字幕`:'自訂音檔 · 字幕依曲長平均分配，未套用原曲 LRC';$('#remove-audio').hidden=false;seek(0);};
  audio.onerror=()=>{removeAudio();toast('音檔載入失敗，可按「載入原曲與 LRC」重試');};audio.src=url;audio.load();
 }
 $('#song-audio').onclick=()=>$('#audio-file').click();$('#audio-file').onchange=e=>{const file=e.target.files[0];if(!file)return;loadAudio(URL.createObjectURL(file),file.name,false);e.target.value='';};
 function removeAudio(){pause();audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();releaseURL();audioURL=null;audioReady=false;synced=false;duration=defaultDuration;$('#show-scrub').max=duration;$('#audio-status').textContent='無音檔 · 靜音預演';$('.show-note').textContent='靜音預演 · 每句 4 秒';$('#remove-audio').hidden=true;seek(0);}
 $('#remove-audio').onclick=removeAudio;
 $('#restore-song').onclick=()=>loadAudio('/audio/wedding.mp3','最瞎結婚理由',true);
 loadAudio('/audio/wedding.mp3','最瞎結婚理由',true);
 init();return {update,enter,get active(){return active;}};
}
