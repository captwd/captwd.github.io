const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const site = 'https://captwd.github.io/';
const source = fs.readFileSync(path.join(root, 'js/posts.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'js/posts.js' });
const posts = [...sandbox.window.POSTS].sort((a, b) => b.date.localeCompare(a.date));
const xml = value => String(value ?? '').replace(/[<>&"']/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
}[character]));
const urlFor = post => new URL(`posts/${post.slug}/`, site).href;
const dateFor = value => new Date(`${value}T12:00:00+08:00`);
const latestDate = dateFor(posts[0]?.date || '2026-01-01');
const generatedAt = new Date();

const rssItems = posts.map(post => {
  const url = urlFor(post);
  const categories = post.tags.map(tag => `<category>${xml(tag)}</category>`).join('');
  return `<item><title>${xml(post.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><pubDate>${dateFor(post.date).toUTCString()}</pubDate><description>${xml(post.excerpt)}</description>${categories}</item>`;
}).join('\n');
const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>captwd · 波形笔记</title><link>${site}</link><description>把声音当作可以触碰的材料。语音合成、生成模型与声音实验研究笔记。</description><language>zh-CN</language><lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate><atom:link href="${site}rss.xml" rel="self" type="application/rss+xml"/>${rssItems}</channel></rss>\n`;

const atomEntries = posts.map(post => {
  const url = urlFor(post);
  const categories = post.tags.map(tag => `<category term="${xml(tag)}"/>`).join('');
  return `<entry><title>${xml(post.title)}</title><id>${xml(url)}</id><link href="${xml(url)}"/><published>${dateFor(post.date).toISOString()}</published><updated>${dateFor(post.date).toISOString()}</updated><summary type="text">${xml(post.excerpt)}</summary>${categories}</entry>`;
}).join('\n');
const atom = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN"><title>captwd · 波形笔记</title><id>${site}</id><link href="${site}"/><link rel="self" href="${site}atom.xml" type="application/atom+xml"/><updated>${generatedAt.toISOString()}</updated>${atomEntries}</feed>\n`;

const urls = [
  { loc: site, lastmod: generatedAt },
  { loc: new URL('notes/', site).href, lastmod: generatedAt },
  ...posts.map(post => ({ loc: urlFor(post), lastmod: dateFor(post.date) })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(item => `<url><loc>${xml(item.loc)}</loc><lastmod>${item.lastmod.toISOString().slice(0, 10)}</lastmod></url>`).join('')}</urlset>\n`;

fs.writeFileSync(path.join(root, 'rss.xml'), rss, 'utf8');
fs.writeFileSync(path.join(root, 'atom.xml'), atom, 'utf8');
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap, 'utf8');
fs.writeFileSync(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`, 'utf8');
console.log(`Generated RSS, Atom, sitemap, and robots.txt for ${posts.length} posts.`);
