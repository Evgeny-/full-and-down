import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, toTexture, FONT_NUM } from './paint';
import { Rng } from '../core/rng';
import { BOX_H, BOX_LEN, BOX_W } from './ship';

/**
 * Bulk cargo parcels: one lot of a bulk commodity, drawn as ONE mesh a bit like a loaded skip. A low
 * steel bin carries the painted weight plate on its front (+z) face, the commodity is heaped / stacked
 * above the bin's rim. The mesh is centred at its origin and fits inside BOX_LEN x BOX_H x BOX_W, so it
 * drops in wherever a container box would go.
 */

export type Commodity = 'grain' | 'coal' | 'ore' | 'timber' | 'steel' | 'fertiliser' | 'salt' | 'sugar' | 'scrap';

export interface ParcelLook {
  color: string;
  weight: number;
  commodity: Commodity;
  destCode: string;
}

/** Every commodity, in a fixed order (review pages, legends). */
export const COMMODITIES: readonly Commodity[] = ['grain', 'coal', 'ore', 'timber', 'steel', 'fertiliser', 'salt', 'sugar', 'scrap'];

/** Material slots of a parcel mesh (the order of `mesh.material`). */
export const PARCEL_SLOT = { matte: 0, metal: 1, plate: 2, rim: 3 } as const;

// ───────────────────────────── layout (base space: y = 0 is the bin's underside) ─────────────────────────────

/** Bin (the base tray): length along x, height, and how far its top is inset from its foot. */
const BIN_L = 0.8;
const BIN_H = 0.26;
const BIN_INSET = 0.03;
/** Bin depth (z): narrower than the box so a hold's near coaming doesn't hide the plate. */
const BIN_W = Math.min(0.54, BOX_W);
/** Room for the cargo above the bin's top face. */
const CARGO_H = BOX_H - BIN_H - 0.006;
/** Half extents of the cargo's footprint (inside the rim). */
const FX = 0.35;
const FZ = 0.21;

const MATTE = PARCEL_SLOT.matte;
const METAL = PARCEL_SLOT.metal;
const PLATE = PARCEL_SLOT.plate;
const RIM = PARCEL_SLOT.rim;

// ───────────────────────────── geometry plumbing ─────────────────────────────

type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);

function ramp(a: string, b: string): (t: number) => THREE.Color {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const out = new THREE.Color();
  return (t) => out.copy(ca).lerp(cb, Math.min(1, Math.max(0, t)));
}

function xf(geo: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1): THREE.BufferGeometry {
  const s = typeof scale === 'number' ? ([scale, scale, scale] as const) : scale;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
  return geo.applyMatrix4(m);
}

/** Flip a geometry inside out (normals and winding). */
function invert(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = g.attributes[name];
    if (!a) continue;
    const size = a.itemSize;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < size; k++) {
        const t = a.getComponent(i + 1, k);
        a.setComponent(i + 1, k, a.getComponent(i + 2, k));
        a.setComponent(i + 2, k, t);
      }
    }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Collects painted parts into the four material slots; build() merges them into one geometry. */
class Parts {
  readonly rng: Rng;
  private by: THREE.BufferGeometry[][] = [[], [], [], []];

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /**
   * Add a part. Vertex colours come from `paint` (a colour, or a function of the local position and
   * normal); `jitter` shades every triangle by +-jitter (the low-poly speckle); `flat` recomputes
   * faceted normals; `m` places the part after it was painted.
   */
  add(geo: THREE.BufferGeometry, slot: number, paint: Paint, o: { flat?: boolean; jitter?: number; m?: THREE.Matrix4 } = {}): void {
    let g = geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.index) g = g.toNonIndexed();
    if (o.flat) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const n = pos.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const colors = new Float32Array(n * 3);
    const base = typeof paint === 'function' ? null : new THREE.Color(paint);
    const p = new THREE.Vector3();
    const nn = new THREE.Vector3();
    const jit = o.jitter ?? 0;
    for (let i = 0; i < n; i += 3) {
      const f = 1 + (this.rng.next() * 2 - 1) * jit;
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k);
        nn.fromBufferAttribute(nor, i + k);
        const c = base ?? (paint as (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)(p, nn);
        colors[(i + k) * 3] = c.r * f;
        colors[(i + k) * 3 + 1] = c.g * f;
        colors[(i + k) * 3 + 2] = c.b * f;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (o.m) g.applyMatrix4(o.m);
    this.by[slot].push(g);
  }

