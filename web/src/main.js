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
const PALETTE = [0x0072B2, 0xE69F00, 0x56B4E9, 0x009E73, 0xD55E00, 0xCC79A7, 0xF0E442, 0xBBBBBB,
                 0x0072B2, 0xBBBBBB, 0xBBBBBB, 0xBBBBBB].map(hex);   // index 8 = same colour as 0, drawn as a ring

const uniforms = {
  uWorldSize: { value: 0.03 },
  uPxPerUnit: { value: 1.0 },
  uHighlight: { value: -1.0 },
  uPalette: { value: PALETTE },
  uMode:      { value: 0.0 },
  uLut: { value: null },
  uUncertainty: { value: 0.0 },
};

function updatePointScale() {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  uniforms.uPxPerUnit.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', updatePointScale);
updatePointScale();

// 2. state
let pinned = -1;                  // cluster pinned by clicking the legend (-1 = none)
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
  if (i < 0) { tooltip.style.display = 'none'; uniforms.uHighlight.value = pinned; return; }
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

  geometry.setAttribute('aValue', new THREE.BufferAttribute(new Uint8Array(n), 1, true));
  geometry.setAttribute('aUncertainty', new THREE.BufferAttribute(new Uint8Array(n), 1, true));
  if (expr.current) setGene(expr.current);   // keep the chosen gene when the embedding changes

  points = new THREE.Points(geometry, material);
  scene.add(points);
  window.cs.points = points;
  applyUncertainty();
  buildLegend();
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

// ---- 9. Gene expression (task T2) ----
const expr = { data: null, meta: null, index: new Map(), N: 0, current: null };

// small control panel, built here so you don't need to touch index.html
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:12px;right:12px;padding:10px;background:#1b1c20;' +
  'color:#ddd;font:13px sans-serif;border-radius:6px;width:260px;z-index:10';
panel.innerHTML = `
  <label for="gene">Gene (empty = show clusters)</label><br>
  <input id="gene" list="genelist" placeholder="e.g. GNLY" style="width:100%;margin:4px 0">
  <datalist id="genelist"></datalist>
  <div id="genemsg" style="min-height:1.2em;color:#e69f00"></div>
  <canvas id="legend" width="240" height="60"></canvas>`;
document.body.appendChild(panel);

async function loadExpression() {
  if (!manifest) manifest = await loadManifest();
  const ex = manifest.expression;
  expr.N = ex.shape[1];
  expr.data = await loadU8('/data/' + ex.file);
  expr.meta = await loadJSON('/data/' + ex.genes);
  expr.meta.genes.forEach((g, i) => expr.index.set(g.symbol, i));

  const lutBytes = await loadU8('/data/' + manifest.lut.file);
  const tex = new THREE.DataTexture(lutBytes, 256, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  uniforms.uLut.value = tex;
  window.cs.lut = lutBytes;

  document.getElementById('genelist').innerHTML =
    expr.meta.genes.map((g) => `<option value="${g.symbol}">`).join('');
}
loadExpression().catch((err) => { console.error(err); document.getElementById('genemsg').textContent = String(err); });

function setGene(sym) {
  const msg = document.getElementById('genemsg');
  const gi = expr.index.get(sym) ?? expr.index.get(sym.toUpperCase());
  if (!sym) { uniforms.uMode.value = 0; expr.current = null; msg.textContent = ''; drawLegend(null); return; }
  if (gi === undefined) { msg.textContent = `"${sym}" is not in the exported genes`; return; }
  if (!points || positions.length / 3 !== expr.N) {
    msg.textContent = 'Expression only exists for the real embeddings (not the synthetic one)'; return;
  }
  const row = expr.data.subarray(gi * expr.N, (gi + 1) * expr.N);
  const attr = points.geometry.attributes.aValue;
  attr.array.set(row);
  attr.needsUpdate = true;
  uniforms.uMode.value = 1;
  expr.current = expr.meta.genes[gi].symbol;
  msg.textContent = '';
  drawLegend(expr.meta.genes[gi]);
}

function drawLegend(g) {
  const c = document.getElementById('legend'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!g) return;
  const lut = window.cs.lut;
  ctx.fillStyle = 'rgb(64,64,64)'; ctx.fillRect(0, 0, 16, 14);          // "not detected" swatch
  for (let i = 0; i < 256; i++) {                                         // colour bar, same LUT as the shader
    ctx.fillStyle = `rgb(${lut[4 * i]},${lut[4 * i + 1]},${lut[4 * i + 2]})`;
    ctx.fillRect(28 + i * 0.8, 0, 1, 14);
  }
  ctx.fillStyle = '#ddd'; ctx.font = '11px sans-serif';
  ctx.fillText('not det.', 0, 28);
  ctx.fillText('>0', 28, 28);
  ctx.fillText((g.hi / 2).toFixed(1), 28 + 102 - 8, 28);
  ctx.fillText('≥ ' + g.hi.toFixed(1), 28 + 205 - 20, 28);
  ctx.fillText('log-normalised expression', 0, 46);
}

document.getElementById('gene').addEventListener('change', (e) => setGene(e.target.value.trim()));

// ---- 10. Uncertainty (task T9) ----
const unc = { data: null };

panel.insertAdjacentHTML('beforeend', `
  <hr style="border-color:#333;margin:10px 0">
  <label for="unc">Fade uncertain cells: <span id="uncval">0</span>%</label>
  <input id="unc" type="range" min="0" max="100" value="0" style="width:100%">
  <div id="uncmsg" style="font-size:11px;color:#aaa">
    Uncertainty = share of a cell's 15 nearest neighbours that sit in another cluster.
    It measures agreement with my clustering, not biological truth.</div>`);

function applyUncertainty() {
  if (!unc.data || !points || unc.data.length !== positions.length / 3) return;
  const a = points.geometry.attributes.aUncertainty;
  a.array.set(unc.data);
  a.needsUpdate = true;
}

async function loadUncertainty() {
  if (!manifest) manifest = await loadManifest();
  unc.data = await loadU8('/data/' + manifest.uncertainty.file);
  const high = unc.data.filter((v) => v > 127).length / unc.data.length;
  document.getElementById('uncmsg').insertAdjacentHTML('afterbegin',
    `<b>${(high * 100).toFixed(1)}% of cells have uncertainty > 0.5.</b><br>`);
  applyUncertainty();
}
loadUncertainty().catch((err) => console.error(err));

document.getElementById('unc').addEventListener('input', (e) => {
  uniforms.uUncertainty.value = +e.target.value / 100;
  document.getElementById('uncval').textContent = e.target.value;
});

// ---- 11. Categorical legend + annotation (tasks T1, T8) ----
const ann = { data: null };

const legendBox = document.createElement('div');
legendBox.style.cssText = 'position:fixed;top:12px;left:12px;padding:10px;background:#1b1c20;' +
  'color:#ddd;font:13px sans-serif;border-radius:6px;width:270px;z-index:10;margin-top:28px';
legendBox.innerHTML = `<div style="margin-bottom:6px"><b>Cell types</b> (click to highlight)</div>
  <div id="cluslist" role="list"></div>
  <div style="font-size:11px;color:#aaa;margin-top:6px">(?) = I could not name this cluster confidently.
  Names come from the marker genes in annotation.json.</div>`;
document.body.appendChild(legendBox);

function css(p) {
  return `rgb(${Math.round(p.x * 255)},${Math.round(p.y * 255)},${Math.round(p.z * 255)})`;
}

function buildLegend() {
  if (!ann.data || !clusterCodes || !manifest) return;
  const cats = manifest.obs.cluster.categories;
  const counts = new Array(cats.length).fill(0);
  for (let i = 0; i < clusterCodes.length; i++) counts[clusterCodes[i]]++;

  const list = document.getElementById('cluslist');
  list.innerHTML = '';
  cats.forEach((label, code) => {
    const a = ann.data[label] ?? { name: 'cluster ' + label, confident: false, evidence: [] };
    const btn = document.createElement('button');
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-pressed', String(pinned === code));
    btn.title = a.evidence.length ? 'Evidence: ' + a.evidence.join(', ') : 'No evidence recorded';
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:3px 4px;margin:1px 0;' +
      'background:' + (pinned === code ? '#33353c' : 'transparent') + ';color:#ddd;border:1px solid ' +
      (pinned === code ? '#888' : 'transparent') + ';border-radius:4px;font:inherit;text-align:left;cursor:pointer';

    // swatch: clusters 0-7 are filled discs, cluster 8 is a ring (same shape as in the cloud)
    const colour = css(PALETTE[Math.min(code, 11)]);
    const swatch = code >= 8
      ? `<span style="width:8px;height:8px;border-radius:50%;flex:none;border:3px solid ${colour}"></span>`
      : `<span style="width:14px;height:14px;border-radius:50%;flex:none;background:${colour}"></span>`;

    btn.innerHTML = `${swatch}
      <span style="flex:1">${label}: ${a.name}${a.confident ? '' : ' (?)'}</span>
      <span style="color:#aaa">${counts[code]}</span>`;
    btn.addEventListener('click', () => setPinned(pinned === code ? -1 : code));
    list.appendChild(btn);
  });
}

async function loadAnnotation() {
  if (!manifest) manifest = await loadManifest();
  ann.data = await loadJSON('/data/' + manifest.annotation.file);
  buildLegend();
}
loadAnnotation().catch((err) => console.error(err));

// ---- 12. Dot plot (task T4) ----
const dp = { data: null, a: 4, b: 5 };
const NS = 'http://www.w3.org/2000/svg';
const ROWS = 14, X0 = 78, CW = 34, RH = 20, Y0 = 44, MAXR = 8;

const dpBox = document.createElement('div');
dpBox.style.cssText = 'position:fixed;bottom:50px;right:12px;padding:10px;background:#1b1c20;' +
  'color:#ddd;font:12px sans-serif;border-radius:6px;z-index:10';
dpBox.innerHTML = `
  <div style="margin-bottom:6px"><b>Which genes separate two clusters?</b></div>
  <label for="dpa">A</label> <select id="dpa"></select>
  <label for="dpb" style="margin-left:8px">B</label> <select id="dpb"></select>
  <svg id="dpsvg" width="420" height="${Y0 + ROWS * RH + 62}" role="img"
       aria-label="Dot plot of the genes that differ most between the two chosen clusters"></svg>`;
document.body.appendChild(dpBox);

function el(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}

function setPinned(code) {          // one place that changes the shared highlight
  pinned = code;
  uniforms.uHighlight.value = code;
  buildLegend();
  drawDot();
}

function drawDot() {
  const d = dp.data, lut = window.cs.lut;
  if (!d) return;
  if (!lut) { setTimeout(drawDot, 300); return; }          // colormap not loaded yet
  const svg = document.getElementById('dpsvg');
  svg.innerHTML = '';
  const C = d.counts.length, A = dp.a, B = dp.b;

  // the genes that differ most between A and B, A-high genes on top, B-high at the bottom
  const diff = (i) => d.mean[A][i] - d.mean[B][i];
  const order = d.genes.map((_, i) => i)
    .sort((i, j) => Math.abs(diff(j)) - Math.abs(diff(i))).slice(0, ROWS)
    .sort((i, j) => diff(j) - diff(i));

  // column backgrounds for A and B, outline for the pinned cluster
  [A, B].forEach((c, n) => svg.appendChild(el('rect',
    { x: X0 + c * CW, y: Y0 - 4, width: CW, height: order.length * RH + 4, fill: n ? '#2b2530' : '#25302b' })));
  svg.appendChild(el('text', { x: X0 + A * CW + CW / 2, y: 10, 'text-anchor': 'middle', fill: '#9fd' }, 'A'));
  svg.appendChild(el('text', { x: X0 + B * CW + CW / 2, y: 10, 'text-anchor': 'middle', fill: '#f9d' }, 'B'));

  // column headers: cluster number + its colour; click = highlight in 3D
  for (let c = 0; c < C; c++) {
    const g = el('g', { tabindex: 0, role: 'button', style: 'cursor:pointer',
      'aria-label': `highlight cluster ${c} ${(ann.data?.[c]?.name) ?? ''}` });
    g.appendChild(el('title', {}, `${c}: ${(ann.data?.[c]?.name) ?? ''} (${d.counts[c]} cells)`));

    // clusters 0-7: filled disc; cluster 8: ring (same shape as in the cloud and the legend)
    const colour = css(PALETTE[Math.min(c, 11)]);
    const isRing = c >= 8;
    g.appendChild(el('circle', { cx: X0 + c * CW + CW / 2, cy: 30, r: isRing ? 4 : 5,
      fill: isRing ? 'none' : colour,
      stroke: isRing ? (pinned === c ? '#fff' : colour) : (pinned === c ? '#fff' : 'none'),
      'stroke-width': isRing ? 3 : 2 }));

    g.appendChild(el('text', { x: X0 + c * CW + CW / 2, y: 22, 'text-anchor': 'middle',
      fill: pinned === c ? '#fff' : '#ddd' }, String(c)));
    const act = () => setPinned(pinned === c ? -1 : c);
    g.addEventListener('click', act);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    svg.appendChild(g);
  }

  // rows
  order.forEach((gi, r) => {
    const y = Y0 + r * RH + RH / 2;
    const sym = d.genes[gi];
    const maxMean = Math.max(...d.mean.map((row) => row[gi])) || 1;   // colour scale is per gene
    const lab = el('text', { x: X0 - 6, y: y + 4, 'text-anchor': 'end', fill: '#ddd', tabindex: 0,
      role: 'button', style: 'cursor:pointer', 'aria-label': `colour the cloud by ${sym}` }, sym);
    const act = () => { document.getElementById('gene').value = sym; setGene(sym); };
    lab.addEventListener('click', act);
    lab.addEventListener('keydown', (e) => { if (e.key === 'Enter') act(); });
    svg.appendChild(lab);

    for (let c = 0; c < C; c++) {
      const f = d.frac[c][gi], k = Math.round(255 * d.mean[c][gi] / maxMean);
      const dot = el('circle', { cx: X0 + c * CW + CW / 2, cy: y, r: MAXR * Math.sqrt(f),   // area ∝ fraction
        fill: `rgb(${lut[4 * k]},${lut[4 * k + 1]},${lut[4 * k + 2]})` });
      dot.appendChild(el('title', {},
        `${sym}, cluster ${c}: mean ${d.mean[c][gi].toFixed(2)}, ${(f * 100).toFixed(0)}% of cells express it`));
      svg.appendChild(dot);
    }
  });

  // legend: size and colour
  const ly = Y0 + order.length * RH + 14;
  svg.appendChild(el('text', { x: 0, y: ly + 4, fill: '#aaa' }, '% cells:'));
  [0.1, 0.5, 1].forEach((f, n) => {
    svg.appendChild(el('circle', { cx: 62 + n * 44, cy: ly, r: MAXR * Math.sqrt(f), fill: '#888' }));
    svg.appendChild(el('text', { x: 62 + n * 44 + 11, y: ly + 4, fill: '#aaa' }, `${f * 100}%`));
  });
  svg.appendChild(el('text', { x: 0, y: ly + 30, fill: '#aaa' }, 'mean:'));
  for (let i = 0; i < 64; i++) {
    const k = i * 4 + 2;
    svg.appendChild(el('rect', { x: 40 + i * 2.5, y: ly + 20, width: 3, height: 12,
      fill: `rgb(${lut[4 * k]},${lut[4 * k + 1]},${lut[4 * k + 2]})` }));
  }
  svg.appendChild(el('text', { x: 40, y: ly + 46, fill: '#aaa' }, '0'));
  svg.appendChild(el('text', { x: 200, y: ly + 46, fill: '#aaa' }, 'max of that gene (log-norm.)'));
}

function fillSelects() {
  const d = dp.data;
  ['dpa', 'dpb'].forEach((id) => {
    const s = document.getElementById(id);
    s.innerHTML = d.counts.map((_, c) => `<option value="${c}">${c}: ${ann.data?.[c]?.name ?? ''}</option>`).join('');
  });
  document.getElementById('dpa').value = dp.a;
  document.getElementById('dpb').value = dp.b;
}
document.getElementById('dpa').addEventListener('change', (e) => { dp.a = +e.target.value; drawDot(); });
document.getElementById('dpb').addEventListener('change', (e) => { dp.b = +e.target.value; drawDot(); });

async function loadDotplot() {
  if (!manifest) manifest = await loadManifest();
  if (!ann.data) ann.data = await loadJSON('/data/' + manifest.annotation.file);
  dp.data = await loadJSON('/data/' + manifest.dotplot.file);
  fillSelects();
  drawDot();
}
loadDotplot().catch((err) => console.error(err));

// ---- 13. Accessibility ----
document.head.insertAdjacentHTML('beforeend', `<style>
  button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible,
  [tabindex]:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }</style>`);

const tblBox = document.createElement('details');
tblBox.style.cssText = 'position:fixed;bottom:50px;left:12px;padding:8px;background:#1b1c20;color:#ddd;' +
  'font:12px sans-serif;border-radius:6px;z-index:10;max-width:440px;max-height:40vh;overflow:auto';
tblBox.innerHTML = '<summary>Table: clusters, cell types, counts, top markers</summary><table id="clustable" style="border-collapse:collapse"></table>';
document.body.appendChild(tblBox);

function buildTable() {
  const t = document.getElementById('clustable');
  if (!t) return;
  if (!ann.data || !clusterCodes || !markers || !manifest) {
    t.innerHTML = '<caption style="padding:4px 6px">Loading data…</caption>';
    return;
  }
  const cats = manifest.obs.cluster.categories;
  const counts = new Array(cats.length).fill(0);
  for (let i = 0; i < clusterCodes.length; i++) counts[clusterCodes[i]]++;
  const th = 'style="text-align:left;padding:2px 6px"';
  let h = `<caption style="text-align:left;padding:4px 6px">Clusters of ${clusterCodes.length} cells</caption>
    <thead><tr><th scope="col" ${th}>Cluster</th><th scope="col" ${th}>Cell type</th>
    <th scope="col" ${th}>Cells</th><th scope="col" ${th}>Top markers</th></tr></thead><tbody>`;
  cats.forEach((label, code) => {
    const a = ann.data[label] ?? { name: 'unnamed', confident: false };
    const top = (markers.markers[label] ?? []).slice(0, 5).map((m) => m.gene).join(', ');
    h += `<tr><th scope="row" ${th}>${label}</th>
      <td style="padding:2px 6px">${a.name}${a.confident ? '' : ' (not confident)'}</td>
      <td style="padding:2px 6px">${counts[code]}</td>
      <td style="padding:2px 6px">${top}</td></tr>`;
  });
  t.innerHTML = h + '</tbody>';
}
tblBox.addEventListener('toggle', buildTable);   // rebuild each time the table is opened