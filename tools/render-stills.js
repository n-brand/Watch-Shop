// Renders the product stills for the shop page from the procedural watches.
// Open http://127.0.0.1:5173/tools/render-stills.html (local server) and press the button,
// or in the console: await window.renderStills() (or renderStills({ models: ['lumen'] }) for one model,
// renderStills({ only: ['hero'], store: false }) for a quick look without saving)
import { createViewer } from '../js/scene.js';
import { updateHands } from '../js/clock.js';
import { CASE_OPTIONS, STRAP_OPTIONS, DIAL_OPTIONS, DEFAULT_DIAL, WATCH_MODELS, renderImage } from '../js/products.js';
import { applyLook } from '../js/watch/look.js';

// Classic catalogue time: hands frame the logo; the digital display shows the same time
const CATALOGUE_TIME = new Date(2026, 0, 1, 10, 9, 36);
const PIXEL_RATIO = 2;

const look = (caseId, strapId, dialId = DEFAULT_DIAL) => ({ case: caseId, strap: strapId, dial: dialId });
// File name of a configurator still, taken from the shop's own naming so both always agree
const stillName = (m, c, s, d) => renderImage(m, c, s, d).split('/').pop().replace('.webp', '');
// rx/ry: rig rotation, x: horizontal offset (fraction of width), zoom: camera zoom, w/h: CSS size (canvas is twice that).
// The configurator views use the same pose as its 3D view starts with (see configurator.js), so the swap is seamless.
const SHOTS = [
  { model: 'meridian', name: 'hero', rx: 0, ry: 0, zoom: 1.05, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { model: 'meridian', name: 'case', rx: 0.1, ry: -0.75, x: -0.14, zoom: 0.75, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { model: 'meridian', name: 'glass', rx: -0.25, ry: 0.2, zoom: 1.9, w: 600, h: 750, ...look('yellow', 'bracelet') },
  { model: 'meridian', name: 'movement', rx: 0.05, ry: Math.PI, zoom: 1.45, w: 600, h: 750, hideStrap: true, ...look('yellow', 'bracelet') },
  { model: 'meridian', name: 'profile', rx: 0.05, ry: -1.35, x: -0.2, zoom: 0.8, w: 600, h: 600, ...look('yellow', 'bracelet') },
  ...WATCH_MODELS.flatMap((m) => CASE_OPTIONS.flatMap((c) => STRAP_OPTIONS.flatMap((s) => (m.dials ? DIAL_OPTIONS : [null]).map((d) => ({
    model: m.id, name: stillName(m, c, s, d), rx: 0.05, ry: -0.35, x: -0.06, zoom: 0.85, w: 600, h: 750, ...look(c.id, s.id, d?.id),
  }))))),
];

const stage = document.getElementById('stage');
const viewer = await createViewer(stage, { reducedMotion: true });
viewer.renderer.setPixelRatio(PIXEL_RATIO);
let currentModel = 'meridian';

async function renderShot(shot) {
  if (shot.model !== currentModel) {
    await viewer.setModel({ model: shot.model });
    currentModel = shot.model;
  }
  const { parts, rig, renderer, controls, camera, scene } = viewer;
  stage.style.width = `${shot.w}px`;
  stage.style.height = `${shot.h}px`;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const caseOpt = CASE_OPTIONS.find((o) => o.id === shot.case);
  const strapOpt = STRAP_OPTIONS.find((o) => o.id === shot.strap);
  const model = WATCH_MODELS.find((m) => m.id === shot.model);
  await applyLook(viewer.watch, parts, caseOpt, strapOpt, model.dials ? DIAL_OPTIONS.find((o) => o.id === shot.dial) : null);
  if (parts.strap) parts.strap.visible = !shot.hideStrap;

  updateHands(parts, { smooth: false, date: CATALOGUE_TIME });
  viewer.display?.draw(CATALOGUE_TIME);
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

// only: shot names to render (e.g. ['hero']) for a quick look, together with store: false
async function renderStills({ store = true, models = WATCH_MODELS.map((m) => m.id), only } = {}) {
  const out = document.getElementById('out');
  const status = document.getElementById('status');
  out.replaceChildren();
  const sizes = {};
  const shots = SHOTS.filter((s) => models.includes(s.model) && (!only || only.includes(s.name)));
  for (const [i, shot] of shots.entries()) {
    status.textContent = ` ${i + 1} / ${shots.length}: ${shot.name}`;
    const blob = await renderShot(shot);
    if (store) await save(shot.name, blob);
    sizes[shot.name] = blob.size;
    const fig = document.createElement('figure');
    fig.innerHTML = '<img alt=""><figcaption></figcaption>';
    fig.querySelector('img').src = URL.createObjectURL(blob);
    fig.querySelector('figcaption').textContent = `${shot.name} · ${(blob.size / 1024).toFixed(0)} KB`;
    out.append(fig);
  }
  status.textContent = store ? ` ${shots.length} Bilder gespeichert.` : ` ${shots.length} Bilder gerendert (nicht gespeichert).`;
  return sizes;
}

window.renderStills = renderStills;
window.stillsViewer = viewer; // for experiments in the console (exposure, lights)
const button = document.getElementById('render');
button.disabled = false;
button.addEventListener('click', () => renderStills().catch((err) => {
  document.getElementById('status').textContent = ` Fehler: ${err.message}`;
}));