  /** Merge into one geometry (groups = material slots), centred on the box centre. */
  build(): THREE.BufferGeometry {
    const slots: number[] = [];
    const geos: THREE.BufferGeometry[] = [];
    for (let s = 0; s < this.by.length; s++) {
      if (!this.by[s].length) continue;
      geos.push(mergeGeometries(this.by[s], false)!);
      slots.push(s);
    }
    const g = mergeGeometries(geos, true)!;
    g.groups.forEach((gr, i) => (gr.materialIndex = slots[i]));
    // safety net: keep the cargo inside the box if a builder got carried away
    const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position as THREE.BufferAttribute);
    const ky = bb.max.y > BOX_H ? (BOX_H - BIN_H) / (bb.max.y - BIN_H) : 1;
    const kx = Math.min(1, BOX_LEN / 2 / Math.max(-bb.min.x, bb.max.x));
    const kz = Math.min(1, BIN_W / 2 / Math.max(-bb.min.z, bb.max.z));
    if (ky < 1 || kx < 1 || kz < 1) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > BIN_H + 0.04) pos.setXYZ(i, pos.getX(i) * kx, BIN_H + (pos.getY(i) - BIN_H) * ky, pos.getZ(i) * kz);
      }
    }
    g.translate(0, -BOX_H / 2, 0);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ───────────────────────────── building blocks ─────────────────────────────

interface Heap {
  geo: THREE.BufferGeometry;
  /** surface height (base space) at x, z */
  at: (x: number, z: number) => number;
}

interface HeapSpec {
  cx?: number;
  cz?: number;
  rx?: number;
  rz?: number;
  h?: number;
  rings: number;
  segs: number;
  /** profile: y = h (1 - r^p)^q */
  p: number;
  q: number;
  /** radial and relative height noise */
  noise: number;
  hnoise: number;
}

/** A heap: an apex fan plus rings down to the bin's top face. */
function heap(rng: Rng, s: HeapSpec): Heap {
  const cx = s.cx ?? 0;
  const cz = s.cz ?? -0.015;
  const rx = s.rx ?? FX;
  const rz = s.rz ?? FZ;
  const h = s.h ?? CARGO_H;
  const y0 = BIN_H + 0.004;
  const hAt = (r: number) => (r >= 1 ? 0 : h * Math.pow(1 - Math.pow(r, s.p), s.q));
  const pos: number[] = [cx, y0 + h, cz];
  const rot = rng.next() * Math.PI * 2;
  for (let j = 1; j <= s.rings; j++) {
    const r = j / s.rings;
    const last = j === s.rings;
    for (let k = 0; k < s.segs; k++) {
      const a = rot + (k / s.segs) * Math.PI * 2;
      const rr = last ? 1 - rng.next() * s.noise * 0.7 : r * (1 + (rng.next() * 2 - 1) * s.noise);
      const hh = last ? 0 : hAt(r) * (1 + (rng.next() * 2 - 1) * s.hnoise);
      pos.push(cx + Math.cos(a) * rx * rr, y0 + hh, cz + Math.sin(a) * rz * rr);
    }
  }
  const idx: number[] = [];
  const S = s.segs;
  for (let k = 0; k < S; k++) idx.push(0, 1 + ((k + 1) % S), 1 + k);
  for (let j = 1; j < s.rings; j++) {
    const inner = 1 + (j - 1) * S;
    const outer = 1 + j * S;
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S;
      idx.push(inner + k, inner + k1, outer + k);
      idx.push(inner + k1, outer + k1, outer + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, at: (x, z) => y0 + hAt(Math.min(1, Math.hypot((x - cx) / rx, (z - cz) / rz))) };
}

/** A rough lump (low-poly rock / coal / crystal) sitting on the heap. */
function lump(p: Parts, hp: Heap, size: number, paint: Paint, slot: number = MATTE, spread = 0.92): void {
  const r = p.rng;
  const a = r.next() * Math.PI * 2;
  const d = Math.sqrt(r.next()) * spread;
  const x = Math.cos(a) * FX * d;
  const z = -0.015 + Math.sin(a) * FZ * d;
  const sy = r.range(0.55, 0.9);
  const g = new THREE.IcosahedronGeometry(size, 0);
  xf(g, [x, hp.at(x, z) + size * 0.2, z], [r.next() * 6, r.next() * 6, r.next() * 6], [r.range(0.9, 1.3), sy, r.range(0.85, 1.2)]);
  p.add(g, slot, paint, { flat: true, jitter: 0.25 });
}

/** A pillow-shaped sack (half extents a, b, c), puffed up in the middle. */
function pillow(a: number, b: number, c: number, pinch = 0.5): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(2, 2, 2, 5, 3, 5);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const e = Math.max(Math.abs(x), Math.abs(z));
    pos.setXYZ(i, a * x * (1 - 0.1 * z * z) * (1 - 0.13 * y * y), b * y * (1 - pinch * e * e), c * z * (1 - 0.1 * x * x) * (1 - 0.13 * y * y));
  }
  g.computeVertexNormals();
  return g;
}

