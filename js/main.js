import { createViewer } from './scene.js';
import { COLLECTION, CASE_OPTIONS, STRAP_OPTIONS } from './products.js';
import { renderSwatches, renderCollection } from './ui.js';
import { initScroll } from './scroll.js';
import { initConfigurator } from './configurator.js';
import { createCart } from './cart.js';

// ?reduced-motion forces the reduced path for testing
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || new URLSearchParams(location.search).has('reduced-motion');
document.documentElement.classList.toggle('reduced-motion', reducedMotion);

document.getElementById('year').textContent = new Date().getFullYear();

renderSwatches(document.querySelector('[data-option="case"]'), 'case', CASE_OPTIONS, 'yellow');
renderSwatches(document.querySelector('[data-option="strap"]'), 'strap', STRAP_OPTIONS, 'bracelet');
renderCollection(document.getElementById('collection-grid'), COLLECTION);

let lenis = null;
const cart = createCart({ onOpenChange: (open) => (open ? lenis?.stop() : lenis?.start()) });

document.getElementById('collection-grid').addEventListener('click', (e) => {
  const id = e.target.closest('[data-add-product]')?.dataset.addProduct;
  const product = COLLECTION.find((p) => p.id === id);
  if (product) cart.add({ key: product.id, name: product.name, variant: product.variant, price: product.price, image: product.image });
});

const viewer = await createViewer(document.getElementById('watch-stage'), { reducedMotion });
window.orvane = viewer;

initConfigurator(document.getElementById('configure-form'), viewer, { onAdd: cart.add });

// Only render while a see-through section is on screen
const visible = new Set();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
  viewer.setRunning(visible.size > 0);
});
document.querySelectorAll('.see-through').forEach((el) => io.observe(el));

lenis = initScroll(viewer, { reducedMotion });

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
