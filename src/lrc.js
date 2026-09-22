// LRC contents are lyric data only; never interpreted as HTML or instructions.
export function parseLrc(source){
 const offset=Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
 const entries=[];
 for(const line of source.split(/\r?\n/)){
  const stamps=[...line.matchAll(/\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g)];
  const text=line.replace(/\[[^\]]*\]/g,'').trim();
  for(const stamp of stamps){if(Number(stamp[2])>=60)continue;entries.push({time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+Number('0.'+(stamp[3]||'0'))+offset),text});}
 }
 return entries.sort((a,b)=>a.time-b.time);
}
export function timedCue(time,duration,entries,lyrics,chapters){
 let index=-1;for(let i=0;i<entries.length;i++){if(entries[i].time<=time+1e-8)index=i;else break;}
 if(index<0)return {index:-1,chapter:-1,line:-1,text:'前奏 · 最瞎結婚理由',progress:Math.max(0,time/entries[0].time),chapterData:{title:'前奏 · 等待歌聲',theme:'violet',action:'intro'}};
 const lyric=lyrics[index],start=entries[index].time,end=entries[index+1]?.time??duration;
 return {...lyric,text:entries[index].text,index,progress:Math.max(0,Math.min(1,(time-start)/Math.max(.001,end-start))),chapterData:chapters[lyric.chapter]};
}
