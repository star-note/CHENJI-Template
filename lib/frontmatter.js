// Front matter: a `---` fenced YAML block at the top of a content file, then the body (our WYSIWYG HTML).
// Zero-dependency parser for the YAML subset the template documents (SPEC-r8-github-template §2):
//   scalars (plain / "double" / 'single', numbers, true/false, null, ~), `# comments`,
//   flow lists `[a, "b c"]`, flow maps `{ slug: tech, name: 技术 }`,
//   block maps and block lists (`- item`, `- key: value` items), nested by indentation,
//   block scalars `|` / `>` (summary paragraphs).
// Dates stay strings (ISO 8601) — the builder parses them, so the original offset is kept.

export class FrontMatterError extends Error {}

const FENCE = /^﻿?---[ \t]*\r?\n/;

/** Split a file into `{ data, body }`. A file without a leading `---` has empty data. */
export function parseFrontMatter(text) {
  const src = String(text ?? '');
  const m = FENCE.exec(src);
  if (!m) return { data: {}, body: src };
  const rest = src.slice(m[0].length);
  const end = /^---[ \t]*$/m.exec(rest);
  if (!end) throw new FrontMatterError('front matter 缺少结束的 ---');
  const yaml = rest.slice(0, end.index);
  let body = rest.slice(end.index + end[0].length);
  body = body.replace(/^\r?\n/, '');
  return { data: parseYaml(yaml), body };
}

/** Parse the YAML subset into plain objects. */
export function parseYaml(yaml) {
  const lines = [];
  for (const raw of String(yaml).split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) {
      lines.push({ indent: -1, text: '', raw });
      continue;
    }
    if (/\t/.test(raw.match(/^\s*/)[0])) throw new FrontMatterError(`缩进不能用 Tab：${raw}`);
    const indent = raw.match(/^ */)[0].length;
    lines.push({ indent, text: raw.slice(indent), raw });
  }
  const state = { lines, i: 0 };
  skipBlank(state);
  if (state.i >= lines.length) return {};
  const value = parseBlock(state, lines[state.i].indent);
  skipBlank(state);
  if (state.i < lines.length) throw new FrontMatterError(`无法解析：${lines[state.i].raw}`);
  return value ?? {};
}

function skipBlank(state) {
  while (state.i < state.lines.length && state.lines[state.i].indent < 0) state.i++;
}

function parseBlock(state, indent) {
  const line = state.lines[state.i];
  if (line.text.startsWith('- ') || line.text === '-') return parseSeq(state, indent);
  return parseMap(state, indent);
}

function parseSeq(state, indent) {
  const out = [];
  for (;;) {
    skipBlank(state);
    const line = state.lines[state.i];
    if (!line || line.indent !== indent || !(line.text.startsWith('- ') || line.text === '-')) break;
    const rest = line.text === '-' ? '' : line.text.slice(2).trimStart();
    if (!rest) {
      state.i++;
      skipBlank(state);
      const next = state.lines[state.i];
      out.push(next && next.indent > indent ? parseBlock(state, next.indent) : null);
      continue;
    }
    if (isMapEntry(rest)) {
      // `- key: value` starts a map whose further keys are indented to the column after "- "
      const col = indent + (line.text.length - rest.length);
      state.lines[state.i] = { indent: col, text: rest, raw: line.raw };
      out.push(parseMap(state, col));
      continue;
    }
    state.i++;
    out.push(parseScalarOrFlow(rest));
  }
  return out;
}

function parseMap(state, indent) {
  const out = {};
  for (;;) {
    skipBlank(state);
    const line = state.lines[state.i];
    if (!line || line.indent !== indent) {
      if (line && line.indent > indent) throw new FrontMatterError(`缩进不一致：${line.raw}`);
      break;
    }
    const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#][^:]*?)\s*:(?:\s+|$)(.*)$/.exec(line.text);
    if (!m) throw new FrontMatterError(`应为「键: 值」：${line.raw}`);
    const key = unquoteKey(m[1].trim());
    const rest = stripComment(m[2]).trim();
    state.i++;
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      out[key] = blockScalar(state, indent, rest[0] === '>');
    } else if (rest === '') {
      skipBlank(state);
      const next = state.lines[state.i];
      if (next && (next.indent > indent || (next.indent === indent && next.text.startsWith('- ')))) {
        out[key] = parseBlock(state, next.indent);
      } else {
        out[key] = null;
      }
    } else {
      out[key] = parseScalarOrFlow(rest);
    }
  }
  return out;
}

