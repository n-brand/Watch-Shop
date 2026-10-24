import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATCH_PARTS, MATERIAL_NAMES } from '../config.js';
import { METALS, createMetal, createGlass, withReflection, createDial, assignWorldUVs } from './materials.js';
import {
  shadowed, lathe, profileSolid, buildHand, buildCaseback, buildStrap, CASE_R, LUG_INNER_X, STRAP_START,
} from './proceduralWatch.js';

// Orvane Abyss: dive watch built on the Meridian. Same case diameter, caseback, OR-01 movement and straps;
// new are the unidirectional rotating bezel with a ceramic insert, a matte black dial with large luminous
// indices and a date at 3, broad sword hands with lume, and a screw-down crown between crown guards.
// Conventions as on the Meridian: millimetres, dial faces +Z, 12 o'clock points to +Y.

const DIAL_R = 15.4;
const DIAL_Z = 1.8;
const CASE_TOP = 2.95; // the bezel sits on the middle case here
const BEZEL = { inner: 17.0, outer: 21.2, top: 4.97, insertInner: 17.35, insertOuter: 20.3, insertLow: 4.5, insertHigh: 4.92 };
const GLASS = { r: 16.98, z: 4.35, dome: 0.18 };
const INDEX_OUTER = 13.9; // outer ends of the applied indices, just inside the printed minute track
const INDEX_H = 0.4;
const CREASE = THREE.MathUtils.degToRad(35);

// Luminous paint: off-white with a faint green, glows a little even in daylight
function createLume() {
  return new THREE.MeshPhysicalMaterial({ name: 'Lume', color: 0xeef2e4, roughness: 0.6, metalness: 0, emissive: 0x9dffc4, emissiveIntensity: 0.07 });
}

// Canvas texture drawn in millimetres around the centre of a disc of radius r (canvas top = 12 o'clock)
function discTexture(r, size, draw, { srgb = true, mime = 'image/jpeg' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 2 / r, size / 2 / r);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.userData.mimeType = mime;
  return texture;
}

