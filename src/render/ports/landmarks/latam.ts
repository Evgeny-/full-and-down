import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { Part, PortKit, SHORE_Z, LAND_Y, lerp, smooth, noise2, type Col, type V3, type TerrainPalette, type TerrainShape } from '../kit';
import type { Landmark } from '../landmark';
import type { Region, RegionId } from '../regions';
import { buildTown, tint, type HouseStyle } from '../town';
import { tower, cableStayed } from '../structures';
import { church, gantryCrane, boat } from '../props';
import { lighthouse } from '../harbour';

/**
 * Latin America and the Caribbean, Peru to Mexico and Santos: the "Banana Coast" (reefers, plantations)
 * with its colonial towns, forts and canal. Owns two regional looks (latam, caribbean), the landmarks and the
 * port rows. Callao (Real Felipe), Paita, Puerto Bolivar, Guayaquil (Las Penas), Balboa (Bridge of the Americas),
 * Colon (Agua Clara locks), Puerto Limon, Turbo, Cartagena, Santa Marta, Kingston, Santo Tomas, Veracruz, Santos.
 */

// ───────────────────────────── helpers ─────────────────────────────

const c3 = (hex: string): THREE.Color => new THREE.Color(hex);

/** Centre x of a landmark at depth z, leaned away from the breakwater head (which carries the lighthouse and the flag). */
const centre = (k: PortKit, z: number, lean = 1.2): number => k.vx(z) + k.mole.dir * lean;

/** A rectangle facing +z (front) at depth z. */
function fq(p: Part, x0: number, x1: number, y0: number, y1: number, z: number, c: Col): void {
  p.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c);
}

/** A rectangle facing +x (right) at x, from zn (near) to zf (far). */
function rq(p: Part, x: number, y0: number, y1: number, zn: number, zf: number, c: Col): void {
  p.quad([x, y0, zn], [x, y0, zf], [x, y1, zf], [x, y1, zn], c);
}

/** Set a port's ground in one go: palette and shape overrides, and the shoreline. */
function ground(k: PortKit, pal: Partial<TerrainPalette>, shape: Partial<TerrainShape>, shore?: PortKit['shore']): void {
  k.palette = { ...k.palette, ...pal };
  k.shape = { ...k.shape, ...shape };
  if (shore) k.shore = shore;
}

/** A filled five-pointed star facing +z (a flat fan of triangles). */
function starFlat(p: Part, cx: number, cy: number, r: number, z: number, c: Col): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push([cx + Math.cos(a) * rr, cy - Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 10];
    p.tri([cx, cy, z], [b[0], b[1], z], [a[0], a[1], z], c, true);
  }
}

/** A wooden or stone quay slab: top at `top`, sunk to the sea floor. */
function quayDeck(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, top: number, color: Col): void {
  const cx = (x0 + x1) / 2;
  k.solid.box(cx, -0.9, (zBack + zFront) / 2, x1 - x0, 0.9 + top, zFront - zBack, color);
}

/** A wooden pier on piles: a thin plank deck at `top`, a pair of piles every half unit, cross beams. It runs along z. */
function pier(k: PortKit, x: number, z0: number, z1: number, w: number, top: number, deck: Col = '#8a6f52'): void {
  const p = k.solid;
  const len = Math.abs(z1 - z0);
  const zc = (z0 + z1) / 2;
  p.box(x, top - 0.05, zc, w, 0.05, len, deck);
  p.box(x, top - 0.1, zc, w * 0.6, 0.05, len, tint(deck, -0.25), { ao: 0 });
  for (let z = Math.min(z0, z1) + 0.15; z < Math.max(z0, z1); z += 0.5) {
    for (const s of [-1, 1]) p.rod([x + (s * w) / 2.3, -0.8, z], [x + (s * w) / 2.3, top - 0.05, z], 0.022, '#5e4a38', 4);
    p.box(x, top - 0.09, z, w + 0.02, 0.03, 0.04, '#6b5a48', { ao: 0 });
  }
  // plank lines on the deck
  for (let z = Math.min(z0, z1) + 0.1; z < Math.max(z0, z1) - 0.05; z += 0.2) p.quad([x - w / 2, top + 0.002, z], [x + w / 2, top + 0.002, z], [x + w / 2, top + 0.002, z + 0.012], [x - w / 2, top + 0.002, z + 0.012], tint(deck, -0.3));
  k.reserve(x, zc, w / 2 + 0.1, len / 2 + 0.1);
}

// ───────────────────────────── plants ─────────────────────────────

const FROND = ['#4d8a3e', '#5a9a46', '#3f7a38'];

/** A coconut palm: a leaning trunk and a crown of drooping fronds (about 65 triangles). */
function palm(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03, fronds = 7): void {
  const p = k.solid;
  const hgt = rng.range(0.5, 0.66) * s;
  const lean = rng.range(-0.08, 0.08) * s;
  const mx = x + lean * 0.35;
  const tx = x + lean;
  p.rod([x, y, z], [mx, y + hgt * 0.55, z], 0.017 * s, '#a08a6a', 4);
  p.rod([mx, y + hgt * 0.55, z], [tx, y + hgt, z], 0.013 * s, '#a08a6a', 4);
  const ty = y + hgt;
  const a0 = rng.next() * 6.28;
  for (let i = 0; i < fronds; i++) {
    const a = a0 + (i * Math.PI * 2) / fronds;
    const L = 0.21 * s;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const mid: V3 = [tx + dx * L * 0.55, ty + 0.05 * s, z + dz * L * 0.55];
    const tip: V3 = [tx + dx * L, ty - 0.07 * s, z + dz * L];
    const nx = -dz * 0.05 * s;
    const nz = dx * 0.05 * s;
    const left: V3 = [mid[0] + nx, mid[1], mid[2] + nz];
    const right: V3 = [mid[0] - nx, mid[1], mid[2] - nz];
    p.tri([tx, ty, z], left, right, FROND[i % 3], true);
    p.tri(left, tip, right, FROND[(i + 1) % 3], true);
  }
  p.blob(tx, ty - 0.02 * s, z, 0.03 * s, '#6e5a3c');
}

const LEAF = ['#7fbf4a', '#6aae3f', '#8fcf5a', '#74b844'];

/** A banana plant: a short pseudostem and five long, arching leaves (about 26 triangles). */
function banana(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const h = 0.13 * s;
  p.rod([x, y, z], [x, y + h, z], 0.017 * s, '#9bbf62', 3);
  const a0 = rng.next() * 6.28;
  for (let i = 0; i < 5; i++) {
    const a = a0 + i * 1.2566;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const L = 0.19 * s;
    const base: V3 = [x, y + h, z];
    const mid: V3 = [x + dx * L * 0.5, y + h + 0.075 * s, z + dz * L * 0.5];
    const tip: V3 = [x + dx * L, y + h - 0.02 * s, z + dz * L];
    const nx = -dz * 0.045 * s;
    const nz = dx * 0.045 * s;
    const left: V3 = [mid[0] + nx, mid[1], mid[2] + nz];
    const right: V3 = [mid[0] - nx, mid[1], mid[2] - nz];
    const col = LEAF[(i + (rng.chance(0.5) ? 1 : 0)) % 4];
    p.tri(base, left, right, col, true);
    p.tri(left, tip, right, tint(col, -0.06), true);
  }
  // the bunch, bagged in blue plastic, hanging under the crown
  p.boxV(x + 0.03 * s, y + 0.045 * s, z + 0.035 * s, 0.045 * s, 0.085 * s, 0.045 * s, rng.chance(0.7) ? '#4a8fe0' : '#d9d070', { ao: 0 });
}

const JUNGLE = ['#2f6b3c', '#3a7a42', '#2a5e38', '#447f45', '#356f40'];

/** A broadleaf forest tree: a thin trunk and two or three crown blobs. */
function jungle(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const c = JUNGLE[Math.floor(rng.next() * JUNGLE.length)];
  p.rod([x, y, z], [x, y + 0.15 * s, z], 0.014 * s, '#5e4a38', 3);
  p.blob(x, y + 0.22 * s, z, 0.12 * s, c, { sy: 0.9, ry: rng.next() * 3 });
  p.blob(x + 0.05 * s, y + 0.3 * s, z + 0.02 * s, 0.085 * s, tint(c, 0.08), { sy: 0.9, ry: rng.next() * 3 });
}

type Kind = 'palm' | 'banana' | 'jungle' | 'bush' | 'tall' | 'scrub';

function plantOne(k: PortKit, kind: Kind, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  switch (kind) {
    case 'palm':
      palm(k, x, z, s, rng, y);
      break;
    case 'banana':
      banana(k, x, z, s, rng, y + 0.01);
      break;
    case 'jungle':
      jungle(k, x, z, s, rng, y);
      break;
    case 'tall': {
      // a tall forest giant (ceiba): a long trunk and a flat crown
      const p = k.solid;
      p.rod([x, y, z], [x, y + 0.42 * s, z], 0.02 * s, '#6b5a48', 4);
      p.blob(x, y + 0.5 * s, z, 0.16 * s, JUNGLE[Math.floor(rng.next() * JUNGLE.length)], { sy: 0.55, ry: rng.next() * 3 });
      break;
    }
    case 'scrub':
      k.solid.blob(x, y + 0.03 * s, z, 0.07 * s, ['#b8a878', '#a89868', '#9c8c60', '#aa9a70'][Math.floor(rng.next() * 4)], { sy: 0.6, ry: rng.next() * 3 });
      break;
    default:
      k.solid.blob(x, y + 0.04 * s, z, 0.075 * s, ['#6b8f55', '#7a9b5a', '#5e8450'][Math.floor(rng.next() * 3)], { sy: 0.7, ry: rng.next() * 3 });
  }
}

interface Sow {
  n: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kinds: Kind[];
  size?: [number, number];
  minY?: number;
  maxY?: number;
  /** probability multiplier per site */
  mask?: (x: number, z: number) => number;
  /** plants per cluster */
  grove?: number;
  pad?: number;
}

/** Scatter plants over land in clusters, clear of buildings and landmarks. Returns how many stand. */
function sow(k: PortKit, rng: Rng, o: Sow): number {
  const grove = Math.max(1, o.grove ?? 1);
  const sz = o.size ?? [0.9, 1.4];
  let placed = 0;
  let guard = 0;
  while (placed < o.n && guard++ < o.n * 16) {
    const cx = rng.range(o.x0, o.x1);
    const cz = rng.range(o.z0, o.z1);
    if (o.mask && !rng.chance(o.mask(cx, cz))) continue;
    const n = grove === 1 ? 1 : rng.int(Math.ceil(grove * 0.5), grove);
    const rad = grove === 1 ? 0 : 0.3 + grove * 0.06;
    const kind = o.kinds[Math.floor(rng.next() * o.kinds.length)];
    for (let i = 0; i < n && placed < o.n; i++) {
      const a = rng.next() * 6.283;
      const r = Math.sqrt(rng.next()) * rad;
      const x = cx + Math.cos(a) * r * 1.4;
      const z = cz + Math.sin(a) * r;
      const y = k.ground(x, z);
      if (y < (o.minY ?? 0.3) || y > (o.maxY ?? 99)) continue;
      if (k.isReserved(x, z, o.pad ?? 0.1)) continue;
      plantOne(k, rng.chance(0.85) ? kind : o.kinds[Math.floor(rng.next() * o.kinds.length)], x, z, rng.range(sz[0], sz[1]), rng, y - 0.03);
      placed++;
    }
  }
  return placed;
}

/** `sow` over the whole width of the scene (the harbour scrolls) and, denser, round the view centre `c`. */
function sowWide(k: PortKit, rng: Rng, c: number, o: Omit<Sow, 'x0' | 'x1'>): number {
  const far = Math.round(o.n * 0.4);
  const a = sow(k, rng, { ...o, n: far, x0: -k.width / 2 + 1, x1: k.width / 2 - 1 });
  return a + sow(k, rng, { ...o, n: o.n - far, x0: c - 12, x1: c + 11 });
}

// ───────────────────────────── houses ─────────────────────────────

const TERRACOTTA = ['#b8553d', '#c4673f', '#a64b36', '#c97b4a'];

/** Pastel colonial houses under clay tiles. */
const colonial: HouseStyle = {
  walls: ['#f2d98a', '#eba9a0', '#a6d4c4', '#a9c8e8', '#f4e6c8', '#ebba8c', '#d9a9cb', '#cddb9a'],
  roofs: TERRACOTTA,
  trim: '#f6f3ea',
  win: '#3a4a58',
  floors: [1, 3],
  floorH: 0.19,
  w: [0.34, 0.54],
  d: [0.34, 0.46],
  roofKinds: [['hip', 4], ['gable', 4], ['flat', 1], ['front', 1]],
  pitch: 0.42,
  chimney: 0,
  gap: [0, 0.04],
  door: '#6a4a38',
};

/** Bright wooden Caribbean houses under zinc and tin. */
const caribbean: HouseStyle = {
  walls: ['#e8c53a', '#d9573a', '#3f9bd0', '#4fb89a', '#f08fa8', '#f1ece0', '#e68a3a', '#8a6fc0', '#7cc65a'],
  roofs: ['#8a8f94', '#a64b36', '#6c747a', '#4f7a8a', '#b0603f'],
  trim: '#ffffff',
  win: '#2e3a48',
  floors: [1, 2],
  floorH: 0.2,
  w: [0.3, 0.46],
  d: [0.3, 0.42],
  roofKinds: [['gable', 4], ['front', 3], ['mono', 2], ['hip', 1]],
  pitch: 0.55,
  chimney: 0,
  gap: [0.03, 0.14],
  door: '#f6f3ea',
};

/** Houses for one port: the pipeline's buildTown with this port's own style. */
function town(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number; x0?: number; x1?: number } = {}): void {
  buildTown(k, {
    x0: o.x0 ?? -k.width / 2 - 2,
    x1: o.x1 ?? k.width / 2 + 2,
    z,
    rows,
    rowStep: o.rowStep ?? 0.6,
    hs,
    gaps: o.gaps ?? 0.06,
    rowRise: o.rowRise ?? 0,
    cx: k.vx(z) + (o.shift ?? 0),
    minY: o.minY,
    maxSlope: o.maxSlope,
  });
}

// ───────────────────────────── regions ─────────────────────────────

