// Review page for src/render/ports: one port per view, or a grid of many.
//   ?port=Rotterdam            one port. &cam=free (default: fov 40 at the backdrop) | phone | wide
//   &ship=1                    stand the real ship and quay in (always on for cam=phone|wide)
//   &t=2.5                     time in seconds for the flag wave / turbine rotors
//   &pitch=4&yaw=19            free-camera angles in degrees (a low pitch shows anything floating)
//   &night=1                   the game's night lighting and lit windows
//   ?grid=1[&from=0&n=16&cols=4&cam=free|phone]   many ports in one canvas (scissor per cell)
//   &ports=Hamburg,Oslo        an explicit list
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPortScene, setPortNight } from '../src/render/ports';
import { ShipModel } from '../src/render/ship';
import { Quay } from '../src/render/harbour';
import { AREA_PORTS } from '../src/core/ports';
import { GROUPS } from '../src/render/ports/landmarks';

const q = new URLSearchParams(location.search);
const YAW = (19 * Math.PI) / 180;
const PITCH = (30 * Math.PI) / 180;
const SKY = '#bfe3f5';

const all = [...new Set(AREA_PORTS.flat().map((p) => p.name))];
const wrap = document.getElementById('wrap')!;
const statsEl = document.getElementById('stats')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/** Same lights as src/render/stage.ts addHarbourLights. */
const night = q.get('night') === '1';
setPortNight(night);
if (night) renderer.toneMappingExposure = 0.72;

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? '#16233a' : SKY);
  scene.environment = envTex;
  scene.environmentIntensity = night ? 0.14 : 0.32;
  scene.add(new THREE.HemisphereLight(night ? '#6f8fc8' : '#ddf1ff', night ? '#1d2a44' : '#6e8c99', night ? 0.9 : 1.05));
  const sun = new THREE.DirectionalLight(night ? '#ffcf8a' : '#fff6e6', night ? 1.3 : 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.position.set(-7, 16, 9);
  const c = sun.shadow.camera as THREE.OrthographicCamera;
  c.left = -12;
  c.right = 12;
  c.top = 12;
  c.bottom = -12;
  c.near = 1;
  c.far = 60;
  scene.add(sun, sun.target);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2d8daf', roughness: 0.6 }));
  water.receiveShadow = true;
  scene.add(water);
  return scene;
}

interface View {
  name: string;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  group: THREE.Group;
  tris: number;
  buildMs: number;
}

function countTris(g: THREE.Object3D): number {
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    const idx = m.geometry.index;
    const c = idx ? idx.count : m.geometry.getAttribute('position').count;
    n += (c / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return Math.round(n);
}

const shipStand: { ship: ShipModel | null; quay: Quay | null } = { ship: null, quay: null };

function freeCamera(aspect: number, fov = 40): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.5, 400);
  const target = new THREE.Vector3(-4.2, 1.4, -10);
  const dist = Number(q.get('dist') ?? 27);
  const pitch = q.get('pitch') ? (Number(q.get('pitch')) * Math.PI) / 180 : PITCH;
  const yaw = q.get('yaw') ? (Number(q.get('yaw')) * Math.PI) / 180 : YAW;
  if (q.get('pitch')) target.y = 1.0;
  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
  cam.position.copy(target).add(off);
  cam.lookAt(target);
  return cam;
}

/** The game's camera (GameView.layout), simplified: portrait phone or wide desktop. */
function gameCamera(w: number, h: number, ship: ShipModel): THREE.PerspectiveCamera {
  const portrait = h > w * 1.15;
  const col = Math.min(w, w >= 1200 ? 900 : 640);
  const span = portrait ? Math.max(8.2, ship.length - 0.7) : ship.length + 1.0;
  const hfov = (30 * Math.PI) / 180;
  const vfov = 2 * Math.atan((Math.tan(hfov / 2) * h) / col);
  const cam = new THREE.PerspectiveCamera((vfov * 180) / Math.PI, w / h, 0.5, 400);
  const dist = span / 2 / Math.tan(hfov / 2);
  const mid = (ship.bowX + ship.sternX) / 2;
  const target = new THREE.Vector3(mid, 0.35, 0.4);
  const off = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)).multiplyScalar(dist);
  cam.position.copy(target).add(off);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  const p = new THREE.Vector3(mid, 0, 0.78).project(cam);
  const sx = ((p.x + 1) / 2) * w;
  const sy = ((1 - p.y) / 2) * h;
  const waterPx = portrait ? h * 0.7 : h * 0.66;
  cam.setViewOffset(w, h, sx - w / 2, sy - waterPx, w, h);
  cam.updateProjectionMatrix();
  return cam;
}

