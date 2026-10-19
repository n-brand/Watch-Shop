// Generates the PWA / home-screen icons from the crystal emblem (logo K) as PNGs.
// Pure Node (zlib only), no packages. Usage: node tools/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const SUPERSAMPLE = 4;
const BRAND = { crystal: 'set-brilliant', color: 'yellowGold', stone: 'diamond' };

// ---- colour helpers
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const parseHsl = (css) => hslToRgb(...css.match(/[\d.]+/g).map(Number));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---- PNG encoder (RGBA, filter 0)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- rasteriser: convex polygons on a supersampled float buffer, then box-filtered down
function render(size, polygons, { emblemHeight }) {
  const S = size * SUPERSAMPLE;
  const buf = new Float32Array(S * S * 3);
  const bgEdge = hex('#0b0a09');
  const bgGlow = hex('#2a2219');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.min(1, Math.hypot(x / S - 0.5, y / S - 0.45) / 0.65);
      for (let c = 0; c < 3; c++) buf[(y * S + x) * 3 + c] = bgGlow[c] + (bgEdge[c] - bgGlow[c]) * d;
    }
  }
  // Emblem viewBox is x -0.5..0.5, y -1.04..1.04; scale so its height is emblemHeight × icon
  const scale = (emblemHeight * S) / 2.08;
  const toPx = ([x, y]) => [S / 2 + x * scale, S / 2 + y * scale];
  for (const poly of polygons) {
    const pts = poly.points.map(toPx);
    const rgb = parseHsl(poly.fill);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    const sign = Math.sign(area) || 1;
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(S - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(S - 1, Math.ceil(Math.max(...xs))); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = true;
        for (let i = 0; i < pts.length && inside; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[(i + 1) % pts.length];
          // small tolerance closes hairline seams between adjacent facets
          if (sign * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) < -0.6) inside = false;
        }
        if (inside) for (let c = 0; c < 3; c++) buf[(y * S + x) * 3 + c] = rgb[c];
      }
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const i = ((y * SUPERSAMPLE + sy) * S + (x * SUPERSAMPLE + sx)) * 3;
          acc[0] += buf[i];
          acc[1] += buf[i + 1];
          acc[2] += buf[i + 2];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(acc[0] / n);
      out[o + 1] = Math.round(acc[1] / n);
      out[o + 2] = Math.round(acc[2] / n);
      out[o + 3] = 255;
    }
  }
  return encodePng(size, out);
}

(async () => {
  // crystals.js is a browser ES module without imports; load it from source
  const source = fs.readFileSync(path.join(ROOT, 'js', 'logo', 'crystals.js'), 'utf8');
  const { CRYSTALS, crystalPolygons } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const polygons = crystalPolygons(CRYSTALS.find((c) => c.id === BRAND.crystal), BRAND);

  fs.mkdirSync(OUT, { recursive: true });
  // "any" icons: emblem fills ~72 % of the height; maskable: inside the 80 % safe zone
  const jobs = [
    ['icon-192.png', 192, 0.72],
    ['icon-512.png', 512, 0.72],
    ['icon-maskable-512.png', 512, 0.56],
    ['apple-touch-icon.png', 180, 0.62],
  ];
  for (const [file, size, emblemHeight] of jobs) {
    const png = render(size, polygons, { emblemHeight });
    fs.writeFileSync(path.join(OUT, file), png);
    console.log(`${file}  ${size}px  ${(png.length / 1024).toFixed(1)} KB`);
  }
})();
