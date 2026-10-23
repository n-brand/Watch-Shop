import * as THREE from 'three';

// Display panel of the digital model (Lumen): printed mask plus a 7-segment readout, drawn on a canvas.
// map carries print and segments, emissiveMap only the lit segments, so the digits glow and the print does not.
// The panel size travels with the mesh (userData.panel, exported as glTF extras), so a saved model can be
// made live again after loading: see attachLiveDisplay.

const PX_PER_MM = 36;
const WEEKDAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];

const COLORS = {
  panel: '#060607',
  window: '#0b0a08',
  print: '#c9ad7c',
  printMuted: '#6d6150',
  lit: '#ffb347',
  glow: 'rgba(255, 170, 60, 0.55)',
  ghost: 'rgba(255, 190, 120, 0.055)',
};

// Segment order a-g: top, upper right, lower right, bottom, lower left, upper left, middle
const DIGITS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// One digit in a box w x h (px) with stroke thickness t, slanted like a real LCD
function segmentPaths(x, y, w, h, t) {
  const g = t * 0.18; // gap between neighbouring segments
  const half = h / 2;
  const hSeg = (sx, sy, len) => [[sx + g, sy], [sx + t / 2 + g, sy - t / 2], [sx + len - t / 2 - g, sy - t / 2],
    [sx + len - g, sy], [sx + len - t / 2 - g, sy + t / 2], [sx + t / 2 + g, sy + t / 2]];
  const vSeg = (sx, sy, len) => [[sx, sy + g], [sx + t / 2, sy + t / 2 + g], [sx + t / 2, sy + len - t / 2 - g],
    [sx, sy + len - g], [sx - t / 2, sy + len - t / 2 - g], [sx - t / 2, sy + t / 2 + g]];
  const l = x + t / 2;
  const r = x + w - t / 2;
  const top = y + t / 2;
  const mid = y + half;
  const bottom = y + h - t / 2;
  return {
    a: hSeg(l, top, r - l),
    b: vSeg(r, top, mid - top),
    c: vSeg(r, mid, bottom - mid),
    d: hSeg(l, bottom, r - l),
    e: vSeg(l, mid, bottom - mid),
    f: vSeg(l, top, mid - top),
    g: hSeg(l, mid, r - l),
  };
}

function fillPolygon(ctx, pts, slant, baseY) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const sx = px + (baseY - py) * slant;
    if (i) ctx.lineTo(sx, py);
    else ctx.moveTo(sx, py);
  });
  ctx.closePath();
  ctx.fill();
}

