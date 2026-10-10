import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { Part, PortKit, SHORE_Z, MOLE_Z, LAND_Y, lerp, smooth, clamp, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import { REGIONS as BASE, type Region, type RegionId } from '../regions';
import { buildTown, pick, tint, type HouseStyle } from '../town';
import { gantryCrane, minaret } from '../props';
import { battlement, roundTower } from '../structures';

/**
 * Sri Lanka, South-East Asia, China, Taiwan, Korea. Owned by one port-scene module: its regions (southasia, seasia, eastasia), landmarks and port rows.
 * REGIONS here replace the placeholders in ../regions.ts when ../landmarks.ts loads.
 *
 * Colombo (Lotus Tower, clock-tower lighthouse), Port Klang (palm-oil tanks, mosque), Tanjung Pelepas (gantry rows against
 * jungle), Singapore (Marina Bay Sands, the bunker anchorage, the Merlion), Laem Chabang (gantries and a Thai wat), Ho Chi Minh City
 * (Bitexco, Landmark 81, the Saigon river), Hai Phong (karst towers), Hong Kong (IFC, ICC, the Peak, junk and Star Ferry),
 * Yantian (mountains and a terminal), Xiamen (Gulangyu villas, twin towers), Kaohsiung (85 Sky Tower, Pop Music Center),
 * Manila (cathedral dome, bayfront, jeepneys), Ningbo (cranes and bulk piles), Shanghai (Pearl Tower, Shanghai Tower, the Bund),
 * Busan (Gwangan Bridge, Busan Tower, Gamcheon).
 *
 * The phone sees only the lowest ~3-5 units above the far shoreline, so every landmark keeps its identity low and wide.
 */

// ───────────────────────────── helpers ─────────────────────────────

const TAU = Math.PI * 2;
const c3 = (hex: string): THREE.Color => new THREE.Color(hex);

/** A rectangle facing +z (front) at depth z. */
function fq(p: Part, x0: number, x1: number, y0: number, y1: number, z: number, c: Col): void {
  p.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c);
}

