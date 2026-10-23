import { CURRENCY } from './config.js';
import { WATCH_MODELS, CASE_OPTIONS, STRAP_OPTIONS, DIAL_OPTIONS, priceOf, renderImage } from './products.js';

// Pose and framing of the 3D view; tools/render-stills.js renders the configurator stills with the same values,
// so the still can be swapped for the live model without a jump
const POSE = { rx: 0.05, ry: -0.35 };
const FRAME = { x: -0.06, y: 0, zoom: 0.85 };

// Model dropdown, case and strap swatches. Shows the pre-rendered still first; when the section comes close,
// the 3D watch (three.js, loaded only then) replaces it. On desktop it turns by dragging right there;
// on phones it only turns in full screen, so the page keeps scrolling normally.
export function initConfigurator(form, media, { onAdd }) {
  const image = media.querySelector('[data-configure-image]');
  const stage = media.querySelector('[data-configure-stage]');
  const hint = media.querySelector('[data-configure-hint]');
  const openButton = media.querySelector('[data-configure-open]');
  const closeButton = media.querySelector('[data-configure-close]');
  const modelSelect = form.elements.model;
  modelSelect.replaceChildren(...WATCH_MODELS.map((m) => new Option(`${m.label} · ${m.detail}`, m.id)));
  const dialFieldset = form.querySelector('[data-dial-fieldset]');

  // dialOpt is null for models without a dial (Lumen)
  const current = () => {
    const data = new FormData(form);
    const model = WATCH_MODELS.find((m) => m.id === data.get('model'));
    return {
      model,
      caseOpt: CASE_OPTIONS.find((o) => o.id === data.get('case')),
      strapOpt: STRAP_OPTIONS.find((o) => o.id === data.get('strap')),
      dialOpt: model.dials ? DIAL_OPTIONS.find((o) => o.id === data.get('dial')) : null,
    };
  };
  const describe = ({ caseOpt, strapOpt, dialOpt }) => [caseOpt.label, dialOpt && `Zifferblatt ${dialOpt.label}`, strapOpt.label].filter(Boolean);

  let viewer = null;
  let applyLook = null;
  let shownModel = null;

  // Bring the 3D view in line with the form; model swaps are serialised so fast clicking ends on the last choice
  let syncing = Promise.resolve();
  function sync3D() {
    syncing = syncing.then(async () => {
      if (!viewer) return;
      const { model, caseOpt, strapOpt, dialOpt } = current();
      if (model.id !== shownModel) {
        stage.setAttribute('aria-busy', 'true');
        await viewer.setModel({ model: model.id });
        shownModel = model.id;
        stage.removeAttribute('aria-busy');
      }
      await applyLook(viewer.watch, viewer.parts, caseOpt, strapOpt, dialOpt);
    }).catch((err) => console.warn('Configurator 3D update failed', err));
  }

  function update() {
    const selection = current();
    const { model, caseOpt, strapOpt, dialOpt } = selection;
    const [first, ...rest] = describe(selection);
    image.src = renderImage(model, caseOpt, strapOpt, dialOpt);
    image.alt = `${model.label} in ${first} mit ${rest.join(' und ')}`;
    stage.setAttribute('aria-label', `${image.alt}, 3D-Ansicht zum Drehen`);

    dialFieldset.hidden = !model.dials;
    form.querySelector('[data-model-name]').textContent = model.label;
    form.querySelector('[data-selected="case"]').textContent = caseOpt.label;
    form.querySelector('[data-selected="dial"]').textContent = dialOpt?.label ?? '';
    form.querySelector('[data-selected="strap"]').textContent = strapOpt.label;
    form.querySelector('[data-price]').textContent = CURRENCY.format(priceOf(model, caseOpt, strapOpt));
    sync3D();
  }

  // Warm the cache for all variants of a model, so switching swatches is instant even before 3D is ready
  const warmed = new Set();
  function warm(model) {
    if (warmed.has(model.id)) return;
    warmed.add(model.id);
    for (const c of CASE_OPTIONS) {
      for (const s of STRAP_OPTIONS) {
        for (const d of model.dials ? DIAL_OPTIONS : [null]) new Image().src = renderImage(model, c, s, d);
      }
    }
  }

  async function start3D() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const [{ createViewer }, look] = await Promise.all([import('./scene.js'), import('./watch/look.js')]);
      applyLook = look.applyLook;
      shownModel = current().model.id;
      viewer = await createViewer(stage, { model: shownModel, reducedMotion, wheelZoom: 'ctrl' });
      viewer.rig.rotation.set(POSE.rx, POSE.ry, 0);
      viewer.setFrame(FRAME);
      sync3D();
      await syncing;
      stage.hidden = false;
      hint.hidden = false;
      openButton.hidden = false;
      media.classList.add('is-3d');
      // Render only while the configurator is on screen (always in full screen)
      new IntersectionObserver(([entry]) => {
        viewer.setRunning(entry.isIntersecting || media.classList.contains('is-fullview'));
      }).observe(media);
    } catch (err) {
      // No WebGL, or three.js not reachable (offline before it was cached): the stills keep working
      console.warn('Configurator stays 2D', err);
      viewer = null;
    }
  }

  // Full screen on every device. Phones: the inline 3D view is display only (CSS turns off pointer events), so
  // turning happens here. Desktop: inline the wheel scrolls the page (Ctrl + wheel zooms), here it zooms.
  // main is a stacking context below the header; lightbox-open lifts it, as on the history page.
  // Leaving full screen resizes the stage, which puts the camera back at its fitted distance.
  const narrow = window.matchMedia('(max-width: 860px)');
  const isFullview = () => media.classList.contains('is-fullview');
  function renderLabels() {
    openButton.textContent = narrow.matches ? 'Vollbild · drehen' : 'Vollbild';
    if (isFullview()) hint.textContent = narrow.matches ? 'Ziehen zum Drehen · zwei Finger zoomen' : 'Ziehen zum Drehen · Mausrad zoomt';
    else hint.textContent = 'Ziehen zum Drehen';
  }
  function setFullview(on) {
    media.classList.toggle('is-fullview', on);
    document.documentElement.classList.toggle('no-scroll', on);
    document.documentElement.classList.toggle('lightbox-open', on);
    closeButton.hidden = !on;
    viewer?.setFrame(on ? { x: 0, y: 0, zoom: 1 } : FRAME);
    viewer?.setWheelZoom(on ? 'always' : 'ctrl');
    renderLabels();
    if (on) {
      viewer?.setRunning(true);
      closeButton.focus();
    } else {
      openButton.focus();
    }
  }
  openButton.addEventListener('click', () => setFullview(true));
  closeButton.addEventListener('click', () => setFullview(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullview()) setFullview(false);
  });
  narrow.addEventListener('change', renderLabels);
  renderLabels();

  // Load three.js and the watch only when the configurator comes close; skip it when the user asked to save data
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    warm(current().model);
    if (!navigator.connection?.saveData) start3D();
  }, { rootMargin: '400px 0px' }).observe(form);

  form.addEventListener('change', (e) => {
    if (e.target === modelSelect) warm(current().model);
    update();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selection = current();
    const { model, caseOpt, strapOpt, dialOpt } = selection;
    onAdd({
      key: [model.id, caseOpt.id, strapOpt.id, dialOpt?.id].filter(Boolean).join('-'),
      name: model.label,
      variant: describe(selection).join(' · '),
      price: priceOf(model, caseOpt, strapOpt),
      image: renderImage(model, caseOpt, strapOpt, dialOpt),
    });
  });
  update();
}
