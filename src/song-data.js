export const chapters = [
 { title:'序幕 · 真的假的', theme:'violet', action:'tease', lines:['鋒兄啊你說真的還假的','小塗聽了都快笑翻了'] },
 { title:'第一幕 · 命中注定', theme:'blue', action:'proposal', lines:['鋒兄說要結婚','理由只有一個','今彩五三九開獎那天','頭獎號碼是牙妹給的','看著獎金直直落','心也跟著被收編','他說這是命中注定','不娶怎麼對得起這一連串的玄'] },
 { title:'副歌 · 最瞎卻甜蜜', theme:'rose', action:'dance', lines:['史上最瞎結婚理由','今彩五三九牽紅線牽這麼兇','一個牙妹一個魚妹','號碼一簽兩人都中頭獎券','你說愛情是運氣還是數學題','笑到流淚也只能說一句','最瞎最瞎卻又有點甜蜜'] },
 { title:'第二幕 · 財神爺點名', theme:'blue', action:'jackpot', lines:['換到小塗這邊','故事居然同一套','今彩五三九播報畫面','他整個人直接跳','魚妹隨手寫的牌','竟然全中好幾張','他說財神爺都點名了','不跟她走進禮堂實在太不應該'] },
 { title:'終幕 · 雙倍幸福', theme:'rose', action:'wedding', lines:['鋒兄牽著牙妹','小塗牽著魚妹','喝喜酒的人十桌百桌','都在笑這兩段緣','最瞎結婚理由','結果都開成頭獎','如果幸福也能這樣瞎忙','那我明天也去買一張'] }
];
export const lyrics=chapters.flatMap((c,chapter)=>c.lines.map((text,line)=>({text,chapter,line})));
export const defaultDuration=lyrics.length*4;
export function cueAt(time,duration=defaultDuration){const raw=Math.max(0,Math.min(lyrics.length-0.000001,time/duration*lyrics.length+1e-9));const index=Math.floor(raw);return {...lyrics[index],index,progress:raw-index,chapterData:chapters[lyrics[index].chapter]};}
export function chapterTime(index,duration=defaultDuration){return chapters.slice(0,index).reduce((n,c)=>n+c.lines.length,0)/lyrics.length*duration;}
// Keep the character names and their bundled model IDs together.  The cast UI,
// performer loader, and model thumbnails all consume this one source of truth.
export const cast=[
 {name:'鋒兄',modelId:3},
 {name:'牙妹',modelId:4},
 {name:'小塗',modelId:2},
 {name:'魚妹',modelId:1}
];
export const castNames=cast.map(({name})=>name);
export const castModelIds=cast.map(({modelId})=>modelId);
export function actorPose(index,time,cue){const beat=time*Math.PI,hop=Math.abs(Math.sin(beat));let x=[-2.4,-.8,.8,2.4][index],z=0,y=0,ry=0,rz=0,scale=.78;const action=cue.chapterData.action;
 if(action==='tease'){x=[-.9,-2.8,.9,2.8][index];z=index%2?1.1:0;rz=index===2?Math.sin(beat)*.13:Math.sin(beat/2)*.035;}
 if(action==='proposal'){if(index<2){x=index===0?-.65:.65;ry=index===0?.35:-.35;y=cue.line===4?hop*.25:0;rz=cue.line>=5?Math.sin(beat/2)*.055:0;}else{x=index===2?-3:3;z=1.4;scale=.65;}}
 if(action==='dance'){x+=Math.sin(beat/2+index*.5)*.25;y=hop*.18;rz=Math.sin(beat+index*.4)*.065;ry=Math.sin(beat/2)*.25;}
 if(action==='jackpot'){if(index>=2){x=index===2?-.7:.7;y=cue.line>=3?hop*.45:hop*.06;ry=index===2?.25:-.25;rz=Math.sin(beat)*.07;}else{x=index===0?-3:3;z=1.4;scale=.65;}}
 if(action==='wedding'){x=[-1.95,-.95,.95,1.95][index];z=cue.line<2?.4:0;ry=index%2?-.18:.18;y=cue.line>=4?hop*.14:0;rz=cue.line>=2?Math.sin(beat/2)*.04:0;}
 return {x,y,z,ry,rz,scale};
}
