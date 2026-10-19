// Orvane crystal emblem variants. Each variant is defined once as 3D facets (polygons with a material);
// the same data renders the flat SVG logo (front view, shaded) and the 3D mesh (applied dial logo later).
// Units: emblem height 2 (y from -1 to 1), front faces +Z.

const W = 0.42;
const H = 1;
const RHOMBUS = [[0, H], [-W, 0], [0, -H], [W, 0]]; // T, L, B, R (counter-clockwise from the front)

const at = ([x, y], z) => [x, y, z];
const scaled = (pts, s) => pts.map(([x, y]) => [x * s, y * s]);
const ring = (pts, i) => pts[(i + pts.length) % pts.length];

function backFace(outline, z = 0, material = 'metal') {
  return { pts: [...outline].reverse().map((p) => at(p, z)), material };
}

function sideWalls(front, back, material = 'metal') {
  return front.map((p, i) => ({ pts: [ring(back, i), ring(back, i + 1), ring(front, i + 1), p], material }));
}

function pyramid(outline, apex, material = 'metal') {
  return outline.map((p, i) => ({ pts: [at(p, 0), at(ring(outline, i + 1), 0), apex], material }));
}

// Cuts: front facets on a base outline at height z0, rising by d. Used in metal and as set stones.
function cutPyramid(outline, z0, d, material) {
  return outline.map((p, i) => ({ pts: [at(p, z0), at(ring(outline, i + 1), z0), [0, 0, z0 + d]], material }));
}

function cutTable(outline, z0, d, material) {
  const inner = scaled(outline, 0.45);
  const crown = outline.map((p, i) => ({
    pts: [at(p, z0), at(ring(outline, i + 1), z0), at(ring(inner, i + 1), z0 + d), at(ring(inner, i), z0 + d)],
    material,
  }));
  return [{ pts: inner.map((p) => at(p, z0 + d)), material }, ...crown];
}

function cutBrilliant(outline, z0, d, material) {
  const table = scaled(outline, 0.38).map((p) => at(p, z0 + d));
  const outer = [];
  outline.forEach((p, i) => {
    const n = ring(outline, i + 1);
    outer.push(at(p, z0), [(p[0] + n[0]) / 2 * 0.96, (p[1] + n[1]) / 2 * 0.96, z0 + d * 0.4]);
  });
  const facets = [{ pts: table, material }];
  for (let k = 0; k < 4; k++) {
    const corner = outer[2 * k];
    const mid = outer[2 * k + 1];
    const nextCorner = ring(outer, 2 * k + 2);
    facets.push(
      { pts: [corner, mid, table[k]], material },
      { pts: [mid, nextCorner, ring(table, k + 1)], material },
      { pts: [mid, ring(table, k + 1), table[k]], material },
      // Girdle facet: closes the gap between the outline edge and the raised, inset mid point
      { pts: [corner, nextCorner, mid], material },
    );
  }
  return facets;
}

// Slim bezel: narrow metal rim, low profile, so the stone dominates
function setStone(cut, depth) {
  const rim = 0.07;
  const opening = scaled(RHOMBUS, 0.84);
  const frontOuter = RHOMBUS.map((p) => at(p, rim));
  const bezel = RHOMBUS.map((p, i) => ({
    pts: [at(p, rim), at(ring(RHOMBUS, i + 1), rim), at(ring(opening, i + 1), rim), at(ring(opening, i), rim)],
    material: 'metal',
  }));
  // Stone fills the opening and sits flush on the bezel; its girdle wall closes the gap down to the base
  const girdleTop = opening.map((p) => at(p, rim));
  const girdleBottom = opening.map((p) => at(p, 0));
  return [
    ...bezel,
    ...sideWalls(frontOuter, RHOMBUS.map((p) => at(p, 0))),
    backFace(RHOMBUS),
    ...sideWalls(girdleTop, girdleBottom, 'gem'),
    ...cut(opening, rim, depth, 'gem'),
  ];
}

