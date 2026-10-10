import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { Part, PortKit, SHORE_Z, LAND_Y, clamp, lerp, noise2, smooth, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { Region, RegionId } from '../regions';
import { buildTown, pick, tint, tree, type HouseStyle } from '../town';
import { tower, suspension, cableStayed, figure } from '../structures';
import { gantryCrane, containerStack } from '../props';

/**
 * The North Pacific (Japan, Alaska, British Columbia, Puget Sound, the Columbia) and the US Gulf/West hubs.
 * Owned by one port-scene module: its regions (japan, pacnw), landmarks and port rows.
 * REGIONS here replace the placeholders in ../regions.ts when ../landmarks.ts loads.
 *
 * Japan: Yokohama (Landmark Tower, Cosmo Clock 21, Hikawa Maru, Fuji), Hakodate (the mountain, red-brick
 * warehouses, Goryokaku), Tomakomai (paper mills, Tarumae), Kushiro (Nusamai Bridge, marsh, fog).
 * Alaska: Dutch Harbor (crab boats, Orthodox church), Kodiak (the fleet, blue domes), Anchorage (Chugach, mudflats).
 * BC and the Sound: Prince Rupert (totems, grain), Vancouver (Lions Gate, Canada Place, sulphur), Seattle (Needle,
 * Rainier, Great Wheel), Tacoma (Rainier, cranes), Portland (St Johns Bridge, Hood).
 * US hubs: Long Beach (Queen Mary, the white bridge, oil islands), Houston (refineries, San Jacinto).
 */

// ───────────────────────────── helpers ─────────────────────────────

const c3 = (hex: string): THREE.Color => new THREE.Color(hex);

/** Centre x of a landmark at depth z, leaned away from the breakwater head (the free side). */
const centre = (k: PortKit, z: number, lean = 1.2): number => k.vx(z) + k.mole.dir * lean;

/** A rectangle facing +z (front) at depth z. */
function fq(p: Part, x0: number, x1: number, y0: number, y1: number, z: number, c: Col): void {
  p.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c);
}

/** A rectangle facing +x (right) at x, spanning z from zn (near) to zf (far). */
function rq(p: Part, x: number, y0: number, y1: number, zn: number, zf: number, c: Col): void {
  p.quad([x, y0, zn], [x, y0, zf], [x, y1, zf], [x, y1, zn], c);
}

/** A quad turned to face the side `ref` points to, whatever order the corners were given in. */
function qa(p: Part, a: V3, b: V3, c: V3, d: V3, col: Col, ref: V3): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const n = (uy * vz - uz * vy) * ref[0] + (uz * vx - ux * vz) * ref[1] + (ux * vy - uy * vx) * ref[2];
  if (n >= 0) p.quad(a, b, c, d, col);
  else p.quad(d, c, b, a, col);
}

/** Houses for one town: the pipeline's buildTown with this port's own style. */
function townOf(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number } = {}): void {
  buildTown(k, { x0: -k.width / 2 - 2, x1: k.width / 2 + 2, z, rows, rowStep: o.rowStep ?? 0.6, hs, gaps: o.gaps ?? 0.06, rowRise: o.rowRise ?? 0, cx: k.vx(z) + (o.shift ?? 0), minY: o.minY, maxSlope: o.maxSlope });
}

/** Keep the region's tree scatter off the whole backdrop (landmarks that bring their own planting). */
function noTrees(k: PortKit): void {
  k.reserve(0, -22, k.width + 20, 11);
}

/** Carve a channel of water running back from the sea. */
function channel(k: PortKit, cx: number, half: number, zBack = -34, depth = -0.45): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1.2 || z < zBack) return h;
    const bank = smooth(half + 1.5, half, Math.abs(x - cx));
    const end = smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, depth), bank * end);
  });
}

/** A mountain as a terrain feature: elliptical footprint, profile (1 - d)^e (e > 1 is concave like a volcano). */
function massif(k: PortKit, o: { x: number; z: number; rx: number; rz?: number; h: number; e?: number; rough?: number; crater?: number }): void {
  const rz = o.rz ?? o.rx;
  k.feature((x, z, hh) => {
    const dx = (x - o.x) / o.rx;
    const dz = (z - o.z) / rz;
    const d = Math.hypot(dx, dz);
    if (d >= 1) return hh;
    let v = o.h * Math.pow(1 - d, o.e ?? 1.5);
    v *= 1 + (o.rough ?? 0.1) * (noise2(x * 0.3, z * 0.3, 11) - 0.5) * 2;
    if (o.crater) v -= o.crater * smooth(0.1, 0, d);
    return hh + v;
  });
}

/** Recolour the ground inside an ellipse (a lawn, an apron, a mud strip). */
function stain(k: PortKit, x0: number, z0: number, rx: number, rz: number, col: Col, amount = 0.8, maxY = 99): void {
  const c = c3(col as string);
  k.paint((x, y, z, slope, cc) => {
    const d = Math.hypot((x - x0) / rx, (z - z0) / rz);
    if (d < 1 && y < maxY) cc.lerp(c, amount * smooth(1, 0.7, d) * (1 - smooth(0.3, 0.6, slope)));
  });
}

/** A cone or frustum, optionally squashed along z: the broad slopes of a volcano. */
function frustum(p: Part, x: number, y: number, z: number, rb: number, rt: number, h: number, col: Col, o: { sz?: number; seg?: number; ry?: number } = {}): void {
  const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12, 1, false);
  g.translate(0, h / 2, 0);
  p.add(g, col, [x, y, z], [1, 1, o.sz ?? 1], { ry: o.ry ?? 0 });
}

/** Snow, painted on a mountain by height above a line that wobbles with the noise. */
function snowCap(k: PortKit, x0: number, z0: number, rx: number, rz: number, y0: number, snow: Col = '#f3f6f9'): void {
  const c = c3(snow as string);
  k.paint((x, y, z, slope, cc) => {
    const d = Math.hypot((x - x0) / rx, (z - z0) / rz);
    if (d > 1) return;
    const n = noise2(x * 0.5, z * 0.5, 23) - 0.5;
    cc.lerp(c, smooth(y0 - 0.3, y0 + 0.7, y + n * 1.4 - slope * 0.5));
  });
}

/** Dark forest on the slopes: recolour the ground above `minY` (not on the steepest rock). */
function forestPaint(k: PortKit, col: Col, minY = 0.9, maxY = 99, zMax = -14.5, amount = 0.7): void {
  const c = c3(col as string);
  k.paint((x, y, z, slope, cc) => {
    if (z < zMax && y > minY && y < maxY) cc.lerp(c, amount * smooth(minY, minY + 1.1, y) * (1 - smooth(0.3, 0.55, slope)));
  });
}

// ───────────────────────────── trees ─────────────────────────────

const SPRUCE = ['#1f3d2e', '#254733', '#1b372a', '#2a4d38'];

/** A tall dark conifer (spruce, hemlock, cedar): five narrow tiers. */
function spruce(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03, cols: Col[] = SPRUCE): void {
  const p = k.solid;
  const c = pick(rng, cols);
  p.cyl(x, y, z, 0.012 * s, 0.01 * s, 0.1 * s, '#4a3a2c', { seg: 4 });
  for (let i = 0; i < 5; i++) {
    const r = (0.13 - i * 0.022) * s;
    p.cone(x, y + (0.06 + i * 0.15) * s, z, r, 0.24 * s, tint(c, i * 0.035), { seg: 6 });
  }
}

/** A Japanese black pine: a bent trunk and a few flat clouds of needles. */
function matsu(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const lean = rng.range(-0.08, 0.08) * s;
  p.rod([x, y, z], [x + lean, y + 0.3 * s, z], 0.014 * s, '#5b4636', 5);
  const g = ['#3d6a44', '#35603d', '#46744b'];
  p.blob(x + lean, y + 0.36 * s, z, 0.12 * s, g[0], { sy: 0.5 });
  p.blob(x + lean + 0.1 * s, y + 0.25 * s, z + 0.02 * s, 0.09 * s, g[1], { sy: 0.45 });
  p.blob(x + lean - 0.08 * s, y + 0.29 * s, z - 0.02 * s, 0.08 * s, g[2], { sy: 0.45 });
}

/** Scatter dark conifers over the slopes (groves), on dry ground only, clear of buildings. */
function conifers(k: PortKit, o: { n: number; x0?: number; x1?: number; z0?: number; z1?: number; minY?: number; maxY?: number; size?: [number, number]; cols?: Col[]; seed?: number; wood?: number }): void {
  const rng = new Rng(k.seed ^ 0x5b1e ^ (o.seed ?? 0));
  const x0 = o.x0 ?? -k.width / 2 + 1;
  const x1 = o.x1 ?? k.width / 2 - 1;
  const z0 = o.z0 ?? SHORE_Z - 30;
  const z1 = o.z1 ?? SHORE_Z - 1.2;
  const sz = o.size ?? [0.9, 1.5];
  let placed = 0;
  for (let g = 0; g < o.n * 12 && placed < o.n; g++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    const y = k.ground(x, z);
    if (y < (o.minY ?? 0.3) || y > (o.maxY ?? 9)) continue;
    const wood = noise2(x * 0.16 + 5, z * 0.16, k.seed % 89);
    if (wood < (o.wood ?? 0.38) && !rng.chance(0.08)) continue;
    if (k.isReserved(x, z, 0.1)) continue;
    spruce(k, x, z, rng.range(sz[0], sz[1]), rng, y - 0.02, o.cols);
    placed++;
  }
}

/** Palms, scattered or in a row along a line. */
function palm(k: PortKit, x: number, z: number, h: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const lean = rng.range(-0.1, 0.1) * h;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    const nx = px + lean / 3;
    const ny = py + h / 3;
    p.rod([px, py, z], [nx, ny, z], 0.02 * h * (1 - i * 0.18), '#a18a68', 5);
    px = nx;
    py = ny;
  }
  const fr = ['#4d8a3e', '#5a9a46', '#3f7a38'];
  const n = 7;
  const a0 = rng.next() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n;
    const L = 0.26 * h;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const mid: V3 = [px + dx * L * 0.55, py + 0.06 * h, z + dz * L * 0.55];
    const tip: V3 = [px + dx * L, py - 0.1 * h, z + dz * L];
    const nxp = -dz * 0.06 * h;
    const nzp = dx * 0.06 * h;
    p.tri([px, py, z], [mid[0] + nxp, mid[1], mid[2] + nzp], [mid[0] - nxp, mid[1], mid[2] - nzp], fr[i % 3], true);
    p.tri([mid[0] + nxp, mid[1], mid[2] + nzp], tip, [mid[0] - nxp, mid[1], mid[2] - nzp], fr[(i + 1) % 3], true);
  }
  p.blob(px, py - 0.02 * h, z, 0.03 * h, '#6e5a3c');
}

// ───────────────────────────── ships ─────────────────────────────

interface HullOpts {
  /** length, beam, draught, freeboard at midships */
  L: number;
  B: number;
  F: number;
  bowRise?: number;
  sternRise?: number;
  /** +1: bow towards +x; -1: bow towards -x */
  dir?: 1 | -1;
  hull: Col;
  boot?: Col;
  deck?: Col;
  /** the hull is full-bodied up to this fraction of the length, then tapers to the stem */
  fullTo?: number;
  bowPow?: number;
  /** how far the stem leans forward above the waterline */
  rake?: number;
  n?: number;
  /** transom width loss (0 = full width at the stern) */
  stern?: number;
}

/**
 * A hull lying along x with its bow at +x (or -x if dir = -1), side facing +z, from just under the waterline
 * to the deck: a loft of 12 stations with the visible side, boot-topping and deck only. Returns the deck height
 * and half-beam as functions of the position `u` along the ship (u = 0 amidships, bow at +L/2: before mirroring).
 */
function hull(p: Part, o: HullOpts): { deckY: (u: number) => number; half: (u: number) => number; X: (u: number) => number } {
  const n = o.n ?? 12;
  const dir = o.dir ?? 1;
  const t0 = o.fullTo ?? 0.62;
  const pw = o.bowPow ?? 2.2;
  const rake = o.rake ?? 0;
  const X = (u: number): number => dir * u;
  const half = (u: number): number => {
    const t = u / o.L + 0.5;
    const st = 1 - (o.stern ?? 0.3) * (1 - smooth(0, 0.22, t));
    const bt = clamp((t - t0) / (1 - t0));
    return (o.B / 2) * st * (1 - 0.95 * Math.pow(bt, pw));
  };
  const deckY = (u: number): number => {
    const t = u / o.L + 0.5;
    return o.F + (o.bowRise ?? 0) * Math.pow(smooth(0.45, 1, t), 1.6) + (o.sternRise ?? 0) * (1 - smooth(0, 0.3, t));
  };
  const top = (u: number): number => X(u + rake * Math.pow(smooth(0.7, 1, u / o.L + 0.5), 2));
  const boot = o.boot ?? '#8f2a25';
  for (let i = 0; i < n; i++) {
    const u0 = -o.L / 2 + (o.L * i) / n;
    const u1 = -o.L / 2 + (o.L * (i + 1)) / n;
    const h0 = half(u0);
    const h1 = half(u1);
    qa(p, [X(u0), -0.16, h0], [X(u1), -0.16, h1], [top(u1), deckY(u1), h1], [top(u0), deckY(u0), h0], o.hull, [0, 0, 1]);
    qa(p, [X(u0), -0.03, h0 + 0.004], [X(u1), -0.03, h1 + 0.004], [X(u1), 0.07, h1 + 0.004], [X(u0), 0.07, h0 + 0.004], boot, [0, 0, 1]);
    qa(p, [top(u0), deckY(u0), -h0], [top(u1), deckY(u1), -h1], [top(u1), deckY(u1), h1], [top(u0), deckY(u0), h0], o.deck ?? '#8a8f8c', [0, 1, 0]);
  }
  // the transom, for a ship that lies the other way round
  const us = -o.L / 2;
  qa(p, [X(us), -0.16, -half(us)], [X(us), -0.16, half(us)], [X(us), deckY(us), half(us)], [X(us), deckY(us), -half(us)], o.hull, [-dir, 0, 0]);
  return { deckY, half, X };
}

// ───────────────────────────── towns ─────────────────────────────

/** A mid-rise Japanese city block: pale concrete and glass, flat roofs. */
const JP_CITY: HouseStyle = {
  walls: ['#e4e6e8', '#d4d8dc', '#c3c9cf', '#dedacf', '#b9c5cf', '#cfd3d6', '#e9e5da'],
  roofs: ['#8d949a'],
  trim: '#a9afb4',
  win: '#3d5166',
  floors: [3, 6],
  floorH: 0.17,
  w: [0.36, 0.6],
  d: [0.34, 0.5],
  roofKinds: [['flat', 1]],
  pitch: 0.3,
  chimney: 0,
  gap: [0, 0.04],
  winW: 0.05,
  winH: 0.07,
};

/** Tiled Japanese houses: pale plaster walls, grey-blue kawara roofs. */
const JP_HOUSES: HouseStyle = {
  walls: ['#ece5d2', '#dfd8c5', '#d3cdbb', '#c9c3b0', '#e6dcc4', '#bebaad', '#d9d2bf'],
  roofs: ['#566577', '#4c5b6e', '#5d6c7e', '#46566a', '#3f4c5c'],
  trim: '#f6f3ea',
  win: '#33465a',
  floors: [2, 3],
  floorH: 0.19,
  w: [0.28, 0.44],
  d: [0.3, 0.42],
  roofKinds: [['hip', 4], ['gable', 5], ['front', 1.5], ['flat', 0.7]],
  pitch: 0.58,
  chimney: 0,
  gap: [0, 0.03],
  door: '#5a4a3a',
  winW: 0.05,
  winH: 0.07,
};

/** Wooden Pacific-coast houses: clapboard in muted and bright paints, dark metal roofs. */
const PNW_HOUSES: HouseStyle = {
  walls: ['#c9b98f', '#9fb0bb', '#a85a48', '#e4dec9', '#7c9488', '#d6c08a', '#6e8aa3', '#b8503f'],
  roofs: ['#3a4048', '#4a403a', '#2f4f46', '#6a3b36', '#3f5568'],
  trim: '#f4f1e6',
  win: '#2c3a4a',
  floors: [1, 2],
  floorH: 0.2,
  w: [0.32, 0.5],
  d: [0.32, 0.44],
  roofKinds: [['gable', 5], ['front', 4], ['hip', 0.5]],
  pitch: 0.7,
  chimney: 0.4,
  gap: [0.02, 0.18],
  door: '#f1ece0',
};

// ───────────────────────────── shrine and torii ─────────────────────────────

/** A torii: two red pillars, a black kasagi and a red nuki between. Faces +z. */
function torii(k: PortKit, x: number, z: number, s: number, y = k.groundMax(x, z, 0.3 * s, 0.1 * s)): void {
  const p = k.solid;
  const red = '#d4452a';
  const gap = 0.3 * s;
  for (const sx of [-1, 1]) {
    p.cyl(x + sx * gap, y - 0.06, z, 0.032 * s, 0.026 * s, 0.06 + 0.5 * s, red, { seg: 7 });
    p.box(x + sx * gap, y - 0.02, z, 0.085 * s, 0.03 * s, 0.085 * s, '#2a2a2a', { ao: 0 });
  }
  p.box(x, y + 0.36 * s, z, gap * 2 + 0.09 * s, 0.035 * s, 0.035 * s, red, { ao: 0 });
  p.box(x, y + 0.48 * s, z, gap * 2 + 0.28 * s, 0.045 * s, 0.07 * s, '#25272b', { ao: 0 });
  p.box(x, y + 0.45 * s, z, gap * 2 + 0.08 * s, 0.03 * s, 0.05 * s, red, { ao: 0 });
  p.box(x - gap - 0.15 * s, y + 0.5 * s, z, 0.1 * s, 0.028 * s, 0.07 * s, '#25272b', { ao: 0, rz: -0.35 });
  p.box(x + gap + 0.15 * s, y + 0.5 * s, z, 0.1 * s, 0.028 * s, 0.07 * s, '#25272b', { ao: 0, rz: 0.35 });
  k.reserve(x, z, gap + 0.2 * s, 0.15 * s);
}

/** A small shrine hall: raised floor, white walls, a grey-blue hipped roof, a torii at the foot of steps. */
function shrine(k: PortKit, x: number, z: number, s = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.5 * s, 0.4 * s);
  p.box(x, y - 0.2, z, 0.9 * s, 0.2 + 0.1 * s, 0.7 * s, '#c9c3b4');
  p.box(x, y + 0.1 * s, z, 0.74 * s, 0.3 * s, 0.54 * s, '#f1ece0');
  fq(p, x - 0.07 * s, x + 0.07 * s, y + 0.1 * s, y + 0.3 * s, z + 0.272 * s, '#5a4636');
  p.pyramid(x, y + 0.4 * s, z, 0.98 * s, 0.34 * s, 0.76 * s, '#4d5c6e');
  p.box(x, y + 0.4 * s, z, 0.84 * s, 0.025 * s, 0.62 * s, '#d9d2c0', { ao: 0 });
  for (let i = 0; i < 3; i++) p.box(x, y - 0.2 + i * 0.07 * s, z + 0.4 * s + (2 - i) * 0.06 * s, 0.3 * s, 0.07 * s, 0.07 * s, '#bdb7a8');
  torii(k, x, z + 0.95 * s, s * 1.1, Math.max(y - 0.2, k.ground(x, z + 0.95 * s) - 0.02));
  k.reserve(x, z, 0.6 * s, 0.9 * s);
}

// ───────────────────────────── regions ─────────────────────────────

const pal = (p: Partial<Region['palette']>): Region['palette'] => ({ land: '#a9b97a', land2: '#9fb36f', hill: '#8fa879', rock: '#9a9488', sand: '#dccfa8', haze: '#cfe3ec', ...p });

const japan: Region = {
  id: 'japan',
  houses: JP_HOUSES,
  palette: pal({ land: '#9db272', land2: '#8fa968', hill: '#4c7a50', rock: '#8a8e88', sand: '#b9b4a2', haze: '#d3e1e8' }),
  shape: { relief: 2.2, range: 6, rise: 3, rough: 0.55, freq: 0.1 },
  shore: 'quay',
  rows: 4,
  rowStep: 0.55,
  gaps: 0.04,
  rowRise: 0.1,
  trees: [
    { kinds: ['pine', 'pine', 'cypress', 'round'], count: 90, where: 'hills', size: [0.9, 1.5], maxY: 5 },
    { kinds: ['pine', 'round', 'bush'], count: 16, where: 'plain' },
  ],
  armour: 'tetrapods',
  lights: [0, 1],
  boats: { kinds: ['fishing', 'fishing', 'sail'], n: 4, colors: ['#f4f0e6', '#2c5da8', '#c8302a'] },
  extras: (k, rng) => {
    // a shrine on the first rise behind the town, its torii facing the sea, and black pines along the shore
    placeShrine(k, rng, k.vx(-14));
    for (let i = 0, n = 0; i < 80 && n < 14; i++) {
      const x = k.vx(-14) + rng.range(-10, 10);
      const z = rng.range(-16.5, -13);
      if (k.isReserved(x, z, 0.2) || k.ground(x, z) < 0.3) continue;
      matsu(k, x, z, rng.range(1.0, 1.5), rng);
      n++;
    }
  },
};

