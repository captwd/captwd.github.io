import * as THREE from 'three';
import {ArticleOrbit} from './article-orbit.js';
import {soundCue} from './story-cues.js';

const escapeHTML=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

// An article has two real links: a floating card and a discoverable marker on its spectral ridge.
export class TerrainStories{
  constructor({terrain,entries,root,reduced,schedule,progress}){
    Object.assign(this,{terrain,entries,root,reduced,schedule,progress});this.hovered='';this.selected='';this.showCards=true;
    this.ray=new THREE.Raycaster();this.direction=new THREE.Vector3();this.projected=new THREE.Vector3();this.lastOcclusion=0;
    const host=document.createElement('nav');host.id='story-landmarks';host.setAttribute('aria-label','随波形流动的文章');document.body.appendChild(host);this.host=host;
    const ridges=document.createElement('nav');ridges.id='ridge-landmarks';ridges.setAttribute('aria-label','山脉中隐藏的文章链接');document.body.appendChild(ridges);this.ridges=ridges;
    entries.forEach(entry=>this.mountEntry(entry));
    this.orbit=new ArticleOrbit({terrain,host,entries,reduced,schedule});
    const dock=document.createElement('section');dock.id='story-orbit-dock';dock.setAttribute('aria-label','环绕文章导航');
    dock.innerHTML='<div class="orbit-dock-top"><span>随波形流动的笔记</span><button id="orbit-toggle" aria-pressed="true" aria-controls="story-landmarks">隐去卡片</button></div><div class="atlas-orbit-nav"><button id="orbit-previous" aria-label="召回上一篇文章">←</button><output id="atlas-orbit-label"></output><button id="orbit-next" aria-label="召回下一篇文章">→</button></div>';
    document.body.appendChild(dock);this.dock=dock;this.orbit.setControls(dock.querySelector('#orbit-previous'),dock.querySelector('#orbit-next'),dock.querySelector('output'));
    this.orbit.onSelect=entry=>{this.setCards(true);this.selected=entry.post.slug;this.recall(entry);if(this.active)this.terrain.setStoryFocus(this.focusMap(entry));this.pulse(entry);};
    dock.querySelector('#orbit-toggle').addEventListener('click',()=>this.setCards(!this.showCards));
    document.addEventListener('blog:orbit-reset',()=>{this.selected='';this.hovered='';terrain.setStoryFocus(null);});
    document.body.classList.add('has-story-gallery','has-linked-orbit');
  }
  mountEntry(entry){
    const {post,map,index}=entry,href=new URL(`posts/${post.slug}/`,this.root).href;
    const anchor=document.createElement('a');anchor.className='story-pin story-orbit-card';anchor.dataset.postSlug=post.slug;anchor.href=href;anchor.style.setProperty('--story-color',map.color);anchor.setAttribute('aria-label',`${map.region}：${post.title}`);
    const cue=soundCue(post,this.terrain.spectrum);
    const face=`<span class="orbit-card-header"><span>${String(index+1).padStart(2,'0')} / ${escapeHTML(map.region)}</span><em class="story-pin-progress"></em><i>↗</i></span><strong class="orbit-card-title">${escapeHTML(post.title)}</strong><span class="orbit-card-excerpt">${escapeHTML(post.excerpt)}</span><span class="orbit-sound-cue"><small>${cue.range} · ${escapeHTML(cue.title)}</small><span>${escapeHTML(cue.note)}</span></span><span class="orbit-card-footer"><time>${escapeHTML(post.date)}</time><b>靠近 · 阅读 ↗</b></span>`;
    anchor.innerHTML=`<span class="orbit-card-face orbit-card-front">${face}</span><span class="orbit-card-face orbit-card-back" aria-hidden="true">${face}</span>`;this.host.appendChild(anchor);
    const ridge=document.createElement('a');ridge.className='ridge-note';ridge.href=href;ridge.dataset.postSlug=post.slug;ridge.style.setProperty('--story-color',map.color);ridge.setAttribute('aria-label',`山峰里的笔记：${post.title}`);
    ridge.innerHTML=`<span class="ridge-note-jewel" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><span class="ridge-note-label"><small>${escapeHTML(map.region)}</small><strong>${escapeHTML(map.label)}</strong><span class="ridge-cue">${cue.range} · ${escapeHTML(cue.title)}</span><span>靠近这座山峰 ↗</span></span>`;this.ridges.appendChild(ridge);
    const group=new THREE.Group(),jewel=new THREE.Mesh(new THREE.OctahedronGeometry(.24),new THREE.MeshBasicMaterial({color:map.color,transparent:true}));jewel.position.y=3.2;group.add(jewel);
    const stem=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.15,0),new THREE.Vector3(0,3.2,0)]),new THREE.LineBasicMaterial({color:map.color,transparent:true,opacity:.5}));group.add(stem);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.62,40),new THREE.MeshBasicMaterial({color:map.color,side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.16;group.add(ring);
    this.terrain.scene.add(group);Object.assign(entry,{anchor,ridge,group,jewel,ring,stem,markerLift:3.2,point:new THREE.Vector3(),ridgeCovered:false});
    for(const element of [anchor,ridge]){
      element.addEventListener('pointerenter',()=>this.focus(post.slug));element.addEventListener('focus',()=>this.focus(post.slug));
      element.addEventListener('pointerleave',()=>{if(!element.contains(document.activeElement))this.focus('');});element.addEventListener('blur',()=>this.focus(''));
      element.addEventListener('click',()=>{this.selected=post.slug;});
    }
  }
  setCards(visible){this.showCards=visible;const button=this.dock.querySelector('#orbit-toggle');button.setAttribute('aria-pressed',String(visible));button.textContent=visible?'隐去卡片':'显示卡片';this.schedule();}
  focus(slug){
    if(slug!==this.hovered&&slug){const entry=this.entries.find(item=>item.post.slug===slug);if(entry)this.pulse(entry);}
    this.hovered=slug;const focused=this.entries.find(entry=>entry.visible&&entry.inFlow&&entry.post.slug===(slug||this.selected));this.terrain.setStoryFocus(this.active&&focused?this.focusMap(focused):null);this.schedule();
  }
  pulse(entry){if(this.active)this.terrain.particles.emit(entry.point,{burst:true,energy:.65});this.schedule();}
  focusMap(entry){return {...entry.map,frequency:entry.map.frequency??(.25+entry.index*.13),depth:entry.flowDepth};}
  recall(entry){
    const terrain=this.terrain;if(!terrain.spectrum){this.pendingRecall=entry;return;}
    if(this.flowSpectrum!==terrain.spectrum){this.flowSpectrum=terrain.spectrum;this.entries.forEach(item=>delete item.flowOverride);}
    const time=terrain.windowStart+terrain.windowSize*.5;
    entry.flowOverride=THREE.MathUtils.clamp(terrain.inputTime?terrain.inputTime(time):time,0,terrain.spectrum.duration-.001);
    this.positionInFlow(entry);
    entry.orbitObject.position.x=entry.point.x+entry.cardOffsetX;entry.orbitObject.position.z=entry.point.z+entry.cardOffsetZ;
  }
  positionInFlow(entry){
    const terrain=this.terrain,duration=terrain.spectrum.duration,u=entry.map.frequency??(.25+entry.index*.13);
    const sourceStart=terrain.inputTime?terrain.inputTime(terrain.windowStart):terrain.windowStart;
    // Each occurrence stays attached to a source timestamp, including across local time stretching.
    const cue=soundCue(entry.post,terrain.spectrum),base=cue.start;
    if(entry.flowOverride!==undefined&&(sourceStart>entry.flowOverride+.01||sourceStart<entry.flowOverride-terrain.windowSize*1.2))delete entry.flowOverride;
    const source=entry.flowOverride??base;
    const time=terrain.outputTime?terrain.outputTime(source):source,depth=(time-terrain.windowStart)/terrain.windowSize;
    entry.flowTime=time;entry.flowSourceTime=source;entry.flowDepth=depth;entry.inFlow=source>=0&&source<duration&&depth>=0&&depth<=1;
    entry.flowAlpha=entry.inFlow?Math.min(1,depth/.075,(1-depth)/.1)*(1-(terrain.codaLevel||0)):0;
    entry.point.set((u-.5)*terrain.width,terrain.height(time,u),terrain.front-depth*terrain.depth);
  }
  locate(slug){const entry=this.entries.find(item=>item.post.slug===slug);if(!entry)return;entry.visible=true;this.orbit.bringForward(entry);}
  setActive(active){if(active&&!this.active)this.orbit?.resize(true);this.active=active;this.host.hidden=!active;this.ridges.hidden=!active;this.dock.hidden=!active;if(!active){this.hovered='';if(!this.terrain.reading)this.terrain.setStoryFocus(null);}}
  updateProgress(){
    this.entries.forEach(entry=>{const saved=this.progress(entry.post.slug),text=saved?(saved>=.96?'到过文末':`${Math.round(saved*100)}%`):'';entry.anchor.querySelectorAll('.story-pin-progress').forEach(label=>{if(label.textContent!==text)label.textContent=text;});});
    this.orbit.updateControls();
  }
  update(now,{active,editing,current}){
    this.setActive(active&&!editing);const terrain=this.terrain;if(!terrain.spectrum)return;
    if(this.flowSpectrum!==terrain.spectrum){this.flowSpectrum=terrain.spectrum;this.entries.forEach(entry=>{
      delete entry.flowOverride;const cue=soundCue(entry.post,terrain.spectrum);
      entry.anchor.querySelectorAll('.orbit-sound-cue small').forEach(label=>label.textContent=`${cue.range} · ${cue.title}`);
      entry.anchor.querySelectorAll('.orbit-sound-cue>span').forEach(label=>label.textContent=cue.note);
      entry.ridge.querySelector('.ridge-cue').textContent=`${cue.range} · ${cue.title}`;
    });}
    if(this.pendingRecall){const entry=this.pendingRecall;this.pendingRecall=null;this.orbit.bringForward(entry);}
    this.entries.forEach(entry=>this.positionInFlow(entry));
    const slug=this.hovered||this.selected,focus=this.active?this.entries.find(entry=>entry.visible&&entry.inFlow&&entry.post.slug===slug):null;
    const passing=this.active&&terrain.started?this.entries.find(entry=>{const cue=soundCue(entry.post,terrain.spectrum);return terrain.cursor>=terrain.outputTime(cue.start)&&terrain.cursor<=terrain.outputTime(cue.end);}):null;
    if(!terrain.reading)terrain.setStoryFocus(focus?this.focusMap(focus):passing?{...passing.map,depth:Math.max(0,Math.min(1,passing.flowDepth))}:null);
    const occlusion=now-this.lastOcclusion>280;if(occlusion)this.lastOcclusion=now;
    this.entries.forEach(entry=>{
      entry.group.position.copy(entry.point);entry.group.visible=this.active&&entry.visible&&entry.inFlow;
      const focused=entry===focus;entry.jewel.rotation.y=this.reduced?0:now*.00045;entry.jewel.scale.setScalar(focused?1.65:1);entry.ring.scale.setScalar(focused?1.7:1);
      // The selected locator stays legible through foreground ridges, like a navigation beacon.
      entry.jewel.material.depthTest=entry.stem.material.depthTest=!focused;entry.jewel.renderOrder=entry.stem.renderOrder=focused?8:0;
      entry.jewel.material.opacity=entry.flowAlpha;entry.stem.material.opacity=.5*entry.flowAlpha;entry.ring.material.opacity=.65*entry.flowAlpha;
      entry.anchor.classList.toggle('is-focused',focused);entry.ridge.classList.toggle('is-focused',focused);
      entry.markerLift=this.reduced?(focused?7.5:3.2):THREE.MathUtils.lerp(entry.markerLift,focused?7.5:3.2,.16);
      this.projected.copy(entry.point);this.projected.y+=entry.markerLift;
      if(occlusion&&this.active&&entry.visible&&entry.inFlow){
        this.direction.subVectors(this.projected,terrain.camera.position);const distance=this.direction.length();this.ray.set(terrain.camera.position,this.direction.normalize());this.ray.far=Math.max(.1,distance-.25);
        entry.ridgeCovered=this.ray.intersectObject(terrain.surface,false).some(hit=>hit.point.y>.55);
      }
      entry.jewel.position.y=entry.markerLift;entry.stem.geometry.attributes.position.setY(1,entry.markerLift);entry.stem.geometry.attributes.position.needsUpdate=true;
      this.projected.project(terrain.camera);const x=(this.projected.x+1)/2*innerWidth,y=(1-this.projected.y)/2*innerHeight;
      const visible=this.active&&entry.visible&&entry.inFlow&&entry.flowAlpha>.08&&(!entry.ridgeCovered||focused)&&this.projected.z>0&&this.projected.z<1&&x>20&&x<innerWidth-20&&y>(innerWidth<760?344:80)&&y<innerHeight-(innerWidth<760?230:145);
      if(!visible&&entry.ridge.contains(document.activeElement))this.dock.querySelector('#orbit-next').focus({preventScroll:true});
      entry.ridge.hidden=!visible;entry.ridge.tabIndex=visible?0:-1;
      if(visible){entry.ridge.style.opacity=entry.flowAlpha;entry.ridge.style.left=`${x}px`;entry.ridge.style.top=`${y}px`;entry.ridge.classList.toggle('label-left',x>innerWidth*.66);}
    });
    this.orbit.update(now,{editing,hovered:focus?.post.slug||'',current,active:this.active,showCards:this.showCards});
  }
}
