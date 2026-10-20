// Share helpers — a port of starnote-api app/web/share.py: the WeChat QR code (inline SVG generated at build time,
// so the share popover works without JavaScript) and the social share intents.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const cache = new Map();

/** Black on white with a 2-module quiet zone, error correction M, sized by CSS (same as segno in the SSR). */
export function qrSvg(data) {
  if (cache.has(data)) return cache.get(data);
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  const size = n + 4;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let run = 1;
      while (c + run < n && qr.isDark(r, c + run)) run++;
      d += `M${c + 2} ${r + 2}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" class="share-qr-svg"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${d}"/></svg>`;
  cache.set(data, svg);
  return svg;
}

export function withUtm(url, source, enabled = true) {
  if (!enabled) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}utm_source=${encodeURIComponent(source)}&utm_medium=social&utm_campaign=post_share`;
}

export function shareIntents(url, title, image, utm = false) {
  const t = encodeURIComponent(title);
  const u = (source) => encodeURIComponent(withUtm(url, source, utm));
  let weibo = `https://service.weibo.com/share/share.php?url=${u('weibo')}&title=${t}`;
  if (image) weibo += `&pic=${encodeURIComponent(image)}`;
  return [
    { key: 'weibo', href: weibo },
    { key: 'x', href: `https://x.com/intent/tweet?url=${u('x')}&text=${t}` },
    { key: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u('linkedin')}` },
    { key: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u('facebook')}` },
  ];
}

export function shareContext(url, title, summary, image, imageAlt, utm = false) {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = '';
  }
  return {
    url,
    title,
    summary,
    image,
    image_alt: imageAlt || title,
    host,
    qr: qrSvg(withUtm(url, 'wechat', utm)),
    native_url: withUtm(url, 'native', utm),
    intents: shareIntents(url, title, image, utm),
  };
}