export const CRYSTALS = [
  {
    id: 'plate',
    name: 'Plakette',
    facets: 1,
    text: 'Flacher Rhombus mit Kante, wie heute auf dem Zifferblatt gedruckt. In 3D eine polierte, aufgesetzte Platte; am einfachsten zu fertigen.',
    build() {
      const t = 0.14;
      const front = RHOMBUS.map((p) => at(p, t));
      const back = RHOMBUS.map((p) => at(p, 0));
      return [{ pts: front, material: 'metal' }, backFace(RHOMBUS), ...sideWalls(front, back)];
    },
  },
  {
    id: 'ridge',
    name: 'Grat',
    facets: 2,
    text: 'Längs gefaltet wie ein Dauphine-Zeiger: eine helle und eine dunkle Hälfte. Passt formal zu den Zeigern der Meridian.',
    build() {
      const d = 0.16;
      const [T, L, B, R] = RHOMBUS;
      return [
        { pts: [at(T, d), at(L, 0), at(B, d)], material: 'metal' },
        { pts: [at(T, d), at(B, d), at(R, 0)], material: 'metal' },
        { pts: [at(T, d), at(T, 0), at(L, 0)], material: 'metal' },
        { pts: [at(B, d), at(L, 0), at(B, 0)], material: 'metal' },
        { pts: [at(B, d), at(B, 0), at(R, 0)], material: 'metal' },
        { pts: [at(T, d), at(R, 0), at(T, 0)], material: 'metal' },
        backFace(RHOMBUS),
      ];
    },
  },
  {
    id: 'pyramid',
    name: 'Pyramide',
    facets: 4,
    text: 'Vier Facetten treffen sich in einer Spitze. Wirkt je nach Lichtrichtung lebendig; klassisch für applizierte Indizes.',
    build() {
      return [...cutPyramid(RHOMBUS, 0, 0.2, 'metal'), backFace(RHOMBUS)];
    },
  },
  {
    id: 'bipyramid',
    name: 'Oktaeder',
    facets: 8,
    text: 'Echter Kristall mit Vorder- und Rückspitze. Frei im Raum drehbar, ideal als 3D-Signet in Animationen, Verpackung und Krone.',
    build() {
      const back = RHOMBUS.map((p, i) => ({ pts: [at(ring(RHOMBUS, i + 1), 0), at(p, 0), [0, 0, -0.22]], material: 'metal' }));
      return [...pyramid(RHOMBUS, [0, 0, 0.22]), ...back];
    },
  },
  {
    id: 'table',
    name: 'Tafelschliff',
    facets: 5,
    text: 'Flache Tafel in der Mitte, vier schräge Kronfacetten rundherum. Ruhig und edel; die Tafel kann später graviert werden.',
    build() {
      return [...cutTable(RHOMBUS, 0, 0.16, 'metal'), backFace(RHOMBUS)];
    },
  },
  {
    id: 'brilliant',
    name: 'Brillant',
    facets: 13,
    text: 'Tafel plus zwölf Sternfacetten. Am detailreichsten, funkelt bei Bewegung; braucht in 3D die feinste Fertigung.',
    build() {
      return [...cutBrilliant(RHOMBUS, 0, 0.18, 'metal'), backFace(RHOMBUS)];
    },
  },
  {
    id: 'framed',
    name: 'Gefasster Stein',
    facets: 9,
    text: 'Goldfassung mit eingesetztem Kristall (Saphir oder Diamant). Zweifarbig und schmuckhaft; in 3D zwei Materialien.',
    build() {
      const t = 0.12;
      const inner = scaled(RHOMBUS, 0.6);
      const frontOuter = RHOMBUS.map((p) => at(p, t));
      const frame = RHOMBUS.map((p, i) => ({
        pts: [at(p, t), at(ring(RHOMBUS, i + 1), t), at(ring(inner, i + 1), t), at(ring(inner, i), t)],
        material: 'metal',
      }));
      const gemOutline = scaled(RHOMBUS, 0.55);
      const gem = [
        ...gemOutline.map((p, i) => ({ pts: [at(p, t * 0.5), at(ring(gemOutline, i + 1), t * 0.5), [0, 0, t + 0.16]], material: 'gem' })),
      ];
      return [...frame, ...sideWalls(frontOuter, RHOMBUS.map((p) => at(p, 0))), backFace(RHOMBUS), ...gem];
    },
  },
  {
    id: 'quartz',
    name: 'Bergkristall',
    facets: 18,
    text: 'Sechskantige Säule mit Spitzen, wie ein natürlicher Quarz. Eigenständig und plastisch; schöner Bezug zu «klar wie ein Bergsee».',
    build() {
      const r = 0.34;
      const y = 0.42;
      const squash = 0.55;
      const pts = (yy) => Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 2 + (i / 6) * Math.PI * 2;
        return [Math.cos(a) * r, yy, Math.sin(a) * r * squash];
      });
      const top = pts(y);
      const bottom = pts(-y);
      const facets = [];
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        facets.push(
          { pts: [top[j], top[i], [0, H, 0]], material: 'metal' },
          { pts: [top[i], top[j], bottom[j], bottom[i]], material: 'metal' },
          { pts: [bottom[i], bottom[j], [0, -H, 0]], material: 'metal' },
        );
      }
      return facets;
    },
  },
  {
    id: 'set-pyramid',
    name: 'Pyramide gefasst',
    facets: 8,
    text: 'Pyramidenschliff als Stein in einer schmalen, flachen Zarge. Klar und grafisch; der Stein bleibt das Hauptmotiv.',
    build() {
      return setStone(cutPyramid, 0.22);
    },
  },
  {
    id: 'set-table',
    name: 'Tafel gefasst',
    facets: 9,
    text: 'Tafelschliff-Stein in dezenter Fassung. Die grosse Tafel wirkt wie ein Fenster; ruhig, sehr edel, gut lesbar.',
    build() {
      return setStone(cutTable, 0.18);
    },
  },
  {
    id: 'set-brilliant',
    name: 'Brillant gefasst',
    facets: 17,
    text: 'Brillantschliff mit dreizehn Facetten in schmaler Zarge. Die meiste Lichtwirkung; ideal für Gelbgold mit Diamant oder Saphir.',
    build() {
      return setStone(cutBrilliant, 0.2);
    },
  },
];

