import { SoundTerrain } from './sound-terrain.js';
import { SculptedAudio } from './sculpted-audio.js';
import { StoryLandscape } from './story-landscape.js';
import {ListeningFinale} from './listening-finale.js';

const ROOT = new URL('../', import.meta.url);
const SOURCE = 'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clockText = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l12-7z" fill="currentColor"/></svg>';
const PAUSE = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/></svg>';

export class MusicScene {
  constructor() {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    this.editor = false; this.ready = false; this.started = false; this.id = 0; this.pointer = null;
    this.windowStart = 0; this.windowSize = 32; this.previewEpoch = performance.now(); this.lastFrame = 0; this.raf = 0; this.lastTimeText = '';
    this.wasPlaying = false; this.objectURL = null; this.uploadId = 0;
    this.tool = 'select'; this.selection = null; this.editJob = 0; this.windowPinned = false; this.sculptClosed = false;
    this.mount();this.finale=new ListeningFinale({audio:this.audio,canStart:()=>this.ready&&!this.editor&&!this.audition&&document.body.classList.contains('soundscape-home')});this.initializeScene(); this.bind(); this.loadPreset(); this.setEditor(false);
    this.setSculptOpen(false);this.stories=new StoryLandscape({terrain:this.terrain,root:ROOT,reduced:this.reduced,schedule:()=>this.schedule()});
  }
  mount() {
    const canvas = document.createElement('canvas'); canvas.id = 'music-bg'; canvas.setAttribute('aria-hidden','true'); document.querySelector('.bg-wrap').appendChild(canvas); this.canvas = canvas;
    const field = document.createElement('div'); field.id = 'music-field'; field.dataset.tool='select'; field.tabIndex = 0; field.setAttribute('role','slider'); field.setAttribute('aria-label','全屏三维音乐山脉。拖动环视，滚轮缩放，点击山坡打开声音编辑。S 选段，R 拉伸，V 环视。左右键前后五秒，空格播放暂停，回车试听选段，右键或 Esc 收起面板。'); field.setAttribute('aria-valuemin','0'); field.setAttribute('aria-valuemax','205'); field.setAttribute('aria-valuenow','0'); document.body.appendChild(field); this.field = field;
    const pointer = document.createElement('div'); pointer.id = 'music-pointer'; pointer.hidden = true; pointer.innerHTML = '<span></span><i></i><small>点击，从这里继续</small>'; document.body.appendChild(pointer); this.pointerUI = pointer;
    const hint = document.createElement('div'); hint.id = 'music-hint'; hint.innerHTML = '<span class="music-dot"></span><span id="music-hint-copy">拖动环视 · 点击山峰，听见这一刻</span><span class="music-window">32 SECOND LANDSCAPE</span>'; document.body.appendChild(hint);
    const legend = document.createElement('div'); legend.id = 'music-terrain-legend'; legend.innerHTML = '<span>SOUND / TOPOGRAPHY</span><div>横向频率 <i>×</i> 纵深时间 <i>×</i> 山高能量</div>'; document.body.appendChild(legend);
    const viewTools=document.createElement('div');viewTools.id='music-view-tools';viewTools.setAttribute('aria-label','山脉视距');viewTools.innerHTML='<span>视距</span><button id="music-zoom-out" aria-label="拉远山脉视角">−</button><button id="music-zoom-in" aria-label="拉近并放大山脉">＋</button>';document.body.appendChild(viewTools);this.viewTools=viewTools;
    const player = document.createElement('section'); player.id = 'music-player'; player.setAttribute('aria-label','背景音乐播放器');
    player.innerHTML = `<audio id="background-audio" preload="auto" hidden></audio>
      <button id="music-play" class="music-play" aria-label="播放背景音乐" disabled>${PLAY}</button>
      <div class="music-track"><div><span class="music-track-label">NOW PLAYING</span><span id="music-state" role="status" aria-live="polite">正在准备音乐</span></div><strong id="music-title">Gymnopédie No.1</strong><a id="music-credit" href="${SOURCE}" target="_blank" rel="noopener">Erik Satie · 钢琴 / CC0 ↗</a></div>
      <div class="music-timeline"><div><span id="music-position">0:00</span><span id="music-duration">3:25</span></div><input id="music-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="背景音乐播放进度" disabled></div>
      <div class="music-volume"><label for="music-volume">音量 <output id="music-volume-value">25%</output></label><input id="music-volume" aria-label="背景音乐音量" type="range" min="0" max="100" step="1" value="25"></div>
      <div class="music-actions"><label for="music-file" class="music-import" tabindex="0" title="导入自己的纯音乐">＋ 导入<input id="music-file" type="file" accept="audio/*" hidden></label><button id="music-reset-view" title="恢复山脉的初始视角">⤢ 复位视角</button><button id="music-sculpt-open" hidden aria-controls="music-sculpt" aria-expanded="true" title="重新打开声音操作面板">⌁ 编辑声音</button><button id="music-preset" hidden title="换回内置钢琴音乐">↶ 钢琴</button><button id="music-editor" aria-pressed="false">实验室 ↗</button><a class="music-scene" href="${ROOT.href}">声音山脉 ↗</a></div>`;
    document.body.appendChild(player); this.player = player; this.audio = new SculptedAudio(player.querySelector('audio')); this.audio.volume = .25;
    this.controls = Object.fromEntries([...player.querySelectorAll('[id]')].map(el => [el.id, el]));
    const sculpt = document.createElement('section'); sculpt.id = 'music-sculpt'; sculpt.setAttribute('aria-label','直接雕刻声音山脉');
    sculpt.innerHTML = `<div class="sculpt-tools" role="group" aria-label="背景交互工具">
      <button data-sculpt-tool="select" aria-pressed="true" class="active" title="拖过山脉选择一段声音（S）">⌁ 选段</button><button data-sculpt-tool="stretch" aria-pressed="false" title="只改变选中部分的时间与振幅（R）">↔ 拉伸</button><button data-sculpt-tool="orbit" aria-pressed="false" title="拖动旋转视角（V）">⤢ 环视</button><button id="sculpt-particles" aria-pressed="true" title="开关鼠标光粒与点击涟漪">✧ 光粒</button><button id="sculpt-close" aria-label="收起声音操作面板" title="收起面板（右键 / Esc）">×</button>
      </div><div id="sculpt-empty"><span>拖过山脉，选中一段声音</span><button id="sculpt-quick">选中 5 秒 ↗</button></div>
      <div id="sculpt-selection" hidden><div class="sculpt-range"><span>SELECTED SOUND</span><strong id="sculpt-range"></strong><button id="sculpt-clear" aria-label="取消选段并恢复原声" title="取消选段并恢复原声">×</button></div>
      <div class="sculpt-parameters"><label>时间 <output id="sculpt-ratio-value">1.00×</output><input id="sculpt-ratio" type="range" min="0.6" max="1.8" step="0.01" value="1" aria-label="选段时间拉伸倍率"></label><label>振幅 <output id="sculpt-gain-value">0 dB</output><input id="sculpt-gain" type="range" min="-12" max="6" step="0.5" value="0" aria-label="选段振幅分贝"></label></div>
      <div class="sculpt-foot"><span id="sculpt-length"></span><button id="sculpt-audition">▷ 试听这一段</button><button id="sculpt-reset" title="恢复这一段的原始时长和振幅">↶ 撤销变形</button></div></div>
      <div id="sculpt-status" role="status" aria-live="polite">右键 / Esc 收起 · S / R / V 切换工具</div>`;
    document.body.appendChild(sculpt); this.sculpt = sculpt;
    Object.assign(this.controls, Object.fromEntries([...sculpt.querySelectorAll('[id]')].map(el => [el.id,el])));
    this.edges = ['start','end'].map(edge => { const el=document.createElement('button');el.className=`music-edge music-edge-${edge}`;el.dataset.edge=edge;el.hidden=true;el.setAttribute('role','slider');el.setAttribute('aria-label',edge==='start'?'选段开始时间':'选段结束时间');el.innerHTML=`<i></i><span>${edge==='start'?'起点':'终点'} <b>↔</b></span>`;document.body.appendChild(el);return el; });
  }
  initializeScene() {
    try { this.terrain = new SoundTerrain(this.canvas, {mobile: this.mobile, reduced: this.reduced}); }
    catch { this.fallback = true; }
    this.resize();
  }
  resize() { this.terrain?.resize(); this.schedule(); }
  cancelAnalysis() {
    if (this.cancelWorker) this.cancelWorker();
    this.cancelWorker = null;
  }
  analyze(buffer, token) {
    return new Promise((resolve, reject) => {
      if (token !== this.uploadId) { reject(new Error('已取消上一次导入')); return; }
      const worker = new Worker(new URL('./terrain-worker.js', import.meta.url), {type: 'module'});
      const finish = (value, error) => { worker.terminate(); if (this.cancelWorker === cancel) this.cancelWorker = null; error ? reject(error) : resolve(value); };
      const cancel = () => finish(null, new Error('已取消上一次导入'));
      this.cancelWorker = cancel;
      worker.onmessage = event => event.data.error ? finish(null, new Error(event.data.error)) : finish(event.data);
      worker.onerror = () => finish(null, new Error('无法生成音乐山脉，请重新导入'));
      const pcm = buffer.getChannelData(0).slice();
      worker.postMessage({pcm, sampleRate: buffer.sampleRate, duration: buffer.duration}, [pcm.buffer]);
    });
  }
  async loadPreset() {
    this.cancelAnalysis();this.ready=false;this.started=false;this.report('正在生成音乐山脉');const token=++this.uploadId;
    try {
      const responses=await Promise.all(['audio/gymnopedie-no1.peaks.json','audio/gymnopedie-no1.terrain.json'].map(path=>fetch(new URL(path,ROOT))));
      if(responses.some(response=>!response.ok))throw new Error('音乐山脉读取失败');
      const [data,spectrum]=await Promise.all(responses.map(response=>response.json()));if(token!==this.uploadId)return;
      spectrum.values=Uint8Array.from(atob(spectrum.data),character=>character.charCodeAt(0));delete spectrum.data;spectrum.custom=false;this.spectrum=spectrum;
      const oldURL=this.objectURL;this.audio.pause();this.audio.src=new URL('audio/gymnopedie-no1.mp3',ROOT).href;this.audio.load();if(oldURL)URL.revokeObjectURL(oldURL);this.objectURL=null;
      this.selection=null;this.editJob++;this.windowPinned=false;this.data=data;this.audio.knownDuration=data.duration;this.windowSize=Math.min(32,data.duration);this.ready=true;this.previewEpoch=performance.now();this.custom=false;
      this.controls['music-title'].textContent='Gymnopédie No.1';this.controls['music-credit'].textContent='Erik Satie · Teknopazzo / CC0 ↗';this.controls['music-credit'].href=SOURCE;this.controls['music-credit'].hidden=false;this.controls['music-preset'].hidden=true;
      this.report('点击开启');this.sync();this.schedule();
    } catch(error){if(token!==this.uploadId)return;this.report(error.message+'，可导入自己的音乐');this.controls['music-preset'].hidden=false;}
  }
  async importFile(file) {
    if(!file)return;
    if(file.size>40*1024*1024){this.report('请使用 40 MB 以内的音乐');return;}
    this.cancelAnalysis();const token=++this.uploadId;this.report('正在生成你的音乐山脉');
    let ctx;
    try {
      ctx=new OfflineAudioContext(1,1,16000);
      const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
      if(buffer.duration>600)throw new Error('请使用 10 分钟以内的音乐');
      const pcm=buffer.getChannelData(0),bins=Math.min(36000,Math.max(1,Math.ceil(buffer.duration*60))),low=new Float32Array(bins),high=new Float32Array(bins),rms=new Float32Array(bins);let peak=.001;
      for(let b=0;b<bins;b++){const begin=Math.floor(b*pcm.length/bins),end=Math.max(begin+1,Math.floor((b+1)*pcm.length/bins));let sum=0;for(let i=begin;i<end;i++){low[b]=Math.min(low[b],pcm[i]);high[b]=Math.max(high[b],pcm[i]);sum+=pcm[i]*pcm[i];}rms[b]=Math.sqrt(sum/(end-begin));peak=Math.max(peak,-low[b],high[b]);}
      const spectrum=await this.analyze(buffer,token);if(token!==this.uploadId)return;spectrum.custom=true;
      this.audio.pause();const oldURL=this.objectURL;this.objectURL=URL.createObjectURL(file);this.audio.src=this.objectURL;this.audio.load();if(oldURL)URL.revokeObjectURL(oldURL);
      this.selection=null;this.editJob++;this.windowPinned=false;this.data={duration:buffer.duration,bins,peak,low,high,rms};this.audio.knownDuration=buffer.duration;this.spectrum=spectrum;this.windowSize=Math.min(32,buffer.duration);this.ready=true;this.started=false;this.custom=true;this.previewEpoch=performance.now();
      this.controls['music-title'].textContent=file.name;this.controls['music-credit'].hidden=true;this.controls['music-preset'].hidden=false;this.report('本地音乐已就绪');this.sync();this.schedule();
    } catch(error){if(token===this.uploadId)this.report(error.message||'无法读取这段音乐');}finally{if(ctx?.close)ctx.close();}
  }
  report(text){this.controls['music-state'].textContent=text;}
  async play(from) {
    if(!this.ready)return;
    this.storyCueEnd=null;
    this.editJob++;this.controls['sculpt-audition'].disabled=false;
    this.windowPinned=false;this.audition=false;
    if(typeof from==='number')this.audio.currentTime=clamp(from,0,Math.max(0,(this.audio.duration||this.data.duration)-.02));
    else if(this.audio.currentTime>=this.duration()-.02)this.audio.currentTime=0;
    this.finale.preparePlay();
    try{await this.audio.play();if(this.audio.paused||this.editor)return;this.started=true;this.report('正在播放');this.sync();this.schedule();}
    catch{this.report('点播放按钮开启音乐');this.sync();}
  }
  toggle(){if(this.audio.paused)this.play();else{this.audio.pause();this.report('已暂停');this.sync();}}
  seek(time,play=false){if(!this.ready)return;this.storyCueEnd=null;this.started=true;this.audio.currentTime=clamp(time,0,Math.max(0,(this.audio.duration||this.data.duration)-.02));if(play)this.play();this.sync();this.schedule();}
  setEditor(editor) {
    this.editor=editor;
    if(editor){this.editJob++;this.controls['sculpt-audition'].disabled=false;this.wasPlaying=!this.audio.paused;this.audio.pause();this.report('实验室中 · 音乐暂停');}
    document.body.classList.toggle('music-mode',!editor);this.field.hidden=editor;this.pointerUI.hidden=true;
    this.edges.forEach(edge=>edge.hidden=true);
    this.controls['music-editor'].textContent=editor?'返回流动背景 ↶':'实验室 ↗';this.controls['music-editor'].setAttribute('aria-pressed',editor);
    document.dispatchEvent(new CustomEvent('blog:mode',{detail:{editor}}));this.updateReading();this.sync();this.schedule();
  }
  openEditor() {
    if(document.querySelector('.sound-lab')){this.setEditor(true);window.scrollTo({top:0,behavior:this.reduced?'instant':'smooth'});return;}
    this.pendingEditor=true;
    const link=document.createElement('a');link.href=ROOT.href;link.hidden=true;document.body.appendChild(link);link.click();link.remove();
  }
  duration(){return Number.isFinite(this.audio.duration)?this.audio.duration:this.data?.duration||0;}
  sync() {
    const playing=!this.audio.paused;
    this.player.classList.toggle('is-playing',playing);this.player.classList.toggle('is-editor',this.editor);
    this.controls['music-play'].disabled=!this.ready;this.controls['music-seek'].disabled=!this.ready;
    this.controls['music-play'].innerHTML=playing?PAUSE:PLAY;this.controls['music-play'].setAttribute('aria-label',playing?'暂停背景音乐':'播放背景音乐');
    this.controls['music-duration'].textContent=clockText(this.duration());this.field.setAttribute('aria-valuemax',Math.round(this.duration()));
    document.querySelector('.music-window').textContent=`${Math.round(this.windowSize)} SECOND LANDSCAPE`;
    document.querySelector('#music-hint-copy').textContent=this.sculptClosed?'单击山脉打开编辑 · 拖动环视':this.tool==='orbit'?'拖动环视山脉 · 点击跳播':this.tool==='stretch'?'横向拉伸时间 · 纵向抬升振幅 · 仅作用于发光选段':'拖过山脉选择一段 · 点击任意山坡跳播';
    this.syncSculpt();
    this.tickUI();
  }
  tickUI() {
    this.finale?.sample();
    if(this.storyCueEnd!==null&&this.storyCueEnd!==undefined&&this.audio.currentTime>=this.storyCueEnd){this.storyCueEnd=null;this.audio.pause();this.report('乐句试听结束');}
    const time=this.audio.currentTime||0,text=clockText(time);if(text!==this.lastTimeText){this.controls['music-position'].textContent=text;this.lastTimeText=text;}
    if(document.activeElement!==this.controls['music-seek'])this.controls['music-seek'].value=this.duration()?time/this.duration()*1000:0;
    this.controls['music-seek'].setAttribute('aria-valuetext',`${clockText(time)} / ${clockText(this.duration())}`);
    this.field.setAttribute('aria-valuenow',time.toFixed(2));this.field.setAttribute('aria-valuetext',clockText(time));
  }
  bind() {
    this.controls['music-play'].addEventListener('click',()=>{if(this.editor){this.setEditor(false);}this.toggle();});
    this.controls['music-seek'].addEventListener('input',event=>this.seek(Number(event.target.value)/1000*this.duration()));
    this.controls['music-volume'].addEventListener('input',event=>{this.audio.volume=Number(event.target.value)/100;this.controls['music-volume-value'].textContent=`${event.target.value}%`;});
    this.controls['music-editor'].addEventListener('click',()=>{
      if(!this.editor){this.openEditor();return;}
      const restore=this.wasPlaying;this.setEditor(false);if(restore)this.play();window.scrollTo({top:0,behavior:this.reduced?'instant':'smooth'});
    });
    this.controls['music-file'].addEventListener('change',event=>this.importFile(event.target.files[0]));
    this.player.querySelector('.music-import').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();this.controls['music-file'].click();}});
    this.controls['music-preset'].addEventListener('click',()=>this.loadPreset());
    this.controls['music-reset-view'].addEventListener('click',()=>{document.dispatchEvent(new Event('blog:orbit-reset'));this.terrain?.resetView();this.schedule();});
    this.viewTools.querySelector('#music-zoom-in').addEventListener('click',()=>{this.terrain?.zoomBy(.9);this.schedule();});
    this.viewTools.querySelector('#music-zoom-out').addEventListener('click',()=>{this.terrain?.zoomBy(1.1);this.schedule();});
    this.field.addEventListener('wheel',event=>{if(!this.terrain||this.editor||document.body.classList.contains('terrain-reading'))return;event.preventDefault();this.terrain.zoomBy(Math.exp(clamp(event.deltaY,-120,120)*.001));this.schedule();},{passive:false});
    this.audio.addEventListener('play',()=>{this.started=true;this.report('正在播放');this.sync();this.schedule();});
    this.audio.addEventListener('pause',()=>{if(!this.editor)this.report('已暂停');if(this.audition){this.audition=false;this.controls['sculpt-status'].textContent='选段试听已停止 · 整曲播放会保留这次变形';}this.sync();this.schedule();});
    this.audio.addEventListener('loadedmetadata',()=>{this.sync();this.schedule();});
    this.audio.addEventListener('timeupdate',()=>this.tickUI());
    this.audio.addEventListener('ended',()=>{
      if(this.editor||!this.ready){this.finale.invalidate();return;}
      if(this.finale.finish()){this.report('一曲终了');this.sync();this.schedule();}
      else {this.audio.currentTime=0;this.play();}
    });
    this.audio.addEventListener('error',()=>{this.report('音乐读取失败，可重新选择或导入');this.controls['music-preset'].hidden=false;});
    this.field.addEventListener('pointerdown',event=>this.pointerDown(event));
    this.field.addEventListener('pointerup',event=>this.pointerUp(event));
    this.field.addEventListener('pointermove',event=>this.pointerMove(event));
    this.field.addEventListener('pointercancel',event=>this.cancelGesture(event));
    this.field.addEventListener('pointerleave',()=>{if(this.down)return;this.pointer=null;this.pointerUI.hidden=true;this.field.classList.remove('over-terrain');this.terrain?.clearHover();this.schedule();});
    for(const edge of this.edges){
      edge.addEventListener('pointerdown',event=>this.pointerDown(event,edge.dataset.edge));
      edge.addEventListener('pointermove',event=>this.pointerMove(event));
      edge.addEventListener('pointerup',event=>this.pointerUp(event));
      edge.addEventListener('pointercancel',event=>this.cancelGesture(event));
      edge.addEventListener('keydown',event=>this.edgeKey(event,edge.dataset.edge));
    }
    this.sculpt.querySelectorAll('[data-sculpt-tool]').forEach(button=>button.addEventListener('click',()=>this.setTool(button.dataset.sculptTool)));
    this.controls['sculpt-quick'].addEventListener('click',()=>this.quickSelect());
    this.controls['sculpt-clear'].addEventListener('click',()=>this.clearSelection());
    this.controls['sculpt-close'].addEventListener('click',()=>this.setSculptOpen(false));
    this.controls['music-sculpt-open'].addEventListener('click',()=>this.setSculptOpen(true));
    document.addEventListener('contextmenu',event=>{
      if(this.editor||this.sculptClosed||document.body.classList.contains('terrain-reading'))return;
      if(!event.target.closest('#music-field,#music-sculpt,.music-edge'))return;
      event.preventDefault();this.setSculptOpen(false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||this.editor||this.sculptClosed||document.body.classList.contains('terrain-reading'))return;
      event.preventDefault();this.setSculptOpen(false);
    });
    this.controls['sculpt-reset'].addEventListener('click',()=>{if(!this.selection)return;this.previewSelection({...this.selection,ratio:1,db:0});this.applySelection(false);});
    this.controls['sculpt-audition'].addEventListener('click',()=>this.applySelection(true));
    for(const [id,key] of [['sculpt-ratio','ratio'],['sculpt-gain','db']]){
      this.controls[id].addEventListener('input',event=>{if(!this.selection)return;this.pinWindow();this.audio.unlock().catch(()=>{});this.previewSelection({...this.selection,[key]:Number(event.target.value)});});
      this.controls[id].addEventListener('change',()=>this.applySelection(true));
    }
    this.controls['sculpt-particles'].addEventListener('click',()=>{if(!this.terrain)return;const enabled=!this.terrain.particles.enabled;this.terrain.particles.enabled=enabled;this.controls['sculpt-particles'].setAttribute('aria-pressed',enabled);this.schedule();});
    document.addEventListener('pointermove',event=>{
      if(this.editor||document.body.classList.contains('terrain-reading')||!this.terrain||performance.now()-(this.lastParticle||0)<20)return;
      this.lastParticle=performance.now();const hit=this.terrain.pick(event.clientX,event.clientY,false);
      this.terrain.particles.emit(hit?.point||this.terrain.pointerWorld(event.clientX,event.clientY),{sculpt:!this.sculptClosed&&this.dragging&&this.tool==='stretch',energy:hit?.energy||.3});this.schedule();
    },{passive:true});
    this.field.addEventListener('keydown',event=>{
      if(event.target!==this.field)return;
      if(event.key.toLowerCase()==='s')this.setTool('select');if(event.key.toLowerCase()==='r')this.setTool('stretch');if(event.key.toLowerCase()==='v')this.setTool('orbit');
      if(event.key==='Enter'&&this.selection&&!this.sculptClosed){event.preventDefault();this.applySelection(true);}
      if(event.key===' '){event.preventDefault();this.toggle();}
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.seek(this.audio.currentTime+(event.key==='ArrowRight'?5:-5));}
      if(event.key==='Home'){event.preventDefault();this.seek(0);}if(event.key==='End'){event.preventDefault();this.seek(this.duration()-.1);}
    });
    document.addEventListener('click',event=>{
      const anchor=event.target.closest('a');if(!anchor)return;
      if(new URL(anchor.href).hash==='#sound-lab'){
        if(document.querySelector('.sound-lab')){event.preventDefault();event.stopImmediatePropagation();this.openEditor();}
        else this.pendingEditor=true;
      }
    },true);
    document.addEventListener('blog:lab-playing',()=>{this.audio.pause();this.sync();});
    document.addEventListener('blog:sculpt-request',event=>{if(this.editor)this.setEditor(false);this.setSculptOpen(event.detail.open);});
    document.addEventListener('blog:open-lab',()=>this.openEditor());
    document.addEventListener('blog:listen-cue',async event=>{
      if(!this.ready){this.report('音乐准备中，请稍后试听');return;}
      const version=this.audio.version,token=(this.listenToken||0)+1;this.listenToken=token;
      await this.play(this.audio.outputTime(event.detail.start));
      if(version===this.audio.version&&token===this.listenToken&&!this.audio.paused){this.storyCueEnd=this.audio.outputTime(event.detail.end);this.report('正在试听文章的乐句');}
    });
    document.addEventListener('blog:finale',event=>{this.terrain?.setCoda(event.detail.active);this.schedule();});
    document.addEventListener('blog:navigate',()=>{if(this.pendingEditor){this.pendingEditor=false;this.setEditor(true);}else if(document.body.classList.contains('ambient')){const restore=this.editor&&this.wasPlaying;this.setEditor(false);if(restore)this.play();}else document.body.classList.toggle('music-mode',!this.editor);this.updateReading();this.schedule();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;}else this.schedule();});
    window.addEventListener('resize',()=>this.resize());window.addEventListener('pagehide',()=>{this.audio.pause();cancelAnimationFrame(this.raf);this.cancelAnalysis();if(this.objectURL)URL.revokeObjectURL(this.objectURL);});
    window.addEventListener('scroll',()=>this.updateReading(),{passive:true});this.updateReading();
  }
  updateReading(){const reading=document.body.classList.contains('ambient')||scrollY>innerHeight*.6;document.body.classList.toggle('terrain-reading',reading);this.player.classList.toggle('is-reading',reading);this.field.hidden=this.editor||reading;if(reading)this.pointerUI.hidden=true;}
  setSculptOpen(open) {
    if(open)this.stories?.orbit?.cancelMotion();
    const restoreFocus=this.sculpt.contains(document.activeElement)||this.edges.includes(document.activeElement);
    if(!open&&this.down){const down=this.down;this.cancelGesture();if(down.target.hasPointerCapture(down.pointerId))down.target.releasePointerCapture(down.pointerId);}
    this.sculptClosed=!open;this.sculpt.hidden=!open;document.body.classList.toggle('sculpt-closed',!open);
    this.controls['music-sculpt-open'].hidden=open;this.controls['music-sculpt-open'].setAttribute('aria-expanded',String(open));
    this.edges.forEach(edge=>edge.hidden=true);this.pointer=null;this.pointerUI.hidden=true;this.terrain?.clearHover();
    if(!open){this.windowPinned=false;if(restoreFocus)this.controls['music-sculpt-open'].focus({preventScroll:true});}
    else this.sculpt.querySelector('[data-sculpt-tool].active')?.focus({preventScroll:true});
    this.sync();this.schedule();
  }
  setTool(tool) {
    if(this.sculptClosed)this.setSculptOpen(true);
    this.tool=tool;this.field.dataset.tool=tool;
    this.sculpt.querySelectorAll('[data-sculpt-tool]').forEach(button=>{const active=button.dataset.sculptTool===tool;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
    if(tool==='stretch'&&!this.selection)this.quickSelect();
    this.controls['sculpt-status'].textContent=tool==='select'?'拖过一段山脉选中声音 · 最长 12 秒':tool==='stretch'?'拖动发光选段：横向改变时长，纵向改变振幅':'拖动旋转视角 · 点击山坡跳播';
    this.sync();this.schedule();
  }
  pinWindow() { this.windowPinned=true;this.audio.pause();this.started=true; }
  normalizeSelection(start,end) {
    const duration=this.audio.sourceDuration||this.data?.duration||1,minimum=Math.min(.2,duration);
    start=clamp(start,0,Math.max(0,duration-minimum));end=clamp(end,start+minimum,Math.min(duration,start+12));
    return {start,end};
  }
  previewSelection(selection) {
    this.selection={...selection,...this.normalizeSelection(selection.start,selection.end),ratio:clamp(selection.ratio,.6,1.8),db:clamp(selection.db,-12,6)};
    this.editJob++;this.controls['sculpt-audition'].disabled=false;this.audio.preview(this.selection);this.syncSculpt();this.sync();this.schedule();
  }
  quickSelect() {
    if(!this.ready)return;
    this.pinWindow();
    const oldStart=this.audio.inputTime(this.windowStart),duration=this.audio.sourceDuration||this.data.duration;
    let start=clamp(oldStart+this.windowSize*.3,0,Math.max(0,duration-Math.min(5,duration)));
    this.windowStart=oldStart;this.previewSelection({start,end:Math.min(duration,start+5),ratio:1,db:0});
    this.controls['sculpt-status'].textContent='选段已发光 · 切到“拉伸”，直接拖动它';
  }
  clearSelection() {
    const windowStart=this.audio.inputTime(this.windowStart);this.audio.preview(null);this.audio.commit();this.selection=null;this.editJob++;this.windowStart=windowStart;
    this.controls['sculpt-status'].textContent='已恢复原声 · 拖过山脉重新选段';this.sync();this.schedule();
  }
  async applySelection(listen) {
    if(!this.selection)return;
    const job=++this.editJob,selection={...this.selection};
    this.controls['sculpt-audition'].disabled=true;this.controls['sculpt-status'].textContent='正在准备这段声音…';
    try {
      await this.audio.unlock();
      const applied=await this.audio.commit();if(job!==this.editJob||!applied)return;
      if(listen){this.audition=true;this.windowPinned=true;const played=await this.audio.playRange(this.audio.outputTime(selection.start),this.audio.outputTime(selection.end));if(!played)return;}
      if(job!==this.editJob)return;
      this.controls['sculpt-status'].textContent=listen?'正在试听选段 · 整曲播放会保留这次变形':Math.abs(selection.ratio-1)<.001&&Math.abs(selection.db)<.01?'已恢复这段声音的原始尺度':'选段变形已保留 · 可以试听或继续播放整曲';
      const point=this.terrain?.projectTime(this.audio.outputTime((selection.start+selection.end)/2))?.point;this.terrain?.particles.emit(point,{burst:true,sculpt:true});
    } catch(error){if(job===this.editJob)this.controls['sculpt-status'].textContent=error.message||'这段声音暂时无法处理，请再试一次';}
    finally{if(job===this.editJob){this.controls['sculpt-audition'].disabled=false;this.sync();this.schedule();}}
  }
  syncSculpt() {
    if(!this.sculpt)return;
    const s=this.selection;this.controls['sculpt-empty'].hidden=!!s;this.controls['sculpt-selection'].hidden=!s;
    if(!s){this.controls['sculpt-audition'].disabled=false;return;}
    this.controls['sculpt-range'].textContent=`${clockText(s.start)}.${String(Math.floor(s.start%1*100)).padStart(2,'0')} — ${clockText(s.end)}.${String(Math.floor(s.end%1*100)).padStart(2,'0')}`;
    this.controls['sculpt-ratio'].value=s.ratio;this.controls['sculpt-gain'].value=s.db;
    this.controls['sculpt-ratio-value'].textContent=`${s.ratio.toFixed(2)}×`;this.controls['sculpt-gain-value'].textContent=`${s.db>0?'+':''}${s.db.toFixed(s.db%1?1:0)} dB`;
    this.controls['sculpt-length'].textContent=`${(s.end-s.start).toFixed(2)} s → ${((s.end-s.start)*s.ratio).toFixed(2)} s`;
    this.edges.forEach((edge,i)=>{edge.setAttribute('aria-valuemin','0');edge.setAttribute('aria-valuemax',this.audio.sourceDuration||this.data?.duration||0);edge.setAttribute('aria-valuenow',i?s.end:s.start);edge.setAttribute('aria-valuetext',`${(i?s.end:s.start).toFixed(2)} 秒`);edge.disabled=this.tool==='orbit'||(this.tool==='stretch'&&!i);edge.querySelector('span').innerHTML=i?(this.tool==='stretch'?'拉伸终点 <b>↔</b>':'终点 <b>↔</b>'):(this.tool==='stretch'?'固定起点':'起点 <b>↔</b>');});
  }
  positionEdges() {
    this.edges.forEach((edge,i)=>{
      const point=this.selection&&this.terrain?.projectTime(this.audio.outputTime(i?this.selection.end:this.selection.start));
      edge.hidden=!point||this.editor||this.sculptClosed||document.body.classList.contains('ambient')||point.x<15||point.x>innerWidth-15||point.y<75||point.y>innerHeight-130;
      if(!edge.hidden){edge.style.left=`${point.x}px`;edge.style.top=`${point.y}px`;}
    });
  }
  pointerDown(event,edge=null) {
    if(event.button!==0||!this.ready||this.down||document.body.classList.contains('terrain-reading'))return;
    if(this.terrain)this.terrain.flight=null;
    const hit=this.timeAt(event.clientX,event.clientY),tool=this.sculptClosed?'orbit':this.tool;
    if(tool==='orbit')this.stories?.orbit?.cancelMotion();
    if(tool!=='orbit'&&!edge&&!hit)return;
    if(tool==='stretch'&&!edge&&(!this.selection||hit.sourceTime<this.selection.start||hit.sourceTime>this.selection.end)){
      this.controls['sculpt-status'].textContent='请拖动发光的选段，或切回“选段”重新选择';return;
    }
    const wasPlaying=!this.audio.paused,windowStart=this.windowStart;
    if(tool!=='orbit'){this.pinWindow();if(tool==='stretch')this.audio.unlock().catch(()=>{});}
    const sourceTime=edge?(edge==='start'?this.selection.start:this.selection.end):hit?.sourceTime;
    this.down={x:event.clientX,y:event.clientY,yaw:this.terrain?.yaw||0,pitch:this.terrain?.pitch||.31,hit,sourceTime,edge,selection:this.selection&&{...this.selection},target:event.currentTarget,pointerId:event.pointerId,tool,wasPlaying,windowStart};
    this.dragging=false;event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  }
  pointerMove(event) {
    this.pointer={x:event.clientX,y:event.clientY};const down=this.down;
    if(down){
      const dx=event.clientX-down.x,dy=event.clientY-down.y;
      if(Math.hypot(dx,dy)>6)this.dragging=true;
      if(this.dragging){
        this.field.classList.add(down.tool==='orbit'?'is-orbiting':'is-sculpting');this.terrain?.clearHover();
        if(down.tool==='orbit')this.terrain?.orbit(down.yaw-dx*.004,down.pitch+dy*.003);
        else if(down.tool==='select'){
          if(!down.initialized){this.windowStart=this.audio.inputTime(this.windowStart);this.audio.preview(null);down.initialized=true;}
          const height=down.hit?.point?.y||1,planeStart=this.terrain?.dragTime(down.x,down.y,height),planeEnd=this.terrain?.dragTime(event.clientX,event.clientY,height);
          const delta=planeStart!==null&&planeEnd!==null&&planeStart!==undefined?planeEnd-planeStart:-dy/innerHeight*this.windowSize;
          const time=clamp(down.sourceTime+delta,Math.max(0,down.sourceTime-12),Math.min(this.audio.sourceDuration,down.sourceTime+12));
          let start,end;
          if(down.edge==='start'){start=Math.max(down.selection.end-12,Math.min(time,down.selection.end-.2));end=down.selection.end;}
          else if(down.edge==='end'){start=down.selection.start;end=Math.max(time,start+.2);}
          else{start=Math.min(down.sourceTime,time);end=Math.max(down.sourceTime,time);}
          this.previewSelection({start,end,ratio:1,db:0});
          this.controls['sculpt-status'].textContent='紫色区域是你的选段 · 松手后切到“拉伸”';
        }else{
          let ratio=down.selection.ratio+dx/240;
          if(down.edge==='end'){
            const height=down.hit?.point?.y||1,a=this.terrain?.dragTime(down.x,down.y,height),b=this.terrain?.dragTime(event.clientX,event.clientY,height);
            if(a!==null&&b!==null&&a!==undefined)ratio=down.selection.ratio+(b-a)/(down.selection.end-down.selection.start);
          }
          this.previewSelection({...down.selection,ratio,db:down.edge?down.selection.db:Math.round((down.selection.db-dy/18)*2)/2});
          this.controls['sculpt-status'].textContent='只改变紫色选段 · 松手试听变形后的声音';
        }
      }
    }
    this.showPointer();this.schedule();
  }
  pointerUp(event) {
    const down=this.down;if(!down)return;
    const dragged=this.dragging;this.down=null;this.dragging=false;this.field.classList.remove('is-orbiting','is-sculpting');
    if(down.target.hasPointerCapture(event.pointerId))down.target.releasePointerCapture(event.pointerId);
    if(dragged&&down.tool==='stretch')this.applySelection(true);
    else if(dragged&&down.tool==='select'){this.controls['sculpt-status'].textContent='选段已锁定 · 点击“拉伸”，拖动紫色山脉';this.sync();}
    else if(!dragged&&!down.edge){
      const hit=this.timeAt(event.clientX,event.clientY);
      if(hit){if(this.sculptClosed)this.setSculptOpen(true);this.terrain?.particles.emit(hit.point,{burst:true,energy:hit.energy});this.seek(hit.time,true);}
    }
    this.schedule();
  }
  cancelGesture(event) {
    const down=this.down;this.down=null;this.dragging=false;this.field.classList.remove('is-orbiting','is-sculpting');
    if(down&&down.tool!=='orbit'){
      this.selection=down.selection;this.audio.preview(down.selection);this.windowStart=down.windowStart;this.editJob++;this.controls['sculpt-audition'].disabled=false;this.audio.commit().catch(()=>{});this.sync();
      if(down.wasPlaying)this.play();
    }
    this.schedule();
  }
  edgeKey(event,edge) {
    if(!this.selection||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();this.pinWindow();const direction=event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:1,s=this.selection;
    if(this.tool==='stretch')this.previewSelection({...s,ratio:s.ratio+direction*.05});
    else this.previewSelection({...s,...(edge==='start'?{start:Math.min(s.end-.2,s.start+direction*.1)}:{end:s.end+direction*.1}),ratio:1,db:0});
    this.applySelection(false);
  }
  timeAt(clientX,clientY) {
    if (this.terrain) return this.terrain.pick(clientX, clientY);
    const time=clamp(this.windowStart+clientX/innerWidth*this.windowSize,0,this.duration());return {time,sourceTime:this.audio.inputTime(time),frequency:0};
  }
  showPointer() {
    if (!this.pointer || !this.ready || this.editor || this.dragging) { this.pointerUI.hidden = true; return; }
    const hit = this.timeAt(this.pointer.x, this.pointer.y);this.lastHit=hit;
    this.pointerUI.hidden = !hit; this.field.classList.toggle('over-terrain', !!hit);
    if (!hit) { delete this.field.dataset.hoverTime; return; }
    this.pointerUI.style.left = clamp(this.pointer.x, 60, innerWidth - 145) + 'px';
    this.pointerUI.style.top = clamp(this.pointer.y, 120, innerHeight - 140) + 'px';
    this.pointerUI.querySelector('span').textContent = clockText(hit.time) + (hit.frequency ? ' / ' + (hit.frequency >= 1000 ? (hit.frequency / 1000).toFixed(1) + ' kHz' : Math.round(hit.frequency) + ' Hz') : '');
    this.pointerUI.querySelector('small').textContent=this.sculptClosed?'点击编辑并跳播 · 拖动环视':this.tool==='stretch'?'拖动这段，改变时间与振幅':this.tool==='select'?'点击跳播 · 拖动选段':'点击，从这里继续';
    this.field.dataset.hoverTime = hit.time.toFixed(2);
  }
  updateGeometry(now) {
    if (!this.spectrum) return;
    const duration = this.duration(), cursor = this.audio.currentTime || 0;
    if(!this.windowPinned){
      if (!this.started && !this.reduced) { const span = Math.max(0, duration - this.windowSize); this.windowStart = span ? ((now - this.previewEpoch) / 1000 * .65) % span : 0; }
      else this.windowStart = cursor - this.windowSize * .2;
    }
    this.terrain.tickCamera(now);this.terrain.update({spectrum:this.spectrum,windowStart:this.windowStart,windowSize:this.windowSize,cursor,started:this.started,selection:this.selection,showSelection:!this.sculptClosed,inputTime:time=>this.audio.inputTime(time),outputTime:time=>this.audio.outputTime(time),duration});this.positionEdges();
  }
  drawFallback(now) {
    if(!this.data)return;
    if(!this.fallbackCanvas){this.fallbackCanvas=document.createElement('canvas');this.fallbackCanvas.id='music-bg-fallback';document.querySelector('.bg-wrap').appendChild(this.fallbackCanvas);this.fallbackContext=this.fallbackCanvas.getContext('2d');}
    const canvas=this.fallbackCanvas,ctx=this.fallbackContext;canvas.width=innerWidth;canvas.height=innerHeight;
    const duration=this.duration(),cursor=this.audio.currentTime||0;this.windowStart=this.started?cursor-this.windowSize*.38:0;
    ctx.strokeStyle='#8bf9d8';ctx.globalAlpha=.48;ctx.lineWidth=1;
    for(let i=0;i<600;i++){const time=this.windowStart+i/599*this.windowSize;if(time<0||time>duration)continue;const bin=clamp(Math.floor(time/duration*this.data.bins),0,this.data.bins-1),x=i/599*innerWidth,y=innerHeight*.56,gain=innerHeight*.25/this.data.peak;ctx.beginPath();ctx.moveTo(x,y-this.data.high[bin]*gain);ctx.lineTo(x,y-this.data.low[bin]*gain);ctx.stroke();}
  }
  frame(now) {
    this.raf=0;if(document.hidden||this.editor)return;
    if(now-this.lastFrame<32){this.schedule();return;}this.lastFrame=now;
    if(!document.body.classList.contains('notes-page')){if(this.terrain){this.updateGeometry(now);this.stories?.update(now);this.showPointer();this.terrain.render(now);}else this.drawFallback(now);}
    this.tickUI();if(!this.terrain)this.showPointer();
    if((!this.reduced&&!document.body.classList.contains('notes-page'))||!this.audio.paused)this.schedule();
  }
  schedule(){if(!this.raf&&!document.hidden&&!this.editor)this.raf=requestAnimationFrame(time=>this.frame(time));}
}