const pacnw: Region = {
  id: 'pacnw',
  houses: PNW_HOUSES,
  palette: pal({ land: '#5d7a55', land2: '#547050', hill: '#2f5640', rock: '#7b8590', sand: '#8e8f86', snowLine: 4.2, snow: '#f4f7fa', haze: '#cddce6' }),
  shape: { relief: 2.6, range: 9, rise: 2.6, rough: 0.75, freq: 0.1 },
  shore: 'rock',
  rows: 3,
  rowStep: 0.62,
  gaps: 0.14,
  trees: [{ kinds: ['fir', 'fir', 'pine'], count: 50, where: 'hills', size: [1.0, 1.6], maxY: 5.5 }],
  armour: 'rocks',
  lights: [0, 1, 4],
  boats: { kinds: ['fishing'], n: 4, colors: ['#c8302a', '#2c5da8', '#f4f0e6', '#e9a31a'] },
  extras: (k) => {
    conifers(k, { n: 110, minY: 0.4 });
  },
};

export const REGIONS: Partial<Record<RegionId, Region>> = { japan, pacnw };

// ───────────────────────────── shared structures ─────────────────────────────

const PASTEL: Col[] = ['#f4a9b8', '#8fc7e8', '#f7d86a', '#a9dba0', '#f2f2f2', '#e6a0e0', '#f5b27a'];

/**
 * A Ferris wheel facing +z: a rim on each side joined by gondola struts, spokes, a hub with a dial, an A-frame on
 * each side down to the ground. The lowest gondola clears the ground by ~0.3.
 */
function ferrisWheel(k: PortKit, x: number, z: number, R: number, o: { y?: number; gondolas?: number; frame?: Col; cars?: Col[]; dial?: boolean; rimR?: number } = {}): void {
  const p = k.solid;
  const y0 = o.y ?? k.groundMax(x, z, R * 0.7, 0.3);
  const hubY = y0 + R + 0.55;
  const T = 0.13;
  const frame = o.frame ?? '#eef0f2';
  const cars = o.cars ?? PASTEL;
  const rr = o.rimR ?? 0.02;
  // A-frame: two legs on each face, footings
  for (const dz of [-T * 1.5, T * 1.5]) {
    for (const sx of [-1, 1]) {
      p.rod([x + sx * R * 0.72, y0 - 0.05, z + dz * 1.6], [x, hubY, z + dz * 0.5], 0.036, frame, 6);
      p.box(x + sx * R * 0.72, y0 - 0.1, z + dz * 1.6, 0.16, 0.15, 0.16, '#9aa0a6');
    }
  }
  p.cyl(x, hubY - 0.2, z - 0.28, 0.1, 0.1, 0.56, '#9aa0a6', { seg: 8, rx: Math.PI / 2, ao: 0 });
  // rims
  const N = 28;
  const pt = (i: number, rad: number, dz: number): V3 => {
    const a = (i / N) * Math.PI * 2;
    return [x + Math.cos(a) * rad, hubY + Math.sin(a) * rad, z + dz];
  };
  for (const dz of [-T, T]) {
    for (let i = 0; i < N; i++) p.rod(pt(i, R, dz), pt(i + 1, R, dz), rr, frame, 4);
    for (let i = 0; i < N; i += 2) p.rod([x, hubY, z + dz], pt(i, R, dz), 0.008, '#d7dbe0', 3);
  }
  for (let i = 0; i < N; i += 2) p.rod(pt(i, R, -T), pt(i, R, T), 0.012, frame, 3);
  // an inner ring at the front for the lattice look
  for (let i = 0; i < N; i++) p.rod(pt(i, R * 0.55, T), pt(i + 1, R * 0.55, T), 0.01, '#d7dbe0', 3);
  // gondolas hanging from the rim
  const G = o.gondolas ?? 20;
  for (let i = 0; i < G; i++) {
    const a = (i / G) * Math.PI * 2 + 0.1;
    const gx = x + Math.cos(a) * R;
    const gy = hubY + Math.sin(a) * R;
    p.boxV(gx - 0.08, gy - 0.2, z - 0.1, 0.16, 0.17, 0.2, cars[i % cars.length], { ao: 0.06 });
    p.box(gx - 0.09, gy - 0.035, z - 0.105, 0.18, 0.02, 0.21, '#7a8088', { ao: 0 });
  }
  // the dial in the hub
  if (o.dial) {
    p.cyl(x, hubY, z + T + 0.01, R * 0.34, R * 0.34, 0.03, '#f4f4ef', { seg: 20, rx: Math.PI / 2, ry: 0, ao: 0 });
    p.cyl(x, hubY, z + T + 0.03, R * 0.04, R * 0.04, 0.02, '#26292e', { seg: 6, rx: Math.PI / 2, ao: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.box(x + Math.cos(a) * R * 0.29 - 0.012, hubY + Math.sin(a) * R * 0.29 - 0.012, z + T + 0.04, 0.024, 0.024, 0.01, '#26292e', { ao: 0 });
    }
    p.rod([x, hubY, z + T + 0.045], [x + R * 0.1, hubY + R * 0.2, z + T + 0.045], 0.012, '#26292e', 3);
    p.rod([x, hubY, z + T + 0.045], [x - R * 0.2, hubY - R * 0.05, z + T + 0.045], 0.012, '#26292e', 3);
  }
  k.reserve(x, z, R + 0.2, 0.5);
}

interface ShedOpts {
  y?: number;
  wall?: Col;
  roof?: Col;
  trim?: Col;
  /** window colour */
  win?: Col;
  /** floors of windows */
  floors?: number;
  /** a cross-gable on the front at these x offsets */
  gables?: number[];
  /** arched / lintelled window frame colour */
  frame?: Col;
}

/** A long brick warehouse, ridge along x, with rows of windows on its front and a gable on its right end. */
function brickShed(k: PortKit, x: number, z: number, w: number, d: number, wallH: number, roofH: number, o: ShedOpts = {}): number {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const sink = o.y !== undefined ? 0.25 : Math.max(0.25, y - k.groundMin(x, z, w / 2, d / 2) + 0.1);
  const wall = o.wall ?? '#a5523c';
  const roof = o.roof ?? '#4d5560';
  const hd = d / 2;
  p.box(x, y - sink, z, w, wallH + sink, d, wall);
  p.box(x, y - 0.01, z, w + 0.03, 0.05, d + 0.03, tint(wall, -0.2), { ao: 0 });
  p.prism(x, y + wallH, z, d + 0.1, roofH, w + 0.1, roof, { ry: Math.PI / 2 });
  p.tri([x + w / 2 + 0.003, y + wallH, z + hd + 0.05], [x + w / 2 + 0.003, y + wallH, z - hd - 0.05], [x + w / 2 + 0.003, y + wallH + roofH, z], wall);
  const floors = o.floors ?? 2;
  const fh = wallH / floors;
  const cols = Math.max(2, Math.round(w / 0.3));
  const sp = w / cols;
  const win = o.win ?? '#2b2f36';
  const frame = o.frame ?? '#e9e2d0';
  for (let f = 0; f < floors; f++) {
    const y0 = y + f * fh + fh * 0.2;
    for (let i = 0; i < cols; i++) {
      const cx = x - w / 2 + sp * (i + 0.5);
      fq(p, cx - 0.06, cx + 0.06, y0 - 0.012, y0 + fh * 0.56 + 0.012, z + hd + 0.003, frame);
      fq(p, cx - 0.045, cx + 0.045, y0, y0 + fh * 0.56, z + hd + 0.005, win);
    }
    if (f) p.box(x, y + f * fh - 0.01, z, w + 0.02, 0.02, d + 0.02, tint(wall, -0.18), { ao: 0 });
  }
  const sc = Math.max(1, Math.round(d / 0.3));
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < sc; i++) {
      const cz = z + hd - (d / sc) * (i + 0.5);
      rq(p, x + w / 2 + 0.004, y + f * fh + fh * 0.2, y + f * fh + fh * 0.76, cz + 0.04, cz - 0.04, win);
    }
  }
  for (const gx of o.gables ?? []) {
    const gw = 0.5;
    p.prism(x + gx, y + wallH, z + hd * 0.7, gw, roofH * 0.8, 0.5, roof);
    p.tri([x + gx - gw / 2, y + wallH, z + hd * 0.7 + 0.251], [x + gx + gw / 2, y + wallH, z + hd * 0.7 + 0.251], [x + gx, y + wallH + roofH * 0.8, z + hd * 0.7 + 0.251], wall);
    fq(p, x + gx - 0.05, x + gx + 0.05, y + wallH + 0.02, y + wallH + roofH * 0.45, z + hd * 0.7 + 0.253, win);
  }
  k.reserve(x, z, w / 2 + 0.03, d / 2 + 0.03);
  return y + wallH + roofH;
}

/** A red-and-white banded tower (Marine Tower, lighthouse-like) with a gallery and a lantern. */
function bandedTower(k: PortKit, x: number, z: number, h: number, r0 = 0.3, bands = 8, a: Col = '#d6392b', b: Col = '#f4f1ea'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r0, r0) - 0.04;
  const bh = (h * 0.78) / bands;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    p.cyl(x, y + i * bh, z, lerp(r0, r0 * 0.46, t0), lerp(r0, r0 * 0.46, t1), bh + 0.003, i % 2 ? b : a, { seg: 8, ao: 0.05 });
  }
  const yg = y + h * 0.78;
  p.cyl(x, yg, z, r0 * 0.9, r0 * 0.7, 0.1, '#e9ecee', { seg: 10 });
  p.cyl(x, yg + 0.1, z, r0 * 0.78, r0 * 0.78, 0.14, '#3f5a73', { seg: 10, ao: 0 });
  p.cyl(x, yg + 0.24, z, r0 * 0.9, r0 * 0.9, 0.035, '#e9ecee', { seg: 10, ao: 0 });
  p.cone(x, yg + 0.275, z, r0 * 0.7, h * 0.12, '#d6392b', { seg: 10 });
  p.rod([x, yg + 0.275 + h * 0.12, z], [x, y + h, z], 0.012, '#d9dcde', 4);
  k.reserve(x, z, r0 + 0.1, r0 + 0.1);
}

/** Slim chimney stack with a banded top and a plume of steam drifting off to the +x side. */
function plume(k: PortKit, x: number, y: number, z: number, s: number, n = 5, col: Col = '#f2f4f5', drift = 0.55): void {
  const p = k.solid;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    p.blob(x + drift * s * t * t * 2.4, y + 0.12 * s + t * 0.9 * s, z + 0.02 * i, (0.09 + t * 0.2) * s, tint(col, -0.02 * i), { sy: 0.8, ao: 0.02 });
  }
}

/** A tall stack of slightly tapering concrete with a banded crown. */
function chimney(k: PortKit, x: number, z: number, h: number, r: number, o: { y?: number; wall?: Col; band?: Col; smoke?: boolean } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, r, r) - 0.05;
  const wall = o.wall ?? '#d9d6cf';
  p.cyl(x, y, z, r * 1.25, r, h, wall, { seg: 12 });
  p.cyl(x, y + h * 0.84, z, r * 1.02, r * 1.0, h * 0.045, o.band ?? '#c8302a', { seg: 12, ao: 0 });
  p.cyl(x, y + h * 0.92, z, r * 1.0, r * 0.98, h * 0.045, o.band ?? '#c8302a', { seg: 12, ao: 0 });
  p.cyl(x, y + h, z, r * 1.0, r * 0.92, 0.03, '#3a3d42', { seg: 12, ao: 0 });
  if (o.smoke) plume(k, x, y + h, z, h * 0.35, 5);
  k.reserve(x, z, r + 0.15, r + 0.15);
}

/** A cylindrical storage tank with a rim and a ladder; a floating roof shows as a lower lid. */
function tank(k: PortKit, x: number, z: number, r: number, h: number, col: Col = '#e9e7e0', o: { y?: number; cone?: boolean; band?: Col } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, r, r) - 0.04;
  p.cyl(x, y, z, r, r, h, col, { seg: 14 });
  p.cyl(x, y + h, z, r * 1.01, r * 1.01, 0.025, tint(col, -0.12), { seg: 14, ao: 0 });
  if (o.cone) p.cone(x, y + h + 0.02, z, r, h * 0.16, tint(col, -0.05), { seg: 14 });
  else p.cyl(x, y + h - 0.025, z, r * 0.94, r * 0.94, 0.03, tint(col, -0.3), { seg: 14, ao: 0 });
  if (o.band) p.cyl(x, y + h * 0.45, z, r * 1.005, r * 1.005, h * 0.06, o.band, { seg: 14, ao: 0 });
  p.rod([x + r * 0.72, y + 0.02, z + r * 0.72], [x + r * 0.2, y + h, z + r * 0.98], 0.007, '#6b727a', 3);
  k.reserve(x, z, r + 0.05, r + 0.05);
}

// ───────────────────────────── piers, ships, silos, churches ─────────────────────────────

/** A pier or quay slab standing in the water: top at `top`, sunk to the sea floor, with plank lines on its face. */
function pier(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, top: number, color: Col, plank = true): void {
  const p = k.solid;
  const cx = (x0 + x1) / 2;
  p.box(cx, -0.9, (zBack + zFront) / 2, x1 - x0, 0.9 + top, zFront - zBack, color);
  if (plank) {
    p.ao = 0;
    for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.28) p.box(x, -0.5, zFront + 0.004, 0.035, 0.5 + top - 0.02, 0.01, tint(color, -0.28));
    p.box(cx, top - 0.004, (zBack + zFront) / 2, x1 - x0 + 0.04, 0.03, zFront - zBack + 0.04, tint(color, 0.12));
    p.ao = 0.16;
  }
}

interface FishOpts {
  L?: number;
  dir?: 1 | -1;
  hull?: Col;
  house?: Col;
  trim?: Col;
  /** wheelhouse forward (trawler, crab boat) or aft */
  cab?: 'fwd' | 'aft';
  /** a rack of bright lamps (squid and saury boats) */
  lamps?: boolean;
  /** a boom and net drum (seiner) or tall poles (troller) */
  gear?: 'boom' | 'poles' | 'pots' | 'none';
  ry?: number;
}

/** A small fishing boat afloat at the waterline. */
function fishBoat(k: PortKit, x: number, z: number, o: FishOpts = {}): void {
  const L = o.L ?? 1.5;
  const dir = o.dir ?? 1;
  const p = k.solid;
  const sc = L / 1.5;
  const wh = o.house ?? '#f4f1e8';
  const trim = o.trim ?? '#c8302a';
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    const h = hull(p, { L, B: 0.42 * sc, F: 0.15 * sc, bowRise: 0.07 * sc, sternRise: 0.02, dir, hull: o.hull ?? '#2c5da8', boot: trim, deck: '#9a9486', fullTo: 0.6, rake: 0.05 * sc, n: 7, stern: 0.3 });
    const X = h.X;
    const cu = o.cab === 'aft' ? -L * 0.26 : L * 0.12;
    const dy = h.deckY(cu);
    p.box(X(cu), dy, 0, 0.3 * sc, 0.2 * sc, 0.28 * sc, wh);
    p.box(X(cu), dy + 0.2 * sc, 0, 0.34 * sc, 0.02, 0.32 * sc, '#6c747b', { ao: 0 });
    fq(p, X(cu) - 0.12 * sc, X(cu) + 0.12 * sc, dy + 0.1 * sc, dy + 0.17 * sc, 0.143 * sc + 0.002, '#2a3a4a');
    rq(p, X(cu) + 0.151 * sc, dy + 0.1 * sc, dy + 0.17 * sc, 0.1 * sc, -0.1 * sc, '#2a3a4a');
    p.cyl(X(cu) - dir * 0.04, dy + 0.22 * sc, 0, 0.012, 0.01, 0.34 * sc, '#6b6458', { seg: 4, ao: 0 });
    if (o.gear === 'boom') {
      p.cyl(X(cu + dir * 0.32 * L * 0.5), dy, 0, 0.02, 0.016, 0.34 * sc, '#c9c4b6', { seg: 4, ao: 0 });
      p.rod([X(L * 0.12 + dir * 0.2), dy + 0.3 * sc, 0], [X(-L * 0.1 * 0 + -L * 0.28), dy + 0.1, 0.1], 0.006, '#4a4540', 3);
    } else if (o.gear === 'poles') {
      for (const s of [-1, 1]) p.rod([X(cu - 0.1), dy + 0.05, s * 0.1], [X(cu - 0.1) - dir * 0.04, dy + 0.62 * sc, s * 0.44 * sc], 0.008, '#4a4540', 3);
    } else if (o.gear === 'pots') {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.boxV(X(-L * 0.38 + i * 0.13 * sc) - 0.06 * sc, dy, -0.1 * sc + j * 0.13 * sc, 0.12 * sc, 0.1 * sc, 0.12 * sc, '#4a6e5c');
    }
    if (o.lamps) {
      // two rows of lights on a rack over the deck
      const ly = dy + 0.28 * sc;
      p.box(X(-L * 0.05), ly - 0.015, 0, L * 0.7, 0.012, 0.3 * sc, '#6b6458', { ao: 0 });
      for (let i = 0; i < 9; i++) {
        const lu = -L * 0.38 + (i / 8) * L * 0.7;
        p.cyl(X(lu), dy, 0.14 * sc, 0.006, 0.006, ly - dy - 0.015, '#6b6458', { seg: 3, ao: 0 });
        k.glow.ball(X(lu), ly + 0.02, 0.14 * sc, 0.028 * sc, '#fff6c8');
        k.glow.ball(X(lu), ly + 0.02, -0.14 * sc, 0.028 * sc, '#fff6c8');
      }
    }
  });
}

interface FreightOpts {
  L: number;
  dir?: 1 | -1;
  hull?: Col;
  boot?: Col;
  house?: Col;
  funnel?: Col;
  band?: Col;
  cargo?: 'cranes' | 'boxes' | 'bulk' | 'tank';
  /** container colours (cargo 'boxes') */
  boxes?: Col[];
  deck?: Col;
}

/** A merchant ship lying at the waterline: hull, stern accommodation with a funnel, and cranes, boxes, hatches or pipes on deck. */
function freighter(k: PortKit, x: number, z: number, o: FreightOpts): void {
  const L = o.L;
  const dir = o.dir ?? 1;
  const p = k.solid;
  const B = Math.min(1.2, L * 0.17);
  const F = 0.12 + L * 0.03;
  const rng = new Rng(k.seed ^ Math.floor(x * 100) ^ 0x6ee1);
  k.at(x, 0, z, 0, 1, () => {
    const h = hull(p, { L, B, F, bowRise: 0.1 + L * 0.012, sternRise: 0.02, dir, hull: o.hull ?? '#2a3b55', boot: o.boot ?? '#9b2f2a', deck: o.deck ?? '#7c8a80', fullTo: 0.72, bowPow: 2.4, rake: 0.12, stern: 0.2 });
    const X = h.X;
    const su = -L * 0.36;
    const dy = h.deckY(su);
    const hw = B * 0.36;
    const hc = o.house ?? '#f1efe8';
    for (let t = 0; t < 3; t++) {
      const w = L * 0.1 - t * 0.0;
      p.box(X(su), dy + t * 0.14, 0, w, 0.14, (hw - t * 0.04) * 2, hc);
      if (t < 2) for (let i = 0; i < 4; i++) fq(p, X(su) - w / 2 + 0.03 + i * (w / 4.2), X(su) - w / 2 + 0.07 + i * (w / 4.2), dy + t * 0.14 + 0.05, dy + t * 0.14 + 0.1, hw - t * 0.04 + 0.002, '#2a3744');
    }
    p.box(X(su), dy + 0.42, 0, L * 0.085, 0.07, hw * 2.4, hc);
    fq(p, X(su) - L * 0.04, X(su) + L * 0.04, dy + 0.44, dy + 0.48, hw * 1.2 + 0.002, '#4d6f84');
    p.cyl(X(su) - dir * L * 0.015, dy + 0.42, 0, 0.065, 0.055, 0.26, o.funnel ?? '#c8302a', { seg: 10 });
    p.cyl(X(su) - dir * L * 0.015, dy + 0.62, 0, 0.056, 0.055, 0.06, o.band ?? '#16181b', { seg: 10, ao: 0 });
    const cargo = o.cargo ?? 'bulk';
    const u0 = -L * 0.25;
    const u1 = L * 0.4;
    if (cargo === 'boxes') {
      const cols = o.boxes ?? ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#2fa3b5'];
      const bay = 0.215;
      for (let u = u0; u < u1 - bay; u += bay) {
        const tiers = 3 + (rng.chance(0.25) ? 1 : 0);
        for (let t = 0; t < tiers; t++) p.boxV(X(u + bay / 2) - bay / 2, h.deckY(u) + t * 0.1, -B * 0.4, bay * 0.98, 0.1, B * 0.8, rng.pick(cols), { ao: 0.12 });
      }
    } else if (cargo === 'cranes') {
      const n = Math.max(2, Math.round((u1 - u0) / 1.2));
      for (let i = 0; i < n; i++) {
        const u = u0 + 0.5 + i * ((u1 - u0 - 0.9) / Math.max(1, n - 1));
        p.box(X(u + 0.3), h.deckY(u), 0, (u1 - u0) / n * 0.7, 0.04, B * 0.74, '#5d6c73', { ao: 0.05 });
        p.cyl(X(u), h.deckY(u), 0.08, 0.035, 0.03, 0.34, '#d8b32a', { seg: 6 });
        p.rod([X(u), h.deckY(u) + 0.3, 0.08], [X(u + 0.36), h.deckY(u) + 0.62, 0.28], 0.012, '#d8b32a', 4);
      }
    } else if (cargo === 'tank') {
      p.box(X((u0 + u1) / 2), h.deckY(0) + 0.01, 0, u1 - u0, 0.02, 0.1, '#9a9ea0', { ao: 0 });
      for (let u = u0; u < u1; u += 0.32) {
        p.cyl(X(u), h.deckY(u), 0.02, 0.04, 0.04, 0.09, '#b5392e', { seg: 6 });
        p.rod([X(u), h.deckY(u) + 0.02, 0.0], [X(u), h.deckY(u) + 0.02, B * 0.4], 0.012, '#7a7f82', 3);
      }
    } else {
      const hatches = Math.max(2, Math.round((u1 - u0) / 0.9));
      for (let i = 0; i < hatches; i++) {
        const u = u0 + 0.05 + i * ((u1 - u0) / hatches);
        p.box(X(u + (u1 - u0) / hatches / 2) - ((u1 - u0) / hatches) * 0.42, h.deckY(u), -B * 0.3, ((u1 - u0) / hatches) * 0.84, 0.05, B * 0.6, '#58707a', { ao: 0.1 });
      }
    }
    p.cyl(X(L * 0.4), h.deckY(L * 0.4), 0, 0.012, 0.01, 0.3, '#c9c4b6', { seg: 4, ao: 0 });
  });
}

