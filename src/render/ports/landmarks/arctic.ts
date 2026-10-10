import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, clamp, lerp, noise2, smooth, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import { REGIONS, type RegionId } from '../regions';
import { buildTown, house, pick, scatter, tint, type HouseStyle } from '../town';
import { tower } from '../structures';
import { lighthouse } from '../harbour';

/**
 * Arctic, North Atlantic and Canada: Reykjavik, Tromso, Nuuk, Halifax, St John's, Torshavn, Hammerfest,
 * Narvik, Bodo, Sept-Iles and New York.
 */

// ───────────────────────────── shared helpers ─────────────────────────────

const ARCTIC = REGIONS.arctic.houses;
const NA = REGIONS.na.houses;
const style = (base: HouseStyle, o: Partial<HouseStyle>): HouseStyle => ({ ...base, ...o });

/** Rows of houses along the far shore with a landmark's own house style (instead of the region's). */
function townOf(k: PortKit, hs: HouseStyle, o: { rows?: number; rowStep?: number; gaps?: number; rowRise?: number; shift?: number; z?: number; minY?: number; maxSlope?: number } = {}): void {
  buildTown(k, {
    x0: -k.width / 2 - 2,
    x1: k.width / 2 + 2,
    z: o.z ?? SHORE_Z - 1.3,
    rows: o.rows ?? 4,
    rowStep: o.rowStep ?? 0.62,
    hs,
    gaps: o.gaps ?? 0.1,
    rowRise: o.rowRise,
    cx: k.vx(SHORE_Z - 2) + (o.shift ?? 0),
    minY: o.minY,
    maxSlope: o.maxSlope,
  });
}

/** Keep the region's tree scatter off the whole backdrop (treeless coasts). */
function noTrees(k: PortKit): void {
  k.reserve(0, -22, k.width + 20, 11);
}

/** Carve a channel of water running back from the sea. */
function channel(k: PortKit, cx: number, half: number, zBack = -34, depth = -0.4): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1 || z < zBack) return h;
    const bank = smooth(half + 0.9, half, Math.abs(x - cx));
    const end = smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, depth), bank * end);
  });
}

/** A flat-topped (or rounded) massif with a superelliptical footprint. */
function mesa(k: PortKit, cx: number, cz: number, rx: number, rz: number, h: number, top = 0.55, p = 3): void {
  k.feature((x, z, hh) => {
    const dx = Math.abs((x - cx) / rx);
    const dz = Math.abs((z - cz) / rz);
    const d = Math.pow(Math.pow(dx, p) + Math.pow(dz, p), 1 / p);
    if (d >= 1) return hh;
    return hh + h * smooth(1, top, d) * (0.9 + 0.2 * noise2(x * 0.9, z * 0.9, 7));
  });
}

/** Windows on the +z face and the +x face; a share of them light up at night. */
function winZ(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, lit = 0.35): void {
  const p = rng.chance(lit) ? k.lit : k.solid;
  p.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], c);
}
function winX(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, lit = 0.35): void {
  const p = rng.chance(lit) ? k.lit : k.solid;
  p.quad([x, y, z + w / 2], [x, y, z - w / 2], [x, y + h, z - w / 2], [x, y + h, z + w / 2], c);
}

interface CragOpts {
  x: number;
  z: number;
  rx: number;
  rz: number;
  h: number;
  /** y of the foot ring (sunk below the ground) */
  y?: number;
  rock: Col;
  rock2?: Col;
  snow?: Col;
  /** share of the height where the snow cap begins (1 = none) */
  snowAt?: number;
  /** apex shifted by (ax, az) fractions of the radii */
  lean?: [number, number];
  n?: number;
  rough?: number;
  seed?: number;
  /** chance of a snow-filled gully on a rock facet */
  gully?: number;
}

/** A faceted peak built from rings of points: crisp silhouette for the one mountain a port is known for. */
function crag(k: PortKit, o: CragOpts): void {
  const rng = new Rng(k.seed ^ (o.seed ?? 0x77aa));
  const n = o.n ?? 9;
  const y0 = o.y ?? -0.2;
  const rough = o.rough ?? 0.16;
  const lean = o.lean ?? [0, 0];
  const levels: Array<[number, number]> = [
    [1.0, 0],
    [0.72, 0.28],
    [0.48, 0.56],
    [0.25, 0.8],
  ];
  const pts: V3[][] = [];
  const a0 = rng.next() * 6.28;
  for (let l = 0; l < levels.length; l++) {
    const row: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + (l ? rng.range(-0.25, 0.25) : 0)) / n) * Math.PI * 2;
      const rr = levels[l][0] * (1 + rng.range(-rough, rough));
      const f = levels[l][1] * (1 + (l ? rng.range(-0.08, 0.08) : 0));
      const t = levels[l][1];
      row.push([o.x + Math.cos(a) * o.rx * rr + lean[0] * o.rx * t, y0 + f * o.h, o.z + Math.sin(a) * o.rz * rr + lean[1] * o.rz * t]);
    }
    pts.push(row);
  }
  const apex: V3 = [o.x + lean[0] * o.rx, y0 + o.h, o.z + lean[1] * o.rz];
  const ref: V3 = [o.x, y0 + o.h * 0.25, o.z];
  const snowAt = o.snowAt ?? 0.55;
  const rock2 = o.rock2 ?? o.rock;
  const snows = [o.snow ?? '#f1f5f8', '#e2eaf0', '#f6f9fb'];
  const rocks = [o.rock, rock2];
  for (let l = 0; l < levels.length; l++) {
    const top = l === levels.length - 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mid = (levels[l][1] + (top ? 1 : levels[l + 1][1])) / 2;
      let snow = mid >= snowAt;
      if (!snow && mid > snowAt - 0.2 && rng.chance(0.5)) snow = true;
      if (!snow && rng.chance(o.gully ?? 0.12) && l > 0) snow = true;
      const col: Col = snow ? snows[(i + l) % 3] : tint(rocks[(i + l) % 2], rng.range(-0.07, 0.07));
      if (top) k.solid.solid([pts[l][i], pts[l][j], apex, ref], [[0, 1, 2]], col, { ao: 0 });
      else k.solid.solid([pts[l][i], pts[l][j], pts[l + 1][j], pts[l + 1][i], ref], [[0, 1, 2, 3]], col, { ao: 0 });
    }
  }
}

/** A floating berg: jagged white-blue blocks half under the water. */
function berg(k: PortKit, x: number, z: number, s: number, rng: Rng): void {
  const p = k.solid;
  const n = 7;
  const top: V3[] = [];
  const bot: V3[] = [];
  const a0 = rng.next() * 6;
  const peak = rng.range(0.7, 1.0);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const r = s * rng.range(0.7, 1.15);
    top.push([x + Math.cos(a) * r, 0.02 + s * rng.range(0.12, 0.3), z + Math.sin(a) * r * 0.7]);
    bot.push([x + Math.cos(a) * r * 0.85, -0.5 * s, z + Math.sin(a) * r * 0.6]);
  }
  const apex: V3 = [x + rng.range(-0.2, 0.2) * s, s * peak, z + rng.range(-0.1, 0.1) * s];
  const cols = ['#f4fafc', '#e3f0f6', '#d3e8f1', '#eef7fa'];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.solid([top[i], top[j], apex, [x, -0.3 * s, z]], [[0, 1, 2]], cols[i % 4], { ao: 0.04 });
    p.solid([bot[i], bot[j], top[j], top[i], [x, 0, z]], [[0, 1, 2, 3]], i % 2 ? '#b9dbe8' : '#cde6ef', { ao: 0 });
  }
}

/** Hexagon tile (pointy top) in the XY plane facing +z. */
const HEX = new THREE.CircleGeometry(1, 6, Math.PI / 6);

// ───────────────────────────── Reykjavik ─────────────────────────────

/** Hallgrimskirkja: a white concrete tower whose facade steps down in basalt-column pillars. */
function hallgrimskirkja(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  const W = '#efede6';
  const W2 = '#dcdad2';
  const G = '#4b5a68';
  k.at(x, y, z, 0, 1, () => {
    // the nave behind the facade, with a ridge roof
    p.box(0, -0.5, -1.35, 1.5, 2.0, 2.3, W);
    p.prism(0, 1.5, -1.35, 1.56, 0.5, 2.34, W2);
    for (let i = 0; i < 5; i++) winX(k, rng, 0.752, 0.3, -0.5 - i * 0.42, 0.14, 0.62, G, 0.2);
    // the wide low block under the facade, and steps
    p.box(0, -0.5, 0, 3.5, 1.1, 0.5, W);
    p.box(0, -0.5, 0.5, 3.9, 0.22, 0.5, '#cfcdc5');
    // the pillars: basalt columns stepping down away from the tower, each with a slanted top
    const hs = [2.75, 2.3, 1.85, 1.4];
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const cx = s * (0.5 + i * 0.27);
        const w = 0.25;
        const h = hs[i];
        const z0 = -0.28;
        const z1 = 0.3;
        const yi = h;
        const yo = h - 0.24;
        const xi = cx - s * (w / 2);
        const xo = cx + s * (w / 2);
        p.solid(
          [
            [xi, -0.5, z0], [xo, -0.5, z0], [xo, -0.5, z1], [xi, -0.5, z1],
            [xi, yi, z0], [xo, yo, z0], [xo, yo, z1], [xi, yi, z1],
          ],
          [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
          i % 2 ? W : W2,
        );
        winZ(k, rng, cx, 0.7, z1 + 0.004, 0.05, Math.max(0.3, h - 1.3), G, 0.15);
      }
    }
    // the central tower: a tall tapering shaft with a pointed top
    p.cyl(0, -0.5, -0.1, 0.62, 0.46, 3.9, W, { seg: 4, ry: Math.PI / 4 });
    p.pyramid(0, 3.4, -0.1, 0.68, 1.0, 0.68, W2);
    p.rod([0, 4.4, -0.1], [0, 4.72, -0.1], 0.016, '#d9d7cf', 4);
    p.rod([-0.07, 4.6, -0.1], [0.07, 4.6, -0.1], 0.016, '#d9d7cf', 4);
    // a tall window down the tower, a door, the belfry slits
    p.box(0, 0.65, 0.28, 0.16, 1.9, 0.02, '#42505d', { ao: 0 });
    p.box(0, -0.4, 0.28, 0.3, 0.8, 0.03, '#3a4048', { ao: 0 });
    for (const dx of [-0.17, 0, 0.17]) p.box(dx, 2.9, 0.24, 0.07, 0.4, 0.02, G, { ao: 0 });
    p.box(0.4, 2.9, -0.1, 0.02, 0.4, 0.16, G, { ao: 0 });
  });
  k.reserve(x, z, 2.1, 1.0);
}

