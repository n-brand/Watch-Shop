import { CURRENCY, MATERIAL_NAMES, STRAP_VARIANTS } from './config.js';
import { CASE_OPTIONS, STRAP_OPTIONS } from './products.js';
import { METALS } from './watch/materials.js';

function forEachMaterial(root, name, fn) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const mat of [obj.material].flat()) if (mat.name === name) fn(mat);
  });
}

export function initConfigurator(form, viewer, { onAdd }) {
  const { watch, parts } = viewer;
  const strapVariants = Object.fromEntries(
    Object.entries(STRAP_VARIANTS).map(([key, name]) => [key, parts.strap?.getObjectByName(name) ?? null]),
  );

  const current = () => {
    const data = new FormData(form);
    return {
      caseOpt: CASE_OPTIONS.find((o) => o.id === data.get('case')),
      strapOpt: STRAP_OPTIONS.find((o) => o.id === data.get('strap')),
    };
  };

  function update() {
    const { caseOpt, strapOpt } = current();

    const metal = METALS[caseOpt.metal];
    forEachMaterial(watch, MATERIAL_NAMES.caseMetal, (mat) => mat.color.setHex(metal.color));

    for (const [key, node] of Object.entries(strapVariants)) {
      if (node) node.visible = key === strapOpt.variant;
    }
    if (strapOpt.color !== undefined) {
      forEachMaterial(watch, MATERIAL_NAMES.leather, (mat) => mat.color.setHex(strapOpt.color));
    }

    form.querySelector('[data-selected="case"]').textContent = caseOpt.label;
    form.querySelector('[data-selected="strap"]').textContent = strapOpt.label;
    form.querySelector('[data-price]').textContent = CURRENCY.format(caseOpt.price + strapOpt.price);
  }

  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { caseOpt, strapOpt } = current();
    onAdd({
      key: `meridian-${caseOpt.id}-${strapOpt.id}`,
      name: 'Meridian',
      variant: `${caseOpt.label} · ${strapOpt.label}`,
      price: caseOpt.price + strapOpt.price,
      image: caseOpt.image,
    });
  });
  update();
}
