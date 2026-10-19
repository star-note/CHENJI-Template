// The static site generator: content/ + theme/ → _site/. Every page is complete HTML at build time (meta,
// JSON-LD, QR code, Markdown twins, feeds, sitemaps, llms.txt); blog.js only adds progressive enhancement.
// Page builders follow starnote-api app/web/views.py so the GitHub blog and the 辰记 SSR blog stay alike.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ContentError, loadConfig, loadPosts, loc } from './content.js';
import { Site, isValidHostname, normalizeHostname, parseBaseUrl, resolveBaseUrl } from './site.js';
import { HTML_LANG, OG_LOCALE, t as translate, readingMinutes, isoDate, loadTables } from './i18n.js';
import * as seo from './seo.js';
import { shareContext } from './share.js';
import { imageSize } from './imagesize.js';
import { htmlToMarkdown } from './markdown.js';
import { yamlStr } from './frontmatter.js';
import { truncatePlain, stripTags } from './html.js';
import { render } from './render.js';
import { starnoteOriginal } from './starnote.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const HERO_SIDE = 3;
export const HOME_LATEST = 12;
export const FEED_LIMIT = 20;
export const LLMS_FULL_LIMIT = 50;
export const RELATED_LIMIT = 3;
export const LANG_NAME = { zh: '中文', en: 'English' };
const DEFAULT_SHARE_IMAGE = 'og-default.png';
const LOGO_IMAGE = 'logo.png';
const LOGO_SIZE = 192;