/** Harpa: a glass concert hall whose facade is a honeycomb of coloured hexagons. */
function harpa(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  const frame = '#5a7d8f';
  const cols = ['#4cc0d6', '#62d0d8', '#8fe0dc', '#3fa4c8', '#b0ece6', '#6cc6b0', '#3a92bc', '#d6f2f0', '#c4e07a'];
  const W = 3.1;
  const D = 1.25;
  const blocks: Array<{ x0: number; x1: number; z1: number; h: number; hz: number }> = [
    { x0: -W / 2, x1: 0.95, z1: D / 2, h: 1.45, hz: D },
    { x0: -1.55, x1: -0.15, z1: 0.1, h: 2.3, hz: 0.75 },
    { x0: 0.95, x1: W / 2, z1: D / 2 - 0.1, h: 1.9, hz: 0.9 },
  ];
  const r = 0.115;
  const cw = r * 1.732;
  const rh = r * 1.5;
  k.at(x, y, z, 0, 1, () => {
    for (const b of blocks) {
      const zc = b.z1 - b.hz / 2;
      // the dark frame, and a crystalline slanted roof
      p.solid(
        [
          [b.x0, -0.45, zc - b.hz / 2], [b.x1, -0.45, zc - b.hz / 2], [b.x1, -0.45, zc + b.hz / 2], [b.x0, -0.45, zc + b.hz / 2],
          [b.x0, b.h, zc - b.hz / 2], [b.x1, b.h + 0.22, zc - b.hz / 2], [b.x1, b.h + 0.12, zc + b.hz / 2], [b.x0, b.h - 0.04, zc + b.hz / 2],
        ],
        [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
        frame,
      );
      // hexagon tiles: front (+z) and right (+x) faces
      const rows = Math.floor((b.h - 0.02) / rh);
      for (let row = 0; row < rows; row++) {
        const off = (row % 2) * cw * 0.5;
        for (let u = b.x0 + cw * 0.5 + off; u < b.x1 - cw * 0.4; u += cw) p.add(HEX, rng.chance(0.07) ? '#e6d070' : pick(rng, cols), [u, -0.04 + row * rh + r, b.z1 + 0.006], r * 1.0, { ao: 0.04 });
      }
      const rowsS = Math.floor((b.h - 0.02) / rh);
      for (let row = 0; row < rowsS; row++) {
        const off = (row % 2) * cw * 0.5;
        for (let u = zc - b.hz / 2 + cw * 0.5 + off; u < zc + b.hz / 2 - cw * 0.4; u += cw) p.add(HEX, pick(rng, cols), [b.x1 + 0.006, -0.04 + row * rh + r, u], r * 1.0, { ry: Math.PI / 2, ao: 0.04 });
      }
    }
    // an entrance canopy
    p.box(0.1, 0.34, D / 2 + 0.15, 1.1, 0.04, 0.34, '#e9eef0', { rx: -0.15 });
  });
  k.reserve(x, z, W / 2 + 0.1, D / 2 + 0.1);
}

const REYKJAVIK_HOUSES = style(ARCTIC, {
  walls: ['#f1eee4', '#f1eee4', '#d8d2c0', '#c9402e', '#3d7ab5', '#e8c35a', '#4a9a7a', '#f1eee4'],
  roofs: ['#c9402e', '#2f5f8a', '#c9402e', '#3a7a5a', '#d9b43a', '#7a828a', '#a3392e'],
  floors: [1, 3],
  pitch: 0.7,
  gap: [0.01, 0.1],
});

const reykjavik: Landmark = {
  terrain(k) {
    k.shape = { relief: 0.9, range: 3.2, rise: 3, rough: 0.5, freq: 0.1 };
    k.palette.land = '#8e9c6e';
    k.palette.land2 = '#87966a';
    k.palette.hill = '#7b8767';
    k.palette.rock = '#68707a';
    k.palette.snowLine = 3.7;
    const ex = k.vx(-24, 1.0);
    mesa(k, ex, -24.5, 16, 3.4, 3.6, 0.5);
    k.paint((x, y, z, slope, c) => {
      if (Math.abs(x - ex) < 18 && z < -19.5 && z > -29.5 && y > 1.3) {
        const n = noise2(x * 1.3, z * 0.5, 9);
        if (slope > 0.16) c.set(n > 0.64 ? '#e9eff3' : n > 0.36 ? '#7a8793' : '#8d9298');
        else c.set(n > 0.55 ? '#eef3f6' : '#9ea7ad');
      }
    });
    // the hill the church stands on
    k.bump(k.vx(-15.5, 0.2), -16, 5.8, 4.0, 1.25);
    k.plateau(k.vx(-14.7, 0.2), -14.7, 2.1, 1.1, 1.45);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14.7, 0.2);
    hallgrimskirkja(k, rng, cx, -14.7, k.groundMax(cx, -14.7, 1.6, 0.8) - 0.0);
    const hx = k.vx(-13.1, -4.2);
    k.plateau(hx, -13.1, 1.7, 0.9, LAND_Y + 0.12);
    harpa(k, rng, hx, -13.1, LAND_Y + 0.12);
    townOf(k, REYKJAVIK_HOUSES, { rows: 5, rowStep: 0.56, gaps: 0.05, maxSlope: 0.8, rowRise: 0.05 });
    noTrees(k);
  },
  quiet: true,
  rows: 0,
  flag: { dx: 3.4, z: -13.0 },
};



// ───────────────────────────── shared buildings ─────────────────────────────

/** A small timber church: nave with a gabled roof, a square front tower and a spire. Faces +z. */
function woodenChurch(k: PortKit, rng: Rng, x: number, z: number, y: number, s: number, o: { wall?: Col; roof?: Col; spire?: Col; ry?: number; tall?: number } = {}): void {
  const p = k.solid;
  const wall = o.wall ?? '#f6f3ea';
  const roof = o.roof ?? '#b8352a';
  const spire = o.spire ?? roof;
  const tall = o.tall ?? 1;
  k.at(x, y, z, o.ry ?? 0, s, () => {
    p.box(0, -0.3, -0.5, 0.7, 0.3 + 0.55, 1.3, wall);
    p.prism(0, 0.55, -0.5, 0.78, 0.38, 1.34, roof);
    p.box(0, -0.3, 0.3, 0.4, 0.3 + 0.95 * tall, 0.4, wall);
    p.box(0, 0.65 * tall + 0.3, 0.3, 0.44, 0.04, 0.44, tint(roof, -0.1));
    p.pyramid(0, 0.69 * tall + 0.3, 0.3, 0.42, 0.7 * tall, 0.42, spire);
    p.rod([0, 1.38 * tall + 0.3, 0.3], [0, 1.52 * tall + 0.3, 0.3], 0.012, '#d9b43a', 4);
    p.box(0, 0.0, 0.505, 0.12, 0.26, 0.02, '#4a3a30', { ao: 0 });
    winZ(k, rng, 0, 0.62 * tall, 0.505, 0.1, 0.2, '#35465a', 0.4);
    for (let i = 0; i < 3; i++) winX(k, rng, 0.355, 0.12, -0.15 - i * 0.38, 0.12, 0.26, '#35465a', 0.4);
  });
  k.reserve(x, z, 0.6 * s, 0.9 * s);
}

// ───────────────────────────── Tromso ─────────────────────────────

/** The Arctic Cathedral: a long A-frame of stacked white triangular panels with a great glass gable. */
function arcticCathedral(k: PortKit, x: number, z: number, y: number, ry: number): void {
  const p = k.solid;
  k.at(x, y, z, ry, 1.45, () => {
    const L = 2.8;
    const n = 9;
    const sl = L / n;
    const hw = 0.72;
    const H = 1.85;
    p.box(0, -0.5, 0, hw * 2 + 0.3, 0.65, L + 0.3, '#bdbab2');
    for (let i = 1; i < n; i++) {
      const zc = L / 2 - (i + 0.5) * sl;
      const odd = i % 2 === 1;
      const hh = H * (odd ? 1 : 0.935) * (1 - 0.1 * (i / n));
      const w = hw * (odd ? 1 : 0.95);
      p.extrude([[-w, 0], [w, 0], [0, hh]], sl * 0.99, 0, 0.15, zc, odd ? '#f8f8f5' : '#e3e6e8', { ao: 0.05 });
    }
    // front gable: a white frame and the big glass triangle with its mullions
    p.extrude([[-hw, 0], [hw, 0], [0, H]], sl * 0.9, 0, 0.15, L / 2 - sl * 0.45, '#f8f8f5', { ao: 0.05 });
    const zf = L / 2 + 0.006;
    k.glass.tri([-hw + 0.1, 0.17, zf], [hw - 0.1, 0.17, zf], [0, H - 0.05, zf], '#a9cfe2');
    p.box(0, 0.17, zf + 0.006, 0.05, H - 0.2, 0.02, '#f8f8f5', { ao: 0 });
    p.box(0, 0.17 + H * 0.38, zf + 0.006, hw * 1.15, 0.05, 0.02, '#f8f8f5', { ao: 0 });
    p.box(0, 0.17, zf + 0.008, 0.34, 0.5, 0.02, '#38454f', { ao: 0 });
    // the free-standing bell tower beside it
    p.box(1.25, -0.5, 1.2, 0.34, 0.5 + 1.55, 0.34, '#f4f4f0');
    p.box(1.25, 1.05, 1.2, 0.4, 0.06, 0.4, '#d9dcdc');
    p.box(1.25, 1.11, 1.2, 0.26, 0.5, 0.26, '#f4f4f0');
    p.rod([1.25, 1.6, 1.2], [1.25, 1.95, 1.2], 0.014, '#f4f4f0', 4);
    p.rod([1.17, 1.84, 1.2], [1.33, 1.84, 1.2], 0.014, '#f4f4f0', 4);
    p.box(1.25, 0.35, 1.375, 0.07, 0.6, 0.02, '#38454f', { ao: 0 });
  });
  k.reserve(x, z, 2.0, 2.0);
}

