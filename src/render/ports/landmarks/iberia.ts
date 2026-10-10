import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, Part, SHORE_Z, LAND_Y, clamp, lerp, smooth, fbm, noise2, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import { REGIONS, type RegionId } from '../regions';
import { buildTown, tint, tree, type HouseStyle } from '../town';
import { cableStayed, suspension, roundTower, battlement } from '../structures';
import { gantryCrane, containerStack, stack, boat } from '../props';
import { lighthouse } from '../harbour';

/**
 * Spain, Portugal and Gibraltar: the Rock, the Sagrada Familia, Valencia's City of Arts and Sciences,
 * Lisbon's red bridge and Cristo Rei, Seville's Giralda, Tenerife's Teide, Algeciras' cranes, Cadiz,
 * Malaga, Las Palmas, Funchal, Porto, Huelva, Ceuta and Vigo.
 */

// ───────────────────────────── helpers ─────────────────────────────

/** Smooth interpolation through [x, y] points (`soft` 0 = straight lines, 1 = smoothstep between points). */
function curve(pts: Array<[number, number]>, x: number, soft = 0.5): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const t = (x - x0) / (x1 - x0);
      return lerp(y0, y1, lerp(t, t * t * (3 - 2 * t), soft));
    }
  }
  return pts[pts.length - 1][1];
}

interface PatchOpts {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  nx: number;
  nz: number;
  /** absolute height of the surface */
  h: (x: number, z: number) => number;
  /** facet colour from its centroid and slope (0 flat .. 1 vertical) */
  col: (x: number, y: number, z: number, slope: number) => Col;
  /** leave out cells whose corners all satisfy this (flat ground the terrain already draws) */
  skip?: (x: number, z: number) => boolean;
}

/**
 * A finely faceted height-field baked into a solid part: cliffs and volcanoes that are sharper than the
 * coarse terrain mesh can show. Faces are oriented upward; colours are chosen per facet.
 */
function patch(p: Part, o: PatchOpts): void {
  const { nx, nz } = o;
  const P: V3[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = lerp(o.x0, o.x1, i / nx);
      const z = lerp(o.z0, o.z1, j / nz);
      P.push([x, o.h(x, z), z]);
    }
  }
  const at = (i: number, j: number): V3 => P[j * (nx + 1) + i];
  const tri = (a: V3, b: V3, c: V3): void => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let ny = uz * vx - ux * vz;
    const nxx = uy * vz - uz * vy;
    const nzz = ux * vy - uy * vx;
    const len = Math.hypot(nxx, ny, nzz) || 1;
    if (ny < 0) {
      const t = b;
      b = c;
      c = t;
      ny = -ny;
    }
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    p.tri(a, b, c, o.col(cx, cy, cz, 1 - ny / len));
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      if (o.skip && o.skip(a[0], a[2]) && o.skip(b[0], b[2]) && o.skip(c[0], c[2]) && o.skip(d[0], d[2])) continue;
      if ((i + j) % 2) {
        tri(a, c, b);
        tri(b, c, d);
      } else {
        tri(a, c, d);
        tri(a, d, b);
      }
    }
  }
}

/** A window quad on the front (+z) face of a wall at depth z. */
function winF(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col): void {
  p.quad([x - w / 2, y, z + 0.004], [x + w / 2, y, z + 0.004], [x + w / 2, y + h, z + 0.004], [x - w / 2, y + h, z + 0.004], c);
}

/** A window quad on the right (+x) face of a wall at x. */
function winR(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col): void {
  p.quad([x + 0.004, y, z + w / 2], [x + 0.004, y, z - w / 2], [x + 0.004, y + h, z - w / 2], [x + 0.004, y + h, z + w / 2], c);
}

/** A pointed-arch opening on the front (+z) face. */
function archF(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col, pointed = 0.5): void {
  winF(p, x, y, z, w, h, c);
  p.tri([x - w / 2, y + h, z + 0.004], [x + w / 2, y + h, z + 0.004], [x, y + h + w * pointed, z + 0.004], c);
}

/** A pointed-arch opening on the right (+x) face. */
function archR(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col, pointed = 0.5): void {
  winR(p, x, y, z, w, h, c);
  p.tri([x + 0.004, y + h, z + w / 2], [x + 0.004, y + h, z - w / 2], [x + 0.004, y + h + w * pointed, z], c);
}

interface VillaOpts {
  fh?: number;
  win?: Col;
  roofKind?: 'hip' | 'gable' | 'flat' | 'mono' | 'none';
  /** how deep the foundation goes below y (houses on a slope) */
  sink?: number;
  detail?: boolean;
}

/** A small house standing on an explicit ground height y: box walls, window quads, a roof. Returns the eaves y. */
function villa(k: PortKit, x: number, y: number, z: number, w: number, d: number, floors: number, wall: Col, roof: Col, o: VillaOpts = {}): number {
  const p = k.solid;
  const fh = o.fh ?? 0.19;
  const h = floors * fh;
  const sink = o.sink ?? 0.18;
  p.box(x, y - sink, z, w, h + sink, d, wall);
  if (o.detail !== false) {
    const win = o.win ?? '#4a5f6d';
    const cols = Math.max(1, Math.round((w - 0.06) / 0.14));
    const sp = w / cols;
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < cols; i++) winF(p, x - w / 2 + sp * (i + 0.5), y + f * fh + fh * 0.3, z + d / 2, 0.05, fh * 0.45, win);
      winR(p, x + w / 2, y + f * fh + fh * 0.3, z, 0.05, fh * 0.45, win);
    }
  }
  const top = y + h;
  switch (o.roofKind ?? 'hip') {
    case 'hip':
      p.pyramid(x, top, z, w + 0.06, Math.max(0.06, Math.min(w, d) * 0.3), d + 0.06, roof);
      break;
    case 'gable':
      p.prism(x, top, z, d + 0.05, Math.max(0.06, d * 0.3), w + 0.04, roof, { ry: Math.PI / 2 });
      break;
    case 'mono':
      p.prism(x, top, z, w + 0.04, Math.max(0.05, d * 0.2), d + 0.04, roof, { ax: 0.5 });
      break;
    case 'flat':
      p.box(x, top, z, w + 0.03, 0.03, d + 0.03, roof);
      break;
    default:
      break;
  }
  k.reserve(x, z, w / 2 + 0.01, d / 2 + 0.01);
  return top;
}

const WHITES: Col[] = ['#f6f3ea', '#f1ece0', '#efe6d0', '#f4eede', '#e9dfc8'];
const PASTELS: Col[] = ['#f4d6a8', '#efb9a0', '#e8d08a', '#c9dccb', '#f2c9c4', '#b9d4e0', '#f0e3b8', '#e9a98e'];
const TILES: Col[] = ['#b8553d', '#c4673f', '#a64b36', '#c97b4a', '#b04a32'];

/** A palm tree on an explicit y. */
function palm(k: PortKit, x: number, y: number, z: number, s: number, rng: Rng): void {
  tree(k, 'palm', x, z, s, rng, y);
  k.reserve(x, z, 0.08, 0.08);
}

/** Water inlet / river carved into the land from the sea back to `zBack`; it widens like an estuary (`flare`). */
function carve(k: PortKit, cx: number, half: number, zBack: number, flare = 0.22, depth = -0.35): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1.4 || z < zBack - 1) return h;
    const back = Math.max(0, SHORE_Z - z);
    const hf = half + back * flare;
    const d = Math.abs(x - cx);
    const bank = smooth(hf + 0.7 + back * 0.15, hf, d);
    const end = smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, depth), bank * end);
  });
}

/** A low embankment wall along a river bank (x fixed, z from z0 to z1), like the quay along the sea. */
function bankWall(k: PortKit, x: number, z0: number, z1: number, color: Col = '#a8a69e'): void {
  const p = k.solid;
  p.box(x, -0.7, (z0 + z1) / 2, 0.28, 0.7 + LAND_Y, Math.abs(z1 - z0), color);
  p.box(x, LAND_Y, (z0 + z1) / 2, 0.32, 0.035, Math.abs(z1 - z0), '#c9c5ba');
}

/** A stone quay run (what the framework's quay wall would have been) along the far shore for [x0, x1]. */
function quayRun(k: PortKit, x0: number, x1: number, color: Col = '#a8a69e'): void {
  const p = k.solid;
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  p.box(cx, -0.7, SHORE_Z + 0.05, len, 0.7 + LAND_Y, 0.3, color);
  p.box(cx, LAND_Y, SHORE_Z + 0.05, len, 0.035, 0.34, '#c9c5ba');
}

// ───────────────────────────── Gibraltar ─────────────────────────────

const GIB_FOOT = -13.75;

/** The Rock's height above the plain: a ridge falling from the sheer north end to Europa Point. */
function makeRock(x0: number, x1: number, foot: number, H: number, ds = 1) {
  const ridge: Array<[number, number]> = [[0, 0], [0.02, 0.4], [0.05, 0.9], [0.1, 0.99], [0.15, 0.93], [0.2, 1], [0.27, 0.95], [0.34, 0.9], [0.42, 0.86], [0.5, 0.74], [0.58, 0.68], [0.66, 0.55], [0.76, 0.42], [0.86, 0.26], [0.94, 0.14], [1, 0.03]];
  const sect: Array<[number, number]> = [[0, 0], [0.5, 0.1], [1.0, 0.3], [1.4, 0.72], [1.75, 1], [2.5, 0.88], [3.3, 0.45], [4.2, 0.1], [4.8, 0]];
  const smoothH = (x: number, z: number): number => {
    const t = (x - x0) / (x1 - x0);
    if (t <= 0 || t >= 1) return 0;
    const w = lerp(1, 0.6, t) * ds;
    const dz = (foot - z) / w;
    if (dz <= 0 || dz >= 4.8) return 0;
    return H * curve(ridge, t, 0.2) * curve(sect, dz, 0.3);
  };
  const crag = (x: number, z: number): number => {
    const r = smoothH(x, z) / H;
    const big = fbm((x * 1.5) / ds + 11, (z * 1.5) / ds + 5, 91, 2);
    const rib = noise2((x * 4.2) / ds, 1.7, 5);
    return (big * 0.9 + rib * 0.45) * smooth(0.12, 0.6, r) * (H / 7);
  };
  return { x0, x1, H, smoothH, crag };
}

function gibRock(k: PortKit) {
  const cx = k.vx(-16.4);
  return { cx, ...makeRock(cx - 5.9, cx + 6.4, GIB_FOOT, 7.0) };
}

const gibraltar: Landmark = {
  terrain(k) {
    k.shape.relief = 0.4;
    k.shape.range = 1.6;
    k.palette = { ...k.palette, land: '#a9b878', land2: '#9fb06c', hill: '#93a768', sand: '#e2d6ae' };
    const R = gibRock(k);
    k.feature((x, z, h) => h + 0.7 * R.smoothH(x, z));
  },
  build(k) {
    const R = gibRock(k);
    const rng = new Rng(k.seed ^ 12345);
    const p = k.solid;
    const gy = (x: number, z: number): number => k.baseHeight(x, z) + R.smoothH(x, z) + 0.05 + R.crag(x, z);
    const c = new THREE.Color();
    const cLime = new THREE.Color('#ece6d3');
    const cLime2 = new THREE.Color('#cfc6ac');
    const cShade = new THREE.Color('#b0a78f');
    const cLo = new THREE.Color('#8ba05c');
    const cHi = new THREE.Color('#9ba46c');
    const cDry = new THREE.Color('#b3a87c');
    patch(p, {
      x0: R.x0 - 0.1,
      x1: R.x1,
      z0: GIB_FOOT + 0.3,
      z1: GIB_FOOT - 5.0,
      nx: 66,
      nz: 24,
      h: gy,
      skip: (x, z) => R.smoothH(x, z) < 0.03,
      col: (x, y, z, slope) => {
        const f = clamp((y - k.baseHeight(x, z)) / R.H);
        const n = noise2(x * 3.1, z * 3.1, 7);
        const streak = noise2(x * 8.5, 3.3, 19); // vertical gullies on the sheer faces
        const cliff = smooth(0.2, 0.4, slope + f * 0.1);
        c.copy(cLo).lerp(cHi, smooth(0.15, 0.7, f) * 0.85);
        if (f < 0.12) c.lerp(cDry, 0.5);
        // scrubby ledges between the strata
        const ledge = (y * 1.35) % 1 < 0.2 && noise2(x * 1.7, y * 2.0, 23) > 0.5 ? 0.85 : 0;
        c.multiplyScalar(0.92 + n * 0.14);
        const band = Math.floor(y * 2.4) % 2 ? 0 : 0.18;
        const lc = c.clone().copy(cLime).lerp(cLime2, clamp(n * 0.8 + band)).lerp(cShade, smooth(0.55, 0.9, streak) * 0.6);
        lc.multiplyScalar(0.96 + noise2(x * 5, z * 5, 3) * 0.08);
        return c.lerp(lc, cliff * (1 - ledge * 0.8)).clone();
      },
    });
    // the town at the foot of the Rock: white houses stepping up the first slope
    const hRng = new Rng(k.seed ^ 777);
    for (let r = 0; r < 4; r++) {
      const z = GIB_FOOT - 0.14 - r * 0.42;
      for (let x = R.x0 + 0.1; x < R.x1 + 0.6; x += hRng.range(0.36, 0.52)) {
        const y = gy(x, z);
        if (y < 0.3) continue;
        const f = (y - LAND_Y) / R.H;
        if (f > 0.17) continue;
        if (k.isReserved(x, z, 0.02)) continue;
        const w = hRng.range(0.3, 0.46);
        villa(k, x, y, z, w, 0.34, hRng.chance(0.45) ? 3 : 2, hRng.chance(0.7) ? WHITES[hRng.int(0, 4)] : PASTELS[hRng.int(0, 7)], TILES[hRng.int(0, 4)], { roofKind: hRng.chance(0.55) ? 'flat' : 'hip' });
      }
    }
    // scrub and a few cypresses on the slopes
    for (let i = 0; i < 70; i++) {
      const x = rng.range(R.x0 + 0.4, R.x1 - 0.4);
      const z = rng.range(GIB_FOOT - 2.0, GIB_FOOT - 0.9);
      const y = gy(x, z);
      const f = (y - LAND_Y) / R.H;
      if (f > 0.4 || y < 0.3 || k.isReserved(x, z, 0)) continue;
      k.solid.blob(x, y + 0.03, z, rng.range(0.09, 0.17), rng.chance(0.5) ? '#5f7f4a' : '#738d52', { sy: 0.7 });
    }
    // the Moorish castle's Tower of Homage above the old town
    const tx = R.x0 + 2.7;
    const tz = GIB_FOOT - 1.55;
    const ty = gy(tx, tz);
    p.box(tx, ty - 0.2, tz, 0.4, 0.95, 0.36, '#d8c9a4');
    for (let i = 0; i < 5; i++) p.box(tx - 0.16 + i * 0.08, ty + 0.75, tz + 0.15, 0.045, 0.07, 0.05, '#e0d3b0');
    p.box(tx, ty + 0.75, tz, 0.4, 0.03, 0.36, '#bba98a');
    winF(p, tx, ty + 0.3, tz + 0.18, 0.08, 0.16, '#4a4036');
    k.reserve(tx, tz, 0.3, 0.3);
    // a mast and the cable-car station on the crest
    const topX = R.x0 + 0.12 * (R.x1 - R.x0);
    const topZ = GIB_FOOT - 1.9;
    const topY = gy(topX, topZ);
    p.cyl(topX, topY - 0.05, topZ, 0.05, 0.03, 0.55, '#e9e6dc', { seg: 6 });
    p.cyl(topX, topY + 0.5, topZ, 0.012, 0.008, 0.7, '#c8302a', { seg: 4 });
    k.glow.ball(topX, topY + 1.2, topZ, 0.035, '#ff5a3c');
    const sx = topX + 1.3;
    const sz = GIB_FOOT - 1.95;
    const sy = gy(sx, sz);
    p.box(sx, sy - 0.05, sz, 0.34, 0.18, 0.26, '#f4f0e6');
    p.box(sx, sy + 0.13, sz, 0.38, 0.03, 0.3, '#8a8f94');
    // Europa Point lighthouse on the low south end
    const ex = R.x1 - 0.5;
    const ez = GIB_FOOT - 0.9;
    const ey = gy(ex, ez);
    p.cyl(ex, ey, ez, 0.1, 0.075, 0.5, '#f1ece0', { seg: 10 });
    p.cyl(ex, ey + 0.5, ez, 0.09, 0.09, 0.03, '#c8302a', { seg: 10 });
    p.cyl(ex, ey + 0.53, ez, 0.06, 0.06, 0.1, '#f6e9a8', { seg: 8 });
    p.cone(ex, ey + 0.63, ez, 0.075, 0.09, '#c8302a', { seg: 8 });
    k.reserve(ex, ez, 0.2, 0.2);
    // keep the framework's town off the Rock itself
    k.reserve((R.x0 + R.x1) / 2, GIB_FOOT - 3.2, (R.x1 - R.x0) / 2, 3.0);
  },
  mole: { light: { h: 1.9, bands: [['#f6f3ea', 0.6], ['#c8302a', 0.4]], cap: '#2d3138', gallery: '#2d3138' } },
  rows: 1,
  quiet: true,
};

