// Prices in CHF. Images are placeholders; swap the paths for real WebP/AVIF files.

export const CASE_OPTIONS = [
  { id: 'rose', label: 'Roségold', metal: 'roseGold', swatch: '#d9a383', price: 24800, image: 'assets/img/collection/meridian-rose.svg' },
  { id: 'yellow', label: 'Gelbgold', metal: 'yellowGold', swatch: '#e2c07a', price: 25600, image: 'assets/img/collection/solstice-gold.svg' },
  { id: 'steel', label: 'Edelstahl', metal: 'steel', swatch: '#c9ccd0', price: 9400, image: 'assets/img/collection/meridian-steel.svg' },
];

export const STRAP_OPTIONS = [
  { id: 'bracelet', label: 'Gliederband', variant: 'bracelet', swatch: 'linear-gradient(90deg,#b8b2a8 0 30%,#e8e2d8 30% 70%,#b8b2a8 70%)', price: 0 },
  { id: 'leather-brown', label: 'Leder Cognac', variant: 'leather', color: 0x4a2412, swatch: '#7a4a2a', price: -1800 },
  { id: 'leather-black', label: 'Leder Schwarz', variant: 'leather', color: 0x0e0d0d, swatch: '#1c1a19', price: -1800 },
];

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
    variant: 'Taucheruhr · Edelstahl · 42 mm',
    price: 11200,
    image: 'assets/img/collection/abyss-steel.svg',
  },
];
