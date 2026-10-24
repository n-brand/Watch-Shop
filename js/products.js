// Prices in CHF. Product images are stills of the 3D models (tools/render-stills.html);
// the hidden collection still uses placeholder SVGs.

// Watches in the configurator; case prices per model (straps are priced the same on both)
export const WATCH_MODELS = [
  { id: 'meridian', label: 'Meridian', detail: 'Automatik · 41 mm', prices: { rose: 24800, yellow: 25600, steel: 9400 }, dials: true },
  { id: 'lumen', label: 'Lumen', detail: 'Digital · 37 × 40 mm', prices: { rose: 12600, yellow: 13200, steel: 4200 } },
  { id: 'abyss', label: 'Abyss', detail: 'Chronograph · Automatik · 42 mm', prices: { rose: 27900, yellow: 28600, steel: 11200 } },
];

export const CASE_OPTIONS = [
  { id: 'rose', label: 'Roségold', metal: 'roseGold', swatch: '#d9a383' },
  { id: 'yellow', label: 'Gelbgold', metal: 'yellowGold', swatch: '#e2c07a' },
  { id: 'steel', label: 'Edelstahl', metal: 'steel', swatch: '#c9ccd0' },
];

export const STRAP_OPTIONS = [
  { id: 'bracelet', label: 'Gliederband', variant: 'bracelet', swatch: 'linear-gradient(90deg,#b8b2a8 0 30%,#e8e2d8 30% 70%,#b8b2a8 70%)', price: 0 },
  // Leather: grain colour, painted edge and stitching thread (cream on cognac, tonal grey on black)
  { id: 'leather-brown', label: 'Leder Cognac', variant: 'leather', color: 0x4a2412, edge: 0x1f120b, stitch: 0xd8c4a0, swatch: '#7a4a2a', price: -1800 },
  { id: 'leather-black', label: 'Leder Schwarz', variant: 'leather', color: 0x0e0d0d, edge: 0x060606, stitch: 0x5a554e, swatch: '#1c1a19', price: -1800 },
];

// Dial colours for models with a dial (Meridian): sunburst centre, darker edge, print colour (passed to
// createDialTexture). The light dial gets a dark gold print so it stays legible.
// Royal blue is the standard dial (also the one the code builds, see createDialTexture); black was dropped.
export const DIAL_OPTIONS = [
  { id: 'blue', label: 'Königsblau', base: '#2f5cb8', edge: '#122a66', print: '#e3c99a' },
  { id: 'green', label: 'Waldgrün', base: '#233c2e', edge: '#0b1810', print: '#e3c99a' },
  { id: 'silver', label: 'Silber', base: '#e1ded7', edge: '#aaa59b', print: '#6f5322' },
].map((d) => ({ ...d, swatch: `radial-gradient(circle at 40% 35%, ${d.base}, ${d.edge})` }));
export const DEFAULT_DIAL = 'blue';

export const priceOf = (model, caseOpt, strapOpt) => model.prices[caseOpt.id] + strapOpt.price;
// Stills per model, case, strap and (for models with a dial) dial colour; the standard dial keeps the plain name
export const renderImage = (model, caseOpt, strapOpt, dialOpt) => {
  const dial = model.dials && dialOpt && dialOpt.id !== DEFAULT_DIAL ? `-${dialOpt.id}` : '';
  return `assets/img/renders/${model.id}-${caseOpt.id}-${strapOpt.id}${dial}.webp`;
};

export const COLLECTION = [
  {
    id: 'meridian-rose',
    name: 'Meridian',
    variant: 'Roségold · 41 mm',
    price: 24800,
    image: 'assets/img/collection/meridian-rose.svg',
  },
  {
    id: 'meridian-steel',
    name: 'Meridian',
    variant: 'Edelstahl · 41 mm',
    price: 9400,
    image: 'assets/img/collection/meridian-steel.svg',
  },
  {
    id: 'solstice-gold',
    name: 'Solstice',
    variant: 'Gelbgold · Champagner · 39 mm',
    price: 26500,
    image: 'assets/img/collection/solstice-gold.svg',
  },
  {
    id: 'abyss-steel',
    name: 'Abyss',
    variant: 'Chronograph · Edelstahl · 42 mm',
    price: 11200,
    image: 'assets/img/collection/abyss-steel.svg',
  },
];