// ───────────────────────────── Barcelona ─────────────────────────────

const FRUIT: Col[] = ['#e8903a', '#f2c14e', '#c9433a', '#7fae5a', '#f0a53c'];

/** A Sagrada Familia tower: a tapering honey-stone shaft with dark openings and a crown of coloured fruit. */
function sagradaSpire(k: PortKit, x: number, y: number, z: number, h: number, r: number, rng: Rng, o: { fruit?: boolean } = {}): void {
  const p = k.solid;
  const n = Math.max(4, Math.round(h / 0.55));
  const rAt = (t: number): number => r * (1 - 0.5 * t - 0.12 * Math.sin(t * 9) * 0.3);
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * 0.9;
    const t1 = ((i + 1) / n) * 0.9;
    p.cyl(x, y + h * t0, z, rAt(t0), rAt(t1), h * (t1 - t0) + 0.005, i % 2 ? '#d8b681' : '#cfa971', { seg: 8, open: true, ao: 0.05 });
  }
  const ty = y + h * 0.9;
  // dark slits climbing the shaft on the two visible faces
  for (let i = 0; i < n * 2 - 1; i++) {
    const t = 0.1 + (i / (n * 2)) * 0.74;
    const rr = rAt(t);
    winF(p, x - rr * 0.1, y + h * t, z + rr * 0.93, rr * 0.2, h * 0.05, '#5b4630');
    winR(p, x + rr * 0.97, y + h * t, z, rr * 0.2, h * 0.05, '#5b4630');
  }
  const tr = rAt(0.9);
  p.cyl(x, ty, z, tr, tr * 1.28, h * 0.035, '#bf9a64', { seg: 8, ao: 0 });
  p.cyl(x, ty + h * 0.035, z, tr * 1.28, tr * 0.7, h * 0.05, '#e3c58f', { seg: 8, ao: 0 });
  // the crown: a bunch of coloured fruit, then a star finial
  const cy = ty + h * 0.075;
  p.blob(x, cy + 0.08, z, tr * 1.6, '#e8903a', { sy: 1.15, ry: 0.4 });
  if (o.fruit !== false) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      p.blob(x + Math.cos(a) * tr * 1.5, cy + 0.02 + (i % 2) * 0.06, z + Math.sin(a) * tr * 1.5, tr * 0.72, FRUIT[(i + Math.floor(rng.next() * 3)) % FRUIT.length], { sy: 0.9 });
    }
  }
  p.cone(x, cy + tr * 1.1, z, tr * 0.55, h * 0.1, '#d9a441', { seg: 6 });
  p.rod([x, cy + tr * 1.1 + h * 0.08, z], [x, cy + tr * 1.1 + h * 0.15, z], 0.012, '#f0e6c8', 4);
  p.rod([x - 0.05, cy + tr * 1.1 + h * 0.12, z], [x + 0.05, cy + tr * 1.1 + h * 0.12, z], 0.012, '#f0e6c8', 4);
}

/** A yellow tower crane (the Sagrada's permanent companion): mast, jib, counter jib, hook line. */
function towerCrane(k: PortKit, x: number, y: number, z: number, h: number, jib = 1.6, col: Col = '#f2c230'): void {
  const p = k.solid;
  p.box(x, y, z, 0.1, h, 0.1, col, { ao: 0 });
  for (let i = 0; i < 5; i++) p.box(x, y + (h * (i + 0.5)) / 5, z, 0.14, 0.02, 0.14, '#d9a416', { ao: 0 });
  p.box(x, y + h, z, 0.14, 0.09, 0.14, '#f1f2ee');
  p.box(x + jib * 0.38, y + h + 0.09, z, jib, 0.06, 0.07, col, { ao: 0 });
  p.box(x - 0.3, y + h + 0.09, z, 0.5, 0.06, 0.07, col, { ao: 0 });
  p.box(x - 0.46, y + h + 0.0, z, 0.14, 0.09, 0.1, '#8a8f94');
  p.rod([x, y + h + 0.3, z], [x + jib * 0.85, y + h + 0.09, z], 0.007, '#3a3f46', 3);
  p.rod([x, y + h + 0.3, z], [x - 0.4, y + h + 0.09, z], 0.007, '#3a3f46', 3);
  p.rod([x, y + h + 0.09, z], [x, y + h + 0.3, z], 0.012, col, 4);
  p.rod([x + jib * 0.6, y + h + 0.06, z], [x + jib * 0.6, y + h - 0.45, z], 0.005, '#3a3f46', 3);
  p.box(x + jib * 0.6 - 0.03, y + h - 0.5, z - 0.03, 0.06, 0.05, 0.06, '#c8302a');
}

function sagrada(k: PortKit, cx: number, zc: number): void {
  const p = k.solid;
  const rng = new Rng(k.seed ^ 12345);
  const y = LAND_Y + 0.02;
  const honey = '#d6b27c';
  const honey2 = '#c9a06a';
  const dark = '#5b4630';
  // front and back facades: wide stone blocks carrying four spires each
  const fac = (z: number, spireH: number, front: boolean): void => {
    p.box(cx, y - 0.25, z, 4.5, 2.25, 0.8, honey);
    p.box(cx, y + 2.0, z, 4.6, 0.1, 0.9, honey2);
    if (front) {
      // three portals under pointed arches, a green cypress between them, rows of small windows above
      for (const [px, pw, ph] of [[-1.45, 0.62, 1.0], [0, 0.82, 1.35], [1.45, 0.62, 1.0]] as Array<[number, number, number]>) {
        p.box(cx + px, y, z + 0.41, pw, ph, 0.02, '#4c3a28', { ao: 0 });
        p.tri([cx + px - pw / 2, y + ph, z + 0.412], [cx + px + pw / 2, y + ph, z + 0.412], [cx + px, y + ph + pw * 0.55, z + 0.412], '#4c3a28');
        p.box(cx + px, y + 0.05, z + 0.42, pw * 0.6, ph * 0.7, 0.01, '#8a6c46', { ao: 0 });
      }
      for (const dx of [-0.72, 0.72]) {
        p.cone(cx + dx, y + 0.02, z + 0.43, 0.2, 1.7, '#3c6b3f', { seg: 6 });
        p.cone(cx + dx, y + 0.9, z + 0.43, 0.14, 1.0, '#4a7c46', { seg: 6 });
      }
      for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) winF(p, cx - 1.9 + i * 0.345, y + 1.55 + r * 0.22, z + 0.4, 0.07, 0.13, dark);
      // sculpted bands
      p.box(cx, y + 1.45, z + 0.43, 4.3, 0.04, 0.05, '#bf9a64', { ao: 0 });
    } else {
      for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) winF(p, cx - 1.9 + i * 0.345, y + 0.5 + r * 0.45, z + 0.4, 0.09, 0.2, dark);
    }
    for (let i = 0; i < 4; i++) {
      const sx = cx - 1.65 + i * 1.1;
      // each tower is rooted in a stout base
      p.box(sx, y + 2.0, z, 0.66, 0.25, 0.6, honey2);
      sagradaSpire(k, sx, y + 2.2, z, spireH + (i === 1 || i === 2 ? 0.25 : 0), 0.3, rng);
    }
  };
  fac(zc + 1.9, 3.3, true);
  fac(zc - 2.6, 3.0, false);
  // the nave between the two facades: a long roof ridge carried on ribbed walls
  p.box(cx, y - 0.25, zc - 0.4, 3.2, 1.65, 3.6, honey);
  p.prism(cx, y + 1.35, zc - 0.4, 3.1, 0.55, 3.5, '#8a6f55');
  for (let i = 0; i < 7; i++) p.box(cx - 1.35 + i * 0.45, y - 0.1, zc + 1.38, 0.1, 1.5, 0.12, honey2);
  // the central towers: Jesus (tallest), four evangelists, Mary
  const jy = y + 1.8;
  p.box(cx, jy - 0.4, zc - 0.3, 1.0, 0.9, 1.0, honey);
  sagradaSpire(k, cx, jy, zc - 0.3, 3.6, 0.36, rng, { fruit: false });
  // the cross of the Jesus tower: a star of four arms in pale stone
  const cy = jy + 3.55;
  p.rod([cx, cy + 0.0, zc - 0.3], [cx, cy + 0.6, zc - 0.3], 0.03, '#f3ecd8', 4);
  p.rod([cx - 0.25, cy + 0.38, zc - 0.3], [cx + 0.25, cy + 0.38, zc - 0.3], 0.03, '#f3ecd8', 4);
  towerCrane(k, cx + 0.12, jy + 2.5, zc - 0.3, 1.2, 1.7);
  for (const [dx, dz] of [[-0.78, 0.35], [0.78, 0.35], [-0.78, -0.95], [0.78, -0.95]] as Array<[number, number]>) {
    p.box(cx + dx, jy - 0.4, zc + dz - 0.3, 0.5, 0.7, 0.5, honey2);
    sagradaSpire(k, cx + dx, jy + 0.1, zc + dz - 0.3, 2.45, 0.25, rng);
  }
  k.reserve(cx, zc, 3.0, 4.4);
}

/** Torre Glories (Agbar): a bullet of red and blue. */
function glories(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.ground(x, z) - 0.02;
  const prof: Array<[number, number, Col]> = [[0.0, 0.5, '#b8433a'], [0.45, 0.58, '#c4503a'], [1.0, 0.6, '#c85b44'], [1.55, 0.56, '#9a6a7a'], [2.1, 0.5, '#6b7fb0'], [2.6, 0.4, '#4a74b8'], [3.05, 0.27, '#5b88c4'], [3.4, 0.14, '#7aa2d2']];
  for (let i = 0; i < prof.length - 1; i++) {
    const [y0, r0, c0] = prof[i];
    const [y1, r1] = prof[i + 1];
    p.cyl(x, y + y0, z, r0, r1, y1 - y0 + 0.004, c0, { seg: 12, ao: i ? 0 : 0.15 });
  }
  p.cone(x, y + 3.4, z, 0.14, 0.34, '#9cc3e6', { seg: 12 });
  // window dots in rows
  for (let r = 0; r < 14; r++) {
    const t = 0.18 + r * 0.22;
    const rr = curve(prof.map(([yy, rad]) => [yy, rad] as [number, number]), t) * 0.98;
    for (let c = -2; c <= 2; c++) {
      const a = c * 0.3;
      p.box(x + Math.sin(a) * rr - 0.025, y + t, z + Math.cos(a) * rr * 0.92, 0.05, 0.06, 0.012, '#f1f4f8', { ao: 0 });
    }
  }
  k.reserve(x, z, 0.65, 0.65);
}

