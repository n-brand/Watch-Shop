import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATCH_PARTS, MATERIAL_NAMES } from '../config.js';
import {
  METALS, createMetal, createGlass, withReflection, createDial, createDialTexture, createLeather, createLeatherEdge, createStitch,
  LEATHER_TILE, assignWorldUVs,
} from './materials.js';
import { CRYSTALS } from '../logo/crystals.js';
import { createCrystalMesh } from '../logo/crystalMesh.js';
import { buildMovement, buildCasebackGlass } from './movement.js';

// Units are millimetres. Dial faces +Z, 12 o'clock points to +Y.
// Hands are groups pivoting at the origin and rotate around their local Z axis.

// Applied dial emblem at 12 o'clock (instead of the 12 index): logo K "Brillant gefasst",
// setting in case metal, diamond stone; outer tip aligned with the index circle
const DIAL_LOGO = { crystal: 'set-brilliant', stone: 'diamond', height: 4.0 };

const DIAL_R = 17.6;
const DIAL_Z = 1.8;
const CASE_R = 20.92;
const LUG_INNER_X = 10.0; // half of the 20 mm bracelet width
// Where the strap starts (distance from the case centre along 12/6 o'clock). The lugs end here, the strap follows
// the wrist from here; shorter lugs therefore mean a longer strap on the same wrist. Was 25.9 (long lugs).
export const STRAP_START = 23.4;
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
// UVs: the lathe's own (u around the axis, v along the profile), scaled to ~24 mm per tile like assignWorldUVs.
// Brushing then runs around the circle, as on a turned part; the per-vertex axis projection of assignWorldUVs
// flipped between neighbouring vertices on 45° chamfers and showed as a sawtooth band.
function lathe(points, segments = 192) {
  const geo = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  const meanR = points.reduce((sum, [r]) => sum + r, 0) / points.length;
  const tilesAround = Math.max(1, Math.round((2 * Math.PI * meanR) / 24)); // whole tiles, so there is no seam
  let profileLength = 0;
  for (let i = 1; i < points.length; i++) profileLength += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tilesAround, (uv.getY(i) * profileLength) / 24);
  return geo;
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

// Side profile of a lug, drawn for the original 25.95 mm reach and compressed along Y to end at the strap start
function lugShape() {
  const y = (v) => 15.0 + (v - 15.0) * ((STRAP_START + 0.05 - 15.0) / (25.95 - 15.0));
  const s = new THREE.Shape();
  s.moveTo(y(15.0), 2.2);
  s.lineTo(y(19.0), 2.0);
  s.quadraticCurveTo(y(23.6), 1.6, y(25.2), 0.2);
  s.quadraticCurveTo(y(25.95), -0.6, y(25.5), -1.6);
  s.lineTo(y(24.6), -2.5);
  s.quadraticCurveTo(y(21.0), -3.1, y(17.0), -3.9);
  s.lineTo(y(15.0), -4.2);
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

// pipe: { radius, down } adds the pipe the hand sits on, reaching `down` mm below the hand to the dial or to
// the hand underneath (hour pipe, minute pipe, seconds arbor nest inside each other), so the hand stack is
// closed in the centre and nothing can be seen through underneath the hands
function buildHand(name, geometry, z, metal, hubRadius, hubHeight, pipe) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.z = z;
  pivot.add(shadowed(new THREE.Mesh(geometry, metal)), hub(hubRadius, hubHeight, metal));
  if (pipe) {
    const tube = shadowed(new THREE.Mesh(assignWorldUVs(new THREE.CylinderGeometry(pipe.radius, pipe.radius, pipe.down, 40)), metal));
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -pipe.down / 2;
    pivot.add(tube);
  }
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
  const hand = buildHand(WATCH_PARTS.secondHand, geo, DIAL_Z + 0.84, metal, 0.42, 0.1, { radius: 0.22, down: 0.08 });
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
  return withReflection(mesh);
}

