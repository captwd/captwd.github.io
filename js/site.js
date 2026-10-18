// 卡片渲染 + 卡片 3D 倾斜（CSS 3D 点缀）
// renderCards 暴露为全局：页面切换（SPA 置换）后需要重新渲染网格并重绑倾斜
(function () {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = new URL('../', document.currentScript?.src || document.querySelector('script[src$="js/wave.js"]').src);

  window.renderCards = function () {
    const grid = document.getElementById('post-grid');
    if (grid && Array.isArray(window.POSTS)) {
      grid.innerHTML = window.POSTS.map((p) => `
        <a class="card" href="${new URL(`posts/${p.slug}/`,root).href}" data-post-slug="${p.slug}">
          <div class="card-tags">${p.tags.map((t) => `<span class="card-tag">${t}</span>`).join('')}</div>
          <h3>${p.title}</h3>
          <p>${p.excerpt}</p>
          <div class="card-meta"><span>${p.date}</span><span class="card-more">阅读 →</span></div>
        </a>
      `).join('');
    }
    document.dispatchEvent(new Event('blog:cards-ready'));

    if (!coarse && !reduceMotion) {
      document.querySelectorAll('.card').forEach((card) => {
        if (card.dataset.tiltBound) return;
        card.dataset.tiltBound = '1';
        let raf = 0;
        card.addEventListener('pointermove', (ev) => {
          const r = card.getBoundingClientRect();
          const nx = (ev.clientX - r.left) / r.width - 0.5;
          const ny = (ev.clientY - r.top) / r.height - 0.5;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              card.style.transform =
                `rotateY(${(nx * 7).toFixed(2)}deg) rotateX(${(-ny * 7).toFixed(2)}deg) translateZ(6px)`;
              raf = 0;
            });
          }
        });
        card.addEventListener('pointerleave', () => {
          card.style.transform = '';
        });
      });
    }
  };

  window.renderCards();
})();
