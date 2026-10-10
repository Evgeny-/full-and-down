import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, MOLE_Z, lerp, smooth, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import { REGIONS as BASE, type Region, type RegionId } from '../regions';
import { buildTown, house, pick, scatter, tint, tree, type HouseStyle } from '../town';
import { gantryCrane, containerStack, boat, minaret, mosque, stack, church } from '../props';
import { figure, suspension, tower } from '../structures';
import { lighthouse } from '../harbour';

/**
 * The Black Sea: Istanbul and the Bosphorus, Bulgaria and Romania, the Danube ports (Galati, Reni, Izmail), Odessa and the
 * Ukrainian terminals, Samsun, and Georgia (Batumi, Poti).
 */

type Part = PortKit['solid'];

// ───────────────────────────── the regional look ─────────────────────────────

const BS_HOUSES: HouseStyle = {
  walls: ['#efe2b9', '#e8d29a', '#f1e9d3', '#e3b98a', '#dca89c', '#bdd0d1', '#f3ecd9'],
  roofs: ['#b5563f', '#7b6f66', '#5f7f62', '#a64b38'],
  trim: '#f6f3ea',
  win: '#3a4a58',
  floors: [2, 4],
  floorH: 0.19,
  w: [0.34, 0.56],
  d: [0.34, 0.5],
  roofKinds: [['hip', 4], ['gable', 3], ['flat', 3]],
  pitch: 0.42,
  chimney: 0.15,
  gap: [0, 0.07],
  door: '#5a4a3a',
};

/** Steppe coast: dry golden-green land, low rolling hills, plastered towns, plane trees and poplars, a gilded church. */
export const REGIONS: Partial<Record<RegionId, Region>> = {
  blacksea: {
    ...BASE.generic,
    id: 'blacksea',
    houses: BS_HOUSES,
    palette: { land: '#bdbb7e', land2: '#b3b874', hill: '#a2ab6a', rock: '#b4a98c', sand: '#e4d8ae', haze: '#d4e4ea' },
    shape: { relief: 1.5, range: 3.2, rise: 4, rough: 0.35, freq: 0.09 },
    shore: 'quay',
    rows: 4,
    rowStep: 0.58,
    gaps: 0.05,
    trees: [{ kinds: ['round', 'poplar', 'round', 'bush'], count: 70, where: 'all', size: [0.9, 1.4], maxY: 3 }],
    boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#c8302a', '#2c5da8', '#f6f3ea', '#e9a31a'] },
    armour: 'mixed',
    lights: [0, 1, 2, 4],
    extras: (k, rng) => {
      church(k, k.vx(-14.4) + rng.range(-5, 5), -14.6, { wall: '#f2ebd6', roof: '#5f7f62', spire: '#d9ae38', style: 'onion', h: 1.05 });
    },
  },
};

// ───────────────────────────── helpers ─────────────────────────────

const col = (c: Col): Col => c;

/** A dark window quad on the +z face (some of them light up at night). */
function wz(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, litChance = 0.35): void {
  (rng.chance(litChance) ? k.lit : k.solid).quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], c);
}

/** A dark window quad on the +x face. */
function wx(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, litChance = 0.35): void {
  (rng.chance(litChance) ? k.lit : k.solid).quad([x, y, z + w / 2], [x, y, z - w / 2], [x, y + h, z - w / 2], [x, y + h, z + w / 2], c);
}

/** An arched window on the +z face: a quad with a half-round head (two triangles). */
function arch(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col): void {
  p.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h * 0.72, z], [x - w / 2, y + h * 0.72, z], c);
  p.tri([x - w / 2, y + h * 0.72, z], [x + w / 2, y + h * 0.72, z], [x, y + h, z], c);
}

/** A dome from a lathe: slightly flattened Byzantine profile (r wide, h high). */
function dome(p: Part, x: number, y: number, z: number, r: number, h: number, c: Col, seg = 14): void {
  p.lathe(x, y, z, [[r, 0], [r * 0.99, h * 0.12], [r * 0.9, h * 0.45], [r * 0.62, h * 0.8], [r * 0.22, h * 0.97], [0.001, h]], c, { seg });
}

/** An onion dome with a spike and a little cross. */
function onion(p: Part, x: number, y: number, z: number, r: number, h: number, c: Col, cross: Col = '#e8c23a'): void {
  p.lathe(x, y, z, [[r * 0.5, 0], [r, h * 0.22], [r * 0.98, h * 0.38], [r * 0.6, h * 0.62], [r * 0.2, h * 0.86], [0.001, h]], c, { seg: 10 });
  p.cyl(x, y + h, z, 0.01, 0.006, r * 0.8, cross, { seg: 4, ao: 0 });
  p.box(x, y + h + r * 0.45, z, r * 0.4, 0.014, 0.014, cross, { ao: 0 });
}

/** Dark windows round the front half of a drum (the faces the camera sees). */
function drumWindows(p: Part, x: number, y: number, z: number, r: number, h: number, n: number, c: Col = '#34404c'): void {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n;
    p.box(x + Math.cos(a) * r, y, z + Math.sin(a) * r, h * 0.28, h, 0.012, c, { ry: Math.PI / 2 - a, ao: 0 });
  }
}

/** A half ring of columns on the front (+z) side, with a cornice above. */
function colonnade(p: Part, x: number, y: number, z: number, r: number, n: number, h: number, c: Col, cap: Col): void {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * i) / (n - 1);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    p.cyl(cx, y, cz, 0.035, 0.03, h, c, { seg: 6, ao: 0.1 });
    p.box(cx, y + h, cz, 0.1, 0.03, 0.1, cap, { ao: 0, ry: Math.PI / 2 - a });
  }
  for (let i = 0; i < n - 1; i++) {
    const a = (Math.PI * (i + 0.5)) / (n - 1);
    const len = (Math.PI * r) / (n - 1);
    p.box(x + Math.cos(a) * r, y + h + 0.03, z + Math.sin(a) * r, len * 1.1, 0.07, 0.1, cap, { ry: -a - Math.PI / 2, ao: 0 });
  }
}

/** Reed beds along the waterline: clumps of thin yellow-green blades on the shallows. */
function reeds(k: PortKit, rng: Rng, x0: number, x1: number, z: number, n: number, zj = 0.4): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const zz = z + rng.range(-zj, zj);
    const g = k.ground(x, zz);
    if (g < -0.14 || g > 0.6 || k.isReserved(x, zz, 0.02)) continue;
    const y = Math.max(g, -0.02) - 0.02;
    const c = rng.chance(0.5) ? '#b9aa6a' : '#9fae5e';
    const h = rng.range(0.28, 0.5);
    for (let j = 0; j < 4; j++) k.solid.cyl(x + rng.range(-0.06, 0.06), y, zz + rng.range(-0.05, 0.05), 0.014, 0.0, h * rng.range(0.7, 1.05), c, { seg: 3, open: true, rx: rng.range(-0.22, 0.22), rz: rng.range(-0.22, 0.22), ao: 0.1 });
  }
}

/** A plane tree or an acacia: a trunk and a few round crowns. */
function crown(k: PortKit, rng: Rng, x: number, z: number, s: number, kind: 'plane' | 'acacia', y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const c = kind === 'plane' ? ['#6c9a58', '#5f8f52', '#76a35e'] : ['#a3bb5e', '#98b356', '#b0c468'];
  p.cyl(x, y, z, 0.018 * s, 0.014 * s, 0.14 * s, '#7a6a55', { seg: 4, open: true });
  const n = kind === 'plane' ? 3 : 2;
  for (let i = 0; i < n; i++) p.blob(x + rng.range(-0.05, 0.05) * s, y + (0.17 + i * 0.05) * s, z + rng.range(-0.04, 0.04) * s, (kind === 'plane' ? 0.11 : 0.085) * s, c[i % 3], { sy: 0.85, ry: rng.next() * 3 });
}

function townFor(k: PortKit, hs: HouseStyle, o: { rows: number; rowStep?: number; z?: number; gaps?: number; rowRise?: number; maxSlope?: number; minY?: number; shift?: number; x0?: number; x1?: number }): void {
  const w = k.width;
  buildTown(k, { x0: o.x0 ?? -w / 2 - 2, x1: o.x1 ?? w / 2 + 2, z: o.z ?? SHORE_Z - 1.3, rows: o.rows, rowStep: o.rowStep ?? 0.55, hs, gaps: o.gaps, rowRise: o.rowRise, cx: k.vx(SHORE_Z - 2) + (o.shift ?? 0), maxSlope: o.maxSlope, minY: o.minY });
}

/** Run `fn` in a local frame (origin on the ground, scaled by S) and keep houses off the footprint. */
function placed(k: PortKit, x: number, y: number, z: number, S: number, rx: number, rz: number, fn: () => void, ry = 0): void {
  k.at(x, y, z, ry, S, fn);
  k.reserve(x, z, rx * S, rz * S);
}

/** Carve a water channel straight back from the shore (a river mouth or a strait); the banks widen with distance. */
function channel(k: PortKit, cx: number, half: number, zBack: number, bank = 1.2, zFrom = SHORE_Z + 1, widen = 0): void {
  k.feature((x, z, h) => {
    if (z > zFrom || z < zBack) return h;
    const bw = bank + Math.max(0, SHORE_Z - z) * widen;
    const m = 1 - smooth(half, half + bw, Math.abs(x - cx));
    const e = smooth(zBack, zBack + 5, z);
    return lerp(h, Math.min(h, -0.35), m * e);
  });
}

/** A silo: a cylinder with a conical cap, standing on y. */
function silo(p: Part, x: number, y: number, z: number, r: number, h: number, wall: Col, cap: Col): void {
  p.cyl(x, y, z, r, r, h, wall, { seg: 10 });
  p.cone(x, y + h, z, r * 1.04, r * 0.55, cap, { seg: 10 });
}

/** A river barge: a low hull with a cargo heap or a hatch coaming, on the water. */
function barge(k: PortKit, x: number, z: number, len: number, hull: Col, cargo: Col, ry = 0): void {
  const p = k.solid;
  p.at(x, 0, z, ry, 1, () => {
    p.box(0, -0.1, 0, len, 0.2, 0.36, hull, { ao: 0.1 });
    p.box(len / 2 - 0.12, -0.1, 0, 0.3, 0.2, 0.28, hull, { rz: -0.3, ao: 0.1 });
    p.box(0, 0.09, 0, len * 0.9, 0.012, 0.34, tint(hull, -0.2), { ao: 0 });
    p.box(0, 0.1, 0, len * 0.62, 0.1, 0.26, cargo, { ao: 0.1 });
    p.box(-len / 2 + 0.16, 0.1, 0, 0.2, 0.17, 0.2, '#f1ede2');
  });
}

interface ShipOpts {
  hull?: Col;
  kind?: 'container' | 'bulk' | 'tanker';
  ry?: number;
  stripe?: Col;
}

