const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const cueClock=time=>`${Math.floor(time/60)}:${String(Math.floor(time%60)).padStart(2,'0')}`;

// These are authored listening coordinates, not automatic music or text classification.
export function soundCue(post,spectrum){
  const authored=post.landscape?.sound||{start:8,end:20,title:'一段声音',note:'让声音与文字，在这里相遇。'};
  const duration=spectrum?.duration||204.8,custom=!!spectrum?.custom,scale=custom?duration/204.8:1;
  const start=clamp(authored.start*scale,0,Math.max(0,duration-.1)),end=clamp(authored.end*scale,start+.01,duration);
  return {...authored,start,end,title:custom?'你的音乐 · 阅读坐标':authored.title,note:custom?'这篇笔记的位置，已按时长映射到你导入的音乐。':authored.note,range:`${cueClock(start)} — ${cueClock(end)}`};
}