/** The soft sides of a woven big bag: rounded corners, a full belly and gathered shoulders. */
function bigBag(a: number, b: number, c: number): THREE.BufferGeometry {
  const corners: [number, number][] = [
    [-0.78, -1], [0, -1], [0.78, -1], [1, -0.72], [1, 0], [1, 0.72],
    [0.78, 1], [0, 1], [-0.78, 1], [-1, 0.72], [-1, 0], [-1, -0.72],
  ];
  const courses = [[-1, 0.86], [-0.65, 1], [0.25, 1.02], [0.78, 0.93], [1, 0.70]];
  const pos: number[] = [];
  for (const [y, scale] of courses) {
    corners.forEach(([x, z], i) => {
      // A recessed fold down the middle of each panel catches light at game scale.
      const crease = i % 3 === 1 ? 0.94 : 1;
      pos.push(x * a * scale * crease, y * b, z * c * scale * crease);
    });
  }
  const idx: number[] = [];
  const n = corners.length;
  for (let j = 0; j < courses.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      idx.push(j * n + i, (j + 1) * n + i, j * n + k, j * n + k, (j + 1) * n + i, (j + 1) * n + k);
    }
  }
  // Closed floor, and sloping cloth drawn into the filling neck.
  const bottom = pos.length / 3;
  pos.push(0, -b, 0);
  const top = pos.length / 3;
  pos.push(0, b * 1.12, 0);
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    idx.push(bottom, i, k, top, (courses.length - 1) * n + k, (courses.length - 1) * n + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat webbing lifting loop, thick enough to stay readable on a phone. */
function liftingLoop(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.043, 0);
  shape.lineTo(-0.048, 0.043);
  shape.lineTo(-0.026, 0.077);
  shape.lineTo(0.024, 0.077);
  shape.lineTo(0.048, 0.043);
  shape.lineTo(0.043, 0);
  shape.lineTo(0.025, 0);
  shape.lineTo(0.030, 0.038);
  shape.lineTo(0.016, 0.060);
  shape.lineTo(-0.016, 0.060);
  shape.lineTo(-0.030, 0.038);
  shape.lineTo(-0.025, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.009, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -0.0045);
}

/** Sewn edges use the existing matte material and merge into the commodity mesh. */
function seam(p: Parts, points: THREE.Vector3[], color: string, m: THREE.Matrix4, radius = 0.003): void {
  p.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length - 1, radius, 3, false), MATTE, color, { m });
}

/** Concentric flat bands of a disc, facing +z, centred at the origin. */
function discBands(rIn: number, rOut: number, shades: string[], segs: number): { g: THREE.BufferGeometry; c: string }[] {
  const out: { g: THREE.BufferGeometry; c: string }[] = [];
  const n = shades.length;
  for (let i = 0; i < n; i++) {
    const r0 = rIn + ((rOut - rIn) * i) / n;
    const r1 = rIn + ((rOut - rIn) * (i + 1)) / n;
    const g = r0 <= 0 ? new THREE.CircleGeometry(r1, segs) : new THREE.RingGeometry(r0, r1, segs, 1);
    out.push({ g, c: shades[i] });
  }
  return out;
}

function hull2(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ───────────────────────────── the bin ─────────────────────────────

const BIN_STEEL = '#4b5967';

/** The tapered bin: plate on the front, steel on the other faces, a dark fill under the cargo, a rim in the port colour. */
function buildBin(p: Parts, fill: string): void {
  const hx0 = BIN_L / 2;
  const hz0 = BIN_W / 2;
  const hx1 = hx0 - BIN_INSET;
  const hz1 = hz0 - BIN_INSET;
  const h = BIN_H;
  type V3 = [number, number, number];
  const quad = (a: V3, b: V3, c: V3, d: V3, uv: boolean): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    return g;
  };
  // front (+z): the plate
  p.add(quad([-hx0, 0, hz0], [hx0, 0, hz0], [hx1, h, hz1], [-hx1, h, hz1], true), PLATE, '#ffffff', { flat: true });
  // back, ends: steel with a vertical shade
  const steel = ramp(BIN_STEEL, '#7b8793');
  const side = (v: THREE.Vector3) => steel(v.y / h);
  p.add(quad([hx0, 0, -hz0], [-hx0, 0, -hz0], [-hx1, h, -hz1], [hx1, h, -hz1], false), MATTE, side, { flat: true });
  p.add(quad([hx0, 0, hz0], [hx0, 0, -hz0], [hx1, h, -hz1], [hx1, h, hz1], false), MATTE, side, { flat: true });
  p.add(quad([-hx0, 0, -hz0], [-hx0, 0, hz0], [-hx1, h, hz1], [-hx1, h, -hz1], false), MATTE, side, { flat: true });
  // the fill under the cargo
  p.add(quad([-hx1, h, -hz1], [-hx1, h, hz1], [hx1, h, hz1], [hx1, h, -hz1], false), MATTE, fill, { flat: true });
  // ribs on the ends and a skid under each side
  const rib = '#33404c';
  for (const sx of [-1, 1]) {
    for (const z of [-0.17, 0, 0.17]) p.add(new THREE.BoxGeometry(0.014, h * 0.8, 0.03), MATTE, rib, { m: new THREE.Matrix4().makeTranslation(sx * (hx0 - 0.004), h * 0.42, z) });
  }
  for (const sz of [-1, 1]) p.add(new THREE.BoxGeometry(BIN_L, 0.028, 0.05), MATTE, '#262c33', { m: new THREE.Matrix4().makeTranslation(0, 0.014, sz * (hz0 - 0.025)) });
  // rim in the port colour
  const ry = h + 0.012;
  for (const sz of [-1, 1]) p.add(new THREE.BoxGeometry(2 * hx1 + 0.03, 0.034, 0.034), RIM, '#ffffff', { m: new THREE.Matrix4().makeTranslation(0, ry, sz * (hz1 - 0.004)) });
  for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.034, 0.034, 2 * hz1 - 0.03), RIM, '#ffffff', { m: new THREE.Matrix4().makeTranslation(sx * (hx1 - 0.004), ry, 0) });
}

