// A session-only reward for one complete, uninterrupted pass. There is no preview or URL bypass.
export class ListeningFinale{
  constructor({audio,canStart}){
    this.audio=audio;this.canStart=canStart;this.pending=null;this.run=null;
    this.element=document.createElement('section');this.element.id='listening-finale';this.element.hidden=true;this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');document.body.appendChild(this.element);
    audio.media.addEventListener('playing',()=>{if(!audio.bufferMode)this.begin();});
    audio.addEventListener('play',()=>{if(audio.bufferMode)this.begin();});
    audio.addEventListener('pause',()=>{if(!(audio.bufferMode?audio.finishing:audio.media.ended))this.invalidate();});
    audio.addEventListener('seek',()=>this.invalidate());
    audio.addEventListener('error',()=>this.invalidate());
    audio.media.addEventListener('seeking',()=>{
      // A rewind requested before preparePlay may finish asynchronously. Active playback never permits a seek.
      if(this.run||(this.pending&&audio.currentTime>.02))this.invalidate();
    });
    for(const name of ['waiting','stalled'])audio.media.addEventListener(name,()=>{if(this.run)this.invalidate();});
    for(const name of ['emptied','error'])audio.media.addEventListener(name,()=>this.invalidate());
    audio.media.addEventListener('ratechange',()=>this.invalidate());
    audio.media.addEventListener('volumechange',()=>{if(this.run||this.pending)this.invalidate();});
    const intervene=event=>{
      if(!event.isTrusted)return;
      if(this.run||this.pending)this.invalidate();
      this.dismiss();
    };
    // Cursor movement is decorative; intentional page interactions cancel the current attempt.
    for(const name of ['pointerdown','keydown','wheel','input','change','contextmenu','click'])document.addEventListener(name,intervene,{capture:true,passive:true});
    document.addEventListener('blog:navigate',()=>{this.invalidate();this.dismiss();});
    document.addEventListener('blog:mode',event=>{if(event.detail?.editor){this.invalidate();this.dismiss();}});
  }
  preparePlay(){
    this.pending=null;
    const audio=this.audio,duration=audio.duration;
    if(!audio.paused||this.run||!this.canStart()||!Number.isFinite(duration)||duration<=0||audio.currentTime!==0||audio.media.playbackRate!==1)return;
    this.pending={source:audio.src,version:audio.version,duration,volume:audio.volume,muted:audio.media.muted};
  }
  begin(){
    const pending=this.pending;this.pending=null;if(!pending||this.run||!this.canStart())return;
    const audio=this.audio,time=audio.currentTime,duration=audio.duration;
    if(!Number.isFinite(duration)||duration<=0||time<0||time>duration+.02||audio.src!==pending.source||audio.version!==pending.version)return;
    const now=performance.now();this.run={...pending,duration,start:now-time*1000,lastClock:now,lastTime:time,covered:time};
  }
  invalidate(){this.pending=null;this.run=null;}
  sample(){
    const run=this.run;if(!run)return;
    const audio=this.audio,time=audio.currentTime,now=performance.now(),elapsed=(now-run.lastClock)/1000,delta=time-run.lastTime;
    if(audio.src!==run.source||audio.version!==run.version||Math.abs(audio.duration-run.duration)>.02||audio.media.playbackRate!==1||audio.volume!==run.volume||audio.media.muted!==run.muted||delta<-.02||delta>elapsed+.35||(audio.paused&&time<run.duration-.04)||(audio.bufferMode&&audio.ctx?.state!=='running')){
      this.invalidate();return;
    }
    run.covered+=Math.max(0,delta);run.lastTime=time;run.lastClock=now;
  }
  finish(){
    // Called only by the audio engine's natural ended event, never by a progress-slider threshold.
    this.sample();const run=this.run;
    const qualified=!!run&&this.canStart()&&this.audio.currentTime>=run.duration-.04&&run.covered>=run.duration-.08&&(performance.now()-run.start)/1000>=run.duration-.25;
    this.invalidate();
    if(!qualified)return false;
    this.element.replaceChildren();
    const first=document.createElement('span'),second=document.createElement('span');first.textContent='一曲终了，';second.textContent='你还在等什么呢';this.element.append(first,second);
    this.element.hidden=false;document.body.classList.add('listening-complete');document.dispatchEvent(new CustomEvent('blog:finale',{detail:{active:true}}));return true;
  }
  dismiss(){if(this.element.hidden)return;this.element.hidden=true;this.element.replaceChildren();document.body.classList.remove('listening-complete');document.dispatchEvent(new CustomEvent('blog:finale',{detail:{active:false}}));}
}