/** The Tromso Bridge: a long concrete girder that humps high over the sound and runs down on slim piers. */
function tromsoBridge(k: PortKit, x0: number, x1: number, z: number, xh: number): void {
  const p = k.solid;
  const hz = 0.21;
  const hump = (x: number): number => {
    const u = (x - xh) / (x < xh ? 2.4 : 4.7);
    return u <= -1 || u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u);
  };
  const e0 = Math.max(k.ground(x0, z), LAND_Y) + 0.2;
  const e1 = Math.max(k.ground(x1, z), LAND_Y) + 0.2;
  const deck = (x: number): number => lerp(e0, e1, (x - x0) / (x1 - x0)) + 1.95 * hump(x);
  const thick = (x: number): number => 0.13 + 0.24 * hump(x);
  const n = Math.ceil((x1 - x0) / 0.4);
  for (let i = 0; i < n; i++) {
    const xa = lerp(x0, x1, i / n);
    const xb = lerp(x0, x1, (i + 1) / n);
    const ta = deck(xa);
    const tb = deck(xb);
    const ba = ta - thick(xa);
    const bb = tb - thick(xb);
    p.solid(
      [[xa, ba, z - hz], [xb, bb, z - hz], [xb, tb, z - hz], [xa, ta, z - hz], [xa, ba, z + hz], [xb, bb, z + hz], [xb, tb, z + hz], [xa, ta, z + hz]],
      [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
      '#cdcbc4',
      { ao: 0 },
    );
    p.solid(
      [[xa, ta, z + hz - 0.02], [xb, tb, z + hz - 0.02], [xb, tb + 0.07, z + hz - 0.02], [xa, ta + 0.07, z + hz - 0.02], [xa, ta, z + hz + 0.01], [xb, tb, z + hz + 0.01], [xb, tb + 0.07, z + hz + 0.01], [xa, ta + 0.07, z + hz + 0.01]],
      [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
      '#eeece6',
      { ao: 0 },
    );
  }
  // slim piers down to the sea floor, and splayed legs under the hump
  for (let x = x0 + 1.0; x < x1 - 0.5; x += 1.15) p.box(x, -0.9, z, 0.14, deck(x) - thick(x) + 0.9, 0.2, '#bdbbb4');
  p.rod([xh - 0.7, -0.5, z], [xh - 0.1, deck(xh) - thick(xh), z], 0.07, '#bdbbb4', 5);
  p.rod([xh + 0.7, -0.5, z], [xh + 0.1, deck(xh) - thick(xh), z], 0.07, '#bdbbb4', 5);
  k.reserve((x0 + x1) / 2, z, (x1 - x0) / 2, 0.4);
}

const TROMSO_HOUSES = style(ARCTIC, {
  walls: ['#b33a2e', '#d99a3c', '#f1ece0', '#b33a2e', '#c9803a', '#e8d6a0', '#7f9bb0', '#f1ece0', '#8f2f27'],
  roofs: ['#3b3f46', '#4a4038', '#5a3f38', '#3b3f46', '#6c747a'],
  floors: [1, 3],
});

const tromso: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.4, range: 6, rise: 3, rough: 0.8, freq: 0.1 };
    k.palette.snowLine = 3.8;
    k.palette.rock = '#5f6670';
    k.palette.hill = '#6f8070';
    const ch = k.vx(-15, -2.4);
    channel(k, ch, 2.2);
    // the knoll the cathedral stands on, and snowy ridges behind the town
    k.bump(ch + 5.4, -17, 4.6, 3.4, 0.7);
    k.plateau(ch + 5.4, -17, 2.6, 1.8, 1.0, 0.6);
    k.bump(ch - 4.5, -22, 7, 3.5, 2.2);
    k.paint((x, y, z, slope, c) => {
      const px = (x - (ch + 5.4)) / 4.4;
      const pz = (z + 17) / 3.2;
      if (px * px + pz * pz < 1 && y > 0.5 && slope < 0.4) c.lerp(new THREE.Color('#86a070'), 0.85);
    });
  },
  build(k) {
    const ch = k.vx(-15, -2.4);
    const zb = -14.9;
    tromsoBridge(k, ch - 4.7, ch + 8.6, zb, ch - 0.7);
    const cx = ch + 5.4;
    arcticCathedral(k, cx, -17.0, k.groundMax(cx, -17, 1.6, 1.2), -0.5);
    // Tromsdalstind and its neighbour: the snowy peaks behind the cathedral
    crag(k, { x: ch + 9.0, z: -23.5, rx: 4.0, rz: 3.4, h: 8.0, y: 0.8, rock: '#606872', rock2: '#707882', snowAt: 0.6, lean: [-0.2, 0], seed: 1, rough: 0.1, gully: 0.22 });
    crag(k, { x: ch + 3.0, z: -25, rx: 3.6, rz: 3.2, h: 7.0, y: 0.8, rock: '#606872', rock2: '#707882', snowAt: 0.6, seed: 2, rough: 0.1, gully: 0.22 });
    townOf(k, TROMSO_HOUSES, { rows: 4, rowStep: 0.6, maxSlope: 0.4 });
  },
  quiet: true,
  rows: 0,
};


// ───────────────────────────── Nuuk ─────────────────────────────

const NUUK_HOUSES = style(ARCTIC, {
  walls: ['#d6392e', '#f2c230', '#2a6fbd', '#2f9a5a', '#f08a3a', '#f1eee4', '#8a4ab0', '#35a6c4', '#d6392e', '#f2c230'],
  roofs: ['#3b3f46', '#6a3b36', '#2f4f6a', '#4a4f58'],
  floors: [1, 2],
  pitch: 0.55,
  gap: [0.05, 0.35],
  roofKinds: [['gable', 4], ['mono', 2], ['flat', 1]],
});

/** x moved sideways until it is clear of the breakwater head. */
function clearOfHead(k: PortKit, x: number, gap: number): number {
  const d = x - k.mole.endX;
  if (Math.abs(d) >= gap) return x;
  return k.mole.endX + (d < 0 ? -gap : gap);
}

const nuuk: Landmark = {
  terrain(k) {
    k.shape = { relief: 2.0, range: 5.5, rise: 3, rough: 0.9, freq: 0.12 };
    k.palette.land = '#8a8574';
    k.palette.land2 = '#7d8a6c';
    k.palette.hill = '#7a7468';
    k.palette.rock = '#6a6c70';
    k.palette.sand = '#aaa89c';
    k.palette.snowLine = 7.5;
    k.bump(k.vx(-14.8, 0.4), -15.4, 8, 3.8, 1.5, 1.0);
    k.bump(k.vx(-14.1, 1.8), -14.2, 1.7, 1.2, 0.5);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    // Sermitsiaq, the triangular peak that stands over the town
    crag(k, { x: k.vx(-17.4, -1.6), z: -17.4, rx: 5.8, rz: 3.8, h: 7.6, y: 0.2, rock: '#7a7672', rock2: '#66636a', snowAt: 0.78, lean: [-0.3, 0], n: 9, gully: 0.35, seed: 3, rough: 0.08 });
    // the Hans Egede church: white with a red roof, on its knoll
    const cx = k.vx(-14.1, 1.8);
    woodenChurch(k, rng, cx, -14.2, k.groundMax(cx, -14.2, 0.6, 0.6) - 0.02, 1.7, { wall: '#f6f3ea', roof: '#c33a2e', spire: '#c33a2e', tall: 0.85 });
    // icebergs drifting off the shore
    const b = k.vx(-10.6);
    const spots: Array<[number, number, number]> = [[b - 3.4, -10.9, 1.0], [b + 0.2, -11.2, 1.3], [b + 3.4, -10.6, 0.8], [b + 6.2, -11.1, 1.1]];
    for (const [x, z, s] of spots) berg(k, clearOfHead(k, x, 2.2), z, s, rng);
    townOf(k, NUUK_HOUSES, { rows: 4, rowStep: 0.6, gaps: 0.3, maxSlope: 0.8, minY: 0.3 });
    noTrees(k);
  },
  quiet: true,
  rows: 0,
};

// ───────────────────────────── Halifax ─────────────────────────────

const star = (R: number, r: number, n: number, rot = 0): Array<[number, number]> => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
};

/** Citadel Hill's star fort: grassy ramparts, a stone wall and the cream barracks inside. */
function starFort(k: PortKit, rng: Rng, x: number, z: number, y: number, R: number): void {
  const p = k.solid;
  const r = R * 0.62;
  const flat = -Math.PI / 2;
  p.extrude(star(R * 1.14, r * 1.12, 5, Math.PI / 2), 0.2, x, y + 0.02, z, '#6a9a4a', { rx: flat, ao: 0.05 });
  p.extrude(star(R, r, 5, Math.PI / 2), 0.46, x, y + 0.23, z, '#b6a98f', { rx: flat, holes: [star(R * 0.9, r * 0.88, 5, Math.PI / 2)], ao: 0.05 });
  p.extrude(star(R * 0.92, r * 0.9, 5, Math.PI / 2), 0.1, x, y + 0.1, z, '#7fae58', { rx: flat, ao: 0 });
  // the barracks: a long cream building with a dark roof and a little tower
  p.box(x, y + 0.1, z - 0.05, 1.5, 0.55, 0.75, '#ece4cf');
  p.prism(x, y + 0.65, z - 0.05, 1.56, 0.32, 0.8, '#4b4f58', { ry: Math.PI / 2 * 0 });
  for (let i = 0; i < 6; i++) winZ(k, rng, x - 0.62 + i * 0.25, y + 0.28, z + 0.333, 0.1, 0.2, '#3a4856', 0.3);
  p.box(x + 0.4, y + 0.65, z - 0.05, 0.3, 0.7, 0.3, '#ece4cf');
  p.pyramid(x + 0.4, y + 1.35, z - 0.05, 0.34, 0.34, 0.34, '#4b4f58');
  p.rod([x + 0.4, y + 1.66, z - 0.05], [x + 0.4, y + 2.2, z - 0.05], 0.014, '#e8e6e0', 4);
  p.quad([x + 0.41, y + 2.0, z - 0.05], [x + 0.78, y + 2.0, z - 0.05], [x + 0.78, y + 2.2, z - 0.05], [x + 0.41, y + 2.2, z - 0.05], '#c8302a', true);
  k.reserve(x, z, R * 1.15, R * 1.1);
}

