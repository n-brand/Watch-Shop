import { MODEL_PATH, WATCH_PARTS, OPTIONAL_PARTS } from '../config.js';
import { buildProceduralWatch } from './proceduralWatch.js';

async function loadGltf(path) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  // Saved versions are compressed with EXT_meshopt_compression (geometry) and EXT_texture_webp
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(path);
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = obj.receiveShadow = true;
    // glTF has no visibility flag; saved versions mark hidden strap variants in extras
    if (obj.userData.hidden) obj.visible = false;
  });
  return gltf.scene;
}

// Returns the watch root plus named parts. A glTF model needs nodes named as in WATCH_PARTS;
// hands must pivot at the dial centre and rotate around local Z with 12 o'clock at +Y.
export async function loadWatch({ path = MODEL_PATH } = {}) {
  const root = path ? await loadGltf(path) : await buildProceduralWatch();

  const parts = {};
  for (const [key, name] of Object.entries(WATCH_PARTS)) {
    parts[key] = root.getObjectByName(name) ?? null;
    if (!parts[key] && !OPTIONAL_PARTS.has(key)) console.warn(`Watch part "${name}" not found in model`);
  }
  return { root, parts };
}
