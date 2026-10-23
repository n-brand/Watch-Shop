import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const writeHeaders = { 'X-Orvane': '1' };
// Resolved from this module, so it works from any page (shop root or tools/)
const API = new URL('../../api/', import.meta.url);

async function post(url, body, headers) {
  const res = await fetch(url, { method: 'POST', headers: { ...writeHeaders, ...headers }, body });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Stores a WebP front view for an existing version (used by saveVersion and to backfill old versions).
// replace: overwrite an existing preview (e.g. after a framing change); the model itself is never touched.
export async function saveThumbnail(viewer, id, { replace = false } = {}) {
  const blob = await viewer.snapshot();
  return post(new URL(`versions/${id}/thumbnail`, API), blob, { 'Content-Type': 'image/webp', ...(replace ? { 'X-Replace': '1' } : {}) });
}

// Exports the current watch as .glb plus a preview image and stores both as the next version.
// Use tools/save-version.html, or in its console:
//   const { saveVersion } = await import('/js/history/saveVersion.js');
//   await saveVersion(window.orvane, 'Leather strap added', { model: 'meridian' });
export async function saveVersion(viewer, note, { model = 'meridian' } = {}) {
  const { watch, parts } = viewer;

  // Neutral pose: undo scroll offsets, remember which strap variant is shown
  const strapY = parts.strap?.position.y ?? 0;
  if (parts.strap) {
    parts.strap.position.y = 0;
    for (const variant of parts.strap.children) variant.userData.hidden = !variant.visible;
  }

  let entry;
  try {
    const glb = await new GLTFExporter().parseAsync(watch, { binary: true, onlyVisible: false });
    entry = await post(new URL('versions', API), glb, {
      'Content-Type': 'model/gltf-binary',
      'X-Version-Note': encodeURIComponent(note),
      'X-Version-Model': model,
    });
  } finally {
    if (parts.strap) parts.strap.position.y = strapY;
  }
  return saveThumbnail(viewer, entry.id);
}
