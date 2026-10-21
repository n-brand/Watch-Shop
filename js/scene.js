import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadWatch } from './watch/loadWatch.js';
import { updateHands } from './clock.js';
import { createStudioEnvironment, addStudioLights, configureRenderer } from './studio.js';

// Vertical field of view of an ~85 mm lens on full frame: long focal length, little perspective distortion
const FOV = 16;
// Half extents (mm) the framing must keep visible, incl. crown and bracelet.
// Measured from the default view for v009 (bracelet sized for an 18.5 cm wrist): ±23.7 × ±38.7 mm, plus margin.
// Fixed rather than per model, so versions in the history compare at the same scale.
const FRAME_HALF_W = 32;
const FRAME_HALF_H = 42;

// wheelZoom: 'ctrl' = plain wheel scrolls the page, Ctrl/Cmd + wheel zooms; 'always' = plain wheel zooms
export async function createViewer(container, { reducedMotion = false, modelPath, wheelZoom = 'ctrl' } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  configureRenderer(renderer);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = createStudioEnvironment(renderer);
  addStudioLights(scene);

  // rig: driven by scroll animations; camera orbit stays with the controls
  const rig = new THREE.Group();
  scene.add(rig);
  const loaded = await loadWatch(modelPath === undefined ? undefined : { path: modelPath });
  let watch = loaded.root;
  let parts = loaded.parts;
  rig.add(watch);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 20, 2500);
  const target = new THREE.Vector3(0, 0, 0);
  const viewDir = new THREE.Vector3(0.28, 0.18, 1).normalize();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = !reducedMotion;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI - 0.25;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  // Middle button would otherwise start the browser's autoscroll on Windows
  container.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Ctrl/Cmd + wheel (and trackpad pinch) always zooms; plain wheel only with wheelZoom 'always'.
  controls.enableZoom = wheelZoom === 'always';
  container.addEventListener('wheel', (e) => {
    controls.enableZoom = wheelZoom === 'always' || e.ctrlKey || e.metaKey;
  }, { capture: true, passive: true });
  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') controls.enableZoom = true;
  }, { capture: true });

  function fitDistance(aspect) {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    return Math.max(FRAME_HALF_H / tan, FRAME_HALF_W / (tan * aspect));
  }

  // Screen placement of the watch: x/y as fraction of the viewport (+x right, +y up), zoom as camera zoom.
  const frame = { x: 0, y: 0, zoom: 1 };

  function applyFrame() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    camera.zoom = frame.zoom;
    camera.setViewOffset(w, h, -frame.x * w, frame.y * h, w, h);
    camera.updateProjectionMatrix();
  }

  function setFrame(next) {
    Object.assign(frame, next);
    applyFrame();
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = fitDistance(camera.aspect);
    const dir = camera.position.lengthSq() ? camera.position.clone().sub(controls.target).normalize() : viewDir;
    camera.position.copy(controls.target).addScaledVector(dir, d);
    controls.minDistance = d * 0.4;
    controls.maxDistance = d * 1.5;
    applyFrame();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  // Let the page scroll vertically on touch; horizontal drags still rotate.
  renderer.domElement.style.touchAction = 'pan-y';

  function render() {
    updateHands(parts, { smooth: !reducedMotion });
    if (parts.rotor && !reducedMotion) parts.rotor.rotation.z -= 0.004;
    controls.update();
    renderer.render(scene, camera);
  }

  let running = false;
  const setRunning = (on) => {
    if (on === running) return;
    running = on;
    renderer.setAnimationLoop(on ? render : null);
  };
  // Compile all shaders up front (in parallel where KHR_parallel_shader_compile exists), so the first frame doesn't stall
  await renderer.compileAsync(scene, camera);
  render();

  // Swap the displayed model; the camera orbit is kept so versions compare from the same angle.
  let modelRequest = 0;
  async function setModel(path) {
    const request = ++modelRequest;
    const next = await loadWatch({ path });
    if (request === modelRequest) await renderer.compileAsync(next.root, camera, scene);
    if (request !== modelRequest) {
      disposeTree(next.root);
      return false;
    }
    rig.remove(watch);
    disposeTree(watch);
    watch = next.root;
    parts = next.parts;
    rig.add(watch);
    render();
    return true;
  }

  // Front view of the watch as an image, independent of scroll pose and current orbit
  async function snapshot({ width = 640, height = 800, type = 'image/webp', quality = 0.85 } = {}) {
    const saved = {
      pixelRatio: renderer.getPixelRatio(),
      position: camera.position.clone(),
      rotation: rig.rotation.clone(),
      strapY: parts.strap?.position.y ?? 0,
    };
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.copy(controls.target).addScaledVector(viewDir, fitDistance(camera.aspect));
    camera.lookAt(controls.target);
    camera.zoom = 0.92;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    rig.rotation.set(0, 0, 0);
    if (parts.strap) parts.strap.position.y = 0;

    renderer.render(scene, camera);
    const blob = await new Promise((resolve) => renderer.domElement.toBlob(resolve, type, quality));

    rig.rotation.copy(saved.rotation);
    if (parts.strap) parts.strap.position.y = saved.strapY;
    camera.position.copy(saved.position);
    renderer.setPixelRatio(saved.pixelRatio);
    resize();
    render();
    return blob;
  }

  return {
    renderer, scene, camera, controls, rig, frame, setFrame, setRunning, setModel, snapshot,
    get watch() { return watch; },
    get parts() { return parts; },
  };
}

function disposeTree(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry.dispose();
    for (const mat of [obj.material].flat()) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.dispose();
      mat.dispose();
    }
  });
}