/** A tiny deterministic hash in 0..1. */
function hash(a: number, b: number, c = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The national flag stands on the breakwater out toward the free side, clear of the landmark (the pole is 2.5 high). */
function moleFlag(lm: Landmark, k: PortKit, dx = 4.8): void {
  // the flag flies toward +x: on the right of the picture the pole must stand further in or the cloth leaves the frame
  const d = k.mole.dir > 0 ? Math.min(dx, 3.6) : dx;
  lm.flag = { dx: k.mole.dir * d, z: MOLE_Z, y: k.mole.top + 0.03 };
}

/** Level a rectangle of ground (a terminal, a promontory, a platform) to `level`; `soft` is the width of the blend outside (`back`: behind it). */
function flat(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, level: number, soft = 0.8, back = soft): void {
  k.feature((x, z, h) => {
    const m = Math.min(1 - smooth(0, soft, Math.max(0, x0 - x, x - x1)), 1 - smooth(0, back, Math.max(0, zBack - z)), 1 - smooth(0, soft, Math.max(0, z - zFront)));
    return m <= 0 ? h : lerp(h, level, m);
  });
}

/** Sink a rectangle of ground below the sea (a bay, an inlet, a river); `soft` is the width of the sloping bank (`back`: of the far bank). */
function bay(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, depth = -0.7, soft = 0.7, back = soft): void {
  k.feature((x, z, h) => {
    const e = Math.min(smooth(0, soft, Math.min(x - x0, x1 - x)), smooth(0, back, z - zBack), smooth(0, soft, zFront - z));
    if (e <= 0) return h;
    return lerp(h, Math.min(h, depth), e);
  });
}

/** Houses for one town: the pipeline's buildTown with this port's own style and a built-in site filter. */
function town(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number; x0?: number; x1?: number } = {}): void {
  const xa = o.x0 ?? -k.width / 2 - 2;
  const xb = o.x1 ?? k.width / 2 + 2;
  buildTown(k, {
    x0: Math.min(xa, xb),
    x1: Math.max(xa, xb),
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

/** A faceted column built from rings (limestone karst, twisting towers, stacks): each ring is [height, radius] and may shift or turn. */
interface Ring {
  y: number;
  r: number;
  dx?: number;
  dz?: number;
  /** turn of the ring (radians) */
  rot?: number;
  /** stretch the ring along x / z */
  sx?: number;
  sz?: number;
}

function pillar(k: PortKit, x: number, y0: number, z: number, rings: Ring[], cols: Col | Col[], o: { seg?: number; jit?: number; seed?: number; cap?: Col | null; ao?: number; p?: Part } = {}): void {
  const p = o.p ?? k.solid;
  const seg = o.seg ?? 8;
  const jit = o.jit ?? 0;
  const seed = o.seed ?? 1;
  const P: V3[][] = rings.map((q, j) => {
    const row: V3[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (q.rot ?? 0) + (i / seg) * TAU;
      const rr = q.r * (1 + jit * (hash(i, j, seed) - 0.5) * 2);
      row.push([x + (q.dx ?? 0) + Math.cos(a) * rr * (q.sx ?? 1), y0 + q.y, z + (q.dz ?? 0) + Math.sin(a) * rr * (q.sz ?? 1)]);
    }
    return row;
  });
  const colAt = (j: number): Col => (Array.isArray(cols) ? cols[Math.min(j, cols.length - 1)] : cols);
  for (let j = 0; j < rings.length - 1; j++) {
    const t: number[] = [];
    const cx = x + ((rings[j].dx ?? 0) + (rings[j + 1].dx ?? 0)) / 2;
    const cz = z + ((rings[j].dz ?? 0) + (rings[j + 1].dz ?? 0)) / 2;
    for (let i = 0; i < seg; i++) {
      const A = P[j][i];
      const B = P[j][(i + 1) % seg];
      const C = P[j + 1][(i + 1) % seg];
      const D = P[j + 1][i];
      for (const tri of [[A, B, C], [A, C, D]] as V3[][]) {
        const [a, b, c] = tri;
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const mx = (a[0] + b[0] + c[0]) / 3 - cx;
        const mz = (a[2] + b[2] + c[2]) / 3 - cz;
        if (nx * mx + nz * mz >= 0) t.push(...a, ...b, ...c);
        else t.push(...a, ...c, ...b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3));
    g.computeVertexNormals();
    p.add(g, colAt(j), [0, 0, 0], 1, { ao: j === 0 ? (o.ao ?? 0.12) : 0 });
  }
  if (o.cap !== null) {
    const last = rings[rings.length - 1];
    const top = P[rings.length - 1];
    const c: V3 = [x + (last.dx ?? 0), y0 + last.y, z + (last.dz ?? 0)];
    const t: number[] = [];
    for (let i = 0; i < seg; i++) t.push(...c, ...top[(i + 1) % seg], ...top[i]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3));
    g.computeVertexNormals();
    p.add(g, o.cap ?? colAt(rings.length - 2), [0, 0, 0], 1, { ao: 0 });
  }
}

/** A cheap coconut palm (about 45 triangles): two trunk segments and six drooping fronds. */
function coco(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  const lean = rng.range(-0.08, 0.08) * s;
  const hgt = rng.range(0.52, 0.7) * s;
  const mx = x + lean * 0.35;
  const my = y + hgt * 0.55;
  const tx = x + lean;
  const ty = y + hgt;
  p.rod([x, y, z], [mx, my, z], 0.017 * s, '#9b8466', 5);
  p.rod([mx, my, z], [tx, ty, z], 0.012 * s, '#8d7759', 5);
  const fr = ['#4d8a3e', '#5a9a46', '#3f7a38'];
  const a0 = rng.next() * TAU;
  for (let i = 0; i < 6; i++) {
    const a = a0 + (i * TAU) / 6;
    const L = 0.21 * s;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const mid: V3 = [tx + dx * L * 0.55, ty + 0.05 * s, z + dz * L * 0.55];
    const tip: V3 = [tx + dx * L, ty - 0.08 * s, z + dz * L];
    const nxp = -dz * 0.05 * s;
    const nzp = dx * 0.05 * s;
    const l: V3 = [mid[0] + nxp, mid[1], mid[2] + nzp];
    const r: V3 = [mid[0] - nxp, mid[1], mid[2] - nzp];
    p.tri([tx, ty, z], l, r, fr[i % 3], true);
    p.tri(l, tip, r, fr[(i + 1) % 3], true);
  }
}

/** Palms in loose groups over the dry ground of a rectangle, clear of buildings. */
function groves(k: PortKit, rng: Rng, n: number, x0: number, x1: number, z0: number, z1: number, o: { size?: [number, number]; minY?: number; maxY?: number; pad?: number } = {}): void {
  const sz = o.size ?? [1.0, 1.6];
  let placed = 0;
  for (let guard = 0; placed < n && guard < n * 25; guard++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    const y = k.ground(x, z);
    if (y < (o.minY ?? 0.3) || y > (o.maxY ?? 4) || k.isReserved(x, z, o.pad ?? 0.1)) continue;
    // loose clumps: favour places where a hash is high
    if (hash(Math.floor(x * 1.7), Math.floor(z * 1.7), k.seed % 91) < 0.35 && rng.chance(0.5)) continue;
    coco(k, x, z, rng.range(sz[0], sz[1]), rng, y - 0.03);
    k.reserve(x, z, 0.07, 0.07);
    placed++;
  }
}

/** Two-tone limestone / jungle green on the ground, recoloured by height (jungle hills, karst-green slopes). */
function jungle(k: PortKit, col: string, from = 0.7, to = 2.2, z0 = -14): void {
  const g = c3(col);
  k.paint((x, y, z, slope, c) => {
    if (z < z0) c.lerp(g, 0.7 * smooth(from, to, y) * (1 - smooth(0.4, 0.7, slope) * 0.5));
  });
}

// ───────────────────────────── boxes, cranes, ships ─────────────────────────────

const BOX_COLS: Col[] = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5', '#a8322c', '#356aa8'];

/** Rows of stacked containers: each run of same-coloured boxes is one box per tier. Rows run along x, the first at `zFront`, then back. */
function stacks(k: PortKit, x0: number, x1: number, zFront: number, rows: number, rng: Rng, o: { tiers?: number; pal?: Col[]; y?: number; aisle?: number; skip?: (x: number, z: number) => boolean } = {}): void {
  const p = k.solid;
  const y = o.y ?? LAND_Y;
  const pal = o.pal ?? BOX_COLS;
  const tiers = o.tiers ?? 4;
  let z = zFront;
  for (let r = 0; r < rows; r++) {
    let x = x0 + rng.range(0, 0.2);
    while (x < x1) {
      const n = rng.int(2, 7);
      const len = n * 0.21;
      if (x + len > x1 + 0.2) break;
      const c = pick(rng, pal);
      const t = rng.int(1, tiers);
      const px = x + len / 2;
      if (!o.skip || !o.skip(px, z)) {
        for (let h = 0; h < t; h++) p.boxV(px, y + h * 0.105, z, len, 0.1, 0.105, tint(c, ((h * 7 + r * 3) % 3) * 0.035 - 0.03), { ao: 0.18 });
      }
      x += len + (rng.chance(0.18) ? 0.22 : 0.012);
    }
    z -= 0.125 + (r % 3 === 2 ? 0.16 : 0);
  }
  k.reserve((x0 + x1) / 2, zFront - (rows * 0.15) / 2, (x1 - x0) / 2, (rows * 0.15) / 2 + 0.1);
}

/** A row of ship-to-shore cranes along a quay, evenly spaced; `z` is the centre of the portal. */
function gantries(k: PortKit, x0: number, x1: number, z: number, n: number, color: Col, o: { s?: number; boom?: number; y?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : lerp(x0, x1, i / (n - 1));
    gantryCrane(k, x, z, { color, s: o.s ?? 1, boom: o.boom, y: o.y });
  }
}

type ShipKind = 'tanker' | 'bulker' | 'container' | 'ferry';

/** A convex slab (hull section) from a plan outline, a bottom outline, and two heights. */
function hullSolid(p: Part, plan: Array<[number, number]>, y0: number, y1: number, taper: number, color: Col, zc = 0): void {
  const n = plan.length;
  const verts: V3[] = [];
  for (const [x, z] of plan) verts.push([x, y1, z]);
  for (const [x, z] of plan) verts.push([x, y0, zc + (z - zc) * taper]);
  const faces: number[][] = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + i)];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
  p.solid(verts, faces, color, { ao: 0.08 });
}

/**
 * A ship afloat at (x, z): `len` long, bow to +x before turning by `ry`. Hull below the waterline, so it sits in the water.
 * Tankers and bulkers carry their house aft; container ships stack coloured boxes.
 */
function ship(k: PortKit, x: number, z: number, len: number, kind: ShipKind, ry: number, o: { hull?: Col; boot?: Col; house?: Col; deck?: Col; stripe?: Col; rng?: Rng; cargo?: Col[] } = {}): void {
  const p = k.solid;
  const rng = o.rng ?? new Rng(Math.floor(x * 977 + z * 313) + 17);
  const hull = o.hull ?? pick(rng, ['#1f2e4d', '#2b2f36', '#8a2f2a', '#2d4a3c', '#3b3f46']);
  const beam = kind === 'tanker' ? 0.62 : kind === 'bulker' ? 0.56 : kind === 'ferry' ? 0.5 : 0.6;
  const L = 4;
  k.at(x, 0, z, ry, len / L, () => {
    const hl = L / 2;
    const hb = beam / 2;
    const bow = 0.55;
    const plan: Array<[number, number]> = [[-hl, -hb * 0.86], [-hl, hb * 0.86], [hl - bow, hb], [hl, hb * 0.16], [hl, -hb * 0.16], [hl - bow, -hb]];
    hullSolid(p, plan, -0.34, 0.0, 0.78, o.boot ?? '#7f2d29');
    hullSolid(p, plan, 0.0, 0.26, 1, hull);
    p.box(0, 0.256, 0, L * 0.97, 0.014, beam * 0.97, o.deck ?? '#6b5b4a', { ao: 0 });
    const white = o.house ?? '#f1ede3';
    switch (kind) {
      case 'tanker': {
        // aft house of four decks, funnel, bridge wings, deck pipes and a midship manifold
        p.box(-1.55, 0.26, 0, 0.5, 0.7, beam * 0.86, white);
        p.box(-1.55, 0.96, 0, 0.42, 0.1, beam * 0.9, tint(white, -0.08));
        p.box(-1.62, 1.06, 0, 0.16, 0.2, 0.16, o.stripe ?? '#c8302a');
        p.box(-1.46, 0.96, 0, 0.1, 0.1, beam * 1.05, white);
        for (let i = 0; i < 4; i++) fq(p, -1.78, -1.34, 0.36 + i * 0.15, 0.42 + i * 0.15, beam * 0.43 + 0.004, '#2a3a4c');
        p.rod([-1.1, 0.34, 0.0], [1.5, 0.34, 0.0], 0.02, '#8a8f94', 4);
        p.box(0.1, 0.27, 0, 0.14, 0.09, beam * 0.9, '#8a8f94');
        for (let i = 0; i < 5; i++) p.box(-0.7 + i * 0.55, 0.27, 0, 0.05, 0.07, beam * 0.7, '#a7a198', { ao: 0 });
        p.cyl(1.55, 0.26, 0, 0.012, 0.012, 0.22, '#d9d4c7', { seg: 4 });
        break;
      }
      case 'bulker': {
        p.box(-1.5, 0.26, 0, 0.5, 0.66, beam * 0.84, white);
        p.box(-1.5, 0.92, 0, 0.44, 0.08, beam * 0.88, tint(white, -0.08));
        p.box(-1.62, 1.0, 0, 0.14, 0.18, 0.14, o.stripe ?? '#e9a31a');
        for (let i = 0; i < 3; i++) fq(p, -1.72, -1.3, 0.36 + i * 0.15, 0.42 + i * 0.15, beam * 0.42 + 0.004, '#2a3a4c');
        for (let i = 0; i < 5; i++) {
          p.box(-0.82 + i * 0.52, 0.27, 0, 0.38, 0.09, beam * 0.74, '#9a9288', { ao: 0.1 });
          p.box(-0.82 + i * 0.52, 0.36, 0, 0.34, 0.02, beam * 0.7, '#c6bfae', { ao: 0 });
        }
        for (const cx of [-0.55, 0.5]) {
          p.box(cx, 0.26, 0, 0.07, 0.34, 0.07, '#e9a31a');
          p.rod([cx, 0.6, 0], [cx + 0.34, 0.74, 0], 0.014, '#c9c5ba', 4);
        }
        break;
      }
      case 'container': {
        p.box(-0.35, 0.26, 0, 0.34, 0.62, beam * 0.8, white);
        p.box(-0.35, 0.88, 0, 0.36, 0.07, beam * 0.86, tint(white, -0.08));
        p.box(-0.5, 0.95, 0, 0.12, 0.16, 0.12, o.stripe ?? '#2c5da8');
        for (let i = 0; i < 3; i++) fq(p, -0.5, -0.2, 0.36 + i * 0.16, 0.43 + i * 0.16, beam * 0.4 + 0.004, '#2a3a4c');
        const pal = o.cargo ?? BOX_COLS;
        // two blocks of stacked boxes, fore and aft of the house
        for (const [a, b] of [[-1.92, -0.58], [-0.12, 1.5]] as Array<[number, number]>) {
          let bx = a;
          while (bx < b - 0.1) {
            const n = rng.int(2, 4);
            const bl = Math.min(n * 0.21, b - bx);
            const c = pick(rng, pal);
            const t = rng.int(2, 4);
            for (let h = 0; h < t; h++) p.boxV(bx + bl / 2, 0.26 + h * 0.11, 0, bl, 0.105, beam * 0.92, tint(c, ((h + n) % 3) * 0.04 - 0.04), { ao: 0.1 });
            bx += bl + 0.012;
          }
        }
        break;
      }
      case 'ferry': {
        p.box(0, 0.26, 0, 3.0, 0.3, beam * 0.9, '#f4f0e6');
        p.box(0.1, 0.56, 0, 2.5, 0.26, beam * 0.8, '#f4f0e6');
        p.box(0.3, 0.82, 0, 1.2, 0.2, beam * 0.7, '#e9e6dd');
        p.cyl(-0.5, 0.82, 0, 0.1, 0.1, 0.3, o.stripe ?? '#c8302a', { seg: 8 });
        for (let i = 0; i < 9; i++) fq(p, -1.2 + i * 0.28, -1.0 + i * 0.28, 0.34, 0.46, beam * 0.45 + 0.004, '#2a3a4c');
        break;
      }
    }
    // mast and bow light
    p.cyl(0.9, 0.26, 0, 0.012, 0.01, 0.4, '#8a8f94', { seg: 4 });
  });
}

// ───────────────────────────── towers ─────────────────────────────

interface TowerStyle {
  wall: Col;
  win: Col;
  /** share of window ribbons lit at night */
  lit?: number;
  /** floors drawn as ribbons (default from the height) */
  floors?: number;
  /** split each ribbon into this many window cells */
  cols?: number;
  /** a crown on top */
  crown?: 'none' | 'flat' | 'step' | 'spire' | 'pyr' | 'dome';
  crownCol?: Col;
  /** reflective glass walls */
  glass?: boolean;
  y?: number;
}

/**
 * A tower with ribbon windows on the two visible faces: a box, a band of dark glass per floor pair (some lit at night),
 * and an optional crown. Returns the y of its top. Cheap enough for a whole skyline (about 70 triangles).
 */
function skyTower(k: PortKit, x: number, z: number, w: number, d: number, h: number, st: TowerStyle): number {
  const y = st.y ?? k.groundMax(x, z, w / 2, d / 2);
  const sink = st.y !== undefined ? 0.2 : Math.max(0.15, y - k.groundMin(x, z, w / 2, d / 2) + 0.1);
  const p = st.glass ? k.glass : k.solid;
  p.boxV(x, y - sink, z, w, h + sink, d, st.wall);
  const rows = st.floors ?? Math.max(3, Math.round(h / 0.17));
  const cols = st.cols ?? 1;
  const rh = (h * 0.93) / rows;
  const lit = st.lit ?? 0.35;
  const zf = z + d / 2 + 0.004;
  const xf = x + w / 2 + 0.004;
  for (let r = 0; r < rows; r++) {
    const y0 = y + h * 0.04 + r * rh + rh * 0.22;
    const y1 = y0 + rh * 0.52;
    const tgt = hash(Math.round(x * 100), r, Math.round(z * 10)) < lit ? k.lit : k.solid;
    for (let c = 0; c < cols; c++) {
      const sw = (w * 0.86) / cols;
      const a = x - w * 0.43 + c * sw + (cols > 1 ? sw * 0.12 : 0);
      const b = a + sw * (cols > 1 ? 0.76 : 1);
      tgt.quad([a, y0, zf], [b, y0, zf], [b, y1, zf], [a, y1, zf], st.win);
    }
    const tgt2 = hash(Math.round(z * 100), r, Math.round(x * 10)) < lit ? k.lit : k.solid;
    const dc = Math.max(1, Math.round(cols * (d / w)));
    for (let c = 0; c < dc; c++) {
      const sd = (d * 0.86) / dc;
      const zn = z + d * 0.43 - c * sd - (dc > 1 ? sd * 0.12 : 0);
      const zfar = zn - sd * (dc > 1 ? 0.76 : 1);
      tgt2.quad([xf, y0, zn], [xf, y0, zfar], [xf, y1, zfar], [xf, y1, zn], st.win);
    }
  }
  const top = y + h;
  const cc = st.crownCol ?? tint(st.wall as Col, -0.12);
  switch (st.crown ?? 'flat') {
    case 'flat':
      k.solid.box(x, top, z, w + 0.02, 0.025, d + 0.02, cc, { ao: 0 });
      break;
    case 'step':
      k.solid.box(x, top, z, w + 0.02, 0.02, d + 0.02, cc, { ao: 0 });
      k.solid.boxV(x, top + 0.02, z, w * 0.62, h * 0.07, d * 0.62, st.wall, { ao: 0 });
      k.solid.cyl(x, top + 0.02 + h * 0.07, z, 0.005, 0.005, h * 0.12, '#cfd3d6', { seg: 4, ao: 0 });
      break;
    case 'spire':
      k.solid.box(x, top, z, w + 0.02, 0.02, d + 0.02, cc, { ao: 0 });
      k.solid.cone(x, top + 0.02, z, Math.min(w, d) * 0.34, h * 0.22, cc, { seg: 4, ao: 0 });
      break;
    case 'pyr':
      k.solid.pyramid(x, top, z, w + 0.02, h * 0.12, d + 0.02, cc, { ao: 0 });
      break;
    case 'dome':
      k.solid.ball(x, top, z, Math.min(w, d) * 0.5, cc, { sy: 0.55, ao: 0 });
      break;
    default:
      break;
  }
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
  return top;
}

/** Palettes for the towers of a city. */
const WHITE_TOWERS: Array<[Col, Col]> = [['#eceae2', '#46607a'], ['#dfe3e4', '#3f566b'], ['#f3efe6', '#5a7186'], ['#d8dcdc', '#4a6076'], ['#e9e3d4', '#52687c']];
const GLASS_TOWERS: Array<[Col, Col]> = [['#5f7c93', '#cfe3ee'], ['#4a647a', '#9db9ca'], ['#70889a', '#d6e6ee'], ['#3f566b', '#8fb0c4'], ['#8aa0ad', '#e2eef3']];

/** A skyline: towers on a jittered grid, taller toward the back and toward the middle. */
function skyline(k: PortKit, rng: Rng, o: { x0: number; x1: number; zFront: number; rows: number; hMin: number; hMax: number; pal?: Array<[Col, Col]>; cx?: number; peak?: number; density?: number; step?: number; wMin?: number; wMax?: number; crowns?: TowerStyle['crown'][] }): void {
  const pal = o.pal ?? WHITE_TOWERS;
  o = { ...o, x0: Math.min(o.x0, o.x1), x1: Math.max(o.x0, o.x1) };
  const cx = o.cx ?? (o.x0 + o.x1) / 2;
  const step = o.step ?? 0.62;
  for (let r = 0; r < o.rows; r++) {
    const z = o.zFront - r * step - rng.range(0, 0.15);
    let x = o.x0 + rng.range(0, 0.3);
    while (x < o.x1) {
      const w = rng.range(o.wMin ?? 0.38, o.wMax ?? 0.62);
      const d = rng.range(0.34, 0.5);
      x += w / 2;
      if (rng.chance(o.density ?? 0.9)) {
        const mid = 1 - clamp(Math.abs(x - cx) / ((o.x1 - o.x0) / 2), 0, 1);
        const h = lerp(o.hMin, o.hMax, clamp(rng.next() * 0.65 + mid * (o.peak ?? 0.35) + r * 0.04, 0, 1));
        const [wall, win] = pick(rng, pal);
        const crown = o.crowns ? pick(rng, o.crowns) : rng.chance(0.25) ? 'step' : 'flat';
        if (!k.isReserved(x, z, w / 2) && k.groundMin(x, z, w / 2, d / 2) > 0.22) skyTower(k, x, z, w, d, h, { wall, win, crown, glass: false, lit: 0.4 });
      }
      x += w / 2 + rng.range(0.02, 0.1);
    }
  }
}

// ───────────────────────────── regions ─────────────────────────────

const TERRA = ['#b8553d', '#c4673f', '#a64b36', '#c97b4a'];

/** Colonial Sri Lanka: whites and ochres under red tiles, verandas, palms. */
const colonial: HouseStyle = {
  walls: ['#f6f1e4', '#efe2bd', '#e9d29a', '#f1d9c0', '#f4e9d0', '#d8c9a0', '#e8c78a', '#f1ece0'],
  roofs: [...TERRA, '#9c4a35'],
  trim: '#f6f3ea',
  win: '#4a5f50',
  floors: [1, 3],
  floorH: 0.2,
  w: [0.4, 0.62],
  d: [0.34, 0.48],
  roofKinds: [['hip', 5], ['gable', 3], ['flat', 1]],
  pitch: 0.5,
  chimney: 0,
  gap: [0.0, 0.08],
  door: '#5a6f60',
  shutters: '#4f7a5a',
};

/** South-East Asian shophouses: narrow, pastel, tiled, a few storeys. */
const shophouse: HouseStyle = {
  walls: ['#f1e7cf', '#e9d29a', '#eab9a0', '#bcd7d4', '#f4efe4', '#e5c07b', '#c9dbb8', '#e8a08a', '#d9cfe8'],
  roofs: ['#b4553a', '#c4673f', '#a64b36', '#8a4a38', '#c97b4a'],
  trim: '#f6f3ea',
  win: '#3d5a6a',
  floors: [2, 4],
  floorH: 0.19,
  w: [0.3, 0.46],
  d: [0.34, 0.46],
  roofKinds: [['hip', 3], ['gable', 3], ['flat', 3]],
  pitch: 0.45,
  chimney: 0,
  gap: [0.0, 0.04],
  door: '#5a6f60',
  winW: 0.05,
  winH: 0.08,
};

/** East Asian waterfront blocks: dense mid-rise apartments and offices under flat roofs. */
const blocks: HouseStyle = {
  walls: ['#e8e4da', '#d5d8d6', '#c9d3d8', '#efe6d3', '#bfc9cf', '#e0d6c4', '#cdd7c9', '#f2efe8'],
  roofs: ['#6b7a82', '#7c8890', '#5f6f78'],
  trim: '#dfe2e4',
  win: '#3b536a',
  floors: [3, 8],
  floorH: 0.17,
  w: [0.3, 0.46],
  d: [0.32, 0.44],
  roofKinds: [['flat', 8], ['hip', 1]],
  pitch: 0.35,
  chimney: 0,
  gap: [0.0, 0.03],
  door: '#4a5a6a',
  winW: 0.04,
  winH: 0.07,
};

const pal = (p: Partial<Region['palette']>): Region['palette'] => ({ land: '#a9b97a', land2: '#9fb36f', hill: '#8fa879', rock: '#9a9488', sand: '#dccfa8', haze: '#cfe3ec', ...p });

/** A white dagoba (stupa): bell, square harmika, and a gilded spire. */
function dagoba(k: PortKit, x: number, z: number, s: number, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  p.cyl(x, y, z, 0.42 * s, 0.4 * s, 0.1 * s, '#d8d0bc', { seg: 14 });
  p.lathe(x, y + 0.1 * s, z, [[0.33 * s, 0], [0.34 * s, 0.1 * s], [0.3 * s, 0.26 * s], [0.18 * s, 0.38 * s], [0.07 * s, 0.43 * s], [0.0, 0.44 * s]], '#f6f3ea', { seg: 14 });
  p.box(x, y + 0.53 * s, z, 0.1 * s, 0.07 * s, 0.1 * s, '#f1ece0');
  p.cone(x, y + 0.6 * s, z, 0.045 * s, 0.4 * s, '#e0b83a', { seg: 8 });
  k.reserve(x, z, 0.45 * s, 0.45 * s);
}

export const REGIONS: Partial<Record<RegionId, Region>> = {
  southasia: {
    ...BASE.generic,
    id: 'southasia',
    houses: colonial,
    palette: pal({ land: '#7fa85a', land2: '#74a053', hill: '#4f8a4a', rock: '#8a8576', sand: '#ead9ac', haze: '#d6e8e4' }),
    shape: { relief: 1.4, range: 3.2, rise: 4, rough: 0.35, freq: 0.09 },
    shore: 'beach',
    rows: 4,
    rowStep: 0.58,
    gaps: 0.08,
    trees: [
      { kinds: ['round', 'round', 'bush'], count: 50, where: 'all', size: [0.9, 1.4], maxY: 3.5 },
    ],
    armour: 'rocks',
    lights: [0, 1, 4],
    boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#e9a31a', '#c8302a', '#2c8aa5', '#3f8d6b', '#f6f3ea'] },
    extras: (k, rng) => {
      groves(k, rng, 26, -k.width / 2 + 2, k.width / 2 - 2, SHORE_Z - 1.4, SHORE_Z - 8);
      dagoba(k, k.vx(-15) + rng.range(-5, 5), -15.6, 1.2);
    },
  },
  seasia: {
    ...BASE.generic,
    id: 'seasia',
    houses: shophouse,
    palette: pal({ land: '#76a455', land2: '#6c9c4e', hill: '#3f7f45', rock: '#8a8a78', sand: '#e6d7a8', haze: '#d3e7e1' }),
    shape: { relief: 1.5, range: 4.2, rise: 3.6, rough: 0.5, freq: 0.1 },
    shore: 'quay',
    rows: 4,
    rowStep: 0.58,
    gaps: 0.07,
    trees: [
      { kinds: ['round', 'round', 'bush'], count: 54, where: 'all', size: [0.9, 1.5], maxY: 4 },
    ],
    armour: 'tetrapods',
    lights: [0, 1, 4],
    boats: { kinds: ['fishing', 'sail'], n: 4, colors: ['#c8302a', '#e9a31a', '#2c8aa5', '#3f8d6b'] },
    extras: (k, rng) => {
      groves(k, rng, 24, -k.width / 2 + 2, k.width / 2 - 2, SHORE_Z - 1.4, SHORE_Z - 8);
    },
  },
  eastasia: {
    ...BASE.generic,
    id: 'eastasia',
    houses: blocks,
    palette: pal({ land: '#7fa066', land2: '#729a5e', hill: '#4a8350', rock: '#8a9088', sand: '#d9cfae', haze: '#d6e3e8' }),
    shape: { relief: 2.4, range: 7, rise: 3.2, rough: 0.7, freq: 0.1 },
    shore: 'quay',
    rows: 4,
    rowStep: 0.6,
    gaps: 0.05,
    rowRise: 0.4,
    trees: [
      { kinds: ['round', 'bush', 'pine'], count: 60, where: 'hills', size: [0.9, 1.5], maxY: 5 },
      { kinds: ['round', 'bush'], count: 20, where: 'plain' },
    ],
    armour: 'tetrapods',
    lights: [0, 1, 4],
    boats: { kinds: ['fishing'], n: 3, colors: ['#c8302a', '#2c5da8', '#e9a31a'] },
    extras: (k, rng) => {
      skyline(k, rng, { x0: k.vx(-15) - 8, x1: k.vx(-15) + 8, zFront: -14.6, rows: 2, hMin: 1.0, hMax: 2.2, step: 0.6 });
    },
  },
};

// ───────────────────────────── Singapore ─────────────────────────────

/** A mirrored x offset: `s` is the side of the free ground (the mole runs that way). */
type Side = 1 | -1;

/** Wash a steep bank next to water back to sand (a bay cut into green ground would otherwise show bare rock). */
function bankPaint(k: PortKit, col: string, top = 0.55): void {
  const sand = c3(col);
  k.paint((x, y, z, slope, c) => {
    if (z > -26 && y < top) c.lerp(sand, 0.85 * smooth(top, 0.05, y));
  });
}

/**
 * Marina Bay Sands: three leaning towers in sand and blue glass, and the ship-shaped SkyPark laid across their tops, its bow
 * overhanging one end. Squat on purpose: the three towers and the deck must read in the lowest two or three units.
 */
function marinaBaySands(k: PortKit, x: number, z: number, s: Side, o: { H?: number; sp?: number; w?: number; d0?: number; d1?: number } = {}): void {
  const p = k.solid;
  const gy = k.groundMax(x, z, 3, 0.6);
  const w = o.w ?? 0.8;
  const d0 = o.d0 ?? 0.7;
  const d1 = o.d1 ?? 0.4;
  const H = o.H ?? 2.0;
  const sp = o.sp ?? 1.5;
  const body = '#dccfb2';
  const rows = 14;
  for (let i = -1; i <= 1; i++) {
    const tx = x + i * sp;
    const hw0 = w / 2;
    const hw1 = w * 0.46;
    const y1 = gy + H;
    const v: V3[] = [
      [tx - hw0, gy, z + d0 / 2], [tx + hw0, gy, z + d0 / 2], [tx + hw0, gy, z - d0 / 2], [tx - hw0, gy, z - d0 / 2],
      [tx - hw1, y1, z + d1 / 2], [tx + hw1, y1, z + d1 / 2], [tx + hw1, y1, z - d1 / 2], [tx - hw1, y1, z - d1 / 2],
    ];
    p.box(tx, gy - 0.3, z, w, 0.3, d0, '#cdbf9f');
    p.solid(v, [[0, 1, 5, 4], [1, 2, 6, 5], [3, 2, 6, 7], [0, 3, 7, 4], [4, 5, 6, 7]], body, { ao: 0.1 });
    // ribbons of blue glass following the slope of the front and the right face
    for (let r = 0; r < rows; r++) {
      const t0 = 0.03 + (r / rows) * 0.94;
      const t1 = t0 + (0.94 / rows) * 0.58;
      const f = (t: number) => lerp(d0 / 2, d1 / 2, t) + 0.006;
      const xw = (t: number) => lerp(hw0, hw1, t);
      const tgt = hash(i + 5, r, 3) < 0.35 ? k.lit : p;
      tgt.quad([tx - xw(t0) * 0.9, gy + H * t0, z + f(t0)], [tx + xw(t0) * 0.9, gy + H * t0, z + f(t0)], [tx + xw(t1) * 0.9, gy + H * t1, z + f(t1)], [tx - xw(t1) * 0.9, gy + H * t1, z + f(t1)], '#46688a');
      const tg2 = hash(i + 9, r, 5) < 0.35 ? k.lit : p;
      tg2.quad([tx + xw(t0) + 0.006, gy + H * t0, z + f(t0) * 0.9], [tx + xw(t0) + 0.006, gy + H * t0, z - f(t0) * 0.9], [tx + xw(t1) + 0.006, gy + H * t1, z - f(t1) * 0.9], [tx + xw(t1) + 0.006, gy + H * t1, z + f(t1) * 0.9], '#46688a');
    }
  }
  // the SkyPark: a hull of white concrete with a belly, its bow thinning out over the end
  const yb = gy + H - 0.03;
  const mx = (dx: number): number => x + s * dx;
  const hz = 0.27;
  const plan: Array<[number, number]> = [
    [-2.35, -hz], [-2.35, hz], [2.3, hz], [3.3, 0.09], [3.3, -0.09], [2.3, -hz],
  ].map(([a, b]) => [mx(a), z + b] as [number, number]);
  hullSolid(p, plan, yb - 0.1, yb + 0.2, 0.55, '#efebe0', z);
  p.box(mx(0.45), yb + 0.198, z, 5.1, 0.016, hz * 1.9, '#cfd8cb', { ao: 0 });
  // the infinity pool along the front edge, planters, and a pavilion at each end
  p.box(mx(0.7), yb + 0.212, z + 0.14, 3.0, 0.012, 0.09, '#5bc8dd', { ao: 0 });
  for (let i = 0; i < 13; i++) p.blob(mx(-2.0 + i * 0.4), yb + 0.24, z - 0.12 + (i % 2) * 0.06, 0.06, i % 3 ? '#4f8a45' : '#5f9a4c', { sy: 0.8 });
  for (const [dx, ww] of [[-2.0, 0.42], [2.5, 0.3]] as Array<[number, number]>) p.box(mx(dx), yb + 0.2, z, ww, 0.1, 0.3, '#f4f1ea');
  // a low glazed podium at the foot of the towers
  k.glass.box(x, gy, z + d0 / 2 + 0.2, 4.6, 0.3, 0.4, '#6f9cb8');
  p.box(x, gy + 0.3, z + d0 / 2 + 0.2, 4.7, 0.025, 0.44, '#eceae2', { ao: 0 });
  k.reserve(x, z + 0.25, 2.9, 0.9);
}

/** The ArtScience Museum: a lotus of white fingers fanning up from a round base. */
function artScience(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = k.ground(x, z) - 0.02;
  p.cyl(x, y, z, 0.3 * sc, 0.28 * sc, 0.2 * sc, '#ebe8df', { seg: 10 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const tx = Math.cos(a);
    const tz = Math.sin(a);
    const th = 0.5;
    p.cone(x + tx * 0.16 * sc, y + 0.18 * sc, z + tz * 0.16 * sc, 0.1 * sc, (0.6 + (i % 2) * 0.12) * sc, i % 2 ? '#f7f5ee' : '#e6e3da', { seg: 5, rx: th * tz, rz: -th * tx });
  }
  k.reserve(x, z, 0.5 * sc, 0.5 * sc);
}

/** The Merlion: a white lion's head on a fish's body, spouting a jet, on a pier plinth. */
function merlion(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = LAND_Y;
  p.box(x, -0.9, z, 1.0 * sc, 0.9 + y, 0.7 * sc, '#cfcac0');
  p.box(x, y, z, 1.04 * sc, 0.04, 0.74 * sc, '#e4dfd2', { ao: 0 });
  p.rock(x, y + 0.03, z, 0.3 * sc, '#bdb8ac', { sy: 0.8 });
  const w = '#eeece4';
  const g = '#d9d6cc';
  // the fish body swells up from the rock; the tail curls behind it
  p.lathe(x, y + 0.14 * sc, z, [[0.0, 0], [0.15 * sc, 0.02 * sc], [0.19 * sc, 0.2 * sc], [0.16 * sc, 0.44 * sc], [0.11 * sc, 0.6 * sc], [0.0, 0.64 * sc]], w, { seg: 10 });
  p.rod([x - 0.08 * sc, y + 0.26 * sc, z - 0.08 * sc], [x - 0.3 * sc, y + 0.38 * sc, z - 0.1 * sc], 0.07 * sc, w, 6);
  p.rod([x - 0.3 * sc, y + 0.38 * sc, z - 0.1 * sc], [x - 0.28 * sc, y + 0.74 * sc, z - 0.1 * sc], 0.05 * sc, w, 6);
  p.tri([x - 0.28 * sc, y + 0.74 * sc, z - 0.1 * sc], [x - 0.4 * sc, y + 0.9 * sc, z - 0.1 * sc], [x - 0.17 * sc, y + 0.88 * sc, z - 0.1 * sc], g, true);
  // scales as a pale band on the belly
  p.lathe(x, y + 0.2 * sc, z, [[0.0, 0], [0.2 * sc, 0.0], [0.205 * sc, 0.05 * sc], [0.0, 0.05 * sc]], g, { seg: 10 });
  // the lion's head: a ruff of mane around a pale face with a snout and ears
  const hy = y + 0.8 * sc;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.blob(x + Math.cos(a) * 0.17 * sc, hy + Math.sin(a) * 0.17 * sc, z - 0.04 * sc, 0.075 * sc, g);
  }
  p.ball(x, hy, z, 0.17 * sc, g, { sz: 0.8 });
  p.ball(x, hy - 0.01 * sc, z + 0.06 * sc, 0.13 * sc, w);
  p.box(x, hy - 0.07 * sc, z + 0.17 * sc, 0.1 * sc, 0.07 * sc, 0.11 * sc, w);
  p.box(x, hy - 0.1 * sc, z + 0.225 * sc, 0.06 * sc, 0.02 * sc, 0.01, '#4a4d52', { ao: 0 });
  p.ball(x - 0.07 * sc, hy + 0.07 * sc, z + 0.16 * sc, 0.02 * sc, '#2f3338');
  p.ball(x + 0.07 * sc, hy + 0.07 * sc, z + 0.16 * sc, 0.02 * sc, '#2f3338');
  // the jet from its mouth arcs down into the bay
  let px = x;
  let py = hy - 0.1 * sc;
  let pz = z + 0.2 * sc;
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    const nz = z + (0.2 + t * 0.66) * sc;
    const ny = y + (0.7 + 0.09 * Math.sin(t * Math.PI) - t * 0.68) * sc;
    p.rod([px, py, pz], [x, ny, nz], 0.02 * sc, '#bfe8f6', 4);
    px = x;
    py = ny;
    pz = nz;
  }
  k.reserve(x, z, 0.6 * sc, 0.5 * sc);
}