/** The Old Town Clock: a white round tower with a clock face, a cornice and a green dome. */
function oldTownClock(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  k.at(x, y, z, 0, 1.3, () => {
    p.box(0, -0.3, 0, 1.0, 0.3 + 0.75, 0.8, '#f1ede2');
    p.prism(0, 0.75, 0, 1.06, 0.34, 0.86, '#4e545e', { ry: Math.PI / 2 * 0 });
    for (let i = 0; i < 4; i++) winZ(k, rng, -0.33 + i * 0.22, 0.2, 0.404, 0.1, 0.28, '#3a4856', 0.3);
    p.cyl(0, 0.75, 0, 0.3, 0.27, 1.1, '#f4f1e8', { seg: 12 });
    p.cyl(0, 1.85, 0, 0.34, 0.34, 0.07, '#d9d4c4', { seg: 12 });
    // clock faces toward the camera
    p.cyl(0, 1.12, 0.26, 0.17, 0.17, 0.05, '#2f3a46', { seg: 12, rx: Math.PI / 2 });
    p.cyl(0, 1.12, 0.285, 0.14, 0.14, 0.03, '#f6f3ea', { seg: 12, rx: Math.PI / 2 });
    p.rod([0, 1.12, 0.31], [0, 1.23, 0.31], 0.012, '#2f3a46', 4);
    p.rod([0, 1.12, 0.31], [0.07, 1.1, 0.31], 0.012, '#2f3a46', 4);
    p.lathe(0, 1.92, 0, [[0.33, 0], [0.34, 0.06], [0.28, 0.2], [0.17, 0.3], [0.05, 0.37], [0.0, 0.4]], '#6fa595', { seg: 12 });
    p.rod([0, 2.3, 0], [0, 2.52, 0], 0.012, '#d9b43a', 4);
  });
  k.reserve(x, z, 0.9, 0.7);
}

const HALIFAX_HOUSES = style(NA, {
  walls: ['#f1eee4', '#e6d9b8', '#b9cfdc', '#c9d8b8', '#d9a58a', '#c9553d', '#f1eee4', '#8aa6c4', '#e8d09a'],
  roofs: ['#3f4650', '#6a4a3a', '#4e5a4a', '#2e3a48', '#58606a'],
  floors: [2, 3],
  roofKinds: [['gable', 4], ['front', 4]],
  pitch: 0.7,
});

const halifax: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.2, range: 3.6, rise: 4, rough: 0.5, freq: 0.1 };
    k.palette.land = '#86ad68';
    k.palette.land2 = '#7da562';
    const hx = k.vx(-17, 0.5);
    mesa(k, hx, -17, 4.8, 3.4, 2.5, 0.6, 2.4);
    k.paint((x, y, z, slope, c) => {
      const dx = (x - hx) / 5.3;
      const dz = (z + 17) / 3.8;
      if (dx * dx + dz * dz < 1 && y > 0.9) c.lerp(new THREE.Color(slope > 0.3 ? '#6a9a4a' : '#86b95e'), 0.85);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const hx = k.vx(-17, 0.5);
    const top = k.groundMax(hx, -17, 1.2, 1.0);
    starFort(k, rng, hx, -17, top - 0.04, 2.3);
    const cx = k.vx(-14.2, -2.2);
    oldTownClock(k, rng, cx, -14.2, k.groundMax(cx, -14.2, 0.6, 0.5) - 0.02);
    townOf(k, HALIFAX_HOUSES, { rows: 4, rowStep: 0.6, maxSlope: 0.7 });
  },
  quiet: true,
  rows: 0,
};


/** Height of the rendered terrain mesh (bilinear between its vertices) at (x, z): for things draped over slopes. */
function meshY(k: PortKit, x: number, z: number): number {
  const rows: number[] = [];
  for (let zz = SHORE_Z + 2.4; zz > SHORE_Z - 2.2; zz -= 0.3) rows.push(zz);
  for (let zz = SHORE_Z - 2.2; zz > -30; zz -= 0.8) rows.push(zz);
  let r = 0;
  while (r < rows.length - 2 && rows[r + 1] > z) r++;
  const W = Math.max(40, k.width);
  const xMin = (zz: number): number => -(W / 2 + 14 + Math.max(0, -zz - 10) * 0.7);
  const xMax = (zz: number): number => W / 2 + 14 + Math.max(0, -zz - 10) * 0.35;
  const at = (rr: number): number => {
    const zr = rows[rr];
    const f = ((x - xMin(zr)) / (xMax(zr) - xMin(zr))) * 60;
    const i = clamp(Math.floor(f), 0, 59);
    const t = f - i;
    return lerp(k.ground(lerp(xMin(zr), xMax(zr), i / 60), zr), k.ground(lerp(xMin(zr), xMax(zr), (i + 1) / 60), zr), t);
  };
  const t = clamp((rows[r] - z) / (rows[r] - rows[r + 1]));
  return lerp(at(r), at(r + 1), t);
}

// ───────────────────────────── St John's ─────────────────────────────

/** Cabot Tower: a squat stone tower with a battlemented top and a round flag turret. */
function cabotTower(k: PortKit, rng: Rng, x: number, z: number, y: number, s: number): void {
  const p = k.solid;
  const stone = '#b09878';
  const trim = '#d9c9a8';
  k.at(x, y, z, 0, s, () => {
    p.box(0, -0.4, 0, 0.8, 0.4 + 0.95, 0.8, stone);
    p.box(0, 0.95, 0, 0.9, 0.08, 0.9, trim);
    for (let i = 0; i < 5; i++) {
      const u = -0.4 + i * 0.2;
      p.box(u, 1.03, 0.4, 0.1, 0.1, 0.08, trim, { ao: 0 });
      p.box(u, 1.03, -0.4, 0.1, 0.1, 0.08, trim, { ao: 0 });
      p.box(0.4, 1.03, u, 0.08, 0.1, 0.1, trim, { ao: 0 });
      p.box(-0.4, 1.03, u, 0.08, 0.1, 0.1, trim, { ao: 0 });
    }
    p.box(0, 1.03, 0, 0.56, 0.4, 0.56, tint(stone, 0.05));
    p.box(0, 1.43, 0, 0.62, 0.05, 0.62, trim);
    p.pyramid(0, 1.48, 0, 0.5, 0.24, 0.5, '#6d7076');
    // the turret with its flagpole
    p.cyl(0.42, -0.4, -0.12, 0.2, 0.18, 2.2, stone, { seg: 10 });
    p.cyl(0.42, 1.8, -0.12, 0.25, 0.25, 0.07, trim, { seg: 10 });
    p.cone(0.42, 1.87, -0.12, 0.24, 0.3, '#6d7076', { seg: 10 });
    p.rod([0.42, 2.17, -0.12], [0.42, 2.9, -0.12], 0.014, '#e8e6e0', 4);
    p.quad([0.43, 2.55, -0.12], [0.8, 2.55, -0.12], [0.8, 2.85, -0.12], [0.43, 2.85, -0.12], '#d8362c', true);
    for (let i = 0; i < 3; i++) {
      winZ(k, rng, -0.24 + i * 0.24, 0.35, 0.404, 0.1, 0.34, '#3a4452', 0.3);
      winZ(k, rng, -0.14 + i * 0.14, 1.12, 0.284, 0.07, 0.2, '#3a4452', 0.3);
    }
    winX(k, rng, 0.404, 0.35, 0.0, 0.12, 0.34, '#3a4452', 0.3);
  });
  k.reserve(x, z, 0.9 * s, 0.7 * s);
}

const STJOHNS_HOUSES = style(NA, {
  walls: ['#d6392e', '#f2c230', '#2a6fbd', '#2f9a5a', '#f08a3a', '#35a6c4', '#e8e0cf', '#8a4ab0', '#d6392e', '#f2c230', '#2a6fbd', '#c94a8a'],
  roofs: ['#3b3f46', '#4a4f58', '#6a3b36', '#2f4f6a'],
  floors: [2, 3],
  w: [0.28, 0.4],
  d: [0.3, 0.4],
  gap: [0, 0.03],
  roofKinds: [['mono', 4], ['gable', 3], ['front', 2]],
  pitch: 0.75,
  runs: false,
});

const stjohns: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.4, range: 4.5, rise: 4, rough: 0.6, freq: 0.1 };
    k.palette.land = '#8aa070';
    k.palette.land2 = '#7e9a68';
    k.palette.hill = '#6f8a5c';
    k.palette.rock = '#8b8680';
    const sx = k.vx(-16.4, -1.0);
    k.bump(sx, -16.4, 7.2, 4.5, 3.1, 1.0);
    const nx = k.vx(-14.5, 3.0);
    channel(k, nx, 0.8, -19.5);
    k.bump(nx + 4.6, -15.6, 3.2, 3.0, 1.5);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const sx = k.vx(-16.4, -1.0);
    cabotTower(k, rng, sx, -16.6, k.groundMax(sx, -16.6, 0.5, 0.5) - 0.02, 1.25);
    // the lighthouse on the south side of the Narrows
    const nx = k.vx(-14.5, 3.0);
    const lx = nx + 2.0;
    const ly = k.groundMax(lx, -13.5, 0.4, 0.4);
    k.solid.rock(lx, ly - 0.5, -13.5, 0.75, '#8b8680', { sy: 0.9 });
    lighthouse(k, lx, ly, -13.5, { h: 2.4, square: true, bands: [['#f6f3ea', 0.55], ['#c8302a', 0.45]], cap: '#c8302a', gallery: '#2d3138', r0: 0.3, r1: 0.22, cottage: true });
    k.reserve(lx + 0.3, -13.5, 1.5, 1.0);
    townOf(k, STJOHNS_HOUSES, { rows: 6, rowStep: 0.5, gaps: 0.04, maxSlope: 0.9, rowRise: 0.04 });
  },
  mole: { light: false },
  quiet: true,
  rows: 0,
};

// ───────────────────────────── Torshavn ─────────────────────────────

