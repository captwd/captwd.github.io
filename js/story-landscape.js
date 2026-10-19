import {TerrainStories} from './terrain-stories.js';
import {StoryJourney} from './story-journey.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const STORAGE = 'wave-notes-reading-v1';

// The original four listening cues remain authored. Give migrated notes distinct,
// stable points along the recording, so they do not all gather at its first phrase.
function withLandscapeCoordinates(posts) {
  const authored = posts.map((post) => post.landscape?.sound?.start).filter(Number.isFinite);
  const slots = Array.from({ length: 25 }, (_, index) => 8 + index * 8)
    .filter((time) => authored.every((fixed) => Math.abs(time - fixed) >= 4));
  const colors = ['#a1f9d5', '#a8d9f2', '#b9b3ed', '#e4c99b', '#93d9ca'];
  let next = 0;
  return posts.map((post, index) => {
    if (post.landscape?.sound) return post;
    const start = slots[next++] ?? Math.min(196, 16 + index * 7);
    const topic = post.categories?.[0] || post.tags?.[0] || '研究笔记';
    const label = post.title.length > 18 ? `${post.title.slice(0, 18)}…` : post.title;
    return { ...post, landscape: {
      label, region: topic, color: colors[index % colors.length],
      frequency: .18 + ((index * 7) % 10) * .068,
      theme: 'spectrum', autoRidge: true,
      sound: { start, end: Math.min(204.6, start + 5.8), title: '一段流动的山脊',
        note: '这篇笔记随这一段声音经过。点亮山脊，继续阅读。' },
    } };
  });
}

