import { MATERIAL_NAMES, STRAP_VARIANTS } from '../config.js';
import { METALS } from './materials.js';

// Applies a case metal and strap choice to a loaded watch (any model built from the shared materials and strap).
// Used by the configurator and by tools/render-stills.
export function applyLook(watch, parts, caseOpt, strapOpt) {
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
}
