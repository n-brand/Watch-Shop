import * as THREE from 'three';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { METALS } from './materials.js';

// Calibre OR-01 as seen through the Meridian's sapphire caseback, built as an open-worked movement:
// a skeletonised main plate whose pockets go down to a darker base plate, gilt wheels sunk in those pockets,
// thick ruthenium bridges with wide polished bevels and engravings, a large spoked ratchet wheel on a cross
// bridge over the barrel, the balance in its pocket under a tall cock, and an open-worked gold rotor on a
// ball bearing. Units are mm; the movement faces -Z (towards the caseback), so "higher" parts have more
// negative z. Positions are in the watch frame (seen from behind, +X appears on the left).
// Moving parts carry userData.spin (rad/s) or userData.swing ({ amp, hz }); the viewer animates them,
// and they survive glTF export as extras.

// Heights (z of the surface facing the caseback)
const Z = {
  base: -1.7, // base plate, seen at the bottom of the pockets
  plate: -2.5, // top of the skeletonised main plate
  wheel1: -1.92, // lower wheel level (wheels are 0.15 mm thick)
  wheel2: -2.18, // upper wheel level
  wheel3: -2.35, // centre wheel, above the barrel drum it overlaps
  bridgeBottom: -2.55,
  bridgeTop: -3.2,
  cockTop: -3.5,
  rotorBottom: -3.62, // underside of the rotor's rim weight
  rotorFront: -3.78, // rotor plate, side towards the movement
  rotorBack: -4.1, // rotor plate, side towards the glass
  glassInner: -4.65,
  glassOuter: -5.25,
};
const PLATE_R = 11.0;

const POS = {
  center: new THREE.Vector2(0, 0),
  third: new THREE.Vector2(3.64, -2.1),
  fourth: new THREE.Vector2(3.04, -5.5),
  escape: new THREE.Vector2(0.19, -5.5),
  lever: new THREE.Vector2(-1.6, -5.55),
  balance: new THREE.Vector2(-4.63, -5.52),
  barrel: new THREE.Vector2(-4.16, 2.4),
};
const RATCHET_R = 3.9;
const CROWN_R = 1.25;
// The crown wheel meshes with the ratchet wheel
POS.crown = POS.barrel.clone().add(new THREE.Vector2(Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)).multiplyScalar(RATCHET_R + CROWN_R - 0.12));

// ---------------------------------------------------------------- surface finishes (canvas maps, built once)