/** A block of grain silos in rows, a gallery on top and a taller head house: Prince Rupert, Portland, Kushiro. */
function silos(k: PortKit, x: number, z: number, nx: number, nz: number, r: number, h: number, col: Col = '#d8d4c9', o: { y?: number; head?: Col; roofs?: Col } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, (nx * r), (nz * r)) - 0.05;
  const gap = r * 2.04;
  const x0 = x - ((nx - 1) * gap) / 2;
  const z0 = z - ((nz - 1) * gap) / 2;
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = 0; i < nx; i++) {
      const sx = x0 + i * gap;
      const sz = z0 + j * gap;
      p.cyl(sx, y, sz, r, r, h, tint(col, ((i + j) % 2) * 0.03), { seg: 11 });
      p.cyl(sx, y + h, sz, r * 1.02, r * 1.02, 0.03, tint(col, -0.1), { seg: 11, ao: 0 });
    }
  }
  const W = nx * gap;
  const D = nz * gap;
  // the gallery along the tops and a head house with its own roof
  p.box(x, y + h + 0.03, z, W * 0.96, 0.16, 0.2, o.head ?? '#c9c5ba');
  p.box(x - W * 0.2, y + h + 0.03, z, 0.5, 0.62, Math.min(D, 0.7), o.head ?? '#c9c5ba');
  p.prism(x - W * 0.2, y + h + 0.65, z, Math.min(D, 0.7) + 0.04, 0.12, 0.54, o.roofs ?? '#6f7a80', { ry: Math.PI / 2 });
  for (let i = 0; i < 3; i++) fq(p, x - W * 0.2 - 0.17 + i * 0.14, x - W * 0.2 - 0.09 + i * 0.14, y + h + 0.2, y + h + 0.5, z + Math.min(D, 0.7) / 2 + 0.003, '#44525c');
  k.reserve(x, z, W / 2 + 0.1, D / 2 + 0.1);
}

/** A slim conveyor gallery on legs, from (xa, za) to (xb, zb) at height y. */
function conveyor(k: PortKit, xa: number, xb: number, z: number, ya: number, yb: number, col: Col = '#d4d0c6'): void {
  const p = k.solid;
  const len = Math.hypot(xb - xa, yb - ya);
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const gx = lerp(xa, xb, t);
    const gy = lerp(ya, yb, t);
    const g = k.ground(gx, z);
    if (g < 0.2) {
      // over the water: a pile bent standing on the sea floor
      p.box(gx, -0.9, z, 0.08, 0.9 + gy - 0.08, 0.08, '#7f7a70');
    } else if (gy - g > 0.1) p.box(gx, g - 0.04, z, 0.05, gy - g, 0.05, '#7f8387');
  }
  p.rod([xa, ya, z], [xb, yb, z], 0.07, col, 6);
  p.rod([xa, ya + 0.06, z], [xb, yb + 0.06, z], 0.025, '#8a8f93', 4);
}

/** A Russian Orthodox church: white nave, a central drum with an onion dome, a bell-tower porch and two small domes. */
function orthodox(k: PortKit, x: number, z: number, s: number, o: { dome?: Col; roof?: Col; wall?: Col; y?: number } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, 0.6 * s, 0.4 * s);
  const wall = o.wall ?? '#f6f3ea';
  const dome = o.dome ?? '#2f8a5f';
  const roof = o.roof ?? dome;
  const gold = '#e8c23a';
  const onion = (ox: number, oy: number, oz: number, r: number, c: Col) => {
    p.lathe(ox, oy, oz, [[0.001, 0], [r * 0.86, r * 0.34], [r, r * 0.85], [r * 0.72, r * 1.45], [r * 0.26, r * 2.0], [0.0, r * 2.3]], c, { seg: 10 });
    p.rod([ox, oy + r * 2.3, oz], [ox, oy + r * 2.3 + 0.1 * s, oz], 0.005 * s + 0.003, gold, 3);
    p.rod([ox - 0.035 * s, oy + r * 2.3 + 0.06 * s, oz], [ox + 0.035 * s, oy + r * 2.3 + 0.06 * s, oz], 0.004, gold, 3);
  };
  const W = 0.95 * s;
  const D = 0.56 * s;
  const H = 0.36 * s;
  p.box(x, y - 0.2, z, W, 0.2 + H, D, wall);
  p.prism(x, y + H, z, D + 0.05, 0.17 * s, W + 0.04, roof, { ry: Math.PI / 2 });
  p.tri([x + W / 2 + 0.002, y + H, z + D / 2 + 0.025], [x + W / 2 + 0.002, y + H, z - D / 2 - 0.025], [x + W / 2 + 0.002, y + H + 0.17 * s, z], wall);
  for (let i = 0; i < 4; i++) fq(p, x - W / 2 + 0.1 * s + i * 0.22 * s, x - W / 2 + 0.17 * s + i * 0.22 * s, y + 0.08 * s, y + 0.27 * s, z + D / 2 + 0.003, '#3a4b5e');
  // the central drum and its dome
  p.cyl(x + 0.05 * s, y + H + 0.1 * s, z, 0.12 * s, 0.12 * s, 0.17 * s, wall, { seg: 10 });
  for (let i = 0; i < 3; i++) fq(p, x + 0.05 * s - 0.07 * s + i * 0.06 * s, x + 0.05 * s - 0.04 * s + i * 0.06 * s, y + H + 0.15 * s, y + H + 0.22 * s, z + 0.121 * s, '#3a4b5e');
  onion(x + 0.05 * s, y + H + 0.27 * s, z, 0.13 * s, dome);
  // bell-tower porch on the front-left
  const bx = x - W / 2 + 0.1 * s;
  const bz = z + D / 2 + 0.12 * s;
  p.box(bx, y - 0.2, bz, 0.22 * s, 0.2 + 0.4 * s, 0.22 * s, wall);
  p.pyramid(bx, y + 0.4 * s, bz, 0.25 * s, 0.1 * s, 0.25 * s, roof);
  onion(bx, y + 0.5 * s, bz, 0.07 * s, dome);
  // small side domes at the ends of the roof
  onion(x + W / 2 - 0.14 * s, y + H + 0.1 * s, z, 0.06 * s, dome);
  onion(x - W / 2 + 0.34 * s, y + H + 0.1 * s, z, 0.06 * s, dome);
  k.reserve(x, z, W / 2 + 0.2, D / 2 + 0.25);
}

/** A shrine and torii placed on the first free, level site near `cx` (call it before the town, so the houses keep round it). */
function placeShrine(k: PortKit, rng: Rng, cx: number, z0 = -19.5, z1 = -14.4, s = 0.95): boolean {
  for (let i = 0; i < 80; i++) {
    const x = cx + rng.range(-5, 5);
    const z = rng.range(z0, z1);
    if (k.isReserved(x, z, 0.9) || k.groundMin(x, z, 0.5, 0.7) < 0.3 || k.groundMax(x, z, 0.5, 0.7) - k.groundMin(x, z, 0.5, 0.7) > 0.75) continue;
    shrine(k, x, z, s);
    return true;
  }
  return false;
}

/** A lamp or light post on a pier or quay. */
function post(k: PortKit, x: number, y: number, z: number, h: number, col: Col = '#3a3d42', lamp: Col = '#fff2c0'): void {
  k.solid.cyl(x, y, z, 0.014, 0.012, h, col, { seg: 4, ao: 0 });
  k.glow.ball(x, y + h + 0.02, z, 0.03, lamp);
}

// ───────────────────────────── Yokohama ─────────────────────────────

/** Landmark Tower: a tall blue-glass slab that steps in near the top, then a slim pyramid and a mast. */
function landmarkTower(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.6, 0.6);
  // the low podium (the Landmark Plaza) in front
  p.box(x + 0.3, y - 0.2, z + 0.5, 1.9, 0.2 + 0.32, 1.0, '#cfd4d8');
  p.box(x + 0.3, y + 0.32, z + 0.5, 1.96, 0.04, 1.06, '#a9b0b6', { ao: 0 });
  k.glass.quad([x - 0.5, y + 0.06, z + 1.004], [x + 1.1, y + 0.06, z + 1.004], [x + 1.1, y + 0.26, z + 1.004], [x - 0.5, y + 0.26, z + 1.004], '#7fa3bd');
  const W = 1.06;
  const h1 = H * 0.7;
  tower(k, x, z, W, W, h1, '#8da7bd', { y, glass: true, win: '#3b5772', cols: 6, rows: 26, roof: 'none' });
  const stages: Array<[number, number]> = [[0.86, 0.09], [0.68, 0.07], [0.5, 0.06]];
  let yy = y + h1;
  for (const [w, hh] of stages) {
    tower(k, x, z, W * w, W * w, H * hh, '#9bb2c6', { y: yy, glass: true, win: '#3b5772', cols: Math.max(2, Math.round(6 * w)), rows: Math.max(3, Math.round(26 * hh * 1.3)), roof: 'none' });
    p.box(x, yy + H * hh - 0.01, z, W * w + 0.05, 0.03, W * w + 0.05, '#e7ebee', { ao: 0 });
    yy += H * hh;
  }
  p.pyramid(x, yy, z, W * 0.46, H * 0.07, W * 0.46, '#d3dbe2');
  const top = yy + H * 0.07;
  for (let i = 0; i < 5; i++) p.cyl(x, top + i * 0.09, z, 0.016 - i * 0.002, 0.014 - i * 0.002, 0.09, i % 2 ? '#f4f4f4' : '#d6392b', { seg: 5, ao: 0 });
  k.reserve(x + 0.2, z + 0.2, 1.1, 0.9);
}

/** Hikawa Maru: the 1930 NYK motor liner, black hull, white superstructure, one buff funnel with the company bands. */
function hikawaMaru(k: PortKit, x: number, z: number, L = 6.4): void {
  const p = k.solid;
  k.at(x, 0, z, 0, 1, () => {
    const h = hull(p, { L, B: 0.92, F: 0.34, bowRise: 0.15, sternRise: 0.05, hull: '#1b1e23', boot: '#8f2a25', deck: '#8b7a5e', rake: 0.2, fullTo: 0.62, stern: 0.25 });
    const F = 0.34;
    const white = '#f4f3ee';
    const rng = new Rng(k.seed ^ 0x41ca);
    // the long white deckhouse in three tiers
    p.box(-0.2, F, 0, 3.4, 0.24, 0.76, white);
    p.box(-0.05, F + 0.24, 0, 2.5, 0.22, 0.66, '#f0efe9');
    p.box(0.8, F + 0.46, 0, 0.62, 0.18, 0.6, white);
    p.box(0.8, F + 0.5, 0, 0.64, 0.035, 0.84, '#e6e6e0', { ao: 0 });
    p.box(-0.2, F + 0.24, 0, 3.44, 0.02, 0.8, '#d9d8d0', { ao: 0 });
    p.box(-0.05, F + 0.46, 0, 2.54, 0.02, 0.7, '#d9d8d0', { ao: 0 });
    // wheelhouse windows and the promenade ports
    k.glass.quad([0.5, F + 0.52, 0.304], [1.1, F + 0.52, 0.304], [1.1, F + 0.6, 0.304], [0.5, F + 0.52 + 0.08, 0.304], '#5f8296');
    for (let u = -1.8; u < 1.45; u += 0.14) (rng.chance(0.3) ? k.lit : p).quad([u, F + 0.08, 0.384], [u + 0.07, F + 0.08, 0.384], [u + 0.07, F + 0.18, 0.384], [u, F + 0.18, 0.384], '#2b3744');
    for (let u = -1.25; u < 1.15; u += 0.14) (rng.chance(0.3) ? k.lit : p).quad([u, F + 0.3, 0.334], [u + 0.07, F + 0.3, 0.334], [u + 0.07, F + 0.4, 0.334], [u, F + 0.3 + 0.1, 0.334], '#2b3744');
    // the funnel: buff, the company bands, a black top
    const fy = F + 0.48;
    p.cyl(-0.45, fy, 0, 0.19, 0.16, 0.62, '#e6d29a', { seg: 12, ao: 0.08 });
    p.cyl(-0.45, fy + 0.3, 0, 0.17, 0.169, 0.05, '#c8302a', { seg: 12, ao: 0 });
    p.cyl(-0.45, fy + 0.35, 0, 0.169, 0.168, 0.035, '#f4f1ea', { seg: 12, ao: 0 });
    p.cyl(-0.45, fy + 0.385, 0, 0.168, 0.166, 0.05, '#c8302a', { seg: 12, ao: 0 });
    p.cyl(-0.45, fy + 0.52, 0, 0.162, 0.16, 0.11, '#17191c', { seg: 12, ao: 0 });
    // boats on the boat deck
    for (let i = 0; i < 6; i++) {
      const bu = -1.1 + i * 0.5;
      p.box(bu, F + 0.46, 0.36, 0.32, 0.07, 0.1, '#f4f4ef', { ao: 0 });
      p.box(bu, F + 0.52, 0.36, 0.3, 0.015, 0.09, '#e8832b', { ao: 0 });
    }
    // masts, cargo gear and hatches
    const dy = (u: number) => h.deckY(u);
    p.cyl(2.0, dy(2.0), 0, 0.03, 0.02, 1.3, '#c9c4b6', { seg: 5, ao: 0 });
    p.box(2.0, dy(2.0) + 0.9, 0, 0.012, 0.012, 0.36, '#c9c4b6', { ao: 0 });
    p.cyl(-2.35, dy(-2.35), 0, 0.028, 0.02, 1.05, '#c9c4b6', { seg: 5, ao: 0 });
    p.box(-2.35, dy(-2.35) + 0.75, 0, 0.012, 0.012, 0.3, '#c9c4b6', { ao: 0 });
    for (const [u, side] of [[1.55, 1], [1.55, -1], [-2.0, 1], [-2.0, -1]] as Array<[number, number]>) {
      p.cyl(u, dy(u), side * 0.2, 0.014, 0.012, 0.42, '#d5d1c4', { seg: 4, ao: 0 });
      p.rod([u, dy(u) + 0.4, side * 0.2], [u + (u > 0 ? 0.55 : 0.5), dy(u) + 0.12, side * 0.36], 0.007, '#6b6458', 3);
    }
    p.box(1.65, dy(1.65), 0, 0.5, 0.025, 0.36, '#5b4c3a', { ao: 0 });
    p.box(-2.1, dy(-2.1), 0, 0.4, 0.025, 0.34, '#5b4c3a', { ao: 0 });
    p.box(-2.95, dy(-2.95), 0, 0.3, 0.12, 0.4, white);
    p.rod([-3.15, dy(-3.1) + 0.12, 0], [-3.15, dy(-3.1) + 0.5, 0], 0.01, '#c9c4b6', 3);
  });
  k.reserve(x, z, L / 2 + 0.1, 0.6);
}

/** The Yokohama Bay Bridge pylon pair is far off; the Marine Tower and the red-brick warehouses stand near the water. */
const yokohama: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#a3b57a', land2: '#97ac70', hill: '#52805a', rock: '#8a8e88', sand: '#bdb8a6', haze: '#d6e3ea' };
    k.shape = { relief: 1.8, range: 4.5, rise: 4.8, rough: 0.5, freq: 0.1 };
    k.shore = 'quay';
    const c0 = centre(k, -13.5, 0.8);
    k.plateau(c0 - 0.5, -14.2, 10.5, 3.6, LAND_Y + 0.02, 0.35);
    // Mt Fuji, far behind and blue with distance, its white cap above the haze
    const fx = c0 - 9;
    massif(k, { x: fx, z: -80, rx: 32, rz: 30, h: 17, e: 1.75, rough: 0.05, crater: 0.7 });
    stain(k, fx, -80, 36, 34, '#6f86ab', 0.9);
    snowCap(k, fx, -80, 36, 34, 10.2, '#f1f4f8');
  },
  build(k) {
    const c0 = centre(k, -13.5, 0.8);
    // Cosmo Clock 21 at the water, the Landmark Tower behind and to its left
    ferrisWheel(k, c0 - 0.6, -13.5, 1.72, { y: LAND_Y, gondolas: 24, dial: true, rimR: 0.024 });
    landmarkTower(k, c0 - 4.2, -15.5, 6.4);
    bandedTower(k, c0 + 4.9, -14.6, 3.4, 0.26, 8);
    // the red-brick warehouses of the old port
    brickShed(k, c0 - 7.3, -13.3, 1.9, 0.85, 0.52, 0.3, { gables: [-0.45], roof: '#4a525c' });
    brickShed(k, c0 - 7.0, -14.6, 1.6, 0.8, 0.5, 0.3, { roof: '#4a525c' });
    // the liner, moored along the park quay
    hikawaMaru(k, c0 + 2.9, -11.35);
    // the city: glass and concrete mid-rises, then tiled houses climbing the bluff
    const rng = new Rng(k.seed ^ 0x71);
    const blocks: Array<[number, number, number, number]> = [
      [-2.0, -16.2, 1.9, 0.6],
      [-0.4, -15.9, 1.6, 0.55],
      [1.2, -16.5, 2.4, 0.6],
      [2.8, -15.8, 1.4, 0.55],
      [-6.2, -16.6, 1.5, 0.6],
      [-8.6, -15.9, 1.0, 0.5],
      [6.8, -16.0, 1.2, 0.55],
      [4.2, -16.9, 1.8, 0.6],
    ];
    { for (const [dx, zz, h, w] of blocks) {
      tower(k, c0 + dx, zz, w, 0.55, h, pick(rng, ['#d8dde0', '#c7ced4', '#b7c4cf', '#e6e2d8']), { win: '#41596f', cols: 3, rows: Math.round(h / 0.17), glass: rng.chance(0.4), roof: 'flat' });
    } }
    placeShrine(k, rng, c0 + 7.0, -18.0, -15.4, 1.5);
    townOf(k, JP_CITY, 1, -17.7, { rowStep: 0.62, gaps: 0.15 });
    townOf(k, JP_HOUSES, 3, -18.8, { rowStep: 0.6, gaps: 0.2, rowRise: 0.15, maxSlope: 0.6 });
    conifers(k, { n: 40, minY: 1.0, z0: -34, z1: -20, cols: ['#2d5a3d', '#356647'] });
    // a pair of black pines by the park
    for (let i = 0; i < 4; i++) matsu(k, c0 + 1.8 + i * 1.5, -12.9 - (i % 2) * 0.2, 1.1, rng, LAND_Y - 0.02);
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#d62f2b', 0.5], ['#f6f3ea', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Hakodate ─────────────────────────────

/** A star-shaped polygon (a five-pointed fort), x/y in the polygon's plane. */
function starPts(R: number, r: number, n = 5, rot = Math.PI / 2): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return pts;
}