function drawDigits(layers, text, { x, y, h, slant = 0.1 }) {
  const w = h * 0.52;
  const t = h * 0.13;
  const pitch = w + h * 0.16;
  let cx = x;
  for (const ch of text) {
    if (ch === ':' || ch === '.' || ch === ' ') {
      const lit = ch !== ' ';
      const dot = (dy) => {
        for (const { ctx, lit: litOnly } of layers) {
          if (litOnly && !lit) continue;
          ctx.fillStyle = lit ? COLORS.lit : COLORS.ghost;
          ctx.beginPath();
          ctx.arc(cx + t * 0.7 + (y + h - dy) * slant, dy, t * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      if (ch === '.') dot(y + h - t / 2);
      else {
        dot(y + h * 0.3);
        dot(y + h * 0.7);
      }
      cx += t * 2.2;
      continue;
    }
    const paths = segmentPaths(cx, y, w, h, t);
    const on = DIGITS[ch] ?? '';
    for (const [seg, pts] of Object.entries(paths)) {
      const lit = on.includes(seg);
      for (const { ctx, lit: litOnly } of layers) {
        if (litOnly && !lit) continue;
        ctx.fillStyle = lit ? COLORS.lit : COLORS.ghost;
        fillPolygon(ctx, pts, slant, y + h);
      }
    }
    cx += pitch;
  }
  return cx;
}

function drawLabel(ctx, text, x, y, { size, color = COLORS.print, font = 'Inter', weight = 400, spacing = 0.25, align = 'center' }) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${weight} ${size}px "${font}", sans-serif`;
  ctx.letterSpacing = `${size * spacing}px`;
  // letterSpacing adds space after the last glyph too; shift centred text back by half of it
  ctx.fillText(text, align === 'center' ? x + (size * spacing) / 2 : x, y);
  ctx.restore();
}

function drawEmblem(ctx, x, y, h) {
  const w = h * 0.62;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = COLORS.print;
  ctx.lineJoin = 'round';
  ctx.lineWidth = h * 0.09;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, -h * 0.15);
  ctx.lineTo(0, h);
  ctx.lineTo(-w, -h * 0.15);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = h * 0.05;
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.15);
  ctx.lineTo(w, -h * 0.15);
  ctx.moveTo(0, -h);
  ctx.lineTo(-w * 0.35, -h * 0.15);
  ctx.lineTo(0, h);
  ctx.lineTo(w * 0.35, -h * 0.15);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function createDisplayPanel({ width, height }) {
  const W = Math.round(width * PX_PER_MM);
  const H = Math.round(height * PX_PER_MM);
  const mm = (v) => v * PX_PER_MM;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    return canvas;
  };
  const colorCanvas = make();
  const glowCanvas = make();
  const color = colorCanvas.getContext('2d');
  const glow = glowCanvas.getContext('2d');

  const map = new THREE.CanvasTexture(colorCanvas);
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  for (const tex of [map, emissiveMap]) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.userData.mimeType = 'image/png';
  }

  // Readout window in panel millimetres (origin top left)
  const win = { x: mm(2.2), y: mm(height * 0.3), w: W - mm(4.4), h: mm(height * 0.44) };

  let lastKey = '';
  function draw(date = new Date()) {
    const key = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    if (key === lastKey) return false;
    lastKey = key;

    // Panel: deep black with a faint vertical sheen
    const bg = color.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c0c0e');
    bg.addColorStop(0.5, COLORS.panel);
    bg.addColorStop(1, '#0a0a0b');
    color.fillStyle = bg;
    color.fillRect(0, 0, W, H);
    glow.fillStyle = '#000';
    glow.fillRect(0, 0, W, H);

    // Print on the mask: crystal emblem (outline with facet lines, as in the logo) above the wordmark
    drawEmblem(color, W / 2, mm(height * 0.075), mm(1.15));
    drawLabel(color, 'ORVANE', W / 2, mm(height * 0.16), { size: mm(2.1), font: 'Cormorant Garamond', weight: 500, spacing: 0.42 });
    drawLabel(color, 'LUMEN', W / 2, mm(height * 0.85), { size: mm(1.25), spacing: 0.5, color: COLORS.print });
    drawLabel(color, 'QUARTZ · 100M', W / 2, mm(height * 0.92), { size: mm(0.85), spacing: 0.35, color: COLORS.printMuted });
    drawLabel(color, 'LIGHT', mm(0.9), mm(height * 0.22), { size: mm(0.8), align: 'left', spacing: 0.2, color: COLORS.printMuted });
    drawLabel(color, 'MODE', mm(0.9), mm(height * 0.78), { size: mm(0.8), align: 'left', spacing: 0.2, color: COLORS.printMuted });
    drawLabel(color, 'SET', W - mm(0.9), mm(height * 0.22), { size: mm(0.8), align: 'right', spacing: 0.2, color: COLORS.printMuted });
    drawLabel(color, 'ADJ', W - mm(0.9), mm(height * 0.78), { size: mm(0.8), align: 'right', spacing: 0.2, color: COLORS.printMuted });

    // Readout window with a thin gold frame line
    color.fillStyle = COLORS.window;
    roundRect(color, win.x, win.y, win.w, win.h, mm(1.2));
    color.fill();
    color.strokeStyle = 'rgba(201, 173, 124, 0.45)';
    color.lineWidth = mm(0.12);
    color.stroke();

    const layers = [{ ctx: color, lit: false }, { ctx: glow, lit: true }];
    const pad = mm(1.4);

    // Top row: weekday and date
    const small = win.h * 0.22;
    const top = win.y + mm(0.9);
    drawLabel(color, WEEKDAYS[date.getDay()], win.x + pad, top + small / 2, { size: small * 0.95, weight: 500, spacing: 0.15, color: COLORS.lit, align: 'left' });
    drawLabel(glow, WEEKDAYS[date.getDay()], win.x + pad, top + small / 2, { size: small * 0.95, weight: 500, spacing: 0.15, color: COLORS.lit, align: 'left' });
    const dd = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const dateW = (small * 0.52 + small * 0.16) * 4 + small * 0.13 * 2.2;
    drawDigits(layers, `${dd}.${mo}`, { x: win.x + win.w - pad - dateW, y: top, h: small });

    // Main row: HH:MM large, seconds smaller on the baseline
    const big = win.h * 0.5;
    const mainY = win.y + win.h - big - mm(1.1);
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const colon = date.getSeconds() % 2 === 0 ? ':' : ' ';
    const secH = big * 0.55;
    const mainW = (big * 0.52 + big * 0.16) * 4 + big * 0.13 * 2.2 - big * 0.16;
    const secW = (secH * 0.52 + secH * 0.16) * 2;
    const startX = win.x + (win.w - mainW - secW - mm(0.8)) / 2;
    const endX = drawDigits(layers, `${hh}${colon}${mi}`, { x: startX, y: mainY, h: big });
    drawDigits(layers, ss, { x: endX + mm(0.4), y: mainY + big - secH, h: secH });

    // Soft bloom around lit segments in the glow layer
    glow.save();
    glow.globalCompositeOperation = 'lighter';
    glow.filter = `blur(${mm(0.35)}px)`;
    glow.globalAlpha = 0.6;
    glow.drawImage(glowCanvas, 0, 0);
    glow.restore();

    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;
    return true;
  }

  draw();
  return { map, emissiveMap, draw, width, height };
}

export function createDisplayMaterial(panel) {
  return new THREE.MeshPhysicalMaterial({
    name: 'DisplayPanel',
    map: panel.map,
    emissiveMap: panel.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 1.4,
    metalness: 0,
    roughness: 0.3,
  });
}

// Replaces the frozen textures of a loaded display mesh with a live panel; returns the panel (draw(date) per frame)
export function attachLiveDisplay(mesh) {
  const size = mesh.userData.panel;
  if (!size) return null;
  const panel = createDisplayPanel(size);
  const old = mesh.material;
  mesh.material = createDisplayMaterial(panel);
  if (old !== mesh.material) {
    for (const value of Object.values(old)) if (value?.isTexture) value.dispose();
    old.dispose();
  }
  return panel;
}
