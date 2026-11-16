// Lagos in Layers. Viewer adapted from LAYRS: Amsterdam by Alex Barakov (MIT): same look, shader and controls,
// with buildings streamed in 5 km chunks because Lagos State has 2.2 million of them.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const SKY = '#ebe6dc', LAND = '#f6f2ea', WATER = '#9cc1c0', MAQUETTE = '#ece6dc';
const GROUP_COLORS = ['#d4380d', '#1f4e8c', '#d99a12', '#2e8b57', '#7b3fa0', '#00909a', '#8c5a2b', '#d6336c'];
const MAX_GROUPS = GROUP_COLORS.length;
const MODE = { period: 0, height: 1, layers: 3 };
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-NG');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function getBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  let b = await r.arrayBuffer();
  const u = new Uint8Array(b, 0, 2);
  if (u[0] === 0x1f && u[1] === 0x8b) b = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return b;
}

const [config, layerData] = await Promise.all([fetch('data/config.json').then(r => r.json()), fetch('data/layers.json').then(r => r.json())]);
const layers = layerData.layers, CATS = layerData.cats;
const periods = config.periods;
// Editable names, labels and colours live in data/periods.json
try {
  const pe = await fetch('data/periods.json').then(r => r.ok ? r.json() : null);
  pe?.periods?.forEach((p, i) => { if (!periods[i]) return; periods[i].label = p.label ?? periods[i].label; periods[i].era = p.name ?? periods[i].era; periods[i].color = p.color ?? periods[i].color; if (p.buildings != null) periods[i].n = p.buildings; });
} catch (e) { /* keep the built-in values */ }
const PAL = [...periods.map(p => p.color), ...Array(7 - periods.length).fill(MAQUETTE), MAQUETTE];
const [LON0, LAT0] = config.origin;
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : '';
const toLL = (x, z) => [LON0 + x / config.kx, LAT0 - z / config.ky];

// ---------- Scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(SKY);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 5, 400000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
// Drag moves the map like any web map and the wheel zooms towards the pointer.
// Turning, tilting and the 360° spin live on the on-screen buttons only.
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
controls.enableRotate = false;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
controls.keyPanSpeed = 60;
controls.listenToKeyEvents(window);
controls.rotateSpeed = 0.6;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 40;
controls.maxDistance = 180000;
controls.zoomSpeed = 1.4;

function setView(v) {
  const az = THREE.MathUtils.degToRad(v.azimuth), el = THREE.MathUtils.degToRad(v.elevation), d = v.dist;
  controls.target.set(v.x, 0, v.z);
  camera.position.set(v.x + d * Math.cos(el) * Math.sin(az), d * Math.sin(el), v.z + d * Math.cos(el) * Math.cos(az));
  controls.update();
}
config.home.azimuth = 0; config.state.azimuth = 0; // north up: Eti-Osa and the coast at the bottom of the screen
setView(config.home);

// ---------- Ground ----------
async function loadMesh(url, color, y, order) {
  const b = await getBuf(url);
  const [nP, nI] = new Uint32Array(b, 0, 2);
  const P = new Float32Array(b, 8, nP * 2), I = new Uint32Array(b, 8 + nP * 8, nI);
  const pos = new Float32Array(nP * 3);
  for (let i = 0; i < nP; i++) { pos[3 * i] = P[2 * i]; pos[3 * i + 1] = 0; pos[3 * i + 2] = P[2 * i + 1]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }));
  m.position.y = y; m.renderOrder = order; m.frustumCulled = false;
  return m;
}
const flat = new THREE.Group();
scene.add(flat);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(900000, 900000), new THREE.MeshBasicMaterial({ color: WATER, depthWrite: false }));
sea.rotation.x = -Math.PI / 2; sea.renderOrder = -4; sea.position.set(config.home.x, -0.5, config.home.z);
flat.add(sea);
const [land, inland] = await Promise.all([loadMesh('data/land.wasm', LAND, -0.3, -3), loadMesh('data/water.wasm', WATER, -0.2, -2)]);
flat.add(land, inland);
{
  const pts = [];
  for (const line of config.lines) for (let i = 1; i < line.length; i++) pts.push(line[i - 1][0], 0, line[i - 1][1], line[i][0], 0, line[i][1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d3cab9', depthWrite: false }));
  l.renderOrder = -1; l.frustumCulled = false; flat.add(l);
}

// ---------- Uniforms and shader (after LAYRS: Amsterdam) ----------
const col = c => new THREE.Color(c);
// Height mode: floors estimated from building height (about 3.2 m a floor), in classes from low (blue) to tall (red).
const FLOORS = [
  { label: '1–2', color: '#14348a', n: 2106835 }, { label: '3', color: '#2d5fa8', n: 53550 }, { label: '4', color: '#6a91c6', n: 9792 },
  { label: '5', color: '#a9bfdc', n: 3142 }, { label: '6', color: '#e9e6e2', n: 1359 }, { label: '7', color: '#e8bfb3', n: 534 },
  { label: '8', color: '#cc7f66', n: 367 }, { label: '9–12', color: '#a93d2a', n: 578 }, { label: '13 and more', color: '#7f1010', n: 326 },
];
const floorClass = h => { const f = Math.max(1, Math.round(h / 3.2)); return f <= 2 ? 0 : f <= 8 ? f - 2 : f <= 12 ? 7 : 8; };
const uniforms = {
  uYear: { value: config.yearMax }, uYearFrom: { value: config.yearMin - 10 },
  uMode: { value: MODE.period },
  uFloorCol: { value: FLOORS.map(f => col(f.color)) }, uFloorMask: { value: FLOORS.map(() => 1) },
  uPalette: { value: PAL.map(col) }, uMask: { value: PAL.map((_, i) => i < periods.length ? 1 : 0) },
  uNow: { value: 0 }, uPlaying: { value: 0 }, uRise: { value: 0.01 }, uLayerAt: { value: -10 },
  uGroupBit: { value: Array(MAX_GROUPS).fill(-1) }, uGroupColor: { value: GROUP_COLORS.map(col) },
  uMaquette: { value: col(MAQUETTE) },
  uHover: { value: -1 }, uSelected: { value: -1 },
  uFocus: { value: Array(64).fill(-1) }, uFocusN: { value: 0 }, uFocusColor: { value: col('#d4380d') },
  uFogColor: { value: col(SKY) }, uFog: { value: new THREE.Vector2(9000, 26000) },
};
const VERT = /* glsl */`
  in float aYear; in float aInfo; in float aGid; in float aLay; in float aH;
  uniform float uYear, uYearFrom, uMode, uHover, uSelected, uNow, uBorn, uPlaying, uRise, uLayerAt;
  uniform vec3 uPalette[8]; uniform float uMask[8]; uniform vec3 uFloorCol[9]; uniform float uFloorMask[9];
  uniform int uGroupBit[${MAX_GROUPS}]; uniform vec3 uGroupColor[${MAX_GROUPS}]; uniform vec3 uMaquette;
  uniform float uFocus[64]; uniform int uFocusN; uniform vec3 uFocusColor;
  out vec3 vColor; out vec3 vWorld; out float vGid;
  int floorClass(float h) {
    float f = max(1.0, floor(h / 3.2 + 0.5));
    return f <= 2.0 ? 0 : f <= 8.0 ? int(f) - 2 : f <= 12.0 ? 7 : 8;
  }
  bool hasBit(float v, int bit) { return ((int(v + 0.5) >> bit) & 1) == 1; }
  void main() {
    int info = int(aInfo + 0.5); int period = info % 16;
    vGid = aGid;
    int fc = floorClass(aH / 10.0);
    float vis = period == 7 ? 0.0 : (uMode < 0.5 ? uMask[period] : uMode < 1.5 ? uFloorMask[fc] : 1.0);
    float g = period == 7 ? step(${config.yearMax - 0.5}, uYear) : clamp((uYear - aYear + 1.0) / uRise, 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    if (g <= 0.003 || vis <= 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 p = position;
    float seed = fract(sin(aGid * 12.9898) * 43758.5453);
    float arrive = clamp((uNow - uBorn) / 0.9 - seed * 0.35, 0.0, 1.0);
    float fly = 1.0 - arrive;
    if (uPlaying > 0.5) fly = max(fly, 1.0 - g);
    if (fly > 0.0) {
      float e = fly * fly * fly; float ang = seed * 6.2831853;
      p += vec3(cos(ang), 0.0, sin(ang)) * (180.0 + 160.0 * fract(seed * 7.13)) * e;
      p.y += (260.0 + 240.0 * fract(seed * 3.71)) * e;
    }
    vec3 c;
    if (uMode < 0.5) c = uPalette[period];
    else if (uMode < 1.5) c = uFloorCol[fc];
    else {
      c = uMaquette;
      for (int k = 0; k < ${MAX_GROUPS}; k++) {
        if (uGroupBit[k] >= 0 && hasBit(aLay, uGroupBit[k])) {
          c = uGroupColor[k];
          float q = clamp((uNow - uLayerAt) / 0.55 - seed * 0.6, 0.0, 1.0) - 1.0;
          p.y *= 1.0 + 2.70158 * q * q * q + 1.70158 * q * q;
          break;
        }
      }
    }
    if (uFocusN > 0) {
      c = uMaquette;
      for (int k = 0; k < 64; k++) { if (k >= uFocusN) break; if (abs(aGid - uFocus[k]) < 0.5) { c = uFocusColor; p.y *= 1.0; break; } }
    }
    if (aYear <= uYearFrom) c = mix(c, uMaquette, 0.8);
    if (vGid == uHover || vGid == uSelected) c = mix(c, vec3(0.0), 0.35);
    vColor = c;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uFogColor; uniform vec2 uFog;
  in vec3 vColor; in vec3 vWorld; in float vGid;
  out vec4 outColor;
  void main() {
    #ifdef PICK
      float id = vGid + 1.0;
      outColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      // Low afternoon sun from the south-west, a soft sky from above.
      float sun = max(dot(n, normalize(vec3(-0.55, 0.55, 0.62))), 0.0);
      float light = abs(n.y) > 0.9 ? 1.04 : 0.66 + 0.34 * sun;
      float foot = mix(0.82, 1.0, clamp(vWorld.y / 12.0, 0.0, 1.0));
      vec3 c = vColor * light * foot;
      float d = length(vWorld - cameraPosition);
      c = mix(c, uFogColor, smoothstep(uFog.x, uFog.y, d));
      outColor = vec4(c, 1.0);
    #endif
  }`;
function makeMaterial(pick, born) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...uniforms, uBorn: born }, vertexShader: VERT, fragmentShader: FRAG,
    defines: pick ? { PICK: 1 } : {}, side: THREE.DoubleSide });
}

