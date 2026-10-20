// Article HTML → Markdown for the `.md` twins and llms-full.txt — a port of starnote-api app/web/markdown.py so
// both sides produce the same text. Covers what the editor SDK emits: headings, paragraphs, emphasis, links, inline
// code, code blocks (div.richtext-code-block[data-language] > pre > code), lists (incl. task items), blockquotes,
// tables, figures / images, horizontal rules and KaTeX (TeX source from annotation[encoding=application/x-tex]).
import { parseHtml } from './html.js';

const SKIP = new Set(['script', 'style', 'button', 'svg', 'noscript', 'template', 'colgroup', 'iframe', 'object']);
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'details',
  'summary', 'dl', 'dt', 'dd',
]);

const isNode = (n) => typeof n === 'object' && n !== null;
const cls = (n) => new Set(String(n.attrs.class || '').split(/\s+/).filter(Boolean));

function textOf(n) {
  if (!isNode(n)) return n;
  if (SKIP.has(n.tag)) return '';
  return n.children.map(textOf).join('');
}

function tex(n) {
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.tag === 'annotation' && c.attrs.encoding === 'application/x-tex') return textOf(c).trim();
    const found = tex(c);
    if (found !== null) return found;
  }
  return null;
}

function findAll(n, tag) {
  const out = [];
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.tag === tag) out.push(c);
    out.push(...findAll(c, tag));
  }
  return out;
}