/** Goryokaku Tower: a white shaft with a flared, faceted observation deck near the top and a short mast. */
function goryokakuTower(k: PortKit, x: number, z: number, H: number, y = k.ground(x, z)): void {
  const p = k.solid;
  p.box(x, y - 0.2, z, 0.95, 0.2 + 0.28, 0.7, '#e7e4da');
  p.box(x, y + 0.28, z, 1.0, 0.03, 0.74, '#8d7a62', { ao: 0 });
  for (let i = 0; i < 5; i++) fq(p, x - 0.4 + i * 0.17, x - 0.3 + i * 0.17, y + 0.06, y + 0.22, z + 0.351, '#40586e');
  const base = y + 0.3;
  p.cyl(x, base, z, 0.17, 0.085, H * 0.76, '#eceae3', { seg: 4, ry: Math.PI / 4 });
  for (let i = 0; i < 4; i++) p.box(x, base + H * 0.12 + i * H * 0.17, z, 0.17 - i * 0.025, 0.02, 0.17 - i * 0.025, '#c9ccce', { ao: 0 });
  const yd = base + H * 0.76;
  p.lathe(x, yd, z, [[0.07, 0], [0.34, 0.1], [0.4, 0.2], [0.36, 0.29], [0.2, 0.42], [0.06, 0.5]], '#f1f1ee', { seg: 8, ao: 0.05 });
  k.glass.cyl(x, yd + 0.13, z, 0.382, 0.396, 0.12, '#7fa6bd', { seg: 8 });
  p.cone(x, yd + 0.5, z, 0.07, H * 0.16, '#d9dcde', { seg: 6 });
  p.rod([x, yd + 0.5 + H * 0.16, z], [x, yd + 0.5 + H * 0.25, z], 0.01, '#c9ccce', 4);
  k.reserve(x, z, 0.7, 0.55);
}

/** The pentagonal star fort of Goryokaku seen from afar: a green rampart star ringed by a blue moat. */
function starFort(k: PortKit, x: number, z: number, R: number): void {
  const p = k.solid;
  const y = 0.5 + 0.02;
  const outer = starPts(R + 0.55, (R + 0.55) * 0.64);
  const inner = starPts(R, R * 0.64);
  p.extrude(outer, 0.1, x, y - 0.0, z, '#3e7f9e', { rx: -Math.PI / 2, ao: 0, holes: [inner.slice().reverse()] });
  p.extrude(inner, 0.14, x, y + 0.0, z, '#8fb36a', { rx: -Math.PI / 2, ao: 0 });
  k.reserve(x, z, R + 0.6, R + 0.6);
}

/** The Mt Hakodate ropeway: a cable hung from small pylons up a steep slope, one cabin riding it. */
function ropeway(k: PortKit, xa: number, za: number, xb: number, zb: number): void {
  const p = k.solid;
  const n = 7;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(xa, xb, t);
    const z = lerp(za, zb, t);
    pts.push([x, k.ground(x, z) + 0.32 + (i > 0 && i < n ? 0.18 : 0), z]);
  }
  for (let i = 0; i < n; i++) {
    p.rod(pts[i], pts[i + 1], 0.007, '#2f3338', 3);
    if (i > 0) p.box(pts[i][0] - 0.02, pts[i][1] - 0.42, pts[i][2] - 0.02, 0.04, 0.42, 0.04, '#7b7f82', { ao: 0 });
  }
  // the cabin
  const t = 0.52;
  const cx = lerp(pts[3][0], pts[4][0], t);
  const cy = lerp(pts[3][1], pts[4][1], t);
  const cz = lerp(pts[3][2], pts[4][2], t);
  p.box(cx - 0.11, cy - 0.27, cz - 0.08, 0.22, 0.17, 0.16, '#c8302a');
  k.glass.box(cx - 0.09, cy - 0.23, cz + 0.081, 0.18, 0.07, 0.01, '#9cc1d4');
  p.rod([cx, cy - 0.1, cz], [cx, cy, cz], 0.008, '#2f3338', 3);
  // the summit station
  const [sx, sy, sz] = pts[n];
  p.box(sx - 0.28, sy - 0.62, sz - 0.2, 0.56, 0.5, 0.4, '#f1ece0');
  p.prism(sx - 0.32, sy - 0.12, sz - 0.22, 0.64, 0.14, 0.44, '#9b3b30');
}

const hakodate: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9ab06f', land2: '#8fa768', hill: '#3f6e4a', rock: '#8d9189', sand: '#aaa593', haze: '#d3e2e9' };
    k.shape = { relief: 1.0, range: 2.5, rise: 5.5, rough: 0.5, freq: 0.1 };
    k.shore = 'quay';
    const c0 = centre(k, -14, 1.0);
    k.plateau(c0 + 0.5, -13.6, 9.5, 2.0, LAND_Y + 0.02, 0.4);
    // Mt Hakodate, a steep whaleback of forest right behind the town
    massif(k, { x: c0 - 5.2, z: -22.2, rx: 11.5, rz: 8.6, h: 7.6, e: 1.0, rough: 0.14 });
    massif(k, { x: c0 + 7.5, z: -30, rx: 9, rz: 6, h: 3.4, e: 1.0 });
    k.plateau(c0 + 4.6, -19.2, 4.6, 4.2, 0.5, 0.6);
    forestPaint(k, '#335f40', 1.0, 6.4, -15.5, 0.8);
    stain(k, c0 - 5.2, -22.2, 3.2, 2.4, '#8f9a74', 0.5, 99);
  },
  build(k) {
    const c0 = centre(k, -14, 1.0);
    const rng = new Rng(k.seed ^ 0x4a);
    // the red-brick warehouses along the waterfront: long gabled sheds end to end
    {
      for (let i = 0; i < 4; i++) brickShed(k, c0 - 4.2 + i * 2.1, -13.1, 2.0, 0.85, 0.5 + (i % 2) * 0.04, 0.32, { gables: i % 2 ? [0.5] : [-0.45], roof: '#4a525c', wall: i === 2 ? '#9d4a36' : '#a5523c' });
      brickShed(k, c0 - 3.3, -14.4, 1.7, 0.8, 0.46, 0.3, { roof: '#4a525c' });
      brickShed(k, c0 + 0.5, -14.5, 1.7, 0.8, 0.5, 0.3, { roof: '#4a525c', gables: [0.2] });
    }
    // squid boats with their rows of lamps, and an old trawler
    fishBoat(k, c0 + 5.4, -11.3, { L: 1.7, dir: 1, hull: '#f2efe6', lamps: true, trim: '#2c5da8', cab: 'aft' });
    fishBoat(k, c0 + 7.3, -11.3, { L: 1.6, dir: -1, hull: '#2f6b8a', lamps: true, trim: '#f2efe6', cab: 'aft' });
    fishBoat(k, c0 - 6.9, -11.35, { L: 1.5, dir: 1, hull: '#f2efe6', lamps: true, trim: '#c8302a', cab: 'fwd' });
    // Goryokaku: the tower stands in the star-shaped fort
    {
      starFort(k, c0 + 4.6, -19.2, 2.5);
      goryokakuTower(k, c0 + 4.6, -19.2, 4.2, 0.55);
    }
    // the Orthodox church at the foot of the hill, green domes
    orthodox(k, c0 - 7.0, -15.4, 0.95, { dome: '#2f8a5f' });
    // ropeway up the mountain
    ropeway(k, c0 - 5.6, -16.6, c0 - 5.0, -22.2);
    placeShrine(k, rng, c0 - 1.5, -18.2, -15.9, 1.6);
    // the town: tiled roofs climbing the slope
    townOf(k, JP_HOUSES, 4, -15.6, { rowStep: 0.6, gaps: 0.1, rowRise: 0.1, maxSlope: 0.6 });
    conifers(k, { n: 50, minY: 1.2, maxY: 6.8, z0: -26, z1: -16, cols: ['#2f5d43', '#356b4a'] });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#d62f2b', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Tomakomai ─────────────────────────────

/** A paper-mill hall: long, sawtooth-roofed (north lights), pale cladding with a band of windows. */
function sawtoothHall(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col, roof: Col): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2);
  p.box(x, y - 0.2, z, w, 0.2 + h, d, wall);
  const n = Math.max(2, Math.round(w / 0.55));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const sx = x - w / 2 + i * sw;
    // each tooth: a slope rising to the left, a glazed vertical face to the right
    const a: V3 = [sx, y + h, z + d / 2];
    const b: V3 = [sx + sw, y + h + 0.0, z + d / 2];
    const rise = 0.2;
    const top: V3 = [sx + sw * 0.06, y + h + rise, z + d / 2];
    p.tri(a, b, top, wall);
    p.quad([sx, y + h, z - d / 2], [sx + sw * 0.06, y + h + rise, z - d / 2], [sx + sw * 0.06, y + h + rise, z + d / 2], [sx, y + h, z + d / 2], roof, true);
    p.quad([sx + sw * 0.06, y + h + rise, z + d / 2], [sx + sw * 0.06, y + h + rise, z - d / 2], [sx + sw, y + h, z - d / 2], [sx + sw, y + h, z + d / 2], tint(roof, 0.08), true);
  }
  const cols = Math.max(3, Math.round(w / 0.3));
  for (let i = 0; i < cols; i++) fq(p, x - w / 2 + 0.06 + i * (w / cols), x - w / 2 + 0.2 + i * (w / cols), y + h * 0.5, y + h * 0.8, z + d / 2 + 0.003, '#48596b');
  p.box(x, y + h * 0.35, z, w + 0.02, 0.025, d + 0.02, tint(wall, -0.15), { ao: 0 });
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
}

/** A heap of wood chips or logs: faceted cones in tan, or lying logs in stacks. */
function chipPile(k: PortKit, x: number, z: number, r: number, h: number, col: Col = '#c9a36a'): void {
  const y = k.groundMax(x, z, r * 0.6, r * 0.6) - 0.05;
  k.solid.cyl(x, y, z, r, r * 0.04, h, col, { seg: 7, ry: x });
  k.solid.cyl(x + r * 0.45, y, z + 0.1, r * 0.55, r * 0.03, h * 0.6, tint(col, -0.1), { seg: 6 });
  k.reserve(x, z, r + 0.05, r + 0.05);
}

function logStack(k: PortKit, x: number, z: number, nx: number, rows: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, nx * 0.07, 0.3) - 0.03;
  for (let r = 0; r < rows; r++) {
    const m = nx - r;
    for (let i = 0; i < m; i++) p.cyl(x + (i - m / 2) * 0.115 + 0.057, y + 0.045 + r * 0.095, z + 0.28, 0.048, 0.048, 0.56, i % 2 ? '#8b6a46' : '#7a5a3a', { seg: 5, rx: Math.PI / 2, ao: 0.02 });
  }
  k.reserve(x, z + 0.3, nx * 0.06 + 0.1, 0.4);
}

const tomakomai: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#a1ad7c', land2: '#98a574', hill: '#7a9060', rock: '#8d8c85', sand: '#b4b09e', haze: '#d6e3e9' };
    k.shape = { relief: 0.3, range: 0.4, rise: 12, rough: 0.35, freq: 0.08 };
    k.shore = 'quay';
    const c0 = centre(k, -14, 0.5);
    k.plateau(c0, -14.5, 11, 3.6, LAND_Y + 0.02, 0.35);
  },
  build(k) {
    const c0 = centre(k, -14, 0.5);
    const rng = new Rng(k.seed ^ 0x77);
    // Mt Tarumae: a broad flat-topped volcano with a lava dome in its caldera, steam over the dome
    {
      const vx = c0 - 6.0;
      const vz = -32;
      const haze = c3('#d6e3e9');
      const hz = (c: string): Col => c3(c).lerp(haze, 0.26);
      frustum(k.solid, vx, -0.5, vz, 17, 9.4, 3.3, hz('#5f8550'), { sz: 0.52, seg: 14, ry: 0.2 });
      frustum(k.solid, vx, 2.75, vz, 9.5, 5.2, 2.0, hz('#847c6c'), { sz: 0.52, seg: 14, ry: 0.2 });
      frustum(k.solid, vx, 4.7, vz, 5.25, 4.6, 0.3, hz('#756e61'), { sz: 0.52, seg: 14, ry: 0.2 });
      frustum(k.solid, vx, 5.0, vz, 4.7, 4.5, 0.06, hz('#5d584f'), { sz: 0.52, seg: 14, ry: 0.2 });
      k.solid.ball(vx + 0.2, 5.0, vz, 2.1, hz('#8c867b'), { sy: 0.78, sz: 0.55, ao: 0.05 });
      k.solid.ball(vx - 0.9, 5.0, vz + 0.2, 1.2, hz('#7b756b'), { sy: 0.7, sz: 0.6, ao: 0.05 });
      plume(k, vx + 0.2, 6.2, vz, 1.5, 5);
      k.reserve(vx, vz, 18, 8);
    }
    // the paper mill: stacks, halls, silos, tanks and conveyors
    {
      chimney(k, c0 - 2.6, -15.2, 3.4, 0.15, { smoke: true });
      chimney(k, c0 - 1.7, -15.6, 2.6, 0.12);
      chimney(k, c0 + 0.4, -15.4, 3.9, 0.17, { smoke: true });
      chimney(k, c0 + 1.5, -16.0, 2.9, 0.13, { smoke: true });
      sawtoothHall(k, c0 - 4.6, -13.9, 2.6, 1.0, 0.7, '#e7e8e6', '#7e8da0');
      sawtoothHall(k, c0 - 1.2, -13.7, 3.2, 0.95, 0.62, '#dcdedb', '#7e8da0');
      p_hall(k, c0 + 2.4, -14.2, 2.4, 1.3, 1.15, '#d5dde2');
      silos(k, c0 + 5.4, -14.8, 3, 1, 0.33, 1.7, '#eceae3');
      tank(k, c0 + 4.2, -13.2, 0.3, 0.55, '#e9e7e0', { cone: true });
      tank(k, c0 + 4.9, -13.15, 0.26, 0.5, '#d8dcdf', { cone: true });
      conveyor(k, c0 - 2.6, c0 + 5.0, -16.9, 0.9, 2.1);
    }
    // wood chips and logs on the yard
    chipPile(k, c0 - 7.1, -13.6, 0.75, 0.72);
    chipPile(k, c0 - 6.0, -14.3, 0.55, 0.55, '#bf9a60');
    chipPile(k, c0 + 7.3, -13.7, 0.7, 0.6);
    logStack(k, c0 + 6.6, -12.6, 8, 4);
    logStack(k, c0 - 7.6, -12.5, 6, 3);
    // the chip carrier at the quay
    freighter(k, c0 + 2.5, -11.4, { L: 4.6, dir: 1, hull: '#2c4a3a', boot: '#8f2a25', house: '#f3f1ea', funnel: '#2c5da8', cargo: 'bulk' });
    // a shrine, a few houses and black pines
    placeShrine(k, rng, c0 + 2.8, -21.5, -18.2, 1.6);
    townOf(k, JP_HOUSES, 2, -18.8, { rowStep: 0.6, gaps: 0.25 });
    for (let i = 0; i < 16; i++) {
      const x = c0 + rng.range(-9, 9);
      const z = rng.range(-21, -17.5);
      if (!k.isReserved(x, z, 0.3) && k.ground(x, z) > 0.3) matsu(k, x, z, rng.range(1.0, 1.5), rng);
    }
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 1]], cap: '#d62f2b', gallery: '#d62f2b' } },
};

/** A tall machine hall: a plain pale block with a hipped roof and a band of windows (the paper machines). */
function p_hall(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2);
  p.box(x, y - 0.2, z, w, 0.2 + h, d, wall);
  p.prism(x, y + h, z, d + 0.06, 0.24, w + 0.06, '#5f7d94', { ry: Math.PI / 2 });
  p.tri([x + w / 2 + 0.003, y + h, z + d / 2 + 0.03], [x + w / 2 + 0.003, y + h, z - d / 2 - 0.03], [x + w / 2 + 0.003, y + h + 0.24, z], wall);
  for (let i = 0; i < 8; i++) fq(p, x - w / 2 + 0.1 + i * (w / 8), x - w / 2 + 0.25 + i * (w / 8), y + h * 0.55, y + h * 0.82, z + d / 2 + 0.003, '#3e5266');
  p.box(x, y + h * 0.3, z, w + 0.02, 0.03, d + 0.02, '#a9b4bb', { ao: 0 });
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
}

// ───────────────────────────── Kushiro ─────────────────────────────

/** The Nusamai Bridge: a flat steel girder bridge on two piers with four sculpture pylons at its corners. */
function nusamaiBridge(k: PortKit, x: number, z: number, span: number): void {
  const p = k.solid;
  const deck = 0.82;
  const half = 0.46;
  const x0 = x - span / 2;
  const x1 = x + span / 2;
  const stone = '#c9c4b6';
  // the long girder and the road
  p.box(x, deck - 0.34, z, span, 0.26, half * 2.0, '#d3d6d7');
  p.box(x, deck - 0.1, z, span, 0.1, half * 2.0, '#bfc3c5');
  p.box(x, deck - 0.01, z, span, 0.02, half * 2 - 0.06, '#5d6166', { ao: 0 });
  // a shallow arch of girder under the middle span
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const sx = lerp(x - span * 0.28, x + span * 0.28, t);
    p.box(sx, deck - 0.3 - Math.sin(t * Math.PI) * 0.16, z, span * 0.56 / 6 + 0.01, 0.09, half * 1.7, '#7b8187', { ao: 0 });
  }
  // railings
  for (const sz of [-1, 1]) {
    p.box(x, deck + 0.0, z + sz * (half - 0.01), span, 0.025, 0.02, '#d7d9d9', { ao: 0 });
    p.box(x, deck + 0.1, z + sz * (half - 0.01), span, 0.02, 0.02, '#d7d9d9', { ao: 0 });
  }
  // piers standing on the river bed, and the abutments
  for (const px of [x - span * 0.2, x + span * 0.2]) p.box(px, -0.9, z, 0.3, 0.9 + deck - 0.3, half * 1.5, stone);
  for (const ax of [x0, x1]) p.box(ax, -0.2, z, 0.4, 0.2 + deck - 0.1, half * 2.1, stone);
  // the four pylons, each topped with a bronze figure (the Four Seasons)
  const bronze = ['#6f7d5e', '#5c6b52', '#76805f', '#667558'];
  let i = 0;
  for (const px of [x0 + 0.35, x1 - 0.35]) {
    for (const sz of [-1, 1]) {
      const pz = z + sz * (half + 0.08);
      p.box(px, deck - 0.25, pz, 0.3, 0.25 + 0.95, 0.3, stone);
      p.box(px, deck + 0.94, pz, 0.38, 0.06, 0.38, '#b3ae9f', { ao: 0 });
      p.box(px - 0.17, deck + 0.3, pz + 0.152, 0.34, 0.5, 0.01, '#a9a493', { ao: 0 });
      figure(k, px, deck + 1.0, pz, 0.4, bronze[i++ % 4], i % 2 ? 'wave' : 'stand', 0);
    }
  }
  for (const px of [x - span * 0.3, x, x + span * 0.3]) post(k, px, deck, z + half, 0.28);
  k.reserve(x, z, span / 2 + 0.2, half + 0.3);
}

/** A tuft of marsh reed: a few slim pale cones. */
function reeds(k: PortKit, x: number, z: number, s: number, rng: Rng): void {
  const y = k.ground(x, z) - 0.02;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + rng.next();
    k.solid.cone(x + Math.cos(a) * 0.05 * s, y, z + Math.sin(a) * 0.04 * s, 0.025 * s, (0.26 + rng.next() * 0.12) * s, rng.chance(0.5) ? '#b9a860' : '#a79a54', { seg: 4 });
  }
}

/** A red-crowned crane: white body, black neck and tail, a red cap, standing on slim legs. */
function crane(k: PortKit, x: number, z: number, s: number, ry = 0): void {
  const p = k.solid;
  const y = k.ground(x, z);
  k.at(x, y, z, ry, s, () => {
    p.rod([-0.02, 0, 0], [-0.02, 0.2, 0], 0.006, '#2a2a2a', 3);
    p.rod([0.03, 0, 0], [0.03, 0.2, 0], 0.006, '#2a2a2a', 3);
    p.ball(0, 0.26, 0, 0.1, '#f6f6f3', { sx: 1.35, sy: 0.9, sz: 0.8 });
    p.ball(-0.12, 0.26, 0, 0.06, '#2a2a2a', { sx: 1.2, sy: 0.7, sz: 0.7 });
    p.rod([0.1, 0.3, 0], [0.17, 0.5, 0], 0.012, '#2a2a2a', 4);
    p.ball(0.18, 0.52, 0, 0.032, '#f6f6f3');
    p.ball(0.187, 0.56, 0, 0.016, '#c8302a');
    p.rod([0.2, 0.52, 0], [0.28, 0.5, 0], 0.005, '#c9a86a', 3);
  });
}

