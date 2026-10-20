// Nunjucks environments (one per language, so filters such as `date` know the page language) and the template
// filters — the same set as starnote-api app/web/render.py.
import nunjucks from 'nunjucks';
import path from 'node:path';
import { formatDate, formatMonth, formatNumber, rfc822, t as translate } from './i18n.js';
import { escapeHtml, truncatePlain, stripTags } from './html.js';

/** Port of components/blog/hue.ts: a stable hue (195–335) per category name. */
export function categoryHue(name) {
  let n = 0;
  for (const ch of String(name || '')) n = (n * 31 + ch.codePointAt(0)) % 4294967296;
  return 195 + (n % 140);
}

export function coverGradient(seed) {
  const h = categoryHue(seed);
  return `linear-gradient(135deg, hsl(${h} 42% 30%), hsl(${(h + 36) % 360} 48% 44%))`;
}

export function initial(text, fallback = '辰') {
  const s = String(text || '').trim();
  return s ? [...s][0] : fallback;
}

/**
 * JSON for <script type=application/ld+json>: `<`, `>`, `&` and U+2028 / U+2029 are written as `\uXXXX` so no text
 * (`</script>`, `<!--`, …) can change how the HTML parser reads the script element. Still valid JSON.
 */
export function jsonld(data) {
  const text = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return new nunjucks.runtime.SafeString(text);
}

export function hostOf(url) {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/+$/, '');
  } catch {
    return url;
  }
}

/** `[label](https://…)` → <a target=_blank>; everything else escaped (the built-in privacy text). */
export function links(value) {
  const out = [];
  let pos = 0;
  const s = String(value || '');
  for (const m of s.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    out.push(escapeHtml(s.slice(pos, m.index)));
    out.push(`<a href="${escapeHtml(m[2])}" target="_blank" rel="noreferrer">${escapeHtml(m[1])}</a>`);
    pos = m.index + m[0].length;
  }
  out.push(escapeHtml(s.slice(pos)));
  return new nunjucks.runtime.SafeString(out.join(''));
}

const envs = new Map();

export function getEnv(themeDir, lang) {
  const key = `${themeDir}|${lang}`;
  if (envs.has(key)) return envs.get(key);
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(themeDir, 'templates'), { noCache: true }), {
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true,
    throwOnUndefined: false,
  });
  env.addFilter('date', (v, style = 'long') => formatDate(v, lang, style));
  env.addFilter('month', (v) => formatMonth(v, lang));
  env.addFilter('num', formatNumber);
  env.addFilter('hue', categoryHue);
  env.addFilter('cover_gradient', coverGradient);
  env.addFilter('initial', initial);
  env.addFilter('truncate_plain', (v, n = 160) => truncatePlain(v, n));
  env.addFilter('strip_tags', stripTags);
  env.addFilter('jsonld', jsonld);
  env.addFilter('host', hostOf);
  env.addFilter('rfc822', rfc822);
  env.addFilter('links', links);
  env.addFilter('cdata', (v) => new nunjucks.runtime.SafeString(String(v || '').replace(/]]>/g, ']]]]><![CDATA[>')));
  env.addGlobal('t', (key, vars) => translate(lang, key, vars));
  envs.set(key, env);
  return env;
}

export function render(themeDir, lang, template, context) {
  return getEnv(themeDir, lang).render(template, context);
}
