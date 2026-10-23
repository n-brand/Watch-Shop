import * as THREE from 'three';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATCH_PARTS, MATERIAL_NAMES } from '../config.js';
import {
  METALS, createMetal, createGlass, createDial, createDialTexture, createMovementTexture, createLeather, assignWorldUVs,
} from './materials.js';
import { CRYSTALS } from '../logo/crystals.js';
import { createCrystalMesh } from '../logo/crystalMesh.js';

// Units are millimetres. Dial faces +Z, 12 o'clock points to +Y.
// Hands are groups pivoting at the origin and rotate around their local Z axis.

// Applied dial emblem at 12 o'clock (instead of the 12 index): logo K "Brillant gefasst",
// setting in case metal, diamond stone; outer tip aligned with the index circle
const DIAL_LOGO = { crystal: 'set-brilliant', stone: 'diamond', height: 4.0 };

const DIAL_R = 17.6;
const DIAL_Z = 1.8;
const CASE_R = 20.92;
const LUG_INNER_X = 10.0; // half of the 20 mm bracelet width
const CREASE = THREE.MathUtils.degToRad(35);

const rand = (() => {
  let s = 4242;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

export function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Lathe around the dial axis. Profile points [r, z] must run counter-clockwise around the solid's
// cross-section (outward along the bottom, up the outside, inward along the top) so normals face out.
function lathe(points, segments = 192) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return assignWorldUVs(geo);
}

// Extrudes a side profile: shape x -> world Y (length), shape y -> world Z (height), extrusion -> world X (width).
// Rounded bevels give soft, realistic edge highlights; creased normals keep flat faces crisp.
const PROFILE_TO_WORLD = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
export function profileSolid(shape, width, { bevel = 0.3, segments = 3, curveSegments = 14 } = {}) {
  const depth = Math.max(width - 2 * bevel, 0.01);
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segments, curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  geo.applyMatrix4(PROFILE_TO_WORLD);
  geo = toCreasedNormals(geo, CREASE);
  return assignWorldUVs(geo);
}

// Flat-shaded geometry from polygons; facets are oriented away from `center`
function facetGeometry(facets, center) {
  const positions = [];
  for (let pts of facets) {
    const [a, b, c] = pts.map((p) => new THREE.Vector3(...p));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const centroid = pts.reduce((acc, p) => acc.add(new THREE.Vector3(...p)), new THREE.Vector3()).divideScalar(pts.length);
    if (n.dot(centroid.sub(center)) < 0) pts = [...pts].reverse();
    for (let i = 1; i < pts.length - 1; i++) positions.push(...pts[0], ...pts[i], ...pts[i + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return assignWorldUVs(geo);
}

// ---------------------------------------------------------------- case

function lugShape() {
  const s = new THREE.Shape();
  s.moveTo(15.0, 2.2);
  s.lineTo(19.0, 2.0);
  s.quadraticCurveTo(23.6, 1.6, 25.2, 0.2);
  s.quadraticCurveTo(25.95, -0.6, 25.5, -1.6);
  s.lineTo(24.6, -2.5);
  s.quadraticCurveTo(21.0, -3.1, 17.0, -3.9);
  s.lineTo(15.0, -4.2);
  s.closePath();
  return s;
}

function buildCase(polished, brushed) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.case;

  // Caseback ring (brushed) runs into the polished middle case; small chamfers on every edge
  group.add(shadowed(new THREE.Mesh(lathe([
    [11.0, -4.95], [11.35, -5.38], [11.8, -5.52], [16.9, -5.52], [17.35, -5.36], [17.6, -5.08],
  ]), brushed)));
  group.add(shadowed(new THREE.Mesh(lathe([
    [17.6, -5.08], [18.9, -4.86], [19.8, -4.42], [20.4, -3.72], [20.76, -2.82], [CASE_R, -1.8],
    [CASE_R, 1.0], [20.84, 1.95], [20.58, 2.66], [20.22, 3.04], [19.95, 3.18], [17.8, 3.18], [17.72, 3.0], [17.72, DIAL_Z - 0.1],
  ]), polished)));

  const lugGeo = profileSolid(lugShape(), 3.4, { bevel: 0.38 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const lug = shadowed(new THREE.Mesh(lugGeo, polished));
      lug.position.x = sx * (LUG_INNER_X + 1.7);
      lug.scale.y = sy;
      group.add(lug);
    }
  }
  return group;
}

function buildBezel(metal) {
  const mesh = shadowed(new THREE.Mesh(lathe([
    [17.45, 3.18], [20.12, 3.18], [20.18, 3.7], [20.08, 4.25], [19.8, 4.62], [19.35, 4.8],
    [18.55, 4.8], [17.98, 4.62], [17.62, 4.25], [17.45, 3.72], [17.45, 3.18],
  ]), metal));
  mesh.name = WATCH_PARTS.bezel;
  return mesh;
}

// Fluted crown on a short tube; the grip is cut as 40 rounded flutes
function buildCrown(metal) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.crown;

  // 5 mm crown, short neck: the crown sits close to the case flank (case radius 20.92)
  const profile = [
    [1.3, 20.3], [1.3, 21.08], [1.75, 21.16], [2.3, 21.28], [2.5, 21.5], [2.5, 22.5], [2.5, 23.45],
    [2.38, 23.74], [2.05, 23.94], [1.6, 24.03], [0.001, 24.06],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 160);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 2.45 && y > 21.45 && y < 23.5) {
      const k = 1 - 0.04 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 36));
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  geo.computeVertexNormals();
  geo.rotateZ(-Math.PI / 2);
  geo.translate(0, 0, -0.35);
  assignWorldUVs(geo);
  group.add(shadowed(new THREE.Mesh(geo, metal)));
  return group;
}