const kushiro: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#b2ab70', land2: '#a39e66', hill: '#8f9962', rock: '#8a8a82', sand: '#a9a58d', haze: '#dce7ea' };
    k.shape = { relief: 0.2, range: 1.4, rise: 11, rough: 0.2, freq: 0.07 };
    k.shore = 'quay';
    const c0 = centre(k, -14, 0.0);
    k.plateau(c0, -13.7, 12, 2.6, LAND_Y + 0.02, 0.4);
    // the Kushiro River, running out through the town
    channel(k, c0 + 0.3, 2.4, -36, -0.5);
    // marsh pools behind the town, and wet ground
    for (const [dx, zz, rx, rz] of [[-5.5, -19.5, 2.8, 0.9], [4.5, -22.0, 3.4, 1.0], [-1.0, -26.0, 4.0, 1.1], [8.0, -17.5, 1.8, 0.7]] as Array<[number, number, number, number]>) {
      k.feature((x, z, h) => {
        const d = Math.hypot((x - c0 - dx) / rx, (z - zz) / rz);
        return d < 1 ? lerp(h, Math.min(h, -0.3), smooth(1, 0.6, d)) : h;
      });
    }
    k.paint((x, y, z, slope, c) => {
      if (z < -15.5 && y > -0.1 && y < 0.3) c.lerp(c3('#8c8d58'), 0.55);
    });
  },
  build(k) {
    const c0 = centre(k, -14, 0.0);
    const rng = new Rng(k.seed ^ 0x55);
    nusamaiBridge(k, c0 + 0.3, -14.3, 7.2);
    // the grain silos and a fish market on the quay
    silos(k, c0 - 6.5, -15.4, 4, 2, 0.3, 1.5, '#ecebe5');
    brickShed(k, c0 + 5.2, -13.4, 2.8, 0.9, 0.42, 0.26, { wall: '#d9d6c9', roof: '#3f7f86', win: '#36485a', frame: '#f3f1e8', gables: [] });
    brickShed(k, c0 - 3.2, -13.4, 2.4, 0.85, 0.4, 0.24, { wall: '#e4dfd0', roof: '#4a6f8a', win: '#36485a', frame: '#f3f1e8' });
    // fishing boats: saury boats with lamp rails, a trawler, small boats
    fishBoat(k, c0 - 5.0, -11.35, { L: 1.9, dir: 1, hull: '#f2efe6', lamps: true, trim: '#2c5da8', cab: 'fwd' });
    fishBoat(k, c0 - 7.0, -11.3, { L: 1.6, dir: 1, hull: '#2f6b8a', lamps: true, trim: '#f2efe6', cab: 'fwd' });
    fishBoat(k, c0 + 3.2, -11.3, { L: 1.8, dir: -1, hull: '#c8302a', lamps: true, trim: '#f2efe6', cab: 'fwd' });
    fishBoat(k, c0 + 5.5, -11.3, { L: 1.5, dir: -1, hull: '#f2efe6', gear: 'boom', trim: '#2c5da8', cab: 'aft' });
    fishBoat(k, c0 + 7.1, -11.35, { L: 1.4, dir: 1, hull: '#3f8d6b', gear: 'poles', trim: '#f2efe6', cab: 'aft' });
    // reeds on the marsh and cranes among them
    {
      for (let i = 0, n = 0; i < 400 && n < 130; i++) {
        const x = c0 + rng.range(-11, 11);
        const z = rng.range(-25, -14.8);
        const y = k.ground(x, z);
        if (y < -0.05 || y > 0.9 || k.isReserved(x, z, 0.15)) continue;
        reeds(k, x, z, rng.range(1.2, 2.0), rng);
        n++;
      }
      crane(k, c0 - 4.4, -16.9, 2.4, 0.5);
      crane(k, c0 - 3.6, -16.6, 2.0, -0.4);
      crane(k, c0 + 3.4, -17.6, 2.3, 0.9);
    }
    // a bank of sea fog lying along the back of the marsh, with thinner wisps drifting in the river
    {
      for (let i = 0; i < 16; i++) {
        const x = c0 - 15 + i * 2.0 + rng.range(-0.6, 0.6);
        const z = rng.range(-29, -22);
        const y = Math.max(0.0, k.ground(x, z)) - 0.12;
        const r = rng.range(0.9, 1.4);
        k.solid.ball(x, y, z, r, i % 3 ? '#e4ecef' : '#ecf2f4', { sx: 2.6, sy: 0.36, sz: 1.1, ao: 0 });
      }
      for (let i = 0; i < 4; i++) {
        const x = c0 + 0.3 + rng.range(-1.4, 1.4);
        const z = -19 - i * 3.2;
        k.solid.ball(x, -0.04, z, 1.0, '#eef3f4', { sx: 1.9, sy: 0.14, sz: 0.9, ao: 0 });
      }
    }
    // a shrine and the low town
    placeShrine(k, rng, c0 + 4.5, -19, -15.8, 1.6);
    townOf(k, { ...JP_HOUSES, floors: [1, 2] }, 3, -15.2, { rowStep: 0.62, gaps: 0.25, minY: 0.3 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#d62f2b', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Alaska ─────────────────────────────

/** Painted wooden and metal-roofed Alaskan houses: reds, blues, yellows and whites. */
const AK_HOUSES: HouseStyle = {
  walls: ['#d9d4c3', '#b8433a', '#3d6e8a', '#e0c14a', '#8aa07c', '#f1ece0', '#a8503a', '#5a86a8'],
  roofs: ['#8f2f2a', '#2f5f8a', '#3d6a52', '#6a6f75', '#3a3f46'],
  trim: '#f6f3ea',
  win: '#2c3a4a',
  floors: [1, 2],
  floorH: 0.2,
  w: [0.34, 0.54],
  d: [0.32, 0.44],
  roofKinds: [['gable', 5], ['front', 3], ['mono', 1]],
  pitch: 0.55,
  chimney: 0.2,
  gap: [0.02, 0.16],
  door: '#f6f3ea',
};

const POT_COLS: Col[] = ['#5f8a6a', '#c9712f', '#4f7fa0', '#8b9693', '#6a9a78'];

/** A stack of crab pots: a steel-framed cube in webbing, `tiers` high, with its frame lines drawn on the front. */
function potStack(k: PortKit, x: number, y: number, z: number, w: number, tiers: number, col: Col, front = true): void {
  const p = k.solid;
  const t = w * 0.52;
  p.boxV(x - w / 2, y, z - w / 2, w, t * tiers, w, col, { ao: 0.14 });
  if (!front) return;
  for (let i = 0; i <= tiers; i++) fq(p, x - w / 2, x + w / 2, y + i * t - 0.004, y + i * t + 0.008, z + w / 2 + 0.003, '#2e3436');
  fq(p, x - w / 2, x - w / 2 + 0.012, y, y + t * tiers, z + w / 2 + 0.003, '#2e3436');
  fq(p, x + w / 2 - 0.012, x + w / 2, y, y + t * tiers, z + w / 2 + 0.003, '#2e3436');
}

interface CrabOpts {
  L?: number;
  dir?: 1 | -1;
  hull?: Col;
  house?: Col;
  /** how many pots high at the forward end of the stacks */
  tiers?: number;
}

/**
 * A Bering Sea crab boat: a high flared bow, a tall white wheelhouse well forward, and the whole after deck piled
 * with stacks of crab pots, a knuckle-boom crane at the break of the deck.
 */
function crabBoat(k: PortKit, x: number, z: number, o: CrabOpts = {}): void {
  const L = o.L ?? 3.2;
  const dir = o.dir ?? 1;
  const p = k.solid;
  const B = L * 0.27;
  const rng = new Rng(k.seed ^ Math.floor(x * 53) ^ 0x3c1);
  k.at(x, 0, z, 0, 1, () => {
    const h = hull(p, { L, B, F: 0.15, bowRise: 0.22, sternRise: 0.0, dir, hull: o.hull ?? '#b8302a', boot: '#1d1f23', deck: '#6f7a74', fullTo: 0.68, bowPow: 1.9, rake: 0.16, stern: 0.1 });
    const X = h.X;
    // bulwarks along the visible side
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u0 = -L / 2 + (L * i) / n;
      const u1 = -L / 2 + (L * (i + 1)) / n;
      qa(p, [X(u0), h.deckY(u0), h.half(u0) - 0.005], [X(u1), h.deckY(u1), h.half(u1) - 0.005], [X(u1), h.deckY(u1) + 0.07, h.half(u1) - 0.005], [X(u0), h.deckY(u0) + 0.07, h.half(u0) - 0.005], tint(o.hull ?? '#b8302a', -0.1), [0, 0, 1]);
    }
    // the wheelhouse block forward
    const hu = L * 0.25;
    const dy = h.deckY(hu);
    const hc = o.house ?? '#f4f2ea';
    p.box(X(hu), dy, 0, L * 0.2, 0.2, B * 0.8, hc);
    p.box(X(hu + dir * 0.02 * L * 0), dy + 0.2, 0, L * 0.17, 0.16, B * 0.7, hc);
    p.box(X(hu), dy + 0.36, 0, L * 0.19, 0.025, B * 0.76, '#7c848a', { ao: 0 });
    k.glass.quad([X(hu - L * 0.085), dy + 0.24, B * 0.35 + 0.003], [X(hu + L * 0.085), dy + 0.24, B * 0.35 + 0.003], [X(hu + L * 0.085), dy + 0.33, B * 0.35 + 0.003], [X(hu - L * 0.085), dy + 0.33, B * 0.35 + 0.003], '#35505f');
    for (let i = 0; i < 4; i++) fq(p, X(hu) - L * 0.085 + i * L * 0.045, X(hu) - L * 0.085 + i * L * 0.045 + 0.05, dy + 0.06, dy + 0.14, B * 0.4 + 0.003, '#2a3744');
    p.cyl(X(hu - dir * L * 0.02), dy + 0.385, 0, 0.012, 0.01, 0.34, '#c9c5ba', { seg: 4, ao: 0 });
    p.box(X(hu - dir * L * 0.02), dy + 0.66, 0, 0.1, 0.012, 0.025, '#c9c5ba', { ao: 0 });
    // the stacks of pots on the after deck
    const colW = 0.19;
    const u0 = -L * 0.46;
    const u1 = L * 0.05;
    const cols = Math.floor((u1 - u0) / colW);
    for (let c = 0; c < cols; c++) {
      const u = u0 + colW * (c + 0.5);
      const tiers = Math.max(3, (o.tiers ?? 5) - (c < 2 ? 1 : 0) + (rng.chance(0.3) ? 1 : 0));
      const col = POT_COLS[(c + Math.floor(rng.next() * 2)) % POT_COLS.length];
      const yy = h.deckY(u);
      potStack(k, X(u), yy, B * 0.26, colW * 0.92, tiers, col, true);
      potStack(k, X(u), yy, 0.0, colW * 0.92, tiers + 1, tint(col, -0.06), false);
      potStack(k, X(u), yy, -B * 0.26, colW * 0.92, tiers, tint(col, 0.04), false);
    }
    // the knuckle-boom crane at the break of the deck
    const cu = u1 + 0.08;
    p.cyl(X(cu), h.deckY(cu), B * 0.3, 0.035, 0.03, 0.4, '#e8a32a', { seg: 6 });
    p.rod([X(cu), h.deckY(cu) + 0.38, B * 0.3], [X(cu - dir * 0.34), h.deckY(cu) + 0.62, B * 0.3], 0.018, '#e8a32a', 4);
    p.rod([X(cu - dir * 0.34), h.deckY(cu) + 0.62, B * 0.3], [X(cu - dir * 0.5), h.deckY(cu) + 0.4, B * 0.3], 0.012, '#e8a32a', 4);
  });
  k.reserve(x, z, L / 2 + 0.1, 0.5);
}

/** A block of stacked pots on the dock: `nx` columns, `nz` rows deep, stacks of `tiers`. */
function potYard(k: PortKit, x: number, z: number, nx: number, nz: number, tiers: number, rng: Rng, y = k.groundMax(x, z, nx * 0.1, nz * 0.1) - 0.02): void {
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const t = Math.max(2, tiers - (rng.chance(0.3) ? 1 : 0) - (j === 0 && rng.chance(0.3) ? 1 : 0));
      potStack(k, x + i * 0.2, y, z - j * 0.2, 0.19, t, rng.pick(POT_COLS), j === 0);
    }
  }
  k.reserve(x + (nx * 0.2) / 2 - 0.1, z - (nz * 0.2) / 2 + 0.1, (nx * 0.2) / 2 + 0.05, (nz * 0.2) / 2 + 0.1);
}

/** A big fish-processing plant: long white sheds with blue roofs, a stack and a pier crane. */
function processor(k: PortKit, x: number, z: number, w: number, roof: Col = '#2f5f8a'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, 0.6);
  p.box(x, k.groundMin(x, z, w / 2, 0.6) - 0.1, z, w, y - k.groundMin(x, z, w / 2, 0.6) + 0.1 + 0.62, 1.1, '#e7e5de');
  p.prism(x, y + 0.62, z, 1.14, 0.22, w + 0.06, roof, { ry: Math.PI / 2 });
  p.box(x - w * 0.18, y + 0.62, z + 0.1, w * 0.3, 0.5, 0.7, '#dbd9d1');
  p.prism(x - w * 0.18, y + 1.12, z + 0.1, 0.74, 0.14, w * 0.3 + 0.04, roof, { ry: Math.PI / 2 });
  for (let i = 0; i < Math.floor(w / 0.32); i++) fq(p, x - w / 2 + 0.1 + i * 0.32, x - w / 2 + 0.22 + i * 0.32, y + 0.24, y + 0.42, z + 0.553, '#3f5062');
  p.box(x, y + 0.14, z, w + 0.02, 0.04, 1.12, '#b94a3e', { ao: 0 });
  chimney(k, x + w * 0.34, z - 0.2, 1.4, 0.07, { y: y + 0.4, wall: '#d9d6cf', band: '#2f5f8a' });
  k.reserve(x, z, w / 2 + 0.05, 0.62);
}

// ───────────────────────────── Dutch Harbor ─────────────────────────────