function blockScalar(state, indent, folded) {
  const parts = [];
  let inner = -1;
  while (state.i < state.lines.length) {
    const line = state.lines[state.i];
    if (line.indent >= 0 && line.indent <= indent) break;
    if (line.indent < 0) {
      parts.push('');
    } else {
      if (inner < 0) inner = line.indent;
      parts.push(line.raw.slice(inner));
    }
    state.i++;
  }
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  if (!folded) return parts.join('\n');
  return parts.reduce((acc, p) => (p === '' ? acc + '\n' : acc + (acc && !acc.endsWith('\n') ? ' ' : '') + p), '');
}

function isMapEntry(text) {
  return /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#\[{"'][^:]*?)\s*:(\s|$)/.test(text);
}

function unquoteKey(k) {
  if (k.startsWith('"') || k.startsWith("'")) return parseScalar(k);
  return k;
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function parseScalarOrFlow(text) {
  const t = stripComment(text).trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    const p = { s: t, i: 0 };
    const v = flowValue(p);
    ws(p);
    if (p.i !== t.length) throw new FrontMatterError(`无法解析：${text}`);
    return v;
  }
  return parseScalar(t);
}

function ws(p) {
  while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++;
}

function flowValue(p) {
  ws(p);
  const c = p.s[p.i];
  if (c === '[') {
    p.i++;
    const out = [];
    ws(p);
    if (p.s[p.i] === ']') {
      p.i++;
      return out;
    }
    for (;;) {
      out.push(flowValue(p));
      ws(p);
      if (p.s[p.i] === ',') {
        p.i++;
        ws(p);
        if (p.s[p.i] === ']') {
          p.i++;
          return out;
        }
        continue;
      }
      if (p.s[p.i] === ']') {
        p.i++;
        return out;
      }
      throw new FrontMatterError(`列表格式错误：${p.s}`);
    }
  }
  if (c === '{') {
    p.i++;
    const out = {};
    ws(p);
    if (p.s[p.i] === '}') {
      p.i++;
      return out;
    }
    for (;;) {
      ws(p);
      const key = flowToken(p, true);
      ws(p);
      if (p.s[p.i] !== ':') throw new FrontMatterError(`对象格式错误：${p.s}`);
      p.i++;
      out[unquoteKey(key)] = flowValue(p);
      ws(p);
      if (p.s[p.i] === ',') {
        p.i++;
        continue;
      }
      if (p.s[p.i] === '}') {
        p.i++;
        return out;
      }
      throw new FrontMatterError(`对象格式错误：${p.s}`);
    }
  }
  return parseScalar(flowToken(p, false));
}

function flowToken(p, isKey) {
  const start = p.i;
  const c = p.s[p.i];
  if (c === '"' || c === "'") {
    p.i++;
    while (p.i < p.s.length) {
      if (c === '"' && p.s[p.i] === '\\') {
        p.i += 2;
        continue;
      }
      if (p.s[p.i] === c) {
        if (c === "'" && p.s[p.i + 1] === "'") {
          p.i += 2;
          continue;
        }
        p.i++;
        break;
      }
      p.i++;
    }
    return p.s.slice(start, p.i);
  }
  const stop = isKey ? /[:,\]}]/ : /[,\]}]/;
  while (p.i < p.s.length && !stop.test(p.s[p.i])) {
    // a colon inside a plain value (https://…) is fine; only ": " ends a key
    p.i++;
  }
  return p.s.slice(start, p.i).trim();
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0' };

export function parseScalar(text) {
  const t = String(text).trim();
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new FrontMatterError(`引号未闭合：${t}`);
    return t
      .slice(1, -1)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, (_, c) => ESCAPES[c] ?? c);
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new FrontMatterError(`引号未闭合：${t}`);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (/^(true|True|TRUE|yes)$/.test(t)) return true;
  if (/^(false|False|FALSE|no)$/.test(t)) return false;
  if (/^[-+]?\d+$/.test(t) && t.length < 16) return Number(t);
  if (/^[-+]?\d*\.\d+$/.test(t)) return Number(t);
  return t;
}

/** A double-quoted YAML scalar (for the Markdown twins' front matter). */
export function yamlStr(value) {
  return '"' + String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
}