const sgTowers: Array<[Col, Col]> = [['#d9dedf', '#456079'], ['#6f8aa0', '#d6e6ee'], ['#e6e0d0', '#4e6b83'], ['#4f6b82', '#a9c4d4'], ['#f0ece2', '#56728a']];

const singapore: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7cab59', land2: '#72a354', hill: '#4a8a48', rock: '#8d9086', sand: '#dccfaa', haze: '#d4e8e6' };
    k.shape = { relief: 0.8, range: 2.8, rise: 5.0, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    // the anchorage: the sea runs far back on the free side of the town
    const x0 = k.vx(-14) + s * 1.7;
    const [a, b] = s > 0 ? [x0, x0 + 80] : [x0 - 80, x0];
    bay(k, a, b, -23, -11.4, -0.6, 1.5, 4.5);
    flat(k, s > 0 ? k.vx(-13) - 28 : k.vx(-13) - 1.5, s > 0 ? k.vx(-13) + 1.5 : k.vx(-13) + 28, -16.5, -11.9, LAND_Y, 0.8, 5);
    bankPaint(k, '#d9cfa9');
  },
  build(k) {
    moleFlag(singapore, k, 3.5);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x51d6);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // Marina Bay Sands left of centre with its bow toward the bay; the museum by the water in front of the bow
    marinaBaySands(k, X(-2.3, -13.3), -13.3, s, { H: 2.1, sp: 1.58, w: 0.86 });
    artScience(k, X(0.8, -12.7), -12.7, 0.9);
    // the Merlion on her pier at the other end
    merlion(k, X(-5.3, -11.55), -11.55, 1.3);
    // the central business district: glass and white towers behind the Merlion
    skyline(k, rng, { x0: X(-14, -16), x1: X(-5.2, -16), zFront: -14.6, rows: 3, hMin: 1.5, hMax: 3.4, pal: sgTowers, cx: X(-7.5, -16), peak: 0.5, step: 0.7 });
    // shophouses along the quay
    town(k, shophouse, 2, SHORE_Z - 1.2, { rowStep: 0.55, gaps: 0.1, x0: X(-14, -13), x1: X(-5.0, -13) });
    // the bunker anchorage: tankers, bulkers and container ships swung to the tide, bunker barges alongside
    const placed: Array<[number, number, number]> = [];
    const hulls: Col[] = ['#1f2e4d', '#2b2f36', '#8a2f2a', '#2d4a3c', '#3b3f46', '#4a5a6e', '#6b2d2a', '#5a4a6a'];
    const kinds: ShipKind[] = ['tanker', 'bulker', 'container', 'tanker', 'bulker', 'tanker'];
    const anchor = (n: number, dx0: number, dx1: number, z0: number, z1: number, lenLo: number, lenHi: number): void => {
      for (let i = 0, got = 0; got < n && i < 400; i++) {
        const dx = rng.range(dx0, dx1);
        const zz = rng.range(z0, z1);
        const len = rng.range(lenLo, lenHi);
        const x = X(dx, zz);
        if (placed.some(([px, pz, pl]) => Math.abs(px - x) < (pl + len) * 0.3 + 0.25 && Math.abs(pz - zz) < 0.82)) continue;
        const yaw = (rng.chance(0.55) ? 0.12 : Math.PI + 0.1) + rng.range(-0.22, 0.22) * (rng.chance(0.25) ? 3 : 1);
        ship(k, x, zz, len, kinds[(placed.length + got) % kinds.length], yaw, { rng, hull: hulls[(placed.length * 3 + got) % hulls.length], stripe: pick(rng, ['#c8302a', '#2c5da8', '#e9a31a', '#f1ede3']) });
        placed.push([x, zz, len]);
        got++;
        if (len > 2.6 && rng.chance(0.55)) {
          // a bunker barge alongside
          const bz = zz + (rng.chance(0.5) ? 0.5 : -0.5);
          if (!placed.some(([px, pz]) => Math.abs(px - x) < 0.9 && Math.abs(pz - bz) < 0.4)) {
            ship(k, x + rng.range(-0.5, 0.5), bz, 1.1, 'tanker', yaw, { rng, hull: '#b8321f', boot: '#5a2020', stripe: '#f1ede3' });
            placed.push([x, bz, 1.1]);
          }
        }
      }
    };
    anchor(13, 2.5, 8.2, -18.4, -13.0, 2.8, 3.9);
    anchor(4, 2.6, 8.4, -11.3, -9.0, 2.6, 3.4);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Colombo ─────────────────────────────

/** A colonial hall: two storeys under a red hipped roof, a deep veranda of white columns, a pedimented portico in the middle. */
function colonialHall(k: PortKit, x: number, z: number, w: number, o: { wall?: Col; roof?: Col; floors?: number } = {}): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, 0.3);
  const wall = o.wall ?? '#f5f0e2';
  const fl = o.floors ?? 2;
  const h = fl * 0.3;
  const d = 0.5;
  p.box(x, y - 0.12, z, w, h + 0.12, d, wall);
  p.prism(x, y + h, z, d + 0.1, 0.3, w + 0.1, o.roof ?? '#b8553d', { ry: Math.PI / 2 });
  p.tri([x + w / 2 + 0.052, y + h, z + d / 2 + 0.05], [x + w / 2 + 0.052, y + h, z - d / 2 - 0.05], [x + w / 2 + 0.052, y + h + 0.3, z], wall);
  // veranda: a dark recess behind white columns, a thin roof over it
  const n = Math.max(3, Math.round(w / 0.17));
  const zc = z + d / 2 + 0.14;
  for (let f = 0; f < fl; f++) {
    const y0 = y + f * 0.3;
    fq(p, x - w / 2 + 0.04, x + w / 2 - 0.04, y0 + 0.04, y0 + 0.24, z + d / 2 + 0.006, '#4a5f50');
    p.box(x, y0 + 0.26, zc - 0.03, w + 0.04, 0.025, 0.2, '#fbf8ee', { ao: 0 });
    for (let i = 0; i <= n; i++) p.boxV(x - w / 2 + 0.03 + (i * (w - 0.06)) / n, y0 + 0.01, zc + 0.04, 0.03, 0.25, 0.03, '#fbf8ee', { ao: 0 });
  }
  // the portico
  p.prism(x, y + fl * 0.3 + 0.0, zc + 0.04, 0.5, 0.17, 0.12, '#f8f4e8', { ao: 0 });
  k.reserve(x, z + 0.1, w / 2 + 0.06, d / 2 + 0.25);
}

/** The Colombo clock tower: a white round tower with a clock face, a gallery and a green-capped lantern, on a roundabout. */
function clockTower(k: PortKit, x: number, z: number, h: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.4, 0.4);
  p.cyl(x, y - 0.1, z, 0.8, 0.78, 0.16, '#cdbf9f', { seg: 20 });
  p.cyl(x, y + 0.06, z, 0.7, 0.7, 0.03, '#7fae5c', { seg: 20, ao: 0 });
  p.cyl(x, y, z, 0.3, 0.27, h * 0.22, '#f5f1e6', { seg: 8 });
  p.cyl(x, y + h * 0.22, z, 0.25, 0.2, h * 0.5, '#f5f1e6', { seg: 8 });
  p.cyl(x, y + h * 0.72, z, 0.3, 0.3, 0.05, '#cfc9b8', { seg: 8 });
  // the clock: a white face with two hands on the front and the right
  const cy = y + h * 0.55;
  p.ball(x, cy, z + 0.2, 0.11, '#fbf9f2', { sz: 0.25 });
  p.rod([x, cy, z + 0.225], [x + 0.0, cy + 0.075, z + 0.225], 0.007, '#2a2f38', 4);
  p.rod([x, cy, z + 0.225], [x + 0.05, cy - 0.02, z + 0.225], 0.007, '#2a2f38', 4);
  p.cyl(x, y + h * 0.77, z, 0.19, 0.17, h * 0.14, '#f5f1e6', { seg: 8 });
  p.cyl(x, y + h * 0.91, z, 0.24, 0.24, 0.04, '#2f3f36', { seg: 8 });
  k.glass.cyl(x, y + h * 0.95, z, 0.12, 0.12, h * 0.07, '#bfe6f2', { seg: 8 });
  p.cone(x, y + h * 0.95 + h * 0.07, z, 0.17, h * 0.1, '#3f6f58', { seg: 8 });
  p.cyl(x, y + h * 1.0 + 0.04, z, 0.006, 0.006, 0.12, '#2a2f38', { seg: 4 });
  k.reserve(x, z, 0.85, 0.85);
}

/** The Lotus Tower: a slender white shaft on a petalled podium, a round pod, and a pink lotus bud with its spike. */
function lotusTower(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.5, 0.5) - 0.02;
  p.cyl(x, y - 0.1, z, 0.66 * sc, 0.62 * sc, 0.22, '#dcd7ca', { seg: 16 });
  p.cyl(x, y + 0.12, z, 0.46 * sc, 0.42 * sc, 0.12, '#f1eee6', { seg: 16 });
  // the podium's petals: slanted fins around the shaft foot
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const tx = Math.cos(a);
    const tz = Math.sin(a);
    p.cone(x + tx * 0.3 * sc, y + 0.22, z + tz * 0.3 * sc, 0.12 * sc, 0.56 * sc, i % 2 ? '#f4c3d6' : '#f7f2ea', { seg: 5, rx: 0.42 * tz, rz: -0.42 * tx, ao: 0.05 });
  }
  const sh = 1.9 * sc;
  p.cyl(x, y + 0.2, z, 0.12 * sc, 0.085 * sc, sh, '#ece8dd', { seg: 10 });
  for (const t of [0.35, 0.6]) p.cyl(x, y + 0.2 + sh * t, z, 0.15 * sc, 0.15 * sc, 0.025, '#d3cec2', { seg: 10, ao: 0 });
  // the pod: a flattened drum with a band of glass
  const py = y + 0.2 + sh;
  p.lathe(x, py, z, [[0.085 * sc, 0], [0.24 * sc, 0.05 * sc], [0.27 * sc, 0.14 * sc], [0.24 * sc, 0.26 * sc], [0.1 * sc, 0.3 * sc]], '#e3dfd3', { seg: 14 });
  k.glass.cyl(x, py + 0.1 * sc, z, 0.272 * sc, 0.272 * sc, 0.08 * sc, '#6f9cb8', { seg: 14 });
  // the bud
  const by = py + 0.3 * sc;
  p.lathe(x, by, z, [[0.08 * sc, 0], [0.24 * sc, 0.1 * sc], [0.31 * sc, 0.34 * sc], [0.27 * sc, 0.6 * sc], [0.16 * sc, 0.82 * sc], [0.0, 0.98 * sc]], '#e6709f', { seg: 12 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const tx = Math.cos(a);
    const tz = Math.sin(a);
    p.cone(x + tx * 0.24 * sc, by + 0.04 * sc, z + tz * 0.24 * sc, 0.13 * sc, 0.98 * sc, i % 2 ? '#f08cb4' : '#d8588e', { seg: 5, rx: -0.2 * tz, rz: 0.2 * tx, ao: 0.04 });
  }
  p.cyl(x, by + 0.98 * sc, z, 0.014 * sc, 0.004, 0.55 * sc, '#f1eee6', { seg: 5, ao: 0 });
  k.reserve(x, z, 0.75 * sc, 0.7 * sc);
}

const colombo: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7faa58', land2: '#76a352', hill: '#4f8a4a', rock: '#8a8576', sand: '#ead9ac', haze: '#d6e8e4' };
    k.shape = { relief: 1.0, range: 2.6, rise: 5, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 16, k.vx(-13) + 16, -16.5, -11.9, LAND_Y, 0.8, 5);
  },
  build(k) {
    moleFlag(colombo, k, -1.6);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0xc010);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    const p = k.solid;
    // the old clock tower on its roundabout, the Lotus Tower beside the water
    clockTower(k, X(-3.4, -13.6), -13.6, 2.9);
    lotusTower(k, X(0.9, -13.9), -13.9, 1.0);
    // a colonial hall with its veranda, and white villas between the palms
    colonialHall(k, X(-6.6, -13.7), -13.7, 2.0, { wall: '#f1e3b5' });
    colonialHall(k, X(-1.6, -15.0), -15.0, 1.5, { wall: '#f6f1e4', roof: '#a64b36' });
    // the World Trade Centre's twin towers and the container terminal on the free side
    skyTower(k, X(4.0, -16.4), -16.4, 0.52, 0.46, 3.2, { wall: '#7e98ab', win: '#d6e6ee', crown: 'step', glass: false, lit: 0.4 });
    skyTower(k, X(4.8, -16.4), -16.4, 0.52, 0.46, 3.0, { wall: '#728ca0', win: '#d6e6ee', crown: 'step', glass: false, lit: 0.4 });
    skyTower(k, X(3.0, -16.0), -16.0, 0.5, 0.44, 1.9, { wall: '#e9e3d4', win: '#52687c' });
    gantries(k, X(5.4, -12.55), X(8.4, -12.55), -12.55, 3, '#2c5da8');
    stacks(k, X(4.8, -13.5), X(9.4, -13.5), -13.4, 3, rng, { tiers: 3 });
    town(k, colonial, 3, SHORE_Z - 1.3, { rowStep: 0.6, gaps: 0.12, x0: X(-14, -13), x1: X(3.0, -13) });
    // coconut palms, thick along the shore
    groves(k, rng, 38, k.vx(-13) - 10, k.vx(-13) + 9, -17.5, -12.6, { size: [1.1, 1.8] });
    void p;
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138', h: 1.9 } },
};

// ───────────────────────────── Terminals and yards ─────────────────────────────