// ───────────────────────────── the commodities ─────────────────────────────

function buildGrain(p: Parts): void {
  const hp = heap(p.rng, { rings: 5, segs: 20, h: CARGO_H - 0.024, p: 1.65, q: 0.9, noise: 0.035, hnoise: 0.04 });
  const col = ramp('#b1802b', '#ead078');
  p.add(
    hp.geo,
    MATTE,
    (v) => {
      const dx = v.x / FX;
      const dz = (v.z + 0.02) / FZ;
      const r = Math.hypot(dx, dz);
      // ripples of grain flowing down the slope
      return col((v.y - BIN_H) / CARGO_H * 0.8 + 0.1 + Math.sin(r * 26) * 0.07);
    },
    { jitter: 0.045 },
  );
  // A few visible kernels catch the light; the heap still reads as thousands of grains.
  for (let i = 0; i < 64; i++) {
    const r = p.rng;
    const a = r.next() * Math.PI * 2;
    const d = Math.sqrt(r.next()) * 0.94;
    const x = Math.cos(a) * FX * d;
    const z = -0.015 + Math.sin(a) * FZ * d;
    const size = r.range(0.006, 0.011);
    const g = xf(new THREE.OctahedronGeometry(size), [x, hp.at(x, z) + size * 0.2, z], [0, r.next() * Math.PI, 0], [1.5, 0.4, 0.7]);
    p.add(g, MATTE, r.pick(['#eed98d', '#cda34b', '#dec068']), { flat: true, jitter: 0.04 });
  }
  buildBin(p, '#8a6420');
}

function buildCoal(p: Parts): void {
  const hp = heap(p.rng, { rings: 4, segs: 13, p: 1.1, q: 1.0, noise: 0.1, hnoise: 0.3 });
  const col = ramp('#1d2024', '#454b54');
  p.add(hp.geo, MATTE, (v) => col((v.y - BIN_H) / CARGO_H), { flat: true, jitter: 0.32 });
  for (let i = 0; i < 14; i++) lump(p, hp, p.rng.range(0.026, 0.065), p.rng.chance(0.5) ? '#2a2e34' : '#16181c');
  for (let i = 0; i < 5; i++) lump(p, hp, p.rng.range(0.019, 0.036), '#606873', METAL, 0.8);
  buildBin(p, '#15171a');
}

function buildOre(p: Parts): void {
  const hp = heap(p.rng, { rings: 4, segs: 12, p: 1.0, q: 1.0, noise: 0.12, hnoise: 0.28 });
  const col = ramp('#7d2b14', '#b84c27');
  p.add(hp.geo, MATTE, (v) => col((v.y - BIN_H) / CARGO_H + 0.1), { flat: true, jitter: 0.26 });
  for (let i = 0; i < 12; i++) lump(p, hp, p.rng.range(0.033, 0.072), p.rng.chance(0.6) ? '#a23b1f' : '#6b2512');
  for (let i = 0; i < 3; i++) lump(p, hp, p.rng.range(0.03, 0.05), '#8b3f2a', METAL, 0.85);
  buildBin(p, '#4e1c0e');
}

