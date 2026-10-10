import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { PortKit, noise2, smooth, lerp, clamp, SHORE_Z, LAND_Y, type Col, type V3 } from './kit';
import { windowOpening } from './facades';

export type RoofKind = 'gable' | 'front' | 'hip' | 'flat' | 'step' | 'mono' | 'dome';

export interface HouseStyle {
  walls: Col[];
  roofs: Col[];
  trim: Col;
  win: Col;
  floors: [number, number];
  floorH: number;
  w: [number, number];
  d: [number, number];
  roofKinds: Array<[RoofKind, number]>;
  /** roof height ÷ half-width */
  pitch: number;
  chimney: number;
  gap: [number, number];
  /** a door on the ground floor? */
  door?: Col;
  /** windows are slimmer / bigger */
  winW?: number;
  winH?: number;
  /** wall colours follow a row (terrace of one colour) instead of being random per house */
  runs?: boolean;
  /** shutter colour (Mediterranean) */
  shutters?: Col;
}

export function pick<T>(rng: Rng, a: readonly T[]): T {
  return a[Math.floor(rng.next() * a.length)];
}

export function tint(c: Col, k: number): THREE.Color {
  const t = new THREE.Color(c);
  if (k < 0) t.multiplyScalar(1 + k);
  else t.lerp(new THREE.Color('#ffffff'), k);
  return t;
}

/** Windows on the front (+z) and right (+x) faces, the two the camera sees. */
function windows(k: PortKit, x: number, y0: number, z: number, w: number, d: number, floors: number, hs: HouseStyle, rng: Rng, sides: boolean): void {
  const p = k.solid;
  const ww = hs.winW ?? 0.055;
  const wh = hs.winH ?? 0.085;
  const fh = hs.floorH;
  const cols = Math.min(4, Math.max(1, Math.round((w - 0.08) / (ww * 2.8))));
  const sp = w / cols;
  const zf = z + d / 2 + 0.004;
  for (let f = 0; f < floors; f++) {
    const yy = y0 + f * fh + (fh - wh) / 2 + 0.01;
    for (let i = 0; i < cols; i++) {
      const cx = x - w / 2 + sp * (i + 0.5);
      if (f === 0 && hs.door && i === Math.floor(cols / 2) && rng.chance(0.7)) {
        windowOpening(k, p, 'front', [cx, y0 + 0.01, zf], 0.06, 0.11, hs.door, hs.trim, false);
        p.boxV(cx, y0 - 0.002, zf + 0.025, 0.085, 0.017, 0.058, tint(hs.trim, -0.15));
        continue;
      }
      windowOpening(k, rng.chance(0.4) ? k.lit : p, 'front', [cx, yy, zf], ww, wh, hs.win, hs.trim);
    }
  }
  if (!sides || hs.gap[1] < 0.04) return;
  const sc = Math.max(1, Math.round((d - 0.08) / (ww * 3.4)));
  const ss = d / sc;
  const xf = x + w / 2 + 0.004;
  for (let f = 0; f < floors; f++) {
    const yy = y0 + f * fh + (fh - wh) / 2 + 0.01;
    for (let i = 0; i < sc; i++) {
      const cz = z + d / 2 - ss * (i + 0.5);
      windowOpening(k, rng.chance(0.4) ? k.lit : p, 'right', [xf, yy, cz], ww, wh, hs.win, hs.trim);
    }
  }
}