/** Dense canopy blobs over the hills, one blob each: jungle or forest at a cheap price. */
function canopy(k: PortKit, rng: Rng, n: number, x0: number, x1: number, z0: number, z1: number, cols: Col[], o: { minY?: number; maxY?: number; size?: [number, number] } = {}): void {
  const p = k.solid;
  const sz = o.size ?? [0.14, 0.28];
  for (let i = 0, got = 0; got < n && i < n * 30; i++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    const y = k.ground(x, z);
    if (y < (o.minY ?? 0.45) || y > (o.maxY ?? 9) || k.isReserved(x, z, 0.05)) continue;
    const r = rng.range(sz[0], sz[1]);
    p.blob(x, y + r * 0.3, z, r, pick(rng, cols), { sy: 0.85, ry: rng.next() * 3 });
    got++;
  }
}

/** Colour a rectangle of the ground (concrete yards, bare earth). */
function paintRect(k: PortKit, x0: number, x1: number, z0: number, z1: number, col: string, a = 0.9): void {
  const g = c3(col);
  k.paint((x, y, z, slope, c) => {
    const m = smooth(0, 0.5, Math.min(x - x0, x1 - x, z - z0, z1 - z));
    if (m > 0) c.lerp(g, a * m);
  });
}

/** A cylindrical storage tank with a low cone roof, a band, and a ladder. */
function tank(k: PortKit, x: number, z: number, r: number, h: number, col: Col, roof: Col = '#c9c5ba', y = k.groundMax(x, z, r, r) - 0.03): void {
  const p = k.solid;
  p.cyl(x, y - 0.12, z, r, r, h + 0.12, col, { seg: 14 });
  p.cyl(x, y + h * 0.62, z, r * 1.012, r * 1.012, 0.025, tint(col, -0.18), { seg: 14, ao: 0 });
  p.cone(x, y + h, z, r * 1.03, r * 0.2, roof, { seg: 14 });
  p.rod([x + r * 0.78, y, z + r * 0.64], [x + r * 0.78, y + h, z + r * 0.64], 0.012, '#6b7078', 4);
  k.reserve(x, z, r + 0.05, r + 0.05);
}

/** A rail-mounted yard crane: a portal frame straddling the stacks. */
function yardCrane(k: PortKit, x: number, z: number, w: number, h: number, col: Col, y = LAND_Y): void {
  const p = k.solid;
  for (const dx of [-w / 2, w / 2]) for (const dz of [-0.13, 0.13]) p.box(x + dx, y - 0.02, z + dz, 0.04, h + 0.02, 0.04, col);
  p.box(x, y + h - 0.03, z + 0.13, w + 0.06, 0.06, 0.05, col, { ao: 0 });
  p.box(x, y + h - 0.03, z - 0.13, w + 0.06, 0.06, 0.05, col, { ao: 0 });
  p.box(x + w * 0.1, y + h + 0.02, z, 0.16, 0.06, 0.34, '#f1f2ee');
  k.reserve(x, z, w / 2 + 0.05, 0.2);
}

/** A tall light mast with a lamp head. */
function lamp(k: PortKit, x: number, z: number, h: number, y = k.ground(x, z) - 0.02): void {
  k.solid.cyl(x, y, z, 0.014, 0.01, h, '#9aa0a6', { seg: 5, ao: 0 });
  k.solid.box(x, y + h, z, 0.1, 0.02, 0.05, '#cfd3d6', { ao: 0 });
}

interface TerminalOpts {
  x0: number;
  x1: number;
  zQuay?: number;
  cranes: number;
  craneCol: Col;
  craneS?: number;
  rows: number;
  tiers?: number;
  pal?: Col[];
  yardCol?: Col | null;
  yardN?: number;
  /** ships at the berth: [x, length, hull colour] */
  ships?: Array<[number, number, Col]>;
  boom?: number;
  concrete?: string;
}

/** A container terminal: cranes along the quay, rows of stacked boxes behind, rail cranes, lamp masts, ships at the berth. */
function terminal(k: PortKit, rng: Rng, o0: TerminalOpts): void {
  const o = { ...o0, x0: Math.min(o0.x0, o0.x1), x1: Math.max(o0.x0, o0.x1) };
  const zq = o.zQuay ?? -12.5;
  const s = o.craneS ?? 1;
  paintRect(k, o.x0 - 0.3, o.x1 + 0.3, zq - 0.5 - o.rows * 0.15 - 0.6, zq + 0.6, o.concrete ?? '#a6a49c', 0.85);
  gantries(k, o.x0, o.x1, zq, o.cranes, o.craneCol, { s, boom: o.boom });
  const zs = zq - 0.78 * s;
  stacks(k, o.x0 - 0.2, o.x1 + 0.2, zs, o.rows, rng, { tiers: o.tiers ?? 4, pal: o.pal });
  const zEnd = zs - o.rows * 0.15 - 0.2;
  if (o.yardCol !== null) for (let i = 0; i < (o.yardN ?? 0); i++) yardCrane(k, lerp(o.x0 + 0.8, o.x1 - 0.8, (i + 0.5) / (o.yardN ?? 1)), zs - 0.5 - (i % 2) * 0.3, 1.3, 0.7, o.yardCol ?? '#d8452a');
  for (let x = o.x0; x < o.x1; x += 2.1) lamp(k, x, zEnd, 0.95);
  for (const [x, len, hull] of o.ships ?? []) ship(k, x, zq + 1.25, len, 'container', 0, { hull, rng, stripe: pick(rng, ['#c8302a', '#2c5da8', '#f1ede3']) });
}

// ───────────────────────────── Port Klang ─────────────────────────────

/** A pier into the water on piles: a thin deck, a pipeline, a loading platform at the head. */
function jetty(k: PortKit, x: number, zBack: number, zFront: number, w = 0.24, top = 0.42): void {
  const p = k.solid;
  p.box(x, top - 0.06, (zFront + zBack) / 2, w, 0.06, zBack - zFront, '#9a9488');
  for (let z = zFront + 0.1; z < zBack; z += 0.45) for (const dx of [-w * 0.4, w * 0.4]) p.cyl(x + dx, -0.9, z, 0.022, 0.022, 0.9 + top - 0.06, '#6f6a60', { seg: 5, ao: 0 });
  for (const dx of [-0.05, 0.05]) p.rod([x + dx, top + 0.06, zBack], [x + dx, top + 0.06, zFront], 0.022, '#8a8f94', 5);
  p.box(x, top - 0.06, zFront - 0.05, 0.6, 0.05, 0.4, '#8a8478');
  p.box(x, top - 0.01, zFront - 0.05, 0.06, 0.2, 0.06, '#e9a31a');
  p.rod([x, top + 0.19, zFront - 0.05], [x + 0.2, top + 0.1, zFront + 0.12], 0.012, '#e9a31a', 4);
  k.reserve(x, (zFront + zBack) / 2, 0.4, 1.2);
}

/** A big domed mosque: a hall under a blue dome with two smaller domes, and four slender minarets at the corners. */
function domedMosque(k: PortKit, x: number, z: number, sc: number, dome: Col): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.1 * sc, 0.6 * sc);
  const wall = '#f4eee0';
  p.box(x, y - 0.15, z, 2.0 * sc, 0.15 + 0.5 * sc, 1.1 * sc, wall);
  p.box(x, y + 0.5 * sc, z, 2.06 * sc, 0.04, 1.16 * sc, '#e4dccb');
  for (let i = 0; i < 7; i++) fq(p, x - 0.8 * sc + i * 0.27 * sc, x - 0.66 * sc + i * 0.27 * sc, y + 0.08 * sc, y + 0.36 * sc, z + 0.555 * sc, '#3a5a68');
  p.cyl(x, y + 0.54 * sc, z, 0.44 * sc, 0.44 * sc, 0.16 * sc, wall, { seg: 16 });
  p.lathe(x, y + 0.7 * sc, z, [[0.5 * sc, 0], [0.52 * sc, 0.12 * sc], [0.44 * sc, 0.34 * sc], [0.28 * sc, 0.52 * sc], [0.1 * sc, 0.64 * sc], [0, 0.68 * sc]], dome, { seg: 16 });
  p.cyl(x, y + 1.38 * sc, z, 0.008, 0.008, 0.18 * sc, '#e8b923', { seg: 4 });
  for (const sx of [-0.72, 0.72]) {
    p.cyl(x + sx * sc, y + 0.54 * sc, z, 0.22 * sc, 0.22 * sc, 0.1 * sc, wall, { seg: 12 });
    p.lathe(x + sx * sc, y + 0.64 * sc, z, [[0.25 * sc, 0], [0.26 * sc, 0.06 * sc], [0.2 * sc, 0.18 * sc], [0.08 * sc, 0.27 * sc], [0, 0.3 * sc]], dome, { seg: 12 });
  }
  for (const [dx, dz] of [[-1.12, -0.5], [1.12, -0.5], [-1.12, 0.52], [1.12, 0.52]] as Array<[number, number]>) minaret(k, x + dx * sc, z + dz * sc, 1.9 * sc, y - 0.03, wall, dome);
  k.reserve(x, z, 1.35 * sc, 0.8 * sc);
}

