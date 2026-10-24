import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATCH_PARTS, MATERIAL_NAMES } from '../config.js';
import { METALS, createMetal, createGlass, withReflection, createDial, assignWorldUVs } from './materials.js';
import {
  shadowed, lathe, profileSolid, buildHand, buildCaseback, buildStrap, CASE_R, LUG_INNER_X, STRAP_START,
} from './proceduralWatch.js';

// Orvane Abyss: sporty chronograph built on the Meridian. Same case diameter, caseback, OR-01 movement and
// straps; new are a rotating bezel with a blue insert and large numerals, a blue sunburst dial with a
// tachymeter scale, three subdials (running seconds at 9, 30-minute counter at 3, 12-hour counter at 6),
// applied batons, stick hands with lume, a date at 4:30 and two pushers beside the crown.
// The stopwatch works: the pushers carry userData.pusher ('startStop' / 'reset'), the counting hands
// userData.chrono ({ period, beat, jump }); the viewer runs them (see scene.js).
// Conventions as on the Meridian: millimetres, dial faces +Z, 12 o'clock points to +Y.

const DIAL_R = 15.4;
const DIAL_Z = 1.8;
const CASE_TOP = 2.95; // the bezel sits on the middle case here
const BEZEL = { inner: 17.0, outer: 21.2, top: 4.97, insertInner: 17.35, insertOuter: 20.3, insertLow: 4.5, insertHigh: 4.92 };
const GLASS = { r: 16.98, z: 4.35, dome: 0.18 };
const INDEX_OUTER = 13.2; // outer ends of the applied batons, inside the minute track and tachymeter
const INDEX_H = 0.4;
const SUB = { offset: 6.3, r: 3.3 }; // subdial centres from the dial centre, subdial radius
const SUBDIALS = {
  seconds: new THREE.Vector2(-SUB.offset, 0),
  minutes: new THREE.Vector2(SUB.offset, 0),
  hours: new THREE.Vector2(0, -SUB.offset),
};
const DATE_WINDOW = { x: 7.7, y: -7.7, w: 2.2, h: 1.6 };
const PRINT = '#f1f2f4';
const CREASE = THREE.MathUtils.degToRad(35);

// Luminous paint: off-white with a faint green, glows a little even in daylight
function createLume() {
  return new THREE.MeshPhysicalMaterial({ name: 'Lume', color: 0xeef2e4, roughness: 0.6, metalness: 0, emissive: 0x9dffc4, emissiveIntensity: 0.05 });
}

// Canvas texture drawn in millimetres around the centre of a disc of radius r (canvas top = 12 o'clock)
function discTexture(r, size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 2 / r, size / 2 / r);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.userData.mimeType = 'image/jpeg';
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