function build(name: string, w: number, h: number, mode: string): View {
  const scene = makeScene();
  const t0 = performance.now();
  const group = buildPortScene(name, 48);
  const buildMs = performance.now() - t0;
  scene.add(group);
  let cam: THREE.PerspectiveCamera;
  if (mode === 'phone' || mode === 'wide' || q.get('ship') === '1') {
    const ship = new ShipModel(4, 2, 'REVIEW');
    scene.add(ship.group);
    const quay = new Quay(48);
    scene.add(quay.group);
    cam = mode === 'free' ? freeCamera(w / h) : gameCamera(w, h, ship);
  } else cam = freeCamera(w / h, Number(q.get('fov') ?? 40));
  group.userData.update?.(Number(q.get('t') ?? 2.5));
  return { name, scene, cam, group, tris: countTris(group), buildMs };
}

// ?audit=1 : build every port (game list + every port a landmark file registers) and report triangle counts,
// meshes (draw calls), and the nearest-to-camera z of anything the scene builds: window.__audit
if (q.get('audit') === '1') {
  const names = [...new Set([...all, ...GROUPS.flatMap((g) => g.PORTS.map((r) => r[0]))])];
  const rows = names.map((name) => {
    const t0 = performance.now();
    const g = buildPortScene(name, 48);
    const ms = performance.now() - t0;
    g.updateMatrixWorld(true);
    let calls = 0;
    let maxZ = -Infinity;
    let minY = Infinity;
    const box = new THREE.Box3();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.geometry) return;
      calls++;
      if ((m as THREE.InstancedMesh).isInstancedMesh) return;
      m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      // the flag plane waves in z; its pole is part of the solid mesh
      maxZ = Math.max(maxZ, box.max.z);
      minY = Math.min(minY, box.min.y);
    });
    const row = { name, tris: countTris(g), calls, maxZ: Number(maxZ.toFixed(2)), ms: Math.round(ms) };
    g.traverse((o) => ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose());
    return row;
  });
  (window as unknown as { __audit: unknown }).__audit = rows;
  document.title = 'ports-ready';
  throw new Error('audit done');
}

const grid = q.get('grid') === '1';
const mode = q.get('cam') ?? (grid ? 'free' : 'free');

if (!grid) {
  const name = q.get('port') ?? 'Rotterdam';
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  const v = build(name, w, h, mode);
  renderer.render(v.scene, v.cam);
  const info = renderer.info.render;
  statsEl.textContent = `${name} · ${v.tris.toLocaleString()} tris · ${info.calls} draw calls (incl. shadow pass) · built in ${v.buildMs.toFixed(0)} ms · ${JSON.stringify(v.group.userData.stats)} ${v.group.userData.stages}`;
  if (mode === 'phone') {
    const top = document.getElementById('hud-top')!;
    const bot = document.getElementById('hud-bot')!;
    if (q.get('hud') !== '0') {
      top.style.cssText = `display:block;top:0;height:${h * 0.33}px`;
      bot.style.cssText = `display:block;bottom:0;height:${h * 0.2}px`;
    }
  }
  const view = v;
  const tick = (ms: number) => {
    if (q.get('anim') === '1') {
      view.group.userData.update?.(ms / 1000);
      renderer.render(view.scene, view.cam);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
} else {
  const list = (q.get('ports')?.split(',') ?? all).slice(Number(q.get('from') ?? 0), q.get('ports') ? undefined : Number(q.get('from') ?? 0) + Number(q.get('n') ?? 16));
  const cols = Number(q.get('cols') ?? 4);
  const cw = Math.floor(window.innerWidth / cols);
  const ch = mode === 'phone' ? Math.round(cw * 1.9) : Math.round(cw * 0.72);
  const rows = Math.ceil(list.length / cols);
  const W = cw * cols;
  const H = ch * rows;
  renderer.setSize(W, H);
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  let totalTris = 0;
  let maxCalls = 0;
  list.forEach((name, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    const v = build(name, cw, ch, mode);
    totalTris += v.tris;
    renderer.setViewport(x, H - y - ch, cw, ch);
    renderer.setScissor(x, H - y - ch, cw, ch);
    renderer.clear();
    renderer.info.reset();
    renderer.render(v.scene, v.cam);
    maxCalls = Math.max(maxCalls, renderer.info.render.calls);
    const lab = document.createElement('div');
    lab.className = 'lab';
    lab.style.left = x + 'px';
    lab.style.top = y + 'px';
    lab.textContent = `${name} · ${(v.tris / 1000).toFixed(1)}k tris`;
    wrap.appendChild(lab);
    // free the scene right away: only the pixels matter in a grid
    v.group.traverse((o) => ((o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose());
  });
  statsEl.textContent = `${list.length} ports · avg ${(totalTris / list.length / 1000).toFixed(1)}k tris · max ${maxCalls} calls`;
}
document.title = 'ports-ready';
