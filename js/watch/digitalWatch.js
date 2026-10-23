import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATCH_PARTS, MATERIAL_NAMES } from '../config.js';
import { METALS, createMetal, createGlass, withReflection, assignWorldUVs } from './materials.js';
import { shadowed, profileSolid, buildStrap, STRAP_START } from './proceduralWatch.js';
import { createDisplayPanel, createDisplayMaterial } from './digitalDisplay.js';

// Orvane Lumen: digital model with a cushion case, integrated lugs and a 7-segment display.
// Same conventions as the Meridian: millimetres, display faces +Z, 12 o'clock points to +Y,
// strap shared with the Meridian (it starts STRAP_START from the centre, where the integrated lugs end).

const CASE_HW = 18.5; // half width (37 mm across, without pushers)
const CASE_HH = 20.0; // half height (40 mm)
const CASE_N = 4.2; // superellipse exponent: 2 = ellipse, higher = squarer; ~4 reads as a cushion
const CASE_TAPER = 0.07; // flanks lean in towards the caseback
const CASE_BOTTOM = -4.3;
const CASE_TOP = 2.3;
const BEZEL_TOP = 3.4;
const APERTURE_HW = 14.0;
const APERTURE_HH = 14.9;
const APERTURE_N = 5.0;
const CHAMFER = 0.9; // polished slope from the brushed bezel top down to the display
// Oblong pushers on the flanks: length along the case (Y), height across the flank (Z), depth = how far they reach out
const PUSHER = { y: 8.4, length: 5.2, height: 2.0, depth: 1.95 };

const OUTLINE_SEGMENTS = 192;

// Superellipse outline, counter-clockwise seen from +Z. Offsetting by growing both half axes
// is not a true offset curve, but close enough for the few tenths of a millimetre used here.
function outlinePoints(hw, hh, n, segments = OUTLINE_SEGMENTS) {
  const e = 2 / n;
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push(new THREE.Vector2(hw * Math.sign(c) * Math.abs(c) ** e, hh * Math.sign(s) * Math.abs(s) ** e));
  }
  return pts;
}

function outline(hw, hh, n, Type = THREE.Shape) {
  return new Type(outlinePoints(hw, hh, n));
}

const caseOutline = (d = 0, Type) => outline(CASE_HW + d, CASE_HH + d, CASE_N, Type);
const apertureOutline = (d = 0, Type) => outline(APERTURE_HW + d, APERTURE_HH + d, APERTURE_N, Type);

// Band between superellipse rings, e.g. a chamfer or an inner wall: rings [{ d, z }] from outer/top to inner/bottom
function loft(rings, n = APERTURE_N) {
  const loops = rings.map(({ d, z }) => outlinePoints(APERTURE_HW + d, APERTURE_HH + d, n).map((p) => [p.x, p.y, z]));
  const positions = loops.flat().flat();
  const index = [];
  const count = OUTLINE_SEGMENTS;
  for (let r = 0; r < loops.length - 1; r++) {
    for (let k = 0; k < count; k++) {
      const a = r * count + k;
      const b = r * count + ((k + 1) % count);
      const c = (r + 1) * count + ((k + 1) % count);
      const d = (r + 1) * count + k;
      index.push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return assignWorldUVs(geo);
}

// Extrudes an XY outline along +Z between z0 and z1 with rounded bevels.
// taper: how much smaller the outline is at z0 than at z1 (0.06 = 6 %), for flanks that lean in towards the back.
function slab(shape, z0, z1, bevel, { segments = 5, curveSegments = 24, taper = 0 } = {}) {
  const depth = Math.max(z1 - z0 - 2 * bevel, 0.01);
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segments, curveSegments,
  });
  geo.translate(0, 0, z0 + bevel);
  if (taper) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - taper * (1 - (pos.getZ(i) - z0) / (z1 - z0));
      pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
    }
  }
  // Smooth across the bevel rounds, crisp where they meet flat faces at a real edge
  geo.deleteAttribute('normal');
  geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(30));
  return assignWorldUVs(geo);
}

// Integrated lug: side profile from inside the case to where the strap starts (STRAP_START, z -1.4).
// Drawn for the original 26.4 mm reach and compressed along Y, so the lug only just clears the case.
const lugY = (v) => 14.0 + (v - 14.0) * ((STRAP_START + 0.3 - 14.0) / (26.4 - 14.0));
function lugShape() {
  const y = lugY;
  const s = new THREE.Shape();
  s.moveTo(y(14.0), CASE_TOP - 0.1);
  s.lineTo(y(19.0), CASE_TOP - 0.15);
  s.quadraticCurveTo(y(24.4), 1.5, y(25.9), 0.0);
  s.quadraticCurveTo(y(26.4), -0.6, y(26.2), -1.6);
  s.lineTo(y(25.7), -2.6);
  s.quadraticCurveTo(y(22.0), -3.3, y(18.0), -3.9);
  s.lineTo(y(14.0), CASE_BOTTOM + 0.2);
  s.closePath();
  return s;
}

