import '@fontsource-variable/oswald';
import '@fontsource-variable/sofia-sans';
import { HarbourView } from './render/HarbourView';
import { loadFonts } from './render/paint';
import { makeBox } from './render/boxes';
import { PORT_COLORS } from './render/palette';
import type { FlagId } from './render/flags';

document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;background:#bfe3f5';
const stage = document.getElementById('stage')!;
stage.style.cssText = 'position:fixed;inset:0';

await loadFonts();
const view = new HarbourView(stage);
view.build(4, 3);
const flags: FlagId[] = ['K', 'A', 'O', 'T'];
// some boxes on the ship and on the quay
const load: [number, number, number][] = [[0, 0, 0], [0, 1, 1], [1, 0, 2], [2, 0, 0], [2, 1, 0], [3, 0, 1]];
for (const [i, j, p] of load) {
  const b = makeBox({ color: PORT_COLORS[p], weight: 1 + ((i + j) % 4), flag: flags[p] });
  view.ship.slotPos(i, j, b.position);
  view.ship.cargo.add(b);
}
for (let k = 0; k < 7; k++) {
  const p = k % 3;
  const b = makeBox({ color: PORT_COLORS[p], weight: 1 + (k % 5), flag: flags[p], kind: k === 4 ? 'reefer' : undefined });
  b.position.set(-3 + (k % 4) * 1.7, 0.42 + 0.28, 2.6 + Math.floor(k / 4) * 1.1);
  view.scene.add(b);
}
view.setLoad(0.6);
// a test lift: a box swings from the quay onto bay 3, tier 1, and back, forever
import * as THREE from 'three';
import { arc, ease } from './render/anim';
const test = makeBox({ color: PORT_COLORS[1], weight: 3, flag: 'A' });
view.ship.cargo.add(test);
const from = new THREE.Vector3(2.5, 0.7, 3.2);
const to = new THREE.Vector3();
const tmp = new THREE.Vector3();
let dir = 0;
const lift = () => {
  view.ship.slotPos(3, 1, to);
  const a = view.ship.body.worldToLocal(from.clone());
  const [p0, p1] = dir ? [to.clone(), a] : [a, to.clone()];
  dir ^= 1;
  view.tweens.add(1.1, (k) => {
    arc(p0, p1, 1.6, k, tmp);
    test.position.copy(tmp);
    view.ship.crane.follow(tmp);
  }, { ease: ease.inOutCubic, done: () => view.tweens.after(0.6, lift) });
};
lift();
const resize = () => view.resize(window.innerWidth, window.innerHeight);
resize();
window.addEventListener('resize', resize);
let last = performance.now();
const loop = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  view.update(dt);
  view.ship.crane.update(dt);
  view.render();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
