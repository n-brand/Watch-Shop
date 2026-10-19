import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CRYSTALS, COLOR_OPTIONS, STONE_OPTIONS, crystalSvg } from './crystals.js';
import { createCrystalMesh } from './crystalMesh.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STORE = 'orvane-crystal-choice';
const letter = (i) => String.fromCharCode(65 + i);
const labelOf = (options, id) => options.find((o) => o.id === id)?.label ?? id;

const state = { color: 'roseGold', stone: 'diamond', preview: null, chosen: null };
try {
  const saved = JSON.parse(localStorage.getItem(STORE));
  if (saved?.id) Object.assign(state, { chosen: saved.id, color: saved.color ?? state.color, stone: saved.stone ?? state.stone });
} catch {}

const hasStone = (crystal) => crystal.build().some((f) => f.material === 'gem');

// Cards
const grid = document.getElementById('logo-grid');

function renderCards() {
  const look = { color: state.color, stone: state.stone };
  grid.innerHTML = CRYSTALS.map((c, i) => {
    const svg = crystalSvg(c, look);
    return `
      <article class="logo-card" data-id="${c.id}">
        <div class="logo-hero">
          ${crystalSvg(c, { ...look, title: `Kristall ${c.name}` })}
          <span class="wordmark">ORVANE</span>
        </div>
        <div class="logo-tests">
          <div class="test-light">${svg}<small>Hell</small></div>
          <div><span class="favicons">${svg}${svg}${svg}</span><small>16 · 24 · 32 px</small></div>
          <div><span class="dial">${svg}<span>ORVANE</span></span><small>Zifferblatt</small></div>
        </div>
        <div class="logo-info">
          <h2><span>${letter(i)}</span>${c.name}</h2>
          <p class="facets">${c.facets} ${c.facets === 1 ? 'Fläche' : 'Facetten'} sichtbar</p>
          <p>${c.text}</p>
          <div class="logo-actions">
            <button type="button" class="button" data-preview="${c.id}">In 3D ansehen</button>
            <button type="button" class="button" data-choose="${c.id}">Diesen wählen</button>
          </div>
        </div>
      </article>`;
  }).join('');
  renderMarks();
}

// 3D preview
const stage = document.getElementById('preview-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
key.position.set(-3, 4, 5);
scene.add(key, new THREE.AmbientLight(0xffffff, 0.15));

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 6.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reducedMotion;
controls.enablePan = false;
controls.enableZoom = false;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 1.6;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
stage.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

let mesh = null;

function showCrystal(id) {
  const crystal = CRYSTALS.find((c) => c.id === id);
  if (mesh) {
    scene.remove(mesh);
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }
  mesh = createCrystalMesh(crystal, { color: state.color, stone: state.stone });
  scene.add(mesh);
  state.preview = id;
  document.getElementById('preview-name').textContent = `${letter(CRYSTALS.indexOf(crystal))} · ${crystal.name}`;
  document.querySelector('[data-switch="stone"]').closest('.preview-body')
    .classList.toggle('no-stone', !hasStone(crystal));
  renderMarks();
}

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Colour and stone switches
function renderSwitch(name, options) {
  const group = document.querySelector(`[data-switch="${name}"]`);
  group.innerHTML = options.map((o) => `<button type="button" data-value="${o.id}" aria-pressed="${o.id === state[name]}">${o.label}</button>`).join('');
  group.addEventListener('click', (e) => {
    const value = e.target.closest('[data-value]')?.dataset.value;
    if (!value || value === state[name]) return;
    state[name] = value;
    for (const b of group.children) b.setAttribute('aria-pressed', String(b.dataset.value === value));
    renderCards();
    showCrystal(state.preview);
  });
}
renderSwitch('color', COLOR_OPTIONS);
renderSwitch('stone', STONE_OPTIONS);

// Active preview and choice marks
function renderMarks() {
  for (const card of grid.children) {
    card.toggleAttribute('data-active', card.dataset.id === state.preview);
    const on = card.dataset.id === state.chosen;
    card.toggleAttribute('data-chosen', on);
    const button = card.querySelector('[data-choose]');
    button.textContent = on ? 'Gewählt ✓' : 'Diesen wählen';
    button.setAttribute('aria-pressed', String(on));
  }
  const i = CRYSTALS.findIndex((c) => c.id === state.chosen);
  if (i < 0) {
    document.getElementById('choice').textContent = 'Noch keine Wahl getroffen.';
    return;
  }
  const crystal = CRYSTALS[i];
  const look = labelOf(COLOR_OPTIONS, state.color) + (hasStone(crystal) ? `, Stein ${labelOf(STONE_OPTIONS, state.stone)}` : '');
  document.getElementById('choice').textContent =
    `Deine Wahl: ${letter(i)} – ${crystal.name} (${look}). Sag mir im Chat Bescheid, dann baue ich es in Shop, Favicon und Zifferblatt ein.`;
}

grid.addEventListener('click', (e) => {
  const preview = e.target.closest('[data-preview]')?.dataset.preview;
  const choose = e.target.closest('[data-choose]')?.dataset.choose;
  if (preview) showCrystal(preview);
  if (choose) {
    state.chosen = choose;
    try { localStorage.setItem(STORE, JSON.stringify({ id: choose, color: state.color, stone: state.stone })); } catch {}
    showCrystal(choose);
  }
});

renderCards();
showCrystal(state.chosen && CRYSTALS.some((c) => c.id === state.chosen) ? state.chosen : CRYSTALS[0].id);
window.orvaneLogo = { showCrystal, state, scene, camera, controls, renderer };