/** A cargo ship on the water (bow toward +x), `len` long: hull with a raked bow, aft house, funnel, a deck load. */
function cargoShip(k: PortKit, rng: Rng, x: number, z: number, len: number, o: ShipOpts = {}): void {
  const p = k.solid;
  const hull = o.hull ?? '#2c3a57';
  const hw = 0.3;
  p.at(x, 0, z, o.ry ?? 0, 1, () => {
    const bl = len * 0.16;
    const L = len - bl;
    p.box(-len / 2 + L / 2, -0.15, 0, L, 0.4, hw * 2, hull, { ao: 0.12 });
    p.box(-len / 2 + L / 2, -0.15, 0, L + 0.004, 0.12, hw * 2 + 0.01, '#a8402f', { ao: 0 });
    const x0 = -len / 2 + L;
    const A: V3 = [x0, -0.15, -hw];
    const B: V3 = [x0, -0.15, hw];
    const C: V3 = [x0, 0.25, hw];
    const D: V3 = [x0, 0.25, -hw];
    const E: V3 = [x0 + bl, 0.25, 0];
    const F: V3 = [x0 + bl - 0.05, -0.15, 0];
    p.solid([A, B, C, D, E, F], [[1, 5, 4, 2], [0, 5, 4, 3], [3, 2, 4], [0, 1, 5]], hull);
    p.box(-len / 2 + L / 2, 0.25, 0, L, 0.015, hw * 2 + 0.01, '#6c6d66', { ao: 0 });
    // the aft house, the funnel
    const ax = -len / 2 + 0.3;
    p.box(ax, 0.25, 0, 0.42, 0.34, hw * 1.7, '#f1ede2');
    p.box(ax, 0.59, 0, 0.3, 0.12, hw * 1.4, '#f1ede2');
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) p.box(ax + 0.215, 0.33 + r * 0.17, -0.12 + i * 0.12, 0.012, 0.06, 0.06, '#33414f', { ao: 0 });
    p.cyl(ax - 0.06, 0.7, 0, 0.07, 0.06, 0.2, o.stripe ?? '#c8302a', { seg: 8 });
    // the deck load
    const kind = o.kind ?? 'container';
    const n = Math.max(2, Math.floor((L - 0.9) / 0.23));
    for (let i = 0; i < n; i++) {
      const bx = -len / 2 + 0.78 + i * 0.23;
      if (kind === 'container') {
        const cols = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c'];
        const tiers = 1 + (rng.chance(0.6) ? 1 : 0) + (rng.chance(0.3) ? 1 : 0);
        for (let t = 0; t < tiers; t++) p.box(bx, 0.27 + t * 0.1, 0, 0.21, 0.1, 0.5, cols[Math.floor(rng.next() * cols.length)], { ao: 0.15 });
      } else if (kind === 'bulk') {
        p.box(bx, 0.27, 0, 0.19, 0.07, 0.5, '#7f8a82', { ao: 0.1 });
        if (i % 2 === 0) {
          p.rod([bx + 0.1, 0.3, -0.25], [bx + 0.1, 0.78, -0.25], 0.012, '#d8d2c2', 4);
          p.rod([bx + 0.1, 0.76, -0.25], [bx + 0.34, 0.5, -0.25], 0.01, '#d8d2c2', 4);
        }
      } else {
        p.box(bx, 0.27, 0, 0.19, 0.03, 0.3, '#59635e', { ao: 0 });
        p.cyl(bx, 0.27, 0.1, 0.018, 0.018, 0.1, '#c8302a', { seg: 5 });
      }
    }
    if (kind === 'tanker') p.rod([-len / 2 + 0.85, 0.32, 0], [len / 2 - bl - 0.2, 0.32, 0], 0.018, '#59635e', 4);
  });
}

/** Rows of acacias and plane trees on a slope, either side of a corridor (x0..x1 kept clear). */
function parkTrees(k: PortKit, rng: Rng, xa: number, xb: number, za: number, zb: number, n: number, clear?: [number, number], minY = 0.3): void {
  let placed = 0;
  for (let g = 0; g < n * 12 && placed < n; g++) {
    const x = rng.range(xa, xb);
    const z = rng.range(zb, za);
    if (clear && x > clear[0] && x < clear[1]) continue;
    const y = k.ground(x, z);
    if (y < minY || k.isReserved(x, z, 0.1)) continue;
    crown(k, rng, x, z, rng.range(1.0, 1.7), rng.chance(0.45) ? 'plane' : 'acacia', y - 0.03);
    placed++;
  }
}

// ───────────────────────────── Odessa ─────────────────────────────

const OD_Z0 = -12.95;
const OD_TOP = 2.5;
const ST_W0 = 1.12;
const ST_W1 = 0.74;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface Tread {
  zf: number;
  zb: number;
  y: number;
  landing: boolean;
}

/** The Potemkin Stairs: three flights of four steps with a landing after each, rising from the quay to the boulevard. */
function odessaPlan(): { treads: Tread[]; zTop: number } {
  const treads: Tread[] = [];
  let z = OD_Z0;
  let y = LAND_Y;
  const dy = (OD_TOP - LAND_Y) / 12;
  for (let f = 0; f < 3; f++) {
    for (let s = 0; s < 4; s++) {
      y += dy;
      treads.push({ zf: z, zb: z - 0.3, y, landing: false });
      z -= 0.3;
    }
    treads.push({ zf: z, zb: z - 0.42, y, landing: true });
    z -= 0.42;
  }
  return { treads, zTop: z };
}

const odessaSx = (k: PortKit): number => k.vx(-15) + 0.5 * k.mole.dir;

/** A stair rises L(z) from the quay to the boulevard: the ground in its corridor follows this ramp (a little below the treads). */
function odessaRamp(z: number, zTop: number): number {
  return LAND_Y + (OD_TOP - LAND_Y) * clamp01((OD_Z0 - z) / (OD_Z0 - zTop));
}

function potemkin(k: PortKit, sx: number): void {
  const p = k.solid;
  const { treads, zTop } = odessaPlan();
  let yPrev = LAND_Y;
  treads.forEach((t, i) => {
    const zm = (t.zf + t.zb) / 2;
    const u = clamp01((OD_Z0 - zm) / (OD_Z0 - zTop));
    const hw = lerp(ST_W0, ST_W1, u);
    const tread = t.landing ? '#d9ceb4' : i % 2 ? '#efe6cf' : '#e5dbc1';
    p.quad([sx - hw, t.y, t.zf], [sx + hw, t.y, t.zf], [sx + hw, t.y, t.zb], [sx - hw, t.y, t.zb], tread);
    if (t.y - yPrev > 0.01) p.quad([sx - hw, yPrev, t.zf], [sx + hw, yPrev, t.zf], [sx + hw, t.y, t.zf], [sx - hw, t.y, t.zf], '#a99c80');
    yPrev = t.y;
    // the cheek walls with a coping: they bury the gap between the treads and the ground
    const len = Math.abs(t.zf - t.zb) + 0.004;
    for (const sd of [-1, 1]) {
      const wxp = sx + sd * (hw + 0.07);
      const lo = odessaRamp(t.zb, zTop) - 0.4;
      p.box(wxp, lo, zm, 0.13, t.y + 0.15 - lo, len, '#d8cdb0');
      p.box(wxp, t.y + 0.15, zm, 0.17, 0.025, len, '#f3ecd8', { ao: 0 });
    }
  });
  // the landing at the top, and the Duc de Richelieu on his plinth
  const pz = zTop - 0.75;
  p.cyl(sx, OD_TOP - 0.1, pz, 1.25, 1.25, 0.14, '#e2d7bd', { seg: 16 });
  p.box(sx, OD_TOP + 0.04, pz, 0.38, 0.12, 0.38, '#cfc4a8');
  p.box(sx, OD_TOP + 0.16, pz, 0.28, 0.46, 0.28, '#d9cfb6');
  p.box(sx, OD_TOP + 0.62, pz, 0.34, 0.05, 0.34, '#cfc4a8', { ao: 0 });
  figure(k, sx, OD_TOP + 0.67, pz, 0.42, '#5f8a5a', 'stand');
  // lamp posts at the head of the stairs
  for (const sd of [-1, 1]) {
    p.cyl(sx + sd * 1.25, OD_TOP - 0.05, zTop + 0.1, 0.014, 0.014, 0.4, '#2d3138', { seg: 4 });
    k.glow.ball(sx + sd * 1.25, OD_TOP + 0.37, zTop + 0.1, 0.035, '#fff0b0');
  }
  k.reserve(sx, (OD_Z0 + zTop) / 2, 1.5, (OD_Z0 - zTop) / 2 + 0.9);
}

/** The Opera Theatre: a cream neo-baroque block with a semicircular colonnaded front, a green dome, statues. Local frame, +z is the front. */
function operaHouse(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const cream = '#ecdfb4';
  const light = '#f8f1dc';
  const stone = '#d9c99a';
  const green = '#79a08c';
  p.box(0, -0.3, 0, 2.7, 0.3 + 0.95, 1.3, cream);
  p.box(0, 0.95, 0, 2.8, 0.07, 1.4, light, { ao: 0 });
  p.box(0, 1.02, 0, 2.5, 0.1, 1.1, tint(cream, -0.06));
  // the arcade and the tall windows of the piano nobile
  for (let i = 0; i < 8; i++) {
    const x = -1.12 + i * 0.32;
    if (Math.abs(x) < 0.55) continue;
    arch(p, x, 0.04, 0.652, 0.15, 0.34, '#5a4a3a');
    arch(p, x, 0.5, 0.652, 0.13, 0.38, '#34404c');
    p.box(x, 0.46, 0.655, 0.2, 0.025, 0.01, light, { ao: 0 });
  }
  for (let i = 0; i < 4; i++) wx(k, rng, 1.352, 0.5, -0.4 + i * 0.3, 0.13, 0.38, '#34404c', 0.4);
  // the rotunda: a drum bulging out of the front, wrapped in a half ring of columns
  p.cyl(0, -0.3, 0.5, 0.62, 0.62, 1.25 + 0.3, cream, { seg: 16 });
  p.cyl(0, 0.0, 0.5, 0.7, 0.7, 0.05, light, { seg: 16, ao: 0 });
  colonnade(p, 0, 0.05, 0.5, 0.74, 7, 0.62, light, stone);
  p.cyl(0, 0.73, 0.5, 0.72, 0.72, 0.05, light, { seg: 16, ao: 0 });
  p.cyl(0, 0.78, 0.5, 0.68, 0.68, 0.08, tint(cream, 0.04), { seg: 16 });
  p.cyl(0, 0.86, 0.5, 0.72, 0.72, 0.05, light, { seg: 16, ao: 0 });
  arch(p, 0, 0.0, 1.124, 0.2, 0.46, '#5a4a3a');
  drumWindows(p, 0, 0.12, 0.5, 0.624, 0.3, 6);
  // the roofline: balustrade, sculptures, the green auditorium dome and the stage house behind
  p.box(0, 1.12, 0, 2.55, 0.05, 1.15, light, { ao: 0 });
  for (const sx of [-1, 1]) {
    p.cyl(sx * 1.08, 1.12, 0.4, 0.07, 0.07, 0.16, '#cbbf9c', { seg: 6 });
    p.blob(sx * 1.08, 1.34, 0.4, 0.08, '#b9a874', { sy: 1.2 });
  }
  dome(p, 0, 1.12, -0.1, 0.86, 0.62, green, 16);
  p.cyl(0, 1.74, -0.1, 0.12, 0.12, 0.2, light, { seg: 8 });
  p.cone(0, 1.94, -0.1, 0.14, 0.2, green, { seg: 8 });
  p.cyl(0, 2.14, -0.1, 0.008, 0.008, 0.15, '#e8c23a', { seg: 4 });
  p.box(0, 1.0, -0.62, 1.9, 0.7, 0.55, cream);
  p.box(0, 1.7, -0.62, 1.96, 0.05, 0.6, light, { ao: 0 });
  p.prism(0, 1.75, -0.62, 0.6, 0.22, 1.96, '#7b8a84', { ry: Math.PI / 2 });
}

