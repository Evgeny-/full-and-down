// Review page for the bulk carrier: a bulker with parcels in its holds and a crane with the grab
// lifting one, a row of every commodity on a quay slab, and a feeder next to it for comparison.
// ?v=all|ship|holds|quay|feeder|crane   ?set=1|2|3 (which parcels ride the holds)   ?labels=0   ?bounds=1
import '@fontsource-variable/oswald';
import * as THREE from 'three';
import { addHarbourLights, createRenderer } from '../src/render/stage';
import { BOX_H, BOX_LEN, BOX_W, LIGHT_Y, ShipModel } from '../src/render/ship';
import { makeBox } from '../src/render/boxes';
import { COMMODITIES, makeParcel, parcelBounds, type Commodity } from '../src/render/bulk';
import { loadFonts } from '../src/render/paint';
import { PAL, PORT_COLORS } from '../src/render/palette';
import type { FlagId } from '../src/render/flags';

const q = new URLSearchParams(location.search);
const view = q.get('v') ?? 'all';
const set = Number(q.get('set') ?? 1);

const SETS: Commodity[][] = [
  ['grain', 'coal', 'ore', 'steel'],
  ['timber', 'steel', 'sugar', 'fertiliser'],
  ['salt', 'scrap', 'coal', 'grain'],
];
const CODES = ['RTM', 'HAM', 'ANR', 'LEH', 'BRE', 'FXT'];
const WEIGHTS = [4, 7, 12, 2, 9, 1, 5, 3, 6];

await loadFonts();

const host = document.getElementById('gl')!;
const renderer = createRenderer(host);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.skyTop);
addHarbourLights(renderer, scene);

// the sea and a quay slab with a grey top
const WATER_Y = 0.55;
const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: PAL.seaMid, roughness: 0.8 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = WATER_Y;
sea.receiveShadow = true;
scene.add(sea);
const QUAY_TOP = 1.0;
const quay = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#a9a9a6', roughness: 0.95 }));
quay.position.set(0, QUAY_TOP - 0.6, 7.2);
quay.receiveShadow = true;
scene.add(quay);

// the bulker with parcels in her holds
const bulker = new ShipModel(4, 3, 'BULK TEST', [], 'MONROVIA', 'bulker');
bulker.group.position.set(0, WATER_Y - 0.5, 1.2);
bulker.setWater(WATER_Y, 0);
scene.add(bulker.group);
console.assert(bulker.tiers === 1, 'bulker tiers must be 1');
const inHolds = SETS[Math.min(set, SETS.length) - 1];
const tmp = new THREE.Vector3();
for (let i = 0; i < 3; i++) {
  const m = makeParcel({ color: PORT_COLORS[(i + 1) % PORT_COLORS.length], weight: WEIGHTS[i], commodity: inHolds[i], destCode: CODES[(i + 1) % CODES.length] });
  m.position.copy(bulker.slotPos(i, 0, tmp));
  bulker.cargo.add(m);
}
// hold 3 is empty: the forward crane hovers a parcel over it on the grab, the aft crane waits
const lifted = makeParcel({ color: PORT_COLORS[3], weight: WEIGHTS[3], commodity: inHolds[3], destCode: CODES[3] });
const target = bulker.slotPos(3, 0).add(new THREE.Vector3(0, 0.95, 0.0));
lifted.position.copy(target);
bulker.cargo.add(lifted);
bulker.cranes[1].follow(target);
bulker.cranes[0].park();
for (let k = 0; k < 4; k++) for (const c of bulker.cranes) c.update(0, true);

