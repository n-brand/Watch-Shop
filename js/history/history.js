import { createViewer } from '../scene.js';
import { modelOf, modelLabel, nameVersions } from './versionNames.js';

const HISTORY_URL = 'assets/models/history/';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dateFormat = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
const sizeFormat = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const $ = (id) => document.getElementById(id);
const gridView = $('grid-view');
const detailView = $('detail-view');

async function loadIndex() {
  try {
    const res = await fetch(`${HISTORY_URL}index.json`, { cache: 'no-store' });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

const versions = nameVersions(await loadIndex());
window.orvaneVersions = versions;

// Model filter: 'all' or a model id; the detail view steps through the filtered list
let filter = 'all';
const shown = () => (filter === 'all' ? versions : versions.filter((v) => modelOf(v) === filter));

function renderFilter() {
  const models = [...new Set(versions.map(modelOf))];
  const bar = $('model-filter');
  bar.hidden = models.length < 2;
  if (bar.hidden) return;
  const count = (id) => (id === 'all' ? versions.length : versions.filter((v) => modelOf(v) === id).length);
  bar.replaceChildren(...['all', ...models].map((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-chip';
    button.dataset.model = id;
    button.setAttribute('aria-pressed', String(id === filter));
    button.textContent = `${id === 'all' ? 'Alle' : modelLabel(id)} `;
    const n = document.createElement('span');
    n.textContent = count(id);
    button.append(n);
    return button;
  }));
}

$('model-filter').addEventListener('click', (e) => {
  const button = e.target.closest('[data-model]');
  if (!button) return;
  filter = button.dataset.model;
  renderFilter();
  renderGrid();
});

function renderGrid() {
  const list = shown();
  $('history-empty').hidden = list.length > 0;
  $('version-grid').replaceChildren(...[...list].reverse().map((v) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="version-card" href="#${v.slug}">
        <span class="version-thumb"><img alt="" width="640" height="800" loading="lazy" decoding="async"></span>
        <span class="version-body">
          <span class="version-head"><span class="version-id"></span></span>
          <span class="version-date"></span>
          <span class="version-note"></span>
        </span>
      </a>`;
    const img = li.querySelector('img');
    img.src = v.thumb ? `${HISTORY_URL}${v.thumb}` : 'assets/img/logo.svg';
    if (!v.thumb) img.classList.add('is-placeholder');
    li.querySelector('.version-id').textContent = v.name;
    li.querySelector('.version-date').textContent = `${dateFormat.format(new Date(v.date))} · ${sizeFormat(v.bytes)}`;
    li.querySelector('.version-note').textContent = v.note || '(ohne Beschreibung)';
    li.querySelector('a').setAttribute('aria-label', `${v.name}: ${v.note}`);
    return li;
  }));
}

let viewer = null;
let current = null;

async function showDetail(v) {
  // A direct link to a version outside the current filter shows it among all versions
  if (!shown().includes(v)) {
    filter = 'all';
    renderFilter();
    renderGrid();
  }
  const list = shown();
  const index = list.indexOf(v);
  current = v;
  gridView.hidden = true;
  detailView.hidden = false;

  const prev = list[index - 1];
  const next = list[index + 1];
  const ofModel = versions.filter((x) => modelOf(x) === modelOf(v)).length;
  $('detail-position').textContent = `${modelLabel(modelOf(v))} · Version ${v.number} von ${ofModel}`;
  $('detail-id').textContent = v.name;
  $('detail-date').textContent = dateFormat.format(new Date(v.date));
  $('detail-note').textContent = v.note || '(ohne Beschreibung)';
  $('detail-size').textContent = sizeFormat(v.bytes);
  $('detail-file').textContent = `${HISTORY_URL}${v.file}`;
  $('detail-config').textContent = `MODEL_PATH = './${HISTORY_URL}${v.file}'`;
  $('detail-prev').disabled = !prev;
  $('detail-next').disabled = !next;
  $('detail-prev-label').textContent = prev ? ` ${prev.name}` : '';
  $('detail-next-label').textContent = next ? `${next.name} ` : '';
  $('lightbox-prev').disabled = !prev;
  $('lightbox-next').disabled = !next;
  $('lightbox-title').textContent = `${v.name} · ${index + 1} / ${list.length}`;
  document.title = `Orvane – Verlauf ${v.name}`;

  const path = `${HISTORY_URL}${v.file}`;
  $('detail-loading').hidden = false;
  if (!viewer) {
    viewer = await createViewer($('detail-stage'), { reducedMotion, modelPath: path, wheelZoom: 'always' });
    viewer.setFrame({ x: 0, y: 0, zoom: 0.85 });
    viewer.setRunning(true);
    window.orvaneHistory = viewer;
  } else {
    await viewer.setModel(path);
  }
  if (current === v) $('detail-loading').hidden = true;
  // Warm the cache for the neighbours, so stepping with the arrows doesn't wait for the network
  for (const n of [next, prev]) if (n) prefetch(`${HISTORY_URL}${n.file}`);
}

const prefetched = new Set();
function prefetch(url) {
  if (prefetched.has(url)) return;
  prefetched.add(url);
  fetch(url, { priority: 'low' }).then((res) => res.arrayBuffer()).catch(() => prefetched.delete(url));
}

// Lightbox: on phones the 3D stage takes the whole screen, with arrows to step through the versions
const narrow = window.matchMedia('(max-width: 860px)');
function setLightbox(on) {
  detailView.classList.toggle('is-lightbox', on);
  document.documentElement.classList.toggle('no-scroll', on);
  document.documentElement.classList.toggle('lightbox-open', on);
}
const inLightbox = () => detailView.classList.contains('is-lightbox');

function showGrid() {
  setLightbox(false);
  current = null;
  detailView.hidden = true;
  gridView.hidden = false;
  viewer?.setRunning(false);
  document.title = 'Orvane – Verlauf';
}

function route() {
  // Links name a version per model (#meridian-21); old links with the file id (#v027) still work
  const hash = decodeURIComponent(location.hash.slice(1));
  const v = versions.find((x) => x.slug === hash) ?? versions.find((x) => x.id === hash);
  if (v && hash !== v.slug) history.replaceState(null, '', `#${v.slug}`);
  if (!v) {
    const from = current;
    showGrid();
    if (from) document.querySelector(`.version-card[href="#${from.slug}"]`)?.focus();
  } else {
    // Detail view always starts at the top, not at the grid's scroll position
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Coming from the grid on a phone: open straight into the lightbox
    if (!current && narrow.matches) setLightbox(true);
    viewer?.setRunning(true);
    showDetail(v);
  }
}

// Step within the filtered list
const go = (step) => {
  const list = shown();
  const target = list[list.indexOf(current) + step];
  if (target) location.hash = target.slug;
};

$('detail-prev').addEventListener('click', () => go(-1));
$('detail-next').addEventListener('click', () => go(1));
$('lightbox-prev').addEventListener('click', () => go(-1));
$('lightbox-next').addEventListener('click', () => go(1));
$('lightbox-open').addEventListener('click', () => setLightbox(true));
$('lightbox-close').addEventListener('click', () => setLightbox(false));
narrow.addEventListener('change', (e) => {
  if (!e.matches) setLightbox(false);
});
document.addEventListener('keydown', (e) => {
  if (detailView.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'Escape' && inLightbox()) setLightbox(false);
  else if (e.key === 'Escape') location.hash = '';
  else return;
  e.preventDefault();
});

renderFilter();
renderGrid();
window.addEventListener('hashchange', route);
route();
