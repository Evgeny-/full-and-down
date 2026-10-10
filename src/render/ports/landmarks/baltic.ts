import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { Part, PortKit, SHORE_Z, LAND_Y, lerp, smooth, clamp, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { Region, RegionId } from '../regions';
import { buildTown, scatter, tint, type HouseStyle } from '../town';
import { boat, church, gantryCrane, containerStack, factory, stack } from '../props';
import { archBridge } from '../structures';
import { pane, winZ, winX, lancetZ, lancetX, dial, spireTower, nave, gable, canalHouse, hull, type GableKind } from './benl';

/**
 * The Baltic, Lübeck to Stockholm: Lübeck (Holstentor and the seven spires), Szczecin (Wały Chrobrego and the
 * Dukes' castle), Gdynia (Dar Pomorza and the Sea Towers), Gdańsk (the Crane and St Mary's), Klaipėda (the
 * barquentine Meridianas, half-timbered warehouses, container cranes), Riga (St Peter's, the Vanšu bridge, Art
 * Nouveau), Tallinn (the walls, St Olaf, Toompea), Helsinki (the two cathedrals on granite), Kotka (container and
 * pulp port), Turku (castle and cathedral) and Stockholm (City Hall, the Vasa Museum, the islands).
 *
 * The region is red-brick Hanseatic step gables with some pastel plaster, verdigris spires, birch and pine.
 * Every city brings its own town, ground colours and shore through its landmark.
 */

// ───────────────────────────── palette ─────────────────────────────

const BRICK = ['#a2492f', '#b4573a', '#97412c', '#bb6340', '#8a3b2a', '#a8503a'];
const COPPER = '#5f9d88';
const COPPER_D = '#4c8372';
const GOLD = '#e8b923';
const TILE = ['#7a3f33', '#6a3a2e', '#8a4a38', '#74402f'];

const c3 = (hex: string): THREE.Color => new THREE.Color(hex);

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Centre x of a landmark at depth z, leaned away from the breakwater head: the head, its lighthouse and the flag
 * sit on the side opposite to the way the mole runs, so the landmark moves to the free side.
 */
const centre = (k: PortKit, z: number, lean = 1.2): number => k.vx(z) + k.mole.dir * lean;

/** A rectangle facing +z (front) at depth z. */
function fq(p: Part, x0: number, x1: number, y0: number, y1: number, z: number, c: Col): void {
  p.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c);
}

/** A rectangle facing +x (right) at x, spanning z from zn (near) to zf (far). */
function rq(p: Part, x: number, y0: number, y1: number, zn: number, zf: number, c: Col): void {
  p.quad([x, y0, zn], [x, y0, zf], [x, y1, zf], [x, y1, zn], c);
}

/** A window on a round tower's wall: angle `a` from +z toward +x, between heights y0 and y1, half-width hw. */
function cylWindow(p: Part, cx: number, cz: number, r: number, a: number, y0: number, y1: number, hw: number, col: Col): void {
  const nx = Math.sin(a);
  const nz = Math.cos(a);
  const tx = Math.cos(a);
  const tz = -Math.sin(a);
  const ox = cx + nx * (r + 0.004);
  const oz = cz + nz * (r + 0.004);
  p.quad([ox - tx * hw, y0, oz - tz * hw], [ox + tx * hw, y0, oz + tz * hw], [ox + tx * hw, y1, oz + tz * hw], [ox - tx * hw, y1, oz - tz * hw], col);
}

/** Houses for one town: the pipeline's buildTown with this port's own style. */
function town(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number } = {}): void {
  buildTown(k, { x0: -k.width / 2 - 2, x1: k.width / 2 + 2, z, rows, rowStep: o.rowStep ?? 0.6, hs, gaps: o.gaps ?? 0.05, rowRise: o.rowRise ?? 0, cx: k.vx(z) + (o.shift ?? 0), minY: o.minY, maxSlope: o.maxSlope });
}

/** A quay slab: top at `top`, sunk to the sea floor. */
function quayDeck(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, top: number, color: Col): void {
  const p = k.solid;
  p.box((x0 + x1) / 2, -0.9, (zBack + zFront) / 2, x1 - x0, 0.9 + top, zFront - zBack, color);
  p.box((x0 + x1) / 2, top - 0.004, (zBack + zFront) / 2, x1 - x0 + 0.04, 0.03, zFront - zBack + 0.04, tint(color, 0.12), { ao: 0 });
}

/**
 * A river running inland from the sea: wide soft banks painted as grass, fading out far back so no cliff shows.
 * Returns the river's centre line (x at depth z) for bridges and boats.
 */
function river(k: PortKit, cx: number, half: number, o: { bank?: number; zBack?: number; fade?: number; sway?: number; floor?: number } = {}): (z: number) => number {
  const bank = o.bank ?? 0.9;
  const zBack = o.zBack ?? -31;
  const fade = o.fade ?? 11;
  const sway = o.sway ?? 0;
  const floor = o.floor ?? -0.45;
  const mid = (z: number): number => cx + Math.sin((z + 12) * 0.2) * sway * smooth(-14, -26, z);
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 0.9) return h;
    const w = smooth(half + bank, half, Math.abs(x - mid(z))) * smooth(zBack, zBack + fade, z) * smooth(SHORE_Z + 0.9, SHORE_Z + 0.6, z);
    // the bed rises with the land, so a river never cuts a gorge into the foothills
    return lerp(h, Math.min(h, Math.max(floor, h - 0.9)), w);
  });
  const grass = new THREE.Color(k.palette.land);
  k.paint((x, y, z, slope, c) => {
    if (z < SHORE_Z + 0.8 && z > zBack && y < 0.6 && Math.abs(x - mid(z)) < half + bank + 0.3) c.lerp(grass, 0.85);
  });
  return mid;
}

/** A brick church with twin verdigris spires on its west front and a long nave behind it. `s` scales it. */
function twinChurch(k: PortKit, x: number, z: number, s: number, shaft: number, spire: number, stone: Col, bays: number): void {
  k.at(x, LAND_Y - 0.02, z, 0, s, () => {
    for (const sx of [-1, 1]) spireTower(k, sx * 0.62, 0, -0.45, { w: 0.95, shaft, spire, stone, roof: COPPER, finial: GOLD });
    k.at(0, 0, -0.9, 0, 1, () => nave(k, { len: 3.4, nave: 1.1, aisle: 0.85, wallH: 2.0, aisleH: 1.1, roofH: 1.1, stone, roof: '#6a3a2e', bays }));
    k.solid.box(0, -0.25, -0.55, 1.5, 0.25 + 2.0, 1.0, stone);
  });
  k.reserve(x, z - 1.2, 1.4, 2.0);
}

/** A wood of the given kinds between two x and two z (on dry land, clear of buildings). */
function woods(k: PortKit, kinds: Array<'pine' | 'birch' | 'fir' | 'round'>, x0: number, x1: number, z0: number, z1: number, n: number, size: [number, number], grove = 4): void {
  scatter(k, kinds, { count: n, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0, z1, size, minY: 0.3, maxY: 5, grove, pad: 0.1 });
}

/** Granite boulders along the waterline and on the knolls (Finland, Stockholm). */
function boulders(k: PortKit, rng: Rng, x0: number, x1: number, n: number, cols: Col[], zA = SHORE_Z - 0.2, zB = SHORE_Z + 0.5): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const z = rng.range(zA, zB);
    if (k.isReserved(x, z, 0.1)) continue;
    k.solid.rock(x, -0.32, z, rng.range(0.25, 0.6), cols[i % cols.length], { sy: rng.range(0.55, 0.9), ry: rng.next() * 6 });
  }
}

/** A cone spire with a gold ball and pin on top: the verdigris needle of a Baltic church. */
function needle(p: Part, x: number, y: number, z: number, r: number, h: number, col: Col = COPPER, seg = 8): number {
  p.cyl(x, y, z, r, r * 0.12, h * 0.8, col, { seg, ao: 0.08 });
  p.cone(x, y + h * 0.8, z, r * 0.12, h * 0.2, tint(col, 0.1), { seg: 6, ao: 0 });
  p.cyl(x, y + h - 0.02, z, 0.008, 0.008, 0.12, GOLD, { seg: 4, ao: 0 });
  p.ball(x, y + h + 0.05, z, 0.026, GOLD);
  return y + h + 0.1;
}

/** A plain square church tower: brick shaft with louvred belfry, a stone band and a verdigris needle. */
function brickSpire(k: PortKit, x: number, y: number, z: number, w: number, shaft: number, spire: number, brick: Col, roof: Col = COPPER): number {
  const p = k.solid;
  const dark = '#2b313b';
  p.boxV(x, y - 0.25, z, w, 0.25 + shaft, w, brick);
  p.box(x, y + shaft * 0.62, z, w + 0.03, 0.03, w + 0.03, tint(brick, 0.22), { ao: 0 });
  lancetZ(p, x, y + shaft * 0.12, z + w / 2, w * 0.24, shaft * 0.3, dark);
  lancetX(p, x + w / 2, y + shaft * 0.12, z, w * 0.24, shaft * 0.3, dark);
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * w * 0.2, y + shaft * 0.68, z + w / 2, w * 0.16, shaft * 0.26, dark);
    lancetX(p, x + w / 2, y + shaft * 0.68, z + f * w * 0.2, w * 0.16, shaft * 0.26, dark);
  }
  p.box(x, y + shaft, z, w + 0.05, 0.035, w + 0.05, tint(brick, 0.22), { ao: 0 });
  return needle(p, x, y + shaft + 0.035, z, w * 0.62, spire, roof);
}

/** A brick church body: a long box with a steep tiled roof, ridge along x, windows on the visible side. */
function hall(k: PortKit, x: number, y: number, z: number, w: number, d: number, wallH: number, roofH: number, wall: Col, roof: Col, o: { bays?: number; ridge?: 'x' | 'z'; win?: Col } = {}): void {
  const p = k.solid;
  const ridgeX = (o.ridge ?? 'x') === 'x';
  p.boxV(x, y - 0.25, z, w, 0.25 + wallH, d, wall);
  if (ridgeX) p.prism(x, y + wallH, z, d + 0.08, roofH, w + 0.04, roof, { ry: Math.PI / 2 });
  else p.prism(x, y + wallH, z, w + 0.08, roofH, d + 0.04, roof);
  const bays = o.bays ?? Math.max(2, Math.round(w / 0.5));
  const win = o.win ?? '#2d3844';
  for (let i = 0; i < bays; i++) {
    const cx = x - w / 2 + (w / bays) * (i + 0.5);
    lancetZ(p, cx, y + wallH * 0.25, z + d / 2, 0.11, wallH * 0.55, win);
  }
  const bz = Math.max(1, Math.round(d / 0.55));
  for (let i = 0; i < bz; i++) lancetX(p, x + w / 2, y + wallH * 0.25, z + d / 2 - (d / bz) * (i + 0.5), 0.11, wallH * 0.55, win);
  k.reserve(x, z, w / 2 + 0.05, d / 2 + 0.05);
}

// ───────────────────────────── the Baltic region ─────────────────────────────

const hanse: HouseStyle = {
  walls: ['#a2492f', '#b4573a', '#97412c', '#bb6340', '#8a3b2a', '#a8503a', '#e6d6a4', '#dca89c', '#bdd0b2', '#e4c58c'],
  roofs: [...TILE, '#4a4f58'],
  trim: '#f3efe4',
  win: '#2c3a4a',
  floors: [2, 4],
  floorH: 0.19,
  w: [0.3, 0.46],
  d: [0.38, 0.52],
  roofKinds: [['step', 4], ['front', 3], ['gable', 2], ['hip', 0.6]],
  pitch: 0.95,
  chimney: 0.25,
  gap: [0, 0.03],
  door: '#4a5a6a',
  runs: false,
};

export const REGIONS: Partial<Record<RegionId, Region>> = {
  baltic: {
    id: 'baltic',
    houses: hanse,
    palette: { land: '#9ab372', land2: '#a8bb78', hill: '#729a6a', rock: '#9b9a94', sand: '#d8cdaa', haze: '#d3e3eb' },
    shape: { relief: 0.6, range: 1.8, rise: 5, rough: 0.35, freq: 0.08 },
    shore: 'quay',
    rows: 4,
    rowStep: 0.6,
    gaps: 0.05,
    rowRise: 0.1,
    trees: [{ kinds: ['pine', 'pine', 'birch', 'birch', 'round'], count: 70, where: 'all', size: [0.9, 1.5], maxY: 4 }],
    armour: 'rocks',
    lights: [0, 1, 4],
    boats: { kinds: ['sail', 'fishing'], n: 3, colors: ['#2c5da8', '#f6f3ea', '#c8302a'] },
    extras: (k, rng) => {
      church(k, k.vx(-14) + rng.range(-4, 4), -14.5, { wall: '#a8503a', roof: '#6a3a2e', spire: COPPER, h: 1.25 });
    },
  },
};

// ───────────────────────────── Lübeck ─────────────────────────────

const lubeckStyle: HouseStyle = {
  ...hanse,
  walls: ['#a2492f', '#b4573a', '#97412c', '#bb6340', '#8a3b2a', '#a8503a', '#a2492f', '#e4c58c'],
  roofs: TILE,
  floors: [3, 4],
  floorH: 0.2,
  w: [0.34, 0.5],
  roofKinds: [['step', 6], ['front', 2], ['gable', 1]],
  pitch: 1.05,
};