function buildSalt(p: Parts): void {
  const hp = heap(p.rng, { rings: 4, segs: 14, p: 1.25, q: 0.95, noise: 0.07, hnoise: 0.14 });
  const col = ramp('#bcd2e0', '#f6fafb');
  p.add(hp.geo, MATTE, (v) => col((v.y - BIN_H) / CARGO_H * 1.1 + 0.1), { flat: true, jitter: 0.07 });
  // salt crystals: little cubes
  for (let i = 0; i < 16; i++) {
    const r = p.rng;
    const a = r.next() * Math.PI * 2;
    const d = Math.sqrt(r.next()) * 0.9;
    const x = Math.cos(a) * FX * d;
    const z = -0.015 + Math.sin(a) * FZ * d;
    const s = r.range(0.028, 0.05);
    p.add(xf(new THREE.BoxGeometry(s, s, s), [x, hp.at(x, z) + s * 0.25, z], [r.next() * 6, r.next() * 6, r.next() * 6]), MATTE, r.chance(0.5) ? '#ffffff' : '#d6e8f3', { flat: true, jitter: 0.06 });
  }
  buildBin(p, '#9fb4c2');
}

function buildSugar(p: Parts): void {
  // white sacks, laid brick-fashion in three courses (4, 3, 2)
  const rng = p.rng;
  const courses: { n: number; along: 'x' | 'z' }[] = [{ n: 4, along: 'x' }, { n: 3, along: 'z' }, { n: 2, along: 'x' }];
  const th = 0.082; // half thickness of a sack
  const white = ramp('#e9e2d0', '#fffdf6');
  courses.forEach((c, ci) => {
    const y = BIN_H + 0.006 + th * (0.9 + ci * 1.72);
    for (let k = 0; k < c.n; k++) {
      // layout per course
      let x: number;
      let z: number;
      let ax: number;
      let az: number;
      if (c.along === 'x') {
        // sacks long in x, two rows in z
        ax = 0.17;
        az = 0.105;
        const row = k % 2;
        const col = Math.floor(k / 2);
        const cols = Math.ceil(c.n / 2);
        x = (col - (cols - 1) / 2) * 0.34;
        z = -0.015 + (row ? 0.113 : -0.113);
      } else {
        // sacks long in z, in a single row
        ax = 0.115;
        az = 0.16;
        x = (k - (c.n - 1) / 2) * 0.235;
        z = -0.015;
      }
      const g = pillow(ax, th, az, 0.55);
      const along = c.along;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + rng.range(-0.008, 0.008), y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(-0.06, 0.06), 0)), new THREE.Vector3(1, 1, 1));
      p.add(
        g,
        MATTE,
        (v) => {
          const u = along === 'x' ? v.x / ax : v.z / az;
          if (Math.abs(u) > 0.86) return new THREE.Color('#cfc7b2'); // sewn ends
          if (Math.abs(u) < 0.34) return new THREE.Color('#b94d35'); // printed band
          return white(v.y / th * 0.5 + 0.5);
        },
        { jitter: 0.015, m },
      );
      for (const e of [-1, 1]) {
        const points = Array.from({ length: 5 }, (_, i) => {
          const t = i / 2 - 1;
          return along === 'x'
            ? new THREE.Vector3(e * ax * (1 - 0.1 * t * t) * 0.87, th * 0.45 + 0.002, t * az * 0.783)
            : new THREE.Vector3(t * ax * 0.783, th * 0.45 + 0.002, e * az * (1 - 0.1 * t * t) * 0.87);
        });
        seam(p, points, '#b7ad91', m);
      }
    }
  });
  buildBin(p, '#d6cfbc');
}

function buildFertiliser(p: Parts): void {
  // Two woven bulk bags, each with a gathered filling neck and four webbing loops.
  const rng = p.rng;
  const a = 0.158;
  const b = 0.118;
  const c = 0.185;
  const col = ramp('#b3b6a8', '#f0efdf');
  for (const sx of [-1, 1]) {
    const x = sx * 0.175;
    const y = BIN_H + 0.006 + b;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, -0.015), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(-0.035, 0.035), 0)), new THREE.Vector3(1, 1, 1));
    p.add(
      bigBag(a, b, c),
      MATTE,
      (v) => col(v.y / b * 0.5 + 0.5),
      { jitter: 0.012, m },
    );
    // The printed green patch follows the cloth's central crease with a crisp edge.
    const patch = new THREE.BufferGeometry();
    const patchPos: number[] = [];
    const front = (px: number, py: number): [number, number, number] => {
      const scale = 1 + 0.02 * (py / b + 0.65) / 0.9;
      const crease = 0.94 + 0.06 * Math.abs(px) / (a * scale * 0.78);
      return [px, py, c * scale * crease + 0.0015];
    };
    for (const e of [-1, 1]) {
      const l = e < 0 ? -0.061 : 0;
      const r = e < 0 ? 0 : 0.061;
      patchPos.push(...front(l, -0.028), ...front(r, -0.028), ...front(r, 0.022), ...front(l, -0.028), ...front(r, 0.022), ...front(l, 0.022));
    }
    patch.setAttribute('position', new THREE.Float32BufferAttribute(patchPos, 3));
    p.add(patch, MATTE, '#467e60', { m });
    // Corner piping follows the swollen bag instead of suggesting a rigid crate.
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        seam(p, [
          new THREE.Vector3(lx * a * 0.84, -b * 0.88, lz * c * 0.69),
          new THREE.Vector3(lx * a, -b * 0.4, lz * c * 0.72),
          new THREE.Vector3(lx * a * 0.98, b * 0.35, lz * c * 0.72),
          new THREE.Vector3(lx * a * 0.80, b * 0.80, lz * c * 0.60),
        ], '#e8dfc7', m, 0.004);
        const loop = liftingLoop();
        xf(loop, [lx * a * 0.64, b * 0.72, lz * c * 0.65], [0, lx * lz * 0.35, 0]);
        p.add(loop, MATTE, '#d49a28', { flat: true, m });
      }
    }
    p.add(xf(new THREE.CylinderGeometry(0.027, 0.045, 0.028, 7), [0, b * 1.20, 0]), MATTE, '#e6e2cc', { flat: true, m });
    p.add(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.007, 7), [0, b * 1.25, 0]), MATTE, '#527664', { flat: true, m });
  }
  buildBin(p, '#989e8e');
}