const latamRegion: Region = {
  id: 'latam',
  houses: colonial,
  palette: { land: '#8dbb62', land2: '#7fb058', hill: '#4f8f50', rock: '#9a8f7f', sand: '#e6d6a8', haze: '#d5e8e4' },
  shape: { relief: 1.8, range: 4.5, rise: 3.5, rough: 0.5, freq: 0.09 },
  shore: 'quay',
  rows: 4,
  rowStep: 0.6,
  gaps: 0.06,
  // the landmarks sow most of their own palms, scrub and forest (see `sow`); the region adds a light sprinkle of palms
  trees: [{ kinds: ['palm', 'palm', 'bush'], count: 16, where: 'plain', size: [0.9, 1.3], grove: 4, maxY: 0.9 }],
  armour: 'rocks',
  lights: [0, 1, 4],
  boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#e9a31a', '#c8302a', '#2c8aa5', '#f6f3ea'] },
  extras: (k, rng) => {
    church(k, k.vx(-14) + rng.range(-4, 4), -14.4, { wall: '#f4efe0', roof: '#b8553d', spire: '#b8553d', style: 'flat', h: 1.1 });
  },
};

const caribbeanRegion: Region = {
  id: 'caribbean',
  houses: caribbean,
  palette: { land: '#86c065', land2: '#78b45c', hill: '#3f8a4a', rock: '#9a9488', sand: '#f0e2b4', haze: '#d2ecec' },
  shape: { relief: 1.6, range: 4, rise: 3.5, rough: 0.45, freq: 0.09 },
  shore: 'beach',
  rows: 4,
  rowStep: 0.6,
  gaps: 0.1,
  trees: [{ kinds: ['palm', 'palm', 'bush'], count: 18, where: 'plain', size: [0.9, 1.4], grove: 4, maxY: 0.9 }],
  armour: 'tetrapods',
  lights: [0, 1, 3],
  boats: { kinds: ['fishing', 'sail'], n: 5, colors: ['#e9a31a', '#c8302a', '#2c8aa5', '#3f8d6b', '#f6f3ea'] },
  extras: (k, rng) => {
    church(k, k.vx(-14) + rng.range(-4, 4), -14.4, { wall: '#f6f3ea', roof: '#8a8f94', spire: '#8a8f94', h: 0.95 });
  },
};

export const REGIONS: Partial<Record<RegionId, Region>> = { latam: latamRegion, caribbean: caribbeanRegion };

// ───────────────────────────── ships ─────────────────────────────

const BOX_COLORS = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5'];

/** The raked bow of a ship: a wedge from x = bx to the stem, `top` high at the stem. Hull-coloured, with a sunk keel line. */
function bow(p: Part, bx: number, hw: number, y0: number, y1: number, tip: number, col: Col): void {
  const v: V3[] = [[bx, y0, hw], [bx, y1, hw], [bx, y0, -hw], [bx, y1, -hw], [tip, y1 + 0.1, 0], [tip - 0.35, y0, 0]];
  p.solid(v, [[0, 1, 4, 5], [2, 3, 4, 5], [1, 3, 4], [0, 2, 5]], col, { ao: 0.1 });
}

/** Windows in rows on the front face of a deckhouse (+z). */
function portholes(p: Part, x0: number, x1: number, y: number, rows: number, step: number, z: number, col: Col): void {
  const n = Math.max(1, Math.round((x1 - x0) / 0.13));
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) fq(p, x0 + 0.03 + i * ((x1 - x0 - 0.06) / n), x0 + 0.03 + i * ((x1 - x0 - 0.06) / n) + 0.07, y + r * step, y + r * step + 0.07, z, col);
}

/**
 * A white banana boat (reefer): a raised bow, four hatches with paired derricks, the accommodation aft with a
 * striped funnel. `L` is the length overall; the bow points to +x (turned by `ry`). Afloat: the hull runs to y = -0.3.
 */
function reefer(k: PortKit, x: number, z: number, L: number, o: { ry?: number; stripe?: Col; hull?: Col } = {}): void {
  const p = k.solid;
  const hull = o.hull ?? '#f2f4f3';
  const stripe = o.stripe ?? '#2f7a9e';
  k.at(x, 0, z, o.ry ?? 0, L / 6, () => {
    const hw = 0.47;
    p.box(-0.15, -0.3, 0, 5.7, 0.34, hw * 2, '#a63a2e', { ao: 0.1 });
    p.box(-0.15, 0.04, 0, 5.7, 0.46, hw * 2, hull, { ao: 0.06 });
    p.box(-0.15, 0.2, 0, 5.72, 0.07, hw * 2 + 0.01, stripe, { ao: 0 });
    bow(p, 2.7, hw, -0.3, 0.5, 3.45, hull);
    p.box(-0.1, 0.5, 0, 5.7, 0.03, hw * 2 - 0.03, '#8c9a8f', { ao: 0 });
    p.box(-0.15, 0.5, hw - 0.015, 5.6, 0.1, 0.03, '#e6ebe8', { ao: 0 });
    // forecastle and the hatches
    p.box(2.35, 0.5, 0, 0.5, 0.14, hw * 2 - 0.05, hull);
    for (let i = 0; i < 4; i++) p.box(-1.45 + i * 1.0, 0.5, 0, 0.62, 0.08, 0.6, '#b8c2bd');
    // derricks: a pair of kingposts and a boom raised between the hatches
    for (let i = 0; i < 3; i++) {
      const dx = -0.95 + i * 1.0;
      for (const s of [-1, 1]) {
        p.cyl(dx, 0.5, s * 0.22, 0.05, 0.04, 0.6, '#f2f4f3', { seg: 6 });
        p.rod([dx, 1.05, s * 0.22], [dx + 0.65, 1.6, s * 0.22], 0.022, '#e9e6dd', 4);
        p.rod([dx + 0.65, 1.6, s * 0.22], [dx + 0.05, 0.62, s * 0.34], 0.006, '#4a4d52', 3);
      }
      p.box(dx, 1.0, 0, 0.1, 0.04, 0.5, '#f2f4f3', { ao: 0 });
    }
    // deckhouse aft: four tiers, a bridge wing, the funnel
    p.box(-2.55, 0.5, 0, 1.1, 0.25, hw * 2 - 0.08, hull);
    p.box(-2.5, 0.75, 0, 0.95, 0.22, 0.78, hull);
    p.box(-2.45, 0.97, 0, 0.8, 0.2, 0.74, hull);
    p.box(-2.4, 1.17, 0, 0.62, 0.17, 0.78, '#e9ecea');
    portholes(p, -3.05, -2.0, 0.58, 1, 0, 0.45, '#2c3a4a');
    portholes(p, -2.95, -2.05, 0.83, 1, 0, 0.395, '#2c3a4a');
    portholes(p, -2.82, -2.1, 1.05, 1, 0, 0.375, '#2c3a4a');
    p.box(-2.4, 1.23, 0.4, 0.5, 0.07, 0.02, '#2c3a4a', { ao: 0 });
    p.cyl(-2.95, 1.0, 0, 0.16, 0.13, 0.42, stripe, { seg: 10 });
    p.cyl(-2.95, 1.3, 0, 0.14, 0.14, 0.12, '#2d3138', { seg: 10, ao: 0 });
    p.rod([-2.4, 1.34, 0], [-2.4, 1.75, 0], 0.012, '#e9e6dd', 3);
    p.rod([2.2, 0.64, 0], [2.2, 1.2, 0], 0.014, '#e9e6dd', 3);
  });
  k.reserve(x, z, (L / 2) * Math.abs(Math.cos(o.ry ?? 0)) + 0.4, (L / 2) * Math.abs(Math.sin(o.ry ?? 0)) + 0.5);
}

/** A container ship: dark hull, a block of coloured boxes in bays, the deckhouse aft. Bow to +x, turned by `ry`. */
function containerShip(k: PortKit, x: number, z: number, L: number, o: { ry?: number; hull?: Col; seed?: number } = {}): void {
  const p = k.solid;
  const rng = new Rng((o.seed ?? 3) * 7919 + 13);
  const hull = o.hull ?? '#26334a';
  k.at(x, 0, z, o.ry ?? 0, L / 6, () => {
    const hw = 0.5;
    p.box(-0.1, -0.32, 0, 5.8, 0.36, hw * 2, '#a63a2e', { ao: 0.1 });
    p.box(-0.1, 0.04, 0, 5.8, 0.46, hw * 2, hull, { ao: 0.06 });
    bow(p, 2.8, hw, -0.32, 0.5, 3.5, hull);
    p.box(-0.1, 0.5, 0, 5.8, 0.03, hw * 2 - 0.03, '#59616b', { ao: 0 });
    for (let i = 0; i < 9; i++) {
      for (let j = -1; j <= 1; j++) {
        const t = rng.int(2, 4);
        const c = BOX_COLORS[rng.int(0, BOX_COLORS.length - 1)];
        for (let h = 0; h < t; h++) p.boxV(-1.55 + i * 0.5, 0.53 + h * 0.17, j * 0.31, 0.46, 0.16, 0.3, h % 2 ? tint(c, 0.08) : c, { ao: 0.1 });
      }
    }
    p.box(-2.6, 0.5, 0, 0.8, 0.55, 0.8, '#f1f2ee');
    p.box(-2.6, 1.05, 0, 0.86, 0.1, 0.86, '#d9dcd9');
    p.box(-2.58, 1.15, 0, 0.5, 0.18, 0.74, '#f1f2ee');
    portholes(p, -3.0, -2.2, 0.62, 3, 0.15, 0.401, '#2c3a4a');
    p.cyl(-2.95, 1.1, 0, 0.12, 0.1, 0.4, '#c8302a', { seg: 10 });
    p.cyl(-2.95, 1.45, 0, 0.11, 0.11, 0.1, '#2d3138', { seg: 10, ao: 0 });
  });
  k.reserve(x, z, (L / 2) * Math.abs(Math.cos(o.ry ?? 0)) + 0.4, (L / 2) * Math.abs(Math.sin(o.ry ?? 0)) + 0.5);
}

// ───────────────────────────── quay and yard ─────────────────────────────

/** Stacks of containers on the quay: nx × nz slots, up to `tiers` high, 6 triangles a box. */
function boxes(k: PortKit, x: number, z: number, nx: number, nz: number, tiers: number, rng: Rng, o: { y?: number; cols?: Col[] } = {}): void {
  const y = o.y ?? LAND_Y;
  const cols = o.cols ?? BOX_COLORS;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const t = Math.max(1, tiers - (rng.chance(0.35) ? 1 : 0));
      const c = cols[rng.int(0, cols.length - 1)];
      for (let h = 0; h < t; h++) k.solid.boxV(x + i * 0.23, y + h * 0.105, z - j * 0.125, 0.22, 0.1, 0.115, h % 2 ? tint(c, 0.07) : c, { ao: 0.2 });
    }
  }
  k.reserve(x + (nx * 0.23) / 2 - 0.1, z - (nz * 0.125) / 2 + 0.06, (nx * 0.23) / 2 + 0.06, (nz * 0.125) / 2 + 0.08);
}

/** A long shed: walls, a low ridged roof, loading doors on the front. */
function shed(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col, roof: Col, door: Col = '#3a4a58'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2);
  p.box(x, y - 0.12, z, w, h + 0.12, d, wall);
  p.prism(x, y + h, z, d + 0.04, 0.16, w + 0.04, roof, { ry: Math.PI / 2 });
  const n = Math.max(2, Math.floor(w / 0.5));
  for (let i = 0; i < n; i++) fq(p, x - w / 2 + (i + 0.5) * (w / n) - 0.1, x - w / 2 + (i + 0.5) * (w / n) + 0.1, y, y + h * 0.7, z + d / 2 + 0.004, door);
  k.reserve(x, z, w / 2 + 0.05, d / 2 + 0.05);
}

/** Ship-to-shore gantry cranes along the quay (boom over the water). */
function gantries(k: PortKit, xs: number[], z: number, s: number, color: Col): void {
  for (const x of xs) gantryCrane(k, x, z, { s, color });
}

// ───────────────────────────── buildings ─────────────────────────────

/** A dome on a drum, with an optional lantern: lathe of 5 rings. */
function dome(k: PortKit, x: number, y: number, z: number, r: number, h: number, col: Col, o: { lantern?: Col; seg?: number } = {}): void {
  const p = k.solid;
  p.lathe(x, y, z, [[r, 0], [r * 1.0, h * 0.14], [r * 0.9, h * 0.46], [r * 0.6, h * 0.78], [r * 0.28, h * 0.94], [0.002, h]], col, { seg: o.seg ?? 12 });
  if (o.lantern) {
    p.cyl(x, y + h * 0.97, z, r * 0.14, r * 0.14, h * 0.22, o.lantern, { seg: 6 });
    p.cone(x, y + h * 1.17, z, r * 0.16, h * 0.2, col, { seg: 6 });
  }
}

/** A colonial bell tower: a square shaft, an open belfry and a cap (dome, pyramid or flat). */
function belltower(k: PortKit, x: number, z: number, w: number, h: number, wall: Col, cap: Col, kind: 'dome' | 'pyramid' | 'flat' = 'dome', y = k.groundMax(x, z, w / 2, w / 2)): number {
  const p = k.solid;
  p.box(x, y - 0.15, z, w, h * 0.72 + 0.15, w, wall);
  p.box(x, y + h * 0.72, z, w + 0.04, 0.03, w + 0.04, tint(wall, -0.08));
  const by = y + h * 0.75;
  const bh = h * 0.2;
  p.box(x, by, z, w * 0.86, bh, w * 0.86, tint(wall, 0.03));
  fq(p, x - w * 0.2, x + w * 0.2, by + bh * 0.1, by + bh * 0.85, z + w * 0.43 + 0.004, '#2a2f38');
  rq(p, x + w * 0.43 + 0.004, by + bh * 0.1, by + bh * 0.85, z + w * 0.2, z - w * 0.2, '#2a2f38');
  p.box(x, by + bh, z, w * 0.94, 0.03, w * 0.94, tint(wall, -0.08));
  const ty = by + bh + 0.03;
  if (kind === 'dome') dome(k, x, ty, z, w * 0.42, h * 0.3, cap, { lantern: '#f0ece0' });
  else if (kind === 'pyramid') p.pyramid(x, ty, z, w * 0.92, h * 0.3, w * 0.92, cap);
  else p.box(x, ty, z, w * 0.96, 0.04, w * 0.96, cap);
  // clock face and a stripe of narrow windows on the shaft
  fq(p, x - w * 0.18, x + w * 0.18, y + h * 0.5, y + h * 0.5 + w * 0.36, z + w / 2 + 0.004, '#f6f3ea');
  fq(p, x - w * 0.025, x + w * 0.025, y + h * 0.5 + w * 0.18, y + h * 0.5 + w * 0.34, z + w / 2 + 0.006, '#2a2f38');
  k.reserve(x, z, w * 0.8, w * 0.8);
  return ty + h * 0.3;
}