/** The Columbus Monument: an iron column on a stone plinth, a statue pointing to the sea. */
function columbus(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = k.ground(x, z) - 0.02;
  p.cyl(x, y - 0.1, z, 0.55, 0.5, 0.3, '#cfc9b8', { seg: 8 });
  p.cyl(x, y + 0.2, z, 0.4, 0.38, 0.28, '#d9d3c2', { seg: 8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    p.box(x + Math.cos(a) * 0.5, y + 0.1, z + Math.sin(a) * 0.5, 0.14, 0.14, 0.18, '#a08a3a'); // the lions
  }
  p.cyl(x, y + 0.48, z, 0.14, 0.11, 2.5, '#3f4a44', { seg: 8 });
  for (let i = 0; i < 5; i++) p.cyl(x, y + 0.7 + i * 0.45, z, 0.15, 0.15, 0.04, '#6b5a2e', { seg: 8, ao: 0 });
  p.cyl(x, y + 2.95, z, 0.24, 0.22, 0.08, '#8f7a3a', { seg: 8 });
  p.cyl(x, y + 3.03, z, 0.14, 0.12, 0.2, '#3f4a44', { seg: 8 });
  // Columbus on top, arm out over the harbour
  p.box(x, y + 3.2, z, 0.1, 0.26, 0.08, '#6e6a52');
  p.ball(x, y + 3.5, z, 0.055, '#c9b58a');
  p.rod([x + 0.02, y + 3.4, z], [x + 0.15, y + 3.48, z + 0.14], 0.016, '#6e6a52', 4);
  k.reserve(x, z, 0.6, 0.6);
}

const barcelona: Landmark = {
  terrain(k) {
    const cx = k.vx(-15.5);
    k.shape.relief = 0.6;
    k.plateau(cx, -15.6, 4.2, 4.8, LAND_Y + 0.06, 0.85);
    // a paved forecourt under the church
    const stone = new THREE.Color('#d6c9a4');
    k.paint((x, y, z, slope, c) => {
      const d = Math.hypot((x - cx) / 3.9, (z + 15.6) / 4.6);
      if (d < 1 && z > -17.2) c.lerp(stone, 0.6 * (1 - smooth(0.3, 0.95, d)));
    });
  },
  build(k) {
    const cx = k.vx(-15.5);
    sagrada(k, cx, -15.6);
    glories(k, k.vx(-14.3) - 5.6, -14.3);
    columbus(k, k.vx(-13.1) + 4.9, -13.1);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Valencia ─────────────────────────────

/** A C-shaped arch band (outer and inner half-ellipses) extruded `depth` along z, standing on y. */
function archBand(p: Part, x: number, y: number, z: number, rxO: number, ryO: number, rxI: number, ryI: number, depth: number, col: Col, n = 16): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    pts.push([Math.cos(t) * rxO, Math.sin(t) * ryO]);
  }
  for (let i = n; i >= 0; i--) {
    const t = (i / n) * Math.PI;
    pts.push([Math.cos(t) * rxI, Math.sin(t) * ryI]);
  }
  p.extrude(pts, depth, x, y, z, col, { ao: 0.05 });
}

const valencia: Landmark = {
  terrain(k) {
    const cx = k.vx(-15.4);
    k.shape.relief = 0.5;
    k.plateau(cx, -16.0, 5.4, 4.2, LAND_Y + 0.05, 0.8);
    // the dry Turia riverbed with the Assut de l'Or bridge: a long low garden valley
    k.plateau(cx - 7.0, -19.6, 6.6, 2.4, LAND_Y + 0.12, 0.6);
  },
  build(k) {
    const cx = k.vx(-15.4);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const gy = LAND_Y + 0.05;
    const white = '#f6f4ee';
    // the long turquoise pool the buildings stand in
    p.box(cx + 0.9, gy - 0.1, -14.15, 8.6, 0.14, 1.9, '#e8e4d8');
    k.glass.box(cx + 0.9, gy + 0.02, -14.15, 8.3, 0.03, 1.65, '#47b4d4', { ao: 0 });
    k.reserve(cx + 0.9, -14.15, 4.4, 1.1);
    // L'Hemisferic: the eye. A white eyeball in the pool, a dark pupil, and the eyelid arching over it
    const hx = cx - 1.2;
    const hz = -14.5;
    p.ball(hx, gy + 0.2, hz, 1.2, white, { sy: 0.92, sz: 0.95 });
    k.glass.cyl(hx, gy + 0.22, hz + 1.06, 0.62, 0.62, 0.1, '#1d4f78', { rx: Math.PI / 2, seg: 14, ao: 0 });
    k.glass.cyl(hx, gy + 0.22, hz + 1.12, 0.28, 0.28, 0.05, '#0b2236', { rx: Math.PI / 2, seg: 10, ao: 0 });
    archBand(p, hx, gy - 0.02, hz + 0.85, 1.85, 2.4, 1.45, 1.98, 0.18, white);
    archBand(p, hx, gy - 0.02, hz + 0.75, 1.7, 2.2, 1.5, 2.0, 0.1, '#d3dde3');
    p.box(hx - 1.78, gy - 0.02, hz + 0.85, 0.3, 0.38, 0.34, white);
    p.box(hx + 1.48, gy - 0.02, hz + 0.85, 0.3, 0.38, 0.34, white);
    k.reserve(hx, hz, 2.1, 1.4);
    // Palau de les Arts: a long white helmet with a tall feathered crest
    const px = cx + 3.6;
    const pz = -16.6;
    const topPts: Array<[number, number]> = [[-2.1, 0.5], [-2.0, 1.2], [-1.5, 2.2], [-0.8, 2.95], [0.0, 2.8], [0.9, 2.2], [1.7, 1.4], [2.3, 0.8], [2.6, 0.5]];
    const slice = 0.38;
    for (let i = 0; i * slice < 4.7; i++) {
      const x0 = -2.1 + i * slice;
      const x1 = Math.min(2.6, x0 + slice);
      p.extrude([[x0, 0], [x1, 0], [x1, curve(topPts, x1, 0.75)], [x0, curve(topPts, x0, 0.75)]], 1.5, px, gy - 0.05, pz, i % 2 ? '#e4e9ec' : '#f7f6f2', { ao: 0.08 });
    }
    // glazed belt on the base
    k.glass.box(px - 2.0, gy + 0.12, pz + 0.756, 4.4, 0.24, 0.02, '#7fb6cf', { ao: 0 });
    // the free-standing feather arch that leans over the helmet
    archBand(p, px - 0.2, gy - 0.05, pz + 0.9, 2.5, 3.5, 2.28, 3.28, 0.12, '#fbfbf7');
    k.reserve(px, pz, 2.8, 1.2);
    // the science museum: a long white nave of leaning ribs behind
    const mx = cx - 1.0;
    const mz = -18.4;
    p.box(mx, gy - 0.1, mz, 6.6, 1.2, 1.3, '#efeee8');
    for (let i = 0; i < 12; i++) {
      p.box(mx - 3.1 + i * 0.57, gy + 0.9, mz + 0.65, 0.12, 0.9, 0.1, white, { rz: i % 2 ? 0.2 : -0.2 });
      p.box(mx - 3.1 + i * 0.57, gy - 0.05, mz + 0.66, 0.14, 1.0, 0.08, '#d9dcdc');
    }
    k.glass.box(mx - 3.0, gy + 0.2, mz + 0.655, 6.0, 0.5, 0.02, '#8dc2d8', { ao: 0 });
    k.reserve(mx, mz, 3.4, 0.8);
    // L'Assut de l'Or: a single white mast with a fan of stays over the old riverbed
    cableStayed(k, cx - 11.0, cx - 2.2, -19.6, [{ x: cx - 8.4, h: 5.4, side: 1, lean: -0.5 }], { deck: 1.1, half: 0.2, color: '#fbfbf7', cable: '#f4f4ee', deckColor: '#d0d2d4' });
    p.rod([cx - 8.4, 1.1, -19.7], [cx - 8.9, 6.5, -19.6], 0.07, '#fbfbf7', 6);
    p.rod([cx - 8.4, 1.1, -19.5], [cx - 8.9, 6.5, -19.6], 0.07, '#fbfbf7', 6);
    // palms and a few cypresses around the pool
    for (let i = 0; i < 8; i++) {
      const x = cx - 3.8 + i * 1.15 + rng.range(-0.15, 0.15);
      palm(k, x, gy - 0.02, -13.05 - (i % 2) * 0.15, 1.0 + rng.next() * 0.3, rng);
    }
  },
  rows: 2,
  quiet: true,
  flag: { dx: 5.6, z: -13.0 },
};

// ───────────────────────────── Lisbon ─────────────────────────────

const lisbon: Landmark = {
  terrain(k) {
    const cx = k.vx(-15);
    k.shore = 'rock';
    k.shape.relief = 0.6;
    carve(k, cx - 1.2, 3.9, -36);
    k.bump(cx - 8.4, -17.2, 4.6, 3.6, 1.5);
    k.bump(cx + 6.6, -17.4, 3.6, 3.2, 1.3);
  },
  build(k) {
    const cx = k.vx(-15);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const rc = cx - 1.2;
    quayRun(k, -k.width / 2 - 4, rc - 4.1);
    quayRun(k, rc + 4.1, k.width / 2 + 4);
    bankWall(k, rc - 4.1, SHORE_Z, -16.2);
    bankWall(k, rc + 4.1, SHORE_Z, -16.2);
    // the 25 de Abril Bridge: a red suspension bridge with a double-deck truss
    const z = -14.9;
    const deck = 1.15;
    const x0 = cx - 7.6;
    const x1 = cx + 5.6;
    const ta = cx - 3.5;
    const tb = cx + 1.4;
    suspension(k, x0, x1, z, [ta, tb], 3.7, { deck, half: 0.2, color: '#c8402a', deckColor: '#b9b6ae' });
    // chunkier red towers with X bracing, a truss under the deck
    for (const tx of [ta, tb]) {
      for (const sd of [-1, 1]) p.box(tx, deck - 0.1, z + sd * 0.19, 0.13, 3.8, 0.13, '#c8402a');
      for (const f of [0.3, 0.55, 0.8]) p.box(tx, deck + 3.7 * f, z, 0.1, 0.08, 0.4, '#c8402a', { ao: 0 });
      p.rod([tx, deck + 0.2, z - 0.19], [tx, deck + 1.9, z + 0.19], 0.025, '#c8402a', 4);
      p.rod([tx, deck + 0.2, z + 0.19], [tx, deck + 1.9, z - 0.19], 0.025, '#c8402a', 4);
    }
    for (let x = x0; x < x1 - 0.3; x += 0.34) {
      p.rod([x, deck - 0.36, z + 0.2], [x + 0.17, deck - 0.1, z + 0.2], 0.012, '#c8402a', 3);
      p.rod([x + 0.17, deck - 0.1, z + 0.2], [x + 0.34, deck - 0.36, z + 0.2], 0.012, '#c8402a', 3);
    }
    p.box((x0 + x1) / 2, deck - 0.38, z, x1 - x0, 0.04, 0.4, '#c8402a', { ao: 0 });
    // Cristo Rei on its pedestal on the south bank
    const sx = cx + 4.9;
    const sz = -17.2;
    const sy = k.ground(sx, sz) - 0.05;
    p.box(sx, sy - 0.2, sz, 1.5, 0.5, 1.1, '#cfcab9');
    p.box(sx, sy + 0.2, sz, 1.0, 0.3, 0.8, '#dcd8ca');
    p.box(sx, sy + 0.45, sz, 0.8, 2.2, 0.55, '#ebe7dc');
    p.box(sx, sy + 0.5, sz + 0.28, 0.34, 0.95, 0.02, '#4a4a46', { ao: 0 });
    p.tri([sx - 0.17, sy + 1.45, sz + 0.282], [sx + 0.17, sy + 1.45, sz + 0.282], [sx, sy + 1.75, sz + 0.282], '#4a4a46');
    for (let i = 0; i < 4; i++) winF(p, sx - 0.28 + i * 0.19, sy + 1.95, sz + 0.275, 0.07, 0.3, '#8c887a');
    p.box(sx, sy + 2.65, sz, 0.9, 0.08, 0.6, '#d3cfc0');
    // the figure: robe, outstretched arms, head
    p.box(sx, sy + 2.72, sz, 0.22, 0.72, 0.18, '#f1eee4');
    p.box(sx, sy + 3.18, sz, 1.0, 0.1, 0.12, '#f1eee4');
    p.box(sx, sy + 3.0, sz, 0.3, 0.2, 0.2, '#f1eee4');
    p.ball(sx, sy + 3.5, sz, 0.1, '#f1eee4');
    k.reserve(sx, sz, 0.9, 0.7);
    // the castle on the Lisbon hill
    const kx = cx - 7.0;
    const kz = -17.0;
    const ky = k.ground(kx, kz) - 0.04;
    battlement(k, kx, kz, 1.6, 0.4, 0.55, '#d8cfb4', ky);
    for (const dx of [-0.8, 0.8]) roundTower(k, kx + dx, kz, 0.2, 0.9, '#d8cfb4', null, ky);
    // a cacilheiro ferry on the river
    boat(k, cx - 0.4, -12.9, 'ferry', rng, 0, '#c8402a');
    for (let i = 0; i < 3; i++) boat(k, cx - 3.4 + i * 2.2, -16.4 - i * 0.2, 'sail', rng, 0.3 * i, '#2c5da8');
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── Seville ─────────────────────────────

/** La Giralda: a panelled Almohad shaft in ochre brick, a belfry, a Renaissance lantern and the weathervane statue. */
function giralda(k: PortKit, x: number, y: number, z: number): void {
  const p = k.solid;
  const brick = '#cf9d66';
  const brick2 = '#c08a56';
  const pale = '#ecd9ac';
  const w = 0.76;
  const H = 3.3;
  p.box(x, y - 0.25, z, w + 0.08, H + 0.25, w + 0.08, brick);
  // the shaft's decoration: lighter corner posts, bands and double arched windows on every level
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(x + sx * (w / 2 + 0.02), y, z + sz * (w / 2 + 0.02), 0.07, H, 0.07, pale);
  for (let i = 0; i < 7; i++) {
    const ly = y + 0.3 + i * 0.44;
    p.box(x, ly - 0.03, z, w + 0.1, 0.045, w + 0.1, pale, { ao: 0 });
    for (const dx of [-0.17, 0.17]) {
      archF(p, x + dx, ly + 0.07, z + w / 2 + 0.04, 0.1, 0.18, '#4a3624', 0.5);
      archR(p, x + w / 2 + 0.04, ly + 0.07, z + dx, 0.1, 0.18, '#4a3624', 0.5);
    }
    // sebka lattice panels between the windows
    winF(p, x, ly + 0.02, z + w / 2 + 0.04, 0.06, 0.3, brick2);
    winR(p, x + w / 2 + 0.04, ly + 0.02, z, 0.06, 0.3, brick2);
  }
  // the belfry: four big arches and a pale balustrade
  const by = y + H;
  p.box(x, by, z, w + 0.18, 0.06, w + 0.18, pale);
  p.box(x, by + 0.06, z, w + 0.04, 0.78, w + 0.04, '#d8b57c');
  for (const dx of [-0.19, 0.19]) {
    archF(p, x + dx, by + 0.2, z + w / 2 + 0.03, 0.18, 0.32, '#3a2a1c', 0.5);
    archR(p, x + w / 2 + 0.03, by + 0.2, z + dx, 0.18, 0.32, '#3a2a1c', 0.5);
  }
  p.box(x, by + 0.84, z, w + 0.2, 0.06, w + 0.2, pale);
  for (let i = 0; i < 7; i++) {
    const t = -0.3 + i * 0.1;
    p.box(x + t, by + 0.9, z + w / 2 + 0.07, 0.04, 0.09, 0.04, pale, { ao: 0 });
    p.box(x + w / 2 + 0.07, by + 0.9, z + t, 0.04, 0.09, 0.04, pale, { ao: 0 });
  }
  // the Renaissance crown: three stepped drums, a dome and the Giraldillo
  const ty = by + 0.9;
  p.box(x, ty, z, 0.52, 0.34, 0.52, '#e3cc9a');
  winF(p, x, ty + 0.08, z + 0.264, 0.09, 0.15, '#4a3624');
  winR(p, x + 0.264, ty + 0.08, z, 0.09, 0.15, '#4a3624');
  p.cyl(x, ty + 0.34, z, 0.28, 0.24, 0.07, pale, { seg: 8 });
  p.cyl(x, ty + 0.41, z, 0.2, 0.2, 0.3, '#e3cc9a', { seg: 8 });
  p.lathe(x, ty + 0.71, z, [[0.24, 0], [0.22, 0.06], [0.14, 0.17], [0.05, 0.25], [0.001, 0.27]], '#a9c9b4', { seg: 8 });
  p.cyl(x, ty + 0.98, z, 0.012, 0.012, 0.2, '#d8a83a', { seg: 4 });
  p.ball(x, ty + 1.2, z, 0.05, '#e0b53f');
  p.quad([x, ty + 1.17, z], [x + 0.17, ty + 1.2, z], [x + 0.17, ty + 1.3, z], [x, ty + 1.25, z], '#e0b53f', true);
  k.reserve(x, z, 0.5, 0.5);
}

/** The Torre del Oro: a golden twelve-sided tower in three tiers on the river quay. */
function torreDelOro(k: PortKit, x: number, z: number, y = LAND_Y): void {
  const p = k.solid;
  const gold = '#dcc07a';
  const gold2 = '#d2b068';
  p.cyl(x, y - 0.1, z, 0.72, 0.7, 0.16, '#bfb9a6', { seg: 12 });
  p.cyl(x, y + 0.06, z, 0.64, 0.62, 1.15, gold, { seg: 12 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.box(x + Math.cos(a) * 0.63, y + 1.1, z + Math.sin(a) * 0.63, 0.1, 0.1, 0.1, '#e8d498', { ao: 0 });
  }
  for (let i = 0; i < 4; i++) archF(p, x - 0.36 + i * 0.24, y + 0.55, z + 0.62, 0.1, 0.22, '#4a3a22');
  winR(p, x + 0.63, y + 0.5, z, 0.12, 0.26, '#4a3a22');
  p.cyl(x, y + 1.21, z, 0.5, 0.46, 0.7, gold2, { seg: 12 });
  p.cyl(x, y + 1.91, z, 0.52, 0.52, 0.05, '#e8d498', { seg: 12 });
  for (let i = 0; i < 3; i++) archF(p, x - 0.2 + i * 0.2, y + 1.4, z + 0.47, 0.09, 0.2, '#4a3a22');
  winR(p, x + 0.47, y + 1.4, z, 0.1, 0.2, '#4a3a22');
  p.cyl(x, y + 1.96, z, 0.3, 0.28, 0.4, gold, { seg: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.box(x + Math.cos(a) * 0.29, y + 2.05, z + Math.sin(a) * 0.29, 0.07, 0.16, 0.07, '#4a3a22', { ao: 0 });
  }
  p.lathe(x, y + 2.36, z, [[0.31, 0], [0.31, 0.04], [0.24, 0.14], [0.12, 0.23], [0.04, 0.28], [0.001, 0.3]], '#d9a931', { seg: 12 });
  p.cyl(x, y + 2.66, z, 0.012, 0.01, 0.2, '#d9a931', { seg: 4 });
  k.reserve(x, z, 0.8, 0.8);
}

/** A gothic cathedral hall: buttressed walls, a leaden nave roof, a crossing lantern and pinnacles. */
function cathedral(k: PortKit, x: number, z: number, w: number, d: number, h: number, y: number): void {
  const p = k.solid;
  const stone = '#d7ceb4';
  p.box(x, y - 0.2, z, w, h + 0.2, d, stone);
  p.box(x, y + h, z, w + 0.1, 0.06, d + 0.1, '#e4dcc4');
  // buttresses and tall windows along the front
  const n = Math.round(w / 0.5);
  for (let i = 0; i <= n; i++) {
    const bx = x - w / 2 + (i * w) / n;
    p.box(bx, y - 0.1, z + d / 2 + 0.07, 0.14, h * 0.9, 0.16, '#cbc1a6');
    p.cone(bx, y + h, z + d / 2 + 0.02, 0.07, 0.34, '#d9cfb6', { seg: 4 });
    if (i < n) archF(p, bx + w / (2 * n), y + h * 0.3, z + d / 2, 0.16, h * 0.34, '#4b4338', 0.5);
  }
  // the lead roof and a crossing tower
  p.prism(x, y + h + 0.06, z, d * 0.78, 0.7, w * 0.96, '#7d848a', { ry: Math.PI / 2 });
  p.box(x + w * 0.1, y + h, z - 0.05, 0.9, 1.2, 0.9, stone);
  p.pyramid(x + w * 0.1, y + h + 1.2, z - 0.05, 0.95, 0.5, 0.95, '#7d848a');
  for (let i = 0; i < 4; i++) archF(p, x + w * 0.1 - 0.3 + i * 0.2, y + h + 0.5, z - 0.05 + 0.455, 0.09, 0.3, '#4b4338');
  k.reserve(x, z, w / 2 + 0.2, d / 2 + 0.3);
}

const seville: Landmark = {
  terrain(k) {
    k.shape.relief = 0.5;
    const cx = k.vx(-15.5);
    k.plateau(cx, -15.6, 6.0, 4.2, LAND_Y + 0.04, 0.8);
  },
  build(k) {
    const cx = k.vx(-15.5);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const gy = LAND_Y + 0.04;
    // the Giralda beside its cathedral
    giralda(k, cx + 1.4, gy, -16.4);
    cathedral(k, cx - 1.5, -16.0, 5.0, 1.9, 1.4, gy);
    // the Torre del Oro on the quay with a stretch of rampart
    torreDelOro(k, cx + 3.5, -12.75);
    battlement(k, cx + 1.9, -12.75, 1.9, 0.3, 0.55, '#d2c3a0', gy);
    // orange trees and palms in the plazas
    for (let i = 0; i < 9; i++) {
      const x = cx - 4.5 + i * 1.0 + rng.range(-0.2, 0.2);
      if (k.isReserved(x, -13.9, 0.1)) continue;
      palm(k, x, gy - 0.02, -13.9 - (i % 2) * 0.25, 1.1 + rng.next() * 0.3, rng);
    }
    p.box(cx, gy - 0.02, -14.1, 8, 0.03, 0.7, '#e1d6b3', { ao: 0 });
  },
  rows: 3,
  quiet: true,
  mole: { endX: -7.0, dir: 1 },
};

// ───────────────────────────── Santa Cruz de Tenerife ─────────────────────────────

/** Calatrava's Auditorio: a white concrete wing sweeping up into a beak over a glazed hall and a plaza. */
function auditorio(k: PortKit, x: number, z: number, y: number): void {
  const p = k.solid;
  const white = '#f3f1ea';
  const under = '#dcdad2';
  p.box(x + 0.4, y - 0.1, z + 0.6, 8.0, 0.14, 3.8, '#e6dfcc');
  // the hall under the wing: a glazed front, white flanks
  p.box(x - 1.3, y, z, 3.3, 1.3, 2.4, white);
  k.glass.box(x - 1.3, y + 0.08, z + 1.204, 3.0, 1.1, 0.02, '#79bdd6', { ao: 0 });
  for (let i = 0; i < 9; i++) p.box(x - 2.75 + i * 0.36, y + 0.05, z + 1.212, 0.035, 1.15, 0.03, '#f6f5f0', { ao: 0 });
  // the wing: a profile that climbs in a concave curve from the hall to a thin beak at the sea
  const x0 = -3.0;
  const x1 = 3.5;
  const N = 22;
  const T = (t: number): number => 1.2 + 3.1 * Math.pow(t, 2.1);
  const B = (t: number): number => T(t) - (1.35 * Math.pow(1 - t, 1.1) + 0.12);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([x0 + t * (x1 - x0), B(t)]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push([x0 + t * (x1 - x0), T(t)]);
  }
  p.extrude(pts, 2.7, x, y, z, white, { ao: 0.04 });
  // the underside tones and the ribs on the front face of the wing
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const xx = x + x0 + t * (x1 - x0);
    p.box(xx, y + B(t) + 0.04, z + 1.16, 0.035, T(t) - B(t) - 0.08, 0.02, under, { ao: 0 });
  }
  // a slender strut under the cantilever and a pale stair to the plaza
  p.rod([x + 1.5, y, z + 1.0], [x + 2.1, y + B(0.78), z + 1.0], 0.06, white, 5);
  p.rod([x + 1.5, y, z - 1.0], [x + 2.1, y + B(0.78), z - 1.0], 0.06, white, 5);
  // the smaller white shell of the chamber hall
  p.lathe(x + 2.5, y, z + 1.0, [[0.9, 0], [0.9, 0.08], [0.78, 0.35], [0.5, 0.58], [0.2, 0.7], [0.001, 0.74]], white, { seg: 12 });
  k.glass.cyl(x + 2.5, y + 0.02, z + 1.55, 0.35, 0.35, 0.12, '#79bdd6', { rx: Math.PI / 2, seg: 10, ao: 0 });
  k.reserve(x + 0.4, z + 0.3, 4.1, 2.2);
}

/** A stratovolcano: concave flanks, a broad caldera shoulder, a pointed summit, radial gullies. */
function volcano(px: number, pz: number, R: number, H: number, prof: Array<[number, number]> = [[0, 1], [0.05, 0.9], [0.14, 0.74], [0.26, 0.56], [0.45, 0.34], [0.7, 0.14], [1, 0]], gullies = 0.09): (x: number, z: number) => number {
  return (x, z) => {
    const dx = x - px;
    const dz = z - pz;
    const r = Math.hypot(dx / R, dz / (R * 0.85));
    if (r >= 1) return 0;
    const a = Math.atan2(dz, dx);
    const gully = 1 + gullies * Math.sin(a * 7 + r * 5) * smooth(0.05, 0.4, r);
    return H * curve(prof, r, 0.35) * gully;
  };
}

const santacruz: Landmark = {
  terrain(k) {
    k.shape.relief = 1.0;
    k.shape.range = 2.2;
    const cx = k.vx(-14.4) - 0.8;
    k.plateau(cx + 0.4, -14.3, 4.8, 2.6, LAND_Y + 0.04, 0.7);
    // Teide: the great snow-capped cone behind the town, with Pico Viejo's lower cone beside it
    const peak = volcano(k.vx(-24) + 2.6, -24, 12.0, 7.4);
    const viejo = volcano(k.vx(-23) - 6.2, -23, 7.6, 4.7);
    k.feature((x, z, h) => h + Math.max(peak(x, z), viejo(x, z) * 0.9));
    k.palette = { ...k.palette, rock: '#7a6250', hill: '#a28a60', land: '#b9a16a', land2: '#c0aa70', snowLine: 4.9, snow: '#fafcfd' };
    k.paint((x, y, z, slope, c) => {
      if (y > 1.4 && y < 5.4) c.lerp(new THREE.Color(slope > 0.2 ? '#6f5a49' : '#8c6d4f'), 0.55);
      if (y > 3.4 && y < 5.8 && noise2(x * 0.9, z * 0.9, 3) > 0.55) c.lerp(new THREE.Color('#5a4a40'), 0.5);
    });
  },
  build(k) {
    const cx = k.vx(-14.4) - 0.8;
    const rng = new Rng(k.seed ^ 12345);
    const gy = LAND_Y + 0.04;
    auditorio(k, cx, -14.3, gy);
    for (let i = 0; i < 7; i++) {
      const x = cx - 3.4 + i * 1.3 + rng.range(-0.2, 0.2);
      palm(k, x, gy - 0.02, -12.95 - (i % 2) * 0.15, 1.1 + rng.next() * 0.3, rng);
    }
  },
  rows: 3,
  quiet: true,
  mole: { endX: 2.6, dir: -1 },
};

// ───────────────────────────── Algeciras ─────────────────────────────

/** A container ship at the quay: a dark hull, a stern deckhouse and bays of coloured boxes. */
function containerShip(k: PortKit, x: number, z: number, len: number, rng: Rng): void {
  const p = k.solid;
  const hullTop = 0.42;
  p.box(x, -0.35, z, len, hullTop + 0.35, 1.0, '#26364f', { ao: 0.1 });
  p.box(x, -0.35, z + 0.502, len * 0.98, 0.5, 0.012, '#b8432f', { ao: 0 });
  const xe = x + len / 2;
  p.solid([[xe, -0.35, z - 0.5], [xe, -0.35, z + 0.5], [xe, hullTop, z + 0.5], [xe, hullTop, z - 0.5], [xe + 0.65, -0.1, z], [xe + 0.65, hullTop, z]], [[0, 1, 2, 3], [0, 3, 5, 4], [1, 4, 5, 2], [3, 2, 5], [0, 1, 4]], '#26364f', { ao: 0.1 });
  p.box(x, hullTop, z, len, 0.05, 1.02, '#4d6b4a', { ao: 0 });
  const palette: Col[] = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#e86a2c', '#4a5568', '#2fa3b5'];
  const bays = Math.floor((len - 1.5) / 0.46);
  for (let i = 0; i < bays; i++) {
    const bx = x - len / 2 + 1.6 + i * 0.46 + 0.23;
    const tiers = 3 + (i % 3 === 0 ? 1 : 0);
    for (let t = 0; t < tiers; t++) p.box(bx, hullTop + 0.05 + t * 0.12, z, 0.42, 0.115, 0.86, palette[Math.floor(rng.next() * palette.length)], { ao: 0.2 });
  }
  // the deckhouse aft: white block with a funnel and a bridge wing
  const dx = x - len / 2 + 0.55;
  p.box(dx, hullTop, z, 0.7, 1.0, 0.9, '#f4f2ea');
  p.box(dx, hullTop + 1.0, z, 0.8, 0.14, 1.0, '#f4f2ea');
  k.glass.box(dx + 0.36, hullTop + 1.04, z, 0.02, 0.08, 0.9, '#2a3a4c', { ao: 0 });
  for (let r = 0; r < 4; r++) winF(p, dx, hullTop + 0.15 + r * 0.22, z + 0.45, 0.45, 0.08, '#2a3a4c');
  p.cyl(dx - 0.12, hullTop + 1.14, z, 0.14, 0.12, 0.34, '#b8432f', { seg: 10 });
  p.cyl(dx - 0.12, hullTop + 1.42, z, 0.125, 0.125, 0.06, '#26364f', { seg: 10 });
  // mooring lines to the quay
  p.rod([x - 1.5, 0.45, z - 0.5], [x - 1.5, LAND_Y + 0.05, SHORE_Z + 0.1], 0.01, '#3a3f46', 3);
  p.rod([x + 1.5, 0.45, z - 0.5], [x + 1.5, LAND_Y + 0.05, SHORE_Z + 0.1], 0.01, '#3a3f46', 3);
}

const algeciras: Landmark = {
  terrain(k) {
    k.shore = 'rock';
    k.shape.relief = 0.8;
    k.shape.range = 2.4;
    // the bay: open water to the left of the terminal, running back to the Rock across it
    const edge = (z: number): number => k.vx(z) - 1.4;
    const tarmac = new THREE.Color('#9d9c96');
    k.paint((x, y, z, slope, c) => {
      if (z < SHORE_Z - 0.3 && z > -19 && x > edge(z) + 0.6 && y < 0.6) c.lerp(tarmac, 0.85 * smooth(0.6, 1.4, x - edge(z)));
    });
    k.feature((x, z, h) => {
      if (z > SHORE_Z + 1.4 || z < -62) return h;
      const d = edge(z) - x;
      const bank = smooth(-1.4, 0.2, d) * smooth(-62, -54, z);
      return lerp(h, Math.min(h, -0.4), bank);
    });
    const R = makeRock(k.vx(-52) - 12.2, k.vx(-52) - 0.4, -52, 8.6, 1.5);
    k.feature((x, z, h) => h + 0.7 * R.smoothH(x, z));
  },
  build(k) {
    const cx = k.vx(-12.7);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const x0 = k.vx(SHORE_Z) - 1.1;
    quayRun(k, x0, k.width / 2 + 4, '#a3a39d');
    // the Rock of Gibraltar across the bay: a pale, hazy silhouette on the far horizon
    const fz = -52;
    const R = makeRock(k.vx(fz) - 12.2, k.vx(fz) - 0.4, fz, 8.6, 1.5);
    const haze = new THREE.Color('#c3d6e2');
    const c = new THREE.Color();
    const stone = new THREE.Color('#c4c3b8');
    const stone2 = new THREE.Color('#8f9a9e');
    const green = new THREE.Color('#8ea58a');
    patch(p, {
      x0: R.x0 - 0.2,
      x1: R.x1,
      z0: fz + 0.5,
      z1: fz - 7.2,
      nx: 40,
      nz: 16,
      h: (x, z) => k.ground(x, z) + 0.3 * R.smoothH(x, z) + 0.06 + R.crag(x, z),
      skip: (x, z) => R.smoothH(x, z) < 0.04,
      col: (x, y, z, slope) => {
        const n = noise2(x * 0.7, z * 0.7, 5);
        c.copy(green).lerp(stone, smooth(0.18, 0.42, slope) * 0.9 + 0.1).lerp(stone2, n * 0.45);
        return c.lerp(haze, 0.42).clone();
      },
    });
    // the container terminal: ship-to-shore cranes along the quay, stacks behind them, a ship alongside
    containerShip(k, cx + 3.3, -11.1, 7.4, rng);
    for (let i = 0; i < 6; i++) gantryCrane(k, cx + 0.6 + i * 1.5, SHORE_Z - 0.8, { color: i % 2 ? '#2c5da8' : '#c9402e', s: 1.15, y: LAND_Y });
    for (let i = 0; i < 3; i++) containerStack(k, cx + 0.4 + i * 2.2, -13.75, 9, 3, 3, rng);
    containerStack(k, cx + 1.4, -15.6, 14, 3, 4, rng);
    // light masts and the terminal office
    for (const lx of [cx + 1.0, cx + 4.6, cx + 8.0]) {
      p.cyl(lx, LAND_Y, -13.6, 0.03, 0.02, 1.9, '#8a8f94', { seg: 5 });
      p.box(lx - 0.15, LAND_Y + 1.85, -13.6, 0.3, 0.06, 0.1, '#d9d4c7');
      k.glow.box(lx - 0.15, LAND_Y + 1.82, -13.55, 0.3, 0.025, 0.02, '#fff3c0');
    }
    p.box(cx + 9.6, LAND_Y - 0.1, -14.0, 0.9, 1.0, 0.7, '#e9e6dc');
    k.glass.box(cx + 9.6, LAND_Y + 0.6, -13.645, 0.84, 0.3, 0.02, '#6f9fb6', { ao: 0 });
    k.reserve(cx + 4.8, -14.4, 5.6, 2.4);
  },
  rows: 3,
  quiet: true,
  mole: { endX: -7.0, dir: 1 },
};

// ───────────────────────────── Cadiz ─────────────────────────────

/** A dome (half-ellipse profile) on a lathe. */
function domeLathe(p: Part, x: number, y: number, z: number, r: number, h: number, col: Col, seg = 12): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([Math.max(0.001, r * Math.cos(a)), h * Math.sin(a)]);
  }
  p.lathe(x, y, z, pts, col, { seg });
}

const CADIZ_STYLE: HouseStyle = {
  ...REGIONS.med.houses,
  walls: ['#f7f4eb', '#f4efe1', '#efe9d8', '#f2eee3', '#ece5d0', '#f0e3c4'],
  roofs: ['#e4dcc8'],
  floors: [2, 4],
  floorH: 0.19,
  w: [0.3, 0.46],
  d: [0.34, 0.44],
  roofKinds: [['flat', 1]],
  gap: [0, 0.015],
  trim: '#e8e0cb',
};

const cadiz: Landmark = {
  terrain(k) {
    k.shape.relief = 0.3;
    k.shape.range = 1.8;
    k.plateau(k.vx(-14.4), -14.4, 9, 3.6, LAND_Y + 0.02, 0.5);
  },
  build(k) {
    const cx = k.vx(-14.4);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const gy = LAND_Y + 0.02;
    // the old town: tall white terraced houses with flat roofs, all the way along the sea wall
    buildTown(k, { x0: -k.width / 2 - 2, x1: k.width / 2 + 2, z: SHORE_Z - 1.1, rows: 4, rowStep: 0.5, hs: CADIZ_STYLE, gaps: 0.03, rowRise: 0.15, cx });
    // the ramparts of the sea wall
    battlement(k, cx + 0.3, SHORE_Z - 0.4, 10.4, 0.34, 0.5, '#d8ceb4', gy);
    // the cathedral: a baroque facade between two bell towers, and the great yellow dome behind
    const kx = cx + 0.4;
    const kz = -14.0;
    const stone = '#e3d4a6';
    const stone2 = '#d3c18e';
    p.box(kx, gy - 0.1, kz, 2.7, 1.5, 1.9, stone);
    p.box(kx, gy + 1.4, kz, 2.8, 0.07, 2.0, stone2);
    for (const dx of [-0.8, 0.0, 0.8]) p.box(kx + dx, gy - 0.05, kz + 0.97, 0.14, 1.4, 0.1, stone2);
    archF(p, kx, gy + 0.02, kz + 0.953, 0.55, 0.7, '#4a3a2a', 0.5);
    for (const dx of [-0.8, 0.8]) archF(p, kx + dx, gy + 0.5, kz + 0.953, 0.2, 0.5, '#5a4a38', 0.5);
    for (let i = 0; i < 6; i++) winF(p, kx - 1.0 + i * 0.4, gy + 1.05, kz + 0.953, 0.1, 0.22, '#5a4a38');
    for (const dx of [-1.4, 1.4]) {
      p.box(kx + dx, gy - 0.2, kz + 0.1, 0.72, 2.7, 0.8, stone);
      p.box(kx + dx, gy + 2.4, kz + 0.1, 0.8, 0.07, 0.88, stone2);
      archF(p, kx + dx, gy + 1.5, kz + 0.505, 0.22, 0.45, '#4a3a2a', 0.5);
      archR(p, kx + dx + 0.365, gy + 1.5, kz + 0.1, 0.22, 0.45, '#4a3a2a', 0.5);
      archF(p, kx + dx, gy + 0.6, kz + 0.505, 0.12, 0.3, '#5a4a38', 0.5);
      p.box(kx + dx, gy + 2.47, kz + 0.1, 0.62, 0.3, 0.62, stone);
      domeLathe(p, kx + dx, gy + 2.77, kz + 0.1, 0.4, 0.45, '#e6b93a', 10);
      p.cyl(kx + dx, gy + 3.2, kz + 0.1, 0.07, 0.06, 0.2, stone2, { seg: 6 });
      p.ball(kx + dx, gy + 3.45, kz + 0.1, 0.045, '#e0b53f');
    }
    // the drum and the yellow-tiled dome
    const dz = kz - 0.5;
    p.cyl(kx, gy + 1.45, dz, 0.95, 0.9, 0.85, stone, { seg: 14 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      p.box(kx + Math.cos(a) * 0.91, gy + 1.7, dz + Math.sin(a) * 0.91, 0.09, 0.32, 0.09, '#5a4a38', { ao: 0 });
    }
    p.cyl(kx, gy + 2.3, dz, 1.0, 1.0, 0.08, stone2, { seg: 14 });
    domeLathe(p, kx, gy + 2.38, dz, 0.96, 1.15, '#e8bd3a', 14);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r0 = 0.95;
      p.rod([kx + Math.cos(a) * r0, gy + 2.4, dz + Math.sin(a) * r0], [kx + Math.cos(a) * 0.1, gy + 3.5, dz + Math.sin(a) * 0.1], 0.012, '#f0dc9a', 3);
    }
    p.cyl(kx, gy + 3.5, dz, 0.16, 0.14, 0.26, stone2, { seg: 8 });
    p.cone(kx, gy + 3.76, dz, 0.18, 0.16, '#e0b53f', { seg: 8 });
    p.rod([kx, gy + 3.92, dz], [kx, gy + 4.12, dz], 0.012, '#e0b53f', 4);
    k.reserve(kx, -14.3, 2.3, 1.4);
    // Torre Tavira: a slender white watchtower with a glazed lookout
    const tx = cx - 3.8;
    const tz = -14.6;
    p.box(tx, gy - 0.2, tz, 0.5, 2.9, 0.5, '#f8f6ee');
    for (let i = 0; i < 4; i++) winF(p, tx, gy + 0.3 + i * 0.6, tz + 0.25, 0.08, 0.2, '#4a5f6d');
    p.box(tx, gy + 2.7, tz, 0.62, 0.08, 0.62, '#e8e0cb');
    k.glass.box(tx, gy + 2.78, tz, 0.4, 0.3, 0.4, '#8dbdd0');
    p.pyramid(tx, gy + 3.08, tz, 0.5, 0.22, 0.5, '#b8553d');
    k.reserve(tx, tz, 0.5, 0.5);
    for (let i = 0; i < 6; i++) palm(k, cx - 3.5 + i * 1.5 + rng.range(-0.2, 0.2), gy - 0.02, -12.95 - (i % 2) * 0.2, 1.0 + rng.next() * 0.3, rng);
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Malaga ─────────────────────────────

const malaga: Landmark = {
  terrain(k) {
    const cx = k.vx(-16.5);
    k.shape.relief = 0.8;
    k.bump(cx + 1.4, -17.4, 5.8, 3.8, 3.5);
    k.bump(cx + 4.8, -18.5, 3.4, 3.0, 1.6);
    k.paint((x, y, z, slope, c) => {
      if (y > 0.9 && slope < 0.3) c.lerp(new THREE.Color('#9db06a'), 0.4);
    });
  },
  build(k) {
    const cx = k.vx(-16.5);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const sand = '#e0cd9c';
    const sand2 = '#d2bb82';
    // Gibralfaro castle: an enclosure of crenellated walls with a keep, on the crown of the hill
    const gx = cx + 2.2;
    const gz = -17.6;
    const gyy = k.groundMax(gx, gz, 1.0, 0.7);
    battlement(k, gx, gz + 0.7, 2.2, 0.3, 0.55, sand, gyy);
    battlement(k, gx, gz - 0.7, 2.2, 0.3, 0.55, sand, gyy);
    p.box(gx - 1.1, gyy - 0.2, gz, 0.3, 0.75, 1.5, sand);
    p.box(gx + 1.1, gyy - 0.2, gz, 0.3, 0.75, 1.5, sand);
    for (const [dx, dz] of [[-1.1, 0.7], [1.1, 0.7], [-1.1, -0.7], [1.1, -0.7]] as Array<[number, number]>) roundTower(k, gx + dx, gz + dz, 0.2, 1.0, sand2, null, gyy);
    p.box(gx + 0.2, gyy - 0.1, gz, 0.7, 1.25, 0.6, sand2);
    for (let i = 0; i < 5; i++) p.box(gx - 0.12 + i * 0.16, gyy + 1.15, gz + 0.28, 0.09, 0.1, 0.06, '#e6d6a8', { ao: 0 });
    winF(p, gx + 0.2, gyy + 0.4, gz + 0.305, 0.1, 0.25, '#4a3f2e');
    k.reserve(gx, gz, 1.5, 1.0);
    // the Alcazaba: terraces of walls with horseshoe gates, towers and the long wall (coracha) to the hilltop
    const tiers: Array<[number, number, number]> = [[cx - 0.8, -15.4, 2.6], [cx - 0.5, -16.2, 2.2], [cx - 0.3, -16.9, 1.8]];
    tiers.forEach(([ax, az, aw], i) => {
      const ay = k.groundMax(ax, az, aw / 2, 0.2);
      battlement(k, ax, az, aw, 0.32, 0.5 + 0.08 * i, i % 2 ? sand : sand2, ay);
      for (const sd of [-1, 1]) {
        const tx = ax + sd * (aw / 2);
        p.box(tx, ay - 0.2, az, 0.36, 1.0 + i * 0.1, 0.36, sand2);
        for (let q = 0; q < 3; q++) p.box(tx - 0.12 + q * 0.12, ay + 0.8 + i * 0.1, az + 0.14, 0.07, 0.09, 0.06, '#e6d6a8', { ao: 0 });
        winF(p, tx, ay + 0.4, az + 0.18, 0.06, 0.18, '#4a3f2e');
      }
      archF(p, ax, ay + 0.0, az + 0.165, 0.2, 0.3, '#3d3224', 0.5);
      k.reserve(ax, az, aw / 2 + 0.2, 0.3);
    });
    p.box(cx + 0.9, k.ground(cx + 0.9, -17.0) - 0.15, -17.0, 1.7, 0.45, 0.14, sand, { ry: -0.12 });
    p.box(cx + 1.6, k.ground(cx + 1.6, -17.3) - 0.15, -17.35, 0.8, 0.5, 0.14, sand, { ry: -0.3 });
    // La Farola: the old stone lighthouse is the breakwater's light; palms along the Paseo del Parque
    for (let i = 0; i < 9; i++) palm(k, cx - 5 + i * 1.3 + rng.range(-0.2, 0.2), k.ground(cx - 5 + i * 1.3, -13.0) - 0.02, -13.0 - (i % 2) * 0.2, 1.1 + rng.next() * 0.3, rng);
    // the cathedral with its single tower, the unfinished one
    const kx = cx - 3.8;
    const kz = -14.4;
    const ky = k.ground(kx, kz) - 0.02;
    p.box(kx, ky - 0.15, kz, 1.7, 1.15, 1.0, '#e3d8bd');
    p.prism(kx, ky + 1.0, kz, 0.9, 0.3, 1.5, '#8a8f94', { ry: Math.PI / 2 });
    p.box(kx + 0.5, ky - 0.15, kz + 0.1, 0.55, 2.7, 0.55, '#e3d8bd');
    archF(p, kx + 0.5, ky + 1.6, kz + 0.38, 0.14, 0.4, '#4a4036', 0.5);
    p.box(kx + 0.5, ky + 2.5, kz + 0.1, 0.65, 0.07, 0.65, '#cfc3a4');
    domeLathe(p, kx + 0.5, ky + 2.57, kz + 0.1, 0.3, 0.3, '#6f8f84', 10);
    p.ball(kx + 0.5, ky + 2.93, kz + 0.1, 0.04, '#e0b53f');
    k.reserve(kx + 0.2, kz, 1.1, 0.7);
  },
  rows: 3,
  mole: { light: { h: 3.4, r0: 0.3, r1: 0.19, bands: [['#e5d9bc', 0.4], ['#f2ede0', 0.4], ['#cfc3a4', 0.2]], cap: '#8a8f94', gallery: '#6a5a46', cottage: false } },
  quiet: true,
};

// ───────────────────────────── Las Palmas ─────────────────────────────

const CONE: Array<[number, number]> = [[0, 0.78], [0.1, 0.84], [0.22, 1], [0.42, 0.62], [0.68, 0.26], [1, 0]];
const PASTEL_ISLE: Col[] = ['#f4d6a8', '#efb9a0', '#e8d08a', '#c9dccb', '#f2c9c4', '#b9d4e0', '#f0e3b8', '#e9a98e', '#f6f3ea', '#e6a68a'];

const laspalmas: Landmark = {
  terrain(k) {
    const cx = k.vx(-16.5);
    k.shape.relief = 0.8;
    k.shape.range = 2.5;
    const c1 = volcano(cx - 1.4, -17.4, 4.6, 3.3, CONE, 0.06);
    const c2 = volcano(cx + 3.7, -18.4, 4.0, 2.7, CONE, 0.06);
    const c3 = volcano(cx - 7.2, -15.6, 3.5, 2.3, CONE, 0.06);
    k.feature((x, z, h) => h + Math.max(c1(x, z), c2(x, z), c3(x, z)));
    k.paint((x, y, z, slope, c) => {
      const f = smooth(0.7, 3.0, y);
      c.lerp(new THREE.Color(slope > 0.18 ? '#6f4d3a' : '#a9794a'), 0.7 * f);
      if (y > 0.9 && noise2(x * 1.3, z * 1.3, 4) > 0.55) c.lerp(new THREE.Color('#4f3a30'), 0.35 * f);
    });
  },
  build(k) {
    const cx = k.vx(-16.5);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    // pastel houses climbing the cones in terraces
    const cones: Array<[number, number, number]> = [[cx - 1.4, -17.4, 4.2], [cx + 3.7, -18.4, 3.6], [cx - 7.2, -15.6, 3.1]];
    for (const [ox, oz, R] of cones) {
      for (let ring = 0; ring < 7; ring++) {
        const r = R * (0.36 + ring * 0.09);
        const n = Math.floor(r * 2.6);
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.02 + 0.96 * (i + rng.next() * 0.6) / n); // the half facing the camera
          const x = ox + Math.cos(a) * r * 1.0 - 0.0;
          const z = oz + Math.sin(a) * r * 0.85;
          if (z > -13.4 || k.isReserved(x, z, 0.02)) continue;
          const g = k.groundMax(x, z, 0.2, 0.18);
          if (g < 0.35 || g > 3.2) continue;
          const w = rng.range(0.28, 0.42);
          villa(k, x, g - 0.06, z, w, 0.3, rng.chance(0.3) ? 3 : 2, PASTEL_ISLE[Math.floor(rng.next() * PASTEL_ISLE.length)], TILES[Math.floor(rng.next() * TILES.length)], { sink: 0.3, roofKind: rng.chance(0.55) ? 'flat' : 'hip' });
        }
      }
    }
    // Castillo de la Luz: a squat sandy fort with round corner towers at the shore
    const fx = cx - 3.3;
    const fz = -13.5;
    const fy = LAND_Y;
    p.box(fx, fy - 0.1, fz, 1.1, 0.55, 0.8, '#d6c49a');
    p.box(fx, fy + 0.45, fz, 1.14, 0.05, 0.84, '#c4b184', { ao: 0 });
    for (let i = 0; i < 8; i++) p.box(fx - 0.5 + i * 0.145, fy + 0.5, fz + 0.38, 0.08, 0.08, 0.06, '#d6c49a', { ao: 0 });
    for (const [dx, dz] of [[-0.55, 0.4], [0.55, 0.4], [-0.55, -0.4], [0.55, -0.4]] as Array<[number, number]>) roundTower(k, fx + dx, fz + dz, 0.2, 0.75, '#d0bc8f', null, fy);
    archF(p, fx, fy, fz + 0.405, 0.2, 0.3, '#4a3b28', 0.5);
    k.reserve(fx, fz, 0.8, 0.6);
    // the lighthouse on the Isleta, and a lookout
    const lx = cx - 7.2;
    const lz = -15.7;
    lighthouse(k, lx, k.ground(lx, lz) - 0.05, lz, { h: 1.5, r0: 0.18, r1: 0.12, bands: [['#f6f3ea', 0.7], ['#2d3138', 0.3]], cap: '#2d3138', gallery: '#2d3138' });
    k.reserve(lx, lz, 0.4, 0.4);
    // palms along the Paseo
    for (let i = 0; i < 12; i++) {
      const x = cx - 6 + i * 1.1 + rng.range(-0.2, 0.2);
      if (k.isReserved(x, -12.9, 0.1)) continue;
      palm(k, x, k.ground(x, -12.9) - 0.02, -12.9 - (i % 2) * 0.2, 1.1 + rng.next() * 0.35, rng);
    }
    for (let i = 0; i < 20; i++) {
      const x = cx + rng.range(-8, 8);
      const z = rng.range(-14.6, -13.4);
      if (k.isReserved(x, z, 0.1) || k.ground(x, z) < 0.3) continue;
      palm(k, x, k.ground(x, z) - 0.02, z, 1.0 + rng.next() * 0.4, rng);
    }
  },
  rows: 2,
  quiet: true,
};

// ───────────────────────────── Funchal ─────────────────────────────

const FUN = { z0: -12.9, depth: 9.5, H: 7.2, tread: 0.5 };

/** Funchal's amphitheatre of slopes (before terracing): rising from the quay to the mountain wall. */
function funchalSlope(cx: number) {
  const smoothH = (x: number, z: number): number => {
    const d = FUN.z0 - z;
    if (d <= 0) return 0;
    const bowl = (0.78 + 0.34 * smooth(2.5, 9, Math.abs(x - cx))) * (1 - smooth(8, 11, Math.abs(x - cx)));
    const prof = curve([[0, 0], [0.8, 0.05], [3, 0.2], [6, 0.5], [FUN.depth, 0.86], [FUN.depth + 4, 1]], d, 0.4);
    return FUN.H * prof * bowl;
  };
  const terraced = (x: number, z: number): number => {
    const u = smoothH(x, z) / FUN.tread;
    const f = Math.floor(u);
    return (f + smooth(0.6, 1, u - f)) * FUN.tread;
  };
  return { smoothH, terraced };
}

const funchal: Landmark = {
  terrain(k) {
    const cx = k.vx(-17);
    k.shape.relief = 0.3;
    k.shape.range = 2.0;
    const F = funchalSlope(cx);
    k.feature((x, z, h) => h + 0.75 * F.smoothH(x, z));
    k.palette = { ...k.palette, hill: '#6f9a4c', land: '#86ad57', land2: '#7aa44f', rock: '#8a8a6a' };
  },
  build(k) {
    const cx = k.vx(-17);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const F = funchalSlope(cx);
    const gh = (x: number, z: number): number => k.baseHeight(x, z) + F.terraced(x, z) + 0.04;
    const tread = new THREE.Color('#7fa853');
    const tread2 = new THREE.Color('#5f8f45');
    const riser = new THREE.Color('#b9b08c');
    const c = new THREE.Color();
    const x0 = cx - 11;
    const x1 = cx + 11;
    patch(p, {
      x0,
      x1,
      z0: FUN.z0 + 0.1,
      z1: FUN.z0 - FUN.depth - 3,
      nx: 30,
      nz: 40,
      h: gh,
      skip: (x, z) => F.smoothH(x, z) < 0.04,
      col: (x, y, z, slope) => {
        const n = noise2(x * 2.2, z * 2.2, 11);
        c.copy(tread).lerp(tread2, clamp(n * 1.3 - 0.2));
        if (y > 5.2) c.lerp(new THREE.Color('#4f7f3f'), smooth(5.2, 7, y) * 0.5);
        return c.lerp(riser, smooth(0.32, 0.6, slope) * 0.85).multiplyScalar(0.94 + n * 0.1).clone();
      },
    });
    // white houses with red roofs, thick at the quay and thinning out up the terraces
    for (let zz = FUN.z0 - 0.5; zz > FUN.z0 - 8.5; zz -= 0.55) {
      for (let x = x0 + 0.5; x < x1 - 0.5; x += rng.range(0.55, 0.85)) {
        const z = zz + rng.range(-0.1, 0.1);
        const g = gh(x, z);
        if (g < 0.3 || Math.abs(x - cx) > 7.6) continue;
        if (!rng.chance(0.95 - 0.85 * smooth(1.2, 5.8, g))) continue;
        const gMax = Math.max(g, gh(x, z + 0.17), gh(x + 0.18, z), gh(x - 0.18, z));
        const gMin = Math.min(g, gh(x, z - 0.17), gh(x + 0.18, z), gh(x - 0.18, z));
        if (gMax - gMin > 0.62) continue;
        const w = rng.range(0.28, 0.4);
        villa(k, x, gMax, z, w, 0.3, rng.chance(0.25) ? 3 : 2, rng.chance(0.78) ? WHITES[Math.floor(rng.next() * WHITES.length)] : PASTELS[Math.floor(rng.next() * PASTELS.length)], rng.chance(0.85) ? '#c0472f' : '#b8553d', { sink: gMax - gMin + 0.12, roofKind: 'hip', detail: Math.abs(x - cx) < 5 && g < 2.5 });
      }
    }
    k.reserve(cx, FUN.z0 - 6, 11, 7.5);
    // Monte church: twin baroque towers over a white nave and a grand stair
    const mx = cx + 1.2;
    const mz = -19.4;
    const my = gh(mx, mz);
    p.box(mx, my - 0.3, mz, 1.5, 1.0, 0.9, '#f6f3ea');
    p.prism(mx, my + 0.7, mz, 0.9, 0.3, 1.5, '#b8553d', { ry: Math.PI / 2 });
    for (const dx of [-0.75, 0.75]) {
      p.box(mx + dx, my - 0.3, mz + 0.25, 0.6, 2.8, 0.6, '#f6f3ea');
      for (const sx of [-1, 1]) p.box(mx + dx + sx * 0.31, my - 0.2, mz + 0.55, 0.06, 2.5, 0.06, '#6f6a60', { ao: 0 });
      archF(p, mx + dx, my + 1.5, mz + 0.555, 0.16, 0.36, '#4a4036', 0.5);
      archR(p, mx + dx + 0.305, my + 1.5, mz + 0.25, 0.16, 0.36, '#4a4036', 0.5);
      p.box(mx + dx, my + 2.3, mz + 0.25, 0.66, 0.07, 0.66, '#6f6a60');
      domeLathe(p, mx + dx, my + 2.37, mz + 0.25, 0.32, 0.5, '#6e8294', 10);
      p.cone(mx + dx, my + 2.82, mz + 0.25, 0.08, 0.24, '#6e8294', { seg: 6 });
      p.ball(mx + dx, my + 3.1, mz + 0.25, 0.035, '#d8b24a');
    }
    archF(p, mx, my + 0.0, mz + 0.455, 0.3, 0.5, '#3a3228', 0.5);
    p.box(mx, my - 0.05, mz + 0.9, 1.0, 0.18, 0.7, '#e6e0d0', { rx: 0.0 });
    k.reserve(mx, mz, 1.1, 0.9);
    // the cable car: four pylons climbing to Monte and two red cabins
    const ca: V3 = [cx - 3.0, 0, -13.6];
    const cb: V3 = [mx - 1.3, 0, -19.1];
    const pts: V3[] = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = lerp(ca[0], cb[0], t);
      const z = lerp(ca[2], cb[2], t);
      const g = gh(x, z);
      const ph = 0.9 + 0.3 * t;
      p.cyl(x, g - 0.2, z, 0.05, 0.03, ph + 0.2, '#c9ced2', { seg: 6 });
      p.box(x, g + ph - 0.02, z, 0.3, 0.04, 0.05, '#c9ced2', { ao: 0 });
      pts.push([x, g + ph, z]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      p.rod([pts[i][0] - 0.1, pts[i][1], pts[i][2]], [pts[i + 1][0] - 0.1, pts[i + 1][1], pts[i + 1][2]], 0.013, '#2a2d32', 3);
      p.rod([pts[i][0] + 0.1, pts[i][1], pts[i][2]], [pts[i + 1][0] + 0.1, pts[i + 1][1], pts[i + 1][2]], 0.013, '#2a2d32', 3);
    }
    for (const t of [0.3, 0.72]) {
      const seg = Math.min(3, Math.floor(t * 4));
      const lt = t * 4 - seg;
      const x = lerp(pts[seg][0], pts[seg + 1][0], lt) + (t < 0.5 ? -0.1 : 0.1);
      const y = lerp(pts[seg][1], pts[seg + 1][1], lt);
      const z = lerp(pts[seg][2], pts[seg + 1][2], lt);
      p.rod([x, y, z], [x, y - 0.22, z], 0.015, '#2a2d32', 3);
      p.box(x - 0.15, y - 0.5, z - 0.12, 0.3, 0.3, 0.24, '#d8392b');
      k.glass.box(x - 0.13, y - 0.45, z + 0.122, 0.26, 0.16, 0.012, '#bfe0ee', { ao: 0 });
    }
    // palm and banana greens on the treads
    for (let i = 0; i < 40; i++) {
      const x = rng.range(x0 + 0.5, x1 - 0.5);
      const z = rng.range(FUN.z0 - 8, FUN.z0 - 0.8);
      if (k.isReserved(x, z, 0.0)) continue;
      const g = gh(x, z);
      if (rng.chance(0.4)) palm(k, x, g - 0.02, z, 0.9 + rng.next() * 0.3, rng);
      else p.blob(x, g + 0.08, z, rng.range(0.1, 0.18), rng.chance(0.5) ? '#4a8a3d' : '#5a9a45', { sy: 0.8 });
    }
  },
  rows: 1,
  quiet: true,
};

// ───────────────────────────── shared: walls & small craft ─────────────────────────────

/** A crenellated wall running between two points on y (a curtain wall segment). */
function wallRun(p: Part, x1: number, z1: number, x2: number, z2: number, y: number, h: number, thick: number, col: Col, merlons = true): void {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ang = Math.atan2(-(z2 - z1), x2 - x1); // rotation about y that turns +x onto the segment
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  p.box(mx, y - 0.25, mz, len, h + 0.25, thick, col, { ry: ang });
  if (!merlons) return;
  const n = Math.max(2, Math.floor(len / 0.2));
  const light = tint(col, 0.08);
  for (let i = 0; i < n; i += 2) {
    const t = ((i + 0.5) / n - 0.5) * len;
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang) * t - Math.sin(ang) * 0 + Math.sin(ang) * side * (thick / 2 - 0.02);
      const oz = -Math.sin(ang) * t + Math.cos(ang) * side * (thick / 2 - 0.02);
      p.box(mx + ox, y + h, mz + oz, len / n, 0.07, 0.045, light, { ry: ang, ao: 0 });
    }
  }
}