function buildTimber(p: Parts): void {
  const rng = p.rng;
  const r = 0.052;
  const dy = r * Math.sqrt(3);
  const rows = [4, 3, 2];
  const bark = ramp('#493524', '#826041');
  const centres: [number, number][] = [];
  rows.forEach((n, row) => {
    for (let k = 0; k < n; k++) {
      const z = -0.015 + (k - (n - 1) / 2) * 2 * r * 1.002;
      const y = BIN_H + 0.016 + r + row * dy;
      centres.push([z, y]);
      const len = 0.7 + rng.range(-0.06, 0.02);
      const x = rng.range(-0.025, 0.025);
      const rr = r * rng.range(0.94, 1.0);
      const side = new THREE.CylinderGeometry(rr * 0.96, rr, len, 9, 2, true);
      side.rotateZ(Math.PI / 2);
      side.rotateX(rng.next() * 6);
      xf(side, [x, y, z]);
      p.add(side, MATTE, (v, n) => bark(0.48 + Math.sin(Math.atan2(n.y, n.z) * 5) * 0.22 + Math.sin(v.x * 21) * 0.07), { flat: true, jitter: 0.06 });
      // end grain: concentric rings of pale wood
      const heart = ['#b08950', '#d2b477', '#b99357', '#d8ba7e', '#b68c4d'];
      for (const e of [-1, 1]) {
        for (const band of discBands(0, rr * 0.98, heart, 9)) {
          const g = band.g;
          g.rotateY(e * (Math.PI / 2));
          xf(g, [x + e * (len / 2 + 0.0015), y, z]);
          p.add(g, MATTE, band.c, { flat: true, jitter: 0.03 });
        }
        const split = new THREE.BoxGeometry(0.003, rr * 0.85, 0.0035);
        split.rotateX(rng.range(-1.2, 1.2));
        xf(split, [x + e * (len / 2 + 0.003), y + rr * 0.12, z]);
        p.add(split, MATTE, '#725332');
      }
      // Broken ridges run along the bark, rather than looking like painted smooth dowels.
      for (const a of [-0.6, 1.4]) {
        const ridge = new THREE.BoxGeometry(len * rng.range(0.65, 0.85), 0.004, 0.006);
        ridge.rotateX(a);
        xf(ridge, [x, y + Math.cos(a) * rr * 0.97, z + Math.sin(a) * rr * 0.97]);
        p.add(ridge, MATTE, '#4c3828');
      }
    }
  });
  // two straps around the bundle
  const around = (rad: number) => hull2(centres.flatMap(([z, y]) => Array.from({ length: 14 }, (_, i): [number, number] => [z + Math.cos((i / 14) * Math.PI * 2) * rad, y + Math.sin((i / 14) * Math.PI * 2) * rad])));
  const outer = around(r + 0.017);
  const inner = around(r + 0.004);
  for (const sx of [-0.22, 0.2]) {
    const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v)));
    shape.holes.push(new THREE.Path(inner.map(([u, v]) => new THREE.Vector2(u, v))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(-Math.PI / 2);
    xf(g, [sx + 0.02, 0, 0]);
    p.add(g, MATTE, '#e7a91c', { flat: true, jitter: 0.04 });
    const top = Math.max(...outer.map(([, y]) => y));
    p.add(xf(new THREE.BoxGeometry(0.055, 0.009, 0.036), [sx, top + 0.003, -0.015]), MATTE, '#58636b', { flat: true });
  }
  // dunnage under the bundle
  for (const x of [-0.24, 0.24]) p.add(new THREE.BoxGeometry(0.06, 0.02, 0.48), MATTE, '#7a5a37', { m: new THREE.Matrix4().makeTranslation(x, BIN_H + 0.008, -0.015) });
  buildBin(p, '#4a3522');
}

