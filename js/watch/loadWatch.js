import { MODEL_PATH, WATCH_PARTS, OPTIONAL_PARTS, KIND_PARTS, DEFAULT_MODEL } from '../config.js';
import { AdditiveBlending } from 'three';
import { buildProceduralWatch } from './proceduralWatch.js';
import { GLASS_REFLECTION } from './materials.js';

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
    // glTF has no additive blending: restore the glass reflection layers (else they render as black discs)
    if (obj.isMesh && obj.material.name === GLASS_REFLECTION) {
      obj.castShadow = obj.receiveShadow = false;
      Object.assign(obj.material, { transparent: true, blending: AdditiveBlending, depthWrite: false });
      obj.material.envMapIntensity = obj.userData.reflectionStrength ?? 1;
      obj.renderOrder = 3;
    }
  });
  return gltf.scene;
}

async function buildModel(model) {
  if (model === 'lumen') {
    const { buildDigitalWatch } = await import('./digitalWatch.js');
    return buildDigitalWatch();
  }
  if (model === 'abyss') {
    const { buildDiverWatch } = await import('./diverWatch.js');
    return buildDiverWatch();
  }
  return buildProceduralWatch();
}

// Returns the watch root plus named parts. A glTF model needs nodes named as in WATCH_PARTS;
// hands must pivot at the dial centre and rotate around local Z with 12 o'clock at +Y.
// A digital model has a Display mesh instead of hands (see digitalDisplay.js).
export async function loadWatch({ path = MODEL_PATH, model = DEFAULT_MODEL } = {}) {
  const root = path ? await loadGltf(path) : await buildModel(model);

  const kind = root.getObjectByName(WATCH_PARTS.display) ? 'digital' : 'analog';
  const notNeeded = new Set(Object.entries(KIND_PARTS).filter(([k]) => k !== kind).flatMap(([, keys]) => keys));
  const parts = {};
  for (const [key, name] of Object.entries(WATCH_PARTS)) {
    parts[key] = root.getObjectByName(name) ?? null;
    if (!parts[key] && !OPTIONAL_PARTS.has(key) && !notNeeded.has(key)) console.warn(`Watch part "${name}" not found in model`);
  }
  return { root, parts };
}