const isExternal = (u) => /^([a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(u);

// ---------------------------------------------------------------------------
// hreflang
// ---------------------------------------------------------------------------

/**
 * The `<link rel=alternate hreflang>` set (and the sitemap's xhtml:link set) for one page that exists in the
 * languages of `urls` ({lang: absolute URL}): every version + x-default → the default-language version (or, for a
 * page that exists in one other language only, itself). Needs absolute URLs: none on a relative build.
 */
export function hreflangSet(urls, defaultLang) {
  const order = ['zh', 'en'];
  const langs = Object.keys(urls).filter((l) => urls[l]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!langs.length || !langs.every((l) => /^https?:\/\//.test(urls[l]))) return [];
  const out = langs.map((l) => ({ lang: HTML_LANG[l] || l, href: urls[l] }));
  out.push({ lang: 'x-default', href: urls[defaultLang] || urls[langs[0]] });
  return out;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export function build(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const contentDir = path.join(root, 'content');
  const themeDir = path.join(root, 'theme');
  const out = path.resolve(options.out || path.join(root, '_site'));
  const log = options.quiet ? () => {} : (...a) => console.log(...a);
  const warn = options.quiet ? () => {} : (...a) => console.warn(...a);
  loadTables(themeDir);

  const config = loadConfig(contentDir);
  const baseUrl = resolveBaseUrl({ cli: options.baseUrl, env: options.env ?? process.env.SITE_URL, config });
  const { origin, basePath } = parseBaseUrl(baseUrl);
  if (!origin) warn('! 没有绝对网址（site.json url / SITE_URL / --base-url）：canonical、hreflang、og:image 将不完整，只适合本地预览');
  const posts = loadPosts(contentDir, config, { includeDrafts: options.drafts });
  const { defaultLang } = config;
  const activeLangs = config.languages.filter((l) => l === defaultLang || posts.some((p) => p.lang === l));
  const staticVersion = hashDir(path.join(themeDir, 'static'), ['blog.css', 'blog.js', 'custom.css']);
  const siteFor = (lang) => new Site({ origin, basePath, lang, defaultLang, languages: activeLangs, config, staticVersion });
  const base = siteFor(defaultLang);

  // ----- output dir, static files, assets ---------------------------------
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(path.join(themeDir, 'static'), path.join(out, 'static'), { recursive: true });
  const hasCustomCss = existsSync(path.join(themeDir, 'static', 'custom.css'));
  if (existsSync(path.join(contentDir, 'assets'))) cpSync(path.join(contentDir, 'assets'), path.join(out, 'assets'), { recursive: true });
  const fileOfUrl = new Map(); // root-relative URL → file on disk (intrinsic image sizes)
  const siteAsset = (rel) => {
    if (!rel) return '';
    if (isExternal(rel) || rel.startsWith('/')) return rel;
    const clean = rel.replace(/^\.?\//, '').replace(/^assets\//, '');
    const url = base.url_asset(clean);
    fileOfUrl.set(url, path.join(contentDir, 'assets', clean));
    return url;
  };
  const copiedDirs = new Set();
  for (const p of posts) {
    if (!copiedDirs.has(p.dir)) {
      copiedDirs.add(p.dir);
      for (const a of p.assets) {
        const dest = path.join(out, 'assets', 'posts', p.dir, a);
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(path.join(p.dirPath, a), dest);
        fileOfUrl.set(base.url_asset(`posts/${p.dir}/${a}`), path.join(p.dirPath, a));
      }
    }
    const assetSet = new Set(p.assets);
    const rewrite = (u) => {
      let clean = String(u).replace(/^\.\//, '').split(/[?#]/)[0];
      try {
        clean = decodeURI(clean);
      } catch {
        /* a bare `%` in the name (`50%off.png`): match it as written */
      }
      return assetSet.has(clean) ? base.url_asset(`posts/${p.dir}/${clean}`) + String(u).slice(String(u).split(/[?#]/)[0].length) : u;
    };
    p.html = p.html.replace(/(\s(?:src|href|poster|data-src)=)(["'])([^"']*)\2/gi, (m, attr, q, u) => (isExternal(u) || u.startsWith('/') ? m : `${attr}${q}${rewrite(u)}${q}`));
    p.html = p.html.replace(/(\ssrcset=)(["'])([^"']*)\2/gi, (m, attr, q, v) => `${attr}${q}${v.split(',').map((part) => {
      const [u, ...rest] = part.trim().split(/\s+/);
      return [isExternal(u) || u.startsWith('/') ? u : rewrite(u), ...rest].join(' ');
    }).join(', ')}${q}`);
    p.cover_url = p.cover ? (isExternal(p.cover) || p.cover.startsWith('/') ? p.cover : rewrite(p.cover)) : '';
  }
  const sizeOf = (src) => {
    const file = fileOfUrl.get(src.split(/[?#]/)[0]);
    return file ? imageSize(file) : null;
  };

  // ----- per-language indexes ------------------------------------------------
  const byLang = {};
  for (const lang of activeLangs) {
    byLang[lang] = posts.filter((p) => p.lang === lang).sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0));
  }
  const groups = new Map();
  for (const p of posts) {
    if (!groups.has(p.group)) groups.set(p.group, {});
    groups.get(p.group)[p.lang] = p;
  }
  for (const p of posts) {
    const s = siteFor(p.lang);
    p.minutes = readingMinutes([...p.text.replace(/\s/g, '')].length);
    p.url_path = s.url_post(p.slug);
    p.self_url = s.canonical(p.url_path);
    p.canonical_url = p.canonical || p.self_url;
    // a canonical that is this very page (the SDK writes the absolute URL it predicted — possibly another host, e.g.
    // before a custom domain) counts as self; only one elsewhere (辰记) is external
    p.self_canonical = !p.canonical || p.canonical === p.self_url || pointsAtSelf(p.canonical, `${s.langPrefix()}/${p.slug}/`);
    if (p.self_canonical) p.canonical_url = p.self_url;
    p.cover_abs = p.cover_url ? s.absolute(p.cover_url) : '';
  }
  for (const p of posts) {
    const versions = groups.get(p.group);
    p.versions = versions;
    p.translations = Object.values(versions)
      .filter((v) => v !== p)
      .sort((a, b) => activeLangs.indexOf(a.lang) - activeLangs.indexOf(b.lang))
      .map((v) => ({ lang: v.lang, href: v.url_path, hreflang: HTML_LANG[v.lang], label: LANG_NAME[v.lang] || v.lang }));
  }

  const categoriesFor = (lang) => {
    const counts = new Map();
    for (const p of byLang[lang]) {
      if (!p.category) continue;
      const c = counts.get(p.category.slug) || { ...p.category, count: 0, newest: '' };
      c.count++;
      if (p.updated_at > c.newest) c.newest = p.updated_at;
      counts.set(p.category.slug, c);
    }
    const order = config.categories.map((c) => c.slug);
    return [...counts.values()].sort((a, b) => {
      const ia = order.indexOf(a.slug);
      const ib = order.indexOf(b.slug);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  };
  const tagsFor = (lang) => {
    const counts = new Map();
    for (const p of byLang[lang]) for (const tg of p.tags) counts.set(tg.name, (counts.get(tg.name) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([name, count]) => ({ name, count }));
  };
  const archivesFor = (lang) => {
    const counts = new Map();
    for (const p of byLang[lang]) counts.set(p.published_at.slice(0, 7), (counts.get(p.published_at.slice(0, 7)) || 0) + 1);
    return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, count]) => ({ month, count }));
  };
  const cats = Object.fromEntries(activeLangs.map((l) => [l, categoriesFor(l)]));

  // ----- shared context ----------------------------------------------------------
  const ownerName = config.author.name || loc(config.title, defaultLang, defaultLang);
  const avatarUrl = siteAsset(config.author.avatar || '');
  const card = (c) => {
    if (!c) return {};
    const out2 = { ...c };
    for (const k of ['qr', 'wechat_qr', 'alipay_qr']) if (c[`${k}_url`]) out2[`${k}_url`] = siteAsset(c[`${k}_url`]);
    out2.links = Array.isArray(c.links) ? c.links : [];
    return out2;
  };
  const sameAs = (s) => {
    const list = [];
    for (const l of config.links) if (/^https?:\/\//.test(l.url) && !list.includes(l.url)) list.push(l.url);
    const sn = s.url_starnote_blog();
    if (sn && !list.includes(sn)) list.push(sn);
    return list;
  };
  const shareDefault = (s) => {
    const img = config.share.image;
    if (img) return { image: s.absolute(siteAsset(img)), image_width: config.share.image_width || null, image_height: config.share.image_height || null, image_alt: null };
    return { image: s.absolute(s.url_static(DEFAULT_SHARE_IMAGE)), image_width: 1200, image_height: 630, image_alt: null };
  };
  const shellFor = (s) => {
    const title = String(loc(config.title, s.lang, defaultLang));
    const bio = String(loc(config.description, s.lang, defaultLang) || '');
    const about = String(loc(config.about, s.lang, defaultLang) || '');
    return { title, description: truncatePlain(bio || about || title, 160), bio, about };
  };
  const clientI18n = (s) => {
    const keys = ['comments_none', 'comments_login', 'comments_soon', 'comments_loading', 'comments_off', 'comment_deleted', 'menu_empty', 'menu_more', 'share_copied', 'share_copy_failed', 'comments_more'];
    const o = Object.fromEntries(keys.map((k) => [k, s.t(k)]));
    o.comments_count = s.t('comments_count', { n: '{n}' });
    o.menu_all_posts = s.t('menu_all_posts', { n: '{n}' });
    o.reads = s.t('reads', { n: '{n}' });
    return o;
  };

  const homeId = (s) => s.canonical(s.url_home());
  const ownerId = (s) => `${homeId(s)}#author`;
  const logo = (s) => ({ '@type': 'ImageObject', url: s.absolute(s.url_static(LOGO_IMAGE)), width: LOGO_SIZE, height: LOGO_SIZE });
  const personLd = (s, full = false) => {
    const shell = shellFor(s);
    const person = { '@type': 'Person', '@id': ownerId(s), name: ownerName, url: homeId(s) };
    if (avatarUrl) person.image = s.absolute(avatarUrl);
    const sa = sameAs(s);
    if (sa.length) person.sameAs = sa;
    if (full) {
      if (s.handle) person.alternateName = `@${s.handle}`;
      if (shell.bio) person.description = truncatePlain(shell.bio, 300);
    }
    return person;
  };
  const blogLd = (s) => ({
    '@context': 'https://schema.org', '@type': 'Blog', '@id': `${homeId(s)}#blog`, url: homeId(s),
    name: shellFor(s).title, description: shellFor(s).description, inLanguage: HTML_LANG[s.lang], author: personLd(s),
    publisher: { '@type': 'Organization', name: '辰记 StarNote', url: s.url_platform(), logo: logo(s) },
  });
  const websiteLd = (s) => ({
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${homeId(s)}#website`, url: homeId(s),
    name: shellFor(s).title, description: shellFor(s).description, inLanguage: HTML_LANG[s.lang], publisher: { '@id': ownerId(s) },
  });
  const breadcrumbs = (s, items) => ({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [[s.t('nav_home'), s.url_home()], ...items].map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: s.canonical(url) })),
  });

  const adsFor = (kind) => seo.adsConfig(config.adsense, kind);
  const commentsMode = ['chenji', 'giscus', 'off'].includes(config.comments) ? config.comments : 'chenji';
  // giscus (GitHub Discussions): only when every id is filled in — see README「评论」
  const giscus = ['repo', 'repo_id', 'category', 'category_id'].every((k) => config.giscus?.[k]) ? { mapping: 'pathname', ...config.giscus } : null;
  const pages = []; // [path on disk, html]

  /** One HTML page. `alts`: {lang: path} of this page in each language (language switch + hreflang). */
  function page(s, template, { kind, active = '', path: urlPath, meta, alts = null, hreflangAlts = null, extra = {} }) {
    const shell = shellFor(s);
    meta = { type: 'website', noindex: false, canonical: s.canonical(urlPath), image: null, jsonld: [], tags: [], ...meta };
    if (!meta.image) Object.assign(meta, shareDefault(s));
    const ads = meta.noindex ? null : adsFor(kind);
    const altUrls = alts || { [s.lang]: urlPath };
    const other = Object.keys(altUrls).filter((l) => l !== s.lang && altUrls[l]);
    const switchLang = other[0];
    const ctx = {
      site: s,
      shell,
      blog: {
        title: shell.title, bio: shell.bio, about: shell.about, links: config.links.map((l) => ({ ...l, label: loc(l.label, s.lang, defaultLang) || hostOf(l.url) })),
        contact: config.contact.map((c) => ({ ...c, label: loc(c.label, s.lang, defaultLang) })),
        follow_card: card(config.follow_card), tip_card: card(config.tip_card),
      },
      owner: { name: ownerName, avatar_url: avatarUrl, kind: 'user' },
      categories: cats[s.lang],
      stats: { posts: byLang[s.lang].length, categories: cats[s.lang].length, tags: tagsFor(s.lang).length },
      tags: tagsFor(s.lang),
      hot: [],
      archives: archivesFor(s.lang),
      kind,
      active,
      path: urlPath,
      meta,
      hreflang: meta.noindex || meta.canonical !== s.canonical(urlPath) ? [] : hreflangSet(Object.fromEntries(Object.entries(hreflangAlts || altUrls).map(([l, u]) => [l, s.canonical(u)])), defaultLang),
      og_alternates: other.map((l) => OG_LOCALE[l]),
      content_lang: HTML_LANG[s.lang],
      ads,
      preconnect: ads ? ['https://pagead2.googlesyndication.com'] : [],
      year: new Date().getUTCFullYear(),
      lang_switch: switchLang ? { href: altUrls[switchLang], hreflang: HTML_LANG[switchLang], text: s.t('lang_switch_short'), label: s.t('lang_switch_label') } : null,
      has_contact: config.contact.length > 0,
      has_custom_css: hasCustomCss,
      api_url: '', // blog.js talks to the 辰记 API only on the SSR blog; sn.js does it here
      comments_policy: 'off',
      comments_on: false,
      sn_cfg: null,
      client_i18n: clientI18n(s),
      twitter_site: config.twitter || '',
      ...extra,
    };
    if (ctx.ads && !ctx.ads.slots) ctx.ads.slots = {};
    pages.push([urlPath, render(themeDir, s.lang, template, ctx)]);
  }

  // ----- pages per language ----------------------------------------------------------
  const pathsAll = (fn, langs = activeLangs) => Object.fromEntries(langs.map((l) => [l, fn(siteFor(l))]));

  for (const lang of activeLangs) {
    const s = siteFor(lang);
    const list = byLang[lang];
    const shell = shellFor(s);

    // home
    const lead = list.find((p) => p.pinned) || list[0] || null;
    const rest = list.filter((p) => p !== lead);
    const leadShare = lead && lead.cover_abs ? { image: lead.cover_abs, image_alt: lead.cover_alt || lead.title, ...sizeMeta(sizeOf(lead.cover_url)) } : {};
    page(s, 'home.html', {
      kind: 'home', active: 'home', path: s.url_home(), alts: pathsAll((x) => x.url_home()),
      meta: { title: `${shell.title} · ${s.t('brand_short')}`, description: shell.description, ...leadShare, jsonld: [websiteLd(s), blogLd(s), { '@context': 'https://schema.org', ...personLd(s, true) }] },
      extra: { lead, side: rest.slice(0, HERO_SIDE), latest: rest.slice(HERO_SIDE, HERO_SIDE + HOME_LATEST) },
    });

    // categories
    const size = config.posts_per_page;
    for (const c of cats[lang]) {
      const items = list.filter((p) => p.category?.slug === c.slug);
      const pagesN = Math.max(1, Math.ceil(items.length / size));
      for (let n = 1; n <= pagesN; n++) {
        const urlPath = s.url_category(c.slug, n);
        const title = n > 1 ? `${c.name} · ${s.t('page_n', { n })} · ${shell.title}` : `${c.name} · ${shell.title}`;
        const alts = n === 1 ? Object.fromEntries(activeLangs.filter((l) => cats[l].some((x) => x.slug === c.slug)).map((l) => [l, siteFor(l).url_category(c.slug)])) : null;
        page(s, 'category.html', {
          kind: 'category', active: c.slug, path: urlPath, alts,
          meta: {
            title,
            description: `${s.t('posts_n', { n: c.count })}${n > 1 ? ` · ${s.t('page_n', { n })}` : ''} · ${shell.description}`,
            jsonld: [blogLd(s), breadcrumbs(s, [[c.name, s.url_category(c.slug)]])],
          },
          extra: {
            category: c, items: items.slice((n - 1) * size, n * size), total: items.length, page: n, pages: pagesN,
            prev_url: n > 1 ? s.url_category(c.slug, n - 1) : null, next_url: n < pagesN ? s.url_category(c.slug, n + 1) : null,
          },
        });
      }
    }

    // posts
    list.forEach((p, i) => {
      const older = list[i + 1] || null;
      const newer = list[i - 1] || null;
      buildPost(s, p, { prev: older, next: newer, list });
    });

    // about / contact / privacy
    const aboutTitle = lang === 'zh' ? s.t('about_title', { title: `「${shell.title}」` }) : s.t('about_title', { title: ` ${shell.title}` });
    page(s, 'about.html', {
      kind: 'about', active: 'about', path: s.url_about(), alts: pathsAll((x) => x.url_about()),
      meta: {
        title: `${s.t('nav_about')} · ${shell.title}`, description: shell.description, type: 'profile',
        jsonld: [
          {
            '@context': 'https://schema.org', '@type': 'ProfilePage', '@id': s.canonical(s.url_about()), url: s.canonical(s.url_about()),
            name: aboutTitle, inLanguage: HTML_LANG[lang], isPartOf: { '@id': `${homeId(s)}#website` },
            mainEntity: {
              ...personLd(s, true),
              agentInteractionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/WriteAction', userInteractionCount: list.length },
            },
          },
          blogLd(s),
          breadcrumbs(s, [[s.t('nav_about'), s.url_about()]]),
        ],
      },
      extra: {
        about_title: aboutTitle,
        about_paras: String(shell.about || shell.bio || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean),
        profile_links: [
          ...(s.url_starnote_blog() ? [{ label: s.t('nav_starnote_blog'), url: s.url_starnote_blog() }] : []),
          ...config.links.map((l) => ({ label: loc(l.label, lang, defaultLang) || hostOf(l.url), url: l.url })),
        ],
      },
    });
    if (config.contact.length) {
      page(s, 'contact.html', {
        kind: 'contact', active: 'contact', path: s.url_contact(), alts: pathsAll((x) => x.url_contact()),
        meta: { title: `${s.t('nav_contact')} · ${shell.title}`, description: s.t('contact_sub'), jsonld: [blogLd(s), breadcrumbs(s, [[s.t('nav_contact'), s.url_contact()]])] },
      });
    }
    const ownPrivacy = path.join(contentDir, 'pages', `privacy.${lang}.html`);
    const adsOn = Boolean(seo.adsensePublisher(config.adsense));
    const starnoteOn = commentsMode === 'chenji' && posts.some((p) => starnoteOriginal(p, config.starnote));
    page(s, 'legal.html', {
      kind: 'legal', path: s.url_privacy(), alts: pathsAll((x) => x.url_privacy()),
      meta: { title: `${s.t('privacy')} · ${shell.title}`, description: s.t('privacy'), noindex: true },
      extra: {
        legal_title: s.t('privacy'),
        legal_html: existsSync(ownPrivacy) ? readFileSync(ownPrivacy, 'utf8') : '',
        legal_updated: config.privacy_updated || '',
        legal_paras: [
          s.t('privacy_intro', { owner: ownerName }), s.t('privacy_local'), s.t('privacy_host'),
          ...(adsOn ? [s.t('privacy_ads')] : []), ...(starnoteOn ? [s.t('privacy_starnote', { app: s.app_url })] : []), s.t('privacy_contact'),
        ],
      },
    });

    // feeds + Markdown twins
    const feedPosts = list.slice(0, FEED_LIMIT).map((p) => ({ ...p, url: p.canonical_url, html: absolutize(p.html, s) }));
    const feedCtx = {
      site: s, shell, owner: { name: ownerName }, posts: feedPosts, now: new Date(), content_lang: HTML_LANG[lang],
      avatar: avatarUrl ? s.absolute(avatarUrl) : '', logo: logo(s).url,
      updated: list.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '') || isoDate(new Date()),
    };
    pages.push([s.url_feed(), render(themeDir, lang, 'feed.xml', feedCtx)]);
    pages.push([s.url_atom(), render(themeDir, lang, 'atom.xml', feedCtx)]);
    for (const p of list) pages.push([s.url_post_md(p.slug), markdownDoc(s, p)]);
  }

  /** <script id="sn-cfg">: what sn.js needs on a post page (the 辰记 comments preview). */
  function snCfg(s, original) {
    return {
      lang: s.lang,
      origin: new URL(original.api).origin,
      comments: `${original.api}/blogs/${encodeURIComponent(original.handle)}/posts/${encodeURIComponent(original.key)}/comments?page=1&page_size=3`,
      comments_url: `${original.url}#comments`,
      i18n: {
        comments_none: s.t('comments_none'), comments_count: s.t('comments_count', { n: '{n}' }),
        comments_all: s.t('comments_all', { n: '{n}' }), comment_deleted: s.t('comment_deleted'),
      },
    };
  }

  function buildPost(s, p, { prev, next, list }) {
    const shell = shellFor(s);
    const urlPath = p.url_path;
    const canonical = p.canonical_url;
    const description = truncatePlain(p.summary || p.html, 160);
    const coverSize = p.cover_url ? sizeOf(p.cover_url) : null;
    const html = seo.enhanceImages(p.html, sizeOf, { eagerFirst: !p.cover_url });
    const share = p.cover_abs
      ? { image: p.cover_abs, image_alt: p.cover_alt || p.title, ...sizeMeta(coverSize), images: [p.cover_abs] }
      : { ...shareDefault(s), images: [] };
    const words = [...p.text.replace(/\s/g, '')].length;
    const versions = Object.values(p.versions).filter((v) => v.self_canonical);
    const posting = {
      '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${canonical}#article`, url: canonical,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      headline: [...p.title].slice(0, 110).join(''), name: p.title, description,
      image: share.images.length ? share.images : [share.image],
      datePublished: p.published_at, dateModified: p.updated_at, inLanguage: HTML_LANG[p.lang],
      author: [personLd(s)], publisher: personLd(s),
      isPartOf: { '@type': 'Blog', '@id': `${homeId(s)}#blog`, name: shell.title, url: homeId(s) },
      keywords: p.tags.map((t) => t.name), wordCount: words, timeRequired: `PT${p.minutes}M`, isAccessibleForFree: true,
      encoding: { '@type': 'MediaObject', encodingFormat: 'text/markdown', contentUrl: s.absolute(s.url_post_md(p.slug)) },
    };
    if (p.category) posting.articleSection = p.category.name;
    if (seo.summaryIsDistinct(p.summary, p.text)) posting.abstract = truncatePlain(p.summary, 500);
    // translations: the default-language version is the work, the others its translations
    const work = p.versions[defaultLang];
    if (work && work !== p) posting.translationOfWork = { '@id': `${work.canonical_url}#article`, url: work.canonical_url, inLanguage: HTML_LANG[defaultLang] };
    const translations = Object.values(p.versions).filter((v) => v !== p && v.lang !== defaultLang);
    if (p.lang === defaultLang && translations.length) posting.workTranslation = translations.map((v) => ({ '@id': `${v.canonical_url}#article`, url: v.canonical_url, inLanguage: HTML_LANG[v.lang] }));
    const crumbs = p.category ? [[p.category.name, s.url_category(p.category.slug)]] : [];
    const ads = adsFor('post');
    const split = ads && ads.slots.article ? seo.splitForAd(html) : null;
    const exclude = new Set([p.slug, prev?.slug, next?.slug].filter(Boolean));
    // comments: 辰记 (read-only preview of the newest 3 + 「去辰记参与讨论」) only for posts that are on 辰记
    const original = starnoteOriginal(p, config.starnote);
    const chenjiComments = commentsMode === 'chenji' && Boolean(original);
    page(s, 'post.html', {
      kind: 'post', path: urlPath,
      // hreflang only between self-canonical versions; a page whose canonical is 辰记 gets none (base.html rule)
      alts: Object.fromEntries(Object.values(p.versions).map((v) => [v.lang, v.url_path])),
      hreflangAlts: Object.fromEntries(versions.map((v) => [v.lang, v.url_path])),
      meta: {
        title: `${p.title} · ${shell.title}`, description, type: 'article', canonical,
        image: share.image, image_alt: share.image_alt || p.title, image_width: share.image_width, image_height: share.image_height,
        published: p.published_at, modified: p.updated_at, author_name: ownerName, author_url: homeId(s),
        section: p.category?.name || null, tags: p.tags.map((t) => t.name), markdown: s.url_post_md(p.slug),
        jsonld: [posting, breadcrumbs(s, [...crumbs, [p.title, urlPath]])],
      },
      extra: {
        post: p, post_key: p.slug, post_html: html, post_html_split: split,
        post_katex: html.includes('class="katex'), post_minutes: p.minutes,
        show_summary: seo.summaryIsDistinct(p.summary, p.text), show_updated: seo.wasUpdated(p.published_at, p.updated_at),
        cover_size: coverSize, toc: p.toc, prev, next,
        related: seo.relatedPosts(p, list, { exclude, limit: RELATED_LIMIT }),
        also_on: p.also_on,
        author_links: config.links.slice(0, 6).map((l) => ({ ...l, label: loc(l.label, s.lang, defaultLang) || hostOf(l.url) })),
        share: shareContext(canonical, p.title, truncatePlain(p.summary || p.html, 120), share.image, share.image_alt || p.title, Boolean(config.share.utm)),
        comments_mode: commentsMode,
        comments_on: chenjiComments,
        giscus: commentsMode === 'giscus' ? giscus : null,
        starnote_original: original,
        sn_cfg: chenjiComments ? snCfg(s, original) : null,
      },
    });
  }

  function markdownDoc(s, p, heading = '#') {
    let body = htmlToMarkdown(absolutize(p.html, s));
    if (heading !== '#') body = body.replace(/^(#{1,5}) /gm, (m, h) => `#${h} `);
    // GitHub Pages cannot send `Link: <…>; rel="canonical"` for .md files: the canonical goes first in the front
    // matter and again as the source line (SPEC-r8 §7.1)
    const front = ['---', `canonical: ${p.canonical_url}`, `title: ${yamlStr(p.title)}`, `author: ${yamlStr(ownerName)}`, `url: ${p.self_url}`,
      `published: ${p.published_at}`, `updated: ${p.updated_at}`, `language: ${HTML_LANG[p.lang]}`];
    for (const tr of p.translations) front.push(`translation_${tr.lang}: ${s.absolute(tr.href)}`);
    if (p.category) front.push(`category: ${yamlStr(p.category.name)}`);
    if (p.tags.length) front.push(`tags: [${p.tags.map((t) => yamlStr(t.name)).join(', ')}]`);
    if (p.summary) front.push(`summary: ${yamlStr(truncatePlain(p.summary, 300))}`);
    front.push('---');
    const parts = [front.join('\n'), `${heading} ${p.title}`];
    if (p.summary && seo.summaryIsDistinct(p.summary, p.text)) parts.push('> ' + truncatePlain(p.summary, 600));
    parts.push(body.trim());
    parts.push(`— ${ownerName} · ${shellFor(s).title} · <${p.canonical_url}>`);
    return parts.join('\n\n') + '\n';
  }

  // ----- 404 ----------------------------------------------------------------
  page(base, 'error.html', {
    kind: 'error', path: base.rootFile('404.html'),
    meta: { title: `${base.t('not_found_title')} · ${shellFor(base).title}`, description: base.t('not_found_title'), noindex: true, canonical: base.canonical(base.url_home()) },
    extra: { message: base.t('not_found_title') },
  });

  // ----- sitemaps (index + one per language) ---------------------------------------------
  const sitemapFiles = [];
  for (const lang of activeLangs) {
    const s = siteFor(lang);
    const list = byLang[lang];
    const newest = list.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '') || null;
    const alt = (fn, langs = activeLangs) => hreflangSet(Object.fromEntries(langs.map((l) => [l, siteFor(l).canonical(fn(siteFor(l)))])), defaultLang);
    const entries = [
      { loc: s.canonical(s.url_home()), lastmod: newest, changefreq: 'daily', priority: '1.0', alternates: alt((x) => x.url_home()) },
      { loc: s.canonical(s.url_about()), lastmod: null, changefreq: 'monthly', priority: '0.3', alternates: alt((x) => x.url_about()) },
    ];
    if (config.contact.length) entries.push({ loc: s.canonical(s.url_contact()), lastmod: null, changefreq: 'monthly', priority: '0.3', alternates: alt((x) => x.url_contact()) });
    for (const c of cats[lang]) {
      const langs = activeLangs.filter((l) => cats[l].some((x) => x.slug === c.slug));
      entries.push({ loc: s.canonical(s.url_category(c.slug)), lastmod: c.newest || newest, changefreq: 'weekly', priority: '0.6', alternates: alt((x) => x.url_category(c.slug), langs) });
    }
    for (const p of list) {
      if (!p.self_canonical) continue; // a page canonicalised to 辰记 is not ours to list
      const versions = Object.values(p.versions).filter((v) => v.self_canonical);
      entries.push({
        loc: p.self_url, lastmod: p.updated_at, changefreq: 'monthly', priority: '0.8',
        alternates: hreflangSet(Object.fromEntries(versions.map((v) => [v.lang, v.self_url])), defaultLang),
        images: p.cover_abs ? [{ loc: p.cover_abs }] : [],
      });
    }
    const file = s.url_sitemap_lang(lang);
    pages.push([file, render(themeDir, lang, 'sitemap.xml', { entries })]);
    sitemapFiles.push({ loc: s.absolute(file), lastmod: newest });
  }
  pages.push([base.url_sitemap(), render(themeDir, defaultLang, 'sitemap_index.xml', { sitemaps: sitemapFiles })]);

  // ----- robots.txt / ads.txt / llms.txt / CNAME ------------------------------------------
  pages.push([base.rootFile('robots.txt'), seo.robotsTxt({
    sitemaps: [base.absolute(base.url_sitemap())], basePath,
    aiSearch: config.robots.ai_search !== false, aiTraining: config.robots.ai_training !== false, disallowMd: Boolean(config.robots.disallow_md),
    llms: [base.absolute(base.url_llms())],
  })]);
  const adsTxt = seo.adsTxt(config.adsense);
  if (adsTxt) pages.push([base.rootFile('ads.txt'), adsTxt]);
  if (basePath && origin) {
    warn(`! 这是项目站（${origin}${basePath}/）：robots.txt${adsTxt ? '、ads.txt' : ''} 只在主机根目录生效，请把 _site${basePath === '' ? '' : ''}/robots.txt${adsTxt ? ' 与 ads.txt' : ''} 复制到 <用户名>.github.io 仓库根目录，或绑定自定义域名`);
  }
  pages.push([base.url_llms(), llmsTxt()]);
  pages.push([base.url_llms_full(), llmsFullTxt()]);
  if (config.cname) {
    if (isValidHostname(config.cname)) writeOut('CNAME', `${normalizeHostname(config.cname)}\n`);
    else warn(`! site.json cname「${String(config.cname)}」不是域名（只填主机名，如 blog.example.com），没有生成 CNAME`);
  }
  writeOut('.nojekyll', '');

  function llmsHeader() {
    const shell = shellFor(base);
    const langs = activeLangs.map((l) => HTML_LANG[l]).join(' and ');
    const lines = [`# ${shell.title}`, '', `> ${shell.description}`, ''];
    lines.push(`Blog by ${ownerName}, written in ${langs}, published with 辰记 StarNote (${base.url_platform()}) and hosted on GitHub Pages. ` +
      `Home: ${homeId(base)}. Every post has a Markdown version (linked below); please cite the canonical HTML URL.`);
    const sn = base.url_starnote_blog();
    if (sn) lines.push('', `The same author on 辰记 StarNote: ${sn}`);
    const about = truncatePlain(shell.about, 600);
    if (about && about !== shell.description) lines.push('', about);
    return lines;
  }
  function llmsTxt() {
    const lines = llmsHeader();
    for (const lang of activeLangs) {
      const s = siteFor(lang);
      const groupsByCat = new Map();
      for (const p of byLang[lang]) {
        const k = p.category?.name || '';
        if (!groupsByCat.has(k)) groupsByCat.set(k, []);
        groupsByCat.get(k).push(p);
      }
      const names = [...cats[lang].map((c) => c.name).filter((n) => groupsByCat.has(n)), ...(groupsByCat.has('') ? [''] : [])];
      for (const name of names) {
        const suffix = activeLangs.length > 1 ? ` (${HTML_LANG[lang]})` : '';
        lines.push('', `## ${name || 'Posts'}${suffix}`, '');
        for (const p of groupsByCat.get(name)) {
          const note = truncatePlain(p.summary, 200);
          let dates = `published ${p.published_at.slice(0, 10)}`;
          if (seo.wasUpdated(p.published_at, p.updated_at)) dates += `, updated ${p.updated_at.slice(0, 10)}`;
          lines.push(`- [${p.title}](${p.canonical_url}): ${note ? note + ' ' : ''}(${dates}; [Markdown](${s.absolute(s.url_post_md(p.slug))}))`);
        }
      }
    }
    lines.push('', '## About', '');
    for (const lang of activeLangs) {
      const s = siteFor(lang);
      lines.push(`- [${s.t('nav_about')}](${s.canonical(s.url_about())}): author profile and links (${HTML_LANG[lang]})`);
    }
    lines.push('', '## Optional', '', `- [Full text of recent posts](${base.absolute(base.url_llms_full())}): llms-full.txt`);
    for (const lang of activeLangs) {
      const s = siteFor(lang);
      lines.push(`- [RSS feed (${HTML_LANG[lang]})](${s.absolute(s.url_feed())})`);
    }
    lines.push(`- [Sitemap](${base.absolute(base.url_sitemap())})`);
    return lines.join('\n') + '\n';
  }
  function llmsFullTxt() {
    const all = [...posts].sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, LLMS_FULL_LIMIT);
    const parts = [llmsHeader().join('\n'), ...all.map((p) => markdownDoc(siteFor(p.lang), p, '##'))];
    return parts.join('\n\n').trimEnd() + '\n';
  }

  // ----- write ------------------------------------------------------------------
  function writeOut(rel, content) {
    const file = path.resolve(out, rel);
    // every output file stays under `out` (a URL built from content can never climb out of _site)
    if (file !== out && !file.startsWith(out + path.sep)) throw new ContentError(`输出路径越界：${rel}`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  for (const [urlPath, content] of pages) {
    let rel = decodeURIComponent(urlPath.slice(basePath.length)).replace(/^\/+/, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    writeOut(rel, content);
  }
  log(`✓ ${posts.length} 篇文章（${activeLangs.map((l) => `${l}: ${byLang[l].length}`).join('，')}），${pages.length} 个文件 → ${path.relative(process.cwd(), out) || out}`);
  log(`  网址：${origin || '(相对路径)'}${basePath || ''}/`);
  return { out, origin, basePath, posts, languages: activeLangs, files: pages.map(([p]) => p) };
}

/** Short content hash of the CSS / JS → `?v=` cache busting (Pages' CDN caches static files for 10 minutes). */
function hashDir(dir, names) {
  const h = createHash('sha1');
  for (const n of names) if (existsSync(path.join(dir, n))) h.update(readFileSync(path.join(dir, n)));
  return h.digest('hex').slice(0, 10);
}

/** `https://me.github.io/blog/en/abc/` points at `/en/abc/` (the page itself under any base / host). */
export function pointsAtSelf(url, ownPath) {
  try {
    const pathname = decodeURI(new URL(url).pathname);
    return pathname.endsWith(decodeURI(ownPath)) && !pathname.startsWith('/@');
  } catch {
    return false;
  }
}

function sizeMeta(size) {
  return size ? { image_width: size[0], image_height: size[1] } : {};
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Feeds, Markdown and llms need absolute URLs: root-relative src/href → origin + path. */
export function absolutize(html, site) {
  if (!site.origin) return html;
  return String(html).replace(/(\s(?:src|href|poster)=)(["'])(\/[^/"'][^"']*)\2/gi, (m, a, q, u) => `${a}${q}${site.origin}${u}${q}`);
}