/** The Marine Station: a long white terminal with a clock tower and a gilded spire, and a jetty with a ferry. Local frame, +z the water. */
function marineStation(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const white = '#f4f1e9';
  p.box(0, -0.3, 0, 3.2, 0.3 + 0.48, 0.62, white);
  p.box(0, 0.48, 0, 3.28, 0.04, 0.68, '#d9d4c7', { ao: 0 });
  for (let i = 0; i < 14; i++) wz(k, rng, -1.45 + i * 0.223, 0.16, 0.312, 0.13, 0.17, '#38566e', 0.35);
  for (let i = 0; i < 14; i++) p.box(-1.45 + i * 0.223, 0.06, 0.312, 0.015, 0.4, 0.008, '#e9e4d6', { ao: 0 });
  // the tower
  p.box(0.3, 0.5, -0.05, 0.36, 1.05, 0.36, white);
  p.box(0.3, 1.55, -0.05, 0.44, 0.05, 0.44, '#d9d4c7', { ao: 0 });
  p.quad([0.12, 1.2, 0.136], [0.48, 1.2, 0.136], [0.48, 1.5, 0.136], [0.12, 1.5, 0.136], '#cdd7dc');
  p.cyl(0.3, 1.6, -0.05, 0.12, 0.12, 0.06, '#bda45a', { seg: 4 });
  p.pyramid(0.3, 1.66, -0.05, 0.3, 0.5, 0.3, '#c9b36a');
  p.cyl(0.3, 2.14, -0.05, 0.007, 0.007, 0.16, '#e8c23a', { seg: 4 });
  // the jetty and the ferry
  p.box(-0.5, -0.9, 0.9, 0.46, 0.9 + 0.1, 1.5, '#b9b3a4');
  p.box(-0.5, 0.1, 0.9, 0.5, 0.03, 1.54, '#d2cbb9', { ao: 0 });
  p.box(-0.5, 0.13, 1.66, 0.3, 0.1, 0.1, white);
}

const odessa: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 0.3, range: 1.4, rise: 7, rough: 0.2 };
    k.palette.land = '#c4bd80';
    k.palette.land2 = '#b9bd78';
    const sx = odessaSx(k);
    const { zTop } = odessaPlan();
    // the cliff the city stands on: one ramp from the port to the boulevard, in the middle of the view
    k.feature((x, z, h) => {
      const t = clamp01((OD_Z0 - z) / (OD_Z0 - zTop));
      const env = 1 - smooth(11, 19, Math.abs(x - sx));
      return h + (OD_TOP - LAND_Y) * t * env;
    });
    k.plateau(k.vx(-22.7), -22.7, 17, 6.4, OD_TOP + 0.04, 0.4);
    k.plateau(sx, zTop - 0.75, 1.9, 1.45, OD_TOP + 0.03, 0.3);
    // the stairs' corridor follows the ramp (a little below the treads)
    k.feature((x, z, h) => {
      if (z > OD_Z0 + 0.1 || z < zTop - 0.2) return h;
      const t = clamp01((OD_Z0 - z) / (OD_Z0 - zTop));
      const hw = lerp(ST_W0, ST_W1, t) + 0.2;
      const m = 1 - smooth(hw, hw + 0.7, Math.abs(x - sx));
      return lerp(h, odessaRamp(z, zTop) - 0.12, m);
    });
    // park green on the slope
    k.paint((x, y, z, slope, c) => {
      if (z < OD_Z0 + 0.5 && z > zTop - 0.8 && Math.abs(x - sx) < 14) c.lerp(new THREE.Color('#82a65c'), 0.75);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x0de55a);
    const R = k.mole.dir;
    const sx = odessaSx(k);
    const { zTop } = odessaPlan();
    potemkin(k, sx);
    // the Opera on the boulevard, the Vorontsov colonnade on the other side
    placed(k, sx + R * 3.45, OD_TOP + 0.02, -19.3, 1.0, 1.5, 0.95, () => operaHouse(k, rng));
    placed(k, sx - R * 3.05, OD_TOP + 0.02, -18.7, 1.0, 1.1, 0.8, () => {
      const p = k.solid;
      p.cyl(0, -0.1, 0, 0.98, 1.0, 0.14, '#e4d9bf', { seg: 18 });
      colonnade(p, 0, 0.04, 0, 0.84, 9, 0.6, '#f6f0de', '#e1d6b9');
      p.box(0, 0.04, -0.84, 1.8, 0.6, 0.1, '#efe6cd');
      p.box(0, 0.66, -0.84, 1.9, 0.07, 0.14, '#e1d6b9', { ao: 0 });
    });
    // the Marine Station at the foot of the stairs
    placed(k, sx + R * 4.9, LAND_Y, -13.35, 1.0, 1.7, 0.9, () => marineStation(k, rng));
    boat(k, sx + R * 4.9 + 0.75, -10.95, 'ferry', rng, 0, '#c8302a');
    // sheds, a few cranes and boxes along the old harbour, away from the stairs
    for (const [dx, w] of [[2.9, 0.9], [4.0, 0.8], [5.2, 0.7]] as Array<[number, number]>) {
      house(k, sx - R * dx, -13.55, w, 0.42, 1, { ...OD_HOUSES, floors: [1, 1] }, rng, 'gable', pick(rng, ['#d9d0bd', '#cfc7b4', '#e0d8c4']), '#7b8a84', false);
    }
    gantryCrane(k, sx - R * 7.0, SHORE_Z - 0.75, { color: '#c9402e', s: 0.78, y: LAND_Y });
    gantryCrane(k, sx - R * 8.4, SHORE_Z - 0.75, { color: '#2c5da8', s: 0.78, y: LAND_Y });
    containerStack(k, sx - R * 9.9, SHORE_Z - 1.55, 4, 2, 3, rng);
    // the boulevard's buildings
    townFor(k, OD_HOUSES, { rows: 4, z: zTop - 0.55, rowStep: 0.62, minY: 2.3, maxSlope: 0.9, gaps: 0.03 });
    // acacias and plane trees on the park slopes
    parkTrees(k, rng, sx - 7.5, sx + 7.5, OD_Z0 - 0.4, zTop + 0.2, 62, [sx - 1.75, sx + 1.75]);
    // the plane-tree alley along the boulevard
    for (let x = sx - 8.4; x < sx + 8.4; x += 0.72) {
      if (Math.abs(x - sx) < 1.7 || k.isReserved(x, zTop + 0.2, 0.15)) continue;
      crown(k, rng, x + rng.range(-0.08, 0.08), zTop + 0.2, 1.25, 'plane', OD_TOP - 0.05);
    }
    parkTrees(k, rng, sx - 9, sx + 9, zTop - 0.2, zTop - 3.5, 30, [sx - 2, sx + 2], 2.2);
    // the Vorontsov lighthouse: a slim white column on a plinth, in place of the standard light
    const lx = k.mole.endX;
    const top = k.mole.top;
    k.solid.box(lx, top, MOLE_Z, 0.62, 0.12, 0.62, '#efe9d9');
    k.solid.box(lx, top + 0.12, MOLE_Z, 0.46, 0.2, 0.46, '#f6f1e3');
    k.solid.box(lx, top + 0.32, MOLE_Z, 0.54, 0.04, 0.54, '#e0d9c6', { ao: 0 });
    lighthouse(k, lx, top + 0.36, MOLE_Z, { h: 2.9, r0: 0.16, r1: 0.115, bands: [['#f8f5ec', 1]], gallery: '#f2eee2', cap: '#2d3138', seg: 14 });
    for (const f of [0.18, 0.5, 0.82]) k.solid.cyl(lx, top + 0.36 + 2.9 * f, MOLE_Z, 0.19 - 0.06 * f, 0.19 - 0.06 * f, 0.03, '#ece6d6', { seg: 14, ao: 0 });
  },
  mole: { light: false },
  rows: 0,
  quiet: true,
};

const OD_HOUSES: HouseStyle = {
  ...BS_HOUSES,
  walls: ['#efe3b8', '#f2ead0', '#e9d29a', '#dfc8a0', '#f3ecda', '#e6c9a0'],
  roofs: ['#6f7a72', '#7b6f66', '#5f7f62'],
  floors: [3, 5],
  floorH: 0.2,
  roofKinds: [['flat', 4], ['hip', 2], ['gable', 1]],
  pitch: 0.3,
  gap: [0, 0.02],
};

// ───────────────────────────── shared: churches and port plant ─────────────────────────────

interface ChurchOpts {
  wall: Col;
  trim: Col;
  dome: Col;
  /** side of the bell tower (0: none) */
  tower?: -1 | 0 | 1;
  roof?: Col;
}

/** An Orthodox church: a cube with a gabled porch, a drum with an onion dome, four little corner domes, a bell tower. Local frame, +z front. */
function orthodoxChurch(k: PortKit, rng: Rng, o: ChurchOpts): void {
  const p = k.solid;
  p.box(0, -0.25, 0, 1.3, 0.25 + 0.75, 1.1, o.wall);
  p.box(0, 0.75, 0, 1.38, 0.05, 1.18, o.trim, { ao: 0 });
  p.box(0, -0.2, 0.62, 0.7, 0.2 + 0.55, 0.2, tint(o.wall, 0.04));
  p.prism(0, 0.55, 0.62, 0.8, 0.3, 0.24, o.roof ?? o.trim);
  arch(p, 0, 0, 0.724, 0.2, 0.42, '#4a3a30');
  for (const sx of [-0.48, 0.48]) arch(p, sx, 0.16, 0.552, 0.12, 0.44, '#34404c');
  for (let i = 0; i < 3; i++) wx(k, rng, 0.652, 0.2, -0.3 + i * 0.3, 0.12, 0.42, '#34404c', 0.4);
  p.cyl(0, 0.8, 0, 0.3, 0.3, 0.34, o.wall, { seg: 10 });
  drumWindows(p, 0, 0.9, 0, 0.304, 0.17, 5);
  onion(p, 0, 1.14, 0, 0.35, 0.64, o.dome);
  for (const sx of [-0.5, 0.5]) {
    for (const sz of [-0.38, 0.38]) {
      p.cyl(sx, 0.8, sz, 0.15, 0.15, 0.2, o.wall, { seg: 8 });
      onion(p, sx, 1.0, sz, 0.17, 0.32, o.dome);
    }
  }
  if (o.tower) {
    const bx = o.tower * 1.1;
    p.box(bx, -0.25, 0.15, 0.32, 0.25 + 1.3, 0.32, o.wall);
    p.box(bx, 1.05, 0.15, 0.38, 0.04, 0.38, o.trim, { ao: 0 });
    p.box(bx, 1.09, 0.15, 0.26, 0.26, 0.26, '#2a2f38');
    for (const sd of [-1, 1]) p.box(bx + sd * 0.12, 1.09, 0.15 + 0.12, 0.04, 0.26, 0.04, o.wall);
    p.box(bx, 1.35, 0.15, 0.34, 0.04, 0.34, o.trim, { ao: 0 });
    onion(p, bx, 1.39, 0.15, 0.2, 0.46, o.dome);
    wz(k, rng, bx, 0.5, 0.312, 0.06, 0.14, '#34404c', 0.2);
  }
}

/** A cluster of silos with a gallery and a head tower: grain elevators. Local frame; rows run along x. */
function grainElevator(k: PortKit, rng: Rng, nx: number, nz: number, r = 0.2, h = 1.4, wall: Col = '#e6e0d0'): void {
  const p = k.solid;
  const sp = r * 2.05;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) silo(p, i * sp, 0, -j * sp, r, h * (1 + 0.06 * ((i + j) % 2)), tint(wall, rng.range(-0.04, 0.04)), '#8a948f');
  }
  // the gallery along the top, the head house and tower
  const w = (nx - 1) * sp;
  p.box(w / 2, h + r * 0.55, -((nz - 1) * sp) / 2, w + r * 2, 0.1, 0.12, '#9aa39d', { ao: 0 });
  const hx = w + r * 2.4;
  p.box(hx, -0.2, -0.1, 0.5, 0.2 + h + 0.7, 0.5, '#d9d3c3');
  p.box(hx, h + 0.5, -0.1, 0.56, 0.05, 0.56, '#8a948f', { ao: 0 });
  p.box(hx, h + 0.55, -0.1, 0.34, 0.2, 0.34, '#d9d3c3');
  p.prism(hx, h + 0.75, -0.1, 0.36, 0.14, 0.36, '#7f8a86');
  for (let i = 0; i < 4; i++) wz(k, rng, hx - 0.15 + (i % 2) * 0.3, 0.2 + Math.floor(i / 2) * 0.6, 0.152, 0.07, 0.16, '#38465a', 0.15);
}