function canvasTexture(size, draw, { srgb = false, repeat = true, alpha = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = typeof draw === 'function' ? size : draw.height;
  const ctx = canvas.getContext('2d');
  (typeof draw === 'function' ? draw : draw.fn)(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (!alpha) texture.userData.mimeType = 'image/jpeg';
  return texture;
}

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

let finishes = null;
function getFinishes() {
  if (finishes) return finishes;

  // Sandblasted (frosted) ruthenium: fine, even grain. One tile = 3 mm.
  const FROST_TILE = 3;
  const frost = (kind) => canvasTexture(512, (ctx, size) => {
    const rnd = seeded(kind === 'rough' ? 13 : 17);
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = rnd();
      const v = kind === 'rough' ? 128 + (n - 0.5) * 40 : 226 + (n - 0.5) * 22;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: kind !== 'rough' });

  // Perlage for the base plate: overlapping circular grains with fine circular brushing, low contrast. Tile 6 mm.
  const PERLAGE_TILE = 6;
  const perlage = (kind) => canvasTexture(512, (ctx, size) => {
    const rnd = seeded(31);
    ctx.fillStyle = kind === 'rough' ? 'rgb(110,110,110)' : 'rgb(228,228,228)';
    ctx.fillRect(0, 0, size, size);
    const r = (0.4 / PERLAGE_TILE) * size;
    const step = r * 1.15;
    for (let row = -1; row * step * 0.87 < size + r; row++) {
      for (let col = -1; col * step < size + r; col++) {
        const cx = col * step + (row % 2 ? step / 2 : 0);
        const cy = row * step * 0.87;
        for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [size, size]]) {
          const x = cx - (cx > size - r ? ox : 0);
          const y = cy - (cy > size - r ? oy : 0);
          const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
          const v = kind === 'rough' ? 100 : 228 + rnd() * 10;
          const d = kind === 'rough' ? -14 : 14;
          g.addColorStop(0, `rgb(${v},${v},${v})`);
          g.addColorStop(1, `rgb(${v - d},${v - d},${v - d})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, { srgb: kind !== 'rough' });

  // Circular graining for the rotor, ratchet and wheels: fine concentric brushing with broad, soft bands.
  // Mapped over a disc (UV 0..1 across the diameter), so it is not tiled.
  const graining = (kind) => canvasTexture(1024, (ctx, size) => {
    const rnd = seeded(59);
    const c = size / 2;
    ctx.fillStyle = kind === 'rough' ? 'rgb(95,95,95)' : 'rgb(232,232,232)';
    ctx.fillRect(0, 0, size, size);
    for (let r = 2; r < c * 1.42; r += 1.6) {
      const band = 0.5 + 0.5 * Math.sin((r / c) * Math.PI * 9);
      const n = rnd();
      const v = kind === 'rough' ? 78 + band * 18 + n * 14 : 224 + band * 14 + n * 8;
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, { srgb: kind !== 'rough', repeat: false });

  // Circular brushing as anisotropy: per pixel the brushing direction runs around the centre (tangential),
  // encoded in tangent space as R/G in [-1, 1], strength in B. Mapped over a disc like the graining. This spreads
  // reflections into the soft radial band of a real circular-grained part instead of mirroring the softboxes
  // as hard-edged patches (which read as a "triangle" on the flat rotor hub).
  const circularAnisotropy = canvasTexture(512, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    const c = size / 2;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const ux = px + 0.5 - c;
        const uy = c - (py + 0.5); // canvas rows run down, texture v runs up
        const len = Math.hypot(ux, uy) || 1;
        const i = (py * size + px) * 4;
        img.data[i] = Math.round(((-uy / len) * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round(((ux / len) * 0.5 + 0.5) * 255);
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false, alpha: true });

  finishes = {
    circularAnisotropy,
    frost: { map: frost('color'), roughnessMap: frost('rough'), tile: FROST_TILE },
    perlage: { map: perlage('color'), roughnessMap: perlage('rough'), tile: PERLAGE_TILE },
    graining: { map: graining('color'), roughnessMap: graining('rough') },
  };
  return finishes;
}

// Engraving on top of the circular graining: lettering along a circle (centred at the top, or spread evenly
// around the full circle), readable from behind. Sizes in mm on a disc of the given radius.
function discEngraving(radius, { text, textR, letter, advance, ink, fullCircle = false, size = 1024 }) {
  const { map } = getFinishes().graining;
  return canvasTexture(size, (ctx) => {
    ctx.drawImage(map.image, 0, 0, size, size);
    const c = size / 2;
    const scale = c / radius;
    ctx.translate(c, c);
    ctx.fillStyle = ink;
    ctx.font = `500 ${letter * scale}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const r = textR * scale;
    const spacing = fullCircle ? (Math.PI * 2) / text.length : (advance * scale) / r;
    const start = -Math.PI / 2 - ((text.length - 1) * spacing) / 2;
    [...text].forEach((ch, i) => {
      ctx.save();
      ctx.rotate(start + i * spacing);
      ctx.translate(r, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }, { srgb: true, repeat: false });
}

// ---------------------------------------------------------------- materials

function createMaterials() {
  const f = getFinishes();
  const gold = METALS.yellowGold.color;
  return {
    // Ruthenium-plated, sandblasted plate and bridges (dark, matte) with bright polished bevels:
    // the contrast of matte faces and mirror chamfers is what makes the open-worked structure read in 3D
    plate: new THREE.MeshPhysicalMaterial({ name: 'Plate', color: 0x8d929a, metalness: 1, roughness: 1, envMapIntensity: 1.3, map: f.frost.map, roughnessMap: f.frost.roughnessMap }),
    base: new THREE.MeshPhysicalMaterial({ name: 'BasePlate', color: 0x6c7179, metalness: 1, roughness: 1, envMapIntensity: 1.2, map: f.perlage.map, roughnessMap: f.perlage.roughnessMap }),
    bridge: new THREE.MeshPhysicalMaterial({ name: 'Bridge', color: 0xa0a6ae, metalness: 1, roughness: 1, envMapIntensity: 1.4, map: f.frost.map, roughnessMap: f.frost.roughnessMap }),
    bevel: new THREE.MeshPhysicalMaterial({ name: 'Bevel', color: 0xeceef1, metalness: 1, roughness: 0.08, envMapIntensity: 1.5 }),
    wheel: new THREE.MeshPhysicalMaterial({ name: 'Wheel', anisotropy: 0.75, anisotropyMap: f.circularAnisotropy, color: 0xdcc292, metalness: 1, roughness: 0.75, map: f.graining.map, roughnessMap: f.graining.roughnessMap }),
    wheelEdge: new THREE.MeshPhysicalMaterial({ name: 'WheelEdge', color: 0xe4ca98, metalness: 1, roughness: 0.16 }),
    // Lathed parts (jewels, bearing, collars, screws) are double-sided, so profile direction never hides a face
    steel: new THREE.MeshPhysicalMaterial({ name: 'Steel', color: 0xd3d6da, metalness: 1, roughness: 0.14, side: THREE.DoubleSide }),
    satinSteel: new THREE.MeshPhysicalMaterial({ name: 'SatinSteel', anisotropy: 0.75, anisotropyMap: f.circularAnisotropy, color: 0xbfc3c9, metalness: 1, roughness: 0.75, map: f.graining.map, roughnessMap: f.graining.roughnessMap, side: THREE.DoubleSide }),
    blued: new THREE.MeshPhysicalMaterial({ name: 'BluedSteel', color: 0x2a3f8c, metalness: 0.95, roughness: 0.22, side: THREE.DoubleSide }),
    screw: new THREE.MeshPhysicalMaterial({ name: 'Screw', color: 0xdfe2e6, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
    ruby: new THREE.MeshPhysicalMaterial({ name: 'Ruby', color: 0xa3164a, metalness: 0, roughness: 0.04, ior: 1.77, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide }),
    chaton: new THREE.MeshPhysicalMaterial({ name: 'Chaton', color: 0xdfe2e6, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
    // Designer credit on the rotor rim, as watchmakers sign their movements
    rotor: new THREE.MeshPhysicalMaterial({ name: 'Rotor', anisotropy: 0.75, anisotropyMap: f.circularAnisotropy, color: gold, metalness: 1, roughness: 0.8, roughnessMap: f.graining.roughnessMap,
      map: discEngraving(10.45, { text: 'ORVANE  ·  AUTOMATIC  ·  OR-01  ·  DESIGN NICOLAS BRAND', textR: 9.68, letter: 0.7, advance: 0.48, ink: 'rgba(92, 78, 52, 0.8)' }) }),
    // Casing ring face: rhodium-plated, circular-grained, with black-filled lettering running all the way round
    ringFace: new THREE.MeshPhysicalMaterial({ name: 'RingFace', anisotropy: 0.75, anisotropyMap: f.circularAnisotropy, color: 0xc9ccd1, metalness: 1, roughness: 0.55, roughnessMap: f.graining.roughnessMap,
      map: discEngraving(RING_STEP + 0.05, { text: 'ORVANE  ·  CALIBRE OR-01  ·  AUTOMATIC  ·  31 JEWELS  ·  DESIGN NICOLAS BRAND  ·  '.repeat(2), textR: 10.98, letter: 0.3, ink: 'rgba(28, 30, 34, 0.9)', fullCircle: true, size: 2048 }) }),
    rotorEdge: new THREE.MeshPhysicalMaterial({ name: 'RotorEdge', color: gold, metalness: 1, roughness: 0.12 }),
    satinGold: new THREE.MeshPhysicalMaterial({ name: 'SatinGold', anisotropy: 0.75, anisotropyMap: f.circularAnisotropy, color: gold, metalness: 1, roughness: 0.7, map: f.graining.map, roughnessMap: f.graining.roughnessMap }),
    ring: new THREE.MeshPhysicalMaterial({ name: 'CasingRing', color: 0x8d9198, metalness: 1, roughness: 0.45, side: THREE.DoubleSide }),
  };
}

// ---------------------------------------------------------------- geometry helpers

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Planar UVs over the XY plane: u/v = coordinate / tile, or across a disc (uv 0..1); mirror for text read from behind
function planarUVs(geo, { tile, disc, mirror = false } = {}) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = mirror ? -pos.getX(i) : pos.getX(i);
    const y = pos.getY(i);
    if (disc) {
      uv[i * 2] = (x - (mirror ? -disc.x : disc.x)) / (2 * disc.r) + 0.5;
      uv[i * 2 + 1] = (y - disc.y) / (2 * disc.r) + 0.5;
    } else {
      uv[i * 2] = x / tile;
      uv[i * 2 + 1] = y / tile;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Solid part from an outline: spans zFront (towards the dial) to zBack (towards the caseback).
// Caps get `face`, side walls and bevels get `edge` (ExtrudeGeometry groups 0 and 1): finished faces with
// polished, chamfered edges, like real movement parts.
function solid(shape, zFront, zBack, face, edge, { bevel = 0.05, uvs, curveSegments = 12, bevelSegments = 2 } = {}) {
  const depth = Math.max(zFront - zBack - 2 * bevel, 0.005);
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments,
  });
  geo.translate(0, 0, zBack + bevel);
  geo.deleteAttribute('normal');
  geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(40));
  if (uvs) planarUVs(geo, uvs);
  else geo.deleteAttribute('uv'); // untextured parts: UVs would only add file size
  // Creasing leaves every triangle with its own corners; welding identical corners (same position, normal
  // and UV) brings saved models back to a sensible size without changing how they look
  geo = mergeVertices(geo, 1e-5);
  return shadowed(new THREE.Mesh(geo, edge ? [face, edge] : face));
}

// Lathe around Z from [r, z] profile points
function lathe(points, segments = 48) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.001), z)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// ---------------------------------------------------------------- outlines from distance fields
// Plate and bridges are unions of capsules and discs with smooth fillets; their outline is traced from the
// signed distance field with marching squares and simplified (Douglas-Peucker), which gives soft, machined
// transitions without a flood of vertices.

const v2 = (x, y) => new THREE.Vector2(x, y);
const sdf = {
  circle: (c, r) => (p) => Math.hypot(p.x - c.x, p.y - c.y) - r,
  capsule: (a, b, r) => (p) => {
    const bax = b.x - a.x;
    const bay = b.y - a.y;
    const h = THREE.MathUtils.clamp(((p.x - a.x) * bax + (p.y - a.y) * bay) / (bax * bax + bay * bay), 0, 1);
    return Math.hypot(p.x - a.x - bax * h, p.y - a.y - bay * h) - r;
  },
  smoothUnion: (k, ...fs) => (p) => fs.map((f) => f(p)).reduce((a, b) => {
    const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
    return b * (1 - h) + a * h - k * h * (1 - h);
  }),
  union: (...fs) => (p) => Math.min(...fs.map((f) => f(p))),
  subtract: (f, ...cuts) => (p) => Math.max(f(p), ...cuts.map((c) => -c(p))),
  intersect: (...fs) => (p) => Math.max(...fs.map((f) => f(p))),
  ring: (c, r0, r1) => (p) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - (r0 + r1) / 2) - (r1 - r0) / 2,
};

// Douglas-Peucker on a closed loop
function simplify(points, tolerance) {
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let max = 0;
    let index = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max <= tolerance) return [a, b];
    const left = rdp(pts.slice(0, index + 1));
    return [...left.slice(0, -1), ...rdp(pts.slice(index))];
  };
  const half = Math.floor(points.length / 2);
  const first = rdp(points.slice(0, half + 1));
  const second = rdp([...points.slice(half), points[0]]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function shapeFromSdf(field, { min, max, step = 0.04, tolerance = 0.006 }) {
  const nx = Math.ceil((max.x - min.x) / step) + 1;
  const ny = Math.ceil((max.y - min.y) / step) + 1;
  const v = new Float32Array(nx * ny);
  const p = new THREE.Vector2();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // Outside the box counts as outside, so every contour closes
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      v[j * nx + i] = edge ? 1 : field(p.set(min.x + i * step, min.y + j * step));
    }
  }
  const at = (i, j) => v[j * nx + i];
  const point = new Map();
  const edgePoint = (dir, i, j) => {
    const k = `${dir}${i},${j}`;
    if (!point.has(k)) {
      const [i2, j2] = dir === 'h' ? [i + 1, j] : [i, j + 1];
      const a = at(i, j);
      const t = a / (a - at(i2, j2));
      point.set(k, new THREE.Vector2(min.x + (i + (i2 - i) * t) * step, min.y + (j + (j2 - j) * t) * step));
    }
    return k;
  };
  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b);
    links.get(b).push(a);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c = (at(i, j) < 0 ? 1 : 0) | (at(i + 1, j) < 0 ? 2 : 0) | (at(i + 1, j + 1) < 0 ? 4 : 0) | (at(i, j + 1) < 0 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const bottom = () => edgePoint('h', i, j);
      const top = () => edgePoint('h', i, j + 1);
      const left = () => edgePoint('v', i, j);
      const right = () => edgePoint('v', i + 1, j);
      const centre = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < 0;
      switch (c) {
        case 1: case 14: link(left(), bottom()); break;
        case 2: case 13: link(bottom(), right()); break;
        case 3: case 12: link(left(), right()); break;
        case 4: case 11: link(right(), top()); break;
        case 6: case 9: link(bottom(), top()); break;
        case 7: case 8: link(left(), top()); break;
        case 5:
          if (centre) { link(left(), top()); link(bottom(), right()); } else { link(left(), bottom()); link(right(), top()); }
          break;
        case 10:
          if (centre) { link(left(), bottom()); link(right(), top()); } else { link(left(), top()); link(bottom(), right()); }
          break;
        default: break;
      }
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of links.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let prev = null;
    let cur = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(point.get(cur));
      const next = links.get(cur).find((n) => n !== prev && !used.has(n));
      prev = cur;
      cur = next;
    }
    if (loop.length > 8) loops.push(simplify(loop, tolerance));
  }
  const area = (pts) => pts.reduce((s, q, i) => {
    const r = pts[(i + 1) % pts.length];
    return s + q.x * r.y - r.x * q.y;
  }, 0) / 2;
  const inside = (pt, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) && pt.x < ((poly[j].x - poly[i].x) * (pt.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) hit = !hit;
    }
    return hit;
  };
  // Every loop not inside another loop is an outline of its own (a field may give several islands);
  // loops inside an outline are its holes
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const shapes = [];
  for (const loop of loops) {
    const parent = shapes.find((s) => inside(loop[0], s.points));
    if (parent && !parent.holeOf) {
      parent.shape.holes.push(new THREE.Path(area(loop) > 0 ? [...loop].reverse() : loop));
    } else {
      shapes.push({ points: loop, shape: new THREE.Shape(area(loop) < 0 ? [...loop].reverse() : loop) });
    }
  }
  return shapes.map((s) => s.shape);
}

const insidePlate = sdf.circle(v2(0, 0), PLATE_R - 0.05);
// Bridges end inside the casing ring (see buildCasingRing)
const RING_INNER = 10.62;
const insideRing = sdf.circle(v2(0, 0), RING_INNER - 0.04);
const bounds = (x0, y0, x1, y1, step) => ({ min: v2(x0, y0), max: v2(x1, y1), step });

// Bridge from a distance field: matte top, wide polished bevel. Screws [{ x, y, angle, r }] are sunk into
// counterbores: the hole gets the same polished bevel as every other edge, the head stands just proud of the top
function bridge(m, field, box, zFront, zBack, { bevel = 0.12, name, screws = [] } = {}) {
  const group = new THREE.Group();
  if (name) group.name = name;
  const holes = screws.map((s) => sdf.circle(v2(s.x, s.y), (s.r ?? 0.42) + 0.06));
  for (const shape of shapeFromSdf(sdf.subtract(sdf.intersect(field, insideRing), ...holes), box)) {
    group.add(solid(shape, zFront, zBack, m.bridge, m.bevel, { bevel, bevelSegments: 3, uvs: { tile: getFinishes().frost.tile } }));
  }
  for (const s of screws) group.add(sunkScrew(m, s.x, s.y, zFront, zBack, { r: s.r, slotAngle: s.angle }));
  return group;
}

// ---------------------------------------------------------------- small parts

// Slotted screw: domed, polished head cut by a real slot (two half heads with a gap), seated on zSeat
function screw(material, x, y, zSeat, { r = 0.42, slotAngle = 0, h = 0.13 } = {}) {
  const group = new THREE.Group();
  const profile = [[r, 0], [r, h * 0.45], [r * 0.82, h * 0.85], [r * 0.4, h], [0.001, h]];
  const gap = r * 0.16;
  for (const side of [0, 1]) {
    // Half 0 covers x >= 0, half 1 x <= 0; pushed apart along X they leave the slot (along Y) between them
    const geo = new THREE.LatheGeometry(profile.map(([pr, pz]) => new THREE.Vector2(pr, pz)), 20, side * Math.PI, Math.PI);
    geo.rotateX(-Math.PI / 2); // lathe height -> -Z (towards the caseback)
    const half = shadowed(new THREE.Mesh(geo, material));
    half.position.x = side ? -gap / 2 : gap / 2;
    group.add(half);
  }
  group.rotation.z = slotAngle;
  group.position.set(x, y, zSeat);
  return group;
}

// Screw sunk into a counterbore of a part spanning zFront..zBack: shank through the hole, head top 0.04 mm proud
function sunkScrew(m, x, y, zFront, zBack, { r = 0.42, slotAngle = 0, h = 0.13 } = {}) {
  const group = new THREE.Group();
  const seat = zBack + h - 0.04;
  group.add(screw(m.screw, x, y, seat, { r, slotAngle, h }));
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, Math.abs(zFront - seat), 16).rotateX(Math.PI / 2), m.steel);
  shank.position.set(x, y, (zFront + seat) / 2);
  group.add(shank);
  return group;
}

