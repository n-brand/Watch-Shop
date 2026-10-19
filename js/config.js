// Set to a .glb/.gltf path (e.g. './assets/models/watch.glb') to replace the procedural watch.
// The model must contain nodes named like WATCH_PARTS for animation and material swaps.
export const MODEL_PATH = null;

export const WATCH_PARTS = {
  case: 'Case',
  bezel: 'Bezel',
  dial: 'Dial',
  glass: 'Glass',
  crown: 'Crown',
  strap: 'Strap',
  hourHand: 'HourHand',
  minuteHand: 'MinuteHand',
  secondHand: 'SecondHand',
  rotor: 'Rotor',
  logo: 'Logo',
};

// Material names the configurator recolours. A glTF model should use the same names.
export const MATERIAL_NAMES = {
  caseMetal: 'CaseMetal',
  leather: 'StrapLeather',
};

// Strap variants are children of the Strap node; the configurator shows one at a time.
export const STRAP_VARIANTS = {
  bracelet: 'Bracelet',
  leather: 'Leather',
};

// Parts a glTF model may omit without a warning
export const OPTIONAL_PARTS = new Set(['rotor', 'bezel', 'crown', 'logo']);

export const CURRENCY = new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 });
