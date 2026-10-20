import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Site, isValidHostname, normalizeHostname, parseBaseUrl, resolveBaseUrl } from '../lib/site.js';
import { robotsTxt } from '../lib/seo.js';

const config = { starnote: { handle: 'demo' } };
const site = (url, lang = 'zh') => new Site({ ...parseBaseUrl(url), lang, defaultLang: 'zh', languages: ['zh', 'en'], config });

test('base path: user site, project site, custom domain', () => {
  assert.deepEqual(parseBaseUrl('https://ludejun.github.io'), { origin: 'https://ludejun.github.io', basePath: '' });
  assert.deepEqual(parseBaseUrl('https://ludejun.github.io/blog/'), { origin: 'https://ludejun.github.io', basePath: '/blog' });
  assert.deepEqual(parseBaseUrl('/blog'), { origin: '', basePath: '/blog' });
  assert.deepEqual(parseBaseUrl(''), { origin: '', basePath: '' });
  assert.equal(resolveBaseUrl({ config: { cname: 'blog.example.com' } }), 'https://blog.example.com');
  assert.equal(resolveBaseUrl({ env: 'https://u.github.io/r', config: { url: 'https://x.dev' } }), 'https://u.github.io/r');
  assert.equal(resolveBaseUrl({ cli: 'https://a.dev', env: 'https://b.dev', config: {} }), 'https://a.dev');
});

test('base path: every link carries /repo, the language prefix comes after it', () => {
  const zh = site('https://ludejun.github.io/blog');
  const en = zh.forLang('en');
  assert.equal(zh.url_home(), '/blog/');
  assert.equal(zh.url_post('hello'), '/blog/hello/');
  assert.equal(en.url_post('hello'), '/blog/en/hello/');
  assert.equal(en.url_category('tech', 2), '/blog/en/c/tech/page/2/');
  assert.equal(zh.url_post_md('hello'), '/blog/hello.md');
  assert.equal(en.url_feed(), '/blog/en/feed.xml');
  assert.equal(en.url_sitemap(), '/blog/sitemap.xml'); // root files are not language-prefixed
  assert.equal(zh.url_static('blog.css'), '/blog/static/blog.css');
  assert.equal(zh.canonical(en.url_post('hello')), 'https://ludejun.github.io/blog/en/hello/');
  assert.equal(zh.url_post('用辰记'), `/blog/${encodeURIComponent('用辰记')}/`);
  assert.equal(zh.search_scope(), 'ludejun.github.io/blog');
  // user site: no prefix at all
  assert.equal(site('https://ludejun.github.io').url_post('hello'), '/hello/');
});

test('robots.txt: rules scoped to the base path, AI groups switchable, .md optional', () => {
  const txt = robotsTxt({ sitemaps: ['https://u.github.io/blog/sitemap.xml'], basePath: '/blog', aiTraining: false, disallowMd: true });
  assert.match(txt, /User-agent: \*\nAllow: \/blog\/\nDisallow: \/blog\/\*\.md\$/);
  assert.match(txt, /User-agent: GPTBot[\s\S]*?Disallow: \/blog\/\n/);
  assert.match(txt, /User-agent: OAI-SearchBot[\s\S]*?Allow: \/blog\//);
  assert.match(txt, /Sitemap: https:\/\/u\.github\.io\/blog\/sitemap\.xml/);
});

test('hostnames for CNAME: bare host only', () => {
  assert.equal(isValidHostname('blog.example.com'), true);
  assert.equal(isValidHostname('Example.COM.'), true);
  assert.equal(isValidHostname('xn--fiq228c.cn'), true);
  for (const bad of ['https://blog.example.com', 'blog.example.com/x', 'blog.example.com:8080', 'localhost', '-a.example.com', 'a..com', '1.2.3.4', 'a\nb.com', ''])
    assert.equal(isValidHostname(bad), false, bad);
  assert.equal(normalizeHostname(' Blog.Example.com. '), 'blog.example.com');
  assert.equal(resolveBaseUrl({ config: { cname: 'https://blog.example.com' } }), '');
});
