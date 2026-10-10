import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HullGeometry } from '../hull';
import { PAL } from '../palette';

/** Rails use the hull's centred coordinates; bow equipment uses ship-body coordinates. */
export function buildBulwark(group: THREE.Group, hull: HullGeometry, length: number): void {
  const parts: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = -length / 2 + 0.05 + (length - 0.12) * i / 40;
      points.push(new THREE.Vector3(x, hull.deckAt(x) + 0.09, sign * Math.max(0, hull.halfBeamAt(x) - 0.02)));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.018, 5));
    for (let i = 0; i < 32; i++) {
      const x = -length / 2 + 0.2 + (length - 0.5) * i / 31;
      parts.push(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4)
        .translate(x, hull.deckAt(x) + 0.045, sign * (hull.halfBeamAt(x) - 0.02)));
    }
  }
  const stern = -length / 2 + 0.05;
  const width = hull.halfBeamAt(stern) - 0.02;
  parts.push(new THREE.CylinderGeometry(0.018, 0.018, width * 2, 5)
    .rotateX(Math.PI / 2).translate(stern, hull.deckAt(stern) + 0.09, 0));
  addMerged(group, parts, PAL.white, 'deck-rails');
}

export interface DeckFittingsContext {
  body: THREE.Group;
  hull: HullGeometry;
  hullOffsetX: number;
  bowX: number;
  sternX: number;
  deckY: number;
  cargoLength: number;
  beam: number;
}

/** Mooring gear lives outside the cargo block so every bay remains clear for a lift. */
export function buildDeckFittings(ctx: DeckFittingsContext): THREE.Vector3 {
  const { body, hull, hullOffsetX, bowX, sternX, cargoLength, beam } = ctx;
  const deckAt = (x: number): number => hull.deckAt(x - hullOffsetX);
  const halfBeamAt = (x: number): number => hull.halfBeamAt(x - hullOffsetX);
  const parts = { white: [], steel: [], dark: [], brass: [] } as Record<'white' | 'steel' | 'dark' | 'brass', THREE.BufferGeometry[]>;
  const box = (key: keyof typeof parts, x: number, y: number, z: number, w: number, h: number, d: number): void => {
    parts[key].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  };
  const cylinder = (key: keyof typeof parts, x: number, y: number, z: number, r: number, h: number, axis: 'y' | 'z' = 'y'): void => {
    const geo = new THREE.CylinderGeometry(r, r, h, 8);
    if (axis === 'z') geo.rotateX(Math.PI / 2);
    parts[key].push(geo.translate(x, y, z));
  };

  // Paired bitts and their cap plates at the stern and on the foredeck.
  for (const x of [sternX + 0.18, bowX - 1.0]) {
    const y = deckAt(x);
    for (const sign of [-1, 1]) {
      const z = sign * (halfBeamAt(x) - 0.15);
      box('steel', x, y + 0.02, z, 0.25, 0.04, 0.13);
      for (const dx of [-0.065, 0.065]) {
        cylinder('dark', x + dx, y + 0.09, z, 0.027, 0.13);
        cylinder('dark', x + dx, y + 0.16, z, 0.042, 0.025);
      }
    }
  }

  const mastX = bowX - 0.75;
  const mastBase = deckAt(mastX);
  cylinder('steel', mastX, mastBase + 0.025, 0, 0.065, 0.05);
  cylinder('brass', mastX, mastBase + 0.35, 0, 0.023, 0.7);
  box('brass', mastX, mastBase + 0.56, 0, 0.028, 0.025, 0.26);
  cylinder('white', mastX, mastBase + 0.65, 0, 0.04, 0.055);

  // Windlass with two chain gypsies on a transverse shaft and a compact motor.
  const winchX = bowX - 0.43;
  const winchY = deckAt(winchX);
  box('steel', winchX, winchY + 0.026, 0, 0.23, 0.052, 0.44);
  for (const sign of [-1, 1]) {
    box('steel', winchX, winchY + 0.09, sign * 0.16, 0.055, 0.13, 0.045);
    cylinder('dark', winchX, winchY + 0.14, sign * 0.105, 0.08, 0.055, 'z');
    cylinder('steel', winchX, winchY + 0.14, sign * 0.21, 0.067, 0.045, 'z');
    const endX = bowX - 0.13;
    const chain = new THREE.CatmullRomCurve3([
      new THREE.Vector3(winchX, winchY + 0.17, sign * 0.105),
      new THREE.Vector3(winchX + 0.12, deckAt(winchX + 0.12) + 0.028, sign * 0.12),
      new THREE.Vector3(endX, deckAt(endX) + 0.026, sign * 0.13),
    ]);
    parts.dark.push(new THREE.TubeGeometry(chain, 10, 0.014, 5));
    // Hawse pipe and an anchor tucked under the sheer, away from the load mark.
    const anchorX = bowX - 0.6;
    const z = sign * (halfBeamAt(anchorX) + 0.015);
    cylinder('steel', anchorX, deckAt(anchorX) - 0.14, z, 0.063, 0.028, 'z');
    box('dark', anchorX, deckAt(anchorX) - 0.255, z + sign * 0.02, 0.035, 0.17, 0.028);
    box('dark', anchorX, deckAt(anchorX) - 0.33, z + sign * 0.02, 0.16, 0.035, 0.04);
    for (const dx of [-0.065, 0.065]) {
      parts.dark.push(new THREE.BoxGeometry(0.042, 0.075, 0.045)
        .rotateZ(dx < 0 ? -0.35 : 0.35).translate(anchorX + dx, deckAt(anchorX) - 0.30, z + sign * 0.02));
    }
  }
  cylinder('steel', winchX, winchY + 0.14, 0, 0.036, 0.43, 'z');
  box('white', winchX - 0.06, winchY + 0.12, 0, 0.1, 0.13, 0.13);

  // Low breakwater with sloping shoulders and supports, forward of the crane pedestal.
  const breakX = cargoLength / 2 + 0.95;
  const breakY = deckAt(breakX);
  const shape = new THREE.Shape();
  const half = Math.min(beam / 2 - 0.15, halfBeamAt(breakX) - 0.06);
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half * 0.82, 0.2);
  shape.lineTo(-half * 0.82, 0.2);
  shape.closePath();
  parts.white.push(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(breakX, breakY, 0));
  for (const z of [-half * 0.65, 0, half * 0.65]) {
    parts.steel.push(new THREE.BoxGeometry(0.15, 0.024, 0.025)
      .rotateZ(0.75).translate(breakX - 0.055, breakY + 0.06, z));
  }
  addMerged(body, parts.white, PAL.white, 'foredeck-paint');
  addMerged(body, parts.steel, '#71847d', 'mooring-machinery');
  addMerged(body, parts.dark, '#29363e', 'anchors-and-chains');
  addMerged(body, parts.brass, PAL.mast, 'foremast');
  return new THREE.Vector3(mastX, mastBase + 0.7, 0);
}

function addMerged(group: THREE.Group, parts: THREE.BufferGeometry[], color: string, name: string): void {
  // Extruded plates are non-indexed; normalise before merging with boxes and tubes.
  const source = parts.map((part) => part.index ? part.toNonIndexed() : part);
  const geometry = mergeGeometries(source, false);
  for (const part of new Set([...parts, ...source])) part.dispose();
  if (!geometry) throw new Error(`Could not build ship fittings: ${name}`);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08 }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}
