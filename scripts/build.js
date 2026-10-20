#!/usr/bin/env node
// npm run build [-- --base-url https://user.github.io/repo] [--out _site] [--drafts]
// The base URL comes from (first wins): --base-url, env SITE_URL (set by the Pages workflow from
// actions/configure-pages), content/site.json "url", content/site.json "cname".
import { build } from '../lib/build.js';
import { ContentError } from '../lib/content.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
};

try {
  build({ baseUrl: opt('base-url'), out: opt('out'), drafts: args.includes('--drafts') });
} catch (e) {
  if (e instanceof ContentError) {
    console.error(`✗ 内容错误：${e.message}`);
    process.exit(1);
  }
  throw e;
}