// ---------------------------------------------------------------- dial

// Baton index with a hip roof: polished facets catch the light, flat base sits exactly on the dial
function batonGeometry(w, l, sideH, topH) {
  const x = w / 2;
  const y = l / 2;
  const inset = w * 0.45;
  const b = [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]];
  const t = [[-x, -y, sideH], [x, -y, sideH], [x, y, sideH], [-x, y, sideH]];
  const r0 = [0, -y + inset, topH];
  const r1 = [0, y - inset, topH];
  return facetGeometry([
    [b[0], b[1], t[1], t[0]], [b[1], b[2], t[2], t[1]], [b[2], b[3], t[3], t[2]], [b[3], b[0], t[0], t[3]],
    [t[0], t[3], r1, r0], [t[1], r0, r1, t[2]], [t[0], r0, t[1]], [t[2], r1, t[3]],
  ], new THREE.Vector3(0, 0, sideH * 0.4));
}

function buildDial(texture, metal) {
  const group = new THREE.Group();
  group.name = WATCH_PARTS.dial;

  const disc = new THREE.Mesh(new THREE.CircleGeometry(DIAL_R, 160), createDial(texture));
  disc.position.z = DIAL_Z;
  disc.receiveShadow = true;
  group.add(disc);

  // Rehaut: sloped flange between dial and case closes the visible gap at the dial edge
  const flange = new THREE.Mesh(lathe([[17.72, DIAL_Z + 0.55], [17.12, DIAL_Z + 0.01]]),
    new THREE.MeshPhysicalMaterial({ name: 'Flange', color: 0x17140f, metalness: 0.2, roughness: 0.45, side: THREE.DoubleSide }));
  flange.receiveShadow = true;
  group.add(flange);

  // Applied, diamond-cut batons as on real dials: radial, sitting flush on the dial (~0.45 mm proud),
  // all the same size, outer ends on one circle just inside the minute track. 12 o'clock carries the crystal emblem.
  const OUTER_R = 15.55;
  const INDEX_LENGTH = 2.8;
  const indexGeo = batonGeometry(0.85, INDEX_LENGTH, 0.26, 0.44);
  for (let h = 1; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const r = OUTER_R - INDEX_LENGTH / 2;
    const marker = shadowed(new THREE.Mesh(indexGeo, metal));
    marker.position.set(Math.sin(a) * r, Math.cos(a) * r, DIAL_Z);
    marker.rotation.z = -a;
    group.add(marker);
  }

  const logo = createCrystalMesh(CRYSTALS.find((c) => c.id === DIAL_LOGO.crystal), { stone: DIAL_LOGO.stone, metalMaterial: metal });
  logo.name = WATCH_PARTS.logo;
  logo.scale.setScalar(DIAL_LOGO.height / 2);
  logo.position.set(0, OUTER_R - DIAL_LOGO.height / 2, DIAL_Z + 0.005);
  logo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(logo);
  return group;
}