/** A Douro rabelo: a flat barge with one big square sail and a long steering oar. */
function rabelo(k: PortKit, x: number, z: number, ry = 0): void {
  const p = k.solid;
  p.at(x, 0, z, ry, 1, () => {
    p.box(0, -0.08, 0, 0.8, 0.15, 0.2, '#6a4a32', { ao: 0.1 });
    p.prism(0.46, -0.08, 0, 0.2, 0.15, 0.19, '#6a4a32');
    p.prism(-0.48, -0.08, 0, 0.2, 0.15, 0.19, '#6a4a32', { ax: -0.3 });
    p.box(0, 0.06, 0, 0.78, 0.015, 0.2, '#d9c9a0', { ao: 0 });
    p.cyl(0.05, 0.06, 0, 0.012, 0.01, 0.62, '#5b4636', { seg: 4 });
    p.rod([-0.12, 0.62, -0.19], [-0.12, 0.62, 0.19], 0.008, '#5b4636', 3);
    p.quad([0.03, 0.2, -0.17], [0.03, 0.2, 0.17], [0.03, 0.62, 0.17], [0.03, 0.62, -0.17], '#f1ece0', true);
    p.quad([0.032, 0.34, -0.03], [0.032, 0.34, 0.03], [0.032, 0.5, 0.03], [0.032, 0.5, -0.03], '#c8302a', true);
    p.quad([0.032, 0.4, -0.1], [0.032, 0.4, 0.1], [0.032, 0.44, 0.1], [0.032, 0.44, -0.1], '#c8302a', true);
    p.rod([-0.45, 0.04, 0.0], [-0.72, 0.38, 0.0], 0.012, '#5b4636', 4);
    for (let i = 0; i < 3; i++) p.cyl(-0.2 + i * 0.16, 0.07, 0, 0.04, 0.04, 0.08, '#8a5a36', { seg: 6 });
  });
}

