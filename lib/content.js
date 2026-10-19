// Content loading: content/site.json + content/posts/<slug>/index.<lang>.html (front matter + editor HTML).
// The contract (field names, file layout) is documented in SPEC-r8-github-template.md §2 — the 辰记 publish SDK
// (github-pages adapter) writes exactly these files.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, FrontMatterError } from './frontmatter.js';
import { normalizeLang, isoDate, asDate, LANGS } from './i18n.js';
import { stripTags, decodeEntities } from './html.js';

export class ContentError extends Error {}

/** A localized value: a string, or `{ zh: …, en: … }` (falls back to the default language, then any). */
export function loc(value, lang, defaultLang = 'zh') {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  return value[lang] ?? value[defaultLang] ?? Object.values(value)[0] ?? '';
}

export function loadConfig(contentDir) {
  const file = path.join(contentDir, 'site.json');
  if (!existsSync(file)) throw new ContentError(`找不到 ${file}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ContentError(`site.json 不是合法 JSON：${e.message}`);
  }
  const languages = (Array.isArray(raw.languages) && raw.languages.length ? raw.languages : ['zh'])
    .map((l) => normalizeLang(l))
    .filter((l, i, a) => l && a.indexOf(l) === i);
  if (!languages.length) throw new ContentError(`site.json languages 只支持 ${LANGS.join(' / ')}`);
  const defaultLang = normalizeLang(raw.default_language) && languages.includes(normalizeLang(raw.default_language))
    ? normalizeLang(raw.default_language)
    : languages[0];
  // aliases the publish SDK may write at bind time: base_url → url, handle → starnote.handle
  if (!raw.url && raw.base_url) raw.url = raw.base_url;
  if (raw.handle && !raw.starnote?.handle) raw.starnote = { ...(raw.starnote || {}), handle: raw.handle };
  return {
    ...raw,
    languages: [defaultLang, ...languages.filter((l) => l !== defaultLang)],
    defaultLang,
    title: raw.title || 'My Blog',
    author: { name: '', avatar: '', ...(raw.author || {}) },
    links: Array.isArray(raw.links) ? raw.links.filter((l) => l && l.url) : [],
    contact: Array.isArray(raw.contact) ? raw.contact.filter((c) => c && (c.value || c.url)) : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    starnote: { ...(raw.starnote || {}) },
    adsense: { slots: {}, consent: 'cmp', ads_txt_lines: [], ...(raw.adsense || {}) },
    robots: { ai_search: true, ai_training: true, disallow_md: false, ...(raw.robots || {}) },
    share: { image: '', image_width: 1200, image_height: 630, utm: false, ...(raw.share || {}) },
    posts_per_page: Number(raw.posts_per_page) > 0 ? Number(raw.posts_per_page) : 15,
  };
}

const POST_FILE = /^index(?:\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*))?\.html$/;

/** URL slug: letters, digits, `-`, `_` (any script), no dots or slashes. */
export function isValidSlug(slug) {
  return /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(String(slug));
}

export function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function asList(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

function normCategory(v, config, lang) {
  if (!v) return null;
  let slug;
  let name;
  if (typeof v === 'object') {
    slug = v.slug;
    name = loc(v.name, lang, config.defaultLang);
  } else {
    name = String(v);
  }
  const names = (c) => (c.name && typeof c.name === 'object' ? Object.values(c.name) : [c.name]);
  // a plain string matches a configured category by slug or by any of its names
  const known = config.categories.find((c) => (slug ? c.slug === slug : c.slug === name || names(c).includes(name)));
  if (known) {
    slug = slug || known.slug;
    name = loc(known.name, lang, config.defaultLang) || name;
  }
  slug = slug || slugify(name) || name;
  if (!name) name = slug;
  // the slug is a URL segment and an output directory (`/c/<slug>/`): same rule as post directory names
  if (!isValidSlug(slug)) throw new ContentError(`分类 slug「${String(slug)}」只能包含字母、数字、- 和 _`);
  return { slug: String(slug), name: String(name) };
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** h2/h3 headings → table of contents; headings without an id get one (the editor always writes ids). */
export function extractToc(html) {
  const used = new Set();
  const toc = [];
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) used.add(m[1]);
  const out = html.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (whole, level, attrs, inner) => {
    const text = decodeEntities(stripTags(inner)).replace(/\s+/g, ' ').trim();
    if (!text) return whole;
    let id = /\sid="([^"]+)"/.exec(attrs)?.[1];
    if (!id) {
      const base = `h-${slugify(text) || toc.length}`;
      id = base;
      for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
      used.add(id);
      whole = `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
    }
    toc.push({ id: decodeEntities(id), text, level: Number(level) });
    return whole;
  });
  return { html: out, toc };
}