// UVs across a disc of radius r (front view, no mirroring), for the dial and the bezel insert
function discUVs(geometry, r) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / (2 * r) + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / (2 * r) + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// Text along a circle, centred at `at` (radians clockwise from 12), letters upright with their feet towards the
// centre (outward = up), reading clockwise; `inward` turns them so they read from the centre (lower half)
function arcText(ctx, text, radius, at, advance, { inward = false } = {}) {
  const step = advance / radius;
  [...text].forEach((ch, i) => {
    const offset = (i - (text.length - 1) / 2) * step;
    const a = inward ? at - offset : at + offset;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, inward ? radius : -radius);
    if (inward) ctx.rotate(Math.PI);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- case

// Lug side profile like the Meridian's, a little taller to meet the thicker case
function lugShape() {
  const y = (v) => 15.0 + (v - 15.0) * ((STRAP_START + 0.05 - 15.0) / (25.95 - 15.0));
  const s = new THREE.Shape();
  s.moveTo(y(15.0), 2.7);
  s.lineTo(y(19.0), 2.45);
  s.quadraticCurveTo(y(23.6), 2.0, y(25.2), 0.4);
  s.quadraticCurveTo(y(25.95), -0.5, y(25.5), -1.6);
  s.lineTo(y(24.6), -2.5);
  s.quadraticCurveTo(y(21.0), -3.1, y(17.0), -3.9);
  s.lineTo(y(15.0), -4.2);
  s.closePath();
  return s;
}

// Crown guards: two shoulders growing out of the flank either side of the crown, bevelled all round
function crownGuardGeometry() {
  const s = new THREE.Shape();
  s.moveTo(20.2, 3.15);
  s.lineTo(22.75, 3.35);
  s.quadraticCurveTo(23.55, 3.45, 23.45, 4.3);
  s.quadraticCurveTo(23.1, 6.2, 19.0, 8.2);
  s.quadraticCurveTo(19.2, 5.4, 20.2, 3.15);
  const z0 = -2.9;
  const z1 = 1.7;
  const bevel = 0.45;
  let geo = new THREE.ExtrudeGeometry(s, {
    depth: z1 - z0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 16,
  });
  geo.translate(0, 0, z0 + bevel);
  geo = toCreasedNormals(geo, CREASE);
  return assignWorldUVs(geo);
}

function buildCase(polished, brushed) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.case;

  // Caseback ring as on the Meridian (the movement and its casing ring fit unchanged), taller middle case
  group.add(shadowed(new THREE.Mesh(lathe([
    [11.0, -4.95], [11.35, -5.38], [11.8, -5.52], [16.9, -5.52], [17.35, -5.36], [17.6, -5.08],
  ]), brushed)));
  group.add(shadowed(new THREE.Mesh(lathe([
    [17.6, -5.08], [18.9, -4.86], [19.8, -4.42], [20.4, -3.72], [20.76, -2.82], [CASE_R, -1.8],
    [CASE_R, 2.3], [20.84, 2.72], [20.6, CASE_TOP], [BEZEL.inner, CASE_TOP], [BEZEL.inner, DIAL_Z - 0.1],
  ]), brushed)));

  const lugGeo = profileSolid(lugShape(), 3.6, { bevel: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const lug = shadowed(new THREE.Mesh(lugGeo, brushed));
      lug.position.x = sx * (LUG_INNER_X + 1.8);
      lug.scale.y = sy;
      group.add(lug);
    }
  }

  const guardGeo = crownGuardGeometry();
  for (const sy of [-1, 1]) {
    const guard = shadowed(new THREE.Mesh(guardGeo, polished));
    guard.scale.y = sy;
    group.add(guard);
  }
  return group;
}

// ---------------------------------------------------------------- bezel

// Ceramic insert: black, glossy, numerals and markers filled with platinum; 60-minute scale, the first
// 15 minutes graduated, a triangle with a lume pip at 0
function createInsertTexture() {
  return discTexture(BEZEL.insertOuter + 0.2, 2048, (ctx) => {
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(-30, -30, 60, 60);
    const fill = '#d6d8dc';
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    const mid = (BEZEL.insertInner + BEZEL.insertOuter) / 2;
    for (let m = 1; m < 60; m++) {
      const a = (m / 60) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      if (m % 10 === 0) {
        // numerals, all reading from outside like on most divers
        ctx.font = '500 1.55px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(m), 0, -mid);
      } else if (m % 5 === 0) {
        ctx.fillRect(-0.32, -mid - 0.7, 0.64, 1.4);
      } else if (m < 15) {
        ctx.lineWidth = 0.16;
        ctx.beginPath();
        ctx.moveTo(0, -BEZEL.insertOuter + 0.25);
        ctx.lineTo(0, -BEZEL.insertOuter + 1.05);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Triangle at 0, pointing to the centre; the pip sits in it (see buildBezel)
    ctx.beginPath();
    ctx.moveTo(-1.25, -BEZEL.insertOuter + 0.25);
    ctx.lineTo(1.25, -BEZEL.insertOuter + 0.25);
    ctx.lineTo(0, -BEZEL.insertInner - 0.2);
    ctx.closePath();
    ctx.fill();
  });
}

// Unidirectional bezel: brushed ring with a coin edge (120 notches), the ceramic insert on top.
// userData.ratchet lets the viewer turn it in 60 clicks, counter-clockwise only, as on a real dive watch.
function buildBezel(polished, brushed) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.bezel;
  group.userData.ratchet = { step: (Math.PI * 2) / 60 };

  const ringGeo = lathe([
    [BEZEL.inner, CASE_TOP], [20.9, CASE_TOP], [BEZEL.outer, 3.18], [BEZEL.outer, 3.3], [BEZEL.outer, 4.33], [BEZEL.outer, 4.45],
    [21.05, 4.78], [20.6, BEZEL.top], [BEZEL.insertOuter + 0.05, BEZEL.top],
    // Recess for the insert, just under it, so no gap shows at its inner edge
    [BEZEL.insertOuter, BEZEL.insertHigh - 0.06], [BEZEL.insertInner, BEZEL.insertLow - 0.06], [17.1, BEZEL.insertLow], [BEZEL.inner, BEZEL.insertLow - 0.05],
    [BEZEL.inner, CASE_TOP],
  ], 720);
  // Coin edge: shallow rounded notches on the flank, for grip
  const pos = ringGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, y);
    if (r > BEZEL.outer - 0.01 && z > 3.25 && z < 4.4) {
      const k = 1 - (0.13 / r) * (0.5 + 0.5 * Math.cos(Math.atan2(y, x) * 120));
      pos.setX(i, x * k);
      pos.setY(i, y * k);
    }
  }
  ringGeo.computeVertexNormals();
  group.add(shadowed(new THREE.Mesh(ringGeo, brushed)));

  // Insert: a sloped ring of black ceramic, glossy like the real thing
  const insertGeo = discUVs(lathe([[BEZEL.insertOuter, BEZEL.insertHigh], [BEZEL.insertInner, BEZEL.insertLow]], 256), BEZEL.insertOuter + 0.2);
  const ceramic = new THREE.MeshPhysicalMaterial({
    name: 'CeramicInsert', color: 0xffffff, map: createInsertTexture(), metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06,
  });
  group.add(shadowed(new THREE.Mesh(insertGeo, ceramic)));

  // Lume pip in a polished cup, set into the triangle at 0
  const at = BEZEL.insertOuter - 1.15;
  const zAt = BEZEL.insertLow + ((at - BEZEL.insertInner) / (BEZEL.insertOuter - BEZEL.insertInner)) * (BEZEL.insertHigh - BEZEL.insertLow);
  const cup = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 40).rotateX(Math.PI / 2), polished));
  cup.position.set(0, at, zAt + 0.02);
  const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.16, 40).rotateX(Math.PI / 2), createLume());
  pip.position.set(0, at, zAt + 0.04);
  group.add(cup, pip);
  return group;
}