function buildCase(polished, brushed) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.case;

  // Middle case: brushed flanks with generously rounded edges
  group.add(shadowed(new THREE.Mesh(slab(caseOutline(), CASE_BOTTOM, CASE_TOP, 1.1, { taper: CASE_TAPER }), brushed)));

  // Integrated lugs: wider where they leave the case, tapering to the bracelet width
  let lugGeo = profileSolid(lugShape(), 19.4, { bevel: 0.5 });
  const pos = lugGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getY(i), lugY(16.5), lugY(24.5));
    pos.setX(i, pos.getX(i) * THREE.MathUtils.lerp(1.28, 1, k));
  }
  lugGeo = assignWorldUVs(toCreasedNormals(lugGeo, THREE.MathUtils.degToRad(35)));
  for (const sy of [-1, 1]) {
    const lug = shadowed(new THREE.Mesh(lugGeo, brushed));
    lug.scale.y = sy;
    group.add(lug);
  }

  // Pushers: two per side, oblong polished keys on a dark gasket, set into the flank
  const pusherZ = -1.0;
  const flankX = CASE_HW * (1 - CASE_TAPER * (1 - (pusherZ - CASE_BOTTOM) / (CASE_TOP - CASE_BOTTOM)));
  const keyGeo = pusherGeometry(PUSHER.length, PUSHER.height, PUSHER.depth, 0.32);
  const gasketGeo = pusherGeometry(PUSHER.length + 0.5, PUSHER.height + 0.5, 0.9, 0.12);
  const gasket = new THREE.MeshPhysicalMaterial({ name: 'Gasket', color: 0x0c0b0a, metalness: 0, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    for (const y of [-PUSHER.y, PUSHER.y]) {
      // Both start inside the flank (it leans in towards the back), so no gap shows from any angle
      const seat = new THREE.Mesh(gasketGeo, gasket);
      seat.position.set(sx * (flankX - 0.6), y, pusherZ);
      const key = shadowed(new THREE.Mesh(keyGeo, polished));
      key.position.set(sx * (flankX - 0.6), y, pusherZ);
      for (const mesh of [seat, key]) mesh.scale.x = sx;
      group.add(seat, key);
    }
  }
  return group;
}

// Oblong key: stadium outline in the flank plane (length along Y, height along Z), extruded outward along +X
// with a rounded bevel, so the face reads flat and polished with soft highlights on its edge
function pusherGeometry(length, height, depth, bevel) {
  const r = height / 2;
  const half = length / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-half, -r);
  s.lineTo(half, -r);
  s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, r);
  s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  // profileSolid: shape x -> Y, shape y -> Z, centred extrusion along X; shift so it starts at x = 0
  const geo = profileSolid(s, depth, { bevel, segments: 4, curveSegments: 16 });
  geo.translate(depth / 2, 0, 0);
  return geo;
}

// Top frame around the display: polished body with rounded edges, a vertically brushed flat top
// and a polished chamfer that runs down to the display, ending in a dark inner wall
function buildBezel(polished, brushed) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.bezel;

  const body = caseOutline(-0.5);
  body.holes.push(apertureOutline(CHAMFER, THREE.Path));
  group.add(shadowed(new THREE.Mesh(slab(body, CASE_TOP - 0.2, BEZEL_TOP, 0.45, { segments: 4 }), polished)));

  const top = caseOutline(-1.25);
  top.holes.push(apertureOutline(CHAMFER + 0.45, THREE.Path));
  const topGeo = assignWorldUVs(new THREE.ShapeGeometry(top, 24));
  const plate = shadowed(new THREE.Mesh(topGeo, brushed));
  plate.position.z = BEZEL_TOP + 0.004;
  group.add(plate);

  group.add(shadowed(new THREE.Mesh(loft([
    { d: CHAMFER + 0.02, z: BEZEL_TOP - 0.02 },
    { d: 0, z: BEZEL_TOP - 0.75 },
  ]), polished)));

  const wall = new THREE.Mesh(loft([
    { d: 0, z: BEZEL_TOP - 0.75 },
    { d: 0, z: CASE_TOP },
  ]), new THREE.MeshPhysicalMaterial({ name: 'Flange', color: 0x0d0c0b, metalness: 0.2, roughness: 0.5 }));
  wall.receiveShadow = true;
  group.add(wall);
  return group;
}

