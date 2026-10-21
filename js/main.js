import { COLLECTION, CASE_OPTIONS, STRAP_OPTIONS } from './products.js';
import { renderSwatches, renderCollection } from './ui.js';
import { initConfigurator } from './configurator.js';
import { createCart } from './cart.js';

document.getElementById('year').textContent = new Date().getFullYear();

renderSwatches(document.querySelector('[data-option="case"]'), 'case', CASE_OPTIONS, 'yellow');
renderSwatches(document.querySelector('[data-option="strap"]'), 'strap', STRAP_OPTIONS, 'bracelet');
renderCollection(document.getElementById('collection-grid'), COLLECTION);

const cart = createCart({ onOpenChange: (open) => document.documentElement.classList.toggle('no-scroll', open) });

document.getElementById('collection-grid').addEventListener('click', (e) => {
  const id = e.target.closest('[data-add-product]')?.dataset.addProduct;
  const product = COLLECTION.find((p) => p.id === id);
  if (product) cart.add({ key: product.id, name: product.name, variant: product.variant, price: product.price, image: product.image });
});

initConfigurator(document.getElementById('configure-form'), document.querySelector('[data-configure-image]'), { onAdd: cart.add });

// Highlight the nav entry of the section in the middle of the viewport
const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const navObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of navLinks) a.toggleAttribute('aria-current', a.getAttribute('href') === `#${e.target.id}`);
  }
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach((a) => {
  const section = document.querySelector(a.getAttribute('href'));
  if (section) navObserver.observe(section);
});