// ---------------------------------------------------------------- hands

// Dauphine hand with a centre ridge: two facets per side, thin bevelled edge, flat underside
function dauphineGeometry(length, width, tail, ridge) {
  const e = 0.07;
  const T = [0, length];
  const R = [width / 2, 0];
  const B = [0, -tail];
  const L = [-width / 2, 0];
  const top = (p) => [p[0], p[1], e];
  const base = (p) => [p[0], p[1], 0];
  const C = [0, 0, ridge];
  const outline = [T, L, B, R];
  const facets = [
    [top(T), top(L), C], [top(L), top(B), C], [top(B), top(R), C], [top(R), top(T), C],
    outline.map(base),
  ];
  outline.forEach((p, i) => {
    const n = outline[(i + 1) % 4];
    facets.push([base(p), base(n), top(n), top(p)]);
  });
  return facetGeometry(facets, new THREE.Vector3(0, length * 0.2, e * 0.5));
}

function hub(radius, height, metal) {
  const mesh = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.CylinderGeometry(radius, radius, height, 48)), metal));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = height / 2;
  return mesh;
}

function buildHand(name, geometry, z, metal, hubRadius, hubHeight) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.z = z;
  pivot.add(shadowed(new THREE.Mesh(geometry, metal)), hub(hubRadius, hubHeight, metal));
  return pivot;
}

function buildSecondHand(metal) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.13, -4.4);
  shape.lineTo(0.13, -4.4);
  shape.lineTo(0.07, 16.2);
  shape.lineTo(-0.07, 16.2);
  shape.closePath();
  const geo = assignWorldUVs(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }));
  const hand = buildHand(WATCH_PARTS.secondHand, geo, DIAL_Z + 1.24, metal, 0.42, 0.1);
  const weight = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 40)), metal));
  weight.rotation.x = Math.PI / 2;
  weight.position.set(0, -3.1, 0.04);
  // Domed centre cap
  const cap = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.SphereGeometry(0.55, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)), metal));
  cap.rotation.x = Math.PI / 2;
  cap.scale.y = 0.35;
  cap.position.z = 0.08;
  hand.add(weight, cap);
  return hand;
}

// ---------------------------------------------------------------- glass & caseback

// Slightly domed sapphire with a rounded edge, seated inside the bezel
function buildGlass() {
  const rimR = 17.2;
  const points = [[0.001, 3.3], [17.3, 3.3], [17.44, 3.36], [17.44, 3.55], [17.4, 3.7], [rimR, 3.78]];
  for (let i = 1; i <= 16; i++) {
    const r = rimR * (1 - i / 16);
    points.push([Math.max(r, 0.001), 3.78 + 0.72 * (1 - (r / rimR) ** 2)]);
  }
  const geo = lathe(points, 128);
  geo.deleteAttribute('uv'); // untextured: UVs would only add file size
  const mesh = new THREE.Mesh(geo, createGlass());
  mesh.name = WATCH_PARTS.glass;
  mesh.renderOrder = 2;
  return mesh;
}