/** A tank farm: white and grey cylinders with a pipe rack. Local frame. */
function tankFarm(k: PortKit, rng: Rng, n: number, r = 0.26): void {
  const p = k.solid;
  for (let i = 0; i < n; i++) {
    const x = (i % 3) * r * 2.3;
    const z = -Math.floor(i / 3) * r * 2.4;
    const h = r * rng.range(1.0, 1.7);
    const c = ['#eeece4', '#d6d9d6', '#e8d9c4', '#dfe2e0'][i % 4];
    p.cyl(x, 0, z, r, r, h, c, { seg: 12 });
    p.cone(x, h, z, r * 1.02, r * 0.28, tint(c, -0.16), { seg: 12 });
    p.box(x + r * 0.9, 0, z + r * 0.4, 0.04, h * 0.9, 0.04, '#7a7f84', { ao: 0 });
  }
  p.box(r * 3.0, 0.08, r * 1.5, r * 6.6, 0.025, 0.04, '#6c7176', { ao: 0 });
}

// ───────────────────────────── Istanbul ─────────────────────────────

const TR_HOUSES: HouseStyle = {
  ...BS_HOUSES,
  walls: ['#f0e4cd', '#e7c9a2', '#d9a6a0', '#c9d6d0', '#f3ead9', '#e9cf9d', '#d8b79a'],
  roofs: ['#b5503a', '#a64b36', '#c0624a'],
  floors: [2, 4],
  roofKinds: [['hip', 5], ['gable', 3], ['front', 1]],
  pitch: 0.5,
  gap: [0, 0.04],
};

/** Hagia Sophia: the big lead dome on its drum between half-domes, ochre walls with cream bands, four minarets. Local frame. */
function hagiaSophia(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#dcae90';
  const band = '#f1e3c4';
  const lead = '#a6abaa';
  p.box(0, -0.35, 0, 2.0, 0.35 + 0.9, 1.7, wall);
  for (const y of [0.28, 0.58, 0.88]) p.box(0, y, 0, 2.03, 0.045, 1.73, band, { ao: 0 });
  for (const sx of [-1, 1]) {
    p.box(sx * 1.0, -0.35, 0.62, 0.34, 0.35 + 1.0, 0.52, tint(wall, -0.05));
    p.box(sx * 0.55, -0.35, 0.86, 0.26, 0.35 + 0.82, 0.3, tint(wall, -0.05));
    p.box(sx * 0.3, -0.35, 0.86, 0.1, 0.35 + 0.82, 0.3, tint(wall, 0.0));
  }
  for (let i = 0; i < 7; i++) arch(p, -0.7 + i * 0.233, 0.2, 0.852, 0.075, 0.4, '#3a3f48');
  p.cyl(0, 0.9, 0, 0.62, 0.62, 0.34, wall, { seg: 16 });
  drumWindows(p, 0, 1.0, 0, 0.626, 0.2, 9);
  dome(p, 0, 1.24, 0, 0.66, 0.5, lead, 16);
  p.cyl(0, 1.74, 0, 0.012, 0.007, 0.12, '#d9b448', { seg: 4, ao: 0 });
  dome(p, 0, 0.95, 0.74, 0.5, 0.42, lead, 12);
  dome(p, 0, 0.95, -0.74, 0.5, 0.42, lead, 12);
  for (const sx of [-1, 1]) dome(p, sx * 0.9, 0.9, 0.12, 0.34, 0.3, lead, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) minaret(k, sx * 1.42, sz * 0.92, 2.3, -0.3, '#e6d1b0', '#9ea39f');
  void rng;
}

/** The Blue Mosque: a cascade of domes and half-domes, a courtyard of small domes, six minarets. Local frame. */
function blueMosque(k: PortKit): void {
  const p = k.solid;
  const wall = '#e6dcc6';
  const dome1 = '#8ea6b9';
  p.box(0, -0.35, -0.2, 1.4, 0.35 + 0.55, 1.4, wall);
  p.cyl(0, 0.55, -0.2, 0.52, 0.52, 0.28, wall, { seg: 14 });
  drumWindows(p, 0, 0.62, -0.2, 0.524, 0.16, 8);
  dome(p, 0, 0.83, -0.2, 0.58, 0.46, dome1, 14);
  p.cyl(0, 1.28, -0.2, 0.01, 0.007, 0.14, '#d9b448', { seg: 4, ao: 0 });
  for (const [dx, dz] of [[0, 0.62], [0, -1.02], [-0.72, -0.2], [0.72, -0.2]] as Array<[number, number]>) dome(p, dx, 0.6, dz - 0.0, 0.4, 0.34, dome1, 10);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.cyl(sx * 0.62, 0.5, -0.2 + sz * 0.62, 0.16, 0.16, 0.2, wall, { seg: 8 });
    dome(p, sx * 0.62, 0.7, -0.2 + sz * 0.62, 0.19, 0.2, dome1, 8);
  }
  // the courtyard: a low arcaded wall with a row of small domes
  p.box(0, -0.3, 1.05, 1.9, 0.3 + 0.32, 0.55, wall);
  for (let i = 0; i < 6; i++) {
    const x = -0.78 + i * 0.312;
    arch(p, x, 0.0, 1.327, 0.17, 0.28, '#4a4f58');
    dome(p, x, 0.32, 1.05, 0.17, 0.14, dome1, 8);
  }
  for (const sx of [-1, 1]) {
    minaret(k, sx * 1.0, 1.2, 1.95, -0.3, '#efe6d2', '#8ea6b9');
    minaret(k, sx * 0.95, -0.95, 2.05, -0.3, '#efe6d2', '#8ea6b9');
    minaret(k, sx * 0.62, -1.0, 1.55, -0.3, '#efe6d2', '#8ea6b9');
  }
}

/** The Galata Tower: a round stone tower with a gallery under a conical cap. Local frame. */
function galataTower(k: PortKit): void {
  const p = k.solid;
  const stone = '#cdbfa2';
  p.cyl(0, -0.3, 0, 0.3, 0.26, 0.3 + 1.6, stone, { seg: 14 });
  for (const y of [0.55, 1.05]) p.cyl(0, y, 0, 0.275, 0.275, 0.03, tint(stone, -0.12), { seg: 14, ao: 0 });
  for (let i = 0; i < 5; i++) {
    p.box(0.0, 0.25 + i * 0.3, 0.263, 0.04, 0.12, 0.012, '#38352f', { ao: 0 });
    p.box(0.263, 0.4 + i * 0.3, 0.0, 0.012, 0.12, 0.04, '#38352f', { ao: 0 });
  }
  p.cyl(0, 1.6, 0, 0.4, 0.4, 0.05, '#8d7e68', { seg: 14 });
  p.cyl(0, 1.65, 0, 0.395, 0.395, 0.07, '#e4d9c0', { seg: 14, ao: 0 });
  p.cyl(0, 1.6, 0, 0.3, 0.3, 0.34, stone, { seg: 14 });
  drumWindows(p, 0, 1.68, 0, 0.305, 0.16, 8, '#2f2c27');
  p.cone(0, 1.94, 0, 0.36, 0.55, '#6f7b76', { seg: 14 });
  p.cyl(0, 2.49, 0, 0.012, 0.007, 0.2, '#d9b448', { seg: 4, ao: 0 });
}

const istanbul: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.6, range: 4.0, rise: 4.5, rough: 0.45 };
    k.palette.land = '#b6b87c';
    k.palette.hill = '#98a666';
    const g = k.vx(-17) + 0.5;
    channel(k, g, 1.35, -40, 1.7, SHORE_Z + 1, 0.16);
    // the land falls away to a valley along the strait
    k.feature((x, z, h) => (z < SHORE_Z - 4 ? h - (1 - smooth(2.5, 8, Math.abs(x - g))) * Math.max(0, h - 1.3) * 0.75 : h));
    k.bump(g - 5.2, -17.8, 3.6, 2.8, 0.7);
    k.bump(g + 4.1, -17.6, 2.1, 2.0, 1.1);
    k.plateau(g - 5.2, -18.3, 3.1, 1.7, 1.3, 0.35);
    k.plateau(g + 4.1, -17.7, 0.8, 0.8, 1.5, 0.4);
    // flat landings for the two ends of the Bosphorus bridge
    k.plateau(g - 4.4, -26.5, 1.8, 1.4, 1.35, 0.4);
    k.plateau(g + 4.4, -26.5, 1.8, 1.4, 1.35, 0.4);
    // the strait's banks are green, not crag
    k.paint((x, y, z, slope, c) => {
      if (Math.abs(x - g) < 1.35 + 2.0 && z < SHORE_Z + 0.5) c.lerp(new THREE.Color('#a9b270'), 0.85);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x1b0);
    const g = k.vx(-17) + 0.5;
    const hy = k.ground(g - 5.2, -18.3);
    placed(k, g - 6.3, hy, -18.4, 1.2, 1.9, 1.3, () => hagiaSophia(k, rng));
    placed(k, g - 3.7, hy, -18.7, 1.15, 1.5, 1.6, () => blueMosque(k));
    placed(k, g + 4.1, k.ground(g + 4.1, -17.7) - 0.02, -17.7, 1.15, 0.5, 0.5, () => galataTower(k));
    // the Galata Bridge over the Golden Horn: a low deck on piers
    const z = -13.7;
    const p = k.solid;
    p.box(g, 0.5, z, 6.6, 0.1, 0.34, '#8f8b82');
    p.box(g, 0.6, z - 0.15, 6.6, 0.1, 0.03, '#d9d4c7', { ao: 0 });
    p.box(g, 0.6, z + 0.15, 6.6, 0.1, 0.03, '#d9d4c7', { ao: 0 });
    for (let i = -3; i <= 3; i++) p.box(g + i * 1.05, -0.9, z, 0.2, 0.9 + 0.5, 0.3, '#a9a496');
    for (let i = -3; i < 3; i++) p.box(g + i * 1.05 + 0.52, 0.12, z, 0.95, 0.38, 0.22, '#7e7a70', { ao: 0 });
    k.reserve(g, z, 3.4, 0.3);
    // the Bosphorus Bridge: a suspension bridge across the strait, far back
    suspension(k, g - 4.6, g + 4.6, -26.5, [g - 2.3, g + 2.3], 2.4, { deck: 1.35, half: 0.17, color: '#e1e5e8', cable: '#d5dadf', deckColor: '#a9acaf' });
    k.reserve(g, -26.5, 4.8, 0.6);
    // ferries on the Golden Horn and in front of the shore
    boat(k, g + 0.15, -16.2, 'ferry', rng, Math.PI / 2, '#c8302a');
    boat(k, g - 0.2, -20.8, 'ferry', rng, Math.PI / 2, '#2c5da8');
    boat(k, g - 3.4, -10.5, 'ferry', rng, 0.05, '#c8302a');
    boat(k, g + 3.8, -10.8, 'sail', rng, 0, '#c8302a');
    // the city on the hills
    townFor(k, TR_HOUSES, { rows: 6, rowStep: 0.5, z: SHORE_Z - 0.9, minY: 0.22, maxSlope: 1.0, gaps: 0.04 });
  },
  mole: { armour: 'tetrapods' },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Constanta ─────────────────────────────

