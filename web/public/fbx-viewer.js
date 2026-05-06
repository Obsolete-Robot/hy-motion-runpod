import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js';

const card = document.querySelector('#viewer');
const host = document.querySelector('#viewer-canvas');
const caption = document.querySelector('#viewer-caption');
const clear = document.querySelector('#viewer-clear');

let renderer;
let camera;
let scene;
let controls;
let mixer;
let clock;
let currentModel;
let animationId;
let resizeObserver;

function ensureViewer() {
  if (renderer) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a12);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
  camera.position.set(0, 120, 260);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 80, 0);

  clock = new THREE.Clock();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x26345f, 2.3);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(160, 240, 120);
  scene.add(key);
  const grid = new THREE.GridHelper(240, 24, 0x88d8ff, 0x26345f);
  grid.name = 'floor-grid';
  scene.add(grid);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  animate();
}

function resize() {
  if (!renderer || !host) return;
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixer?.update(delta);
  controls?.update();
  renderer.render(scene, camera);
}

function disposeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.filter(Boolean).forEach(mat => {
      Object.values(mat).forEach(value => value?.isTexture && value.dispose());
      mat.dispose?.();
    });
  });
}

function clearModel() {
  mixer = null;
  if (currentModel) {
    scene.remove(currentModel);
    disposeObject(currentModel);
    currentModel = null;
  }
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim * 1.7;

  controls.target.copy(center);
  camera.position.set(center.x, center.y + maxDim * 0.45, center.z + distance);
  camera.near = Math.max(maxDim / 1000, 0.01);
  camera.far = Math.max(maxDim * 12, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

window.loadFbxViewer = async function loadFbxViewer(url, name = 'Animation') {
  card.classList.remove('hidden');
  ensureViewer();
  clearModel();
  caption.textContent = `Loading ${name}…`;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const loader = new FBXLoader();
    const object = await loader.loadAsync(url);
    currentModel = object;
    scene.add(object);

    if (object.animations?.length) {
      mixer = new THREE.AnimationMixer(object);
      const action = mixer.clipAction(object.animations[0]);
      action.reset().play();
      caption.textContent = `Playing ${name} · ${object.animations.length} clip${object.animations.length === 1 ? '' : 's'}`;
    } else {
      caption.textContent = `${name} loaded, but no animation clip was found.`;
    }
    frameObject(object);
  } catch (err) {
    caption.textContent = `Could not load ${name}: ${err.message || err}`;
  }
};

clear.addEventListener('click', () => {
  clearModel();
  caption.textContent = 'Click “View animation” on a completed FBX to load it here.';
});

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  resizeObserver?.disconnect();
  clearModel();
  renderer?.dispose();
});
