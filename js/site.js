// 卡片渲染、笔记筛选与卡片 3D 倾斜
(function () {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = new URL('../', document.currentScript?.src || document.querySelector('script[src$="js/wave.js"]').src);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function updateAuthorSummary(posts) {
    const count = document.querySelector('[data-author-post-count]');
    const latestDate = document.querySelector('[data-author-latest-date]');
    if (!count || !latestDate) return;

    const datedPosts = posts.filter((post) => /^\d{4}-\d{2}-\d{2}$/.test(post.date || ''));
    const latest = datedPosts.reduce((newest, post) => post.date > newest.date ? post : newest, datedPosts[0]);
    count.textContent = String(posts.length);
    latestDate.textContent = latest ? latest.date.replaceAll('-', '.') : '暂无';
    if (latest) latestDate.dateTime = latest.date;
    else latestDate.removeAttribute('datetime');
  }

  function topicsFor(post) {
    const categories = Array.isArray(post.categories) ? post.categories : [];
    if (categories.length) return categories;
    return Array.isArray(post.tags) ? post.tags.slice(0, 1) : [];
  }

  function setupNotesLibrary(posts) {
    const grid = document.getElementById('post-grid');
    const input = document.getElementById('notes-search');
    if (!grid || !input) return;

    const years = document.getElementById('notes-year');
    const topicNav = document.getElementById('notes-topics');
    const status = document.getElementById('notes-results-status');
    const empty = document.getElementById('notes-empty');
    let state = grid.__notesLibraryState;

    if (!state) {
      state = {
        posts,
        activeTopic: '',
        textIndex: new Map(),
        bodyPromise: null,
        requestId: 0,
        timer: 0,
      };
      grid.__notesLibraryState = state;
      state.loadBodies = function () {
        if (state.bodyPromise) return state.bodyPromise;
        state.bodyPromise = Promise.all(state.posts.map(async (post) => {
          try {
            const response = await fetch(new URL(`posts/${post.slug}/`, root));
            if (!response.ok) return [post.slug, ''];
            const html = await response.text();
            const page = new DOMParser().parseFromString(html, 'text/html');
            const article = page.querySelector('.article');
            if (!article) return [post.slug, ''];
            article.querySelectorAll('script,style').forEach((node) => node.remove());
            return [post.slug, article.textContent.toLocaleLowerCase()];
          } catch {
            return [post.slug, ''];
          }
        })).then((entries) => {
          state.textIndex = new Map(entries);
        });
        return state.bodyPromise;
      };
      state.apply = async function () {
        const requestId = ++state.requestId;
        const query = input.value.trim().toLocaleLowerCase();
        const terms = query.split(/\s+/).filter(Boolean);
        if (terms.length && !state.bodyPromise) {
          if (status) status.textContent = '正在读取文章正文并搜索…';
          await state.loadBodies();
        }
        if (requestId !== state.requestId) return;

        const year = years?.value || '全部';
        const cards = [...grid.querySelectorAll('.card[data-post-slug]')];
        let shown = 0;
        for (const card of cards) {
          const post = state.posts.find((item) => item.slug === card.dataset.postSlug);
          if (!post) { card.hidden = true; continue; }
          const postTopics = topicsFor(post);
          const cardYear = String(post.date || '').slice(0, 4);
          const searchable = [post.title, post.excerpt, ...(post.tags || []), ...(post.categories || []), state.textIndex.get(post.slug) || '']
            .join(' ').toLocaleLowerCase();
          const matches = (year === '全部' || year === cardYear)
            && (!state.activeTopic || postTopics.includes(state.activeTopic))
            && terms.every((term) => searchable.includes(term));
          card.hidden = !matches;
          if (matches) shown += 1;
        }
        if (empty) empty.hidden = shown > 0;
        if (status) {
          const filtered = terms.length || year !== '全部' || Boolean(state.activeTopic);
          status.textContent = shown === 0
            ? '没有匹配的笔记。'
            : filtered ? `找到 ${shown} 篇笔记` : `共 ${shown} 篇笔记`;
        }
      };

      if (years) {
        const selected = years.value || '全部';
        const yearValues = [...new Set(posts.map((post) => String(post.date || '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort().reverse();
        years.replaceChildren(new Option('全部年份', '全部'));
        yearValues.forEach((year) => years.add(new Option(year, year)));
        if (yearValues.includes(selected)) years.value = selected;
        years.addEventListener('change', () => state.apply());
      }

      if (topicNav) {
        const topicValues = [...new Set(posts.flatMap(topicsFor))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const addTopicButton = (label, topic) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.dataset.topic = topic;
          button.setAttribute('aria-pressed', topic === state.activeTopic ? 'true' : 'false');
          topicNav.appendChild(button);
        };
        topicNav.replaceChildren();
        addTopicButton('全部', '');
        topicValues.forEach((topic) => addTopicButton(topic, topic));
        topicNav.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-topic]');
          if (!button) return;
          state.activeTopic = button.dataset.topic;
          topicNav.querySelectorAll('button[data-topic]').forEach((item) => item.setAttribute('aria-pressed', item === button ? 'true' : 'false'));
          state.apply();
        });
      }

      input.addEventListener('input', () => {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => state.apply(), 140);
      });
    } else {
      state.posts = posts;
    }
    state.apply();
  }

  window.renderCards = function () {
    const grid = document.getElementById('post-grid');
    if (grid && Array.isArray(window.POSTS)) {
      const posts = [...window.POSTS].sort((a, b) => b.date.localeCompare(a.date));
      updateAuthorSummary(posts);
      grid.innerHTML = posts.map((post) => {
        const tags = (post.tags || post.categories || []).slice(0, 3);
        const extra = Math.max(0, (post.tags || []).length - tags.length);
        return `
          <a class="card" href="${new URL(`posts/${post.slug}/`, root).href}" data-post-slug="${escapeHtml(post.slug)}">
            <div class="card-tags">${tags.map((tag) => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('')}${extra ? `<span class="card-tag">+${extra}</span>` : ''}</div>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="card-meta"><span>${escapeHtml(post.date)}</span><span class="card-more">阅读 →</span></div>
          </a>
        `;
      }).join('');
    }
    setupNotesLibrary(window.POSTS || []);
    document.dispatchEvent(new Event('blog:cards-ready'));

    if (!coarse && !reduceMotion) {
      document.querySelectorAll('.card').forEach((card) => {
        if (card.dataset.tiltBound) return;
        card.dataset.tiltBound = '1';
        let raf = 0;
        card.addEventListener('pointermove', (event) => {
          const rect = card.getBoundingClientRect();
          const nx = (event.clientX - rect.left) / rect.width - 0.5;
          const ny = (event.clientY - rect.top) / rect.height - 0.5;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              card.style.transform = `rotateY(${(nx * 7).toFixed(2)}deg) rotateX(${(-ny * 7).toFixed(2)}deg) translateZ(6px)`;
              raf = 0;
            });
          }
        });
        card.addEventListener('pointerleave', () => { card.style.transform = ''; });
      });
    }
  };

  window.renderCards();
})();