/**
 * Every post file, normalized. Throws ContentError with the file name on a broken post (missing title / date,
 * bad slug, duplicate URL) so a broken publish fails the build instead of silently dropping a page.
 */
export function loadPosts(contentDir, config, { includeDrafts = false } = {}) {
  const postsDir = path.join(contentDir, 'posts');
  if (!existsSync(postsDir)) return [];
  const posts = [];
  for (const dirName of readdirSync(postsDir).sort()) {
    const dir = path.join(postsDir, dirName);
    if (dirName.startsWith('.') || dirName.startsWith('_') || !statSync(dir).isDirectory()) continue;
    const files = walk(dir);
    const assets = files.filter((f) => !POST_FILE.test(f) || f.includes('/'));
    for (const file of files) {
      const fm = POST_FILE.exec(file);
      if (!fm || file.includes('/')) continue;
      const rel = `posts/${dirName}/${file}`;
      let parsed;
      try {
        parsed = parseFrontMatter(readFileSync(path.join(dir, file), 'utf8'));
      } catch (e) {
        if (e instanceof FrontMatterError) throw new ContentError(`${rel}：${e.message}`);
        throw e;
      }
      const d = parsed.data;
      if (d.draft === true && !includeDrafts) continue;
      const fileLang = fm[1] ? normalizeLang(fm[1]) : null;
      const lang = normalizeLang(d.lang) || fileLang || config.defaultLang;
      if (fm[1] && !fileLang) throw new ContentError(`${rel}：不支持的语言「${fm[1]}」（只支持 zh / en）`);
      if (!config.languages.includes(lang)) {
        console.warn(`! 跳过 ${rel}：语言 ${lang} 不在 site.json languages 里`);
        continue;
      }
      const title = String(d.title ?? '').trim();
      if (!title) throw new ContentError(`${rel}：front matter 缺少 title`);
      const published = d.date ?? d.published_at ?? d.published;
      if (!asDate(published)) throw new ContentError(`${rel}：front matter 缺少合法的 date（ISO 8601，如 2026-10-19T08:00:00+08:00）`);
      const updated = asDate(d.updated ?? d.updated_at) ? (d.updated ?? d.updated_at) : published;
      // the directory name is the URL (/<dir>/, /en/<dir>/) — the publish SDK names it after the post id; a front
      // matter `slug` is informational only (SDK writes one from the title), so it never moves a published page
      const slug = dirName;
      if (!isValidSlug(slug)) throw new ContentError(`${rel}：目录名「${slug}」只能包含字母、数字、- 和 _`);
      const { html, toc } = extractToc(parsed.body.trim());
      let category;
      try {
        category = normCategory(d.category, config, lang);
      } catch (e) {
        if (e instanceof ContentError) throw new ContentError(`${rel}：${e.message}`);
        throw e;
      }
      posts.push({
        file: rel,
        dir: dirName,
        dirPath: dir,
        assets,
        lang,
        slug,
        group: String(d.translation_of || dirName),
        title,
        summary: String(d.summary ?? d.description ?? '').trim(),
        published_at: isoDate(published),
        updated_at: isoDate(updated) < isoDate(published) ? isoDate(published) : isoDate(updated),
        tags: asList(d.tags).map((t) => ({ name: String(t) })),
        category,
        cover: d.cover ? String(d.cover) : '',
        cover_alt: d.cover_alt ? String(d.cover_alt) : '',
        canonical: d.canonical ? String(d.canonical) : '',
        // 辰记 short_id of the original (NOT the SDK's `id`, which is the post directory / note-derived id)
        starnote_id: d.starnote_id ? String(d.starnote_id) : '',
        starnote_url: d.starnote_url ? String(d.starnote_url) : '',
        pinned: d.pinned === true,
        also_on: Array.isArray(d.also_on) ? d.also_on.filter((a) => a && a.url) : [],
        html,
        toc: (Array.isArray(d.toc) && d.toc.length ? d.toc : toc).filter((h) => h.level === 2 || h.level === 3),
        text: stripTags(html),
      });
    }
  }
  // one URL per language and slug; one version per language in a translation group
  const seen = new Map();
  const groups = new Map();
  for (const p of posts) {
    const key = `${p.lang}/${p.slug}`;
    if (seen.has(key)) throw new ContentError(`${p.file} 与 ${seen.get(key)} 的网址重复（${key}）`);
    seen.set(key, p.file);
    const gk = `${p.group}/${p.lang}`;
    if (groups.has(gk)) throw new ContentError(`${p.file} 与 ${groups.get(gk)} 是同一篇文章的同一种语言`);
    groups.set(gk, p.file);
  }
  return posts;
}