// Exhibition caseback: movement disc, rotor and sapphire window, all facing -Z
function buildCaseback(movementTexture) {
  const group = new THREE.Group();
  group.name = 'Caseback';

  const movementGeo = new THREE.CircleGeometry(11.3, 96);
  movementGeo.rotateY(Math.PI);
  const movement = new THREE.Mesh(movementGeo, new THREE.MeshPhysicalMaterial({ map: movementTexture, metalness: 0.7, roughness: 0.35 }));
  movement.position.z = -4.6;
  movement.receiveShadow = true;

  const rotor = new THREE.Group();
  rotor.name = WATCH_PARTS.rotor;
  rotor.position.z = -4.95;
  const rotorGold = createMetal(METALS.yellowGold.color, { brushed: true });
  const sector = new THREE.Mesh(assignWorldUVs(new THREE.RingGeometry(2.4, 10.6, 64, 1, 0, Math.PI)), rotorGold);
  sector.geometry.rotateY(Math.PI);
  const rotorHub = new THREE.Mesh(assignWorldUVs(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 32)), rotorGold);
  rotorHub.rotation.x = Math.PI / 2;
  rotor.add(shadowed(sector), shadowed(rotorHub));

  const windowGeo = new THREE.CircleGeometry(11.6, 96);
  windowGeo.rotateY(Math.PI);
  const sapphire = new THREE.Mesh(windowGeo, createGlass());
  sapphire.position.z = -5.3;

  group.add(movement, rotor, sapphire);
  return group;
}

// ---------------------------------------------------------------- straps

// Straps loop around an elliptical "wrist" in the YZ plane, from the top lugs over the back to the bottom lugs.
// The underside is flattened (soft max against a plane), like a real wrist, so the straight clasp sits flush.
// Sized for an 18.5 cm wrist plus ~5 mm play: link centreline ~197 mm, inner circumference ~190 mm
// (was ~172 mm, which made the head look bulky). Lug-to-lug 51.9 mm is ~88 % of the ~59 mm wrist width,
// inside the 75–95 % range recommended for a good fit.
function wristCurve() {
  const ay = 34.1;
  const az = 28.6;
  const t0 = Math.asin(25.9 / ay);
  const zc = az * Math.cos(t0) + 1.4;
  const flatZ = -zc - az + 2.2;
  const softMax = (a, b, k = 1.2) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2;
  const pointAt = (t) => new THREE.Vector3(0, ay * Math.sin(t), softMax(-zc + az * Math.cos(t), flatZ));
  const tangentAngle = (t) => {
    const a = pointAt(t - 1e-4);
    const b = pointAt(t + 1e-4);
    return Math.atan2(b.z - a.z, b.y - a.y);
  };

  const samples = [];
  let total = 0;
  let prev = pointAt(t0);
  const steps = 2000;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (i / steps) * (Math.PI * 2 - 2 * t0);
    const p = pointAt(t);
    total += p.distanceTo(prev);
    samples.push({ t, s: total });
    prev = p;
  }
  const tAt = (s) => samples.find((x) => x.s >= s)?.t ?? samples.at(-1).t;
  return { t0, pointAt, tangentAngle, total, tAt };
}

// Link side profile: flat underside, gently crowned top, length along the strap
function linkShape(length, thickness, crown) {
  const half = length / 2;
  const h = thickness / 2;
  const s = new THREE.Shape();
  s.moveTo(-half, -h);
  s.lineTo(half, -h);
  s.lineTo(half, h - 0.25);
  s.quadraticCurveTo(0, h + crown, -half, h - 0.25);
  s.closePath();
  return s;
}

