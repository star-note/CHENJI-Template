// UI strings and locale helpers — a port of starnote-api app/web/i18n.py (zh-CN / en tables, same keys).
// theme/i18n.json is dumped from the SSR tables; theme/i18n.github.json adds the template's own keys.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const LANGS = ['zh', 'en'];
/** Content-language codes accepted in file names / front matter → our short code. */
const ALIASES = { zh: 'zh', 'zh-cn': 'zh', 'zh-hans': 'zh', 'zh-hans-cn': 'zh', cn: 'zh', en: 'en', 'en-us': 'en', 'en-gb': 'en' };
/** BCP-47 for <html lang>, hreflang, JSON-LD inLanguage. */
export const HTML_LANG = { zh: 'zh-CN', en: 'en' };
export const OG_LOCALE = { zh: 'zh_CN', en: 'en_US' };
/** The SSR blog.js reads body[data-lang] in the SSR vocabulary. */
export const SSR_LANG = { zh: 'zh-CN', en: 'en' };

export function normalizeLang(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  return ALIASES[v] ?? ALIASES[v.split('-')[0]] ?? null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
let TABLES = null;

export function loadTables(themeDir = path.join(here, '..', 'theme')) {
  const base = JSON.parse(readFileSync(path.join(themeDir, 'i18n.json'), 'utf8'));
  const extraFile = path.join(themeDir, 'i18n.github.json');
  const extra = existsSync(extraFile) ? JSON.parse(readFileSync(extraFile, 'utf8')) : {};
  TABLES = {};
  for (const lang of LANGS) TABLES[lang] = { ...(base[lang] || {}), ...(extra[lang] || {}) };
  return TABLES;
}

export function t(lang, key, vars) {
  if (!TABLES) loadTables();
  const table = TABLES[lang] || TABLES.zh;
  const text = table[key] ?? TABLES.zh[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const MONTHS_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO 8601 with timezone (JSON-LD, sitemap, Atom): `2026-10-19T08:00:00Z`. */
export function isoDate(value) {
  const d = asDate(value);
  return d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
}

export function formatDate(value, lang, style = 'long') {
  const d = asDate(value);
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (lang === 'en') return style === 'long' ? `${MONTHS_EN[m]} ${day}, ${y}` : `${MONTHS_EN[m].slice(0, 3)} ${day}`;
  return style === 'long' ? `${y} 年 ${m} 月 ${day} 日` : `${m} 月 ${day} 日`;
}

export function formatMonth(month, lang) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return month;
  return lang === 'en' ? `${MONTHS_EN[m].slice(0, 3)} ${y}` : `${y} 年 ${m} 月`;
}

export function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.trunc(n).toLocaleString('en-US');
}

export function readingMinutes(chars) {
  return Math.max(1, Math.round((chars || 0) / 400));
}

export function rfc822(value) {
  const d = asDate(value);
  return d ? d.toUTCString().replace('GMT', '+0000') : '';
}