// ---------- Overview: the whole state as 440 m columns ----------
const ovBuf = await getBuf('data/overview.wasm');
const nCell = new Uint32Array(ovBuf, 0, 1)[0];
const cells = new Float32Array(ovBuf, 4, nCell * 11);
const ovPos = new Float32Array(nCell * 8 * 3), ovCol = new Float32Array(nCell * 8 * 3);
const ovIdx = new Uint32Array(nCell * 30);
for (let c = 0; c < nCell; c++) {
  const b = c * 8, o = c * 30;
  // top 4..7, bottom 0..3; sides and top only
  const q = [4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  for (let k = 0; k < 30; k++) ovIdx[o + k] = b + q[k];
}
const ovGeo = new THREE.BufferGeometry();
ovGeo.setAttribute('position', new THREE.BufferAttribute(ovPos, 3));
ovGeo.setAttribute('color', new THREE.BufferAttribute(ovCol, 3));
ovGeo.setIndex(new THREE.BufferAttribute(ovIdx, 1));
const ovMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3, uniforms: { uFogColor: uniforms.uFogColor, uFog: uniforms.uFog },
  vertexShader: `in vec3 color; out vec3 vColor; out vec3 vWorld; void main(){ vColor = color; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: FRAG.replace('in float vGid;', ''), side: THREE.DoubleSide,
});
const overview = new THREE.Mesh(ovGeo, ovMat);
overview.frustumCulled = false;
scene.add(overview);
const palRGB = PAL.map(c => col(c));
const floorRGB = FLOORS.map(f => col(f.color));
function heightRampJS(h) { const c = floorRGB[floorClass(h)]; return [c.r, c.g, c.b]; }
function periodShare(i, Y) {
  if (i === 7) return Y >= config.yearMax ? 1 : 0;
  const p = periods[i];
  if (!p) return 0;
  if (Y >= p.to) return 1;
  if (Y < (i === 0 ? config.yearMin : p.from)) return 0;
  const from = i === 0 ? config.yearMin : p.from;
  return (Y - from + 1) / (p.to - from + 1);
}
function updateOverview() {
  const Y = uniforms.uYear.value, mode = uniforms.uMode.value, mask = uniforms.uMask.value;
  const share = PAL.map((_, i) => periodShare(i, Y) * (mode === MODE.period ? mask[i] : 1)); share[7] = 0;
  const hidden = loadedBoxes();
  const hw = 200, tx = controls.target.x, tz = controls.target.z, dd = camera.position.distanceTo(controls.target);
  const near = false, nearR = 0;
  overview.visible = dd > 26000;
  for (let c = 0; c < nCell; c++) {
    const r = c * 11, x = cells[r], z = cells[r + 1];
    let n = 0, best = -1, bestN = 0;
    for (let i = 0; i < 8; i++) { const v = cells[r + 2 + i] * share[i]; n += v; if (v > bestN && i < 7) { bestN = v; best = i; } }
    let h = n > 0.5 ? 4 + Math.sqrt(n) * 7 : 0;
    if (near && Math.hypot(x - tx, z - tz) < nearR) h = 0;
    else for (const bx of hidden) if (x > bx[0] && x < bx[2] && z > bx[1] && z < bx[3]) { h = 0; break; }
    const rgb = mode === MODE.height ? heightRampJS(cells[r + 10]) : mode === MODE.layers || best < 0 ? [palRGB[7].r, palRGB[7].g, palRGB[7].b] : [palRGB[best].r, palRGB[best].g, palRGB[best].b];
    const b = c * 24;
    const xs = [x - hw, x + hw, x + hw, x - hw], zs = [z - hw, z - hw, z + hw, z + hw];
    for (let k = 0; k < 8; k++) {
      ovPos[b + 3 * k] = xs[k % 4]; ovPos[b + 3 * k + 1] = k < 4 ? 0 : h; ovPos[b + 3 * k + 2] = zs[k % 4];
      ovCol[b + 3 * k] = rgb[0]; ovCol[b + 3 * k + 1] = rgb[1]; ovCol[b + 3 * k + 2] = rgb[2];
    }
  }
  ovGeo.attributes.position.needsUpdate = true; ovGeo.attributes.color.needsUpdate = true;
}

// ---------- Chunks of buildings, streamed around the view ----------
const chunks = new Map();  // file -> {state, mesh, data}
const al4 = n => (n + 3) & ~3;
function parseChunk(buf) {
  const dv = new DataView(buf);
  const nB = dv.getUint32(0, true), nV = dv.getUint32(4, true), nT = dv.getUint32(8, true), ox = dv.getFloat32(12, true), oz = dv.getFloat32(16, true);
  let o = 20;
  const gid = new Uint32Array(buf, o, nB); o += 4 * nB;
  const year = new Int16Array(buf, o, nB); o += al4(2 * nB);
  const hdm = new Uint16Array(buf, o, nB); o += al4(2 * nB);
  const area = new Uint16Array(buf, o, nB); o += al4(2 * nB);
  const lay = new Uint32Array(buf, o, nB); o += 4 * nB;
  const period = new Uint8Array(buf, o, nB); o += al4(nB);
  const flag = new Uint8Array(buf, o, nB); o += al4(nB);
  const lga = new Uint8Array(buf, o, nB); o += al4(nB);
  const src = new Uint8Array(buf, o, nB); o += al4(nB);
  const nv = new Uint8Array(buf, o, nB); o += al4(nB);
  const V = new Int16Array(buf, o, 2 * nV); o += al4(4 * nV);
  const T = new Uint8Array(buf, o, 3 * nT);
  const NV = 2 * nV;
  const pos = new Float32Array(NV * 3), aYear = new Int16Array(NV), aInfo = new Uint8Array(NV), aGid = new Float32Array(NV),
    aLay = new Float32Array(NV), aH = new Uint16Array(NV), idx = new Uint32Array(6 * nV + 3 * nT);
  const vstart = new Uint32Array(nB);
  let vi = 0, ti = 0, vb = 0, ii = 0;
  for (let b = 0; b < nB; b++) {
    const n = nv[b], h = hdm[b] / 10, info = period[b] + 16 * flag[b];
    vstart[b] = vi;
    for (let k = 0; k < n; k++) {
      const x = V[2 * (vi + k)] / 4, z = V[2 * (vi + k) + 1] / 4;
      const lo = vb + k, hi = vb + n + k;
      pos[3 * lo] = x; pos[3 * lo + 2] = z; pos[3 * hi] = x; pos[3 * hi + 1] = h; pos[3 * hi + 2] = z;
      for (const v of [lo, hi]) { aYear[v] = year[b]; aInfo[v] = info; aGid[v] = gid[b]; aLay[v] = lay[b]; aH[v] = hdm[b]; }
      const k2 = (k + 1) % n;
      idx[ii++] = vb + k; idx[ii++] = vb + k2; idx[ii++] = vb + n + k2;
      idx[ii++] = vb + k; idx[ii++] = vb + n + k2; idx[ii++] = vb + n + k;
    }
    for (let t = 0; t < 3 * (n - 2); t++) idx[ii++] = vb + n + T[ti + t];
    ti += 3 * (n - 2); vi += n; vb += 2 * n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aYear', new THREE.BufferAttribute(aYear, 1));
  g.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 1));
  g.setAttribute('aGid', new THREE.BufferAttribute(aGid, 1));
  g.setAttribute('aLay', new THREE.BufferAttribute(aLay, 1));
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, ii), 1));
  g.computeBoundingSphere();
  const born = { value: performance.now() / 1000 };
  const mesh = new THREE.Mesh(g, makeMaterial(false, born));
  mesh.userData = { draw: mesh.material, pick: makeMaterial(true, born) };
  mesh.position.set(ox, 0, oz);
  return { mesh, data: { nB, gid, year, hdm, area, lay, period, flag, lga, src, nv, V, vstart, ox, oz } };
}
let inflight = 0, lastWant = [];
function wantedChunks() {
  const t = controls.target, d = camera.position.distanceTo(t);
  if (d > 32000) return [];
  const R = THREE.MathUtils.clamp(d * 0.95, 2000, 9000);
  const out = [];
  for (const c of config.chunks) {
    const [x0, z0, x1, z1] = c.b;
    const dx = Math.max(x0 - t.x, 0, t.x - x1), dz = Math.max(z0 - t.z, 0, t.z - z1);
    const dd = Math.hypot(dx, dz);
    if (dd < R) out.push({ c, dd });
  }
  out.sort((a, b) => a.dd - b.dd);
  return out.slice(0, 10).map(o => o.c);
}
function loadedBoxes() {
  const out = [];
  for (const c of config.chunks) { const s = chunks.get(c.f); if (s && s.state === 'ready' && s.mesh.visible) out.push(c.b); }
  return out;
}
function streamChunks() {
  const want = wantedChunks();
  lastWant = want;
  const wantSet = new Set(want.map(c => c.f));
  for (const [f, s] of chunks) if (s.state === 'ready') s.mesh.visible = wantSet.has(f);
  for (const c of want) {
    if (chunks.has(c.f) || inflight >= 2) continue;
    chunks.set(c.f, { state: 'loading' });
    inflight++;
    getBuf('data/chunks/' + c.f).then(buf => new Promise(res => requestAnimationFrame(() => res(buf)))).then(buf => {
      const { mesh, data } = parseChunk(buf);
      scene.add(mesh);
      chunks.set(c.f, { state: 'ready', mesh, data, used: performance.now() });
      mesh.visible = lastWant.some(w => w.f === c.f);
    }).catch(e => { console.error(e); chunks.delete(c.f); })
      .finally(() => { inflight--; updateOverview(); evict(); streamChunks(); });
  }
  updateStatus();
}
function evict() {
  const ready = [...chunks.entries()].filter(([, s]) => s.state === 'ready' && !s.mesh.visible);
  if (chunks.size <= 16) return;
  ready.sort((a, b) => a[1].used - b[1].used);
  for (const [f, s] of ready.slice(0, chunks.size - 16)) {
    scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.userData.draw.dispose(); s.mesh.userData.pick.dispose(); chunks.delete(f);
  }
}
function updateStatus() {
  const st = $('status');
  const d = camera.position.distanceTo(controls.target);
  if (d > 32000) { st.textContent = 'State view: each column is a 440 m block. Zoom in to see the buildings.'; st.hidden = false; return; }
  const loading = lastWant.some(c => !chunks.get(c.f) || chunks.get(c.f).state !== 'ready');
  st.hidden = !loading;
  st.textContent = 'Loading buildings…';
}
let streamTimer = 0, controlsMoving = false, moveTimer = 0;
controls.addEventListener('change', () => {
  controlsMoving = true; clearTimeout(moveTimer); moveTimer = setTimeout(() => controlsMoving = false, 200);
  clearTimeout(streamTimer);
  streamTimer = setTimeout(() => { streamChunks(); updateOverview(); }, 160);
});

// ---------- Place names, flat on the ground ----------
const labelGroup = new THREE.Group();
scene.add(labelGroup);
const LABEL_PX = 64, labelPlane = new THREE.PlaneGeometry(1, 1);
const labels = config.labels.map(L => ({ ...L, mesh: null }));
function textureFor(L) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `${L.t === 0 ? '700' : '500'} ${LABEL_PX * 0.62}px "IBM Plex Sans", sans-serif`;
  ctx.font = font;
  const text = L.n;
  c.width = Math.ceil(ctx.measureText(text).width * (L.t === 0 ? 1.12 : 1) + LABEL_PX * 0.4); c.height = LABEL_PX;
  ctx.font = font; ctx.textBaseline = 'middle';
  if (L.t === 0) ctx.letterSpacing = '4px';
  ctx.lineWidth = LABEL_PX * 0.12; ctx.strokeStyle = 'rgba(246,242,234,0.9)'; ctx.fillStyle = L.t === 0 ? '#2b2620' : '#5a544a';
  ctx.strokeText(text, LABEL_PX * 0.2, LABEL_PX / 2); ctx.fillText(text, LABEL_PX * 0.2, LABEL_PX / 2);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.userData = { aspect: c.width / c.height };
  return t;
}
function updateLabels(dist) {
  if (!document.fonts.check('500 16px "IBM Plex Sans"')) return;
  const taken = [];
  const t = controls.target;
  for (const L of labels) {
    let show, h;
    if (L.t === 0) { show = dist > 9000; h = THREE.MathUtils.clamp(dist * 0.016, 120, 2200); }
    else if (L.t === 1) { show = dist < 22000 && dist > 700; h = THREE.MathUtils.clamp(dist * 0.012, 12, 260); }
    else { show = dist < 9000 && dist > 500; h = THREE.MathUtils.clamp(dist * 0.01, 10, 120); }
    if (show) show = Math.hypot(L.x - t.x, L.z - t.z) < dist * 2.2;
    if (show) { for (const q of taken) if (Math.hypot(q.x - L.x, q.z - L.z) < (q.h + h) * 3) { show = false; break; } }
    if (show) taken.push({ x: L.x, z: L.z, h });
    if (show && !L.mesh) {
      L.mesh = new THREE.Mesh(labelPlane, new THREE.MeshBasicMaterial({ map: textureFor(L), transparent: true, depthWrite: false }));
      L.mesh.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      L.mesh.position.set(L.x, 0.6, L.z); L.mesh.renderOrder = 2;
      labelGroup.add(L.mesh);
    }
    if (L.mesh) {
      L.mesh.visible = show;
      if (show) { L.mesh.scale.set(h * L.mesh.material.map.userData.aspect, h, 1); L.mesh.rotation.set(-Math.PI / 2, controlsAzimuth(), 0, 'YXZ'); }
    }
  }
}
const controlsAzimuth = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);

// ---------- Story pins ----------
const pins = new THREE.Group();
scene.add(pins);
const pinMat = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true });
const pinHeadMat = new THREE.MeshBasicMaterial({ color: '#f5b800', depthTest: false, transparent: true });
function showPins(items) {
  pins.clear();
  for (const it of items || []) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), pinMat), head = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), pinHeadMat);
    stem.renderOrder = head.renderOrder = 30;
    g.add(stem, head); g.position.set(it.x, 0, it.z); g.userData = { stem, head };
    pins.add(g);
  }
}
function scalePins(dist) {
  const s = THREE.MathUtils.clamp(dist * 0.006, 2, 400);
  for (const g of pins.children) {
    g.userData.stem.scale.set(s * 0.12, s * 6, s * 0.12); g.userData.stem.position.y = s * 3;
    g.userData.head.scale.setScalar(s * 0.9); g.userData.head.position.y = s * 6.4;
  }
}

// ---------- Picking ----------
const pickTarget = new THREE.WebGLRenderTarget(1, 1);
const pickPixel = new Uint8Array(4);
function pick(x, y) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camera.setViewOffset(w, h, x, y, 1, 1);
  const ms = [...chunks.values()].filter(s => s.state === 'ready' && s.mesh.visible).map(s => s.mesh);
  for (const m of ms) m.material = m.userData.pick;
  flat.visible = labelGroup.visible = overview.visible = pins.visible = false;
  renderer.setRenderTarget(pickTarget); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
  renderer.setRenderTarget(null); renderer.setClearColor(SKY, 1);
  flat.visible = labelGroup.visible = pins.visible = true; overview.visible = camera.position.distanceTo(controls.target) > 26000;
  for (const m of ms) m.material = m.userData.draw;
  applyOffset();
  return pickPixel[0] + pickPixel[1] * 256 + pickPixel[2] * 65536 - 1;
}
function building(gid) {
  for (const s of chunks.values()) {
    if (s.state !== 'ready') continue;
    const a = s.data.gid; let lo = 0, hi = s.data.nB - 1;
    if (gid < a[0] || gid > a[hi]) continue;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (a[m] === gid) {
        const d = s.data, vi = d.vstart[m], n = d.nv[m];
        let cx = 0, cz = 0;
        for (let k = 0; k < n; k++) { cx += d.V[2 * (vi + k)] / 4; cz += d.V[2 * (vi + k) + 1] / 4; }
        const x = d.ox + cx / n, z = d.oz + cz / n;
        return { gid, year: d.year[m], h: d.hdm[m] / 10, area: d.area[m], lay: d.lay[m], period: d.period[m], flag: d.flag[m], lga: d.lga[m], src: d.src[m], x, z };
      }
      if (a[m] < gid) lo = m + 1; else hi = m - 1;
    }
  }
  return null;
}

// ---------- Building card ----------
const SRC = ['OpenStreetMap', 'Google Open Buildings', 'Microsoft ML Buildings'];
let PHOTOS = {}, WIKI = {};
fetch('data/photos.json').then(r => r.ok ? r.json() : {}).then(d => {
  PHOTOS = d.photos || {}; WIKI = d.wiki || {};
  if (d.places && d.places.length) {
    layers.push({ id: 'archive', name: 'Lagos in old photographs', kind: 'stories', groups: [],
      intro: 'Archive photographs of Lagos from 1910 to 1929, placed where they were taken. Pins are approximate.',
      items: d.places.map(p => { const x = (p.lon - LON0) * config.kx, z = -(p.lat - LAT0) * config.ky; return { ...p, x, z, gid: -1 }; }) });
    renderPanel(); buildWalks();
  }
}).catch(() => {});
let slides = [], slide = 0, MLY = {};
fetch('data/mly.json').then(r => r.ok ? r.json() : {}).then(d => { MLY = d; }).catch(() => {});
const packCache = new Map(), urlCache = new Map();
function srcOf(p) {
  if (!p.mly) return Promise.resolve(p.src);
  const r = p.mly, key = r.id;
  if (urlCache.has(key)) return Promise.resolve(urlCache.get(key));
  if (!packCache.has(r.p)) packCache.set(r.p, fetch('data/photos/' + r.p + '.wasm').then(x => x.arrayBuffer()));
  return packCache.get(r.p).then(buf => { const u = URL.createObjectURL(new Blob([buf.slice(r.o, r.o + r.l)], { type: 'image/jpeg' })); urlCache.set(key, u); return u; });
}
function photoList(gid) {
  const out = [];
  const r = MLY[gid];
  if (r) out.push({ mly: r, year: r.y, alt: 'Street-level photo', credit: `Street photo looking towards this building · ${r.by || "Mapillary contributor"} via Mapillary, CC BY-SA 4.0`, page: `https://www.mapillary.com/app/?pKey=${r.id}` });
  return out.concat(PHOTOS[gid] || []);
}
function hydratePhoto() {
  const f = card.querySelector('.photo'); if (!f || !slides.length) return;
  const img = f.querySelector('img'), want = slides[slide];
  srcOf(want).then(u => { if (slides[slide] === want) img.src = u; }).catch(() => f.classList.add('failed'));
}
function photosHtml(list, pinned) {
  slides = list; slide = 0;
  const p = list[0];
  const nav = pinned && list.length > 1;
  return `<figure class="photo"><div class="frame"><img src="${p.mly ? '' : esc(p.src)}" alt="${esc(p.alt || 'Street photo looking towards this building')}" loading="lazy"><span class="year">${esc(p.year)}</span>
    ${nav ? '<button class="prev" aria-label="Earlier photo">‹</button><button class="next" aria-label="Later photo">›</button>' : ''}</div>
    ${nav ? `<div class="years">${list.map((q, i) => `<button data-i="${i}" ${i === 0 ? 'aria-current="true"' : ''}>${esc(q.year)}</button>`).join('')}</div>` : ''}
    <figcaption>${pinned ? creditOf(p) : esc(p.credit || '')}</figcaption></figure>`;
}
const creditOf = p => `${esc(p.credit || '')}${p.page ? ` · <a href="${esc(p.page)}" target="_blank" rel="noopener">source</a>` : ''}`;
function showSlide(i) {
  slide = (i + slides.length) % slides.length; const p = slides[slide];
  const f = card.querySelector('.photo'); if (!f) return;
  hydratePhoto(); f.querySelector('.year').textContent = p.year;
  f.querySelector('figcaption').innerHTML = creditOf(p);
  f.querySelectorAll('.years button').forEach((b, k) => k === slide ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
}
function wireSlides() {
  const f = card.querySelector('.photo'); if (!f) return;
  f.querySelector('.prev')?.addEventListener('click', () => showSlide(slide - 1));
  f.querySelector('.next')?.addEventListener('click', () => showSlide(slide + 1));
  f.querySelectorAll('.years button').forEach(b => b.addEventListener('click', () => showSlide(+b.dataset.i)));
}
const storyByGid = new Map();
layers.forEach((L, li) => (L.items || []).forEach(it => { if (it.gid >= 0) storyByGid.set(it.gid, { ...it, layer: L, li }); }));
function yearText(b, st) {
  const p = periods[b.period];
  if (b.flag === 3) return { big: st?.year?.replace(' / ', '/') || String(b.year), note: 'Documented year' };
  if (b.flag === 2) return { big: 'Not dated', note: 'Outside the 2,176,483 housing-stock total' };
  if (b.flag === 0) return { big: String(b.year), note: 'First seen in satellite imagery in ' + b.year };
  return { big: p ? p.label : '–', note: p ? 'Placed in the period ' + p.label : '' };
}
const DATE_WHY = [
  'Year from Google Open Buildings 2.5D Temporal: the first yearly map, 2016–2023, in which this footprint is clearly present.',
  'Every building is ranked by how early satellites show it or its surrounding block built up (GHSL from 1975, WSF Evolution from 1985, Google from 2016); the oldest 325,000 fill “Before 1976”, the next 457,119 fill 1976–2000, and so on, so each period holds exactly the housing stock in the 2025 State of Lagos Housing Market Report.',
  'The least visible footprints in the satellite record, left out so the total matches the report’s 2,176,483.',
  'Taken from the documented history of the building, which wins over the satellite estimate.'];
// Two ways to see a place today: open it in Google Maps, or drop to street level inside the model.
const PIN_I = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.5" r="1.8"/></svg>';
const PANO_I = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="8" cy="8" rx="6.5" ry="3.2"/><circle cx="8" cy="8" r="1.4"/></svg>';
function goHtml(lat, lon, t, flat) {
  const gm = `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `<div class="go${flat ? ' flat' : ''}"><a href="${gm}" target="_blank" rel="noopener">${PIN_I}Google Maps</a><button type="button" data-pano="${esc(JSON.stringify(t))}">${PANO_I}Panorama</button></div>`;
}
function cardHtml(gid, pinned, place = null) {
  const b = building(gid);
  if (!b) return '';
  const [lon, lat] = toLL(b.x, b.z);
  const p = b.period < 7 ? periods[b.period] : null;
  const st = storyByGid.get(gid);
  const yt = yearText(b, st);
  const lays = layers.map((L, i) => ({ L, i })).filter(({ L }) => L.groups.some(g => (b.lay >> g.bit) & 1));
  const storeys = Math.max(1, Math.round(b.h / 3.2));
  let html = pinned ? '<button class="card-close" aria-label="Close">×</button>' : '';
  const ph = photoList(gid), wk = WIKI[gid];
  if (ph && ph.length) html += photosHtml(ph, pinned);
  const title = st ? st.name.replace(' (approximate pin)', '') : wk ? wk.title : place ? place.name : '';
  if (pinned) html += goHtml(lat, lon, { x: b.x, z: b.z, h: b.h, area: b.area, gid, name: title || 'This building' }, ph && ph.length);
  html += `<div class="card-head">${title ? `<h2>${esc(title)}</h2>` : ''}${place && !st ? `<p class="place-kind">${esc(cap(place.kind))}</p>` : ''}
    <div class="when"><span class="y${b.flag === 1 ? ' approx' : ''}"${yt.big.length > 9 ? ' style="font-size:22px"' : ''}>${yt.big}</span>${p ? `<span class="period"><i style="background:${p.color}"></i>${esc(p.era)}</span>` : ''}</div></div>`;
  if (st) html += `<section class="story-sec"><h3>${esc(st.layer.name)}${st.year ? ' · ' + esc(st.year) : ''}</h3><p>${esc(st.text)}</p><a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.source)}</a></section>`;
  if (wk && wk.extract && (!st || pinned)) html += `<section><h3>From Wikipedia</h3><p class="extract">${esc(pinned ? wk.extract : wk.extract.split('. ')[0] + '.')}</p>${pinned ? `<a href="${esc(wk.url)}" target="_blank" rel="noopener">${esc(wk.title)} on Wikipedia</a>` : ''}</section>`;
  if (lays.length) html += `<section><h3>In layers</h3><ul class="chips">${lays.map(({ L, i }) => {
    const g = L.groups.find(g => (b.lay >> g.bit) & 1);
    return `<li><i style="background:${GROUP_COLORS[i % MAX_GROUPS]}"></i><span><b>${esc(L.name)}</b>${L.groups.length > 1 ? ' ' + esc(g.label) : ''}</span></li>`;
  }).join('')}</ul></section>`;
  html += `<section><dl>
    <dt>Height</dt><dd>${b.h.toFixed(1)} m</dd>
    <dt>Storeys</dt><dd>≈ ${storeys}</dd>
    <dt>Footprint</dt><dd>${fmt(b.area)} m²</dd>
    <dt>LGA</dt><dd>${esc(config.lgas[b.lga])}</dd>
    <dt>Outline</dt><dd>${SRC[b.src]}</dd></dl></section>`;
  html += `<section><p class="why">${yt.note}. ${DATE_WHY[b.flag]}</p></section>`;
  if (!pinned) html += '<p class="hint">Click to keep this card open</p>';
  return html;
}
const card = $('card');
let pinnedGid = -1, hoverGid = -1, storyTimer = 0, cardReturn = null;
// Cards that open on their own move focus only for keyboard users, so mouse users aren't yanked around.
let kbd = false;
addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') kbd = true; }, true);
addEventListener('pointerdown', () => { kbd = false; }, true);
// Re-rendering a card replaces its buttons; put focus back on the same control (or the first one) afterwards.
function keepFocus(root, render) {
  const a = document.activeElement, had = root.contains(a);
  const key = had ? Object.entries(a.dataset || {}).map(([k, v]) => `[data-${k}="${v}"]`).join('') : '';
  render();
  if (had) ((key && root.querySelector(key + ':not(:disabled)')) || root.querySelector('button:not(:disabled), input'))?.focus();
}
function focusCard() { if (!kbd) return; cardReturn = document.activeElement; card.querySelector('.card-close')?.focus(); }
function placeCard(x, y) {
  if (innerWidth <= 860) return;
  const w = card.offsetWidth, h = card.offsetHeight, minL = canvas.getBoundingClientRect().left + 12;
  // keep the card between the top bar and the time dock
  const minT = document.querySelector('.topbar').getBoundingClientRect().bottom + 12, maxB = document.querySelector('.dock').getBoundingClientRect().top - 12;
  let left = x + 18, top = y + 18;
  if (left + w > innerWidth - 12) left = x - w - 18;
  if (top + h > maxB) top = maxB - h;
  top = Math.max(minT, top);
  left = Math.max(minL, left);
  // never let a card sit on top of the navigation buttons
  const nk = document.querySelector('.navkit').getBoundingClientRect();
  if (left + w > nk.left - 12 && left < nk.right + 12 && top + h > nk.top - 12 && top < nk.bottom + 12) left = Math.max(minL, nk.left - 12 - w);
  card.style.left = left + 'px'; card.style.top = top + 'px';
}
function showCard(gid, x, y) {
  if (pinnedGid !== -1) return;
  hoverGid = gid; uniforms.uHover.value = gid;
  if (gid < 0) { card.hidden = true; return; }
  const html = cardHtml(gid, false);
  if (!html) { card.hidden = true; return; }
  card.innerHTML = html; card.classList.remove('pinned'); card.hidden = false; placeCard(x, y); hydratePhoto();
}
function pinCard(gid, x, y, place = null) {
  pinnedGid = gid; uniforms.uSelected.value = gid; uniforms.uHover.value = -1;
  if (gid < 0) { card.hidden = true; return; }
  const html = cardHtml(gid, true, place);
  if (!html) { pinnedGid = -1; card.hidden = true; return; }
  card.innerHTML = html; card.classList.add('pinned'); card.hidden = false; placeCard(x, y);
  card.querySelector('.card-close').onclick = unpin;
  wireSlides(); hydratePhoto(); focusCard();
}
// also cancels a story card still waiting for its flight to land, so a stale card can't pop up later
function unpin() {
  clearTimeout(storyTimer);
  const had = card.contains(document.activeElement);
  pinnedGid = -1; uniforms.uSelected.value = -1; card.hidden = true;
  if (had && cardReturn?.isConnected) cardReturn.focus();
  cardReturn = null;
}
let pointer = null, downAt = null, pointerMoved = false, lastPick = 0;
canvas.addEventListener('pointermove', e => { pointer = [e.offsetX, e.offsetY]; pointerMoved = true; });
canvas.addEventListener('pointerleave', () => { pointer = null; if (pinnedGid === -1) { card.hidden = true; uniforms.uHover.value = -1; } });
canvas.addEventListener('pointerdown', e => { downAt = [e.offsetX, e.offsetY]; });
canvas.addEventListener('pointerup', e => {
  if (pano) return;
  if (!downAt || Math.hypot(e.offsetX - downAt[0], e.offsetY - downAt[1]) > 5) return;
  const gid = pick(e.offsetX, e.offsetY);
  // clicking the building whose card is open closes it; the hover preview stays away until the pointer leaves it
  if (gid >= 0 && gid === pinnedGid) { unpin(); hoverGid = gid; }
  else if (gid >= 0) pinCard(gid, e.clientX, e.clientY); else unpin();
});
addEventListener('keydown', e => { if (e.key === 'Escape') { if (pano) exitPano(); else unpin(); } });

// ---------- Flights ----------
let flight = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function flyTo(x, z, dist = 900, elevation = 40, screenShift = null) {
  if (pano) leavePano();
  const from = { t: controls.target.clone(), p: camera.position.clone() };
  const az = controlsAzimuth(), el = THREE.MathUtils.degToRad(elevation);
  const t = new THREE.Vector3(x, 0, z);
  if (screenShift) {
    // Aim the camera off the point so it lands screenShift px from the centre: sideways along the view's right axis,
    // and up/down along the ground (one pixel of screen height covers 1/sin(elevation) pixels of ground).
    const px = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / canvas.clientHeight;
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), ahead = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    t.addScaledVector(right, -screenShift[0] * px).addScaledVector(ahead, screenShift[1] * px / Math.sin(el));
  }
  const p = new THREE.Vector3(x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), z + dist * Math.cos(el) * Math.cos(az));
  flight = { from, to: { t, p }, start: performance.now(), dur: reduceMotion ? 1 : 1600 };
}
function stepFlight(now) {
  if (!flight) return;
  let k = Math.min(1, (now - flight.start) / flight.dur);
  k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(flight.from.t, flight.to.t, k);
  // arc up and over on long flights
  const p = new THREE.Vector3().lerpVectors(flight.from.p, flight.to.p, k);
  const span = flight.from.t.distanceTo(flight.to.t);
  p.y += Math.sin(Math.PI * k) * Math.min(span * 0.4, 20000);
  camera.position.copy(p);
  if (k >= 1) { flight = null; streamChunks(); }
}

const svgI = d => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  colony: svgI('<path d="M2 14h12M3 14V7h10v7M2 7l6-4 6 4M6 14v-4h4v4"/>'),
  slave: svgI('<circle cx="5" cy="8" r="2.5"/><circle cx="11" cy="8" r="2.5"/><path d="M7.5 8h1"/>'),
  nation: svgI('<path d="M4 14V2M4 3h8l-2 3 2 3H4"/>'),
  faith: svgI('<path d="M3 14h10M4 14V9a4 4 0 0 1 8 0v5M8 5V2M7 3h2"/>'),
  learn: svgI('<path d="M2 6l6-3 6 3-6 3zM5 7.5V11c1.8 1.4 4.2 1.4 6 0V7.5"/>'),
  arts: svgI('<path d="M6 12V3l7-1v9"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>'),
  trade: svgI('<path d="M3 5h10l-1 9H4zM6 5a2 2 0 0 1 4 0"/>'),
  water: svgI('<path d="M1 6c2-2 3 2 5 0s3 2 5 0 3 2 4 0M1 10c2-2 3 2 5 0s3 2 5 0 3 2 4 0"/>'),
  modern: svgI('<path d="M4 14V4l4-2v12M8 6h4v8M2 14h12M6 6v0M6 9v0M10 9v0M10 12v0"/>'),
};
// ---------- Panel ----------
const panel = $('panel'), panelBody = $('panel-body'), panelTitle = $('panel-title'), panelDek = $('panel-dek');
let activeLayer = null, toursOpen = false;
const PANEL_HEAD = {
  [MODE.period]: ['Year built', 'Every building, coloured by the period it went up.'],
  [MODE.height]: ['Height', 'Every building, coloured by how many floors it has.'],
  [MODE.layers]: ['Stories', 'Places with a history, grouped by theme.'],
  tours: ['Tours', 'Guided walks through the city\'s stories, one stop at a time.'],
};
const groupOn = {};
function renderPanel() {
  const mode = uniforms.uMode.value;
  [panelTitle.textContent, panelDek.textContent] = PANEL_HEAD[toursOpen ? 'tours' : mode];
  if (toursOpen) {
    panelBody.innerHTML = `<ul class="w-list">${storyLayers.map((L, i) => `<li><button data-i="${i}"><b>${esc(L.name)}</b><span>${esc(L.intro)}</span><em>${L.items.length} stops</em></button></li>`).join('')}</ul>`;
    panelBody.querySelectorAll('.w-list button').forEach(b => b.onclick = () => startWalk(storyLayers[+b.dataset.i]));
  } else if (mode === MODE.period) {
    const mask = uniforms.uMask.value;
    panelBody.innerHTML = `<div class="swatches">${periods.map((p, i) =>
      `<button class="swatch" data-i="${i}" aria-pressed="${mask[i] > 0}"><i style="background:${p.color}"></i><span>${esc(p.label)} <span class="era">${esc(p.era)}</span></span><span class="n">${fmt(p.n)}</span></button>`).join('')}
      <div class="swatch total"><span>Total, 2026 estimate</span><span class="n">${fmt(periods.reduce((a, p) => a + p.n, 0))}</span></div></div>
      <p class="note">Select a period to show only its buildings; select it again to show them all. Totals follow the 2025 State of Lagos Housing Market Report, and buildings are sorted into periods by how early satellites first see them.</p>`;
    panelBody.querySelectorAll('button.swatch').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, m = uniforms.uMask.value, P = periods.length;
      const alone = m.slice(0, P).every((v, j) => (j === i) === (v > 0));
      for (let j = 0; j < P; j++) m[j] = alone ? 1 : (j === i ? 1 : 0);
      keepFocus(panelBody, renderPanel); drawHist(); updateOverview();
    });
  } else if (mode === MODE.height) {
    const fm = uniforms.uFloorMask.value, top = Math.sqrt(Math.max(...FLOORS.map(f => f.n)));
    panelBody.innerHTML = `<div class="swatches floors">${FLOORS.map((f, i) =>
      `<button class="swatch" data-i="${i}" aria-pressed="${fm[i] > 0}"><i style="background:${f.color}"></i><span>${esc(f.label)}<span class="fbar" style="width:${Math.max(3, 100 * Math.sqrt(f.n) / top).toFixed(1)}%;background:${f.color}"></span></span><span class="n">${fmt(f.n)}</span></button>`).join('')}</div>
      <p class="note">Select a range to show only those buildings; select it again to show them all. Floors are estimated at about 3.2 m each, from mapped heights where they exist and Google's 2023 estimates elsewhere. Most of Lagos is one or two floors; the towers cluster on Lagos Island, Ikoyi, Victoria Island and Eko Atlantic.</p>`;
    panelBody.querySelectorAll('button.swatch').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, m = uniforms.uFloorMask.value;
      const alone = m.every((v, j) => (j === i) === (v > 0));
      for (let j = 0; j < m.length; j++) m[j] = alone ? 1 : (j === i ? 1 : 0);
      keepFocus(panelBody, renderPanel); updateOverview();
    });
  } else if (!activeLayer) {
    const cats = CATS.filter(c => layers.some(L => L.cat === c.id));
    panelBody.innerHTML = `<nav class="jump" aria-label="Jump to a theme"><div class="jump-icons">${cats.map(c => `<button data-c="${c.id}" aria-label="${esc(c.name)}">${ICON[c.id] || ''}</button>`).join('')}</div><p class="jump-label" aria-hidden="true">Jump to a theme</p></nav>
      ${cats.map(c => `<h2 class="section" id="sec-${c.id}">${ICON[c.id] || ''}${esc(c.name)}</h2><div class="layers">${layers.map((L, i) => L.cat !== c.id ? '' :
        `<button class="layer" data-i="${i}"><b>${esc(L.name)}</b><span class="era">${esc(L.era || '')}</span><span class="n">${fmt(L.groups.reduce((a, g) => a + g.n, 0) || L.items.length)}</span></button>`).join('')}</div>`).join('')}
      <p class="note">Opening a layer colours its buildings and greys out the rest. The number shows how many buildings it includes.</p>`;
    panelBody.querySelectorAll('.layer').forEach(b => b.onclick = () => { openLayer(layers[+b.dataset.i]); panelBody.querySelector('.back')?.focus(); });
    const jumpLabel = panelBody.querySelector('.jump-label');
    panelBody.querySelectorAll('.jump button').forEach(b => {
      b.onclick = () => panelBody.querySelector('#sec-' + b.dataset.c)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      b.onpointerenter = b.onfocus = () => { jumpLabel.textContent = b.getAttribute('aria-label'); jumpLabel.classList.add('on'); };
      b.onpointerleave = b.onblur = () => { jumpLabel.textContent = 'Jump to a theme'; jumpLabel.classList.remove('on'); };
    });
  } else {
    const L = activeLayer, li = layers.indexOf(L);
    panelBody.innerHTML = `<button class="back">All stories</button><h2 class="layer-title">${ICON[L.cat] || ''}${esc(L.name)}</h2><p class="layer-era">${esc(L.era || '')}</p><div class="layer-detail"><p>${esc(L.intro)}</p>
      ${L.groups.length ? `<div class="swatches">${L.groups.map((g, k) => `<div class="swatch"><i style="background:${L.groups.length > 1 ? GROUP_COLORS[k] : GROUP_COLORS[li % MAX_GROUPS]}"></i><span>${esc(g.label)}</span><span class="n">${fmt(g.n)}</span></div>`).join('')}</div>` : ''}
      ${L.items.length ? `<ul class="stories">${L.items.map((it, k) => `<li><button class="story" data-k="${k}"><b>${esc(it.name.replace(' (approximate pin)', ''))}</b><span>${esc(it.year || '')}${it.year ? ' · ' : ''}${esc(it.text.slice(0, 90))}…</span></button></li>`).join('')}</ul>` : ''}</div>`;
    panelBody.querySelector('.back').onclick = () => { unpin(); activeLayer = null; applyLayer(); renderPanel(); panelBody.querySelector(`.layer[data-i="${li}"]`)?.focus(); };
    panelBody.querySelectorAll('.story').forEach(b => b.onclick = () => openStory(L.items[+b.dataset.k]));
  }
}
function applyLayer() {
  const bits = uniforms.uGroupBit.value;
  bits.fill(-1);
  if (activeLayer) {
    if (activeLayer.groups.length > 1) activeLayer.groups.forEach((g, k) => bits[k] = g.bit);
    else if (activeLayer.groups.length) { const li = layers.indexOf(activeLayer); bits[li % MAX_GROUPS] = activeLayer.groups[0].bit; }
    uniforms.uLayerAt.value = performance.now() / 1000;
  }
  showPins(activeLayer?.items);
  drawHist(); updateOverview();
}
function openLayer(L) {
  unpin();
  activeLayer = L; applyLayer(); renderPanel();
  if (L.items.length) {
    const xs = L.items.map(i => i.x), zs = L.items.map(i => i.z);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    flyTo((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(1500, span * 1.6), 45);
  } else if (L.id === 'reclaimed') flyTo(1800, 4700, 4200, 40);
  else if (L.id === 'tall') flyTo(2300, 1200, 5200, 38);
  else { const h = config.home; flyTo(h.x - 6000, h.z - 6000, 14000, 45); }
}
// Where the building should land: centred in the space the card stack and the building card leave free.
function storyShift() {
  const W = innerWidth, H = innerHeight;
  const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
  if (W <= 860) return [0, (top + H * 0.38) / 2 - H / 2];
  const left = cardAnchor()[0] + 24 + document.querySelector('.stack').offsetWidth + 12, bottom = document.querySelector('.dock').getBoundingClientRect().top;
  return [Math.max(0, (left + W - 16) / 2 - W / 2), (top + bottom) / 2 - H / 2];
}
function openStory(it) {
  unpin();
  flyTo(it.x, it.z, 520, 28, storyShift());
  if (it.gid < 0) { storyTimer = setTimeout(() => placeCardFor(it), 1700); return; }
  storyTimer = setTimeout(() => { if (building(it.gid)) pinCard(it.gid, ...cardAnchor()); }, 1900);
}
// Just right of the card stack, top-aligned with it; placeCard adds its own 18px offset.
function cardAnchor() {
  const stack = document.querySelector('.stack'), cards = [...stack.querySelectorAll(':scope > .sheet:not([hidden])')];
  const right = cards.length ? Math.max(...cards.map(c => c.getBoundingClientRect().right)) : 0;
  return [right - 6, stack.getBoundingClientRect().top - 18];
}
function placeCardFor(it) {
  const [lon, lat] = it.lon !== undefined ? [it.lon, it.lat] : toLL(it.x, it.z);
  let html = '<button class="card-close" aria-label="Close">×</button>';
  if (it.photo) html += photosHtml([it.photo], true);
  html += goHtml(+lat, +lon, { x: it.x, z: it.z, h: 12, area: 400, gid: -1, name: it.name.replace(' (approximate pin)', '') }, !!it.photo);
  html += `<div class="card-head"><h2>${esc(it.name.replace(' (approximate pin)', ''))}</h2><div class="when"><span class="y" style="font-size:22px">${esc(it.year || '')}</span></div></div>`;
  html += `<section class="story-sec"><p>${esc(it.text)}</p><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.source)}</a></section>`;
  if (/approximate/.test(it.name)) html += '<p class="hint">This pin is approximate: the story is about the area, not a single building.</p>';
  pinnedGid = -2; card.innerHTML = html; card.classList.add('pinned'); card.hidden = false; placeCard(...cardAnchor());
  card.querySelector('.card-close').onclick = unpin; focusCard();
}
function setMode(m) {
  uniforms.uMode.value = m;
  if (m !== MODE.layers) { activeLayer = null; uniforms.uGroupBit.value.fill(-1); showPins(null); }
  renderPanel(); drawHist(); updateOverview(); syncNav();
}
// Quest, a running tour and the graph each take over from the mode tabs, so only one nav item is ever lit.
function syncNav() {
  const view = !graphEl.hidden ? 'graph' : !questEl.hidden ? 'quest' : walk || toursOpen ? 'tours' : uniforms.uMode.value;
  document.querySelectorAll('.topnav button').forEach(b => {
    const v = b.dataset.mode !== undefined ? +b.dataset.mode : b.classList.contains('graph-open') ? 'graph' : b.classList.contains('quest-open') ? 'quest' : 'tours';
    b.setAttribute('aria-pressed', v === view);
  });
  panel.hidden = view === 'graph' || view === 'quest' || !!walk;
}
function leaveViews() {
  unpin(); clearSearch();
  // a tour borrows a story layer; leaving it shouldn't leave that layer open under another tab
  if (walk || toursOpen) { activeLayer = null; applyLayer(); }
  if (!graphEl.hidden) closeGraph(); if (!questEl.hidden) closeQuest(); if (walk) endWalk(); toursOpen = false; }
document.querySelectorAll('.topnav button[data-mode]').forEach(b => b.onclick = () => { leaveViews(); setPanelOpen(true); setMode(+b.dataset.mode); });
function setOpen(box, btn, open) {
  box.classList.toggle('collapsed', !open);
  btn.setAttribute('aria-expanded', open);
  btn.setAttribute('aria-label', open ? 'Collapse' : 'Expand');
}
const panelToggle = panel.querySelector('.sheet-toggle'), gPanel = document.querySelector('.g-panel'), gToggle = gPanel.querySelector('.sheet-toggle');
const setPanelOpen = open => setOpen(panel, panelToggle, open);
panelToggle.onclick = () => setPanelOpen(panel.classList.contains('collapsed'));
gToggle.onclick = () => setOpen(gPanel, gToggle, gPanel.classList.contains('collapsed'));
// tour and quest cards re-render often, so their toggle is markup plus one delegated listener; the state lives on the card
const cardToggle = el => `<button type="button" class="q-toggle" aria-expanded="${!el.classList.contains('collapsed')}" aria-label="${el.classList.contains('collapsed') ? 'Expand' : 'Collapse'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg></button>`;
if (innerWidth <= 860) setPanelOpen(false);

// ---------- Timeline ----------
const hist = $('hist'), hctx = hist.getContext('2d'), tallyYear = $('tally-year'), tallyCount = $('tally-count');
const T0 = config.yearMin, T1 = config.yearMax + 1;
const years = Object.entries(config.histogram).map(([y, v]) => [+y, v]);
const yMax = Math.max(...years.map(([, v]) => v.reduce((a, b) => a + b, 0)));
const xOf = y => (y - T0) / (T1 - T0) * hist.clientWidth;
const yearOf = x => Math.round(T0 + x / hist.clientWidth * (T1 - T0));
function visibleCount() {
  const Y = uniforms.uYear.value, m = uniforms.uMask.value, mode = uniforms.uMode.value;
  if (mode === MODE.layers && activeLayer) {
    let n = 0;
    for (const g of activeLayer.groups) for (const [y, c] of Object.entries(g.years)) if (+y <= Y || (+y === 0 && Y >= config.yearMax)) n += c;
    return n;
  }
  let n = 0;
  for (const [y, v] of years) if (y <= Y) v.forEach((c, i) => { if (mode !== MODE.period || m[i]) n += c; });
  return n;
}
function drawHist() {
  const w = hist.clientWidth, h = hist.clientHeight, dpr = devicePixelRatio;
  hist.width = w * dpr; hist.height = h * dpr;
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, w, h);
  const plotH = h - 18, slot = w / (T1 - T0), bw = Math.max(1, slot * 0.5);
  const Y = uniforms.uYear.value, Yf = uniforms.uYearFrom.value, mode = uniforms.uMode.value, m = uniforms.uMask.value;
  for (const [y, v] of years) {
    let top = plotH;
    v.forEach((c, i) => {
      if (!c) return;
      const bh = Math.sqrt(c / yMax) * (plotH - 6);
      const masked = mode === MODE.period && !m[i];
      hctx.fillStyle = mode === MODE.period ? periods[i].color : '#c9c1b2';
      hctx.globalAlpha = !masked && y <= Y ? (y <= Yf ? 0.35 : 1) : 0.28;
      hctx.fillRect(xOf(y) + (slot - bw) / 2, top - bh, bw, bh);
      top -= bh;
    });
  }
  hctx.globalAlpha = 1; hctx.fillStyle = '#6b655b'; hctx.font = '500 11px "IBM Plex Sans", sans-serif';
  const step = w < 500 ? 20 : 10;
  for (let y = Math.ceil(T0 / step) * step; y <= T1; y += step) hctx.fillText(y, Math.min(w - 28, Math.max(0, xOf(y) - 13)), h - 4);
  hctx.fillStyle = '#17140f'; hctx.fillRect(Math.min(w - 1.5, xOf(Math.min(Y, config.yearMax)) + slot), 0, 1.5, plotH);
  tallyYear.textContent = Math.floor(Math.min(Y, config.yearMax));
  hist.setAttribute('aria-valuenow', Math.floor(Math.min(Y, config.yearMax)));
  hist.setAttribute('aria-valuetext', `${Math.floor(Math.min(Y, config.yearMax))}, ${fmt(visibleCount())} buildings`);
  tallyCount.textContent = fmt(visibleCount()) + ' buildings';
}
let dragging = false;
hist.addEventListener('pointerdown', e => { hist.setPointerCapture(e.pointerId); dragging = true; moveHandle(e.offsetX); stopPlay(); });
hist.addEventListener('pointermove', e => dragging && moveHandle(e.offsetX));
hist.addEventListener('pointerup', () => dragging = false);
hist.setAttribute('aria-valuemin', T0); hist.setAttribute('aria-valuemax', config.yearMax);
hist.addEventListener('keydown', e => {
  const Y = Math.floor(uniforms.uYear.value), step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
  const to = e.key === 'Home' ? T0 : e.key === 'End' ? config.yearMax : step ? Y + step : null;
  if (to === null) return;
  e.preventDefault(); stopPlay();
  uniforms.uYear.value = Math.max(T0, Math.min(config.yearMax, to)); drawHist(); updateOverview();
});
function moveHandle(x) {
  uniforms.uYear.value = Math.max(T0, Math.min(config.yearMax, yearOf(x)));
  drawHist(); updateOverview();
}
let playing = false, playStart = 0;
const DURATION = 26000;
const playIcon = $('play-icon');
function stopPlay() { playing = false; uniforms.uPlaying.value = 0; uniforms.uRise.value = 0.01; playIcon.setAttribute('d', 'M4 2.5v11l9-5.5z'); $('play').setAttribute('aria-label', 'Play the city\'s growth'); }
$('play').onclick = () => {
  if (playing) { stopPlay(); return; }
  playing = true; playStart = performance.now(); uniforms.uPlaying.value = 1; uniforms.uRise.value = 2.5;
  playIcon.setAttribute('d', 'M4 2.5h3v11H4zM9 2.5h3v11H9z'); $('play').setAttribute('aria-label', 'Pause');
};
function stepPlay(now) {
  if (!playing) return;
  const k = Math.min(1, (now - playStart) / DURATION);
  uniforms.uYear.value = config.yearMin + (config.yearMax - config.yearMin) * k;
  drawHist(); updateOverview();
  if (k >= 1) { uniforms.uYear.value = config.yearMax; stopPlay(); drawHist(); updateOverview(); }
}
addEventListener('resize', () => drawHist());

