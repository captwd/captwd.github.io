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

  // Keep the library controls in one place. The 3D scene only reads the selected topic.
  const libraryPreferences = { topic: '', year: '全部', query: '' };
  const bodySearch = { index: new Map(), promise: null, ready: false, failures: 0 };

  function setupNotesLibrary(posts) {
    const grid = document.getElementById('post-grid');
    const input = document.getElementById('notes-search');
    if (!grid || !input) return;
    if (grid.__notesLibraryState) {
      grid.__notesLibraryState.posts = posts;
      grid.__notesLibraryState.apply();
      return;
    }

    const years = document.getElementById('notes-year');
    const topicNav = document.getElementById('notes-topics');
    const status = document.getElementById('notes-results-status');
    const empty = document.getElementById('notes-empty');
    const headingCount = document.querySelector('.notes-library .journal-topic');
    const state = { posts, topic: libraryPreferences.topic, year: libraryPreferences.year, query: libraryPreferences.query };
    grid.__notesLibraryState = state;

    function startBodySearch() {
      if (bodySearch.promise) return;
      bodySearch.promise = Promise.all(state.posts.map(async (post) => {
        try {
          const response = await fetch(new URL(`posts/${post.slug}/`, root));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const page = new DOMParser().parseFromString(await response.text(), 'text/html');
          const article = page.querySelector('.article');
          if (!article) throw new Error('Missing article');
          article.querySelectorAll('script,style').forEach((node) => node.remove());
          return [post.slug, article.textContent.toLocaleLowerCase('zh-CN'), false];
        } catch {
          return [post.slug, '', true];
        }
      })).then((entries) => {
        bodySearch.index = new Map(entries.map(([slug, body]) => [slug, body]));
        bodySearch.failures = entries.filter(([, , failed]) => failed).length;
        bodySearch.ready = true;
        document.getElementById('post-grid')?.__notesLibraryState?.apply();
      });
    }

    state.apply = function () {
      const terms = state.query.trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
      if (terms.length) startBodySearch();
      const cards = grid.querySelectorAll('.card[data-post-slug]');
      const bySlug = new Map(state.posts.map((post) => [post.slug, post]));
      let shown = 0;
      for (const card of cards) {
        const post = bySlug.get(card.dataset.postSlug);
        if (!post) { card.hidden = true; continue; }
        const searchable = [post.title, post.excerpt, ...(post.tags || []), ...(post.categories || []), bodySearch.index.get(post.slug) || '']
          .join(' ').toLocaleLowerCase('zh-CN');
        const matches = (state.year === '全部' || String(post.date || '').slice(0, 4) === state.year)
          && (!state.topic || topicsFor(post).includes(state.topic))
          && terms.every((term) => searchable.includes(term));
        card.hidden = !matches;
        if (matches) shown += 1;
      }
      if (headingCount) headingCount.textContent = `${state.topic || '全部'} / ${shown} 篇`;
      if (empty) empty.hidden = shown > 0;
      if (status) {
        status.textContent = terms.length && !bodySearch.ready
          ? `正在检索正文 · 当前匹配 ${shown} 篇`
          : bodySearch.failures && terms.length
            ? `找到 ${shown} 篇 · ${bodySearch.failures} 篇正文暂时无法读取，标题与摘要仍可搜索`
            : `找到 ${shown} 篇笔记`;
      }
    };

    input.value = state.query;
    input.addEventListener('input', () => {
      state.query = libraryPreferences.query = input.value;
      state.apply();
    });

    if (years) {
      const yearValues = [...new Set(posts.map((post) => String(post.date || '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort().reverse();
      years.replaceChildren(new Option('全部年份', '全部'));
      yearValues.forEach((year) => years.add(new Option(year, year)));
      if (!yearValues.includes(state.year)) state.year = libraryPreferences.year = '全部';
      years.value = state.year;
      years.addEventListener('change', () => {
        state.year = libraryPreferences.year = years.value;
        state.apply();
      });
    }

    if (topicNav) {
      const topics = [...new Set(posts.flatMap(topicsFor))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      if (!topics.includes(state.topic)) state.topic = libraryPreferences.topic = '';
      const addButton = (label, topic) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.topic = topic;
        button.setAttribute('aria-pressed', String(topic === state.topic));
        topicNav.appendChild(button);
      };
      topicNav.replaceChildren();
      addButton('全部', '');
      topics.forEach((topic) => addButton(topic, topic));
      topicNav.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-topic]');
        if (!button) return;
        state.topic = libraryPreferences.topic = button.dataset.topic;
        topicNav.querySelectorAll('button[data-topic]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        state.apply();
      });
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