const WS = /[ \t\r\n]+/g;
const MD_ESCAPE = /([\\`*_[\]])/g;
const LIST_START = /^(?:[-*]|\d+\.) /;

function inline(nodes) {
  return nodes.map((n) => (isNode(n) ? inlineNode(n) : n.replace(WS, ' ').replace(MD_ESCAPE, '\\$1'))).join('');
}

function inlineNode(n) {
  const { tag } = n;
  const c = cls(n);
  if (SKIP.has(tag)) return '';
  if (c.has('katex') || c.has('katex-display')) {
    const t = tex(n);
    if (t !== null) return c.has('katex-display') ? `$$${t}$$` : `$${t}$`;
  }
  if (tag === 'br') return '  \n';
  if (tag === 'img') return image(n);
  if (tag === 'input' && n.attrs.type === 'checkbox') return '';
  const inner = inline(n.children);
  const s = inner.trim();
  if (tag === 'strong' || tag === 'b') return s ? `**${s}**` : '';
  if (tag === 'em' || tag === 'i') return s ? `*${s}*` : '';
  if (tag === 's' || tag === 'del' || tag === 'strike') return s ? `~~${s}~~` : '';
  if (tag === 'code') {
    const code = textOf(n);
    const fence = code.includes('`') ? '``' : '`';
    return code ? `${fence}${code}${fence}` : '';
  }
  if (tag === 'a') {
    const href = n.attrs.href || '';
    if (!href || href.startsWith('javascript:')) return inner;
    return `[${s || href}](${href})`;
  }
  return inner;
}

function image(n) {
  const src = n.attrs.src || '';
  if (!src) return '';
  const alt = String(n.attrs.alt || '').replace(WS, ' ').replace(/]/g, '\\]').trim();
  return `![${alt}](${src})`;
}

function blocks(nodes, depth = 0) {
  const out = [];
  let run = [];
  const flush = () => {
    const text = inline(run).trim();
    if (text) out.push(text);
    run = [];
  };
  for (const n of nodes) {
    if (isNode(n) && (BLOCK.has(n.tag) || cls(n).has('katex-display')) && !SKIP.has(n.tag)) {
      flush();
      out.push(...block(n, depth));
    } else if (isNode(n) && SKIP.has(n.tag)) {
      continue;
    } else {
      run.push(n);
    }
  }
  flush();
  return out.filter((b) => b.trim());
}

function block(n, depth) {
  const { tag } = n;
  const c = cls(n);
  if (c.has('katex-display')) {
    const t = tex(n);
    return t ? [`$$\n${t}\n$$`] : [];
  }
  if (/^h[1-6]$/.test(tag)) {
    const text = inline(n.children).trim();
    return text ? [`${'#'.repeat(Number(tag[1]))} ${text}`] : [];
  }
  if (tag === 'p') {
    const text = inline(n.children).trim();
    return text ? [text] : [];
  }
  if (tag === 'hr') return ['---'];
  if (tag === 'pre') return [code(n, '')];
  if (tag === 'div' && (c.has('richtext-code-block') || n.attrs['data-language'])) {
    const pre = n.children.find((x) => isNode(x) && x.tag === 'pre');
    if (pre) return [code(pre, n.attrs['data-language'] || '')];
  }
  if (tag === 'blockquote') {
    const inner = blocks(n.children, depth).join('\n\n');
    return inner ? [inner.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n')] : [];
  }
  if (tag === 'ul' || tag === 'ol') return [list(n, depth)];
  if (tag === 'table') return [table(n)];
  if (tag === 'figure') {
    const parts = [];
    for (const ch of n.children) {
      if (isNode(ch) && ch.tag === 'figcaption') {
        const cap = inline(ch.children).trim();
        if (cap) parts.push(`*${cap}*`);
      } else if (isNode(ch)) {
        const imgs = ch.tag === 'img' ? [ch] : findAll(ch, 'img');
        if (imgs.length) parts.push(...imgs.map(image));
        else parts.push(...(BLOCK.has(ch.tag) ? block(ch, depth) : [inline([ch]).trim()]));
      }
    }
    return parts.filter(Boolean);
  }
  if (tag === 'details') return blocks(n.children, depth);
  if (tag === 'summary') {
    const text = inline(n.children).trim();
    return text ? [`**${text}**`] : [];
  }
  return blocks(n.children, depth);
}

function code(pre, lang) {
  const codeNode = pre.children.find((x) => isNode(x) && x.tag === 'code');
  if (!lang && codeNode) {
    const m = /language-([\w+-]+)/.exec(codeNode.attrs.class || '');
    lang = m ? m[1] : '';
  }
  const body = textOf(codeNode || pre).replace(/\n+$/, '');
  const fence = body.includes('```') ? '````' : '```';
  return `${fence}${lang}\n${body}\n${fence}`;
}

function list(n, depth) {
  const ordered = n.tag === 'ol';
  let idx = ordered && /^\d+$/.test(n.attrs.start || '') ? Number(n.attrs.start) : 1;
  const lines = [];
  for (const li of n.children) {
    if (!isNode(li) || li.tag !== 'li') continue;
    let marker = ordered ? `${idx}.` : '-';
    idx++;
    if (li.attrs['data-type'] === 'taskItem' || li.attrs['data-checked'] !== undefined) {
      const checked = li.attrs['data-checked'] === 'true' || findAll(li, 'input').some((i) => 'checked' in i.attrs);
      marker += checked ? ' [x]' : ' [ ]';
    }
    const body = blocks(li.children, depth + 1);
    const pad = ' '.repeat(marker.length + 1);
    let text = '';
    body.forEach((b, i) => {
      text += i === 0 ? b : (LIST_START.test(b) ? '\n' : '\n\n') + b;
    });
    const [first, ...rest] = text ? text.split('\n') : [''];
    lines.push(`${marker} ${first}`.trimEnd());
    for (const line of rest) lines.push(line ? pad + line : '');
  }
  return lines.join('\n');
}

function table(n) {
  const rows = [];
  let headerRow = false;
  for (const tr of findAll(n, 'tr')) {
    const cells = tr.children.filter((x) => isNode(x) && (x.tag === 'td' || x.tag === 'th'));
    if (!rows.length && cells.length && cells.every((x) => x.tag === 'th')) headerRow = true;
    rows.push(cells.map((x) => blocks(x.children).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()));
  }
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(width - r.length).fill('')]);
  const head = headerRow ? padded[0] : Array(width).fill('');
  const body = headerRow ? padded.slice(1) : padded;
  const out = ['| ' + head.join(' | ') + ' |', '|' + Array(width).fill(' --- ').join('|') + '|'];
  for (const r of body) out.push('| ' + r.join(' | ') + ' |');
  return out.join('\n');
}

/** Article HTML → Markdown (CommonMark + GFM tables / task lists / `$` math). */
export function htmlToMarkdown(html) {
  const root = parseHtml(String(html || '').replace(/<!--[\s\S]*?-->/g, ''));
  const md = blocks(root.children).join('\n\n');
  return md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