const portKlang: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6e9d4c', land2: '#649446', hill: '#3f7a40', rock: '#4f7a48', sand: '#d9cfa8', haze: '#d3e7e1' };
    k.shape = { relief: 1.4, range: 3.8, rise: 5, rough: 0.35, freq: 0.09 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 18, k.vx(-13) + 18, -17.0, -11.9, LAND_Y, 0.8, 5);
    jungle(k, '#2f6b3a', 0.9, 2.6, -15);
  },
  build(k) {
    moleFlag(portKlang, k, 3.4);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x9c1a);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // the mosque with its blue domes and four minarets, at the head of the town
    domedMosque(k, X(-4.0, -13.9), -13.9, 1.05, '#2c6fb8');
    // the palm-oil tank farm: white tanks of every size, pipe racks between them
    const tanks: Array<[number, number, number, number]> = [
      [-0.4, -13.3, 0.5, 1.0], [0.75, -13.4, 0.54, 1.2], [1.95, -13.3, 0.48, 0.9], [0.0, -14.5, 0.58, 1.4], [1.3, -14.6, 0.52, 1.15],
      [2.5, -14.5, 0.5, 1.3], [-0.6, -15.6, 0.5, 0.95], [0.7, -15.8, 0.58, 1.45], [1.9, -15.7, 0.5, 1.05],
    ];
    const tc: Col[] = ['#f1efe8', '#e8e5dc', '#dfdcd2', '#f4f2ec'];
    tanks.forEach(([dx, zz, r, h], i) => tank(k, X(dx, zz), zz, r, h, tc[i % 4], i % 3 === 0 ? '#c0693f' : '#b9b5aa'));
    for (let i = 0; i < 4; i++) {
      const zz = -13.95 - i * 0.55;
      k.solid.rod([X(-0.9, zz), LAND_Y + 0.5, zz], [X(3.0, zz), LAND_Y + 0.5, zz], 0.014, '#c8302a', 4);
    }
    // the oil jetty with a tanker loading at its head, beside the tank farm
    const jx = X(3.4, -11.2);
    jetty(k, jx, -12.0, -10.4);
    ship(k, jx - 0.1, -9.5, 4.0, 'tanker', 0.02, { hull: '#2b2f36', stripe: '#f1ede3', rng });
    // the container terminal on the free side
    terminal(k, rng, { x0: X(4.8, -12.5), x1: X(7.6, -12.5), cranes: 3, craneCol: '#c8302a', rows: 3, tiers: 3, yardN: 1 });
    // oil palm plantations on the hills behind, in rows
    for (let r = 0; r < 4; r++) for (let i = 0; i < 18; i++) {
      const zz = -17.3 - r * 0.6;
      const xx = k.vx(zz) + s * (-8 + i * 0.95 + (r % 2) * 0.45);
      const gy = k.ground(xx, zz);
      if (gy > 0.4 && gy < 3.5 && !k.isReserved(xx, zz, 0.1)) coco(k, xx, zz, 0.85, rng, gy - 0.03);
    }
    town(k, shophouse, 2, SHORE_Z - 1.3, { rowStep: 0.58, gaps: 0.1, x0: X(-14, -13), x1: X(-5.4, -13) });
    town(k, shophouse, 1, SHORE_Z - 3.8, { rowStep: 0.58, gaps: 0.2, x0: X(-6, -13), x1: X(-2.6, -13) });
    groves(k, rng, 22, k.vx(-13) - 10, k.vx(-13) + 9, -17.5, -12.6);
    canopy(k, rng, 90, k.vx(-18) - 16, k.vx(-18) + 16, -23, -16.2, ['#3f7a40', '#4a8a45', '#35703a', '#2f6b3a'], { minY: 0.6 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Tanjung Pelepas ─────────────────────────────

const MAERSK: Col[] = ['#4b8fcc', '#3a7fc0', '#d9d4c7', '#5a6a7c', '#2f5f96', '#9fb8cc', '#e9a31a', '#c8302a'];

const tanjungPelepas: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#5a9a47', land2: '#4f8e43', hill: '#2c6a3a', rock: '#3f6a45', sand: '#d9cfa8', haze: '#cfe4dc' };
    k.shape = { relief: 2.0, range: 5.2, rise: 4.0, rough: 0.5, freq: 0.1 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.2, -11.9, LAND_Y, 1.0, 3.2);
    jungle(k, '#1f5d33', 0.8, 2.4, -14.5);
  },
  build(k) {
    moleFlag(tanjungPelepas, k, 3.4);
    const rng = new Rng(k.seed ^ 0x7bb);
    const vx = k.vx(-12.5);
    // the long quay: twelve cranes along the whole front, one big ship at the berth, stacks of boxes in Maersk blue
    terminal(k, rng, { x0: vx - 7.4, x1: vx + 7.6, cranes: 12, craneCol: '#3d86c6', craneS: 0.9, rows: 5, tiers: 5, pal: MAERSK, yardN: 4, yardCol: '#c8302a', ships: [[vx + 1.0, 6.4, '#26364d']], boom: 1.7 });
    // jungle: dark canopy climbing the hills behind, palms along the edge
    canopy(k, rng, 190, vx - 22, vx + 22, -25, -16.4, ['#1f5d33', '#256a38', '#2c7440', '#18502e', '#33803f'], { minY: 0.5, size: [0.16, 0.34] });
    groves(k, rng, 18, vx - 14, vx + 14, -22, -17.4, { size: [1.2, 1.8], minY: 0.4 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Laem Chabang ─────────────────────────────

/** A Thai chedi: stepped square base, a gilded bell, rings and a slender spire. */
function chedi(k: PortKit, x: number, z: number, h: number, gold: Col = '#e8b923', y = k.groundMax(x, z, 0.3, 0.3) - 0.03): void {
  const p = k.solid;
  p.box(x, y - 0.1, z, 0.62 * h * 0.3, 0.1 + 0.05 * h, 0.62 * h * 0.3, '#f1ead6');
  p.box(x, y + 0.05 * h, z, 0.5 * h * 0.3, 0.05 * h, 0.5 * h * 0.3, gold);
  p.lathe(x, y + 0.1 * h, z, [[0.0, 0], [0.19 * h * 0.3 * 1.0, 0.0], [0.2 * h * 0.3, 0.04 * h], [0.15 * h * 0.3, 0.22 * h], [0.09 * h * 0.3, 0.36 * h], [0.065 * h * 0.3, 0.44 * h]], gold, { seg: 12 });
  for (let i = 0; i < 5; i++) p.cyl(x, y + (0.5 + i * 0.07) * h, z, (0.065 - i * 0.008) * h * 0.3 * 1.6, (0.065 - i * 0.008) * h * 0.3 * 1.6 - 0.002, 0.07 * h, i % 2 ? '#f6d86a' : gold, { seg: 10, ao: 0 });
  p.cone(x, y + 0.87 * h, z, 0.018 * h, 0.15 * h, gold, { seg: 6, ao: 0 });
  k.reserve(x, z, 0.3 * h * 0.3 + 0.1, 0.3 * h * 0.3 + 0.1);
}

/**
 * A Thai wat: a white ordination hall under three stacked tiers of red-orange roof edged in gold, finials at the
 * ridge ends, and a tall golden chedi beside it, all behind a low white wall on a raised terrace.
 */
function wat(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.3 * sc, 0.8 * sc);
  const gold = '#e8b923';
  const red = '#d8452a';
  p.box(x, y - 0.2, z, 3.4 * sc, 0.2 + 0.1, 1.7 * sc, '#efe7d2');
  p.box(x, y + 0.1, z + 0.82 * sc, 3.4 * sc, 0.16 * sc, 0.05, '#f6f1e2');
  for (let i = 0; i < 24; i++) p.box(x - 1.65 * sc + i * 0.143 * sc, y + 0.1, z + 0.84 * sc, 0.03, 0.2 * sc, 0.03, gold, { ao: 0 });
  const hx = x - 0.55 * sc;
  const hz = z - 0.05 * sc;
  p.box(hx, y + 0.1, hz, 1.75 * sc, 0.44 * sc, 0.74 * sc, '#f6efe0');
  // doors and windows on the front
  for (let i = 0; i < 5; i++) fq(p, hx - 0.7 * sc + i * 0.35 * sc, hx - 0.52 * sc + i * 0.35 * sc, y + 0.2, y + 0.2 + 0.28 * sc, hz + 0.371 * sc, i === 2 ? '#7a1f18' : '#5a2a20');
  p.box(hx, y + 0.1, hz + 0.37 * sc, 1.76 * sc, 0.03, 0.02, gold, { ao: 0 });
  // three tiers of roof, each a ridge along x
  const tiers: Array<[number, number, number, number]> = [[2.15, 1.12, 0.3, 0.52], [1.7, 0.88, 0.27, 0.7], [1.25, 0.64, 0.24, 0.86]];
  tiers.forEach(([len, dep, rh, yy], i) => {
    const ry = y + yy * sc;
    p.prism(hx, ry, hz, dep * sc, rh * sc, len * sc, red, { ry: Math.PI / 2 });
    // gold fascia along the eaves, and the gable at the right end
    p.box(hx, ry, hz + (dep / 2) * sc, len * sc, 0.035 * sc, 0.025, gold, { ao: 0 });
    p.tri([hx + (len / 2) * sc + 0.003, ry, hz + (dep / 2) * sc], [hx + (len / 2) * sc + 0.003, ry, hz - (dep / 2) * sc], [hx + (len / 2) * sc + 0.003, ry + rh * sc, hz], i === 0 ? '#2f8f6b' : '#f6efe0');
    for (const sx of [-1, 1]) p.cone(hx + sx * (len / 2) * sc, ry + rh * sc * 0.8, hz, 0.025 * sc, 0.17 * sc, gold, { seg: 4, rz: -sx * 0.5, ao: 0 });
    p.box(hx, ry + rh * sc - 0.005, hz, len * sc, 0.025 * sc, 0.03, gold, { ao: 0 });
  });
  chedi(k, x + 1.05 * sc, z - 0.1 * sc, 2.5 * sc);
  k.reserve(x, z, 1.8 * sc, 1.0 * sc);
}

const laemChabang: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7aa650', land2: '#6f9c4a', hill: '#4a8442', rock: '#587f48', sand: '#e0d3a8', haze: '#d3e7e1' };
    k.shape = { relief: 1.4, range: 3.6, rise: 4.5, rough: 0.4, freq: 0.09 };
    k.shore = 'quay';
    const s = k.mole.dir;
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.2, -11.9, LAND_Y, 1.0, 3.2);
    // the wat stands on a low terrace
    k.bump(k.vx(-14.6) + s * 0.4, -14.6, 3.4, 2.0, 0.34, 1.4);
  },
  build(k) {
    moleFlag(laemChabang, k, -2.0);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x1a3c);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    wat(k, X(0.4, -14.6), -14.6, 1.3);
    terminal(k, rng, { x0: X(3.9, -12.5), x1: X(7.6, -12.5), cranes: 4, craneCol: '#2a8c8c', rows: 4, tiers: 4, yardN: 1, yardCol: '#2a8c8c', ships: [[X(5.6, -12), 4.8, '#7a2d2a']] });
    town(k, shophouse, 2, SHORE_Z - 1.3, { rowStep: 0.58, gaps: 0.12, x0: X(-14, -13), x1: X(-3.0, -13) });
    town(k, shophouse, 1, SHORE_Z - 3.2, { rowStep: 0.58, gaps: 0.3, x0: X(-3.2, -13), x1: X(-2.0, -13) });
    groves(k, rng, 30, k.vx(-13) - 11, k.vx(-13) + 9, -17.5, -12.6);
    canopy(k, rng, 90, k.vx(-18) - 16, k.vx(-18) + 16, -24, -17.0, ['#3f7a40', '#4a8a45', '#35703a', '#52944b'], { minY: 0.6 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Yantian ─────────────────────────────

const yantian: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6f9b55', land2: '#648f4e', hill: '#3a7a44', rock: '#2f5f3c', sand: '#d9cfa8', haze: '#d2e4e6' };
    k.shape = { relief: 3.4, range: 9.5, rise: 2.4, rough: 0.9, freq: 0.12 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -15.3, -11.9, LAND_Y, 1.0, 1.8);
    jungle(k, '#215d33', 0.6, 2.2, -14.6);
  },
  build(k) {
    moleFlag(yantian, k, 3.5);
    const rng = new Rng(k.seed ^ 0x7a17);
    const vx = k.vx(-12.5);
    // a massive terminal: two groups of cranes with a gap between, four berths of ships, deep stacks and rail cranes
    terminal(k, rng, { x0: vx - 7.2, x1: vx - 0.7, cranes: 6, craneCol: '#d8452a', craneS: 0.95, rows: 4, tiers: 5, yardN: 3, yardCol: '#e9a31a', ships: [[vx - 3.8, 5.6, '#1f2e4d']] });
    terminal(k, rng, { x0: vx + 0.9, x1: vx + 7.6, cranes: 6, craneCol: '#d8452a', craneS: 0.95, rows: 4, tiers: 5, yardN: 3, yardCol: '#e9a31a', ships: [[vx + 4.2, 6.0, '#3b3f46']] });
    // steep green mountains close behind: forest on every slope, the odd white house high up
    canopy(k, rng, 260, vx - 22, vx + 22, -26, -15.8, ['#1f5d33', '#2a6e3b', '#34803f', '#18502e', '#3f8d46', '#2d6b45'], { minY: 0.5, size: [0.16, 0.34] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Ningbo ─────────────────────────────

/** A conical heap of bulk cargo (coal, ore, sand, aggregate) sitting on the ground. */
function pile(k: PortKit, x: number, z: number, r: number, h: number, col: Col, y = LAND_Y): void {
  const p = k.solid;
  p.cone(x, y - 0.02, z, r, h, col, { seg: 9, ao: 0.1 });
  p.cone(x + r * 0.28, y - 0.02, z + r * 0.1, r * 0.55, h * 0.7, tint(col, 0.06), { seg: 7, ao: 0.1 });
  k.reserve(x, z, r, r);
}

/** A stacker-reclaimer: a rail carriage with a long slewing boom over a pile. */
function stacker(k: PortKit, x: number, z: number, len: number, y = LAND_Y): void {
  const p = k.solid;
  p.box(x, y, z, 0.3, 0.07, 0.3, '#3a3f46');
  p.box(x, y + 0.07, z, 0.22, 0.3, 0.2, '#e9a31a');
  p.box(x - len * 0.5, y + 0.34, z, len, 0.05, 0.06, '#f1f2ee', { rz: 0.1, ao: 0 });
  p.rod([x, y + 0.5, z], [x - len, y + 0.45, z], 0.01, '#8a8f94', 4);
  p.box(x + 0.16, y + 0.2, z, 0.12, 0.1, 0.14, '#7a7f86');
}

/** A grab ship-unloader: a tall portal with a long boom racked up over the water and a grab hanging from it. */
function unloader(k: PortKit, x: number, z: number, col: Col, s = 1): void {
  const p = k.solid;
  const y = LAND_Y;
  const H = 1.3 * s;
  for (const dx of [-0.28, 0.28]) for (const dz of [-0.3, 0.3]) p.box(x + dx * s, y - 0.05, z + dz * s, 0.06 * s, H + 0.05, 0.06 * s, col);
  p.box(x, y + H, z, 0.7 * s, 0.1 * s, 0.76 * s, col);
  p.box(x, y + H + 0.1 * s, z - 0.05 * s, 0.34 * s, 0.22 * s, 0.4 * s, '#f1f2ee');
  p.box(x, y + H + 0.04 * s, z + 0.7 * s, 0.1 * s, 0.1 * s, 1.5 * s, col, { rx: -0.26, ao: 0 });
  p.rod([x, y + H + 0.3 * s, z], [x, y + H + 0.1 * s, z + 1.4 * s], 0.008, '#3a3f46', 4);
  p.rod([x, y + H + 0.3 * s, z], [x, y + H + 0.1 * s, z - 0.6 * s], 0.008, '#3a3f46', 4);
  p.rod([x, y + H + 0.2 * s, z + 1.2 * s], [x, y + 0.7 * s, z + 1.2 * s], 0.006, '#3a3f46', 3);
  p.box(x, y + 0.52 * s, z + 1.2 * s, 0.14 * s, 0.14 * s, 0.1 * s, '#4a4f58');
  k.reserve(x, z, 0.5 * s, 0.5 * s);
}

const ningbo: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#86a65c', land2: '#7a9c56', hill: '#4f8a4a', rock: '#5a8650', sand: '#d9cfa8', haze: '#d6e6e6' };
    k.shape = { relief: 2.4, range: 6.0, rise: 3.6, rough: 0.6, freq: 0.1 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -17.0, -11.9, LAND_Y, 1.0, 3.2);
  },
  build(k) {
    moleFlag(ningbo, k, 3.0);
    const rng = new Rng(k.seed ^ 0x9b0);
    const vx = k.vx(-12.5);
    const p = k.solid;
    paintRect(k, vx - 9, vx + 9, -16.4, -11.8, '#9a978d', 0.85);
    // endless cranes: a long front row, then unloaders for the bulk berths
    gantries(k, vx - 7.4, vx - 1.2, -12.5, 6, '#e9a31a', { s: 0.82, boom: 1.6 });
    gantries(k, vx + 3.6, vx + 7.4, -12.5, 4, '#e9a31a', { s: 0.82, boom: 1.6 });
    unloader(k, vx + 0.6, -12.6, '#2f6fb0', 0.85);
    ship(k, vx + 0.4, -11.1, 5.4, 'bulker', 0, { hull: '#2d4a3c', stripe: '#e9a31a', rng });
    ship(k, vx - 4.2, -11.15, 6.0, 'container', 0, { hull: '#7a2d2a', stripe: '#2c5da8', rng });
    ship(k, vx + 5.4, -11.15, 5.4, 'container', 0, { hull: '#1f2e4d', stripe: '#c8302a', rng });
    // stacks behind the container berths
    stacks(k, vx - 7.6, vx - 1.0, -13.3, 4, rng, { tiers: 4 });
    stacks(k, vx + 3.4, vx + 7.8, -13.3, 4, rng, { tiers: 4 });
    // bulk piles by the unloaders: coal, iron ore, sand and aggregate, with stackers and a conveyor gallery
    const heaps: Array<[number, number, number, number, Col]> = [
      [-0.9, -13.6, 0.55, 0.7, '#2b2c30'], [0.1, -14.4, 0.7, 0.9, '#8f4a30'], [1.2, -13.6, 0.5, 0.6, '#d8c48a'], [-0.4, -15.4, 0.6, 0.75, '#2b2c30'], [1.0, -15.2, 0.55, 0.8, '#b9b3a4'], [2.0, -14.6, 0.5, 0.65, '#8f4a30'],
    ];
    for (const [dx, zz, r, h, c] of heaps) pile(k, vx + dx, zz, r, h, c);
    stacker(k, vx + 0.5, -14.9, 1.3);
    p.box(vx + 0.8, LAND_Y + 0.55, -16.4, 3.2, 0.07, 0.09, '#6f7480', { ao: 0 });
    for (let i = 0; i < 5; i++) p.box(vx - 0.7 + i * 0.75, LAND_Y - 0.02, -16.4, 0.05, 0.57, 0.05, '#4a4f58');
    for (let x = vx - 9; x < vx + 9; x += 2.2) lamp(k, x, -17.0, 0.95);
    // green hills and a few blocks of flats behind
    canopy(k, rng, 120, vx - 20, vx + 20, -26, -17.6, ['#3f7a40', '#4a8a45', '#35703a', '#52944b'], { minY: 0.6, size: [0.16, 0.34] });
    town(k, blocks, 1, -18.6, { rowStep: 0.6, gaps: 0.35, x0: vx - 13, x1: vx + 13, minY: 0.3 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Junks, karst and river craft ─────────────────────────────

/** A Chinese junk: a high-sterned wooden hull, masts with fan-shaped battened sails. Bow to +x before `ry`. */
function junk(k: PortKit, x: number, z: number, len: number, ry: number, sail: Col, hullCol: Col = '#6b4430', masts = 3): void {
  const p = k.solid;
  k.at(x, 0, z, ry, len / 3.2, () => {
    const plan: Array<[number, number]> = [[-1.5, -0.3], [-1.5, 0.3], [1.15, 0.34], [1.6, 0.1], [1.6, -0.1], [1.15, -0.34]];
    hullSolid(p, plan, -0.3, 0.14, 0.7, hullCol);
    p.box(0, 0.135, 0, 3.04, 0.02, 0.62, '#9a7a52', { ao: 0 });
    p.box(-1.15, 0.14, 0, 0.75, 0.3, 0.56, tint(hullCol, 0.1));
    p.box(-1.15, 0.44, 0, 0.8, 0.03, 0.6, '#8a6a46', { ao: 0 });
    p.box(1.42, 0.14, 0, 0.3, 0.18, 0.2, tint(hullCol, 0.05));
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? 0.1 : lerp(-0.8, 1.0, m / (masts - 1));
      const hh = (m === 1 || masts === 1 ? 2.3 : m === 0 ? 2.0 : 1.55);
      p.cyl(mx, 0.14, 0, 0.03, 0.02, hh, '#5b4030', { seg: 5 });
      // the sail fans out aft of its mast: a quad wider at the top, with battens
      const wB = 0.8;
      const wT = 1.0;
      const y0 = 0.42;
      const y1 = hh * 0.97;
      p.quad([mx + 0.02, y0, 0.02], [mx - wB, y0, 0.02], [mx - wT, y1, 0.02], [mx + 0.02, y1, 0.02], sail, true);
      for (let b = 1; b <= 5; b++) {
        const t = b / 6;
        p.rod([mx + 0.02, lerp(y0, y1, t), 0.03], [mx - lerp(wB, wT, t), lerp(y0, y1, t), 0.03], 0.012, tint(sail, -0.3), 3);
      }
    }
    p.rod([1.5, 0.3, 0], [2.0, 0.55, 0], 0.025, '#5b4030', 4);
  });
}

/** A floating house on a pontoon: a coloured hut with a tin roof. */
function houseboat(k: PortKit, x: number, z: number, col: Col, ry = 0): void {
  const p = k.solid;
  k.at(x, 0, z, ry, 1, () => {
    p.box(0, -0.12, 0, 0.7, 0.16, 0.4, '#7a7468', { ao: 0.1 });
    p.box(0, 0.04, 0, 0.5, 0.2, 0.3, col);
    p.prism(0, 0.24, 0, 0.6, 0.12, 0.38, '#6b7a82', { ry: Math.PI / 2 });
    fq(p, -0.12, 0.0, 0.08, 0.18, 0.152, '#3a4a58');
  });
}

/**
 * A limestone karst tower rising out of the sea: a faceted column with a notch cut at the waterline, pale cliffs, and a cap
 * of dark green forest, with trees clinging to the ledges. `h` is the height above the water.
 */
function karst(k: PortKit, x: number, z: number, h: number, r: number, seed: number, lean = 0): void {
  const p = k.solid;
  const L = lean * h * 0.18;
  const rings: Ring[] = [
    { y: -0.5, r: r * 1.0, sz: 0.85 },
    { y: -0.02, r: r * 0.82, sz: 0.85 },
    { y: h * 0.1, r: r * 1.0, dx: L * 0.1, sz: 0.85 },
    { y: h * 0.38, r: r * 0.93, dx: L * 0.3, sz: 0.85 },
    { y: h * 0.66, r: r * 0.82, dx: L * 0.6, sz: 0.85 },
    { y: h * 0.86, r: r * 0.64, dx: L * 0.85, sz: 0.85 },
    { y: h * 0.97, r: r * 0.46, dx: L, sz: 0.85 },
    { y: h * 1.0, r: r * 0.3, dx: L, sz: 0.85 },
  ];
  const cols: Col[] = ['#6d6a5e', '#7c776a', '#bfb8a6', '#cfc8b4', '#c4bda9', '#b0b08a', '#6f8f58'];
  pillar(k, x, 0, z, rings, cols, { seg: 9, jit: 0.1, seed, cap: '#4f7a45', ao: 0.05 });
  // a skirt of rock just under the surface so the foot never shows a gap, and the forest on top
  p.rock(x, -0.3, z + r * 0.1, r * 0.9, '#6d6a5e', { sy: 0.4, ao: 0 });
  for (let i = 0; i < 4; i++) {
    const t = 0.34 + hash(seed, i) * 0.55;
    const a = hash(seed, i, 7) * TAU;
    const rr = lerp(r * 0.92, r * 0.5, (t - 0.3) / 0.7) * 0.82;
    p.blob(x + L * t + Math.cos(a) * rr, h * t, z + Math.sin(a) * rr * 0.85, r * 0.17, i % 2 ? '#4a7a40' : '#5a8a46', { sy: 0.8 });
  }
  p.blob(x + L, h * 1.0, z, r * 0.26, '#3f6f3a', { sy: 0.8 });
  p.blob(x + L - r * 0.12, h * 0.98, z + r * 0.08, r * 0.2, '#4f7f45', { sy: 0.8 });
  k.reserve(x, z, r + 0.1, r + 0.1);
}

// ───────────────────────────── Hai Phong ─────────────────────────────

const haiPhong: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#6fa04f', land2: '#659848', hill: '#3f7a40', rock: '#5a7f4a', sand: '#dccfa8', haze: '#d6e8e4' };
    k.shape = { relief: 1.8, range: 4.4, rise: 5, rough: 0.5, freq: 0.1 };
    k.shore = 'beach';
    const s = k.mole.dir;
    // the whole shore is drowned: a bay of calm green water, with a spit of land and a small port on the head side
    const x0 = s > 0 ? k.vx(-14) - 5.2 : k.vx(-14) - 80;
    const x1 = s > 0 ? k.vx(-14) + 80 : k.vx(-14) + 5.2;
    bay(k, x0, x1, -25, -11.4, -0.6, 2.2, 6);
    flat(k, s > 0 ? k.vx(-13) - 40 : k.vx(-13) + 4.6, s > 0 ? k.vx(-13) - 5.2 : k.vx(-13) + 40, -16.2, -11.9, LAND_Y, 0.8, 4);
    bankPaint(k, '#d9cfa9');
  },
  build(k) {
    moleFlag(haiPhong, k, -2.0);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x4a11);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // the karst towers: low squat ones near, taller ones standing back, leaning this way and that
    const towers: Array<[number, number, number, number]> = [
      // dx, z, height, radius
      [-3.4, -10.4, 1.3, 0.5], [2.2, -10.0, 1.1, 0.42], [-0.6, -12.2, 2.3, 0.72], [3.4, -12.6, 1.8, 0.58],
      [-2.6, -13.8, 2.9, 0.8], [1.2, -14.4, 2.6, 0.7], [5.0, -14.0, 2.4, 0.66], [-5.2, -15.2, 2.7, 0.7],
      [3.0, -16.4, 3.4, 0.8], [-0.4, -17.6, 3.6, 0.85], [6.6, -16.6, 3.0, 0.72], [-4.4, -18.4, 3.8, 0.8],
    ];
    towers.forEach(([dx, zz, h, r], i) => karst(k, X(dx, zz), zz, h, r, i * 7 + 3, rng.range(-1, 1)));
    // tourist junks with brown sails among them, and a floating fishing village
    junk(k, X(-1.9, -10.7), -10.7, 2.4, 0.05, '#8a3a24');
    junk(k, X(4.4, -11.2), -11.2, 2.0, Math.PI + 0.08, '#a8502c');
    junk(k, X(0.9, -13.0), -13.0, 1.8, 0.35, '#8a3a24', '#5a3a28', 2);
    junk(k, X(-4.2, -12.4), -12.4, 1.7, -0.3, '#b05a30', '#6b4430', 2);
    const hb: Col[] = ['#d8452a', '#e9a31a', '#3f8d6b', '#2c8aa5', '#f1ede3'];
    [[1.8, -11.4], [2.5, -11.7], [3.1, -11.2], [-2.8, -12.0], [5.6, -12.3], [6.3, -12.0], [-6.0, -13.4]].forEach(([dx, zz], i) => houseboat(k, X(dx, zz), zz, hb[i % 5], rng.range(-0.15, 0.15)));
    // the port on the spit: a few cranes and a ship, shophouses behind
    const tx0 = X(-6.9, -12.5);
    terminal(k, rng, { x0: tx0 - 1.0 * s, x1: tx0 - 4.5 * s, cranes: 3, craneCol: '#2c8aa5', craneS: 0.85, rows: 2, tiers: 3, yardN: 0, ships: [[X(-9.4, -12), 4.2, '#26364d']] });
    town(k, shophouse, 2, SHORE_Z - 1.4, { rowStep: 0.55, gaps: 0.12, x0: X(-14, -13), x1: X(-5.0, -13) });
    groves(k, rng, 14, k.vx(-13) - 12, k.vx(-13) - 4, -16.5, -12.6);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Hong Kong ─────────────────────────────

/** IFC: a slender tower of pale glass in three tapering steps, with a notched crown. Returns its top. */
function ifcTower(k: PortKit, x: number, z: number, H: number): number {
  const gy = k.groundMax(x, z, 0.4, 0.3);
  const a = skyTower(k, x, z, 0.62, 0.52, H * 0.62, { wall: '#d9c98a', win: '#6a5f3a', cols: 2, crown: 'none', y: gy - 0.0 });
  const b = skyTower(k, x, z, 0.5, 0.42, H * 0.26, { wall: '#dfd09a', win: '#6a5f3a', cols: 2, crown: 'none', y: a });
  const c = skyTower(k, x, z, 0.38, 0.32, H * 0.12, { wall: '#e6d9a8', win: '#6a5f3a', cols: 1, crown: 'none', y: b });
  // the crown: two tall piers with a notch between
  k.solid.box(x - 0.1, c, z, 0.12, 0.2, 0.22, '#efe3b8');
  k.solid.box(x + 0.1, c, z, 0.12, 0.26, 0.22, '#efe3b8');
  return c + 0.26;
}

/** ICC: a very tall dark glass box in stepped sections, with a lit terraced crown. */
function iccTower(k: PortKit, x: number, z: number, H: number): number {
  const gy = k.groundMax(x, z, 0.5, 0.4);
  const a = skyTower(k, x, z, 0.92, 0.72, H * 0.74, { wall: '#27425e', win: '#8fbad6', cols: 4, crown: 'none', y: gy });
  const b = skyTower(k, x, z, 0.8, 0.62, H * 0.16, { wall: '#2c4966', win: '#8fbad6', cols: 3, crown: 'none', y: a });
  const c = skyTower(k, x, z, 0.62, 0.5, H * 0.07, { wall: '#31506e', win: '#bfe0f0', cols: 2, crown: 'none', y: b });
  k.solid.box(x, c, z, 0.7, 0.04, 0.56, '#dfe8ee', { ao: 0 });
  k.solid.cyl(x, c + 0.04, z, 0.006, 0.006, 0.4, '#cfd3d6', { seg: 4, ao: 0 });
  return c + 0.44;
}

/** The Bank of China Tower: four triangular prisms of different heights rising from one base. */
function bocTower(k: PortKit, x: number, z: number, H: number): void {
  const gy = k.groundMax(x, z, 0.4, 0.4);
  const hs = [0.55, 0.75, 0.9, 1.0];
  const pos: Array<[number, number]> = [[-0.17, 0.14], [0.17, 0.14], [0.17, -0.14], [-0.17, -0.14]];
  pos.forEach(([dx, dz], i) => {
    const h = H * hs[i];
    const rot = (i * Math.PI) / 2 + Math.PI / 6;
    pillar(k, x + dx, gy - 0.1, z + dz, [{ y: 0, r: 0.3, rot }, { y: h + 0.1, r: 0.3, rot }], i % 2 ? '#e4e8ea' : '#d6dce0', { seg: 3, ao: 0.05, cap: '#c9d1d6' });
  });
  // diagonal bracing on the front
  const c = '#8f9aa3';
  k.solid.rod([x - 0.3, gy, z + 0.34], [x + 0.3, gy + H * 0.5, z + 0.34], 0.012, c, 4);
  k.solid.rod([x + 0.3, gy, z + 0.34], [x - 0.3, gy + H * 0.5, z + 0.34], 0.012, c, 4);
  k.solid.box(x, gy - 0.12, z, 0.82, 0.12 + 0.18, 0.7, '#cfd6da');
  k.reserve(x, z, 0.5, 0.45);
}

/** The Star Ferry: low and white with a green band and a green roof, two decks of windows. */
function starFerry(k: PortKit, x: number, z: number, len: number, ry: number): void {
  ship(k, x, z, len, 'ferry', ry, { hull: '#2b7a50', boot: '#1f2e3a', stripe: '#2b7a50', deck: '#f4f0e6' });
  // green roof over the upper deck (bow to +x before ry)
  k.at(x, 0, z, ry, len / 4, () => {
    k.solid.box(0.1, 0.82, 0, 2.5, 0.04, 0.46, '#2b7a50');
    k.solid.box(0.3, 1.02, 0, 1.2, 0.04, 0.4, '#2b7a50');
  });
}

const hkTowers: Array<[Col, Col]> = [['#e6e4dc', '#5a7186'], ['#d6dadb', '#46607a'], ['#f0ece2', '#56728a'], ['#c9d2d6', '#3f566b'], ['#e0d9c6', '#52687c'], ['#d9dee0', '#4a6076'], ['#8aa0ad', '#e2eef3']];

const hongKong: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7ea866', land2: '#729e5e', hill: '#4a8350', rock: '#5a8250', sand: '#d9cfae', haze: '#d6e3e8' };
    k.shape = { relief: 2.8, range: 8.5, rise: 3.2, rough: 0.75, freq: 0.1 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -15.0, -11.9, LAND_Y, 1.0, 3.0);
    // Victoria Peak, steep and green, close behind the towers
    k.bump(k.vx(-24) + 1.0, -24, 12, 7.5, 6.5, 0.9);
    jungle(k, '#2f6b3a', 1.0, 3.4, -16);
  },
  build(k) {
    moleFlag(hongKong, k, -2.0);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x4b17);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // the three famous towers in a row at the water's edge
    iccTower(k, X(-3.2, -13.6), -13.6, 3.5);
    ifcTower(k, X(0.1, -13.3), -13.3, 3.3);
    bocTower(k, X(3.0, -13.2), -13.2, 2.5);
    // the dense skyline round them, climbing the Peak behind
    skyline(k, rng, { x0: X(-14, -14), x1: X(14, -14), zFront: -13.5, rows: 4, hMin: 0.8, hMax: 2.3, pal: hkTowers, cx: X(0, -14), peak: 0.25, step: 0.6, wMin: 0.36, wMax: 0.6, density: 0.88 });
    // the Star Ferry crossing and a red-sailed junk, in the water in front
    starFerry(k, X(1.2, -10.2), -10.2, 2.5, 0.08);
    junk(k, X(5.0, -10.3), -10.3, 2.4, Math.PI + 0.1, '#b3261e', '#5a3a28', 3);
    canopy(k, rng, 120, k.vx(-21) - 14, k.vx(-21) + 14, -26, -17.4, ['#2f6b3a', '#3a7a42', '#2a6034', '#46874a'], { minY: 0.9, size: [0.16, 0.34] });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Ho Chi Minh City ─────────────────────────────

/** Saigon's narrow tube houses: tall and thin, bright colours, flat roofs with water tanks. */
const tubeHouse: HouseStyle = {
  walls: ['#e9c46a', '#f4a261', '#e76f51', '#8ecae6', '#c9ada7', '#a8dadc', '#f4efe0', '#d4a373', '#f2b5c4', '#9ccc9c'],
  roofs: ['#7b8a92', '#a64b36', '#6b7a82'],
  trim: '#f6f3ea',
  win: '#3d5a6a',
  floors: [3, 5],
  floorH: 0.17,
  w: [0.2, 0.3],
  d: [0.3, 0.4],
  roofKinds: [['flat', 6], ['hip', 2], ['mono', 1]],
  pitch: 0.4,
  chimney: 0,
  gap: [0.0, 0.015],
  door: '#4a5a6a',
  winW: 0.05,
  winH: 0.075,
};

/** Bitexco Financial Tower: a blue-glass lotus bud, narrowing and leaning, with its round helipad jutting out near the top. */
function bitexco(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const gy = k.groundMax(x, z, 0.5, 0.5);
  const rings: Ring[] = [
    { y: -0.12, r: 0.42 }, { y: H * 0.28, r: 0.44 }, { y: H * 0.5, r: 0.4, dx: 0.02 }, { y: H * 0.68, r: 0.33, dx: 0.05 },
    { y: H * 0.84, r: 0.24, dx: 0.1 }, { y: H * 0.95, r: 0.15, dx: 0.15 }, { y: H, r: 0.08, dx: 0.17 },
  ];
  pillar(k, x, gy, z, rings, ['#3f6f98', '#4f82ac', '#5d92b8', '#4a7aa4', '#6aa0c4', '#7fb0d0'], { seg: 10, ao: 0.08, cap: '#9cc3dc' });
  // floors as thin pale lines up the front
  for (let i = 1; i < 16; i++) {
    const yy = gy + (H * i) / 16;
    const t = i / 16;
    const rr = t < 0.28 ? 0.43 : t < 0.5 ? 0.42 : t < 0.68 ? 0.37 : t < 0.84 ? 0.29 : 0.2;
    p.box(x + (t > 0.5 ? 0.04 + (t - 0.5) * 0.25 : 0.01), yy, z + rr * 0.78, rr * 1.3, 0.012, 0.012, '#c9dbe8', { ao: 0 });
  }
  // the helipad: a dish on a short arm, a white H in a ring
  const hy = gy + H * 0.64;
  const hx = x + 0.5;
  p.box(x + 0.3, hy - 0.06, z, 0.26, 0.05, 0.08, '#cfd6da');
  p.cyl(hx, hy - 0.1, z + 0.03, 0.05, 0.27, 0.1, '#aab4ba', { seg: 12, ao: 0 });
  p.cyl(hx, hy, z + 0.03, 0.27, 0.27, 0.03, '#e9eef0', { seg: 12, ao: 0 });
  p.cyl(hx, hy + 0.03, z + 0.03, 0.21, 0.21, 0.004, '#c8302a', { seg: 12, ao: 0 });
  p.box(hx, hy + 0.036, z + 0.03, 0.05, 0.003, 0.15, '#ffffff', { ao: 0 });
  p.box(hx, hy + 0.036, z + 0.03, 0.15, 0.003, 0.05, '#ffffff', { ao: 0 });
  p.cyl(x + 0.17, gy + H, z, 0.01, 0.004, 0.45, '#d9dde0', { seg: 4, ao: 0 });
  k.reserve(x, z, 0.8, 0.55);
}

/** Landmark 81: a very tall dark tower stepping in as it rises, ending in a long needle. Returns the top. */
function landmark81(k: PortKit, x: number, z: number, H: number): number {
  const gy = k.groundMax(x, z, 0.4, 0.4);
  const tiers: Array<[number, number, number]> = [[0.64, 0.4, 0.27], [0.56, 0.36, 0.25], [0.48, 0.32, 0.22], [0.4, 0.28, 0.16], [0.32, 0.25, 0.1]];
  let y = gy;
  tiers.forEach(([w, d, share], i) => {
    y = skyTower(k, x, z, w, d, H * share, { wall: i % 2 ? '#2f4b68' : '#3a5877', win: '#9cc3dc', cols: 3, crown: 'none', y, lit: 0.45 });
  });
  k.solid.box(x, y, z, 0.3, 0.04, 0.22, '#dfe8ee', { ao: 0 });
  k.solid.cyl(x, y + 0.04, z, 0.016, 0.004, 0.7, '#e9eef0', { seg: 5, ao: 0 });
  return y + 0.74;
}

/** A Saigon cathedral in red brick: a gabled nave and a pair of tall square towers with spires. */
function brickCathedral(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.6 * sc, 0.5 * sc);
  p.box(x, y - 0.1, z - 0.15 * sc, 0.8 * sc, 0.1 + 0.55 * sc, 0.9 * sc, '#b8553d');
  p.prism(x, y + 0.55 * sc, z - 0.15 * sc, 0.62 * sc, 0.28 * sc, 0.9 * sc, '#8a3a2a', { ry: 0 });
  for (const dx of [-0.26, 0.26]) {
    p.box(x + dx * sc, y - 0.1, z + 0.28 * sc, 0.26 * sc, 0.1 + 1.0 * sc, 0.26 * sc, '#b8553d');
    p.box(x + dx * sc, y + 1.0 * sc, z + 0.28 * sc, 0.3 * sc, 0.03, 0.3 * sc, '#d8c9a8');
    p.pyramid(x + dx * sc, y + 1.03 * sc, z + 0.28 * sc, 0.26 * sc, 0.55 * sc, 0.26 * sc, '#6b6f78');
    p.cyl(x + dx * sc, y + 1.58 * sc, z + 0.28 * sc, 0.006, 0.006, 0.1 * sc, '#e8b923', { seg: 4 });
    fq(p, x + (dx - 0.04) * sc, x + (dx + 0.04) * sc, y + 0.62 * sc, y + 0.9 * sc, z + 0.411 * sc, '#3a2a28');
  }
  fq(p, x - 0.13 * sc, x + 0.13 * sc, y + 0.02, y + 0.42 * sc, z + 0.3 * sc, '#d8c9a8');
  k.reserve(x, z, 0.6 * sc, 0.6 * sc);
}

const hoChiMinh: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#74a355', land2: '#699a4e', hill: '#4a8442', rock: '#6a8a5a', sand: '#d9cfa8', haze: '#d6e8e0' };
    k.shape = { relief: 0.6, range: 2.2, rise: 7, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    const s = k.mole.dir;
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.0, -11.9, LAND_Y, 1.0, 5);
    // the Saigon river bends away behind the free side of the town
    const x0 = k.vx(-15) + s * 4.4;
    const [a, b] = s > 0 ? [x0, x0 + 3.6] : [x0 - 3.6, x0];
    bay(k, a, b, -34, -11.4, -0.6, 2.2, 8);
    bankPaint(k, '#cdbf94');
  },
  build(k) {
    moleFlag(hoChiMinh, k, -3.0);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x5a16);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    brickCathedral(k, X(-4.6, -14.2), -14.2, 1.05);
    bitexco(k, X(-1.2, -13.8), -13.8, 3.3);
    landmark81(k, X(2.4, -14.9), -14.9, 3.9);
    // tube houses along the quay, more behind the towers
    town(k, tubeHouse, 3, SHORE_Z - 1.3, { rowStep: 0.46, gaps: 0.04, rowRise: 0.5, x0: X(-14, -13), x1: X(3.6, -13) });
    skyline(k, rng, { x0: X(-1.0, -17.5), x1: X(2.4, -17.5), zFront: -17.4, rows: 1, hMin: 1.4, hMax: 2.4, pal: WHITE_TOWERS });
    // river traffic: a cruise boat, sand barges and sampans on the bend and in front
    ship(k, X(5.9, -15.0), -15.0, 2.6, 'ferry', Math.PI / 2 - 0.1, { hull: '#2c5da8', stripe: '#c8302a' });
    ship(k, X(5.7, -18.4), -18.4, 2.8, 'bulker', -Math.PI / 2 + 0.05, { hull: '#4a3a2c', boot: '#2a2018', stripe: '#e9a31a', rng });
    for (const [dx, zz, c] of [[0.8, -10.2, '#e9a31a'], [-3.4, -10.6, '#c8302a'], [3.9, -10.4, '#2c8aa5']] as Array<[number, number, string]>) boatSampan(k, X(dx, zz), zz, c, rng.range(-0.2, 0.2));
    // across the river: low blocks and palms on the far bank
    town(k, tubeHouse, 1, -15.4, { rowStep: 0.46, gaps: 0.1, x0: X(8.4, -15), x1: X(15, -15) });
    groves(k, rng, 26, k.vx(-13) - 12, k.vx(-13) + 12, -17.5, -12.8);
  },
  rows: 0,
  quiet: true,
};