// Screw-down crown: large, fluted, on a thick tube between the crown guards
function buildCrown(metal) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.crown;
  const profile = [
    [1.5, 20.3], [1.5, 21.0], [2.2, 21.1], [2.95, 21.35], [3.1, 21.6], [3.1, 23.6],
    [2.95, 23.95], [2.5, 24.15], [1.8, 24.22], [0.001, 24.25],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 180);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) > 3.05 && y > 21.55 && y < 23.65) {
      const k = 1 - 0.05 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 30));
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  geo.computeVertexNormals();
  geo.rotateZ(-Math.PI / 2);
  geo.translate(0, 0, -0.6);
  assignWorldUVs(geo);
  group.add(shadowed(new THREE.Mesh(geo, metal)));
  return group;
}

// ---------------------------------------------------------------- dial

const DATE_WINDOW = { r: 12.4, w: 2.5, h: 2.1 };

// Matte black dial: fine grain, white minute track, wordmark, model name in red, depth rating; date window at 3
async function createDiverDialTexture(date) {
  await Promise.all([
    document.fonts.load('400 100px "Cormorant Garamond"'),
    document.fonts.load('500 40px "Inter"'),
  ]).catch(() => {});
  const print = '#ecebe6';
  const texture = discTexture(DIAL_R, 2048, (ctx) => {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, DIAL_R);
    grad.addColorStop(0, '#15171b');
    grad.addColorStop(1, '#0a0b0d');
    ctx.fillStyle = grad;
    ctx.fillRect(-DIAL_R, -DIAL_R, 2 * DIAL_R, 2 * DIAL_R);

    // Minute track: a line every minute, longer every five
    ctx.strokeStyle = print;
    for (let m = 0; m < 60; m++) {
      ctx.save();
      ctx.rotate((m / 60) * Math.PI * 2);
      ctx.lineWidth = m % 5 === 0 ? 0.2 : 0.09;
      ctx.beginPath();
      ctx.moveTo(0, -DIAL_R + 0.35);
      ctx.lineTo(0, -DIAL_R + (m % 5 === 0 ? 1.25 : 0.95));
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = print;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0.32px';
    ctx.font = '400 1.85px "Cormorant Garamond", serif';
    ctx.fillText('ORVANE', 0.16, -5.9);
    ctx.letterSpacing = '0.2px';
    ctx.fillStyle = '#d4462f';
    ctx.font = '500 1.45px "Cormorant Garamond", serif';
    ctx.fillText('ABYSS', 0.1, 4.6);
    ctx.fillStyle = print;
    ctx.letterSpacing = '0.12px';
    ctx.font = '500 0.62px "Inter", sans-serif';
    ctx.fillText('300 m · 1000 ft', 0.06, 5.95);
    ctx.font = '400 0.5px "Inter", sans-serif';
    ctx.fillText('AUTOMATIC', 0.06, 6.95);

    // Date window at 3: white date disc seen through a cut-out
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(DATE_WINDOW.r - DATE_WINDOW.w / 2, -DATE_WINDOW.h / 2, DATE_WINDOW.w, DATE_WINDOW.h);
    ctx.fillStyle = '#111';
    ctx.font = '500 1.45px "Inter", sans-serif';
    ctx.fillText(String(date.getDate()), DATE_WINDOW.r, 0.08);
  });
  return texture;
}

