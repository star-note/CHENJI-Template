import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, hreflangSet } from '../lib/build.js';

const THEME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'theme');

function fixture(site, posts = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'sn-tpl-'));
  symlinkSync(THEME, path.join(root, 'theme'));
  mkdirSync(path.join(root, 'content'), { recursive: true });
  writeFileSync(path.join(root, 'content', 'site.json'), JSON.stringify(site));
  for (const [file, text] of Object.entries(posts)) {
    const full = path.join(root, 'content', 'posts', file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}
const post = (fm, body = '<p>正文</p>') => `---\n${fm}\n---\n${body}\n`;
const read = (root, rel) => readFileSync(path.join(root, '_site', rel), 'utf8');
const SITE = { title: { zh: '测试博客', en: 'Test Blog' }, author: { name: '作者' }, languages: ['zh', 'en'] };

test('hreflangSet: every version + x-default → default language; nothing without absolute URLs', () => {
  assert.deepEqual(hreflangSet({ en: 'https://x.dev/en/a/', zh: 'https://x.dev/a/' }, 'zh'), [
    { lang: 'zh-CN', href: 'https://x.dev/a/' },
    { lang: 'en', href: 'https://x.dev/en/a/' },
    { lang: 'x-default', href: 'https://x.dev/a/' },
  ]);
  assert.deepEqual(hreflangSet({ en: 'https://x.dev/en/b/' }, 'zh'), [
    { lang: 'en', href: 'https://x.dev/en/b/' },
    { lang: 'x-default', href: 'https://x.dev/en/b/' },
  ]);
  assert.deepEqual(hreflangSet({ zh: '/a/' }, 'zh'), []);
});

test('bilingual post: hreflang both ways, language switch; single-language post has none', () => {
  const root = fixture(SITE, {
    'pair/index.zh.html': post('title: 双语\ndate: 2026-10-01\ncategory: { slug: tech, name: 技术 }'),
    'pair/index.en.html': post('title: Bilingual\ndate: 2026-10-01\ncategory: { slug: tech, name: Tech }'),
    'solo/index.zh.html': post('title: 只有中文\ndate: 2026-10-02'),
  });
  try {
    build({ root, baseUrl: 'https://u.github.io/blog', quiet: true });
    const zh = read(root, 'pair/index.html');
    const en = read(root, 'en/pair/index.html');
    for (const html of [zh, en]) {
      assert.match(html, /<link rel="alternate" hreflang="zh-CN" href="https:\/\/u\.github\.io\/blog\/pair\/">/);
      assert.match(html, /<link rel="alternate" hreflang="en" href="https:\/\/u\.github\.io\/blog\/en\/pair\/">/);
      assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/u\.github\.io\/blog\/pair\/">/);
    }
    assert.match(zh, /<link rel="canonical" href="https:\/\/u\.github\.io\/blog\/pair\/">/);
    assert.match(en, /<link rel="canonical" href="https:\/\/u\.github\.io\/blog\/en\/pair\/">/);
    assert.match(en, /<html lang="en"/);
    assert.match(zh, /class="btn btn-sm blog-nav-login blog-nav-lang" hreflang="en"/);
    const solo = read(root, 'solo/index.html');
    assert.doesNotMatch(solo, /hreflang="en"/);
    assert.doesNotMatch(solo, /blog-nav-lang/);
    assert.ok(!existsSync(path.join(root, '_site', 'en', 'solo')));
    // JSON-LD: BlogPosting with the translation link, BreadcrumbList
    const ld = [...zh.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const posting = ld.find((x) => x['@type'] === 'BlogPosting');
    assert.equal(posting.inLanguage, 'zh-CN');
    assert.equal(posting.workTranslation[0].url, 'https://u.github.io/blog/en/pair/');
    assert.ok(ld.find((x) => x['@type'] === 'BreadcrumbList'));
    // links and assets carry the base path
    assert.match(zh, /href="\/blog\/static\/blog\.css\?v=/);
    assert.match(zh, /href="\/blog\/c\/tech\/"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sitemaps: index + one per language, alternates only between existing versions', () => {
  const root = fixture(SITE, {
    'pair/index.zh.html': post('title: 双语\ndate: 2026-10-01'),
    'pair/index.en.html': post('title: Bilingual\ndate: 2026-10-01\nupdated: 2026-10-03'),
    'solo/index.zh.html': post('title: 只有中文\ndate: 2026-10-02'),
    'moved/index.zh.html': post('title: 以辰记为准\ndate: 2026-10-02\ncanonical: https://starnote.app/@demo/abc'),
  });
  try {
    build({ root, baseUrl: 'https://u.github.io/blog', quiet: true });
    const index = read(root, 'sitemap.xml');
    assert.match(index, /<loc>https:\/\/u\.github\.io\/blog\/sitemap-zh\.xml<\/loc>/);
    assert.match(index, /<loc>https:\/\/u\.github\.io\/blog\/sitemap-en\.xml<\/loc>/);
    const zh = read(root, 'sitemap-zh.xml');
    const en = read(root, 'sitemap-en.xml');
    const block = (xml, loc) => xml.split('<url>').find((b) => b.includes(`<loc>${loc}</loc>`)) || '';
    const pair = block(zh, 'https://u.github.io/blog/pair/');
    assert.match(pair, /hreflang="en" href="https:\/\/u\.github\.io\/blog\/en\/pair\/"/);
    assert.match(pair, /hreflang="x-default" href="https:\/\/u\.github\.io\/blog\/pair\/"/);
    const solo = block(zh, 'https://u.github.io/blog/solo/');
    assert.ok(solo);
    assert.doesNotMatch(solo, /hreflang="en"/);
    assert.match(block(en, 'https://u.github.io/blog/en/pair/'), /<lastmod>2026-10-03T00:00:00Z<\/lastmod>/);
    assert.doesNotMatch(zh, /\/moved\//); // canonical points at 辰记: not listed
    assert.match(read(root, 'moved/index.html'), /<link rel="canonical" href="https:\/\/starnote\.app\/@demo\/abc">/);
    assert.match(read(root, 'moved.md'), /^---\ncanonical: https:\/\/starnote\.app\/@demo\/abc\n/);
    assert.match(read(root, 'robots.txt'), /Sitemap: https:\/\/u\.github\.io\/blog\/sitemap\.xml/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty content builds (first run of a freshly generated repository); ads only when configured', () => {
  const root = fixture({ title: '空博客', languages: ['zh', 'en'], cname: 'blog.example.com' });
  try {
    const res = build({ root, env: '', quiet: true });
    assert.deepEqual(res.languages, ['zh']); // no English posts → no /en/ section
    const home = read(root, 'index.html');
    assert.match(home, /<link rel="canonical" href="https:\/\/blog\.example\.com\/">/);
    assert.doesNotMatch(home, /adsbygoogle|google-adsense-account|data-cookie-bar/);
    assert.equal(read(root, 'CNAME'), 'blog.example.com\n');
    assert.ok(!existsSync(path.join(root, '_site', 'ads.txt')));
    assert.ok(existsSync(path.join(root, '_site', '404.html')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const ads = fixture({ ...SITE, adsense: { client: 'ca-pub-1234567890123456', slots: { end: '111' } } }, {
    'a/index.zh.html': post('title: 有广告\ndate: 2026-10-01'),
  });
  try {
    build({ root: ads, baseUrl: 'https://x.dev', quiet: true });
    const html = read(ads, 'a/index.html');
    assert.match(html, /<meta name="google-adsense-account" content="ca-pub-1234567890123456">/);
    assert.match(html, /data-ad-slot="111"/);
    assert.doesNotMatch(html, /data-cookie-bar/); // default consent: cmp
    assert.equal(read(ads, 'ads.txt'), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  } finally {
    rmSync(ads, { recursive: true, force: true });
  }
});

test('a broken post fails the build with its file name', () => {
  const root = fixture(SITE, { 'bad/index.zh.html': post('summary: 没有标题\ndate: 2026-10-01') });
  try {
    assert.throws(() => build({ root, baseUrl: 'https://x.dev', quiet: true }), /posts\/bad\/index\.zh\.html：front matter 缺少 title/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('comments: only for posts on 辰记, read-only preview + 「去辰记参与讨论」; one solid button; no reads, no stats', () => {
  const root = fixture({ ...SITE, starnote: { handle: 'demo', blog_url: 'https://starnote.app/@demo' } }, {
    'on/index.zh.html': post('title: 也在辰记\ndate: 2026-10-01\nstarnote_id: 8kq2xa\nstarnote_url: https://starnote.app/@demo/8kq2xa'),
    'off/index.zh.html': post('title: 只在 GitHub\ndate: 2026-10-02'),
  });
  try {
    build({ root, baseUrl: 'https://u.github.io', quiet: true });
    const on = read(root, 'on/index.html');
    assert.match(on, /data-sn-comments/);
    // outlined: the page's one solid primary button is the author card's 「在辰记关注」
    assert.match(on, /<a class="btn" href="https:\/\/starnote\.app\/@demo\/8kq2xa#comments"/);
    const solid = on.match(/class="[^"]*\bbtn-primary\b[^"]*"/g) ?? [];
    assert.equal(solid.length, 1);
    assert.match(solid[0], /blog-follow/);
    const cfg = JSON.parse(/<script id="sn-cfg" type="application\/json">(.*?)<\/script>/.exec(on)[1]);
    assert.equal(cfg.comments, 'https://starnote.app/api/v1/blogs/demo/posts/8kq2xa/comments?page=1&page_size=3');
    assert.doesNotMatch(on, /data-sn-reads|sendBeacon|goatcounter|cloudflareinsights/);
    const off = read(root, 'off/index.html');
    assert.doesNotMatch(off, /data-sn-comments|id="comments"|sn\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const offRoot = fixture({ ...SITE, comments: 'off' }, {
    'on/index.zh.html': post('title: 也在辰记\ndate: 2026-10-01\nstarnote_url: https://starnote.app/@demo/8kq2xa'),
  });
  try {
    build({ root: offRoot, baseUrl: 'https://u.github.io', quiet: true });
    assert.doesNotMatch(read(offRoot, 'on/index.html'), /data-sn-comments/);
  } finally {
    rmSync(offRoot, { recursive: true, force: true });
  }
});

test('publish-SDK files: index.zh-CN.html, JSON-style front matter, predicted canonical on another host', () => {
  const fm = (lang, title, other) => [
    'id: "a1b2c3d4"', 'note_id: "a1b2c3d4-0000"', 'slug: "my-ai-workflow"', `title: ${JSON.stringify(title)}`,
    `lang: "${lang}"`, `translations: {"${other}":"index.${other}.html"}`, 'tags: ["AI","写作"]',
    'published_at: "2026-10-19T08:00:00.000Z"', 'updated_at: "2026-10-19T08:00:00.000Z"',
    `canonical: "https://me.github.io/${lang === 'en' ? 'en/' : ''}a1b2c3d4/"`,
    'toc: [{"id":"h-0-a","level":2,"text":"A: 开头"}]', 'generator: "starnote-publish/github-pages"',
  ].join('\n');
  const root = fixture(SITE, {
    'a1b2c3d4/index.zh-CN.html': post(fm('zh-CN', '我的 AI 写作工作流', 'en'), '<!--sn:article 1-->\n<h2 id="h-0-a">A: 开头</h2><p>正文</p>'),
    'a1b2c3d4/index.en.html': post(fm('en', 'My AI writing workflow', 'zh-CN'), '<!--sn:article 1-->\n<h2 id="h-0-a">A</h2><p>Body</p>'),
  });
  try {
    build({ root, baseUrl: 'https://blog.example.com', quiet: true }); // custom domain ≠ the host the SDK predicted
    const zh = read(root, 'a1b2c3d4/index.html');
    assert.match(zh, /<link rel="canonical" href="https:\/\/blog\.example\.com\/a1b2c3d4\/">/);
    assert.match(zh, /hreflang="en" href="https:\/\/blog\.example\.com\/en\/a1b2c3d4\/"/);
    assert.match(zh, /<a href="#h-0-a">A: 开头<\/a>/);
    assert.match(read(root, 'en/a1b2c3d4/index.html'), /<html lang="en"/);
    assert.ok(!existsSync(path.join(root, '_site', 'my-ai-workflow'))); // `slug` never moves the URL
    assert.match(read(root, 'sitemap-zh.xml'), /<loc>https:\/\/blog\.example\.com\/a1b2c3d4\/<\/loc>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('category slug is a URL segment: `..` / `/` never reach the output directory', () => {
  for (const cat of ['category: { slug: "../../x", name: 分类 }', 'category: ".."', 'category: { slug: "a/b", name: 分类 }']) {
    const root = fixture(SITE, { 'p/index.zh.html': post(`title: 标题\ndate: 2026-10-01\n${cat}`) });
    try {
      assert.throws(() => build({ root, baseUrl: 'https://u.github.io', quiet: true }), /p\/index\.zh\.html：分类 slug/, cat);
      assert.ok(!existsSync(path.join(root, 'x', 'index.html')));
      assert.ok(!existsSync(path.join(root, '_site', 'c')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('post page: WeChat QR is real SVG; JSON-LD escapes `<!--` and `</script>` in titles; a bare % in a src does not break the build', () => {
  const root = fixture(SITE, {
    'odd/index.zh.html': post('title: "HTML 注释 <!--<script> 与 </script> 标签 & 符号"\ndate: 2026-10-01\ncategory: { slug: tech, name: "技术 <b>" }', '<p><img src="50%off.png" alt="x"></p>'),
  });
  try {
    build({ root, baseUrl: 'https://u.github.io', quiet: true });
    const html = read(root, 'odd/index.html');
    assert.match(html, /class="share-qr"[^>]*><svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(html, /&lt;svg/);
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 2);
    for (const s of scripts) {
      assert.doesNotMatch(s, /[<>&]/);
      JSON.parse(s);
    }
    const posting = scripts.map((s) => JSON.parse(s)).find((x) => x['@type'] === 'BlogPosting');
    assert.equal(posting.headline, 'HTML 注释 <!--<script> 与 </script> 标签 & 符号');
    assert.match(html, /src="50%off\.png"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cname must be a bare hostname: anything else writes no CNAME and is not used as the site URL', () => {
  for (const cname of ['https://blog.example.com', 'blog.example.com/path', 'blog.example.com\nevil', 'localhost']) {
    const root = fixture({ title: '博客', languages: ['zh'], cname });
    try {
      const res = build({ root, env: '', quiet: true });
      assert.ok(!existsSync(path.join(root, '_site', 'CNAME')), cname);
      assert.equal(res.origin, '', cname);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const root = fixture({ title: '博客', languages: ['zh'], cname: ' Blog.Example.com. ' });
  try {
    build({ root, env: '', quiet: true });
    assert.equal(read(root, 'CNAME'), 'blog.example.com\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