/** A ribbon of white water draped down a slope (follows the rendered mesh). */
function waterfall(k: PortKit, rng: Rng, x: number, zTop: number, zBot: number): void {
  const p = k.solid;
  const n = 8;
  let px = x;
  let pa: V3 | null = null;
  for (let i = 0; i <= n; i++) {
    const z = lerp(zTop, zBot, i / n);
    px = x + Math.sin(i * 1.7) * 0.07;
    const y = meshY(k, px, z) + 0.05;
    const q: V3 = [px, y, z + 0.04];
    const w = 0.07 + 0.05 * (i / n);
    if (pa) p.quad([pa[0] - w * 0.8, pa[1], pa[2]], [pa[0] + w * 0.8, pa[1], pa[2]], [q[0] + w, q[1], q[2]], [q[0] - w, q[1], q[2]], i % 2 ? '#f4fbff' : '#dff0f8', true);
    pa = q;
  }
  if (pa) {
    p.blob(pa[0], pa[1] + 0.02, pa[2] + 0.06, 0.22, '#f1f8fb', { sy: 0.5, ry: rng.next() * 3 });
    p.blob(pa[0] + 0.12, pa[1] + 0.02, pa[2] + 0.12, 0.14, '#e4f1f7', { sy: 0.5 });
  }
}

const TORSHAVN_HOUSES = style(ARCTIC, {
  walls: ['#b8362b', '#e6c24a', '#f1eee4', '#2b2b2e', '#3d7ab5', '#f1eee4', '#8c2d26', '#d9712f'],
  roofs: ['#2e2e32', '#5f9440', '#2e2e32', '#7a2f26', '#4a4f58'],
  floors: [1, 2],
});

/** Tinganes: red and black timber houses with grass roofs on a rocky promontory. */
function tinganes(k: PortKit, rng: Rng, cx: number, cz: number): void {
  const hs = style(ARCTIC, { win: '#f4f2ea', trim: '#f4f2ea', floors: [1, 2], pitch: 0.55, door: '#f4f2ea', gap: [0.02, 0.08], chimney: 0.1 });
  const walls = ['#8c2d26', '#232326', '#9e3328', '#232326', '#7a2a24', '#8c2d26', '#232326'];
  const roofs = ['#5f9440', '#6ca04a', '#58893a', '#6ca04a'];
  const rows: Array<[number, number[]]> = [
    [cz + 0.42, [-1.75, -1.15, -0.55, 0.05, 0.65, 1.25, 1.85]],
    [cz - 0.35, [-1.45, -0.85, -0.25, 0.35, 0.95, 1.55]],
  ];
  let c = 0;
  for (const [zz, xs] of rows) {
    for (const dx of xs) {
      const w = 0.4 + rng.range(0, 0.14);
      const d = 0.38 + rng.range(0, 0.1);
      const floors = rng.chance(0.4) ? 2 : 1;
      house(k, cx + dx, zz, w, d, floors, hs, rng, rng.chance(0.75) ? 'gable' : 'front', walls[c % walls.length], roofs[c % roofs.length]);
      c++;
    }
  }
  k.reserve(cx, cz, 2.5, 1.3);
}

const torshavn: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.6, range: 5, rise: 3, rough: 0.35, freq: 0.1 };
    k.palette.land = '#7da353';
    k.palette.land2 = '#72a04e';
    k.palette.hill = '#5f9446';
    k.palette.rock = '#4d5658';
    k.palette.sand = '#9ea39a';
    delete k.palette.snowLine;
    // the promontory of Tinganes pushes out into the harbour
    const tx = k.vx(-11.4, 0.3);
    k.plateau(tx, -11.4, 3.0, 1.5, 0.5, 0.5);
    // the steep green mountains, with basalt terraces
    const lx = k.vx(-19.2, -3.4);
    mesa(k, lx, -19.2, 5.2, 3.4, 4.5, 0.45, 2.6);
    mesa(k, k.vx(-21, 6.2), -21, 5.5, 3.6, 5.4, 0.45, 2.6);
    k.paint((x, y, z, slope, c) => {
      if (z < -14.2 && z > -26 && slope > 0.2 && y > 0.9) c.set(Math.floor(y * 2.3) % 2 ? '#4f5f43' : '#3f4a3c');
      const px = (x - tx) / 3.2;
      const pz = (z + 11.4) / 1.6;
      if (px * px + pz * pz < 1 && y > 0.12) c.set(noise2(x * 3, z * 3, 4) > 0.5 ? '#8a8272' : '#7a7468');
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const tx = k.vx(-11.4, 0.3);
    tinganes(k, rng, tx, -11.4);
    const lx = k.vx(-19.2, -3.4);
    waterfall(k, rng, lx + 1.1, -17.9, -15.4);
    const cx = k.vx(-14.4, 3.0);
    woodenChurch(k, rng, cx, -14.5, k.groundMax(cx, -14.5, 0.6, 0.6) - 0.02, 1.4, { wall: '#f6f3ea', roof: '#33363c', spire: '#33363c', tall: 0.9 });
    townOf(k, TORSHAVN_HOUSES, { rows: 4, rowStep: 0.6 });
    noTrees(k);
  },
  quiet: true,
  rows: 0,
};


// ───────────────────────────── Hammerfest ─────────────────────────────

/** Melkoya: white LNG tanks, a pipe rack and a tall flare with a burning flame, on an island off the town. */
function lngPlant(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  k.at(x, y, z, 0, 1, () => {
    for (const [tx, tz, r] of [[-1.35, 0.1, 0.5], [-0.35, 0.2, 0.56], [0.7, 0.05, 0.5]] as Array<[number, number, number]>) {
      p.cyl(tx, -0.3, tz, r, r, 0.3 + 0.85, '#f2f2ef', { seg: 14 });
      p.cyl(tx, 0.4, tz, r + 0.006, r + 0.006, 0.05, '#c3c8cb', { seg: 14, ao: 0 });
      p.lathe(tx, 0.85, tz, [[r, 0], [r * 0.96, 0.1], [r * 0.75, 0.25], [r * 0.4, 0.34], [0.0, 0.38]], '#e1e4e5', { seg: 14 });
      p.box(tx + r * 0.7, 0.0, tz + r * 0.7, 0.05, 0.9, 0.05, '#8d9498', { ao: 0 });
    }
    // process plant: vessels, a pipe rack and sheds
    p.box(1.65, -0.3, -0.1, 0.9, 0.3 + 0.35, 0.5, '#c9ccce');
    p.box(1.65, 0.35, -0.1, 0.96, 0.05, 0.56, '#7d868c');
    for (let i = 0; i < 3; i++) p.cyl(1.35 + i * 0.32, 0.4, 0.0, 0.1, 0.1, 0.5, '#eceeee', { seg: 8 });
    p.box(0.1, 0.0, -0.55, 2.4, 0.12, 0.1, '#e07b2a');
    p.box(-1.6, 0.0, -0.55, 0.8, 0.5, 0.4, '#d6d9da');
    for (let i = 0; i < 4; i++) winZ(k, rng, -1.9 + i * 0.2, 0.18, -0.348, 0.1, 0.14, '#35465a', 0.4);
    // the flare stack with its flame
    const fx = 2.55;
    p.cyl(fx, -0.3, -0.2, 0.09, 0.05, 0.3 + 3.3, '#e5e7e8', { seg: 6 });
    p.box(fx, 0.6, -0.2, 0.2, 0.05, 0.2, '#9aa2a7');
    p.box(fx, 1.7, -0.2, 0.18, 0.05, 0.18, '#9aa2a7');
    k.glow.lathe(fx, 3.58, -0.2, [[0, 0], [0.13, 0.1], [0.17, 0.3], [0.12, 0.55], [0.05, 0.78], [0, 1.0]], '#ff8a26', { seg: 7 });
    k.glow.lathe(fx, 3.6, -0.2, [[0, 0], [0.08, 0.08], [0.1, 0.22], [0.06, 0.4], [0, 0.55]], '#ffd35a', { seg: 7 });
  });
  k.reserve(x, z, 3.4, 1.2);
}

/** A modern A-frame church: a steep slate roof to the ground, a pale gable with a tall glass slit, a thin tower. */
function aframeChurch(k: PortKit, x: number, z: number, y: number, s: number, roof: Col, ry = 0): void {
  const p = k.solid;
  k.at(x, y, z, ry, s, () => {
    const L = 1.6;
    const hw = 0.62;
    const H = 1.7;
    p.box(0, -0.4, 0, hw * 2 + 0.1, 0.5, L + 0.1, '#c7c4bb');
    p.extrude([[-hw, 0], [hw, 0], [0, H]], L, 0, 0.1, 0, roof, { ao: 0.05 });
    // pale gable end with a tall slit window and a cross
    p.tri([-hw + 0.04, 0.1, L / 2 + 0.006], [hw - 0.04, 0.1, L / 2 + 0.006], [0, H - 0.04, L / 2 + 0.006], '#f1ede2');
    k.glass.quad([-0.07, 0.1, L / 2 + 0.01], [0.07, 0.1, L / 2 + 0.01], [0.04, H * 0.85, L / 2 + 0.01], [-0.04, H * 0.85, L / 2 + 0.01], '#9ec3d6');
    p.box(0, 0.1, L / 2 + 0.01, 0.3, 0.46, 0.02, '#4d3b30', { ao: 0 });
    p.box(0.95, -0.4, 0.55, 0.22, 0.4 + 2.0, 0.22, '#f1ede2');
    p.pyramid(0.95, 1.6, 0.55, 0.26, 0.5, 0.26, roof);
    p.rod([0.95, 2.1, 0.55], [0.95, 2.3, 0.55], 0.014, '#e8e6e0', 4);
  });
  k.reserve(x, z, 1.2 * s, 1.0 * s);
}

/** The Meridian column: a stone pillar on steps with a bronze globe on top. */
function meridianColumn(k: PortKit, x: number, z: number, y: number): void {
  const p = k.solid;
  k.at(x, y, z, 0, 1.2, () => {
    p.box(0, -0.2, 0, 0.62, 0.2 + 0.12, 0.62, '#b9b5aa');
    p.box(0, 0.12, 0, 0.46, 0.12, 0.46, '#c9c5ba');
    p.box(0, 0.24, 0, 0.24, 1.1, 0.24, '#a39f95');
    p.box(0, 1.34, 0, 0.32, 0.06, 0.32, '#c9c5ba');
    p.ball(0, 1.62, 0, 0.23, '#b88a46');
    p.rod([-0.26, 1.62, 0], [0.26, 1.62, 0], 0.012, '#7d5d2c', 4);
    p.box(0, 0.5, 0.125, 0.12, 0.2, 0.01, '#d9b43a', { ao: 0 });
  });
  k.reserve(x, z, 0.5, 0.5);
}