// End link: follows the case curve on the inside, flush between the lugs
function endLinkGeometry() {
  const s = new THREE.Shape();
  s.moveTo(17.8, 0.9);
  s.lineTo(22.6, 0.35);
  s.quadraticCurveTo(25.1, 0.0, 25.7, -0.8);
  s.lineTo(25.7, -2.0);
  s.quadraticCurveTo(25.5, -2.75, 24.6, -2.85);
  s.lineTo(17.8, -3.25);
  s.closePath();
  const geo = profileSolid(s, 2 * LUG_INNER_X - 0.3, { bevel: 0.32 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const w = THREE.MathUtils.clamp((22.6 - y) / (22.6 - 17.8), 0, 1);
    const target = Math.sqrt(CASE_R ** 2 - pos.getX(i) ** 2) - 0.15;
    pos.setY(i, y + w * (target - 17.8));
  }
  geo.computeVertexNormals();
  return toCreasedNormals(geo, CREASE);
}

// Folding clasp as seen from outside: brushed body as thick as the links, a polished cover with the
// crystal emblem, a lift tab with its parting line at one end and hinge knuckles towards the links.
// Local frame like a link: Y along the bracelet, +Z outward (away from the wrist), X across.
function buildClasp(length, width, polished, brushed) {
  const group = new THREE.Group();
  group.name = 'Clasp';
  const thick = 2.3;
  const flat = (len, h) => {
    const s = new THREE.Shape();
    s.moveTo(-len / 2, -h / 2);
    s.lineTo(len / 2, -h / 2);
    s.lineTo(len / 2, h / 2);
    s.lineTo(-len / 2, h / 2);
    s.closePath();
    return s;
  };

  const bodyLen = length - 1.6;
  group.add(shadowed(new THREE.Mesh(profileSolid(flat(bodyLen, thick - 0.4), width, { bevel: 0.35 }), brushed)));

  // Polished cover slightly proud of the body; the lift tab is a separate piece behind a fine gap
  const tabLen = 2.6;
  const coverLen = bodyLen - tabLen - 1.0;
  const cover = shadowed(new THREE.Mesh(profileSolid(flat(coverLen, 0.6), width - 1.6, { bevel: 0.22 }), polished));
  cover.position.set(0, -(tabLen + 0.25) / 2, (thick - 0.4) / 2 + 0.2);
  const tab = shadowed(new THREE.Mesh(profileSolid(flat(tabLen, 0.6), width - 4.5, { bevel: 0.25 }), polished));
  tab.position.set(0, coverLen / 2 - (tabLen + 0.25) / 2 + 0.25 + tabLen / 2, (thick - 0.4) / 2 + 0.2);
  group.add(cover, tab);

  // Crystal emblem engraved/applied on the cover, pointing along the bracelet
  const emblem = createCrystalMesh(CRYSTALS.find((c) => c.id === DIAL_LOGO.crystal), { stone: DIAL_LOGO.stone, metalMaterial: polished });
  emblem.scale.setScalar(2.2);
  emblem.position.set(0, cover.position.y, cover.position.z + 0.3);
  emblem.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.add(emblem);

  // Hinge knuckles at both ends where the clasp blades pick up the last links
  const knuckleGeo = assignWorldUVs(new THREE.CylinderGeometry(0.75, 0.75, width - 2.4, 32).rotateZ(Math.PI / 2));
  for (const sy of [-1, 1]) {
    const knuckle = shadowed(new THREE.Mesh(knuckleGeo, polished));
    knuckle.position.set(0, sy * (bodyLen / 2 + 0.35), 0.1);
    group.add(knuckle);
  }
  return group;
}

// endLinks: false for cases with integrated lugs that pick up the first link directly
function buildBracelet(polished, brushed, { endLinks = true } = {}) {
  const group = new THREE.Group();
  group.name = 'Bracelet';
  const { pointAt, tangentAngle, total, tAt } = wristCurve();

  const claspHalf = 11;
  const linkLength = 4.75;
  const joint = 0.22;
  // Each half runs evenly from the end link to the clasp, so there is no stray gap at the clasp
  const first = linkLength / 2 + 0.25;
  const last = total / 2 - claspHalf - joint - linkLength / 2;
  const n = Math.round((last - first) / (linkLength + joint));
  const pitch = (last - first) / n;
  const links = [];
  for (let k = 0; k <= n; k++) {
    const s = first + k * pitch;
    links.push(s, total - s);
  }
  // Bracelet tapers from 20 mm at the lugs to 17 mm at the clasp
  const taper = (s) => 1 - 0.15 * (1 - Math.abs(s - total / 2) / (total / 2));

  const outerW = 6.3;
  const centerW = 5.0;
  const gap = 0.3;
  const outerX = centerW / 2 + gap + outerW / 2;
  const outerGeo = profileSolid(linkShape(linkLength, 2.3, 0.22), outerW, { bevel: 0.32 });
  const centerGeo = profileSolid(linkShape(linkLength, 2.3, 0.34), centerW, { bevel: 0.3 });
  const pinGeo = assignWorldUVs(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 20).rotateZ(Math.PI / 2));

  const outer = new THREE.InstancedMesh(outerGeo, brushed, links.length * 2);
  const center = new THREE.InstancedMesh(centerGeo, polished, links.length);
  const pins = new THREE.InstancedMesh(pinGeo, polished, links.length * 2);
  outer.name = 'StrapOuter';
  center.name = 'StrapCenter';
  pins.name = 'StrapPins';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const tint = new THREE.Color();
  const orient = (t, jitter = 0) => q.setFromEuler(e.set(tangentAngle(t) + jitter, 0, 0));

  links.forEach((s, i) => {
    const t = tAt(s);
    const f = taper(s);
    const p = pointAt(t);
    // Tiny per-link variation so repeated links are not perfectly identical
    orient(t, (rand() - 0.5) * 0.008);
    center.setMatrixAt(i, m.compose(p.clone().setZ(p.z), q, new THREE.Vector3(f, 1, 1)));
    center.setColorAt(i, tint.setScalar(0.985 + rand() * 0.015));
    for (const [k, sx] of [[0, -1], [1, 1]]) {
      outer.setMatrixAt(i * 2 + k, m.compose(p.clone().setX(sx * outerX * f), q, new THREE.Vector3(f, 1, 1)));
      outer.setColorAt(i * 2 + k, tint.setScalar(0.975 + rand() * 0.025));
      // Pin head where this link hinges to its neighbour towards the clasp
      const tj = tAt(s < total / 2 ? s + pitch / 2 : s - pitch / 2);
      const pj = pointAt(tj);
      orient(tj);
      pins.setMatrixAt(i * 2 + k, m.compose(pj.setX(sx * (outerX + outerW / 2 + 0.06) * f), q, new THREE.Vector3(1, 1, 1)));
      orient(t);
    }
  });
  for (const mesh of [outer, center, pins]) {
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (endLinks) {
    const endGeo = endLinkGeometry();
    for (const sy of [-1, 1]) {
      const end = shadowed(new THREE.Mesh(endGeo, polished));
      end.scale.y = sy;
      group.add(end);
    }
  }

  const tMid = tAt(total / 2);
  const clasp = buildClasp(claspHalf * 2, (2 * outerX + outerW) * taper(total / 2), polished, brushed);
  clasp.position.copy(pointAt(tMid));
  clasp.quaternion.copy(orient(tMid));
  group.add(clasp);

  return group;
}

function buildLeather(polished) {
  const group = new THREE.Group();
  group.name = 'Leather';
  const { pointAt, tangentAngle, total, tAt } = wristCurve();

  // Path starts under the lugs, follows the wrist and ends under the opposite lugs
  const points = [new THREE.Vector3(0, 20.5, -1.9)];
  for (let i = 0; i <= 80; i++) points.push(pointAt(tAt((i / 80) * total)));
  points.push(new THREE.Vector3(0, -20.5, -1.9));
  const path = new THREE.CatmullRomCurve3(points);

  // Cross-section: for a curve in the YZ plane three.js maps shape x to world X (width), shape y to thickness
  const section = new THREE.Shape();
  const half = 9.8;
  const thick = 1.5;
  section.moveTo(-half + 1, -thick);
  section.lineTo(half - 1, -thick);
  section.quadraticCurveTo(half, -thick, half, -thick + 1);
  section.lineTo(half, thick - 1);
  section.quadraticCurveTo(half, thick, half - 1, thick);
  section.lineTo(-half + 1, thick);
  section.quadraticCurveTo(-half, thick, -half, thick - 1);
  section.lineTo(-half, -thick + 1);
  section.quadraticCurveTo(-half, -thick, -half + 1, -thick);
  section.closePath();

  // Extrude output stores every triangle corner separately; leather has no texture, so weld by position
  // (about a third of the data, and smooth normals instead of faceted ones)
  let bandGeo = new THREE.ExtrudeGeometry(section, { steps: 140, curveSegments: 3, bevelEnabled: false, extrudePath: path });
  bandGeo.deleteAttribute('normal');
  bandGeo.deleteAttribute('uv');
  bandGeo = mergeVertices(bandGeo, 1e-3);
  bandGeo.computeVertexNormals();
  const band = new THREE.Mesh(bandGeo, createLeather(0x7a4a2a));
  group.add(shadowed(band));

  // Pin buckle at the back
  const frame = new THREE.Shape();
  frame.moveTo(-12, -6);
  frame.lineTo(12, -6);
  frame.lineTo(12, 6);
  frame.lineTo(-12, 6);
  frame.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-10.4, -4.4);
  hole.lineTo(-10.4, 4.4);
  hole.lineTo(10.4, 4.4);
  hole.lineTo(10.4, -4.4);
  hole.closePath();
  frame.holes.push(hole);
  const buckleGeo = new THREE.ExtrudeGeometry(frame, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2 });
  buckleGeo.center();
  const buckle = shadowed(new THREE.Mesh(assignWorldUVs(buckleGeo), polished));
  const tBuckle = tAt(total * 0.62);
  // Local Y follows the strap, local Z is the outward normal
  const angle = tangentAngle(tBuckle);
  buckle.rotation.x = angle;
  buckle.position.copy(pointAt(tBuckle)).add(new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle)).multiplyScalar(1.8));
  group.add(buckle);

  group.visible = false;
  return group;
}

