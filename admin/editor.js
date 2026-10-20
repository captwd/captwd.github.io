(() => {
  'use strict';

  const owner = 'captwd';
  const repositories = [
    { name: 'wave', branch: 'main', label: '源仓库' },
    { name: 'captwd.github.io', branch: 'gh-pages', label: '发布仓库' },
  ];
  const posts = [...(window.POSTS || [])].sort((a, b) => b.date.localeCompare(a.date));
  const authForm = document.getElementById('auth-form');
  const tokenField = document.getElementById('github-token');
  const authPanel = document.getElementById('auth-panel');
  const workPanel = document.getElementById('work-panel');
  const picker = document.getElementById('article-picker');
  const frame = document.getElementById('article-frame');
  const editArea = document.getElementById('edit-area');
  const loadButton = document.getElementById('load-article');
  const publishButton = document.getElementById('publish-article');
  const previewButton = document.getElementById('toggle-preview');
  const status = document.getElementById('editor-status');
  const articlePattern = /(<article\b[^>]*class=["'][^"']*\barticle\b[^"']*["'][^>]*>)([\s\S]*?)(<\/article>)/i;
  let token = '';
  let current = null;
  let preview = false;
  let busy = false;
  let frameReady = false;

  function say(message, kind = '') {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function utf8FromBase64(value) {
    const binary = atob(value.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function base64FromUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return btoa(binary);
  }

  async function github(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.message === 'string' ? data.message : `HTTP ${response.status}`;
      throw new Error(`GitHub ${response.status}：${detail}`);
    }
    return data;
  }

  function pathFor(post) {
    if (!posts.includes(post) || !/^[a-z0-9-]+$/.test(post.slug)) throw new Error('文章地址不合法');
    return `posts/${post.slug}/index.html`;
  }

  function contentPath(repo, post) {
    return `/repos/${owner}/${repo.name}/contents/${pathFor(post)}?ref=${encodeURIComponent(repo.branch)}`;
  }

  function articleBody(html) {
    const match = html.match(articlePattern);
    if (!match) throw new Error('文章页面里没有找到正文，已停止操作');
    return match[2];
  }

  function normalizedBody(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const article = doc.querySelector('article.article');
    if (!article) throw new Error('文章页面里没有找到正文，已停止操作');
    return article.innerHTML;
  }

  function replaceBody(html, body) {
    if (!articlePattern.test(html)) throw new Error('文章页面里没有找到正文，已停止操作');
    return html.replace(articlePattern, (_all, open, _old, close) => open + body + close);
  }

  function editorArticle() {
    return frame.contentDocument?.querySelector('article.article');
  }

  function validateBody(body) {
    const doc = new DOMParser().parseFromString(`<article>${body}</article>`, 'text/html');
    const article = doc.querySelector('article');
    if (article.querySelector('script,iframe,object,embed,form,base,meta,link')) {
      throw new Error('正文中包含不允许发布的嵌入或脚本');
    }
    for (const element of article.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (/^on/i.test(attribute.name) || (/^(href|src|xlink:href)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))) {
          throw new Error('正文中包含不安全的链接或事件属性');
        }
      }
    }
  }

  function setBusy(value) {
    busy = value;
    authForm.querySelector('button').disabled = value;
    loadButton.disabled = value;
    picker.disabled = value;
    publishButton.disabled = value || !current || !frameReady;
    if (!value && current && frameReady) markEdited();
  }

  function markEdited() {
    if (!current || !frameReady) return;
    const body = editorArticle()?.innerHTML || '';
    const changed = current.files.some((file) => normalizedBody(file.html) !== body);
    publishButton.textContent = changed ? '发布修改' : '已是最新';
    publishButton.disabled = busy || !changed;
  }

  function renderFrame(body, post) {
    frameReady = false;
    const articleURL = new URL(`../posts/${post.slug}/`, location.href).href;
    const cssURL = new URL('../css/style.css', location.href).href;
    frame.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${articleURL}"><link rel="stylesheet" href="${cssURL}"><style>html{background:#0b181b}body{margin:0;min-height:100vh;padding:28px clamp(20px,5vw,56px);background:#0b181b;color:#d5e6dc}.article{max-width:780px;margin:auto;outline:0}.article[contenteditable="true"]{min-height:60vh}.article[contenteditable="true"]:focus{outline:1px solid #a1f9d560;outline-offset:12px}a{pointer-events:none}</style></head><body><article class="article" contenteditable="true" spellcheck="true">${body}</article></body></html>`;
  }

  async function loadArticle() {
    if (!token || busy) return;
    if (current && frameReady && normalizedBody(current.files[0].html) !== editorArticle()?.innerHTML &&
        !confirm('当前正文有未发布的修改。确定打开另一篇文章吗？')) return;
    const post = posts.find((item) => item.slug === picker.value);
    if (!post) return;
    setBusy(true);
    say('正在从 GitHub 读取文章…');
    try {
      const files = await Promise.all(repositories.map(async (repo) => {
        const data = await github(contentPath(repo, post));
        if (data.type !== 'file' || data.encoding !== 'base64' || !data.sha || !data.content) {
          throw new Error(`${repo.label}返回了不支持的文件格式`);
        }
        const html = utf8FromBase64(data.content);
        articleBody(html);
        return { repo, sha: data.sha, html };
      }));
      current = { post, files };
      preview = false;
      previewButton.textContent = '预览';
      document.getElementById('editing-title').textContent = post.title;
      document.getElementById('editing-path').textContent = pathFor(post);
      editArea.hidden = false;
      renderFrame(normalizedBody(files[0].html), post);
      const diverged = normalizedBody(files[0].html) !== normalizedBody(files[1].html);
      say(diverged ? '源仓库与线上正文不同。这里显示源仓库版本；发布会把修改同步到两个仓库。' : '正文已打开。修改后可预览并发布。');
    } catch (error) {
      current = null;
      editArea.hidden = true;
      say(`无法打开文章：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!token || !current || busy || !frameReady) return;
    const body = editorArticle()?.innerHTML;
    if (typeof body !== 'string') return;
    try { validateBody(body); } catch (error) { say(error.message, 'error'); return; }
    if (!current.files.some((file) => normalizedBody(file.html) !== body)) return;
    if (!confirm(`发布“${current.post.title}”的正文修改到两个 GitHub 仓库？`)) return;
    setBusy(true);
    let updated = 0;
    try {
      for (const file of current.files) {
        if (normalizedBody(file.html) === body) continue;
        say(`正在更新${file.repo.label}…`);
        const newHtml = replaceBody(file.html, body);
        const path = pathFor(current.post);
        const data = await github(`/repos/${owner}/${file.repo.name}/contents/${path}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Edit article body: ${current.post.title}`,
            content: base64FromUtf8(newHtml),
            sha: file.sha,
            branch: file.repo.branch,
          }),
        });
        file.sha = data.content?.sha || file.sha;
        file.html = newHtml;
        updated += 1;
      }
      say(updated ? '已提交到源仓库和发布仓库。GitHub Pages 更新通常还需要片刻；可以返回文章页查看。' : '没有需要发布的修改。');
    } catch (error) {
      const partial = current.files.some((file) => normalizedBody(file.html) === body);
      say(`${partial ? '部分仓库已更新，另一仓库尚未更新。请保持页面打开并再次点击“发布修改”。' : '发布失败。'} ${error.message}`, 'error');
    } finally {
      setBusy(false);
      markEdited();
    }
  }

  picker.replaceChildren(...posts.map((post) => {
    const option = new Option(`${post.date} · ${post.title}`, post.slug);
    return option;
  }));
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    token = tokenField.value.trim();
    if (!token) return;
    setBusy(true);
    say('正在验证 GitHub 账号…');
    try {
      const user = await github('/user');
      if (String(user.login || '').toLowerCase() !== owner) throw new Error('该令牌不属于 captwd 账号');
      tokenField.value = '';
      authPanel.hidden = true;
      workPanel.hidden = false;
      say('已连接 captwd。请选择文章。');
    } catch (error) {
      token = '';
      tokenField.value = '';
      say(`连接失败：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  });
  document.getElementById('disconnect').addEventListener('click', () => {
    token = '';
    current = null;
    frameReady = false;
    frame.srcdoc = '';
    editArea.hidden = true;
    workPanel.hidden = true;
    authPanel.hidden = false;
    say('已断开连接。');
  });
  loadButton.addEventListener('click', loadArticle);
  publishButton.addEventListener('click', publish);
  previewButton.addEventListener('click', () => {
    const article = editorArticle();
    if (!article) return;
    preview = !preview;
    article.contentEditable = String(!preview);
    previewButton.textContent = preview ? '继续编辑' : '预览';
    say(preview ? '当前是预览模式。确认无误后点击“发布修改”。' : '可以继续修改正文。');
  });
  frame.addEventListener('load', () => {
    const article = editorArticle();
    if (!article) return;
    frameReady = true;
    article.addEventListener('input', markEdited);
    article.addEventListener('paste', (event) => {
      const plain = event.clipboardData?.getData('text/plain');
      if (plain == null) return;
      event.preventDefault();
      frame.contentDocument.execCommand('insertText', false, plain);
    });
    frame.contentDocument.addEventListener('click', (event) => {
      if (event.target.closest('a')) event.preventDefault();
    });
    markEdited();
  });
  window.addEventListener('pagehide', () => { token = ''; });
})();