/** A stilt house standing in shallow water or on a mudflat: posts to the seabed, a platform, a plank house. */
function stiltHouse(k: PortKit, x: number, z: number, w: number, d: number, deckY: number, wall: Col, roof: Col, rng: Rng): void {
  const p = k.solid;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.rod([x + (dx * w) / 2.3, -0.8, z + (dz * d) / 2.3], [x + (dx * w) / 2.3, deckY + 0.02, z + (dz * d) / 2.3], 0.022, '#6b5a48', 4);
  p.box(x, deckY, z, w + 0.06, 0.03, d + 0.06, '#8a7258');
  const h = 0.2;
  p.boxV(x, deckY + 0.03, z, w, h, d, wall);
  if (rng.chance(0.5)) p.prism(x, deckY + 0.03 + h, z, w + 0.06, 0.13, d + 0.05, roof);
  else p.prism(x, deckY + 0.03 + h, z, d + 0.06, 0.11, w + 0.05, roof, { ry: Math.PI / 2 });
  fq(p, x - w * 0.3, x - w * 0.3 + 0.06, deckY + 0.1, deckY + 0.2, z + d / 2 + 0.004, '#2c3a4a');
  fq(p, x + w * 0.1, x + w * 0.1 + 0.06, deckY + 0.05, deckY + 0.19, z + d / 2 + 0.004, '#5a4030');
  k.reserve(x, z, w / 2 + 0.06, d / 2 + 0.06);
}

/** A big Ferris wheel (Guayaquil's La Perla): a rim, spokes, gondolas and an A-frame down to the ground. */
function wheel(k: PortKit, x: number, z: number, R: number, y0 = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const hub = y0 + R + 0.3;
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    p.rod([x + Math.cos(a0) * R, hub + Math.sin(a0) * R, z], [x + Math.cos(a1) * R, hub + Math.sin(a1) * R, z], 0.03, '#f1f3f4', 4);
    if (i % 2 === 0) {
      p.rod([x, hub, z], [x + Math.cos(a0) * R, hub + Math.sin(a0) * R, z], 0.012, '#dfe3e6', 3);
      p.box(x + Math.cos(a0) * R - 0.06, hub + Math.sin(a0) * R - 0.12, z, 0.12, 0.1, 0.1, i % 4 === 0 ? '#2c8aa5' : '#d9a21a', { ao: 0 });
    }
  }
  p.rod([x - R * 0.5, y0, z - 0.05], [x, hub, z - 0.05], 0.04, '#f1f3f4', 5);
  p.rod([x + R * 0.5, y0, z - 0.05], [x, hub, z - 0.05], 0.04, '#f1f3f4', 5);
  p.rod([x - R * 0.5, y0, z + 0.05], [x, hub, z + 0.05], 0.04, '#e0e4e6', 5);
  p.rod([x + R * 0.5, y0, z + 0.05], [x, hub, z + 0.05], 0.04, '#e0e4e6', 5);
  p.ball(x, hub, z, 0.07, '#c8302a');
  k.reserve(x, z, R + 0.2, 0.4);
}

/** Stripes painted across the low ground (plantation rows, fields). */
function paintRows(k: PortKit, x0: number, x1: number, z0: number, z1: number, a: Col, b: Col, k0 = 0.7, spacing = 0.34): void {
  const ca = c3(a as string);
  const cb = c3(b as string);
  k.paint((x, y, z, slope, c) => {
    if (x < x0 || x > x1 || z > z0 || z < z1 || slope > 0.3) return;
    const f = smooth(0, 0.3, Math.min(x - x0, x1 - x, z0 - z, z - z1));
    c.lerp(Math.floor(x / spacing) % 2 === 0 ? ca : cb, k0 * f);
  });
}

// ───────────────────────────── Balboa ─────────────────────────────

/** The Panamanian flag as stiff panels (the giant flag on Ancon Hill), facing the camera. */
function bigFlag(k: PortKit, x: number, y: number, z: number, w: number): void {
  const p = k.solid;
  const h = (w * 2) / 3;
  p.cyl(x, y, z, 0.035, 0.028, h + 0.45, '#eceae3', { seg: 6, ao: 0.05 });
  p.ball(x, y + h + 0.47, z, 0.045, '#e8b923');
  k.at(x + 0.03, y + 0.3, z + 0.02, (19 * Math.PI) / 180, 1, () => {
    const xm = w / 2;
    const ym = h / 2;
    p.quad([0, ym, 0], [xm, ym, 0], [xm, h, 0], [0, h, 0], '#f4f4f4', true);
    p.quad([xm, ym, 0], [w, ym, 0], [w, h, 0], [xm, h, 0], '#d21034', true);
    p.quad([0, 0, 0], [xm, 0, 0], [xm, ym, 0], [0, ym, 0], '#005293', true);
    p.quad([xm, 0, 0], [w, 0, 0], [w, ym, 0], [xm, ym, 0], '#f4f4f4', true);
    starFlat(p, w / 4, h * 0.75, h * 0.17, 0.004, '#005293');
    starFlat(p, (w * 3) / 4, h * 0.25, h * 0.17, 0.004, '#d21034');
  });
}

/**
 * The Bridge of the Americas: a long steel roadway on piers across the canal mouth, with a through arch over the
 * channel. Posts under the deck carry it where the arch dips below, hangers above where it rises.
 */
function bridgeOfTheAmericas(k: PortKit, c: number, z: number, deck: number, rng: Rng, R = 4.3): void {
  const p = k.solid;
  const half = 0.4;
  const x0 = -k.width / 2 - 5;
  const x1 = k.width / 2 + 5;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const steel = '#7f93a3';
  const pale = '#d6dde1';
  const conc = '#bdb8ac';
  // roadway: a girder body, the asphalt, parapets along both edges, a dashed centre line
  p.box(cx, deck - 0.3, z, len, 0.3, half * 2, steel);
  p.box(cx, deck - 0.02, z, len, 0.025, half * 2 - 0.08, '#4d5358', { ao: 0 });
  p.box(cx, deck, z + half - 0.025, len, 0.11, 0.035, pale, { ao: 0 });
  p.box(cx, deck, z - half + 0.025, len, 0.11, 0.035, pale, { ao: 0 });
  for (let x = c - 13; x < c + 13; x += 0.55) p.quad([x, deck + 0.012, z - 0.015], [x + 0.28, deck + 0.012, z - 0.015], [x + 0.28, deck + 0.012, z + 0.015], [x, deck + 0.012, z + 0.015], '#f2f0e4');
  // piers on the shore spans
  for (let x = c - R - 1.7; x > x0; x -= 1.85) p.box(x, -0.9, z, 0.24, 0.9 + deck - 0.3, half * 1.4, conc);
  for (let x = c + R + 1.7; x < x1; x += 1.85) p.box(x, -0.9, z, 0.24, 0.9 + deck - 0.3, half * 1.4, conc);
  // the main piers take the springing of the arch
  for (const s of [-1, 1]) {
    p.box(c + s * R, -0.9, z, 0.62, 0.9 + deck - 0.3, half * 2 + 0.5, conc);
    p.box(c + s * R, deck - 0.3, z, 0.62, 0.3, half * 2 + 0.5, tint(conc, -0.1));
  }
  // the arch: two ribs, a parabola springing near the water and crossing the deck at about 10% of the span
  const y0 = 0.5;
  const apex = deck + 2.0;
  const N = 20;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([c - R + 2 * R * t, y0 + (apex - y0) * (1 - (2 * t - 1) * (2 * t - 1))]);
  }
  for (const side of [-1, 1]) {
    const zz = z + side * (half + 0.12);
    for (let i = 0; i < N; i++) p.rod([pts[i][0], pts[i][1], zz], [pts[i + 1][0], pts[i + 1][1], zz], 0.065, steel, 5);
    for (let i = 1; i < N; i++) {
      const [px, py] = pts[i];
      if (py > deck + 0.15) p.rod([px, py, zz], [px, deck - 0.05, zz], 0.018, pale, 3);
      else if (py < deck - 0.15) p.rod([px, py, zz], [px, deck - 0.3, zz], 0.04, steel, 4);
    }
  }
  // wind bracing across the crown
  for (let i = 5; i <= 15; i += 2) p.rod([pts[i][0], pts[i][1], z - half - 0.12], [pts[i][0], pts[i][1], z + half + 0.12], 0.025, steel, 4);
  for (let i = 5; i < 15; i += 2) p.rod([pts[i][0], pts[i][1], z - half - 0.12], [pts[i + 2][0], pts[i + 2][1], z + half + 0.12], 0.014, pale, 3);
  // lamp posts along the front parapet; their lamps glow at night
  for (let x = c - 11.5; x < c + 12; x += 1.1) {
    if (Math.abs(x - c) < R - 0.3) continue;
    p.cyl(x, deck, z + half - 0.025, 0.012, 0.012, 0.22, pale, { seg: 4, ao: 0 });
    k.glow.blob(x, deck + 0.24, z + half - 0.025, 0.035, '#fff2b0');
  }
  // traffic
  const carCols = ['#c8302a', '#e9e6dd', '#2c5da8', '#2d3138', '#e9a31a', '#3f8d6b'];
  for (let i = 0; i < 9; i++) {
    const x = c + rng.range(-9, 9);
    const lane = rng.chance(0.5) ? -0.14 : 0.14;
    const col = carCols[Math.floor(rng.next() * carCols.length)];
    p.box(x, deck, z + lane, 0.2, 0.07, 0.1, col);
    p.box(x - 0.01, deck + 0.07, z + lane, 0.11, 0.04, 0.09, '#2a3340');
  }
  k.reserve(c, z, 14, half + 0.7);
}

/** A glass tower for the Panama City skyline. */
function glassTower(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col): void {
  tower(k, x, z, w, d, h, wall, { glass: true, win: '#4f7088', cols: 3, rows: Math.round(h / 0.24), roof: 'flat' });
}

const canalSway = (z: number): number => Math.sin(z * 0.11) * 0.9 * smooth(-16, -30, z);
const canalHalf = (z: number): number => lerp(3.4, 2.2, smooth(-14, -45, z));

