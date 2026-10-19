import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const writeHeaders = { 'X-Orvane': '1' };

async function post(url, body, headers) {
  const res = await fetch(url, { method: 'POST', headers: { ...writeHeaders, ...headers }, body });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Stores a WebP front view for an existing version (used by saveVersion and to backfill old versions).
// replace: overwrite an existing preview (e.g. after a framing change); the model itself is never touched.
export async function saveThumbnail(viewer, id, { replace = false } = {}) {
  const blob = await viewer.snapshot();
  return post(`api/versions/${id}/thumbnail`, blob, { 'Content-Type': 'image/webp', ...(replace ? { 'X-Replace': '1' } : {}) });
}

// Exports the current watch as .glb plus a preview image and stores both as the next version.
// Run on a freshly loaded shop page (default configuration), e.g. in the console:
//   const { saveVersion } = await import('/js/history/saveVersion.js');
//   await saveVersion(window.orvane, 'Leather strap added');
export async function saveVersion(viewer, note) {
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
    entry = await post('api/versions', glb, {
      'Content-Type': 'model/gltf-binary',
      'X-Version-Note': encodeURIComponent(note),
    });
  } finally {
    if (parts.strap) parts.strap.position.y = strapY;
  }
  return saveThumbnail(viewer, entry.id);
}