/** The Holstentor: two squat round brick towers with verdigris cones, a gabled gate between them. */
function holstentor(k: PortKit, gx: number, gz: number): void {
  const p = k.solid;
  const y = k.groundMax(gx, gz, 1.7, 0.8) - 0.02;
  const R = 0.62;
  const TH = 1.72;
  const brick = '#9a4331';
  const band = '#c9b99a';
  const dark = '#2a2623';
  // the gate block between the towers
  const bw = 1.75;
  const bz = gz - 0.1;
  const bd = 0.8;
  const BH = 1.42;
  p.boxV(gx, y - 0.25, bz, bw, 0.25 + BH, bd, tint(brick, 0.04));
  const zf = bz + bd / 2;
  p.box(gx, y + 0.72, zf + 0.004, bw, 0.05, 0.014, band, { ao: 0 });
  p.box(gx, y + 1.05, zf + 0.004, bw, 0.035, 0.014, '#d9c27a', { ao: 0 });
  p.box(gx, y + BH - 0.02, zf + 0.008, bw + 0.02, 0.05, 0.03, band, { ao: 0 });
  // the pointed gate arch
  fq(p, gx - 0.24, gx + 0.24, y, y + 0.55, zf + 0.006, dark);
  p.tri([gx - 0.24, y + 0.55, zf + 0.006], [gx + 0.24, y + 0.55, zf + 0.006], [gx, y + 0.82, zf + 0.006], dark);
  const rng = new Rng(k.seed ^ 0x401);
  for (const [x0, x1] of [[-0.8, -0.34], [0.34, 0.8]] as Array<[number, number]>) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const wx = gx + lerp(x0, x1, (c + 0.5) / 2);
        const yy = y + 0.2 + r * 0.38 + (r === 2 ? 0.17 : 0);
        (rng.chance(0.3) ? k.lit : p).quad([wx - 0.045, yy, zf + 0.008], [wx + 0.045, yy, zf + 0.008], [wx + 0.045, yy + 0.15, zf + 0.008], [wx - 0.045, yy + 0.15, zf + 0.008], '#2c3340');
      }
    }
  }
  // steep verdigris saddle roof with three stepped gables on its front
  p.prism(gx, y + BH, bz, bd + 0.1, 0.62, bw + 0.04, COPPER, { ry: Math.PI / 2 });
  p.tri([gx + bw / 2 + 0.022, y + BH, bz + bd / 2 + 0.05], [gx + bw / 2 + 0.022, y + BH, bz - bd / 2 - 0.05], [gx + bw / 2 + 0.022, y + BH + 0.62, bz], tint(brick, 0.04));
  gable(p, 'step', gx, y + BH, zf, 0.78, 0.74, brick, band);
  for (const s of [-1, 1]) gable(p, 'step', gx + s * 0.6, y + BH, zf - 0.02, 0.4, 0.42, brick, band, 0.08);
  fq(p, gx - 0.07, gx + 0.07, y + BH + 0.1, y + BH + 0.3, zf + 0.056, dark);
  // the two towers
  for (const s of [-1, 1]) {
    const tx = gx + s * 1.06;
    const tz = gz + 0.02;
    p.cyl(tx, y - 0.25, tz, R * 1.08, R * 1.06, 0.25 + 0.34, tint(brick, -0.1), { seg: 14 });
    p.cyl(tx, y + 0.34, tz, R * 1.04, R * 1.0, 0.5, brick, { seg: 14, open: true });
    p.cyl(tx, y + 0.84, tz, R * 1.0, R * 0.98, 0.07, band, { seg: 14, open: true, ao: 0 });
    p.cyl(tx, y + 0.91, tz, R * 0.98, R * 0.96, 0.55, tint(brick, 0.03), { seg: 14, open: true });
    p.cyl(tx, y + 1.46, tz, R * 0.96, R * 0.95, 0.07, band, { seg: 14, open: true, ao: 0 });
    p.cyl(tx, y + 1.53, tz, R * 0.95, R * 0.94, TH - 1.53, brick, { seg: 14, open: true });
    p.cyl(tx, y + TH, tz, R * 1.12, R * 1.08, 0.09, tint(brick, -0.08), { seg: 14 });
    p.cone(tx, y + TH + 0.09, tz, R * 1.1, 1.18, COPPER, { seg: 14 });
    // arrow slits and windows round the visible half
    for (const a of [-0.55, 0.0, 0.55, 1.1]) {
      cylWindow(p, tx, tz, R, a, y + 0.5, y + 0.78, 0.035, dark);
      cylWindow(p, tx, tz, R, a + 0.27, y + 1.08, y + 1.34, 0.04, dark);
      cylWindow(p, tx, tz, R, a, y + 1.6, y + 1.7, 0.035, dark);
    }
    for (const a of [-0.3, 0.3, 0.9]) p.pyramid(tx + Math.sin(a) * R * 0.9, y + TH + 0.2, tz + Math.cos(a) * R * 0.9, 0.12, 0.16, 0.12, COPPER_D);
    p.cyl(tx, y + TH + 1.2, tz, 0.012, 0.008, 0.14, GOLD, { seg: 4, ao: 0 });
    p.ball(tx, y + TH + 1.36, tz, 0.03, GOLD);
  }
  k.reserve(gx, gz, 2.0, 0.85);
}

const lubeck: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9db46f', land2: '#a9ba74', hill: '#7f9f68', rock: '#9a9a94', sand: '#d6cca9', haze: '#d3e3eb' };
    k.shape = { relief: 0.3, range: 1.1, rise: 7, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.4, 0.8);
    const X = (d: number): number => cx + s * d;
    const gx = X(0.5);
    holstentor(k, gx, -13.95);
    // the old town's seven spires behind the gate: St Mary's (twin), the Cathedral (twin), St Peter's, St Jacob's, St Giles
    const y0 = LAND_Y - 0.02;
    twinChurch(k, X(2.3), -17.4, 0.66, 3.4, 3.6, '#a3472f', 4);
    twinChurch(k, X(-2.5), -17.9, 0.6, 3.1, 3.3, '#b05a40', 3);
    brickSpire(k, X(-5.1), y0, -17.0, 0.5, 1.5, 1.7, '#a95a3e');
    hall(k, X(-4.3), y0, -17.3, 1.0, 0.7, 0.95, 0.65, '#a95a3e', '#6a3a2e', { bays: 2 });
    brickSpire(k, X(4.6), y0, -17.3, 0.5, 1.4, 1.5, '#a3472f');
    hall(k, X(5.3), y0, -17.7, 1.0, 0.7, 0.95, 0.65, '#a3472f', '#6a3a2e', { bays: 2 });
    brickSpire(k, X(6.4), y0, -16.2, 0.36, 0.95, 1.0, '#b05a40');
    // the Salzspeicher: tall step-gabled brick warehouses along the river
    let d = 2.2;
    const rng = new Rng(k.seed ^ 12345);
    for (let i = 0; i < 4; i++) {
      const w = 0.62 + rng.next() * 0.16;
      canalHouse(k, X(d + w / 2), -13.5 - (i % 2) * 0.03, w, 0.72, 4 + (i % 2), BRICK[(i * 2 + 1) % BRICK.length], 'step', { fh: 0.34, gh: 0.35 + w * 0.5, roof: TILE[i % 4], cols: 2 });
      d += w + 0.02;
    }
    town(k, lubeckStyle, 2, SHORE_Z - 1.5, { rowStep: 0.64, gaps: 0.05 });
    woods(k, ['birch', 'pine', 'round', 'birch'], X(-9), X(9), -26, -19.5, 22, [0.9, 1.4], 3);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── shared pieces: roofs, domes, ships ─────────────────────────────

/** A hipped roof over a w × d footprint (ridge along x), `ov` of overhang. */
function hipRoof(p: Part, x: number, y: number, z: number, w: number, d: number, h: number, col: Col, ov = 0.04): void {
  const x0 = x - w / 2 - ov;
  const x1 = x + w / 2 + ov;
  const z0 = z - d / 2 - ov;
  const z1 = z + d / 2 + ov;
  const r = Math.max(0.03, (w - d) / 2);
  const v: V3[] = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x - r, y + h, z], [x + r, y + h, z]];
  p.solid(v, [[3, 2, 5, 4], [0, 1, 5, 4], [0, 3, 4], [1, 2, 5]], col, { ao: 0.1 });
}

/** A stately stone block: rows of windows on the two visible faces and a hipped roof. Returns the eaves height. */
function palace(k: PortKit, x: number, z: number, w: number, d: number, floors: number, fh: number, wall: Col, roof: Col, o: { y?: number; roofH?: number; cols?: number; win?: Col; band?: Col } = {}): number {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const H = floors * fh;
  p.boxV(x, y - 0.25, z, w, 0.25 + H, d, wall);
  const cols = o.cols ?? Math.max(2, Math.round(w / 0.36));
  winZ(k, x, y + fh * 0.18, z + d / 2, w - 0.16, H - fh * 0.2, cols, floors, o.win ?? '#2d3844', 0.45, 0.56);
  winX(k, x + w / 2, y + fh * 0.18, z, d - 0.1, H - fh * 0.2, Math.max(1, Math.round(d / 0.4)), floors, o.win ?? '#2d3844', 0.45, 0.56);
  p.box(x, y + H - 0.02, z, w + 0.05, 0.05, d + 0.05, o.band ?? tint(wall, 0.14), { ao: 0 });
  p.box(x, y + fh * 0.95, z + d / 2 + 0.003, w, 0.025, 0.01, o.band ?? tint(wall, 0.14), { ao: 0 });
  hipRoof(p, x, y + H + 0.03, z, w, d, o.roofH ?? 0.5, roof);
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
  return y + H;
}

/** A square tower under a verdigris dome and lantern. Returns the tip's height. */
function domeTower(k: PortKit, x: number, y: number, z: number, w: number, shaft: number, wall: Col, dome: Col = COPPER, o: { drum?: number; dark?: Col } = {}): number {
  const p = k.solid;
  p.boxV(x, y - 0.25, z, w, 0.25 + shaft, w, wall);
  const rows = Math.max(2, Math.round(shaft / 0.4));
  winZ(k, x, y + 0.2, z + w / 2, w * 0.62, shaft - 0.45, 2, rows, o.dark ?? '#2d3844', 0.4, 0.5);
  winX(k, x + w / 2, y + 0.2, z, w * 0.62, shaft - 0.45, 2, rows, o.dark ?? '#2d3844', 0.4, 0.5);
  p.box(x, y + shaft, z, w + 0.1, 0.05, w + 0.1, tint(wall, 0.15), { ao: 0 });
  const dh = o.drum ?? w * 0.8;
  p.cyl(x, y + shaft + 0.05, z, w * 0.4, w * 0.4, dh, tint(wall, 0.06), { seg: 10 });
  const t = y + shaft + 0.05 + dh;
  const r = w * 0.5;
  p.lathe(x, t, z, [[r * 0.9, 0], [r, r * 0.12], [r * 0.82, r * 0.5], [r * 0.4, r * 0.88], [r * 0.12, r * 1.1], [0.001, r * 1.18]], dome, { seg: 12 });
  p.cyl(x, t + r * 1.1, z, 0.012, 0.01, 0.16, GOLD, { seg: 4, ao: 0 });
  p.ball(x, t + r * 1.1 + 0.18, z, 0.03, GOLD);
  return t + r * 1.1 + 0.2;
}

interface MastSpec {
  /** position along the hull, −0.5 stern … +0.5 bow, as a fraction of the length */
  at: number;
  h: number;
  rig: 'square' | 'gaff' | 'bare';
  yards?: number;
}

interface ShipSpec {
  ry?: number;
  hull: Col;
  /** dark waterline strip and the row of gun ports */
  boot?: Col;
  ports?: Col;
  trim?: Col;
  mast?: Col;
  sail?: Col;
  /** square sails furled on their yards (a museum ship at the quay) */
  furled?: boolean;
  masts: MastSpec[];
  /** deckhouses: [fraction along hull, length fraction, height, colour] */
  houses?: Array<[number, number, number, Col]>;
  poop?: boolean;
}

/**
 * A sailing ship at the waterline with its bow toward +x: faceted hull, gun ports, deckhouses, masts with
 * square sails (furled or set) or fore-and-aft sails, a bowsprit and stays. `len` is the hull length.
 */
function rigShip(k: PortKit, x: number, z: number, len: number, o: ShipSpec): void {
  const p = k.solid;
  const b = len * 0.17;
  const fb = len * 0.07;
  const dr = len * 0.05;
  const sail = o.sail ?? '#f1ece0';
  const mastC = o.mast ?? '#a58b66';
  const rc = len * 0.0062;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    hull(p, len, b, o.hull, { freeboard: fb, depth: dr, bow: 0.16 });
    // the dark waterline strip and a row of gun ports along the side
    if (o.boot) p.boxV(-len * 0.03, -dr * 0.5, 0, len * 0.76, dr * 0.5 + fb * 0.24, b * 1.0 + 0.012, o.boot, { ao: 0 });
    if (o.ports) for (let i = 0; i < 13; i++) p.boxV(-len * 0.3 + i * len * 0.048, fb * 0.45, 0, len * 0.022, fb * 0.3, b * 1.0 + 0.03, o.ports, { ao: 0 });
    // bulwark rails along the deck edge
    p.box(-len * 0.06, fb, b * 0.47, len * 0.78, fb * 0.32, 0.018, o.trim ?? tint(o.hull, 0.1), { ao: 0 });
    p.box(-len * 0.06, fb, -b * 0.47, len * 0.78, fb * 0.32, 0.018, o.trim ?? tint(o.hull, 0.1), { ao: 0 });
    if (o.poop) p.box(-len * 0.37, fb, 0, len * 0.2, fb * 0.5, b * 0.8, tint(o.hull, 0.04));
    for (const [at, lf, hh, col] of o.houses ?? []) {
      p.box(at * len, fb, 0, lf * len, hh, b * 0.52, col);
      p.box(at * len, fb + hh, 0, lf * len + 0.03, 0.02, b * 0.52 + 0.03, tint(col, -0.12), { ao: 0 });
    }
    // the bowsprit
    p.rod([len * 0.46, fb * 0.9, 0], [len * 0.68, fb + len * 0.075, 0], rc * 0.8, mastC, 5);
    const tops: V3[] = [];
    for (const m of o.masts) {
      const mx = m.at * len;
      p.cyl(mx, fb, 0, rc * 1.15, rc * 0.6, m.h, mastC, { seg: 6, ao: 0.05 });
      tops.push([mx, fb + m.h, 0]);
      if (m.rig === 'square') {
        const n = m.yards ?? 4;
        for (let i = 0; i < n; i++) {
          const yy = fb + m.h * (0.24 + 0.17 * i);
          const hw = len * 0.1 * (1 - 0.15 * i);
          p.rod([mx + 0.012, yy, -hw], [mx + 0.012, yy, hw], rc * 0.75, mastC, 4);
          if (o.furled) p.rod([mx + 0.03, yy - rc * 1.2, -hw * 0.94], [mx + 0.03, yy - rc * 1.2, hw * 0.94], rc * 1.5, sail, 5);
          else if (i < n - 1) {
            const y2 = fb + m.h * (0.24 + 0.17 * (i + 1)) - 0.02;
            const h2 = len * 0.1 * (1 - 0.15 * (i + 1));
            p.quad([mx + 0.02, yy - 0.01, -hw * 0.96], [mx + 0.02, yy - 0.01, hw * 0.96], [mx + 0.02, y2, h2 * 0.96], [mx + 0.02, y2, -h2 * 0.96], sail, true);
          }
        }
      } else if (m.rig === 'gaff') {
        const by = fb + m.h * 0.2;
        const bl = len * 0.2;
        p.rod([mx, by, 0], [mx - bl, by + 0.02, 0], rc * 0.8, mastC, 4);
        p.rod([mx, fb + m.h * 0.66, 0], [mx - bl * 0.75, fb + m.h * 0.84, 0], rc * 0.7, mastC, 4);
        p.tri([mx - 0.02, by + 0.03, 0], [mx - bl + 0.02, by + 0.05, 0], [mx - bl * 0.72, fb + m.h * 0.82, 0], sail, true);
        p.tri([mx - 0.02, by + 0.03, 0], [mx - bl * 0.72, fb + m.h * 0.82, 0], [mx - 0.02, fb + m.h * 0.66, 0], sail, true);
      }
    }
    // stays from the mast heads to the bow and the stern
    const col = '#4a4f56';
    tops.forEach(([tx, ty], i) => {
      const nx = tops[i + 1];
      p.rod([tx, ty, 0], nx ? [nx[0], nx[1] * 0.8, 0] : [len * 0.66, fb + len * 0.07, 0], 0.005, col, 3);
      if (i === 0) p.rod([tx, ty, 0], [-len * 0.46, fb + 0.1, 0], 0.005, col, 3);
    });
  });
}

// ───────────────────────────── more shared pieces: a stay-cabled bridge, a container feeder ─────────────────────────────

/**
 * The Vansu bridge's look: a slim deck on piers, one tall white pylon leaning back from the river and a fan of
 * stays over the water (`side` is the direction of the river from the pylon).
 */