const balboa: Landmark = {
  terrain(k) {
    ground(k, { land: '#86b45a', land2: '#7aab52', hill: '#4d8a4e', rock: '#678a5e', sand: '#dccfaa', haze: '#d3e6ea' }, { relief: 0.9, range: 3.2, rise: 6, rough: 0.35, freq: 0.08 }, 'quay');
    const c = centre(k, -14, 0.8);
    // the canal mouth: a channel with gently sloping green banks, cut inland through the coast
    k.feature((x, z, h) => {
      const t = smooth(-11.6, -12.8, z);
      const hw = canalHalf(z);
      const m = smooth(hw, hw + 1.7, Math.abs(x - c - canalSway(z)));
      return lerp(Math.min(h, -0.65), h, Math.max(m, 1 - t, smooth(-27, -36, z)));
    });
    // Ancon Hill, rounded and wooded, beside the canal
    k.bump(c - 7.4, -17.5, 4.8, 3.8, 2.5, 1.1);
    k.bump(c + 9, -18, 4, 3, 0.9);
    const forest = c3('#3d7a47');
    const bank = c3('#7aab52');
    k.paint((x, y, z, slope, col) => {
      if (y > 0.9 && z < -14.5) col.lerp(forest, 0.5 * smooth(0.9, 2.2, y));
      if (z < -12.2 && Math.abs(x - c - canalSway(z)) - canalHalf(z) < 2.6 && y > 0.05) col.lerp(bank, 0.75);
    });
  },
  build(k) {
    const c = centre(k, -14, 0.8);
    const rng = new Rng(k.seed ^ 0xba1b);
    bridgeOfTheAmericas(k, c, -14.4, 1.55, rng);
    // Ancon Hill and the giant flag on its crown
    const hx = c - 7.2;
    const hy = k.ground(hx, -17.5);
    bigFlag(k, hx, hy - 0.05, -17.5, 1.6);
    k.reserve(hx, -17.5, 4.2, 3.2);
    // Panama City across the bay: glass towers to the right
    const sk: Array<[number, number, number, number, Col]> = [
      [5.4, -17.4, 2.5, 0.42, '#dfe8ee'],
      [5.95, -18.2, 3.2, 0.46, '#9fb8c8'],
      [6.5, -17.5, 2.7, 0.42, '#e6e9ec'],
      [7.1, -18.5, 3.4, 0.48, '#7f9db3'],
      [7.75, -17.7, 2.5, 0.42, '#dfe8ee'],
      [8.4, -18.4, 3.0, 0.44, '#b3c8d6'],
      [9.1, -17.6, 2.3, 0.42, '#e6e9ec'],
    ];
    for (const [dx, zz, h, w, wall] of sk) glassTower(k, c + dx, zz, w, 0.5, h, wall);
    // container berths on the west bank
    gantries(k, [c - 6.3, c - 7.9], -12.6, 0.95, '#2c5da8');
    boxes(k, c - 8.3, -13.25, 7, 3, 3, rng);
    // a ship on its way up the canal, seen through the arch
    containerShip(k, c + canalSway(-23), -23, 5.4, { ry: Math.PI / 2, hull: '#26334a', seed: 4 });
    town(k, { ...colonial, floors: [1, 2], roofs: ['#b8553d', '#a64b36'], walls: ['#f6f3ea', '#f4e6c8', '#e9e2cf', '#f2d98a'] }, 2, SHORE_Z - 0.9, { rowStep: 0.55, gaps: 0.12, maxSlope: 0.6 });
    const r2 = new Rng(k.seed ^ 0x77a1);
    sowWide(k, r2, c, { n: 22, z0: -16.5, z1: -12.4, kinds: ['palm', 'palm', 'bush'], grove: 3 });
    sowWide(k, r2, c, { n: 36, z0: -22, z1: -14.9, kinds: ['jungle', 'palm', 'jungle'], grove: 5, minY: 0.5, size: [0.9, 1.4] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Callao ─────────────────────────────

/** The outline of a bastioned fort: n arrowheads (tip radius R1, shoulders at R0, half-angle delta) as [dx, dz] pairs. */
function bastionPoly(R0: number, R1: number, delta: number, rot: number, n = 5): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([Math.cos(a - delta) * R0, Math.sin(a - delta) * R0], [Math.cos(a) * R1, Math.sin(a) * R1], [Math.cos(a + delta) * R0, Math.sin(a + delta) * R0]);
  }
  return pts;
}

/** Real Felipe: a five-bastion star of ochre masonry on a plinth, a parade ground, barracks, sentry boxes. */
function realFelipe(k: PortKit, cx: number, cz: number, y0: number): void {
  const p = k.solid;
  const rot = Math.PI / 2;
  // extrude() stands the polygon on its side: (px, py) → world (cx + px, cz - py), so [dx, dz] is passed as (dx, -dz)
  const ext = (R0: number, R1: number, d: number, y: number, col: Col, delta = 0.2) =>
    p.extrude(bastionPoly(R0, R1, delta, rot).map(([a, b]) => [a, -b] as [number, number]), d, cx, y + d / 2, cz, col, { rx: -Math.PI / 2, ao: 0.1 });
  ext(2.5, 3.3, 0.6, y0 - 0.45, '#a99a7a');
  ext(2.36, 3.15, 1.15, y0, '#d8c79c');
  ext(2.16, 2.9, 0.035, y0 + 1.15, '#b9a881', 0.2);
  ext(1.98, 2.7, 0.03, y0 + 1.184, '#d3c9a8', 0.2);
  const top = y0 + 1.21;
  // sentry boxes on the bastion tips
  for (const [dx, dz] of bastionPoly(2.36, 3.15, 0.2, rot).filter((_, i) => i % 3 === 1)) {
    p.cyl(cx + dx * 0.96, y0 + 1.15, cz + dz * 0.96, 0.08, 0.08, 0.2, '#e8dcc0', { seg: 6 });
    p.cone(cx + dx * 0.96, y0 + 1.35, cz + dz * 0.96, 0.11, 0.12, '#a64b36', { seg: 6 });
  }
  // the gate and embrasures on the two faces of the forward bastion
  const tipZ = cz + 3.15;
  fq(p, cx - 0.2, cx + 0.2, y0 + 0.0, y0 + 0.6, tipZ - 0.52 + 0.01, '#3a2e24');
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.box(cx + s * (0.42 + i * 0.22), y0 + 0.85, tipZ - 0.45 - i * 0.2, 0.1, 0.13, 0.04, '#4a3e30', { ao: 0, ry: -s * 0.55 });
  // inside: governor's house, barracks with tiled roofs and a small tower
  p.box(cx - 0.1, top, cz - 0.5, 1.7, 0.36, 0.62, '#f0e8d2');
  p.prism(cx - 0.1, top + 0.36, cz - 0.5, 0.7, 0.24, 1.76, '#b8553d', { ry: Math.PI / 2 });
  p.box(cx + 1.0, top, cz + 0.35, 0.44, 0.66, 0.44, '#efe3c4');
  p.box(cx + 1.0, top + 0.66, cz + 0.35, 0.52, 0.04, 0.52, '#8a7a5c');
  p.box(cx - 1.2, top, cz + 0.4, 0.5, 0.28, 0.42, '#f0e8d2');
  p.pyramid(cx - 1.2, top + 0.28, cz + 0.4, 0.56, 0.17, 0.48, '#a64b36');
  k.reserve(cx, cz, 3.5, 3.4);
}

const callaoStyle: HouseStyle = {
  ...colonial,
  walls: ['#e8d4a0', '#d9b99a', '#dfe3d0', '#e8c4bc', '#f0e6cc', '#c9d6dc', '#e9c08a'],
  roofs: ['#b8553d', '#a0806a', '#c4673f'],
  floors: [2, 4],
  floorH: 0.18,
  roofKinds: [['flat', 5], ['hip', 2], ['gable', 1]],
  pitch: 0.35,
  gap: [0, 0.03],
};

const callao: Landmark = {
  terrain(k) {
    ground(k, { land: '#c2b08a', land2: '#b9a67f', hill: '#a89678', rock: '#8c8174', sand: '#dccfa8', haze: '#e6e1d4' }, { relief: 2.0, range: 4.2, rise: 4, rough: 0.55, freq: 0.1 }, 'quay');
    const c = centre(k, -14, 1.0);
    // a bay on the left, with San Lorenzo, a long barren island, in it
    k.feature((x, z, h) => {
      const bay = smooth(c - 3.2, c - 5.4, x) * smooth(-12.2, -13.4, z) * smooth(-27, -22, z);
      return lerp(h, Math.min(h, -0.55), bay);
    });
    k.bump(c - 7.4, -17.2, 4.4, 1.6, 2.8, 0.9);
    k.bump(c - 5.6, -16.6, 1.8, 1.0, 1.0, 0.9);
    k.plateau(c + 0.6, -15.7, 4.1, 4.1, 0.6, 0.45);
    const grey = c3('#9a8f82');
    const isle = c3('#85796c');
    k.paint((x, y, z, slope, col) => {
      if (y > 0.9) col.lerp(grey, 0.35 * smooth(0.9, 2.4, y));
      if (x < c - 4.2 && z < -14.5 && z > -21 && y > 0.0) col.lerp(isle, 0.7 * smooth(-0.1, 0.5, y));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0xca11);
    realFelipe(k, c + 0.6, -15.7, k.ground(c + 0.6, -15.7));
    // the container terminal to the right: cranes, a ship alongside, boxes behind
    gantries(k, [c + 4.8, c + 6.3, c + 7.8], -12.55, 0.95, '#c8302a');
    containerShip(k, c + 6.4, -11.2, 5.0, { hull: '#1f4a66', seed: 7 });
    boxes(k, c + 4.5, -13.3, 8, 3, 3, rng);
    town(k, callaoStyle, 4, SHORE_Z - 1.2, { rowStep: 0.62, gaps: 0.08, rowRise: 0.25, maxSlope: 0.7 });
    const r2 = new Rng(k.seed ^ 0x51);
    sowWide(k, r2, c, { n: 46, z0: -22, z1: -12.6, kinds: ['scrub'], grove: 3, size: [0.9, 1.3], minY: 0.45 });
    sowWide(k, r2, c, { n: 10, z0: -15.6, z1: -12.6, kinds: ['palm'], grove: 2, size: [0.9, 1.3], minY: 0.4, maxY: 0.9 });
    // a few fishing boats in the bay under the fort
    for (let i = 0; i < 5; i++) {
      const bx = c - 5.2 - rng.range(0, 4.5);
      const bz = rng.range(-12.6, -10.4);
      if (k.ground(bx, bz) > -0.15) continue;
      boat(k, bx, bz, 'fishing', rng, rng.range(-0.2, 0.2), ['#e9a31a', '#c8302a', '#2c8aa5', '#f6f3ea'][i % 4]);
    }
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Paita ─────────────────────────────

const paitaStyle: HouseStyle = {
  ...colonial,
  walls: ['#f2e3b8', '#e9c9a0', '#cfe0d6', '#e8b8b0', '#f0ead6', '#b9d2dc', '#ecd27a'],
  roofs: ['#b8553d', '#c4673f', '#a0806a'],
  floors: [1, 2],
  roofKinds: [['flat', 4], ['hip', 2], ['mono', 2]],
  pitch: 0.38,
  gap: [0.0, 0.06],
};

const paita: Landmark = {
  terrain(k) {
    ground(k, { land: '#cfba8a', land2: '#c6b080', hill: '#b99c6c', rock: '#a38462', sand: '#e2d2a8', haze: '#eadfca' }, { relief: 0.5, range: 2.6, rise: 4, rough: 0.5, freq: 0.1 }, 'beach');
    const c = centre(k, -14, 1.2);
    // the tablazo: a flat-topped desert escarpment standing behind the town, its face cut by gullies
    k.feature((x, z, h) => {
      const edge = -16.0 - 1.4 * noise2(x * 0.22, 7, 3) - 0.5 * Math.sin(x * 0.9);
      const cut = 0.8 + 0.4 * noise2(x * 0.4, 11, 5);
      return h + 2.9 * cut * smooth(edge, edge - 1.5, z);
    });
    k.plateau(c, -13.4, 7, 1.4, LAND_Y + 0.02, 0.5);
    const strata = [c3('#cdac78'), c3('#b48b5e')];
    k.paint((x, y, z, slope, col) => {
      if (y > 0.6) col.lerp(strata[Math.floor(y * 2.4) % 2], 0.55 * smooth(0.06, 0.3, slope));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.2);
    const rng = new Rng(k.seed ^ 0xa17a);
    // the fishing pier with its market shed at the root
    pier(k, c + 3.5, -12.0, -10.0, 0.55, 0.32);
    shed(k, c + 3.5, -12.55, 1.1, 0.7, 0.38, '#f2e3b8', '#b8553d');
    // the colonial church of the town, twin-towered in spirit: one flat-topped tower
    church(k, c - 0.8, -14.3, { wall: '#f4efe0', roof: '#b8553d', spire: '#f4efe0', style: 'flat', h: 1.25 });
    town(k, paitaStyle, 3, SHORE_Z - 1.2, { rowStep: 0.55, gaps: 0.07, maxSlope: 0.7 });
    // the fishing fleet at its moorings
    const cols = ['#e9a31a', '#c8302a', '#2c8aa5', '#f6f3ea', '#3f8d6b', '#e86a2c', '#d9c04a'];
    for (let i = 0, n = 0; i < 80 && n < 15; i++) {
      const bx = c + rng.range(-9, 9);
      const bz = rng.range(-11.5, -9.7);
      if (k.ground(bx, bz) > -0.12 || k.isReserved(bx, bz, 0.45)) continue;
      boat(k, bx, bz, rng.chance(0.18) ? 'sail' : 'fishing', rng, rng.range(-0.25, 0.25) + (rng.chance(0.5) ? 0 : Math.PI), cols[rng.int(0, cols.length - 1)]);
      k.reserve(bx, bz, 0.5, 0.3);
      n++;
    }
    const r2 = new Rng(k.seed ^ 0x51);
    sowWide(k, r2, c, { n: 30, z0: -19, z1: -12.6, kinds: ['scrub'], grove: 3, minY: 0.45, maxY: 1.2 });
    sowWide(k, r2, c, { n: 12, z0: -15.4, z1: -12.6, kinds: ['palm'], grove: 3, minY: 0.4, maxY: 0.8 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── fields ─────────────────────────────

/** A cheap banana plant for the back rows of a plantation: four leaves (8 triangles). */
function bananaLite(k: PortKit, x: number, z: number, s: number, rng: Rng, y: number): void {
  const a0 = rng.next() * 6.28;
  const col = LEAF[Math.floor(rng.next() * 4)];
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * 1.5708;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const L = 0.2 * s;
    p3(k.solid, [x, y + 0.11 * s, z], [x + dx * L, y + 0.16 * s, z + dz * L], [x + dx * L * 0.5 - dz * 0.055 * s, y + 0.2 * s, z + dz * L * 0.5 + dx * 0.055 * s], i % 2 ? tint(col, -0.06) : col);
  }
}

const p3 = (p: Part, a: V3, b: V3, c: V3, col: Col): void => p.tri(a, b, c, col, true);

interface Field {
  x0: number;
  x1: number;
  zFront: number;
  rows: number;
  dx: number;
  dz: number;
  /** the rows open out with distance: row r sits at dz · (r + grow · r(r-1)/2) behind the front */
  grow?: number;
  /** the front rows built as full plants, the rest cheap */
  full: number;
}

/** A banana plantation in rows: full plants in the front, flat star-shaped clumps behind. */
function plantation(k: PortKit, rng: Rng, f: Field): void {
  for (let r = 0; r < f.rows; r++) {
    const z = f.zFront - f.dz * (r + ((f.grow ?? 0) * r * (r - 1)) / 2);
    for (let x = f.x0 + (r % 2) * f.dx * 0.5; x < f.x1; x += f.dx) {
      const xx = x + rng.range(-0.03, 0.03);
      const zz = z + rng.range(-0.03, 0.03);
      const y = k.ground(xx, zz);
      if (y < 0.3 || k.isReserved(xx, zz, 0.05)) continue;
      const s = rng.range(1.35, 1.65);
      if (r < f.full) banana(k, xx, zz, s, rng, y - 0.02);
      else bananaLite(k, xx, zz, s, rng, y - 0.02);
    }
  }
}

/** A pineapple field: low rosettes of spiky grey-green leaves in rows. */
function pineapples(k: PortKit, rng: Rng, x0: number, x1: number, zFront: number, rows: number, dx: number, dz: number): void {
  const cols = ['#6f9a6a', '#5f8a5f', '#7aa874', '#69946a'];
  for (let r = 0; r < rows; r++) {
    for (let x = x0 + (r % 2) * dx * 0.5; x < x1; x += dx) {
      const xx = x + rng.range(-0.02, 0.02);
      const zz = zFront - r * dz + rng.range(-0.02, 0.02);
      const y = k.ground(xx, zz);
      if (y < 0.3 || k.isReserved(xx, zz, 0.04)) continue;
      const a0 = rng.next() * 6.28;
      for (let i = 0; i < 5; i++) {
        const a = a0 + i * 1.2566;
        const dxx = Math.cos(a);
        const dzz = Math.sin(a);
        p3(k.solid, [xx, y - 0.01, zz], [xx + dxx * 0.13, y + 0.06, zz + dzz * 0.13], [xx - dzz * 0.03 + dxx * 0.04, y + 0.075, zz + dxx * 0.03 + dzz * 0.04], cols[i % 4]);
      }
      k.solid.blob(xx, y + 0.03, zz, 0.025, '#d9a21a', { sy: 1.2 });
    }
  }
}

// ───────────────────────────── Puerto Bolivar ─────────────────────────────

const bolivarStyle: HouseStyle = {
  ...caribbean,
  walls: ['#f1ece0', '#e8c53a', '#7fb7d6', '#f08fa8', '#9fd0a8', '#e68a3a', '#d6e0e6'],
  roofs: ['#8a8f94', '#a64b36', '#6c747a', '#c4673f'],
  floors: [1, 2],
  roofKinds: [['mono', 3], ['gable', 3], ['flat', 2]],
  pitch: 0.4,
};

const bolivar: Landmark = {
  terrain(k) {
    ground(k, { land: '#7db84e', land2: '#8bc257', hill: '#5f9c4f', rock: '#9a8f7f', sand: '#d9cfa4', haze: '#d6e8e2' }, { relief: 0.3, range: 3.6, rise: 8, rough: 0.35, freq: 0.07 }, 'quay');
    const c = centre(k, -14, 0.8);
    k.plateau(c, -13.3, 13, 1.7, LAND_Y + 0.02, 0.5);
    paintRows(k, c - 11, c + 11, -14.8, -22, '#72ae48', '#88c254', 0.6, 1.3);
  },
  build(k) {
    const c = centre(k, -14, 0.8);
    const rng = new Rng(k.seed ^ 0xb011);
    const p = k.solid;
    // the wharf, two white reefers alongside, and the sheds behind them
    quayDeck(k, c - 9.6, c + 9.6, -12.55, -11.75, 0.4, '#a9a69c');
    reefer(k, c - 3.4, -11.12, 6.0, { stripe: '#2f7a9e' });
    reefer(k, c + 4.3, -11.12, 5.4, { stripe: '#3f8d6b', ry: Math.PI });
    shed(k, c - 5.4, -13.35, 2.5, 0.8, 0.5, '#f1f3f2', '#2f7a9e');
    shed(k, c - 2.2, -13.35, 2.5, 0.8, 0.5, '#f1f3f2', '#2f7a9e');
    shed(k, c + 3.2, -13.35, 2.5, 0.8, 0.5, '#f1f3f2', '#3f8d6b');
    shed(k, c + 6.2, -13.35, 2.3, 0.8, 0.5, '#f1f3f2', '#3f8d6b');
    // reefer boxes and pallets of fruit on the wharf
    boxes(k, c - 0.4, -12.95, 5, 2, 2, rng, { cols: ['#f1f3f2', '#e6ecef', '#d8e4ea', '#f1f3f2', '#2c8aa5'] });
    for (let i = 0; i < 10; i++) p.box(c - 7.6 + i * 0.28 + (i > 4 ? 6.4 : 0), LAND_Y, -12.3, 0.2, 0.13, 0.17, i % 3 === 0 ? '#e0d060' : '#a9c860', { ao: 0.2 });
    // the banana plantation behind: rows to the foothills
    plantation(k, rng, { x0: c - 10.5, x1: c + 10.5, zFront: -14.9, rows: 12, dx: 0.55, dz: 0.5, grow: 0.07, full: 3 });
    k.reserve(c, -19.0, 9.5, 4.5);
    town(k, bolivarStyle, 3, SHORE_Z - 1.0, { rowStep: 0.55, gaps: 0.1, maxSlope: 0.5 });
    const r2 = new Rng(k.seed ^ 0x2b);
    sowWide(k, r2, c, { n: 40, z0: -23, z1: -14.2, kinds: ['palm', 'palm', 'jungle'], grove: 3, size: [0.9, 1.3] });
    // fishing boats in the lee of the mole
    for (let i = 0; i < 3; i++) boat(k, c + rng.range(-8, 8), rng.range(-10.0, -9.7), 'fishing', rng, rng.range(-0.1, 0.1), ['#e9a31a', '#c8302a', '#2c8aa5'][i]);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Puerto Limon ─────────────────────────────

const limonStyle: HouseStyle = {
  ...caribbean,
  walls: ['#e8c53a', '#d9573a', '#3f9bd0', '#4fb89a', '#f08fa8', '#f1ece0', '#e68a3a', '#8a6fc0', '#7cc65a'],
  floors: [1, 3],
  floorH: 0.19,
  w: [0.3, 0.44],
  gap: [0.02, 0.1],
};

const limon: Landmark = {
  terrain(k) {
    ground(k, { land: '#6eb05a', land2: '#62a352', hill: '#2f6e3f', rock: '#6f7a6a', sand: '#e8dcb0', haze: '#cfe6e2' }, { relief: 2.3, range: 5.5, rise: 3.2, rough: 0.6, freq: 0.11 }, 'quay');
    const c = centre(k, -14, 1.0);
    k.plateau(c + 3.3, -13.3, 5.8, 1.5, LAND_Y + 0.02, 0.5);
    k.plateau(c + 3.6, -16.6, 6.0, 2.8, LAND_Y + 0.1, 0.35);
    const dark = c3('#2a6038');
    k.paint((x, y, z, slope, col) => {
      if (y > 0.9 && z < -14.5) col.lerp(dark, 0.55 * smooth(0.9, 2.4, y));
    });
    paintRows(k, c - 2.4, c + 9.6, -14.4, -19.6, '#a8744c', '#8a8a4a', 0.65, 1.3);
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0x1130);
    const p = k.solid;
    // the fruit terminal: reefers alongside, gantries over them, white boxes behind
    quayDeck(k, c - 1.6, c + 8.8, -12.55, -11.75, 0.4, '#a9a69c');
    reefer(k, c + 1.9, -11.12, 6.0, { stripe: '#d9a21a' });
    reefer(k, c + 7.6, -11.12, 5.0, { stripe: '#3f8d6b', ry: Math.PI });
    gantries(k, [c + 0.9, c + 2.7, c + 6.7], -12.6, 0.9, '#2f7a9e');
    boxes(k, c - 1.2, -13.3, 9, 3, 3, rng, { cols: ['#f1f3f2', '#e6ecef', '#d8e4ea', '#f1f3f2', '#2c8aa5', '#e9a31a'] });
    shed(k, c + 6.4, -14.3, 2.6, 0.8, 0.5, '#e8e4da', '#2f7a9e');
    // pineapple fields and bananas on the flat behind the quay
    pineapples(k, rng, c - 1.6, c + 8.0, -15.5, 5, 0.4, 0.5);
    k.reserve(c + 3.3, -16.9, 5.2, 2.0);
    for (let i = 0; i < 8; i++) p.box(c + 8.4 + (i % 4) * 0.28, LAND_Y, -12.3 - Math.floor(i / 4) * 0.2, 0.2, 0.13, 0.17, i % 3 === 0 ? '#e0d060' : '#a9c860', { ao: 0.2 });
    // the town: bright clapboard houses climbing the hill on the left
    town(k, limonStyle, 5, SHORE_Z - 1.1, { rowStep: 0.5, gaps: 0.08, rowRise: 0.15, maxSlope: 0.7, x1: c + 0.5 });
    const r2 = new Rng(k.seed ^ 0x4c);
    sowWide(k, r2, c, { n: 18, z0: -14.8, z1: -12.4, kinds: ['palm', 'palm', 'bush'], grove: 3, size: [0.95, 1.4] });
    sowWide(k, r2, c, { n: 56, z0: -24, z1: -15.2, kinds: ['jungle', 'jungle', 'tall', 'palm'], grove: 6, minY: 0.5, size: [0.9, 1.5], mask: (x, z) => (z < -17.8 || x < c - 1.2 ? 1 : 0.25) });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Turbo ─────────────────────────────

const turbo: Landmark = {
  terrain(k) {
    ground(k, { land: '#7cb455', land2: '#6fa84c', hill: '#4b8c4b', rock: '#8a8a7a', sand: '#c9bd94', haze: '#d2e6dc' }, { relief: 0.5, range: 4.6, rise: 6, rough: 0.45, freq: 0.08 }, 'beach');
    const c = centre(k, -14, 0.8);
    k.plateau(c, -13.2, 12, 1.2, LAND_Y + 0.0, 0.5);
    paintRows(k, c - 11, c + 11, -15.4, -22, '#72ae48', '#88c254', 0.6, 1.3);
  },
  build(k) {
    const c = centre(k, -14, 0.8);
    const rng = new Rng(k.seed ^ 0x7b0);
    const p = k.solid;
    // a village of stilt houses standing in the shallows, joined by boardwalks
    const walls: Col[] = ['#e8c53a', '#d9573a', '#3f9bd0', '#4fb89a', '#f1ece0', '#e68a3a', '#c9a66b', '#8fb8d0'];
    const roofs: Col[] = ['#8a8f94', '#a64b36', '#6c747a', '#b0603f', '#c9b58a'];
    for (let row = 0; row < 2; row++) {
      const z = -11.5 + row * 0.95;
      let x = c - 8.8 + rng.range(0, 0.4);
      while (x < c + 8) {
        const w = rng.range(0.36, 0.5);
        const d = rng.range(0.32, 0.42);
        if (rng.chance(0.82) && !k.isReserved(x + w / 2, z, 0.1)) stiltHouse(k, x + w / 2, z + rng.range(-0.06, 0.06), w, d, 0.3, walls[rng.int(0, 7)], roofs[rng.int(0, 4)], rng);
        x += w + rng.range(0.12, 0.45);
      }
      p.box(c - 0.4, 0.27, z + 0.32, 17.6, 0.03, 0.1, '#8a7258', { ao: 0 });
    }
    // jetties out into the gulf with long-boats alongside
    for (const jx of [c - 5.3, c + 2.2]) pier(k, jx, -11.9, -9.8, 0.4, 0.3);
    boat(k, c - 4.6, -9.9, 'fishing', rng, 0.05, '#2c8aa5');
    boat(k, c + 3.0, -10.1, 'fishing', rng, Math.PI - 0.06, '#e9a31a');
    boat(k, c + 0.4, -9.6, 'fishing', rng, 0.1, '#c8302a');
    // the banana jetty on the right, a reefer alongside
    quayDeck(k, c + 5.2, c + 9.5, -12.4, -10.9, 0.4, '#a9a69c');
    reefer(k, c + 7.5, -10.15, 5.4, { stripe: '#c8302a' });
    // plantation on the plain behind the village
    plantation(k, rng, { x0: c - 10.5, x1: c + 10.5, zFront: -15.2, rows: 12, dx: 0.55, dz: 0.5, grow: 0.07, full: 3 });
    k.reserve(c, -19.2, 9.5, 4.5);
    town(k, { ...caribbean, floors: [1, 2] }, 2, SHORE_Z - 0.9, { rowStep: 0.5, gaps: 0.18, maxSlope: 0.5 });
    const r2 = new Rng(k.seed ^ 0x2b);
    sowWide(k, r2, c, { n: 44, z0: -24, z1: -12.4, kinds: ['palm', 'palm', 'jungle'], grove: 3, size: [0.9, 1.4] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Guayaquil ─────────────────────────────

const penasStyle: HouseStyle = {
  ...colonial,
  walls: ['#f2d98a', '#eba9a0', '#7fcfc0', '#8fb8e8', '#f4e6c8', '#f2a860', '#d9a9cb', '#cddb9a', '#e9605a'],
  roofs: ['#c4673f', '#a64b36', '#8a8f94', '#b8553d', '#4f7a8a'],
  floors: [1, 3],
  floorH: 0.17,
  w: [0.24, 0.38],
  d: [0.26, 0.34],
  roofKinds: [['flat', 3], ['mono', 3], ['hip', 2], ['gable', 2]],
  pitch: 0.35,
  gap: [0, 0.02],
};

const guayaquil: Landmark = {
  terrain(k) {
    ground(k, { land: '#8cb85c', land2: '#7fae54', hill: '#6a9a50', rock: '#9a9488', sand: '#d9ccaa', haze: '#d5e6e0' }, { relief: 0.6, range: 3.4, rise: 6, rough: 0.4, freq: 0.08 }, 'quay');
    const c = centre(k, -14, 1.4);
    k.bump(c - 2.4, -15.9, 3.9, 3.0, 2.5, 1.0);
    k.plateau(c + 3.5, -13.6, 5.5, 1.3, LAND_Y + 0.02, 0.5);
  },
  build(k) {
    const c = centre(k, -14, 1.4);
    const rng = new Rng(k.seed ^ 0x9a1a);
    const p = k.solid;
    // Cerro Santa Ana: the lighthouse and chapel on the crown
    const hx = c - 2.4;
    const hz = -15.9;
    const hy = k.ground(hx, hz);
    k.plateau(hx, hz, 0.7, 0.6, hy, 0.5);
    lighthouse(k, hx, hy - 0.04, hz, { h: 0.95, r0: 0.13, r1: 0.09, bands: [['#f6f3ea', 0.7], ['#c8302a', 0.3]], cap: '#c8302a', gallery: '#2d3138', seg: 10 });
    p.box(hx + 0.45, hy - 0.05, hz + 0.05, 0.36, 0.2, 0.3, '#f6f3ea');
    p.prism(hx + 0.45, hy + 0.15, hz + 0.05, 0.4, 0.12, 0.34, '#c4673f');
    k.reserve(hx, hz, 0.8, 0.6);
    // Las Penas: the hillside packed with bright houses, row on row
    town(k, penasStyle, 9, -13.3, { rowStep: 0.46, gaps: 0.0, rowRise: 0.0, maxSlope: 1.3, x0: c - 7.2, x1: c + 2.6, minY: 0.3, shift: -2 });
    // the Malecon: a wheel, the Moorish clock tower, palms along the promenade
    wheel(k, c + 4.9, -13.5, 1.15);
    belltower(k, c + 2.9, -13.5, 0.4, 1.5, '#efe9d8', '#4f7a9a', 'pyramid', LAND_Y);
    k.reserve(c + 3.8, -13.5, 3.2, 0.6);
    // river craft
    boat(k, c - 6.3, -10.6, 'fishing', rng, 0.05, '#e9a31a');
    boat(k, c + 1.4, -10.2, 'sail', rng, 0.1, '#2c5da8');
    boat(k, c + 5.8, -10.7, 'fishing', rng, Math.PI + 0.05, '#c8302a');
    town(k, penasStyle, 3, -13.4, { rowStep: 0.5, gaps: 0.08, x0: c + 5.8, x1: k.width / 2 + 2, maxSlope: 0.6, minY: 0.3 });
    const r2 = new Rng(k.seed ^ 0x33);
    sowWide(k, r2, c, { n: 30, z0: -22, z1: -12.6, kinds: ['palm', 'palm', 'jungle', 'bush'], grove: 3, minY: 0.35 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Colon ─────────────────────────────

const colonStyle: HouseStyle = {
  ...caribbean,
  walls: ['#e8c53a', '#d9573a', '#3f9bd0', '#4fb89a', '#f08fa8', '#f1ece0', '#e68a3a', '#8fb8d0'],
  floors: [2, 3],
  floorH: 0.19,
  w: [0.34, 0.5],
  roofKinds: [['gable', 3], ['mono', 3], ['flat', 2]],
  gap: [0.02, 0.08],
};

/**
 * The Agua Clara locks: concrete lock walls with tiered water-saving basins at their sides, and the huge rolling
 * gates (flat steel leaves across the chamber), two of them one behind the other.
 */
function agua(k: PortKit, lx: number, hw: number): void {
  const p = k.solid;
  const wallH = 1.05;
  const conc = '#cfcbc0';
  const steel = '#9fb0bd';
  const ribs = '#5f7a8f';
  const z0 = -12.7;
  const z1 = -19.4;
  const zc = (z0 + z1) / 2;
  const L = z0 - z1;
  for (const s of [-1, 1]) {
    const wx = lx + s * (hw + 0.5);
    p.box(wx, -0.9, zc, 1.0, 0.9 + wallH, L, conc);
    p.box(wx, wallH, zc, 1.08, 0.04, L + 0.06, '#e8e4da', { ao: 0 });
    // bollards and lamps along the coping
    for (let z = z0 - 0.4; z > z1; z -= 0.9) {
      p.cyl(wx - s * 0.3, wallH + 0.04, z, 0.04, 0.035, 0.07, '#2d3138', { seg: 6 });
      if (Math.round((z0 - z) / 0.9) % 3 === 0) p.cyl(wx + s * 0.3, wallH + 0.04, z, 0.012, 0.012, 0.3, '#d9d4c7', { seg: 4 });
    }
    // three tiers of water-saving basins beside each wall, stepping up away from the sea
    for (let i = 0; i < 3; i++) {
      const bz = z0 - 1.1 - i * 2.05;
      const bh = 0.62 + i * 0.16;
      const bx = lx + s * (hw + 1.0 + 1.35);
      p.box(bx, -0.9, bz, 2.5, 0.9 + bh, 1.95, conc);
      p.box(bx, bh, bz, 2.1, 0.02, 1.6, '#3f9fc0', { ao: 0 });
    }
  }
  // the gates: tall steel leaves across the chamber with horizontal ribs and a walkway on top
  for (const gz of [-14.2, -18.0]) {
    p.box(lx, -0.6, gz, hw * 2 + 0.06, 0.6 + 1.68, 0.5, steel);
    for (const y of [0.35, 0.8, 1.25]) p.box(lx, y, gz + 0.27, hw * 2 + 0.02, 0.07, 0.05, ribs, { ao: 0 });
    p.box(lx, 1.68, gz, hw * 2 + 0.06, 0.05, 0.56, '#e8e4da', { ao: 0 });
    p.box(lx, 1.73, gz + 0.26, hw * 2 + 0.06, 0.1, 0.03, '#d9a21a', { ao: 0 });
    // the housings where the gate slides back into the wall
    p.box(lx - hw - 0.1, wallH, gz, 0.9, 0.8, 0.8, '#e0dcd0');
    p.box(lx + hw + 0.1, wallH, gz, 0.9, 0.8, 0.8, '#e0dcd0');
    fq(p, lx - hw - 0.35, lx - hw + 0.15, wallH + 0.35, wallH + 0.62, gz + 0.403, '#3a5a72');
    fq(p, lx + hw - 0.15, lx + hw + 0.35, wallH + 0.35, wallH + 0.62, gz + 0.403, '#3a5a72');
  }
  k.reserve(lx, zc, hw + 4.4, L / 2 + 0.3);
}

const colon: Landmark = {
  terrain(k) {
    ground(k, { land: '#7cb85e', land2: '#6fae56', hill: '#3f8a4a', rock: '#5f7f5a', sand: '#e6d9a8', haze: '#d2e8e4' }, { relief: 1.2, range: 4.2, rise: 4, rough: 0.5, freq: 0.1 }, 'quay');
    const c = centre(k, -14, 0.9);
    const lx = c - 0.8;
    k.plateau(c + 0.5, -26, 17, 15, 0.48, 0.2);
    // the approach channel and the lock chamber, cut into the coast
    k.feature((x, z, h) => {
      const t = smooth(-11.6, -12.7, z);
      const hw = z > -19.6 ? 1.4 : lerp(1.4, 2.2, smooth(-19.6, -24, z));
      const m = smooth(hw, hw + 0.45, Math.abs(x - lx));
      return lerp(Math.min(h, -0.65), h, Math.max(m, 1 - t, smooth(-31, -36, z)));
    });
    k.plateau(c + 6.6, -13.2, 3.2, 1.3, LAND_Y + 0.02, 0.5);
    k.bump(c - 11, -23, 4.5, 3.4, 1.4, 1.0);
  },
  build(k) {
    const c = centre(k, -14, 0.9);
    const lx = c - 0.8;
    const rng = new Rng(k.seed ^ 0xc010);
    agua(k, lx, 1.4);
    // the Atlantic Bridge: a cable-stayed crossing of the channel behind the locks
    cableStayed(k, c - 15, c + 15, -21.8, [{ x: lx - 3.6, h: 1.65 }, { x: lx + 3.6, h: 1.65 }], { deck: 0.95, half: 0.14, color: '#f2f0e8', cable: '#e6e9eb' });
    // cranes and a ship on the right
    gantries(k, [c + 5.4, c + 6.9], -12.6, 0.9, '#c8302a');
    containerShip(k, c + 6.3, -11.15, 4.6, { hull: '#2a3a52', seed: 11 });
    boxes(k, c + 4.9, -13.3, 6, 3, 3, rng);
    town(k, colonStyle, 4, SHORE_Z - 1.2, { rowStep: 0.55, gaps: 0.08, maxSlope: 0.6, x1: c - 6.4 });
    const r2 = new Rng(k.seed ^ 0x2b);
    sowWide(k, r2, c, { n: 50, z0: -24, z1: -12.6, kinds: ['palm', 'palm', 'jungle', 'bush'], grove: 4, size: [0.9, 1.4] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── churches and forts ─────────────────────────────

/** A colonial church: a tiled nave with a pedimented front, a bell tower beside it and a dome behind. */
function colonialChurch(k: PortKit, x: number, z: number, o: { wall?: Col; roof?: Col; domeCol?: Col; towerCap?: Col; scale?: number; towerSide?: 1 | -1; dome?: boolean } = {}): void {
  const p = k.solid;
  const s = o.scale ?? 1;
  const wall = o.wall ?? '#f6f2e6';
  const roof = o.roof ?? '#b8553d';
  const side = o.towerSide ?? -1;
  const y = k.groundMax(x, z, 0.8 * s, 0.5 * s);
  const w = 1.2 * s;
  const d = 0.8 * s;
  const h = 0.62 * s;
  p.box(x, y - 0.12, z, w, h + 0.12, d, wall);
  p.prism(x, y + h, z, w + 0.05, 0.34 * s, d + 0.06, roof);
  p.tri([x - w / 2 - 0.025, y + h, z + d / 2 + 0.032], [x + w / 2 + 0.025, y + h, z + d / 2 + 0.032], [x, y + h + 0.34 * s, z + d / 2 + 0.032], wall);
  fq(p, x - 0.09 * s, x + 0.09 * s, y, y + 0.3 * s, z + d / 2 + 0.005, '#4a3a2e');
  fq(p, x - 0.05 * s, x + 0.05 * s, y + h + 0.1 * s, y + h + 0.22 * s, z + d / 2 + 0.036, '#3a4452');
  for (const dx of [-0.38, 0.38]) fq(p, x + dx * s - 0.05 * s, x + dx * s + 0.05 * s, y + 0.18 * s, y + 0.42 * s, z + d / 2 + 0.005, '#3a4452');
  belltower(k, x + side * (w / 2 + 0.2 * s), z + 0.08 * s, 0.36 * s, 1.3 * s, wall, o.towerCap ?? roof, 'pyramid', y);
  if (o.dome !== false) {
    p.cyl(x, y + h - 0.05, z - 0.1 * s, 0.3 * s, 0.3 * s, 0.22 * s, wall, { seg: 10 });
    dome(k, x, y + h + 0.17 * s, z - 0.1 * s, 0.3 * s, 0.34 * s, o.domeCol ?? '#c4673f', { lantern: '#f0ece0' });
  }
  k.reserve(x + (side * 0.2 * s) / 2, z, w / 2 + 0.5 * s, d / 2 + 0.3);
}

/** A stretch of stone rampart: a body on a battered foot, a parapet, a cornice and dark gun ports. */
function rampart(k: PortKit, x0: number, x1: number, z: number, h: number, d: number, wall: Col, y0 = LAND_Y): void {
  const p = k.solid;
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  p.box(cx, y0 - 0.25, z, len, h + 0.25, d, wall);
  p.box(cx, y0 - 0.25, z + d / 2 + 0.05, len, 0.6, 0.1, tint(wall, -0.1));
  p.box(cx, y0 + h - 0.05, z + d / 2 + 0.01, len + 0.02, 0.06, 0.05, tint(wall, 0.1), { ao: 0 });
  p.box(cx, y0 + h, z + d / 2 - 0.05, len, 0.13, 0.09, tint(wall, 0.06), { ao: 0 });
  p.box(cx, y0 + h, z - d / 2 + 0.05, len, 0.13, 0.09, tint(wall, 0.0), { ao: 0 });
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.75) fq(p, x - 0.07, x + 0.07, y0 + h * 0.58, y0 + h * 0.82, z + d / 2 + 0.006, '#4a3e30');
  k.reserve(cx, z, len / 2 + 0.05, d / 2 + 0.2);
}

/** A round bastion with a sentry box (garita) on the corner of a wall. */
function baluarte(k: PortKit, x: number, z: number, r: number, h: number, wall: Col, y0 = LAND_Y): void {
  const p = k.solid;
  p.cyl(x, y0 - 0.25, z, r * 1.12, r, h + 0.25, wall, { seg: 8 });
  p.cyl(x, y0 + h, z, r * 1.06, r * 1.06, 0.07, tint(wall, 0.1), { seg: 8, ao: 0 });
  p.cyl(x + r * 0.62, y0 + h + 0.07, z + r * 0.4, 0.07, 0.07, 0.16, tint(wall, 0.05), { seg: 6 });
  p.cone(x + r * 0.62, y0 + h + 0.23, z + r * 0.4, 0.1, 0.1, '#b8553d', { seg: 6 });
  k.reserve(x, z, r + 0.1, r + 0.1);
}

// ───────────────────────────── Cartagena ─────────────────────────────

const cartStyle: HouseStyle = {
  ...colonial,
  walls: ['#f2c94c', '#e8906a', '#7fb7d6', '#e6a0b4', '#f0e6c8', '#9fd0a8', '#d98a5a', '#c9a0d8'],
  roofs: ['#b8553d', '#c4673f', '#a64b36'],
  floors: [2, 3],
  floorH: 0.19,
  w: [0.34, 0.5],
  roofKinds: [['flat', 3], ['hip', 3], ['gable', 1]],
  gap: [0, 0.02],
};

const cartagena: Landmark = {
  terrain(k) {
    ground(k, { land: '#9bbd6a', land2: '#8fb462', hill: '#6f9f58', rock: '#7d8a6a', sand: '#e8dcb2', haze: '#d4e6e6' }, { relief: 0.6, range: 2.6, rise: 6, rough: 0.4, freq: 0.08 }, 'quay');
    const c = centre(k, -14, 1.0);
    k.plateau(c - 2.2, -14.2, 7.5, 2.4, LAND_Y + 0.02, 0.4);
    k.bump(c - 9.6, -21.5, 3.6, 3.0, 2.0, 1.1);
    k.plateau(c + 6.0, -15.8, 4.2, 2.8, LAND_Y + 0.05, 0.4);
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0xca27);
    const p = k.solid;
    // the walled city: ramparts along the sea front, bastions at the corners, the clock tower gate
    const stone = '#e6d6a6';
    rampart(k, c - 8.6, c + 2.4, -12.85, 0.9, 0.5, stone);
    for (const bx of [-8.6, -3.8, 2.4]) baluarte(k, c + bx, -12.85, 0.5, 0.98, stone);
    belltower(k, c - 1.1, -13.45, 0.64, 1.7, '#f2dea0', '#d8b46a', 'dome', LAND_Y);
    fq(p, c - 1.1 - 0.17, c - 1.1 + 0.17, LAND_Y, LAND_Y + 0.5, -13.45 + 0.32 + 0.006, '#3a2e24');
    // the cathedral tower, the domes of San Pedro Claver and Santo Domingo
    belltower(k, c + 1.6, -14.7, 0.5, 2.1, '#efe0b0', '#b8553d', 'pyramid');
    p.box(c + 0.6, LAND_Y - 0.1, -14.8, 1.5, 0.1 + 0.7, 0.9, '#f4ead0');
    p.prism(c + 0.6, LAND_Y + 0.7, -14.8, 1.55, 0.3, 0.95, '#b8553d');
    colonialChurch(k, c - 5.2, -14.6, { wall: '#f4ead0', domeCol: '#c4673f', towerSide: -1, towerCap: '#e0d4b0', scale: 1.05 });
    p.cyl(c - 3.0, LAND_Y + 0.4, -14.9, 0.26, 0.26, 0.55, '#f4ead0', { seg: 10 });
    dome(k, c - 3.0, LAND_Y + 0.95, -14.9, 0.32, 0.4, '#5f9a98', { lantern: '#f0ece0' });
    k.reserve(c - 3.0, -14.9, 0.5, 0.5);
    k.reserve(c + 0.6, -14.8, 1.0, 0.6);
    // Bocagrande: the white high-rise hotels on the peninsula
    const cols: Col[] = ['#f1efe8', '#e3e8ec', '#d8dfe5', '#c9d6df', '#f4f1e8'];
    for (let i = 0; i < 11; i++) {
      const h = 2.0 + ((i * 7) % 5) * 0.4;
      const x = c + 3.6 + i * 0.62 + (i % 2) * 0.1;
      const z = -16.0 - (i % 3) * 0.55;
      tower(k, x, z, 0.46 + (i % 2) * 0.08, 0.5, h, cols[i % 5], { win: '#5a7890', cols: 3, rows: Math.round(h / 0.26), roof: 'flat' });
    }
    // La Popa: the convent on its hill
    const px = c - 9.6;
    const py = k.ground(px, -21.5);
    p.box(px, py - 0.1, -21.5, 0.9, 0.5, 0.5, '#f6f3ea');
    p.prism(px, py + 0.4, -21.5, 1.0, 0.2, 0.56, '#b8553d');
    belltower(k, px + 0.65, -21.4, 0.28, 0.7, '#f6f3ea', '#b8553d', 'pyramid', py - 0.05);
    town(k, cartStyle, 4, -14.2, { rowStep: 0.55, gaps: 0.05, rowRise: 0.15, maxSlope: 0.6, minY: 0.3 });
    // yachts in the bay
    for (let i = 0, n = 0; i < 40 && n < 6; i++) {
      const bx = c + rng.range(-8, 6);
      const bz = rng.range(-11.4, -9.8);
      if (k.ground(bx, bz) > -0.12 || k.isReserved(bx, bz, 0.45)) continue;
      boat(k, bx, bz, n % 3 === 2 ? 'fishing' : 'sail', rng, rng.range(-0.2, 0.2), ['#f6f3ea', '#2c5da8', '#c8302a', '#e9a31a'][n % 4]);
      k.reserve(bx, bz, 0.5, 0.3);
      n++;
    }
    const r2 = new Rng(k.seed ^ 0x6d);
    sowWide(k, r2, c, { n: 26, z0: -24, z1: -12.9, kinds: ['palm', 'palm', 'jungle', 'bush'], grove: 3, minY: 0.4 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Santa Marta ─────────────────────────────

/** The cathedral: a white nave, twin towers on the front, a dome behind. */
function smCathedral(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.2, 0.7);
  const w = 1.5;
  const d = 1.05;
  const h = 0.8;
  p.box(x, y - 0.12, z, w, h + 0.12, d, '#f8f5ec');
  p.prism(x, y + h, z, w + 0.05, 0.36, d + 0.06, '#c4673f');
  p.tri([x - w / 2 - 0.025, y + h, z + d / 2 + 0.032], [x + w / 2 + 0.025, y + h, z + d / 2 + 0.032], [x, y + h + 0.36, z + d / 2 + 0.032], '#f8f5ec');
  fq(p, x - 0.1, x + 0.1, y, y + 0.36, z + d / 2 + 0.006, '#4a3a2e');
  fq(p, x - 0.07, x + 0.07, y + 0.5, y + 0.72, z + d / 2 + 0.006, '#4a6a8a');
  for (const dx of [-0.42, 0.42]) fq(p, x + dx - 0.05, x + dx + 0.05, y + 0.2, y + 0.46, z + d / 2 + 0.006, '#3a4452');
  fq(p, x - 0.09, x + 0.09, y + h + 0.1, y + h + 0.26, z + d / 2 + 0.036, '#4a6a8a');
  for (const s of [-1, 1]) belltower(k, x + s * (w / 2 + 0.13), z + 0.1, 0.4, 1.35, '#f8f5ec', '#6f9ab8', 'dome', y);
  p.cyl(x, y + h - 0.05, z - 0.12, 0.34, 0.34, 0.24, '#f8f5ec', { seg: 10 });
  dome(k, x, y + h + 0.19, z - 0.12, 0.34, 0.4, '#e9e4d2', { lantern: '#f0ece0' });
  k.reserve(x, z, w / 2 + 0.6, d / 2 + 0.3);
}

const smStyle: HouseStyle = {
  ...colonial,
  walls: ['#f6f2e6', '#f2e3b8', '#e8c9a0', '#cfe0d6', '#f0d4cc', '#f6f2e6', '#b9d2dc'],
  floors: [1, 2],
  roofKinds: [['hip', 4], ['gable', 3], ['flat', 2]],
  roofs: ['#b8553d', '#c4673f', '#a64b36'],
};

const santaMarta: Landmark = {
  terrain(k) {
    ground(k, { land: '#b3bf7a', land2: '#a6b46e', hill: '#6f9a5a', rock: '#8d8678', sand: '#e8dcb0', haze: '#d6e6ee', snowLine: 1.55, snow: '#ffffff' }, { relief: 0.5, range: 1.6, rise: 6, rough: 0.5, freq: 0.09 }, 'beach');
    const c = centre(k, -14, 1.2);
    // the Sierra Nevada: a snow-capped massif rising straight from the coast
    k.bump(c - 3.0, -18.0, 5.0, 3.6, 2.9, 1.9);
    k.bump(c + 3.4, -19.2, 4.8, 3.6, 3.2, 1.9);
    k.bump(c + 0.2, -20.2, 12, 5.0, 1.7, 1.0);
    k.bump(c - 9.6, -19.5, 4.2, 3.2, 2.2, 1.8);
    k.plateau(c - 0.3, -14.0, 5.4, 1.5, LAND_Y + 0.03, 0.4);
    const forest = c3('#3f7a4a');
    const rockc = c3('#7f786c');
    k.paint((x, y, z, slope, col) => {
      if (z < -14.5 && y > 0.45) col.lerp(forest, 0.6 * (1 - smooth(1.0, 1.5, y)));
      if (y > 1.1) col.lerp(rockc, 0.55 * smooth(1.1, 1.6, y));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.2);
    const rng = new Rng(k.seed ^ 0x5a17);
    smCathedral(k, c - 0.4, -14.3);
    // a reefer at the fruit pier on the left, a few boxes
    quayDeck(k, c - 9.2, c - 4.6, -12.5, -11.75, 0.4, '#a9a69c');
    reefer(k, c - 6.6, -11.12, 5.2, { stripe: '#c8302a' });
    boxes(k, c - 8.8, -13.1, 5, 2, 2, rng, { cols: ['#f1f3f2', '#e6ecef', '#d8e4ea', '#2c8aa5'] });
    // the old town, whitewashed with tile roofs, and palms along the beach
    town(k, smStyle, 4, SHORE_Z - 1.1, { rowStep: 0.55, gaps: 0.07, maxSlope: 0.6 });
    const r2 = new Rng(k.seed ^ 0x39);
    sowWide(k, r2, c, { n: 22, z0: -14.5, z1: -12.3, kinds: ['palm', 'palm', 'palm', 'bush'], grove: 3, size: [1.0, 1.5] });
    sowWide(k, r2, c, { n: 30, z0: -21, z1: -15, kinds: ['jungle', 'bush', 'palm'], grove: 4, minY: 0.45, maxY: 1.6 });
    // a few boats on the beach side
    for (let i = 0, n = 0; i < 40 && n < 5; i++) {
      const bx = c + rng.range(-3, 7);
      const bz = rng.range(-11.3, -9.9);
      if (k.ground(bx, bz) > -0.12 || k.isReserved(bx, bz, 0.45)) continue;
      boat(k, bx, bz, 'fishing', rng, rng.range(-0.2, 0.2), ['#e9a31a', '#c8302a', '#2c8aa5', '#f6f3ea', '#3f8d6b'][n]);
      k.reserve(bx, bz, 0.5, 0.3);
      n++;
    }
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Kingston ─────────────────────────────

const kingstonStyle: HouseStyle = {
  ...caribbean,
  walls: ['#f1ece0', '#e8c53a', '#7fb7d6', '#f08fa8', '#9fd0a8', '#e68a3a', '#d6e0e6', '#8a6fc0'],
  roofs: ['#8a8f94', '#a64b36', '#6c747a', '#4f7a8a'],
  floors: [1, 2],
  roofKinds: [['mono', 3], ['gable', 3], ['hip', 1], ['flat', 1]],
  pitch: 0.4,
};

const kingston: Landmark = {
  terrain(k) {
    ground(k, { land: '#8ab45e', land2: '#7ca955', hill: '#4f8a6a', rock: '#5a7a86', sand: '#e6d9a8', haze: '#c6dce8' }, { relief: 0.9, range: 2.4, rise: 4, rough: 0.5, freq: 0.1 }, 'quay');
    const c = centre(k, -14, 1.0);
    // the Blue Mountains: layered ridges, bluer with every step back
    k.bump(c - 2.0, -17.6, 8, 3.8, 2.3, 1.1);
    k.bump(c + 6.0, -19.4, 7, 3.6, 2.9, 1.2);
    k.bump(c - 9.4, -19.6, 6.2, 3.6, 2.4, 1.1);
    k.bump(c + 0.8, -23.0, 14, 5.0, 3.2, 1.0);
    k.plateau(c + 3.4, -13.3, 6.6, 1.5, LAND_Y + 0.02, 0.4);
    const blue = c3('#5683ad');
    k.paint((x, y, z, slope, col) => {
      if (z < -15.2) col.lerp(blue, 0.6 * smooth(0.6, 1.8, y));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0x6e17);
    // the container terminal: four gantries, a ship alongside, stacks behind
    quayDeck(k, c - 1.0, c + 8.4, -12.55, -11.75, 0.4, '#a9a69c');
    gantries(k, [c + 0.8, c + 2.3, c + 3.8, c + 5.3], -12.6, 1.0, '#2c5da8');
    containerShip(k, c + 3.1, -11.15, 6.0, { hull: '#7a2f2a', seed: 5 });
    boxes(k, c - 0.8, -13.4, 11, 3, 3, rng);
    boxes(k, c + 0.4, -14.3, 9, 2, 3, rng);
    // the town on the foothills to the left: bright wooden houses under zinc
    town(k, kingstonStyle, 5, SHORE_Z - 1.1, { rowStep: 0.52, gaps: 0.08, rowRise: 0.15, maxSlope: 0.7, x1: c - 1.6 });
    const r2 = new Rng(k.seed ^ 0x44);
    sowWide(k, r2, c, { n: 20, z0: -15.2, z1: -12.4, kinds: ['palm', 'palm', 'bush'], grove: 3, size: [0.95, 1.4] });
    sowWide(k, r2, c, { n: 44, z0: -24, z1: -15.4, kinds: ['jungle', 'jungle', 'palm', 'tall'], grove: 5, minY: 0.5, size: [0.9, 1.5] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Santo Tomas ─────────────────────────────

const stomas: Landmark = {
  terrain(k) {
    ground(k, { land: '#5e9e4e', land2: '#549548', hill: '#2f6b3c', rock: '#5d7260', sand: '#d9cfa4', haze: '#d0e6e2' }, { relief: 1.2, range: 3.0, rise: 3, rough: 0.7, freq: 0.12 }, 'quay');
    const c = centre(k, -14, 0.9);
    // steep jungle cones crowd in on the little harbour
    k.bump(c - 5.2, -16.6, 4.4, 3.4, 3.1, 1.9);
    k.bump(c + 4.8, -17.0, 4.6, 3.4, 3.5, 1.9);
    k.bump(c - 0.6, -20.5, 7, 4, 3.5, 1.5);
    k.bump(c + 10, -19.5, 4, 3.2, 2.6, 1.7);
    k.bump(c - 11, -19.5, 4, 3.2, 2.8, 1.7);
    k.plateau(c - 0.2, -13.2, 3.6, 1.5, LAND_Y + 0.02, 0.4);
    const dark = c3('#244f31');
    k.paint((x, y, z, slope, col) => {
      if (y > 0.7 && z < -14.2) col.lerp(dark, 0.5 * smooth(0.7, 2.2, y));
    });
  },
  build(k) {
    const c = centre(k, -14, 0.9);
    const rng = new Rng(k.seed ^ 0x57c0);
    // the small port: a quay, a feeder alongside, a mobile crane, two sheds and some boxes
    quayDeck(k, c - 3.1, c + 3.0, -12.55, -11.75, 0.4, '#a9a69c');
    containerShip(k, c + 0.3, -11.12, 4.8, { hull: '#2a4a3a', seed: 9 });
    gantryCrane(k, c - 1.6, -12.6, { s: 0.8, color: '#e8a31a' });
    shed(k, c - 2.2, -13.5, 1.5, 0.7, 0.45, '#e8e4da', '#3f6f8a');
    shed(k, c + 1.8, -13.6, 1.5, 0.7, 0.45, '#e8e4da', '#3f6f8a');
    boxes(k, c - 0.6, -13.0, 5, 2, 2, rng);
    // wooden huts on stilts between the jungle slopes
    town(k, { ...caribbean, floors: [1, 1], w: [0.28, 0.4], gap: [0.05, 0.3] }, 2, SHORE_Z - 0.9, { rowStep: 0.5, gaps: 0.35, maxSlope: 0.8 });
    const r2 = new Rng(k.seed ^ 0x31);
    sowWide(k, r2, c, { n: 14, z0: -14.4, z1: -12.4, kinds: ['palm', 'palm', 'bush'], grove: 3 });
    sowWide(k, r2, c, { n: 78, z0: -25, z1: -14.4, kinds: ['jungle', 'jungle', 'tall', 'palm'], grove: 6, minY: 0.45, size: [0.9, 1.6] });
    for (let i = 0; i < 2; i++) boat(k, c + rng.range(-5, 5), rng.range(-10.1, -9.7), 'fishing', rng, rng.range(-0.1, 0.1), ['#2c8aa5', '#e9a31a'][i]);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Veracruz ─────────────────────────────

/** San Juan de Ulua: a stone sea fortress on its island, round bastions at the corners, a tower and barracks inside. */
function sanJuanDeUlua(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const w = 4.2;
  const d = 1.5;
  const h = 1.0;
  const stone = '#cfc7ae';
  p.box(x, -0.9, z, w + 0.3, 0.95, d + 0.3, '#7d7a6e');
  p.box(x, 0.0, z, w, h, d, stone);
  p.box(x, h - 0.04, z + d / 2 + 0.01, w + 0.04, 0.05, 0.05, tint(stone, 0.1), { ao: 0 });
  p.box(x, h, z + d / 2 - 0.05, w, 0.12, 0.09, tint(stone, 0.05), { ao: 0 });
  p.box(x, h, z - d / 2 + 0.05, w, 0.12, 0.09, stone, { ao: 0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = x + (sx * w) / 2;
      const bz = z + (sz * d) / 2;
      p.cyl(bx, -0.9, bz, 0.46, 0.42, 0.9 + h + 0.12, tint(stone, -0.03), { seg: 8 });
      p.cyl(bx, h + 0.12, bz, 0.47, 0.47, 0.06, tint(stone, 0.08), { seg: 8, ao: 0 });
      if (sz > 0) {
        p.cyl(bx - sx * 0.12, h + 0.18, bz + 0.1, 0.07, 0.07, 0.16, '#e8dcc0', { seg: 6 });
        p.cone(bx - sx * 0.12, h + 0.34, bz + 0.1, 0.1, 0.12, '#a64b36', { seg: 6 });
      }
    }
  }
  for (let i = 0; i < 9; i++) fq(p, x - w / 2 + 0.7 + i * 0.35, x - w / 2 + 0.82 + i * 0.35, 0.5, 0.74, z + d / 2 + 0.006, '#4a3e30');
  fq(p, x - 0.18, x + 0.18, 0.05, 0.6, z + d / 2 + 0.008, '#3a2e24');
  // inside: the barracks, the Torreon and the governor's tower
  p.box(x - 0.6, h, z - 0.1, 2.0, 0.34, 0.7, '#efe6cc');
  p.prism(x - 0.6, h + 0.34, z - 0.1, 0.76, 0.2, 2.06, '#b8553d', { ry: Math.PI / 2 });
  p.box(x + 1.1, h, z, 0.5, 0.6, 0.5, '#e6dcc0');
  dome(k, x + 1.1, h + 0.6, z, 0.26, 0.28, '#5f9a98', { lantern: '#f0ece0' });
  p.box(x - 1.7, h, z - 0.05, 0.4, 0.8, 0.4, '#e6dcc0');
  p.pyramid(x - 1.7, h + 0.8, z - 0.05, 0.46, 0.25, 0.46, '#a64b36');
  // the causeway to the shore
  p.box(x + 0.4, -0.9, (z - d / 2 + SHORE_Z) / 2 - 0.12, 0.36, 1.3, Math.abs(z - d / 2 - SHORE_Z) + 0.3, '#a9a69c');
  k.reserve(x, z, w / 2 + 0.6, d / 2 + 0.6);
}

const vzStyle: HouseStyle = {
  ...colonial,
  walls: ['#f2d98a', '#e8906a', '#7fb7d6', '#e6a0b4', '#f4e6c8', '#9fd0a8', '#e9b88a', '#c9a0d8'],
  floors: [2, 3],
  roofKinds: [['flat', 4], ['hip', 3]],
};

const veracruz: Landmark = {
  terrain(k) {
    ground(k, { land: '#b4bf7c', land2: '#a8b672', hill: '#6f9a5a', rock: '#7d8590', sand: '#e8dcae', haze: '#d6e4ee', snowLine: 1.95, snow: '#ffffff' }, { relief: 0.4, range: 1.5, rise: 7, rough: 0.4, freq: 0.08 }, 'quay');
    const c = centre(k, -14, 1.0);
    // Pico de Orizaba, a snow-capped cone far behind the city (it is bluer and hazier than the near hills)
    k.bump(c + 2.8, -18.6, 6.4, 4.4, 3.3, 1.8);
    k.bump(c + 2.8, -19.4, 10, 5.4, 1.2, 1.0);
    k.plateau(c - 0.4, -14.0, 6.0, 1.6, LAND_Y + 0.03, 0.4);
    const far = c3('#6a8fb0');
    k.paint((x, y, z, slope, col) => {
      if (z < -15.5 && y > 0.6) col.lerp(far, 0.75 * smooth(0.6, 1.3, y) * (1 - smooth(2.0, 2.6, y)));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0x7e2a);
    const p = k.solid;
    // San Juan de Ulua out on its island, right of centre
    sanJuanDeUlua(k, c + 3.9, -10.3);
    // the Venustiano Carranza lighthouse on the waterfront: a pale shaft on a rectangular base
    const lx = c - 1.9;
    p.box(lx, LAND_Y - 0.1, -13.3, 1.2, 0.1 + 0.55, 0.8, '#efe6cc');
    p.box(lx, LAND_Y + 0.55, -13.3, 1.28, 0.05, 0.88, '#cfc4a4');
    for (let i = 0; i < 4; i++) fq(p, lx - 0.48 + i * 0.3, lx - 0.34 + i * 0.3, LAND_Y + 0.16, LAND_Y + 0.42, -13.3 + 0.404, '#3a4452');
    lighthouse(k, lx, LAND_Y + 0.6, -13.3, { h: 2.0, r0: 0.2, r1: 0.12, bands: [['#f1ecdc', 0.4], ['#cfc8b0', 0.3], ['#f1ecdc', 0.3]], cap: '#a64b36', gallery: '#6b6558', seg: 12 });
    k.reserve(lx, -13.3, 0.8, 0.6);
    // the cathedral with its tiled dome on the Plaza de Armas
    colonialChurch(k, c - 5.2, -14.7, { wall: '#f1e6c4', domeCol: '#4f9aa0', towerCap: '#e6d9b0', towerSide: 1, scale: 1.1 });
    // cranes and a ship at the container berths on the left
    quayDeck(k, c - 10.6, c - 7.4, -12.5, -11.75, 0.4, '#a9a69c');
    gantries(k, [c - 9.6, c - 8.2], -12.6, 0.9, '#c8302a');
    town(k, vzStyle, 4, SHORE_Z - 1.2, { rowStep: 0.58, gaps: 0.07, maxSlope: 0.6 });
    const r2 = new Rng(k.seed ^ 0x28);
    sowWide(k, r2, c, { n: 26, z0: -22, z1: -12.6, kinds: ['palm', 'palm', 'bush', 'scrub'], grove: 3, minY: 0.4, size: [0.95, 1.4] });
    for (let i = 0, n = 0; i < 40 && n < 4; i++) {
      const bx = c + rng.range(-8, 0.5);
      const bz = rng.range(-11.4, -9.9);
      if (k.ground(bx, bz) > -0.12 || k.isReserved(bx, bz, 0.45)) continue;
      boat(k, bx, bz, 'fishing', rng, rng.range(-0.2, 0.2), ['#e9a31a', '#c8302a', '#2c8aa5', '#f6f3ea'][n]);
      k.reserve(bx, bz, 0.5, 0.3);
      n++;
    }
  },
  rows: 0,
  quiet: true,
  // the Carranza lighthouse is this port's light: the breakwater head carries none
  mole: { light: false },
};

// ───────────────────────────── Santos ─────────────────────────────

/** The Bolsa Oficial de Cafe: a long cream palace with arched windows, a portico and a clock tower under a green dome. */
function bolsaDoCafe(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.7, 0.6);
  const w = 3.3;
  const d = 1.1;
  const h = 1.0;
  p.box(x, y - 0.12, z, w, h + 0.12, d, '#efe3c4');
  p.box(x, y + h - 0.04, z, w + 0.1, 0.1, d + 0.1, '#d6c8a2');
  p.box(x, y + h + 0.06, z, w - 0.1, 0.1, d - 0.1, '#a98a68');
  // two floors of tall arched windows between pilasters
  const n = 9;
  for (let i = 0; i < n; i++) {
    const wx = x - w / 2 + 0.2 + i * ((w - 0.4) / (n - 1));
    if (Math.abs(wx - x) < 0.5) continue;
    fq(i % 2 ? k.lit : p, wx - 0.07, wx + 0.07, y + 0.1, y + 0.42, z + d / 2 + 0.005, '#3a4a5a');
    fq(i % 3 ? p : k.lit, wx - 0.07, wx + 0.07, y + 0.56, y + 0.88, z + d / 2 + 0.005, '#3a4a5a');
    p.box(wx + (w - 0.4) / (n - 1) / 2, y, z + d / 2, 0.05, h, 0.03, '#d6c8a2', { ao: 0 });
  }
  // the portico
  for (let i = 0; i < 4; i++) p.cyl(x - 0.36 + i * 0.24, y, z + d / 2 + 0.16, 0.045, 0.045, 0.7, '#f6f1e2', { seg: 8 });
  p.box(x, y + 0.7, z + d / 2 + 0.16, 0.95, 0.07, 0.3, '#d6c8a2');
  p.prism(x, y + 0.77, z + d / 2 + 0.16, 0.95, 0.17, 0.3, '#f1e8cf');
  fq(p, x - 0.15, x + 0.15, y, y + 0.46, z + d / 2 + 0.01, '#4a3a2e');
  // the clock tower under its green dome
  belltower(k, x, z - 0.05, 0.62, 1.15, '#efe3c4', '#6fa08a', 'dome', y + h + 0.1);
  for (const s of [-1, 1]) {
    p.cyl(x + s * (w / 2 - 0.2), y + h + 0.1, z, 0.13, 0.13, 0.26, '#efe3c4', { seg: 8 });
    p.cone(x + s * (w / 2 - 0.2), y + h + 0.36, z, 0.16, 0.22, '#6fa08a', { seg: 8 });
  }
  k.reserve(x, z, w / 2 + 0.1, d / 2 + 0.4);
}

const santosStyle: HouseStyle = {
  ...colonial,
  walls: ['#f4e6c8', '#e8c9a0', '#cfe0d6', '#f0d4cc', '#f6f3ea', '#d9c9a0'],
  floors: [2, 4],
  floorH: 0.18,
  roofs: ['#b8553d', '#c4673f', '#8a8f94'],
  roofKinds: [['hip', 3], ['flat', 3], ['gable', 2]],
};

const santos: Landmark = {
  terrain(k) {
    ground(k, { land: '#8cb45e', land2: '#7fa957', hill: '#3f7a4a', rock: '#657a66', sand: '#ecdfb2', haze: '#d0e4e4' }, { relief: 1.0, range: 3.4, rise: 4, rough: 0.6, freq: 0.12 }, 'beach');
    const c = centre(k, -14, 1.0);
    // Monte Serrat, steep and wooded, behind the old centre; the Serra do Mar beyond
    k.bump(c - 3.4, -18.6, 3.4, 2.7, 2.5, 1.1);
    k.bump(c + 0.5, -24.0, 15, 5.0, 3.6, 1.0);
    k.plateau(c - 6.6, -13.2, 3.4, 1.4, LAND_Y + 0.02, 0.4);
    k.plateau(c + 0.4, -14.4, 3.2, 1.6, LAND_Y + 0.05, 0.4);
    const dark = c3('#2f6b3c');
    k.paint((x, y, z, slope, col) => {
      if (y > 0.9 && z < -15) col.lerp(dark, 0.45 * smooth(0.9, 2.2, y));
    });
  },
  build(k) {
    const c = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0x5a07);
    const p = k.solid;
    // the container terminal on the left: three gantries, a ship, the stacks
    quayDeck(k, c - 10.6, c - 3.6, -12.55, -11.75, 0.4, '#a9a69c');
    gantries(k, [c - 9.2, c - 7.7, c - 6.2], -12.6, 0.95, '#2c8aa5');
    containerShip(k, c - 7.6, -11.15, 6.0, { hull: '#2a3a52', seed: 13 });
    boxes(k, c - 9.8, -13.4, 10, 3, 3, rng);
    // the Bolsa do Cafe in the old centre
    bolsaDoCafe(k, c + 0.4, -14.5);
    // Monte Serrat with its chapel on the crown
    const mx = c - 3.4;
    const my = k.ground(mx, -18.6);
    p.box(mx, my - 0.1, -18.6, 0.5, 0.3, 0.4, '#f6f3ea');
    p.prism(mx, my + 0.2, -18.6, 0.56, 0.2, 0.44, '#b8553d');
    belltower(k, mx + 0.4, -18.5, 0.2, 0.55, '#f6f3ea', '#b8553d', 'pyramid', my - 0.05);
    k.reserve(mx, -18.6, 0.9, 0.6);
    // the beachfront: white apartment towers along the bay
    const cols: Col[] = ['#f4f1e8', '#e3e8ec', '#d8dfe5', '#f1e6c8', '#c9d6df'];
    for (let i = 0; i < 10; i++) {
      const h = 2.2 + ((i * 5) % 6) * 0.3;
      tower(k, c + 3.6 + i * 0.62 + (i % 2) * 0.12, -14.4 - (i % 3) * 0.5, 0.5 + (i % 2) * 0.08, 0.5, h, cols[i % 5], { win: '#4f6f88', cols: 3, rows: Math.round(h / 0.26), roof: i % 3 === 0 ? 'pyramid' : 'flat', roofH: 0.14 });
    }
    // beach strip in front of the towers
    p.box(c + 7.0, LAND_Y - 0.15, -12.9, 7.4, 0.17, 0.9, '#ecdfb2', { ao: 0 });
    town(k, santosStyle, 3, SHORE_Z - 1.4, { rowStep: 0.58, gaps: 0.06, maxSlope: 0.6 });
    const r2 = new Rng(k.seed ^ 0x29);
    sowWide(k, r2, c, { n: 30, z0: -22, z1: -12.4, kinds: ['palm', 'palm', 'jungle', 'bush'], grove: 3, minY: 0.35, size: [0.95, 1.4] });
    sowWide(k, r2, c, { n: 26, z0: -26, z1: -17, kinds: ['jungle', 'tall'], grove: 5, minY: 0.8, size: [0.9, 1.5] });
  },
  rows: 0,
  quiet: true,
};

export const LANDMARKS: Record<string, Landmark> = { balboa, callao, paita, bolivar, limon, turbo, guayaquil, colon, cartagena, santaMarta, kingston, stomas, veracruz, santos };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Callao', 'latam', 'callao'],
  ['Paita', 'latam', 'paita'],
  ['Puerto Bolívar', 'latam', 'bolivar'],
  ['Guayaquil', 'latam', 'guayaquil'],
  ['Balboa', 'latam', 'balboa'],
  ['Colón', 'caribbean', 'colon'],
  ['Puerto Limón', 'caribbean', 'limon'],
  ['Turbo', 'caribbean', 'turbo'],
  ['Cartagena', 'caribbean', 'cartagena'],
  ['Santa Marta', 'caribbean', 'santaMarta'],
  ['Kingston', 'caribbean', 'kingston'],
  ['Santo Tomás', 'caribbean', 'stomas'],
  ['Veracruz', 'latam', 'veracruz'],
  ['Santos', 'latam', 'santos'],
];

