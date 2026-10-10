import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng';

/**
 * Geometry kit for the port backdrops. Everything a backdrop shows is baked, with a vertex colour
 * per primitive, into a handful of merged meshes (one material each), so a whole port is ~10 draw
 * calls however many houses it has. Primitives are anchored at the bottom (y = their base) so
 * nothing floats by accident.
 */

export type V3 = [number, number, number];
export type Col = THREE.ColorRepresentation;

export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ───────────────────────────── noise ─────────────────────────────

function h2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise2(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz, seed);
  const b = h2(ix + 1, iz, seed);
  const c = h2(ix, iz + 1, seed);
  const d = h2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, z: number, seed = 0, oct = 4): number {
  let a = 0.5;
  let s = 0;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x, z, seed + i * 17);
    n += a;
    x *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

// ───────────────────────────── merged parts ─────────────────────────────

const E = new THREE.Euler();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const M = new THREE.Matrix4();
const C = new THREE.Color();

export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
  ao?: number;
}

function flatGeo(tris: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return g;
}

const BOX = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
})();
/** A box with only the faces the game camera can see (front +z, right +x, top): half the triangles. */
const BOXV = (() => {
  const full = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const pos = full.getAttribute('position');
  const nor = full.getAttribute('normal');
  const keep: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    if (nx > 0.5 || ny > 0.5 || nz > 0.5) {
      for (let j = 0; j < 3; j++) {
        keep.push(pos.getX(i + j), pos.getY(i + j) + 0.5, pos.getZ(i + j));
        nrm.push(nx, ny, nz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
})();
const BALL = new THREE.SphereGeometry(1, 9, 6);
const BLOB = new THREE.IcosahedronGeometry(1, 0);
const ROCK = new THREE.OctahedronGeometry(1, 0);
const PYR = (() => {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  return g;
})();
const prismCache = new Map<number, THREE.BufferGeometry>();
/** Triangular prism: base on y = 0, x from -½ to ½, ridge at x = `ax` (−½…½), z from -½ to ½. */
function prismGeo(ax: number): THREE.BufferGeometry {
  let g = prismCache.get(ax);
  if (!g) {
    const t: number[] = [];
    const A: V3 = [-0.5, 0, 0.5];
    const B: V3 = [0.5, 0, 0.5];
    const Cc: V3 = [ax, 1, 0.5];
    const A2: V3 = [-0.5, 0, -0.5];
    const B2: V3 = [0.5, 0, -0.5];
    const C2: V3 = [ax, 1, -0.5];
    t.push(...A, ...B, ...Cc); // front
    t.push(...B2, ...A2, ...C2); // back
    t.push(...A2, ...A, ...Cc, ...A2, ...Cc, ...C2); // left slope
    t.push(...B, ...B2, ...C2, ...B, ...C2, ...Cc); // right slope
    g = flatGeo(t);
    prismCache.set(ax, g);
  }
  return g;
}

export class Part {
  private geos: THREE.BufferGeometry[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** how much the foot of every primitive is darkened (cheap baked ambient occlusion) */
  ao = 0.16;

  get tris(): number {
    let n = 0;
    for (const g of this.geos) n += g.getAttribute('position').count / 3;
    return n;
  }

  get empty(): boolean {
    return this.geos.length === 0;
  }

  private get top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /** Enter a local frame: origin at (x, y, z), turned by `ry` about y, scaled uniformly by `s`. */
  push(x: number, y: number, z: number, ry: number, s: number): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
    this.stack.push(this.top.clone().multiply(m));
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Build in a local frame (see `push`). */
  at(x: number, y: number, z: number, ry: number, s: number, fn: () => void): void {
    this.push(x, y, z, ry, s);
    fn();
    this.pop();
  }

  /** Add a geometry: scale → rotate → translate in the current frame, with a flat vertex colour. */
  add(src: THREE.BufferGeometry, color: Col, p: V3 = [0, 0, 0], s: V3 | number = 1, o: Rot & { q?: THREE.Quaternion } = {}): void {
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
    g.clearGroups();
    if (o.q) Q.copy(o.q);
    else Q.setFromEuler(E.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ'));
    if (typeof s === 'number') S.set(s, s, s);
    else S.set(s[0], s[1], s[2]);
    M.compose(V.set(p[0], p[1], p[2]), Q, S);
    M.premultiply(this.top);
    g.applyMatrix4(M);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const span = Math.max(0.05, Math.min(y1 - y0, 1.1));
    const ao = o.ao ?? this.ao;
    C.set(color);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = clamp((pos.getY(i) - y0) / span);
      const k = 1 - ao * (1 - t) * (1 - t);
      col[i * 3] = C.r * k;
      col[i * 3 + 1] = C.g * k;
      col[i * 3 + 2] = C.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(g);
  }

  // primitives, all anchored on their base (x, y, z) = bottom centre

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: Col, o: Rot = {}): void {
    this.add(BOX, color, [x, y, z], [w, h, d], o);
  }

  /** A box showing only the faces the fixed game camera sees (+z, +x, top): for buildings by the hundred. */
  boxV(x: number, y: number, z: number, w: number, h: number, d: number, color: Col, o: Rot = {}): void {
    this.add(BOXV, color, [x, y, z], [w, h, d], o);
  }

  /** Box between two heights, handy for walls from the waterline up. */
  slab(x: number, y0: number, y1: number, z: number, w: number, d: number, color: Col, o: Rot = {}): void {
    this.box(x, y0, z, w, y1 - y0, d, color, o);
  }

  cyl(x: number, y: number, z: number, rb: number, rt: number, h: number, color: Col, o: Rot & { seg?: number; open?: boolean } = {}): void {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12, 1, o.open ?? false);
    g.translate(0, h / 2, 0);
    this.add(g, color, [x, y, z], 1, o);
  }

  cone(x: number, y: number, z: number, r: number, h: number, color: Col, o: Rot & { seg?: number; open?: boolean } = {}): void {
    this.cyl(x, y, z, r, 0, h, color, { open: true, ...o });
  }

  /** Sphere centred on (x, y, z); `sy` squashes or stretches it vertically. */
  ball(x: number, y: number, z: number, r: number, color: Col, o: Rot & { sy?: number; sx?: number; sz?: number } = {}): void {
    this.add(BALL, color, [x, y, z], [r * (o.sx ?? 1), r * (o.sy ?? 1), r * (o.sz ?? 1)], o);
  }

  /** A 20-triangle faceted blob (tree crowns, bushes), centred on (x, y, z). */
  blob(x: number, y: number, z: number, r: number, color: Col, o: Rot & { sy?: number } = {}): void {
    this.add(BLOB, color, [x, y, z], [r, r * (o.sy ?? 1), r], o);
  }

  /** A lumpy boulder (flat-shaded icosahedron) sitting on y. */
  rock(x: number, y: number, z: number, r: number, color: Col, o: Rot & { sy?: number } = {}): void {
    this.add(ROCK, color, [x, y + r * (o.sy ?? 0.7) * 0.7, z], [r, r * (o.sy ?? 0.7), r], o);
  }

  /** Gable roof: ridge along z by default, base w × d, height h; `ax` shifts the ridge for lean-tos. */
  prism(x: number, y: number, z: number, w: number, h: number, d: number, color: Col, o: Rot & { ax?: number } = {}): void {
    this.add(prismGeo(o.ax ?? 0), color, [x, y, z], [w, h, d], o);
  }

  /** Four-sided pyramid roof on a w × d base. */
  pyramid(x: number, y: number, z: number, w: number, h: number, d: number, color: Col, o: Rot = {}): void {
    this.add(PYR, color, [x, y, z], [w, h, d], o);
  }

  /** A surface of revolution; `pts` are [radius, height] from the bottom up. */
  lathe(x: number, y: number, z: number, pts: [number, number][], color: Col, o: Rot & { seg?: number } = {}): void {
    const g = new THREE.LatheGeometry(
      pts.map((p) => new THREE.Vector2(p[0], p[1])),
      o.seg ?? 14,
    );
    this.add(g, color, [x, y, z], 1, o);
  }

  /** A polygon in the XY plane (x right, y up) extruded `depth` along z, centred on z. */
  extrude(pts: [number, number][], depth: number, x: number, y: number, z: number, color: Col, o: Rot & { s?: V3 | number; holes?: [number, number][][] } = {}): void {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    for (const h of o.holes ?? []) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    this.add(g, color, [x, y, z], o.s ?? 1, o);
  }

  /** A thin cylinder between two points (cables, masts, struts). */
  rod(a: V3, b: V3, r: number, color: Col, seg = 5): void {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-5) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    this.add(g, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], 1, { q, ao: 0 });
  }

  /** A flat quad a-b-c-d (counter-clockwise seen from the front); `both` draws the back too. */
  quad(a: V3, b: V3, c: V3, d: V3, color: Col, both = false, ao = 0): void {
    const t = [...a, ...b, ...c, ...a, ...c, ...d];
    if (both) t.push(...b, ...a, ...c, ...c, ...a, ...d);
    this.add(flatGeo(t), color, [0, 0, 0], 1, { ao });
  }

  tri(a: V3, b: V3, c: V3, color: Col, both = false): void {
    const t = [...a, ...b, ...c];
    if (both) t.push(...b, ...a, ...c);
    this.add(flatGeo(t), color, [0, 0, 0], 1, { ao: 0 });
  }

  /**
   * A convex-ish polyhedron from vertices and faces (vertex indices, any winding: each face is
   * turned to face away from the centroid). Flat shaded.
   */
  solid(verts: V3[], faces: number[][], color: Col, o: Rot = {}): void {
    const cen = new THREE.Vector3();
    for (const v of verts) cen.add(V.set(v[0], v[1], v[2]));
    cen.divideScalar(verts.length);
    const t: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const fc = new THREE.Vector3();
    for (const f of faces) {
      fc.set(0, 0, 0);
      for (const i of f) fc.add(a.set(verts[i][0], verts[i][1], verts[i][2]));
      fc.divideScalar(f.length).sub(cen);
      for (let k = 1; k < f.length - 1; k++) {
        const i0 = f[0];
        let i1 = f[k];
        let i2 = f[k + 1];
        a.set(verts[i0][0], verts[i0][1], verts[i0][2]);
        b.set(verts[i1][0], verts[i1][1], verts[i1][2]);
        c.set(verts[i2][0], verts[i2][1], verts[i2][2]);
        n.subVectors(b, a).cross(c.clone().sub(a));
        if (n.dot(fc) < 0) {
          const tmp = i1;
          i1 = i2;
          i2 = tmp;
        }
        t.push(...verts[i0], ...verts[i1], ...verts[i2]);
      }
    }
    this.add(flatGeo(t), color, [0, 0, 0], 1, o);
  }

  /** Merge everything into one mesh; null if empty. */
  build(mat: THREE.Material): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    for (const x of this.geos) x.dispose();
    this.geos = [];
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

// ───────────────────────────── materials ─────────────────────────────

export const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
  /** faceted ground: flat shaded so hills read as low-poly facets */
  terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.45 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  /** windows that are lit at night: dark by day, warm after dusk (see `setPortNight`) */
  lit: new THREE.MeshBasicMaterial({ color: '#2d3d4f' }),
  rotor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
};

// ───────────────────────────── the kit ─────────────────────────────

/** x of the camera's line of sight (through the ship) at depth z: where a backdrop reads as "centre". */
export const viewX = (z: number): number => -(0.78 - z) * Math.tan((19 * Math.PI) / 180);

/** z of the mole and of the far shore's waterline. */
export const MOLE_Z = -7.2;
export const SHORE_Z = -12.0;
/** height of the quay/land just behind the waterline */
export const LAND_Y = 0.38;

export type HeightFn = (x: number, z: number, h: number) => number;
export interface Rect {
  x: number;
  z: number;
  rx: number;
  rz: number;
}

export interface Rotor {
  x: number;
  y: number;
  z: number;
  s: number;
  speed: number;
  phase: number;
}

export interface TerrainPalette {
  /** low flat land (fields, lawns, sand) */
  land: Col;
  land2: Col;
  /** foothills */
  hill: Col;
  /** steep rock */
  rock: Col;
  /** the beach strip at the waterline */
  sand: Col;
  /** distance haze (fades far ridges into the sky) */
  haze: Col;
  /** snow above this height (omit for none) */
  snowLine?: number;
  snow?: Col;
}

export interface TerrainShape {
  /** foothills' height, and how far behind the shore they begin rising */
  relief: number;
  /** the far range (height) */
  range: number;
  /** distance inland where the foothills begin */
  rise: number;
  /** ruggedness 0..1 (smooth rolling … craggy) */
  rough: number;
  /** x frequency of the ridges */
  freq: number;
}

export class PortKit {
  readonly rng: Rng;
  readonly seed: number;
  readonly width: number;
  readonly solid = new Part();
  readonly glass = new Part();
  readonly glow = new Part();
  /** windows that light up at night (flat colour, see MAT.lit) */
  readonly lit = new Part();
  readonly rotors: Rotor[] = [];
  readonly updaters: Array<(t: number) => void> = [];
  readonly reserved: Rect[] = [];
  readonly group = new THREE.Group();
  private solidTris = 0;
  private glassTris = 0;
  /** extra meshes (flag etc.) added after the merged ones */
  readonly extras: THREE.Object3D[] = [];
  palette: TerrainPalette = { land: '#a9b97a', land2: '#9fb36f', hill: '#8fa879', rock: '#9a9488', sand: '#dccfa8', haze: '#cfe3ec' };
  shape: TerrainShape = { relief: 1.5, range: 5, rise: 3.5, rough: 0.4, freq: 0.08 };
  /** the shoreline in front of the town */
  shore: 'beach' | 'quay' | 'rock' | 'dike' = 'quay';
  private feats: HeightFn[] = [];
  private paints: Array<(x: number, y: number, z: number, slope: number, c: THREE.Color) => void> = [];

  constructor(portName: string, width: number, seed: number) {
    this.rng = new Rng(seed);
    this.seed = seed;
    this.width = width;
    void portName;
  }

  /** Build in a local frame on all three parts at once. */
  at(x: number, y: number, z: number, ry: number, s: number, fn: () => void): void {
    for (const p of [this.solid, this.glass, this.glow, this.lit]) p.push(x, y, z, ry, s);
    fn();
    for (const p of [this.solid, this.glass, this.glow, this.lit]) p.pop();
  }

  /** Where the camera sees the centre of the backdrop at depth z (plus an offset). */
  vx(z: number, dx = 0): number {
    return viewX(z) + dx;
  }

  // ── terrain ──

  /** Raise (or lower) the ground with a smooth bump. */
  bump(cx: number, cz: number, rx: number, rz: number, height: number, sharp = 1): void {
    this.feats.push((x, z, h) => {
      const dx = (x - cx) / rx;
      const dz = (z - cz) / rz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1) return h;
      return h + height * Math.pow(1 - d * d * (3 - 2 * d), sharp);
    });
  }

  /** Pull the ground toward a level inside an ellipse (a plinth or a flattened site). */
  plateau(cx: number, cz: number, rx: number, rz: number, level: number, blend = 0.35): void {
    this.feats.push((x, z, h) => {
      const dx = (x - cx) / rx;
      const dz = (z - cz) / rz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1) return h;
      return lerp(h, level, smooth(1, 1 - blend, d));
    });
  }

  feature(f: HeightFn): void {
    this.feats.push(f);
  }

  /** Recolour terrain in places (cliffs, lava, chalk). */
  paint(f: (x: number, y: number, z: number, slope: number, c: THREE.Color) => void): void {
    this.paints.push(f);
  }

  /** The breakwater's head, decided before the landmark is built (so a landmark can use or avoid it). */
  mole = { endX: 0, dir: 1 as 1 | -1, top: 0.5, z: MOLE_Z };

  /** True if the whole footprint (centre and four corners) is dry land at least `minY` high. */
  onLand(x: number, z: number, rx = 0.1, rz = 0.1, minY = 0.25): boolean {
    return this.groundMin(x, z, rx, rz) >= minY;
  }

  /** Nearest x to `x` (stepping in `dir`, then the other way) where a footprint stands on dry land. */
  landX(x: number, z: number, rx = 0.2, rz = 0.2, dir: 1 | -1 = 1): number {
    for (let i = 0; i < 80; i++) {
      for (const s of [dir, -dir]) {
        const xx = x + s * i * 0.15;
        if (this.onLand(xx, z, rx, rz)) return xx;
      }
    }
    return x;
  }

  /** Keep houses out of a rectangle (landmarks stand there). */
  reserve(x: number, z: number, rx: number, rz: number): void {
    this.reserved.push({ x, z, rx, rz });
  }

  isReserved(x: number, z: number, pad = 0): boolean {
    for (const r of this.reserved) if (Math.abs(x - r.x) < r.rx + pad && Math.abs(z - r.z) < r.rz + pad) return true;
    return false;
  }

  /** The unmodified ground profile (before landmark features). */
  baseHeight(x: number, z: number): number {
    const d = SHORE_Z - z; // distance inland
    const sh = this.shape;
    const seed = this.seed % 1000;
    // waterline: a ramp from the sea floor up to the land
    let h: number;
    if (d < 0) h = lerp(-0.9, 0.0, smooth(2.2, 0, -d)) - 0.05;
    else h = lerp(0.0, LAND_Y, smooth(0, 0.7, d));
    if (this.shore === 'dike' && d > 0.3) h += 0.18 * (1 - smooth(0.3, 1.8, d)) + 0.0;
    // layered hills: ridges at growing distances, each a bump along z whose crest wanders along x
    const layers: Array<[number, number, number, number]> = [
      [sh.rise + 2.5, 3.2, sh.relief * 0.9, 1.0],
      [sh.rise + 8.5, 4.6, sh.relief * 1.3 + sh.range * 0.12, 0.75],
      [sh.rise + 17, 7, sh.range * 0.5, 0.5],
      [sh.rise + 30, 11, sh.range * 0.95, 0.35],
    ];
    layers.forEach(([d0, w0, a0, f0], i) => {
      const u = (d - d0) / w0;
      const prof = u < 0 ? Math.pow(smooth(-2.4, 0, u), 1.3) : Math.exp(-u * u * 0.7);
      if (prof < 0.002) return;
      const crest = 0.4 + lerp(0.5, 1.0, sh.rough) * fbm(x * sh.freq * f0 * 2.4 + i * 31, i * 13.7, seed + i * 5, 3) * 1.35;
      h += a0 * prof * crest;
    });
    // haze wall: the land never ends in front of the sky
    if (d > 40) h += (d - 40) * 0.12;
    return h;
  }

  /** The final height of the ground at (x, z). */
  ground(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    for (const f of this.feats) h = f(x, z, h);
    return h;
  }

  /** Highest ground under a footprint (a building sits on this and sinks a plinth below). */
  groundMax(x: number, z: number, hw: number, hd: number): number {
    let m = -Infinity;
    for (const dx of [-hw, 0, hw]) for (const dz of [-hd, 0, hd]) m = Math.max(m, this.ground(x + dx, z + dz));
    return m;
  }

  groundMin(x: number, z: number, hw: number, hd: number): number {
    let m = Infinity;
    for (const dx of [-hw, 0, hw]) for (const dz of [-hd, 0, hd]) m = Math.min(m, this.ground(x + dx, z + dz));
    return m;
  }

  /** The faceted terrain mesh. */
  buildTerrain(): THREE.Mesh {
    const W = this.width;
    const rows: number[] = [];
    // z rows: fine at the waterline, coarser with distance (the mesh is seen in perspective)
    for (let z = SHORE_Z + 2.4; z > SHORE_Z - 2.2; z -= 0.3) rows.push(z);
    for (let z = SHORE_Z - 2.2; z > -30; z -= 0.8) rows.push(z);
    for (let z = -30; z > -60; z -= 2.2) rows.push(z);
    for (let z = -60; z >= -112; z -= 5.5) rows.push(z);
    const nx = 60;
    const R = rows.length;
    const xMin = (z: number) => -(W / 2 + 14 + Math.max(0, -z - 10) * 0.7);
    const xMax = (z: number) => W / 2 + 14 + Math.max(0, -z - 10) * 0.35;
    const P: number[] = new Array(R * (nx + 1) * 3);
    for (let r = 0; r < R; r++) {
      const z = rows[r];
      for (let i = 0; i <= nx; i++) {
        const x = lerp(xMin(z), xMax(z), i / nx);
        const y = this.ground(x, z);
        const k = r * (nx + 1) + i;
        P[k * 3] = x;
        P[k * 3 + 1] = y;
        P[k * 3 + 2] = z;
      }
    }
    const pos: number[] = [];
    const col: number[] = [];
    const pal = this.palette;
    const cLand = new THREE.Color(pal.land);
    const cLand2 = new THREE.Color(pal.land2);
    const cHill = new THREE.Color(pal.hill);
    const cRock = new THREE.Color(pal.rock);
    const cSand = new THREE.Color(pal.sand);
    const cHaze = new THREE.Color(pal.haze);
    const cSnow = new THREE.Color(pal.snow ?? '#f3f6f8');
    const c = new THREE.Color();
    const rng = new Rng(this.seed ^ 0x51ed);
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const tri = (i0: number, i1: number, i2: number) => {
      va.set(P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]);
      vb.set(P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]);
      vc.set(P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]);
      nrm.subVectors(vb, va).cross(vc.clone().sub(va)).normalize();
      if (nrm.y < 0) {
        const t = i1;
        i1 = i2;
        i2 = t;
        nrm.negate();
        vb.set(P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]);
        vc.set(P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]);
      }
      const cx = (va.x + vb.x + vc.x) / 3;
      const cy = (va.y + vb.y + vc.y) / 3;
      const cz = (va.z + vb.z + vc.z) / 3;
      const slope = 1 - nrm.y; // 0 flat … 1 vertical
      const d = SHORE_Z - cz;
      // base: low land patchwork, grading into foothill colour with height
      const patch = noise2(cx * 0.35, cz * 0.35, this.seed % 977);
      c.copy(cLand).lerp(cLand2, patch);
      c.lerp(cHill, smooth(0.5, 3.2, cy) * 0.85);
      // the waterline strip
      const wet = 1 - smooth(0.02, 0.2, cy);
      const dry = 1 - smooth(0.3, 1.3, d);
      if (this.shore !== 'quay') c.lerp(cSand, clamp(dry * 0.9 + wet));
      else c.lerp(cSand, wet * 0.9);
      c.lerp(cRock, smooth(0.16, 0.42, slope) * 0.9);
      if (pal.snowLine !== undefined) c.lerp(cSnow, smooth(pal.snowLine - 0.4, pal.snowLine + 0.8, cy - slope * 0.6 + noise2(cx * 0.4, cz * 0.4, 5) * 0.8));
      for (const p of this.paints) p(cx, cy, cz, slope, c);
      // facets: a little per-face value jitter reads as hand-painted low poly
      const j = 0.94 + rng.next() * 0.1;
      c.multiplyScalar(j);
      // aerial perspective
      c.lerp(cHaze, 0.62 * smooth(-12, -62, cz) + 0.28 * smooth(-40, -100, cz));
      pos.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
    };
    for (let r = 0; r < R - 1; r++) {
      for (let i = 0; i < nx; i++) {
        const a = r * (nx + 1) + i;
        const b = a + 1;
        const cc = a + nx + 1;
        const dd = cc + 1;
        if ((i + r) % 2) {
          tri(a, cc, b);
          tri(b, cc, dd);
        } else {
          tri(a, cc, dd);
          tri(a, dd, b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.terrain);
    m.receiveShadow = true;
    return m;
  }

  // ── output ──

  /** Instanced wind-turbine rotors (spun by the update hook). */
  private rotorMesh(): THREE.InstancedMesh | null {
    if (!this.rotors.length) return null;
    const p = new Part();
    p.ao = 0;
    // three blades and a hub, in the XY plane (facing +z)
    p.ball(0, 0, 0.02, 0.05, '#e9ecef');
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI / 2;
      p.add(BOX, '#f1f3f4', [0, 0, 0], [0.05, 0.6, 0.012], { rz: a - Math.PI / 2 });
    }
    const mesh = p.build(MAT.rotor)!;
    const inst = new THREE.InstancedMesh(mesh.geometry, MAT.rotor, this.rotors.length);
    inst.castShadow = false;
    inst.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const set = (t: number) => {
      this.rotors.forEach((r, i) => {
        e.set(0, 0.33, (t * r.speed + r.phase) % (Math.PI * 2));
        q.setFromEuler(e);
        s.setScalar(r.s);
        pos.set(r.x, r.y, r.z);
        m.compose(pos, q, s);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
    };
    set(0);
    this.updaters.push(set);
    return inst;
  }

  /** Assemble the group: terrain, merged parts, rotors, extras; and its update hook. */
  finish(): THREE.Group {
    const g = this.group;
    const terrain = this.buildTerrain();
    g.add(terrain);
    this.solidTris = this.solid.tris;
    this.glassTris = this.glass.tris;
    const solid = this.solid.build(MAT.solid);
    if (solid) {
      solid.castShadow = true;
      solid.receiveShadow = true;
      g.add(solid);
    }
    const glass = this.glass.build(MAT.glass);
    if (glass) {
      glass.castShadow = true;
      g.add(glass);
    }
    const glow = this.glow.build(MAT.glow);
    if (glow) g.add(glow);
    const lit = this.lit.build(MAT.lit);
    if (lit) g.add(lit);
    const rot = this.rotorMesh();
    if (rot) g.add(rot);
    for (const e of this.extras) g.add(e);
    g.userData.stats = { solid: this.solidTris, glass: this.glassTris, terrain: (terrain.geometry.getAttribute('position').count / 3) | 0 };
    const ups = this.updaters;
    g.userData.update = (t: number) => {
      for (const u of ups) u(t);
    };
    return g;
  }
}

/** Free the GPU memory of a backdrop built by `buildPortScene` (geometries; textures of the flag). */
export function disposePortScene(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const x of list) {
      const map = (x as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      if ((x as THREE.Material).userData.own) x.dispose();
    }
  });
}

/** Night falls on every port scene at once: the lit windows glow warm (the sun, sky and hemisphere are the game's). */
export function setPortNight(on: boolean): void {
  MAT.lit.color.set(on ? '#ffd27a' : '#2d3d4f');
}
