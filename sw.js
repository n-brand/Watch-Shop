// Orvane service worker: makes the shop, history and logo page work offline.
// Own files: network first (so development changes show up immediately), cache as offline fallback.
// Saved history models (vNNN.glb): cache first, they are immutable once stored.
// All models listed in index.json (plus thumbnails) are cached on install, so the history works fully offline;
// pages ask for a re-sync on every start, which picks up versions saved after the install.
// CDN libraries and fonts: cache first (their URLs are version-pinned and never change).
// Bump VERSION when the precache list changes.
// All paths are relative to this file, so the app also works in a sub-folder (e.g. GitHub Pages /Watch-Shop/).
const VERSION = 'orvane-v13';
const HISTORY_URL = './assets/models/history/';

const CDN_THREE = 'https://cdn.jsdelivr.net/npm/three@0.169.0';
const PRECACHE = [
  './',
  './index.html',
  './history.html',
  './logos.html',
  './tests.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js', './js/brand.js', './js/cart.js', './js/clock.js', './js/config.js', './js/configurator.js',
  './js/products.js', './js/scene.js', './js/studio.js', './js/ui.js',
  './js/watch/loadWatch.js', './js/watch/materials.js', './js/watch/proceduralWatch.js',
  './js/watch/digitalWatch.js', './js/watch/digitalDisplay.js', './js/watch/look.js', './js/watch/movement.js',
  './js/logo/crystals.js', './js/logo/crystalMesh.js', './js/logo/logos-page.js',
  './js/history/history.js', './js/history/saveVersion.js', './js/tests/css-clock.js',
  ...['hero', 'case', 'glass', 'movement', 'profile'].map((name) => `./assets/img/renders/${name}.webp`),
  // Configurator stills: model x case x strap, the Meridian also per dial colour (the night-blue standard has no suffix)
  ...['meridian', 'lumen'].flatMap((m) => ['rose', 'yellow', 'steel'].flatMap((c) => ['bracelet', 'leather-brown', 'leather-black']
    .flatMap((strap) => (m === 'meridian' ? ['', '-green', '-silver'] : [''])
      .map((dial) => `./assets/img/renders/${m}-${c}-${strap}${dial}.webp`)))),
  './assets/img/logo.svg', './assets/img/lifestyle.svg', './assets/img/movement.svg',
  './assets/img/collection/meridian-rose.svg', './assets/img/collection/meridian-steel.svg',
  './assets/img/collection/solstice-gold.svg', './assets/img/collection/abyss-steel.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  // Same, already approved CDN files the pages load anyway
  `${CDN_THREE}/build/three.module.min.js`,
  `${CDN_THREE}/examples/jsm/controls/OrbitControls.js`,
  `${CDN_THREE}/examples/jsm/environments/RoomEnvironment.js`,
  `${CDN_THREE}/examples/jsm/loaders/GLTFLoader.js`,
  `${CDN_THREE}/examples/jsm/libs/meshopt_decoder.module.js`,
  `${CDN_THREE}/examples/jsm/utils/BufferGeometryUtils.js`,
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500&display=swap',
];

const CACHE_FIRST_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);

// Stores index.json and every model + thumbnail it lists; files already in the cache are not downloaded again
async function cacheModels() {
  const cache = await caches.open(VERSION);
  const indexUrl = new URL(`${HISTORY_URL}index.json`, self.location).href;
  const response = await fetch(indexUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`index.json: ${response.status}`);
  const versions = await response.clone().json();
  await cache.put(indexUrl, response);
  const urls = versions.flatMap((v) => [v.file, v.thumb]).filter(Boolean)
    .map((file) => new URL(`${HISTORY_URL}${file}`, self.location).href);
  const missing = [];
  for (const url of urls) if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
  await cache.addAll(missing);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(cacheModels)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'sync-models') event.waitUntil(cacheModels().catch(() => {})); // offline: keep what we have
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Own files always revalidate with the server (cache: 'no-cache'): otherwise the browser's HTTP cache may hand out
// an old script next to a new page (static servers send no cache headers), and the page breaks in odd ways.
async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match(new URL('./index.html', self.location).href);
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith(new URL('./api/', self.location).pathname)) return; // saving versions needs the live local server
    // Saved models are never overwritten (server.js refuses), so a cached vNNN.glb stays valid
    if (/\/assets\/models\/history\/v\d{3,}\.glb$/.test(url.pathname)) event.respondWith(cacheFirst(request));
    else event.respondWith(networkFirst(request));
  } else if (CACHE_FIRST_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
