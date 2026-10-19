// Orvane service worker: makes the shop, history and logo page work offline.
// Own files: network first (so development changes show up immediately), cache as offline fallback.
// CDN libraries and fonts: cache first (their URLs are version-pinned and never change).
// Bump VERSION when the precache list changes.
// All paths are relative to this file, so the app also works in a sub-folder (e.g. GitHub Pages /Watch-Shop/).
const VERSION = 'orvane-v2';

const CDN_THREE = 'https://cdn.jsdelivr.net/npm/three@0.169.0';
const PRECACHE = [
  './',
  './index.html',
  './history.html',
  './logos.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/main.js', './js/brand.js', './js/cart.js', './js/clock.js', './js/config.js', './js/configurator.js',
  './js/products.js', './js/scene.js', './js/scroll.js', './js/studio.js', './js/ui.js',
  './js/watch/loadWatch.js', './js/watch/materials.js', './js/watch/proceduralWatch.js',
  './js/logo/crystals.js', './js/logo/crystalMesh.js', './js/logo/logos-page.js',
  './js/history/history.js', './js/history/saveVersion.js',
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
  `${CDN_THREE}/examples/jsm/utils/BufferGeometryUtils.js`,
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
  'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500&display=swap',
];

const CACHE_FIRST_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
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
  const cached = await cache.match(request);
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
    event.respondWith(networkFirst(request));
  } else if (CACHE_FIRST_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