/** A small river boat with a canopy: a long dark hull, a coloured roof. */
function boatSampan(k: PortKit, x: number, z: number, col: Col, ry: number): void {
  const p = k.solid;
  k.at(x, 0, z, ry, 1, () => {
    p.box(0, -0.06, 0, 0.9, 0.1, 0.2, '#3b3f46', { ao: 0.1 });
    p.box(0.5, -0.04, 0, 0.14, 0.12, 0.15, '#3b3f46', { rz: -0.4 });
    p.box(-0.05, 0.04, 0, 0.5, 0.2, 0.17, col);
    p.prism(-0.05, 0.24, 0, 0.5, 0.1, 0.2, '#e9e2d0', { ry: Math.PI / 2 });
    p.rod([-0.42, 0.04, 0], [-0.55, 0.12, 0], 0.012, '#6b5b4a', 3);
  });
}

// ───────────────────────────── Xiamen ─────────────────────────────

/** A Gulangyu villa style: cream and ochre walls, green shutters, red hipped roofs, deep verandas. */
const gulangyu: HouseStyle = {
  walls: ['#f6efe0', '#efe0b0', '#e9c98a', '#f4dcd0', '#dfe8d4', '#f1ece0'],
  roofs: ['#b8402d', '#c4503a', '#a64030', '#c4673f'],
  trim: '#f6f3ea',
  win: '#3d5a50',
  floors: [1, 3],
  floorH: 0.2,
  w: [0.4, 0.62],
  d: [0.36, 0.5],
  roofKinds: [['hip', 6], ['gable', 2]],
  pitch: 0.6,
  chimney: 0.15,
  gap: [0.0, 0.07],
  door: '#4f7a5a',
  shutters: '#4f7a5a',
};

/** An octagonal pavilion with a red dome: Gulangyu's Octagonal Building. */
function octagon(k: PortKit, x: number, z: number, sc = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.3 * sc, 0.3 * sc);
  p.cyl(x, y - 0.12, z, 0.3 * sc, 0.3 * sc, 0.12 + 0.34 * sc, '#f1e6c8', { seg: 8 });
  p.cyl(x, y + 0.34 * sc, z, 0.34 * sc, 0.34 * sc, 0.03, '#d8452a', { seg: 8, ao: 0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    p.box(x + Math.cos(a) * 0.3 * sc, y + 0.04 * sc, z + Math.sin(a) * 0.3 * sc, 0.03, 0.28 * sc, 0.03, '#fbf8ee', { ao: 0 });
  }
  p.lathe(x, y + 0.37 * sc, z, [[0.34 * sc, 0], [0.3 * sc, 0.12 * sc], [0.2 * sc, 0.24 * sc], [0.07 * sc, 0.32 * sc], [0, 0.34 * sc]], '#d8452a', { seg: 8 });
  p.cyl(x, y + 0.71 * sc, z, 0.006, 0.006, 0.1 * sc, '#e8b923', { seg: 4 });
  k.reserve(x, z, 0.4 * sc, 0.4 * sc);
}