function vansuBridge(k: PortKit, x0: number, x1: number, z: number, px: number, side: 1 | -1, deck: number, h: number): void {
  const p = k.solid;
  const half = 0.17;
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  p.box(cx, deck - 0.09, z, len, 0.09, half * 2, '#8d939a');
  p.box(cx, deck, z - half + 0.01, len, 0.04, 0.02, '#cfd4d8', { ao: 0 });
  p.box(cx, deck, z + half - 0.01, len, 0.04, 0.02, '#cfd4d8', { ao: 0 });
  for (let x = x0 + 0.35; x < x1 - 0.1; x += 1.25) p.box(x, -0.9, z, 0.2, 0.9 + deck - 0.09, 0.3, '#b9b5ab');
  p.box(px, -0.9, z, 0.36, 0.9 + deck - 0.09, 0.4, '#c9c5ba');
  const lean = -side * 0.5;
  const tx = px + lean;
  const ty = deck + h;
  for (const dz of [-0.11, 0.11]) p.rod([px, deck - 0.05, z + dz], [tx, ty, z + dz * 0.3], 0.055, '#eef1f3', 6);
  p.box(px + lean * 0.45, deck + h * 0.45, z, 0.1, 0.07, 0.32, '#eef1f3', { ao: 0 });
  const at = (y: number): number => px + (lean * (y - deck)) / h;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ay = deck + h * (0.96 - 0.52 * t);
    const ex = clamp(px + side * (0.55 + t * 4.3), Math.min(x0, x1), Math.max(x0, x1));
    for (const dz of [-0.14, 0.14]) p.rod([at(ay), ay, z + dz * 0.4], [ex, deck, z + dz], 0.008, '#dfe3e6', 3);
  }
  for (let i = 0; i < 4; i++) {
    const ay = deck + h * (0.97 - i * 0.04);
    const ex = clamp(px - side * (0.5 + i * 0.35), Math.min(x0, x1), Math.max(x0, x1));
    for (const dz of [-0.14, 0.14]) p.rod([at(ay), ay, z + dz * 0.4], [ex, deck, z + dz], 0.008, '#dfe3e6', 3);
  }
}

const BOXES = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5'];

/** A container feeder at the quay: navy hull, bays of boxes stacked on deck, the house and funnel aft; bow toward +x. */
function feeder(k: PortKit, x: number, z: number, len: number, rng: Rng): void {
  const p = k.solid;
  const b = len * 0.17;
  const fb = len * 0.075;
  k.at(x, 0, z, 0, 1, () => {
    hull(p, len, b, '#26364f', { freeboard: fb, depth: len * 0.05, bow: 0.16 });
    p.boxV(-len * 0.03, -len * 0.025, 0, len * 0.76, len * 0.025 + fb * 0.28, b + 0.012, '#7a2f28', { ao: 0 });
    const bay = len * 0.105;
    for (let i = 0; i < 6; i++) {
      const bx = -len * 0.27 + i * bay;
      const tiers = rng.int(2, 4);
      for (let t = 0; t < tiers; t++) p.boxV(bx, fb + t * 0.17, 0, bay * 0.95, 0.165, b * 0.74, BOXES[rng.int(0, BOXES.length - 1)], { ao: 0.12 });
    }
    // the house and funnel aft
    p.boxV(-len * 0.38, fb, 0, len * 0.1, 0.62, b * 0.7, '#f1eee6');
    p.box(-len * 0.38 + len * 0.051, fb + 0.4, 0, 0.012, 0.1, b * 0.62, '#2f3d4d', { ao: 0 });
    p.box(-len * 0.38, fb + 0.62, 0, len * 0.11, 0.02, b * 0.74, '#c9ccd0', { ao: 0 });
    p.cyl(-len * 0.4, fb + 0.62, 0, 0.1, 0.085, 0.3, '#c8302a', { seg: 8 });
  });
}

// ───────────────────────────── Szczecin ─────────────────────────────

/** height of the Chrobry terrace above the sea */
const TERR = 1.5;

const szczStyle: HouseStyle = {
  ...hanse,
  walls: ['#e6d6a4', '#dca89c', '#bdd0b2', '#e4c58c', '#a8503a', '#c9b99a', '#e9dfc8', '#a2492f'],
  roofs: ['#6a3a2e', '#7a3f33', '#4a4f58'],
  floors: [3, 4],
  roofKinds: [['hip', 3], ['front', 3], ['step', 2], ['gable', 2]],
};

/** The Pomeranian Dukes' castle: salmon-ochre wings round a courtyard, a clock tower with a verdigris cap, round corner towers. */
function ducalCastle(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.7, 1.0) - 0.02;
  const wall = '#d19e78';
  const roof = '#6b4a3f';
  const W = 3.2;
  const D = 0.9;
  const H = 1.4;
  p.boxV(x, y - 0.55, z, W, 0.55 + H, D, wall);
  winZ(k, x, y + 0.2, z + D / 2, W - 0.5, H - 0.3, 8, 3, '#3a2f2a', 0.4, 0.5);
  p.box(x, y + H - 0.03, z, W + 0.04, 0.05, D + 0.04, '#ecdcc0', { ao: 0 });
  hipRoof(p, x, y + H + 0.02, z, W, D, 0.5, roof);
  // the east wing runs back from the right-hand end
  const wx = x + W / 2 - 0.45;
  p.boxV(wx, y - 0.55, z - 1.0, 0.9, 0.55 + H, 1.9, wall);
  winX(k, wx + 0.45, y + 0.2, z - 1.0, 1.6, H - 0.3, 4, 3, '#3a2f2a', 0.4, 0.5);
  p.prism(wx, y + H + 0.02, z - 1.0, 0.98, 0.5, 1.94, roof);
  p.box(wx, y + H - 0.03, z - 1.0, 0.94, 0.05, 1.94, '#ecdcc0', { ao: 0 });
  // round corner towers with verdigris cones
  for (const [tx, tz] of [[x + W / 2, z + D / 2 - 0.05], [x - W / 2, z + D / 2 - 0.05]] as Array<[number, number]>) {
    p.cyl(tx, y - 0.55, tz, 0.34, 0.32, 0.55 + 1.75, wall, { seg: 10 });
    p.cyl(tx, y + 1.5, tz, 0.37, 0.37, 0.06, '#ecdcc0', { seg: 10, ao: 0 });
    p.cone(tx, y + 1.56, tz, 0.4, 0.62, COPPER, { seg: 10 });
    for (const a of [-0.5, 0.35, 1.1]) cylWindow(p, tx, tz, 0.32, a, y + 0.7, y + 1.0, 0.04, '#3a2f2a');
    p.ball(tx, y + 2.2, tz, 0.025, GOLD);
  }
  // the clock tower: slim, tall, with a verdigris cupola
  const cx = x - 0.7;
  const cz = z + 0.02;
  const w = 0.6;
  p.boxV(cx, y - 0.55, cz, w, 0.55 + H + 0.85, w, tint(wall, 0.03));
  p.box(cx, y + H + 0.6, cz, w + 0.06, 0.04, w + 0.06, '#ecdcc0', { ao: 0 });
  dial(p, cx, y + H + 0.38, cz + w / 2 + 0.008, 0.13, '#f1ead6');
  dial(p, cx + w / 2 + 0.008, y + H + 0.38, cz, 0.13, '#f1ead6', 'x');
  fq(p, cx - 0.12, cx - 0.04, y + H - 0.4, y + H - 0.05, cz + w / 2 + 0.004, '#3a2f2a');
  fq(p, cx + 0.04, cx + 0.12, y + H - 0.4, y + H - 0.05, cz + w / 2 + 0.004, '#3a2f2a');
  p.lathe(cx, y + H + 0.85, cz, [[0.34, 0], [0.34, 0.05], [0.24, 0.22], [0.14, 0.4], [0.08, 0.52], [0.001, 0.64]], COPPER, { seg: 10 });
  p.cyl(cx, y + H + 1.45, cz, 0.012, 0.01, 0.2, GOLD, { seg: 4, ao: 0 });
  p.ball(cx, y + H + 1.67, cz, 0.03, GOLD);
  k.reserve(x, z - 0.4, W / 2 + 0.3, 1.4);
}

const szczecin: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9db66f', land2: '#a9bd76', hill: '#7d9e68', rock: '#9a9a94', sand: '#d6cca9', haze: '#d3e3eb' };
    k.shape = { relief: 0.5, range: 1.5, rise: 6, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.8);
    const a = cx + s * -6.1;
    const b = cx + s * 1.6;
    const x0 = Math.min(a, b);
    const x1 = Math.max(a, b);
    const zF = -12.75;
    const zB = -17.2;
    // the Chrobry terrace: a long raised platform above the river
    k.feature((x, z, h) => {
      const ex = smooth(x1 + 0.3, x1, x) * smooth(x0 - 0.3, x0, x);
      const ez = smooth(zF + 0.22, zF, z) * smooth(zB - 1.2, zB, z);
      return lerp(h, Math.max(h, TERR), ex * ez);
    });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.8);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x5c);
    const a = X(-6.1);
    const b = X(1.6);
    const x0 = Math.min(a, b);
    const x1 = Math.max(a, b);
    const zw = -12.62;
    const mid = (x0 + x1) / 2;
    const len = x1 - x0;
    const sand = '#d6cbb0';
    // the embankment wall: pilasters, cornice, balustrade
    p.boxV(mid, -0.6, zw, len + 0.1, 0.6 + TERR, 0.36, sand);
    p.box(mid, TERR - 0.02, zw + 0.02, len + 0.14, 0.05, 0.44, tint(sand, 0.2), { ao: 0 });
    p.box(mid, TERR + 0.03, zw + 0.1, len + 0.1, 0.1, 0.05, '#ece5d2', { ao: 0 });
    for (let x = x0 + 0.6; x < x1 - 0.2; x += 1.0) {
      p.boxV(x, 0.25, zw + 0.2, 0.2, TERR - 0.27, 0.05, tint(sand, -0.07));
      p.box(x, TERR + 0.03, zw + 0.1, 0.07, 0.17, 0.07, '#ece5d2', { ao: 0 });
    }
    for (const xe of [x0 - 0.05, x1 + 0.05]) p.box(xe, -0.6, zw - 1.5, 0.22, 0.6 + TERR, 3.0, sand);
    // the grand stair down to the quay
    const fz = zw + 0.18;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const top = LAND_Y + (i + 1) * ((TERR - LAND_Y) / n);
      const dz = (n - i) * 0.1;
      p.box(mid + 0.4, 0.2, fz + dz / 2, 1.8, top - 0.2, dz, i % 2 ? '#cfc4a8' : '#d8cdb2');
    }
    // round pavilions with verdigris domes at both ends of the terrace
    for (const xp of [x0 + 0.1, x1 - 0.1]) {
      p.cyl(xp, 0.15, zw - 0.08, 0.44, 0.4, TERR - 0.15, sand, { seg: 10 });
      p.cyl(xp, TERR - 0.02, zw - 0.08, 0.36, 0.34, 0.6, '#e2d8bd', { seg: 10 });
      for (const an of [-0.3, 0.5, 1.2]) cylWindow(p, xp, zw - 0.08, 0.35, an, TERR + 0.15, TERR + 0.45, 0.05, '#2d3844');
      p.lathe(xp, TERR + 0.58, zw - 0.08, [[0.44, 0], [0.42, 0.05], [0.3, 0.2], [0.12, 0.33], [0.001, 0.4]], COPPER, { seg: 10 });
      p.ball(xp, TERR + 1.0, zw - 0.08, 0.03, GOLD);
    }
    k.reserve(mid, -14.6, len / 2 + 0.3, 2.3);
    // the great buildings behind the balustrade, green copper roofs and a domed tower
    const zb = -15.0;
    palace(k, X(-4.25), zb, 2.7, 1.4, 4, 0.4, '#e4d6b0', COPPER_D, { y: TERR, roofH: 0.6, cols: 7 });
    domeTower(k, X(-2.65), TERR, -14.55, 0.62, 2.2, '#e8dcba', COPPER);
    palace(k, X(-0.75), zb, 3.1, 1.4, 4, 0.4, '#e6d8b4', COPPER_D, { y: TERR, roofH: 0.6, cols: 8 });
    const pw = X(-0.75);
    p.boxV(pw, TERR - 0.1, zb + 0.78, 0.9, 0.1 + 4 * 0.4, 0.16, '#efe4c6');
    p.extrude([[-0.52, 0], [0.52, 0], [0, 0.32]], 0.1, pw, TERR + 4 * 0.4, zb + 0.84, '#efe4c6', { ao: 0.05 });
    for (const dx of [-0.32, -0.1, 0.1, 0.32]) p.cyl(pw + dx, TERR, zb + 0.9, 0.025, 0.025, 1.2, '#f4ecd6', { seg: 5, ao: 0 });
    // the castle
    ducalCastle(k, X(4.3), -14.7);
    // boats on the river
    const cols = ['#c8302a', '#2c5da8', '#f6f3ea'];
    for (let i = 0; i < 3; i++) k.at(X(-3.8 + i * 2.6) + rng.range(-0.4, 0.4), 0, -10.0 - (i % 2) * 0.7, rng.range(-0.3, 0.3), 2.0, () => boat(k, 0, 0, 'sail', rng, 0, cols[i]));
    town(k, szczStyle, 3, SHORE_Z - 3.0, { rowStep: 0.62, gaps: 0.06, maxSlope: 0.9 });
    woods(k, ['birch', 'pine', 'birch', 'round'], X(-9), X(9), -27, -19.5, 22, [0.9, 1.4], 3);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Gdynia ─────────────────────────────

const gdyniaStyle: HouseStyle = {
  ...hanse,
  walls: ['#f1ece0', '#e9e4d6', '#dcd8cc', '#f4efe4', '#e6d9b8', '#cfd6d8'],
  roofs: ['#8d98a1', '#7f8a92', '#a3392e'],
  floors: [3, 5],
  floorH: 0.17,
  w: [0.4, 0.62],
  d: [0.4, 0.5],
  roofKinds: [['flat', 6], ['hip', 2]],
  pitch: 0.4,
  chimney: 0,
  gap: [0, 0.06],
  door: '#6a7a8a',
};

/** A Sea Towers block: white frame, bands of blue glass on the two visible faces, stepped crown. */
function seaTower(k: PortKit, x: number, z: number, w: number, d: number, h: number): void {
  const p = k.solid;
  const rng = new Rng(k.seed ^ Math.floor(x * 100));
  const y = k.groundMax(x, z, w / 2, d / 2) - 0.02;
  const white = '#eef0ee';
  const glass = '#6fa6c4';
  p.boxV(x, y - 0.2, z, w, 0.2 + h, d, white);
  const rows = Math.max(3, Math.round(h / 0.17));
  const step = (h - 0.25) / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + 0.14 + r * step;
    const lf = rng.chance(0.3) ? k.lit : k.glass;
    const lr = rng.chance(0.3) ? k.lit : k.glass;
    lf.quad([x - w / 2 + 0.04, yy, z + d / 2 + 0.004], [x + w / 2 - 0.04, yy, z + d / 2 + 0.004], [x + w / 2 - 0.04, yy + step * 0.62, z + d / 2 + 0.004], [x - w / 2 + 0.04, yy + step * 0.62, z + d / 2 + 0.004], glass);
    lr.quad([x + w / 2 + 0.004, yy, z + d / 2 - 0.04], [x + w / 2 + 0.004, yy, z - d / 2 + 0.04], [x + w / 2 + 0.004, yy + step * 0.62, z - d / 2 + 0.04], [x + w / 2 + 0.004, yy + step * 0.62, z + d / 2 - 0.04], glass);
  }
  // the crown steps back twice, each step with its own glass crest
  p.boxV(x - w * 0.08, y + h, z, w * 0.78, 0.22, d * 0.8, white);
  p.boxV(x - w * 0.16, y + h + 0.22, z, w * 0.56, 0.2, d * 0.62, tint(white, -0.03));
  k.glass.quad([x - w * 0.47, y + h + 0.04, z + d * 0.4 + 0.004], [x + w * 0.31, y + h + 0.04, z + d * 0.4 + 0.004], [x + w * 0.31, y + h + 0.18, z + d * 0.4 + 0.004], [x - w * 0.47, y + h + 0.18, z + d * 0.4 + 0.004], glass);
  p.cyl(x - w * 0.16, y + h + 0.42, z, 0.012, 0.008, 0.3, '#8a8f94', { seg: 4, ao: 0 });
  k.reserve(x, z, w / 2 + 0.05, d / 2 + 0.05);
}