// Exhibition caseback: the OR-01 movement (see movement.js) with its rotor, behind a sapphire window, all facing -Z
function buildCaseback() {
  const group = new THREE.Group();
  group.name = 'Caseback';
  const { movement, rotor } = buildMovement();
  rotor.name = WATCH_PARTS.rotor;
  // Flat sapphire: a touch more reflective than the domed front crystal, so it reads as glass from behind
  const glass = createGlass();
  glass.specularIntensity = 0.28;
  // Weaker reflection layer than on the front: a flat window seen square-on veiled the movement in a milky blue
  group.add(movement, rotor, withReflection(buildCasebackGlass(glass), { strength: 0.45 }));
  return group;
}

// ---------------------------------------------------------------- straps

// Straps loop around an elliptical "wrist" in the YZ plane, from the top lugs over the back to the bottom lugs.
// The underside is flattened (soft max against a plane), like a real wrist, so the straight clasp sits flush.
// Sized for an 18.5 cm wrist plus ~5 mm play (was ~172 mm inner circumference, which made the head look bulky).
// The strap starts at STRAP_START: with the short lugs (lug-to-lug ~46.8 mm instead of 51.9 mm) it covers more
// of the same wrist and is correspondingly longer, so the proportions on the wrist stay the same.
function wristCurve() {
  const ay = 34.1;
  const az = 28.6;
  const t0 = Math.asin(STRAP_START / ay);
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

// End link: follows the case curve on the inside, flush between the lugs.
// Drawn for the original 25.7 mm reach and compressed along Y to end just before the strap start.
function endLinkGeometry() {
  const y = (v) => 17.8 + (v - 17.8) * ((STRAP_START - 0.2 - 17.8) / (25.7 - 17.8));
  const s = new THREE.Shape();
  s.moveTo(y(17.8), 0.9);
  s.lineTo(y(22.6), 0.35);
  s.quadraticCurveTo(y(25.1), 0.0, y(25.7), -0.8);
  s.lineTo(y(25.7), -2.0);
  s.quadraticCurveTo(y(25.5), -2.75, y(24.6), -2.85);
  s.lineTo(y(17.8), -3.25);
  s.closePath();
  const geo = profileSolid(s, 2 * LUG_INNER_X - 0.3, { bevel: 0.32 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const yi = pos.getY(i);
    const w = THREE.MathUtils.clamp((y(22.6) - yi) / (y(22.6) - 17.8), 0, 1);
    const target = Math.sqrt(CASE_R ** 2 - pos.getX(i) ** 2) - 0.15;
    pos.setY(i, yi + w * (target - 17.8));
  }
  geo.computeVertexNormals();
  return toCreasedNormals(geo, CREASE);
}

// Bar running along Y (length) with a cross-section in XZ: flat underside, top crowned across the width
// by `crown`, rounded edges. Crowned tops pick up a soft gradient instead of mirroring one flat patch of studio.
function crownedBar(width, length, z0, z1, crown, bevel) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, z0);
  s.lineTo(width / 2, z0);
  s.lineTo(width / 2, z1);
  s.quadraticCurveTo(0, z1 + 2 * crown, -width / 2, z1);
  s.closePath();
  let geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(length - 2 * bevel, 0.01), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 3, curveSegments: 16,
  });
  geo.translate(0, 0, bevel - length / 2);
  geo.rotateX(Math.PI / 2); // extrusion -> Y, shape y -> Z
  geo = toCreasedNormals(geo, CREASE);
  return assignWorldUVs(geo);
}

// Lift tab outline seen from outside: square towards the cover, softly rounded corners at the free end (+Y)
function tabShape(width, length, r) {
  const hw = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw, -length / 2);
  s.lineTo(hw, -length / 2);
  s.lineTo(hw, length / 2 - r);
  s.quadraticCurveTo(hw, length / 2, hw - r, length / 2);
  s.lineTo(-hw + r, length / 2);
  s.quadraticCurveTo(-hw, length / 2, -hw, length / 2 - r);
  s.closePath();
  return s;
}