/** The Casino: cream Art Nouveau palace with a teal dome, wings with gables, and round corner towers. Local frame, +z the sea. */
function casino(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const cream = '#f4ecd8';
  const accent = '#e8d8b4';
  const teal = '#4f9d90';
  p.box(0, -0.2, -0.3, 1.8, 0.2 + 0.7, 0.9, cream);
  p.cyl(0, -0.2, 0.2, 0.66, 0.66, 0.2 + 0.8, cream, { seg: 16 });
  p.cyl(0, 0.62, 0.2, 0.7, 0.7, 0.05, accent, { seg: 16, ao: 0 });
  drumWindows(p, 0, 0.1, 0.2, 0.664, 0.5, 6);
  dome(p, 0, 0.67, 0.2, 0.68, 0.52, teal, 16);
  p.cyl(0, 1.19, 0.2, 0.1, 0.1, 0.12, cream, { seg: 8 });
  p.cone(0, 1.31, 0.2, 0.12, 0.2, teal, { seg: 8 });
  p.cyl(0, 1.51, 0.2, 0.007, 0.007, 0.14, '#e8c23a', { seg: 4 });
  for (const sx of [-1, 1]) {
    const x = sx * 1.25;
    p.box(x, -0.2, 0.0, 1.0, 0.2 + 0.58, 0.9, cream);
    p.box(x, 0.58, 0.0, 1.06, 0.04, 0.96, accent, { ao: 0 });
    p.prism(x, 0.62, 0.0, 1.06, 0.34, 0.96, teal);
    p.tri([x - 0.5, 0.62, 0.482], [x + 0.5, 0.62, 0.482], [x, 0.94, 0.482], cream);
    for (let i = 0; i < 3; i++) arch(p, x - 0.3 + i * 0.3, 0.08, 0.452, 0.14, 0.4, '#34404c');
    p.cyl(sx * 1.88, -0.2, 0.28, 0.17, 0.17, 0.2 + 0.95, cream, { seg: 10 });
    p.cone(sx * 1.88, 0.75, 0.28, 0.22, 0.4, teal, { seg: 10 });
    p.cyl(sx * 1.88, 1.15, 0.28, 0.006, 0.006, 0.12, '#e8c23a', { seg: 4 });
    wz(k, rng, sx * 1.88, 0.3, 0.446, 0.06, 0.2, '#34404c', 0.2);
  }
  // the white balustrade of the terrace
  p.box(0, 0.0, 0.98, 3.6, 0.05, 0.05, '#f4ecd8', { ao: 0 });
  for (let i = 0; i < 14; i++) p.box(-1.7 + i * 0.262, -0.18, 0.98, 0.04, 0.19, 0.04, '#f4ecd8', { ao: 0 });
}

const constanta: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 0.7, range: 2.2, rise: 6, rough: 0.25 };
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xc0457a);
    const R = k.mole.dir;
    const cx = k.vx(-12.4) + R * 1.3;
    const p = k.solid;
    // the casino stands on a stone terrace that reaches out over the water
    const ty = 0.9;
    p.box(cx, -0.9, -12.1, 4.3, 0.9 + ty, 1.6, '#cdc5ae');
    p.box(cx, ty, -12.1, 4.38, 0.04, 1.68, '#e2dbc6', { ao: 0 });
    for (let i = 0; i < 11; i++) arch(p, cx - 1.9 + i * 0.38, 0.05, -11.296, 0.2, 0.6, '#4b4a40');
    p.box(cx, 0.0, -11.3, 4.3, 0.06, 0.04, '#aaa28c', { ao: 0 });
    k.reserve(cx, -12.1, 2.3, 0.9);
    placed(k, cx, ty + 0.04, -12.45, 1.0, 2.2, 0.8, () => casino(k, rng));
    // the Carol I mosque and a church on the other side, the port on the far side
    mosque(k, cx - R * 4.6, -14.2, 0.85, { wall: '#efe9d9', dome: '#7e9d8e' });
    placed(k, cx - R * 7.0, LAND_Y, -14.4, 0.9, 1.5, 1.0, () => orthodoxChurch(k, rng, { wall: '#f2ebd6', trim: '#d9c9a0', dome: '#5f9a8c', tower: 1, roof: '#a64b36' }));
    for (let i = 0; i < 3; i++) gantryCrane(k, cx + R * (5.2 + i * 1.4), SHORE_Z - 0.75, { color: i % 2 ? '#2c5da8' : '#c9402e', s: 0.82, y: LAND_Y });
    placed(k, cx + R * 9.2, LAND_Y, -13.6, 1.0, 1.7, 0.9, () => grainElevator(k, rng, 4, 2, 0.17, 1.1));
    containerStack(k, cx + R * 5.0 - (R > 0 ? 0 : 0.9), SHORE_Z - 1.7, 4, 2, 3, rng);
  },
  mole: { light: { h: 1.55, r0: 0.21, r1: 0.18, bands: [['#e6dcc2', 1]], gallery: '#5b4a3a', cap: '#5b4a3a', seg: 8 } },
  quiet: true,
};

// ───────────────────────────── Varna ─────────────────────────────

const varna: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.2, range: 2.8, rise: 5, rough: 0.3 };
    k.bump(k.vx(-17.2), -17.2, 3.8, 2.8, 0.7);
    k.plateau(k.vx(-17.2), -17.4, 2.0, 1.4, 1.1, 0.4);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xa7a);
    const R = k.mole.dir;
    const cx = k.vx(-17.4) + R * 0.4;
    const y = k.ground(cx, -17.4);
    // the Cathedral of the Assumption: cream, with five gilded domes and a bell tower
    placed(k, cx, y, -17.4, 1.35, 1.9, 0.9, () => orthodoxChurch(k, rng, { wall: '#f3ecd8', trim: '#c76b4a', dome: '#e6b92e', tower: (R > 0 ? -1 : 1) as -1 | 1, roof: '#b5563f' }));
    // the Sea Garden: a belt of plane trees and acacias along the front
    parkTrees(k, rng, k.vx(-13.2) - 9, k.vx(-13.2) + 9, SHORE_Z - 0.6, SHORE_Z - 2.6, 56, undefined, 0.3);
    for (let i = 0; i < 3; i++) gantryCrane(k, cx - R * (6.6 + i * 1.4), SHORE_Z - 0.75, { color: i % 2 ? '#c9402e' : '#2c8aa5', s: 0.82, y: LAND_Y });
    containerStack(k, cx - R * 8.0 - (R > 0 ? 0 : 0.9), SHORE_Z - 1.7, 5, 2, 3, rng);
    placed(k, cx + R * 7.2, LAND_Y, -13.8, 1.0, 1.7, 0.9, () => grainElevator(k, rng, 5, 2, 0.17, 1.1));
    boat(k, cx + R * 3.0, -10.7, 'ferry', rng, 0, '#2c5da8');
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── Burgas ─────────────────────────────

const burgas: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 0.8, range: 2.0, rise: 6, rough: 0.25 };
    k.bump(k.vx(-17), -16.6, 3.6, 2.5, 0.5);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xb0e6);
    const R = k.mole.dir;
    const cx = k.vx(-16.4) + R * 0.6;
    const y = k.ground(cx, -16.4);
    // the cathedral of Saints Cyril and Methodius: white, with green domes and a tall bell tower
    placed(k, cx, y, -16.4, 1.3, 1.9, 0.9, () => orthodoxChurch(k, rng, { wall: '#f7f3e6', trim: '#b9c9b5', dome: '#5d9a84', tower: (R > 0 ? 1 : -1) as -1 | 1, roof: '#4f7a66' }));
    // the Sea Garden and the long pier with its lamps and round pavilion
    parkTrees(k, rng, k.vx(-13.4) - 9, k.vx(-13.4) + 9, SHORE_Z - 0.6, SHORE_Z - 2.6, 50, undefined, 0.3);
    const px = cx - R * 2.9;
    const p = k.solid;
    p.box(px, 0.44, -10.8, 0.4, 0.05, 2.9, '#d9d2c0');
    for (let i = 0; i < 7; i++) {
      for (const sd of [-1, 1]) p.cyl(px + sd * 0.16, -0.9, -12.1 + i * 0.45, 0.028, 0.028, 0.9 + 0.44, '#7a6f60', { seg: 5 });
    }
    for (let i = 0; i < 5; i++) {
      p.cyl(px + 0.17, 0.49, -12.0 + i * 0.6, 0.008, 0.008, 0.22, '#2d3138', { seg: 4 });
      k.glow.ball(px + 0.17, 0.72, -12.0 + i * 0.6, 0.025, '#fff0b0');
    }
    p.cyl(px, 0.44, -9.5, 0.36, 0.36, 0.05, '#d9d2c0', { seg: 12 });
    p.cyl(px, 0.49, -9.5, 0.24, 0.24, 0.24, '#f6f2e6', { seg: 12 });
    k.glass.cyl(px, 0.55, -9.5, 0.245, 0.245, 0.1, '#7fa4b4', { seg: 12 });
    p.cone(px, 0.73, -9.5, 0.34, 0.2, '#b5563f', { seg: 12 });
    k.reserve(px, -11.0, 0.5, 2.0);
    // the port: cranes, tanks and the refinery stack on the far side
    for (let i = 0; i < 2; i++) gantryCrane(k, cx + R * (5.6 + i * 1.5), SHORE_Z - 0.75, { color: i ? '#2c5da8' : '#c9402e', s: 0.82, y: LAND_Y });
    placed(k, cx + R * 8.6, LAND_Y, -13.9, 1.0, 1.4, 1.0, () => tankFarm(k, rng, 6));
    stack(k, cx + R * 11.4, -15.5, 2.2, 0.1, k.ground(cx + R * 11.4, -15.5) - 0.02);
    boat(k, cx - R * 5.5, -10.6, 'sail', rng, 0, '#c8302a');
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── the Danube and the Ukrainian terminals ─────────────────────────────

/** A flat riverbank: green, low, a grassy dike at the water. */
function riverbank(k: PortKit, tone: 'green' | 'dry' = 'green'): void {
  k.shore = 'dike';
  k.shape = { relief: 0.1, range: 0.45, rise: 12, rough: 0.12, freq: 0.06 };
  k.palette.land = tone === 'green' ? '#a9b872' : '#bfbb80';
  k.palette.land2 = tone === 'green' ? '#b3bd78' : '#b8b97a';
  k.palette.hill = '#9eb06c';
  k.palette.sand = '#d8cfa4';
}

/** A slipway on the bank: a concrete apron, a ramp into the water and a hull under construction on it. Hull length runs along z. */
function slipway(k: PortKit, rng: Rng, x: number, hull: Col, stage: 0 | 1 | 2 = 1): void {
  const p = k.solid;
  const zA = -14.7;
  const zB = -12.25;
  p.box(x, LAND_Y - 0.2, (zA + zB) / 2, 1.1, 0.26, zB - zA, '#aaa699');
  p.quad([x - 0.55, -0.4, -11.4], [x + 0.55, -0.4, -11.4], [x + 0.55, LAND_Y + 0.06, zB], [x - 0.55, LAND_Y + 0.06, zB], '#a39f92');
  if (stage === 0) {
    // keel blocks and a bottom of plating only
    for (let i = 0; i < 7; i++) p.box(x, LAND_Y + 0.06, zA + 0.3 + i * 0.35, 0.3, 0.06, 0.1, '#6d4a34');
    p.box(x, LAND_Y + 0.12, (zA + zB) / 2, 0.64, 0.05, 2.1, tint(hull, -0.1));
  } else {
    const y0 = LAND_Y + 0.08;
    const h = stage === 2 ? 0.62 : 0.4;
    p.box(x, y0, -13.5, 0.72, h, 2.2, hull, { ao: 0.12 });
    // the raked bow toward the water
    p.solid([[x - 0.36, y0, -12.4], [x + 0.36, y0, -12.4], [x + 0.36, y0 + h, -12.4], [x - 0.36, y0 + h, -12.4], [x, y0 + h, -11.85], [x, y0 + 0.1, -11.95]], [[0, 1, 5], [1, 2, 4, 5], [0, 3, 4, 5], [3, 2, 4]], hull);
    p.box(x, y0 + h, -13.5, 0.7, 0.02, 2.2, '#7b6f60', { ao: 0 });
    if (stage === 2) {
      p.box(x, y0 + h, -14.2, 0.6, 0.3, 0.7, '#d9d4c7');
      p.box(x, y0 + h + 0.3, -14.2, 0.66, 0.025, 0.76, '#a8402f', { ao: 0 });
    }
    // scaffolding along both sides
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 6; i++) p.box(x + sd * 0.5, y0, -14.5 + i * 0.4, 0.025, h + 0.34, 0.025, '#7a6f60', { ao: 0 });
      p.box(x + sd * 0.5, y0 + h + 0.2, -13.5, 0.025, 0.025, 2.1, '#7a6f60', { ao: 0 });
      p.box(x + sd * 0.5, y0 + h * 0.5, -13.5, 0.025, 0.025, 2.1, '#7a6f60', { ao: 0 });
    }
  }
  void rng;
  k.reserve(x, -13.2, 0.7, 1.7);
}