const dutchHarbor: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#86a65c', land2: '#7a9c55', hill: '#6b9a47', rock: '#7b8b5c', sand: '#8d8f88', haze: '#d0dde4', snowLine: 7.6, snow: '#f2f6f8' };
    k.shape = { relief: 1.5, range: 5.5, rise: 4.2, rough: 0.8, freq: 0.13 };
    k.shore = 'quay';
    const c0 = centre(k, -13.6, 0.4);
    k.plateau(c0, -14.8, 11.5, 3.3, LAND_Y + 0.03, 0.5);
    // steep treeless Aleutian mountains, bright with moss and tundra, grey rock showing through high up
    massif(k, { x: c0 - 5.5, z: -22.5, rx: 9.5, rz: 6.5, h: 6.4, e: 1.3, rough: 0.25 });
    massif(k, { x: c0 + 6.5, z: -23.5, rx: 10.5, rz: 7, h: 7.2, e: 1.3, rough: 0.28 });
    const moss = c3('#6aa04a');
    const tundra = c3('#a39b68');
    const rockGrey = c3('#8a8a82');
    k.paint((x, y, z, slope, c) => {
      if (z > -14.6 || y < 0.7) return;
      const n = noise2(x * 0.45 + 3, z * 0.45, 31);
      c.lerp(n > 0.55 ? tundra : moss, 0.62 * smooth(0.7, 1.6, y) * (1 - smooth(0.4, 0.7, slope)));
      if (y > 3.0 && n < 0.4) c.lerp(rockGrey, 0.5 * smooth(3.0, 4.2, y));
    });
  },
  build(k) {
    const c0 = centre(k, -13.6, 0.4);
    const rng = new Rng(k.seed ^ 0x3d);
    // the quay and the boats
    pier(k, c0 - 8.4, c0 + 8.4, -12.55, -11.85, 0.4, '#8b8a84', false);
    {
      crabBoat(k, c0 - 2.9, -11.5, { dir: 1, hull: '#b8302a', tiers: 5 });
      crabBoat(k, c0 + 3.5, -11.5, { dir: -1, hull: '#2c4f86', tiers: 5, L: 3.0 });
      crabBoat(k, c0 - 7.6, -11.55, { dir: 1, hull: '#23272c', house: '#eeece4', tiers: 4, L: 2.7 });
    }
    // pots stacked on the dock
    potYard(k, c0 - 6.1, -13.0, 3, 2, 5, rng, LAND_Y);
    potYard(k, c0 + 5.8, -13.05, 3, 2, 4, rng, LAND_Y);
    // the church: Holy Ascension, white with green onion domes
    orthodox(k, c0 + 0.1, -13.9, 1.55, { dome: '#2f8a5f', roof: '#2f8a5f' });
    // fish plants and the little town
    processor(k, c0 - 3.9, -14.4, 2.4, '#2f5f8a');
    processor(k, c0 + 4.0, -14.5, 2.3, '#9b3b30');
    townOf(k, AK_HOUSES, 3, -15.9, { rowStep: 0.58, gaps: 0.18, rowRise: 0.0, maxSlope: 0.22, minY: 0.3 });
    // a few eagles on the dock posts
    for (const dx of [-4.0, 1.6, 5.8]) {
      post(k, c0 + dx, 0.4, -11.95, 0.34);
      k.solid.ball(c0 + dx, 0.78, -11.95, 0.04, '#f4f4f1', { sx: 0.9, sy: 1.1 });
      k.solid.ball(c0 + dx, 0.72, -11.95, 0.055, '#4a3a2c', { sy: 1.3 });
    }
    noTrees(k);
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Kodiak ─────────────────────────────

const kodiak: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6a8f58', land2: '#5f8552', hill: '#35623f', rock: '#47624f', sand: '#98938a', haze: '#cfdce4', snowLine: 7.2, snow: '#f2f6f9' };
    k.shape = { relief: 2.0, range: 6.5, rise: 4.0, rough: 0.7, freq: 0.11 };
    k.shore = 'quay';
    const c0 = centre(k, -13.5, 0.9);
    k.plateau(c0, -15.0, 12, 3.2, LAND_Y + 0.03, 0.5);
    massif(k, { x: c0 - 4, z: -22, rx: 10, rz: 7, h: 4.8, e: 1.25, rough: 0.2 });
    massif(k, { x: c0 + 6, z: -24, rx: 9, rz: 6.5, h: 5.6, e: 1.25, rough: 0.2 });
    forestPaint(k, '#2a5238', 0.7, 6.4, -14.6, 0.75);
  },
  build(k) {
    const c0 = centre(k, -13.5, 0.9);
    const rng = new Rng(k.seed ^ 0x6b);
    // the boat harbour: floating docks, the fleet rafted two deep
    pier(k, c0 - 9, c0 + 9, -12.55, -11.85, 0.4, '#8b8a84', false);
    k.solid.box(c0, 0.0, -10.15, 18, 0.05, 0.12, '#8b7a62', { ao: 0 });
    {
      const hulls: Col[] = ['#f2efe6', '#2c5da8', '#c8302a', '#2f6b4a', '#23272c', '#f2efe6', '#e9a31a', '#1f4a6a'];
      const gears: Array<FishOpts['gear']> = ['boom', 'poles', 'pots', 'boom', 'poles', 'none'];
      let x = c0 - 8.2;
      let i = 0;
      while (x < c0 + 8.0) {
        const L = rng.range(1.35, 2.2);
        const dir = rng.chance(0.55) ? 1 : -1;
        fishBoat(k, x + L / 2, -11.28 + rng.range(-0.05, 0.05), { L, dir, hull: hulls[i % hulls.length], trim: hulls[(i + 3) % hulls.length], gear: gears[i % gears.length], cab: i % 3 === 0 ? 'aft' : 'fwd' });
        x += L + rng.range(0.05, 0.2);
        i++;
      }
      x = c0 - 7.4;
      i = 4;
      while (x < c0 + 7.5) {
        const L = rng.range(1.2, 1.9);
        if (Math.abs(x + L / 2 - c0) > 1.0 || rng.chance(0.5)) fishBoat(k, x + L / 2, -10.35 + rng.range(-0.04, 0.04), { L, dir: rng.chance(0.5) ? 1 : -1, hull: hulls[i % hulls.length], trim: '#f4f1e8', gear: gears[(i + 2) % gears.length], cab: i % 2 ? 'aft' : 'fwd' });
        x += L + rng.range(0.25, 0.9);
        i++;
      }
    }
    // Holy Resurrection Cathedral: white, blue domes, on the rise above the harbour
    orthodox(k, c0 - 0.4, -14.2, 1.5, { dome: '#2c5da8', roof: '#2c5da8' });
    // the cannery and the town
    processor(k, c0 + 5.2, -14.4, 2.3, '#5a86a8');
    townOf(k, AK_HOUSES, 3, -15.7, { rowStep: 0.58, gaps: 0.12, rowRise: 0.05, maxSlope: 0.22, minY: 0.3 });
    conifers(k, { n: 130, minY: 0.6, maxY: 6, z0: -30, z1: -14.4, size: [1.0, 1.7], wood: 0.34 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.6], ['#c8302a', 0.4]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Anchorage ─────────────────────────────

const anchorage: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#86906a', land2: '#7b8962', hill: '#526f56', rock: '#6a7580', sand: '#8b8372', haze: '#cddce6', snowLine: 7.2, snow: '#f5f8fa' };
    k.shape = { relief: 1.2, range: 11, rise: 4.8, rough: 0.9, freq: 0.1 };
    k.shore = 'beach';
    const c0 = centre(k, -13.8, 0.6);
    k.plateau(c0 + 1.0, -14.2, 9.5, 2.8, LAND_Y + 0.02, 0.4);
    // the Chugach: a wall of snow peaks behind the foothills
    massif(k, { x: c0 - 6, z: -29, rx: 11, rz: 8, h: 6.6, e: 1.25, rough: 0.3 });
    massif(k, { x: c0 + 5, z: -31, rx: 12, rz: 8.5, h: 7.8, e: 1.3, rough: 0.32 });
    massif(k, { x: c0 - 15, z: -33, rx: 9, rz: 8, h: 6.0, e: 1.2, rough: 0.3 });
    // mudflats: Cook Inlet silt laid bare at low tide, with the dredged berth in front of the wharf left open
    const wharfX = c0 + 1.8;
    k.feature((x, z, h) => {
      const edge = 10.3 + (noise2(x * 0.5, 2.2, 19) - 0.5) * 0.9;
      const band = smooth(edge - 0.2, edge + 0.15, -z);
      const berth = smooth(3.4, 4.6, Math.abs(x - wharfX));
      return h < 0.06 && band * berth > 0.05 ? lerp(h, 0.07, Math.min(1, band * berth * 1.4)) : h;
    });
    const mud = c3('#8b8271');
    const mud2 = c3('#7a7262');
    k.paint((x, y, z, slope, c) => {
      if (y > -0.4 && y < 0.2 && z > -13) c.lerp(noise2(x * 1.3, z * 1.3, 8) > 0.55 ? mud2 : mud, 0.9);
    });
  },
  build(k) {
    const c0 = centre(k, -13.8, 0.6);
    const rng = new Rng(k.seed ^ 0x9d);
    const wx = c0 + 1.8;
    // the Port of Alaska: a wharf with two blue gantry cranes and a container ship alongside
    pier(k, wx - 4.4, wx + 4.4, -12.7, -11.6, 0.4, '#9a9890', false);
    {
      gantryCrane(k, wx - 1.4, -11.95, { color: '#2c5da8', s: 0.95, y: 0.4 });
      gantryCrane(k, wx + 1.7, -11.95, { color: '#2c5da8', s: 0.95, y: 0.4 });
      freighter(k, wx + 0.2, -10.7, { L: 5.4, dir: -1, hull: '#1e3a5f', boot: '#9b2f2a', house: '#f3f1ea', funnel: '#f1f1ee', band: '#2c5da8', cargo: 'boxes' });
      containerStack(k, wx - 3.6, -13.0, 6, 2, 3, rng, 0.4);
      containerStack(k, wx + 2.6, -13.1, 5, 2, 3, rng, 0.4);
    }
    // fuel tanks and the railway yard
    for (let i = 0; i < 4; i++) tank(k, c0 - 7.0 + (i % 2) * 0.9, -14.6 - Math.floor(i / 2) * 0.9, 0.38, 0.8, '#eceae4', { cone: true, band: '#c8302a' });
    for (let i = 0; i < 6; i++) k.solid.box(c0 + 6.4 + i * 0.5 - 1.2, LAND_Y, -13.4, 0.46, 0.17, 0.16, i === 0 ? '#1f4a8a' : ['#5a3b30', '#c9852a', '#4b5258'][i % 3], { ao: 0.1 });
    k.solid.box(c0 + 5.2, LAND_Y + 0.17, -13.4, 0.46, 0.04, 0.16, '#e8b923', { ao: 0 });
    // a low skyline: a handful of towers
    {
      const sky: Array<[number, number, number, number, Col, boolean]> = [
        [-3.6, -16.0, 1.5, 0.75, '#b9c3cb', false],
        [-2.4, -16.8, 2.35, 0.7, '#8fa9bd', true],
        [-1.0, -16.2, 1.7, 0.8, '#d6d1c4', false],
        [0.3, -17.2, 2.0, 0.7, '#a9b9c6', true],
        [1.7, -16.4, 1.3, 0.85, '#c9c2b4', false],
        [3.1, -17.0, 1.8, 0.7, '#9db2c3', true],
        [4.6, -16.2, 1.1, 0.8, '#d3cdc0', false],
        [-5.2, -16.9, 1.0, 0.8, '#c4ccd2', false],
      ];
      for (const [dx, zz, h, w, wall, glass] of sky) tower(k, c0 + dx, zz, w, 0.6, h, wall, { win: '#3f566b', cols: 3, rows: Math.round(h / 0.2), glass, roof: 'flat' });
    }
    townOf(k, { ...AK_HOUSES, floors: [1, 3] }, 3, -18.4, { rowStep: 0.6, gaps: 0.15, maxSlope: 0.25, minY: 0.3 });
    conifers(k, { n: 60, minY: 0.8, maxY: 4.5, z0: -28, z1: -19.5, cols: ['#3a5f48', '#44694f'] });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Prince Rupert ─────────────────────────────

/** A totem pole: a cedar log carved with stacked figures in red, black, teal and white, an eagle with spread wings on top. */
function totem(k: PortKit, x: number, z: number, h: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const w = 0.2 + h * 0.025;
  const n = Math.max(4, Math.round(h / 0.4));
  const sh = h / n;
  const cols: Col[] = ['#b8302a', '#1d2024', '#2f8a86', '#efe8d8', '#d6a23a', '#3f6ea5'];
  p.cyl(x, y, z, w * 0.52, w * 0.46, h, '#8a6a46', { seg: 6 });
  let off = Math.floor(rng.next() * cols.length);
  for (let i = 0; i < n; i++) {
    const c = cols[(off + i * 2) % cols.length];
    const yy = y + i * sh;
    const dark = c === '#1d2024';
    p.box(x, yy + 0.01, z + w * 0.34, w * 0.86, sh * 0.94, w * 0.2, c, { ao: 0.06 });
    // eyes with white rims, a dark mouth bar, and a beak or nose on every other figure
    for (const sx of [-1, 1]) {
      fq(p, x + sx * w * 0.2 - w * 0.12, x + sx * w * 0.2 + w * 0.12, yy + sh * 0.5, yy + sh * 0.76, z + w * 0.445 + 0.002, dark ? '#efe8d8' : '#14161a');
      fq(p, x + sx * w * 0.2 - w * 0.06, x + sx * w * 0.2 + w * 0.06, yy + sh * 0.56, yy + sh * 0.7, z + w * 0.445 + 0.004, dark ? '#14161a' : '#efe8d8');
    }
    fq(p, x - w * 0.3, x + w * 0.3, yy + sh * 0.14, yy + sh * 0.3, z + w * 0.445 + 0.002, '#14161a');
    if (i % 2) p.box(x, yy + sh * 0.34, z + w * 0.46, w * 0.16, sh * 0.3, w * 0.26, '#d6a23a', { rx: 0.25, ao: 0 });
  }
  off += 1;
  // the thunderbird: a head and two wings spread to each side
  const ty = y + h - sh * 0.1;
  p.box(x, ty - 0.02, z + w * 0.3, w * 0.7, sh * 0.8, w * 0.3, '#b8302a');
  p.box(x, ty + sh * 0.2, z + w * 0.46, w * 0.18, sh * 0.5, w * 0.26, '#d6a23a', { rx: 0.5, ao: 0 });
  for (const sx of [-1, 1]) {
    p.box(x + sx * w * 0.95, ty - 0.05, z + w * 0.3, w * 0.9, sh * 0.15, w * 0.14, '#1d2024', { rz: sx * 0.3, ao: 0 });
    p.box(x + sx * w * 0.95, ty + 0.1, z + w * 0.3, w * 0.8, sh * 0.1, w * 0.12, '#2f8a86', { rz: sx * 0.3, ao: 0 });
  }
  k.reserve(x, z, w * 1.6, 0.25);
}

/** A grain terminal: two rows of concrete silos, a gallery and head house on top, a belt down to the pier and a shiploader. */
function grainTerminal(k: PortKit, x: number, z: number, nx: number, o: { col?: Col; pierZ?: number } = {}): void {
  const p = k.solid;
  const r = 0.31;
  const H = 2.3;
  silos(k, x, z, nx, 2, r, H, o.col ?? '#d9d6cd', { y: k.groundMax(x, z, nx * r, 1) - 0.05 });
  const pz = o.pierZ ?? -12.3;
  const lx = x + nx * r * 0.55;
  const y0 = k.groundMax(x, z, nx * r, 1);
  // a covered belt gallery from the silo roof down to the shiploader, on legs
  const za = z + r * 1.9;
  const zb = pz - 0.2;
  const ya = y0 + H + 0.2;
  const yb = 1.4;
  const ang = Math.atan2(ya - yb, zb - za);
  const len = Math.hypot(zb - za, ya - yb);
  p.box(lx, (ya + yb) / 2 - 0.085, (za + zb) / 2, 0.18, 0.17, len, '#d4d0c6', { rx: ang, ao: 0 });
  for (const t of [0.3, 0.6, 0.85]) {
    const zz = lerp(za, zb, t);
    const yy = lerp(ya, yb, t);
    const g = Math.max(k.ground(lx, zz), 0);
    p.box(lx - 0.025, g - 0.04, zz - 0.025, 0.05, yy - g - 0.05, 0.05, '#7f8387', { ao: 0 });
  }
  // the shiploader on the pier, its boom reaching out over the berth
  pier(k, lx - 1.3, lx + 1.3, pz - 0.7, pz + 0.65, 0.4, '#8f8d86', false);
  p.box(lx - 0.17, 0.4, pz - 0.2, 0.34, 1.0, 0.34, '#e8b923');
  p.box(lx - 0.1, 1.4, pz + 0.7, 0.2, 0.12, 2.1, '#e8b923', { ao: 0 });
  p.box(lx - 0.18, 1.34, pz - 0.28, 0.36, 0.14, 0.46, '#c9a21c', { ao: 0 });
  p.rod([lx, 1.55, pz - 0.15], [lx, 1.45, pz + 2.8], 0.006, '#4a4540', 3);
  p.box(lx - 0.06, 1.0, pz + 2.6, 0.12, 0.4, 0.12, '#c9a21c', { ao: 0 });
  k.reserve(lx, pz + 1.0, 0.5, 1.5);
}

const princeRupert: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#5d7a55', land2: '#547050', hill: '#2d5640', rock: '#415c4c', sand: '#8e8f86', haze: '#cddce6', snowLine: 7.0, snow: '#f4f7fa' };
    k.shape = { relief: 2.0, range: 6.5, rise: 4.0, rough: 0.7, freq: 0.1 };
    k.shore = 'rock';
    const c0 = centre(k, -13.8, 0.5);
    k.plateau(c0, -14.4, 11.5, 3.0, LAND_Y + 0.03, 0.5);
    massif(k, { x: c0 - 8, z: -22, rx: 10, rz: 6.5, h: 5.4, e: 1.25, rough: 0.2 });
    massif(k, { x: c0 + 8, z: -23, rx: 10, rz: 7, h: 6.2, e: 1.25, rough: 0.22 });
    forestPaint(k, '#264c37', 0.7, 7.0, -14.8, 0.8);
  },
  build(k) {
    const c0 = centre(k, -13.8, 0.5);
    const rng = new Rng(k.seed ^ 0x52);
    // the totem poles on the waterfront lawn
    {
      const hs = [2.3, 2.9, 2.5, 3.1, 2.1];
      for (let i = 0; i < hs.length; i++) totem(k, c0 - 4.3 + i * 0.78, -13.3 - (i % 2) * 0.25, hs[i], rng, LAND_Y - 0.02);
    }
    // the grain terminal and a bulk carrier loading at its berth
    {
      grainTerminal(k, c0 + 4.0, -15.3, 7, { pierZ: -12.35 });
      freighter(k, c0 + 4.2, -10.75, { L: 5.4, dir: -1, hull: '#6a2a2a', boot: '#1d1f23', house: '#f4f2ea', funnel: '#2c5da8', cargo: 'bulk' });
    }
    // fishing boats at the float
    fishBoat(k, c0 - 6.6, -11.4, { L: 1.6, dir: 1, hull: '#2c5da8', trim: '#f4f1e8', gear: 'poles', cab: 'fwd' });
    fishBoat(k, c0 - 4.6, -11.35, { L: 1.8, dir: -1, hull: '#f2efe6', trim: '#c8302a', gear: 'boom', cab: 'aft' });
    fishBoat(k, c0 - 2.5, -11.4, { L: 1.5, dir: 1, hull: '#2f6b4a', trim: '#f4f1e8', gear: 'pots', cab: 'fwd' });
    // Cow Bay: coloured wooden houses along the waterfront
    townOf(k, PNW_HOUSES, 3, -15.9, { rowStep: 0.6, gaps: 0.2, maxSlope: 0.25, minY: 0.3 });
    conifers(k, { n: 120, minY: 0.6, maxY: 6.4, z0: -30, z1: -15.0, size: [1.0, 1.7], wood: 0.34 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Vancouver ─────────────────────────────

/** Canada Place: a long white pier building under five white sails, a hotel tower behind. */
function canadaPlace(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const W = 5.2;
  pier(k, x - W / 2, x + W / 2, z - 0.95, z + 0.95, 0.42, '#d2cfc6', false);
  // the glazed terminal under the sails
  p.box(x, 0.4, z - 0.05, W - 0.2, 0.34, 1.5, '#e9e8e2');
  k.glass.quad([x - W / 2 + 0.2, 0.46, z + 0.705], [x + W / 2 - 0.2, 0.46, z + 0.705], [x + W / 2 - 0.2, 0.68, z + 0.705], [x - W / 2 + 0.2, 0.68, z + 0.705], '#7fa6b8');
  for (let i = 0; i <= 12; i++) fq(p, x - W / 2 + 0.2 + i * ((W - 0.4) / 12) - 0.01, x - W / 2 + 0.2 + i * ((W - 0.4) / 12) + 0.01, 0.46, 0.68, z + 0.708, '#f4f4f1');
  // five sails: steep white tents with a ridge that climbs towards the building behind
  const hs = [1.35, 1.55, 1.7, 1.55, 1.35];
  for (let i = 0; i < 5; i++) {
    const cx = x - 2.0 + i * 1.0;
    const hw = 0.48;
    const zf = z + 0.7;
    const zb = z - 0.75;
    const h = hs[i];
    const V: V3[] = [[cx - hw, 0.74, zf], [cx + hw, 0.74, zf], [cx + hw, 0.74, zb], [cx - hw, 0.74, zb], [cx, 0.74 + h, zb + 0.2], [cx, 0.74 + h * 0.18, zf]];
    p.solid(V, [[0, 1, 5], [1, 2, 4, 5], [2, 3, 4], [3, 0, 5, 4]], i % 2 ? '#f2f3f2' : '#f7f7f5', { ao: 0 });
    p.rod([cx, 0.74 + h, zb + 0.2], [cx, 0.74 + h + 0.28, zb + 0.2], 0.01, '#d6d8d8', 3);
  }
  // the hotel tower rising behind the sails
  tower(k, x + 0.2, z - 1.6, 1.4, 0.7, 2.6, '#dfe5e7', { y: 0.4, glass: true, win: '#4d6f80', cols: 6, rows: 14, roof: 'flat' });
  // flagpoles at the head of the pier
  for (const dx of [-2.3, -2.1, 2.1, 2.3]) p.cyl(x + dx, 0.4, z + 0.88, 0.012, 0.01, 0.8, '#e8e8e6', { seg: 4, ao: 0 });
  k.reserve(x, z - 0.3, W / 2 + 0.1, 1.4);
}

/** A heap of sulphur: a faceted yellow ridge with slumped sides, as piled on the North Shore wharves. */
function sulphurPile(k: PortKit, x: number, z: number, w: number, d: number, h: number, rng: Rng): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2) - 0.06;
  const cols = ['#e8c21a', '#f0cc2a', '#dcb414', '#efc61e', '#d8ae10'];
  const rj = () => rng.range(-0.06, 0.06);
  // base outline and a ridge with two peaks
  const V: V3[] = [
    [x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2],
    [x - w * 0.28 + rj(), y + h, z + rj() * 0.5], [x + w * 0.05 + rj(), y + h * 0.78, z + rj() * 0.5], [x + w * 0.3 + rj(), y + h * 0.94, z + rj() * 0.5],
  ];
  p.solid(V, [[0, 1, 5, 4], [1, 6, 5], [1, 2, 6], [2, 3, 4, 5, 6], [3, 0, 4], [0, 1, 2, 3]], cols[0], { ao: 0.05 });
  // darker slumps
  p.solid([[x - w * 0.5, y, z + d * 0.5], [x - w * 0.1, y, z + d * 0.5], [x - w * 0.28, y + h * 0.95, z + 0.01]], [[0, 1, 2]], cols[2], { ao: 0 });
  p.solid([[x + w * 0.1, y, z + d * 0.5], [x + w * 0.5, y, z + d * 0.5], [x + w * 0.3, y + h * 0.9, z + 0.01]], [[0, 1, 2]], cols[1], { ao: 0 });
  for (let i = 0; i < 6; i++) {
    const rx = x + rng.range(-w * 0.5, w * 0.5);
    p.rock(rx, y - 0.02, z + d * 0.5 + rng.range(0, 0.1), rng.range(0.07, 0.14), pick(rng, cols), { sy: 0.6, ao: 0 });
  }
  k.reserve(x, z, w / 2 + 0.1, d / 2 + 0.1);
}

const vancouver: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#5f7c58', land2: '#567352', hill: '#2f5a42', rock: '#6c7882', sand: '#8e8f86', haze: '#cddce6', snowLine: 6.6, snow: '#f5f8fa' };
    k.shape = { relief: 1.6, range: 4.5, rise: 5.5, rough: 0.7, freq: 0.1 };
    k.shore = 'quay';
    const c0 = centre(k, -14, 0);
    k.plateau(c0 + 1, -14.2, 12, 3.4, LAND_Y + 0.03, 0.5);
    // the Narrows: a channel of water at the left, under the bridge
    channel(k, c0 - 4.6, 1.9, -40, -0.45);
    // the North Shore: the twin peaks of the Lions, rounded Grouse, a forest of conifers on every slope
    massif(k, { x: c0 + 3.4, z: -28, rx: 5.6, rz: 6, h: 9.4, e: 1.0, rough: 0.1 });
    massif(k, { x: c0 + 8.2, z: -28.5, rx: 5.2, rz: 5.8, h: 8.2, e: 1.0, rough: 0.1 });
    massif(k, { x: c0 - 7.5, z: -25.5, rx: 11, rz: 7, h: 5.6, e: 1.25, rough: 0.2 });
    forestPaint(k, '#264d39', 0.7, 6.0, -15.5, 0.8);
  },
  build(k) {
    const c0 = centre(k, -14, 0);
    const rng = new Rng(k.seed ^ 0x8a);
    // Lions Gate Bridge, mint-green, over the Narrows
    {
      const xn = c0 - 4.6;
      suspension(k, xn - 4.2, xn + 4.2, -15.8, [xn - 2.4, xn + 2.4], 1.9, { deck: 1.05, half: 0.18, color: '#4f9478', deckColor: '#a5aaa8', cable: '#4f9478' });
    }
    canadaPlace(k, c0 + 2.0, -12.75);
    // the sulphur piles at the North Shore terminal, a conveyor and a loading pier
    {
      sulphurPile(k, c0 + 5.7, -15.2, 2.2, 1.3, 1.25, rng);
      sulphurPile(k, c0 + 7.9, -15.0, 1.9, 1.2, 1.0, rng);
      sulphurPile(k, c0 + 5.0, -17.4, 1.8, 1.0, 0.85, rng);
      conveyor(k, c0 + 5.2, c0 + 6.6, -13.5, 1.0, 1.5, '#cfc6a0');
      k.solid.box(c0 + 6.6, 0.3, -13.5, 0.3, 1.45, 0.3, '#8a8f93');
    }
    // downtown glass towers, tall and slim
    {
      const tw: Array<[number, number, number, number, Col]> = [
        [-1.6, -17.4, 2.4, 0.55, '#9db9c4'], [-0.6, -18.1, 3.1, 0.6, '#7ea3b0'], [0.4, -17.5, 2.0, 0.55, '#b4c6cb'],
        [1.6, -18.6, 2.8, 0.55, '#8eb0b2'], [2.9, -17.6, 2.2, 0.6, '#a6bec7'], [-2.7, -18.6, 1.8, 0.6, '#c3ccd0'], [4.1, -18.4, 1.7, 0.6, '#9ab1bb'],
      ];
      for (const [dx, zz, h, w, wall] of tw) tower(k, c0 + dx, zz, w, 0.5, h, wall, { win: '#3b5a66', cols: 3, rows: Math.round(h / 0.17), glass: true, roof: 'flat' });
    }
    townOf(k, PNW_HOUSES, 2, -15.4, { rowStep: 0.6, gaps: 0.3, maxSlope: 0.25, minY: 0.3, shift: -3 });
    conifers(k, { n: 130, minY: 0.6, maxY: 6.2, z0: -30, z1: -16.8, size: [1.0, 1.7], wood: 0.34 });
    fishBoat(k, c0 - 6.8, -11.4, { L: 1.6, dir: 1, hull: '#2c5da8', trim: '#f4f1e8', gear: 'boom', cab: 'fwd' });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Seattle ─────────────────────────────

/** The Space Needle: three slim legs into an hourglass, a flying-saucer head with a glass ring and a halo, a spire. */
function spaceNeedle(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.4, 0.4) - 0.04;
  const white = '#f3f3f0';
  const R = (t: number): number => lerp(0.4, 0.1, smooth(0, 0.45, t)) + 0.1 * smooth(0.45, 0.74, t);
  const n = 7;
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * Math.PI * 2 + 0.5;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * 0.74;
      const t1 = ((i + 1) / n) * 0.74;
      p.rod([x + Math.cos(a) * R(t0), y + t0 * H, z + Math.sin(a) * R(t0)], [x + Math.cos(a) * R(t1), y + t1 * H, z + Math.sin(a) * R(t1)], 0.028, white, 5);
    }
  }
  // the rings that tie the legs together, the core shaft
  for (const t of [0.12, 0.3, 0.45, 0.6]) p.cyl(x, y + t * H, z, R(t) + 0.02, R(t) + 0.02, 0.025, '#e1e3e2', { seg: 6, ao: 0 });
  p.cyl(x, y, z, 0.07, 0.07, H * 0.78, '#e9eae8', { seg: 6, ao: 0 });
  // the saucer
  const sy = y + H * 0.74;
  p.lathe(x, sy, z, [[0.1, 0], [0.34, 0.02], [0.6, 0.12], [0.66, 0.2], [0.62, 0.3], [0.5, 0.36], [0.2, 0.4], [0.0, 0.4]], white, { seg: 12, ao: 0.04 });
  p.cyl(x, sy + 0.15, z, 0.67, 0.67, 0.03, '#e8742a', { seg: 12, ao: 0 });
  k.glass.cyl(x, sy + 0.18, z, 0.62, 0.62, 0.1, '#6c92a8', { seg: 12 });
  p.cyl(x, sy + 0.4, z, 0.3, 0.1, 0.12, white, { seg: 10 });
  p.cone(x, sy + 0.52, z, 0.05, H * 0.2, '#ececea', { seg: 5 });
  p.rod([x, sy + 0.52 + H * 0.2, z], [x, sy + 0.52 + H * 0.3, z], 0.008, '#e3e3e1', 3);
  k.reserve(x, z, 0.8, 0.8);
}