// Shared with other models: bracelet and leather follow the same wrist, starting 25.9 mm from the case centre
export function buildStrap(polished, brushed, { endLinks = true } = {}) {
  const strap = new THREE.Group();
  strap.name = WATCH_PARTS.strap;
  strap.add(buildBracelet(polished, brushed, { endLinks }), buildLeather(polished));
  return strap;
}

export async function buildProceduralWatch({ metal = METALS.yellowGold } = {}) {
  const polished = createMetal(metal.color);
  const brushed = createMetal(metal.color, { brushed: true });
  for (const mat of [polished, brushed]) mat.name = MATERIAL_NAMES.caseMetal;
  const dialTexture = await createDialTexture();
  const movementTexture = createMovementTexture();

  const root = new THREE.Group();
  root.name = 'Watch';
  root.add(
    buildCase(polished, brushed),
    buildBezel(polished),
    buildCrown(polished),
    buildDial(dialTexture, polished),
    buildHand(WATCH_PARTS.hourHand, dauphineGeometry(10.2, 1.55, 1.5, 0.2), DIAL_Z + 0.72, polished, 1.15, 0.24),
    buildHand(WATCH_PARTS.minuteHand, dauphineGeometry(15.4, 1.25, 1.7, 0.18), DIAL_Z + 0.98, polished, 0.85, 0.22),
    buildSecondHand(polished),
    buildGlass(),
    buildCaseback(movementTexture),
    buildStrap(polished, brushed),
  );
  return root;
}
