import * as THREE from 'three';

// Product-photography studio, built in code (no HDR download).
// The environment is a dark room with emissive softboxes; metal reflects these as soft, shaped highlights.
function softbox(scene, { w, h, position, intensity, color = 0xffffff }) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.set(...position);
  panel.lookAt(0, 0, 0);
  scene.add(panel);
}

export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x2b2721);

  // Large, soft key light above left
  softbox(env, { w: 9, h: 6, position: [-5.5, 6, 4.5], intensity: 4.2, color: 0xfff3e2 });
  // Broad, dim front fill so polished faces facing the camera are not black
  softbox(env, { w: 7, h: 6, position: [3.5, -1.5, 7], intensity: 0.9, color: 0xfff6ea });
  // Narrow strip light from the right to draw the case silhouette
  softbox(env, { w: 0.9, h: 9, position: [7, 0.5, 1.5], intensity: 5.0, color: 0xf4f6ff });
  // Rim / back light for bracelet contours
  softbox(env, { w: 9, h: 1.6, position: [0, 3.5, -7], intensity: 2.4, color: 0xfff0dc });
  // Overhead fill and warm floor bounce keep shadows from going flat black
  softbox(env, { w: 12, h: 12, position: [0, 9, 0], intensity: 0.6 });
  softbox(env, { w: 12, h: 12, position: [0, -8, 0], intensity: 0.25, color: 0xffd9a8 });
  return bake(renderer, env, 0.025);
}

// Reflection environment for the glasses only: a large, soft card above and in front of the watch, as product
// photographers set one up so the crystal shows a gentle sheen. In the main studio the softboxes sit where a
// glass seen from the front never reflects them, so the crystals looked like empty openings.
export function createGlassEnvironment(renderer) {
  const env = new THREE.Scene();
  // A crystal is nearly flat, so where its reflection lands depends entirely on the view; single cards were
  // missed from most angles. An evenly lit grey room with a brighter ceiling gives a faint veil from every
  // direction, which Fresnel turns into a brighter rim at grazing angles, as on real sapphire.
  env.background = new THREE.Color(0x4c5058);
  softbox(env, { w: 22, h: 22, position: [0, 10, 0], intensity: 2.2, color: 0xf2f5ff });
  softbox(env, { w: 14, h: 6, position: [1.6, 4.2, 9.5], intensity: 2.0, color: 0xf2f5ff });
  // Narrow strip light front left: in the usual three-quarter views it lies as a slim highlight across the
  // crystal, the classic cue that there is glass over the dial
  softbox(env, { w: 1.6, h: 12, position: [-8, 0, 6], intensity: 1.9, color: 0xf2f5ff });
  return bake(renderer, env, 0.04);
}

function bake(renderer, env, blur) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, blur).texture;
  pmrem.dispose();
  env.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return texture;
}

// Direct lights matching the softboxes; only the key casts shadows (small contact shadows under hands and indices)
export function addStudioLights(scene) {
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(-50, 60, 70);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -50;
  key.shadow.camera.right = key.shadow.camera.top = 50;
  key.shadow.camera.near = 20;
  key.shadow.camera.far = 250;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;

  const strip = new THREE.DirectionalLight(0xf2f5ff, 0.7);
  strip.position.set(90, 8, 25);
  const rim = new THREE.DirectionalLight(0xffeedd, 0.9);
  rim.position.set(0, 40, -90);
  // The rim light is the key light for the caseback side: its shadows give the movement its contact shadows
  // (wheels under bridges, bridges on the plate, rotor over the movement).
  // Its shadow frustum only spans the movement's depth (distance along the light ~89-102 mm for the movement,
  // ~48 mm for the bracelet loop behind the caseback), so the strap neither casts nor receives these shadows.
  rim.castShadow = true;
  rim.shadow.mapSize.set(2048, 2048);
  rim.shadow.camera.left = rim.shadow.camera.bottom = -14;
  rim.shadow.camera.right = rim.shadow.camera.top = 14;
  rim.shadow.camera.near = 87;
  rim.shadow.camera.far = 104;
  rim.shadow.bias = -0.0002;
  rim.shadow.normalBias = 0.01;
  scene.add(key, strip, rim, new THREE.AmbientLight(0xffffff, 0.06));
  return { key, strip, rim };
}

// Khronos PBR Neutral: made for product renders, keeps gold hues true (AgX tested: gold turned khaki)
// and rolls off highlights so polished faces do not burn out to white.
export function configureRenderer(renderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  // A little over 1 so the watch reads lighter on the dark page; tested 1.0-1.3, gold keeps its highlights up to ~1.2
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
