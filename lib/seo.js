// SEO / GEO / ads helpers — a port of starnote-api app/web/seo.py (SPEC-r8-blog-seo-geo), configured from
// site.json instead of environment variables. Pure functions.

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/** AI search / answer engines (citations): ChatGPT search, Claude, Perplexity. */
export const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'];
/** Model-training crawlers: blocking them does not remove the blog from Google Search or the AI search bots above. */
export const AI_TRAINING_BOTS = [
  'GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent', 'Bytespider', 'Amazonbot',
];

/**
 * @param {object} o
 * @param {string[]} o.sitemaps   absolute sitemap URLs
 * @param {string} o.basePath     `/repo` on a project site ('' at the host root)
 * @param {boolean} o.aiSearch    allow the AI search group (default true)
 * @param {boolean} o.aiTraining  allow the AI training group (default true)
 * @param {boolean} o.disallowMd  keep crawlers off the `.md` twins (they cannot carry a canonical header on Pages)
 * @param {string[]} o.llms       llms.txt URLs (a comment pointer, not a directive)
 */
export function robotsTxt({ sitemaps = [], basePath = '', aiSearch = true, aiTraining = true, disallowMd = false, llms = [] }) {
  const allow = `${basePath}/`;
  const extra = disallowMd ? [`Disallow: ${basePath}/*.md$`] : [];
  const group = (agents, ok, comment) => [
    `# ${comment}`,
    ...agents.map((a) => `User-agent: ${a}`),
    ...(ok ? [`Allow: ${allow}`, ...extra] : [`Disallow: ${allow}`]),
    '',
  ];
  const lines = ['User-agent: *', `Allow: ${allow}`, ...extra, ''];
  lines.push(...group(AI_SEARCH_BOTS, aiSearch, 'AI search / answer engines (citations) — site.json robots.ai_search'));
  lines.push(...group(AI_TRAINING_BOTS, aiTraining, 'AI model training — site.json robots.ai_training'));
  lines.push(...sitemaps.map((s) => `Sitemap: ${s}`));
  lines.push(...llms.map((u) => `# LLMs: ${u}`));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// AdSense
// ---------------------------------------------------------------------------

export const ADSENSE_SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
export const ADSENSE_TAG_ID = 'f08c47fec0942fa0';
const PUB_RE = /^(?:ca-)?(pub-\d{10,20})$/;

export function adsensePublisher(adsense) {
  const m = PUB_RE.exec(String(adsense?.client || '').trim());
  return m ? m[1] : null;
}

/** What the templates need to render ads on a page of `kind`, or null = no ad code at all. */
export function adsConfig(adsense, kind) {
  const pub = adsensePublisher(adsense);
  if (!pub || !['home', 'category', 'post'].includes(kind)) return null;
  const slots = {};
  for (const name of ['article', 'end', 'rail']) {
    const v = String(adsense?.slots?.[name] || '').trim();
    if (v) slots[name] = v;
  }
  return {
    client: `ca-${pub}`,
    slots,
    // default cmp (a Google-certified CMP from AdSense → Privacy & messaging, same default as the 辰记 SSR blog);
    // `banner` = the template's own cookie bar, only for sites without EEA / UK / Swiss traffic
    consent: String(adsense?.consent || '').trim().toLowerCase() === 'banner' ? 'banner' : 'cmp',
    script: `${ADSENSE_SCRIPT}?client=ca-${pub}`,
  };
}

export function adsTxt(adsense) {
  const pub = adsensePublisher(adsense);
  if (!pub) return null;
  const lines = [`google.com, ${pub}, DIRECT, ${ADSENSE_TAG_ID}`];
  for (const l of adsense?.ads_txt_lines || []) if (String(l).trim()) lines.push(String(l).trim());
  return lines.join('\n') + '\n';
}

const AD_MIN_CHARS_BEFORE = 400;
const VOID = new Set(['img', 'br', 'hr', 'input', 'col', 'source', 'wbr', 'meta', 'link', 'area', 'embed', 'track']);

function openDepth(fragment) {
  let depth = 0;
  const re = /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
  const src = fragment.replace(/<!--[\s\S]*?-->/g, '');
  let m;
  while ((m = re.exec(src))) {
    const tag = m[2].toLowerCase();
    if (VOID.has(tag) || m[3]) continue;
    depth += m[1] ? -1 : 1;
  }
  return depth;
}

/** In-article unit: before the 2nd <h2>, else after the 4th paragraph (≥6); null when the post is too short. */
export function splitForAd(html) {
  const h2 = [...html.matchAll(/<h2[\s>]/gi)].map((m) => m.index);
  let cut = h2.length >= 2 ? h2[1] : null;
  if (cut === null) {
    const ends = [...html.matchAll(/<\/p>/gi)].map((m) => m.index + m[0].length);
    cut = ends.length >= 6 ? ends[3] : null;
  }
  if (cut === null) return null;
  const before = html.slice(0, cut).replace(/<[^>]+>/g, '').replace(/\s/g, '');
  if (before.length < AD_MIN_CHARS_BEFORE || openDepth(html.slice(0, cut)) !== 0) return null;
  return [html.slice(0, cut), html.slice(cut)];
}

// ---------------------------------------------------------------------------
// images
// ---------------------------------------------------------------------------

const IMG_RE = /<img\b([^>]*?)(\/?)>/gi;
const ATTR_RE = /([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

export function attrs(raw) {
  const out = {};
  for (const m of String(raw).matchAll(ATTR_RE)) out[m[1].toLowerCase()] = (m[2] || '').replace(/^["']|["']$/g, '');
  return out;
}

/**
 * Every body <img> gets intrinsic width/height (from `sizeOf(src)` — read from the file at build time, so no
 * layout shift), decoding=async and loading=lazy; with `eagerFirst` (no cover: the first image is the LCP
 * candidate) the first one loads eagerly with fetchpriority=high.
 */
export function enhanceImages(html, sizeOf, { eagerFirst }) {
  let first = true;
  return String(html || '').replace(IMG_RE, (whole, rawIn, self) => {
    let raw = rawIn;
    const a = attrs(raw);
    const add = [];
    const size = a.src ? sizeOf(a.src) : null;
    if (size && !('height' in a)) {
      let [w, h] = size;
      if ('width' in a && /^\d+$/.test(a.width) && Number(a.width) > 0) h = Math.round((Number(a.width) * h) / w);
      else add.push(`width="${w}"`);
      add.push(`height="${h}"`);
    }
    if (!('decoding' in a)) add.push('decoding="async"');
    if (first && eagerFirst) {
      raw = raw.replace(/\sloading=("[^"]*"|'[^']*'|\S+)/, '');
      if (!('fetchpriority' in a)) add.push('fetchpriority="high"');
    } else if (!('loading' in a)) add.push('loading="lazy"');
    first = false;
    return `<img${raw.trimEnd()}${add.length ? ' ' + add.join(' ') : ''}${self}>`;
  });
}

// ---------------------------------------------------------------------------
// article helpers
// ---------------------------------------------------------------------------

const norm = (text) => String(text || '').replace(/[\s….。]+/g, '');

/** Show the 「摘要」 block only for a written summary — not one that repeats the opening of the body. */
export function summaryIsDistinct(summary, bodyText) {
  const s = norm(summary);
  if ([...s].length < 12) return false;
  const chars = [...s];
  const head = chars.slice(0, Math.max(12, chars.length - 2)).join('');
  return !norm(bodyText).startsWith(head);
}

/** 「更新于」 when the post changed on a later (UTC) day than it was published. */
export function wasUpdated(published, updated) {
  const p = Date.parse(published);
  const u = Date.parse(updated);
  if (Number.isNaN(p) || Number.isNaN(u)) return false;
  return new Date(u).toISOString().slice(0, 10) > new Date(p).toISOString().slice(0, 10);
}

/** 相关文章: same category +3, each shared tag +1; newest first among equals; topped up with the newest others. */
export function relatedPosts(current, candidates, { exclude = new Set(), limit = 3 } = {}) {
  const cat = current.category?.slug || null;
  const tags = new Set((current.tags || []).map((t) => t.name));
  const seen = new Set(exclude);
  const scored = [];
  for (const p of candidates) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    const score = (cat && p.category?.slug === cat ? 3 : 0) + (p.tags || []).filter((t) => tags.has(t.name)).length;
    scored.push([score, p.published_at || '', p]);
  }
  scored.sort((a, b) => (b[0] - a[0]) || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0));
  return scored.slice(0, limit).map((x) => x[2]);
}