// Jewel bearing: polished steel chaton (as on modern bridges) with a ruby whose oil sink and pivot are geometry
function jewel(m, x, y, zSeat, size = 1) {
  const group = new THREE.Group();
  const s = size;
  const chaton = shadowed(new THREE.Mesh(lathe([
    [0.34 * s, zSeat], [0.56 * s, zSeat], [0.56 * s, zSeat - 0.03], [0.48 * s, zSeat - 0.07], [0.34 * s, zSeat - 0.07],
  ], 32), m.chaton));
  const stone = shadowed(new THREE.Mesh(lathe([
    [0.07 * s, zSeat - 0.01], [0.34 * s, zSeat - 0.01], [0.34 * s, zSeat - 0.08], [0.28 * s, zSeat - 0.09], [0.12 * s, zSeat - 0.05],
  ], 32), m.ruby));
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.08, 10).rotateX(Math.PI / 2), m.steel);
  pivot.position.z = zSeat - 0.04;
  group.add(chaton, stone, pivot);
  group.position.set(x, y, 0);
  return group;
}

// Engraved lettering on a bridge: light-filled letters on a thin decal just above the surface, readable from behind
function engraving(text, x, y, zSurface, angle, height = 0.5) {
  const fontPx = 64;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `500 ${fontPx}px "Inter", sans-serif`;
  measure.letterSpacing = `${fontPx * 0.18}px`;
  const w = Math.ceil(measure.measureText(text).width + fontPx * 0.6);
  const texture = canvasTexture(w, {
    height: fontPx * 1.4,
    fn: (ctx, cw, ch) => {
      ctx.font = `500 ${fontPx}px "Inter", sans-serif`;
      ctx.letterSpacing = `${fontPx * 0.18}px`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cw / 2 + fontPx * 0.09, ch / 2);
    },
  }, { srgb: true, repeat: false, alpha: true });
  const plane = new THREE.PlaneGeometry((height * w) / (fontPx * 1.4), height);
  plane.rotateY(Math.PI); // face the caseback; text reads left to right from behind
  const mesh = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({
    name: 'Engraving', color: 0xd9dbde, map: texture, transparent: true, metalness: 0.2, roughness: 0.6,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  mesh.position.set(x, y, zSurface - 0.004);
  // Keep lettering upright: its up direction (-sin, cos) must point up the movement, whichever way the arm runs
  mesh.rotation.z = Math.cos(angle) < 0 ? angle + Math.PI : angle;
  mesh.receiveShadow = true;
  return mesh;
}

// Wheel outline: `teeth` teeth with rounded tips on radius r (0 = plain rim), spokes cut out
function wheelShape(r, teeth, { tooth = 0.16, spokes = 0, hub = 0.55, rim = 0.32, spokeW = 0.26, ratchet = false } = {}) {
  const s = new THREE.Shape();
  if (teeth) {
    const root = r - tooth;
    const pitch = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * pitch;
      const pts = ratchet
        ? [[root, a], [r, a + pitch * 0.82], [r - tooth * 0.15, a + pitch * 0.88], [root, a + pitch * 0.9]]
        : [[root, a], [r - tooth * 0.35, a + pitch * 0.1], [r, a + pitch * 0.2], [r, a + pitch * 0.32], [r - tooth * 0.35, a + pitch * 0.42], [root, a + pitch * 0.52]];
      pts.forEach(([rad, ang], k) => {
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0 && k === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      });
    }
    s.closePath();
  } else {
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
  }
  if (spokes) {
    const outer = r - tooth - rim;
    const half = spokeW / 2;
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2;
      const a1 = ((k + 1) / spokes) * Math.PI * 2;
      const hole = new THREE.Path();
      hole.moveTo(Math.cos(a0 + half / hub) * hub, Math.sin(a0 + half / hub) * hub);
      hole.lineTo(Math.cos(a0 + half / outer) * outer, Math.sin(a0 + half / outer) * outer);
      hole.absarc(0, 0, outer, a0 + half / outer, a1 - half / outer, false);
      hole.lineTo(Math.cos(a1 - half / hub) * hub, Math.sin(a1 - half / hub) * hub);
      hole.absarc(0, 0, hub, a1 - half / hub, a0 + half / hub, true);
      s.holes.push(hole);
    }
  }
  return s;
}