/** A Washington State Ferry: white decks over a green hull, two funnels, a car deck with its row of openings. */
function stateFerry(k: PortKit, x: number, z: number, L: number, dir: 1 | -1): void {
  const p = k.solid;
  k.at(x, 0, z, 0, 1, () => {
    const B = L * 0.2;
    const h = hull(p, { L, B, F: 0.2, bowRise: 0.04, sternRise: 0.04, dir, hull: '#1d5c42', boot: '#14171a', deck: '#8e948f', fullTo: 0.78, bowPow: 3.0, rake: 0.05, stern: 0.06 });
    const X = h.X;
    p.box(X(0), 0.2, 0, L * 0.82, 0.2, B * 0.96, '#f3f3ef');
    for (let u = -L * 0.38; u < L * 0.38; u += 0.2) fq(p, X(u) - 0.07, X(u) + 0.07, 0.25, 0.34, B * 0.48 + 0.003, '#27323d');
    p.box(X(0.02 * L), 0.4, 0, L * 0.7, 0.18, B * 0.84, '#f6f6f2');
    for (let u = -L * 0.3; u < L * 0.32; u += 0.17) fq(p, X(u) - 0.05, X(u) + 0.05, 0.46, 0.54, B * 0.42 + 0.003, '#2a3a4a');
    p.box(X(-0.04 * L), 0.58, 0, L * 0.4, 0.15, B * 0.6, '#f3f3ef');
    p.box(X(0.2 * L), 0.58, 0, L * 0.14, 0.2, B * 0.62, '#f3f3ef');
    k.glass.quad([X(0.2 * L - L * 0.06), 0.66, B * 0.31 + 0.003], [X(0.2 * L + L * 0.06), 0.66, B * 0.31 + 0.003], [X(0.2 * L + L * 0.06), 0.74, B * 0.31 + 0.003], [X(0.2 * L - L * 0.06), 0.74, B * 0.31 + 0.003], '#35505f');
    for (const u of [-0.12 * L, 0.06 * L]) {
      p.cyl(X(u), 0.73, 0, 0.1, 0.09, 0.3, '#1d5c42', { seg: 10 });
      p.cyl(X(u), 0.9, 0, 0.095, 0.092, 0.06, '#e8c23a', { seg: 10, ao: 0 });
      p.cyl(X(u), 1.0, 0, 0.09, 0.088, 0.04, '#14171a', { seg: 10, ao: 0 });
    }
  });
  k.reserve(x, z, L / 2 + 0.1, 0.6);
}

const seattle: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#628058', land2: '#587852', hill: '#33603f', rock: '#6d7a80', sand: '#8e8f86', haze: '#cfdde7', snowLine: 8.4, snow: '#f5f8fa' };
    k.shape = { relief: 1.8, range: 4.0, rise: 5.0, rough: 0.6, freq: 0.09 };
    k.shore = 'quay';
    const c0 = centre(k, -14, 0.5);
    k.plateau(c0, -14.6, 12.5, 3.4, LAND_Y + 0.03, 0.5);
    // Mt Rainier, vast and white over everything
    const rx = c0 + 5;
    massif(k, { x: rx, z: -46, rx: 28, rz: 22, h: 16, e: 1.55, rough: 0.05, crater: 0.5 });
    stain(k, rx, -46, 28, 24, '#6f87a8', 0.85);
    snowCap(k, rx, -46, 28, 24, 8.4, '#f4f7fa');
    forestPaint(k, '#2c5a40', 0.7, 5.0, -15.5, 0.65);
  },
  build(k) {
    const c0 = centre(k, -14, 0.5);
    const rng = new Rng(k.seed ^ 0x31);
    spaceNeedle(k, c0 - 3.4, -17.0, 5.6);
    // the Great Wheel at the end of its pier
    {
      pier(k, c0 + 0.9, c0 + 4.3, -13.3, -11.0, 0.42, '#9a7f62', true);
      ferrisWheel(k, c0 + 2.6, -12.25, 1.45, { y: 0.42, gondolas: 21, frame: '#f4f6f6', cars: ['#f4f6f6', '#f4f6f6', '#8fc3de', '#f4f6f6'], rimR: 0.022 });
    }
    // the ferry at the terminal, and gantry cranes at the container berth
    stateFerry(k, c0 - 5.6, -11.3, 4.6, 1);
    {
      pier(k, c0 + 5.0, c0 + 9.0, -13.0, -11.7, 0.4, '#9a9890', false);
      gantryCrane(k, c0 + 6.0, -12.15, { color: '#2c5da8', s: 0.9, y: 0.4 });
      gantryCrane(k, c0 + 7.8, -12.15, { color: '#2c5da8', s: 0.9, y: 0.4 });
      containerStack(k, c0 + 5.6, -13.8, 8, 2, 3, rng, 0.4);
    }
    // downtown
    {
      const tw: Array<[number, number, number, number, Col, boolean]> = [
        [-1.0, -17.2, 2.3, 0.7, '#c9cfd3', false], [0.2, -18.0, 3.9, 0.9, '#23262b', true], [1.4, -17.4, 2.5, 0.7, '#9db7c6', true],
        [2.6, -18.2, 3.0, 0.7, '#d7d9d6', false], [3.9, -17.5, 2.2, 0.75, '#a9bfcb', true], [5.0, -18.3, 1.7, 0.8, '#d4cfc3', false],
        [-2.2, -18.4, 1.9, 0.7, '#b8c2c8', false], [6.2, -17.6, 1.2, 0.8, '#c9c3b6', false],
      ];
      for (const [dx, zz, h, w, wall, glass] of tw) tower(k, c0 + dx, zz, w, 0.55, h, wall, { win: wall === '#23262b' ? '#6f8190' : '#3b5566', cols: 3, rows: Math.round(h / 0.17), glass, roof: 'flat' });
    }
    townOf(k, PNW_HOUSES, 3, -19.4, { rowStep: 0.6, gaps: 0.25, maxSlope: 0.25, minY: 0.3 });
    conifers(k, { n: 80, minY: 0.6, maxY: 5.0, z0: -32, z1: -20, size: [1.0, 1.6], wood: 0.4 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#2f7a5c', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Tacoma ─────────────────────────────

/** The Tacoma Dome: a vast timber geodesic dome, a ring of buttresses at its foot. */
function tacomaDome(k: PortKit, x: number, z: number, r: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r * 0.6, r * 0.6) - 0.05;
  p.cyl(x, y - 0.1, z, r, r, 0.3, '#c9bfa6', { seg: 18 });
  p.lathe(x, y + 0.2, z, [[r * 0.995, 0], [r * 0.96, r * 0.28], [r * 0.82, r * 0.55], [r * 0.58, r * 0.75], [r * 0.3, r * 0.87], [0.001, r * 0.9]], '#c4a272', { seg: 16, ao: 0.04 });
  // the lattice: darker bands in rings
  for (const t of [0.22, 0.45, 0.65]) {
    const rr = r * Math.sqrt(Math.max(0.05, 1 - (t / 0.9) * (t / 0.9))) * 1.0;
    p.cyl(x, y + 0.2 + r * t, z, rr * 0.99, rr * 0.99, 0.02, '#8f6f48', { seg: 16, ao: 0, open: true });
  }
  // the timber ribs running up to the crown
  for (let m = 0; m < 10; m++) {
    const a = (m / 10) * Math.PI * 2;
    let prev: V3 | null = null;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const ang = t * 1.28;
      const rr = r * 0.99 * Math.cos(ang) * (1 - 0.0 * t);
      const q: V3 = [x + Math.cos(a) * rr, y + 0.2 + r * 0.9 * Math.sin(ang) * 0.98, z + Math.sin(a) * rr];
      if (prev) p.rod(prev, q, 0.012, '#8f6f48', 3);
      prev = q;
    }
  }
  k.reserve(x, z, r + 0.1, r + 0.1);
}

/** A glaciated volcano: dark rock ribs running down between white glaciers (painted on the terrain). */
function glacierRibs(k: PortKit, x0: number, z0: number, rx: number, rz: number, y0: number): void {
  const rock = c3('#6a6d72');
  k.paint((x, y, z, slope, c) => {
    const d = Math.hypot((x - x0) / rx, (z - z0) / rz);
    if (d > 0.82 || y < y0) return;
    const ang = Math.atan2(z - z0, x - x0);
    const stripe = smooth(0.62, 0.78, noise2(ang * 5.5 + 3, d * 3, 77));
    c.lerp(rock, 0.75 * stripe * smooth(0.0, 0.1, d - 0.1));
  });
}

const tacoma: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6a8858', land2: '#5f7f52', hill: '#36643f', rock: '#6d7a80', sand: '#8e8f86', haze: '#cfdde7', snowLine: 7.4, snow: '#f5f8fa' };
    k.shape = { relief: 1.2, range: 3.2, rise: 6.0, rough: 0.5, freq: 0.09 };
    k.shore = 'quay';
    const c0 = centre(k, -13.8, 0.5);
    k.plateau(c0, -14.6, 13, 3.6, LAND_Y + 0.03, 0.5);
    // Mt Rainier, big and close behind the port
    const rx = c0 - 0.5;
    massif(k, { x: rx, z: -40, rx: 30, rz: 24, h: 16.5, e: 1.45, rough: 0.05, crater: 0.6 });
    stain(k, rx, -40, 30, 26, '#6f87a8', 0.85);
    snowCap(k, rx, -40, 30, 26, 7.4, '#f6f8fb');
    glacierRibs(k, rx, -40, 30, 24, 7.0);
    forestPaint(k, '#2c5a40', 0.7, 5.0, -15.5, 0.65);
  },
  build(k) {
    const c0 = centre(k, -13.8, 0.5);
    const rng = new Rng(k.seed ^ 0x77b);
    // the container berth: a row of gantry cranes, a ship alongside, stacks behind
    {
      pier(k, c0 - 8.5, c0 + 6.8, -13.0, -11.7, 0.4, '#9a9890', false);
      const cols: Col[] = ['#2c5da8', '#e07a1f', '#2f8a5f', '#2c5da8', '#c8302a'];
      for (let i = 0; i < 5; i++) gantryCrane(k, c0 - 6.2 + i * 2.5, -12.15, { color: cols[i], s: 1.1, y: 0.4 });
      freighter(k, c0 - 2.6, -10.55, { L: 6.4, dir: 1, hull: '#1d3a5c', boot: '#9b2f2a', house: '#f3f1ea', funnel: '#2c5da8', band: '#f1f1ee', cargo: 'boxes' });
      containerStack(k, c0 - 7.2, -13.9, 9, 3, 3, rng, 0.4);
      containerStack(k, c0 + 0.6, -13.9, 8, 3, 4, rng, 0.4);
    }
    tacomaDome(k, c0 + 4.9, -16.9, 1.9);
    // tugs and the grain silos
    silos(k, c0 - 7.4, -17.6, 4, 2, 0.28, 1.5, '#e2dfd6');
    townOf(k, PNW_HOUSES, 3, -19.0, { rowStep: 0.6, gaps: 0.25, maxSlope: 0.25, minY: 0.3 });
    conifers(k, { n: 80, minY: 0.6, maxY: 5.0, z0: -32, z1: -20, size: [1.0, 1.6], wood: 0.4 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#2f7a5c', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Portland ─────────────────────────────

/** St Johns Bridge: a suspension bridge in green steel with two gothic towers: pointed arches, tracery, spires. */
function stJohns(k: PortKit, x0: number, x1: number, z: number, towers: [number, number], towerH: number, deck: number): void {
  const green = '#4a8a63';
  const p = k.solid;
  suspension(k, x0, x1, z, towers, towerH, { deck, half: 0.2, color: green, deckColor: '#a9acaa', cable: '#3f7a56' });
  for (const tx of towers) {
    const top = deck + towerH;
    for (const s of [-1, 1]) {
      const zz = z + s * 0.19;
      p.box(tx, deck - 0.1, zz, 0.15, towerH + 0.1, 0.12, tint(green, -0.04));
      // a spire on each leg
      p.pyramid(tx, top, zz, 0.2, 0.55, 0.18, tint(green, 0.06));
      p.pyramid(tx, top + 0.45, zz, 0.07, 0.3, 0.07, tint(green, 0.1));
    }
    // two pointed arches between the legs, one near the top and one at mid height, with a rose between
    for (const [ya, hh] of [[top - 0.7, 0.62], [deck + towerH * 0.45, 0.5]] as Array<[number, number]>) {
      p.box(tx, ya, z, 0.1, 0.05, 0.4, green, { ao: 0 });
      p.rod([tx, ya + 0.05, z - 0.19], [tx, ya + hh, z - 0.03], 0.022, green, 4);
      p.rod([tx, ya + 0.05, z + 0.19], [tx, ya + hh, z + 0.03], 0.022, green, 4);
    }
    p.ball(tx, top - 0.3, z, 0.07, tint(green, 0.15), { sx: 0.4, sy: 1, sz: 1 });
    p.box(tx, deck + towerH * 0.82, z, 0.1, 0.04, 0.4, green, { ao: 0 });
    p.box(tx, deck + towerH * 0.25, z, 0.1, 0.04, 0.4, green, { ao: 0 });
  }
}

const portland: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6b8a58', land2: '#608053', hill: '#33603f', rock: '#6d7a80', sand: '#8e8f86', haze: '#d2e0e8', snowLine: 8.6, snow: '#f5f8fa' };
    k.shape = { relief: 2.4, range: 5.0, rise: 4.2, rough: 0.6, freq: 0.09 };
    k.shore = 'quay';
    const c0 = centre(k, -13.8, 0.5);
    k.plateau(c0, -14.4, 12.5, 3.0, LAND_Y + 0.03, 0.5);
    // the Willamette, running in under the bridge
    channel(k, c0 - 3.0, 2.6, -42, -0.5);
    massif(k, { x: c0 - 13, z: -23, rx: 8, rz: 7, h: 4.6, e: 1.3, rough: 0.2 });
    massif(k, { x: c0 + 9.5, z: -24, rx: 8, rz: 6, h: 3.8, e: 1.3, rough: 0.2 });
    // Mt Hood, a steep white cone far behind
    const hx = c0 + 1.0;
    massif(k, { x: hx, z: -42, rx: 24, rz: 20, h: 16.5, e: 1.7, rough: 0.05, crater: 0.5 });
    stain(k, hx, -42, 26, 22, '#6f87a8', 0.85);
    snowCap(k, hx, -42, 26, 22, 8.2, '#f4f7fa');
    forestPaint(k, '#2a553d', 0.7, 6.0, -15.5, 0.75);
  },
  build(k) {
    const c0 = centre(k, -13.8, 0.5);
    const rng = new Rng(k.seed ^ 0x19);
    {
      const xn = c0 - 3.0;
      stJohns(k, xn - 5.2, xn + 5.2, -15.6, [xn - 3.1, xn + 3.1], 2.7, 1.15);
    }
    // Terminal 5: grain silos with a ship alongside, and a gantry crane
    {
      silos(k, c0 + 5.9, -15.6, 5, 2, 0.3, 2.0, '#dcd9d0');
      pier(k, c0 + 3.4, c0 + 8.6, -12.8, -11.7, 0.4, '#9a9890', false);
      gantryCrane(k, c0 + 4.6, -12.2, { color: '#c8302a', s: 0.9, y: 0.4 });
      freighter(k, c0 + 6.1, -10.6, { L: 5.0, dir: -1, hull: '#2c4a3a', boot: '#9b2f2a', house: '#f3f1ea', funnel: '#c8302a', cargo: 'bulk' });
      // a lot of new cars waiting for export
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
        const x = c0 + 1.5 + i * 0.3;
        k.solid.box(x, LAND_Y, -13.5 - r * 0.28, 0.26, 0.07, 0.12, pick(rng, ['#e9e9e5', '#2c3036', '#b8302a', '#6d7d8c', '#d9d9d3', '#2c5da8']), { ao: 0.1 });
        k.solid.box(x + 0.05, LAND_Y + 0.07, -13.5 - r * 0.28, 0.14, 0.05, 0.11, '#3a4a58', { ao: 0 });
      }
    }
    townOf(k, PNW_HOUSES, 3, -18.4, { rowStep: 0.6, gaps: 0.25, maxSlope: 0.25, minY: 0.3 });
    conifers(k, { n: 150, minY: 0.6, maxY: 5.6, z0: -32, z1: -17.4, size: [1.0, 1.7], wood: 0.32 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#2f7a5c', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Long Beach ─────────────────────────────

/** Southern California stucco: cream, sand and pastel walls under red tile or flat roofs. */
const CA_HOUSES: HouseStyle = {
  walls: ['#f1e6cf', '#e8cfa0', '#efd9c0', '#d9c9a8', '#f4efe4', '#e8b9a0', '#cfe0d8'],
  roofs: ['#b8553d', '#c4673f', '#a64b36', '#c97b4a'],
  trim: '#f6f3ea',
  win: '#3a4a58',
  floors: [1, 3],
  floorH: 0.19,
  w: [0.34, 0.54],
  d: [0.32, 0.46],
  roofKinds: [['hip', 4], ['flat', 3], ['gable', 3]],
  pitch: 0.4,
  chimney: 0,
  gap: [0, 0.06],
  door: '#5a6f60',
};

/**
 * RMS Queen Mary: a long black hull with a red boot-topping, white superstructure in steps, three tall
 * red funnels with black tops (a little raked), two masts and a row of lifeboats.
 */
function queenMary(k: PortKit, x: number, z: number, L = 8.0): void {
  const p = k.solid;
  const rng = new Rng(k.seed ^ 0x9f1);
  k.at(x, 0, z, 0, 1, () => {
    const F = 0.42;
    const h = hull(p, { L, B: 1.02, F, bowRise: 0.28, sternRise: 0.07, hull: '#17181b', boot: '#a3302a', deck: '#8e7e62', rake: 0.34, fullTo: 0.66, bowPow: 1.9, stern: 0.24 });
    const white = '#f6f5f0';
    // a thin white line of rail along the hull's top edge
    for (let i = 0; i < 12; i++) {
      const u0 = -L / 2 + (L * i) / 12;
      const u1 = -L / 2 + (L * (i + 1)) / 12;
      qa(p, [u0, h.deckY(u0), h.half(u0) + 0.003], [u1, h.deckY(u1), h.half(u1) + 0.003], [u1, h.deckY(u1) + 0.03, h.half(u1) + 0.003], [u0, h.deckY(u0) + 0.03, h.half(u0) + 0.003], white, [0, 0, 1]);
    }
    // the decks: promenade, upper, boat deck, and the bridge house forward
    p.box(-0.2, F, 0, 5.6, 0.3, 0.86, white);
    p.box(-0.4, F + 0.3, 0, 4.4, 0.24, 0.76, '#f1f0ea');
    p.box(-0.6, F + 0.54, 0, 3.4, 0.2, 0.62, white);
    p.box(2.15, F + 0.3, 0, 0.9, 0.34, 0.7, white);
    p.box(2.2, F + 0.64, 0, 0.6, 0.2, 0.62, white);
    p.box(2.2, F + 0.84, 0, 0.7, 0.025, 0.9, '#dedcd4', { ao: 0 });
    k.glass.quad([1.92, F + 0.7, 0.312], [2.48, F + 0.7, 0.312], [2.48, F + 0.8, 0.312], [1.92, F + 0.8, 0.312], '#4d6f84');
    p.box(-0.2, F + 0.3, 0, 5.64, 0.02, 0.9, '#d9d8d0', { ao: 0 });
    p.box(-0.4, F + 0.54, 0, 4.44, 0.02, 0.8, '#d9d8d0', { ao: 0 });
    p.box(-0.6, F + 0.74, 0, 3.44, 0.02, 0.66, '#d9d8d0', { ao: 0 });
    // rows of portholes and windows on the decks
    for (let u = -2.9; u < 2.55; u += 0.15) (rng.chance(0.3) ? k.lit : p).quad([u, F + 0.07, 0.434], [u + 0.07, F + 0.07, 0.434], [u + 0.07, F + 0.19, 0.434], [u, F + 0.19, 0.434], '#27323d');
    for (let u = -2.5; u < 1.7; u += 0.15) (rng.chance(0.3) ? k.lit : p).quad([u, F + 0.36, 0.384], [u + 0.07, F + 0.36, 0.384], [u + 0.07, F + 0.46, 0.384], [u, F + 0.46, 0.384], '#27323d');
    for (let u = -2.2; u < 1.0; u += 0.15) p.quad([u, F + 0.59, 0.314], [u + 0.07, F + 0.59, 0.314], [u + 0.07, F + 0.69, 0.314], [u, F + 0.69, 0.314], '#27323d');
    // lifeboats on the boat deck
    for (let i = 0; i < 9; i++) {
      const u = -2.1 + i * 0.4;
      p.box(u, F + 0.74, 0.34, 0.3, 0.09, 0.11, '#f2f2ee', { ao: 0 });
      p.box(u, F + 0.8, 0.34, 0.28, 0.02, 0.1, '#e8832b', { ao: 0 });
    }
    // the three funnels: Cunard red with black tops, leaning aft
    const fy = F + 0.76;
    for (const u of [-1.55, -0.15, 1.25]) {
      p.cyl(u, fy, 0, 0.27, 0.23, 1.02, '#c9461f', { seg: 14, rz: 0.07, ao: 0.08 });
      p.cyl(u - 0.07, fy + 0.99, 0, 0.23, 0.22, 0.16, '#16171a', { seg: 14, rz: 0.07, ao: 0 });
      p.box(u + 0.12, fy + 0.25, 0.0, 0.02, 0.34, 0.25, '#b83b19', { ao: 0, rz: 0.07 });
    }
    // masts and the cargo gear
    p.cyl(2.35, h.deckY(2.35), 0, 0.03, 0.02, 1.55, '#c9c4b6', { seg: 5, ao: 0 });
    p.box(2.35, h.deckY(2.35) + 1.1, 0, 0.012, 0.012, 0.4, '#c9c4b6', { ao: 0 });
    p.cyl(-2.4, h.deckY(-2.4), 0, 0.028, 0.02, 1.2, '#c9c4b6', { seg: 5, ao: 0 });
    p.box(-2.4, h.deckY(-2.4) + 0.9, 0, 0.012, 0.012, 0.34, '#c9c4b6', { ao: 0 });
    p.box(3.2, h.deckY(3.2), 0, 0.5, 0.02, 0.4, '#6f6556', { ao: 0 });
    p.box(-3.2, h.deckY(-3.2), 0, 0.4, 0.02, 0.44, '#6f6556', { ao: 0 });
  });
  k.reserve(x, z, L / 2 + 0.1, 0.7);
}

/** An offshore oil island dressed as a resort: rock-armoured rim, pastel tower blocks hiding the derricks, palms. */
function oilIsland(k: PortKit, x: number, z: number, r: number, rng: Rng): void {
  const p = k.solid;
  p.cyl(x, -0.9, z, r * 1.12, r * 1.02, 1.28, '#8b8780', { seg: 14 });
  p.cyl(x, 0.38, z, r * 1.0, r * 1.0, 0.04, '#b0aa9c', { seg: 14, ao: 0 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng.range(-0.1, 0.1);
    p.rock(x + Math.cos(a) * r * 1.08, -0.04, z + Math.sin(a) * r * 1.08, rng.range(0.12, 0.2), pick(rng, ['#8a867c', '#797670', '#948f84']), { sy: 0.8, ry: rng.next() * 6, ao: 0.1 });
  }
  const walls: Col[] = ['#e8c4a0', '#f0e2b8', '#bfe0dc', '#e8b7b0', '#f4efe2'];
  const spots: Array<[number, number, number]> = [[-0.32, -0.12, 0.34], [0.26, -0.22, 0.42], [0.02, 0.1, 0.3]];
  spots.forEach(([dx, dz, s], i) => {
    const h = (1.0 + (i % 2) * 0.45 + rng.range(0, 0.25)) * (r / 0.8);
    tower(k, x + dx * r * 1.4, z + dz * r * 1.4, s * r * 1.3, s * r * 1.1, h, walls[(i + Math.floor(x)) % walls.length], { y: 0.42, win: '#4a7080', cols: 2, rows: Math.max(3, Math.round(h / 0.2)), roof: 'flat' });
    // a banded crown and a few potted palms on the roof
    p.box(x + dx * r * 1.4, 0.42 + h, z + dz * r * 1.4, s * r * 1.3 + 0.04, 0.05, s * r * 1.1 + 0.04, '#d9805a', { ao: 0 });
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    palm(k, x + Math.cos(a) * r * 0.78, z + Math.sin(a) * r * 0.62 + 0.06, rng.range(0.55, 0.8), rng, 0.4);
  }
  k.reserve(x, z, r * 1.2, r * 1.2);
}

const longBeach: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#c7b87c', land2: '#bbb072', hill: '#a89c66', rock: '#a08f76', sand: '#e0d3a2', haze: '#dfe5e3' };
    k.shape = { relief: 0.9, range: 3.0, rise: 7.0, rough: 0.45, freq: 0.1 };
    k.shore = 'quay';
    const c0 = centre(k, -13.6, 0.3);
    k.plateau(c0, -14.4, 14, 3.4, LAND_Y + 0.02, 0.4);
    // the back channel under the bridge, opening to the sea on the right
    channel(k, c0 + 4.3, 2.7, -30, -0.5);
    stain(k, c0 - 4, -15.5, 8, 2.5, '#9bb06c', 0.6, 0.6);
  },
  build(k) {
    const c0 = centre(k, -13.6, 0.3);
    const rng = new Rng(k.seed ^ 0x2e);
    queenMary(k, c0 - 2.3, -11.4, 8.0);
    // the white geodesic dome beside her berth
    k.solid.ball(c0 - 6.4, k.groundMin(c0 - 6.4, -14.2, 1, 1) - 0.35, -14.2, 1.7, '#f1f1ee', { sy: 0.85, ao: 0.05 });
    // the white cable-stayed bridge over the back channel
    {
      cableStayed(k, c0 - 4.6, c0 + 12.4, -16.6, [{ x: c0 + 0.6, h: 2.6 }, { x: c0 + 7.8, h: 2.6 }], { deck: 1.5, half: 0.22, color: '#f6f6f2', cable: '#e8eceb', deckColor: '#b6babc' });
    }
    // the oil islands in the roads
    {
      oilIsland(k, c0 + 3.8, -9.7, 0.85, rng);
      oilIsland(k, c0 + 6.2, -10.5, 0.7, rng);
      oilIsland(k, c0 - 7.6, -10.0, 0.62, rng);
    }
    // palms along the shore, in the streets and in the yards
    {
      for (let i = 0; i < 20; i++) {
        const x = c0 - 9.5 + i * 1.0 + rng.range(-0.2, 0.2);
        const z = -12.75 + rng.range(-0.1, 0.1);
        if (k.ground(x, z) > 0.3 && !k.isReserved(x, z, 0.1)) palm(k, x, z, rng.range(0.7, 1.0), rng);
      }
    }
    // downtown, and low stucco houses
    {
      const tw: Array<[number, number, number, number, Col, boolean]> = [
        [-2.0, -17.6, 1.9, 0.7, '#d8d4c6', false], [-0.9, -18.2, 2.5, 0.65, '#9bb4c2', true], [0.2, -17.9, 1.6, 0.7, '#e6dfcd', false],
        [-3.3, -18.6, 1.4, 0.7, '#cfc9b8', false],
      ];
      for (const [dx, zz, h, w, wall, glass] of tw) tower(k, c0 + dx, zz, w, 0.55, h, wall, { win: '#3f5a6c', cols: 3, rows: Math.round(h / 0.2), glass, roof: 'flat' });
      townOf(k, CA_HOUSES, 3, -15.3, { rowStep: 0.6, gaps: 0.16, maxSlope: 0.3, minY: 0.3 });
    }
    // dry hills with a little scrub
    for (let i = 0, n = 0; i < 100 && n < 34; i++) {
      const x = c0 + rng.range(-12, 12);
      const z = rng.range(-26, -19);
      if (k.isReserved(x, z, 0.1) || k.ground(x, z) < 0.5) continue;
      tree(k, 'bush', x, z, rng.range(1.1, 1.7), rng);
      n++;
    }
    noTrees(k);
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 1]], cap: '#d62f2b', gallery: '#d62f2b' } },
};

// ───────────────────────────── Houston ─────────────────────────────

/** A distillation column: a tall slim vessel with ring platforms, a ladder cage and a domed top. */
function column(k: PortKit, x: number, z: number, h: number, r: number, col: Col = '#cfd2d2'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r, r) - 0.04;
  p.cyl(x, y, z, r, r, h, col, { seg: 10, ao: 0.1 });
  p.cone(x, y + h, z, r, r * 0.9, tint(col, -0.1), { seg: 10 });
  for (let t = 0.2; t < 0.92; t += 0.17) p.cyl(x, y + h * t, z, r * 1.55, r * 1.55, 0.025, '#6f757a', { seg: 10, ao: 0 });
  p.box(x + r * 0.9, y, z + r * 0.35, 0.03, h * 0.94, 0.03, '#7c8286', { ao: 0 });
  p.box(x + r * 1.2, y, z + r * 0.35, 0.03, h * 0.94, 0.03, '#7c8286', { ao: 0 });
  k.reserve(x, z, r * 1.6, r * 1.6);
}