// a feeder for comparison
const feeder = new ShipModel(4, 2, 'FEEDER TEST');
feeder.group.position.set(1.0, WATER_Y - 0.5, -4.6);
feeder.setWater(WATER_Y, 0);
scene.add(feeder.group);
const flags: FlagId[] = ['A', 'B', 'C', 'D'];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < (i === 3 ? 1 : 2); j++) {
    const b = makeBox({ color: PORT_COLORS[(i + j) % PORT_COLORS.length], weight: 2 + i + j, flag: flags[i] });
    b.position.copy(feeder.slotPos(i, j, tmp));
    feeder.cargo.add(b);
  }
}
feeder.cranes[1].park();
for (const c of feeder.cranes) c.update(0, true);

// every commodity on the quay
const tags: { el: HTMLElement; at: THREE.Vector3 }[] = [];
const ROW_Z = 7.0;
COMMODITIES.forEach((c, i) => {
  const m = makeParcel({ color: PORT_COLORS[i % PORT_COLORS.length], weight: WEIGHTS[i], commodity: c, destCode: CODES[i % CODES.length] });
  const x = (i - (COMMODITIES.length - 1) / 2) * 1.2;
  m.position.set(x, QUAY_TOP + BOX_H / 2, ROW_Z);
  scene.add(m);
  const el = document.createElement('div');
  el.className = 'tag';
  el.textContent = c;
  if (q.get('labels') !== '0') document.body.appendChild(el);
  tags.push({ el, at: new THREE.Vector3(x, QUAY_TOP - 0.02, ROW_Z + 0.5) });
});
// a container beside the row for scale
const box = makeBox({ color: PORT_COLORS[1], weight: 4, flag: 'B' });
box.position.set((COMMODITIES.length / 2 + 0.3) * 1.2 + 0.2, QUAY_TOP + BOX_H / 2, ROW_Z);
scene.add(box);

if (q.get('bounds')) {
  const lim = new THREE.Vector3(BOX_LEN / 2, BOX_H / 2, BOX_W / 2);
  document.getElementById('info')!.textContent = COMMODITIES.map((c) => {
    const b = parcelBounds(c);
    const ok = b.max.x <= lim.x + 1e-3 && -b.min.x <= lim.x + 1e-3 && b.max.y <= lim.y + 1e-3 && -b.min.y <= lim.y + 1e-3 && b.max.z <= lim.z + 1e-3 && -b.min.z <= lim.z + 1e-3;
    return `${c.padEnd(10)} x ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)}  y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)}  z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}  ${ok ? 'ok' : 'OUT OF BOX'}`;
  }).join('\n') + `\nlimits  x +-${lim.x}  y +-${lim.y}  z +-${lim.z}   LIGHT_Y ${LIGHT_Y}`;
}

// the game's camera: perspective, a three-quarter view from the bow quarter
const YAW = (19 * Math.PI) / 180;
const PITCH = (30 * Math.PI) / 180;
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200);
const VIEWS: Record<string, { at: [number, number, number]; span: number }> = {
  all: { at: [0.9, 0.6, 2.3], span: 18.5 },
  ship: { at: [0, 1.5, 1.2], span: 10.5 },
  holds: { at: [0.5, 1.7, 1.2], span: 5.6 },
  quay: { at: [0, 1.2, 7.0], span: 12.5 },
  feeder: { at: [1.0, 1.5, -4.6], span: 10.5 },
  crane: { at: [2.1, 2.3, 1.2], span: 4.2 },
};
function layout(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const vf = (VIEWS[view] ?? VIEWS.all);
  const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const dist = vf.span / 2 / Math.tan(hfov / 2);
  const at = new THREE.Vector3(...vf.at);
  camera.position.copy(at).add(new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)).multiplyScalar(dist));
  camera.lookAt(at);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  for (const t of tags) {
    const p = t.at.clone().project(camera);
    t.el.style.left = `${((p.x + 1) / 2) * w}px`;
    t.el.style.top = `${((1 - p.y) / 2) * h}px`;
  }
}
window.addEventListener('resize', layout);
layout();

let clock = 0;
renderer.setAnimationLoop(() => {
  clock += 1 / 60;
  bulker.setWater(WATER_Y, clock);
  renderer.render(scene, camera);
});