const gdynia: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9ab872', land2: '#a6bd78', hill: '#6f9966', rock: '#9a9a94', sand: '#dccfa8', haze: '#d3e3eb' };
    k.shape = { relief: 1.3, range: 3.2, rise: 5, rough: 0.4, freq: 0.09 };
    k.shore = 'quay';
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.0, 0.6);
    const X = (d: number): number => cx + s * d;
    // the pier at Kosciuszko Square, with Dar Pomorza moored along it
    const qa = X(-0.8);
    const qb = X(5.7);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.7, -11.8, 0.4, '#938e84');
    rigShip(k, X(2.4), -10.95, 5.9, {
      hull: '#f6f4ee',
      boot: '#2a2f36',
      ports: '#20252c',
      trim: '#e8e4d8',
      mast: '#c9b48a',
      sail: '#eeeadd',
      furled: true,
      poop: true,
      masts: [{ at: 0.3, h: 3.5, rig: 'square', yards: 5 }, { at: -0.02, h: 3.8, rig: 'square', yards: 5 }, { at: -0.32, h: 3.1, rig: 'square', yards: 4 }],
      houses: [[0.04, 0.1, 0.16, '#f4f1ea'], [-0.22, 0.12, 0.14, '#f4f1ea']],
    });
    // the Sea Towers, three white and glass blocks of different heights on a low podium
    podium(k, X(-1.4), -14.4);
    seaTower(k, X(-1.5), -14.95, 0.95, 0.8, 4.3);
    seaTower(k, X(-3.0), -14.25, 0.88, 0.76, 3.1);
    seaTower(k, X(0.1), -14.2, 0.8, 0.72, 2.3);
    // white modernist blocks of 1930s Gdynia
    town(k, gdyniaStyle, 2, SHORE_Z - 1.5, { rowStep: 0.66, gaps: 0.06 });
    woods(k, ['pine', 'pine', 'birch', 'pine'], X(-9), X(9), -27, -18, 36, [0.9, 1.5], 4);
  },
  rows: 0,
  quiet: true,
};

function podium(k: PortKit, x: number, z: number): void {
  const y = k.groundMax(x, z, 1.9, 0.9) - 0.02;
  k.solid.boxV(x, y - 0.2, z, 4.0, 0.2 + 0.5, 1.7, '#e4e2da');
  k.glass.quad([x - 1.8, y + 0.1, z + 0.854], [x + 1.8, y + 0.1, z + 0.854], [x + 1.8, y + 0.4, z + 0.854], [x - 1.8, y + 0.4, z + 0.854], '#6fa6c4');
  k.reserve(x, z, 2.0, 0.9);
}

// ───────────────────────────── Gdańsk ─────────────────────────────

/** The Crane (Żuraw): a brick gate with two towers on the quay, the timber crane house above it, the jib out over the water. */
function zuraw(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.5, 0.6) - 0.02;
  const brick = '#a2492f';
  const dark = '#2a2623';
  const timber = '#6b4a36';
  const W = 2.7;
  const D = 1.15;
  const BH = 1.15;
  const zf = z + D / 2;
  p.boxV(x, y - 0.55, z, W, 0.55 + BH, D, brick);
  p.box(x, y + BH - 0.02, z, W + 0.04, 0.05, D + 0.04, tint(brick, 0.2), { ao: 0 });
  // the water gate: a tall pointed passage
  fq(p, x - 0.3, x + 0.3, y, y + 0.62, zf + 0.005, dark);
  p.tri([x - 0.3, y + 0.62, zf + 0.005], [x + 0.3, y + 0.62, zf + 0.005], [x, y + 0.9, zf + 0.005], dark);
  for (const dx of [-0.62, 0.62]) lancetZ(p, x + dx, y + 0.25, zf, 0.16, 0.6, dark);
  // the towers: a square one on the left, a round one on the right
  const lx = x - 1.0;
  p.boxV(lx, y - 0.55, z, 0.86, 0.55 + 1.95, D, tint(brick, -0.04));
  lancetZ(p, lx, y + 1.1, z + D / 2, 0.14, 0.6, dark);
  lancetX(p, lx + 0.43, y + 1.1, z, 0.14, 0.6, dark);
  p.box(lx, y + 1.95, z, 0.94, 0.05, D + 0.08, tint(brick, 0.2), { ao: 0 });
  p.pyramid(lx, y + 2.0, z, 1.0, 0.9, D + 0.14, '#3f3d44');
  const rx = x + 1.0;
  p.cyl(rx, y - 0.55, z, 0.5, 0.46, 0.55 + 1.75, tint(brick, 0.03), { seg: 12 });
  for (const a of [-0.4, 0.4, 1.1]) cylWindow(p, rx, z, 0.47, a, y + 1.05, y + 1.6, 0.045, dark);
  p.cyl(rx, y + 1.75, z, 0.54, 0.54, 0.06, tint(brick, 0.2), { seg: 12, ao: 0 });
  p.cone(rx, y + 1.81, z, 0.56, 0.9, '#3f3d44', { seg: 12 });
  // the timber crane house between the towers, steep dark roof with the front gable
  const th = 0.85;
  p.boxV(x, y + BH, z, 1.48, th, 1.0, timber);
  for (let i = 0; i < 6; i++) fq(p, x - 0.72 + i * 0.29, x - 0.7 + i * 0.29, y + BH, y + BH + th, z + 0.5 + 0.004, '#3b2a20');
  fq(p, x - 0.74, x + 0.74, y + BH + th * 0.5, y + BH + th * 0.5 + 0.03, z + 0.504, '#3b2a20');
  p.prism(x, y + BH + th, z, 1.62, 0.8, 1.1, '#5a3a30');
  p.tri([x - 0.81, y + BH + th, z + 0.5555], [x + 0.81, y + BH + th, z + 0.5555], [x, y + BH + th + 0.8, z + 0.5555], timber);
  fq(p, x - 0.12, x + 0.12, y + BH + th + 0.15, y + BH + th + 0.45, z + 0.558, dark);
  // the jib and its hoist rope, reaching out over the water
  p.box(x + 0.15, y + BH + th * 0.55, z + 0.4, 0.13, 0.13, 1.6, timber, { rx: -0.1 });
  p.rod([x + 0.15, y + BH + th * 0.55 + 0.13, z + 0.3], [x + 0.15, y + BH + th + 0.55, z + 0.05], 0.012, '#3b2a20', 3);
  p.rod([x + 0.15, y + BH + th * 0.55 + 0.1, z + 1.15], [x + 0.15, y + BH + 0.05, z + 1.15], 0.008, '#3b2a20', 3);
  p.box(x + 0.15, y + BH - 0.12, z + 1.15, 0.07, 0.1, 0.07, '#3b2a20');
  k.reserve(x, z, 1.5, 0.7);
}

/** St Mary's: the biggest brick church there is, a huge square tower with corner turrets and a long steep roof. */
function stMarys(k: PortKit, tx: number, z: number, nd: 1 | -1): void {
  const p = k.solid;
  const y = k.groundMax(tx, z, 0.8, 0.8) - 0.02;
  const brick = '#9c4330';
  const dark = '#2a2623';
  const slate = '#3f3b3a';
  const W = 1.35;
  const H = 3.4;
  p.boxV(tx, y - 0.55, z, W, 0.55 + H, W, brick);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]] as const) p.boxV(tx + dx * W / 2, y - 0.55, z + dz * W / 2, 0.15, 0.55 + H * 0.86, 0.15, tint(brick, -0.08));
  lancetZ(p, tx, y + 0.25, z + W / 2, 0.3, 1.0, dark);
  lancetX(p, tx + W / 2, y + 0.25, z, 0.3, 1.0, dark);
  p.box(tx, y + H * 0.38, z, W + 0.04, 0.05, W + 0.04, tint(brick, 0.2), { ao: 0 });
  for (const f of [-1, 1]) {
    lancetZ(p, tx + f * 0.33, y + H * 0.46, z + W / 2, 0.2, 0.9, dark);
    lancetX(p, tx + W / 2, y + H * 0.46, z + f * 0.33, 0.2, 0.9, dark);
    lancetZ(p, tx + f * 0.33, y + H * 0.78, z + W / 2, 0.2, 0.7, dark);
    lancetX(p, tx + W / 2, y + H * 0.78, z + f * 0.33, 0.2, 0.7, dark);
  }
  p.box(tx, y + H * 0.72, z, W + 0.04, 0.05, W + 0.04, tint(brick, 0.2), { ao: 0 });
  p.box(tx, y + H, z, W + 0.1, 0.07, W + 0.1, tint(brick, 0.2), { ao: 0 });
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    p.boxV(tx + dx * W * 0.42, y + H + 0.07, z + dz * W * 0.42, 0.2, 0.2, 0.2, brick);
    p.pyramid(tx + dx * W * 0.42, y + H + 0.27, z + dz * W * 0.42, 0.24, 0.42, 0.24, slate);
  }
  p.pyramid(tx, y + H + 0.07, z, W * 0.72, 0.5, W * 0.72, slate);
  // the nave: a vast box with an enormous roof, running east
  hall(k, tx + nd * (W / 2 + 2.3), y, z - 0.05, 4.6, 1.55, 1.85, 1.3, '#a24a34', '#7a4034', { bays: 8 });
  // the short transept gables on the front slope
  for (let i = 0; i < 3; i++) p.prism(tx + nd * (W / 2 + 0.9 + i * 1.5), y + 1.85, z + 0.62, 0.55, 0.42, 0.5, '#7a4034');
  k.reserve(tx + nd * 2.0, z, 3.6, 0.9);
}

const gdanskStyle: HouseStyle = {
  ...hanse,
  walls: ['#a2492f', '#b4573a', '#97412c', '#bb6340', '#d9a441', '#8fb6a0', '#e3b8a8', '#c7d3d8'],
  roofs: TILE,
  floors: [3, 4],
  floorH: 0.2,
  roofKinds: [['step', 5], ['front', 3], ['hip', 1]],
};

const gdansk: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9eb872', land2: '#a9bd78', hill: '#789e68', rock: '#9a9a94', sand: '#d6cca9', haze: '#d3e3eb' };
    k.shape = { relief: 0.5, range: 1.6, rise: 6, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.0, 0.6);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x77);
    // the Motlawa quay
    quayDeck(k, cx - 6.6, cx + 6.6, -12.85, -11.9, 0.4, '#938e84');
    zuraw(k, X(-0.8), -13.35);
    // narrow merchant houses with shaped gables in every colour, along the Long Embankment
    const kinds: GableKind[] = ['neck', 'bell', 'step', 'spout', 'neck', 'step', 'bell', 'pediment'];
    const wall: Col[] = ['#d9a441', '#a2492f', '#8fb6a0', '#e3b8a8', '#b4573a', '#c7d3d8', '#d9a441', '#97412c'];
    let d = 2.45;
    for (let i = 0; i < 4; i++) {
      const w = 0.62 + rng.next() * 0.14;
      canalHouse(k, X(-(d + w / 2)), -13.4 - (i % 2) * 0.03, w, 0.72, 3 + (i % 2), wall[i], kinds[i], { fh: 0.42, roof: TILE[i % 4] });
      d += w + 0.02;
    }
    d = 0.85;
    for (let i = 0; i < 4; i++) {
      const w = 0.66 + rng.next() * 0.14;
      canalHouse(k, X(d + w / 2), -13.4 - (i % 2) * 0.03, w, 0.72, 3 + ((i + 1) % 2), wall[(i + 4) % 8], kinds[(i + 4) % 8], { fh: 0.42, roof: TILE[(i + 2) % 4] });
      d += w + 0.02;
    }
    // the Main Town Hall's tall slim spire
    const sx = X(-4.3);
    const sy = LAND_Y - 0.02;
    p.boxV(sx, sy - 0.25, -16.4, 0.5, 0.25 + 1.5, 0.5, '#a2492f');
    lancetZ(p, sx, sy + 0.6, -16.15, 0.12, 0.5, '#2a2623');
    p.box(sx, sy + 1.5, -16.4, 0.56, 0.05, 0.56, '#d9c27a', { ao: 0 });
    needle(p, sx, sy + 1.55, -16.4, 0.26, 2.5, COPPER_D);
    k.reserve(sx, -16.4, 0.4, 0.4);
    stMarys(k, X(4.2), -17.6, s === 1 ? -1 : 1);
    town(k, gdanskStyle, 2, SHORE_Z - 2.6, { rowStep: 0.64, gaps: 0.06 });
    woods(k, ['birch', 'pine', 'birch', 'round'], X(-9), X(9), -27, -20, 20, [0.9, 1.4], 3);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Klaipėda ─────────────────────────────

/** A slanted timber brace (a thin quad on a +z face). */
function brace(p: Part, x0: number, y0: number, x1: number, y1: number, z: number, col: Col, t = 0.011): void {
  p.quad([x0 - t, y0, z], [x0 + t, y0, z], [x1 + t, y1, z], [x1 - t, y1, z], col);
}

/** A half-timbered (Fachwerk) warehouse, gable end to the water: dark posts, beams and braces over plaster. */
function fachwerk(k: PortKit, x: number, z: number, w: number, d: number, floors: number, fh: number, wall: Col, roof: Col, o: { y?: number; beam?: Col; hoist?: boolean } = {}): number {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const H = floors * fh;
  const beam = o.beam ?? '#3b2b22';
  const zf = z + d / 2;
  p.boxV(x, y - 0.25, z, w, 0.25 + H, d, wall);
  const n = Math.max(2, Math.round(w / 0.17));
  const sp = w / n;
  for (let i = 0; i <= n; i++) fq(p, x - w / 2 + i * sp - 0.009, x - w / 2 + i * sp + 0.009, y, y + H, zf + 0.003, beam);
  for (let f = 0; f <= floors; f++) fq(p, x - w / 2, x + w / 2, y + f * fh - 0.011, y + f * fh + 0.011, zf + 0.003, beam);
  for (let f = 0; f < floors; f++) {
    brace(p, x - w / 2 + 0.01, y + f * fh + 0.01, x - w / 2 + sp, y + (f + 1) * fh - 0.01, zf + 0.004, beam);
    brace(p, x + w / 2 - 0.01, y + f * fh + 0.01, x + w / 2 - sp, y + (f + 1) * fh - 0.01, zf + 0.004, beam);
    for (let i = 1; i < n - 1; i++) {
      const cx = x - w / 2 + sp * (i + 0.5);
      if (f === 0 && i === Math.floor(n / 2)) {
        fq(p, cx - 0.055, cx + 0.055, y, y + fh * 0.78, zf + 0.004, '#3a2a20');
        continue;
      }
      pane(k, cx, y + f * fh + fh * 0.26, zf + 0.001, 0.06, fh * 0.46, '#2d3844', 0.3);
    }
  }
  // the right-hand side: posts, beams, a couple of braces
  const xr = x + w / 2 + 0.003;
  const m = Math.max(2, Math.round(d / 0.19));
  for (let i = 0; i <= m; i++) {
    const zp = z + d / 2 - (d / m) * i;
    rq(p, xr, y, y + H, zp + 0.009, zp - 0.009, beam);
  }
  for (let f = 0; f <= floors; f++) rq(p, xr, y + f * fh - 0.011, y + f * fh + 0.011, z + d / 2, z - d / 2, beam);
  // the steep tiled roof, the gable plastered and timbered
  const rh = w * 0.62;
  p.prism(x, y + H, z, w + 0.1, rh, d + 0.06, roof);
  p.tri([x - w / 2 - 0.05, y + H, zf + 0.031], [x + w / 2 + 0.05, y + H, zf + 0.031], [x, y + H + rh, zf + 0.031], wall);
  brace(p, x - w / 2 - 0.05, y + H, x, y + H + rh, zf + 0.034, beam, 0.01);
  brace(p, x + w / 2 + 0.05, y + H, x, y + H + rh, zf + 0.034, beam, 0.01);
  fq(p, x - 0.009, x + 0.009, y + H, y + H + rh * 0.95, zf + 0.034, beam);
  if (o.hoist ?? true) {
    fq(p, x - 0.05, x + 0.05, y + H + rh * 0.16, y + H + rh * 0.4, zf + 0.036, '#3a2a20');
    p.box(x, y + H + rh * 0.78, zf + 0.04, 0.03, 0.03, 0.14, '#3b2b22', { ao: 0 });
  }
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
  return y + H + rh;
}

