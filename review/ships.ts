import '@fontsource-variable/oswald';
import '@fontsource-variable/sofia-sans';
import * as THREE from 'three';
import { ShipModel, type ShipKind } from '../src/render/ship';
import { makeBox } from '../src/render/boxes';
import { COMMODITIES, makeParcel } from '../src/render/bulk';
import { loadFonts } from '../src/render/paint';
import { PAL, PORT_COLORS } from '../src/render/palette';
import { addHarbourLights, createRenderer } from '../src/render/stage';
import type { FlagId } from '../src/render/flags';

const query = new URLSearchParams(location.search);
const count = (name: string, fallback: number, min: number, max: number): number => {
  const value = Number(query.get(name) ?? fallback);
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
};
const kind: ShipKind = query.get('kind') === 'bulker' ? 'bulker' : 'feeder';
const bays = count('bays', 4, 2, 5);
const tiers = count('tiers', 2, 1, 3);
const loaded = query.get('loaded') !== '0';
const angle = ['side', 'bow', 'stern'].includes(query.get('angle') ?? '') ? query.get('angle')! : 'bow';

const form = document.querySelector<HTMLFormElement>('form')!;
for (const [name, value] of Object.entries({ kind, bays, tiers: kind === 'bulker' ? 1 : tiers, loaded: loaded ? 1 : 0, angle })) {
  const control = form.elements.namedItem(name) as HTMLSelectElement;
  control.value = String(value);
  if (name === 'tiers') control.disabled = kind === 'bulker';
}
form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('change', () => {
  const next = new URLSearchParams(query);
  for (const name of ['kind', 'bays', 'tiers', 'loaded', 'angle']) {
    next.set(name, (form.elements.namedItem(name) as HTMLSelectElement).value);
  }
  location.search = next.toString();
});

await loadFonts();

const host = document.getElementById('gl')!;
const renderer = createRenderer(host);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.skyTop);
addHarbourLights(renderer, scene);

const WATER_Y = 0.55;
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: PAL.seaMid, roughness: 0.8 }),
);
sea.rotation.x = -Math.PI / 2;
sea.position.y = WATER_Y;
sea.receiveShadow = true;
scene.add(sea);

const ship = new ShipModel(bays, tiers, kind === 'bulker' ? 'BULK TEST' : 'FEEDER TEST', [], 'MONROVIA', kind);
ship.group.position.y = WATER_Y - 0.5;
ship.setWater(WATER_Y, 0);
scene.add(ship.group);

if (loaded) {
  const flags: FlagId[] = ['A', 'B', 'C', 'D', 'E'];
  const codes = ['RTM', 'HAM', 'ANR', 'LEH', 'BRE'];
  for (let bay = 0; bay < bays; bay++) {
    for (let tier = 0; tier < ship.tiers; tier++) {
      const cargo = kind === 'bulker'
        ? makeParcel({ color: PORT_COLORS[bay % PORT_COLORS.length], weight: 3 + bay, commodity: COMMODITIES[bay % COMMODITIES.length], destCode: codes[bay] })
        : makeBox({ color: PORT_COLORS[(bay + tier) % PORT_COLORS.length], weight: 2 + bay + tier, flag: flags[bay] });
      cargo.position.copy(ship.slotPos(bay, tier));
      ship.cargo.add(cargo);
    }
  }
}
for (const crane of ship.cranes) {
  crane.park();
  crane.update(0, true);
}

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 250);
const bounds = new THREE.Box3().setFromObject(ship.group);
// Frame the visible hull rather than the submerged keel.
bounds.min.y = Math.max(bounds.min.y, WATER_Y);
const center = bounds.getCenter(new THREE.Vector3());
const yaw = angle === 'side' ? 0 : (angle === 'stern' ? -45 : 19) * Math.PI / 180;
const pitch = 25 * Math.PI / 180;
const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
const up = new THREE.Vector3().crossVectors(direction, right).normalize();
const corner = new THREE.Vector3();

function layout(): void {
  const width = host.clientWidth;
  const height = host.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  const tanY = Math.tan(camera.fov * Math.PI / 360) * 0.86;
  const tanX = tanY * camera.aspect;
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(center);
        const depth = corner.dot(direction);
        distance = Math.max(distance, Math.abs(corner.dot(right)) / tanX + depth, Math.abs(corner.dot(up)) / tanY + depth);
      }
    }
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
}
window.addEventListener('resize', layout);
layout();

document.getElementById('info')!.textContent = `${kind === 'bulker' ? 'Bulk carrier' : 'Container feeder'} · ${bays} bays${kind === 'feeder' ? ` · ${tiers} tiers` : ''} · ${loaded ? 'Loaded' : 'Empty'}`;

declare global {
  interface Window {
    shipReview: {
      ship: ShipModel;
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
    };
  }
}
window.shipReview = { ship, renderer, scene, camera };