/** A replica caravel: a rounded wooden hull, castles fore and aft, three masts, square sails with the red cross. */
function caravel(k: PortKit, x: number, z: number, len: number, ry: number, hull: Col): void {
  const p = k.solid;
  const sail = '#f1ece0';
  k.at(x, 0, z, ry, len / 3, () => {
    p.box(0, -0.2, 0, 3.0, 0.5, 0.78, hull, { ao: 0.12 });
    p.prism(1.62, -0.2, 0, 0.7, 0.5, 0.3, hull);
    p.box(0, 0.28, 0, 3.0, 0.04, 0.8, '#d6b26a', { ao: 0 });
    p.box(-1.05, 0.3, 0, 0.9, 0.34, 0.74, hull);
    p.box(-1.05, 0.64, 0, 0.92, 0.03, 0.76, '#d6b26a', { ao: 0 });
    p.box(1.25, 0.3, 0, 0.5, 0.2, 0.62, hull);
    for (let i = 0; i < 6; i++) p.box(-1.0 + i * 0.4, 0.04, 0.392, 0.1, 0.08, 0.01, '#1a1a1a', { ao: 0 });
    p.rod([1.5, 0.45, 0], [2.2, 0.72, 0], 0.03, '#6a4a32', 5);
    const masts: Array<[number, number]> = [[-0.75, 2.2], [0.1, 2.7], [1.0, 2.0]];
    for (const [mx, hgt] of masts) {
      p.cyl(mx, 0.3, 0, 0.035, 0.022, hgt, '#6a4a32', { seg: 5 });
      for (let sl = 0; sl < 2; sl++) {
        const sy = 0.7 + sl * 0.85;
        const w = 1.1 - sl * 0.25;
        const hh = 0.8;
        p.rod([mx, sy + hh, -w / 2 - 0.05], [mx, sy + hh, w / 2 + 0.05], 0.014, '#5b4636', 4);
        p.quad([mx + 0.04, sy, -w / 2], [mx + 0.04, sy, w / 2], [mx + 0.04, sy + hh, w / 2], [mx + 0.04, sy + hh, -w / 2], sail, true);
        // the red cross on the sail
        const cy = sy + hh * 0.5;
        p.quad([mx + 0.05, sy + 0.08, -0.07], [mx + 0.05, sy + 0.08, 0.07], [mx + 0.05, sy + hh - 0.08, 0.07], [mx + 0.05, sy + hh - 0.08, -0.07], '#c8302a', true);
        p.quad([mx + 0.05, cy - 0.07, -w * 0.4], [mx + 0.05, cy - 0.07, w * 0.4], [mx + 0.05, cy + 0.07, w * 0.4], [mx + 0.05, cy + 0.07, -w * 0.4], '#c8302a', true);
      }
    }
  });
}

