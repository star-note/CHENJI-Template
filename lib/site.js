// The URL model: every link the templates print goes through here, so project sites (user.github.io/repo — a base
// path), custom domains and the /en/ language prefix are handled in one place. Mirrors the static mode of
// starnote-api app/web/render.py `Site`: directory URLs ending in `/` (served as `…/index.html`).
import { HTML_LANG, OG_LOCALE, SSR_LANG, t as translate } from './i18n.js';

/**
 * `https://user.github.io/repo/` → `{ origin: 'https://user.github.io', basePath: '/repo' }`.
 * Empty / relative input gives `{ origin: '', basePath: '' }` (links still work, but canonical / hreflang /
 * og:image cannot be absolute — the builder warns).
 */
export function parseBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { origin: '', basePath: '' };
  if (!/^https?:\/\//i.test(raw)) {
    const p = ('/' + raw.replace(/^\/+/, '')).replace(/\/+$/, '');
    return { origin: '', basePath: p === '/' ? '' : p };
  }
  const u = new URL(raw);
  const basePath = u.pathname.replace(/\/+$/, '');
  return { origin: `${u.protocol}//${u.host}`, basePath: basePath === '/' ? '' : basePath };
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** `Blog.Example.com.` → `blog.example.com` (no scheme / path / port handling: a CNAME holds a bare hostname). */
export function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

/** A bare hostname with at least two labels (what GitHub Pages accepts in `CNAME`); never a URL, path or port. */
export function isValidHostname(value) {
  const host = normalizeHostname(value);
  const labels = host.split('.');
  return host.length <= 253 && labels.length >= 2 && labels.every((l) => LABEL.test(l)) && !/^\d+$/.test(labels.at(-1));
}

/** Where the site lives: CLI `--base-url` > env SITE_URL (Actions: configure-pages base_url) > site.json url > CNAME. */
export function resolveBaseUrl({ cli, env, config }) {
  if (cli) return cli;
  if (env) return env;
  if (config?.url) return config.url;
  if (config?.cname && isValidHostname(config.cname)) return `https://${normalizeHostname(config.cname)}`;
  return '';
}

const SAFE = /[A-Za-z0-9\-._~@]/;
export function encodeSegment(s) {
  let out = '';
  for (const ch of String(s)) out += SAFE.test(ch) ? ch : encodeURIComponent(ch);
  return out;
}

export class Site {
  /**
   * @param {object} o
   * @param {string} o.origin       `https://user.github.io` (may be '')
   * @param {string} o.basePath     `/repo` or ''
   * @param {string} o.lang         `zh` | `en` — the language of the page being rendered
   * @param {string} o.defaultLang  the language served at the root (others under /<lang>/)
   * @param {string[]} o.languages
   * @param {object} o.config       site.json (normalized)
   */
  constructor({ origin, basePath, lang, defaultLang, languages, config, staticVersion = '' }) {
    this.staticVersion = staticVersion;
    this.origin = origin;
    this.basePath = basePath;
    this.lang = lang;
    this.defaultLang = defaultLang;
    this.languages = languages;
    this.config = config;
    this.htmlLang = HTML_LANG[lang];
    this.ogLocale = OG_LOCALE[lang];
    this.ssrLang = SSR_LANG[lang];
    this.theme = config.theme || 'auto';
    const sn = config.starnote || {};
    this.app_url = (sn.app_url || 'https://starnote.app').replace(/\/+$/, '');
    this.handle = sn.handle || '';
    this.is_static = true;
  }

  forLang(lang) {
    return new Site({ ...this, lang });
  }

  t(key, vars) {
    return translate(this.lang, key, vars);
  }

  langPrefix(lang = this.lang) {
    return lang === this.defaultLang ? '' : `/${lang}`;
  }

  /** `/repo/en/c/tech/` — a directory URL under the base path and the language prefix. */
  path(...segments) {
    const rest = segments.filter((s) => s !== undefined && s !== null && s !== '').map(encodeSegment).join('/');
    const prefix = `${this.basePath}${this.langPrefix()}`;
    return rest ? `${prefix}/${rest}/` : `${prefix}/`;
  }

  /** A file at the root of the site (not language-prefixed): `/repo/robots.txt`. */
  rootFile(name) {
    return `${this.basePath}/${name}`;
  }

  /** A file in the language's directory: `/repo/en/feed.xml`. */
  langFile(name) {
    return `${this.basePath}${this.langPrefix()}/${name}`;
  }

  url_home() { return this.path(); }
  url_category(slug, page = 1) { return page > 1 ? this.path('c', slug, 'page', String(page)) : this.path('c', slug); }
  url_post(slug) { return this.path(slug); }
  url_about() { return this.path('about'); }
  url_contact() { return this.path('contact'); }
  url_privacy() { return this.path('privacy'); }
  url_terms() { return this.url_privacy(); }
  url_feed() { return this.langFile('feed.xml'); }
  url_atom() { return this.langFile('atom.xml'); }
  url_sitemap() { return this.rootFile('sitemap.xml'); }
  url_sitemap_lang(lang = this.lang) { return this.rootFile(`sitemap-${lang}.xml`); }
  url_llms() { return this.rootFile('llms.txt'); }
  url_llms_full() { return this.rootFile('llms-full.txt'); }
  url_post_md(slug) { return this.langFile(`${encodeSegment(slug)}.md`); }
  url_static(name) {
    const v = this.staticVersion && /\.(css|js)$/.test(name) ? `?v=${this.staticVersion}` : '';
    return this.rootFile(`static/${name}`) + v;
  }
  url_asset(rel) { return this.rootFile(`assets/${String(rel).split('/').map(encodeSegment).join('/')}`); }

  url_platform() { return this.app_url || '/'; }
  url_register() { return `${this.app_url}/register`; }
  /** 「辰记博客」: the author's blog on StarNote (site.json starnote.blog_url, or app_url/@handle). */
  url_starnote_blog() {
    const sn = this.config.starnote || {};
    if (sn.blog_url) return sn.blog_url;
    return this.handle ? `${this.app_url}/@${this.handle}` : '';
  }
  /** No server-side search on Pages: the box submits a Google `site:` search (as_sitesearch). */
  url_search() { return 'https://www.google.com/search'; }
  search_scope() {
    const host = this.origin.replace(/^https?:\/\//, '');
    return host ? `${host}${this.basePath}` : '';
  }
  url_tag(name) {
    // Tags have no page of their own (as on SSR, where they link to the app's search): search the site for them.
    const scope = this.search_scope();
    const q = scope ? `${name} site:${scope}` : name;
    return `${this.url_search()}?q=${encodeURIComponent(q)}`;
  }

  absolute(url) {
    if (!url) return this.origin ? `${this.origin}${this.basePath}/` : '';
    if (/^(https?:)?\/\//i.test(url)) return url.startsWith('//') ? `https:${url}` : url;
    if (!this.origin) return url;
    return `${this.origin}${url.startsWith('/') ? url : '/' + url}`;
  }

  canonical(url) {
    return this.absolute(url);
  }

  get isAbsolute() {
    return /^https?:\/\//.test(this.origin);
  }
}