const klaipedaStyle: HouseStyle = {
  ...hanse,
  walls: ['#e6d6a4', '#e3b8a8', '#bdd0b2', '#a8503a', '#d9a441', '#f1ead7', '#b9cfd8'],
  roofs: ['#a8452f', '#b4573a', '#9c3f2c'],
  floors: [2, 3],
  roofKinds: [['gable', 4], ['front', 4], ['hip', 1], ['step', 1]],
  pitch: 0.85,
};

const klaipeda: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9cb771', land2: '#a8bd78', hill: '#7a9d68', rock: '#9a9a94', sand: '#dccfa8', haze: '#d3e3eb' };
    k.shape = { relief: 0.4, range: 1.4, rise: 6, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -14.0, 0.6);
    // the Dane runs in from the sea beside the old town
    river(k, cx + s * -3.6, 0.75, { bank: 0.8, sway: 0.5 });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.0, 0.6);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x4b);
    // Meridianas, the three-masted barquentine, moored along the old town quay
    const qa = X(-2.1);
    const qb = X(3.0);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.7, -11.85, 0.4, '#938e84');
    rigShip(k, X(0.45), -10.95, 4.8, {
      hull: '#2a2d33',
      trim: '#f1ece0',
      mast: '#8a6f4e',
      sail: '#f4f0e4',
      poop: true,
      masts: [{ at: 0.28, h: 2.9, rig: 'square', yards: 4 }, { at: -0.04, h: 3.1, rig: 'gaff' }, { at: -0.3, h: 2.6, rig: 'gaff' }],
      houses: [[-0.2, 0.12, 0.15, '#f1ece0']],
    });
    // timber-framed warehouses behind it
    const walls: Col[] = ['#e9dfc0', '#c9593f', '#e6c06a', '#f1ece0', '#9c4636', '#d8c68c', '#e9dfc0'];
    const roofs: Col[] = ['#a8452f', '#7a3f33', '#a8452f', '#8a4a38', '#a8452f', '#7a3f33', '#a8452f'];
    let d = -2.0;
    for (let i = 0; i < 6; i++) {
      const w = 0.7 + rng.next() * 0.16;
      fachwerk(k, X(d + w / 2), -13.45 - (i % 2) * 0.05, w, 0.86, 2 + (i % 3 === 1 ? 1 : 0), 0.4, walls[i], roofs[i], { hoist: i % 2 === 0 });
      d += w + 0.02;
    }
    // the river bridge: a plain deck on abutments over the Dane
    const bx = X(-3.6);
    p.box(bx, 0.42, -15.4, 3.4, 0.09, 0.34, '#6b5a4a');
    p.box(bx, 0.51, -15.4 + 0.15, 3.4, 0.07, 0.02, '#3b2b22', { ao: 0 });
    p.box(bx, 0.51, -15.4 - 0.15, 3.4, 0.07, 0.02, '#3b2b22', { ao: 0 });
    for (const sd of [-1, 1]) p.box(bx + sd * 1.5, -0.9, -15.4, 0.22, 1.35, 0.4, '#9a9488');
    k.reserve(bx, -15.4, 1.8, 0.4);
    // container terminal: gantry cranes on a quay slab and stacks behind them
    const ca = X(3.3);
    const cb = X(5.8);
    quayDeck(k, Math.min(ca, cb), Math.max(ca, cb), -12.85, -11.9, 0.4, '#a09b90');
    for (let i = 0; i < 2; i++) gantryCrane(k, X(3.9 + i * 1.5), -12.6, { color: '#c8302a', s: 1.0 });
    containerStack(k, Math.min(X(3.5), X(5.5)), -13.6, 9, 4, 4, rng);
    containerStack(k, Math.min(X(3.7), X(5.3)), -14.8, 7, 3, 3, rng);
    town(k, klaipedaStyle, 2, SHORE_Z - 3.0, { rowStep: 0.64, gaps: 0.08 });
    woods(k, ['pine', 'birch', 'birch', 'round'], X(-9), X(9), -27, -16.5, 40, [0.9, 1.5], 4);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Riga ─────────────────────────────

/** An Art Nouveau facade: pastel stone, bands over the windows, balconies, a sculpted crown and sometimes a corner turret. */
function nouveau(k: PortKit, x: number, z: number, w: number, floors: number, wall: Col, roof: Col, turret: -1 | 0 | 1, rng: Rng): number {
  const p = k.solid;
  const d = 0.62;
  const fh = 0.27;
  const y = k.groundMax(x, z, w / 2, d / 2);
  const H = floors * fh;
  const zf = z + d / 2;
  const trim = tint(wall, -0.2);
  p.boxV(x, y - 0.25, z, w, 0.25 + H, d, wall);
  winZ(k, x, y + fh * 0.2, zf, w - 0.1, H - fh * 0.2, Math.max(2, Math.round(w / 0.2)), floors, '#2f3a48', 0.46, 0.5, 0.3);
  winX(k, x + w / 2, y + fh * 0.2, z, d - 0.08, H - fh * 0.2, 2, floors, '#2f3a48', 0.46, 0.5, 0.3);
  for (let f = 1; f <= floors; f++) p.box(x, y + f * fh - 0.02, z, w + 0.01, 0.03, d + 0.01, trim, { ao: 0 });
  p.box(x, y + H - 0.01, z, w + 0.07, 0.06, d + 0.07, tint(wall, 0.16), { ao: 0 });
  // balconies and a face mask over the entrance
  for (const dx of [-0.25, 0.25]) if (Math.abs(dx) < w / 2 - 0.1) p.box(x + dx * (w / 0.8) * 0.5, y + fh * 2, zf + 0.03, 0.2, 0.025, 0.08, '#2f3a48', { ao: 0 });
  p.ball(x, y + fh * 0.9, zf + 0.01, 0.045, tint(wall, 0.2), { sz: 0.3 });
  // a sculpted crown: a flattened dome over the middle, small finials
  p.ball(x, y + H + 0.02, zf - 0.15, w * 0.34, tint(wall, 0.08), { sy: 0.5, sz: 0.55 });
  p.prism(x, y + H + 0.04, z - 0.05, w + 0.02, 0.28, d - 0.1, roof, { ry: Math.PI / 2 * 0 + Math.PI / 2 });
  if (turret) {
    const tx = x + turret * (w / 2 - 0.09);
    const tz = zf - 0.09;
    p.cyl(tx, y - 0.1, tz, 0.11, 0.11, 0.1 + H + 0.12 + rng.range(0, 0.1), tint(wall, 0.05), { seg: 8 });
    p.cone(tx, y + H + 0.14, tz, 0.15, 0.5 + rng.range(0, 0.15), rng.chance(0.5) ? COPPER_D : '#4a4f58', { seg: 8 });
  }
  k.reserve(x, z, w / 2 + 0.02, d / 2 + 0.02);
  return y + H;
}

/** St Peter's: a brick tower, a stone lantern, then the very tall verdigris spire topped by a gilded cockerel. */
function rigaPeter(k: PortKit, x: number, z: number, side: 1 | -1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.5, 0.5) - 0.02;
  const brick = '#a2492f';
  const dark = '#2a2623';
  const stone = '#d6ccb4';
  p.boxV(x, y - 0.55, z, 0.98, 0.55 + 1.6, 0.98, brick);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]] as const) p.boxV(x + dx * 0.49, y - 0.55, z + dz * 0.49, 0.12, 0.55 + 1.45, 0.12, tint(brick, -0.08));
  lancetZ(p, x, y + 0.2, z + 0.49, 0.26, 0.9, dark);
  lancetX(p, x + 0.49, y + 0.2, z, 0.26, 0.9, dark);
  p.box(x, y + 1.6, z, 1.05, 0.05, 1.05, stone, { ao: 0 });
  p.boxV(x, y + 1.65, z, 0.76, 0.75, 0.76, tint(brick, 0.05));
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * 0.17, y + 1.78, z + 0.38, 0.14, 0.5, dark);
    lancetX(p, x + 0.38, y + 1.78, z + f * 0.17, 0.14, 0.5, dark);
  }
  p.box(x, y + 2.4, z, 0.82, 0.05, 0.82, stone, { ao: 0 });
  // the octagonal stone lantern, then the spire's broad foot and its long needle
  p.cyl(x, y + 2.45, z, 0.34, 0.3, 0.5, stone, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    p.box(x + Math.cos(a) * 0.3, y + 2.55, z + Math.sin(a) * 0.3, 0.1, 0.3, 0.1, dark, { ao: 0, ry: -a });
  }
  p.cyl(x, y + 2.95, z, 0.38, 0.38, 0.04, tint(stone, -0.1), { seg: 8, ao: 0 });
  p.lathe(x, y + 2.99, z, [[0.36, 0], [0.38, 0.08], [0.26, 0.28], [0.17, 0.46], [0.1, 0.6]], COPPER_D, { seg: 8 });
  needle(p, x, y + 3.59, z, 0.1, 1.5, COPPER_D, 8);
  k.reserve(x, z, 0.6, 0.6);
  // the long church body behind the tower
  hall(k, x - side * 1.7, y, z - 0.7, 2.6, 1.3, 1.1, 0.95, '#a95a3e', '#6a3a2e', { bays: 5 });
}

const rigaOldStyle: HouseStyle = {
  ...hanse,
  walls: ['#a2492f', '#b4573a', '#e4c58c', '#e6d6a4', '#dca89c', '#bdd0b2', '#97412c', '#c9b99a'],
  roofs: ['#8a3f2e', '#7a3f33', '#a8452f'],
  roofKinds: [['step', 4], ['front', 3], ['gable', 2], ['hip', 1]],
  floors: [3, 4],
  floorH: 0.2,
};

const riga: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9cb571', land2: '#a8bb78', hill: '#789c68', rock: '#9a9a94', sand: '#d8cdaa', haze: '#d3e3eb' };
    k.shape = { relief: 0.35, range: 1.3, rise: 7, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.6);
    // the Daugava
    river(k, cx + s * 5.4, 1.5, { bank: 0.9, sway: 0.4 });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.6);
    const X = (d: number): number => cx + s * d;
    const rng = new Rng(k.seed ^ 0x72);
    // the Vansu bridge: one tall leaning pylon on the old town bank, a fan of stays over the river
    const pylon = X(3.7);
    const bx0 = Math.min(X(3.2), X(9.4));
    const bx1 = Math.max(X(3.2), X(9.4));
    vansuBridge(k, bx0, bx1, -17.4, pylon, s, 0.95, 4.1);
    k.reserve((bx0 + bx1) / 2, -17.4, (bx1 - bx0) / 2, 0.3);
    // the old town: St Peter's and a row of step-gabled merchants' houses
    rigaPeter(k, X(0.0), -15.4, s);
    const kinds: GableKind[] = ['step', 'neck', 'step', 'bell', 'step'];
    const wall: Col[] = ['#a2492f', '#e4c58c', '#b4573a', '#dca89c', '#8a3b2a'];
    let d = 2.0;
    for (let i = 0; i < 4; i++) {
      const w = 0.62 + rng.next() * 0.12;
      canalHouse(k, X(-(d + w / 2)), -13.4 - (i % 2) * 0.03, w, 0.7, 3 + (i % 2), wall[i], kinds[i], { fh: 0.38, roof: TILE[i % 4] });
      d += w + 0.02;
    }
    // Art Nouveau between the church and the river: tall pastel facades with turrets
    const nw: Col[] = ['#e3c58b', '#b9cfd8', '#dca89c', '#c8d6b0', '#e8dcb0'];
    const nr: Col[] = ['#4c8372', '#4a4f58', '#6a3a2e', '#4c8372', '#4a4f58'];
    d = 1.8;
    for (let i = 0; i < 3; i++) {
      const w = 0.7 + rng.next() * 0.2;
      nouveau(k, X(d + w / 2), -13.7 - (i % 2) * 0.1, w, 5 + (i % 2), nw[i], nr[i], (s * (i % 2 ? 1 : -1)) as -1 | 1, rng);
      d += w + 0.02;
    }
    // quay and a boat on the river
    const qa = X(1.6);
    const qb = X(4.0);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.85, -11.9, 0.4, '#938e84');
    k.at(X(5.6), 0, -11.4, 0.15, 2.2, () => boat(k, 0, 0, 'sail', rng, 0, '#c8302a'));
    town(k, rigaOldStyle, 2, SHORE_Z - 3.2, { rowStep: 0.64, gaps: 0.06 });
    woods(k, ['pine', 'birch', 'birch', 'round'], X(-9), X(9), -27, -20, 20, [0.9, 1.4], 3);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Tallinn ─────────────────────────────

const REDCONE = ['#b3452f', '#a33f2c', '#bd5231'];

/** A tower of the town wall: round or square, limestone, with a tall red cone or pyramid roof. */
function wallTower(k: PortKit, x: number, z: number, r: number, h: number, round: boolean, wall: Col, cone: Col, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const dark = '#2a2623';
  if (round) {
    p.cyl(x, y - 0.25, z, r * 1.06, r, 0.25 + h, wall, { seg: 10 });
    p.cyl(x, y + h, z, r * 1.14, r * 1.14, 0.05, tint(wall, 0.16), { seg: 10, ao: 0 });
    p.cone(x, y + h + 0.05, z, r * 1.2, r * 2.8, cone, { seg: 10 });
    for (const a of [-0.35, 0.5, 1.2]) cylWindow(p, x, z, r, a, y + h * 0.5, y + h * 0.78, 0.028, dark);
  } else {
    const w = r * 1.9;
    p.boxV(x, y - 0.25, z, w, 0.25 + h, w, wall);
    p.box(x, y + h, z, w + 0.06, 0.05, w + 0.06, tint(wall, 0.16), { ao: 0 });
    p.pyramid(x, y + h + 0.05, z, w + 0.12, r * 2.9, w + 0.12, cone);
    fq(p, x - 0.025, x + 0.025, y + h * 0.5, y + h * 0.8, z + w / 2 + 0.004, dark);
    rq(p, x + w / 2 + 0.004, y + h * 0.5, y + h * 0.8, z + 0.025, z - 0.025, dark);
  }
  p.ball(x, y + h + 0.05 + r * 2.8 + 0.02, z, 0.02, GOLD);
  k.reserve(x, z, r + 0.05, r + 0.05);
}

const tallinnStyle: HouseStyle = {
  ...hanse,
  walls: ['#e6d6a4', '#dca89c', '#bdd0b2', '#e4c58c', '#c9b99a', '#f1ead7', '#e8b9a0', '#b9cfd8'],
  roofs: ['#b3452f', '#a33f2c', '#bd5231', '#9c3b29'],
  floors: [2, 3],
  floorH: 0.2,
  roofKinds: [['gable', 4], ['front', 3], ['hip', 2], ['step', 1]],
  pitch: 0.8,
};