/** A flare stack with its flame. */
function flare(k: PortKit, x: number, z: number, h: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.1, 0.1) - 0.04;
  p.cyl(x, y, z, 0.06, 0.035, h, '#8e9498', { seg: 6 });
  for (const sz of [-1, 1]) p.rod([x, y + h * 0.3, z], [x + sz * 0.3, y, z + 0.2], 0.008, '#6f757a', 3);
  p.rod([x, y + h * 0.3, z], [x, y, z - 0.3], 0.008, '#6f757a', 3);
  k.glow.ball(x, y + h + 0.1, z, 0.1, '#ff9a2a', { sy: 1.9, sx: 0.8, sz: 0.8 });
  k.glow.ball(x, y + h + 0.06, z, 0.06, '#ffe08a', { sy: 1.5, sx: 0.8, sz: 0.8 });
  k.reserve(x, z, 0.4, 0.4);
}

/** A spherical storage tank (LPG) on its legs. */
function sphereTank(k: PortKit, x: number, z: number, r: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r, r) - 0.04;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.cyl(x + Math.cos(a) * r * 0.7, y, z + Math.sin(a) * r * 0.7, 0.025, 0.025, r * 0.9, '#8d9498', { seg: 4, ao: 0 });
  }
  p.ball(x, y + r * 1.7, z, r, '#f1f1ee', { ao: 0.04 });
  p.cyl(x, y + r * 1.7 - 0.01, z, r * 1.01, r * 1.01, 0.02, '#c8302a', { seg: 9, ao: 0 });
  k.reserve(x, z, r + 0.05, r + 0.05);
}

/** A steel-framed process unit: stacked bays of columns and beams with vessels and pipes inside. */
function processUnit(k: PortKit, x: number, z: number, w: number, d: number, h: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2) - 0.04;
  const col = '#8a9094';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(x + sx * w / 2 - 0.02, y, z + sz * d / 2 - 0.02, 0.04, h, 0.04, col, { ao: 0 });
  for (let t = 0.3; t < 1.01; t += 0.35) {
    p.box(x, y + h * t, z, w, 0.03, d, '#7a8084', { ao: 0 });
    p.rod([x - w / 2, y + h * (t - 0.35), z + d / 2], [x + w / 2, y + h * t, z + d / 2], 0.01, col, 3);
  }
  p.cyl(x - w * 0.22, y + h * 0.3, z, 0.14, 0.14, h * 0.62, '#d7d9d6', { seg: 8 });
  p.cyl(x + w * 0.22, y + h * 0.3, z, 0.1, 0.1, h * 0.4, '#c9402e', { seg: 8 });
  k.reserve(x, z, w / 2 + 0.1, d / 2 + 0.1);
}

/** The San Jacinto Monument: a tall tapering octagonal shaft of pale limestone on a stepped base, topped by the Lone Star. */
function sanJacinto(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1, 0.7) - 0.05;
  const stone = '#e9e3cf';
  p.box(x, y - 0.1, z, 2.4, 0.1 + 0.2, 1.5, '#d9d3c0');
  p.box(x, y + 0.2, z, 1.9, 0.22, 1.1, stone);
  p.box(x, y + 0.42, z, 1.3, 0.16, 0.78, '#e2dcc8');
  const y0 = y + 0.58;
  p.cyl(x, y0, z, 0.52, 0.31, H, stone, { seg: 8, ry: Math.PI / 8 });
  for (let i = 0; i < 6; i++) fq(p, x - 0.025, x + 0.025, y0 + 0.5 + i * (H / 7.5), y0 + 0.62 + i * (H / 7.5), z + lerp(0.5, 0.3, (0.5 + i * (H / 7.5)) / H) * 0.93, '#6f6a5c');
  p.box(x, y0 + H, z, 0.8, 0.06, 0.8, '#d4cebb', { ao: 0 });
  p.box(x, y0 + H + 0.06, z, 0.46, 0.2, 0.46, stone);
  // the star: five points, upright, facing the viewer
  p.extrude(starPts(0.36, 0.16), 0.08, x, y0 + H + 0.54, z, '#efe9d6', { ao: 0 });
  // the reflecting pool
  p.box(x, y - 0.0, z + 1.35, 1.2, 0.01, 1.1, '#6aa1bd', { ao: 0 });
  k.reserve(x, z, 1.3, 1.1);
}

const houston: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#a3a768', land2: '#98a463', hill: '#8c9c5e', rock: '#a69f8a', sand: '#cfc6a0', haze: '#e0e6e2' };
    k.shape = { relief: 0.18, range: 0.5, rise: 14, rough: 0.2, freq: 0.07 };
    k.shore = 'quay';
    const c0 = centre(k, -13.8, 0.3);
    k.plateau(c0, -14.8, 14, 4.2, LAND_Y + 0.02, 0.4);
    stain(k, c0 + 4.2, -18.5, 5, 3, '#8dab62', 0.7, 0.9);
  },
  build(k) {
    const c0 = centre(k, -13.8, 0.3);
    const rng = new Rng(k.seed ^ 0x4f);
    // the refineries
    {
      const cols: Array<[number, number, number, number]> = [
        [-8.4, -15.3, 3.3, 0.2], [-7.7, -15.0, 2.5, 0.16], [-6.9, -15.5, 3.9, 0.23], [-5.9, -15.1, 2.8, 0.18], [-5.0, -15.6, 3.5, 0.2], [-4.1, -15.2, 2.2, 0.16],
      ];
      for (const [dx, zz, h, r] of cols) column(k, c0 + dx, zz, h, r, rng.chance(0.4) ? '#d9d6cf' : '#c9cdce');
      processUnit(k, c0 + 1.5 - 7.3, -13.5, 1.5, 0.8, 1.7);
      processUnit(k, c0 + 1.5 - 5.3, -13.6, 1.3, 0.8, 1.4);
      flare(k, c0 + 1.5 - 9.0, -16.4, 4.6);
      flare(k, c0 + 1.5 - 3.0, -16.7, 3.8);
      for (let i = 0; i < 5; i++) sphereTank(k, c0 + 1.5 - 3.0 + i * 0.72, -13.5 - (i % 2) * 0.1, 0.3);
      for (let i = 0; i < 6; i++) tank(k, c0 + 1.5 - 8.5 + (i % 3) * 1.1, -17.4 - Math.floor(i / 3) * 1.0, 0.45, 0.62, '#eeece6', { band: i % 2 ? '#c8302a' : undefined });
      // pipe racks across the foreground
      k.solid.box(c0 + 1.5 - 6.3, LAND_Y + 0.15, -12.9, 6.0, 0.04, 0.2, '#6f757a', { ao: 0 });
      for (let i = 0; i < 9; i++) k.solid.box(c0 + 1.5 - 9.2 + i * 0.7, LAND_Y, -12.9, 0.04, 0.17, 0.04, '#6f757a', { ao: 0 });
      k.solid.rod([c0 + 1.5 - 9.3, LAND_Y + 0.22, -12.95], [c0 + 1.5 - 3.3, LAND_Y + 0.22, -12.95], 0.025, '#c8302a', 5);
      k.solid.rod([c0 + 1.5 - 9.3, LAND_Y + 0.2, -12.85], [c0 + 1.5 - 3.3, LAND_Y + 0.2, -12.85], 0.02, '#e0b02a', 5);
      plume(k, c0 + 1.5 - 8.4, 0.5 + 3.3, -15.3, 1.2, 4, '#eef0f1', 0.7);
    }
    // the tanker at the refinery dock
    freighter(k, c0 - 2.0, -10.9, { L: 6.0, dir: 1, hull: '#23272d', boot: '#a3302a', house: '#f1efe8', funnel: '#2c5da8', band: '#16181b', cargo: 'tank' });
    // the San Jacinto Monument among live oaks
    sanJacinto(k, c0 + 4.3, -15.8, 5.2);
    for (let i = 0, n = 0; i < 80 && n < 24; i++) {
      const x = c0 + rng.range(1.5, 10.5);
      const z = rng.range(-20, -13.4);
      if (k.isReserved(x, z, 0.3) || k.ground(x, z) < 0.3) continue;
      tree(k, rng.chance(0.7) ? 'round' : 'pine', x, z, rng.range(1.2, 1.9), rng);
      n++;
    }
    // the skyline, far across the plain: pale with distance, standing on a band of low-rise
    {
      const haze = c3('#dfe6e4');
      const low = c3('#c9c6b8').lerp(haze, 0.4);
      for (let i = 0; i < 9; i++) {
        const w = rng.range(0.9, 1.6);
        k.solid.box(c0 - 4.5 + i * 1.7, k.ground(c0 - 4.5 + i * 1.7, -29), -29.2, w, 0.3 + (i % 3) * 0.1, 0.6, tint(low, (i % 2) * 0.05), { ao: 0.05 });
      }
      const tw: Array<[number, number, number, string]> = [
        [-1.6, 2.4, 0.6, '#c9cfd2'], [-0.4, 3.9, 0.7, '#8aa0b0'], [0.8, 3.0, 0.6, '#d6d8d6'], [2.0, 4.4, 0.7, '#7f97a6'], [3.3, 2.8, 0.6, '#c4ccd0'],
        [4.6, 3.5, 0.7, '#98aebb'], [5.9, 2.4, 0.6, '#d3d3cc'], [7.1, 3.0, 0.65, '#a9b9c2'],
      ];
      for (const [dx, h, w, c] of tw) {
        const wall = c3(c).lerp(haze, 0.42);
        tower(k, c0 + dx, -30.2 - (dx % 3) * 0.3, w, 0.55, h, wall, { win: '#8aa2b2', cols: 2, rows: Math.round(h / 0.28), roof: 'flat' });
      }
    }
    noTrees(k);
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#d62f2b', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

export const LANDMARKS: Record<string, Landmark> = { yokohama, hakodate, tomakomai, kushiro, dutchHarbor, kodiak, anchorage, princeRupert, vancouver, seattle, tacoma, portland, longBeach, houston };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Yokohama', 'japan', 'yokohama'],
  ['Hakodate', 'japan', 'hakodate'],
  ['Tomakomai', 'japan', 'tomakomai'],
  ['Kushiro', 'japan', 'kushiro'],
  ['Dutch Harbor', 'pacnw', 'dutchHarbor'],
  ['Kodiak', 'pacnw', 'kodiak'],
  ['Anchorage', 'pacnw', 'anchorage'],
  ['Prince Rupert', 'pacnw', 'princeRupert'],
  ['Vancouver', 'pacnw', 'vancouver'],
  ['Seattle', 'pacnw', 'seattle'],
  ['Tacoma', 'pacnw', 'tacoma'],
  ['Portland', 'pacnw', 'portland'],
  ['Long Beach', 'na', 'longBeach'],
  ['Houston', 'na', 'houston'],
];