// Display panel (named Dial for the shared part list) with the live readout as child "Display"
function buildDial(panel) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.dial;

  const geo = new THREE.ShapeGeometry(apertureOutline(0.05), 24);
  // ShapeGeometry UVs are the shape coordinates in mm; normalise them to the panel texture
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) + APERTURE_HW) / (2 * APERTURE_HW), (uv.getY(i) + APERTURE_HH) / (2 * APERTURE_HH));
  }
  const display = new THREE.Mesh(geo, createDisplayMaterial(panel));
  display.name = WATCH_PARTS.display;
  display.userData.panel = { width: panel.width, height: panel.height };
  display.position.z = CASE_TOP + 0.02;
  display.receiveShadow = true;
  group.add(display);
  return group;
}

// Flat sapphire, seated in the chamfer just below the bezel top
function buildGlass() {
  const geo = slab(apertureOutline(CHAMFER * 0.75), BEZEL_TOP - 0.6, BEZEL_TOP - 0.12, 0.12, { segments: 2 });
  geo.deleteAttribute('uv');
  // Flat sapphire mirrors the softboxes as one clean sheet; a touch more specular than the domed Meridian glass shows it
  const glass = createGlass();
  glass.specularIntensity = 0.32;
  const mesh = new THREE.Mesh(geo, glass);
  mesh.name = WATCH_PARTS.glass;
  mesh.renderOrder = 2;
  return withReflection(mesh);
}

// Engraving for the caseback, dark lines on white (multiplied with the metal colour)
function engravingTexture(hw, hh) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.scale(1, hw / hh); // plate is taller than wide; keep the lettering round
  const ink = 'rgb(120, 112, 100)';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.33, 0, Math.PI * 2);
  ctx.stroke();

  // Legend around the ring
  const legend = 'ORVANE · LUMEN · QUARTZ · SAPPHIRE CRYSTAL · WATER RESISTANT 100 M · CALIBRE OL-Q1 · ';
  ctx.font = '500 34px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const r = size * 0.38;
  const step = (Math.PI * 2) / legend.length;
  [...legend].forEach((ch, i) => {
    ctx.save();
    ctx.rotate(i * step);
    ctx.translate(0, -r);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });

  ctx.font = '500 92px "Cormorant Garamond", serif';
  ctx.letterSpacing = '26px';
  ctx.fillText('ORVANE', 13, -40);
  ctx.font = '400 34px "Inter", sans-serif';
  ctx.letterSpacing = '12px';
  ctx.fillText('REF. OL-01', 6, 50);
  ctx.fillText('N° 0001', 6, 100);
  // Designer credit
  ctx.font = '400 28px "Inter", sans-serif';
  ctx.letterSpacing = '7px';
  ctx.fillText('DESIGN NICOLAS BRAND', 4, 170);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.mimeType = 'image/jpeg';
  return texture;
}

// Screwed, brushed caseback plate with an engraved legend
function buildCaseback(polished, brushed) {
  const group = new THREE.Group();
  group.name = 'Caseback';
  const hw = 14.5;
  const hh = 15.5;
  const geo = slab(outline(hw, hh, CASE_N), CASE_BOTTOM - 0.35, CASE_BOTTOM + 0.2, 0.2);
  // Plate-sized UVs, mirrored in X so the engraving reads correctly from behind
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (hw - pos.getX(i)) / (2 * hw), (pos.getY(i) + hh) / (2 * hh));
  const material = brushed.clone();
  material.map = engravingTexture(hw, hh);
  const plate = shadowed(new THREE.Mesh(geo, material));
  group.add(plate);
  const screwGeo = assignWorldUVs(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 24).rotateX(Math.PI / 2));
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const screw = shadowed(new THREE.Mesh(screwGeo, polished));
      screw.position.set(sx * 11.6, sy * 12.6, CASE_BOTTOM - 0.42);
      group.add(screw);
    }
  }
  return group;
}

export async function buildDigitalWatch({ metal = METALS.yellowGold, date = new Date() } = {}) {
  await Promise.all([
    document.fonts.load('500 100px "Cormorant Garamond"'),
    document.fonts.load('400 40px "Inter"'),
    document.fonts.load('500 40px "Inter"'),
  ]).catch(() => {});

  const polished = createMetal(metal.color);
  const brushed = createMetal(metal.color, { brushed: true });
  for (const mat of [polished, brushed]) mat.name = MATERIAL_NAMES.caseMetal;
  const panel = createDisplayPanel({ width: APERTURE_HW * 2, height: APERTURE_HH * 2 });
  panel.draw(date);

  const root = new THREE.Group();
  root.name = 'Watch';
  root.userData.model = 'lumen';
  root.add(
    buildCase(polished, brushed),
    buildBezel(polished, brushed),
    buildDial(panel),
    buildGlass(),
    buildCaseback(polished, brushed),
    buildStrap(polished, brushed, { endLinks: false }),
  );
  return root;
}
