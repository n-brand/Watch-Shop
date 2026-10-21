// Renders the product stills for the shop page from the procedural watch.
// Open http://127.0.0.1:5173/tools/render-stills.html (local server) and press the button,
// or in the console: await window.renderStills()
import { createViewer } from '../js/scene.js';
import { updateHands } from '../js/clock.js';
import { MATERIAL_NAMES, STRAP_VARIANTS } from '../js/config.js';
import { CASE_OPTIONS, STRAP_OPTIONS } from '../js/products.js';
import { METALS } from '../js/watch/materials.js';

// Classic catalogue time: hands frame the logo
const CATALOGUE_TIME = new Date(2026, 0, 1, 10, 9, 36);
const PIXEL_RATIO = 2;

const look = (caseId, strapId) => ({ case: caseId, strap: strapId });
// rx/ry: rig rotation, x: horizontal offset (fraction of width), zoom: camera zoom, w/h: CSS size (canvas is twice that)
const SHOTS = [
  { name: 'hero', rx: 0, ry: 0, zoom: 1.05, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { name: 'case', rx: 0.1, ry: -0.75, x: -0.14, zoom: 0.75, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { name: 'glass', rx: -0.25, ry: 0.2, zoom: 1.9, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { name: 'movement', rx: 0.05, ry: Math.PI, zoom: 1.45, w: 600, h: 750, hideStrap: true, ...look('yellow', 'bracelet') },
  { name: 'profile', rx: 0.05, ry: -1.35, x: -0.2, zoom: 0.8, w: 600, h: 600, ...look('yellow', 'bracelet') },
  ...CASE_OPTIONS.flatMap((c) => STRAP_OPTIONS.map((s) => ({
    name: `meridian-${c.id}-${s.id}`, rx: 0.05, ry: -0.35, x: -0.06, zoom: 0.85, w: 600, h: 750, ...look(c.id, s.id),
  }))),
];

const stage = document.getElementById('stage');
const viewer = await createViewer(stage, { reducedMotion: true });
viewer.renderer.setPixelRatio(PIXEL_RATIO);

function forEachMaterial(name, fn) {
  viewer.watch.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const mat of [obj.material].flat()) if (mat.name === name) fn(mat);
  });
}

async function renderShot(shot) {
  const { parts, rig, renderer, controls, camera, scene } = viewer;
  stage.style.width = `${shot.w}px`;
  stage.style.height = `${shot.h}px`;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const caseOpt = CASE_OPTIONS.find((o) => o.id === shot.case);
  const strapOpt = STRAP_OPTIONS.find((o) => o.id === shot.strap);
  forEachMaterial(MATERIAL_NAMES.caseMetal, (mat) => mat.color.setHex(METALS[caseOpt.metal].color));
  for (const [key, name] of Object.entries(STRAP_VARIANTS)) {
    const node = parts.strap?.getObjectByName(name);
    if (node) node.visible = key === strapOpt.variant;
  }
  if (strapOpt.color !== undefined) forEachMaterial(MATERIAL_NAMES.leather, (mat) => mat.color.setHex(strapOpt.color));
  if (parts.strap) parts.strap.visible = !shot.hideStrap;

  updateHands(parts, { smooth: false, date: CATALOGUE_TIME });
  rig.rotation.set(shot.rx, shot.ry, 0);
  viewer.setFrame({ x: shot.x ?? 0, y: 0, zoom: shot.zoom });
  controls.update();
  renderer.render(scene, camera);
  const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, 'image/webp', 0.9));

  if (parts.strap) parts.strap.visible = true;
  return blob;
}

async function save(name, blob) {
  const res = await fetch(`../api/renders/${name}.webp`, { method: 'POST', headers: { 'X-Orvane': '1', 'Content-Type': 'image/webp' }, body: blob });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
}

async function renderStills({ store = true } = {}) {
  const out = document.getElementById('out');
  const status = document.getElementById('status');
  out.replaceChildren();
  const sizes = {};
  for (const [i, shot] of SHOTS.entries()) {
    status.textContent = ` ${i + 1} / ${SHOTS.length}: ${shot.name}`;
    const blob = await renderShot(shot);
    if (store) await save(shot.name, blob);
    sizes[shot.name] = blob.size;
    const fig = document.createElement('figure');
    fig.innerHTML = '<img alt=""><figcaption></figcaption>';
    fig.querySelector('img').src = URL.createObjectURL(blob);
    fig.querySelector('figcaption').textContent = `${shot.name} · ${(blob.size / 1024).toFixed(0)} KB`;
    out.append(fig);
  }
  status.textContent = store ? ` ${SHOTS.length} Bilder gespeichert.` : ` ${SHOTS.length} Bilder gerendert (nicht gespeichert).`;
  return sizes;
}

window.renderStills = renderStills;
const button = document.getElementById('render');
button.disabled = false;
button.addEventListener('click', () => renderStills().catch((err) => {
  document.getElementById('status').textContent = ` Fehler: ${err.message}`;
}));