/** One building on the ground. Returns the y of its eaves. */
export function house(
  k: PortKit,
  x: number,
  z: number,
  w: number,
  d: number,
  floors: number,
  hs: HouseStyle,
  rng: Rng,
  kind: RoofKind,
  wall: Col,
  roof: Col,
  detail: boolean | 'front' = true,
): number {
  const hw = w / 2;
  const hd = d / 2;
  const gTop = k.groundMax(x, z, hw, hd);
  const gLow = k.groundMin(x, z, hw, hd);
  const sink = gTop - gLow + 0.08;
  const h = floors * hs.floorH;
  const p = k.solid;
  p.boxV(x, gTop - sink, z, w, h + sink, d, wall);
  if (detail) windows(k, x, gTop, z, w, d, floors, hs, rng, detail === true);
  const top = gTop + h;
  if (detail) {
    // Narrow courses anchor the building to the street and separate the roof from its walls.
    p.boxV(x, gTop, z, w + 0.012, 0.035, d + 0.012, tint(wall, -0.24));
    p.boxV(x, top - 0.027, z, w + 0.022, 0.024, d + 0.022, hs.trim);
  }
  const rh = Math.max(0.05, hd * hs.pitch);
  switch (kind) {
    case 'gable': {
      // ridge along x; the right-hand gable end is wall-coloured
      const rr = Math.max(0.05, (hd + 0.03) * hs.pitch);
      p.prism(x, top, z, d + 0.06, rr, w, roof, { ry: Math.PI / 2 });
      p.tri([x + hw + 0.002, top, z + hd + 0.03], [x + hw + 0.002, top, z - hd - 0.03], [x + hw + 0.002, top + rr, z], wall);
      if (rng.chance(hs.chimney)) p.box(x + rng.range(-0.25, 0.25) * w, top + rr * 0.35, z - hd * 0.3, 0.05, rr * 0.9, 0.05, '#8a5a48');
      break;
    }
    case 'front': {
      const rr = Math.max(0.05, (hw + 0.02) * hs.pitch);
      p.prism(x, top, z, w + 0.04, rr, d + 0.03, roof);
      p.tri([x - hw - 0.02, top, z + hd + 0.0155], [x + hw + 0.02, top, z + hd + 0.0155], [x, top + rr, z + hd + 0.0155], wall);
      if (rng.chance(hs.chimney)) p.box(x + rng.range(-0.2, 0.2) * w, top + rr * 0.4, z - hd * 0.2, 0.05, rr * 0.8, 0.05, '#7d5446');
      break;
    }
    case 'hip': {
      p.pyramid(x, top, z, w + 0.07, Math.max(0.05, rh * 0.9), d + 0.07, roof);
      break;
    }
    case 'flat': {
      p.box(x, top, z, w + 0.025, 0.035, d + 0.025, hs.trim);
      break;
    }
    case 'step': {
      const rr = Math.max(0.05, (hw + 0.02) * hs.pitch * 0.9);
      p.prism(x, top, z - 0.02, w + 0.03, rr, d, roof);
      const n = 3;
      const sh = rr / (n + 0.6);
      for (let i = 0; i < n; i++) p.box(x, top + i * sh, z + hd - 0.02, w * (1 - (i + 0.6) / (n + 0.9)) + 0.02, sh + 0.004, 0.05, wall);
      break;
    }
    case 'mono': {
      p.prism(x, top, z, w + 0.04, Math.max(0.05, rh * 0.6), d + 0.04, roof, { ax: 0.5 });
      break;
    }
    case 'dome': {
      p.box(x, top, z, w + 0.02, 0.03, d + 0.02, wall);
      break;
    }
  }
  k.reserve(x, z, hw + 0.01, hd + 0.01);
  return top;
}

export interface TownOpts {
  x0: number;
  x1: number;
  /** z of the front row */
  z: number;
  rows: number;
  rowStep?: number;
  hs: HouseStyle;
  /** x around which everything is built in detail (the camera's centre) */
  cx?: number;
  /** keep houses on ground at least this high */
  minY?: number;
  /** skip a site where the ground varies by more than this */
  maxSlope?: number;
  /** probability that a site is left empty (gardens, lanes) */
  gaps?: number;
  /** floors bonus per row (taller buildings behind) */
  rowRise?: number;
}

/** Rows of houses along the far shore, stepping back up the foothills. */
export function buildTown(k: PortKit, o: TownOpts): number {
  const hs = o.hs;
  const rng = new Rng(k.seed ^ 0x7041);
  const cx = o.cx ?? k.vx(o.z);
  const step = o.rowStep ?? 0.62;
  let n = 0;
  for (let r = 0; r < o.rows; r++) {
    const zr = o.z - r * step - rng.range(-0.04, 0.04);
    let x = o.x0 + rng.range(0, 0.4);
    let runWall = pick(rng, hs.walls);
    let runLeft = 0;
    while (x < o.x1) {
      const w = rng.range(hs.w[0], hs.w[1]);
      const d = rng.range(hs.d[0], hs.d[1]);
      const gap = rng.range(hs.gap[0], hs.gap[1]);
      const px = x + w / 2;
      const far = Math.abs(px - cx);
      x += w + gap;
      // thin the far reaches out: they only matter while the harbour scrolls
      if (far > 12 && rng.chance(clamp((far - 12) / 9, 0, 0.88))) continue;
      if (o.gaps && rng.chance(o.gaps)) continue;
      if (k.isReserved(px, zr, 0.02)) continue;
      const gTop = k.groundMax(px, zr, w / 2, d / 2);
      const gLow = k.groundMin(px, zr, w / 2, d / 2);
      if (gLow < (o.minY ?? 0.22) || gTop - gLow > (o.maxSlope ?? 0.5)) continue;
      const fl = noise2(px * 0.55, r * 3.1, k.seed % 313);
      const floors = Math.max(hs.floors[0], Math.min(hs.floors[1], Math.round(lerp(hs.floors[0] - 0.4, hs.floors[1] + 0.4, fl) + (o.rowRise ?? 0) * r + (rng.chance(0.15) ? 1 : 0))));
      let wall: Col;
      if (hs.runs) {
        if (runLeft <= 0) {
          runWall = pick(rng, hs.walls);
          runLeft = rng.int(2, 5);
        }
        runLeft--;
        wall = runWall;
      } else wall = pick(rng, hs.walls);
      const roof = tint(pick(rng, hs.roofs), rng.range(-0.08, 0.08));
      const kind = hs.roofKinds[rng.weighted(hs.roofKinds.map((q) => q[1]))][0];
      house(k, px, zr, w, d, floors, hs, rng, kind, wall, roof, far < 12 ? (r < 2 ? true : far < 7 ? 'front' : false) : false);
      n++;
    }
  }
  return n;
}