// The library and reading history share article identities with the immersive soundscape.
export class StoryLandscape {
  constructor({terrain,root, reduced = false, schedule}) {
    this.terrain=terrain;this.root=root;this.reduced=reduced;this.schedule=schedule;
    this.entries=[];this.topic='全部';this.current='';this.progress=0;this.scrollFrame=0;
    try { const saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');this.history=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}; } catch { this.history={}; }
    this.start().catch(()=>{});
  }
  async start() {
    if(!Array.isArray(window.POSTS))await import('./posts.js');
    if(!window.renderCards)await import('./site.js');
    // Keep the source order for the soundscape's spatial article layout; the library cards sort separately.
    this.posts=withLandscapeCoordinates(window.POSTS);
    this.entries=this.posts.map((post,index)=>({post,index,map:post.landscape||{label:post.title,region:post.tags[0],color:'#a1f9d5'},visible:true}));
    if(this.terrain){this.sceneLinks=new TerrainStories({terrain:this.terrain,entries:this.entries,root:this.root,reduced:this.reduced,schedule:this.schedule,progress:slug=>this.history[slug]?.progress||0});this.orbit=this.sceneLinks.orbit;}
    this.readingStatus=document.createElement('aside');this.readingStatus.id='story-reading-status';this.readingStatus.hidden=true;document.body.appendChild(this.readingStatus);
    this.journey=new StoryJourney(this);
    this.bind();this.onNavigate(location.href);this.schedule();
  }
  href(post,hash=''){return new URL(`posts/${post.slug}/${hash}`,this.root).href;}
  libraryHref(){return new URL('notes/',this.root).href;}
  bind(){
    document.addEventListener('blog:navigate',event=>this.onNavigate(event.detail?.url||location.href));
    document.addEventListener('blog:cards-ready',()=>this.applyFilter());
    document.addEventListener('click',event=>{
      const button=event.target.closest('.journal-filters [data-topic]');
      if(button){this.topic=button.dataset.topic||'全部';this.applyFilter();}
    });
    const scroll=()=>{if(this.scrollFrame)return;this.scrollFrame=requestAnimationFrame(()=>{this.scrollFrame=0;this.updateProgress();});};
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll);
    window.addEventListener('pagehide',()=>this.saveHistory(true));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.saveHistory(true);});
  }
  applyFilter(){
    if(!this.posts)return;
    this.entries.forEach(entry=>{
      const postTopics=entry.post.categories?.length?entry.post.categories:entry.post.tags?.slice(0,1)||[];
      entry.visible=this.topic==='全部'||postTopics.includes(this.topic);
    });
    document.querySelectorAll('.card[data-post-slug]').forEach(card=>{
      const entry=this.entries.find(item=>item.post.slug===card.dataset.postSlug);
      card.classList.toggle('story-visited',!!this.history[card.dataset.postSlug]);
      if(entry)card.style.setProperty('--story-color',entry.map.color);
    });
    this.orbit?.updateControls();
    this.updateResume();
  }
  updateResume(){
    const recent=this.posts.map(post=>({post,saved:this.history[post.slug]})).filter(item=>item.saved?.progress>.03&&item.saved.progress<.96).sort((a,b)=>b.saved.updatedAt-a.saved.updatedAt)[0];
    document.querySelectorAll('.reading-resume').forEach(link=>{
      link.hidden=!recent;
      if(recent){link.href=this.href(recent.post,recent.saved.heading?`#${recent.saved.heading}`:'');link.textContent=`继续上次 · ${recent.post.landscape?.label||recent.post.title} · ${Math.round(recent.saved.progress*100)}% ↗`;}
    });
    this.sceneLinks?.updateProgress();
  }
  onNavigate(url){
    this.saveHistory(true);this.current='';this.article=null;this.articleReady=false;this.headings=[];this.progress=0;
    const target=new URL(url,location.href),post=this.posts.find(item=>target.pathname.replace(/index\.html$/,'').endsWith(`/posts/${item.slug}/`));
    const home=!!document.querySelector('.sound-lab');
    const restored=this.journey.leave(home,target);
    document.body.classList.toggle('soundscape-home',home);document.body.classList.toggle('notes-page',!!document.querySelector('main.notes-library'));
    const nav=document.querySelector('.site-nav');
    if(nav&&!nav.querySelector('[data-notes-nav]')){const link=document.createElement('a');link.href=this.libraryHref();link.dataset.notesNav='';link.textContent='研究笔记';nav.prepend(link);}
    if(!home)document.dispatchEvent(new CustomEvent('blog:sculpt-request',{detail:{open:false}}));
    if(post&&document.querySelector('.article'))this.mountArticle(post,target);
    else this.readingStatus.hidden=true;
    this.applyFilter();this.sceneLinks?.setActive(home&&document.body.classList.contains('music-mode')&&document.body.classList.contains('sculpt-closed'));
    if(home&&target.hash.startsWith('#story-')){this.topic='全部';this.applyFilter();if(!restored)this.sceneLinks?.locate(decodeURIComponent(target.hash.slice(7)));}
    this.schedule();
  }
  mountArticle(post,url){
    this.current=post.slug;this.article=document.querySelector('.article');
    this.headings=[...this.article.querySelectorAll('h2')];
    this.headings.forEach((heading,index)=>{if(!heading.id)heading.id=`note-${post.slug}-${index+1}`;});
    const hero=document.querySelector('.article-hero'),map=post.landscape;
    const trail=document.createElement('nav');trail.className='article-trail';trail.setAttribute('aria-label','笔记目录与阅读进度');trail.style.setProperty('--story-color',map?.color||'#a1f9d5');
    trail.innerHTML=`<div class="article-trail-head"><a href="${this.libraryHref()}">← 研究笔记</a><span>${escapeHTML(map?.region||post.tags[0])} / ${escapeHTML(map?.label||post.title)}</span><output class="article-read-percent">0%</output></div><div class="article-read-track"><i></i></div><div class="article-chapters">${this.headings.map((heading,index)=>`<a href="#${escapeHTML(heading.id)}"><span>${String(index+1).padStart(2,'0')}</span>${escapeHTML(heading.textContent)}</a>`).join('')}</div>`;
    hero.appendChild(trail);this.trail=trail;
    const share=document.createElement('div');share.className='article-share';share.setAttribute('aria-label','分享文章');
    share.innerHTML='<button type="button" data-share-copy>复制链接</button><button type="button" data-share-native hidden>分享</button><span role="status" aria-live="polite"></span>';
    const nativeButton=share.querySelector('[data-share-native]');nativeButton.hidden=typeof navigator.share!=='function';
    share.addEventListener('click',async event=>{
      const copyButton=event.target.closest('[data-share-copy]');
      const native=event.target.closest('[data-share-native]');
      const shareUrl=new URL(`posts/${post.slug}/`,'https://captwd.github.io/').href;
      const status=share.querySelector('[role="status"]');
      if(copyButton){
        try{await navigator.clipboard.writeText(shareUrl);status.textContent='链接已复制';}
        catch{
          const field=document.createElement('textarea');field.value=shareUrl;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();
          const copied=document.execCommand('copy');field.remove();status.textContent=copied?'链接已复制':'复制失败，请手动复制文章地址';
        }
        window.setTimeout(()=>{if(status.isConnected)status.textContent='';},2200);
      }else if(native){
        try{await navigator.share({title:post.title,text:post.excerpt,url:shareUrl});}catch(error){if(error?.name!=='AbortError')status.textContent='暂时无法分享';}
      }
    });
    hero.appendChild(share);
    const returnToPeak=document.createElement('a');returnToPeak.className='article-scene-link';returnToPeak.href=`${this.root.href}#story-${post.slug}`;returnToPeak.textContent='在声音山脉里，定位这篇笔记 ↗';trail.appendChild(returnToPeak);
    this.journey.mount(post);
    const siblings=this.posts.filter(item=>item.slug!==post.slug).sort((a,b)=>Number(b.landscape?.region===map?.region)-Number(a.landscape?.region===map?.region)).slice(0,2);
    const related=document.createElement('section');related.className='story-related';related.setAttribute('aria-label','继续阅读研究笔记');
    related.innerHTML=`<div class="story-related-head"><span>CONTINUE READING</span><a href="${this.libraryHref()}">全部研究笔记 ↗</a></div><h2>下一篇笔记。</h2><div>${siblings.map(item=>`<a href="${this.href(item)}"><small>${escapeHTML(item.landscape?.region||item.tags[0])}</small><strong>${escapeHTML(item.title)}</strong><span>继续阅读 ↗</span></a>`).join('')}</div>`;
    document.querySelector('.article-wrap').appendChild(related);
    this.readingStatus.innerHTML=`<a href="${this.root.href}#story-${post.slug}"><span class="reading-status-dot" style="--story-color:${map?.color||'#a1f9d5'}"></span><span>${escapeHTML(map?.label||post.title)}</span><output>0%</output><small>回到这座山峰 ↗</small></a>`;this.readingStatus.hidden=false;
    const saved=this.history[post.slug];this.history[post.slug]={progress:saved?.progress||0,heading:saved?.heading||'',updatedAt:Date.now()};
    // The page swap resets scroll after its navigate event; wait for that before recording progress.
    const restoreReading=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(this.current!==post.slug||!this.article?.isConnected)return;
      if(url.hash){const id=decodeURIComponent(url.hash.slice(1));document.getElementById(id)?.scrollIntoView({behavior:'instant',block:'start'});}
      this.articleReady=true;this.updateProgress();
    }));
    if(document.readyState==='complete')restoreReading();else window.addEventListener('load',restoreReading,{once:true});
  }
  updateProgress(){
    if(!this.articleReady||!this.current||!this.article?.isConnected)return;
    const rect=this.article.getBoundingClientRect(),start=scrollY+rect.top-innerHeight*.35,end=scrollY+rect.bottom-innerHeight*.65;
    this.progress=clamp((scrollY-start)/Math.max(1,end-start));
    let currentHeading='';this.headings.forEach(heading=>{if(heading.getBoundingClientRect().top<innerHeight*.45)currentHeading=heading.id;});
    const percent=Math.round(this.progress*100);
    this.trail.querySelector('.article-read-percent').textContent=`${percent}%`;this.trail.querySelector('.article-read-track i').style.width=`${percent}%`;
    this.trail.querySelectorAll('.article-chapters a').forEach(link=>link.classList.toggle('active',link.hash===`#${currentHeading}`));
    this.journey.chapterChanged(currentHeading,this.progress);this.schedule();
    this.readingStatus.querySelector('output').textContent=`${percent}%`;
    const saved=this.history[this.current]||{},furthest=Math.max(saved.progress||0,this.progress);
    this.history[this.current]={progress:furthest,heading:this.progress>=(saved.progress||0)?currentHeading:saved.heading||'',updatedAt:Date.now()};this.saveHistory();
  }
  saveHistory(force=false){
    if(!force&&performance.now()-(this.lastSave||0)<400)return;
    this.lastSave=performance.now();try{localStorage.setItem(STORAGE,JSON.stringify(this.history));}catch{}
  }
  update(now){this.sceneLinks?.update(now,{active:document.body.classList.contains('soundscape-home')&&document.body.classList.contains('music-mode'),editing:!document.body.classList.contains('sculpt-closed'),current:this.current});this.journey?.frame(now);}
}