// Text at angle a (radians clockwise from 12) on radius r, turned so it reads upright from outside the watch:
// feet towards the centre in the upper half, towards the rim in the lower half
function radialText(ctx, text, r, a) {
  ctx.save();
  ctx.rotate(a);
  ctx.translate(0, -r);
  if (Math.cos(a) < -0.05) ctx.rotate(Math.PI);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Text along a circle, centred at `at` (radians clockwise from 12), feet towards the centre, reading clockwise
function arcText(ctx, text, radius, at, advance) {
  const step = advance / radius;
  [...text].forEach((ch, i) => {
    ctx.save();
    ctx.rotate(at + (i - (text.length - 1) / 2) * step);
    ctx.translate(0, -radius);
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

function buildCase(brushed) {
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
  return group;
}

// ---------------------------------------------------------------- bezel

// Blue, glossy insert: large numerals every ten minutes, dots at the fives, a small triangle at 0
function createInsertTexture() {
  return discTexture(BEZEL.insertOuter + 0.2, 2048, (ctx) => {
    const grad = ctx.createRadialGradient(0, 0, BEZEL.insertInner, 0, 0, BEZEL.insertOuter);
    grad.addColorStop(0, '#1b355f');
    grad.addColorStop(1, '#25467a');
    ctx.fillStyle = grad;
    ctx.fillRect(-30, -30, 60, 60);
    ctx.fillStyle = PRINT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 1.9px "Inter", sans-serif';
    const mid = (BEZEL.insertInner + BEZEL.insertOuter) / 2;
    for (let m = 5; m < 60; m += 5) {
      const a = (m / 60) * Math.PI * 2;
      if (m % 10 === 0) {
        radialText(ctx, String(m), mid, a);
      } else {
        ctx.beginPath();
        ctx.arc(Math.sin(a) * mid, -Math.cos(a) * mid, 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.moveTo(-0.85, -mid - 0.6);
    ctx.lineTo(0.85, -mid - 0.6);
    ctx.lineTo(0, -mid + 0.75);
    ctx.closePath();
    ctx.fill();
  });
}

// Rotating bezel: brushed ring with a fine coin edge, the blue insert on top.
// userData.ratchet lets the viewer turn it in 60 clicks, counter-clockwise only.
function buildBezel(brushed) {
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
  // Coin edge: fine rounded notches on the flank, for grip
  const pos = ringGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, y);
    if (r > BEZEL.outer - 0.01 && z > 3.25 && z < 4.4) {
      const k = 1 - (0.09 / r) * (0.5 + 0.5 * Math.cos(Math.atan2(y, x) * 120));
      pos.setX(i, x * k);
      pos.setY(i, y * k);
    }
  }
  ringGeo.computeVertexNormals();
  group.add(shadowed(new THREE.Mesh(ringGeo, brushed)));

  const insertGeo = discUVs(lathe([[BEZEL.insertOuter, BEZEL.insertHigh], [BEZEL.insertInner, BEZEL.insertLow]], 256), BEZEL.insertOuter + 0.2);
  const insert = new THREE.MeshPhysicalMaterial({
    name: 'BezelInsert', color: 0xffffff, map: createInsertTexture(), metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  group.add(shadowed(new THREE.Mesh(insertGeo, insert)));
  return group;
}

// Fluted crown along +X at the height of the case flank. Profile [r, distance from the centre].
function crownGeometry(profile, { flutes = 30, from, to, rFlute }) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 160);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) > rFlute && y > from && y < to) {
      const k = 1 - 0.05 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * flutes));
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  geo.computeVertexNormals();
  geo.rotateZ(-Math.PI / 2);
  geo.translate(0, 0, -0.6);
  return assignWorldUVs(geo);
}

function buildCrown(metal) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.crown;
  group.add(shadowed(new THREE.Mesh(crownGeometry([
    [1.3, 20.3], [1.3, 21.0], [1.9, 21.1], [2.55, 21.3], [2.65, 21.5], [2.65, 23.2],
    [2.5, 23.5], [2.1, 23.7], [1.5, 23.77], [0.001, 23.8],
  ], { from: 21.45, to: 23.25, rFlute: 2.6 }), metal)));
  return group;
}

// Chronograph pusher on its tube, pointing out along the radius at `clock` (radians clockwise from 12).
// Pressing it (see scene.js) moves it in along userData.axis.
function buildPusher(metal, clock, action) {
  const group = new THREE.Group();
  group.name = `Pusher${action === 'reset' ? 'Reset' : 'StartStop'}`;
  group.userData.pusher = action;
  group.userData.axis = [Math.sin(clock), Math.cos(clock)];
  group.add(shadowed(new THREE.Mesh(crownGeometry([
    [0.85, 20.2], [0.85, 21.75], [1.2, 21.8], [1.3, 21.95], [1.3, 23.25], [1.2, 23.45], [0.9, 23.55], [0.001, 23.58],
  ], { flutes: 0, from: 0, to: 0, rFlute: 99 }), metal)));
  group.rotation.z = Math.PI / 2 - clock;
  return group;
}

// ---------------------------------------------------------------- dial

// Tachymeter: speed for an event timed with the chronograph hand (km/h for one kilometre)
const TACHY = [400, 300, 250, 200, 180, 160, 140, 120, 110, 100, 90, 80, 70, 65, 60];

// Blue sunburst dial with the tachymeter on the outer ring, minute track, three subdials with their scales,
// wordmark, date window at 4:30
async function createChronoDialTexture(date) {
  await Promise.all([
    document.fonts.load('400 100px "Cormorant Garamond"'),
    document.fonts.load('500 40px "Inter"'),
  ]).catch(() => {});
  return discTexture(DIAL_R, 2048, (ctx) => {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, DIAL_R);
    grad.addColorStop(0, '#3a5f96');
    grad.addColorStop(1, '#172b4d');
    ctx.fillStyle = grad;
    ctx.fillRect(-DIAL_R, -DIAL_R, 2 * DIAL_R, 2 * DIAL_R);
    // Sunburst brushing
    for (let i = 0; i < 1440; i++) {
      const a = (i / 1440) * Math.PI * 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.012 + Math.abs(Math.sin(a * 2)) * 0.03 * ((i * 7919) % 13) / 13})`;
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * DIAL_R, Math.sin(a) * DIAL_R);
      ctx.stroke();
    }

    ctx.fillStyle = PRINT;
    ctx.strokeStyle = PRINT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Tachymeter: ticks at the edge, values inside them, the word from 12 towards the scale's start
    ctx.font = '500 0.62px "Inter", sans-serif';
    for (const v of TACHY) {
      const a = (3600 / v / 60) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -DIAL_R + 0.15);
      ctx.lineTo(0, -DIAL_R + 0.55);
      ctx.stroke();
      ctx.restore();
      if (v !== 60) radialText(ctx, String(v), DIAL_R - 0.9, a);
    }
    ctx.letterSpacing = '0.08px';
    arcText(ctx, 'TACHYMETER', DIAL_R - 0.9, 0.5, 0.52);
    ctx.letterSpacing = '0px';

    // Minute track inside the tachymeter
    for (let m = 0; m < 60; m++) {
      ctx.save();
      ctx.rotate((m / 60) * Math.PI * 2);
      ctx.lineWidth = m % 5 === 0 ? 0.16 : 0.07;
      ctx.beginPath();
      ctx.moveTo(0, -INDEX_OUTER - 0.25);
      ctx.lineTo(0, -INDEX_OUTER - (m % 5 === 0 ? 0.95 : 0.7));
      ctx.stroke();
      ctx.restore();
    }

    // Subdials: darker, with fine concentric azurage, a scale and numerals
    const subdial = (c, ticks, numbers) => {
      ctx.save();
      ctx.translate(c.x, -c.y);
      ctx.fillStyle = '#1b3159';
      ctx.beginPath();
      ctx.arc(0, 0, SUB.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 0.025;
      for (let r = 0.1; r < SUB.r; r += 0.085) {
        ctx.strokeStyle = `rgba(255,255,255,${r % 0.17 < 0.085 ? 0.07 : 0.025})`;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = PRINT;
      for (let k = 0; k < ticks; k++) {
        const major = k % (ticks / numbers.length) === 0;
        ctx.save();
        ctx.rotate((k / ticks) * Math.PI * 2);
        ctx.lineWidth = major ? 0.11 : 0.05;
        ctx.beginPath();
        ctx.moveTo(0, -SUB.r + 0.08);
        ctx.lineTo(0, -SUB.r + (major ? 0.6 : 0.38));
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = PRINT;
      ctx.font = '500 0.62px "Inter", sans-serif';
      numbers.forEach((n, i) => {
        const a = ((i + 1) / numbers.length) * Math.PI * 2;
        ctx.fillText(String(n), Math.sin(a) * (SUB.r - 1.15), -Math.cos(a) * (SUB.r - 1.15) + 0.03);
      });
      ctx.restore();
    };
    subdial(SUBDIALS.seconds, 60, [20, 40, 60]);
    subdial(SUBDIALS.minutes, 30, [10, 20, 30]);
    subdial(SUBDIALS.hours, 12, [2, 4, 6, 8, 10, 12]);

    // Wordmark and model name between the 12 baton and the subdials
    ctx.fillStyle = PRINT;
    ctx.letterSpacing = '0.3px';
    ctx.font = '400 1.6px "Cormorant Garamond", serif';
    ctx.fillText('ORVANE', 0.15, -7.4);
    ctx.letterSpacing = '0.16px';
    ctx.font = '500 0.5px "Inter", sans-serif';
    ctx.fillText('ABYSS · CHRONOGRAPH', 0.08, -5.95);

    // Date window at 4:30: white date disc seen through a cut-out
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(DATE_WINDOW.x - DATE_WINDOW.w / 2, -DATE_WINDOW.y - DATE_WINDOW.h / 2, DATE_WINDOW.w, DATE_WINDOW.h);
    ctx.fillStyle = '#111';
    ctx.font = '500 1.15px "Inter", sans-serif';
    ctx.fillText(String(date.getDate()), DATE_WINDOW.x, -DATE_WINDOW.y + 0.06);
  });
}

// Applied index: polished surround with a luminous fill, slightly recessed. Shapes in local coordinates with
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
const ringShape = (r0, r1) => {
  const s = new THREE.Shape().absarc(0, 0, r1, 0, Math.PI * 2, false);
  s.holes.push(new THREE.Path().absarc(0, 0, r0, 0, Math.PI * 2, true));
  return s;
};

function buildDial(texture, metal, lume) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.dial;

  const disc = new THREE.Mesh(discUVs(new THREE.CircleGeometry(DIAL_R, 160), DIAL_R), createDial(texture));
  disc.position.z = DIAL_Z;
  disc.receiveShadow = true;
  group.add(disc);

  // Rehaut: dark blue flange from the dial edge up to the glass, inside the bezel
  const flange = new THREE.Mesh(lathe([[GLASS.r, GLASS.z - 0.05], [DIAL_R - 0.05, DIAL_Z + 0.01]]),
    new THREE.MeshPhysicalMaterial({ name: 'Flange', color: 0x14223a, metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }));
  flange.receiveShadow = true;
  group.add(flange);

  // Batons: long between the subdials, short at 3, 6 and 9 where the subdials reach out, double at 12
  const place = (index, hour, length, dx = 0) => {
    const a = (hour / 12) * Math.PI * 2;
    const r = INDEX_OUTER - length / 2;
    index.position.set(Math.sin(a) * r + Math.cos(a) * dx, Math.cos(a) * r - Math.sin(a) * dx, DIAL_Z);
    index.rotation.z = -a;
    group.add(index);
  };
  const baton = (length) => appliedIndex(rectShape(0.95, length, 0.2), rectShape(0.5, length - 0.45, 0.12), metal, lume);
  for (let h = 1; h < 12; h++) {
    const short = h === 3 || h === 6 || h === 9;
    place(baton(short ? 1.5 : 3.4), h, short ? 1.5 : 3.4);
  }
  for (const dx of [-0.75, 0.75]) place(baton(3.4), 0, 3.4, dx);

  // Polished rings around the subdials
  const ringGeo = assignWorldUVs(toCreasedNormals(new THREE.ExtrudeGeometry(ringShape(SUB.r, SUB.r + 0.16), {
    depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 64,
  }), CREASE));
  for (const c of Object.values(SUBDIALS)) {
    const ring = shadowed(new THREE.Mesh(ringGeo, metal));
    ring.position.set(c.x, c.y, DIAL_Z);
    group.add(ring);
  }

  // Polished frame around the date window
  const windowFrame = rectShape(DATE_WINDOW.w + 0.45, DATE_WINDOW.h + 0.45, 0.2);
  windowFrame.holes.push(new THREE.Path(rectShape(DATE_WINDOW.w, DATE_WINDOW.h, 0.08).getPoints(12)));
  const frameGeo = new THREE.ExtrudeGeometry(windowFrame, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  const frame = shadowed(new THREE.Mesh(assignWorldUVs(toCreasedNormals(frameGeo, CREASE)), metal));
  frame.position.set(DATE_WINDOW.x, DATE_WINDOW.y, DIAL_Z);
  group.add(frame);
  return group;
}

// ---------------------------------------------------------------- hands

// Stick hand: polished frame with a pointed tip and a luminous fill; pointing to +Y
function stickShape(length, width, tail) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, -tail);
  s.lineTo(width / 2, -tail);
  s.lineTo(width / 2, length - width * 1.1);
  s.lineTo(0, length);
  s.lineTo(-width / 2, length - width * 1.1);
  s.closePath();
  return s;
}
function stickHand(name, length, width, tail, z, metal, lume, pipe) {
  const blade = new THREE.ExtrudeGeometry(stickShape(length, width, tail), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  const hand = buildHand(name, assignWorldUVs(toCreasedNormals(blade, CREASE)), z, metal, pipe.radius + 0.25, 0.2, pipe);
  const inset = 0.22;
  const fill = new THREE.Shape();
  fill.moveTo(-(width / 2 - inset), length * 0.24);
  fill.lineTo(width / 2 - inset, length * 0.24);
  fill.lineTo(width / 2 - inset, length - width * 1.1);
  fill.lineTo(0, length - width * 0.75);
  fill.lineTo(-(width / 2 - inset), length - width * 1.1);
  fill.closePath();
  const lumeMesh = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(fill, { depth: 0.04, bevelEnabled: false }), lume));
  lumeMesh.position.z = 0.125;
  hand.add(lumeMesh);
  return hand;
}

// Thin painted needle with a round hub, for the subdials and the central chronograph seconds
function needleHand(name, length, tail, width, z, paint, { hubRadius = 0.32, pipe, weight } = {}) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, -tail);
  s.lineTo(width / 2, -tail);
  s.lineTo(width * 0.3, length);
  s.lineTo(-width * 0.3, length);
  s.closePath();
  const hand = buildHand(name, new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }), z, paint, hubRadius, 0.1, pipe);
  if (weight) {
    const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(weight.r, weight.r, 0.06, 32).rotateX(Math.PI / 2), paint));
    disc.position.set(0, -weight.at, 0.03);
    hand.add(disc);
  }
  return hand;
}

// Subdial hand: pivot moved to the subdial centre; userData.chrono for the stopwatch counters
function subdialHand(name, centre, paint, chrono) {
  const hand = needleHand(name, SUB.r - 0.35, 0.7, 0.2, DIAL_Z + 0.22, paint, { hubRadius: 0.36, pipe: { radius: 0.18, down: 0.22 } });
  hand.position.x = centre.x;
  hand.position.y = centre.y;
  if (chrono) hand.userData.chrono = chrono;
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

export async function buildAbyssWatch({ metal = METALS.steel, date = new Date() } = {}) {
  const polished = createMetal(metal.color);
  const brushed = createMetal(metal.color, { brushed: true });
  for (const mat of [polished, brushed]) mat.name = MATERIAL_NAMES.caseMetal;
  const lume = createLume();
  const paint = new THREE.MeshPhysicalMaterial({ name: 'HandPaint', color: 0xf2f2ef, roughness: 0.35, metalness: 0, clearcoat: 0.5 });
  const dialTexture = await createChronoDialTexture(date);

  const root = new THREE.Group();
  root.name = 'Watch';
  root.add(
    buildCase(brushed),
    buildBezel(brushed),
    buildCrown(polished),
    buildPusher(polished, THREE.MathUtils.degToRad(52), 'startStop'),
    buildPusher(polished, THREE.MathUtils.degToRad(128), 'reset'),
    buildDial(dialTexture, polished, lume),
    // Running seconds at 9 (the watch's seconds hand); stopwatch counters at 3 (30 minutes, jumping each
    // minute) and 6 (12 hours); central chronograph seconds with 8 beats a second
    subdialHand(WATCH_PARTS.secondHand, SUBDIALS.seconds, paint),
    subdialHand('ChronoMinuteHand', SUBDIALS.minutes, paint, { period: 1800, jump: 60 }),
    subdialHand('ChronoHourHand', SUBDIALS.hours, paint, { period: 43200 }),
    // Satin frames: polished ones mirrored the dark studio and read as black outlines around the lume
    stickHand(WATCH_PARTS.hourHand, 8.6, 1.3, 1.4, DIAL_Z + 0.5, brushed, lume, { radius: 0.95, down: 0.5 }),
    stickHand(WATCH_PARTS.minuteHand, 12.9, 1.0, 1.8, DIAL_Z + 0.75, brushed, lume, { radius: 0.65, down: 0.09 }),
    Object.assign(needleHand('ChronoSecondHand', 14.7, 4.0, 0.2, DIAL_Z + 1.0, paint, {
      hubRadius: 0.5, pipe: { radius: 0.24, down: 0.08 }, weight: { r: 0.42, at: 2.2 },
    }), { userData: { chrono: { period: 60, beat: 8 } } }),
    buildGlass(),
    buildCaseback(),
    buildStrap(polished, brushed),
  );
  return root;
}