// ───────────────────────────── trees ─────────────────────────────

export type TreeKind = 'pine' | 'fir' | 'round' | 'cypress' | 'palm' | 'birch' | 'bush' | 'baobab' | 'poplar' | 'olive';

const GREENS = ['#4f7a4b', '#5b8553', '#46703f', '#628f58'];
const PINES = ['#2f5d43', '#356b4a', '#2a5440', '#3b6f4e'];

export function tree(k: PortKit, kind: TreeKind, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  switch (kind) {
    case 'pine':
    case 'fir': {
      const c = pick(rng, PINES);
      const snow = kind === 'fir';
      for (let i = 0; i < 3; i++) {
        const r = (0.11 - i * 0.027) * s;
        p.cone(x, y + (0.02 + i * 0.13) * s, z, r, 0.2 * s, tint(c, i * 0.05), { seg: 6 });
      }
      if (snow) p.cone(x, y + 0.34 * s, z, 0.032 * s, 0.07 * s, '#f1f5f7', { seg: 6 });
      break;
    }
    case 'round':
    case 'olive': {
      const c = kind === 'olive' ? pick(rng, ['#8da17a', '#7d9470', '#98a984']) : pick(rng, GREENS);
      p.cyl(x, y, z, 0.014 * s, 0.01 * s, 0.1 * s, '#6a523f', { seg: 5 });
      p.blob(x, y + 0.14 * s, z, 0.105 * s, c, { sy: 0.9, ry: rng.next() * 3 });
      if (kind === 'round' && s > 1.1) p.blob(x + 0.04 * s, y + 0.2 * s, z, 0.07 * s, tint(c, 0.08), { sy: 0.9 });
      break;
    }
    case 'birch': {
      p.cyl(x, y, z, 0.012 * s, 0.01 * s, 0.14 * s, '#e6e3da', { seg: 5 });
      p.blob(x, y + 0.2 * s, z, 0.085 * s, pick(rng, ['#9bb76a', '#a9c26f', '#8cae5f']), { sy: 1.15, ry: rng.next() * 3 });
      break;
    }
    case 'cypress': {
      p.cyl(x, y, z, 0.07 * s, 0.006 * s, 0.5 * s, pick(rng, ['#2d5a3a', '#325f40', '#28513a']), { seg: 6, open: true });
      break;
    }
    case 'poplar': {
      p.cyl(x, y, z, 0.012 * s, 0.01 * s, 0.1 * s, '#6a523f', { seg: 5 });
      p.blob(x, y + 0.3 * s, z, 0.06 * s, pick(rng, ['#6f9a52', '#7aa65a']), { sy: 3.2 });
      break;
    }
    case 'bush': {
      p.blob(x, y + 0.04 * s, z, 0.075 * s, pick(rng, ['#6b8f55', '#7a9b5a', '#5e8450']), { sy: 0.7, ry: rng.next() * 3 });
      break;
    }
    case 'baobab': {
      p.cyl(x, y, z, 0.1 * s, 0.065 * s, 0.34 * s, '#8d7459', { seg: 8 });
      p.blob(x, y + 0.4 * s, z, 0.17 * s, '#6c8a4c', { sy: 0.45 });
      p.rod([x, y + 0.34 * s, z], [x - 0.12 * s, y + 0.46 * s, z], 0.012 * s, '#8d7459');
      p.rod([x, y + 0.34 * s, z], [x + 0.12 * s, y + 0.46 * s, z + 0.03 * s], 0.012 * s, '#8d7459');
      break;
    }
    case 'palm': {
      const lean = rng.range(-0.06, 0.06) * s;
      const hgt = rng.range(0.42, 0.55) * s;
      const trunk = '#9b8466';
      let px = x;
      let py = y;
      const segs = 3;
      for (let i = 0; i < segs; i++) {
        const nx = px + lean / segs;
        const ny = py + hgt / segs;
        p.rod([px, py, z], [nx, ny, z], 0.016 * s * (1 - i * 0.15), trunk, 5);
        px = nx;
        py = ny;
      }
      const fr = ['#4d8a3e', '#5a9a46', '#3f7a38'];
      const n = 7;
      const a0 = rng.next() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * Math.PI * 2) / n;
        const L = 0.2 * s;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const base: V3 = [px, py, z];
        const mid: V3 = [px + dx * L * 0.55, py + 0.045 * s, z + dz * L * 0.55];
        const tip: V3 = [px + dx * L, py - 0.07 * s, z + dz * L];
        const nxp = -dz * 0.045 * s;
        const nzp = dx * 0.045 * s;
        const left: V3 = [mid[0] + nxp, mid[1], mid[2] + nzp];
        const right: V3 = [mid[0] - nxp, mid[1], mid[2] - nzp];
        p.tri(base, left, right, fr[i % 3], true);
        p.tri(left, tip, right, fr[(i + 1) % 3], true);
      }
      p.ball(px, py - 0.015 * s, z, 0.02 * s, '#6e5a3c');
      break;
    }
  }
}

