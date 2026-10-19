// Generates SVG placeholder images. Replace the output files with real WebP/AVIF photos later.
// Usage: node tools/make-placeholders.js
const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'assets', 'img');

const models = [
  { file: 'meridian-rose', metal: ['#f2c4a6', '#b97a5a'], dial: ['#2b2621', '#0f0d0b'], print: '#e3c99a' },
  { file: 'meridian-steel', metal: ['#f1f3f5', '#8e959c'], dial: ['#2a3038', '#0d1014'], print: '#dfe3e8' },
  { file: 'solstice-gold', metal: ['#fbe3a8', '#b8903f'], dial: ['#e9dcc0', '#b8a47c'], print: '#5a4628' },
  { file: 'abyss-steel', metal: ['#eef0f2', '#868d94'], dial: ['#1d3a66', '#081428'], print: '#dfe7f2' },
];

function watchSvg({ metal, dial, print }) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r1 = i % 3 === 0 ? 118 : 124;
    const x1 = 400 + Math.sin(a) * r1, y1 = 500 - Math.cos(a) * r1;
    const x2 = 400 + Math.sin(a) * 140, y2 = 500 - Math.cos(a) * 140;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
  const links = (y0, dir) => Array.from({ length: 6 }, (_, i) => {
    const y = y0 + dir * i * 46;
    const w = 150 - i * 4;
    return `<rect x="${400 - w / 2}" y="${y}" width="${w}" height="40" rx="10"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2a231b"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${metal[0]}"/><stop offset="1" stop-color="${metal[1]}"/></linearGradient>
    <radialGradient id="dial"><stop offset="0" stop-color="${dial[0]}"/><stop offset="1" stop-color="${dial[1]}"/></radialGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <g fill="url(#metal)" opacity="0.92">${links(80, 1)}${links(880, -1)}</g>
  <rect x="320" y="300" width="160" height="400" rx="18" fill="url(#metal)"/>
  <rect x="580" y="482" width="30" height="36" rx="6" fill="url(#metal)"/>
  <circle cx="400" cy="500" r="182" fill="url(#metal)"/>
  <circle cx="400" cy="500" r="156" fill="url(#dial)"/>
  <g stroke="${print}" stroke-width="7" stroke-linecap="round">${ticks}</g>
  <text x="400" y="440" text-anchor="middle" font-family="Georgia, serif" font-size="22" letter-spacing="6" fill="${print}">ORVANE</text>
  <g stroke="${print}" stroke-linecap="round">
    <line x1="400" y1="500" x2="455" y2="440" stroke-width="7"/>
    <line x1="400" y1="500" x2="335" y2="405" stroke-width="5"/>
  </g>
  <circle cx="400" cy="500" r="7" fill="${print}"/>
  <text x="400" y="960" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" letter-spacing="4" fill="#6f675c">PLATZHALTER</text>
</svg>
`;
}

const movementSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#2a231b"/><stop offset="1" stop-color="#0b0a09"/></radialGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfd3d8"/><stop offset="1" stop-color="#6c7178"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d79f"/><stop offset="1" stop-color="#a77c3a"/></linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <circle cx="400" cy="400" r="300" fill="url(#plate)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="10">
    ${Array.from({ length: 14 }, (_, i) => `<line x1="100" y1="${130 + i * 40}" x2="700" y2="${130 + i * 40}"/>`).join('')}
  </g>
  <path d="M400 400 L640 260 A280 280 0 0 1 660 520 Z" fill="url(#gold)" opacity="0.95"/>
  <circle cx="400" cy="400" r="70" fill="url(#gold)"/>
  <circle cx="400" cy="400" r="16" fill="#8a1c2a"/>
  <circle cx="250" cy="300" r="56" fill="none" stroke="url(#gold)" stroke-width="10"/>
  <circle cx="250" cy="300" r="10" fill="#8a1c2a"/>
  <circle cx="300" cy="540" r="42" fill="none" stroke="url(#gold)" stroke-width="8"/>
  <circle cx="300" cy="540" r="10" fill="#8a1c2a"/>
  <text x="400" y="640" text-anchor="middle" font-family="Georgia, serif" font-size="26" letter-spacing="8" fill="#3b3a38">OR-01</text>
  <text x="400" y="770" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" letter-spacing="4" fill="#6f675c">PLATZHALTER</text>
</svg>
`;

const lifestyleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2c20"/><stop offset="0.55" stop-color="#7a5636"/><stop offset="1" stop-color="#1a140f"/></linearGradient>
    <radialGradient id="sun" cx="68%" cy="52%" r="30%"><stop offset="0" stop-color="#f6d7a6" stop-opacity="0.9"/><stop offset="1" stop-color="#f6d7a6" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <rect width="1600" height="900" fill="url(#sun)"/>
  <path d="M0 640 L260 470 L420 560 L640 380 L860 560 L1040 450 L1280 600 L1600 480 L1600 900 L0 900 Z" fill="#1e1712" opacity="0.85"/>
  <path d="M0 720 L300 610 L560 690 L820 590 L1100 700 L1400 620 L1600 680 L1600 900 L0 900 Z" fill="#0f0c09"/>
  <text x="800" y="860" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" letter-spacing="5" fill="#6f675c">PLATZHALTER – EIGENES BILD EINSETZEN</text>
</svg>
`;

fs.mkdirSync(path.join(out, 'collection'), { recursive: true });
for (const m of models) fs.writeFileSync(path.join(out, 'collection', `${m.file}.svg`), watchSvg(m));
fs.writeFileSync(path.join(out, 'movement.svg'), movementSvg);
fs.writeFileSync(path.join(out, 'lifestyle.svg'), lifestyleSvg);
console.log('Placeholders written to', out);