const xiamen: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7eaa62', land2: '#72a05a', hill: '#4a8350', rock: '#6a8560', sand: '#e0d3a8', haze: '#d6e6e6' };
    k.shape = { relief: 1.8, range: 5.4, rise: 4.0, rough: 0.55, freq: 0.1 };
    k.shore = 'quay';
    const s = k.mole.dir;
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.2, -11.9, LAND_Y, 1.0, 4);
    // Gulangyu: a hilly island in the water on the free side, a narrow strait behind it
    const ix = k.vx(-11.2) + s * 3.9;
    bay(k, ix - 5.4, ix + 5.4, -14.6, -12.4, -0.6, 1.4, 1.0);
    k.feature((x, z, h) => {
      const dx = (x - ix) / 3.7;
      const dz = (z + 11.3) / 1.45;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= 1) return h;
      return Math.max(h, 1.9 * Math.pow(1 - d * d, 1.3) - 0.12);
    });
    const g = c3('#4f8a4f');
    k.paint((x, y, z, slope, c) => {
      if (Math.abs(x - ix) < 4 && z > -13.2 && y > 0.2) c.lerp(g, 0.5 * smooth(0.3, 1.4, y));
    });
  },
  build(k) {
    moleFlag(xiamen, k, -0.6);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x8a1);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    const ix = X(3.9, -11.2);
    // the island's villas in tiers up the slope, an octagonal pavilion at the water, trees between
    town(k, gulangyu, 5, -10.55, { rowStep: 0.4, gaps: 0.1, x0: ix - 3.6, x1: ix + 3.6, minY: 0.3, maxSlope: 0.7, rowRise: 0 });
    octagon(k, ix - 1.2, -10.5, 1.0);
    p0(k, ix, rng);
    // the mainland: the twin towers, a skyline of blocks, cranes at the far end
    skyTower(k, X(-2.9, -14.6), -14.6, 0.56, 0.5, 3.6, { wall: '#52718a', win: '#b7d3e3', cols: 2, crown: 'pyr', crownCol: '#cfd8de' });
    skyTower(k, X(-2.0, -14.8), -14.8, 0.56, 0.5, 3.3, { wall: '#5a7a94', win: '#b7d3e3', cols: 2, crown: 'pyr', crownCol: '#cfd8de' });
    skyline(k, rng, { x0: X(-14, -15), x1: X(0.8, -15), zFront: -13.7, rows: 3, hMin: 0.9, hMax: 2.4, pal: WHITE_TOWERS, cx: X(-3, -15), peak: 0.3, step: 0.6, density: 0.85 });
    terminal(k, rng, { x0: X(-7.2, -12.5), x1: X(-4.8, -12.5), cranes: 3, craneCol: '#2c8aa5', craneS: 0.85, rows: 2, tiers: 3, yardN: 0 });
    groves(k, rng, 20, k.vx(-13) - 12, k.vx(-13) + 8, -17.5, -12.8);
  },
  rows: 0,
  quiet: true,
};

/** Banyans and palms on the island's slopes, and the Sunlight Rock at its crown. */
function p0(k: PortKit, ix: number, rng: Rng): void {
  const p = k.solid;
  const cy = k.ground(ix + 0.2, -11.6);
  p.rock(ix + 0.2, cy - 0.12, -11.6, 0.34, '#9c9a90', { sy: 0.9 });
  p.rock(ix + 0.45, cy - 0.1, -11.7, 0.22, '#8c8a80', { sy: 1.1 });
  groves(k, rng, 14, ix - 3.4, ix + 3.4, -12.3, -10.4, { minY: 0.3, size: [0.9, 1.3] });
  for (let i = 0; i < 10; i++) {
    const x = ix + rng.range(-3.4, 3.4);
    const z = rng.range(-12.4, -10.5);
    const y = k.ground(x, z);
    if (y > 0.3 && !k.isReserved(x, z, 0.1)) p.blob(x, y + 0.14, z, rng.range(0.14, 0.24), pick(rng, ['#3f7a40', '#4a8a45', '#35703a']), { sy: 0.85 });
  }
}

// ───────────────────────────── Kaohsiung ─────────────────────────────

/**
 * The 85 Sky Tower: a podium, two separate legs, then one wide shaft that tapers to a crown and a spire: the shape of
 * the character for "tall". Gold-brown glass.
 */
function skyTower85(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const gy = k.groundMax(x, z, 0.8, 0.5);
  const gold = '#b98f4a';
  const win = '#e9d9a8';
  const base = skyTower(k, x, z, 1.5, 0.9, H * 0.14, { wall: '#d4b878', win: '#7a6a44', cols: 5, crown: 'none', y: gy });
  const legW = 0.52;
  const legTop = base + H * 0.4;
  for (const dx of [-0.46, 0.46]) skyTower(k, x + dx, z, legW, 0.78, H * 0.4, { wall: gold, win, cols: 2, crown: 'none', y: base });
  // the bridge where the legs join: the shaft
  const a = skyTower(k, x, z, 1.44, 0.8, H * 0.2, { wall: '#c39a52', win, cols: 4, crown: 'none', y: legTop });
  const b = skyTower(k, x, z, 1.04, 0.62, H * 0.17, { wall: '#c8a05a', win, cols: 3, crown: 'none', y: a });
  const c = skyTower(k, x, z, 0.64, 0.46, H * 0.09, { wall: '#d0aa66', win, cols: 2, crown: 'none', y: b });
  p.pyramid(x, c, z, 0.5, H * 0.1, 0.38, '#e0c07a');
  p.cyl(x, c + H * 0.1, z, 0.016, 0.004, H * 0.14, '#e9eef0', { seg: 5, ao: 0 });
  k.reserve(x, z, 0.95, 0.6);
}

/** The Kaohsiung Pop Music Center: long low halls under a rolling, wave-edged white roof of ribbons. */
function popMusic(k: PortKit, x: number, z: number, len: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, len / 2, 0.6);
  const n = 28;
  const pts: Array<[number, number]> = [[-len / 2, 0]];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wave = 0.2 * Math.sin(t * Math.PI * 5.2 + 0.4) + 0.14 * Math.sin(t * Math.PI * 2.2 + 1.2);
    pts.push([-len / 2 + t * len, 0.52 + wave + 0.12 * Math.sin(t * Math.PI)]);
  }
  pts.push([len / 2, 0]);
  k.glass.extrude(pts, 0.8, x, y - 0.02, z, '#4f8a96', { ao: 0.06 });
  // the white ribbon of roof, a little taller and deeper, riding over the glass
  const top: Array<[number, number]> = pts.map(([px, py], i) => [px, i === 0 || i === pts.length - 1 ? 0 : py + 0.07]);
  const under: Array<[number, number]> = pts.map(([px, py], i) => [px, i === 0 || i === pts.length - 1 ? 0 : Math.max(0.02, py - 0.04)]).reverse() as Array<[number, number]>;
  const ribbon: Array<[number, number]> = [...top.slice(1, -1), ...under.slice(1, -1)];
  p.extrude(ribbon, 0.96, x, y - 0.02, z, '#f2f5f6', { ao: 0 });
  // a tall wave of white at the back end
  p.box(x + len * 0.3, y, z - 0.52, len * 0.28, 0.8, 0.28, '#e8eef0');
  k.reserve(x, z, len / 2 + 0.1, 0.7);
}

const kaohsiung: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7aa65c', land2: '#6f9c56', hill: '#4a8350', rock: '#6a8560', sand: '#e0d3a8', haze: '#d6e6e6' };
    k.shape = { relief: 1.4, range: 4.2, rise: 4.6, rough: 0.5, freq: 0.1 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.4, -11.9, LAND_Y, 1.0, 4);
  },
  build(k) {
    moleFlag(kaohsiung, k, -2.0);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x4e55);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    skyTower85(k, X(-0.4, -14.7), -14.7, 3.9);
    popMusic(k, X(3.4, -13.1), -13.1, 3.8);
    terminal(k, rng, { x0: X(-7.2, -12.5), x1: X(-4.2, -12.5), cranes: 3, craneCol: '#e9a31a', craneS: 0.85, rows: 2, tiers: 3, yardN: 0, ships: [[X(-5.8, -12), 4.4, '#1f2e4d']] });
    skyline(k, rng, { x0: X(-14, -16), x1: X(8, -16), zFront: -15.9, rows: 2, hMin: 0.9, hMax: 2.2, pal: WHITE_TOWERS, cx: X(-3, -16), peak: 0.2, step: 0.6, density: 0.7 });
    town(k, blocks, 2, SHORE_Z - 1.3, { rowStep: 0.5, gaps: 0.15, x0: X(6.0, -13), x1: X(14, -13) });
    groves(k, rng, 26, k.vx(-13) - 12, k.vx(-13) + 8, -17.5, -12.6);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Manila ─────────────────────────────

/** A jeepney: a long painted body behind a chrome hood, a striped roof, a band of windows. Bow to +x. */
function jeepney(k: PortKit, x: number, z: number, col: Col, trim: Col, ry = 0, sc = 1): void {
  const p = k.solid;
  k.at(x, LAND_Y + 0.02, z, ry, sc, () => {
    p.box(-0.04, 0.03, 0, 0.3, 0.07, 0.12, col);
    p.box(0.17, 0.03, 0, 0.1, 0.05, 0.11, '#d9dde0');
    p.box(-0.05, 0.1, 0, 0.26, 0.07, 0.115, col);
    fq(p, -0.17, 0.07, 0.11, 0.155, 0.0582, '#2a3a4c');
    p.box(-0.05, 0.17, 0, 0.27, 0.02, 0.125, trim, { ao: 0 });
    p.box(-0.04, 0.05, 0.061, 0.3, 0.015, 0.004, trim, { ao: 0 });
    for (const wx of [-0.12, 0.1]) p.box(wx, 0, 0.03, 0.05, 0.04, 0.02, '#23262b', { ao: 0 });
  });
}

/** Manila Cathedral: a cream stone Romanesque front with three arched doors, a tall bell tower, and a grey dome on its drum behind. */
function manilaCathedral(k: PortKit, x: number, z: number, sc: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.0 * sc, 0.6 * sc);
  const stone = '#e6dcc3';
  const dark = '#8f8a7e';
  p.box(x, y - 0.12, z - 0.3 * sc, 1.6 * sc, 0.12 + 0.78 * sc, 1.4 * sc, stone);
  p.prism(x, y + 0.78 * sc, z - 0.3 * sc, 1.1 * sc, 0.3 * sc, 1.6 * sc, '#8a8680', { ry: Math.PI / 2 });
  // the front: a taller facade with a pediment, three doors and a rose window
  p.box(x, y - 0.12, z + 0.42 * sc, 1.3 * sc, 0.12 + 1.0 * sc, 0.2 * sc, stone);
  p.tri([x - 0.65 * sc, y + 1.0 * sc, z + 0.53 * sc], [x + 0.65 * sc, y + 1.0 * sc, z + 0.53 * sc], [x, y + 1.3 * sc, z + 0.53 * sc], '#efe6cf');
  for (const dx of [-0.38, 0, 0.38]) {
    fq(p, x + (dx - 0.1) * sc, x + (dx + 0.1) * sc, y + 0.02, y + 0.42 * sc, z + 0.522 * sc, '#4a3a30');
    p.ball(x + dx * sc, y + 0.42 * sc, z + 0.52 * sc, 0.1 * sc, '#4a3a30', { sy: 0.8, sz: 0.1 });
  }
  p.ball(x, y + 0.78 * sc, z + 0.525 * sc, 0.1 * sc, '#6f7f8a', { sz: 0.1 });
  p.box(x, y + 0.55 * sc, z + 0.525 * sc, 1.2 * sc, 0.025, 0.02, dark, { ao: 0 });
  // the bell tower at the right-hand corner, with a louvred belfry and a domed cap
  const tx = x + 0.82 * sc;
  p.box(tx, y - 0.12, z + 0.4 * sc, 0.36 * sc, 0.12 + 1.45 * sc, 0.36 * sc, stone);
  p.box(tx, y + 1.3 * sc, z + 0.4 * sc, 0.3 * sc, 0.26 * sc, 0.3 * sc, '#d9cfb4');
  fq(p, tx - 0.07 * sc, tx + 0.07 * sc, y + 1.34 * sc, y + 1.52 * sc, z + 0.552 * sc, '#3a3028');
  p.box(tx, y + 1.56 * sc, z + 0.4 * sc, 0.4 * sc, 0.03, 0.4 * sc, '#cfc4a8');
  p.lathe(tx, y + 1.59 * sc, z + 0.4 * sc, [[0.18 * sc, 0], [0.17 * sc, 0.1 * sc], [0.09 * sc, 0.2 * sc], [0, 0.26 * sc]], '#7b8a8f', { seg: 8 });
  p.cyl(tx, y + 1.84 * sc, z + 0.4 * sc, 0.006, 0.006, 0.12 * sc, '#e8b923', { seg: 4 });
  // the dome behind the front: an octagonal drum and a grey dome with a lantern
  const dz = z - 0.35 * sc;
  p.cyl(x - 0.1 * sc, y + 0.74 * sc, dz, 0.42 * sc, 0.42 * sc, 0.34 * sc, stone, { seg: 8 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    p.box(x - 0.1 * sc + Math.cos(a) * 0.42 * sc, y + 0.82 * sc, dz + Math.sin(a) * 0.42 * sc, 0.06, 0.2 * sc, 0.06, '#4a4036', { ao: 0 });
  }
  p.lathe(x - 0.1 * sc, y + 1.08 * sc, dz, [[0.44 * sc, 0], [0.44 * sc, 0.06 * sc], [0.36 * sc, 0.22 * sc], [0.2 * sc, 0.38 * sc], [0.07 * sc, 0.46 * sc], [0, 0.48 * sc]], '#8c9aa0', { seg: 12 });
  p.cyl(x - 0.1 * sc, y + 1.54 * sc, dz, 0.07 * sc, 0.07 * sc, 0.14 * sc, stone, { seg: 8 });
  p.cone(x - 0.1 * sc, y + 1.68 * sc, dz, 0.08 * sc, 0.14 * sc, '#7b8a8f', { seg: 8 });
  k.reserve(x, z, 1.2 * sc, 0.8 * sc);
}

const manilaStyle: HouseStyle = {
  walls: ['#f1e7cf', '#e9d29a', '#eab9a0', '#bcd7d4', '#f4efe4', '#e5c07b', '#e8a08a'],
  roofs: ['#b4553a', '#c4673f', '#8a8f94'],
  trim: '#f6f3ea',
  win: '#3d5a6a',
  floors: [2, 4],
  floorH: 0.18,
  w: [0.3, 0.48],
  d: [0.34, 0.46],
  roofKinds: [['flat', 5], ['hip', 3], ['gable', 2]],
  pitch: 0.4,
  chimney: 0,
  gap: [0.0, 0.05],
  door: '#4a6a8a',
};

const manila: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#86aa5a', land2: '#7aa254', hill: '#5a8a4a', rock: '#7a8a68', sand: '#e0d3a8', haze: '#d9e8e4' };
    k.shape = { relief: 0.8, range: 2.6, rise: 6, rough: 0.35, freq: 0.08 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -16.5, -11.9, LAND_Y, 1.0, 5);
  },
  build(k) {
    moleFlag(manila, k, 3.6);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x3a11);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    const p = k.solid;
    // Intramuros: a stone wall along the quay with a round bastion at its end, and the cathedral behind it
    const wx0 = X(-5.4, -12.7);
    const wx1 = X(1.2, -12.7);
    const [a, b] = wx0 < wx1 ? [wx0, wx1] : [wx1, wx0];
    battlement(k, (a + b) / 2, -12.7, b - a, 0.4, 0.5, '#b8a98a', LAND_Y);
    roundTower(k, wx1, -12.7, 0.3, 0.8, '#b8a98a', '#7a6a58', LAND_Y - 0.03);
    manilaCathedral(k, X(-1.6, -14.2), -14.2, 1.4);
    // jeepneys along the bayfront road in front of the wall
    const jc: Array<[Col, Col]> = [['#e0402e', '#f7f4ea'], ['#f2c230', '#2f7fd0'], ['#2f7fd0', '#f2c230'], ['#2fae6a', '#f7f4ea'], ['#e8761f', '#2a2f38'], ['#9a4fc4', '#f2c230']];
    jc.forEach(([c, t], i) => jeepney(k, X(-5.2 + i * 1.25, -12.2), -12.2, c, t, s > 0 ? 0 : Math.PI, 1.5));
    // the bayfront towers on the free side
    skyline(k, rng, { x0: X(2.2, -15), x1: X(10, -15), zFront: -13.8, rows: 3, hMin: 1.4, hMax: 3.4, pal: [...WHITE_TOWERS, ...GLASS_TOWERS], cx: X(5, -15), peak: 0.5, step: 0.75, density: 0.9 });
    town(k, manilaStyle, 3, SHORE_Z - 1.3, { rowStep: 0.55, gaps: 0.1, x0: X(-14, -13), x1: X(-6.2, -13) });
    town(k, manilaStyle, 2, SHORE_Z - 3.4, { rowStep: 0.55, gaps: 0.15, x0: X(-6.0, -13), x1: X(1.4, -13) });
    groves(k, rng, 30, k.vx(-13) - 12, k.vx(-13) + 12, -17.5, -12.5);
    void p;
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Shanghai ─────────────────────────────

/** The Oriental Pearl Tower: three slanting legs, a huge pink sphere, a second, a small one on top and a spire. */
function pearlTower(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const gy = k.groundMax(x, z, 0.5, 0.5);
  const pink = '#e0589a';
  const pale = '#f5b0cf';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    const bx = x + Math.cos(a) * 0.5;
    const bz = z + Math.sin(a) * 0.5;
    p.rod([bx, gy - 0.05, bz], [x + Math.cos(a) * 0.05, gy + H * 0.27, z + Math.sin(a) * 0.05], 0.05, '#d84a8a', 6);
    p.ball(bx, gy + 0.12, bz, 0.13, pale);
  }
  p.cyl(x, gy + H * 0.27, z, 0.07, 0.06, H * 0.5, '#e9e4e0', { seg: 8 });
  // the great lower sphere with a band, the second, the little one
  p.ball(x, gy + H * 0.34, z, 0.4, pink);
  p.cyl(x, gy + H * 0.34 - 0.03, z, 0.402, 0.402, 0.06, pale, { seg: 14, ao: 0 });
  p.ball(x, gy + H * 0.64, z, 0.24, pink);
  p.cyl(x, gy + H * 0.64 - 0.025, z, 0.242, 0.242, 0.05, pale, { seg: 12, ao: 0 });
  p.cyl(x, gy + H * 0.64, z, 0.05, 0.03, H * 0.2, '#e9e4e0', { seg: 6 });
  p.ball(x, gy + H * 0.86, z, 0.13, pink);
  p.cyl(x, gy + H * 0.86, z, 0.02, 0.005, H * 0.28, '#f1eee6', { seg: 5, ao: 0 });
  k.reserve(x, z, 0.65, 0.65);
}