function gear(m, r, teeth, zFront, thick, opts = {}) {
  return solid(wheelShape(r, teeth, opts), zFront, zFront - thick, m.wheel, m.wheelEdge, {
    bevel: 0, curveSegments: 6, uvs: { disc: { x: 0, y: 0, r } },
  });
}

function pinion(m, r, zFront, thick) {
  return solid(wheelShape(r, 8, { tooth: Math.min(0.14, r * 0.3) }), zFront, zFront - thick, m.steel, m.steel, { bevel: 0, curveSegments: 4 });
}

function arbor(m, zFront, zBack, r = 0.12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, zFront - zBack, 12).rotateX(Math.PI / 2), m.steel);
  mesh.position.z = (zFront + zBack) / 2;
  return mesh;
}

// ---------------------------------------------------------------- assemblies

// Pockets cut into the main plate around every moving part; they go down to the base plate
const R = { center: 3.6, third: 2.9, fourth: 2.4, escape: 1.5, barrel: 4.2, balance: 2.05 };
const pockets = sdf.smoothUnion(0.6,
  sdf.circle(POS.center, R.center + 0.3),
  sdf.circle(POS.third, R.third + 0.3),
  sdf.circle(POS.fourth, R.fourth + 0.3),
  sdf.circle(POS.escape, R.escape + 0.3),
  sdf.circle(POS.barrel, R.barrel + 0.3),
  sdf.circle(POS.balance, R.balance + 0.45),
  sdf.capsule(POS.escape, POS.lever, 0.9),
  sdf.capsule(POS.lever, POS.balance, 0.6),
);

