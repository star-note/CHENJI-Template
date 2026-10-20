// Intrinsic image size (PNG, JPEG, GIF, WebP, SVG, AVIF) read from the file header — width/height on every <img>
// so images never shift the layout (CLS). Zero dependencies; returns null when the format is unknown.
import { readFileSync } from 'node:fs';

export function imageSize(file) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    return null;
  }
  return sizeOfBuffer(buf, file);
}

export function sizeOfBuffer(buf, name = '') {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
    return null;
  }
  if (buf.length >= 32 && buf.toString('ascii', 4, 8) === 'ftyp' && /avif|avis|mif1/.test(buf.toString('ascii', 8, 32))) {
    const ispe = buf.indexOf('ispe');
    if (ispe > 0 && ispe + 16 <= buf.length) return [buf.readUInt32BE(ispe + 8), buf.readUInt32BE(ispe + 12)];
  }
  if (/\.svg$/i.test(name) || buf.toString('utf8', 0, 256).includes('<svg')) {
    const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
    const tag = /<svg\b[^>]*>/i.exec(head);
    if (!tag) return null;
    const num = (attr) => {
      const m = new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(tag[0]);
      return m ? Math.round(Number(m[1])) : null;
    };
    const w = num('width');
    const h = num('height');
    if (w && h) return [w, h];
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag[0]);
    if (vb) return [Math.round(Number(vb[1])), Math.round(Number(vb[2]))];
  }
  return null;
}