/** The Shanghai Tower: a rounded tower turning as it rises and shrinking, glass in two tones. */
function shanghaiTower(k: PortKit, x: number, z: number, H: number): void {
  const gy = k.groundMax(x, z, 0.5, 0.5);
  const rings: Ring[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rings.push({ y: -0.1 + t * (H + 0.1), r: 0.48 * (1 - 0.72 * Math.pow(t, 1.35)), rot: t * 1.9 });
  }
  const cols: Col[] = [];
  for (let i = 0; i < n; i++) cols.push(i % 2 ? '#8fa9ba' : '#a9bfcd');
  pillar(k, x, gy, z, rings, cols, { seg: 6, ao: 0.08, cap: '#d9e4ea' });
  k.solid.cyl(x, gy + H, z, 0.014, 0.004, 0.4, '#e9eef0', { seg: 4, ao: 0 });
  k.reserve(x, z, 0.55, 0.55);
}

/** A Bund building: a heavy stone block with rows of windows and a cornice; some carry a dome, a pyramid, or a clock tower. */
function bundBlock(k: PortKit, x: number, z: number, w: number, h: number, wall: Col, cap: 'flat' | 'dome' | 'pyr' | 'clock'): void {
  const d = 0.62;
  const top = skyTower(k, x, z, w, d, h, { wall, win: '#4a4036', cols: Math.max(3, Math.round(w / 0.17)), crown: 'none', floors: Math.max(4, Math.round(h / 0.2)), lit: 0.25 });
  k.solid.box(x, top - 0.03, z, w + 0.05, 0.05, d + 0.05, tint(wall, 0.12), { ao: 0 });
  k.solid.box(x, top - 0.06, z + d / 2 + 0.02, w * 0.84, 0.03, 0.03, tint(wall, 0.1), { ao: 0 });
  // stone columns on the front of the lower floors
  const n = Math.max(3, Math.round(w / 0.2));
  for (let i = 0; i <= n; i++) k.solid.boxV(x - w / 2 + 0.05 + (i * (w - 0.1)) / n, top - h, z + d / 2 + 0.02, 0.025, h * 0.5, 0.03, tint(wall, 0.14), { ao: 0 });
  if (cap === 'dome') {
    k.solid.cyl(x, top + 0.02, z + 0.02, 0.2, 0.2, 0.12, tint(wall, 0.05), { seg: 10 });
    k.solid.lathe(x, top + 0.14, z + 0.02, [[0.2, 0], [0.18, 0.1], [0.1, 0.2], [0.0, 0.26]], '#6f9a80', { seg: 10 });
  } else if (cap === 'pyr') k.solid.pyramid(x, top + 0.02, z, w * 0.8, 0.3, d * 0.8, '#6f9a80');
  else if (cap === 'clock') {
    k.solid.box(x + w * 0.2, top, z, 0.32, 0.8, 0.32, tint(wall, 0.04));
    k.solid.ball(x + w * 0.2, top + 0.55, z + 0.17, 0.09, '#f6f3ea', { sz: 0.25 });
    k.solid.pyramid(x + w * 0.2, top + 0.8, z, 0.36, 0.32, 0.36, '#6f9a80');
  }
}

const bundWalls: Col[] = ['#cfc6b0', '#bfb6a0', '#d8cfb8', '#b3aa96', '#c9bea4'];

const shanghai: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8ca874', land2: '#82a06c', hill: '#6a9460', rock: '#82927a', sand: '#d9cfae', haze: '#d9e4e6' };
    k.shape = { relief: 0.5, range: 1.4, rise: 8, rough: 0.25, freq: 0.07 };
    k.shore = 'quay';
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -18.0, -11.9, LAND_Y, 1.0, 6);
  },
  build(k) {
    moleFlag(shanghai, k, 5.4);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0x5a49);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // Pudong's towers: the Pearl, the Shanghai Tower, Jin Mao's stacked tiers and the bottle-opener
    pearlTower(k, X(1.7, -14.3), -14.3, 3.5);
    shanghaiTower(k, X(-1.6, -15.2), -15.2, 4.1);
    {
      const gy = k.groundMax(k.vx(-15), -15.4, 0.5, 0.4);
      let y = gy;
      const jx = X(-3.9, -15.4);
      [[0.54, 0.5], [0.46, 0.42], [0.4, 0.36], [0.32, 0.3], [0.24, 0.24]].forEach(([w, h], i) => {
        y = skyTower(k, jx, -15.4, w, w * 0.9, h * 2.2 * (i === 0 ? 1.3 : 1), { wall: '#aebcc4', win: '#4a6076', cols: 2, crown: 'none', y, lit: 0.3 });
      });
      k.solid.pyramid(jx, y, -15.4, 0.22, 0.34, 0.2, '#d9e4ea');
      k.solid.cyl(jx, y + 0.34, -15.4, 0.01, 0.004, 0.3, '#e9eef0', { seg: 4, ao: 0 });
    }
    const wx = X(3.8, -15.6);
    const wtop = skyTower(k, wx, -15.6, 0.62, 0.4, 3.0, { wall: '#9bb3c2', win: '#46607a', cols: 2, crown: 'flat', lit: 0.3 });
    k.solid.quad([wx - 0.1, wtop - 0.55, -15.6 + 0.208], [wx + 0.1, wtop - 0.55, -15.6 + 0.208], [wx + 0.17, wtop - 0.08, -15.6 + 0.208], [wx - 0.17, wtop - 0.08, -15.6 + 0.208], '#26323f');
    // the crowd of Pudong glass behind them
    skyline(k, rng, { x0: X(-14, -17), x1: X(14, -17), zFront: -16.4, rows: 3, hMin: 1.0, hMax: 3.0, pal: GLASS_TOWERS, cx: X(0, -17), peak: 0.3, step: 0.7, density: 0.8, wMin: 0.34, wMax: 0.56 });
    // the Bund: stone facades along the whole front, a dome, a clock tower, a pyramid cap
    const bw = [1.0, 0.8, 1.1, 0.7, 0.95, 1.2, 0.8, 1.0, 0.9, 1.1, 0.8, 1.0];
    const caps: Array<'flat' | 'dome' | 'pyr' | 'clock'> = ['flat', 'dome', 'flat', 'pyr', 'flat', 'clock', 'flat', 'dome', 'flat', 'pyr', 'flat', 'flat'];
    let bx = -8.0;
    bw.forEach((w, i) => {
      const x = X(bx + w / 2, -13.1);
      bx += w + 0.03;
      bundBlock(k, x, -13.05 - (i % 2) * 0.05, w, 0.85 + ((i * 5) % 4) * 0.17, bundWalls[i % bundWalls.length], caps[i]);
    });
    // river traffic
    ship(k, X(3.0, -10.4), -10.4, 3.0, 'bulker', 0.04, { hull: '#2d4a3c', stripe: '#c8302a', rng });
    ship(k, X(-3.8, -10.0), -10.0, 2.2, 'ferry', Math.PI + 0.06, { hull: '#2c5da8', stripe: '#c8302a' });
    groves(k, rng, 16, k.vx(-13) - 10, k.vx(-13) + 10, -18, -13.8);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Busan ─────────────────────────────

const PASTELS: Col[] = ['#e86a8a', '#f2a65a', '#f4d35e', '#7fc8a9', '#5aa9e6', '#c58bd9', '#f28b82', '#a0d995', '#ffd6a5', '#9bd1e6', '#f7b7d2', '#d4a373'];

/** A pastel cube house stepped into the hillside: a box that sinks into the slope, a dark flat roof, two windows. */
function cubeHouse(k: PortKit, x: number, z: number, w: number, d: number, h: number, col: Col, rng: Rng): void {
  const p = k.solid;
  const gTop = k.groundMax(x, z, w / 2, d / 2);
  const gLow = k.groundMin(x, z, w / 2, d / 2);
  const sink = gTop - gLow + 0.06;
  p.boxV(x, gTop - sink, z, w, h + sink, d, col);
  p.box(x, gTop + h, z, w + 0.02, 0.025, d + 0.02, rng.chance(0.5) ? tint(col, -0.28) : '#5a7a9a', { ao: 0 });
  if (rng.chance(0.8)) fq(p, x - w * 0.3, x - w * 0.08, gTop + h * 0.38, gTop + h * 0.7, z + d / 2 + 0.004, '#2f4a68');
  if (rng.chance(0.55)) fq(p, x + w * 0.1, x + w * 0.32, gTop + h * 0.38, gTop + h * 0.7, z + d / 2 + 0.004, '#2f4a68');
  k.reserve(x, z, w / 2 + 0.01, d / 2 + 0.01);
}

/** Busan Tower: a lattice tower on its hill with a round lookout, a ring deck and a spire. */
function busanTower(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.3, 0.3) - 0.04;
  const c = '#e9eaec';
  // a concrete plinth reaching down the slope under all four legs
  p.box(x, k.groundMin(x, z, 0.3, 0.3) - 0.12, z, 0.7, y - k.groundMin(x, z, 0.3, 0.3) + 0.14, 0.7, '#b9b5ab');
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>) {
    p.rod([x + dx * 0.26, y, z + dz * 0.26], [x + dx * 0.09, y + H * 0.55, z + dz * 0.09], 0.025, c, 5);
    p.rod([x + dx * 0.09, y + H * 0.55, z + dz * 0.09], [x + dx * 0.05, y + H * 0.72, z + dz * 0.05], 0.022, c, 5);
  }
  for (const t of [0.12, 0.26, 0.4]) {
    const r = lerp(0.26, 0.09, t / 0.55);
    p.box(x, y + H * t, z, r * 2, 0.02, 0.02, c, { ao: 0 });
    p.box(x, y + H * t, z + r, 0.02, 0.02, 0.02, c, { ao: 0 });
  }
  p.rod([x - 0.26, y, z + 0.26], [x + 0.09, y + H * 0.55, z + 0.09], 0.012, '#c9ced2', 4);
  p.rod([x + 0.26, y, z + 0.26], [x - 0.09, y + H * 0.55, z + 0.09], 0.012, '#c9ced2', 4);
  // the lookout: a squashed ball with a band of glass, a ring deck above it
  p.ball(x, y + H * 0.66, z, 0.24, '#dfe3e6', { sy: 0.55 });
  k.glass.cyl(x, y + H * 0.66 - 0.05, z, 0.245, 0.245, 0.1, '#6f9cb8', { seg: 14 });
  p.cyl(x, y + H * 0.72, z, 0.2, 0.2, 0.03, '#c8302a', { seg: 14 });
  p.cyl(x, y + H * 0.75, z, 0.07, 0.04, H * 0.14, c, { seg: 8 });
  p.cyl(x, y + H * 0.89, z, 0.02, 0.004, H * 0.18, '#c8302a', { seg: 5, ao: 0 });
  k.reserve(x, z, 0.45, 0.45);
}

/**
 * The Gwangan Bridge: a double-deck girder on piers in the water, two tall white portal towers, a sagging main cable on each side
 * with hangers, side spans running down to the ends. `towers` are the x of the two pylons.
 */
function gwangan(k: PortKit, x0: number, x1: number, z: number, towers: [number, number], towerH: number, deck: number): void {
  const p = k.solid;
  const half = 0.13;
  const white = '#f1f3f4';
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  // the girder: two decks with a truss between them, and a row of piers into the water
  p.box(cx, deck - 0.02, z, len, 0.05, half * 2 + 0.06, '#8d9399');
  p.box(cx, deck - 0.17, z, len, 0.05, half * 2 + 0.06, '#7d838a');
  for (let x = x0 + 0.2; x < x1; x += 0.4) p.box(x, deck - 0.17, z + half, 0.018, 0.17, 0.018, '#b9c0c6', { ao: 0 });
  p.box(cx, deck + 0.03, z + half + 0.02, len, 0.045, 0.02, '#d9dde0', { ao: 0 });
  for (let x = x0 + 0.12; x < x1 + 0.2; x += 1.7) p.box(Math.min(x, x1 - 0.12), -0.9, z, 0.2, 0.9 + deck - 0.2, 0.3, '#b3b0a6');
  // the pylons: two legs, three cross beams, a cap
  for (const tx of towers) {
    for (const sd of [-1, 1]) p.box(tx, -0.9, z + sd * half, 0.12, 0.9 + deck + towerH, 0.1, white);
    for (const f of [0.28, 0.62, 0.93]) p.box(tx, deck + towerH * f, z, 0.1, 0.07, half * 2 + 0.06, white, { ao: 0 });
    p.box(tx, deck + towerH, z, 0.14, 0.05, half * 2 + 0.1, '#d9dde0', { ao: 0 });
  }
  // the main cables
  const [ta, tb] = towers;
  const sag = towerH * 0.78;
  const cable = '#e4e8ea';
  const n = 16;
  for (const sd of [-1, 1]) {
    const zz = z + sd * half;
    let prev: [number, number] = [ta, deck + towerH];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const cur: [number, number] = [lerp(ta, tb, t), deck + towerH - sag * 4 * t * (1 - t)];
      p.rod([prev[0], prev[1], zz], [cur[0], cur[1], zz], 0.02, cable, 4);
      if (i < n && i % 1 === 0) p.rod([cur[0], cur[1], zz], [cur[0], deck + 0.04, zz], 0.006, '#c9d0d5', 3);
      prev = cur;
    }
    for (const [from, to] of [[ta, x0], [tb, x1]] as Array<[number, number]>) {
      let pv: [number, number] = [from, deck + towerH];
      for (let i = 1; i <= 7; i++) {
        const t = i / 7;
        const cur: [number, number] = [lerp(from, to, t), deck + towerH - (towerH - 0.05) * (0.3 * t + 0.7 * t * t)];
        p.rod([pv[0], pv[1], zz], [cur[0], cur[1], zz], 0.02, cable, 4);
        if (i < 7) p.rod([cur[0], cur[1], zz], [cur[0], deck + 0.04, zz], 0.006, '#c9d0d5', 3);
        pv = cur;
      }
    }
  }
  k.reserve(cx, z, len / 2, 0.3);
}

const busan: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#78a45e', land2: '#6e9a58', hill: '#4a8350', rock: '#6a8a5a', sand: '#e0d3a8', haze: '#d6e4e6' };
    k.shape = { relief: 2.0, range: 6.0, rise: 4.0, rough: 0.6, freq: 0.1 };
    k.shore = 'quay';
    const s = k.mole.dir;
    flat(k, k.vx(-13) - 30, k.vx(-13) + 30, -14.6, -11.9, LAND_Y, 1.0, 1.6);
    // Gamcheon's hill on the head side, Yongdusan's smaller hill with the tower on the free side
    k.bump(k.vx(-17) - s * 4.6, -17.6, 5.4, 4.6, 2.6, 0.9);
    k.bump(k.vx(-16) + s * 3.4, -15.8, 2.6, 2.2, 1.5, 1.0);
  },
  build(k) {
    moleFlag(busan, k, 4.8);
    const s = k.mole.dir;
    const rng = new Rng(k.seed ^ 0xb054);
    const X = (dx: number, z: number): number => k.vx(z) + s * dx;
    // the Gwangan Bridge crosses the whole view in the water in front, white towers and a deck on piers
    const bx = k.vx(-10.6);
    gwangan(k, bx - 11, bx + 11, -10.7, [bx - 3.4, bx + 3.4], 2.15, 0.95);
    // Gamcheon: pastel cubes stacked up the hillside in tight terraces
    const gx = X(-4.6, -16);
    for (let r = 0; r < 11; r++) {
      const zz = -13.7 - r * 0.42;
      for (let xx = gx - 4.6; xx < gx + 4.6; xx += 0.36 + rng.range(0, 0.06)) {
        const x = xx + (r % 2) * 0.17 + rng.range(-0.03, 0.03);
        const y = k.ground(x, zz);
        if (y < 0.5 || k.isReserved(x, zz, 0.02) || rng.chance(0.1)) continue;
        cubeHouse(k, x, zz, rng.range(0.28, 0.34), rng.range(0.26, 0.3), rng.range(0.16, 0.26), pick(rng, PASTELS), rng);
      }
    }
    busanTower(k, X(3.4, -15.8), -15.8, 2.4);
    // harbour town and cranes along the rest of the front
    town(k, blocks, 2, SHORE_Z - 1.3, { rowStep: 0.55, gaps: 0.12, x0: X(-0.4, -13), x1: X(14, -13) });
    terminal(k, rng, { x0: X(5.6, -12.5), x1: X(8.0, -12.5), cranes: 3, craneCol: '#2a8c8c', craneS: 0.85, rows: 2, tiers: 3, yardN: 0 });
    groves(k, rng, 20, k.vx(-13) - 12, k.vx(-13) + 12, -17.5, -12.6);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── exports ─────────────────────────────

export const LANDMARKS: Record<string, Landmark> = { singapore, colombo, portKlang, tanjungPelepas, laemChabang, yantian, ningbo, haiPhong, hongKong, hoChiMinh, xiamen, kaohsiung, manila, shanghai, busan };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Colombo', 'southasia', 'colombo'],
  ['Port Klang', 'seasia', 'portKlang'],
  ['Tanjung Pelepas', 'seasia', 'tanjungPelepas'],
  ['Singapore', 'seasia', 'singapore'],
  ['Laem Chabang', 'seasia', 'laemChabang'],
  ['Ho Chi Minh City', 'seasia', 'hoChiMinh'],
  ['Hai Phong', 'seasia', 'haiPhong'],
  ['Hong Kong', 'eastasia', 'hongKong'],
  ['Yantian', 'eastasia', 'yantian'],
  ['Xiamen', 'eastasia', 'xiamen'],
  ['Kaohsiung', 'eastasia', 'kaohsiung'],
  ['Manila', 'seasia', 'manila'],
  ['Ningbo', 'eastasia', 'ningbo'],
  ['Shanghai', 'eastasia', 'shanghai'],
  ['Busan', 'eastasia', 'busan'],
];