function buildSteel(p: Parts): void {
  // three coils standing on their rims, eyes toward the camera, on timber bearers
  const R = 0.108;
  const rin = 0.04;
  const w = 0.38;
  const zc = -0.03;
  const y = BIN_H + 0.012 + 0.03 + R;
  const bands = ['#d0d6db', '#9aa4ac', '#c4cbd1', '#8d979f', '#b7bfc6', '#9aa4ac'];
  for (const bx of [-0.23, 0, 0.23]) {
    const rot = p.rng.range(-0.05, 0.05);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, y, zc), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1));
    // wound steel: the cylinder side
    const side = new THREE.CylinderGeometry(R, R, w, 20, 1, true);
    side.rotateX(Math.PI / 2);
    p.add(side, METAL, (v) => new THREE.Color('#aab3bb').multiplyScalar(0.85 + 0.15 * Math.sin(Math.atan2(v.y, v.x) * 3)), { m, jitter: 0.02 });
    // the eye, with its dark bore
    const bore = invert(new THREE.CylinderGeometry(rin, rin, w, 12, 1, true));
    bore.rotateX(Math.PI / 2);
    p.add(bore, MATTE, '#16191d', { m });
    for (const e of [-1, 1]) {
      for (const band of discBands(rin, R, bands, 20)) {
        const g = band.g;
        if (e < 0) g.rotateY(Math.PI);
        g.translate(0, 0, e * (w / 2 + 0.001));
        p.add(g, METAL, band.c, { m });
      }
    }
    // two steel bands
    for (const sz of [-0.12, 0.12]) {
      const strap = new THREE.CylinderGeometry(R + 0.005, R + 0.005, 0.028, 20, 1, true);
      strap.rotateX(Math.PI / 2);
      strap.translate(0, 0, sz);
      p.add(strap, MATTE, '#2f353c', { m });
    }
  }
  for (const sz of [-0.15, 0.09]) p.add(new THREE.BoxGeometry(0.72, 0.03, 0.06), MATTE, '#7a5a37', { m: new THREE.Matrix4().makeTranslation(0, BIN_H + 0.012 + 0.015, zc + sz) });
  buildBin(p, '#2a2f36');
}

function buildScrap(p: Parts): void {
  const rng = p.rng;
  const hp = heap(rng, { rings: 3, segs: 11, p: 1.3, q: 1.0, noise: 0.12, hnoise: 0.3, h: 0.13 });
  p.add(hp.geo, MATTE, '#4a3f38', { flat: true, jitter: 0.2 });
  const cols = ['#8a4a30', '#5c4a40', '#94908a', '#3d434a', '#a5632b', '#6e5240', '#b07a45'];
  for (let i = 0; i < 17; i++) {
    const x = rng.range(-0.3, 0.3);
    const z = -0.015 + rng.range(-0.17, 0.17);
    const base = hp.at(x, z) + rng.range(0.0, 0.07);
    const kind = rng.int(0, 4);
    const c = cols[rng.int(0, cols.length - 1)];
    const rot: [number, number, number] = [rng.range(-0.7, 0.7), rng.next() * 6, rng.range(-0.7, 0.7)];
    let g: THREE.BufferGeometry;
    if (kind <= 1) g = new THREE.BoxGeometry(rng.range(0.14, 0.3), rng.range(0.012, 0.03), rng.range(0.08, 0.18));
    else if (kind === 2) g = new THREE.CylinderGeometry(rng.range(0.016, 0.03), rng.range(0.016, 0.03), rng.range(0.16, 0.3), 7);
    else if (kind === 3) g = new THREE.TorusGeometry(rng.range(0.04, 0.065), rng.range(0.011, 0.02), 5, 9);
    else g = new THREE.IcosahedronGeometry(rng.range(0.04, 0.07), 0);
    xf(g, [x, base + 0.03, z], rot);
    p.add(g, kind === 4 || c === '#94908a' ? METAL : MATTE, c, { flat: true, jitter: 0.16 });
  }
  buildBin(p, '#3b312b');
}

const BUILDERS: Record<Commodity, { seed: number; build: (p: Parts) => void }> = {
  grain: { seed: 101, build: buildGrain },
  coal: { seed: 102, build: buildCoal },
  ore: { seed: 103, build: buildOre },
  timber: { seed: 104, build: buildTimber },
  steel: { seed: 105, build: buildSteel },
  fertiliser: { seed: 106, build: buildFertiliser },
  salt: { seed: 107, build: buildSalt },
  sugar: { seed: 108, build: buildSugar },
  scrap: { seed: 109, build: buildScrap },
};

// ───────────────────────────── the weight plate ─────────────────────────────

function inkOn(color: string): string {
  const c = new THREE.Color(color);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return l > 0.32 ? '#15181e' : '#ffffff';
}

