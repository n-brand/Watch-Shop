import * as THREE from 'three';
import { MATERIAL_NAMES } from '../config.js';

// Metal colours are PBR reflectance (F0). Gold slightly desaturated so it reads as metal, not yellow plastic.
export const METALS = {
  roseGold: { label: 'Roségold', color: 0xf0c3ab, swatch: '#d9a383' },
  yellowGold: { label: 'Gelbgold', color: 0xe8d0a6, swatch: '#e2c07a' },
  steel: { label: 'Edelstahl', color: 0xd2d5d9, swatch: '#c9ccd0' },
};

function dataTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.userData.mimeType = 'image/jpeg';
  return texture;
}

// Deterministic pseudo random so every build (and every saved version) looks the same
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

let surfaceMaps = null;

// Roughness maps (green channel is used): polished = faint noise + sparse micro-scratches, brushed = fine streaks along u.
// Geometry UVs are in world millimetres / 24 (see assignWorldUVs), so one tile covers 24 mm.
function getSurfaceMaps() {
  if (surfaceMaps) return surfaceMaps;
  const polished = dataTexture(512, (ctx, size) => {
    const rnd = seeded(7);
    ctx.fillStyle = 'rgb(200,200,200)';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 196 + rnd() * 10;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = rnd() * Math.PI;
      const len = 12 + rnd() * 70;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + rnd() * 0.3})`;
      ctx.lineWidth = 0.5 + rnd() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  });
  const brushed = dataTexture(512, (ctx, size) => {
    const rnd = seeded(11);
    for (let y = 0; y < size; y++) {
      const v = Math.round(170 + rnd() * 70);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, size, 1);
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
      ctx.fillRect(rnd() * size, rnd() * size, 20 + rnd() * 160, 1);
    }
  });
  surfaceMaps = { polished, brushed };
  return surfaceMaps;
}

// Per-vertex planar projection by dominant normal axis, in millimetres. Brushing runs along u:
// along Y on faces pointing to ±Z/±X (bracelet length, case sides), along X on faces pointing to ±Y.
export function assignWorldUVs(geometry, mmPerTile = 24) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [ax, ay, az] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    let u;
    let v;
    if (az >= ax && az >= ay) [u, v] = [y, x];
    else if (ax >= ay) [u, v] = [y, z];
    else [u, v] = [x, z];
    uv[i * 2] = u / mmPerTile;
    uv[i * 2 + 1] = v / mmPerTile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// Polished roughness ~0.16 (map 0.78 × 0.2), brushed ~0.31 (map ~0.8 × 0.38), metalness 1, no clearcoat.
export function createMetal(color, { brushed = false } = {}) {
  const maps = getSurfaceMaps();
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 1,
    roughness: brushed ? 0.38 : 0.2,
    roughnessMap: brushed ? maps.brushed : maps.polished,
    anisotropy: brushed ? 0.55 : 0,
    envMapIntensity: 1,
  });
}

export function createLeather(color) {
  return new THREE.MeshPhysicalMaterial({
    name: MATERIAL_NAMES.leather,
    color,
    metalness: 0,
    roughness: 0.72,
    sheen: 0.25,
    sheenRoughness: 0.7,
    sheenColor: 0x806050,
    clearcoat: 0.15,
    clearcoatRoughness: 0.5,
  });
}

export function createGlass() {
  return new THREE.MeshPhysicalMaterial({
    name: 'Sapphire',
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    ior: 1.77,
    // Anti-reflective sapphire: softbox reflections stay subtle, the faint blue tint mimics the AR coating.
    // No transmission: its extra render pass brightened the dial and costs performance.
    specularIntensity: 0.16,
    specularColor: 0xd6e4ff,
    opacity: 0.06,
    transparent: true,
    depthWrite: false,
  });
}

// Dark, satin dial: not mirror-like, sunburst and grain come from the texture
export function createDial(texture) {
  return new THREE.MeshPhysicalMaterial({
    name: MATERIAL_NAMES.dial,
    map: texture,
    metalness: 0.25,
    roughness: 0.4,
  });
}

// Defaults are the standard royal-blue dial, so every watch built in code (and every saved version) has it
export async function createDialTexture({ base = '#2f5cb8', edge = '#122a66', print = '#e3c99a' } = {}) {
  await Promise.all([
    document.fonts.load('400 100px "Cormorant Garamond"'),
    document.fonts.load('400 40px "Inter"'),
  ]).catch(() => {});

  const size = 2048;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, base);
  grad.addColorStop(1, edge);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Very fine grain so the dark dial reads as a real, slightly textured surface
  const rnd = seeded(23);
  const grain = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (rnd() - 0.5) * 7;
    grain.data[i] += n;
    grain.data[i + 1] += n;
    grain.data[i + 2] += n;
  }
  ctx.putImageData(grain, 0, 0);

  // Sunburst brushing
  ctx.save();
  ctx.translate(c, c);
  for (let i = 0; i < 1440; i++) {
    const a = (i / 1440) * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.012 + Math.abs(Math.sin(a * 2)) * 0.035 * rnd()})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * c, Math.sin(a) * c);
    ctx.stroke();
  }

  // Minute track
  ctx.strokeStyle = print;
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = (i / 60) * Math.PI * 2;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * c * 0.9, -Math.cos(a) * c * 0.9);
    ctx.lineTo(Math.sin(a) * c * 0.955, -Math.cos(a) * c * 0.955);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, c * 0.965, 0, Math.PI * 2);
  ctx.stroke();

  // Branding (the crystal emblem above the wordmark is an applied 3D part, see buildDial)
  ctx.fillStyle = print;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '22px';
  ctx.font = '400 118px "Cormorant Garamond", serif';
  ctx.fillText('ORVANE', 11, -c * 0.31);
  ctx.letterSpacing = '14px';
  ctx.font = '400 46px "Inter", sans-serif';
  ctx.fillText('AUTOMATIC', 7, c * 0.36);
  ctx.letterSpacing = '10px';
  ctx.font = '400 38px "Inter", sans-serif';
  ctx.fillText('OR-01 · 72H', 5, c * 0.445);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.userData.mimeType = 'image/jpeg'; // GLTFExporter: far smaller than PNG for this noisy texture
  return texture;
}