const tallinn: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9ab570', land2: '#a6bb76', hill: '#7a9f68', rock: '#a8a79c', sand: '#d8cdaa', haze: '#d3e3eb' };
    k.shape = { relief: 0.5, range: 1.8, rise: 6, rough: 0.35, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -16.0, 0.6);
    // Toompea: a steep limestone knoll with a flat top
    k.bump(cx + s * -0.6, -20.6, 6.2, 3.8, 2.5, 0.8);
    k.plateau(cx + s * -0.6, -20.4, 3.9, 1.7, 2.62, 0.45);
    const rock = c3('#b3ad9a');
    k.paint((x, y, z, slope, c) => {
      if (y > 0.9 && slope > 0.1) c.lerp(rock, 0.55);
    });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -16.0, 0.6);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const y0 = LAND_Y - 0.02;
    // Toompea castle (pink), the Tall Hermann tower, and the Alexander Nevsky cathedral with black domes
    const kx = X(-1.4);
    const ty = k.groundMax(kx, -20.6, 1.4, 0.6) - 0.02;
    p.boxV(kx, ty - 0.6, -20.6, 2.8, 0.6 + 1.1, 0.95, '#e6b9b0');
    winZ(k, kx, ty + 0.15, -20.6 + 0.475, 2.4, 0.85, 8, 2, '#3a3a40', 0.4, 0.5);
    winX(k, kx + 1.4, ty + 0.15, -20.6, 0.8, 0.85, 2, 2, '#3a3a40', 0.4, 0.5);
    p.box(kx, ty + 1.08, -20.6, 2.9, 0.05, 1.0, '#f4eadc', { ao: 0 });
    hipRoof(p, kx, ty + 1.12, -20.6, 2.8, 0.95, 0.5, '#59635c');
    const hx = X(-2.5);
    p.boxV(hx, ty - 0.6, -20.9, 0.42, 0.6 + 2.55, 0.42, '#e6b9b0');
    fq(p, hx - 0.05, hx + 0.05, ty + 1.7, ty + 2.1, -20.9 + 0.214, '#3a3a40');
    p.box(hx, ty + 2.55, -20.9, 0.5, 0.05, 0.5, '#f4eadc', { ao: 0 });
    p.pyramid(hx, ty + 2.6, -20.9, 0.5, 0.55, 0.5, '#59635c');
    p.cyl(hx + 0.2, ty + 3.15, -20.9, 0.006, 0.006, 0.35, '#6a6a6a', { seg: 4, ao: 0 });
    p.tri([hx + 0.2, ty + 3.1, -20.9], [hx + 0.2, ty + 3.4, -20.9], [hx + 0.6, ty + 3.25, -20.9], '#2c5da8', true);
    k.reserve(kx, -20.6, 1.6, 0.7);
    // the cathedral: a cube with ochre bands, a big black dome and four small ones, and a bell tower
    const nx = X(2.1);
    const nz = -20.2;
    const ny = k.groundMax(nx, nz, 0.7, 0.7) - 0.02;
    p.boxV(nx, ny - 0.6, nz, 1.3, 0.6 + 1.05, 1.1, '#e2d8bc');
    p.box(nx, ny + 0.5, nz, 1.34, 0.05, 1.14, '#c9a35b', { ao: 0 });
    lancetZ(p, nx - 0.3, ny + 0.15, nz + 0.55, 0.16, 0.5, '#3a3a40');
    lancetZ(p, nx + 0.3, ny + 0.15, nz + 0.55, 0.16, 0.5, '#3a3a40');
    lancetX(p, nx + 0.65, ny + 0.15, nz, 0.16, 0.5, '#3a3a40');
    p.cyl(nx, ny + 1.05, nz, 0.3, 0.3, 0.35, '#e8e0c8', { seg: 10 });
    p.lathe(nx, ny + 1.4, nz, [[0.3, 0], [0.34, 0.08], [0.3, 0.26], [0.16, 0.46], [0.05, 0.6], [0.001, 0.66]], '#2e3238', { seg: 10 });
    p.cyl(nx, ny + 2.0, nz, 0.01, 0.008, 0.2, GOLD, { seg: 4, ao: 0 });
    for (const [dx, dz] of [[-0.5, 0.4], [0.5, 0.4], [-0.5, -0.4], [0.5, -0.4]] as const) {
      p.cyl(nx + dx, ny + 1.05, nz + dz, 0.12, 0.12, 0.18, '#e8e0c8', { seg: 8 });
      p.lathe(nx + dx, ny + 1.23, nz + dz, [[0.12, 0], [0.14, 0.04], [0.12, 0.14], [0.06, 0.24], [0.001, 0.3]], '#2e3238', { seg: 8 });
    }
    const bxx = nx - 1.0;
    p.boxV(bxx, ny - 0.6, nz + 0.1, 0.5, 0.6 + 1.7, 0.5, '#e2d8bc');
    lancetZ(p, bxx, ny + 0.5, nz + 0.35, 0.14, 0.45, '#3a3a40');
    p.box(bxx, ny + 1.55, nz + 0.1, 0.56, 0.05, 0.56, '#c9a35b', { ao: 0 });
    p.boxV(bxx, ny + 1.4, nz + 0.1, 0.4, 0.4, 0.4, '#d8cba8');
    p.lathe(bxx, ny + 1.7, nz + 0.1, [[0.22, 0], [0.26, 0.06], [0.2, 0.2], [0.1, 0.34], [0.001, 0.42]], '#2e3238', { seg: 8 });
    k.reserve(nx - 0.5, nz, 1.7, 0.8);
    // a limestone parapet round the front of the castle plateau, with two small towers
    const px0 = X(-0.6);
    for (let i = 0; i < 10; i++) {
      const a = -1.25 + (i / 9) * 2.5;
      const wx = px0 + 3.7 * Math.sin(a);
      const wz = -20.4 + 1.62 * Math.cos(a);
      const base = k.groundMin(wx, wz, 0.45, 0.2) - 0.1;
      p.box(wx, base, wz, 0.82, 2.84 - base, 0.3, '#cfc4a8', { ry: Math.atan2(1.62 * Math.sin(a), 3.7 * Math.cos(a)) });
    }
    for (const a of [-0.75, 0.8]) {
      const wx = px0 + 3.7 * Math.sin(a);
      const wz = -20.4 + 1.62 * Math.cos(a);
      const base = k.groundMin(wx, wz, 0.3, 0.3) - 0.1;
      p.cyl(wx, base, wz, 0.3, 0.28, 2.84 - base, '#cfc4a8', { seg: 8 });
      p.cone(wx, 2.84, wz, 0.34, 0.55, REDCONE[1], { seg: 8 });
    }
    // St Olaf's: a limestone tower under a very tall slender spire
    const ox = X(-3.8);
    const oz = -16.5;
    p.boxV(ox, y0 - 0.25, oz, 0.78, 0.25 + 1.7, 0.78, '#cfc3a4');
    lancetZ(p, ox, y0 + 0.3, oz + 0.39, 0.22, 0.8, '#2a2623');
    lancetX(p, ox + 0.39, y0 + 0.3, oz, 0.22, 0.8, '#2a2623');
    for (const f of [-1, 1]) lancetZ(p, ox + f * 0.18, y0 + 1.1, oz + 0.39, 0.13, 0.5, '#2a2623');
    p.box(ox, y0 + 1.7, oz, 0.84, 0.05, 0.84, '#e0d6bb', { ao: 0 });
    needle(p, ox, y0 + 1.75, oz, 0.34, 2.9, COPPER_D, 8);
    k.reserve(ox, oz, 0.6, 0.6);
    hall(k, ox + s * 1.6, y0, oz - 0.2, 2.3, 1.0, 0.9, 0.7, '#d6ccb0', '#7a3f33', { bays: 4 });
    // the town wall with its towers and Fat Margaret
    const zwall = -14.4;
    const wallCol = '#cfc4a8';
    p.boxV(cx, y0 - 0.25, zwall, 12.4, 0.25 + 0.85, 0.34, wallCol);
    p.box(cx, y0 + 0.85, zwall, 12.4, 0.05, 0.4, tint(wallCol, 0.16), { ao: 0 });
    for (let i = 0; i < 40; i++) {
      const sx = cx - 6.1 + i * 0.31;
      p.box(sx, y0 + 0.9, zwall + 0.15, 0.14, 0.09, 0.07, tint(wallCol, 0.08), { ao: 0 });
    }
    const towers: Array<[number, number, boolean, number]> = [[-5.6, 0.3, true, 1.55], [-3.8, 0.28, false, 1.5], [-1.9, 0.33, true, 1.85], [0.1, 0.28, false, 1.55], [2.0, 0.35, true, 2.05], [4.0, 0.3, true, 1.6], [5.8, 0.28, false, 1.5]];
    towers.forEach(([dx, r, round, h], i) => wallTower(k, X(dx), zwall, r, h, round, wallCol, REDCONE[i % 3], y0));
    // Fat Margaret, the great round gun tower by the sea gate
    const fx = X(-5.0);
    const fz = -13.0;
    p.cyl(fx, y0 - 0.25, fz, 0.8, 0.76, 0.25 + 1.2, '#bdae8c', { seg: 14 });
    p.cyl(fx, y0 + 1.2, fz, 0.84, 0.84, 0.07, '#d6caa8', { seg: 14, ao: 0 });
    p.cone(fx, y0 + 1.27, fz, 0.86, 0.38, '#b3452f', { seg: 14 });
    for (const a of [-0.6, 0.0, 0.6, 1.2]) cylWindow(p, fx, fz, 0.78, a, y0 + 0.55, y0 + 0.78, 0.035, '#2a2623');
    k.reserve(fx, fz, 0.9, 0.9);
    // red-roofed lower town round the foot of the hill
    town(k, tallinnStyle, 2, zwall - 0.7, { rowStep: 0.64, gaps: 0.06 });
    woods(k, ['birch', 'pine', 'birch'], X(-5), X(4), -19.6, -15.6, 16, [0.9, 1.3], 3);
    woods(k, ['pine', 'birch', 'birch', 'pine'], X(-9), X(9), -27, -18, 26, [0.9, 1.4], 3);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Helsinki ─────────────────────────────

const GRANITE = ['#a99d92', '#b8aca0', '#9c9086', '#c0b3a6'];

/** A gilded onion dome on a drum top: `s` scales it, base radius ≈ 0.18 s. */
function onion(p: Part, x: number, y: number, z: number, s: number, col: Col = '#e0b02e'): void {
  p.lathe(x, y, z, [[0.17 * s, 0], [0.3 * s, 0.12 * s], [0.34 * s, 0.26 * s], [0.26 * s, 0.43 * s], [0.1 * s, 0.6 * s], [0.02 * s, 0.7 * s], [0.001, 0.74 * s]], col, { seg: 10 });
  p.cyl(x, y + 0.7 * s, z, 0.008, 0.006, 0.16 * s, GOLD, { seg: 4, ao: 0 });
  p.box(x, y + 0.8 * s, z, 0.07 * s, 0.012, 0.012, GOLD, { ao: 0 });
}

/** The Lutheran cathedral: a white Greek-cross church with a pedimented portico, a big green dome on a drum and four small domes. */
function helsinkiCathedral(k: PortKit, x: number, z: number, y: number): void {
  const p = k.solid;
  const white = '#f3f1ea';
  const green = '#6aa591';
  const dark = '#2d3844';
  const W = 1.75;
  const H = 1.1;
  p.boxV(x, y - 0.9, z, 3.0, 0.9 + 0.1, 2.5, '#cfc8bb');
  const by = y + 0.1;
  p.boxV(x, by, z, W, H, W, white);
  winZ(k, x, by + 0.3, z + W / 2, W * 0.8, 0.55, 5, 1, dark, 0.34, 0.8);
  p.box(x, by + H - 0.02, z, W + 0.06, 0.05, W + 0.06, '#dcd8cc', { ao: 0 });
  // the portico in front: six columns under a pediment
  const fz = z + W / 2 + 0.2;
  p.boxV(x, by, fz - 0.06, 1.3, 0.92, 0.5, white);
  for (let i = 0; i < 6; i++) p.cyl(x - 0.55 + i * 0.22, by, fz + 0.2, 0.04, 0.038, 0.85, '#fbfaf5', { seg: 7, ao: 0.05 });
  p.box(x, by + 0.85, fz + 0.1, 1.38, 0.07, 0.56, '#e6e2d6');
  p.extrude([[-0.72, 0], [0.72, 0], [0, 0.26]], 0.12, x, by + 0.92, fz + 0.1, white, { ao: 0.04 });
  fq(p, x - 0.2, x + 0.2, by + 0.04, by + 0.55, fz + 0.255, dark);
  // the east arm (the side the camera sees)
  p.boxV(x + W / 2 + 0.24, by, z, 0.5, 0.92, 1.1, white);
  lancetX(p, x + W / 2 + 0.49, by + 0.2, z, 0.2, 0.5, dark);
  p.extrude([[-0.52, 0], [0.52, 0], [0, 0.24]], 0.1, x + W / 2 + 0.24, by + 0.92, z, white, { ao: 0.04, ry: Math.PI / 2 });
  // drum, dome and lantern
  const dy = by + H;
  p.cyl(x, dy, z, 0.64, 0.62, 0.62, white, { seg: 16 });
  for (let a = -1.5; a <= 1.6; a += 0.34) cylWindow(p, x, z, 0.63, a, dy + 0.18, dy + 0.46, 0.05, dark);
  p.cyl(x, dy + 0.58, z, 0.69, 0.69, 0.05, '#e3dfd2', { seg: 16, ao: 0 });
  p.lathe(x, dy + 0.63, z, [[0.68, 0], [0.68, 0.06], [0.6, 0.28], [0.42, 0.5], [0.2, 0.66], [0.09, 0.74]], green, { seg: 16 });
  p.cyl(x, dy + 1.36, z, 0.1, 0.1, 0.2, white, { seg: 8 });
  p.lathe(x, dy + 1.56, z, [[0.12, 0], [0.1, 0.07], [0.04, 0.13], [0.001, 0.16]], green, { seg: 8 });
  p.cyl(x, dy + 1.7, z, 0.007, 0.007, 0.14, GOLD, { seg: 4, ao: 0 });
  p.box(x, dy + 1.78, z, 0.07, 0.012, 0.012, GOLD, { ao: 0 });
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    p.cyl(x + dx * 0.78, by + H - 0.02, z + dz * 0.78, 0.2, 0.2, 0.34, white, { seg: 8 });
    p.lathe(x + dx * 0.78, by + H + 0.32, z + dz * 0.78, [[0.22, 0], [0.22, 0.04], [0.16, 0.14], [0.07, 0.24], [0.001, 0.3]], green, { seg: 8 });
    p.ball(x + dx * 0.78, by + H + 0.64, z + dz * 0.78, 0.022, GOLD);
  }
  k.reserve(x, z, 1.7, 1.4);
}

/** The Orthodox cathedral on its granite outcrop: red brick, a green roof and a crowd of gilded onion domes. */
function uspenski(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.1, 0.8) - 0.02;
  const brick = '#a3452e';
  const green = '#4c8372';
  const dark = '#2a2623';
  p.boxV(x, y - 0.6, z, 2.1, 0.6 + 1.0, 1.5, brick);
  for (let i = 0; i < 5; i++) lancetZ(p, x - 0.8 + i * 0.4, y + 0.2, z + 0.75, 0.14, 0.6, dark);
  for (let i = 0; i < 3; i++) lancetX(p, x + 1.05, y + 0.2, z + 0.4 - i * 0.4, 0.14, 0.6, dark);
  p.box(x, y + 0.98, z, 2.16, 0.05, 1.56, '#d6ccb4', { ao: 0 });
  p.box(x, y + 0.55, z + 0.752, 2.1, 0.03, 0.01, '#d6ccb4', { ao: 0 });
  hipRoof(p, x, y + 1.0, z, 2.1, 1.5, 0.42, green);
  // the apse to the east
  p.cyl(x + 1.05, y - 0.6, z - 0.05, 0.5, 0.5, 0.6 + 0.95, brick, { seg: 10 });
  p.cone(x + 1.05, y + 0.65, z - 0.05, 0.56, 0.5, green, { seg: 10 });
  // the great central drum with its gold onion, and four smaller ones at the corners
  p.cyl(x - 0.1, y + 1.0, z - 0.1, 0.4, 0.4, 0.62, brick, { seg: 8 });
  for (let a = -1.4; a <= 1.5; a += 0.7) cylWindow(p, x - 0.1, z - 0.1, 0.4, a, y + 1.25, y + 1.52, 0.04, dark);
  p.cyl(x - 0.1, y + 1.62, z - 0.1, 0.44, 0.44, 0.05, '#d6ccb4', { seg: 8, ao: 0 });
  onion(p, x - 0.1, y + 1.67, z - 0.1, 1.45);
  for (const [dx, dz] of [[-0.75, 0.5], [0.55, 0.5], [-0.75, -0.55], [0.55, -0.55]] as const) {
    p.cyl(x + dx, y + 0.98, z + dz, 0.15, 0.15, 0.4, brick, { seg: 8 });
    onion(p, x + dx, y + 1.38, z + dz, 0.75);
  }
  // a bell tower at the front corner
  const bx = x - 1.2;
  const bz = z + 0.45;
  p.boxV(bx, y - 0.6, bz, 0.42, 0.6 + 1.5, 0.42, brick);
  lancetZ(p, bx, y + 0.9, bz + 0.21, 0.12, 0.4, dark);
  p.cone(bx, y + 1.5, bz, 0.3, 0.55, green, { seg: 8 });
  p.ball(bx, y + 2.08, bz, 0.025, GOLD);
  k.reserve(x, z, 1.5, 1.0);
}

