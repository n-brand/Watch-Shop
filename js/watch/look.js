import { MATERIAL_NAMES, STRAP_VARIANTS } from '../config.js';
import { METALS, createDialTexture } from './materials.js';

// Dial textures are expensive to draw (2048 px with grain and sunburst), so each colour is drawn once
const dialTextures = new Map();
const cachedDials = new Set();
function dialTexture(dialOpt) {
  if (!dialTextures.has(dialOpt.id)) {
    dialTextures.set(dialOpt.id, createDialTexture(dialOpt).then((t) => {
      cachedDials.add(t);
      return t;
    }));
  }
  return dialTextures.get(dialOpt.id);
}

// Applies a case metal, strap and (for watches with a dial) dial colour to a loaded watch
// (any model built from the shared materials and strap). Used by the configurator and by tools/render-stills.
export async function applyLook(watch, parts, caseOpt, strapOpt, dialOpt) {
  const forEachMaterial = (name, fn) => watch.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const mat of [obj.material].flat()) if (mat.name === name) fn(mat);
  });
  forEachMaterial(MATERIAL_NAMES.caseMetal, (mat) => mat.color.setHex(METALS[caseOpt.metal].color));
  for (const [key, name] of Object.entries(STRAP_VARIANTS)) {
    const node = parts.strap?.getObjectByName(name);
    if (node) node.visible = key === strapOpt.variant;
  }
  if (strapOpt.color !== undefined) forEachMaterial(MATERIAL_NAMES.leather, (mat) => mat.color.setHex(strapOpt.color));
  if (strapOpt.edge !== undefined) forEachMaterial(MATERIAL_NAMES.leatherEdge, (mat) => mat.color.setHex(strapOpt.edge));
  if (strapOpt.stitch !== undefined) forEachMaterial(MATERIAL_NAMES.stitch, (mat) => mat.color.setHex(strapOpt.stitch));
  if (dialOpt) {
    const texture = await dialTexture(dialOpt);
    forEachMaterial(MATERIAL_NAMES.dial, (mat) => {
      if (mat.map === texture) return;
      if (mat.map && !cachedDials.has(mat.map)) mat.map.dispose(); // the model's own dial texture
      mat.map = texture;
      mat.needsUpdate = true;
    });
  }
}