// ───────────────────────────── Leixoes (Porto) ─────────────────────────────

/** Dom Luis I: a grey double-deck iron bridge, its crescent arch carrying the upper road and hanging the lower one. */
function domLuis(k: PortKit, xa: number, xb: number, z: number, yBase: number, yCrown: number, yTop: number): void {
  const p = k.solid;
  const iron = '#8c9399';
  const iron2 = '#70777d';
  const half = 0.2;
  const cx = (xa + xb) / 2;
  const W = (xb - xa) / 2;
  const arc = (t: number, lift: number): V3 => [lerp(xa, xb, t), yBase + (yCrown - yBase) * (1 - Math.pow(2 * t - 1, 2)) + lift, z];
  const n = 18;
  for (const sd of [-1, 1]) {
    const zz = z + sd * half;
    for (let i = 0; i < n; i++) {
      const a0 = arc(i / n, 0);
      const a1 = arc((i + 1) / n, 0);
      const b0 = arc(i / n, 0.32 + 0.1 * Math.sin((i / n) * Math.PI));
      const b1 = arc((i + 1) / n, 0.32 + 0.1 * Math.sin(((i + 1) / n) * Math.PI));
      p.rod([a0[0], a0[1], zz], [a1[0], a1[1], zz], 0.03, iron, 4);
      p.rod([b0[0], b0[1], zz], [b1[0], b1[1], zz], 0.03, iron, 4);
      // lattice between the two ribs
      p.rod([a0[0], a0[1], zz], [b1[0], b1[1], zz], 0.012, iron2, 3);
      p.rod([b0[0], b0[1], zz], [a1[0], a1[1], zz], 0.012, iron2, 3);
    }
  }
  for (let i = 0; i <= n; i += 2) {
    const a = arc(i / n, 0.4);
    for (const sd of [-1, 1]) p.rod([a[0], a[1], z + sd * half], [a[0], i % 4 === 0 ? yTop : yTop, z + sd * half], 0.016, iron, 4);
  }
  // cross-bracing between the two ribs
  for (let i = 1; i < n; i += 3) {
    const a = arc(i / n, 0.1);
    p.rod([a[0], a[1], z - half], [a[0], a[1], z + half], 0.016, iron2, 3);
  }
  // the upper deck carried above the crown, the lower deck hung from the arch
  p.box(cx, yTop - 0.04, z, xb - xa + 0.6, 0.1, half * 2.4, iron2);
  p.box(cx, yTop + 0.06, z - half * 1.1, xb - xa + 0.6, 0.04, 0.03, iron, { ao: 0 });
  p.box(cx, yTop + 0.06, z + half * 1.1, xb - xa + 0.6, 0.04, 0.03, iron, { ao: 0 });
  p.box(cx, yBase - 0.1, z, xb - xa - 0.5, 0.08, half * 2, iron2);
  for (let i = 1; i < n; i += 2) {
    const a = arc(i / n, 0);
    for (const sd of [-1, 1]) p.rod([a[0], a[1], z + sd * half], [a[0], yBase - 0.05, z + sd * half], 0.012, iron2, 3);
  }
  // abutments
  void W;
}