// ---------- Search ----------
const findInput = $('find-input'), findResults = $('find-results'), findSel = $('find-sel');
let index = null, results = [], sel = -1;
findInput.addEventListener('focus', () => { if (!index) fetch('data/search.json').then(r => r.json()).then(d => { index = d; runFind(); }); });
findInput.addEventListener('input', runFind);
function runFind() {
  const q = findInput.value.trim().toLowerCase();
  if (!q || !index) { setResultsOpen(false); return; }
  const story = layers.flatMap(L => L.items.map(it => [it.name.replace(' (approximate pin)', ''), 'story · ' + L.name, it.x, it.z, it]));
  const all = [...story, ...index];
  const starts = [], inside = [];
  for (const r of all) { const n = r[0].toLowerCase(); if (n.startsWith(q)) starts.push(r); else if (n.includes(q)) inside.push(r); if (starts.length > 12) break; }
  results = [...starts, ...inside].slice(0, 12); sel = -1;
  findResults.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="find-opt-${i}" aria-selected="false" data-i="${i}"><b>${esc(r[0])}</b><span>${esc(r[1])}</span></li>`).join('') : '<li class="none">No match in Lagos</li>';
  setResultsOpen(true);
  findResults.querySelectorAll('li[data-i]').forEach(li => li.onpointerdown = e => { e.preventDefault(); choose(+li.dataset.i); });
}
findInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = Math.max(0, Math.min(results.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); findResults.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', i === sel)); if (results.length) findInput.setAttribute('aria-activedescendant', 'find-opt-' + sel); e.preventDefault(); }
  if (e.key === 'Enter' && results.length) choose(Math.max(0, sel));
  if (e.key === 'Escape') { findInput.blur(); setResultsOpen(false); }
});
findInput.addEventListener('blur', () => setTimeout(() => setResultsOpen(false), 150));
function setResultsOpen(open) {
  findResults.hidden = !open; findInput.setAttribute('aria-expanded', open);
  if (!open) findInput.removeAttribute('aria-activedescendant');
}
function choose(i) {
  const r = results[i]; if (!r) return;
  setResultsOpen(false); findInput.value = ''; findInput.blur();
  findSel.innerHTML = `<span>${esc(r[0])}</span><button aria-label="Clear search">×</button>`; findSel.hidden = false;
  findSel.querySelector('button').onclick = clearSearch;
  if (r[4]) openStory(r[4]);
  else if (r[1] === 'LGA' || r[1] === 'area') { unpin(); showPins(activeLayer?.items); flyTo(r[2], r[3], r[1] === 'LGA' ? 6000 : 2400, 42); }
  else openPlace({ name: r[0], kind: r[1], x: r[2], z: r[3] });
}
// The pin stays as long as the search chip does; clearing the chip puts the layer's own pins back.
function clearSearch() { if (findSel.hidden) return; findSel.hidden = true; showPins(activeLayer?.items); }
function openPlace(pl) {
  unpin(); showPins([pl]);
  flyTo(pl.x, pl.z, 520, 28, storyShift());
  // the building's chunk may still be loading when the flight lands, so look again for a few seconds
  let tries = 0;
  const look = () => {
    const gid = buildingAt(pl.x, pl.z);
    if (gid >= 0) pinCard(gid, ...cardAnchor(), pl);
    else if (++tries < 10) storyTimer = setTimeout(look, 400);
    else placeCardForPlace(pl);
  };
  storyTimer = setTimeout(look, 1800);
}
// Search points carry no building id: take the footprint that contains the point, else the nearest within 30 m.
function buildingAt(x, z) {
  let best = -1, bestD = 30 * 30;
  for (const s of chunks.values()) {
    if (s.state !== 'ready') continue;
    const d = s.data, px = (x - d.ox) * 4, pz = (z - d.oz) * 4;
    for (let m = 0; m < d.nB; m++) {
      const vi = d.vstart[m], n = d.nv[m];
      const fx = d.V[2 * vi], fz = d.V[2 * vi + 1];
      if (Math.abs(fx - px) > 1600 || Math.abs(fz - pz) > 1600) continue;
      let inside = false, cx = 0, cz = 0;
      for (let k = 0, j = n - 1; k < n; j = k++) {
        const xk = d.V[2 * (vi + k)], zk = d.V[2 * (vi + k) + 1], xj = d.V[2 * (vi + j)], zj = d.V[2 * (vi + j) + 1];
        if ((zk > pz) !== (zj > pz) && px < (xj - xk) * (pz - zk) / (zj - zk) + xk) inside = !inside;
        cx += xk; cz += zk;
      }
      if (inside) return d.gid[m];
      const dd = ((cx / n - px) ** 2 + (cz / n - pz) ** 2) / 16;
      if (dd < bestD) { bestD = dd; best = d.gid[m]; }
    }
  }
  return best;
}
function placeCardForPlace(pl) {
  const [lon, lat] = toLL(pl.x, pl.z);
  let html = '<button class="card-close" aria-label="Close">×</button>';
  html += goHtml(lat, lon, { x: pl.x, z: pl.z, h: 12, area: 400, gid: -1, name: pl.name }, false);
  html += `<div class="card-head"><h2>${esc(pl.name)}</h2><p class="place-kind">${esc(cap(pl.kind))}</p></div>`;
  html += '<p class="hint">No building is mapped at this point, so the pin marks the place itself.</p>';
  pinnedGid = -2; card.innerHTML = html; card.classList.add('pinned'); card.hidden = false; placeCard(...cardAnchor());
  card.querySelector('.card-close').onclick = unpin; focusCard();
}

// ---------- Walks: a story layer, stop by stop ----------
const walkCard = $('walk');
const storyLayers = layers.filter(L => L.items.length);
document.querySelector('.tours-open').onclick = () => { leaveViews(); toursOpen = true; setPanelOpen(true); renderPanel(); syncNav(); };
let walk = null;
function startWalk(L) {
  if (!questEl.hidden) closeQuest(); if (!focusEl.hidden) clearFocus();
  setMode(MODE.layers); activeLayer = L; applyLayer(); renderPanel();
  walkCard.classList.remove('collapsed');
  walk = { L, i: 0 }; toursOpen = true; renderWalk(); syncNav(); openStory(L.items[0]);
  if (kbd) walkCard.querySelector('[data-a=next]')?.focus();
}
function renderWalk() {
  if (!walk) { walkCard.hidden = true; return; }
  keepFocus(walkCard, drawWalk);
}
function drawWalk() {
  const { L, i } = walk;
  walkCard.innerHTML = `<header><b>${esc(L.name)}</b><span class="w-meta">Stop ${i + 1} of ${L.items.length}</span></header>${cardToggle(walkCard)}<button class="q-close" aria-label="End tour">×</button>
    <div class="w-actions"><button data-a="prev" ${i === 0 ? 'disabled' : ''}>Previous</button><button class="primary" data-a="next">${i === L.items.length - 1 ? 'Finish tour' : 'Next stop'}</button></div>
    <ol class="w-stops">${L.items.map((it, k) => `<li><button data-k="${k}" aria-current="${k === i}"><span class="w-num">${k + 1}</span><span><b>${esc(it.name.replace(' (approximate pin)', ''))}</b><em>${esc(it.year || '')}</em></span></button></li>`).join('')}</ol>`;
  walkCard.hidden = false;
  walkCard.querySelector('.q-close').onclick = endWalk;
  walkCard.querySelector('[data-a=prev]').onclick = () => go(i - 1);
  walkCard.querySelector('[data-a=next]').onclick = () => i === L.items.length - 1 ? endWalk() : go(i + 1);
  walkCard.querySelectorAll('.w-stops button').forEach(b => b.onclick = () => go(+b.dataset.k));
}
function go(k) { unpin(); walk.i = k; renderWalk(); openStory(walk.L.items[k]); }
function endWalk() {
  const had = walkCard.contains(document.activeElement);
  unpin(); walk = null; renderWalk(); renderPanel(); syncNav();
  if (had) (panelBody.querySelector('.w-list button') || document.querySelector('.tours-open')).focus();
}

// ---------- Graph: people, events and the buildings they touched ----------
const graphEl = $('graph'), gSvg = $('g-svg'), gTip = $('g-tip'), graphBtn = document.querySelector('.graph-open');
const KCOL = { person: '#1f3a8a', architect: '#1f9e74', event: '#d4380d', organisation: '#d99a12', building: '#9aa1a6' };
let G = null, gSel = new Set(), gKindsOn = { person: 1, architect: 1, event: 1, organisation: 1, building: 1 }, gNodeSel, gLinkSel, gLabelSel;
async function openGraph() {
  if (!questEl.hidden) closeQuest(); if (walk) endWalk(); toursOpen = false;
  document.body.classList.add('graphing'); graphEl.hidden = false; syncNav();
  unpin();
  if (!G) { G = await fetch('data/graph.json').then(r => r.json()); buildGraph(); }
}
function closeGraph() { document.body.classList.remove('graphing'); graphEl.hidden = true; renderPanel(); syncNav(); }
graphBtn.onclick = () => graphEl.hidden ? openGraph() : closeGraph();
const nameOf = n => n.kind === 'building' ? n.name : n.id;
function buildGraph() {
  const nodes = G.nodes.map(n => ({ ...n })), links = G.links.map(l => ({ ...l }));
  const deg = {}; links.forEach(l => { deg[l.source] = (deg[l.source] || 0) + 1; deg[l.target] = (deg[l.target] || 0) + 1; });
  nodes.forEach(n => n.deg = deg[n.id] || 0);
  G.n = nodes; G.l = links;
  const kindsLabel = { ...G.kinds, building: 'Buildings' };
  $('g-kinds').innerHTML = Object.keys(KCOL).map(k => `<button data-k="${k}" aria-pressed="true"><i style="background:${KCOL[k]}"></i>${esc(kindsLabel[k])} <span>${nodes.filter(n => n.kind === k).length}</span></button>`).join('');
  $('g-kinds').querySelectorAll('button').forEach(b => b.onclick = () => { const k = b.dataset.k; gKindsOn[k] = !gKindsOn[k]; b.setAttribute('aria-pressed', !!gKindsOn[k]); styleGraph(); });
  const svg = d3.select(gSvg), W = gSvg.clientWidth || innerWidth, H = gSvg.clientHeight || innerHeight;
  svg.selectAll('*').remove();
  const root = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', e => root.attr('transform', e.transform)));
  const cx = innerWidth > 720 ? W / 2 + 170 : W / 2;
  nodes.forEach((n, i) => { const a = i * 2.39996, r = 12 * Math.sqrt(i); n.x = cx + r * Math.cos(a); n.y = H / 2 + r * Math.sin(a); });
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(58).strength(0.8))
    .force('charge', d3.forceManyBody().strength(-140).distanceMax(320))
    .force('x', d3.forceX(cx).strength(0.07)).force('y', d3.forceY(H / 2).strength(0.09))
    .force('collide', d3.forceCollide(d => 8 + Math.sqrt(d.deg) * 3));
  sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); sim.alpha(0.05).restart();
  gLinkSel = root.append('g').attr('stroke', '#9aa1a6').attr('stroke-opacity', 0.5).selectAll('line').data(links).join('line').attr('stroke-width', 1);
  gNodeSel = root.append('g').selectAll('g').data(nodes).join('g').style('cursor', 'pointer')
    .call(d3.drag().on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; }).on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = d.fy = null; }));
  gNodeSel.each(function (d) {
    const g = d3.select(this);
    if (d.kind === 'building') g.append('rect').attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8).attr('fill', KCOL.building);
    else g.append('circle').attr('r', 5 + Math.sqrt(d.deg) * 3.5).attr('fill', KCOL[d.kind]);
  });
  gLabelSel = gNodeSel.append('text').text(d => nameOf(d)).attr('x', d => d.kind === 'building' ? 7 : 7 + Math.sqrt(d.deg) * 3).attr('y', 4)
    .attr('font-size', d => d.kind === 'building' ? 9 : d.deg > 2 ? 12 : 10.5).attr('font-weight', d => d.kind === 'building' ? 500 : 700)
    .attr('fill', d => d.kind === 'building' ? '#5d6266' : '#000').attr('font-family', 'IBM Plex Sans, sans-serif')
    .attr('paint-order', 'stroke').attr('stroke', '#e4e8ea').attr('stroke-width', 3);
  gNodeSel.on('click', (e, d) => { if (!e.shiftKey) gSel.clear(); gSel.has(d.id) ? gSel.delete(d.id) : gSel.add(d.id); styleGraph(); renderSel(); })
    .on('mousemove', (e, d) => { gTip.innerHTML = `<b>${esc(nameOf(d))}</b><span>${esc(d.kind === 'building' ? (d.year || 'Building') : (d.years || kindsLabel[d.kind]))}</span>`; gTip.hidden = false; gTip.style.left = e.clientX + 12 + 'px'; gTip.style.top = e.clientY + 12 + 'px'; })
    .on('mouseleave', () => gTip.hidden = true);
  sim.on('tick', () => {
    gLinkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    gNodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
  });
  styleGraph(); renderSel();
}
function neighbours(id) { const s = new Set([id]); G.l.forEach(l => { if (l.source.id === id) s.add(l.target.id); if (l.target.id === id) s.add(l.source.id); }); return s; }
function styleGraph() {
  if (!G?.n) return;
  const lit = new Set(); gSel.forEach(id => neighbours(id).forEach(x => lit.add(x)));
  const on = d => gKindsOn[d.kind] ? 1 : 0;
  gNodeSel.attr('opacity', d => !on(d) ? 0.08 : gSel.size && !lit.has(d.id) ? 0.12 : 1);
  gNodeSel.select('circle').attr('fill', d => gSel.has(d.id) ? '#d4380d' : KCOL[d.kind]);
  gNodeSel.select('rect').attr('fill', d => gSel.has(d.id) ? '#d4380d' : KCOL.building);
  gLabelSel.attr('display', d => (gSel.size ? lit.has(d.id) : d.kind !== 'building') && on(d) ? null : 'none');
  gLinkSel.attr('stroke-opacity', l => gSel.size ? (gSel.has(l.source.id) || gSel.has(l.target.id) ? 0.9 : 0.04) : (on(l.source) && on(l.target) ? 0.45 : 0.04))
    .attr('stroke', l => gSel.size && (gSel.has(l.source.id) || gSel.has(l.target.id)) ? '#000' : '#9aa1a6');
}
function selBuildings() {
  const out = new Map();
  gSel.forEach(id => { const n = G.n.find(x => x.id === id); if (n.kind === 'building') out.set(n.id, n); else neighbours(id).forEach(x => { const m = G.n.find(y => y.id === x); if (m.kind === 'building') out.set(m.id, m); }); });
  return [...out.values()];
}
function renderSel() {
  const box = $('g-sel');
  if (!gSel.size) { box.innerHTML = ''; return; }
  const blds = selBuildings();
  let html = `<div class="g-chips">${[...gSel].map(id => { const n = G.n.find(x => x.id === id); return `<button class="g-chip" data-id="${esc(id)}">${esc(nameOf(n))} ×</button>`; }).join('')}</div>
    <button class="g-show">Show ${blds.length} building${blds.length === 1 ? '' : 's'} on the map</button><button class="g-clear">Clear selection</button>`;
  gSel.forEach(id => {
    const n = G.n.find(x => x.id === id), ls = G.l.filter(l => l.source.id === id || l.target.id === id);
    html += `<div class="g-ent"><h3>${esc(nameOf(n))} <span>${esc(n.kind === 'building' ? (n.year || '') : n.years || '')} · ${ls.length} ${n.kind === 'building' ? 'links' : ls.length === 1 ? 'place' : 'places'}</span></h3>`;
    for (const l of ls) {
      const other = l.source.id === id ? l.target : l.source;
      html += `<div class="g-bld"><i style="${other.kind === 'building' ? '' : 'background:' + KCOL[other.kind]}">${other.kind === 'building' ? '' : esc(nameOf(other)[0])}</i><div><b>${esc(nameOf(other))}</b>${esc(l.text)} <a href="${esc(l.src)}" target="_blank" rel="noopener">Source</a></div></div>`;
    }
    html += '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.g-chip').forEach(b => b.onclick = () => { gSel.delete(b.dataset.id); styleGraph(); renderSel(); });
  box.querySelector('.g-clear').onclick = () => { gSel.clear(); styleGraph(); renderSel(); };
  box.querySelector('.g-show').onclick = () => showOnMap(blds, [...gSel].map(id => nameOf(G.n.find(x => x.id === id))));
}
$('g-find').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(); if (!G?.n) return;
  gSel.clear(); if (q) G.n.filter(n => nameOf(n).toLowerCase().includes(q)).slice(0, 6).forEach(n => gSel.add(n.id));
  styleGraph(); renderSel();
});
const focusEl = $('focus');
function showOnMap(blds, names) {
  closeGraph(); setMode(MODE.period);
  const gids = blds.filter(b => b.gid >= 0).map(b => b.gid).slice(0, 64);
  uniforms.uFocus.value.fill(-1); gids.forEach((g, i) => uniforms.uFocus.value[i] = g); uniforms.uFocusN.value = gids.length;
  showPins(blds.map(b => ({ x: b.x, z: b.z })));
  focusEl.innerHTML = `<b>${blds.length} building${blds.length === 1 ? '' : 's'}</b><p>Linked to ${esc(names.join(', '))}</p><button data-a="graph">Back to connections</button><button data-a="clear">Clear</button>`;
  focusEl.hidden = false; if (walk) endWalk(); if (!questEl.hidden) closeQuest();
  focusEl.querySelector('[data-a=graph]').onclick = () => { clearFocus(); openGraph(); };
  focusEl.querySelector('[data-a=clear]').onclick = clearFocus;
  const xs = blds.map(b => b.x), zs = blds.map(b => b.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  flyTo((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2, Math.max(1200, span * 1.5), 45);
}
function clearFocus() { uniforms.uFocusN.value = 0; focusEl.hidden = true; showPins(null); }

// ---------- Ground picking ----------
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(nx, ny) {
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(ground, p) ? p : null;
}
function moveViewTo(x, z) {
  const d = new THREE.Vector3().subVectors(camera.position, controls.target);
  controls.target.set(x, 0, z); camera.position.copy(controls.target).add(d); controls.update(); streamChunks(); updateOverview();
}

// Double-click: fly in to that spot
canvas.addEventListener('dblclick', e => {
  if (pano) return;
  const r = canvas.getBoundingClientRect();
  const p = groundAt((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  if (!p) return;
  const d = camera.position.distanceTo(controls.target);
  flyTo(p.x, p.z, Math.max(350, d * 0.45), 40);
});


// ---------- Navigation kit: turn, tilt, spin and zoom ----------
const sph = new THREE.Spherical();
function orbit(dTheta, dPhi, scale = 1) {
  if (pano) { panoLook(dTheta * 0.8, dPhi * 0.8, scale); return; }
  const off = new THREE.Vector3().subVectors(camera.position, controls.target);
  sph.setFromVector3(off);
  sph.theta += dTheta;
  sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.05, controls.maxPolarAngle);
  sph.radius = THREE.MathUtils.clamp(sph.radius * scale, controls.minDistance, controls.maxDistance);
  off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); controls.update();
}
const NK = { 'rot-left': [-0.035, 0, 1], 'rot-right': [0.035, 0, 1], 'tilt-up': [0, 0.025, 1], 'tilt-down': [0, -0.025, 1], 'zoom-in': [0, 0, 0.94], 'zoom-out': [0, 0, 1.065] };
let nkHold = null;
document.querySelectorAll('[data-nk]').forEach(b => {
  const step = () => { const s = NK[b.dataset.nk]; orbit(s[0], s[1], s[2]); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); flight = null; step(); clearInterval(nkHold); nkHold = setInterval(step, 30); b.setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => { clearInterval(nkHold); nkHold = null; streamChunks(); updateOverview(); }));
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); for (let i = 0; i < 6; i++) step(); } });
});
let spinning = false;
const spinBtn = $('nk-spin');
spinBtn.onclick = () => { spinning = !spinning; spinBtn.setAttribute('aria-pressed', spinning); };
canvas.addEventListener('pointerdown', () => { if (spinning) { spinning = false; spinBtn.setAttribute('aria-pressed', 'false'); } });
$('nk-compass').onclick = () => {
  if (pano) { pano.yaw = 0; pano.pitch = 0.04; return; }
  const off = new THREE.Vector3().subVectors(camera.position, controls.target); sph.setFromVector3(off);
  const from = { t: controls.target.clone(), p: camera.position.clone() };
  sph.theta = 0; sph.phi = THREE.MathUtils.degToRad(50); off.setFromSpherical(sph);
  flight = { from, to: { t: controls.target.clone(), p: controls.target.clone().add(off) }, start: performance.now(), dur: 700 };
};
const needle = document.getElementById('nk-needle');
function updateCompass() { const az = controlsAzimuth(); needle.setAttribute('transform', `rotate(${THREE.MathUtils.radToDeg(az)} 12 12)`); }

// ---------- Panorama: stand on the street in front of a building ----------
// Like paris.bogachev.fr: the camera drops to eye level in front of the place and you look around the model.
// The spot is chosen so you are not standing inside a neighbouring building and can see the target.
let pano = null;
const EYE = 1.7, panoBar = $('pano-bar');
function footprintsNear(x, z, R) {
  const out = [];
  for (const s of chunks.values()) {
    if (s.state !== 'ready') continue;
    const d = s.data;
    for (let m = 0; m < d.nB; m++) {
      const vi = d.vstart[m], n = d.nv[m];
      const fx = d.ox + d.V[2 * vi] / 4, fz = d.oz + d.V[2 * vi + 1] / 4;
      if (Math.abs(fx - x) > R || Math.abs(fz - z) > R) continue;
      const P = new Float32Array(2 * n); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < n; k++) { const px = d.ox + d.V[2 * (vi + k)] / 4, pz = d.oz + d.V[2 * (vi + k) + 1] / 4; P[2 * k] = px; P[2 * k + 1] = pz; x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
      out.push({ gid: d.gid[m], P, x0, x1, z0, z1 });
    }
  }
  return out;
}
function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length / 2 - 1; i < P.length / 2; j = i++) {
    const xi = P[2 * i], zi = P[2 * i + 1], xj = P[2 * j], zj = P[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function blockedAt(F, x, z, self, pad = 0) {
  for (const f of F) if (f.gid !== self && x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad && inPoly(f.P, x, z)) return true;
  return false;
}
function panoSpot(t) {
  const r = Math.sqrt(Math.max(t.area || 100, 30) / Math.PI);
  const base = THREE.MathUtils.clamp(r + Math.max(18, t.h * 0.9), 26, 240);
  const F = footprintsNear(t.x, t.z, base * 2.4 + 60);
  const az0 = controlsAzimuth();
  let best = null;
  for (const k of [1.3, 1, 1.7, 0.75, 2.3, 0.55]) {
    for (let i = 0; i < 24; i++) {
      const az = az0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 12, D = base * k;
      const ex = t.x + D * Math.sin(az), ez = t.z + D * Math.cos(az);
      if (blockedAt(F, ex, ez, t.gid, 0)) continue;
      // keep the line of sight to the facade clear of other buildings
      let clear = true;
      for (let s = 0.08; s < 1 && clear; s += 0.06) {
        const px = ex + (t.x - ex) * s, pz = ez + (t.z - ez) * s;
        if (Math.hypot(px - t.x, pz - t.z) < r * 0.9) break;
        if (blockedAt(F, px, pz, t.gid, 0)) clear = false;
      }
      if (clear) return { ex, ez, D };
      if (!best) best = { ex, ez, D };
    }
  }
  return best || { ex: t.x + base * Math.sin(az0), ez: t.z + base * Math.cos(az0), D: base };
}
function enterPano(t) {
  spinning = false; spinBtn.setAttribute('aria-pressed', 'false'); flight = null;
  const { ex, ez, D } = panoSpot(t);
  const yaw = Math.atan2(ex - t.x, ez - t.z);
  const lookY = Math.min(t.h * 0.5, D * 0.45);
  const pitch = THREE.MathUtils.clamp(Math.atan2(lookY - EYE, D), -0.1, 0.6);
  const back = pano ? pano.back : { t: controls.target.clone(), p: camera.position.clone(), card: pinnedGid };
  pano = { yaw, pitch, fov: 62, eye: new THREE.Vector3(ex, EYE, ez), D, t, back, keys: new Set(), walk: null, last: 0, F: null, Fc: null, lastStream: 0,
    anim: { start: performance.now(), dur: 1900, p0: camera.position.clone(), q0: camera.quaternion.clone(), f0: camera.fov } };
  controls.enabled = false;
  uniforms.uSelected.value = -1; uniforms.uHover.value = -1; card.hidden = true; pinnedGid = -3; pins.visible = false;
  $('pano-name').textContent = t.name || 'Panorama';
  panoBar.hidden = false; document.body.classList.add('pano');
  controls.target.set(t.x, 0, t.z); streamChunks();
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function stepPano(now) {
  _e.set(pano.pitch, pano.yaw, 0); _q.setFromEuler(_e);
  const a = pano.anim;
  if (a) {
    let k = Math.min(1, (now - a.start) / a.dur); k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(a.p0, pano.eye, k);
    camera.quaternion.slerpQuaternions(a.q0, _q, k);
    camera.fov = a.f0 + (pano.fov - a.f0) * k;
    if (k >= 1) { pano.anim = null; streamChunks(); updateOverview(); }
  } else { stepWalk(now); _e.set(pano.pitch, pano.yaw, 0); _q.setFromEuler(_e); camera.position.copy(pano.eye); camera.quaternion.copy(_q); camera.fov = pano.fov; }
  pano.last = now;
  // the orbit target sits on the ground ahead of the eye, so the compass and the chunk loader keep working
  controls.target.set(pano.eye.x - Math.sin(pano.yaw) * pano.D, 0, pano.eye.z - Math.cos(pano.yaw) * pano.D);
  if (spinning && !pano.anim) pano.yaw += 0.0025;
  pins.visible = false;
}
// Walking: W A S D or the arrow keys (Shift to run), or click a spot on the street to walk there.
// Buildings are solid: a step that would end inside a footprint is refused, sliding along the wall instead.
function panoFootprints() {
  const e = pano.eye;
  if (!pano.F || Math.hypot(e.x - pano.Fc.x, e.z - pano.Fc.z) > 70) { pano.F = footprintsNear(e.x, e.z, 200); pano.Fc = { x: e.x, z: e.z }; }
  return pano.F;
}
const solid = (x, z) => blockedAt(panoFootprints(), x, z, -9, 0.6);
// a step is allowed when the spot just beyond it (0.6 m further on) is open street
const freeAhead = (x, z, dx, dz) => { const d = Math.hypot(dx, dz) || 1; return !solid(x + dx + dx / d * 0.6, z + dz + dz / d * 0.6); };
function tryMove(dx, dz) {
  const e = pano.eye;
  if (freeAhead(e.x, e.z, dx, dz)) { e.x += dx; e.z += dz; return true; }
  if (Math.abs(dx) > 1e-4 && freeAhead(e.x, e.z, dx, 0)) { e.x += dx; return true; }
  if (Math.abs(dz) > 1e-4 && freeAhead(e.x, e.z, 0, dz)) { e.z += dz; return true; }
  return false;
}
function stepWalk(now) {
  const dt = Math.min(0.1, pano.last ? (now - pano.last) / 1000 : 0), k = pano.keys;
  const fx = -Math.sin(pano.yaw), fz = -Math.cos(pano.yaw), rx = Math.cos(pano.yaw), rz = -Math.sin(pano.yaw);
  let moved = false;
  if (k.has('left')) pano.yaw += 1.6 * dt;
  if (k.has('right')) pano.yaw -= 1.6 * dt;
  const fwd = (k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0), side = (k.has('sr') ? 1 : 0) - (k.has('sl') ? 1 : 0);
  if (fwd || side) {
    pano.walk = null;
    const v = (k.has('run') ? 16 : 5.5) * dt, n = Math.hypot(fwd, side);
    moved = tryMove((fx * fwd + rx * side) / n * v, (fz * fwd + rz * side) / n * v);
  } else if (pano.walk) {
    const w = pano.walk, e = pano.eye, dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz);
    const v = Math.min(d, Math.max(4, Math.min(18, d * 1.6)) * dt);
    if (d < 0.15 || !tryMove(dx / d * v, dz / d * v)) pano.walk = null; else moved = true;
  }
  if (moved && now - pano.lastStream > 900) { pano.lastStream = now; streamChunks(); }
}
// Where a click on the street leads: up to 90 m ahead, stopping short of the first wall on the way.
function walkTarget(nx, ny) {
  const p = groundAt(nx, ny), e = pano.eye;
  if (!p) return null;
  let dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (d < 0.8) return null;
  if (d > 90) { dx *= 90 / d; dz *= 90 / d; d = 90; }
  let reach = 0;
  for (let s = 0.5; s <= d; s += 0.5) { if (solid(e.x + dx / d * s, e.z + dz / d * s)) break; reach = s; }
  if (reach < 0.8) return null;
  return { x: e.x + dx / d * reach, z: e.z + dz / d * reach };
}
const walkRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
walkRing.rotation.x = -Math.PI / 2; walkRing.renderOrder = 40; walkRing.visible = false; scene.add(walkRing);
const ndc = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
canvas.addEventListener('pointermove', e => {
  if (!pano || pano.anim || panoDrag) { walkRing.visible = false; return; }
  const t = walkTarget(...ndc(e));
  walkRing.visible = !!t; if (t) walkRing.position.set(t.x, 0.06, t.z);
});
canvas.addEventListener('pointerleave', () => { walkRing.visible = false; });
const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'sl', KeyD: 'sr', ArrowLeft: 'left', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run' };
addEventListener('keydown', e => {
  if (!pano || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault(); pano.keys.add(k);
});
addEventListener('keyup', e => { if (pano) pano.keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => { if (pano) pano.keys.clear(); });
function panoLook(dYaw, dPitch, zoom = 1) {
  if (!pano || pano.anim) return;
  pano.yaw -= dYaw; pano.pitch = THREE.MathUtils.clamp(pano.pitch + dPitch, -1.2, 1.35);
  pano.fov = THREE.MathUtils.clamp(pano.fov * zoom, 22, 85);
}
function leavePano() {
  if (!pano) return;
  pano = null; controls.enabled = true; camera.fov = 35;
  panoBar.hidden = true; document.body.classList.remove('pano'); pins.visible = true; walkRing.visible = false;
  uniforms.uSelected.value = -1; pinnedGid = -1;
}
function exitPano() {
  if (!pano) return;
  const back = pano.back, t = pano.t;
  camera.position.copy(pano.eye);
  leavePano();
  camera.lookAt(controls.target); controls.update();
  flight = { from: { t: controls.target.clone(), p: camera.position.clone() }, to: { t: back.t, p: back.p }, start: performance.now(), dur: 1500 };
  if (t.gid >= 0 && back.card === t.gid) setTimeout(() => { const r = canvas.getBoundingClientRect(); if (!pano && building(t.gid)) pinCard(t.gid, r.left + 6, 70); }, 1550);
}
$('pano-exit').onclick = exitPano;
card.addEventListener('click', e => {
  const b = e.target.closest('[data-pano]'); if (!b) return;
  try { enterPano(JSON.parse(b.dataset.pano)); } catch {}
});
// drag to look around, wheel to zoom
let panoDrag = null;
let panoDown = null;
canvas.addEventListener('pointerdown', e => { if (!pano) return; panoDrag = [e.clientX, e.clientY]; panoDown = [e.clientX, e.clientY]; walkRing.visible = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', e => {
  if (!pano || pano.anim || !panoDown) return;
  if (Math.hypot(e.clientX - panoDown[0], e.clientY - panoDown[1]) < 5) { const t = walkTarget(...ndc(e)); if (t) pano.walk = t; }
  panoDown = null;
});
canvas.addEventListener('pointermove', e => {
  if (!pano || !panoDrag) return;
  const k = THREE.MathUtils.degToRad(pano.fov) / canvas.clientHeight;
  panoLook(-(e.clientX - panoDrag[0]) * k, (e.clientY - panoDrag[1]) * k);
  panoDrag = [e.clientX, e.clientY];
});
['pointerup', 'pointercancel'].forEach(t => canvas.addEventListener(t, () => { panoDrag = null; }));
canvas.addEventListener('wheel', e => { if (!pano) return; e.preventDefault(); panoLook(0, 0, Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------- Eko Quest: type the answer, the map takes you there ----------
// Quest rounds live in data/quests.json: each clue has q (question), a (accepted answers), t (story place to fly to) and hint.
const QUESTS = await fetch('data/quests.json?v=5').then(r => r.json()).catch(() => []);
const allItems = layers.flatMap(L => L.items || []);
const itemFor = name => allItems.find(it => it.name === name);
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function isRight(input, answers) {
  const x = norm(input); if (x.length < 3) return false;
  return answers.some(a => { const y = norm(a); return x === y || (x.length >= 5 && (x.includes(y) || y.includes(x) && x.length >= y.length * 0.6)) || lev(x, y) <= Math.max(1, Math.floor(y.length / 6)); });
}
const questEl = $('quest'), questBtn = document.querySelector('.quest-open');
[walkCard, questEl].forEach(el => el.addEventListener('click', e => { const b = e.target.closest('.q-toggle'); if (b) setOpen(el, b, el.classList.contains('collapsed')); }));
const qStore = { get() { try { return JSON.parse(localStorage.getItem('lil-quest') || '{}'); } catch { return {}; } }, set(v) { try { localStorage.setItem('lil-quest', JSON.stringify(v)); } catch {} } };
let Q = null, questReturn = null;
function openQuest() {
  if (walk) endWalk(); if (!focusEl.hidden) clearFocus(); if (!graphEl.hidden) closeGraph(); toursOpen = false;
  // answers switch the map to their story layer, so remember where the player came from
  if (questEl.hidden) { questReturn = { mode: uniforms.uMode.value, layer: activeLayer }; questEl.classList.remove('collapsed'); }
  const had = questEl.contains(document.activeElement);
  questEl.hidden = false; syncNav(); unpin();
  const best = qStore.get();
  questEl.innerHTML = `<header><b>Eko Quest</b><span class="w-meta">Choose a round</span></header>${cardToggle(questEl)}<button class="q-close" aria-label="Close quest">×</button>
    <div class="q-body q-intro"><p>Read the clue and type the name of the place. Get it right and the map takes you there.</p><p class="note" style="margin:0">3 points with no hints, 2 with one hint, 1 with two.</p>
    <div class="q-levels">${QUESTS.map((r, i) => `<button data-i="${i}"><b>${esc(r.title)}</b><span>${esc(r.blurb)}</span><em>${best[i] != null ? 'Best: ' + best[i] + '/' + r.qs.length * 3 : r.qs.length + ' questions'}</em></button>`).join('')}</div></div>`;
  questEl.querySelector('.q-close').onclick = closeQuest;
  questEl.querySelectorAll('.q-levels button').forEach(b => b.onclick = () => startQuest(+b.dataset.i));
  if (had) questEl.querySelector('.q-levels button').focus();
}
function closeQuest() {
  const had = questEl.contains(document.activeElement);
  questEl.hidden = true; Q = null; unpin();
  if (had) questBtn.focus();
  const back = questReturn; questReturn = null;
  if (back) { setMode(back.mode); if (back.mode === MODE.layers) { activeLayer = back.layer; applyLayer(); renderPanel(); } }
  else { renderPanel(); syncNav(); }
}
questBtn.onclick = () => questEl.hidden ? openQuest() : closeQuest();
function startQuest(r) { Q = { r, i: 0, score: 0, res: [] }; askQuest(); }
function letters(s) { return s.replace(/\(.*?\)/g, '').trim().split(' ').map(w => w[0] + ' ' + '_ '.repeat(Math.max(0, w.length - 1)).trim()).join('   '); }
function askQuest() {
  const R = QUESTS[Q.r], c = R.qs[Q.i];
  Q.hints = 0; Q.tries = 0; Q.done = false;
  questEl.innerHTML = `<header><b>${esc(R.title)}</b><span class="w-meta">Question ${Q.i + 1} of ${R.qs.length}</span></header>${cardToggle(questEl)}<button class="q-close" aria-label="Close quest">×</button>
    <div class="q-body"><div class="q-dots">${R.qs.map((_, k) => `<i class="${k < Q.res.length ? (Q.res[k] ? 'ok' : 'miss') : k === Q.i ? 'now' : ''}"></i>`).join('')}</div>
    <p class="q-text">${esc(c.q)}</p>
    <form class="q-form"><input id="q-input" type="text" autocomplete="off" placeholder="Type the place name" aria-label="Your answer"><button type="submit">Check</button></form>
    <ul class="q-hints" aria-live="polite"></ul><p class="q-feedback" aria-live="polite"></p>
    <div class="q-actions"><button type="button" data-a="hint">Get a hint</button><button type="button" data-a="skip">Show answer</button><span class="q-score">Score <b>${Q.score}</b></span></div></div>`;
  questEl.querySelector('.q-close').onclick = closeQuest;
  const input = questEl.querySelector('#q-input'); if (!questEl.classList.contains('collapsed')) input.focus();
  questEl.querySelector('form').onsubmit = e => { e.preventDefault(); checkQuest(input.value); };
  questEl.querySelector('[data-a=hint]').onclick = () => {
    if (Q.done || Q.hints >= 2) return; Q.hints++;
    const li = document.createElement('li'); li.textContent = Q.hints === 1 ? c.hint : 'First letters: ' + letters(c.t); questEl.querySelector('.q-hints').append(li);
  };
  questEl.querySelector('[data-a=skip]').onclick = () => { if (!Q.done) reveal(false); };
}
function checkQuest(v) {
  if (Q.done) return;
  const c = QUESTS[Q.r].qs[Q.i], fb = questEl.querySelector('.q-feedback');
  if (isRight(v, c.a)) { const pts = 3 - Q.hints; Q.score += pts; fb.className = 'q-feedback right'; fb.textContent = `Correct! +${pts}. Taking you there…`; reveal(true); return; }
  Q.tries++; fb.className = 'q-feedback wrong'; fb.textContent = Q.tries >= 3 ? 'Not quite. Try a hint, or select Show answer.' : 'Not quite. Try again.';
  const f = questEl.querySelector('.q-form'); f.classList.remove('q-shake'); void f.offsetWidth; f.classList.add('q-shake');
}
function reveal(ok) {
  Q.done = true; Q.res.push(ok);
  const R = QUESTS[Q.r], c = R.qs[Q.i], it = itemFor(c.t);
  const fb = questEl.querySelector('.q-feedback');
  if (!ok) { fb.className = 'q-feedback'; fb.textContent = `The answer is ${c.a[0].replace(/(^|[\s-])\S/g, m => m.toUpperCase())}.`; }
  questEl.querySelector('.q-score b').textContent = Q.score;
  const last = Q.i === R.qs.length - 1;
  const act = questEl.querySelector('.q-actions');
  act.innerHTML = `<button type="button" class="primary" data-a="next">${last ? 'See your score' : 'Next question'}</button><span class="q-score">Score <b>${Q.score}</b></span>`;
  act.querySelector('[data-a=next]').onclick = () => { unpin(); if (last) finishQuest(); else { Q.i++; askQuest(); } };
  act.querySelector('[data-a=next]').focus();
  if (it) { setMode(MODE.layers); const L = layers.find(L => L.items?.includes(it)); if (L) { activeLayer = L; applyLayer(); renderPanel(); } openStory(it); }
}
function finishQuest() {
  const R = QUESTS[Q.r], best = qStore.get();
  if (best[Q.r] == null || Q.score > best[Q.r]) { best[Q.r] = Q.score; qStore.set(best); }
  const right = Q.res.filter(Boolean).length;
  const title = Q.score >= 27 ? 'Omo Eko!' : Q.score >= 18 ? 'Proper Lagosian' : Q.score >= 9 ? 'Getting there' : 'JJC — just joined';
  questEl.innerHTML = `<header><b>${esc(R.title)}</b><span class="w-meta">Round complete</span></header>${cardToggle(questEl)}<button class="q-close" aria-label="Close quest">×</button>
    <div class="q-body"><p class="q-text" style="font-family:var(--display);font-size:var(--fs-5);font-weight:800;margin:0">${Q.score} / ${R.qs.length * 3}</p><p style="margin:0"><b>${title}</b> · ${right} of ${R.qs.length} correct.</p>
    <div class="q-actions"><button type="button" class="primary" data-a="again">Play again</button><button type="button" data-a="menu">Choose another round</button></div></div>`;
  questEl.querySelector('.q-close').onclick = closeQuest;
  questEl.querySelector('[data-a=again]').onclick = () => startQuest(Q.r);
  questEl.querySelector('[data-a=again]').focus();
  questEl.querySelector('[data-a=menu]').onclick = openQuest;
}

// ---------- About ----------
const about = $('about');
document.querySelector('.about-open').onclick = () => about.showModal();
document.querySelectorAll('dialog .about-close').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

// ---------- Loop ----------
function applyOffset() {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.clearViewOffset();
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); applyOffset();
  }
}
let frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  resize();
  stepFlight(now); stepPlay(now);
  if (pano) stepPano(now); else controls.update();
  const dist = camera.position.distanceTo(controls.target);
  if (pano) { camera.near = 0.4; camera.far = 30000; uniforms.uFog.value.set(1800, 9000); }
  else { camera.near = Math.max(2, dist * 0.02); camera.far = Math.max(60000, dist * 12); uniforms.uFog.value.set(Math.max(6000, dist * 1.6), Math.max(20000, dist * 4.5)); }
  camera.updateProjectionMatrix();
  uniforms.uNow.value = now / 1000;
  sea.position.set(controls.target.x, -0.5, controls.target.z);
  if (++frame % 3 === 0) { updateLabels(dist); scalePins(dist); }
  if (frame % 6 === 0) updateCompass();
  if (spinning && !flight) orbit(0.0035, 0, 1);
  if (!pano && pointer && pointerMoved && pinnedGid === -1 && now - lastPick > 90 && !flight && !playing && !controlsMoving) {
    pointerMoved = false; lastPick = now;
    const gid = pick(pointer[0], pointer[1]);
    if (gid !== hoverGid) showCard(gid, pointer[0] + canvas.getBoundingClientRect().left, pointer[1] + canvas.getBoundingClientRect().top);
    else if (gid >= 0) { const r = canvas.getBoundingClientRect(); placeCard(pointer[0] + r.left, pointer[1] + r.top); }
  }
  renderer.render(scene, camera);
}
renderPanel();
updateOverview();
streamChunks();
drawHist();
document.fonts.ready.then(() => drawHist());
if (window.lilReady) window.lilReady(); else $('loading').hidden = true;
requestAnimationFrame(loop);
