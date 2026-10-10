import * as THREE from 'three';
import { hashString, Rng } from '../../core/rng';
import { nationOfPort, NATIONS, type Nation } from '../nations';
import { PortKit, MOLE_Z, SHORE_Z } from './kit';
import { buildTown, quayWall } from './town';
import { harbourBoats } from './props';
import { breakwater, LH_STYLES } from './harbour';
import { addFlagpole } from './flag';
import { REGIONS, flavor, genericRegion, paintFields, plant, type Region } from './regions';
import { NATION_REGION, PORT_TABLE, norm } from './registry';
import { LANDMARKS } from './landmarks';
import './table';

export { disposePortScene, setPortNight } from './kit';

/**
 * A complete backdrop for one port: breakwater with a lighthouse (or a landmark), far shore, town, regional
 * trees and set pieces, a recognisable landmark for well-known ports, and the national flag on a pole.
 * World coordinates match the game's stage: ship at z = 0, quay at z > 1.5, breakwater at z ≈ -7.2,
 * far shore at z ≈ -12 and beyond. Nothing is built nearer than the breakwater's armour (z ≤ -6.3).
 * `width` is how far it must extend along x (≥ 40).
 *
 * The returned group has `userData.update(timeSeconds)`: call it every frame to wave the flag and spin
 * the wind-turbine rotors (a vertex wave and ≤ 8 instance matrices: negligible). `disposePortScene(group)`
 * frees its geometry and flag texture. `setPortNight(on)` lights the town windows warm for every scene at
 * once (they are dark by day).
 */
export function buildPortScene(portName: string, width: number, country?: string): THREE.Group {
  const w = Math.max(40, width);
  const key = norm(portName);
  const entry = PORT_TABLE[key];
  // the level's UN/LOCODE country wins (Cartagena, Colombia is not Cartagena, Spain)
  const nation: Nation | null = country && (NATIONS as readonly string[]).includes(country) ? (country as Nation) : nationOfPort(portName);
  const seed = hashString(key || 'port');
  const k = new PortKit(portName, w, seed);
  const lm = entry?.landmark ? LANDMARKS[entry.landmark] : undefined;
  const baseRegion: Region = entry ? REGIONS[entry.region] : nation && NATION_REGION[nation] ? REGIONS[NATION_REGION[nation]!] : genericRegion(new Rng(seed ^ 0x6e31));
  const region = flavor(baseRegion, new Rng(seed ^ 0xf1a7));
  k.palette = { ...region.palette };
  k.shape = { ...region.shape };
  k.shore = region.shore;
  if (region.fields) paintFields(k, region.fields);

  const stages: Array<[string, number]> = [];
  const mark = (n: string) => stages.push([n, k.solid.tris]);
  // the breakwater's head is decided first, so a landmark can build on it or keep clear of it
  const rng = new Rng(seed ^ 0x2f1);
  const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  const lights = region.lights ?? [0, 1, 2, 3, 4, 5];
  const lightPick = LH_STYLES[lights[Math.floor(rng.next() * lights.length)]];
  const moleSet = lm?.mole === 'none' ? null : { endX: k.vx(MOLE_Z) - dir * rng.range(3.0, 4.2), dir, ...(lm?.mole ?? {}) };
  if (moleSet) k.mole = { endX: moleSet.endX, dir: moleSet.dir, top: 0.5, z: MOLE_Z };
  // 1. ground
  lm?.terrain?.(k);
  // 2. landmark, then the town around it
  lm?.build(k);
  mark('landmark');
  const rows = lm?.rows ?? region.rows;
  if (rows > 0) {
    const shift = lm?.townShift ?? 0;
    buildTown(k, { x0: -w / 2 - 2, x1: w / 2 + 2, z: SHORE_Z - 1.3, rows, rowStep: region.rowStep, hs: region.houses, gaps: region.gaps, rowRise: region.rowRise, cx: k.vx(SHORE_Z - 2) + shift });
  }
  mark('town');
  if (k.shore === 'quay') quayWall(k, -w / 2 - 4, w / 2 + 4);
  plant(k, region);
  mark('plant');
  if (!lm?.quiet) {
    region.extras?.(k, rng);
    if (region.boats) harbourBoats(k, rng, region.boats.kinds, region.boats.n, region.boats.colors);
  }
  mark('extras');

  // 3. breakwater and its light
  let flagX = 0;
  let flagY = 0.55;
  let flagZ = MOLE_Z;
  if (moleSet) {
    const moleOpts = { armour: region.armour, tone: region.moleTone, light: lightPick, ...moleSet };
    const r = breakwater(k, moleOpts);
    flagX = r.headX + moleOpts.dir * 1.6;
    flagY = r.top + 0.03;
    flagZ = r.z;
  }
  // 4. the flag: on the mole beside the head, or where the landmark asks
  if (lm?.flag) {
    flagX = k.vx(lm.flag.z, lm.flag.dx);
    flagZ = lm.flag.z;
    flagY = lm.flag.y ?? k.ground(flagX, flagZ);
  }
  mark('mole');
  addFlagpole(k, nation, portName, flagX, flagY, flagZ, { height: 2.5, width: 1.05 });

  const g = k.finish();
  g.name = `port:${portName}`;
  g.userData.stages = stages.map(([n, t], i) => `${n}:${t - (i ? stages[i - 1][1] : 0)}`).join(' ');
  return g;
}

export { LH_STYLES };