// Applied index: polished surround with luminous fill, slightly recessed. Shapes in local coordinates with
// +Y pointing outward along the radius; the base sits on the dial.
function appliedIndex(outer, inner, metal, lume) {
  const group = new THREE.Group();
  const frameShape = outer.clone();
  frameShape.holes.push(new THREE.Path(inner.getPoints(24)));
  const frame = new THREE.ExtrudeGeometry(frameShape, { depth: INDEX_H - 0.06, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 24 });
  group.add(shadowed(new THREE.Mesh(assignWorldUVs(toCreasedNormals(frame, CREASE)), metal)));
  const fill = new THREE.ExtrudeGeometry(inner, { depth: INDEX_H - 0.08, bevelEnabled: false, curveSegments: 24 });
  group.add(shadowed(new THREE.Mesh(fill, lume)));
  return group;
}

const circleShape = (r) => new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false);
function rectShape(w, h, r = 0.15) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
// Triangle pointing to the centre (-Y), corners slightly rounded
function triangleShape(w, h, inset = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + inset * 1.8, h / 2 - inset);
  s.lineTo(w / 2 - inset * 1.8, h / 2 - inset);
  s.lineTo(0, -h / 2 + inset * 2.2);
  s.closePath();
  return s;
}

function buildDial(texture, metal, lume) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.dial;

  const disc = new THREE.Mesh(discUVs(new THREE.CircleGeometry(DIAL_R, 160), DIAL_R), createDial(texture));
  disc.material.roughness = 0.75; // matte, not sunburst
  disc.material.metalness = 0.05;
  disc.position.z = DIAL_Z;
  disc.receiveShadow = true;
  group.add(disc);

  // Rehaut: tall dark flange from the dial edge up to the glass, inside the bezel
  const flange = new THREE.Mesh(lathe([[GLASS.r, GLASS.z - 0.05], [DIAL_R - 0.05, DIAL_Z + 0.01]]),
    new THREE.MeshPhysicalMaterial({ name: 'Flange', color: 0x101114, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide }));
  flange.receiveShadow = true;
  group.add(flange);

  const place = (index, hour, length) => {
    const a = (hour / 12) * Math.PI * 2;
    const r = INDEX_OUTER - length / 2;
    index.position.set(Math.sin(a) * r, Math.cos(a) * r, DIAL_Z);
    index.rotation.z = -a;
    group.add(index);
  };
  for (let h = 1; h < 12; h++) {
    if (h === 3) continue; // date window
    if (h === 6 || h === 9) place(appliedIndex(rectShape(2.0, 4.0, 0.25), rectShape(1.5, 3.5, 0.18), metal, lume), h, 4.0);
    else place(appliedIndex(circleShape(1.3), circleShape(1.0), metal, lume), h, 2.6);
  }
  place(appliedIndex(triangleShape(3.6, 3.7), triangleShape(3.6, 3.7, 0.3), metal, lume), 0, 3.7);

  // Polished frame around the date window
  const windowFrame = rectShape(DATE_WINDOW.w + 0.5, DATE_WINDOW.h + 0.5, 0.2);
  windowFrame.holes.push(new THREE.Path(rectShape(DATE_WINDOW.w, DATE_WINDOW.h, 0.08).getPoints(12)));
  const frameGeo = new THREE.ExtrudeGeometry(windowFrame, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  const frame = shadowed(new THREE.Mesh(assignWorldUVs(toCreasedNormals(frameGeo, CREASE)), metal));
  frame.position.set(DATE_WINDOW.r, 0, DIAL_Z);
  group.add(frame);
  return group;
}

// ---------------------------------------------------------------- hands

// Sword hand: polished frame with a luminous fill, flat; pointing to +Y
function swordShape(length, width, tail) {
  const s = new THREE.Shape();
  s.moveTo(-width * 0.2, -tail);
  s.lineTo(width * 0.2, -tail);
  s.lineTo(width / 2, length * 0.16);
  s.lineTo(width * 0.42, length * 0.8);
  s.lineTo(0, length);
  s.lineTo(-width * 0.42, length * 0.8);
  s.lineTo(-width / 2, length * 0.16);
  s.closePath();
  return s;
}
function swordLumeShape(length, width, rim = 0.26) {
  const s = new THREE.Shape();
  s.moveTo(-(width / 2 - rim), length * 0.22);
  s.lineTo(width / 2 - rim, length * 0.22);
  s.lineTo(width * 0.42 - rim, length * 0.8);
  s.lineTo(0, length - rim * 2.6);
  s.lineTo(-(width * 0.42 - rim), length * 0.8);
  s.closePath();
  return s;
}
function swordHand(name, length, width, tail, z, metal, lume, pipe) {
  const blade = new THREE.ExtrudeGeometry(swordShape(length, width, tail), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  const hand = buildHand(name, assignWorldUVs(toCreasedNormals(blade, CREASE)), z, metal, pipe.radius + 0.25, 0.2, pipe);
  const fill = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(swordLumeShape(length, width), { depth: 0.04, bevelEnabled: false }), lume));
  fill.position.z = 0.125;
  hand.add(fill);
  return hand;
}