function buildPlates(m) {
  const group = new THREE.Group();
  group.name = 'MainPlate';
  // Base plate with perlage, seen at the bottom of every pocket
  const base = new THREE.Shape().absarc(0, 0, PLATE_R, 0, Math.PI * 2, false);
  group.add(solid(base, Z.base + 0.3, Z.base, m.base, m.base, { bevel: 0, curveSegments: 96, uvs: { tile: getFinishes().perlage.tile } }));
  // Skeletonised main plate: what is left between the pockets, with polished bevels on every opening
  for (const shape of shapeFromSdf(sdf.intersect(insidePlate, (p) => -pockets(p)), bounds(-11.2, -11.2, 11.2, 11.2, 0.05))) {
    group.add(solid(shape, Z.base, Z.plate, m.plate, m.bevel, { bevel: 0.1, bevelSegments: 3, uvs: { tile: getFinishes().frost.tile } }));
  }
  return group;
}

// Casing ring: a solid ring from the base plate up to just under the glass, holding the movement in the case.
// Its inner wall (frosted ruthenium like the plate) and polished top edge close the gap between movement and
// case, which otherwise read as empty space; the rotor (r 10.45) turns freely inside it.
// It is stepped: the inner part stays below the sapphire, the outer part (outside the glass, r > 11.45) reaches
// up to just under the caseback and out to the middle case. The case itself is a thin outer skin, so without
// the outer part one could look sideways under the caseback into the hollow case (crown stem, lug insides).
const RING_STEP = 11.45; // just outside the caseback glass (r 11.35)
function buildCasingRing(m) {
  const group = new THREE.Group();
  group.name = 'CasingRing';
  const annulus = (r0, r1) => {
    const s = new THREE.Shape().absarc(0, 0, r1, 0, Math.PI * 2, false);
    s.holes.push(new THREE.Path().absarc(0, 0, r0, 0, Math.PI * 2, true));
    return s;
  };
  const frost = { tile: getFinishes().frost.tile };
  // Inner part: engraved, circular-grained face; its polished inner wall is fluted (96 shallow grooves),
  // so it breaks the light into fine stripes instead of one plain grey band
  const inner = annulus(RING_INNER, RING_STEP + 0.05);
  const flutes = 96;
  const fluted = new THREE.Path();
  for (let k = 0; k < flutes; k++) {
    for (let j = 0; j < 8; j++) {
      const t = j / 8; // 0..1 across one groove, cusp at t = 0
      const a = -((k + t) / flutes) * Math.PI * 2; // clockwise, as holes must run
      const r = RING_INNER + 0.07 * Math.sqrt(Math.sin(t * Math.PI));
      if (k === 0 && j === 0) fluted.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else fluted.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  fluted.closePath();
  inner.holes = [fluted];
  group.add(solid(inner, Z.base + 0.3, Z.glassInner + 0.2, m.ringFace, m.bevel, {
    bevel: 0.08, bevelSegments: 3, curveSegments: 160, uvs: { disc: { x: 0, y: 0, r: RING_STEP + 0.05 }, mirror: true },
  }));
  // The outer part only closes the view; it casts no shadow (its shadow edge stepped along the window rim)
  const outer = solid(annulus(RING_STEP, 17.55), Z.base + 0.3, -4.92, m.plate, m.plate, {
    bevel: 0.04, bevelSegments: 1, curveSegments: 160, uvs: frost,
  });
  outer.castShadow = false;
  group.add(outer);
  return group;
}

function buildGearTrain(m) {
  const group = new THREE.Group();
  group.name = 'GearTrain';
  // Each wheel meshes with the next arbor's pinion; the fourth wheel turns once a minute (seconds hand)
  const SECONDS = (Math.PI * 2) / 60;
  const P = { third: 0.55, fourth: 0.5, escape: 0.45 };
  const wFourth = SECONDS;
  const wThird = -wFourth * (P.fourth / R.third);
  const wCenter = -wThird * (P.third / R.center);
  const wEscape = -wFourth * (R.fourth / P.escape);
  const wheels = [
    ['CenterWheel', POS.center, R.center, 80, 5, Z.wheel3, null, wCenter],
    ['ThirdWheel', POS.third, R.third, 72, 5, Z.wheel2, [P.third, Z.wheel3], wThird],
    ['FourthWheel', POS.fourth, R.fourth, 70, 4, Z.wheel1, [P.fourth, Z.wheel2], wFourth],
    ['EscapeWheel', POS.escape, R.escape, 15, 3, Z.wheel2, [P.escape, Z.wheel1], wEscape],
  ];
  for (const [name, pos, r, teeth, spokes, level, pin, spin] of wheels) {
    const a = new THREE.Group();
    a.name = name;
    a.position.set(pos.x, pos.y, 0);
    a.userData.spin = spin;
    const escape = name === 'EscapeWheel';
    a.add(gear(m, r, teeth, level, 0.15, { tooth: escape ? 0.34 : 0.16, spokes, hub: Math.min(0.55, r * 0.3), ratchet: escape }));
    if (pin) a.add(pinion(m, pin[0], pin[1], 0.15));
    a.add(arbor(m, Z.base, Z.bridgeBottom));
    group.add(a);
  }
  return { group, wCenter };
}

function buildBarrel(m, wCenter) {
  const group = new THREE.Group();
  group.name = 'BarrelAssembly';
  // Barrel drum: toothed, driving the centre pinion; it turns very slowly
  const drum = new THREE.Group();
  drum.name = 'Barrel';
  drum.position.set(POS.barrel.x, POS.barrel.y, 0);
  drum.userData.spin = -wCenter * (0.6 / R.barrel);
  drum.add(gear(m, R.barrel, 96, Z.base - 0.12, 0.42, { tooth: 0.18 }));
  // Barrel cover with the mainspring arbor, visible through the cross bridge
  drum.add(solid(new THREE.Shape().absarc(0, 0, R.barrel - 0.5, 0, Math.PI * 2, false), Z.base - 0.54, Z.base - 0.6, m.satinSteel, m.steel, {
    bevel: 0, curveSegments: 64, uvs: { disc: { x: 0, y: 0, r: R.barrel - 0.5 } },
  }));
  group.add(drum);

  // Cross bridge over the barrel: two arms crossing at the barrel arbor, plus an arm to the crown wheel
  const field = sdf.smoothUnion(0.7,
    sdf.capsule(v2(-8.75, 4.1), v2(-0.6, 0.9), 0.75),
    sdf.capsule(v2(-6.9, -1.4), v2(-2.2, 6.6), 0.75),
    sdf.circle(POS.barrel, 1.25),
    sdf.capsule(POS.barrel, POS.crown, 0.8),
    sdf.circle(POS.crown, 0.95),
    sdf.circle(v2(-8.75, 4.1), 0.8),
    sdf.circle(v2(-6.7, -1.2), 0.95),
  );
  group.add(bridge(m, field, bounds(-11.2, -3, 1, 9, 0.04), Z.bridgeBottom, Z.bridgeTop, {
    name: 'BarrelBridge', screws: [{ x: -8.75, y: 4.1, angle: 0.3 }, { x: -6.7, y: -1.2, angle: 1.9 }],
  }));

  // Large ratchet wheel with six spokes on top: satin steel, polished bevel; the bridge shows between its spokes.
  // The rotor winds it continuously; shown faster than real (one turn in 40 s) so the winding is visible.
  // It turns counter-clockwise, so the click slides up the tooth ramps; the crown wheel meshes with it.
  const top = Z.bridgeTop - 0.01;
  const wRatchet = (Math.PI * 2) / 40;
  const ratchet = new THREE.Group();
  ratchet.name = 'RatchetWheel';
  ratchet.position.set(POS.barrel.x, POS.barrel.y, 0);
  ratchet.userData.spin = wRatchet;
  ratchet.add(solid(wheelShape(RATCHET_R, 54, { tooth: 0.22, ratchet: true, spokes: 6, hub: 1.05, rim: 0.42, spokeW: 0.42 }), top, top - 0.18,
    m.satinSteel, m.bevel, { bevel: 0.03, bevelSegments: 2, curveSegments: 8, uvs: { disc: { x: 0, y: 0, r: RATCHET_R } } }));
  ratchet.add(screw(m.screw, 0, 0, top - 0.18, { r: 0.62, slotAngle: 0.4 }));
  group.add(ratchet);

  const crown = new THREE.Group();
  crown.name = 'CrownWheel';
  crown.position.set(POS.crown.x, POS.crown.y, 0);
  crown.userData.spin = -wRatchet * (RATCHET_R / CROWN_R);
  crown.add(solid(wheelShape(CROWN_R, 30, { tooth: 0.16, spokes: 0 }), top, top - 0.14, m.satinSteel, m.bevel, {
    bevel: 0.02, curveSegments: 6, uvs: { disc: { x: 0, y: 0, r: CROWN_R } },
  }));
  crown.add(screw(m.screw, 0, 0, top - 0.14, { r: 0.4, slotAngle: 1.2 }));
  group.add(crown);

  // Click: the pawl that keeps the ratchet from unwinding; it pivots on the bridge arm just outside the ratchet
  const toFoot = v2(-8.75, 4.1).sub(POS.barrel).normalize();
  const clickAt = POS.barrel.clone().addScaledVector(toFoot, RATCHET_R + 0.75);
  const tip = POS.barrel.clone().addScaledVector(toFoot.clone().rotateAround(v2(0, 0), 0.22), RATCHET_R - 0.08);
  for (const shape of shapeFromSdf(sdf.smoothUnion(0.3, sdf.capsule(clickAt, tip, 0.22), sdf.circle(clickAt, 0.45)),
    bounds(clickAt.x - 1, clickAt.y - 1, tip.x + 1, tip.y + 1, 0.02))) {
    group.add(solid(shape, top, top - 0.1, m.steel, m.bevel, { bevel: 0.02 }));
  }
  group.add(screw(m.screw, clickAt.x, clickAt.y, top - 0.1, { r: 0.3, slotAngle: 2.1 }));
  return group;
}

function buildTrainBridge(m) {
  const group = new THREE.Group();
  const footA = v2(8.7, -1.3);
  const footB = v2(6.4, -7.05);
  const field = sdf.smoothUnion(0.6,
    sdf.capsule(POS.third, POS.fourth, 0.65),
    sdf.capsule(POS.fourth, POS.escape, 0.6),
    sdf.capsule(POS.third, footA, 0.85),
    sdf.capsule(POS.fourth, footB, 0.85),
    sdf.circle(POS.third, 0.85), sdf.circle(POS.fourth, 0.85), sdf.circle(POS.escape, 0.75),
    sdf.circle(footA, 1.05), sdf.circle(footB, 0.9),
  );
  group.add(bridge(m, field, bounds(-1.5, -9.5, 11, 0.5, 0.04), Z.bridgeBottom, Z.bridgeTop, {
    name: 'TrainBridge', screws: [{ x: footA.x, y: footA.y, angle: 0.8 }, { x: footB.x, y: footB.y, angle: 2.4 }],
  }));
  for (const p of [POS.third, POS.fourth, POS.escape]) group.add(jewel(m, p.x, p.y, Z.bridgeTop, 0.9));
  const along = Math.atan2(footA.y - POS.third.y, footA.x - POS.third.x);
  // Centred between the foot screw and the third-wheel jewel; 0.3 mm letters fit the ~3.9 mm between them
  group.add(engraving('ORVANE  CAL. OR-01', (POS.third.x + footA.x) / 2, (POS.third.y + footA.y) / 2, Z.bridgeTop, along + Math.PI, 0.3));
  const alongB = Math.atan2(footB.y - POS.fourth.y, footB.x - POS.fourth.x);
  group.add(engraving('31 JEWELS', (POS.fourth.x + footB.x) / 2 + 0.1, (POS.fourth.y + footB.y) / 2, Z.bridgeTop, alongB + Math.PI, 0.4));
  return group;
}

// Automatic bridge in the centre: carries the rotor bearing, covers the centre wheel's pivot
function buildAutomaticBridge(m) {
  const group = new THREE.Group();
  const footA = v2(5.6, 7.7);
  const footB = v2(0.95, 9.55);
  const field = sdf.smoothUnion(0.7,
    sdf.ring(POS.center, 1.2, 2.25),
    sdf.capsule(POS.center, footA, 0.75),
    sdf.capsule(POS.center, footB, 0.7),
    sdf.circle(footA, 0.95), sdf.circle(footB, 0.85),
  );
  group.add(bridge(m, sdf.subtract(field, sdf.circle(POS.center, 1.15)), bounds(-3, -3, 8, 11.2, 0.04), Z.bridgeBottom, Z.bridgeTop, {
    name: 'AutomaticBridge', screws: [{ x: footA.x, y: footA.y, angle: 0.3 }, { x: footB.x, y: footB.y, angle: 1.7 }],
  }));
  group.add(engraving('AUTOMATIC', 3.1, 4.3, Z.bridgeTop, Math.atan2(footA.y, footA.x) + Math.PI, 0.36));
  // Bearing seat for the rotor: polished steel collar standing in the bridge's centre opening
  group.add(shadowed(new THREE.Mesh(lathe([
    [0.75, Z.bridgeBottom + 0.1], [1.12, Z.bridgeBottom + 0.1], [1.12, Z.rotorFront + 0.02], [1.02, Z.rotorFront - 0.02], [0.75, Z.rotorFront - 0.02],
  ], 48), m.steel)));
  return group;
}

function buildBalance(m) {
  const group = new THREE.Group();
  // Balance wheel (gold, two arms, four timing weights) with blued hairspring, swinging at 4 Hz
  const balance = new THREE.Group();
  balance.name = 'Balance';
  balance.position.set(POS.balance.x, POS.balance.y, 0);
  balance.userData.swing = { amp: 1.4, hz: 4 };
  const rimTop = Z.wheel2 - 0.02;
  balance.add(solid(wheelShape(R.balance, 0, { tooth: 0, spokes: 2, hub: 0.32, rim: 0.3, spokeW: 0.3 }), rimTop, rimTop - 0.2,
    m.wheel, m.wheelEdge, { bevel: 0.03, curveSegments: 40, uvs: { disc: { x: 0, y: 0, r: R.balance } } }));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 14).rotateX(Math.PI / 2), m.rotorEdge);
    weight.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, rimTop - 0.25);
    balance.add(weight);
  }
  const spiral = [];
  for (let i = 0; i <= 480; i++) {
    const k = i / 480;
    const a = k * Math.PI * 2 * 11;
    const rr = 0.38 + k * 1.15;
    spiral.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, rimTop - 0.3));
  }
  balance.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 700, 0.016, 3), m.blued));
  balance.add(arbor(m, Z.base, Z.bridgeBottom, 0.09));
  group.add(balance);

  // Balance cock: one-armed bridge from its foot near the rim to the balance staff, standing taller than
  // the other bridges; cap jewel over the staff, foot screw near the rim
  const foot = v2(-6.55, -7.0);
  const field = sdf.smoothUnion(0.8, sdf.capsule(foot, POS.balance, 0.62), sdf.circle(POS.balance, 0.95), sdf.circle(foot, 0.85));
  group.add(bridge(m, field, bounds(-11.2, -11.2, -3, -4, 0.04), Z.bridgeBottom, Z.cockTop, {
    name: 'BalanceCock', bevel: 0.14, screws: [{ x: foot.x, y: foot.y, angle: 0.9 }],
  }));
  group.add(jewel(m, POS.balance.x, POS.balance.y, Z.cockTop, 1.1));

  // Pallet lever with its two pallet stones; it flicks with the balance
  const lever = new THREE.Group();
  lever.name = 'PalletLever';
  lever.position.set(POS.lever.x, POS.lever.y, 0);
  lever.userData.swing = { amp: 0.1, hz: 4 };
  const leverShapes = shapeFromSdf(sdf.smoothUnion(0.25,
    sdf.capsule(v2(-1.25, 0), v2(1.1, 0), 0.13),
    sdf.capsule(v2(0.8, 0), v2(1.15, 0.38), 0.11),
    sdf.capsule(v2(0.8, 0), v2(1.15, -0.38), 0.11),
    sdf.circle(v2(0, 0), 0.3)), bounds(-1.6, -0.7, 1.5, 0.7, 0.02));
  for (const s of leverShapes) lever.add(solid(s, Z.wheel2, Z.wheel2 - 0.1, m.steel, m.steel, { bevel: 0.01 }));
  for (const sy of [1, -1]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), m.ruby);
    stone.position.set(1.2, sy * 0.42, Z.wheel2 - 0.05);
    lever.add(stone);
  }
  group.add(lever);
  const palletFoot = v2(-1.1, -9.3);
  group.add(bridge(m, sdf.smoothUnion(0.5, sdf.capsule(POS.lever, palletFoot, 0.5), sdf.circle(POS.lever, 0.7), sdf.circle(palletFoot, 0.9)),
    bounds(-3, -11, 0.5, -4.3, 0.04), Z.bridgeBottom, Z.bridgeTop, {
    name: 'PalletBridge', bevel: 0.1, screws: [{ x: palletFoot.x, y: palletFoot.y, angle: 0.2, r: 0.36 }],
  }));
  group.add(jewel(m, POS.lever.x, POS.lever.y, Z.bridgeTop, 0.75));
  return group;
}