/** The bin's front: a colour band with the destination code and the weight in big numerals. */
function paintPlate(look: ParcelLook): THREE.CanvasTexture {
  const W = 384;
  const H = Math.round((W * BIN_H) / BIN_L); // the plate's aspect = the bin face's
  const [c, g] = canvas(W, H);
  g.fillStyle = '#ece8da';
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.05)';
  g.fillRect(0, H * 0.62, W, H * 0.38);
  const bandW = 104;
  g.fillStyle = look.color;
  g.fillRect(0, 0, bandW, H);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(bandW - 4, 0, 4, H);
  // destination code
  g.fillStyle = inkOn(look.color);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(H * 0.32)}px ${FONT_NUM}`;
  g.fillText(look.destCode.slice(0, 3).toUpperCase(), bandW / 2 - 1, H / 2 + 3);
  // the weight
  const num = String(look.weight);
  // size the numerals so their digits are 80% of the plate's height (Oswald digits are ~0.8 em tall)
  g.textBaseline = 'alphabetic';
  g.font = `700 100px ${FONT_NUM}`;
  const digitH = g.measureText('0').actualBoundingBoxAscent || 80;
  let size = Math.round((100 * 0.8 * H) / digitH);
  const room = W - bandW - 26;
  const measure = () => {
    g.font = `700 ${size}px ${FONT_NUM}`;
    const wn = g.measureText(num).width;
    g.font = `700 ${Math.round(size * 0.46)}px ${FONT_NUM}`;
    return wn + g.measureText('t').width + 6;
  };
  while (measure() > room && size > 40) size -= 4;
  g.font = `700 ${size}px ${FONT_NUM}`;
  const wn = g.measureText(num).width;
  g.font = `700 ${Math.round(size * 0.46)}px ${FONT_NUM}`;
  const total = wn + g.measureText('t').width + 6;
  const x0 = bandW + (W - bandW) / 2 - total / 2;
  const base = H / 2 + (digitH * size) / 200;
  g.fillStyle = '#15181e';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `700 ${size}px ${FONT_NUM}`;
  g.fillText(num, x0, base);
  g.font = `700 ${Math.round(size * 0.46)}px ${FONT_NUM}`;
  g.fillText('t', x0 + wn + 6, base);
  // a dark frame
  g.strokeStyle = '#2b3138';
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  return toTexture(c);
}

// ───────────────────────────── caches and the public API ─────────────────────────────

const geoCache = new Map<Commodity, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material[]>();
const rimCache = new Map<string, THREE.MeshStandardMaterial>();
let matte: THREE.MeshStandardMaterial | null = null;
let metal: THREE.MeshStandardMaterial | null = null;

function geometry(commodity: Commodity): THREE.BufferGeometry {
  let g = geoCache.get(commodity);
  if (!g) {
    const b = BUILDERS[commodity];
    const parts = new Parts(b.seed);
    b.build(parts);
    g = parts.build();
    geoCache.set(commodity, g);
  }
  return g;
}

/** Material array of a parcel: [matte, metal, plate, rim] (see PARCEL_SLOT). Cached by colour|weight|destCode. */
function materials(look: ParcelLook): THREE.Material[] {
  const key = `${look.color}|${look.weight}|${look.destCode}`;
  let mats = matCache.get(key);
  if (!mats) {
    matte ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    metal ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.6 });
    let rim = rimCache.get(look.color);
    if (!rim) {
      rim = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.5 });
      rimCache.set(look.color, rim);
    }
    const plate = new THREE.MeshStandardMaterial({ map: paintPlate(look), roughness: 0.6 });
    mats = [matte, metal, plate, rim];
    matCache.set(key, mats);
  }
  return mats;
}

/** One parcel as one mesh, centred at its origin, inside BOX_LEN x BOX_H x BOX_W; the plate faces +z. */
export function makeParcel(look: ParcelLook): THREE.Mesh {
  const m = new THREE.Mesh(geometry(look.commodity), materials(look));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.commodity = look.commodity;
  return m;
}

/** The bounding box of a commodity's parcel geometry (centred, so min.y = -BOX_H / 2): for checks. */
export function parcelBounds(commodity: Commodity): THREE.Box3 {
  const g = geometry(commodity);
  return g.boundingBox!.clone();
}

const MIX: Commodity[] = ['grain', 'grain', 'grain', 'coal', 'coal', 'coal', 'ore', 'ore', 'ore', 'timber', 'timber', 'steel', 'steel', 'fertiliser', 'fertiliser', 'salt', 'sugar', 'scrap'];

/** A natural mix of commodities, deterministic from a seed (box id + level number...): grain, coal and ore are most common. */
export function commodityFor(seed: number): Commodity {
  let h = (Math.floor(seed) | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return MIX[(h >>> 0) % MIX.length];
}
