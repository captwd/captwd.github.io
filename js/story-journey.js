import {soundCue} from './story-cues.js';

const THEMES={flow:['FLOW FIELD','粒子沿轨迹，汇入声音的轮廓。'],guidance:['CONDITION / GUIDANCE','同一个起点，两种被牵引的方向。'],spectrum:['FREQUENCY / TIME','频率立起，时间在山脉间流动。'],wire:['BEHIND THE SURFACE','褪去表面，看见搭起山脉的线条。']};

export class StoryJourney{
  constructor(owner){
    this.owner=owner;this.terrain=owner.terrain;this.reduced=owner.reduced;
    this.panel=document.createElement('aside');this.panel.id='scene-reading-companion';this.panel.hidden=true;this.panel.setAttribute('aria-label','声音与文章');document.body.appendChild(this.panel);
    document.addEventListener('blog:story-open',event=>{const entry=owner.entries.find(item=>item.post.slug===event.detail.slug);if(entry)event.detail.waitUntil(this.approach(entry));});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.post&&!event.defaultPrevented&&!event.target.closest('input,textarea,select,[contenteditable="true"]')){event.preventDefault();this.panel.querySelector('.scene-return').click();}});
    this.panel.addEventListener('click',event=>{
      if(event.target.closest('[data-scene-focus]'))this.setFocus(!this.focused);
      if(event.target.closest('[data-scene-listen]')){
        const cue=soundCue(this.post,this.terrain?.spectrum);
        document.dispatchEvent(new CustomEvent('blog:listen-cue',{detail:{start:cue.start,end:cue.end}}));
      }
    });
  }
  async approach(entry){
    if(!this.terrain)return;
    if(!this.memory)this.memory=this.terrain.view();
    this.owner.orbit?.cancelMotion();this.owner.sceneLinks.selected=entry.post.slug;
    this.owner.sceneLinks.focus(entry.post.slug);document.body.classList.add('story-entering');
    const view=this.terrain.view();view.target.copy(entry.point);view.target.y+=2;view.zoom=.83;view.pitch=.33;
    this.terrain.travelTo(view,this.reduced?0:850);this.owner.schedule();
    if(!this.reduced)await new Promise(resolve=>setTimeout(resolve,850));
  }
  mount(post){
    this.post=post;this.focused=false;this.chapter=-2;this.stage=0;this.cueSource=null;
    this.map=post.landscape||this.owner.entries.find(entry=>entry.post.slug===post.slug)?.map||{color:'#a1f9d5',theme:'flow'};
    document.body.classList.add('scene-reading');document.body.classList.remove('story-entering','reading-focus');
    this.panel.hidden=false;this.panel.replaceChildren();this.panel.style.setProperty('--scene-color',this.map.color);
    const back=document.createElement('a');back.className='scene-return';back.href=`${this.owner.root.href}#story-${post.slug}`;back.textContent='← 回到山脉';back.title='回到刚才的视角（Esc）';
    const focus=document.createElement('button');focus.dataset.sceneFocus='';focus.textContent='专注阅读';focus.setAttribute('aria-pressed','false');
    const tools=document.createElement('div');tools.className='scene-reading-tools';tools.append(back,focus);
    const eyebrow=document.createElement('small');eyebrow.className='scene-reading-eyebrow';eyebrow.textContent='A NOTE IN THE SOUNDSCAPE';
    const cue=document.createElement('div');cue.className='scene-reading-cue';cue.innerHTML='<span></span><h2></h2><p></p><button data-scene-listen>▷ 听这段乐句</button>';
    const chapter=document.createElement('div');chapter.className='scene-reading-chapter';chapter.innerHTML='<small>此刻读到</small><h3></h3><div class="scene-reading-stage"><span></span><output></output></div><p></p>';
    this.panel.append(tools,eyebrow,cue,chapter);
    this.terrain?.setReading({kind:this.map.theme||'flow',progress:0});
    if(this.terrain){const view=this.terrain.view();view.target.set(0,4,-24);view.yaw=.18;view.pitch=.46;view.zoom=.94;this.terrain.travelTo(view,this.reduced?0:1000);}
    this.refreshCue();this.owner.schedule();
    requestAnimationFrame(()=>{const title=document.querySelector('.article-hero h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}});
  }
  refreshCue(){
    if(!this.post)return;
    const source=this.terrain?.spectrum;if(this.cueSource===source&&this.cueReady)return;this.cueSource=source;this.cueReady=true;
    const cue=soundCue(this.post,source),box=this.panel.querySelector('.scene-reading-cue');
    box.querySelector('span').textContent=`${cue.range} / ${this.post.landscape?.autoRidge?'这篇笔记的山脊坐标':'作者选取的声音坐标'}`;box.querySelector('h2').textContent=cue.title;box.querySelector('p').textContent=cue.note;
  }
  setFocus(focused){
    this.focused=focused;document.body.classList.toggle('reading-focus',focused);
    const button=this.panel.querySelector('[data-scene-focus]');button.textContent=focused?'显示山脉':'专注阅读';button.setAttribute('aria-pressed',String(focused));
    this.terrain?.setReading(focused?null:{kind:this.map.theme||'flow',progress:this.stage||0});this.owner.schedule();
  }
  chapterChanged(id,progress){
    if(!this.post)return;
    const index=this.owner.headings.findIndex(heading=>heading.id===id);this.stage=progress;
    if(this.chapter!==index){
      this.chapter=index;const node=this.panel.querySelector('.scene-reading-chapter'),theme=THEMES[this.map.theme]||THEMES.flow;
      node.querySelector('h3').textContent=index<0?'序 · 从声音开始':this.owner.headings[index].textContent;
      node.querySelector('.scene-reading-stage span').textContent=theme[0];node.querySelector('p').textContent=theme[1];
    }
    this.panel.querySelector('.scene-reading-stage output').textContent=`${Math.max(0,index+1).toString().padStart(2,'0')} / ${String(this.owner.headings.length).padStart(2,'0')}`;
  }
  frame(){
    if(!this.post||!this.terrain)return;this.refreshCue();
    if(!this.focused){this.terrain.narrative.set({kind:this.map.theme||'flow',progress:this.stage||0});this.terrain.setStoryFocus({...this.map,frequency:.2+(this.stage||0)*.6,depth:.42});}
  }
  leave(home,target){
    const wasReading=!!this.post;this.post=null;this.panel.hidden=true;this.panel.replaceChildren();
    document.body.classList.remove('scene-reading','reading-focus','story-entering');this.terrain?.setReading(null);
    if(home&&wasReading&&this.memory){
      this.owner.orbit?.cancelMotion();this.terrain?.travelTo(this.memory,this.reduced?0:950);this.memory=null;
      const slug=target.hash.startsWith('#story-')?decodeURIComponent(target.hash.slice(7)):'';
      const entry=this.owner.entries.find(item=>item.post.slug===slug);
      if(entry){this.owner.sceneLinks.selected=slug;this.owner.sceneLinks.recall(entry);this.owner.orbit.active=entry.index;this.owner.orbit.lifted=true;}
      return true;
    }
    if(!home&&!target.pathname.includes('/posts/'))this.memory=null;
    return false;
  }
}