const HAMMERFEST_HOUSES = style(ARCTIC, {
  walls: ['#f1eee4', '#e8d6a0', '#c9553d', '#8fa8b8', '#f1eee4', '#d9a066', '#b33a2e', '#f1eee4'],
  roofs: ['#3b3f46', '#6c747a', '#7a4a3a', '#3b3f46'],
  floors: [1, 2],
});

const hammerfest: Landmark = {
  terrain(k) {
    k.shape = { relief: 2.6, range: 7, rise: 2.5, rough: 0.75, freq: 0.12 };
    k.palette.land = '#8b8d7c';
    k.palette.land2 = '#848a78';
    k.palette.hill = '#7c8078';
    k.palette.rock = '#5b6269';
    k.palette.snowLine = 4.4;
    // the island of Melkoya in front of the town, on the side away from the breakwater head
    const ix = k.vx(-10.6, k.mole.dir > 0 ? 3.0 : -3.6);
    k.plateau(ix, -10.5, 3.5, 1.35, 0.5, 0.45);
    k.bump(k.vx(-17.4, 0.5), -17.6, 7.5, 4.6, 3.0, 1.3);
    k.paint((x, y, z, slope, c) => {
      const px = (x - ix) / 3.7;
      const pz = (z + 10.5) / 1.5;
      if (px * px + pz * pz < 1 && y > 0.1) c.set(noise2(x * 3, z * 3, 6) > 0.5 ? '#6f747a' : '#5f656b');
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const ix = k.vx(-10.6, k.mole.dir > 0 ? 3.0 : -3.6);
    lngPlant(k, rng, ix - 0.2, -10.5, 0.5);
    const ch = k.vx(-14.3, -0.6);
    aframeChurch(k, ch, -14.4, k.groundMax(ch, -14.4, 0.8, 0.8) - 0.02, 1.45, '#4d545c');
    const mx = k.vx(-12.8, 2.6);
    meridianColumn(k, mx, -12.8, k.groundMax(mx, -12.8, 0.4, 0.4));
    townOf(k, HAMMERFEST_HOUSES, { rows: 4, rowStep: 0.6, maxSlope: 0.34 });
    noTrees(k);
  },
  quiet: true,
  rows: 0,
};


// ───────────────────────────── Narvik ─────────────────────────────

/** A mound of iron ore pellets with a dusting of snow on top. */
function oreHeap(k: PortKit, x: number, z: number, r: number, h: number, col: Col): void {
  const p = k.solid;
  const y = Math.max(k.groundMax(x, z, r * 0.6, r * 0.5) - 0.12, LAND_Y - 0.1);
  p.cone(x, y, z, r, h, col, { seg: 9, open: true });
  p.cone(x, y + h * 0.78, z, r * 0.24, h * 0.22, '#eef1f2', { seg: 9, open: true });
  k.reserve(x, z, r, r * 0.8);
}

/** The ore quay: a rail-mounted ship loader with its boom over the water, a conveyor, an ore train. */
function oreQuay(k: PortKit, rng: Rng, cx: number, qz: number): void {
  const p = k.solid;
  const W = 7.4;
  p.box(cx, -0.9, qz, W, 0.9 + 0.5, 1.5, '#8f8c85');
  p.box(cx, 0.5, qz, W + 0.04, 0.04, 1.54, '#b3afa5');
  for (let i = 0; i < 13; i++) p.box(cx - W / 2 + 0.3 + i * 0.57, 0.05, qz + 0.76, 0.1, 0.4, 0.06, '#2d3138', { ao: 0 });
  // rails
  p.box(cx, 0.54, qz + 0.36, W - 0.2, 0.025, 0.04, '#4a4a4a', { ao: 0 });
  p.box(cx, 0.54, qz - 0.12, W - 0.2, 0.025, 0.04, '#4a4a4a', { ao: 0 });
  // the ship loader: portal legs, a cab, the long boom and its stays
  const lx = cx + 0.9;
  const red = '#bd402c';
  k.at(lx, 0.54, qz + 0.12, 0, 1, () => {
    for (const [dx, dz] of [[-0.5, -0.26], [0.5, -0.26], [-0.5, 0.26], [0.5, 0.26]]) p.box(dx, 0, dz, 0.08, 1.35, 0.08, red);
    p.box(0, 1.3, 0, 1.2, 0.1, 0.7, '#d9dcdc');
    p.box(0, 1.4, 0.05, 0.5, 0.3, 0.4, red);
    p.box(0, 1.06, 0, 1.1, 0.04, 0.04, red, { ao: 0 });
    // boom out over the water (+z), slightly raised
    p.box(0, 1.52, 1.0, 0.16, 0.12, 2.3, '#d9dcdc', { rx: -0.1, ao: 0 });
    p.box(-0.07, 1.5, 1.0, 0.03, 0.14, 2.3, red, { rx: -0.1, ao: 0 });
    p.box(0.07, 1.5, 1.0, 0.03, 0.14, 2.3, red, { rx: -0.1, ao: 0 });
    // counterweight and conveyor to the back
    p.box(0, 1.35, -0.95, 0.3, 0.26, 0.55, '#6c7378');
    p.box(0, 1.46, -0.5, 0.14, 0.1, 1.2, '#d9dcdc', { rx: 0.03, ao: 0 });
    p.rod([0, 2.0, 0], [0, 1.64, 2.08], 0.012, '#3a3f46', 3);
    p.rod([0, 2.0, 0], [0, 1.5, -0.95], 0.012, '#3a3f46', 3);
    p.rod([0, 1.7, 0], [0, 2.15, 0], 0.03, red, 4);
    p.box(0, 1.65, 2.05, 0.18, 0.1, 0.12, red);
  });
  // an ore train on the rails: dark wagons heaped with red-brown ore
  for (let i = 0; i < 7; i++) {
    const x = cx - 3.2 + i * 0.5;
    p.box(x, 0.56, qz - 0.12, 0.44, 0.17, 0.17, '#3d3a39');
    p.box(x, 0.7, qz - 0.12, 0.38, 0.07, 0.13, '#7c3f2d', { ao: 0 });
  }
  // the covered conveyor climbing to the stockpile shed
  p.box(lx, 0.6, qz - 1.4, 0.2, 0.18, 2.3, '#a9acad', { rx: 0.1 });
  for (let i = 0; i < 3; i++) p.box(lx, -0.1, qz - 0.8 - i * 0.7, 0.07, 0.8 + i * 0.22, 0.07, '#6c7378');
  k.reserve(cx, qz, W / 2, 0.8);
}

const NARVIK_HOUSES = style(ARCTIC, {
  walls: ['#a63a2c', '#b84a30', '#d6a25a', '#c98a3c', '#e0c27a', '#f1e8d4', '#8f2f27', '#b84a30'],
  roofs: ['#3b3f46', '#4a4038', '#5a3f38', '#3b3f46'],
  floors: [1, 3],
});

const narvik: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.8, range: 6, rise: 3, rough: 0.8, freq: 0.1 };
    k.palette.snowLine = 4.4;
    k.palette.rock = '#4f5760';
    k.palette.hill = '#66756a';
    k.palette.land = '#85936d';
    k.bump(k.vx(-17, 0), -17, 8, 4, 1.0);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-11, -0.3);
    oreQuay(k, rng, cx, -11.2);
    // the stockpiles behind the quay
    oreHeap(k, cx - 1.6, -13.9, 1.0, 0.85, '#7c3f2d');
    oreHeap(k, cx + 0.3, -14.2, 1.15, 1.0, '#8c4a36');
    oreHeap(k, cx + 2.0, -13.8, 0.85, 0.7, '#6f3a2c');
    // the steep fjord walls: two snowy peaks with a notch between
    crag(k, { x: k.vx(-19.5, -5.6), z: -19.5, rx: 6.0, rz: 4.0, h: 8.2, y: 0.8, rock: '#6d757f', rock2: '#7b838d', snowAt: 0.62, lean: [0.2, 0], seed: 5, rough: 0.1, gully: 0.22 });
    crag(k, { x: k.vx(-20.5, 5.4), z: -20.5, rx: 6.2, rz: 4.2, h: 9.0, y: 0.8, rock: '#6d757f', rock2: '#7b838d', snowAt: 0.62, lean: [-0.2, 0], seed: 6, rough: 0.1, gully: 0.22 });
    townOf(k, NARVIK_HOUSES, { rows: 4, rowStep: 0.6, maxSlope: 0.32 });
  },
  quiet: true,
  rows: 0,
};

// ───────────────────────────── Bodo ─────────────────────────────

/** Bodo Cathedral: a plain cream-brick hall; its slim concrete bell tower stands apart. */
function bodoCathedral(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  k.at(x, y, z, 0, 1.3, () => {
    p.box(0, -0.4, -0.2, 1.4, 0.4 + 0.95, 2.2, '#dccfa9');
    p.prism(0, 0.55, -0.2, 1.5, 0.62, 2.24, '#5c5148');
    p.tri([-0.7, 0.55, 0.92], [0.7, 0.55, 0.92], [0, 1.17, 0.92], '#dccfa9');
    p.box(0, 0.0, 0.91, 0.36, 0.5, 0.03, '#3d3430', { ao: 0 });
    for (const dx of [-0.46, 0.46]) p.box(dx, 0.1, 0.915, 0.14, 0.5, 0.02, '#46586a', { ao: 0 });
    for (let i = 0; i < 6; i++) winX(k, rng, 0.704, 0.12, 0.6 - i * 0.36, 0.16, 0.55, '#46586a', 0.3);
    // the bell tower: tall, slim, concrete, with a louvred belfry and a flat top
    const tx = 1.7;
    const tz = 0.5;
    p.box(tx, -0.4, tz, 0.4, 0.4 + 2.5, 0.4, '#cfcdc4');
    for (let i = 0; i < 5; i++) p.box(tx - 0.1 + (i % 2) * 0.0, 0.2 + i * 0.4, tz + 0.201, 0.05, 0.22, 0.01, '#5d6670', { ao: 0 });
    p.box(tx, 2.4, tz, 0.5, 0.06, 0.5, '#d9d7ce');
    p.box(tx, 2.46, tz, 0.44, 0.5, 0.44, '#3f4650');
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box(tx + dx * 0.19, 2.46, tz + dz * 0.19, 0.07, 0.5, 0.07, '#cfcdc4');
    p.box(tx, 2.96, tz, 0.54, 0.06, 0.54, '#d9d7ce');
    p.rod([tx, 3.0, tz], [tx, 3.4, tz], 0.016, '#cfcdc4', 4);
    p.rod([tx - 0.1, 3.27, tz], [tx + 0.1, 3.27, tz], 0.016, '#cfcdc4', 4);
  });
  k.reserve(x + 1.4, z, 3.0, 1.4);
}