// Rotor: open-worked 18k gold oscillating weight (rim, three spokes, hub) with circular graining and an
// engraved rim, a thicker polished rim segment carrying the mass, polished bevels, mounted on a ball bearing.
// It keeps the old rotor's place and shape (upper half at rest), and turns as a whole (WATCH_PARTS.rotor).
export function buildRotor(m = createMaterials()) {
  const rotor = new THREE.Group();
  const outer = 10.45;
  const halfDisc = (p) => Math.max(Math.hypot(p.x, p.y) - outer, 0.4 - p.y);
  const rimField = sdf.subtract(halfDisc, sdf.circle(v2(0, 0), 8.75));
  const spokes = [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6].map((a) => sdf.capsule(v2(0, 0), v2(Math.cos(a) * 9.2, Math.sin(a) * 9.2), 0.55));
  const body = sdf.subtract(sdf.intersect(sdf.smoothUnion(0.9, rimField, ...spokes, sdf.circle(v2(0, 0), 2.9)), halfDisc), sdf.circle(v2(0, 0), 1.05));
  const box = bounds(-11, -0.5, 11, 11, 0.04);
  const engravingUVs = { disc: { x: 0, y: 0, r: outer }, mirror: true };
  for (const shape of shapeFromSdf(body, box)) {
    rotor.add(solid(shape, Z.rotorFront, Z.rotorBack, m.rotor, m.rotorEdge, { bevel: 0.07, bevelSegments: 2, uvs: engravingUVs }));
  }
  // Rim weight: polished, reaching further towards the movement
  for (const shape of shapeFromSdf(sdf.subtract(halfDisc, sdf.circle(v2(0, 0), 9.15)), box)) {
    rotor.add(solid(shape, Z.rotorBottom, Z.rotorFront + 0.01, m.rotorEdge, m.rotorEdge, { bevel: 0.05 }));
  }
  // Hub: satin gold plate fixed to the bearing's inner race with three screws sunk into counterbores
  const hubScrews = [0, 1, 2].map((k) => Math.PI / 2 + (k * Math.PI * 2) / 3);
  const hub = new THREE.Shape().absarc(0, 0, 2.6, 0, Math.PI * 2, false);
  hub.holes.push(new THREE.Path().absarc(0, 0, 1.05, 0, Math.PI * 2, true));
  for (const a of hubScrews) hub.holes.push(new THREE.Path().absarc(Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0.33, 0, Math.PI * 2, true));
  rotor.add(solid(hub, Z.rotorBack + 0.02, Z.rotorBack - 0.1, m.satinGold, m.rotorEdge, { bevel: 0.04, curveSegments: 48, uvs: { disc: { x: 0, y: 0, r: 2.6 } } }));
  for (const a of hubScrews) {
    rotor.add(sunkScrew(m, Math.cos(a) * 1.95, Math.sin(a) * 1.95, Z.rotorBack + 0.02, Z.rotorBack - 0.1, { r: 0.28, h: 0.08, slotAngle: a }));
  }
  // Ball bearing: polished outer race, a ring of balls, satin inner race and the central screw
  rotor.add(shadowed(new THREE.Mesh(lathe([
    [0.78, Z.rotorFront + 0.02], [1.05, Z.rotorFront + 0.02], [1.05, Z.rotorBack - 0.06], [0.95, Z.rotorBack - 0.1], [0.78, Z.rotorBack - 0.1],
  ], 48), m.steel)));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), m.steel);
    ball.position.set(Math.cos(a) * 0.68, Math.sin(a) * 0.68, Z.rotorBack - 0.06);
    rotor.add(ball);
  }
  rotor.add(shadowed(new THREE.Mesh(lathe([
    [0.001, Z.rotorBack - 0.04], [0.56, Z.rotorBack - 0.04], [0.56, Z.rotorBack - 0.1], [0.001, Z.rotorBack - 0.1],
  ], 40), m.satinSteel)));
  rotor.add(screw(m.screw, 0, 0, Z.rotorBack - 0.1, { r: 0.4, h: 0.1, slotAngle: 0.5 }));
  return rotor;
}

// Sapphire caseback window: a real disc with thickness and a polished, chamfered edge
export function buildCasebackGlass(material) {
  const mesh = new THREE.Mesh(lathe([
    [0.001, Z.glassOuter], [11.15, Z.glassOuter], [11.35, Z.glassOuter + 0.15], [11.35, Z.glassInner - 0.15], [11.15, Z.glassInner], [0.001, Z.glassInner],
  ], 128), material);
  mesh.geometry.deleteAttribute('uv');
  mesh.name = 'CasebackGlass';
  mesh.renderOrder = 2;
  return mesh;
}

export function buildMovement() {
  const m = createMaterials();
  const group = new THREE.Group();
  group.name = 'Movement';
  const { group: train, wCenter } = buildGearTrain(m);
  group.add(buildPlates(m), buildCasingRing(m), train, buildBarrel(m, wCenter), buildTrainBridge(m), buildAutomaticBridge(m), buildBalance(m));
  return { movement: group, rotor: buildRotor(m) };
}