/** A Goliath crane straddling the slipways: two portal frames, a long girder, a trolley and a cab. */
function goliath(k: PortKit, x0: number, x1: number, z: number, h: number, color: Col = '#c9402e'): void {
  const p = k.solid;
  for (const x of [x0, x1]) {
    for (const sz of [-1, 1]) {
      p.box(x, LAND_Y - 0.1, z + sz * 0.3, 0.1, h + 0.1, 0.1, color);
      p.box(x, LAND_Y - 0.1, z + sz * 0.3, 0.2, 0.08, 0.3, '#3d4046');
    }
    p.box(x, LAND_Y + h - 0.12, z, 0.12, 0.12, 0.72, color);
    p.rod([x, LAND_Y + 0.1, z - 0.3], [x, LAND_Y + h - 0.1, z + 0.3], 0.012, color, 4);
    p.rod([x, LAND_Y + 0.1, z + 0.3], [x, LAND_Y + h - 0.1, z - 0.3], 0.012, color, 4);
  }
  const gx = (x0 + x1) / 2;
  p.box(gx, LAND_Y + h, z, x1 - x0 + 1.0, 0.2, 0.34, '#f1efe7');
  p.box(gx, LAND_Y + h + 0.2, z, x1 - x0 + 1.0, 0.04, 0.38, color, { ao: 0 });
  p.box(gx - 0.2, LAND_Y + h + 0.2, z, 0.4, 0.26, 0.4, color);
  p.box(gx - 0.2, LAND_Y + h + 0.46, z, 0.44, 0.03, 0.44, '#3d4046', { ao: 0 });
  p.box(x1 + 0.35, LAND_Y + h - 0.3, z + 0.2, 0.22, 0.3, 0.22, '#f1efe7');
  p.rod([gx - 0.2, LAND_Y + h, z], [gx - 0.2, LAND_Y + 0.7, z], 0.008, '#2d3138', 3);
  p.box(gx - 0.2, LAND_Y + 0.62, z, 0.12, 0.1, 0.1, '#e9a31a');
  k.reserve(gx, z, (x1 - x0) / 2 + 0.7, 0.6);
}

/** A steelworks: a long hall, a blast furnace with hot stoves and pipes, tall stacks with steam. Local frame. */
function steelworks(k: PortKit, rng: Rng): void {
  const p = k.solid;
  p.box(0, -0.2, 0, 2.5, 0.2 + 0.62, 0.9, '#a9aeb0');
  p.prism(0, 0.62, 0, 0.94, 0.2, 2.56, '#7a8186', { ry: Math.PI / 2 });
  for (let i = 0; i < 10; i++) wz(k, rng, -1.05 + i * 0.234, 0.28, 0.452, 0.12, 0.16, '#3a4650', 0.3);
  p.box(1.45, -0.2, -0.2, 0.7, 0.2 + 0.5, 0.7, '#8e9396');
  // the furnace and its stoves
  p.cyl(-0.9, -0.2, -0.8, 0.34, 0.34, 0.2 + 0.5, '#8a5a44', { seg: 12 });
  p.cyl(-0.9, 0.3, -0.8, 0.34, 0.2, 0.6, '#9a6650', { seg: 12 });
  p.cyl(-0.9, 0.9, -0.8, 0.2, 0.2, 0.5, '#7a4e3c', { seg: 12 });
  for (let i = 0; i < 3; i++) {
    p.cyl(-0.2 + i * 0.4, -0.2, -0.85, 0.16, 0.16, 0.2 + 1.2, '#b5aca2', { seg: 10 });
    p.ball(-0.2 + i * 0.4, 1.0, -0.85, 0.16, '#a39a90', { sy: 0.6 });
  }
  p.rod([-0.9, 1.2, -0.8], [-0.2, 1.2, -0.85], 0.03, '#6d5240', 5);
  p.rod([-0.9, 1.0, -0.8], [0.6, 1.2, -0.85], 0.03, '#6d5240', 5);
  p.rod([-0.9, 1.4, -0.8], [-0.3, 0.2, -0.3], 0.018, '#59606a', 4);
  // the stacks and their plumes
  for (const [x, z, h] of [[0.7, -0.75, 2.3], [1.1, -0.9, 2.0], [-1.6, -0.5, 1.7]] as Array<[number, number, number]>) {
    p.cyl(x, -0.2, z, 0.13, 0.08, h, '#c9c2b6', { seg: 10 });
    p.cyl(x, h - 0.5, z, 0.11, 0.1, 0.07, '#c8302a', { seg: 10, ao: 0 });
    p.cyl(x, h - 0.3, z, 0.1, 0.09, 0.07, '#c8302a', { seg: 10, ao: 0 });
    for (let i = 0; i < 3; i++) p.blob(x + 0.08 + i * 0.12, h - 0.2 + i * 0.12, z, 0.1 + i * 0.03, '#f1f2f1', { sy: 0.8 });
  }
}

/** An Orthodox church village on a flat bank: used as the background town of the Danube ports. */
function bankTown(k: PortKit, rows = 3): void {
  townFor(k, BS_HOUSES, { rows, rowStep: 0.6, z: SHORE_Z - 2.2, minY: 0.22, maxSlope: 0.6, gaps: 0.1 });
}

const galati: Landmark = {
  terrain(k) {
    riverbank(k);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x6a1a71);
    const c = k.vx(-13.6);
    // the shipyard: two slipways under one Goliath crane
    slipway(k, rng, c + 1.7, '#8d4f3d', 2);
    slipway(k, rng, c + 3.5, '#6b7a88', 1);
    goliath(k, c + 0.9, c + 4.3, -13.4, 2.2);
    // the steelworks to the left, with its smoke
    placed(k, c - 3.9, LAND_Y, -15.3, 1.0, 1.7, 1.2, () => steelworks(k, rng));
    // a church with silver-blue domes, and the town behind
    placed(k, c - 0.9, LAND_Y, -16.0, 1.0, 1.0, 0.8, () => orthodoxChurch(k, rng, { wall: '#f0e9d6', trim: '#c9d4de', dome: '#8aa6c4', tower: 1, roof: '#7b8a96' }));
    bankTown(k, 3);
    for (let i = 0; i < 3; i++) barge(k, c - 3 + i * 3.1 + (i % 2) * 0.6, -10.4 + (i % 2) * 0.5, 1.5, ['#2f3a44', '#7a3b2e', '#3b5a48'][i], ['#6b5a46', '#8d8a7b', '#a9a17c'][i]);
    reeds(k, rng, c - 9, c + 9, SHORE_Z + 0.1, 40);
  },
  mole: 'none',
  flag: { dx: 5.4, z: -13.6 },
  rows: 0,
  quiet: true,
};

const reni: Landmark = {
  terrain(k) {
    riverbank(k, 'dry');
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x7e41);
    const c = k.vx(-14);
    // the grain elevator: two rows of silos, the head house and a gallery to the jetty
    placed(k, c - 1.5, LAND_Y, -14.0, 1.15, 2.4, 1.0, () => grainElevator(k, rng, 6, 2, 0.2, 1.5));
    const p = k.solid;
    p.box(c + 2.4, -0.9, -11.6, 0.4, 0.9 + 0.45, 1.5, '#a9a496');
    p.box(c + 2.4, 0.45, -11.6, 0.44, 0.04, 1.56, '#d2cbb9', { ao: 0 });
    p.rod([c + 1.0, 1.75, -14.3], [c + 2.4, 0.62, -11.7], 0.05, '#9aa39d', 5);
    p.box(c + 2.4, 0.48, -11.7, 0.14, 0.16, 0.14, '#9aa39d');
    barge(k, c + 3.4, -11.1, 1.7, '#2f3a44', '#d8c27a');
    barge(k, c + 5.4, -10.4, 1.5, '#7a3b2e', '#8d8a7b');
    k.reserve(c + 2.4, -11.6, 0.4, 0.9);
    bankTown(k, 3);
    placed(k, c + 5.8, LAND_Y, -15.2, 0.85, 1.2, 0.8, () => orthodoxChurch(k, rng, { wall: '#f0e9d6', trim: '#d6c9a0', dome: '#4f86b8', tower: -1, roof: '#7b6f66' }));
    reeds(k, rng, c - 10, c + 10, SHORE_Z + 0.1, 70, 0.5);
  },
  mole: 'none',
  flag: { dx: -5.2, z: -13.6 },
  rows: 0,
  quiet: true,
};

/** Izmail's fortress: a long bastioned rampart of grassed earth with a brick parapet, a gate tower, a church inside. */
function fortress(k: PortKit, rng: Rng, x: number, z: number, len: number): void {
  const p = k.solid;
  const earth = '#8fa75e';
  const brick = '#c4875f';
  const gy = LAND_Y;
  // the curtain: a brick wall facing the river on an earth rampart, merlons along the top
  p.prism(x, gy - 0.1, z - 0.2, 1.1, 0.74, len, earth, { ry: Math.PI / 2 });
  p.box(x, gy - 0.2, z + 0.24, len, 0.2 + 0.62, 0.18, brick);
  p.box(x, gy + 0.42, z + 0.24, len + 0.02, 0.05, 0.22, tint(brick, 0.16), { ao: 0 });
  for (let i = 0; i < Math.floor(len / 0.2); i += 2) p.box(x - len / 2 + 0.1 + i * 0.2, gy + 0.47, z + 0.3, 0.12, 0.1, 0.07, tint(brick, 0.1), { ao: 0 });
  // the bastions: brick-faced drums with earth tops
  for (let i = 0; i < 3; i++) {
    const bx = x - len / 2 + 0.8 + (i * (len - 1.6)) / 2;
    p.cyl(bx, gy - 0.2, z + 0.4, 0.66, 0.6, 0.2 + 0.7, brick, { seg: 6 });
    p.cyl(bx, gy + 0.5, z + 0.4, 0.62, 0.62, 0.05, tint(brick, 0.16), { seg: 6, ao: 0 });
    p.cyl(bx, gy + 0.55, z + 0.4, 0.55, 0.5, 0.08, earth, { seg: 6 });
    p.cyl(bx, gy + 0.63, z + 0.4, 0.5, 0.0, 0.12, tint(earth, 0.06), { seg: 6 });
  }
  // the gate: a brick tower with a dark arch and a hipped roof
  const tx = x + 0.1;
  p.box(tx, gy - 0.2, z + 0.5, 0.7, 0.2 + 1.1, 0.5, tint(brick, 0.04));
  arch(p, tx, gy, z + 0.752, 0.26, 0.56, '#3f3329');
  p.box(tx, gy + 0.9, z + 0.5, 0.78, 0.05, 0.58, tint(brick, 0.18), { ao: 0 });
  p.pyramid(tx, gy + 0.95, z + 0.5, 0.8, 0.45, 0.62, '#8f5a44');
  wz(k, rng, tx, gy + 0.72, z + 0.752, 0.08, 0.16, '#34404c', 0.2);
  k.reserve(x, z, len / 2 + 0.2, 0.9);
}

