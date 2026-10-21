import { CURRENCY } from './config.js';
import { CASE_OPTIONS, STRAP_OPTIONS, renderImage } from './products.js';

// Shows the pre-rendered still for the chosen case and strap (see tools/render-stills.html)
export function initConfigurator(form, image, { onAdd }) {
  const current = () => {
    const data = new FormData(form);
    return {
      caseOpt: CASE_OPTIONS.find((o) => o.id === data.get('case')),
      strapOpt: STRAP_OPTIONS.find((o) => o.id === data.get('strap')),
    };
  };

  function update() {
    const { caseOpt, strapOpt } = current();
    image.src = renderImage(caseOpt, strapOpt);
    image.alt = `Meridian in ${caseOpt.label} mit ${strapOpt.label}`;

    form.querySelector('[data-selected="case"]').textContent = caseOpt.label;
    form.querySelector('[data-selected="strap"]').textContent = strapOpt.label;
    form.querySelector('[data-price]').textContent = CURRENCY.format(caseOpt.price + strapOpt.price);
  }

  // Warm the cache for all variants once the configurator comes close, so switching is instant
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    for (const c of CASE_OPTIONS) for (const s of STRAP_OPTIONS) new Image().src = renderImage(c, s);
  }, { rootMargin: '600px 0px' }).observe(form);

  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { caseOpt, strapOpt } = current();
    onAdd({
      key: `meridian-${caseOpt.id}-${strapOpt.id}`,
      name: 'Meridian',
      variant: `${caseOpt.label} · ${strapOpt.label}`,
      price: caseOpt.price + strapOpt.price,
      image: renderImage(caseOpt, strapOpt),
    });
  });
  update();
}
