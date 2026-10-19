import { CURRENCY } from './config.js';

export function renderSwatches(container, name, options, selectedId) {
  container.replaceChildren(...options.map((opt) => {
    const label = document.createElement('label');
    label.className = 'swatch';
    label.title = opt.label;
    label.innerHTML = `<input type="radio" name="${name}" value="${opt.id}" aria-label="${opt.label}"><span></span>`;
    label.querySelector('span').style.setProperty('--swatch', opt.swatch);
    label.querySelector('input').checked = opt.id === selectedId;
    return label;
  }));
}

export function renderCollection(container, products) {
  container.replaceChildren(...products.map((p) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-media">
        <img src="${p.image}" alt="${p.name}, ${p.variant} (Platzhalterbild)" width="800" height="1000" loading="lazy" decoding="async">
      </div>
      <div class="product-body">
        <h3>${p.name}</h3>
        <p class="product-variant">${p.variant}</p>
        <p class="product-price">${CURRENCY.format(p.price)}</p>
        <button class="button" type="button" data-add-product="${p.id}">In den Warenkorb</button>
      </div>`;
    return card;
  }));
}