const leixoes: Landmark = {
  terrain(k) {
    const cx = k.vx(-15.5) - 0.8;
    k.shape.relief = 0.8;
    carve(k, cx, 3.2, -36, 0.06);
    k.bump(cx - 6.0, -16.2, 3.4, 3.4, 3.3);
    k.bump(cx + 6.0, -16.2, 3.4, 3.4, 3.3);
    k.shore = 'rock';
  },
  build(k) {
    const cx = k.vx(-15.5) - 0.8;
    const p = k.solid;
    quayRun(k, -k.width / 2 - 4, cx - 3.6);
    quayRun(k, cx + 3.6, k.width / 2 + 4);
    bankWall(k, cx - 3.6, SHORE_Z, -16.2);
    bankWall(k, cx + 3.6, SHORE_Z, -16.2);
    const z = -15.8;
    const ya = Math.max(k.ground(cx - 4.5, z), 1.0);
    const yb = Math.max(k.ground(cx + 4.5, z), 1.0);
    domLuis(k, cx - 3.9, cx + 3.9, z, 1.5, 3.2, 3.95);
    // slim granite piers carry the upper road on the cliff tops
    for (const [px, py] of [[cx - 4.4, ya], [cx + 4.4, yb]] as Array<[number, number]>) {
      p.box(px, py - 0.4, z, 0.45, 3.95 - py + 0.4, 0.5, '#a9a79f');
      p.box(px + (px < cx ? -0.9 : 0.9), 3.9, z, 1.5, 0.1, 0.5, '#70777d');
    }
    // rabelo boats on the river and wine cellars on the quay
    rabelo(k, cx - 1.4, -13.2, 0.1);
    rabelo(k, cx + 0.9, -14.4, -0.15);
    rabelo(k, cx - 0.2, -12.7, 0.0);
    for (let i = 0; i < 5; i++) {
      const bx = cx - 7.6 + i * 0.6;
      villa(k, bx, LAND_Y, -13.1, 0.5, 0.34, 2, ['#f0e3b8', '#e9b9a0', '#c9dccb', '#f4d6a8', '#b9d4e0'][i], '#b8553d', { roofKind: 'gable' });
    }
    // the cruise terminal and a cruise liner at the Leixoes quay, with the refinery stacks behind
    const tx = cx + 7.4;
    p.extrude([[-1.2, 0], [1.2, 0], [1.2, 0.42], [0.2, 0.62], [-1.2, 0.9]], 1.0, tx, LAND_Y - 0.04, -13.4, '#f4f2ec', { ao: 0.08 });
    k.glass.box(tx - 1.15, LAND_Y + 0.05, -12.9, 2.3, 0.32, 0.02, '#7fb6cf', { ao: 0 });
    for (let i = 0; i < 3; i++) stack(k, cx + 9.2 + i * 0.7, -16.2 - (i % 2) * 0.5, 2.4 - i * 0.2, 0.12, LAND_Y - 0.02, '#c8302a');
    for (let i = 0; i < 4; i++) {
      p.cyl(cx + 6.4 + (i % 2) * 1.2, LAND_Y - 0.05, -17.3 - Math.floor(i / 2) * 1.2, 0.52, 0.52, 0.75, i % 2 ? '#e8e6e0' : '#d9d6cc', { seg: 12 });
    }
    k.reserve(cx + 8.2, -15.8, 3.0, 2.8);
    for (const sd of [-1, 1]) k.reserve(cx + sd * 4.6, z, 1.0, 0.8);
  },
  rows: 3,
  quiet: true,
  mole: { endX: -8.0, dir: 1 },
};