export interface ScatterOpts {
  count: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  size?: [number, number];
  minY?: number;
  maxY?: number;
  /** keep clear of buildings and landmarks by this margin */
  pad?: number;
  /** probability multiplier per site (0..1) */
  mask?: (x: number, z: number) => number;
  /** trees per grove (1 = scattered singly) */
  grove?: number;
}

/** Scatter trees over an area (in groves), on land only, away from buildings. */
export function scatter(k: PortKit, kinds: TreeKind | TreeKind[], o: ScatterOpts): void {
  const rng = new Rng(k.seed ^ 0x7ee5 ^ (o.count * 31));
  const list = Array.isArray(kinds) ? kinds : [kinds];
  const grove = Math.max(1, o.grove ?? 1);
  const sz = o.size ?? [0.8, 1.3];
  let placed = 0;
  let guard = 0;
  while (placed < o.count && guard++ < o.count * 14) {
    const cx = rng.range(o.x0, o.x1);
    const cz = rng.range(o.z0, o.z1);
    if (o.mask && !rng.chance(o.mask(cx, cz))) continue;
    const n = grove === 1 ? 1 : rng.int(Math.ceil(grove * 0.5), grove);
    const rad = grove === 1 ? 0 : 0.35 + grove * 0.07;
    const kind = pick(rng, list);
    for (let i = 0; i < n && placed < o.count; i++) {
      const a = rng.next() * 6.283;
      const r = Math.sqrt(rng.next()) * rad;
      const x = cx + Math.cos(a) * r * 1.4;
      const z = cz + Math.sin(a) * r;
      const y = k.ground(x, z);
      if (y < (o.minY ?? 0.25) || y > (o.maxY ?? 99)) continue;
      if (k.isReserved(x, z, o.pad ?? 0.08)) continue;
      tree(k, rng.chance(0.85) ? kind : pick(rng, list), x, z, rng.range(sz[0], sz[1]), rng, y - 0.02);
      placed++;
    }
  }
}

// ───────────────────────────── shoreline ─────────────────────────────

/** A quay wall along the far shore: stone face down into the water, coping, bollards. */
export function quayWall(k: PortKit, x0: number, x1: number, z = SHORE_Z + 0.05, color: Col = '#a8a69e', coping: Col = '#c9c5ba'): void {
  const p = k.solid;
  // runs of wall only where there is land behind it: rivers and inlets carved into the shore stay open
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  const step = 0.5;
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    const land = k.ground(x, z - 0.6) > 0.1;
    if (land && start === null) start = x;
    if ((!land || x + step > x1) && start !== null) {
      runs.push([start, land ? x1 : x]);
      start = null;
    }
  }
  for (const [a, b] of runs) {
    const len = b - a;
    if (len < 0.3) continue;
    const cx = (a + b) / 2;
    p.box(cx, -0.7, z, len, 0.7 + LAND_Y, 0.3, color);
    p.box(cx, LAND_Y, z, len, 0.035, 0.34, coping);
    p.box(cx, -0.06, z + 0.152, len, 0.12, 0.012, '#6f7b7e', { ao: 0 });
  }
  const rng = new Rng(k.seed ^ 0xbad);
  for (let x = x0 + 0.8; x < x1; x += rng.range(1.5, 2.2)) {
    if (Math.abs(x - k.vx(z)) > 16 && rng.chance(0.5)) continue;
    if (!runs.some(([a, b]) => x > a + 0.1 && x < b - 0.1)) continue;
    p.cyl(x, LAND_Y + 0.03, z + 0.08, 0.035, 0.03, 0.05, '#2d3138', { seg: 7 });
  }
}

/** A beach / rock shingle line is carried by the terrain colours; this adds the lapping foam strip. */
export function foamLine(k: PortKit, x0: number, x1: number, z = SHORE_Z + 0.5): void {
  const p = k.solid;
  p.ao = 0;
  p.box((x0 + x1) / 2, 0.0, z, x1 - x0, 0.012, 0.09, '#eaf9fb');
  p.ao = 0.16;
}

export { smooth };
