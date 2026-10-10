import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from '../palette';

export interface CargoDeckContext {
  body: THREE.Group;
  stacks: number;
  tiers: number;
  kind: 'feeder' | 'bulker';
  deckY: number;
  beam: number;
  slot: number;
  boxHeight: number;
  holdFloor: number;
  coamingHeight: number;
  plugs: readonly number[];
}

interface Finish {
  color: string;
  roughness: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow?: boolean;
}

/** Bake static fittings into one mesh per finish, retaining no temporary geometries. */
class DeckParts<K extends string> {
  private readonly parts = new Map<K, THREE.BufferGeometry[]>();

  constructor(private readonly finishes: Record<K, Finish>) {}

  add(key: K, geometry: THREE.BufferGeometry): void {
    const bucket = this.parts.get(key);
    if (bucket) bucket.push(geometry);
    else this.parts.set(key, [geometry]);
  }

  box(key: K, x: number, y: number, z: number, width: number, height: number, depth: number): void {
    this.add(key, new THREE.BoxGeometry(width, height, depth).translate(x, y, z));
  }

  cylinder(key: K, x: number, y: number, z: number, radius: number, height: number, rotation?: THREE.Euler): void {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    this.add(key, geometry.translate(x, y, z));
  }

  rod(key: K, start: THREE.Vector3, end: THREE.Vector3, radius: number): void {
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    this.add(key, geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray()));
  }

  finish(group: THREE.Group): void {
    for (const [key, geometries] of this.parts) {
      let geometry: THREE.BufferGeometry | null;
      try {
        geometry = mergeGeometries(geometries, false);
      } finally {
        for (const part of geometries) part.dispose();
      }
      if (!geometry) throw new Error(`Could not merge cargo deck finish: ${key}`);
      const { castShadow = true, ...properties } = this.finishes[key];
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(properties));
      mesh.name = `cargo-deck:${key}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
  }
}

/**
 * Build the fixed deck around the existing cargo positions. Bay centres and hatch floors
 * deliberately use the same dimensions as ShipModel.slotPos; fittings stay outside its cargo.
 * The returned group owns its geometry/materials and can be disposed by ordinary traversal.
 */
export function buildCargoDeck(ctx: CargoDeckContext): THREE.Group {
  const group = new THREE.Group();
  group.name = `cargo-deck:${ctx.kind}`;
  if (ctx.kind === 'bulker') buildHolds(ctx, group);
  else buildCellGuides(ctx, group);
  ctx.body.add(group);
  return group;
}

function bayX(ctx: CargoDeckContext, i: number): number {
  return -((ctx.stacks - 1) * ctx.slot) / 2 + i * ctx.slot;
}

function buildCellGuides(ctx: CargoDeckContext, group: THREE.Group): void {
  const parts = new DeckParts({
    hatch: { color: PAL.hatch, roughness: 0.65 },
    rib: { color: '#35505f', roughness: 0.65 },
    bridge: { color: '#d9d4c7', roughness: 0.6 },
    steel: { color: '#46555b', roughness: 0.65, metalness: 0.15 },
    rubber: { color: '#252e34', roughness: 0.85 },
    white: { color: '#f8f7f2', roughness: 0.5 },
    reefer: { color: '#1e4fa3', roughness: 0.4, emissive: '#1e4fa3', emissiveIntensity: 0.2 },
  });
  const cargoLength = ctx.stacks * ctx.slot;
  const bridgeZ = ctx.beam / 2 - 0.2;
  const h = ctx.tiers * ctx.boxHeight * 0.62;
  const plugs = new Set(ctx.plugs);

  for (let i = 0; i < ctx.stacks; i++) {
    const cx = bayX(ctx, i);
    // Keep the gameplay hatch footprint and elevation unchanged.
    parts.box('hatch', cx, ctx.deckY + 0.035, 0, ctx.slot - 0.06, 0.07, ctx.beam - 0.36);
    for (let k = 0; k < 3; k++) {
      parts.box('rib', cx - 0.3 + k * 0.3, ctx.deckY + 0.075, 0, 0.03, 0.02, ctx.beam - 0.4);
    }
    for (const sz of [-1, 1]) {
      // Hatch dogs and corner twistlock sockets read when a bay is empty.
      for (const sx of [-1, 1]) {
        parts.box('steel', cx + sx * 0.31, ctx.deckY + 0.052, sz * (ctx.beam / 2 - 0.166), 0.045, 0.025, 0.046);
        parts.box('bridge', cx + sx * 0.31, ctx.deckY + 0.066, sz * (ctx.beam / 2 - 0.166), 0.015, 0.016, 0.064);
        parts.box('steel', cx + sx * (ctx.slot / 2 - 0.1), ctx.deckY + 0.074, sz * 0.285, 0.044, 0.008, 0.042);
      }
    }

    if (plugs.has(i)) {
      const plateY = ctx.deckY - 0.12;
      const plateZ = ctx.beam / 2 + 0.005;
      // Geometry keeps the blue reefer mark crisp without a per-bay texture or DOM canvas.
      const plate = new THREE.Shape();
      const r = 0.025;
      const half = 0.15;
      plate.moveTo(-half + r, -half);
      plate.lineTo(half - r, -half);
      plate.quadraticCurveTo(half, -half, half, -half + r);
      plate.lineTo(half, half - r);
      plate.quadraticCurveTo(half, half, half - r, half);
      plate.lineTo(-half + r, half);
      plate.quadraticCurveTo(-half, half, -half, half - r);
      plate.lineTo(-half, -half + r);
      plate.quadraticCurveTo(-half, -half, -half + r, -half);
      parts.add('reefer', new THREE.ShapeGeometry(plate, 4).translate(cx, plateY, plateZ));
      for (let k = 0; k < 3; k++) {
        parts.add('white', new THREE.BoxGeometry(0.19, 0.013, 0.004)
          .rotateZ(k * Math.PI / 3).translate(cx, plateY, plateZ + 0.004));
      }
      // A low power cabinet and cable reel on the outboard passage.
      const fittingZ = ctx.beam / 2 - 0.08;
      parts.box('white', cx + 0.23, ctx.deckY + 0.08, fittingZ, 0.105, 0.15, 0.073);
      parts.box('reefer', cx + 0.23, ctx.deckY + 0.08, fittingZ + 0.04, 0.07, 0.08, 0.008);
      parts.cylinder('rubber', cx + 0.23, ctx.deckY + 0.084, fittingZ + 0.047, 0.02, 0.009, new THREE.Euler(Math.PI / 2, 0, 0));
      parts.cylinder('rubber', cx - 0.23, ctx.deckY + 0.054, fittingZ, 0.039, 0.054, new THREE.Euler(Math.PI / 2, 0, 0));
      for (const dz of [-0.031, 0.031]) {
        parts.cylinder('steel', cx - 0.23, ctx.deckY + 0.054, fittingZ + dz, 0.048, 0.009, new THREE.Euler(Math.PI / 2, 0, 0));
      }
    }
  }

  // Narrow side passages leave the full container footprint and the reefer sign visible.
  for (const sz of [-1, 1]) {
    parts.box('steel', 0, ctx.deckY + 0.01, sz * (ctx.beam / 2 - 0.115), cargoLength, 0.014, 0.11);
  }
  for (let i = 0; i <= ctx.stacks; i++) {
    const x = -cargoLength / 2 + i * ctx.slot;
    for (const z of [-bridgeZ, bridgeZ]) {
      parts.box('steel', x, ctx.deckY + 0.012, z, 0.065, 0.024, 0.095);
      // An I section gives the lashing bridges depth at the same bay boundaries.
      parts.box('bridge', x, ctx.deckY + h / 2, z, 0.022, h, 0.022);
      for (const dx of [-0.015, 0.015]) {
        parts.box('bridge', x + dx, ctx.deckY + h / 2, z, 0.012, h, 0.044);
      }
      parts.box('steel', x, ctx.deckY + h - 0.008, z, 0.056, 0.016, 0.065);
    }
    parts.box('bridge', x, ctx.deckY + h, 0, 0.03, 0.035, ctx.beam - 0.4);
    parts.box('rib', x, ctx.deckY + h - 0.018, 0, 0.017, 0.022, ctx.beam - 0.43);
  }
  parts.finish(group);
}

function buildHolds(ctx: CargoDeckContext, group: THREE.Group): void {
  const parts = new DeckParts({
    green: { color: '#2e4a3f', roughness: 0.6 },
    rib: { color: '#3d5e50', roughness: 0.65 },
    yellow: { color: '#e3ae1b', roughness: 0.55 },
    dark: { color: '#232b31', roughness: 0.85, castShadow: false },
    floor: { color: '#171d22', roughness: 0.9, castShadow: false },
    red: { color: '#8a3a2b', roughness: 0.6 },
    redRib: { color: '#6a2a1f', roughness: 0.65 },
    steel: { color: '#2d343b', roughness: 0.65, metalness: 0.1 },
    pipe: { color: '#7c8a86', roughness: 0.55, metalness: 0.2 },
  });
  const length = ctx.slot - 0.06;
  const width = 1.06;
  const thickness = 0.05;
  const sink = 0.09;
  const top = ctx.deckY + ctx.coamingHeight;
  const innerLength = length - 2 * thickness;
  const innerWidth = width - 2 * thickness;
  const innerHeight = ctx.coamingHeight - ctx.holdFloor;
  const wallY = top - (ctx.coamingHeight + sink) / 2;
  const linerY = ctx.deckY + (ctx.holdFloor + ctx.coamingHeight) / 2 - 0.012;

  for (let i = 0; i < ctx.stacks; i++) {
    const cx = bayX(ctx, i);
    for (const sz of [-1, 1]) {
      parts.box('green', cx, wallY, sz * (width / 2 - thickness / 2), length, ctx.coamingHeight + sink, thickness);
      parts.box('yellow', cx, top - 0.008, sz * (width / 2 - thickness / 2), length + 0.014, 0.026, thickness + 0.014);
      parts.box('dark', cx, linerY, sz * (innerWidth / 2 - 0.004), innerLength, innerHeight, 0.008);
      for (const k of [-0.31, -0.105, 0.105, 0.31]) {
        parts.box('rib', cx + k, top - 0.1, sz * (width / 2 + 0.012), 0.034, 0.17, 0.03);
      }
      for (const k of [-0.23, 0.23]) {
        parts.box('steel', cx + k, ctx.deckY + 0.025, sz * (width / 2 + 0.005), 0.05, 0.025, 0.008);
      }
    }
    for (const sx of [-1, 1]) {
      parts.box('green', cx + sx * (length / 2 - thickness / 2), wallY, 0, thickness, ctx.coamingHeight + sink, width - 2 * thickness);
      parts.box('yellow', cx + sx * (length / 2 - thickness / 2), top - 0.008, 0, thickness + 0.014, 0.026, width - 2 * thickness);
      parts.box('dark', cx + sx * (innerLength / 2 - 0.004), linerY, 0, 0.008, innerHeight, innerWidth);
      for (const k of [-0.33, -0.11, 0.11, 0.33]) {
        parts.box('rib', cx + sx * (length / 2 + 0.012), top - 0.1, k, 0.03, 0.17, 0.034);
      }
    }
    // Exact original opening and floor: bulk parcel bins still stand at holdFloor.
    parts.box('floor', cx, ctx.deckY + ctx.holdFloor - 0.012, 0, innerLength, 0.024, innerWidth);
    for (const k of [-0.25, 0, 0.25]) {
      parts.box('steel', cx + k, linerY, -innerWidth / 2 + 0.012, 0.03, innerHeight, 0.012);
    }

    const panelWidth = innerWidth - 0.04;
    const panelHeight = 0.27;
    const lean = -0.15;
    for (const k of [0, 1]) {
      const foot = new THREE.Vector3(cx - length / 2 + thickness / 2 + 0.005 + k * 0.058, top - 0.005, 0);
      const panelPart = (key: 'red' | 'redRib' | 'yellow', px: number, py: number, pz: number, w: number, h: number, d: number): void => {
        parts.add(key, new THREE.BoxGeometry(w, h, d).translate(px, py, pz)
          .rotateZ(lean).translate(foot.x, foot.y, foot.z));
      };
      panelPart('red', 0, panelHeight / 2, 0, 0.024, panelHeight, panelWidth);
      for (const rz of [-0.36, -0.12, 0.12, 0.36]) {
        panelPart('redRib', 0.017, panelHeight / 2, rz, 0.012, panelHeight - 0.04, 0.03);
      }
      for (const sz of [-1, 1]) {
        panelPart('redRib', 0.016, panelHeight / 2, sz * (panelWidth / 2 - 0.01), 0.014, panelHeight, 0.018);
      }
      panelPart('yellow', 0, panelHeight - 0.006, 0, 0.03, 0.014, panelWidth + 0.01);
    }

    // Continuous hinge shaft, collars and short lifting pistons beside the folded covers.
    const hingeX = cx - length / 2 + thickness / 2 + 0.03;
    parts.cylinder('steel', hingeX, top + 0.012, 0, 0.015, panelWidth, new THREE.Euler(Math.PI / 2, 0, 0));
    for (const sz of [-1, 1]) {
      parts.box('steel', hingeX, top + 0.012, sz * (panelWidth / 2 - 0.02), 0.07, 0.03, 0.05);
      const pistonZ = sz * (width / 2 + 0.006);
      const base = new THREE.Vector3(cx - length / 2 + 0.16, top - 0.075, pistonZ);
      const end = new THREE.Vector3(cx - length / 2 + 0.11, top + 0.115, pistonZ);
      parts.rod('pipe', base, end, 0.007);
      parts.rod('steel', base, base.clone().lerp(end, 0.58), 0.014);
    }
  }

  // Pipes and their mounts share merged meshes across all bays.
  const cargoLength = ctx.stacks * ctx.slot;
  for (const sz of [-1, 1]) {
    const z = sz * (ctx.beam / 2 - 0.105);
    parts.cylinder('pipe', 0, ctx.deckY + 0.05, z, 0.022, cargoLength - 0.1, new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i <= ctx.stacks; i++) {
      const x = Math.min(Math.max(-cargoLength / 2 + i * ctx.slot, -cargoLength / 2 + 0.05), cargoLength / 2 - 0.05);
      parts.box('steel', x, ctx.deckY + 0.025, z, 0.04, 0.05, 0.05);
      if (i > 0 && i < ctx.stacks) {
        parts.cylinder('pipe', x, ctx.deckY + 0.05, z, 0.032, 0.017, new THREE.Euler(0, 0, Math.PI / 2));
      }
    }
    const valveX = -cargoLength / 2 + 0.24;
    parts.cylinder('steel', valveX, ctx.deckY + 0.085, z, 0.012, 0.06);
    parts.add('redRib', new THREE.TorusGeometry(0.032, 0.006, 5, 12)
      .rotateX(Math.PI / 2).translate(valveX, ctx.deckY + 0.118, z));
    parts.box('redRib', valveX, ctx.deckY + 0.118, z, 0.06, 0.008, 0.008);
  }
  parts.finish(group);
}
