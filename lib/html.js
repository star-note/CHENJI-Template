// A tiny, forgiving HTML parser (enough for the editor's article HTML) + text helpers. Zero dependencies.

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×', divide: '÷', laquo: '«', raquo: '»', bull: '•',
  trade: '™', deg: '°', plusmn: '±', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', le: '≤', ge: '≥', ne: '≠',
  sect: '§', para: '¶', euro: '€', yen: '¥', pound: '£', cent: '¢', zwj: '‍', zwnj: '‌', ensp: ' ', emsp: ' ', thinsp: ' ',
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED[e] ?? m;
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Element: `{ tag, attrs, children }`; text nodes are strings (entities decoded). */
export function parseHtml(html) {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const src = String(html || '');
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m;
  const top = () => stack[stack.length - 1];
  while ((m = re.exec(src))) {
    if (m.index > last) top().children.push(decodeEntities(src.slice(last, m.index)));
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const node = { tag, attrs: parseAttrs(m[3] || ''), children: [] };
      top().children.push(node);
      if (RAW_TEXT.has(tag) && !m[4]) {
        const close = src.toLowerCase().indexOf(`</${tag}`, last);
        const end = close < 0 ? src.length : close;
        node.children.push(tag === 'textarea' || tag === 'title' ? decodeEntities(src.slice(last, end)) : src.slice(last, end));
        const gt = close < 0 ? src.length : src.indexOf('>', close) + 1;
        re.lastIndex = last = gt;
      } else if (!VOID.has(tag) && !m[4]) {
        stack.push(node);
      }
    }
  }
  if (last < src.length) top().children.push(decodeEntities(src.slice(last)));
  return root;
}

function parseAttrs(raw) {
  const out = {};
  for (const a of raw.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
    const v = a[2] === undefined ? '' : a[2].replace(/^["']|["']$/g, '');
    out[a[1].toLowerCase()] = decodeEntities(v);
  }
  return out;
}

export function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ''));
}

export function truncatePlain(value, limit = 160) {
  const text = stripTags(value).replace(/\s+/g, ' ').trim();
  const chars = [...text];
  return chars.length <= limit ? text : chars.slice(0, limit - 1).join('').trimEnd() + '…';
}

export function textLength(html) {
  return [...stripTags(html).replace(/\s/g, '')].length;
}
