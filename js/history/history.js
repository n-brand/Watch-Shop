import { createViewer } from '../scene.js';

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

const versions = await loadIndex();
window.orvaneVersions = versions;

function renderGrid() {
  $('history-empty').hidden = versions.length > 0;
  $('version-grid').replaceChildren(...[...versions].reverse().map((v) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="version-card" href="#${v.id}">
        <span class="version-thumb"><img alt="" width="640" height="800" loading="lazy" decoding="async"></span>
        <span class="version-body">
          <span class="version-id"></span>
          <span class="version-date"></span>
          <span class="version-note"></span>
        </span>
      </a>`;
    const img = li.querySelector('img');
    img.src = v.thumb ? `${HISTORY_URL}${v.thumb}` : 'assets/img/logo.svg';
    if (!v.thumb) img.classList.add('is-placeholder');
    li.querySelector('.version-id').textContent = v.id;
    li.querySelector('.version-date').textContent = `${dateFormat.format(new Date(v.date))} · ${sizeFormat(v.bytes)}`;
    li.querySelector('.version-note').textContent = v.note || '(ohne Beschreibung)';
    li.querySelector('a').setAttribute('aria-label', `${v.id}: ${v.note}`);
    return li;
  }));
}

let viewer = null;
let currentIndex = -1;

async function showDetail(index) {
  const v = versions[index];
  currentIndex = index;
  gridView.hidden = true;
  detailView.hidden = false;

  const prev = versions[index - 1];
  const next = versions[index + 1];
  $('detail-position').textContent = `Version ${index + 1} von ${versions.length}`;
  $('detail-id').textContent = v.id;
  $('detail-date').textContent = dateFormat.format(new Date(v.date));
  $('detail-note').textContent = v.note || '(ohne Beschreibung)';
  $('detail-size').textContent = sizeFormat(v.bytes);
  $('detail-file').textContent = `${HISTORY_URL}${v.file}`;
  $('detail-config').textContent = `MODEL_PATH = './${HISTORY_URL}${v.file}'`;
  $('detail-prev').disabled = !prev;
  $('detail-next').disabled = !next;
  $('detail-prev-label').textContent = prev ? ` ${prev.id}` : '';
  $('detail-next-label').textContent = next ? `${next.id} ` : '';
  document.title = `Orvane – Verlauf ${v.id}`;

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
  if (currentIndex === index) $('detail-loading').hidden = true;
}

function showGrid() {
  currentIndex = -1;
  detailView.hidden = true;
  gridView.hidden = false;
  viewer?.setRunning(false);
  document.title = 'Orvane – Verlauf';
}

function route() {
  const index = versions.findIndex((v) => `#${v.id}` === location.hash);
  if (index === -1) {
    const from = currentIndex;
    showGrid();
    if (from !== -1) document.querySelector(`.version-card[href="#${versions[from].id}"]`)?.focus();
  } else {
    // Detail view always starts at the top, not at the grid's scroll position
    window.scrollTo({ top: 0, behavior: 'instant' });
    viewer?.setRunning(true);
    showDetail(index);
  }
}

const go = (index) => {
  if (versions[index]) location.hash = versions[index].id;
};

$('detail-prev').addEventListener('click', () => go(currentIndex - 1));
$('detail-next').addEventListener('click', () => go(currentIndex + 1));
document.addEventListener('keydown', (e) => {
  if (detailView.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') go(currentIndex - 1);
  else if (e.key === 'ArrowRight') go(currentIndex + 1);
  else if (e.key === 'Escape') location.hash = '';
  else return;
  e.preventDefault();
});

renderGrid();
window.addEventListener('hashchange', route);
route();