/** The Aviation Museum: a low building whose plan is a two-bladed propeller. */
function propellerMuseum(k: PortKit, x: number, z: number, y: number, spin: number): void {
  const p = k.solid;
  const blade: Array<[number, number]> = [[0.25, -0.1], [0.9, -0.2], [1.5, -0.44], [1.9, -0.2], [1.85, 0.18], [1.4, 0.44], [0.9, 0.24], [0.25, 0.1]];
  const other: Array<[number, number]> = blade.map(([bx, by]) => [-bx, -by]);
  const roofA = blade.map(([bx, by]) => [bx * 0.97, by * 0.9] as [number, number]);
  const roofB = other.map(([bx, by]) => [bx * 0.97, by * 0.9] as [number, number]);
  const flat = -Math.PI / 2;
  const H = 0.8;
  p.extrude(blade, H, x, y + H / 2 - 0.1, z, '#d3d8db', { rx: flat, ry: spin, ao: 0.05 });
  p.extrude(other, H, x, y + H / 2 - 0.1, z, '#d3d8db', { rx: flat, ry: spin, ao: 0.05 });
  p.cyl(x, y - 0.1, z, 0.46, 0.46, H, '#cdd3d6', { seg: 16 });
  // darker roofs over the walls
  p.extrude(roofA, 0.05, x, y + H - 0.07, z, '#59646e', { rx: flat, ry: spin, ao: 0 });
  p.extrude(roofB, 0.05, x, y + H - 0.07, z, '#59646e', { rx: flat, ry: spin, ao: 0 });
  p.cyl(x, y + H - 0.1, z, 0.4, 0.4, 0.06, '#59646e', { seg: 16, ao: 0 });
  k.glass.lathe(x, y + H - 0.05, z, [[0.3, 0], [0.28, 0.1], [0.2, 0.2], [0.1, 0.26], [0, 0.28]], '#8fb8cc', { seg: 12 });
  // a small jet on a stand out front
  k.at(x - 0.8, y, z + 1.0, 0.5, 1, () => {
    p.box(0, 0.0, 0, 0.05, 0.28, 0.05, '#8d9498');
    p.cyl(0, 0.34, 0, 0.045, 0.02, 0.6, '#c9d0d4', { seg: 6, rz: Math.PI / 2, ry: 0 });
    p.box(0, 0.33, 0, 0.1, 0.012, 0.5, '#b9c0c4', { ao: 0 });
    p.box(-0.2, 0.34, 0, 0.1, 0.1, 0.012, '#b9c0c4', { ao: 0 });
  });
  k.reserve(x, z, 1.9, 1.4);
}

const BODO_HOUSES = style(ARCTIC, {
  walls: ['#e8d6a0', '#f1eee4', '#c98a3c', '#7f9bb0', '#d9a066', '#b33a2e', '#f1eee4', '#a9c4b8'],
  roofs: ['#4a4f58', '#7a4a3a', '#3b3f46', '#5a5f68'],
  floors: [1, 3],
  roofKinds: [['front', 4], ['gable', 4]],
});

const bodo: Landmark = {
  terrain(k) {
    k.shape = { relief: 1.4, range: 6.5, rise: 3, rough: 0.9, freq: 0.14 };
    k.palette.snowLine = 4.2;
    k.palette.rock = '#555d67';
    k.palette.hill = '#6c7a68';
    k.palette.land = '#86946e';
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14.4, -2.8);
    bodoCathedral(k, rng, cx, -14.4, k.groundMax(cx, -14.4, 1.0, 1.0) - 0.02);
    const mx = k.vx(-14.0, 4.9);
    propellerMuseum(k, mx, -14.0, k.groundMax(mx, -14.0, 1.4, 1.0) - 0.0, 0.35);
    // a jagged range behind
    crag(k, { x: k.vx(-20, -5), z: -20, rx: 3.6, rz: 3.2, h: 7.4, y: 1.0, rock: '#545c66', rock2: '#646d77', snowAt: 0.64, seed: 7, n: 7, rough: 0.14, gully: 0.3 });
    crag(k, { x: k.vx(-21.5, 0.6), z: -21.5, rx: 3.9, rz: 3.4, h: 9.2, y: 1.0, rock: '#545c66', rock2: '#646d77', snowAt: 0.62, lean: [0.15, 0], seed: 8, n: 7, rough: 0.14, gully: 0.3 });
    crag(k, { x: k.vx(-20.5, 5.6), z: -20.5, rx: 3.6, rz: 3.2, h: 6.8, y: 1.0, rock: '#545c66', rock2: '#646d77', snowAt: 0.64, seed: 9, n: 7, rough: 0.14, gully: 0.3 });
    townOf(k, BODO_HOUSES, { rows: 4, rowStep: 0.6, maxSlope: 0.4 });
  },
  quiet: true,
  rows: 0,
};


// ───────────────────────────── Sept-Iles ─────────────────────────────