// Engraved wordmark for the polished centre band (no emblem or stone on the clasp); dark on white, multiplied with the metal
function claspEngraving() {
  const w = 256;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const ink = 'rgb(96, 86, 72)';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // Wordmark along the band, reading from the knuckle end towards the lift tab
  ctx.save();
  ctx.translate(w / 2, h * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 118px "Cormorant Garamond", serif';
  ctx.letterSpacing = '30px';
  ctx.fillText('ORVANE', 15, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.mimeType = 'image/jpeg';
  return texture;
}

// Folding clasp as seen from outside, built like a real deployant: a brushed lower blade, a fine dark
// parting line, a brushed, crowned cover with a polished centre band (continuing the bracelet's centre links)
// carrying the engraved wordmark, a rounded lift tab behind a fine gap, and hinge knuckles towards the links.
// Local frame like a link: Y along the bracelet, +Z outward (away from the wrist), X across.
function buildClasp(length, width, bandWidth, polished, brushed) {
  const group = new THREE.Group();
  group.name = 'Clasp';
  const bottom = -1.15; // same thickness as the links (2.3 mm, centred on the wrist curve)
  const split = -0.12; // parting line between blade and cover
  const top = 0.95;
  const crown = 0.18;
  const bodyLen = length - 1.6;

  // Brushed like the outer links: a polished blade mirrored the dark studio floor and read as a hole beside the tab
  const blade = shadowed(new THREE.Mesh(crownedBar(width - 0.5, bodyLen, bottom, split - 0.08, 0, 0.25), brushed));
  const core = new THREE.Mesh(crownedBar(width - 1.4, bodyLen - 1.0, split - 0.2, split + 0.12, 0, 0.05),
    new THREE.MeshPhysicalMaterial({ name: 'ClaspGap', color: 0x14110d, metalness: 0.6, roughness: 0.5 }));
  group.add(blade, core);

  // Cover and lift tab share one length; the tab sits at the +Y end behind a 0.3 mm gap
  const tabLen = 3.4;
  const gap = 0.3;
  const coverLen = bodyLen - tabLen - gap;
  const coverY = -bodyLen / 2 + coverLen / 2;
  const cover = shadowed(new THREE.Mesh(crownedBar(width, coverLen, split + 0.08, top, crown, 0.32), brushed));
  cover.position.y = coverY;
  group.add(cover);

  // Polished band along the crown of the cover, with the engraving (UVs span the band)
  const bandLen = coverLen - 2.2;
  const bandGeo = crownedBar(bandWidth, bandLen, top + crown - 0.25, top + crown + 0.06, 0.03, 0.08);
  const pos = bandGeo.attributes.position;
  const uv = bandGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / bandWidth + 0.5, pos.getY(i) / bandLen + 0.5);
  const bandMaterial = polished.clone();
  bandMaterial.map = claspEngraving();
  const band = shadowed(new THREE.Mesh(bandGeo, bandMaterial));
  band.position.y = coverY;
  group.add(band);

  // Lift tab: nearly the cover's width (a narrow tab left dark, shadowed blade showing beside it),
  // a touch lower than the cover and behind a fine gap, so it reads as its own part
  const tabW = width - 1.2;
  const tabGeo = new THREE.ExtrudeGeometry(tabShape(tabW, tabLen, 1.1), {
    depth: top + crown - split - 0.45, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 3, curveSegments: 12,
  });
  const tab = shadowed(new THREE.Mesh(assignWorldUVs(toCreasedNormals(tabGeo, CREASE)), polished));
  tab.position.set(0, bodyLen / 2 - tabLen / 2, split + 0.1);
  group.add(tab);

  // Hinge knuckles at both ends where the clasp blades pick up the last links; full link height so no gap shows
  const knuckleGeo = assignWorldUVs(new THREE.CylinderGeometry(1.0, 1.0, width - 1.6, 32).rotateZ(Math.PI / 2));
  for (const sy of [-1, 1]) {
    const knuckle = shadowed(new THREE.Mesh(knuckleGeo, polished));
    knuckle.position.set(0, sy * (bodyLen / 2 + 0.45), -0.05);
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
  const clasp = buildClasp(claspHalf * 2, (2 * outerX + outerW) * taper(total / 2), centerW * taper(total / 2), polished, brushed);
  clasp.position.copy(pointAt(tMid));
  clasp.quaternion.copy(orient(tMid));
  group.add(clasp);

  return group;
}

// Leather strap: one band around the wrist (lug to lug), the pin buckle sits on the underside of the wrist.
// Like a real strap it tapers from the lugs (19.6 mm) to the buckle (16 mm) and thins out a little;
// the grain side is slightly domed, the edges are rounded and painted. UVs are millimetres / LEATHER_TILE
// (u across, v along the strap) for the grain maps. Stitching, holes, keepers and the buckle follow the same frames.
const LEATHER = { lugWidth: 19.6, buckleWidth: 16, lugThick: 3.0, buckleThick: 2.4, dome: 0.3, buckleAt: 0.62 };
const STITCH = { inset: 1.35, pitch: 1.7, length: 1.05, radius: 0.17 };

function buildLeather(polished) {
  const group = new THREE.Group();
  group.name = 'Leather';
  const { pointAt, total, tAt } = wristCurve();

  // Path starts under the lugs, follows the wrist and ends under the opposite lugs
  const points = [new THREE.Vector3(0, STRAP_START - 5.4, -1.9)];
  for (let i = 0; i <= 80; i++) points.push(pointAt(tAt((i / 80) * total)));
  points.push(new THREE.Vector3(0, -(STRAP_START - 5.4), -1.9));
  const path = new THREE.CatmullRomCurve3(points);
  const length = path.getLength();
  const sBuckle = points[0].distanceTo(points[1]) + total * LEATHER.buckleAt;

  // Width and thickness taper linearly from each lug towards the buckle
  const taper = (s) => Math.min(1, Math.abs(s - sBuckle) / (s < sBuckle ? sBuckle : length - sBuckle));
  const halfW = (s) => (LEATHER.buckleWidth + (LEATHER.lugWidth - LEATHER.buckleWidth) * taper(s)) / 2;
  const halfT = (s) => (LEATHER.buckleThick + (LEATHER.lugThick - LEATHER.buckleThick) * taper(s)) / 2;
  // Frame at arc length s: the path lies in the YZ plane, so width is always world X; n points away from the wrist
  const frameAt = (s) => {
    const u = THREE.MathUtils.clamp(s / length, 0, 1);
    const t = path.getTangentAt(u);
    return { p: path.getPointAt(u), t, n: new THREE.Vector3(0, -t.z, t.y) };
  };
  // Height of the grain side above the centre line at x (domed between the edge radii)
  const topY = (s, x) => {
    const h = halfT(s);
    const flat = halfW(s) - h;
    return h + LEATHER.dome * Math.max(0, 1 - (x / flat) ** 2);
  };

  // Cross-section ring: grain side, right edge, flesh side, left edge (edges are half circles of radius h)
  const TOP = 14;
  const ARC = 8;
  function ring(s) {
    const w = halfW(s);
    const h = halfT(s);
    const flat = w - h;
    const pts = [];
    for (let i = 0; i <= TOP; i++) {
      const x = -flat + (2 * flat * i) / TOP;
      pts.push({ x, y: topY(s, x), edge: false });
    }
    for (let i = 1; i < ARC; i++) {
      const a = Math.PI / 2 - (Math.PI * i) / ARC;
      pts.push({ x: flat + h * Math.cos(a), y: h * Math.sin(a), edge: true });
    }
    for (let i = 0; i <= TOP; i++) {
      const x = flat - (2 * flat * i) / TOP;
      pts.push({ x, y: -h, edge: false });
    }
    for (let i = 1; i < ARC; i++) {
      const a = -Math.PI / 2 - (Math.PI * i) / ARC;
      pts.push({ x: -flat + h * Math.cos(a), y: h * Math.sin(a), edge: true });
    }
    return pts;
  }

  const STEPS = 420;
  const perRing = ring(0).length;
  const positions = [];
  const uvs = [];
  for (let k = 0; k <= STEPS; k++) {
    const s = (k / STEPS) * length;
    const { p, n } = frameAt(s);
    let arc = 0;
    let prev = null;
    for (const q of ring(s)) {
      if (prev) arc += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
      positions.push(p.x + q.x, p.y + n.y * q.y, p.z + n.z * q.y);
      uvs.push(arc / LEATHER_TILE, s / LEATHER_TILE);
    }
  }
  const segIsEdge = ring(0).map((q, i, all) => q.edge || all[(i + 1) % all.length].edge);
  const faces = [];
  const edges = [];
  for (let k = 0; k < STEPS; k++) {
    for (let i = 0; i < perRing; i++) {
      const a = k * perRing + i;
      const b = k * perRing + ((i + 1) % perRing);
      const c = a + perRing;
      const d = b + perRing;
      (segIsEdge[i] ? edges : faces).push(a, c, b, b, c, d);
    }
  }
  // End caps under the lugs (hidden, but close the band)
  for (const k of [0, STEPS]) {
    const first = k * perRing;
    for (let i = 1; i < perRing - 1; i++) {
      if (k === 0) edges.push(first, first + i + 1, first + i);
      else edges.push(first, first + i, first + i + 1);
    }
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bandGeo.setIndex([...faces, ...edges]);
  bandGeo.addGroup(0, faces.length, 0);
  bandGeo.addGroup(faces.length, edges.length, 1);
  bandGeo.computeVertexNormals();
  // Winding check: the grain side of the middle ring has to face outward, else flip every triangle
  const mid = Math.floor(STEPS / 2) * perRing + Math.floor(TOP / 2);
  const nMid = new THREE.Vector3().fromBufferAttribute(bandGeo.attributes.normal, mid);
  if (nMid.dot(frameAt(length / 2).n) < 0) {
    const idx = bandGeo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    bandGeo.computeVertexNormals();
  }
  bandGeo.computeTangents();
  const leather = createLeather(0x7a4a2a);
  group.add(shadowed(new THREE.Mesh(bandGeo, [leather, createLeatherEdge(0x24150d)])));

  // Orientation of a part lying on the strap: local X across, local Y along, local Z outward
  const basis = new THREE.Matrix4();
  const place = (s, x, lift, scale = new THREE.Vector3(1, 1, 1)) => {
    const { p, t, n } = frameAt(s);
    basis.makeBasis(new THREE.Vector3(1, 0, 0), t, n);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const pos = p.clone().add(new THREE.Vector3(x, 0, 0)).addScaledVector(n, lift);
    return new THREE.Matrix4().compose(pos, q, scale);
  };

  // Edge stitching on the grain side: short thread capsules, half sunk into the leather.
  // None under the buckle frame and the keepers.
  const covered = (s) => Math.abs(s - sBuckle) < 7 || (s > sBuckle + 9 && s < sBuckle + 22);
  const stitchGeo = new THREE.CapsuleGeometry(STITCH.radius, STITCH.length - 2 * STITCH.radius, 2, 6);
  const stitches = [];
  for (let s = 6.5; s < length - 6.5; s += STITCH.pitch) {
    if (covered(s)) continue;
    for (const side of [-1, 1]) {
      const x = side * (halfW(s) - STITCH.inset);
      stitches.push(place(s, x, topY(s, x) - 0.04));
    }
  }
  const stitchMesh = new THREE.InstancedMesh(stitchGeo, createStitch(0xd8c4a0), stitches.length);
  stitches.forEach((m, i) => stitchMesh.setMatrixAt(i, m));
  group.add(shadowed(stitchMesh));

  // Holes on the tail, which runs through the buckle: one under the tongue, five more towards the lug
  const holeGeo = new THREE.CircleGeometry(0.8, 20);
  const holeMat = new THREE.MeshStandardMaterial({ name: 'StrapHole', color: 0x050403, roughness: 1 });
  const holeAt = [-1.5, -8.5, -15.5, -22.5, -29.5, -36.5].map((d) => sBuckle + d);
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, holeAt.length);
  holeAt.forEach((s, i) => holes.setMatrixAt(i, place(s, 0, topY(s, 0) + 0.02)));
  group.add(holes);

  // Fixed and floating keeper behind the buckle: leather loops around the strap
  for (const s of [sBuckle + 11, sBuckle + 19]) {
    const w = halfW(s) + 0.75;
    const top = topY(s, 0) + 0.65;
    const bottom = halfT(s) + 0.45;
    const loop = new THREE.Shape();
    loop.moveTo(-w, -bottom);
    loop.lineTo(w, -bottom);
    loop.quadraticCurveTo(w + 0.5, -bottom, w + 0.5, 0);
    loop.quadraticCurveTo(w + 0.5, top, w, top);
    loop.lineTo(-w, top);
    loop.quadraticCurveTo(-w - 0.5, top, -w - 0.5, 0);
    loop.quadraticCurveTo(-w - 0.5, -bottom, -w, -bottom);
    const inner = new THREE.Path();
    inner.moveTo(-w + 0.6, -bottom + 0.45);
    inner.lineTo(w - 0.6, -bottom + 0.45);
    inner.lineTo(w - 0.6, top - 0.6);
    inner.lineTo(-w + 0.6, top - 0.6);
    inner.closePath();
    loop.holes.push(inner);
    const keeperGeo = new THREE.ExtrudeGeometry(loop, { depth: 4.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 2, curveSegments: 6 });
    keeperGeo.translate(0, 0, -2.25);
    // Extrusion runs along Z; turn it so the extrusion follows the strap (Y) and shape Y points outward (Z)
    keeperGeo.rotateX(Math.PI / 2);
    // Shape coordinates are millimetres; the grain maps expect millimetres / LEATHER_TILE
    const kuv = keeperGeo.attributes.uv;
    for (let i = 0; i < kuv.count; i++) kuv.setXY(i, kuv.getX(i) / LEATHER_TILE, kuv.getY(i) / LEATHER_TILE);
    keeperGeo.computeVertexNormals();
    const keeper = shadowed(new THREE.Mesh(keeperGeo, leather));
    keeper.applyMatrix4(place(s, 0, 0));
    group.add(keeper);
  }

  // Pin buckle: frame across the strap, bar with tongue that dips into the hole under it
  const fw = halfW(sBuckle) + 2.4;
  const frame = new THREE.Shape();
  frame.moveTo(-fw, -5.5);
  frame.lineTo(fw, -5.5);
  frame.lineTo(fw, 5.5);
  frame.lineTo(-fw, 5.5);
  frame.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-fw + 1.6, -3.9);
  opening.lineTo(-fw + 1.6, 3.9);
  opening.lineTo(fw - 1.6, 3.9);
  opening.lineTo(fw - 1.6, -3.9);
  opening.closePath();
  frame.holes.push(opening);
  const buckleGeo = new THREE.ExtrudeGeometry(frame, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2 });
  buckleGeo.translate(0, 0, -0.55);
  const buckle = shadowed(new THREE.Mesh(assignWorldUVs(buckleGeo), polished));
  buckle.applyMatrix4(place(sBuckle, 0, halfT(sBuckle) + LEATHER.dome + 0.9));
  group.add(buckle);

  const tongueGeo = new THREE.CapsuleGeometry(0.42, 6.2, 2, 8);
  const tongue = shadowed(new THREE.Mesh(assignWorldUVs(tongueGeo), polished));
  tongue.applyMatrix4(place(sBuckle + 1.2, 0, halfT(sBuckle) + LEATHER.dome + 0.55));
  group.add(tongue);

  group.visible = false;
  return group;
}

// Shared with other models: bracelet and leather follow the same wrist, starting STRAP_START from the case centre
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

  const root = new THREE.Group();
  root.name = 'Watch';
  root.add(
    buildCase(polished, brushed),
    buildBezel(polished),
    buildCrown(polished),
    buildDial(dialTexture, polished),
    // Hands sit low over the dial (hour 0.32, minute 0.58, seconds 0.84 mm), above the 0.44 mm indices
    buildHand(WATCH_PARTS.hourHand, dauphineGeometry(10.2, 1.55, 1.5, 0.2), DIAL_Z + 0.32, polished, 1.15, 0.22, { radius: 0.95, down: 0.32 }),
    buildHand(WATCH_PARTS.minuteHand, dauphineGeometry(15.4, 1.25, 1.7, 0.18), DIAL_Z + 0.58, polished, 0.85, 0.2, { radius: 0.62, down: 0.06 }),
    buildSecondHand(polished),
    buildGlass(),
    buildCaseback(),
    buildStrap(polished, brushed),
  );
  return root;
}