const helsinkiStyle: HouseStyle = {
  ...hanse,
  walls: ['#e6d9a8', '#e8c9a0', '#d9d4c0', '#e4b8a8', '#c9d4b0', '#f1ead7', '#c9b99a'],
  roofs: ['#4a4f58', '#59635c', '#6a3a2e'],
  floors: [3, 5],
  floorH: 0.18,
  w: [0.4, 0.62],
  roofKinds: [['flat', 4], ['hip', 3], ['gable', 1]],
  pitch: 0.4,
  gap: [0, 0.05],
  door: '#5a6a7a',
  chimney: 0.1,
};

const helsinki: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#93a875', land2: '#889f6e', hill: '#6a8c62', rock: '#a69b90', sand: '#b3a99d', haze: '#d3e3eb' };
    k.shape = { relief: 1.3, range: 3.0, rise: 5, rough: 0.5, freq: 0.1 };
    k.shore = 'rock';
    const s = k.mole.dir;
    const cx = centre(k, -15.5, 0.6);
    // the cathedral hill and the granite knoll under the Orthodox cathedral
    k.bump(cx + s * 1.7, -17.8, 4.6, 3.2, 1.5, 0.9);
    k.plateau(cx + s * 1.7, -17.5, 2.3, 1.45, 1.55, 0.4);
    k.bump(cx + s * -4.4, -15.4, 2.5, 1.7, 1.0, 1.1);
    k.plateau(cx + s * -4.4, -15.4, 1.5, 1.0, 0.98, 0.4);
    const granite = c3('#b0a499');
    k.paint((x, y, z, slope, c) => {
      if (z > -16.4 && z < -12.2 && y > 0.5 && Math.abs(x - (cx + s * -4.4)) < 3.2) c.lerp(granite, 0.6 * smooth(0.5, 0.9, y));
    });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -15.5, 0.6);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x48);
    const hx = X(1.7);
    const hz = -17.6;
    const hy = 1.5;
    helsinkiCathedral(k, hx, hz, hy);
    // the granite steps up from the square to the cathedral, wide flights between low walls
    const fz = hz + 0.875 + 0.2 + 0.5;
    for (let i = 0; i < 7; i++) {
      const top = hy - (i + 1) * ((hy - LAND_Y) / 7.5);
      const dz = 0.16 * (i + 1);
      p.box(hx, 0.25, fz + dz / 2 - 0.1, 2.4 - i * 0.04, top - 0.25 + 0.02, dz + 0.2, i % 2 ? '#c2bbae' : '#cbc4b7');
    }
    for (const sd of [-1, 1]) p.boxV(hx + sd * 1.28, 0.2, fz + 0.62, 0.14, hy - 0.2 - 0.3, 1.3, '#b9b1a3');
    k.reserve(hx, fz + 0.5, 1.6, 1.0);
    uspenski(k, X(-4.4), -15.4);
    // neoclassical Empire-style blocks along the waterfront, then the pastel city
    const qa = X(-2.6);
    const qb = X(5.8);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.75, -11.9, 0.4, '#a79f94');
    town(k, helsinkiStyle, 3, SHORE_Z - 1.2, { rowStep: 0.64, gaps: 0.05, maxSlope: 0.6 });
    // granite skerries and boulders along the shore, a few sailing boats off them
    boulders(k, rng, Math.min(X(-8), X(-3)), Math.max(X(-8), X(-3)), 12, GRANITE, SHORE_Z - 0.3, SHORE_Z + 0.4);
    boulders(k, rng, Math.min(X(6), X(9)), Math.max(X(6), X(9)), 8, GRANITE, SHORE_Z - 0.3, SHORE_Z + 0.4);
    const cols = ['#f6f3ea', '#c8302a', '#2c5da8'];
    for (let i = 0; i < 3; i++) k.at(X(-1.5 + i * 2.7), 0, -10.2 - (i % 2) * 0.6, rng.range(-0.3, 0.3), 2.0, () => boat(k, 0, 0, 'sail', rng, 0, cols[i]));
    woods(k, ['pine', 'pine', 'birch', 'pine'], X(-9), X(9), -28, -20, 30, [1.0, 1.6], 4);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Kotka ─────────────────────────────

/** A cylindrical silo / wood-chip tank with a conical roof. */
function silo(k: PortKit, x: number, z: number, r: number, h: number, wall: Col, roof: Col): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r, r) - 0.02;
  p.cyl(x, y - 0.2, z, r, r, 0.2 + h, wall, { seg: 12 });
  p.cone(x, y + h, z, r * 1.04, r * 0.5, roof, { seg: 12 });
  k.reserve(x, z, r + 0.05, r + 0.05);
}

/** Stacks of pulp bales or sawn timber: rows of pale boxes with strapping. */
function bales(k: PortKit, x: number, z: number, nx: number, nz: number, tiers: number, rng: Rng, col: Col = '#d8c9a0'): void {
  const p = k.solid;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const t = Math.max(1, tiers - (rng.chance(0.3) ? 1 : 0));
      for (let h = 0; h < t; h++) p.boxV(x + i * 0.19, LAND_Y + h * 0.11, z - j * 0.16, 0.18, 0.105, 0.15, tint(col, (h % 2) * 0.05 - 0.02), { ao: 0.15 });
    }
  }
  k.reserve(x + (nx * 0.19) / 2 - 0.1, z - (nz * 0.16) / 2 + 0.08, (nx * 0.19) / 2 + 0.05, (nz * 0.16) / 2 + 0.05);
}

const kotkaStyle: HouseStyle = {
  ...hanse,
  walls: ['#c9593f', '#e6c06a', '#f1ead7', '#a8453b', '#7f9bb0', '#d9a441', '#e8d9b0'],
  roofs: ['#4a4f58', '#5a3f38', '#3b3f46'],
  floors: [1, 3],
  floorH: 0.2,
  roofKinds: [['gable', 5], ['front', 3], ['hip', 1]],
  pitch: 0.7,
  gap: [0.04, 0.2],
};

const kotka: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8ba66f', land2: '#7f9d68', hill: '#5f8a5a', rock: '#a69b90', sand: '#b3a99d', haze: '#d3e3eb' };
    k.shape = { relief: 1.5, range: 3.4, rise: 4.5, rough: 0.6, freq: 0.1 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.5);
    // granite knolls with pines behind the terminal
    k.bump(cx + s * 5.4, -17.8, 3.0, 2.2, 1.5, 0.9);
    k.bump(cx + s * -5.4, -18.4, 3.4, 2.0, 1.3, 0.9);
    const granite = c3('#aaa095');
    k.paint((x, y, z, slope, c) => {
      if (y > 0.85 && slope > 0.07) c.lerp(granite, 0.7);
    });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -14.5, 0.5);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x6b);
    // the container quay: four ship-to-shore gantry cranes, stacks behind them
    const qa = X(-3.2);
    const qb = X(3.0);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.9, -11.9, 0.4, '#a09b90');
    for (let i = 0; i < 4; i++) gantryCrane(k, X(-2.4 + i * 1.65), -12.62, { color: i % 2 ? '#2c5da8' : '#e8e4d8', s: 1.1 });
    containerStack(k, Math.min(X(-2.8), X(-0.5)), -13.55, 11, 5, 4, rng);
    containerStack(k, Math.min(X(0.2), X(2.5)), -13.55, 11, 5, 3, rng);
    feeder(k, X(0.3), -10.95, 5.4, rng);
    // the pulp and paper mill with its stacks, silos and bale stores
    const ba = X(3.1);
    const bb = X(6.4);
    quayDeck(k, Math.min(ba, bb), Math.max(ba, bb), -12.7, -11.9, 0.4, '#a79f94');
    bales(k, Math.min(X(3.4), X(5.4)), -13.3, 10, 2, 3, rng);
    const fx = X(5.0);
    factory(k, fx, -15.3, 2.9, 1.2, 0.95, '#d9d4c7', '#7f8a92');
    silo(k, X(3.5), -16.6, 0.38, 1.3, '#e8e4da', '#a3392e');
    silo(k, X(4.4), -16.9, 0.38, 1.3, '#e8e4da', '#a3392e');
    const s1 = X(5.7);
    stack(k, s1, -16.2, 2.8, 0.16, undefined, '#c8302a');
    stack(k, X(6.2), -16.6, 2.4, 0.14, undefined, '#c8302a');
    k.reserve(s1, -16.2, 0.5, 0.4);
    // white steam from the mill
    const sy = k.ground(s1, -16.2) + 2.8;
    for (const [dx, dy, r] of [[0.05, 0.1, 0.2], [0.25, 0.42, 0.28], [0.5, 0.8, 0.34], [0.85, 1.2, 0.4]] as Array<[number, number, number]>) p.blob(s1 + dx, sy + dy, -16.2, r, new THREE.Color(1.45 - dy * 0.1, 1.48 - dy * 0.1, 1.5 - dy * 0.1), { ao: 0, sy: 0.85 });
    // the red-brick church on the knoll
    const chx = X(-4.0);
    const chy = k.groundMax(chx, -17.4, 0.5, 0.5) - 0.02;
    brickSpire(k, chx, chy, -17.4, 0.62, 1.55, 1.8, '#a2492f', '#3b3f46');
    hall(k, chx + s * 1.3, chy, -17.7, 1.7, 0.85, 0.85, 0.75, '#a2492f', '#3b3f46', { bays: 3 });
    town(k, kotkaStyle, 2, SHORE_Z - 4.4, { rowStep: 0.66, gaps: 0.12, maxSlope: 0.7 });
    // pines on the granite: dense, dark, large
    woods(k, ['pine', 'pine', 'pine', 'birch'], X(-9), X(-3), -22, -14.5, 26, [1.0, 1.6], 3);
    woods(k, ['pine', 'pine', 'pine', 'birch'], X(3), X(9), -22, -15.5, 22, [1.0, 1.6], 3);
    boulders(k, rng, Math.min(X(-8), X(-4)), Math.max(X(-8), X(-4)), 8, GRANITE, SHORE_Z - 0.3, SHORE_Z + 0.4);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Turku ─────────────────────────────

/** Turku Castle: a whitewashed medieval fortress, a long keep with a steep roof and a round tower, a crenellated outer ward. */
function turkuCastle(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 2.3, 1.2) - 0.02;
  const white = '#ece7d7';
  const grey = '#d3cdbb';
  const roof = '#7a4a3c';
  const dark = '#2a2623';
  // the outer ward wall in front, with a gate tower and round corner towers
  const zw = z + 1.05;
  p.boxV(x, y - 0.55, zw, 4.6, 0.55 + 0.72, 0.3, grey);
  for (let i = 0; i < 15; i++) p.box(x - 2.1 + i * 0.3, y + 0.72, zw + 0.1, 0.15, 0.09, 0.07, tint(grey, 0.05), { ao: 0 });
  p.boxV(x - 0.5, y - 0.55, zw, 0.74, 0.55 + 1.3, 0.62, grey);
  fq(p, x - 0.67, x - 0.33, y, y + 0.5, zw + 0.313, dark);
  p.tri([x - 0.67, y + 0.5, zw + 0.313], [x - 0.33, y + 0.5, zw + 0.313], [x - 0.5, y + 0.68, zw + 0.313], dark);
  hipRoof(p, x - 0.5, y + 1.3, zw, 0.74, 0.62, 0.42, roof);
  for (const sx of [-2.3, 2.3]) {
    p.cyl(x + sx, y - 0.55, zw, 0.3, 0.28, 0.55 + 1.0, grey, { seg: 10 });
    p.cone(x + sx, y + 1.0, zw, 0.34, 0.5, roof, { seg: 10 });
  }
  // the main castle behind: a long white block under a steep tiled roof, a stepped east gable
  const kx = x + 0.3;
  const kz = z - 0.35;
  p.boxV(kx, y - 0.55, kz, 3.1, 0.55 + 1.5, 1.25, white);
  winZ(k, kx, y + 0.28, kz + 0.625, 2.7, 1.0, 7, 3, dark, 0.3, 0.45);
  winX(k, kx + 1.55, y + 0.28, kz, 0.9, 1.0, 2, 3, dark, 0.3, 0.45);
  p.prism(kx, y + 1.5, kz, 1.4, 0.85, 3.16, roof, { ry: Math.PI / 2 });
  p.tri([kx + 1.58 + 0.01, y + 1.5, kz + 0.7], [kx + 1.58 + 0.01, y + 1.5, kz - 0.7], [kx + 1.58 + 0.01, y + 2.35, kz], white);
  for (const [cx2, cy2] of [[-0.8, 0.5], [0.3, 0.7]] as Array<[number, number]>) p.box(kx + cx2, y + 1.5 + cy2 * 0.6, kz - 0.2, 0.12, 0.55, 0.12, '#8a5a48');
  // the great round tower at the west end
  const rx = kx - 1.65;
  p.cyl(rx, y - 0.55, kz + 0.1, 0.52, 0.48, 0.55 + 2.0, white, { seg: 12 });
  p.cyl(rx, y + 1.75, kz + 0.1, 0.58, 0.58, 0.08, grey, { seg: 12, ao: 0 });
  p.cone(rx, y + 1.83, kz + 0.1, 0.6, 0.85, COPPER_D, { seg: 12 });
  for (const a of [-0.4, 0.5, 1.2]) cylWindow(p, rx, kz + 0.1, 0.5, a, y + 0.9, y + 1.25, 0.04, dark);
  p.ball(rx, y + 2.74, kz + 0.1, 0.025, GOLD);
  k.reserve(x, z - 0.1, 2.5, 1.3);
}

