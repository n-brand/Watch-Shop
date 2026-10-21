import { CRYSTALS, crystalSvg } from './logo/crystals.js';

// Brand emblem used across the site: logo K "Brillant gefasst". Colours are provisional.
export const BRAND = {
  crystal: CRYSTALS.find((c) => c.id === 'set-brilliant'),
  color: 'yellowGold',
  stone: 'diamond',
};

const THEME_KEY = 'orvane-theme';
const prefersLight = window.matchMedia('(prefers-color-scheme: light)');

export function currentTheme() {
  return document.documentElement.dataset.theme || (prefersLight.matches ? 'light' : 'dark');
}

// Fill every [data-logo] element: "shimmer" = colour emblem with light sweep, "color" = static colour, "mono" = single colour
function renderLogos() {
  for (const el of document.querySelectorAll('[data-logo]')) {
    const kind = el.dataset.logo;
    el.innerHTML = crystalSvg(BRAND.crystal, {
      color: BRAND.color,
      stone: BRAND.stone,
      shimmer: kind === 'shimmer',
      mono: kind === 'mono' ? { fill: 'var(--logo-mono)', cut: 'var(--logo-cut, var(--bg))' } : null,
    });
  }
}

function renderFavicon() {
  const styles = getComputedStyle(document.documentElement);
  const svg = crystalSvg(BRAND.crystal, {
    mono: { fill: styles.getPropertyValue('--logo-mono').trim() || '#c9a46a', cut: styles.getPropertyValue('--bg').trim() || '#000' },
  }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function renderToggles() {
  const light = currentTheme() === 'light';
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', light ? 'Dunkles Design aktivieren' : 'Helles Design aktivieren');
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = light ? 'Dunkel' : 'Hell';
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  renderToggles();
  renderFavicon();
  document.dispatchEvent(new CustomEvent('orvane:theme', { detail: theme }));
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-theme-toggle]')) setTheme(currentTheme() === 'light' ? 'dark' : 'light');
});
prefersLight.addEventListener('change', () => {
  renderToggles();
  renderFavicon();
});

// Mobile menu: the nav folds into a full-width panel below the header
function initMenu() {
  const toggle = document.querySelector('.nav-toggle');
  const header = document.querySelector('.site-header');
  if (!toggle || !header) return;
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menü schliessen' : 'Menü öffnen');
    document.documentElement.classList.toggle('no-scroll', open);
  };
  toggle.addEventListener('click', () => setOpen(!header.classList.contains('nav-open')));
  document.getElementById('site-nav')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  // Back to desktop width: the sidebar nav is always visible, so drop the open state
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

renderLogos();
renderToggles();
renderFavicon();
initMenu();

// Offline support / installable app (PWA); localhost counts as a secure context.
// sw.js is resolved relative to this module, so the site also works in a sub-folder (GitHub Pages).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch((err) => console.warn('Service worker not registered', err));
}
