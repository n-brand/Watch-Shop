// Preview a procedural watch model and store it as the next version in the history.
// Open http://127.0.0.1:5173/tools/save-version.html (local server), pick the model, describe the change, save.
// ?model=lumen preselects a model. The viewer is also exposed as window.orvane for the console.
import { createViewer } from '../js/scene.js';
import { MODELS, DEFAULT_MODEL } from '../js/config.js';
import { saveVersion } from '../js/history/saveVersion.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let model = MODELS[params.get('model')] ? params.get('model') : DEFAULT_MODEL;

$('model').replaceChildren(...Object.entries(MODELS).map(([id, m]) => new Option(`${m.label} (${m.kind === 'digital' ? 'digital' : 'analog'})`, id, false, id === model)));

const viewer = await createViewer($('stage'), { model, wheelZoom: 'always' });
viewer.setRunning(true);
window.orvane = viewer;

const save = $('save');
const status = $('status');
save.disabled = false;

$('model').addEventListener('change', async (e) => {
  model = e.target.value;
  params.set('model', model);
  history.replaceState(null, '', `?${params}`);
  save.disabled = true;
  status.textContent = 'Modell wird gebaut …';
  await viewer.setModel({ model });
  status.textContent = '';
  save.disabled = false;
});

save.addEventListener('click', async () => {
  const note = $('note').value.trim();
  if (!note) {
    status.textContent = 'Bitte beschreiben, was sich geändert hat.';
    $('note').focus();
    return;
  }
  save.disabled = true;
  status.textContent = 'Speichere …';
  try {
    const entry = await saveVersion(viewer, note, { model });
    status.textContent = `Gespeichert als ${entry.id}.`;
    $('note').value = '';
  } catch (err) {
    status.textContent = `Fehler: ${err.message}`;
  } finally {
    save.disabled = false;
  }
});