// Seconds hand: thin needle with a lume lollipop and a red tip (the diver's running indicator)
function buildSecondHand(metal, lume) {
  const needle = new THREE.Shape();
  needle.moveTo(-0.13, -3.8);
  needle.lineTo(0.13, -3.8);
  needle.lineTo(0.08, 14.4);
  needle.lineTo(-0.08, 14.4);
  needle.closePath();
  const hand = buildHand(WATCH_PARTS.secondHand, assignWorldUVs(new THREE.ExtrudeGeometry(needle, { depth: 0.07, bevelEnabled: false })),
    DIAL_Z + 1.0, metal, 0.45, 0.1, { radius: 0.22, down: 0.08 });
  const red = new THREE.MeshPhysicalMaterial({ name: 'SecondsTip', color: 0xc8361f, roughness: 0.35, clearcoat: 0.6 });
  const tip = new THREE.Shape();
  tip.moveTo(-0.11, 11.3);
  tip.lineTo(0.11, 11.3);
  tip.lineTo(0.085, 14.4);
  tip.lineTo(-0.085, 14.4);
  tip.closePath();
  const tipMesh = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(tip, { depth: 0.02, bevelEnabled: false }), red));
  tipMesh.position.z = 0.07;
  const ring = circleShape(0.95);
  ring.holes.push(new THREE.Path(circleShape(0.72).getPoints(32)));
  const ringMesh = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.ExtrudeGeometry(ring, { depth: 0.07, bevelEnabled: false, curveSegments: 32 })), metal));
  ringMesh.position.y = 10.0;
  const dot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 32).rotateX(Math.PI / 2), lume));
  dot.position.set(0, 10.0, 0.035);
  const weight = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.CylinderGeometry(0.75, 0.75, 0.07, 32).rotateX(Math.PI / 2)), metal));
  weight.position.set(0, -3.2, 0.035);
  hand.add(tipMesh, ringMesh, dot, weight);
  return hand;
}

// ---------------------------------------------------------------- glass

// Flat sapphire with a slight dome, sitting inside the bezel
function buildGlass() {
  const points = [[0.001, GLASS.z], [GLASS.r - 0.08, GLASS.z], [GLASS.r, GLASS.z + 0.08], [GLASS.r, GLASS.z + 0.32], [GLASS.r - 0.15, GLASS.z + 0.42]];
  for (let i = 1; i <= 16; i++) {
    const r = (GLASS.r - 0.15) * (1 - i / 16);
    points.push([Math.max(r, 0.001), GLASS.z + 0.42 + GLASS.dome * (1 - (r / (GLASS.r - 0.15)) ** 2)]);
  }
  const geo = lathe(points, 128);
  geo.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geo, createGlass());
  mesh.name = WATCH_PARTS.glass;
  mesh.renderOrder = 2;
  return withReflection(mesh);
}

export async function buildDiverWatch({ metal = METALS.steel, date = new Date() } = {}) {
  const polished = createMetal(metal.color);
  const brushed = createMetal(metal.color, { brushed: true });
  for (const mat of [polished, brushed]) mat.name = MATERIAL_NAMES.caseMetal;
  const lume = createLume();
  const dialTexture = await createDiverDialTexture(date);

  const root = new THREE.Group();
  root.name = 'Watch';
  root.add(
    buildCase(polished, brushed),
    buildBezel(polished, brushed),
    buildCrown(polished),
    buildDial(dialTexture, polished, lume),
    // Indices stand 0.4 mm proud, so the hands sit a little higher than on the Meridian. Satin frames:
    // polished ones mirrored the dark studio and read as black outlines around the lume
    swordHand(WATCH_PARTS.hourHand, 8.8, 2.5, 1.0, DIAL_Z + 0.5, brushed, lume, { radius: 1.0, down: 0.5 }),
    swordHand(WATCH_PARTS.minuteHand, 13.3, 1.8, 1.4, DIAL_Z + 0.75, brushed, lume, { radius: 0.65, down: 0.09 }),
    buildSecondHand(brushed, lume),
    buildGlass(),
    buildCaseback(),
    buildStrap(polished, brushed),
  );
  return root;
}