const izmail: Landmark = {
  terrain(k) {
    riverbank(k);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x12a);
    const c = k.vx(-14);
    fortress(k, rng, c - 0.2, -14.4, 7.2);
    placed(k, c - 1.0, LAND_Y, -16.7, 1.0, 1.0, 0.8, () => orthodoxChurch(k, rng, { wall: '#f6f1e2', trim: '#4f86b8', dome: '#4f86b8', tower: 1, roof: '#7b6f66' }));
    bankTown(k, 3);
    reeds(k, rng, c - 11, c + 11, SHORE_Z + 0.2, 60, 0.7);
    // islets of the delta in front of the bank: low mud banks on the sea floor, thick with reeds and a willow
    for (const [dx, dz, r] of [[-5.5, -10.6, 0.7], [-0.8, -10.3, 0.55], [4.6, -10.7, 0.8], [8.2, -10.4, 0.5]] as Array<[number, number, number]>) {
      const x = c + dx;
      k.solid.rock(x, -0.28, dz, r, '#a39b6c', { sy: 0.32, ry: dx });
      k.solid.rock(x + r * 0.5, -0.28, dz + 0.05, r * 0.6, '#8fa05e', { sy: 0.4, ry: dx + 1 });
      for (let i = 0; i < 9; i++) {
        const rx = x + rng.range(-r, r);
        const rz = dz + rng.range(-r * 0.4, r * 0.4);
        const h = rng.range(0.25, 0.45);
        k.solid.cyl(rx, -0.02, rz, 0.013, 0.0, h, rng.chance(0.5) ? '#b9aa6a' : '#9fae5e', { seg: 3, open: true, rx: rng.range(-0.2, 0.2), rz: rng.range(-0.2, 0.2), ao: 0.1 });
      }
      if (r > 0.6) tree(k, 'round', x - r * 0.3, dz, 0.9, rng, -0.04);
    }
    barge(k, c + 3.4, -11.3, 1.5, '#2f3a44', '#8d8a7b');
    boat(k, c - 4.2, -11.0, 'fishing', rng, 0.1, '#2c5da8');
  },
  mole: 'none',
  flag: { dx: 5.0, z: -13.6 },
  rows: 0,
  quiet: true,
};

const chornomorsk: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 0.4, range: 1.2, rise: 8, rough: 0.2 };
    k.palette.land = '#c4bd80';
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xc40);
    const R = k.mole.dir;
    const c = k.vx(-13) + R * 0.5;
    // a row of big container cranes, the stacks behind them, a container ship alongside
    for (let i = 0; i < 5; i++) gantryCrane(k, c - R * (3.2 - i * 1.55), SHORE_Z - 0.75, { color: i % 2 ? '#2c5da8' : '#e9eef2', s: 1.0, y: LAND_Y, boom: 2.1 });
    containerStack(k, c - R * 3.8 - (R > 0 ? 0 : 5.0), SHORE_Z - 1.9, 12, 3, 3, rng);
    containerStack(k, c - R * 3.8 - (R > 0 ? 0 : 5.0), SHORE_Z - 3.0, 12, 2, 4, rng);
    cargoShip(k, rng, c - R * 0.4, -10.55, 3.8, { hull: '#2c3a57', kind: 'container', stripe: '#e9a31a' });
    // the grain silos
    placed(k, c + R * 7.0 - (R > 0 ? 0 : 3.2), LAND_Y, -14.2, 1.1, 2.2, 1.0, () => grainElevator(k, rng, 6, 2, 0.19, 1.45));
  },
  rows: 3,
  quiet: true,
};

const pivdennyi: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 0.4, range: 1.2, rise: 8, rough: 0.2 };
    k.palette.land = '#c1bc82';
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xd17a);
    const R = k.mole.dir;
    const c = k.vx(-13.4) + R * 0.4;
    const p = k.solid;
    // the grain terminal: two elevators
    placed(k, c - R * 5.4 - (R > 0 ? 0 : 3.0), LAND_Y, -14.0, 1.1, 2.0, 1.0, () => grainElevator(k, rng, 5, 2, 0.2, 1.5));
    placed(k, c - R * 5.4 - (R > 0 ? 0 : 3.0), LAND_Y, -16.6, 1.1, 2.0, 1.0, () => grainElevator(k, rng, 5, 2, 0.2, 1.7, '#dcd6c6'));
    // the chemical terminal: tank farms, a pipe rack, white gas spheres and a flare
    placed(k, c + R * 0.9 - (R > 0 ? 0 : 1.6), LAND_Y, -13.8, 1.0, 1.6, 1.0, () => tankFarm(k, rng, 9, 0.27));
    for (let i = 0; i < 2; i++) {
      const sx = c + R * (4.9 + i * 1.0);
      p.cyl(sx, LAND_Y - 0.1, -14.2, 0.04, 0.04, 0.34, '#7a7f84', { seg: 5 });
      p.ball(sx, LAND_Y + 0.62, -14.2, 0.3, '#ecece6');
      k.reserve(sx, -14.2, 0.4, 0.4);
    }
    p.cyl(c + R * 3.5, LAND_Y - 0.1, -15.4, 0.035, 0.03, 2.3, '#8a8f94', { seg: 5 });
    k.glow.cone(c + R * 3.5, LAND_Y + 2.1, -15.4, 0.06, 0.2, '#ffb347', { seg: 5 });
    k.reserve(c + R * 3.5, -15.4, 0.2, 0.2);
    p.box(c + R * 2.4, LAND_Y + 0.3, SHORE_Z - 0.5, 4.6, 0.05, 0.07, '#7a7f84', { ao: 0 });
    for (let i = 0; i < 8; i++) p.box(c + R * 2.4 - 2.2 + i * 0.64, LAND_Y - 0.1, SHORE_Z - 0.5, 0.05, 0.4, 0.05, '#7a7f84', { ao: 0 });
    // a tanker and a bulker alongside
    cargoShip(k, rng, c + R * 1.0, -10.6, 3.4, { hull: '#6a3a30', kind: 'tanker', stripe: '#2c5da8' });
    cargoShip(k, rng, c - R * 4.5, -10.4, 3.0, { hull: '#2f4a3a', kind: 'bulk', stripe: '#c8302a' });
  },
  rows: 2,
  quiet: true,
};

const mykolaiv: Landmark = {
  terrain(k) {
    riverbank(k);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x3b0);
    const c = k.vx(-13.8);
    // the Black Sea shipyard: three slipways in different stages under a huge Goliath crane
    slipway(k, rng, c - 1.2, '#7d8c99', 1);
    slipway(k, rng, c + 0.9, '#9b4a36', 2);
    slipway(k, rng, c + 3.0, '#6b7a88', 0);
    goliath(k, c - 1.8, c + 3.6, -13.6, 2.7, '#2c5da8');
    gantryCrane(k, c + 6.2, SHORE_Z - 0.75, { color: '#c9402e', s: 1.0, y: LAND_Y, boom: 2.0 });
    factoryHall(k, c - 4.6, -14.6);
    factoryHall(k, c + 8.6, -14.8);
    bankTown(k, 3);
    barge(k, c - 4.0, -10.6, 1.7, '#2f3a44', '#8d8a7b');
    barge(k, c + 6.0, -10.2, 1.5, '#7a3b2e', '#a9a17c');
    reeds(k, rng, c - 10, c + 10, SHORE_Z + 0.1, 30);
  },
  mole: 'none',
  flag: { dx: -5.6, z: -13.6 },
  rows: 0,
  quiet: true,
};

/** A shipyard hall: a long shed with a gable roof, a door and a row of windows. */
function factoryHall(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.9, 0.4);
  p.box(x, y - 0.2, z, 1.8, 0.2 + 0.55, 0.8, '#b9b6a8');
  p.prism(x, y + 0.55, z, 0.84, 0.22, 1.84, '#7f8a92', { ry: Math.PI / 2 });
  p.box(x - 0.45, y, z + 0.402, 0.5, 0.42, 0.01, '#5b6670', { ao: 0 });
  for (let i = 0; i < 5; i++) p.box(x + 0.05 + i * 0.16, y + 0.28, z + 0.402, 0.09, 0.12, 0.01, '#3a4650', { ao: 0 });
  k.reserve(x, z, 0.95, 0.45);
}

// ───────────────────────────── Samsun ─────────────────────────────

/** The steamer Bandirma: black hull, white deckhouse and bridge, a tall funnel, two masts. Local frame, bow toward +x, y = 0 the water. */
function bandirma(k: PortKit): void {
  const p = k.solid;
  const L = 1.5;
  p.box(0, -0.15, 0, L, 0.32, 0.36, '#202327', { ao: 0.1 });
  p.solid([[L / 2, -0.15, -0.18], [L / 2, -0.15, 0.18], [L / 2, 0.17, 0.18], [L / 2, 0.17, -0.18], [L / 2 + 0.28, 0.17, 0], [L / 2 + 0.2, -0.15, 0]], [[1, 5, 4, 2], [0, 5, 4, 3], [3, 2, 4], [0, 1, 5]], '#202327');
  p.box(0, 0.17, 0, L, 0.025, 0.37, '#f2eee4', { ao: 0 });
  p.box(0.0, -0.05, 0, L + 0.002, 0.07, 0.364, '#8f2f26', { ao: 0 });
  p.box(-0.12, 0.2, 0, 0.55, 0.2, 0.28, '#f2eee4');
  p.box(-0.12, 0.4, 0, 0.58, 0.025, 0.31, '#7a5a3c', { ao: 0 });
  p.box(-0.05, 0.42, 0, 0.3, 0.16, 0.24, '#f2eee4');
  p.box(-0.05, 0.58, 0, 0.34, 0.025, 0.27, '#7a5a3c', { ao: 0 });
  for (let i = 0; i < 4; i++) p.box(-0.28 + i * 0.15, 0.25, 0.141, 0.07, 0.09, 0.008, '#2e3a46', { ao: 0 });
  p.cyl(-0.34, 0.2, 0, 0.075, 0.06, 0.52, '#202327', { seg: 8 });
  p.cyl(-0.34, 0.6, 0, 0.066, 0.064, 0.05, '#c8302a', { seg: 8, ao: 0 });
  for (const [mx, mh] of [[0.46, 0.82], [-0.66, 0.74]] as Array<[number, number]>) {
    p.cyl(mx, 0.19, 0, 0.016, 0.011, mh, '#7a5a3c', { seg: 5 });
    p.rod([mx, 0.19 + mh * 0.62, -0.13], [mx, 0.19 + mh * 0.62, 0.13], 0.008, '#7a5a3c', 4);
  }
  p.rod([0.46, 0.95, 0], [L / 2 + 0.2, 0.19, 0], 0.004, '#3a3a3a', 3);
  p.rod([0.46, 0.95, 0], [-0.34, 0.6, 0], 0.004, '#3a3a3a', 3);
  p.rod([-0.66, 0.88, 0], [-L / 2 + 0.02, 0.19, 0], 0.004, '#3a3a3a', 3);
  for (const sz of [-1, 1]) p.box(0.15, 0.2, sz * 0.12, 0.2, 0.06, 0.07, '#e9e2d0');
  p.cyl(-L / 2 + 0.02, 0.19, 0, 0.006, 0.006, 0.3, '#5a4a3a', { seg: 4 });
  p.quad([-L / 2 + 0.02, 0.38, 0], [-L / 2 + 0.02, 0.3, 0], [-L / 2 - 0.12, 0.3, 0.02], [-L / 2 - 0.12, 0.38, 0.02], '#d62f2b', true);
}

const samsun: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 2.6, range: 6.2, rise: 2.4, rough: 0.6, freq: 0.1 };
    k.palette.land = '#97ae66';
    k.palette.land2 = '#8da85f';
    k.palette.hill = '#5f8c4e';
    k.palette.rock = '#8f9387';
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x5a45);
    const R = k.mole.dir;
    const c = k.vx(-15);
    townFor(k, TR_HOUSES, { rows: 7, rowStep: 0.5, z: SHORE_Z - 1.0, minY: 0.22, maxSlope: 1.3, gaps: 0.05, rowRise: 0.1 });
    // the mosques on the slopes, each with its own dome colour
    mosque(k, c - R * 3.0, -15.6, 1.35, { wall: '#f0e9d6', dome: '#76909c' });
    mosque(k, c + R * 2.8, -17.4, 1.5, { wall: '#efe7d2', dome: '#5f9a8c' });
    mosque(k, c - R * 7.6, -16.6, 1.15, { wall: '#f1ead7', dome: '#8a9aa6' });
    // the steamer museum ship moored at the quay
    k.at(c + R * 0.2, 0, -10.95, R > 0 ? 0 : Math.PI, 1.45, () => bandirma(k));
    k.reserve(c + R * 0.2, -10.95, 1.2, 0.4);
    for (let i = 0; i < 2; i++) gantryCrane(k, c + R * (6.4 + i * 1.5), SHORE_Z - 0.75, { color: i ? '#2c5da8' : '#c9402e', s: 0.82, y: LAND_Y });
    containerStack(k, c + R * 5.5 - (R > 0 ? 0 : 0.9), SHORE_Z - 1.7, 4, 2, 3, rng);
    parkTrees(k, rng, c - 9, c + 9, SHORE_Z - 1.6, SHORE_Z - 5.0, 34, undefined, 0.5);
  },
  quiet: true,
};