/** Turku Cathedral: the tall red-brick west tower under a verdigris lantern and needle, a long brick nave. */
function turkuCathedral(k: PortKit, x: number, z: number, nd: 1 | -1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.6, 0.6) - 0.02;
  const brick = '#b0583b';
  const stone = '#e0d6bd';
  const dark = '#2a2623';
  p.boxV(x, y - 0.55, z, 0.98, 0.55 + 2.1, 0.98, brick);
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]] as const) p.boxV(x + dx * 0.49, y - 0.55, z + dz * 0.49, 0.1, 0.55 + 1.9, 0.1, tint(brick, -0.07));
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * 0.2, y + 0.25, z + 0.49, 0.16, 0.8, dark);
    lancetX(p, x + 0.49, y + 0.25, z + f * 0.2, 0.16, 0.8, dark);
    lancetZ(p, x + f * 0.2, y + 1.4, z + 0.49, 0.14, 0.55, dark);
    lancetX(p, x + 0.49, y + 1.4, z + f * 0.2, 0.14, 0.55, dark);
  }
  p.box(x, y + 1.25, z, 1.02, 0.04, 1.02, stone, { ao: 0 });
  p.box(x, y + 2.1, z, 1.04, 0.06, 1.04, stone, { ao: 0 });
  // the stone lantern, the copper bulb, a second small lantern and the needle
  p.cyl(x, y + 2.16, z, 0.37, 0.34, 0.5, stone, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    p.box(x + Math.cos(a) * 0.33, y + 2.26, z + Math.sin(a) * 0.33, 0.1, 0.3, 0.1, dark, { ao: 0, ry: -a });
  }
  p.lathe(x, y + 2.66, z, [[0.4, 0], [0.42, 0.06], [0.34, 0.2], [0.2, 0.34], [0.1, 0.44], [0.08, 0.52]], COPPER_D, { seg: 8 });
  p.cyl(x, y + 3.18, z, 0.09, 0.09, 0.2, stone, { seg: 8 });
  needle(p, x, y + 3.38, z, 0.1, 0.8, COPPER_D, 8);
  k.reserve(x, z, 0.65, 0.65);
  hall(k, x + nd * 1.9, y, z - 0.2, 2.8, 1.25, 1.1, 0.85, brick, '#5b4a45', { bays: 5 });
}

const turkuStyle: HouseStyle = {
  ...hanse,
  walls: ['#e8c07a', '#c9593f', '#e6d6a4', '#a8503a', '#f1ead7', '#7f9bb0', '#d9a441'],
  roofs: ['#5b4a45', '#8a4a3a', '#4a4f58'],
  floors: [1, 3],
  floorH: 0.2,
  roofKinds: [['gable', 5], ['front', 3], ['hip', 1]],
  pitch: 0.68,
  gap: [0.02, 0.14],
};

const turku: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#92ac72', land2: '#86a26c', hill: '#648e5e', rock: '#a69b90', sand: '#c9bfa8', haze: '#d3e3eb' };
    k.shape = { relief: 0.9, range: 2.4, rise: 5, rough: 0.5, freq: 0.1 };
    k.shore = 'quay';
    const s = k.mole.dir;
    const cx = centre(k, -15.0, 0.6);
    // the Aura river
    river(k, cx + s * 1.1, 0.9, { bank: 0.8, sway: 0.5 });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -15.0, 0.6);
    const X = (d: number): number => cx + s * d;
    // the castle on the river's west bank, the cathedral on its east bank
    turkuCastle(k, X(-3.6), -15.3);
    turkuCathedral(k, X(5.3), -16.5, -s as 1 | -1);
    // a stone arch bridge over the Aura
    archBridge(k, Math.min(X(-0.8), X(3.0)), Math.max(X(-0.8), X(3.0)), -13.9, 3, 0.64, '#cfc7b3', 0.16);
    // Suomen Joutsen, the Swan of Finland: a museum full-rigged ship, sails furled, at the quay
    const qa = X(1.6);
    const qb = X(6.2);
    quayDeck(k, Math.min(qa, qb), Math.max(qa, qb), -12.75, -11.85, 0.4, '#938e84');
    rigShip(k, X(3.8), -10.95, 4.8, {
      hull: '#2d3a45',
      boot: '#7a2f28',
      trim: '#f1ece0',
      mast: '#bba883',
      sail: '#e8e4d6',
      furled: true,
      poop: true,
      masts: [{ at: 0.3, h: 3.0, rig: 'square', yards: 4 }, { at: -0.02, h: 3.3, rig: 'square', yards: 5 }, { at: -0.32, h: 2.7, rig: 'square', yards: 4 }],
      houses: [[0.0, 0.1, 0.15, '#f4f1ea']],
    });
    town(k, turkuStyle, 3, SHORE_Z - 1.4, { rowStep: 0.62, gaps: 0.08 });
    woods(k, ['pine', 'pine', 'birch'], X(-9), X(9), -24, -18.5, 30, [1.0, 1.5], 4);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Stockholm ─────────────────────────────

/** A Falu-red cottage with white corners and a dark roof. */
function cottage(k: PortKit, x: number, y: number, z: number, s: number, ry = 0): void {
  const p = k.solid;
  k.at(x, y, z, ry, s, () => {
    p.box(0, -0.05, 0, 0.44, 0.3, 0.32, '#a8362a');
    p.prism(0, 0.25, 0, 0.5, 0.19, 0.36, '#2f3338');
    p.tri([-0.25, 0.25, 0.186], [0.25, 0.25, 0.186], [0, 0.44, 0.186], '#a8362a');
    for (const wx of [-0.11, 0.11]) {
      fq(p, wx - 0.045, wx + 0.045, 0.06, 0.16, 0.162, '#f1ece0');
      fq(p, wx - 0.03, wx + 0.03, 0.08, 0.14, 0.164, '#2f3d4d');
    }
  });
}

/** A granite skerry: a rounded hump of pink-grey rock rising from the sea floor, with cottages on it. */
function skerry(k: PortKit, x: number, z: number, r: number, cots: Array<[number, number, number]>): void {
  const p = k.solid;
  p.cyl(x, -0.9, z, r * 1.2, r * 0.85, 1.25, '#a39489', { seg: 7, ry: x });
  p.cyl(x + r * 0.1, 0.1, z, r * 0.8, r * 0.55, 0.22, '#b3a497', { seg: 7, ry: x * 2 });
  p.rock(x - r * 0.7, -0.05, z + r * 0.25, r * 0.4, '#948679', { sy: 0.6 });
  for (const [dx, dz, s] of cots) cottage(k, x + dx * r, 0.3, z + dz * r, s, dx * 0.2);
  k.reserve(x, z, r + 0.3, r + 0.3);
}

/** Stockholm City Hall: a red-brick waterfront block and its tall tower with a gilded lantern and the Three Crowns. */
function cityHall(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.5, 0.6) - 0.02;
  const brick = '#9c4030';
  const dark = '#2a2623';
  const W = 2.8;
  const H = 1.4;
  p.boxV(x, y - 0.6, z, W, 0.6 + H, 1.0, brick);
  const zf = z + 0.5;
  // an arcade of arches along the water
  for (let i = 0; i < 8; i++) {
    const ax = x - W / 2 + 0.2 + i * 0.34;
    fq(p, ax - 0.06, ax + 0.06, y, y + 0.34, zf + 0.004, dark);
    p.tri([ax - 0.06, y + 0.34, zf + 0.004], [ax + 0.06, y + 0.34, zf + 0.004], [ax, y + 0.42, zf + 0.004], dark);
  }
  p.box(x, y + 0.5, zf + 0.003, W, 0.03, 0.012, tint(brick, 0.25), { ao: 0 });
  winZ(k, x, y + 0.6, zf, W - 0.3, 0.7, 9, 2, '#2d3844', 0.4, 0.55);
  winX(k, x + W / 2, y + 0.6, z, 0.7, 0.7, 2, 2, '#2d3844', 0.4, 0.55);
  p.box(x, y + H - 0.02, z, W + 0.06, 0.05, 1.06, tint(brick, 0.2), { ao: 0 });
  hipRoof(p, x, y + H + 0.03, z, W, 1.0, 0.32, COPPER_D);
  // the tower at the east end
  const tx = x + W / 2 - 0.35;
  const tz = z - 0.05;
  const TH = 2.7;
  p.boxV(tx, y - 0.6, tz, 0.72, 0.6 + TH, 0.72, tint(brick, 0.02));
  for (const f of [-1, 1]) {
    lancetZ(p, tx + f * 0.16, y + 1.0, tz + 0.36, 0.1, 0.4, dark);
    lancetX(p, tx + 0.36, y + 1.0, tz + f * 0.16, 0.1, 0.4, dark);
  }
  p.box(tx, y + 1.9, tz, 0.78, 0.04, 0.78, '#d6b86a', { ao: 0 });
  // the open loggia high in the tower: three arches on each face
  for (let i = -1; i <= 1; i++) {
    fq(p, tx + i * 0.2 - 0.06, tx + i * 0.2 + 0.06, y + 2.05, y + 2.45, tz + 0.364, dark);
    rq(p, tx + 0.364, y + 2.05, y + 2.45, tz + i * 0.2 + 0.06, tz + i * 0.2 - 0.06, dark);
  }
  p.box(tx, y + TH, tz, 0.8, 0.06, 0.8, '#d6b86a', { ao: 0 });
  // the lantern stage in gilded copper, the cap, and the Three Crowns on the tip
  p.boxV(tx, y + TH + 0.06, tz, 0.52, 0.38, 0.52, '#c9a24a');
  fq(p, tx - 0.07, tx + 0.07, y + TH + 0.12, y + TH + 0.38, tz + 0.264, dark);
  p.cyl(tx, y + TH + 0.44, tz, 0.3, 0.3, 0.05, '#c9a24a', { seg: 8, ao: 0 });
  p.lathe(tx, y + TH + 0.49, tz, [[0.3, 0], [0.34, 0.08], [0.26, 0.26], [0.14, 0.44], [0.07, 0.6]], COPPER_D, { seg: 8 });
  p.cyl(tx, y + TH + 1.09, tz, 0.012, 0.01, 0.3, GOLD, { seg: 4, ao: 0 });
  const cy = y + TH + 1.34;
  for (const [dx, dy] of [[-0.075, 0.1], [0.075, 0.1], [0, -0.06]] as Array<[number, number]>) {
    p.cyl(tx + dx, cy + dy, tz, 0.055, 0.06, 0.04, GOLD, { seg: 6, ao: 0 });
    p.cone(tx + dx, cy + dy + 0.04, tz, 0.065, 0.11, GOLD, { seg: 6, ao: 0 });
  }
  k.reserve(x, z, W / 2 + 0.1, 0.6);
}

/** The Vasa Museum: ochre walls, a dark-green copper roof and three tall masts standing up out of it. */
function vasaMuseum(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.5, 0.8) - 0.02;
  const ochre = '#d9b873';
  const copper = '#487a68';
  // the low entrance hall and the tall hall behind it
  p.boxV(x - 0.5, y - 0.6, z + 0.35, 2.4, 0.6 + 0.75, 0.8, tint(ochre, 0.05));
  winZ(k, x - 0.5, y + 0.2, z + 0.75, 1.9, 0.35, 5, 1, '#2d3844', 0.45, 0.8);
  p.box(x - 0.5, y + 0.73, z + 0.35, 2.46, 0.04, 0.86, '#efe6cc', { ao: 0 });
  p.boxV(x, y - 0.6, z - 0.35, 2.6, 0.6 + 1.2, 1.4, ochre);
  winZ(k, x, y + 0.25, z + 0.35, 2.0, 0.6, 4, 1, '#2d3844', 0.4, 0.8);
  p.prism(x, y + 1.2, z - 0.35, 1.55, 0.8, 2.7, copper, { ry: Math.PI / 2 });
  p.tri([x + 1.3 + 0.01, y + 1.2, z + 0.4], [x + 1.3 + 0.01, y + 1.2, z - 1.1], [x + 1.3 + 0.01, y + 2.0, z - 0.35], ochre);
  // three masts from the ridge, the tallest in the middle
  const wood = '#7a4a35';
  const masts: Array<[number, number, number]> = [[-0.75, 2.2, -0.05], [0.0, 2.9, 0.0], [0.75, 2.0, 0.05]];
  for (const [mx, mh, lean] of masts) {
    const bx = x + mx;
    const by = y + 1.75;
    p.rod([bx, by - 0.2, z - 0.35], [bx + lean, by + mh, z - 0.35], 0.032, wood, 6);
    p.cyl(bx + lean * 0.8, by + mh * 0.78, z - 0.35, 0.09, 0.09, 0.03, tint(wood, 0.1), { seg: 8, ao: 0 });
    p.rod([bx + lean - 0.14, by + mh * 0.9, z - 0.35], [bx + lean + 0.14, by + mh * 0.9, z - 0.35], 0.012, wood, 4);
  }
  k.reserve(x - 0.2, z, 1.6, 1.0);
}

const stockholmStyle: HouseStyle = {
  ...hanse,
  walls: ['#d9a441', '#c9852e', '#a8453b', '#e3c27a', '#b8664a', '#8a4a35', '#cf9a4a', '#d9b88a'],
  roofs: ['#4a4038', '#3b3f46', '#6a4a3c', '#4c8372'],
  floors: [3, 5],
  floorH: 0.18,
  w: [0.36, 0.56],
  roofKinds: [['gable', 4], ['hip', 3], ['front', 1]],
  pitch: 0.6,
  gap: [0, 0.05],
};

const stockholm: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8ea872', land2: '#839e6c', hill: '#68905f', rock: '#a89c90', sand: '#a89c8c', haze: '#d0e1e8' };
    k.shape = { relief: 0.9, range: 2.4, rise: 5, rough: 0.5, freq: 0.11 };
    k.shore = 'rock';
    const s = k.mole.dir;
    const cx = centre(k, -15.0, 0.5);
    // three landmasses separated by two narrow channels
    river(k, cx + s * -2.4, 0.5, { bank: 0.7, zBack: -30, fade: 8 });
    river(k, cx + s * 2.6, 0.5, { bank: 0.7, zBack: -30, fade: 8 });
  },
  build(k) {
    const s = k.mole.dir;
    const cx = centre(k, -15.0, 0.5);
    const X = (d: number): number => cx + s * d;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 0x53);
    vasaMuseum(k, X(-4.3), -14.6);
    cityHall(k, X(4.4), -14.4);
    // Gamla Stan on its island: Riddarholm church's slender iron spire among the ochre houses
    const gx = X(0.1);
    const gy = LAND_Y - 0.02;
    p.boxV(gx, gy - 0.25, -16.2, 0.9, 0.25 + 0.7, 0.8, '#b8664a');
    p.prism(gx, gy + 0.7, -16.2, 0.96, 0.4, 0.84, '#3b3f46');
    needle(p, gx - 0.1, gy + 0.9, -16.3, 0.1, 2.3, '#3b3f46', 6);
    k.reserve(gx, -16.2, 0.6, 0.5);
    // skerries with red cottages in the water in front, granite along the shore
    skerry(k, X(-5.4), -9.7, 0.7, [[-0.1, 0.05, 1.0], [0.45, -0.25, 0.8]]);
    skerry(k, X(-0.6), -9.3, 0.55, [[0.0, 0.05, 0.85]]);
    skerry(k, X(3.2), -9.9, 0.65, [[-0.1, 0.0, 0.95], [0.4, -0.2, 0.75]]);
    boulders(k, rng, X(-7), X(7), 22, GRANITE, SHORE_Z - 0.4, SHORE_Z + 0.5);
    town(k, stockholmStyle, 3, SHORE_Z - 1.6, { rowStep: 0.66, gaps: 0.06, maxSlope: 0.7, minY: 0.3 });
    woods(k, ['pine', 'pine', 'birch', 'pine'], X(-9), X(9), -26, -18.5, 24, [1.0, 1.6], 4);
  },
  rows: 0,
  quiet: true,
};

// @@NEXT@@

export const LANDMARKS: Record<string, Landmark> = { lubeck, szczecin, gdynia, gdansk, klaipeda, riga, tallinn, helsinki, kotka, turku, stockholm };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Lübeck', 'baltic', 'lubeck'],
  ['Szczecin', 'baltic', 'szczecin'],
  ['Gdynia', 'baltic', 'gdynia'],
  ['Gdańsk', 'baltic', 'gdansk'],
  ['Klaipėda', 'baltic', 'klaipeda'],
  ['Riga', 'baltic', 'riga'],
  ['Tallinn', 'baltic', 'tallinn'],
  ['Helsinki', 'baltic', 'helsinki'],
  ['Kotka', 'baltic', 'kotka'],
  ['Turku', 'baltic', 'turku'],
  ['Stockholm', 'baltic', 'stockholm'],
];