// Orient every facet outward (away from the emblem's centre) so normals are consistent
function orient(facet) {
  const n = normalOf(facet.pts);
  const c = centroid(facet.pts);
  if (n[0] * c[0] + n[1] * c[1] + n[2] * (c[2] - 0.05) < 0) facet.pts = [...facet.pts].reverse();
  return facet;
}

export function facetsOf(crystal) {
  return crystal.build().map(orient);
}

export function centroid(pts) {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return s.map((v) => v / pts.length);
}

export function normalOf(pts) {
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return n.map((x) => x / len);
}

const LIGHT = (() => {
  const l = [-0.45, 0.6, 0.66];
  const len = Math.hypot(...l);
  return l.map((x) => x / len);
})();

// Flat colour per facet: k is the facet's brightness under the key light (0..1)
const TONES = {
  roseGold: (k) => `hsl(22 48% ${(24 + 60 * k ** 1.6).toFixed(1)}%)`,
  yellowGold: (k) => `hsl(40 58% ${(24 + 60 * k ** 1.6).toFixed(1)}%)`,
  steel: (k) => `hsl(210 6% ${(26 + 64 * k ** 1.6).toFixed(1)}%)`,
  // High contrast between facets plus a faint hue shift reads as diamond fire
  diamond: (k, i) => `hsl(${198 + ((i * 37) % 24)} 9% ${(18 + 80 * k ** 2.2).toFixed(1)}%)`,
  sapphire: (k) => `hsl(222 62% ${(14 + 58 * k ** 1.6).toFixed(1)}%)`,
};

export const COLOR_OPTIONS = [
  { id: 'roseGold', label: 'Roségold' },
  { id: 'yellowGold', label: 'Gelbgold' },
  { id: 'steel', label: 'Stahl' },
  { id: 'diamond', label: 'Diamant' },
];

export const STONE_OPTIONS = [
  { id: 'diamond', label: 'Diamant' },
  { id: 'sapphire', label: 'Saphir' },
];

let svgId = 0;

// Front-facing facets, painter-sorted (back to front)
function visibleFacets(crystal) {
  return facetsOf(crystal)
    .map((f, i) => ({ ...f, i, n: normalOf(f.pts), z: centroid(f.pts)[2] }))
    .filter((f) => f.n[2] > 0.02)
    .sort((a, b) => a.z - b.z);
}

function shade(f, color, stone) {
  const k = Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
  return TONES[f.material === 'gem' ? stone : color](k, f.i);
}

// Flat front view as polygons in SVG orientation (y down) with CSS hsl() fills; used for raster icons
export function crystalPolygons(crystal, { color = 'roseGold', stone = 'diamond' } = {}) {
  return visibleFacets(crystal).map((f) => ({ points: f.pts.map(([x, y]) => [x, -y]), fill: shade(f, color, stone) }));
}

// Front orthographic view, painter-sorted.
// Default: flat-shaded colour version. shimmer: adds a light sweep (animated via .logo-sheen in CSS).
// mono: single colour (fill), stone facets outlined in `cut` so the brilliant still reads.
export function crystalSvg(crystal, { color = 'roseGold', stone = 'diamond', title, shimmer = false, mono = null } = {}) {
  const visible = visibleFacets(crystal)
    .map((f) => ({ ...f, d: f.pts.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ') }));

  const polys = visible.map((f) => {
    if (mono) {
      const cut = f.material === 'gem' ? `stroke:${mono.cut};stroke-width:0.03` : `stroke:${mono.fill};stroke-width:0.006`;
      return `<polygon points="${f.d}" style="fill:${mono.fill};${cut}" stroke-linejoin="round"/>`;
    }
    const fill = shade(f, color, stone);
    return `<polygon points="${f.d}" fill="${fill}" stroke="${fill}" stroke-width="0.006" stroke-linejoin="round"/>`;
  });

  let sheen = '';
  if (shimmer) {
    const id = `crystal-${++svgId}`;
    sheen = `<defs>
      <clipPath id="${id}-clip">${visible.map((f) => `<polygon points="${f.d}"/>`).join('')}</clipPath>
      <linearGradient id="${id}-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#${id}-clip)"><g transform="skewX(-18)"><rect class="logo-sheen" x="-1" y="-1.1" width="0.45" height="2.2" fill="url(#${id}-sheen)"/></g></g>`;
  }
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg viewBox="-0.5 -1.04 1 2.08" ${label}>${polys.join('')}${sheen}</svg>`;
}