/** A long ore pier on trestles: a covered conveyor out to a T-shaped head with a ship loader. */
function orePier(k: PortKit, rng: Rng, px: number, zShore: number, zHead: number): void {
  const p = k.solid;
  const len = zHead - zShore;
  const zm = (zShore + zHead) / 2;
  const top = 0.95;
  // trestle bents down to the sea floor, a deck and the covered conveyor with its red roof
  for (let z = zShore + 0.25; z < zHead - 0.2; z += 0.55) {
    p.box(px - 0.22, -0.9, z, 0.08, top + 0.9, 0.08, '#6c7378');
    p.box(px + 0.22, -0.9, z, 0.08, top + 0.9, 0.08, '#6c7378');
    p.box(px, top - 0.2, z, 0.5, 0.04, 0.05, '#6c7378', { ao: 0 });
  }
  p.box(px, top, zm, 0.6, 0.07, len, '#8f8c85');
  p.box(px, top + 0.07, zm, 0.3, 0.2, len, '#b3b6b7');
  p.prism(px, top + 0.27, zm, 0.36, 0.12, len, '#c9674d');
  // an abutment where the pier meets the shore
  p.box(px, 0.0, zShore - 0.1, 0.8, top, 0.5, '#8f8c85');
  // the head: a wide platform along x
  const hw = 3.2;
  p.box(px, -0.9, zHead, hw, 0.9 + 0.5, 0.7, '#8f8c85');
  p.box(px, 0.5, zHead, hw + 0.04, 0.04, 0.74, '#b3afa5');
  for (let i = 0; i < 8; i++) p.box(px - hw / 2 + 0.25 + i * 0.42, 0.05, zHead + 0.36, 0.09, 0.4, 0.06, '#2d3138', { ao: 0 });
  // the shiploader: a tall blue-and-white portal with a boom reaching out over the water
  const blue = '#2c5da8';
  k.at(px, 0.54, zHead, 0, 1.2, () => {
    for (const [dx, dz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) p.box(dx, 0, dz, 0.07, 1.5, 0.07, blue);
    p.box(0, 1.45, 0, 0.8, 0.1, 0.5, '#e4e7e8');
    p.box(0, 1.55, 0, 0.4, 0.34, 0.3, blue);
    p.box(0, 1.73, 0.55, 0.14, 0.12, 1.4, '#e4e7e8', { rx: -0.14, ao: 0 });
    p.rod([0, 2.1, 0], [0, 1.85, 1.2], 0.012, '#3a3f46', 3);
    p.rod([0, 2.1, 0], [0, 1.6, -0.5], 0.012, '#3a3f46', 3);
    p.rod([0, 1.89, 0], [0, 2.15, 0], 0.03, blue, 4);
    winZ(k, rng, 0, 1.6, 0.152, 0.2, 0.14, '#35465a', 0.5);
  });
  k.reserve(px, zm, 2.1, len / 2 + 0.4);
}

/** A heap of grey-red pellets. */
function pelletHeap(k: PortKit, x: number, z: number, r: number, h: number, col: Col): void {
  const y = Math.max(k.groundMax(x, z, r * 0.6, r * 0.5) - 0.1, LAND_Y - 0.1);
  k.solid.cone(x, y, z, r, h, col, { seg: 9, open: true });
  k.reserve(x, z, r, r * 0.8);
}

const SEPTILES_HOUSES = style(NA, {
  walls: ['#f2efe6', '#a9c4d6', '#d65a4a', '#e8c35a', '#8aa88a', '#c9a98a', '#f2efe6', '#d98a4a'],
  roofs: ['#4a4f58', '#6a4a3a', '#3f5a48', '#58606a', '#8a3a30'],
  floors: [1, 2],
});

const septiles: Landmark = {
  terrain(k) {
    k.shape = { relief: 2.4, range: 5, rise: 3, rough: 0.5, freq: 0.1 };
    k.palette.land = '#5f7f52';
    k.palette.land2 = '#587a4e';
    k.palette.hill = '#3d6446';
    k.palette.rock = '#4c6a58';
    k.palette.sand = '#b8b4a4';
    // the island with its lighthouse, in front of the town
    const ix = k.vx(-10.6, k.mole.dir > 0 ? 3.6 : -4.4);
    k.plateau(ix, -10.4, 1.4, 0.9, 0.45, 0.5);
    k.bump(k.vx(-18.5, 0), -18.5, 8.5, 4.5, 2.4);
    k.paint((x, y, z, slope, c) => {
      const px = (x - ix) / 1.5;
      const pz = (z + 10.4) / 1.0;
      if (px * px + pz * pz < 1 && y > 0.1) c.set(noise2(x * 3, z * 3, 8) > 0.5 ? '#8c8a82' : '#7c7b75');
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const px = k.vx(-11, k.mole.dir > 0 ? -1.6 : 1.8);
    orePier(k, rng, px, -12.0, -9.5);
    pelletHeap(k, px - 2.2, -13.7, 0.95, 0.75, '#7a4b43');
    pelletHeap(k, px + 0.1, -14.0, 1.1, 0.9, '#6f6a6a');
    pelletHeap(k, px + 2.1, -13.6, 0.8, 0.62, '#85544a');
    // the lighthouse on its island
    const ix = k.vx(-10.6, k.mole.dir > 0 ? 3.6 : -4.4);
    k.solid.rock(ix, 0.2, -10.4, 0.8, '#8c8a82', { sy: 0.6 });
    lighthouse(k, ix, 0.62, -10.4, { h: 1.9, bands: [['#f6f3ea', 0.5], ['#c8302a', 0.25], ['#f6f3ea', 0.25]], cap: '#c8302a', gallery: '#2d3138', cottage: true, r0: 0.25, r1: 0.17 });
    k.reserve(ix, -10.4, 1.2, 0.8);
    // a small white church in the town
    const cx = k.vx(-14.2, -3.4);
    woodenChurch(k, rng, cx, -14.2, k.groundMax(cx, -14.2, 0.6, 0.6) - 0.02, 1.45, { wall: '#f6f3ea', roof: '#a3392e', spire: '#a3392e', tall: 0.9 });
    townOf(k, SEPTILES_HOUSES, { rows: 3, rowStep: 0.6 });
    // the boreal forest: dense spruce on the hills behind
    scatter(k, ['pine', 'fir', 'pine'], { count: 110, x0: k.vx(-20) - 13, x1: k.vx(-20) + 13, z0: -26, z1: -15.2, size: [1.2, 1.9], minY: 0.8, maxY: 6, grove: 8, mask: () => 0.9 });
  },
  mole: { light: false },
  quiet: true,
  rows: 0,
};

// ───────────────────────────── New York ─────────────────────────────

/** The Statue of Liberty: a green figure with a raised torch on a pedestal and a star-shaped fort wall. */
function statueOfLiberty(k: PortKit, x: number, z: number, y: number, s: number): void {
  const p = k.solid;
  const green = '#6bb59f';
  const dark = '#4f9784';
  k.at(x, y, z, 0, s, () => {
    p.extrude(star(1.0, 0.72, 8, Math.PI / 2), 0.3, 0, 0.13, 0, '#b8aa90', { rx: -Math.PI / 2, ao: 0.05 });
    p.cyl(0, 0.28, 0, 0.62, 0.42, 0.4, '#cfc9ba', { seg: 4, ry: Math.PI / 4 });
    p.box(0, 0.68, 0, 0.5, 0.48, 0.5, '#d8d2c2');
    p.box(0, 1.16, 0, 0.64, 0.06, 0.64, '#c3bdad');
    // the robed figure
    p.cyl(0, 1.2, 0, 0.27, 0.17, 0.9, green, { seg: 8 });
    p.cyl(0, 2.08, 0, 0.17, 0.12, 0.26, dark, { seg: 8 });
    p.ball(0.02, 2.46, 0, 0.1, green);
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + (i / 6) * 1.8 + Math.PI / 2;
      p.rod([0.02 + Math.cos(a) * 0.08, 2.5 + Math.sin(a) * 0.08, 0.0], [0.02 + Math.cos(a) * 0.27, 2.5 + Math.sin(a) * 0.27, 0.0], 0.014, dark, 4);
    }
    // the raised arm and the torch
    p.rod([0.1, 2.15, 0], [0.3, 2.9, 0.02], 0.045, green, 5);
    p.cyl(0.3, 2.88, 0.02, 0.06, 0.09, 0.14, '#d9b43a', { seg: 8 });
    k.glow.cone(0.3, 3.0, 0.02, 0.085, 0.3, '#ffcf4a', { seg: 6 });
    // the tablet on the left arm
    p.box(-0.2, 1.95, 0.08, 0.22, 0.3, 0.06, dark, { rz: 0.15 });
    p.box(-0.1, 1.9, 0.05, 0.1, 0.3, 0.08, green);
  });
  k.reserve(x, z, 1.1 * s, 1.0 * s);
}

const NY_TOWERS: Array<[number, number, number, number, number, Col]> = [
  // dx, z, w, d, h, wall
  [-6.8, -15.4, 0.7, 0.55, 1.5, '#b9b2a2'],
  [-5.9, -16.8, 0.8, 0.6, 2.4, '#9fb0bc'],
  [-5.2, -15.0, 0.6, 0.5, 1.2, '#b8a58c'],
  [-4.5, -17.4, 0.7, 0.6, 2.9, '#aab7c2'],
  [-3.7, -15.6, 0.65, 0.5, 1.9, '#c7b79a'],
  [-1.4, -15.2, 0.8, 0.6, 2.0, '#8f9aa3'],
  [-0.6, -17.6, 0.9, 0.7, 3.1, '#b5a08a'],
  [0.1, -15.8, 0.7, 0.55, 2.3, '#aab7c2'],
  [0.9, -15.0, 0.6, 0.5, 1.3, '#a58f7e'],
  [4.0, -15.4, 0.75, 0.6, 2.1, '#b9b2a2'],
  [4.9, -17.2, 0.85, 0.65, 2.9, '#9fb0bc'],
  [5.8, -15.2, 0.65, 0.5, 1.6, '#c7b79a'],
  [6.6, -16.6, 0.8, 0.6, 2.4, '#8f9aa3'],
  [7.3, -15.0, 0.6, 0.5, 1.3, '#b8a58c'],
];

/** Lower Manhattan: a dense wall of towers, an Empire State setback spire and a One WTC glass obelisk. */
function skyline(k: PortKit, rng: Rng, cx: number): void {
  const wins = ['#3f566b', '#35506a', '#44596e'];
  for (const [dx, z, w, d, h, wall] of NY_TOWERS) {
    const x = cx + dx;
    tower(k, x, z, w, d, h, wall, { win: pick(rng, wins), roof: dx > 3 ? 'pyramid' : 'flat', roofH: 0.2, y: Math.max(k.ground(x, z), LAND_Y) });
  }
  // the Empire State Building: a limestone tower with setbacks and a tall mast
  const ex = cx + 2.4;
  const ez = -17.0;
  const ey = Math.max(k.ground(ex, ez), LAND_Y);
  let y = ey;
  y = tower(k, ex, ez, 1.1, 0.9, 2.2, '#d8d2c0', { win: '#46596b', y, roof: 'none' });
  y = tower(k, ex, ez, 0.8, 0.66, 1.3, '#d8d2c0', { win: '#46596b', y, roof: 'none' });
  y = tower(k, ex, ez, 0.52, 0.44, 0.9, '#dcd6c4', { win: '#46596b', y, roof: 'none' });
  y = tower(k, ex, ez, 0.3, 0.26, 0.5, '#e2dccb', { win: '#46596b', y, roof: 'none' });
  k.solid.cone(ex, y, ez, 0.17, 0.5, '#dcd8cc', { seg: 4 });
  k.solid.rod([ex, y + 0.4, ez], [ex, y + 1.35, ez], 0.022, '#cfd3d6', 4);
  // One World Trade Center: a tapering glass shaft with a long spire
  const wx = cx - 2.4;
  const wz = -16.4;
  const wy = Math.max(k.ground(wx, wz), LAND_Y);
  k.glass.cyl(wx, wy - 0.15, wz, 0.55, 0.38, 4.5, '#8fb4c6', { seg: 8, ry: Math.PI / 8 });
  k.solid.cyl(wx, wy + 4.3, wz, 0.38, 0.38, 0.08, '#cfd6da', { seg: 8, ry: Math.PI / 8 });
  k.solid.rod([wx, wy + 4.35, wz], [wx, wy + 5.7, wz], 0.03, '#e6e8ea', 4);
  k.reserve(wx, wz, 0.6, 0.6);
}

const NY_LOW = style(NA, {
  walls: ['#a9593f', '#b8664a', '#8f8f8a', '#c4a07a', '#7f8a96', '#9a8f84', '#b07a5a'],
  roofs: ['#585b60', '#6a6d72'],
  floors: [3, 6],
  w: [0.4, 0.6],
  d: [0.4, 0.5],
  gap: [0, 0.01],
  roofKinds: [['flat', 1]],
  pitch: 0.2,
  chimney: 0,
});

const newyork: Landmark = {
  terrain(k) {
    k.shape = { relief: 0.5, range: 1.2, rise: 8, rough: 0.2, freq: 0.06 };
    k.palette.land = '#939a86';
    k.palette.land2 = '#8a927f';
    k.palette.hill = '#7f8a78';
    k.palette.sand = '#a9a79c';
    const ix = k.vx(-10.9, k.mole.dir > 0 ? 3.4 : -3.6);
    k.plateau(ix, -10.9, 2.0, 1.3, 0.5, 0.5);
    k.paint((x, y, z, slope, c) => {
      const px = (x - ix) / 2.1;
      const pz = (z + 10.9) / 1.4;
      if (px * px + pz * pz < 1 && y > 0.12) c.set(noise2(x * 3, z * 3, 3) > 0.5 ? '#8aa266' : '#7c9a5c');
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    skyline(k, rng, k.vx(-16, 0));
    const ix = k.vx(-10.9, k.mole.dir > 0 ? 3.4 : -3.6);
    statueOfLiberty(k, ix, -10.9, 0.5, 1.5);
    townOf(k, NY_LOW, { rows: 2, rowStep: 0.55, gaps: 0.02 });
    noTrees(k);
  },
  quiet: true,
  rows: 0,
};

export const LANDMARKS: Record<string, Landmark> = { reykjavik, tromso, nuuk, halifax, stjohns, torshavn, hammerfest, narvik, bodo, septiles, newyork };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Reykjavik', 'arctic', 'reykjavik'],
  ['Tromso', 'arctic', 'tromso'],
  ['Nuuk', 'arctic', 'nuuk'],
  ['Halifax', 'na', 'halifax'],
  ["St John's", 'na', 'stjohns'],
  ['Torshavn', 'arctic', 'torshavn'],
  ['Hammerfest', 'arctic', 'hammerfest'],
  ['Narvik', 'arctic', 'narvik'],
  ['Bodo', 'arctic', 'bodo'],
  ['Sept-Iles', 'na', 'septiles'],
  ['New York', 'na', 'newyork'],
];