// ───────────────────────────── Huelva ─────────────────────────────

const huelva: Landmark = {
  terrain(k) {
    k.shape.relief = 0.3;
    k.shape.range = 1.6;
    k.plateau(k.vx(-15), -15, 12, 4, LAND_Y + 0.02, 0.6);
  },
  build(k) {
    const cx = k.vx(-13.5) + 1.0;
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    // the wharf of the caravels: a timber quay with the three replicas moored along it
    p.box(cx + 0.6, -0.2, SHORE_Z + 0.5, 9.4, 0.55, 0.9, '#8a6a46');
    for (let i = 0; i < 12; i++) p.cyl(cx - 3.9 + i * 0.8, 0.3, SHORE_Z + 0.98, 0.05, 0.05, 0.14, '#4a3626', { seg: 5 });
    caravel(k, cx - 2.3, -10.7, 2.7, 0.0, '#8a5a36');
    caravel(k, cx + 0.5, -10.9, 2.35, 0.0, '#7d4f2e');
    caravel(k, cx + 2.9, -10.8, 2.2, 0.0, '#946238');
    // the Muelle del Tinto: a rust-red iron pier on trestles reaching out over the ria, with a loading gantry
    const px = k.vx(-10.2) - 5.2;
    const rust = '#a9552f';
    const rust2 = '#7d3b22';
    p.box(px, 0.8, -10.2, 0.4, 0.12, 3.6, rust2);
    p.box(px + 0.0, 0.92, -10.2, 0.06, 0.1, 3.6, rust, { ao: 0 });
    for (let i = 0; i < 5; i++) {
      const zz = -11.9 + i * 0.8;
      for (const sd of [-1, 1]) {
        p.rod([px + sd * 0.18, -0.9, zz], [px + sd * 0.09, 0.8, zz], 0.035, rust, 4);
      }
      p.rod([px - 0.17, 0.0, zz], [px + 0.17, 0.8, zz], 0.015, rust, 3);
      p.rod([px + 0.17, 0.0, zz], [px - 0.17, 0.8, zz], 0.015, rust, 3);
      if (i < 4) {
        p.rod([px - 0.14, 0.0, zz], [px - 0.14, 0.8, zz + 0.8], 0.012, rust, 3);
        p.rod([px + 0.14, 0.0, zz + 0.8], [px + 0.14, 0.8, zz], 0.012, rust, 3);
      }
    }
    p.box(px, 0.9, -8.5, 0.7, 0.9, 0.5, rust);
    p.box(px, 1.8, -8.5, 0.9, 0.06, 0.6, rust2);
    p.rod([px - 0.3, 1.8, -8.5], [px - 0.3, 2.5, -8.5], 0.025, rust, 4);
    p.rod([px + 0.3, 1.8, -8.5], [px + 0.3, 2.5, -8.5], 0.025, rust, 4);
    p.box(px, 2.5, -8.5, 0.8, 0.07, 0.12, rust2);
    for (const sd of [-1, 1]) p.rod([px + sd * 0.2, -0.9, -8.5], [px + sd * 0.2, 0.9, -8.5], 0.04, rust, 4);
    p.box(px, 0.8, SHORE_Z + 0.4, 0.4, 0.12, 2.0, rust2);
    // the chemical works behind: tall striped chimneys, tanks and sheds
    for (let i = 0; i < 4; i++) stack(k, cx + 1.8 + i * 0.95, -16.4 - (i % 2) * 0.8, 3.4 - i * 0.25, 0.14, LAND_Y - 0.02, i % 2 ? '#c8302a' : '#2c5da8');
    for (let i = 0; i < 3; i++) p.cyl(cx - 3.2 + i * 1.2, LAND_Y - 0.05, -16.4, 0.5, 0.5, 0.7, '#e8e6e0', { seg: 12 });
    p.box(cx - 0.5, LAND_Y - 0.1, -14.4, 3.2, 0.8, 1.0, '#d9d4c7');
    p.prism(cx - 0.5, LAND_Y + 0.7, -14.4, 1.0, 0.25, 3.3, '#7f8a92', { ry: Math.PI / 2 });
    for (let i = 0; i < 9; i++) winF(p, cx - 1.9 + i * 0.36, LAND_Y + 0.3, -13.9, 0.14, 0.2, '#566574');
    k.reserve(cx + 0.5, -15.2, 5.4, 2.4);
    void rng;
  },
  rows: 2,
  quiet: true,
  mole: { endX: -10.2, dir: 1 },
};

// ───────────────────────────── Ceuta ─────────────────────────────

const ceuta: Landmark = {
  terrain(k) {
    const cx = k.vx(-16);
    k.shape.relief = 0.5;
    // Monte Hacho: the big headland on the right, steep on its sea side
    k.bump(cx + 4.8, -18.6, 6.4, 5.0, 3.7);
    // the moat of the Royal Walls: a water channel in front of the ramparts, open at both ends to the sea
    k.feature((x, z, h) => {
      if (z > -12.6 || z < -14.5 || x < cx - 6.2 || x > cx + 0.6) return h;
      const dz = smooth(0.0, 0.25, Math.min(z + 14.5, -12.6 - z));
      const dx = smooth(cx - 6.2, cx - 5.4, x) * smooth(cx + 0.6, cx - 0.2, x);
      return lerp(h, Math.min(h, -0.3), dz * dx);
    });
    k.paint((x, y, z, slope, c) => {
      if (y > 1.4) c.lerp(new THREE.Color('#a8a574'), 0.4);
    });
  },
  build(k) {
    const cx = k.vx(-16);
    const p = k.solid;
    const stone = '#dccba2';
    const stone2 = '#cdbb8e';
    // the Royal Walls: a long curtain with square towers, a stone bridge over the moat and a gate
    const wz = -14.9;
    wallRun(p, cx - 6.0, wz, cx + 0.5, wz, LAND_Y, 1.25, 0.4, stone);
    for (const tx of [cx - 5.6, cx - 3.6, cx - 0.9, cx + 0.2]) {
      p.box(tx, LAND_Y - 0.25, wz, 0.62, 1.95, 0.62, stone2);
      for (let q = 0; q < 4; q++) p.box(tx - 0.24 + q * 0.16, LAND_Y + 1.65, wz + 0.28, 0.09, 0.12, 0.08, '#e8dbb4', { ao: 0 });
      winF(p, tx, LAND_Y + 0.9, wz + 0.32, 0.09, 0.26, '#4a3f2e');
    }
    // the bridge and gate: a double arch of the Puerta
    p.box(cx - 2.25, LAND_Y - 0.08, -13.75, 0.8, 0.14, 2.3, '#cfc3a4');
    
    p.box(cx - 2.25, LAND_Y - 0.25, wz, 1.3, 1.7, 0.5, stone2);
    archF(p, cx - 2.25, LAND_Y, wz + 0.255, 0.42, 0.6, '#3d3224', 0.5);
    for (let q = 0; q < 5; q++) p.box(cx - 2.8 + q * 0.28, LAND_Y + 1.42, wz + 0.2, 0.12, 0.12, 0.08, '#e8dbb4', { ao: 0 });
    k.reserve(cx - 2.8, wz + 0.5, 3.4, 1.5);
    // Monte Hacho: a star fort on the summit, the lighthouse on the point
    const hx = cx + 4.0;
    const hz = -19.0;
    const hy = k.groundMax(hx, hz, 1.2, 1.0);
    const verts: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      verts.push([hx + Math.cos(a) * 1.4, hz + Math.sin(a) * 1.1]);
    }
    for (let i = 0; i < 6; i++) {
      const [x1, z1] = verts[i];
      const [x2, z2] = verts[(i + 1) % 6];
      wallRun(p, x1, z1, x2, z2, hy, 0.7, 0.3, stone);
      roundTower(k, x1, z1, 0.18, 0.95, stone2, null, hy);
    }
    p.box(hx, hy - 0.2, hz, 0.9, 1.3, 0.7, stone2);
    for (let q = 0; q < 4; q++) p.box(hx - 0.34 + q * 0.22, hy + 1.0, hz + 0.3, 0.12, 0.12, 0.08, '#e8dbb4', { ao: 0 });
    winF(p, hx, hy + 0.5, hz + 0.355, 0.12, 0.28, '#4a3f2e');
    lighthouse(k, hx - 3.0, k.ground(hx - 3.0, hz + 1.8) - 0.05, hz + 1.8, { h: 1.6, r0: 0.19, r1: 0.13, bands: [['#f6f3ea', 1]], cap: '#8a8f94', gallery: '#4a4a4a' });
    k.reserve(hx, hz, 1.9, 1.5);
    k.reserve(hx - 3.0, hz + 1.8, 0.4, 0.4);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Vigo ─────────────────────────────

const vigo: Landmark = {
  terrain(k) {
    const cx = k.vx(-16);
    k.shape.relief = 0.9;
    carve(k, cx + 0.4, 4.8, -40, 0.1);
    k.bump(cx - 7.0, -16.8, 3.6, 3.4, 2.2);
    k.bump(cx + 7.8, -16.8, 3.6, 3.4, 2.2);
    k.shore = 'rock';
  },
  build(k) {
    const cx = k.vx(-16);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const rc = cx + 0.4;
    quayRun(k, -k.width / 2 - 4, rc - 4.8);
    quayRun(k, rc + 4.8, k.width / 2 + 4);
    // Rande Bridge: a cable-stayed span over the ria with two tall pylons
    const z = -16.2;
    cableStayed(k, cx - 8.6, cx + 9.4, z, [{ x: rc - 2.6, h: 3.9 }, { x: rc + 2.6, h: 3.9 }], { deck: 1.25, half: 0.2, color: '#e9ecee', cable: '#e3e7ea', deckColor: '#9a9fa4' });
    for (const tx of [rc - 2.6, rc + 2.6]) {
      for (const sd of [-1, 1]) p.box(tx, 1.2, z + sd * 0.17, 0.11, 3.95, 0.11, '#e9ecee');
      p.box(tx, 1.25 + 2.7, z, 0.1, 0.1, 0.4, '#e9ecee');
      p.box(tx, 1.25 + 1.4, z, 0.1, 0.1, 0.4, '#e9ecee');
    }
    // the shipyard on the left bank: big yard cranes and a hull on the slip
    for (let i = 0; i < 2; i++) gantryCrane(k, cx - 7.2 + i * 2.4, SHORE_Z - 0.6, { color: i ? '#c9402e' : '#2c5da8', s: 1.5, y: LAND_Y });
    const hx = cx - 4.6;
    p.box(hx, LAND_Y - 0.05, -14.4, 2.6, 0.55, 0.8, '#7a8088');
    p.box(hx, LAND_Y + 0.5, -14.4, 2.6, 0.1, 0.84, '#c8302a');
    for (let i = 0; i < 9; i++) p.box(hx - 1.2 + i * 0.3, LAND_Y + 0.6, -14.4, 0.04, 0.5, 0.78, '#9aa0a6', { ao: 0 });
    p.box(hx - 0.9, LAND_Y + 0.6, -14.4, 0.7, 0.5, 0.6, '#d9d4c7');
    boat(k, rc + 0.5, -13.2, 'ferry', rng, 0, '#2c5da8');
    boat(k, rc - 1.8, -12.6, 'fishing', rng, 0.2, '#c8302a');
    k.reserve(cx - 5.4, -14.0, 3.6, 1.6);
  },
  rows: 3,
  quiet: true,
  mole: { endX: 2.2, dir: -1 },
};

export const LANDMARKS: Record<string, Landmark> = { gibraltar, barcelona, valencia, lisbon, seville, santacruz, algeciras, cadiz, malaga, laspalmas, funchal, leixoes, huelva, ceuta, vigo };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [['Gibraltar', 'med', 'gibraltar'], ['Barcelona', 'med', 'barcelona'], ['Valencia', 'med', 'valencia'], ['Lisbon', 'med', 'lisbon'], ['Seville', 'med', 'seville'], ['Santa Cruz', 'isle', 'santacruz'], ['Algeciras', 'med', 'algeciras'], ['Cadiz', 'med', 'cadiz'], ['Malaga', 'med', 'malaga'], ['Las Palmas', 'isle', 'laspalmas'], ['Funchal', 'isle', 'funchal'], ['Leixoes', 'med', 'leixoes'], ['Huelva', 'med', 'huelva'], ['Ceuta', 'med', 'ceuta'], ['Vigo', 'med', 'vigo']];
