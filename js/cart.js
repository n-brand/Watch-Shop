import { CURRENCY } from './config.js';

const STORAGE_KEY = 'orvane-cart';

function load() {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable (private mode etc.): cart lives for this page view only
  }
}

export function createCart({ onOpenChange } = {}) {
  let items = load();
  const drawer = document.getElementById('cart');
  const backdrop = document.querySelector('.cart-backdrop');
  const toggleButton = document.querySelector('.cart-button');
  const list = drawer.querySelector('[data-cart-items]');
  const empty = drawer.querySelector('[data-cart-empty]');
  const total = drawer.querySelector('[data-cart-total]');
  const count = document.querySelector('[data-cart-count]');
  const closeButton = drawer.querySelector('.cart-close');

  function render() {
    list.replaceChildren(...items.map((item) => {
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <img src="${item.image}" alt="" width="64" height="80" loading="lazy">
        <div>
          <h3>${item.name}</h3>
          <p>${item.variant}</p>
          <p>${CURRENCY.format(item.price)}</p>
        </div>
        <div class="cart-qty">
          <div class="qty-controls">
            <button type="button" data-qty="-1" aria-label="${item.name} ${item.variant}: eins weniger">−</button>
            <span aria-live="polite">${item.qty}</span>
            <button type="button" data-qty="1" aria-label="${item.name} ${item.variant}: eins mehr">+</button>
          </div>
          <button type="button" class="cart-remove" data-remove>Entfernen</button>
        </div>`;
      li.dataset.key = item.key;
      return li;
    }));
    const qty = items.reduce((n, i) => n + i.qty, 0);
    count.textContent = qty;
    empty.hidden = items.length > 0;
    total.textContent = items.length ? CURRENCY.format(items.reduce((sum, i) => sum + i.price * i.qty, 0)) : '–';
    save(items);
  }

  function setOpen(open) {
    drawer.hidden = backdrop.hidden = !open;
    toggleButton.setAttribute('aria-expanded', String(open));
    onOpenChange?.(open);
    if (open) closeButton.focus();
    else toggleButton.focus();
  }

  function add(product) {
    const existing = items.find((i) => i.key === product.key);
    if (existing) existing.qty += 1;
    else items.push({ ...product, qty: 1 });
    render();
    setOpen(true);
  }

  list.addEventListener('click', (e) => {
    const li = e.target.closest('.cart-item');
    if (!li) return;
    const item = items.find((i) => i.key === li.dataset.key);
    const delta = Number(e.target.closest('[data-qty]')?.dataset.qty);
    if (delta) item.qty += delta;
    if (e.target.closest('[data-remove]') || item.qty < 1) items = items.filter((i) => i !== item);
    render();
  });

  toggleButton.addEventListener('click', () => setOpen(drawer.hidden));
  document.querySelectorAll('[data-cart-close]').forEach((el) => el.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
  });

  render();
  return { add };
}
