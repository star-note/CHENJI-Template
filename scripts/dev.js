#!/usr/bin/env node
// npm run dev [-- --port 4000] [--no-watch] [--root <dir with content/ and theme/>]
// Builds with http://localhost:<port><base path of site.json url> and serves _site/ under that base path, so a
// project site (/repo/) previews exactly as it will be deployed. Rebuilds when content/ or theme/ changes.
import http from 'node:http';
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../lib/build.js';
import { loadConfig, ContentError } from '../lib/content.js';
import { parseBaseUrl, resolveBaseUrl } from '../lib/site.js';

const args = process.argv.slice(2);
const r = args.indexOf('--root');
const root = r >= 0 ? path.resolve(args[r + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = args.indexOf('--port');
const port = Number(i >= 0 ? args[i + 1] : process.env.PORT || 4000);
const config = loadConfig(path.join(root, 'content'));
const { basePath } = parseBaseUrl(resolveBaseUrl({ config }));
const baseUrl = `http://localhost:${port}${basePath}`;
const out = path.join(root, '_site');

function rebuild() {
  try {
    build({ root, baseUrl, env: '', drafts: true });
  } catch (e) {
    console.error(e instanceof ContentError ? `✗ 内容错误：${e.message}` : e);
  }
}
rebuild();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (basePath && !p.startsWith(basePath + '/') && p !== basePath) {
    res.writeHead(302, { Location: `${basePath}/` });
    return res.end();
  }
  p = p.slice(basePath.length) || '/';
  let file = path.join(out, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(out)) {
    res.writeHead(403);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!p.endsWith('/')) {
      res.writeHead(301, { Location: `${basePath}${p}/` });
      return res.end();
    }
    file = path.join(file, 'index.html');
  }
  let status = 200;
  if (!existsSync(file)) {
    status = 404;
    file = path.join(out, '404.html');
  }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => console.log(`→ ${baseUrl}/`));

if (!args.includes('--no-watch')) {
  let timer = null;
  for (const dir of ['content', 'theme']) {
    watch(path.join(root, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
  }
}
