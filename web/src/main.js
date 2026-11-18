import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadManifest, loadF32, loadU8, loadJSON } from './data.js';
import vertexShader from './shaders/points.vert.glsl?raw';
import fragmentShader from './shaders/points.frag.glsl?raw';
import { projectByHand } from './experiments.js';

// ---- renderer, scene, camera ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101114);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.cs = { THREE, renderer, scene, camera, controls };

const hud = document.getElementById('hud');
let hudInfo = '';

// ---- CONTENT START ----

// 1. palette and uniforms
const hex = (h) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
const PALETTE = [0x4e79a7, 0xf28e2b, 0xe15759, 0x76b7b2, 0x59a14f, 0xedc948,
                 0xb07aa1, 0xff9da7, 0x9c755f, 0xbab0ac, 0x1b9e77, 0x7570b3].map(hex);

const uniforms = {
  uWorldSize: { value: 0.03 },
  uPxPerUnit: { value: 1.0 },
  uHighlight: { value: -1.0 },
  uPalette:   { value: PALETTE },
};

function updatePointScale() {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  uniforms.uPxPerUnit.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', updatePointScale);
updatePointScale();

// 2. state
let points = null, sphereMesh = null, manifest = null, clusterCodes = null, markers = null;
let positions = null, currentName = 'pca', currentSynthetic = false;
let variant = 'points';
const SPHERE_DETAIL = 1;          // TODO: try 0 and 2 and compare triangles/FPS

const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });

// lights for the lit spheres (harmless for the points shader)
scene.add(new THREE.AmbientLight(0xffffff, 0.4), new THREE.DirectionalLight(0xffffff, 2.5));

// 3. tooltip helpers
const tooltip = document.getElementById('tooltip');

function describeCell(i) {
  const label = manifest.obs.cluster.categories[clusterCodes[i]];
  const top = markers.markers[label].slice(0, 3).map((m) => m.gene).join(', ');
  return `cell ${i}${currentSynthetic ? ' (SYNTHETIC)' : ''}<br>cluster ${label}<br>top markers: ${top}`;
}

function showTooltip(i, x, y) {
  if (i < 0) { tooltip.style.display = 'none'; uniforms.uHighlight.value = -1; return; }
  tooltip.innerHTML = describeCell(i);
  tooltip.style.left = x + 14 + 'px';
  tooltip.style.top = y + 14 + 'px';
  tooltip.style.display = 'block';
  uniforms.uHighlight.value = clusterCodes[i];
}

// 4. spheres (variant 2)
function disposeSpheres() {
  if (!sphereMesh) return;
  scene.remove(sphereMesh);
  sphereMesh.geometry.dispose();
  sphereMesh.material.dispose();
  sphereMesh.dispose();
  sphereMesh = null;
}

function buildSpheres() {
  disposeSpheres();
  const N = clusterCodes.length;
  const sphere = new THREE.IcosahedronGeometry(1, SPHERE_DETAIL);
  const mat = new THREE.MeshPhongMaterial({ shininess: 40 });
  sphereMesh = new THREE.InstancedMesh(sphere, mat, N);

  const m = new THREE.Matrix4(), c = new THREE.Color();
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const r = uniforms.uWorldSize.value / 2;
  s.set(r, r, r);
  for (let i = 0; i < N; i++) {
    v.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
    m.compose(v, q, s);
    sphereMesh.setMatrixAt(i, m);
    const p = PALETTE[Math.min(clusterCodes[i], 11)];
    c.setRGB(p.x, p.y, p.z, THREE.SRGBColorSpace);
    sphereMesh.setColorAt(i, c);
  }
  sphereMesh.instanceMatrix.needsUpdate = true;
  sphereMesh.instanceColor.needsUpdate = true;
  scene.add(sphereMesh);
}

function applyVariant() {
  if (variant === 'spheres' && !sphereMesh) buildSpheres();
  if (points) points.visible = variant === 'points';
  if (sphereMesh) sphereMesh.visible = variant === 'spheres';
}

// 5. loading (takes an embedding name)
async function loadCells(name = 'pca') {
  if (!manifest) manifest = await loadManifest();
  if (!markers) markers = await loadJSON('/data/' + manifest.markers);

  const e = manifest.embeddings[name];
  const n = e.n_cells ?? manifest.n_cells;
  const codesFile = e.cluster_file ?? manifest.obs.cluster.file;

  const newPositions = await loadF32('/data/' + e.file);
  const newCodes = await loadU8('/data/' + codesFile);
  if (newPositions.length !== n * 3) throw new Error('positions: size mismatch');
  if (newCodes.length !== n) throw new Error('cluster codes: size mismatch');

  // dispose the old objects only after the new data loaded successfully
  if (points) { scene.remove(points); points.geometry.dispose(); }
  disposeSpheres();

  positions = newPositions;
  clusterCodes = newCodes;
  currentName = name;
  currentSynthetic = !!e.synthetic;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aCluster', new THREE.BufferAttribute(clusterCodes, 1));

  points = new THREE.Points(geometry, material);
  scene.add(points);
  window.cs.points = points;

  hudInfo = `${currentSynthetic ? 'SYNTHETIC ' : ''}${n} cells · ${name} · ${manifest.obs.cluster.categories.length} clusters · ${variant}`;
  applyVariant();
  // if you add GPU picking (C2), call setupPicking() here again
}
loadCells('pca').catch((err) => { console.error(err); hud.textContent = String(err); });

// 6. UI
document.getElementById('size').addEventListener('input', (e) => {
  uniforms.uWorldSize.value = +e.target.value;
});
document.getElementById('size').addEventListener('change', () => {
  if (variant === 'spheres' && positions) buildSpheres();   // spheres bake the radius in
  applyVariant();
});
document.getElementById('dataset').addEventListener('change', (e) => {
  loadCells(e.target.value).catch((err) => { console.error(err); hud.textContent = String(err); });
});
document.getElementById('variant').addEventListener('change', (e) => {
  variant = e.target.value;
  hudInfo = hudInfo.replace(/ · (points|spheres)$/, ` · ${variant}`);
  applyVariant();
});

// 7. C1: CPU raycasting (still against the points object, even when it is hidden)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!points) return;
  raycaster.params.Points.threshold = uniforms.uWorldSize.value / 2;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  const t0 = performance.now();
  const hits = raycaster.intersectObject(points);
  window.cs.lastRaycastMs = performance.now() - t0;

  if (hits.length) showTooltip(hits[0].index, e.clientX, e.clientY);
  else showTooltip(-1, 0, 0);
});

// 8. extras and update
window.cs.projectByHand = projectByHand;
function update(dt) { /* nothing to animate yet */ }

// ---- CONTENT END ----

// ---- render loop with statistics ----
let frames = 0, last = performance.now(), prev = last;

function animate(now) {
  requestAnimationFrame(animate);
  update((now - prev) / 1000);
  prev = now;
  controls.update();
  renderer.render(scene, camera);

  frames++;
  if (now - last > 500) {
    const fps = Math.round(frames * 1000 / (now - last));
    const r = renderer.info.render;
    hud.textContent = `${hudInfo} · ${r.calls} calls · ${r.points} points · ${r.triangles} triangles · ${fps} FPS`;
    frames = 0; last = now;
  }
}
requestAnimationFrame(animate);