// ───────────────────────────── Batumi ─────────────────────────────

/** The Alphabet Tower: a double helix of letters round a core, with a glass pod at the top. Local frame. */
function alphabetTower(k: PortKit): void {
  const p = k.solid;
  const H = 3.8;
  p.cyl(0, -0.3, 0, 0.34, 0.34, 0.3 + 0.12, '#d4cfc4', { seg: 12 });
  p.cyl(0, 0.12, 0, 0.12, 0.07, H - 0.12, '#e6ecef', { seg: 8 });
  const N = 36;
  const pts: V3[][] = [[], []];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * Math.PI * 7 + s * Math.PI;
      const r = lerp(0.24, 0.16, t);
      pts[s].push([Math.cos(a) * r, 0.14 + t * (H - 0.4), Math.sin(a) * r]);
    }
    for (let i = 0; i < N; i++) p.rod(pts[s][i], pts[s][i + 1], 0.03, s ? '#f4f6f7' : '#cfd9df', 4);
  }
  for (let i = 1; i < N; i += 3) p.rod(pts[0][i], pts[1][i], 0.008, '#c9d1d6', 3);
  p.cyl(0, H - 0.26, 0, 0.2, 0.18, 0.06, '#e9eef0', { seg: 10 });
  k.glass.ball(0, H - 0.02, 0, 0.27, '#8fb8cc', { sy: 0.9 });
  p.cyl(0, H + 0.2, 0, 0.012, 0.007, 0.5, '#e9eef0', { seg: 4 });
}

/** Ali and Nino: two steel figures of stacked plates that walk toward each other. Local frame, facing +x / -x. */
function aliNino(k: PortKit): void {
  const p = k.solid;
  const profile = [0.1, 0.17, 0.22, 0.2, 0.24, 0.2, 0.15, 0.1];
  for (const [s, c] of [[-1, '#b5642f'], [1, '#c8793a']] as Array<[number, string]>) {
    profile.forEach((w, i) => p.box(s * 0.45 + s * (i % 2 ? 0.02 : -0.02), i * 0.17, 0, 0.045, 0.16, w * 1.2, c, { ao: 0.05, ry: s * 0.18 }));
    p.ball(s * 0.45, 1.46, 0, 0.1, c, { sy: 1.1 });
  }
  p.box(0, -0.1, 0, 1.5, 0.1, 0.4, '#bfb9a8');
}

const batumi: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape = { ...k.shape, relief: 2.0, range: 8.5, rise: 7.5, rough: 0.6, freq: 0.1 };
    k.palette.land = '#8fae66';
    k.palette.land2 = '#86a75f';
    k.palette.hill = '#4f8048';
    k.palette.rock = '#868a80';
    k.palette.sand = '#bdb7a6';
    k.palette.haze = '#d2e3e6';
    // the mountains are green to the top
    k.paint((x, y, z, slope, c) => {
      if (y < 5) c.lerp(new THREE.Color('#6f9b52'), 0.55 * (1 - smooth(1.5, 5, y)) + 0.25);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0xba7);
    const R = k.mole.dir;
    const c = k.vx(-14.5);
    placed(k, c + R * 2.9, LAND_Y, -14.6, 1.6, 0.6, 0.6, () => alphabetTower(k));
    placed(k, c + R * 0.2, LAND_Y, SHORE_Z - 0.55, 1.5, 1.0, 0.4, () => aliNino(k));
    // the skyline of towers behind the promenade
    tower(k, c - R * 4.4, -15.9, 0.5, 0.42, 2.7, '#e4e0d4', { win: '#3f5d78', rows: 14, cols: 3 });
    tower(k, c - R * 5.5, -16.4, 0.46, 0.4, 2.1, '#d9d6cc', { win: '#3f5d78', rows: 11, cols: 3 });
    tower(k, c + R * 5.7, -16.2, 0.5, 0.42, 2.4, '#e9e5da', { win: '#3f5d78', rows: 12, cols: 3 });
    // palms along the front, pines on the mountains
    for (let x = c - 9; x < c + 9; x += 0.85) {
      if (k.isReserved(x, SHORE_Z - 0.75, 0.1)) continue;
      tree(k, 'palm', x + rng.range(-0.1, 0.1), SHORE_Z - 0.75, rng.range(1.1, 1.5), rng, LAND_Y - 0.03);
    }
    scatter(k, ['pine', 'round', 'fir', 'round'], { count: 150, x0: c - 12, x1: c + 12, z0: -27, z1: -16.5, size: [1.0, 1.7], minY: 0.9, maxY: 6, grove: 9 });
    for (let i = 0; i < 2; i++) gantryCrane(k, c - R * (8.3 + i * 1.4), SHORE_Z - 0.75, { color: i ? '#2c5da8' : '#c9402e', s: 0.82, y: LAND_Y });
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── Poti ─────────────────────────────

/** The Poti cathedral: neo-Byzantine, a cross-in-square with a big drum and dome (after Hagia Sophia), four small domes, a bell tower. Local frame. */
function potiCathedral(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const stone = '#eadfc4';
  const band = '#d6b98f';
  const domeCol = '#87a595';
  p.box(0, -0.3, 0, 1.2, 0.3 + 0.62, 1.2, stone);
  for (const y of [0.2, 0.46]) p.box(0, y, 0, 1.24, 0.035, 1.24, band, { ao: 0 });
  // the four arms with gabled roofs
  p.box(0, -0.3, 0.7, 0.62, 0.3 + 0.5, 0.3, stone);
  p.prism(0, 0.5, 0.7, 0.7, 0.28, 0.32, '#b9573f');
  p.tri([-0.31, 0.5, 0.857], [0.31, 0.5, 0.857], [0, 0.78, 0.857], stone);
  arch(p, 0, 0.0, 0.852, 0.2, 0.42, '#4a3a30');
  for (const sx of [-1, 1]) {
    p.box(sx * 0.7, -0.3, 0, 0.3, 0.3 + 0.5, 0.62, stone);
    p.prism(sx * 0.7, 0.5, 0, 0.32, 0.28, 0.7, '#b9573f', { ry: Math.PI / 2 });
  }
  for (const sx of [-0.4, 0.4]) arch(p, sx, 0.12, 0.602, 0.12, 0.44, '#34404c');
  for (let i = 0; i < 2; i++) wx(k, rng, 0.6, 0.12, -0.2 + i * 0.4, 0.12, 0.44, '#34404c', 0.3);
  // the great drum and dome, the four small domes
  p.cyl(0, 0.62, 0, 0.46, 0.46, 0.3, stone, { seg: 14 });
  drumWindows(p, 0, 0.7, 0, 0.464, 0.17, 9);
  dome(p, 0, 0.92, 0, 0.5, 0.42, domeCol, 16);
  p.cyl(0, 1.34, 0, 0.01, 0.006, 0.18, '#e0b73c', { seg: 4 });
  for (const sx of [-0.52, 0.52]) for (const sz of [-0.5, 0.5]) {
    p.cyl(sx, 0.62, sz, 0.14, 0.14, 0.14, stone, { seg: 8 });
    dome(p, sx, 0.76, sz, 0.16, 0.2, domeCol, 8);
  }
  // the bell tower beside it
  p.box(-1.05, -0.3, 0.45, 0.3, 0.3 + 1.2, 0.3, stone);
  p.box(-1.05, 0.9, 0.45, 0.24, 0.26, 0.24, '#2a2f38');
  p.box(-1.05, 1.16, 0.45, 0.34, 0.04, 0.34, band, { ao: 0 });
  dome(p, -1.05, 1.2, 0.45, 0.17, 0.3, domeCol, 8);
  p.cyl(-1.05, 1.5, 0.45, 0.006, 0.006, 0.14, '#e0b73c', { seg: 4 });
}

const poti: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape = { ...k.shape, relief: 0.35, range: 4.8, rise: 9, rough: 0.3 };
    k.palette.land = '#8fb06a';
    k.palette.land2 = '#82a862';
    k.palette.hill = '#6d9a58';
    k.palette.sand = '#b9b09a';
    k.palette.haze = '#d0e3e8';
  },
  build(k) {
    const rng = new Rng(k.seed ^ 0x9071);
    const R = k.mole.dir;
    const c = k.vx(-15);
    placed(k, c - R * 0.3, LAND_Y, -15.6, 1.7, 1.8, 1.0, () => potiCathedral(k, rng));
    // the old cast-iron lighthouse on the breakwater head: a ribbed dark tower with a white lantern gallery
    const lx = k.mole.endX;
    const top = k.mole.top;
    const p = k.solid;
    p.cyl(lx, top, MOLE_Z, 0.34, 0.3, 0.26, '#cfc6b0', { seg: 12 });
    lighthouse(k, lx, top + 0.26, MOLE_Z, { h: 2.6, r0: 0.2, r1: 0.14, bands: [['#5e6b63', 1]], gallery: '#e8e4d6', cap: '#7a2e24', seg: 12 });
    for (let i = 1; i < 8; i++) p.cyl(lx, top + 0.26 + i * 0.32, MOLE_Z, 0.215 - i * 0.0072, 0.215 - i * 0.0072, 0.025, '#49544d', { seg: 12, ao: 0 });
    // the lowland: palms and eucalyptus, reed marshes, the container berth
    for (let x = c - 9; x < c + 9; x += 1.1) {
      if (k.isReserved(x, SHORE_Z - 1.3, 0.1)) continue;
      tree(k, rng.chance(0.65) ? 'palm' : 'poplar', x + rng.range(-0.2, 0.2), SHORE_Z - 1.3 + rng.range(-0.3, 0.3), rng.range(1.0, 1.5), rng);
    }
    reeds(k, rng, c - 10, c + 10, SHORE_Z - 1.0, 50, 0.9);
    for (let i = 0; i < 2; i++) gantryCrane(k, c + R * (6.2 + i * 1.5), SHORE_Z - 0.75, { color: i ? '#2c8aa5' : '#c9402e', s: 0.82, y: LAND_Y });
    containerStack(k, c + R * 5.5 - (R > 0 ? 0 : 0.9), SHORE_Z - 1.9, 4, 2, 3, rng);
    boat(k, c + R * 2.6, -10.6, 'fishing', rng, 0, '#2c5da8');
  },
  mole: { light: false },
  rows: 3,
  quiet: true,
};

// @@LANDMARKS@@

void col;

export const LANDMARKS: Record<string, Landmark> = { odessa, istanbul, constanta, varna, burgas, galati, reni, izmail, chornomorsk, pivdennyi, mykolaiv, samsun, batumi, poti };

export const PORTS: Array<[string, RegionId, string?]> = [
  ['Odessa', 'blacksea', 'odessa'],
  ['Istanbul', 'blacksea', 'istanbul'],
  ['Constanța', 'blacksea', 'constanta'],
  ['Varna', 'blacksea', 'varna'],
  ['Burgas', 'blacksea', 'burgas'],
  ['Galați', 'blacksea', 'galati'],
  ['Reni', 'blacksea', 'reni'],
  ['Izmail', 'blacksea', 'izmail'],
  ['Chornomorsk', 'blacksea', 'chornomorsk'],
  ['Pivdennyi', 'blacksea', 'pivdennyi'],
  ['Mykolaiv', 'blacksea', 'mykolaiv'],
  ['Samsun', 'blacksea', 'samsun'],
  ['Batumi', 'blacksea', 'batumi'],
  ['Poti', 'blacksea', 'poti'],
];
