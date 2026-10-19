// 页面切换特效 v6 —— SPA 式内容置换，波形场全程不断
// 出场统一碎裂状（clip-path 多边形碎片），按模式飞行：
//   ⬇️ 坠落：碎片带旋转加速下坠出屏（CSS transition）
//   🌀 漩涡：碎片沿弧线绕中心螺旋卷入（WAAPI 多关键帧真螺旋）
// 入场统一碎片拼合（assembleIn）：坠落=碎片从上方落入拼合；漩涡=从原点旋出拼合
// 性能红线：批量读 rect 再写样式 / 克隆分帧创建 / 容器(.article)只做廉价淡入淡出 /
//          出场克隆提前清理 / fetch 预取与出场动画重叠
// 兜底：fetch 失败 / reduced-motion / 外链 / 修饰键与中键点击 → 原生导航
(function () {
  const SWAP_SELECTORS = ['.hero', 'main.content', '.article-hero', '.article-wrap', 'footer.site-foot'];
  const MODE_KEY = 'fx-mode';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let mode = 'random';
  try { mode = localStorage.getItem(MODE_KEY) || 'random'; } catch (e) {}
  let navLock = false;
  let renderedPage=location.pathname+location.search;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pickMode = () => (mode === 'random' ? (Math.random() < 0.5 ? 'drop' : 'vortex') : mode);

  // ---------- 参与动画的内容元素 ----------
  function collectTargets(root) {
    const els = [];
    for (const sel of SWAP_SELECTORS) {
      root.querySelectorAll(sel).forEach((region) => {
        if (region.tagName === 'FOOTER') { els.push(region); return; }
        for (const child of region.children) {
          if (child.classList.contains('card-grid')) {
            child.querySelectorAll('.card').forEach((c) => els.push(c));
          } else if (child.classList.contains('article')) {
            // 面板容器太大，不做碎片克隆（性能），只做廉价淡入淡出；碎片化交给子元素
            child.dataset.fxCheap = '1';
            els.push(child);
            for (const inner of child.children) els.push(inner);
          } else {
            els.push(child);
          }
        }
      });
    }
    return els;
  }

  // 批量读 rect：一次强制布局，杜绝逐元素读写交错
  function readRects(els) {
    const map = new Map();
    els.forEach((el) => map.set(el, el.getBoundingClientRect()));
    return map;
  }

  // ---------- 碎片化：切 + 按 mode 飞行 ----------
  // 元素按"中心 + 边缘抖动点"扇形切成三角碎片；per = 每边采样点数（碎片数 = 4*per）
  function fragmentize(el, r, per, m, origin) {
    el.style.visibility = 'hidden';
    const clones = [];
    const border = [];
    const sides = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]];
    sides.forEach(([x1, y1, x2, y2]) => {
      for (let k = 0; k < per; k++) {
        const t = (k + 0.15 + Math.random() * 0.7) / per;
        border.push([
          (x1 + (x2 - x1) * Math.min(t, 0.999) + (Math.random() - 0.5) * 0.05) * 100,
          (y1 + (y2 - y1) * Math.min(t, 0.999) + (Math.random() - 0.5) * 0.05) * 100,
        ]);
      }
    });
    const cx = 50 + (Math.random() - 0.5) * 14;
    const cy = 50 + (Math.random() - 0.5) * 14;
    for (let k = 0; k < border.length; k++) {
      const p1 = border[k], p2 = border[(k + 1) % border.length];
      const c = el.cloneNode(true);
      c.classList.add('fx-shard');
      const poly =
        `${cx.toFixed(1)}% ${cy.toFixed(1)}%,${p1[0].toFixed(1)}% ${p1[1].toFixed(1)}%,${p2[0].toFixed(1)}% ${p2[1].toFixed(1)}%`;
      c.style.cssText =
        `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;` +
        `clip-path:polygon(${poly});-webkit-clip-path:polygon(${poly});` +
        `backdrop-filter:none;-webkit-backdrop-filter:none;` +
        `z-index:80;pointer-events:none;will-change:transform,opacity;transition:none;opacity:1;`;
      const px = ((cx + p1[0] + p2[0]) / 3 / 100) * r.width - r.width / 2;
      const py = ((cy + p1[1] + p2[1]) / 3 / 100) * r.height - r.height / 2;

      document.body.appendChild(c);
      clones.push(c);

      if (m === 'drop') {
        const dx = Math.round(px * (1.1 + Math.random() * 0.6));
        const dy = Math.round(innerHeight * (0.5 + Math.random() * 0.35));
        const rot = Math.round(Math.random() * 360 - 180);
        const delay = Math.round(Math.random() * 120);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          c.style.transition =
            `transform .7s cubic-bezier(.45,.05,.75,.5) ${delay}ms, opacity .42s ease-in ${delay + 180}ms`;
          c.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
          c.style.opacity = '0';
        }));
      } else {
        // 漩涡：WAAPI 三关键帧沿弧线绕原点螺旋卷入
        const scx = r.left + r.width / 2 + px;
        const scy = r.top + r.height / 2 + py;
        const ang0 = Math.atan2(scy - origin.y, scx - origin.x);
        const d0 = Math.hypot(scx - origin.x, scy - origin.y);
        const swirl = 2.2 + Math.random() * 1.4;
        const swirlDeg = Math.round(swirl * 180 / Math.PI);
        const at = (t) => {
          const ang = ang0 + swirl * t;
          const d = d0 * (1 - 0.94 * t);
          return [
            Math.round(origin.x + Math.cos(ang) * d - scx),
            Math.round(origin.y + Math.sin(ang) * d - scy),
          ];
        };
        const [x1f, y1f] = at(0.45);
        const [x2f, y2f] = at(1);
        const kf = [
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, easing: 'cubic-bezier(.5,0,.75,.45)' },
          { transform: `translate(${x1f}px, ${y1f}px) rotate(${Math.round(swirlDeg * 0.45)}deg) scale(0.5)`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(.55,.1,.8,.5)' },
          { transform: `translate(${x2f}px, ${y2f}px) rotate(${swirlDeg + Math.round(Math.random() * 120)}deg) scale(0.04)`, opacity: 0 },
        ];
        const delay = Math.round(Math.min(d0 * 0.35, 280) + Math.random() * 60);
        c.animate(kf, { duration: 720, delay, fill: 'both' });
      }
    }
    return clones;
  }

  // 容器/小元素：不克隆，廉价飞出
  function cheapOut(el, r, origin) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const delay = Math.round(Math.random() * 100);
    el.style.willChange = 'transform, opacity';
    el.style.transition =
      `transform .45s ease-in ${delay}ms, opacity .35s ease-in ${delay + 60}ms`;
    el.style.transform = origin
      ? `translate(${Math.round((origin.x - cx) * 0.85)}px, ${Math.round((origin.y - cy) * 0.85)}px) rotate(120deg) scale(0.08)`
      : `translate(${Math.round(Math.random() * 80 - 40)}px, ${Math.round(innerHeight * 0.35 + Math.random() * 120)}px) rotate(6deg)`;
    el.style.opacity = '0';
  }

  // ---------- 出场 ⬇️ 坠落（碎片下坠） ----------
  function dropOut(els, first) {
    const rects = readRects(els);
    const set = new Set(els);
    let budget = 10;
    const order = (first && set.has(first) && rects.get(first).width > 60)
      ? [first, ...els.filter((e) => e !== first)]
      : els.slice();
    const clones = [];
    order.forEach((el, i) => {
      const r = rects.get(el);
      const isFirst = i === 0 && set.has(el);
      if (el.dataset.fxCheap || r.width < 60 || r.height < 30) { cheapOut(el, r, null); return; }
      if (isFirst || budget > 0) {
        budget--;
        clones.push(...fragmentize(el, r, isFirst ? 3 : 2, 'drop'));
      } else {
        cheapOut(el, r, null);
      }
    });
    setTimeout(() => clones.forEach((c) => c.remove()), 1250);
    return 840;
  }

  // ---------- 出场 🌀 漩涡（碎片螺旋卷入） ----------
  function vortexOut(els, ox, oy, first) {
    const rects = readRects(els);
    const set = new Set(els);
    const origin = { x: ox, y: oy };
    let budget = 10;
    const order = (first && set.has(first) && rects.get(first).width > 60)
      ? [first, ...els.filter((e) => e !== first)]
      : els.slice();
    const clones = [];
    order.forEach((el, i) => {
      const r = rects.get(el);
      const isFirst = i === 0 && set.has(el);
      if (el.dataset.fxCheap || r.width < 60 || r.height < 30) { cheapOut(el, r, origin); return; }
      if (isFirst || budget > 0) {
        budget--;
        clones.push(...fragmentize(el, r, isFirst ? 3 : 2, 'vortex', origin));
      } else {
        cheapOut(el, r, origin);
      }
    });
    setTimeout(() => clones.forEach((c) => c.remove()), 1450);
    return 1000;
  }

  function spawnVortexCore(x, y, goingOut) {
    const c = document.createElement('div');
    c.className = 'vortex-core ' + (goingOut ? 'vortex-out' : 'vortex-in');
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1700);
  }

  // ---------- 入场：碎片拼合（两种模式共用） ----------
  // ⬇️ 碎片从上方落入拼合（与出场同向，视觉连续）；🌀 碎片从原点旋出拼合
  function assembleIn(els, m, origin) {
    const rects = readRects(els); // 先批量读
    const clones = [];
    let budget = 44;
    const jobs = [];
    els.forEach((el, i) => {
      const r = rects.get(el);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const delay = 40 + (i % 14) * 65 + Math.random() * 40;
      let startT;
      if (m === 'vortex') {
        const ang = Math.atan2(cy - origin.y, cx - origin.x) - 2.4;
        const dist = Math.hypot(cx - origin.x, cy - origin.y) * 0.55 + 60;
        startT =
          `translate(${Math.round(origin.x + Math.cos(ang) * dist - cx)}px, ` +
          `${Math.round(origin.y + Math.sin(ang) * dist - cy)}px) rotate(${-260}deg) scale(0.12)`;
      } else {
        startT =
          `translate(${Math.round(Math.random() * 80 - 40)}px, ` +
          `-${Math.round(innerHeight * (0.35 + Math.random() * 0.35))}px) rotate(${Math.round(Math.random() * 90 - 45)}deg)`;
      }
      const small = !!el.dataset.fxCheap || r.width < 60 || r.height < 30 || budget <= 0;
      if (!small) budget -= 4;
      jobs.push({ el, r, small, startT, delay, slot: i % 14 });
    });

    // 容器/小元素：无克隆成本，立即写样式
    jobs.forEach(({ el, small, startT, delay }) => {
      if (!small) return;
      el.style.transition = 'none';
      el.style.willChange = 'transform, opacity';
      el.style.opacity = '0';
      el.style.transform = startT;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = `transform .55s cubic-bezier(.16,1,.3,1) ${delay}ms, opacity .45s ease ${delay}ms`;
        el.style.transform = '';
        el.style.opacity = '1';
      }));
    });

    // 分片元素：克隆按槽位错峰创建（(slot)*45ms 恒早于其动画 delay），不同帧爆 cloneNode
    jobs.forEach(({ el, r, small, startT, delay, slot }) => {
      if (small) return;
      el.style.visibility = 'hidden';
      const corners = [[-2, -2], [102, -2], [102, 102], [-2, 102]];
      setTimeout(() => {
        if (!el.isConnected) return;
        for (let k = 0; k < 4; k++) {
          const p1 = corners[k], p2 = corners[(k + 1) % 4];
          const c = el.cloneNode(true);
          c.classList.add('fx-shard');
          c.style.cssText =
            `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;` +
            `clip-path:polygon(50% 50%,${p1[0]}% ${p1[1]}%,${p2[0]}% ${p2[1]}%);` +
            `-webkit-clip-path:polygon(50% 50%,${p1[0]}% ${p1[1]}%,${p2[0]}% ${p2[1]}%);` +
            `backdrop-filter:none;-webkit-backdrop-filter:none;` +
            `z-index:80;pointer-events:none;will-change:transform,opacity;transition:none;opacity:0;` +
            `transform:${startT};`;
          document.body.appendChild(c);
          clones.push(c);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            c.style.transition =
              `transform .68s cubic-bezier(.16,1,.3,1) ${delay}ms, opacity .4s ease ${delay}ms`;
            c.style.transform = 'translate(0, 0) rotate(0deg) scale(1)';
            c.style.opacity = '1';
          }));
        }
      }, slot * 45);
    });

    const total = 40 + 14 * 65 + 800;
    setTimeout(() => {
      clones.forEach((c) => c.remove());
      els.forEach((el) => { el.style.cssText = ''; });
    }, total);
    return total;
  }

  // ---------- 内容置换（fetch + DOM 替换） ----------
  async function swapContent(url, textPromise) {
    let html;
    try {
      html = await (textPromise || fetch(url, { headers: { 'X-Requested-With': 'onetake-transition' } }).then((r) => {
        if (!r.ok) throw new Error('fetch ' + r.status);
        return r.text();
      }));
    } catch (e) {
      throw new Error('prefetch: ' + e.message);
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const collect = (root) => {
      const regions = [];
      for (const sel of SWAP_SELECTORS) {
        root.querySelectorAll(sel).forEach((el) => {
          // 出场动画的碎片克隆还挂在 body 上（如 footer 被切碎），不能算区域
          if (!el.classList.contains('fx-shard')) regions.push(el);
        });
      }
      // 按文档顺序排（首页: hero+main / 文章页: article-hero+article-wrap，数量恒等）
      regions.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      return regions;
    };
    const oldRegions = collect(document);
    const newRegions = collect(doc);
    if (!oldRegions.length || oldRegions.length !== newRegions.length) {
      throw new Error('region mismatch ' + oldRegions.length + '/' + newRegions.length);
    }
    for (let i = 0; i < oldRegions.length; i++) {
      oldRegions[i].replaceWith(document.adoptNode(newRegions[i]));
    }
    document.title = doc.title;
    const seoSelector='meta[name="description"],meta[name^="twitter:"],meta[property^="og:"],meta[property^="article:"],link[rel="canonical"],link[rel="alternate"][type]';
    document.head.querySelectorAll(seoSelector).forEach(node=>node.remove());
    doc.head.querySelectorAll(seoSelector).forEach(node=>document.head.appendChild(node.cloneNode(true)));
    const renderedURL=new URL(url,location.href);renderedPage=renderedURL.pathname+renderedURL.search;
    const oldHeader = document.querySelector('.site-head'), newHeader = doc.querySelector('.site-head');
    if (oldHeader && newHeader) oldHeader.replaceWith(document.adoptNode(newHeader));
    document.body.classList.toggle('ambient', doc.body.classList.contains('ambient'));
    for(const name of ['notes-page','soundscape-home'])document.body.classList.toggle(name,doc.body.classList.contains(name));
    // 首页卡片是 JS 渲染的，置换回来的空网格要重灌
    if (window.renderCards) window.renderCards();
    document.dispatchEvent(new CustomEvent('blog:navigate', {detail: {url: new URL(url, location.href).href}}));
  }

  async function quietSwap(url, textPromise, push, preparation) {
    try {
      if(preparation){const [html]=await Promise.all([textPromise,preparation]);textPromise=Promise.resolve(html);}
      await swapContent(url, textPromise);
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (push) history.pushState({ fx: true }, '', url);
    } catch (error) { location.href = url; }
    finally { document.documentElement.classList.remove('fx-busy'); navLock = false; }
  }

  // ---------- 主流程 ----------
  document.addEventListener('click', (ev) => {
    if (navLock) { ev.preventDefault(); return; }
    if (ev.defaultPrevented || ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    if (url.href === location.href) return;

    navLock = true;
    ev.preventDefault();
    document.documentElement.classList.add('fx-busy');

    // fetch 预取：与出场动画并行，置换时页面内容已在手上
    const textPromise = fetch(url.href, { headers: { 'X-Requested-With': 'onetake-transition' } })
      .then((r) => { if (!r.ok) throw new Error('fetch ' + r.status); return r.text(); });
    const waits=[],story=a.closest('.story-orbit-card,.ridge-note');
    if(story)document.dispatchEvent(new CustomEvent('blog:story-open',{detail:{slug:story.dataset.postSlug,waitUntil:promise=>waits.push(promise)}}));
    if(waits.length){quietSwap(url.href,textPromise,true,Promise.all(waits));return;}
    // Module switches keep the live terrain and use a direct swap, without fragmenting a full viewport.
    if (reduceMotion || document.body.classList.contains('scene-reading') || document.body.classList.contains('soundscape-home') || document.body.classList.contains('notes-page') || url.hash.startsWith('#story-') || /\/notes\/(?:index\.html)?$/.test(url.pathname)) { quietSwap(url.href, textPromise, true); return; }

    (async () => {
      const m = pickMode();
      const first = a.closest('.card') || a;
      const ox = ev.clientX || innerWidth / 2;
      const oy = ev.clientY || innerHeight / 2;
      const origin = { x: ox, y: oy };
      const els = collectTargets(document);
      try {
        let outMs;
        if (m === 'drop') outMs = dropOut(els, first);
        else { outMs = vortexOut(els, ox, oy, first); spawnVortexCore(ox, oy, true); }
        await sleep(outMs - 250); // 提前置换：旧碎片还在飞时新碎片就开始拼合，消除"停一拍"
        await swapContent(url.href, textPromise);
        window.scrollTo({ top: 0, behavior: 'instant' });
        history.pushState({ fx: true }, '', url.href);
        const newEls = collectTargets(document);
        const entryTotal = assembleIn(newEls, m, origin);
        try { sessionStorage.setItem('fx-entry', String(entryTotal)); } catch (e) {}
        if (m !== 'drop') spawnVortexCore(ox, oy, false);
      } catch (e) {
        try { sessionStorage.setItem('fx-err', String(e && e.stack || e)); } catch (e2) {}
        location.href = url.href; // fetch 失败等 → 原生跳转
        return;
      }
      await sleep(1900);
      document.documentElement.classList.remove('fx-busy');
      navLock = false;
    })();
  });

  // 后退/前进：快速淡出 → 置换 → 碎片拼合
  window.addEventListener('popstate', () => {
    if(location.pathname+location.search===renderedPage)return;
    if (navLock) return;
    navLock = true;
    if (reduceMotion || document.body.classList.contains('scene-reading') || document.body.classList.contains('soundscape-home') || document.body.classList.contains('notes-page') || /\/notes\/(?:index\.html)?$/.test(location.pathname)) { quietSwap(location.href, null, false); return; }
    (async () => {
      try {
        const els = collectTargets(document);
        els.forEach((el) => {
          el.style.transition = 'opacity .24s ease';
          el.style.opacity = '0';
        });
        await sleep(260);
        await swapContent(location.href, null);
        window.scrollTo({ top: 0, behavior: 'instant' });
        els.forEach((el) => { el.style.cssText = ''; });
        assembleIn(collectTargets(document), 'drop', null);
      } catch (e) {
        location.reload();
        return;
      }
      await sleep(1600);
      navLock = false;
    })();
  });

  // ---------- 模式按钮 ----------
  if (reduceMotion) return;
  const btn = document.createElement('button');
  btn.id = 'fx-mode';
  btn.type = 'button';
  btn.setAttribute('aria-label', '切换特效模式');
  const META = { random: ['🎲', '随机'], drop: ['⬇️', '坠落'], vortex: ['🌀', '漩涡'] };
  const ORDER = ['random', 'drop', 'vortex'];
  if (!ORDER.includes(mode)) mode = 'random';
  function renderBtn() {
    const [icon, label] = META[mode] || META.random;
    btn.innerHTML = `<span class="fx-icon">${icon}</span><span>${label}</span>`;
  }
  btn.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length] || 'random';
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    renderBtn();
  });
  renderBtn();
  document.body.appendChild(btn);
})();
