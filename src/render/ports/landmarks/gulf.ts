import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { LAND_Y, MOLE_Z, SHORE_Z, clamp, lerp, noise2, smooth, type Col, type Part, type PortKit, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { Region, RegionId } from '../regions';
import { buildTown, pick, quayWall, tint, type HouseStyle } from '../town';
import { boat, gantryCrane, minaret, mosque, stack as smokeStack } from '../props';

/**
 * Suez, the Red Sea, Arabia and the Gulf of Oman (region 'gulf'); South Africa and Australia (region 'austral').
 * Gulf: white and sand cube houses, date palms, bare rock, jagged Hajar mountains.
 * Austral: colonial and modern buildings, eucalyptus and green.
 *
 * Landmarks: Port Said, Suez, Jeddah, Djibouti, Salalah, Sohar, Fujairah, Khor Fakkan, Jebel Ali, Cape Town, Durban, Sydney.
 * The phone camera only shows the lowest 3-5 units above the far shore under the HUD, so every landmark is built low and wide.
 */

// ───────────────────────────── helpers ─────────────────────────────

const rngOf = (k: PortKit, salt = 0): Rng => new Rng((k.seed ^ 0x6a1f) + salt);

/** x of the view centre at depth z, leaned away from the breakwater head (the head, its lighthouse and the flag stand on the other side). */
const mid = (k: PortKit, z: number, dx = 0): number => k.vx(z) + k.mole.dir * 0.8 + dx;

const col = (c: Col): THREE.Color => new THREE.Color(c);

/** A colour seen through the haze at depth z, like the terrain's own aerial perspective. */
function hazed(k: PortKit, c: Col, z: number): THREE.Color {
  return col(c).lerp(col(k.palette.haze), 0.62 * smooth(-12, -62, z) + 0.28 * smooth(-40, -100, z));
}

/** A 2D face mapping: (u right, v up) to world. onZ faces +z, onX faces +x (u runs toward -z). */
type Map2 = (u: number, v: number) => V3;
const onZ = (x: number, z: number): Map2 => (u, v) => [x + u, v, z];
const onX = (x: number, z: number): Map2 => (u, v) => [x, v, z - u];

/** A convex polygon on a face, wound to look along `n` (any winding in, camera-facing out). */
function poly(p: Part, pts: V3[], c: Col, n: V3): void {
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[0];
    let b = pts[i];
    let d = pts[i + 1];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const dot = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (dot < 0) [b, d] = [d, b];
    p.tri(a, b, d, c);
  }
}

function fan(p: Part, m: Map2, pts: Array<[number, number]>, c: Col, n: V3 = [0, 0, 1]): void {
  poly(p, pts.map(([u, v]) => m(u, v)), c, n);
}

function rect(p: Part, m: Map2, u0: number, v0: number, u1: number, v1: number, c: Col): void {
  const a = m(Math.min(u0, u1), Math.min(v0, v1));
  const b = m(Math.max(u0, u1), Math.min(v0, v1));
  const cc = m(Math.max(u0, u1), Math.max(v0, v1));
  const d = m(Math.min(u0, u1), Math.max(v0, v1));
  p.quad(a, b, cc, d, c);
}

function archPts(w: number, h: number, kind: 'round' | 'point' = 'round'): Array<[number, number]> {
  const r = w / 2;
  if (kind === 'point') return [[-r, 0], [r, 0], [r, h * 0.6], [r * 0.5, h * 0.88], [0, h], [-r * 0.5, h * 0.88], [-r, h * 0.6]];
  const hs = Math.max(0, h - r);
  const pts: Array<[number, number]> = [[-r, 0], [r, 0]];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * Math.PI;
    pts.push([r * Math.cos(a), hs + r * Math.sin(a)]);
  }
  return pts;
}

/** A dark arched opening on a face, centred on u, foot on v. */
function arch(p: Part, m: Map2, u: number, v: number, w: number, h: number, c: Col, kind: 'round' | 'point' = 'round', n: V3 = [0, 0, 1]): void {
  fan(p, (a, b) => m(u + a, v + b), archPts(w, h, kind), c, n);
}

/** A truncated pyramid (hipped roof with a flat top): base w × d, top tw × td. */
function frustum(p: Part, x: number, y: number, z: number, w: number, d: number, tw: number, td: number, h: number, c: Col): void {
  const v: V3[] = [
    [x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2],
    [x - tw / 2, y + h, z - td / 2], [x + tw / 2, y + h, z - td / 2], [x + tw / 2, y + h, z + td / 2], [x - tw / 2, y + h, z + td / 2],
  ];
  p.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], c);
}

/** A dome (half-ellipse profile) on a lathe, foot on y. */
function dome(p: Part, x: number, y: number, z: number, r: number, h: number, c: Col, seg = 12, lift = 0): void {
  const pts: Array<[number, number]> = [];
  if (lift > 0) pts.push([r, 0], [r, lift]);
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push([Math.max(0.001, r * Math.cos(a)), lift + (h - lift) * Math.sin(a)]);
  }
  p.lathe(x, y, z, pts, c, { seg });
}

// ───────────────────────────── ground ─────────────────────────────

/** Sand, ochre, haze: the arid coast. */
function arid(k: PortKit, o: Partial<typeof k.palette> = {}, shape: Partial<typeof k.shape> = {}): void {
  k.palette = { ...k.palette, land: '#dfca97', land2: '#d5be89', hill: '#c4a574', rock: '#9b7f5e', sand: '#f0e2b6', haze: '#eadfca', ...o };
  k.shape = { ...k.shape, relief: 0.5, range: 1.2, rise: 6, rough: 0.5, freq: 0.1, ...shape };
}

/** A low ridge that rises across the whole scene, jagged: height `h` above the plain at depth z0..z1 (the foot starts at zFoot). */
function ridge(k: PortKit, o: { zFoot: number; z0: number; z1: number; h: number; seed?: number; jag?: number; freq?: number; gap?: [number, number, number] }): void {
  const seed = (o.seed ?? 0) + (k.seed % 211);
  const jag = o.jag ?? 0.6;
  const f = o.freq ?? 0.55;
  k.feature((x, z, h) => {
    if (z > o.zFoot) return h;
    const along = smooth(o.zFoot, o.z0, z) * (1 - smooth(o.z1, o.z1 - 9, z));
    if (along <= 0) return h;
    // a ridged noise: sharp crests where the noise crosses its middle, plus a slow swell
    const n1 = 1 - Math.abs(noise2(x * f, z * 0.2, seed) * 2 - 1);
    const n2 = 1 - Math.abs(noise2(x * f * 2.3 + 11, z * 0.35, seed + 3) * 2 - 1);
    const swell = 0.55 + 0.45 * noise2(x * 0.09, 7, seed + 9);
    let hh = o.h * swell * (1 - jag * 0.6 + jag * (0.7 * n1 + 0.3 * n2) * 1.15);
    if (o.gap) {
      const [gx, gw, gd] = o.gap;
      hh *= 1 - gd * (1 - smooth(0, gw, Math.abs(x - gx)));
    }
    return h + hh * along;
  });
}

/** Strata and scree: dark rock on slopes, bands of colour with height. */
function rockPaint(k: PortKit, tones: Col[], from = 0.12, band = 5): void {
  const cs = tones.map((t) => col(t));
  const c2 = new THREE.Color();
  k.paint((x, y, z, slope, c) => {
    if (z > SHORE_Z - 1.4) return;
    const w = smooth(from, from + 0.26, slope);
    if (w <= 0) return;
    const n = noise2(x * 0.4, z * 0.4, 5);
    const i = clamp(Math.floor((0.5 * Math.sin(y * band + n * 3) + 0.5 + n * 0.5) * cs.length), 0, cs.length - 1);
    c2.copy(cs[i]);
    c.lerp(c2, 0.82 * w);
  });
}

// ───────────────────────────── massifs ─────────────────────────────

interface MassifO {
  x: number;
  z: number;
  rx: number;
  rz: number;
  h: number;
  kind: 'cone' | 'mesa' | 'dome' | 'crag';
  /** one colour per band, bottom to top */
  cols: Col[];
  n?: number;
  jag?: number;
  /** footprint squareness (2 = ellipse, 4 = rounded square) */
  sq?: number;
  rot?: number;
  seed?: number;
  /** the summit leans toward (dx, dz) in units of the radius */
  lean?: [number, number];
  /** ground level to measure the height from (default: the ground at the centre) */
  y?: number;
  reserve?: boolean;
  /** radius of the flat top as a share of the foot (a crater rim, a truncated cone) */
  topR?: number;
  /** colour of the flat top (crater floor, plateau) */
  topCol?: Col;
}

/**
 * A faceted mountain standing on the terrain: rings of vertices up from a ground-hugging foot, one colour per band,
 * dark gullies picked out by noise. Cheap (a few hundred triangles) and crisp where the terrain mesh is too coarse.
 */
function massif(k: PortKit, o: MassifO): void {
  const n = o.n ?? 14;
  const M = o.cols.length;
  const jag = o.jag ?? 0.4;
  const sq = o.sq ?? 2;
  const seed = (o.seed ?? 0) + (k.seed % 97);
  const y0 = o.y ?? k.ground(o.x, o.z);
  const rs: number[] = [];
  const ys: number[] = [];
  for (let j = 0; j <= M; j++) {
    const t = j / M;
    switch (o.kind) {
      case 'mesa':
        rs.push(t < 0.34 ? lerp(1, 0.8, t / 0.34) : lerp(0.8, 0.72, (t - 0.34) / 0.66));
        ys.push(t);
        break;
      case 'dome':
        rs.push(Math.pow(Math.cos((t * Math.PI) / 2), 0.85));
        ys.push(Math.pow(Math.sin((t * Math.PI) / 2), 0.9));
        break;
      case 'crag':
        rs.push((o.topR ?? 0) + (1 - (o.topR ?? 0)) * Math.pow(1 - t, 1.2));
        ys.push(t);
        break;
      default:
        rs.push((o.topR ?? 0) + (1 - (o.topR ?? 0)) * Math.pow(1 - t, 1.05));
        ys.push(Math.pow(t, 0.92));
    }
  }
  const apex = rs[M] < 0.03;
  const rings: V3[][] = [];
  const ca = Math.cos(o.rot ?? 0);
  const sa = Math.sin(o.rot ?? 0);
  const lean = o.lean ?? [0, 0];
  // the radius of the footprint at angle a (a superellipse)
  const foot = (a: number): number => {
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    return Math.pow(Math.pow(c, sq) + Math.pow(s, sq), -1 / sq);
  };
  const radial: number[] = [];
  const hgt: number[] = [];
  for (let i = 0; i < n; i++) {
    radial.push(1 + jag * 0.55 * (noise2(i * 1.7 + 3, seed, seed) * 2 - 1));
    hgt.push(1 + jag * 0.45 * (noise2(i * 2.3 + 9, seed + 1, seed) * 2 - 1));
  }
  for (let j = 0; j <= M; j++) {
    const ring: V3[] = [];
    const count = j === M && apex ? 1 : n;
    for (let i = 0; i < count; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = foot(a);
      const t = j / M;
      const jr = lerp(1, radial[i], smooth(0, 0.5, t) * 0.9 + 0.1);
      const lx = Math.cos(a) * o.rx * r * rs[j] * jr + lean[0] * o.rx * t * t;
      const lz = Math.sin(a) * o.rz * r * rs[j] * jr + lean[1] * o.rz * t * t;
      const x = o.x + lx * ca - lz * sa;
      const z = o.z + lx * sa + lz * ca;
      const g = k.ground(x, z);
      let y: number;
      if (j === 0) y = g - 0.3;
      else {
        const top = y0 + o.h * ys[j] * (j === M && !apex ? 1 + (hgt[i] - 1) * 0.18 : lerp(1, hgt[i], smooth(0.1, 1, t)));
        y = Math.max(top, g + 0.05);
      }
      ring.push([x, y, z]);
    }
    rings.push(ring);
  }
  const p = k.solid;
  for (let j = 0; j < M; j++) {
    const lo = rings[j];
    const hi = rings[j + 1];
    const base = hazed(k, o.cols[j], o.z - o.rz * 0.5);
    const shades = [base, tint(base, -0.2), tint(base, 0.1)];
    const verts = [...lo, ...hi];
    const faces: number[][][] = [[], [], []];
    const shadeOf = (i: number): number => (noise2(i * 3.1 + 1, j * 1.3, seed) > 0.68 ? 1 : noise2(i * 1.9, j * 2.7 + 5, seed) > 0.72 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      if (j === M - 1 && apex) faces[shadeOf(i)].push([i, i2, n]);
      else faces[shadeOf(i)].push([i, i2, n + i2, n + i]);
    }
    for (let s = 0; s < 3; s++) if (faces[s].length) p.solid(verts, faces[s], shades[s], { ao: 0 });
    // the flat top: a fan from the middle (the rim is not convex)
    if (j === M - 1 && !apex) {
      const topC = o.topCol ? hazed(k, o.topCol, o.z) : tint(hazed(k, o.cols[M - 1], o.z), 0.12);
      const c: V3 = [0, 0, 0];
      for (const v of hi) {
        c[0] += v[0] / n;
        c[1] += v[1] / n;
        c[2] += v[2] / n;
      }
      // a stray vertex far below pulls the centroid down, so solid() turns every cap triangle upward
      const cap = [...hi, c, [c[0], c[1] - 4, c[2]] as V3];
      const tris: number[][] = [];
      for (let i = 0; i < n; i++) tris.push([i, (i + 1) % n, n]);
      p.solid(cap, tris, topC, { ao: 0 });
    }
  }
  if (o.reserve !== false) k.reserve(o.x, o.z, o.rx * 0.8, o.rz * 0.8);
}

// ───────────────────────────── trees ─────────────────────────────

/** A date palm: leaning trunk, a crown of drooping fronds. */
function datePalm(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const lean = rng.range(-0.05, 0.05) * s;
  const hgt = rng.range(0.46, 0.6) * s;
  const px = x + lean;
  const py = y + hgt;
  p.rod([x, y, z], [px, py, z], 0.017 * s, '#8d7355', 5);
  p.blob(px, py, z, 0.03 * s, '#6b5a3a');
  const fr = ['#4f7f3a', '#5d8f45', '#43713a'];
  const n = 8;
  const a0 = rng.next() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n;
    const L = 0.2 * s;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const base: V3 = [px, py + 0.01 * s, z];
    const mid: V3 = [px + dx * L * 0.55, py + 0.05 * s, z + dz * L * 0.55];
    const tip: V3 = [px + dx * L, py - 0.06 * s, z + dz * L];
    const nxp = -dz * 0.04 * s;
    const nzp = dx * 0.04 * s;
    p.tri(base, [mid[0] + nxp, mid[1], mid[2] + nzp], [mid[0] - nxp, mid[1], mid[2] - nzp], fr[i % 3], true);
    p.tri([mid[0] + nxp, mid[1], mid[2] + nzp], tip, [mid[0] - nxp, mid[1], mid[2] - nzp], fr[(i + 1) % 3], true);
  }
}

/** A row or loose line of date palms on dry land. */
function palms(k: PortKit, rng: Rng, x0: number, x1: number, z: number, n: number, s0 = 1.2, s1 = 1.7, jitter = 0.3): void {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1)) + rng.range(-jitter, jitter);
    const zz = z + rng.range(-0.3, 0.3);
    const y = k.ground(x, zz);
    if (y < 0.2 || k.isReserved(x, zz, 0.1)) continue;
    datePalm(k, x, zz, rng.range(s0, s1), rng, y - 0.02);
  }
}

/** Low scrub: grey-green blobs on sand. */
function scrub(k: PortKit, rng: Rng, x0: number, x1: number, z0: number, z1: number, n: number, c: Col = '#8e9a62'): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    const y = k.ground(x, z);
    if (y < 0.25 || k.isReserved(x, z, 0.05)) continue;
    k.solid.blob(x, y + 0.02, z, rng.range(0.05, 0.1), tint(c, rng.range(-0.1, 0.1)), { sy: 0.6 });
  }
}

// ───────────────────────────── ships ─────────────────────────────

/** A hull plan (x along the ship, bow at +x), as a polygon in (x, z). */
function hullPlan(L: number, B: number, bow: number, stern = 0.2, dir = 1): Array<[number, number]> {
  const pts: Array<[number, number]> = [
    [-L / 2, -B * 0.42], [-L / 2 + stern, -B / 2], [L / 2 - bow, -B / 2], [L / 2, -B * 0.06],
    [L / 2, B * 0.06], [L / 2 - bow, B / 2], [-L / 2 + stern, B / 2], [-L / 2, B * 0.42],
  ];
  return pts.map(([a, b]) => [a * dir, b] as [number, number]);
}

/** A flat slab from a plan polygon, between two heights, centred on the origin of the current frame. */
function slab(p: Part, pts: Array<[number, number]>, y0: number, y1: number, c: Col, ao = 0.1): void {
  p.extrude(pts, y1 - y0, 0, (y0 + y1) / 2, 0, c, { rx: Math.PI / 2, ao });
}

/** A ribbon of dark windows across a face of a deckhouse (front, +z): one quad. */
function winRow(p: Part, x0: number, x1: number, y: number, h: number, z: number, _n = 1, c: Col = '#2a3a4c'): void {
  p.quad([x0, y, z], [x1, y, z], [x1, y + h, z], [x0, y + h, z], c);
}

interface ShipO {
  dir?: 1 | -1;
  ry?: number;
  hull?: Col;
  boot?: Col;
  deck?: Col;
  house?: Col;
  funnel?: Col;
  band?: Col;
  /** freeboard: laden ships sit low */
  free?: number;
}

/** An oil tanker afloat: hull with a red boot, a long flat deck with pipes and manifolds, the house and funnel aft. */
function tanker(k: PortKit, x: number, z: number, L: number, o: ShipO = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const B = Math.max(0.5, L * 0.19);
  const s = L / 4.4;
  const free = o.free ?? 0.34;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slab(p, hullPlan(L, B, L * 0.17, L * 0.05, dir), -0.3, free, o.hull ?? '#2b3340');
    slab(p, hullPlan(L * 1.004, B * 1.01, L * 0.17, L * 0.05, dir), -0.05, 0.08, o.boot ?? '#b3322a', 0);
    slab(p, hullPlan(L * 0.985, B * 0.96, L * 0.17, L * 0.05, dir), free, free + 0.03, o.deck ?? '#7d8388', 0);
    const hx = dir * (-L / 2 + 0.52 * s);
    const hw = B * 0.8;
    const hc = o.house ?? '#f4f1e8';
    p.box(hx, free, 0, 0.62 * s, 0.34 * s, hw, hc);
    p.box(hx + dir * 0.02, free + 0.34 * s, 0, 0.5 * s, 0.17 * s, hw * 0.96, hc);
    p.box(hx + dir * 0.04, free + 0.51 * s, 0, 0.4 * s, 0.13 * s, hw * 0.9, hc);
    p.box(hx + dir * 0.04, free + 0.64 * s, 0, 0.5 * s, 0.025, hw * 1.05, '#dfe3e6', { ao: 0 });
    winRow(p, hx - 0.26 * s, hx + 0.26 * s, free + 0.12 * s, 0.07 * s, hw / 2 + 0.004, 5);
    winRow(p, hx - 0.18 * s, hx + 0.22 * s, free + 0.4 * s, 0.06 * s, hw * 0.48 + 0.004, 4);
    winRow(p, hx - 0.14 * s, hx + 0.22 * s, free + 0.56 * s, 0.06 * s, hw * 0.45 + 0.004, 4);
    p.cyl(hx - dir * 0.2 * s, free + 0.51 * s, 0, 0.1 * s, 0.085 * s, 0.3 * s, o.funnel ?? '#b3322a', { seg: 8 });
    p.cyl(hx - dir * 0.2 * s, free + 0.78 * s, 0, 0.088 * s, 0.088 * s, 0.05 * s, o.band ?? '#23272e', { seg: 8, ao: 0 });
    // deck: two pipe runs, the manifold across amidships, a pair of derricks and the forecastle
    const dx0 = dir * L * 0.06;
    p.box(dx0, free + 0.03, B * 0.15, L * 0.58, 0.035, 0.035, '#c9c5ba', { ao: 0 });
    p.box(dx0, free + 0.03, -B * 0.15, L * 0.58, 0.035, 0.035, '#c9c5ba', { ao: 0 });
    p.box(dx0, free + 0.03, 0, 0.1, 0.07, B * 0.62, '#c8302a');
    p.box(dx0 + dir * 0.45 * s, free + 0.03, 0, 0.1, 0.06, B * 0.5, '#7d8388');
    p.box(dx0 - dir * 0.7 * s, free + 0.03, 0, 0.1, 0.06, B * 0.5, '#7d8388');
    p.rod([dx0, free + 0.05, B * 0.38], [dx0, free + 0.4 * s, B * 0.38], 0.012, '#d9dde0', 4);
    p.rod([dx0, free + 0.4 * s, B * 0.38], [dx0 + dir * 0.4 * s, free + 0.28 * s, B * 0.3], 0.01, '#d9dde0', 3);
    p.box(dir * (L / 2 - 0.4 * s), free + 0.03, 0, 0.26 * s, 0.1 * s, B * 0.55, '#7d8388');
    p.rod([dir * (L / 2 - 0.4 * s), free + 0.1, 0], [dir * (L / 2 - 0.4 * s), free + 0.5 * s, 0], 0.012, '#d9dde0', 4);
  });
}

/** A container ship afloat: a dark hull, bays of coloured boxes in tiers, the deckhouse a third from the stern. */
function containerShip(k: PortKit, x: number, z: number, L: number, rng: Rng, o: ShipO & { tiers?: number } = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const B = Math.max(0.6, L * 0.17);
  const s = L / 5.5;
  const free = o.free ?? 0.4;
  const tiers = o.tiers ?? 3;
  const palette: Col[] = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#e86a2c', '#4a5568', '#2fa3b5', '#7a4a8c'];
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slab(p, hullPlan(L, B, L * 0.14, L * 0.06, dir), -0.3, free, o.hull ?? '#26364f');
    slab(p, hullPlan(L * 1.004, B * 1.01, L * 0.14, L * 0.06, dir), -0.05, 0.08, o.boot ?? '#b8432f', 0);
    slab(p, hullPlan(L * 0.985, B * 0.96, L * 0.14, L * 0.06, dir), free, free + 0.03, '#4d6b4a', 0);
    const hx = dir * (-L / 2 + L * 0.3);
    const hw = B * 0.82;
    p.box(hx, free, 0, 0.5 * s, 0.9 * s, hw, o.house ?? '#f4f2ea');
    p.box(hx + dir * 0.03, free + 0.9 * s, 0, 0.58 * s, 0.1 * s, hw * 1.06, '#f4f2ea');
    for (let r = 0; r < 4; r++) winRow(p, hx - 0.2 * s, hx + 0.2 * s, free + 0.12 * s + r * 0.2 * s, 0.07 * s, hw / 2 + 0.004, 3);
    p.cyl(hx - dir * 0.05 * s, free + 1.0 * s, 0, 0.12 * s, 0.1 * s, 0.3 * s, o.funnel ?? '#b8432f', { seg: 8 });
    // bays: forward of the house a long run of boxes, a short run aft of it
    const bay = 0.42 * s;
    const x0 = L / 2 - 0.55 * s;
    const nb = Math.floor((x0 - (-L / 2 + L * 0.3 + 0.4 * s)) / bay);
    for (let i = 0; i < nb; i++) {
      const bx = dir * (x0 - (i + 0.5) * bay);
      const t = tiers + (i % 4 === 1 ? 1 : 0) - (i > nb - 2 ? 1 : 0);
      for (let tt = 0; tt < Math.max(1, t); tt++) p.box(bx, free + 0.03 + tt * 0.1 * s, 0, bay * 0.94, 0.095 * s, B * 0.84, palette[Math.floor(rng.next() * palette.length)], { ao: 0.15 });
    }
    for (let i = 0; i < 2; i++) p.box(dir * (-L / 2 + 0.08 * s + i * bay), free + 0.03, 0, bay * 0.94, 0.095 * s, B * 0.7, palette[Math.floor(rng.next() * palette.length)], { ao: 0.15 });
  });
}

/** A bunker barge or small product tanker: a low hull, a little house aft, a deck of pipes and a couple of tanks. */
function barge(k: PortKit, x: number, z: number, L: number, o: ShipO = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const B = Math.max(0.36, L * 0.26);
  const free = o.free ?? 0.2;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slab(p, hullPlan(L, B, L * 0.16, L * 0.08, dir), -0.2, free, o.hull ?? '#2f5d8f');
    slab(p, hullPlan(L * 1.005, B * 1.015, L * 0.16, L * 0.08, dir), -0.04, 0.05, o.boot ?? '#b3322a', 0);
    slab(p, hullPlan(L * 0.98, B * 0.94, L * 0.16, L * 0.08, dir), free, free + 0.025, o.deck ?? '#8a8f94', 0);
    const hx = dir * (-L / 2 + L * 0.2);
    p.box(hx, free, 0, L * 0.22, L * 0.16, B * 0.78, o.house ?? '#f4f1e8');
    p.box(hx + dir * 0.01, free + L * 0.16, 0, L * 0.18, L * 0.08, B * 0.7, o.house ?? '#f4f1e8');
    winRow(p, hx - L * 0.08, hx + L * 0.08, free + L * 0.045, L * 0.045, B * 0.39 + 0.004, 3);
    p.cyl(hx - dir * L * 0.05, free + L * 0.16, 0, L * 0.035, L * 0.03, L * 0.1, o.funnel ?? '#e8731a', { seg: 6 });
    p.box(dir * L * 0.1, free + 0.025, 0, L * 0.45, 0.035, 0.035, '#c9c5ba', { ao: 0 });
    p.box(dir * L * 0.05, free + 0.025, 0, 0.07, 0.05, B * 0.6, '#c8302a');
    p.cyl(dir * L * 0.3, free + 0.025, 0, L * 0.05, L * 0.05, L * 0.07, '#8a8f94', { seg: 6 });
    p.rod([dir * L * 0.42, free + 0.02, 0], [dir * L * 0.42, free + 0.2, 0], 0.01, '#d9dde0', 3);
  });
}

/** A traditional wooden dhow at the waterline: a high prow and stern, a whitewashed rail, a small deckhouse. */
function dhow(k: PortKit, x: number, z: number, L: number, o: { dir?: 1 | -1; ry?: number; hull?: Col; trim?: Col } = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const hull = o.hull ?? '#6a4a34';
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    p.box(0, -0.07, 0, L, 0.13, L * 0.2, hull, { ao: 0.1 });
    p.box(dir * L * 0.5, 0.0, 0, L * 0.16, L * 0.14, L * 0.12, hull, { rz: -0.55 * dir, ao: 0.05 });
    p.box(-dir * L * 0.47, -0.02, 0, L * 0.18, L * 0.18, L * 0.19, hull, { rz: 0.35 * dir, ao: 0.05 });
    p.box(0, 0.05, 0, L * 1.02, 0.025, L * 0.21, o.trim ?? '#e8dcc0', { ao: 0 });
    p.box(-dir * L * 0.28, 0.07, 0, L * 0.2, L * 0.13, L * 0.15, '#f1ead8');
    p.box(-dir * L * 0.28, 0.07 + L * 0.13, 0, L * 0.22, 0.015, L * 0.17, '#8a6a4a', { ao: 0 });
    p.cyl(dir * L * 0.05, 0.06, 0, 0.008, 0.008, L * 0.4, '#5b4636', { seg: 4 });
  });
}

/** A bulk carrier afloat: a long deck of hatch covers, yellow deck cranes, the house aft. */
function bulker(k: PortKit, x: number, z: number, L: number, o: ShipO = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const B = Math.max(0.6, L * 0.17);
  const s = L / 4;
  const free = o.free ?? 0.32;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slab(p, hullPlan(L, B, L * 0.15, L * 0.05, dir), -0.3, free, o.hull ?? '#7b2a28');
    slab(p, hullPlan(L * 1.004, B * 1.01, L * 0.15, L * 0.05, dir), -0.05, 0.08, o.boot ?? '#2b3340', 0);
    slab(p, hullPlan(L * 0.985, B * 0.96, L * 0.15, L * 0.05, dir), free, free + 0.03, o.deck ?? '#5d6a5a', 0);
    const hx = dir * (-L / 2 + 0.5 * s);
    const hw = B * 0.78;
    p.box(hx, free, 0, 0.56 * s, 0.4 * s, hw, o.house ?? '#f4f1e8');
    p.box(hx, free + 0.4 * s, 0, 0.46 * s, 0.17 * s, hw * 0.95, o.house ?? '#f4f1e8');
    winRow(p, hx - 0.23 * s, hx + 0.23 * s, free + 0.14 * s, 0.07 * s, hw / 2 + 0.004);
    winRow(p, hx - 0.18 * s, hx + 0.18 * s, free + 0.44 * s, 0.07 * s, hw * 0.475 + 0.004);
    p.cyl(hx - dir * 0.15 * s, free + 0.57 * s, 0, 0.08 * s, 0.07 * s, 0.22 * s, o.funnel ?? '#2c5da8', { seg: 7 });
    const n = 5;
    const x0 = hx + dir * 0.55 * s;
    const x1 = dir * (L / 2 - 0.45 * s);
    for (let i = 0; i < n; i++) {
      const hxx = lerp(x0, x1, (i + 0.5) / n);
      p.box(hxx, free + 0.03, 0, (Math.abs(x1 - x0) / n) * 0.78, 0.075 * s, B * 0.6, '#9aa39a', { ao: 0.12 });
      if (i % 2 === 0) {
        const cxx = hxx + (Math.abs(x1 - x0) / n) * 0.5 * dir;
        p.box(cxx, free + 0.03, 0, 0.07, 0.3 * s, 0.07, '#e9b82a');
        p.rod([cxx, free + 0.3 * s, 0], [cxx + dir * 0.38 * s, free + 0.42 * s, B * 0.18], 0.012, '#e9b82a', 3);
      }
    }
  });
}

/** A car carrier: a tall white slab-sided box, a ramp aft, a small house forward-aft. */
function carrier(k: PortKit, x: number, z: number, L: number, o: ShipO = {}): void {
  const p = k.solid;
  const dir = o.dir ?? 1;
  const B = Math.max(0.6, L * 0.2);
  const s = L / 4;
  const free = 0.26;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slab(p, hullPlan(L, B, L * 0.12, L * 0.04, dir), -0.3, free, o.hull ?? '#2b3340');
    slab(p, hullPlan(L * 1.004, B * 1.01, L * 0.12, L * 0.04, dir), -0.05, 0.08, o.boot ?? '#b3322a', 0);
    p.box(dir * -0.05 * L, free, 0, L * 0.82, 0.62 * s, B * 0.94, o.house ?? '#f1f0ec');
    p.box(dir * -0.05 * L, free + 0.2 * s, B * 0.47 + 0.004, L * 0.8, 0.012, 0.005, '#8a929a', { ao: 0 });
    p.box(dir * -0.05 * L, free + 0.4 * s, B * 0.47 + 0.004, L * 0.8, 0.012, 0.005, '#8a929a', { ao: 0 });
    p.box(dir * (-L / 2 + 0.4 * s), free + 0.62 * s, 0, 0.5 * s, 0.22 * s, B * 0.7, '#f4f1e8');
    winRow(p, dir * (-L / 2 + 0.4 * s) - 0.2 * s, dir * (-L / 2 + 0.4 * s) + 0.2 * s, free + 0.7 * s, 0.07 * s, B * 0.35 + 0.004);
    p.cyl(dir * (-L / 2 + 0.28 * s), free + 0.84 * s, 0, 0.07 * s, 0.06 * s, 0.2 * s, o.funnel ?? '#2c5da8', { seg: 7 });
  });
}

/** A harbour tug or pilot launch: a stubby hull, a wheelhouse, a stack. */
function tug(k: PortKit, x: number, z: number, dir: 1 | -1, hull: Col = '#c8302a'): void {
  const p = k.solid;
  k.at(x, 0, z, 0, 1, () => {
    p.box(0, -0.08, 0, 0.62, 0.2, 0.24, hull, { ao: 0.1 });
    p.box(dir * 0.33, -0.04, 0, 0.16, 0.16, 0.18, hull, { rz: -0.45 * dir, ao: 0.05 });
    p.box(0, 0.1, 0, 0.64, 0.02, 0.25, '#2b3340', { ao: 0 });
    p.box(-dir * 0.06, 0.12, 0, 0.26, 0.16, 0.18, '#f4f1e8');
    p.box(-dir * 0.06, 0.28, 0, 0.3, 0.015, 0.2, '#2b3340', { ao: 0 });
    p.cyl(-dir * 0.12, 0.28, 0, 0.04, 0.035, 0.12, '#23272e', { seg: 6 });
  });
}

/** A water channel running straight back from the sea at x = cx, `half` wide each side. */
function canal(k: PortKit, cx: number, half: number, zBack = -48, bed = -0.5): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1.2 || z < zBack) return h;
    const d = Math.abs(x - cx);
    const bank = smooth(half + 0.8, half, d);
    const end = smooth(zBack, zBack + 8, z);
    return lerp(h, Math.min(h, bed), bank * end);
  });
}

/** An obelisk: a square shaft tapering to a pyramid tip. */
function obelisk(k: PortKit, x: number, z: number, h: number, c: Col = '#e8dfc6', y = k.groundMax(x, z, 0.2, 0.2)): void {
  const p = k.solid;
  p.box(x, y - 0.1, z, 0.46, 0.1 + 0.16, 0.46, tint(c, -0.1));
  p.box(x, y + 0.16, z, 0.36, 0.1, 0.36, tint(c, -0.05));
  frustum(p, x, y + 0.26, z, 0.24, 0.24, 0.13, 0.13, h * 0.82, c);
  p.pyramid(x, y + 0.26 + h * 0.82, z, 0.13, h * 0.12, 0.13, tint(c, 0.15));
  k.reserve(x, z, 0.3, 0.3);
}

// ───────────────────────────── port equipment ─────────────────────────────

/** A row of ship-to-shore cranes along the quay edge. */
function craneRow(k: PortKit, x0: number, x1: number, n: number, o: { z?: number; s?: number; colors?: Col[]; y?: number } = {}): void {
  const cols = o.colors ?? ['#2c5da8', '#c9402e'];
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1));
    gantryCrane(k, x, o.z ?? SHORE_Z - 0.55, { color: cols[i % cols.length], s: (o.s ?? 1.0) * (i % 3 === 1 ? 0.97 : 1), y: o.y ?? LAND_Y });
  }
}

const BOX_COLS: Col[] = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5', '#9a3a30'];

/** A container yard: columns of boxes, only the faces the camera sees (cheap), heights ragged. */
function yard(k: PortKit, x0: number, z0: number, nx: number, nz: number, tiers: number, rng: Rng, y = LAND_Y): void {
  const p = k.solid;
  const w = 0.42;
  const d = 0.22;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (rng.chance(0.06)) continue;
      const t = Math.max(1, tiers - (rng.chance(0.35) ? 1 : 0) - (rng.chance(0.15) ? 1 : 0));
      const c = BOX_COLS[Math.floor(rng.next() * BOX_COLS.length)];
      p.boxV(x0 + i * (w + 0.02), y, z0 - j * (d + 0.03), w, t * 0.105, d, c, { ao: 0.2 });
    }
  }
  k.reserve(x0 + (nx * (w + 0.02)) / 2 - 0.2, z0 - (nz * (d + 0.03)) / 2 + 0.1, (nx * (w + 0.02)) / 2 + 0.1, (nz * (d + 0.03)) / 2 + 0.1);
}

/** A white storage tank with a stair and a roof (a cone, or a flat floating lid); foot on y. */
function tank(k: PortKit, x: number, z: number, r: number, h: number, o: { y?: number; c?: Col; roof?: Col; floating?: boolean; band?: Col } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, r, r) - 0.02;
  const c = o.c ?? '#f1efe8';
  p.cyl(x, y - 0.12, z, r, r, h + 0.12, c, { seg: 12, ao: 0.14, open: true });
  if (o.floating) p.cone(x, y + h * 0.9, z, r * 0.99, 0.02, o.roof ?? '#8d9498', { seg: 12 });
  else p.cone(x, y + h, z, r * 1.02, r * 0.3, o.roof ?? tint(c, -0.16), { seg: 12 });
  if (o.band) p.cyl(x, y + h * 0.7, z, r * 1.012, r * 1.012, h * 0.1, o.band, { seg: 12, ao: 0, open: true });
  p.rod([x + r * 0.62, y, z + r * 0.78], [x + r * 0.28, y + h, z + r * 0.96], 0.008, '#9aa0a4', 3);
  k.reserve(x, z, r + 0.08, r + 0.08);
}

/** Pipe racks: a long low run of pipes on posts. */
function pipeRack(k: PortKit, x0: number, x1: number, z: number, y = LAND_Y): void {
  const p = k.solid;
  const cx = (x0 + x1) / 2;
  p.box(cx, y + 0.13, z, x1 - x0, 0.03, 0.05, '#c9302a', { ao: 0 });
  p.box(cx, y + 0.17, z, x1 - x0, 0.03, 0.05, '#9aa0a4', { ao: 0 });
  for (let x = x0; x <= x1; x += 0.9) p.box(x, y - 0.05, z, 0.025, 0.2, 0.06, '#6b7178');
}

/** A coconut palm: a tall curved trunk, a heavy crown of long drooping fronds, a cluster of nuts. */
function coconut(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const lean = rng.range(-0.1, 0.1) * s;
  const hgt = rng.range(0.6, 0.78) * s;
  const mx = x + lean * 0.35;
  const px = x + lean;
  p.rod([x, y, z], [mx, y + hgt * 0.5, z], 0.019 * s, '#9a8468', 5);
  p.rod([mx, y + hgt * 0.5, z], [px, y + hgt, z], 0.014 * s, '#8d7a5e', 5);
  const py = y + hgt;
  p.blob(px, py - 0.02 * s, z, 0.03 * s, '#6e5b3c');
  const fr = ['#4c8a3a', '#5b9a46', '#3f7a35'];
  const n = 9;
  const a0 = rng.next() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n;
    const L = 0.26 * s;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const mid: V3 = [px + dx * L * 0.55, py + 0.06 * s, z + dz * L * 0.55];
    const tip: V3 = [px + dx * L, py - 0.1 * s, z + dz * L];
    const nxp = -dz * 0.04 * s;
    const nzp = dx * 0.04 * s;
    p.tri([px, py + 0.01 * s, z], [mid[0] + nxp, mid[1], mid[2] + nzp], [mid[0] - nxp, mid[1], mid[2] - nzp], fr[i % 3], true);
    p.tri([mid[0] + nxp, mid[1], mid[2] + nzp], tip, [mid[0] - nxp, mid[1], mid[2] - nzp], fr[(i + 1) % 3], true);
  }
}

/** A dromedary at rest or walking: body, hump, a long neck and head, four legs. */
function camel(k: PortKit, x: number, z: number, s: number, ry: number, c: Col = '#b8956a'): void {
  const p = k.solid;
  const y = k.ground(x, z);
  k.at(x, y - 0.01, z, ry, s, () => {
    p.box(0, 0.15, 0, 0.3, 0.11, 0.1, c, { ao: 0.1 });
    p.blob(0, 0.27, 0, 0.055, tint(c, -0.05), { sy: 0.9 });
    p.rod([0.13, 0.2, 0], [0.2, 0.38, 0], 0.025, c, 4);
    p.box(0.23, 0.36, 0, 0.1, 0.045, 0.05, tint(c, 0.05), { rz: -0.3 });
    for (const [lx, lz] of [[-0.11, -0.035], [-0.11, 0.035], [0.12, -0.035], [0.12, 0.035]] as const) p.rod([lx, 0.17, lz], [lx, 0.0, lz], 0.01, tint(c, -0.1), 3);
  });
}

// ───────────────────────────── towns ─────────────────────────────

const GULF_STYLE: HouseStyle = {
  walls: ['#f6f1e6', '#efe4cb', '#e9d9b4', '#f9f6ee', '#e2cfa3', '#d9c7a0'],
  roofs: ['#e8dcc0'],
  trim: '#e4d8bc',
  win: '#3a4a58',
  floors: [1, 3],
  floorH: 0.18,
  w: [0.34, 0.56],
  d: [0.32, 0.46],
  roofKinds: [['flat', 1]],
  pitch: 0.3,
  chimney: 0,
  gap: [0, 0.06],
  door: '#6b5a48',
  winW: 0.045,
  winH: 0.07,
};

/** Houses for one town: the pipeline's buildTown with this port's own style. */
function town(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { x0?: number; x1?: number; rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number } = {}): void {
  buildTown(k, {
    x0: o.x0 ?? -k.width / 2 - 2,
    x1: o.x1 ?? k.width / 2 + 2,
    z,
    rows,
    rowStep: o.rowStep ?? 0.58,
    hs,
    gaps: o.gaps ?? 0.06,
    rowRise: o.rowRise ?? 0,
    cx: k.vx(z) + (o.shift ?? 0),
    minY: o.minY,
    maxSlope: o.maxSlope,
  });
}

// ───────────────────────────── regions ─────────────────────────────

export const REGIONS: Partial<Record<RegionId, Region>> = {
  gulf: {
    id: 'gulf',
    houses: GULF_STYLE,
    palette: { land: '#dfca97', land2: '#d5be89', hill: '#c4a574', rock: '#9b7f5e', sand: '#f0e2b6', haze: '#eadfca' },
    shape: { relief: 1.2, range: 3.5, rise: 4, rough: 0.7, freq: 0.12 },
    shore: 'beach',
    rows: 4,
    rowStep: 0.55,
    gaps: 0.06,
    boats: { kinds: ['fishing'], n: 3, colors: ['#e8e2d2', '#2c5da8', '#c8302a'] },
    trees: [{ kinds: ['palm', 'bush', 'palm'], count: 16, where: 'plain', size: [1.1, 1.5] }],
    armour: 'rocks',
    moleTone: '#cfc5ad',
    lights: [1, 2, 4],
    extras: (k, rng) => {
      mosque(k, k.vx(-14) + rng.range(-4, 4), -14.0, 0.9, { wall: '#f6f1e6', dome: '#d6c28a' });
    },
  },
  austral: {
    id: 'austral',
    houses: {
      walls: ['#f1ead9', '#e0cfa4', '#c9a27a', '#ede6d6', '#d6c4a0', '#b8a07a', '#e6d9b8'],
      roofs: ['#a8483a', '#7d3f35', '#5a6470', '#8a4a36', '#6b7a68'],
      trim: '#f6f3ea',
      win: '#2f3d4d',
      floors: [1, 3],
      floorH: 0.19,
      w: [0.32, 0.52],
      d: [0.34, 0.48],
      roofKinds: [['hip', 4], ['gable', 3], ['front', 2], ['flat', 1]],
      pitch: 0.5,
      chimney: 0.3,
      gap: [0, 0.08],
      door: '#3a5a6a',
    },
    palette: { land: '#93ab5d', land2: '#a3b565', hill: '#7a9a55', rock: '#a48f78', sand: '#ead9a8', haze: '#d3e6ee' },
    shape: { relief: 1.6, range: 4, rise: 3.5, rough: 0.45, freq: 0.09 },
    shore: 'quay',
    rows: 4,
    rowStep: 0.58,
    gaps: 0.08,
    boats: { kinds: ['sail', 'fishing'], n: 4, colors: ['#f6f3ea', '#2c5da8', '#c8302a'] },
    trees: [{ kinds: ['olive', 'round', 'olive', 'bush'], count: 70, where: 'all', size: [0.9, 1.5], maxY: 3.5 }],
    armour: 'mixed',
    lights: [0, 1, 4],
  },
};

// ───────────────────────────── Fujairah ─────────────────────────────

/** Fujairah Fort: sand-coloured walls on a rocky knoll, round and square towers, a tall watchtower. */
function fujairahFort(k: PortKit, x: number, z: number, s = 1): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.9 * s, 0.7 * s) - 0.05;
  const sand = '#d9c196';
  const sand2 = '#cdb384';
  const crown = '#e6d3ab';
  // the curtain wall: a low court with merlons, a gate in the front
  p.box(x, y - 0.4, z, 1.9 * s, 0.4 + 0.55 * s, 1.3 * s, sand);
  for (let i = 0; i < 9; i++) {
    p.box(x - 0.85 * s + i * 0.21 * s, y + 0.55 * s, z + 0.6 * s, 0.11 * s, 0.07 * s, 0.07 * s, crown, { ao: 0 });
    if (i < 6) p.box(x + 0.9 * s, y + 0.55 * s, z + 0.52 * s - i * 0.21 * s, 0.07 * s, 0.07 * s, 0.11 * s, crown, { ao: 0 });
  }
  arch(p, onZ(x - 0.15 * s, z + 0.652 * s), 0, y, 0.26 * s, 0.38 * s, '#4a3a2a');
  // the square keep at the back, the tall round watchtower and two corner turrets
  p.box(x - 0.3 * s, y + 0.5 * s, z - 0.15 * s, 0.7 * s, 0.4 * s, 0.6 * s, sand2);
  p.box(x - 0.3 * s, y + 0.9 * s, z - 0.15 * s, 0.76 * s, 0.05 * s, 0.66 * s, crown, { ao: 0 });
  rect(p, onZ(x - 0.3 * s, z + 0.151 * s + 0.005), -0.1 * s, y + 0.6 * s, 0.1 * s, y + 0.8 * s, '#4a3a2a');
  p.cyl(x + 0.55 * s, y - 0.1, z - 0.2 * s, 0.2 * s, 0.17 * s, 1.35 * s + 0.1, sand);
  p.cyl(x + 0.55 * s, y + 1.25 * s, z - 0.2 * s, 0.22 * s, 0.22 * s, 0.05 * s, crown, { ao: 0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.box(x + 0.55 * s + Math.cos(a) * 0.2 * s, y + 1.3 * s, z - 0.2 * s + Math.sin(a) * 0.2 * s, 0.09 * s, 0.07 * s, 0.09 * s, crown, { ao: 0 });
  }
  for (const [dx, dz, r, h] of [[-0.88, 0.58, 0.14, 0.78], [0.86, 0.58, 0.13, 0.7], [-0.88, -0.6, 0.13, 0.72]] as const) {
    p.cyl(x + dx * s, y - 0.1, z + dz * s, r * 1.1 * s, r * s, h * s + 0.1, sand2);
    p.cyl(x + dx * s, y + h * s, z + dz * s, r * 1.2 * s, r * 1.2 * s, 0.04 * s, crown, { ao: 0 });
    p.cone(x + dx * s, y + h * s + 0.04 * s, z + dz * s, r * 1.25 * s, 0.1 * s, '#bda374', { seg: 8 });
  }
  rect(p, onZ(x + 0.55 * s, z - 0.2 * s + 0.2 * s + 0.004), -0.025 * s, y + 0.8 * s, 0.025 * s, y + 1.05 * s, '#3a2c20');
  k.reserve(x, z, 1.2 * s, 0.9 * s);
}

const HAJAR_DARK = ['#a58b68', '#86694b', '#6f5a47', '#5f5043'];
const HAJAR_REDDISH = ['#a8896a', '#8c6a4e', '#755a46', '#665048'];

/** The Hajar: ranks of broad, jagged crags standing on a ridged foothill, brown and grey with dark gullies. */
function hajar(k: PortKit, X: (dx: number) => number, o: { dx0: number; dx1: number; z0: number; h: number; ranks?: number; wide?: number; seed?: number }): void {
  const peaks = new Rng((k.seed ^ 0xa1) + (o.seed ?? 0));
  const ranks = o.ranks ?? 2;
  for (let rank = 0; rank < ranks; rank++) {
    for (let dx = o.dx0; dx <= o.dx1; dx += peaks.range(2.0, 3.0) * (rank ? 1.25 : 1)) {
      const z = o.z0 - rank * 3.2 - peaks.range(0, 1.2);
      const sw = 0.7 + 0.5 * noise2(dx * 0.19 + rank * 5, 3, k.seed % 50);
      const hh = o.h * (rank ? 1.35 : 1) * peaks.range(0.75, 1.2) * sw;
      massif(k, {
        x: X(dx) + peaks.range(-0.4, 0.4),
        z,
        rx: peaks.range(2.4, 3.4) * (o.wide ?? 1) * (rank ? 1.25 : 1),
        rz: peaks.range(1.7, 2.3),
        h: hh,
        kind: rank && peaks.chance(0.4) ? 'mesa' : 'cone',
        n: 9,
        jag: 0.85,
        seed: Math.floor(peaks.next() * 90),
        cols: peaks.chance(0.5) ? HAJAR_DARK : HAJAR_REDDISH,
        lean: [peaks.range(-0.2, 0.2), 0],
        reserve: false,
      });
    }
  }
}

const fujairah: Landmark = {
  terrain(k) {
    arid(k, { rock: '#7d6550', hill: '#bf9f6f' });
    k.shore = 'beach';
    const cx = mid(k, -14);
    // the coastal plain, then the Hajar rising sharply behind it
    k.plateau(cx, -14.6, 11, 3.2, LAND_Y + 0.06, 0.3);
    ridge(k, { zFoot: -16.8, z0: -21, z1: -52, h: 5.0, seed: 4, jag: 0.85, freq: 0.3 });
    // the fort's knoll
    const m = k.mole.dir;
    k.bump(cx + m * 3.2, -13.9, 1.7, 1.2, 1.0, 1.1);
    rockPaint(k, HAJAR_DARK, 0.1, 4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    hajar(k, X, { dx0: -14, dx1: 14, z0: -18.6, h: 3.1 });
    // the anchorage: tankers by the dozen, all heading the same way, bunker barges between them
    const dark = ['#26303d', '#33404e', '#4a2c2c', '#23272e', '#2f4a3c', '#3a3f46', '#5a6068', '#1f3a5c'];
    const houses = ['#f4f1e8', '#e8e4d8', '#f1e6d0'];
    const funnel = ['#b3322a', '#2c5da8', '#e9a31a', '#23272e', '#2f8f5b', '#f4f1e8'];
    const rowsZ = [-8.95, -10.1, -11.25];
    let id = 0;
    for (let r = 0; r < rowsZ.length; r++) {
      let dx = -12.5 + rng.range(0, 1.5) + r * 1.3;
      while (dx < 13) {
        const L = r === 0 ? rng.range(2.6, 3.4) : rng.range(3.3, 4.6);
        const dir: 1 | -1 = id % 7 === 3 ? -1 : 1;
        tanker(k, X(dx + L / 2), rowsZ[r] + rng.range(-0.08, 0.08), L, {
          dir,
          ry: rng.range(-0.05, 0.05),
          hull: dark[id % dark.length],
          house: houses[id % houses.length],
          funnel: funnel[(id * 3) % funnel.length],
          free: rng.chance(0.5) ? 0.22 : 0.4,
        });
        id++;
        dx += L + rng.range(0.2, 0.9);
      }
    }
    const barges = [
      { dx: -7.0, z: -10.55, L: 1.3, hull: '#2f5d8f', house: '#f4f1e8', funnel: '#e8731a' },
      { dx: -2.0, z: -10.6, L: 1.5, hull: '#c8651f', house: '#f4f1e8', funnel: '#23272e' },
      { dx: 1.9, z: -10.55, L: 1.2, hull: '#b3322a', house: '#e8e4d8', funnel: '#f4f1e8' },
      { dx: 5.9, z: -10.6, L: 1.6, hull: '#2f8f5b', house: '#f4f1e8', funnel: '#c8302a' },
      { dx: 10.2, z: -10.55, L: 1.4, hull: '#e9a31a', house: '#f4f1e8', funnel: '#2c5da8' },
    ];
    for (const b of barges) barge(k, X(b.dx), b.z, b.L, { hull: b.hull, house: b.house, funnel: b.funnel, dir: b.dx > 0 ? 1 : -1 });
    // tank farms on the plain: big white tanks in rows, bands, domes and floating roofs, pipe racks between
    const tanksRows: Array<{ z: number; r: number; h: number; x0: number; x1: number }> = [
      { z: -13.5, r: 0.46, h: 0.52, x0: -12, x1: 12 },
      { z: -15.0, r: 0.6, h: 0.68, x0: -11, x1: 12 },
      { z: -16.55, r: 0.7, h: 0.82, x0: -12, x1: 12 },
    ];
    const fortDx = 3.2;
    const bands: Array<Col | null> = [null, null, null, '#2c5da8', '#c8302a', '#2f8f5b'];
    for (const row of tanksRows) {
      let dx = row.x0 + rng.range(0, 0.6);
      while (dx < row.x1) {
        const r = row.r * rng.range(0.9, 1.1);
        const tx = X(dx);
        const nearFort = Math.abs(dx - fortDx) < 2.4 && row.z > -14.4;
        if (!nearFort && !k.isReserved(tx, row.z, 0.1)) {
          const h = row.h * rng.range(0.9, 1.2);
          tank(k, tx, row.z, r, h, { floating: rng.chance(0.4), roof: rng.chance(0.3) ? '#a8392e' : undefined, band: bands[Math.floor(rng.next() * bands.length)] ?? undefined });
        }
        dx += r * 2 + rng.range(0.2, 0.5);
      }
    }
    pipeRack(k, X(-10.5), X(-3.8), -14.25);
    pipeRack(k, X(6.5), X(11.5), -14.25);
    // a refinery flare stack with its flame, behind the tanks
    const fx = X(-6.5);
    const fy = k.ground(fx, -17.2);
    p.cyl(fx, fy - 0.02, -17.2, 0.05, 0.025, 2.1, '#a9a9a2', { seg: 6 });
    k.glow.ball(fx, fy + 2.2, -17.2, 0.07, '#ffb347');
    k.glow.cone(fx, fy + 2.13, -17.2, 0.05, 0.18, '#ffd37a', { seg: 5 });
    // Fujairah Fort on its knoll, in front of the tanks
    fujairahFort(k, X(fortDx), -13.9, 1.25);
    // a bunker pier with barges alongside
    const pierX = X(-4.2);
    p.box(pierX, -0.9, -11.0, 0.3, 0.9 + 0.38, 2.1, '#a8a49a');
    p.box(pierX, 0.36, -10.1, 0.5, 0.05, 0.4, '#c9c5ba', { ao: 0 });
    // a few white houses and palms along the beach
    town(k, GULF_STYLE, 2, SHORE_Z - 1.0, { gaps: 0.35, shift: -m * 3 });
    palms(k, rng, X(-10), X(11), -12.9, 10, 1.1, 1.5, 0.5);
    scrub(k, rng, X(-13), X(13), -13, -18, 10);
    // dhows in the shallows
    dhow(k, X(8.2), -11.6, 0.9, { dir: 1, ry: 0.1 });
    dhow(k, X(-9.6), -11.55, 0.8, { dir: -1, ry: -0.08 });
  },
  rows: 0,
  quiet: true,
  flag: { dx: -3.3, z: -12.4 },
};

// ───────────────────────────── Port Said ─────────────────────────────

const PORTSAID_STYLE: HouseStyle = {
  ...GULF_STYLE,
  walls: ['#ece0bf', '#e6d2a0', '#dcc08e', '#e8cfc0', '#d4dcc8', '#f3eddc'],
  floors: [2, 4],
  floorH: 0.19,
  w: [0.36, 0.6],
  d: [0.34, 0.46],
  gap: [0, 0.03],
  winW: 0.05,
  winH: 0.08,
};

/** The Suez Canal Authority building: a long cream arcaded block, a pavilion at each end and in the middle, three green domes. */
function canalHQ(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const W = 5.4;
  const D = 1.7;
  const H = 0.95;
  const y = k.groundMax(x, z, W / 2, D / 2);
  const wall = '#ecdfb9';
  const trim = '#d8c690';
  const green = '#2f8f5d';
  p.box(x, y - 0.3, z, W + 0.24, 0.3 + 0.08, D + 0.2, trim);
  p.box(x, y, z, W, H, D, wall);
  p.box(x, y + H, z, W + 0.1, 0.07, D + 0.1, trim);
  // a ground-floor arcade and a row of upper windows
  const n = 13;
  for (let i = 0; i < n; i++) {
    const u = -W / 2 + (i + 0.5) * (W / n);
    arch(p, onZ(x, z + D / 2 + 0.004), u, y + 0.04, 0.24, 0.46, '#4a4637');
    rect(p, onZ(x, z + D / 2 + 0.004), u - 0.045, y + 0.6, u + 0.045, y + 0.84, '#3d4a55');
  }
  p.box(x, y + 0.52, z + D / 2 + 0.01, W, 0.04, 0.03, trim, { ao: 0 });
  for (let i = 0; i < 6; i++) rect(p, onX(x + W / 2 + 0.004, z + D / 2), 0.14 + i * 0.27, y + 0.6, 0.14 + i * 0.27 + 0.1, y + 0.84, '#3d4a55');
  // pavilions: the central one stands proud, with the tall dome; the end ones carry smaller domes
  const pav = (px: number, pw: number, ph: number, rd: number, hd: number, drum: number): void => {
    p.box(px, y, z + 0.1, pw, H + ph, D + 0.2, wall);
    p.box(px, y + H + ph, z + 0.1, pw + 0.12, 0.07, D + 0.32, trim);
    arch(p, onZ(px, z + 0.1 + (D + 0.2) / 2 + 0.004), 0, y + 0.04, 0.32, 0.6, '#4a4637');
    arch(p, onZ(px, z + 0.1 + (D + 0.2) / 2 + 0.006), 0, y + H * 0.5 + 0.12, 0.24, 0.5, '#3d4a55');
    p.cyl(px, y + H + ph + 0.07, z + 0.1, rd * 0.95, rd * 0.9, drum, trim, { seg: 10 });
    dome(p, px, y + H + ph + 0.07 + drum, z + 0.1, rd, hd, green, 14);
    p.cyl(px, y + H + ph + 0.07 + drum + hd, z + 0.1, 0.012, 0.008, 0.2, '#e8b923', { seg: 4 });
  };
  pav(x, 1.6, 0.34, 0.62, 0.82, 0.36);
  pav(x - W / 2 + 0.62, 1.1, 0.12, 0.4, 0.5, 0.2);
  pav(x + W / 2 - 0.62, 1.1, 0.12, 0.4, 0.5, 0.2);
  k.reserve(x, z, W / 2 + 0.2, D / 2 + 0.3);
}

/** The old Port Said lighthouse: a tall tapering octagonal tower of pale concrete, ribbed, with a gallery and a lantern. */
function oldLighthouse(k: PortKit, x: number, y0: number, z: number, h: number): void {
  const p = k.solid;
  p.cyl(x, y0 - 0.1, z, 0.36, 0.34, 0.2, '#b8b0a0', { seg: 8 });
  p.cyl(x, y0 + 0.1, z, 0.3, 0.2, h * 0.62, '#cfc7b4', { seg: 8 });
  p.cyl(x, y0 + 0.1 + h * 0.62, z, 0.2, 0.15, h * 0.38, '#e3dccb', { seg: 8 });
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.rod([x + Math.cos(a) * 0.3, y0 + 0.1, z + Math.sin(a) * 0.3], [x + Math.cos(a) * 0.15, y0 + 0.1 + h, z + Math.sin(a) * 0.15], 0.012, '#b9b09c', 3);
  }
  p.box(x, y0 + 0.28, z + 0.3, 0.1, 0.2, 0.02, '#4a3a2c', { ao: 0 });
  const yt = y0 + 0.1 + h;
  p.cyl(x, yt, z, 0.27, 0.25, 0.05, '#8a7f6a', { seg: 8 });
  p.cyl(x, yt + 0.05, z, 0.26, 0.26, 0.07, '#e8e2d2', { seg: 8, open: true });
  k.glass.cyl(x, yt + 0.05, z, 0.14, 0.14, 0.26, '#bfe6f2', { seg: 8 });
  k.glow.ball(x, yt + 0.18, z, 0.07, '#fff1b0');
  p.cone(x, yt + 0.31, z, 0.2, 0.2, '#6b7a68', { seg: 8 });
  p.ball(x, yt + 0.53, z, 0.025, '#2d3138');
}

const portsaid: Landmark = {
  terrain(k) {
    arid(k, { land: '#d6c79b', land2: '#cdbd8e', hill: '#c6b280', sand: '#ebdfb8', haze: '#e9e3d0' }, { relief: 0.2, range: 0.9, rise: 12 });
    k.shore = 'quay';
    k.plateau(mid(k, -14), -14.6, 11, 3.2, LAND_Y, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    // the lighthouse on the breakwater head
    oldLighthouse(k, k.mole.endX, 0.58, MOLE_Z, 3.1);
    // the Suez Canal Authority building on the waterfront, a garden before it
    canalHQ(k, X(0.6), -14.1);
    k.solid.box(X(0.6), LAND_Y - 0.02, -12.75, 5.0, 0.04, 0.6, '#79a255', { ao: 0 });
    palms(k, rng, X(-2.4), X(3.6), -12.7, 6, 1.2, 1.5, 0.15);
    // old Port Said behind and beside: cream and pastel blocks with balconies
    town(k, PORTSAID_STYLE, 3, -15.9, { rowStep: 0.62, gaps: 0.04, rowRise: 0.2 });
    town(k, PORTSAID_STYLE, 1, SHORE_Z - 1.0, { x0: X(-12) < X(12) ? X(-12) : X(12), x1: X(-4.4) > X(4.4) ? X(-4.4) : X(4.4), gaps: 0.1 });
    // a mosque with its minaret on the left, a few more palms
    mosque(k, X(-7.5), -14.6, 0.85, { wall: '#f4eddd', dome: '#2f8f5d' });
    palms(k, rng, X(4.6), X(11), -13.2, 6, 1.2, 1.6, 0.4);
    // ships queuing for the convoy: container ships, bulkers, a tanker, a car carrier, pilot boats
    const hulls = ['#26364f', '#2b3340', '#7b2a28', '#1f3a5c', '#33404e', '#2f4a3c'];
    const plan: Array<{ dx: number; z: number; L: number; kind: 'c' | 'b' | 't' | 'v' }> = [
      { dx: -9.5, z: -9.1, L: 3.2, kind: 'b' },
      { dx: -4.2, z: -9.0, L: 4.4, kind: 'c' },
      { dx: 1.6, z: -9.2, L: 3.6, kind: 't' },
      { dx: 6.8, z: -9.1, L: 3.8, kind: 'v' },
      { dx: 11.6, z: -9.1, L: 3.2, kind: 'b' },
      { dx: -7.4, z: -10.5, L: 4.6, kind: 'c' },
      { dx: -1.4, z: -10.5, L: 3.4, kind: 'b' },
      { dx: 4.2, z: -10.6, L: 4.8, kind: 'c' },
      { dx: 10.4, z: -10.5, L: 3.6, kind: 't' },
      { dx: -11.8, z: -10.7, L: 3.6, kind: 't' },
    ];
    plan.forEach((s, i) => {
      const o: ShipO = { dir: i % 6 === 4 ? -1 : 1, ry: rng.range(-0.04, 0.04), hull: hulls[i % hulls.length], free: rng.chance(0.5) ? 0.28 : 0.42, funnel: ['#2c5da8', '#b3322a', '#e9a31a', '#2f8f5b'][i % 4] };
      const px = X(s.dx);
      if (s.kind === 'c') containerShip(k, px, s.z, s.L, rng, o);
      else if (s.kind === 'b') bulker(k, px, s.z, s.L, o);
      else if (s.kind === 't') tanker(k, px, s.z, s.L, o);
      else carrier(k, px, s.z, s.L, o);
    });
    tug(k, X(-2.2), -11.55, 1);
    tug(k, X(8.2), -11.5, -1, '#2c5da8');
  },
  rows: 0,
  quiet: true,
  mole: { light: false },
  flag: { dx: 5.5, z: -12.6 },
};

// ───────────────────────────── Suez ─────────────────────────────

const ATAQA = ['#b49a78', '#a5876a', '#947a64', '#80695a', '#8f7766'];

const suez: Landmark = {
  terrain(k) {
    arid(k, { land: '#dbc593', land2: '#d1b983', hill: '#c3a373', rock: '#8f745a', sand: '#eddfb0', haze: '#e8dcc6' }, { relief: 0.3, range: 1.2, rise: 9 });
    k.shore = 'beach';
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const half = 0.95;
    canal(k, cx + m * 0.4, half);
    k.plateau(cx - m * 5.8, -14, 5.6, 2.6, LAND_Y + 0.02, 0.4);
    rockPaint(k, ATAQA, 0.12, 3);
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const canalX = X(0.4);
    // Gebel Ataqa: a big bare massif, mesas and ridges, standing back across the whole scene
    const pk = new Rng(k.seed ^ 0x5a);
    for (let dx = -16; dx <= 16; dx += pk.range(3.2, 4.4)) {
      if (Math.abs(dx - 0.4) < 2.2) continue;
      const rank = dx < 0 ? 0 : 1;
      massif(k, {
        x: X(dx),
        z: -19.5 - pk.range(0, 2.4) - rank * 1.5,
        rx: pk.range(3.6, 5.2),
        rz: pk.range(2.2, 3.2),
        h: pk.range(2.8, 4.6),
        kind: pk.chance(0.55) ? 'mesa' : 'cone',
        n: 10,
        jag: 0.55,
        seed: Math.floor(pk.next() * 90),
        cols: ATAQA,
        reserve: false,
        sq: pk.chance(0.5) ? 3 : 2,
      });
    }
    // the convoy: ships in single file up the canal, bows to the north, spaced like a convoy
    const hulls = ['#26364f', '#7b2a28', '#2b3340', '#1f3a5c', '#33404e'];
    const kinds: Array<'c' | 't' | 'b' | 'v'> = ['c', 't', 'b', 'c', 'v', 't', 'b'];
    let z = -15.2;
    kinds.forEach((kd, i) => {
      const L = kd === 'c' ? 4.4 : kd === 'v' ? 3.8 : 3.8;
      const o: ShipO = { dir: 1, ry: Math.PI / 2 + rng.range(-0.012, 0.012), hull: hulls[i % hulls.length], free: 0.34, funnel: ['#2c5da8', '#b3322a', '#e9a31a'][i % 3] };
      const zc = z - L / 2;
      if (kd === 'c') containerShip(k, canalX, zc, L, rng, { ...o, tiers: 3 });
      else if (kd === 't') tanker(k, canalX, zc, L, o);
      else if (kd === 'b') bulker(k, canalX, zc, L, o);
      else carrier(k, canalX, zc, L, o);
      z -= L + 1.2;
    });
    // ships waiting in the bay for their turn at the canal mouth
    const waiting: Array<[number, number, number, 'c' | 't' | 'b']> = [
      [-9.6, -9.2, 3.8, 't'],
      [-4.8, -10.3, 3.6, 'b'],
      [5.2, -9.3, 4.2, 'c'],
      [10.4, -10.4, 3.4, 't'],
      [-12.0, -10.8, 3.2, 'b'],
    ];
    waiting.forEach(([dx, zz, L, kd], i) => {
      const o: ShipO = { dir: i % 2 ? -1 : 1, ry: rng.range(-0.04, 0.04), hull: hulls[(i + 1) % hulls.length], free: 0.36 };
      if (kd === 'c') containerShip(k, X(dx), zz, L, rng, o);
      else if (kd === 't') tanker(k, X(dx), zz, L, o);
      else bulker(k, X(dx), zz, L, o);
    });
    tug(k, X(2.8), -11.3, -1, '#c8302a');
    // Port Tewfik on the west bank: colonial blocks with arcades and red tiles, a green-domed pavilion and a minaret
    const p = k.solid;
    const bx = X(-5.6);
    const by = k.groundMax(bx, -13.5, 3, 1);
    p.box(bx, by - 0.2, -13.4, 5.2, 0.2 + 0.55, 1.1, '#efe2bf');
    p.prism(bx, by + 0.55, -13.4, 5.3, 0.3, 1.2, '#b24a35', { ry: 0 });
    for (let i = 0; i < 12; i++) arch(p, onZ(bx, -13.4 + 0.554), -2.4 + i * 0.436, by, 0.22, 0.4, '#4a4637');
    for (let i = 0; i < 11; i++) rect(p, onZ(bx, -13.4 + 0.554), -2.2 + i * 0.436 - 0.04, by + 0.43, -2.2 + i * 0.436 + 0.04, by + 0.52, '#3d4a55');
    p.box(X(-8.6), by, -14.1, 1.3, 0.85, 0.9, '#f1e6c6');
    dome(p, X(-8.6), by + 0.85, -14.1, 0.42, 0.55, '#2f8f5d', 12, 0.0);
    p.cyl(X(-8.6), by + 1.4, -14.1, 0.01, 0.008, 0.18, '#e8b923', { seg: 4 });
    town(k, GULF_STYLE, 2, -15.2, { x0: Math.min(X(-12.8), X(-3)), x1: Math.max(X(-12.8), X(-3)), rowStep: 0.6, gaps: 0.1 });
    // the memorial obelisk at the canal mouth on the east bank
    obelisk(k, X(2.8), -12.7, 1.9);
    palms(k, rng, X(2.2), X(8), -13.6, 6, 1.2, 1.6, 0.3);
    palms(k, rng, X(-3), X(-1.4), -12.8, 2, 1.2, 1.5, 0.2);
    scrub(k, rng, X(2), X(12), -13, -17, 10);
  },
  rows: 0,
  quiet: true,
  flag: { dx: 3.4, z: -12.6 },
};

// ───────────────────────────── towers, forts and works ─────────────────────────────

/** A glass-and-concrete tower: a box with vertical glazing strips on the two faces the camera sees. */
function skyscraper(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col, o: { glass?: Col; y?: number; top?: 'flat' | 'spire' | 'crown'; strips?: number } = {}): number {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  p.boxV(x, y - 0.2, z, w, h + 0.2, d, wall, { ao: 0.1 });
  const glass = o.glass ?? '#3f5f78';
  const n = o.strips ?? Math.max(2, Math.round(w / 0.17));
  const sp = w / n;
  for (let i = 0; i < n; i++) {
    const u = x - w / 2 + sp * (i + 0.5);
    p.quad([u - sp * 0.28, y + 0.1, z + d / 2 + 0.004], [u + sp * 0.28, y + 0.1, z + d / 2 + 0.004], [u + sp * 0.28, y + h - 0.06, z + d / 2 + 0.004], [u - sp * 0.28, y + h - 0.06, z + d / 2 + 0.004], glass);
  }
  const m = Math.max(1, Math.round(d / 0.2));
  for (let i = 0; i < m; i++) {
    const v = z + d / 2 - (d / m) * (i + 0.5);
    p.quad([x + w / 2 + 0.004, y + 0.1, v + (d / m) * 0.25], [x + w / 2 + 0.004, y + 0.1, v - (d / m) * 0.25], [x + w / 2 + 0.004, y + h - 0.06, v - (d / m) * 0.25], [x + w / 2 + 0.004, y + h - 0.06, v + (d / m) * 0.25], tint(glass, -0.15));
  }
  p.box(x, y + h, z, w + 0.02, 0.03, d + 0.02, tint(wall, -0.12), { ao: 0 });
  if (o.top === 'spire') p.cyl(x, y + h + 0.03, z, 0.02, 0.006, h * 0.18 + 0.2, '#c9cdd0', { seg: 4, ao: 0 });
  if (o.top === 'crown') p.pyramid(x, y + h + 0.03, z, w * 0.7, h * 0.12, d * 0.7, tint(wall, 0.1));
  k.reserve(x, z, w / 2 + 0.05, d / 2 + 0.05);
  return y + h;
}

/** Burj Khalifa: a tall stepped taper of silver glass with a needle on top. `H` is the full height. */
function burjKhalifa(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.5, 0.5);
  const tiers: Array<[number, number]> = [[0.62, 0.0], [0.54, 0.2], [0.46, 0.34], [0.38, 0.48], [0.3, 0.6], [0.22, 0.72], [0.15, 0.8]];
  for (let i = 0; i < tiers.length; i++) {
    const [w, t0] = tiers[i];
    const t1 = i + 1 < tiers.length ? tiers[i + 1][1] : 0.88;
    const h = (t1 - t0) * H + (i ? 0.03 : 0.2);
    const base = y + t0 * H;
    p.box(x, i ? base : base - 0.2, z, w, h, w * 0.92, i % 2 ? '#c7d3dc' : '#b6c4cf', { ao: 0.05 });
    // wings: two flanking boxes on the lower tiers give the three-lobed section
    if (i < 4) {
      p.box(x - w * 0.5 - 0.04, base, z + 0.02, 0.12 - i * 0.02, h * 0.85, w * 0.5, '#aebcc7', { ao: 0.05 });
      p.box(x + w * 0.5 + 0.04, base, z + 0.02, 0.12 - i * 0.02, h * 0.85, w * 0.5, '#d4dde4', { ao: 0.05 });
    }
    p.quad([x - w * 0.2, base + 0.05, z + w * 0.46 + 0.004], [x + w * 0.2, base + 0.05, z + w * 0.46 + 0.004], [x + w * 0.2, base + h - 0.04, z + w * 0.46 + 0.004], [x - w * 0.2, base + h - 0.04, z + w * 0.46 + 0.004], '#5b7388');
  }
  p.cyl(x, y + 0.88 * H, z, 0.07, 0.012, 0.12 * H, '#d9dde0', { seg: 5, ao: 0 });
  k.reserve(x, z, 0.8, 0.6);
}

/** Burj Al Arab: a billowing white sail on its man-made island, a causeway to the beach, a spine of glass on one side. */
function burjAlArab(k: PortKit, x: number, z: number, s: number, causeTo: number): void {
  const p = k.solid;
  p.cyl(x, -0.9, z, 1.15 * s, 1.0 * s, 0.9 + 0.2, '#d8cfb8', { seg: 14 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.rock(x + Math.cos(a) * 1.15 * s, -0.12, z + Math.sin(a) * 1.15 * s, 0.14 * s, '#8f8a7e', { ao: 0.1 });
  }
  // the causeway to the shore
  const zc = (z - 0.6 * s + causeTo) / 2;
  p.box(x + 0.5 * s, -0.9, zc, 0.22, 0.9 + 0.2, Math.abs(z - 0.6 * s - causeTo) + 0.2, '#cfc8b4');
  const y = 0.2;
  const sail: Array<[number, number]> = [[-0.55, 0], [0.95, 0], [1.0, 0.4], [0.8, 1.4], [0.45, 2.4], [0.1, 3.3], [-0.55, 3.45]];
  p.extrude(sail, 0.62 * s, x, y, z, '#f7f7f4', { s, ao: 0.08 });
  p.extrude([[-0.62, 0], [-0.4, 0], [-0.38, 3.5], [-0.6, 3.5]], 0.72 * s, x, y, z, '#9bb0bf', { s, ao: 0.05 });
  for (let i = 0; i < 9; i++) p.box(x + 0.15 * s, y + (0.25 + i * 0.3) * s, z + 0.31 * s + 0.004, (1.0 - i * 0.07) * s, 0.025 * s, 0.01, '#cfd6db', { ao: 0 });
  p.cyl(x - 0.5 * s, y + 3.5 * s, z, 0.03 * s, 0.01 * s, 0.7 * s, '#d9c27a', { seg: 5, ao: 0 });
  p.cyl(x - 0.15 * s, y + 3.4 * s, z, 0.18 * s, 0.18 * s, 0.05 * s, '#f1f1ee', { seg: 10 });
  k.reserve(x, z, 1.3 * s, 1.0 * s);
}

/** King Fahd's Fountain: a very tall white jet over a round pad on piles, a broad low skirt of spray and arcs of side jets. */
function fountain(k: PortKit, x: number, z: number, H: number): void {
  const p = k.solid;
  const g = k.glow;
  p.cyl(x, -0.9, z, 0.62, 0.62, 0.9 + 0.16, '#d6d1c4', { seg: 12 });
  p.cyl(x, 0.16, z, 0.5, 0.46, 0.05, '#9fa8ae', { seg: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.cyl(x + Math.cos(a) * 0.66, -0.9, z + Math.sin(a) * 0.66, 0.05, 0.05, 0.9 + 0.1, '#8a847a', { seg: 5 });
  }
  const white = '#fdffff';
  const y0 = 0.24;
  p.cyl(x, 0.21, z, 0.46, 0.46, 0.03, '#2f87a8', { seg: 12, ao: 0 });
  // the jet itself, then the broad low skirt of spray that makes it read from close in
  g.cyl(x, y0, z, 0.2, 0.04, H, white, { seg: 6, ao: 0, open: true });
  g.cone(x, y0, z, 0.72, 1.5, '#f4fbfe', { seg: 12, ao: 0 });
  g.cone(x, y0 + 0.7, z, 0.4, 1.9, '#f9fdff', { seg: 10, ao: 0 });
  g.cone(x, y0 + H - 0.8, z, 0.17, 0.85, white, { seg: 6, ao: 0 });
  g.ball(x, y0 + H - 0.1, z, 0.14, '#ffffff', { sy: 1.5 });
  // arcs of side jets: each a path up and out and down
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const pts: Array<[number, number]> = [[0.12, 0.2], [0.36, 1.05], [0.72, 1.25], [1.02, 0.7], [1.2, 0.12]];
    for (let j = 0; j < pts.length - 1; j++) g.rod([x + c * pts[j][0], pts[j][1], z + sn * pts[j][0]], [x + c * pts[j + 1][0], pts[j + 1][1], z + sn * pts[j + 1][0]], 0.028, '#f6fcff', 3);
  }
  k.reserve(x, z, 1.2, 1.2);
}

/** Al-Rahmah Mosque on its platform over the sea: a long white hall, a big central dome, smaller domes and a tall slender minaret. */
function floatingMosque(k: PortKit, x: number, z: number, causeTo: number): void {
  const p = k.solid;
  const W = 4.2;
  const D = 1.9;
  const deckY = 0.34;
  p.box(x, -0.9, z - D * 0.3, W, 0.9 + deckY - 0.08, D * 0.4, '#8a847a');
  p.box(x, deckY - 0.08, z, W + 0.2, 0.1, D + 0.2, '#dad4c4');
  for (let i = 0; i < 9; i++) p.cyl(x - W / 2 + 0.1 + i * ((W - 0.2) / 8), -0.9, z + D / 2 - 0.1, 0.06, 0.06, 0.9 + deckY - 0.08, '#8a847a', { seg: 5 });
  // the causeway to the shore
  p.box(x + W / 2 - 0.4, -0.9, (z - D / 2 + causeTo) / 2, 0.36, 0.9 + deckY + 0.02, Math.abs(z - D / 2 - causeTo) + 0.3, '#cfc8b4');
  const y = deckY + 0.02;
  const wall = '#f8f4e8';
  const trim = '#e6dfca';
  p.box(x, y, z, W, 0.62, D, wall);
  p.box(x, y + 0.62, z, W + 0.06, 0.05, D + 0.06, trim);
  for (let i = 0; i < 12; i++) {
    const u = -W / 2 + (i + 0.5) * (W / 12);
    arch(p, onZ(x, z + D / 2 + 0.004), u, y + 0.06, 0.2, 0.4, '#5d7f8e', 'point');
  }
  for (let i = 0; i < 5; i++) arch(p, onX(x + W / 2 + 0.004, z + D / 2), 0.2 + i * 0.34, y + 0.06, 0.2, 0.4, '#5d7f8e', 'point');
  const domeC = '#f3efe2';
  // the great dome on its drum, a lantern on top
  p.cyl(x, y + 0.67, z, 0.7, 0.7, 0.3, wall, { seg: 12 });
  dome(p, x, y + 0.97, z, 0.74, 0.9, domeC, 14);
  p.cyl(x, y + 1.87, z, 0.012, 0.01, 0.22, '#d9a82c', { seg: 4 });
  // four smaller domes round it and a pair at the ends
  for (const [dx, dz, r] of [[-1.25, 0.3, 0.3], [1.25, 0.3, 0.3], [-1.25, -0.35, 0.3], [1.25, -0.35, 0.3], [-1.9, 0, 0.26], [1.9, 0, 0.26]] as const) {
    p.cyl(x + dx, y + 0.67, z + dz, r * 0.9, r * 0.9, 0.12, wall, { seg: 8 });
    dome(p, x + dx, y + 0.79, z + dz, r, r * 1.05, domeC, 10);
  }
  minaret(k, x - W / 2 + 0.15, z + D / 2 - 0.15, 2.9, y, '#f8f4e8', '#6d9b8f');
  k.reserve(x, z, W / 2 + 0.3, D / 2 + 0.3);
}

const BALAD_WALLS = ['#ece0c4', '#e4d5b0', '#efe6d1', '#dccfae', '#e9dcc0'];

/** Al-Balad: tall coral-stone houses in the colour of old ivory, with their carved wooden bay windows (roshan) on every floor. */
function balad(k: PortKit, rng: Rng, x0: number, x1: number, z: number, o: { rows?: number; rowStep?: number; floors?: [number, number]; skip?: (x: number, z: number) => boolean } = {}): void {
  const p = k.solid;
  const rows = o.rows ?? 2;
  const [fa, fb] = o.floors ?? [3, 5];
  for (let r = 0; r < rows; r++) {
    const zr = z - r * (o.rowStep ?? 0.62) + rng.range(-0.04, 0.04);
    let x = x0 + rng.range(0, 0.3);
    while (x < x1) {
      const w = rng.range(0.34, 0.54);
      const d = rng.range(0.36, 0.46);
      const px = x + w / 2;
      x += w + rng.range(0, 0.05);
      if (o.skip?.(px, zr) || k.isReserved(px, zr, 0.02)) continue;
      const gTop = k.groundMax(px, zr, w / 2, d / 2);
      const gLow = k.groundMin(px, zr, w / 2, d / 2);
      if (gLow < 0.22 || gTop - gLow > 0.5) continue;
      const fl = Math.max(2, rng.int(fa, fb) - (r > 0 && rng.chance(0.3) ? 1 : 0));
      const h = fl * 0.17;
      const wall = pick(rng, BALAD_WALLS);
      p.boxV(px, gLow - 0.08, zr, w, h + (gTop - gLow) + 0.08, d, wall, { ao: 0.14 });
      p.box(px, gTop + h, zr, w + 0.02, 0.035, d + 0.02, tint(wall, -0.08), { ao: 0 });
      const zf = zr + d / 2 + 0.004;
      for (let f = 0; f < fl; f++) {
        const yy = gTop + 0.04 + f * 0.17;
        if (r === 0 && f > 0) {
          // two carved bays per floor: a dark wooden box with a pale lintel
          for (const u of [-w * 0.22, w * 0.22]) {
            p.quad([px + u - 0.065, yy, zf + 0.012], [px + u + 0.065, yy, zf + 0.012], [px + u + 0.065, yy + 0.1, zf + 0.012], [px + u - 0.065, yy + 0.1, zf + 0.012], '#6d4b33');
            p.quad([px + u - 0.065, yy + 0.1, zf + 0.013], [px + u + 0.065, yy + 0.1, zf + 0.013], [px + u + 0.065, yy + 0.125, zf + 0.013], [px + u - 0.065, yy + 0.125, zf + 0.013], '#c9b48a');
          }
        } else p.quad([px - 0.05, yy + 0.02, zf], [px + 0.05, yy + 0.02, zf], [px + 0.05, yy + 0.1, zf], [px - 0.05, yy + 0.1, zf], '#6d5037');
      }
      k.reserve(px, zr, w / 2, d / 2);
    }
  }
}

/** A white fort in the style of Sohar: a thick curtain wall, a tall round keep, corner towers, all battlemented. */
function soharFort(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 1.3 * s, 0.9 * s) - 0.03;
  const wall = '#faf6ea';
  const shade = '#ece5d0';
  const dark = '#46382a';
  p.box(x, y - 0.4, z, 2.9 * s, 0.4 + 0.55 * s, 1.7 * s, wall);
  p.box(x, y + 0.55 * s, z, 2.96 * s, 0.05 * s, 1.76 * s, shade, { ao: 0 });
  for (let i = 0; i < 12; i++) {
    p.box(x - 1.38 * s + i * 0.25 * s, y + 0.6 * s, z + 0.82 * s, 0.13 * s, 0.1 * s, 0.07 * s, wall, { ao: 0 });
    if (i < 7) p.box(x + 1.42 * s, y + 0.6 * s, z + 0.76 * s - i * 0.25 * s, 0.07 * s, 0.1 * s, 0.13 * s, wall, { ao: 0 });
  }
  arch(p, onZ(x - 0.3 * s, z + 0.85 * s + 0.004), 0, y, 0.3 * s, 0.42 * s, dark, 'point');
  for (const u of [-1.0, 0.5, 1.0]) rect(p, onZ(x, z + 0.85 * s + 0.004), u * s - 0.04 * s, y + 0.25 * s, u * s + 0.04 * s, y + 0.38 * s, dark);
  // the big round keep, tapering, with a corbelled crown
  const kx = x - 0.15 * s;
  const kz = z - 0.2 * s;
  p.cyl(kx, y - 0.1, kz, 0.42 * s, 0.34 * s, 1.85 * s + 0.1, wall, { seg: 12 });
  p.cyl(kx, y + 1.85 * s, kz, 0.43 * s, 0.4 * s, 0.1 * s, shade, { seg: 12 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.box(kx + Math.cos(a) * 0.4 * s, y + 1.95 * s, kz + Math.sin(a) * 0.4 * s, 0.13 * s, 0.1 * s, 0.13 * s, wall, { ao: 0 });
  }
  arch(p, onZ(kx, kz + 0.38 * s), 0, y + 1.2 * s, 0.1 * s, 0.22 * s, dark, 'point');
  // corner towers
  for (const [dx, dz, r, h] of [[-1.38, 0.8, 0.22, 0.95], [1.38, 0.8, 0.22, 0.95], [1.38, -0.8, 0.2, 0.9], [-1.38, -0.8, 0.2, 0.9]] as const) {
    p.cyl(x + dx * s, y - 0.1, z + dz * s, r * 1.08 * s, r * s, h * s + 0.1, wall, { seg: 10 });
    p.cyl(x + dx * s, y + h * s, z + dz * s, r * 1.2 * s, r * 1.2 * s, 0.06 * s, shade, { seg: 10 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.box(x + dx * s + Math.cos(a) * r * 1.1 * s, y + h * s + 0.06 * s, z + dz * s + Math.sin(a) * r * 1.1 * s, 0.1 * s, 0.08 * s, 0.1 * s, wall, { ao: 0 });
    }
  }
  k.reserve(x, z, 1.7 * s, 1.1 * s);
}

/** A distillation column or reactor: a tall white cylinder with bands and a ladder, a dome on top. */
function column(k: PortKit, x: number, z: number, r: number, h: number, c: Col = '#e9e6dc'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, r, r) - 0.02;
  p.cyl(x, y - 0.1, z, r, r, h + 0.1, c, { seg: 8, open: true });
  p.cone(x, y + h, z, r, r * 0.55, tint(c, -0.1), { seg: 8 });
  for (const t of [0.3, 0.62]) p.cyl(x, y + h * t, z, r * 1.06, r * 1.06, 0.03, '#8a8f94', { seg: 8, ao: 0, open: true });
  p.box(x + r * 0.8, y, z + r * 0.4, 0.025, h * 0.95, 0.025, '#6b7178', { ao: 0 });
  k.reserve(x, z, r + 0.1, r + 0.1);
}

/** A long industrial shed with a ridged roof and a row of vents. */
function shed(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col = '#d4d0c4', roof: Col = '#8a949c'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2);
  p.boxV(x, y - 0.1, z, w, h + 0.1, d, wall);
  p.prism(x, y + h, z, w + 0.04, 0.18, d + 0.03, roof, { ry: 0 });
  const n = Math.floor(w / 0.5);
  for (let i = 0; i < n; i++) p.quad([x - w / 2 + 0.2 + i * 0.5, y + h * 0.45, z + d / 2 + 0.004], [x - w / 2 + 0.4 + i * 0.5, y + h * 0.45, z + d / 2 + 0.004], [x - w / 2 + 0.4 + i * 0.5, y + h * 0.85, z + d / 2 + 0.004], [x - w / 2 + 0.2 + i * 0.5, y + h * 0.85, z + d / 2 + 0.004], '#4f5e6b');
  k.reserve(x, z, w / 2, d / 2);
}

/** A container terminal: a row of ship-to-shore cranes, ships alongside, yards of coloured boxes and floodlight masts. */
function terminal(
  k: PortKit,
  rng: Rng,
  o: {
    x0: number;
    x1: number;
    n: number;
    s?: number;
    colors?: Col[];
    ships?: Array<{ x: number; L: number; hull?: Col; dir?: 1 | -1; z?: number; tiers?: number }>;
    yards?: Array<{ x: number; nx: number; nz: number; z?: number; tiers?: number }>;
    masts?: number[];
  },
): void {
  craneRow(k, o.x0, o.x1, o.n, { s: o.s, colors: o.colors });
  for (const sh of o.ships ?? []) containerShip(k, sh.x, sh.z ?? -11.15, sh.L, rng, { dir: sh.dir ?? 1, hull: sh.hull, tiers: sh.tiers, free: 0.42 });
  for (const yd of o.yards ?? []) yard(k, yd.x, yd.z ?? -13.75, yd.nx, yd.nz, yd.tiers ?? 3, rng);
  const p = k.solid;
  for (const mx of o.masts ?? []) {
    p.cyl(mx, LAND_Y, -13.6, 0.03, 0.02, 1.7, '#8a8f94', { seg: 5 });
    p.box(mx, LAND_Y + 1.66, -13.55, 0.3, 0.06, 0.1, '#d9d4c7');
    k.glow.box(mx, LAND_Y + 1.63, -13.5, 0.3, 0.025, 0.02, '#fff3c0');
  }
}

// ───────────────────────────── Jeddah ─────────────────────────────

const jeddah: Landmark = {
  terrain(k) {
    arid(k, { land: '#e0cd9c', land2: '#d6c28c', hill: '#c8ad7c', sand: '#f0e4ba', haze: '#ebe3d0' }, { relief: 0.3, range: 1.8, rise: 8 });
    k.shore = 'quay';
    k.plateau(mid(k, -14), -14.8, 13, 3.6, LAND_Y, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // King Fahd's Fountain out in the roads, the mosque on its piles by the Corniche
    fountain(k, X(-0.2), -9.9, 7.4);
    floatingMosque(k, X(4.8), -11.2, SHORE_Z);
    // Al-Balad and the Corniche
    balad(k, rng, lo(-13, 13), hi(-13, 13), -13.8, { rows: 3, rowStep: 0.62 });
    // modern towers behind the old town
    const towers: Array<[number, number, number, number, number, Col, Col]> = [
      [-7.0, -19.0, 0.8, 0.7, 3.4, '#cfd8de', '#4a6a86'],
      [-5.6, -20.0, 0.7, 0.7, 4.6, '#e6e4dc', '#3f5f78'],
      [-2.4, -19.4, 0.9, 0.8, 3.0, '#b8c8d2', '#35546e'],
      [1.4, -20.2, 0.8, 0.7, 4.1, '#e2e0d6', '#3f5f78'],
      [4.0, -19.2, 0.9, 0.8, 3.3, '#cfd8de', '#4a6a86'],
      [8.0, -20.0, 0.8, 0.7, 4.8, '#dfe6ea', '#35546e'],
      [10.4, -19.4, 0.8, 0.7, 2.8, '#e6e4dc', '#4a6a86'],
    ];
    for (const [dx, z, w, d, h, wall, glass] of towers) skyscraper(k, X(dx), z, w, d, h, wall, { glass, top: h > 4 ? 'spire' : 'flat' });
    // a ship at the container terminal on the left, a bulker on the right, dhows by the Corniche
    containerShip(k, X(-9.4), -9.5, 4.6, rng, { dir: 1, hull: '#26364f', free: 0.4 });
    bulker(k, X(10.2), -9.6, 3.6, { dir: -1, hull: '#7b2a28' });
    tug(k, X(-6.2), -11.4, 1);
    dhow(k, X(8.6), -11.4, 0.9, { dir: 1, ry: 0.1 });
    dhow(k, X(-5.4), -11.5, 0.8, { dir: -1, ry: -0.1 });
    // the Corniche: palms along the waterfront
    palms(k, rng, lo(-12, 12), hi(-12, 12), -12.9, 16, 1.2, 1.6, 0.2);
    p.box(X(0), LAND_Y - 0.02, -12.65, 24, 0.04, 0.4, '#d9d1bb', { ao: 0 });
  },
  rows: 0,
  quiet: true,
  flag: { dx: -6.4, z: -12.7 },
};

// ───────────────────────────── Djibouti ─────────────────────────────

const VOLCANIC = ['#6a4f40', '#4a3a32', '#5e4636', '#352c28'];
const DJ_STYLE: HouseStyle = {
  ...GULF_STYLE,
  walls: ['#f9f6ee', '#f3efe2', '#ece3cd', '#faf8f2', '#e6d9bb'],
  floors: [1, 3],
  w: [0.34, 0.54],
  gap: [0, 0.07],
  door: '#4a6a82',
};

const djibouti: Landmark = {
  terrain(k) {
    arid(k, { land: '#a8987d', land2: '#9a8a70', hill: '#7a6a58', rock: '#3d3530', sand: '#d9ccaa', haze: '#e6ddcb' }, { relief: 0.5, range: 2, rise: 6, rough: 0.7 });
    k.shore = 'beach';
    const cx = mid(k, -14);
    k.plateau(cx, -14.4, 14, 3.0, LAND_Y + 0.02, 0.3);
    k.paint((x, y, z, slope, c) => {
      if (z < SHORE_Z - 4.5) c.lerp(new THREE.Color('#5a4a3f'), 0.35 * smooth(SHORE_Z - 4.5, SHORE_Z - 12, z));
    });
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // the black volcanic hills: cones and craters, scoured and bare, ash drifts at their feet
    const pk = new Rng(k.seed ^ 0xd1);
    for (let dx = -15; dx <= 15; dx += pk.range(2.4, 3.6)) {
      const rank = pk.chance(0.45) ? 1 : 0;
      massif(k, {
        x: X(dx),
        z: -17.8 - rank * 3 - pk.range(0, 1.8),
        rx: pk.range(2.6, 3.8),
        rz: pk.range(2.0, 2.8),
        h: pk.range(1.6, 3.4) * (rank ? 1.3 : 1),
        kind: 'cone',
        n: 10,
        jag: 0.5,
        topR: pk.chance(0.6) ? 0.2 : 0,
        topCol: '#2a2420',
        seed: Math.floor(pk.next() * 90),
        cols: VOLCANIC,
        reserve: false,
      });
    }
    // the whitewashed town, a mosque with its tall minaret
    town(k, DJ_STYLE, 3, SHORE_Z - 1.2, { x0: lo(-13, 1.2), x1: hi(-13, 1.2), rowStep: 0.6, gaps: 0.08, rowRise: 0.15 });
    mosque(k, X(-3.6), -14.7, 1.05, { wall: '#faf7ee', dome: '#e4dcc4', minarets: 1 });
    palms(k, rng, lo(-12, 1.6), hi(-12, 1.6), -12.9, 7, 1.1, 1.5, 0.5);
    // tankers at anchor
    const dark = ['#26303d', '#4a2c2c', '#33404e', '#23272e'];
    const tk: Array<[number, number, number]> = [
      [-9.6, -9.3, 3.8],
      [-4.6, -10.3, 4.4],
      [0.6, -9.2, 3.4],
      [-12.2, -10.8, 3.2],
    ];
    tk.forEach(([dx, z, L], i) => tanker(k, X(dx), z, L, { dir: i % 3 === 2 ? -1 : 1, ry: rng.range(-0.04, 0.04), hull: dark[i % dark.length], free: i % 2 ? 0.22 : 0.4 }));
    dhow(k, X(2.4), -11.55, 0.85, { dir: -1, ry: 0.05 });
    // the container terminal at the right: cranes, a ship, yards
    quayWall(k, lo(1.8, 14), hi(1.8, 14));
    const tx0 = X(2.8);
    const tx1 = X(7.0);
    terminal(k, rng, {
      x0: Math.min(tx0, tx1),
      x1: Math.max(tx0, tx1),
      n: 4,
      s: 1.05,
      colors: ['#2c5da8', '#e8e6df'],
      ships: [{ x: X(4.9), L: 4.6, hull: '#1f3a5c', dir: m > 0 ? 1 : -1 }],
      yards: [
        { x: Math.min(X(1.8), X(9.4)), nx: 17, nz: 3, tiers: 3 },
        { x: Math.min(X(1.8), X(9.4)), nx: 17, nz: 3, z: -14.9, tiers: 4 },
      ],
      masts: [X(3), X(6.2), X(9.4)],
    });
  },
  rows: 0,
  quiet: true,
  flag: { dx: 0.4, z: -12.5 },
};

// ───────────────────────────── Khor Fakkan ─────────────────────────────

const khorfakkan: Landmark = {
  terrain(k) {
    arid(k, { land: '#d8c492', land2: '#cdb682', rock: '#7d6550', hill: '#bf9f6f' }, { relief: 0.4, range: 1.5, rise: 8 });
    k.shore = 'quay';
    k.plateau(mid(k, -14), -14.6, 8.5, 3.3, LAND_Y, 0.3);
    ridge(k, { zFoot: -17, z0: -21.5, z1: -52, h: 5.2, seed: 9, jag: 0.85, freq: 0.3 });
    rockPaint(k, HAJAR_DARK, 0.1, 4);
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    const pk = new Rng(k.seed ^ 0xfa);
    // the bay is walled in: steep brown mountains crowd the terminal on both sides and close it at the back
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        massif(k, {
          x: X(side * (6.4 + i * 3.4)),
          z: -13.4 - i * 1.3 - pk.range(0, 0.8),
          rx: pk.range(2.6, 3.2),
          rz: pk.range(2.0, 2.6),
          h: (4.4 + i * 0.4) * pk.range(0.85, 1.15),
          kind: 'cone',
          n: 9,
          jag: 0.8,
          seed: Math.floor(pk.next() * 90),
          cols: pk.chance(0.5) ? HAJAR_DARK : HAJAR_REDDISH,
          lean: [side * -0.15, 0],
          reserve: true,
        });
      }
      // a rocky headland running out into the water
      massif(k, { x: X(side * 8.8), z: -11.4, rx: 2.4, rz: 1.5, h: 2.4, kind: 'cone', n: 8, jag: 0.8, seed: 40 + side, cols: HAJAR_DARK, reserve: true });
    }
    hajar(k, X, { dx0: -10, dx1: 10, z0: -18.6, h: 3.2, seed: 7 });
    // the terminal: cranes along the quay, two ships, yards of boxes
    const c0 = X(-4.6);
    const c1 = X(4.6);
    terminal(k, rng, {
      x0: Math.min(c0, c1),
      x1: Math.max(c0, c1),
      n: 6,
      s: 1.1,
      colors: ['#c9402e', '#e8e6df', '#2c5da8'],
      ships: [
        { x: X(-1.2), L: 6.0, hull: '#7b2a28', dir: m > 0 ? 1 : -1, tiers: 3 },
        { x: X(5.6), L: 3.8, hull: '#1f3a5c', dir: m > 0 ? 1 : -1, tiers: 2 },
      ],
      yards: [
        { x: Math.min(X(-5.2), X(5.2)), nx: 24, nz: 3, tiers: 3 },
        { x: Math.min(X(-5.2), X(5.2)), nx: 24, nz: 3, z: -14.9, tiers: 4 },
      ],
      masts: [X(-3.6), X(0.2), X(3.8)],
    });
    // the fishing village on the beach: white houses and a mosque, dhows, palms
    town(k, GULF_STYLE, 2, SHORE_Z - 1.0, { x0: lo(-14, -6.6), x1: hi(-14, -6.6), gaps: 0.1, rowStep: 0.55 });
    mosque(k, X(-9.6), -14.0, 0.8, { wall: '#f6f1e6', dome: '#d6c28a' });
    dhow(k, X(-9.0), -11.5, 0.9, { dir: 1, ry: 0.1 });
    dhow(k, X(8.8), -10.1, 0.8, { dir: -1, ry: -0.1 });
    palms(k, rng, lo(-13, -6.8), hi(-13, -6.8), -12.9, 6, 1.1, 1.5, 0.4);
  },
  rows: 0,
  quiet: true,
  flag: { dx: -6.0, z: -12.5 },
};

// ───────────────────────────── Jebel Ali ─────────────────────────────

const jebelali: Landmark = {
  terrain(k) {
    arid(k, { land: '#e2cf9f', land2: '#d9c690', sand: '#f1e5bd', haze: '#ece4d2', hill: '#cdb27f' }, { relief: 0.15, range: 0.6, rise: 14, rough: 0.2 });
    k.shore = 'quay';
    k.plateau(mid(k, -14), -15.2, 15, 4.0, LAND_Y, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // endless gantry cranes: a long row, red and blue, running off the edge of the picture
    terminal(k, rng, {
      x0: lo(-1.2, 16.4),
      x1: hi(-1.2, 16.4),
      n: 15,
      s: 0.98,
      colors: ['#c9402e', '#e8e6df', '#2c5da8', '#e8e6df'],
      ships: [
        { x: X(2.2), L: 6.2, hull: '#1f3a5c', dir: m > 0 ? 1 : -1, tiers: 3 },
        { x: X(9.8), L: 5.2, hull: '#7b2a28', dir: m > 0 ? 1 : -1, tiers: 3 },
      ],
      yards: [
        { x: lo(-1.4, 16.6), nx: 37, nz: 3, tiers: 3 },
        { x: lo(-1.4, 16.6), nx: 37, nz: 3, z: -14.95, tiers: 4 },
        { x: lo(-1.4, 16.6), nx: 37, nz: 2, z: -16.1, tiers: 3 },
      ],
      masts: [X(0.2), X(4.2), X(8.4), X(12.6)],
    });
    // Burj Al Arab on its island off the beach, to the left of the terminal
    burjAlArab(k, X(-3.7), -10.2, 1.0, SHORE_Z);
    // the Dubai skyline behind the yards
    const sk: Array<[number, number, number, number, number, Col, Col, ('flat' | 'spire' | 'crown')?]> = [
      [-0.6, -18.8, 0.8, 0.7, 2.2, '#d6dfe4', '#4a6a86'],
      [1.0, -19.8, 0.7, 0.7, 3.2, '#e8ecee', '#35546e', 'spire'],
      [2.6, -18.6, 0.8, 0.8, 2.6, '#b8c8d2', '#3f5f78'],
      [4.0, -19.4, 0.8, 0.7, 3.4, '#cfd8de', '#35546e', 'crown'],
      [6.4, -18.8, 0.9, 0.8, 2.4, '#e6e4dc', '#4a6a86'],
      [8.2, -19.8, 0.7, 0.7, 3.2, '#cfd8de', '#3f5f78', 'spire'],
      [10.1, -18.6, 0.9, 0.8, 2.1, '#dfe6ea', '#4a6a86'],
      [11.9, -19.6, 0.8, 0.7, 2.8, '#b8c8d2', '#35546e'],
      [-2.8, -17.6, 0.8, 0.7, 1.5, '#ece4d2', '#5a7a92'],
      [13.8, -18.4, 0.9, 0.8, 2.2, '#e6e4dc', '#4a6a86'],
    ];
    for (const [dx, z, w, d, h, wall, glass, top] of sk) skyscraper(k, X(dx), z, w, d, h, wall, { glass, top });
    burjKhalifa(k, X(5.4), -22.4, 7.6);
    town(k, GULF_STYLE, 3, -17.5, { x0: lo(0, 16), x1: hi(0, 16), gaps: 0.25, rowStep: 0.6, rowRise: 0.2 });
    // white villas and palms along the beach at the left
    town(k, GULF_STYLE, 2, SHORE_Z - 1.0, { x0: lo(-14, -4.4), x1: hi(-14, -4.4), gaps: 0.2, rowStep: 0.55 });
    palms(k, rng, lo(-13, -4.6), hi(-13, -4.6), -12.9, 8, 1.2, 1.6, 0.5);
    p.box(X(-3.7), LAND_Y - 0.03, -11.9, 1.1, 0.06, 0.4, '#d9d1bb', { ao: 0 });
  },
  rows: 0,
  quiet: true,
  flag: { dx: -5.6, z: -12.6 },
};

// ───────────────────────────── Salalah ─────────────────────────────

const DHOFAR = ['#c9b585', '#b0a070', '#98a066', '#7f9a5c'];

const salalah: Landmark = {
  terrain(k) {
    arid(k, { land: '#d9c892', land2: '#cdbb84', hill: '#a89c68', rock: '#8a7f5e', sand: '#efe2b8', haze: '#e6e2cc' }, { relief: 0.5, range: 1.5, rise: 8, rough: 0.3 });
    k.shore = 'quay';
    k.plateau(mid(k, -14), -14.8, 13, 3.6, LAND_Y, 0.4);
    ridge(k, { zFoot: -18, z0: -26, z1: -56, h: 3.6, seed: 17, jag: 0.25, freq: 0.14 });
    // the khareef greens the hills: a wash of fresh green on the slopes
    const fresh = new THREE.Color('#8fa85c');
    k.paint((x, y, z, slope, c) => {
      if (z < -16) c.lerp(fresh, 0.4 * smooth(0.5, 2.2, y) * (1 - smooth(0.2, 0.5, slope)));
    });
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // the Dhofar mountains: broad, rounded, steep-sided mesas, olive and tan
    const pk = new Rng(k.seed ^ 0xda);
    for (let dx = -16; dx <= 16; dx += pk.range(3.6, 5.0)) {
      const rank = pk.chance(0.5) ? 1 : 0;
      massif(k, {
        x: X(dx),
        z: -19.6 - rank * 2.8 - pk.range(0, 1.6),
        rx: pk.range(4.0, 5.6),
        rz: pk.range(2.4, 3.2),
        h: pk.range(2.2, 3.4) * (rank ? 1.25 : 1),
        kind: pk.chance(0.25) ? 'mesa' : 'dome',
        n: 12,
        jag: 0.28,
        sq: 2.1,
        seed: Math.floor(pk.next() * 90),
        cols: DHOFAR,
        reserve: false,
      });
    }
    // the transshipment terminal: big cranes, mega-ships, yards
    const c0 = X(-4.0);
    const c1 = X(5.6);
    terminal(k, rng, {
      x0: Math.min(c0, c1),
      x1: Math.max(c0, c1),
      n: 8,
      s: 1.18,
      colors: ['#2c5da8', '#e8e6df'],
      ships: [
        { x: X(-0.4), L: 6.8, hull: '#1f3a5c', dir: m > 0 ? 1 : -1, tiers: 4 },
        { x: X(7.8), L: 5.2, hull: '#33404e', dir: m > 0 ? 1 : -1, tiers: 3 },
      ],
      yards: [
        { x: Math.min(X(-4.8), X(8.6)), nx: 30, nz: 3, tiers: 4 },
        { x: Math.min(X(-4.8), X(8.6)), nx: 30, nz: 3, z: -14.95, tiers: 4 },
      ],
      masts: [X(-2.8), X(1.6), X(5.8)],
    });
    // coconut palms along the beach and between the houses, camels at rest
    for (let i = 0; i < 22; i++) {
      const x = lo(-12, 1.5) + (hi(-12, 1.5) - lo(-12, 1.5)) * (i / 21) + rng.range(-0.3, 0.3);
      const zz = -12.9 - rng.range(0, 1.1);
      const y = k.ground(x, zz);
      if (y > 0.25 && !k.isReserved(x, zz, 0.1)) coconut(k, x, zz, rng.range(1.9, 2.5), rng, y - 0.02);
    }
    town(k, GULF_STYLE, 2, SHORE_Z - 1.5, { x0: lo(-14, -4.4), x1: hi(-14, -4.4), gaps: 0.15, rowStep: 0.6 });
    for (let i = 0; i < 4; i++) {
      const x = X(-5.6 - i * 0.85 + rng.range(-0.2, 0.2));
      camel(k, x, -12.7 - rng.range(0, 0.5), rng.range(2.4, 2.9), rng.range(-0.4, 0.4));
    }
    scrub(k, rng, X(-14), X(14), -16.2, -19.5, 26, '#7f9a52');
    mosque(k, X(-9.0), -15.0, 0.85, { wall: '#f6f1e6', dome: '#d6c28a' });
    tug(k, X(-10), -11.5, 1, '#2c5da8');
  },
  rows: 0,
  quiet: true,
  flag: { dx: -3.0, z: -12.5 },
};

// ───────────────────────────── Sohar ─────────────────────────────

const soharPlant = (k: PortKit, rng: Rng, X: (dx: number) => number): void => {
  const p = k.solid;
  // the power station: a hall and four tall banded stacks
  shed(k, X(5.0), -15.0, 3.2, 1.3, 0.9, '#d9d6cc', '#7d8890');
  for (let i = 0; i < 4; i++) smokeStack(k, X(3.5 + i * 1.1), -16.3, 2.7 + (i % 2) * 0.45, 0.11, undefined, i % 2 ? '#c8302a' : '#e9a31a');
  // the refinery: columns, a flare, white tanks, pipe racks
  column(k, X(7.6), -14.2, 0.2, 1.9);
  column(k, X(8.2), -14.6, 0.16, 1.5, '#d9dfe2');
  column(k, X(8.8), -14.1, 0.22, 2.1);
  const fy = k.ground(X(9.6), -15.6);
  p.cyl(X(9.6), fy - 0.02, -15.6, 0.045, 0.025, 2.5, '#a9a9a2', { seg: 6 });
  k.glow.cone(X(9.6), fy + 2.43, -15.6, 0.05, 0.22, '#ffd37a', { seg: 5 });
  for (let i = 0; i < 6; i++) tank(k, X(0.6 + (i % 3) * 1.2), -13.8 - Math.floor(i / 3) * 1.3, 0.46, 0.5, { floating: i % 2 === 0, band: i % 3 === 0 ? '#2c5da8' : undefined });
  pipeRack(k, X(0), X(9.8), -13.05);
  // the aluminium smelter: a long potline shed
  shed(k, X(1.8), -17.6, 4.4, 0.9, 0.75, '#c9ccd0', '#8d979f');
  void rng;
};

const sohar: Landmark = {
  terrain(k) {
    arid(k, { land: '#dccb98', land2: '#d1be88', hill: '#c0a470', rock: '#8a735a', sand: '#efe2b4', haze: '#eadfcb' }, { relief: 0.3, range: 1.4, rise: 9, rough: 0.5 });
    k.shore = 'beach';
    k.plateau(mid(k, -14), -15.4, 13, 4.0, LAND_Y + 0.04, 0.35);
    ridge(k, { zFoot: -21, z0: -26, z1: -56, h: 3.4, seed: 21, jag: 0.8, freq: 0.3 });
    rockPaint(k, HAJAR_DARK, 0.1, 4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // the Hajar, low and hazy behind the plain
    hajar(k, X, { dx0: -14, dx1: 14, z0: -22.4, h: 2.4, seed: 3 });
    // the white fort by the sea, palms, a mosque, the old town
    soharFort(k, X(-4.4), -13.5, 1.0);
    mosque(k, X(-9.0), -14.2, 0.85, { wall: '#f9f5ea', dome: '#d6c28a' });
    town(k, GULF_STYLE, 3, SHORE_Z - 1.2, { x0: lo(-14, 0), x1: hi(-14, 0), gaps: 0.08, rowStep: 0.58 });
    palms(k, rng, lo(-12.4, -0.6), hi(-12.4, -0.6), -12.8, 12, 1.2, 1.7, 0.5);
    // industry on the right: stacks, columns, tanks, a jetty with a bulk carrier and a tanker
    soharPlant(k, rng, X);
    const jx = X(6.2);
    p.box(jx, -0.9, -11.1, 0.28, 0.9 + 0.38, 2.2, '#a8a49a');
    p.box(jx, 0.36, -10.0, 1.4, 0.05, 0.4, '#c9c5ba', { ao: 0 });
    p.rod([jx, 0.66, -12.0], [jx, 0.66, -10.2], 0.05, '#8a8f94', 4);
    bulker(k, X(8.0), -9.9, 4.0, { dir: -1, hull: '#7b2a28', free: 0.4 });
    tanker(k, X(0.8), -9.4, 3.8, { dir: 1, hull: '#33404e', free: 0.3 });
    tanker(k, X(-5.4), -9.6, 3.4, { dir: -1, hull: '#4a2c2c', free: 0.4 });
    dhow(k, X(-6.2), -11.4, 0.9, { dir: 1, ry: 0.08 });
    dhow(k, X(-1.6), -11.55, 0.8, { dir: -1, ry: -0.1 });
    scrub(k, rng, X(-13), X(13), -13, -19, 10);
  },
  rows: 0,
  quiet: true,
  flag: { dx: -1.4, z: -12.6 },
};

// ───────────────────────────── the austral ports ─────────────────────────────

/** A gum tree: a tall pale trunk, a few ragged blobs of grey-green leaf. */
function eucalypt(k: PortKit, x: number, z: number, s: number, rng: Rng, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  const lean = rng.range(-0.04, 0.04) * s;
  const h = rng.range(0.4, 0.55) * s;
  p.rod([x, y, z], [x + lean, y + h, z], 0.014 * s, '#d4cdb9', 4);
  const greens = ['#7d9a76', '#8aa683', '#6f8f6a', '#94ad84'];
  p.blob(x + lean, y + h, z, 0.1 * s, pick(rng, greens), { sy: 0.55 });
  p.blob(x + lean + 0.09 * s, y + h * 0.82, z + 0.02, 0.07 * s, pick(rng, greens), { sy: 0.6 });
  p.blob(x + lean - 0.08 * s, y + h * 0.9, z - 0.02, 0.07 * s, pick(rng, greens), { sy: 0.6 });
}

function gums(k: PortKit, rng: Rng, x0: number, x1: number, z0: number, z1: number, n: number, s0 = 1.2, s1 = 1.8): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    const y = k.ground(x, z);
    if (y < 0.28 || k.isReserved(x, z, 0.1)) continue;
    eucalypt(k, x, z, rng.range(s0, s1), rng, y - 0.02);
  }
}

/** A Ferris wheel in the XY plane: a ring of rods, spokes, cabins round the rim, an A-frame to the ground. */
function ferrisWheel(k: PortKit, x: number, z: number, r: number, y = k.groundMax(x, z, r * 0.4, 0.3)): void {
  const p = k.solid;
  const hy = y + r + 0.22;
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    p.rod([x + Math.cos(a0) * r, hy + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, hy + Math.sin(a1) * r, z], 0.016, '#f1f3f4', 4);
    if (i % 2 === 0) {
      p.rod([x, hy, z], [x + Math.cos(a0) * r, hy + Math.sin(a0) * r, z], 0.008, '#c9d0d4', 3);
      const cx = x + Math.cos(a0) * r;
      const cy = hy + Math.sin(a0) * r;
      p.box(cx, cy - 0.09, z, 0.1, 0.1, 0.1, i % 4 === 0 ? '#e8e6df' : '#2c5da8');
    }
  }
  p.rod([x - r * 0.5, y, z - 0.02], [x, hy, z], 0.03, '#d9dde0', 4);
  p.rod([x + r * 0.5, y, z - 0.02], [x, hy, z], 0.03, '#d9dde0', 4);
  p.ball(x, hy, z, 0.06, '#c9d0d4');
  k.reserve(x, z, r + 0.1, 0.3);
}

/** The V&A Waterfront Clock Tower: a small Victorian tower in brick and cream, four clock faces, a steep green roof. */
function clockTower(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.3 * s, 0.3 * s);
  const brick = '#a4513a';
  const cream = '#f1e8d0';
  p.box(x, y - 0.12, z, 0.5 * s, 0.12 + 0.7 * s, 0.5 * s, brick);
  for (const t of [0.22, 0.46]) rect(p, onZ(x, z + 0.25 * s + 0.004), -0.07 * s, y + t * s, 0.07 * s, y + (t + 0.16) * s, '#3a2f2a');
  p.box(x, y + 0.7 * s, z, 0.56 * s, 0.05 * s, 0.56 * s, cream, { ao: 0 });
  p.box(x, y + 0.75 * s, z, 0.42 * s, 0.5 * s, 0.42 * s, cream);
  fan(p, (u, v) => [x + u * s, y + 0.97 * s + v * s, z + 0.21 * s + 0.004], Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * Math.PI * 2) * 0.13, Math.sin((i / 10) * Math.PI * 2) * 0.13] as [number, number]), '#2f3a44');
  fan(p, (u, v) => [x + 0.21 * s + 0.004, y + 0.97 * s + v * s, z - u * s], Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * Math.PI * 2) * 0.13, Math.sin((i / 10) * Math.PI * 2) * 0.13] as [number, number]), '#2f3a44', [1, 0, 0]);
  p.pyramid(x, y + 1.25 * s, z, 0.5 * s, 0.6 * s, 0.5 * s, '#4f7f6e');
  p.cyl(x, y + 1.85 * s, z, 0.012, 0.008, 0.14 * s, '#d9a82c', { seg: 4 });
  k.reserve(x, z, 0.4 * s, 0.4 * s);
}

/** A long Victorian shed: red brick, a gabled slate roof, tall arched windows. */
function victorian(k: PortKit, x: number, z: number, w: number, d: number, h: number, brick: Col = '#a4513a', roof: Col = '#5d6670'): void {
  const p = k.solid;
  const y = k.groundMax(x, z, w / 2, d / 2);
  p.boxV(x, y - 0.1, z, w, h + 0.1, d, brick);
  p.prism(x, y + h, z, w + 0.04, 0.22, d + 0.04, roof, { ry: 0 });
  const n = Math.max(2, Math.floor(w / 0.34));
  for (let i = 0; i < n; i++) arch(p, onZ(x, z + d / 2 + 0.004), -w / 2 + (i + 0.5) * (w / n), y + 0.06, 0.13, h * 0.7, '#2f3a44');
  p.box(x, y + h * 0.02, z + d / 2 + 0.006, w, 0.04, 0.01, '#f1e8d0', { ao: 0 });
  k.reserve(x, z, w / 2, d / 2);
}

/** Bo-Kaap: a slope of small flat-roofed houses in every bright colour. */
const BOKAAP_STYLE: HouseStyle = {
  walls: ['#e8527a', '#f2c230', '#3fa7a0', '#7ab648', '#5b8fd6', '#f08a3c', '#b87bd0', '#f4f0e4'],
  roofs: ['#6b5a50'],
  trim: '#f6f3ea',
  win: '#2f3d4d',
  floors: [1, 2],
  floorH: 0.19,
  w: [0.3, 0.44],
  d: [0.3, 0.4],
  roofKinds: [['flat', 3], ['mono', 1]],
  pitch: 0.3,
  chimney: 0,
  gap: [0, 0.03],
  door: '#f6f3ea',
};

const TABLE_ROCK = ['#7f9a62', '#8c9b69', '#8d8272', '#7f7466', '#968b78', '#8a8070'];

// ───────────────────────────── Cape Town ─────────────────────────────

const capetown: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#a3b46c', land2: '#98ac66', hill: '#86a05c', rock: '#a39680', sand: '#ecdcae', haze: '#d6e6ec' };
    k.shape = { ...k.shape, relief: 0.4, range: 1.2, rise: 9, rough: 0.3, freq: 0.08 };
    k.shore = 'quay';
    k.plateau(mid(k, -14), -14.6, 15, 3.4, LAND_Y, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // Table Mountain: the flat top, the cliff face, the green apron below; Lion's Head and Signal Hill on its left, Devil's Peak on its right
    const tz = -16.5;
    const tx = X(1.4);
    const ty = k.ground(tx, tz);
    const th = 2.7;
    massif(k, { x: tx, z: tz, rx: 6.6, rz: 2.4, h: th, kind: 'mesa', n: 30, jag: 0.35, sq: 3.2, seed: 5, cols: TABLE_ROCK, topCol: '#a8a888' });
    massif(k, { x: X(-6.2), z: -16.0, rx: 2.5, rz: 2.0, h: 2.8, kind: 'dome', n: 14, jag: 0.25, seed: 8, cols: ['#86a05c', '#8c9b69', '#a39680', '#978c77', '#8f8470'], reserve: false });
    massif(k, { x: X(-10.6), z: -16.4, rx: 3.6, rz: 1.8, h: 1.5, kind: 'dome', n: 12, jag: 0.2, seed: 9, cols: ['#86a05c', '#8c9b69', '#9aa070'], reserve: false });
    massif(k, { x: X(8.4), z: -16.2, rx: 2.8, rz: 2.2, h: 3.7, kind: 'cone', n: 9, jag: 0.6, seed: 12, cols: ['#86a05c', '#8c9b69', '#a39680', '#8f8470', '#978c77'], lean: [-0.2, 0], reserve: false });
    massif(k, { x: X(12.4), z: -16.6, rx: 3.0, rz: 2.2, h: 2.0, kind: 'dome', n: 10, jag: 0.3, seed: 14, cols: ['#86a05c', '#8c9b69', '#a39680'], reserve: false });
    // the long blue ranges beyond, for depth in the wide views
    for (let dx = -16; dx <= 16; dx += 6.5) massif(k, { x: X(dx), z: -29 - rng.range(0, 3), rx: 5.5, rz: 3, h: rng.range(3.2, 4.6), kind: rng.chance(0.5) ? 'mesa' : 'dome', n: 12, jag: 0.4, seed: Math.floor(dx * 3 + 50), cols: ['#8fa07a', '#8a9a80', '#9aa08a', '#a2a692'], reserve: false });
    // the tablecloth: a white cloud spilling over the table's edge
    const cy = ty + th + 0.06;
    for (let i = 0; i < 9; i++) {
      const dx = -3.8 + i * 0.95 + rng.range(-0.15, 0.15);
      p.blob(X(1.4 + dx), cy + 0.1, tz + 1.1 + rng.range(-0.3, 0.2), rng.range(0.5, 0.8), '#f6f8f8', { sy: 0.34, ry: rng.next() * 3 });
    }
    for (let i = 0; i < 3; i++) p.blob(X(4.6 + i * 0.8), cy - 0.2 - i * 0.18, tz + 2.0 + i * 0.1, 0.5 - i * 0.08, '#eef3f4', { sy: 0.7 });
    // the city bowl at the foot of the mountain: towers of the Foreshore, behind the harbour
    const sk: Array<[number, number, number, number, number, Col, Col, ('flat' | 'spire' | 'crown')?]> = [
      [-3.4, -14.9, 0.6, 0.6, 1.3, '#e6e0d0', '#4a6a86'],
      [-1.6, -15.5, 0.7, 0.6, 1.8, '#cfd8de', '#3f5f78'],
      [0.2, -15.0, 0.6, 0.6, 1.2, '#eae4d4', '#4a6a86'],
      [1.8, -15.5, 0.7, 0.6, 1.9, '#b8c8d2', '#35546e', 'crown'],
      [4.2, -14.9, 0.6, 0.6, 1.4, '#e6e0d0', '#4a6a86'],
      [5.8, -15.5, 0.7, 0.6, 1.6, '#cfd8de', '#3f5f78'],
      [7.0, -14.9, 0.6, 0.6, 1.1, '#eae4d4', '#4a6a86'],
    ];
    for (const [dx, z, w, d, h, wall, glass, top] of sk) skyscraper(k, X(dx), z, w, d, h, wall, { glass, top });
    // Bo-Kaap: bright houses on the slope under Signal Hill
    town(k, BOKAAP_STYLE, 2, -13.45, { x0: lo(-13.5, -7.6), x1: hi(-13.5, -7.6), rowStep: 0.55, gaps: 0.04, minY: 0.3 });
    town(k, REGIONS.austral!.houses, 2, -14.5, { x0: lo(7.4, 14), x1: hi(7.4, 14), rowStep: 0.6, gaps: 0.12 });
    // the V&A Waterfront: Victorian sheds, the Clock Tower, the wheel
    clockTower(k, X(2.8), -13.0, 1.15);
    victorian(k, X(0.2), -13.7, 2.6, 0.55, 0.5);
    victorian(k, X(5.8), -13.6, 2.4, 0.55, 0.45, '#b8845a');
    ferrisWheel(k, X(-2.8), -13.9, 0.98);
    victorian(k, X(-5.8), -13.4, 2.0, 0.5, 0.42, '#c9b48a');
    // container cranes of the port at the far right, a ship at the quay
    craneRow(k, lo(9.4, 12.6), hi(9.4, 12.6), 3, { s: 1.0, colors: ['#d9622b', '#2c5da8'] });
    containerShip(k, X(11.0), -10.6, 4.6, rng, { dir: -1, hull: '#26364f' });
    // yachts in the basin, a tug
    for (let i = 0; i < 4; i++) boat(k, X(-4 + i * 1.3), -11.0 - (i % 2) * 0.5, 'sail', rng, rng.range(-0.1, 0.1), ['#c8302a', '#2c5da8', '#f6f3ea', '#e9a31a'][i]);
    tug(k, X(6.6), -11.2, 1, '#2f8f5b');
    gums(k, rng, lo(-12, 12), hi(-12, 12), -12.9, -14.4, 14);
    palms(k, rng, lo(-2, 7), hi(-2, 7), -12.7, 6, 1.1, 1.4, 0.2);
  },
  rows: 0,
  quiet: true,
  flag: { dx: -8.4, z: -12.7 },
};

// ───────────────────────────── Durban ─────────────────────────────

/** Moses Mabhida Stadium: a white oval bowl under a cable-net roof, with the great arch across it. */
function mabhida(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 2.2 * s, 1.6 * s) - 0.02;
  const bowl: Array<[number, number]> = [[1.0, -0.3], [1.0, 0.0], [1.05, 0.5], [0.95, 0.78], [0.84, 0.9], [0.5, 0.86]];
  p.add(new THREE.LatheGeometry(bowl.map(([r, h]) => new THREE.Vector2(r, h)), 18), '#ece8dd', [x, y, z], [2.15 * s, s, 1.55 * s]);
  // the pitch, deep in the bowl
  p.add(new THREE.CylinderGeometry(1, 1, 0.02, 18), '#4f8a4a', [x, y + 0.62 * s, z], [1.45 * s, 1, 1.0 * s]);
  // the arch: two chords with a lattice between, springing from the rim at either end and rising over the bowl
  const n = 22;
  const R = 2.35 * s;
  const H = 3.0 * s;
  const pt = (t: number, off: number): V3 => {
    const u = t * 2 - 1;
    return [x + u * R, y + 0.2 * s + (H + off) * Math.pow(1 - u * u, 0.8) + (off < 0 ? 0 : 0), z + 0.02];
  };
  for (let i = 0; i < n; i++) {
    const a = pt(i / n, 0);
    const b = pt((i + 1) / n, 0);
    p.rod(a, b, 0.045 * s, '#f6f6f2', 5);
    const c = pt(i / n, -0.22 * s);
    const d = pt((i + 1) / n, -0.22 * s);
    p.rod(c, d, 0.035 * s, '#e3e6e8', 4);
    p.rod(a, c, 0.02 * s, '#eceff0', 3);
    p.rod(c, pt((i + 1) / n, 0), 0.015 * s, '#eceff0', 3);
  }
  // the cable roof: stays from the arch to the rim of the bowl on both sides
  for (let i = 1; i < 9; i++) {
    const t = 0.12 + i * 0.095;
    const top = pt(t, -0.1 * s);
    const u = t * 2 - 1;
    for (const side of [-1, 1]) p.rod(top, [x + u * R * 0.85, y + 0.86 * s, z + side * 1.2 * s], 0.008, '#dfe3e6', 3);
  }
  // the second leg: the arch is a Y at one end
  p.rod(pt(0.04, 0), [x - R * 1.14, y, z + 0.5 * s], 0.05 * s, '#f6f6f2', 5);
  p.box(x - R * 0.99, y - 0.1, z, 0.2 * s, 0.3 * s, 0.2 * s, '#d9d4c7');
  p.box(x + R * 0.99, y - 0.1, z, 0.2 * s, 0.3 * s, 0.2 * s, '#d9d4c7');
  k.reserve(x, z, 2.5 * s, 1.8 * s);
}

const durban: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8fb066', land2: '#82a85e', hill: '#6f9a52', rock: '#b4693f', sand: '#f1e2b0', haze: '#d4e8ec' };
    k.shape = { ...k.shape, relief: 0.9, range: 2.2, rise: 6, rough: 0.35, freq: 0.08 };
    k.shore = 'beach';
    k.plateau(mid(k, -14), -14.4, 14, 3.4, LAND_Y + 0.02, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // the green ridge of the Berea behind the city
    const pk = new Rng(k.seed ^ 0x77);
    for (let dx = -16; dx <= 16; dx += pk.range(4, 5.6)) {
      massif(k, { x: X(dx), z: -21 - pk.range(0, 2.4), rx: pk.range(4.2, 5.8), rz: 2.6, h: pk.range(1.8, 3.0), kind: 'dome', n: 10, jag: 0.2, seed: Math.floor(pk.next() * 90), cols: ['#8fb066', '#7fa85c', '#6f9a52', '#628848'], reserve: false });
    }
    // the stadium and its arch, at the right of centre
    mabhida(k, X(3.4), -14.2, 1.0);
    // the Golden Mile: beachfront hotels in a long row to the left
    const hotels: Array<[number, number, number, number, Col, Col]> = [
      [-12.4, 0.8, 0.6, 2.2, '#f1ece0', '#4a6a86'],
      [-11.0, 0.9, 0.7, 3.3, '#e4dccb', '#3f5f78'],
      [-9.6, 0.8, 0.6, 2.6, '#f4efe4', '#4a6a86'],
      [-8.2, 0.9, 0.7, 3.6, '#e8e0cc', '#35546e'],
      [-6.8, 0.8, 0.6, 2.4, '#f1ece0', '#4a6a86'],
      [-5.4, 0.9, 0.7, 3.0, '#d8e0e4', '#3f5f78'],
      [-4.0, 0.8, 0.6, 2.0, '#f4efe4', '#4a6a86'],
      [-2.6, 0.9, 0.7, 2.6, '#e8e0cc', '#35546e'],
    ];
    for (const [dx, w, d, h, wall, glass] of hotels) skyscraper(k, X(dx), -13.5 - (h > 3 ? 0.4 : 0), w, d, h, wall, { glass, strips: 3 });
    town(k, REGIONS.austral!.houses, 2, -15.3, { x0: lo(-14, -1.6), x1: hi(-14, -1.6), rowStep: 0.6, gaps: 0.2, rowRise: 0.3 });
    // the harbour on the right: orange cranes, a ship
    quayWall(k, lo(7.4, 15), hi(7.4, 15));
    craneRow(k, lo(8.6, 12.2), hi(8.6, 12.2), 3, { s: 1.05, colors: ['#e0752a', '#2c5da8'] });
    containerShip(k, X(10.4), -11.15, 5.0, rng, { dir: -1, hull: '#7b2a28', free: 0.42 });
    // beach, palms, gums
    palms(k, rng, lo(-13, 2), hi(-13, 2), -12.6, 14, 1.2, 1.7, 0.4);
    gums(k, rng, lo(-12, 12), hi(-12, 12), -15, -18, 10);
    // surfers' skiffs and a tug
    tug(k, X(4.6), -11.0, 1, '#e0752a');
    boat(k, X(-3.0), -11.4, 'sail', rng, 0.1, '#2c5da8');
    boat(k, X(-8.0), -11.2, 'sail', rng, -0.1, '#c8302a');
  },
  rows: 0,
  quiet: true,
  flag: { dx: 6.0, z: -12.6 },
};

// ───────────────────────────── Sydney ─────────────────────────────

/**
 * One sail of the Opera House in profile: a leaning curved fin, apex at the left, a concave right edge, extruded `d` deep.
 * Foot on y, `L` long and `h` tall.
 */
function sail(k: PortKit, x: number, y: number, z: number, L: number, h: number, d: number, c: Col): void {
  const pts: Array<[number, number]> = [
    [0, 0], [0.012 * L, 0.38 * h], [0.05 * L, 0.7 * h], [0.12 * L, 0.92 * h], [0.2 * L, h],
    [0.34 * L, 0.74 * h], [0.5 * L, 0.5 * h], [0.7 * L, 0.27 * h], [0.88 * L, 0.1 * h], [L, 0],
  ];
  k.solid.extrude(pts, d, x, y, z, c, { ao: 0.04 });
}

/** The Opera House: stepped sandstone podium, three groups of white shells rising toward the back, glass foyers, a restaurant shell. */
function opera(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 3 * s, 1.4 * s);
  const stone = '#dccbA6';
  // the podium and its great steps
  p.box(x, y - 0.4, z, 6.7 * s, 0.4 + 0.42 * s, 2.7 * s, stone);
  p.box(x, y + 0.42 * s, z + 0.3 * s, 6.3 * s, 0.1 * s, 2.0 * s, '#e6d8b6', { ao: 0 });
  for (let i = 0; i < 3; i++) p.box(x - 0.8 * s, y + 0.1 * s * i, z + (1.35 + 0.18 * (2 - i)) * s, 3.4 * s, 0.14 * s, 0.2 * s, '#e8dcc0', { ao: 0.05 });
  const cream = ['#f8f5ec', '#efe9d9', '#f4f0e4', '#e9e3d1'];
  const g = k.glass;
  // the Concert Hall shells, tallest at the back
  const A: Array<[number, number, number]> = [[3.0, 2.7, -0.75], [2.55, 2.4, -0.28], [2.1, 2.1, 0.2], [1.6, 1.8, 0.62]];
  A.forEach(([h, L, dz], i) => sail(k, x - 3.0 * s + i * 0.12 * s, y + 0.5 * s, z + dz * s, L * s, h * s, 0.42 * s, cream[i % 4]));
  // the Joan Sutherland Theatre shells
  const B: Array<[number, number, number]> = [[2.55, 2.4, -0.7], [2.1, 2.1, -0.25], [1.6, 1.8, 0.2]];
  B.forEach(([h, L, dz], i) => sail(k, x - 0.5 * s + i * 0.12 * s, y + 0.5 * s, z + dz * s, L * s, h * s, 0.42 * s, cream[(i + 1) % 4]));
  // the Bennelong shells, small and low at the right front
  sail(k, x + 2.0 * s, y + 0.5 * s, z + 0.55 * s, 1.35 * s, 1.0 * s, 0.4 * s, cream[2]);
  sail(k, x + 2.25 * s, y + 0.5 * s, z + 0.2 * s, 1.1 * s, 0.78 * s, 0.4 * s, cream[0]);
  // glass foyers under the shells
  g.box(x - 2.0 * s, y + 0.5 * s, z + 0.95 * s, 3.2 * s, 0.42 * s, 0.08 * s, '#5d8fa6', { ao: 0 });
  g.box(x + 0.9 * s, y + 0.5 * s, z + 0.65 * s, 2.2 * s, 0.4 * s, 0.08 * s, '#5d8fa6', { ao: 0 });
  p.box(x - 2.0 * s, y + 0.92 * s, z + 0.93 * s, 3.3 * s, 0.03 * s, 0.1 * s, '#f1ede0', { ao: 0 });
  k.reserve(x, z, 3.5 * s, 1.5 * s);
}

/** The Harbour Bridge: a steel through-arch with a lattice of hangers, stone pylons at both ends, approach spans on piers. */
function harbourBridge(k: PortKit, xa: number, xb: number, z: number, o: { crown: number; deck: number; spring: number }): void {
  const p = k.solid;
  const steel = '#69737d';
  const steel2 = '#8d969e';
  const L = xb - xa;
  const arcA = xa + L * 0.16;
  const arcB = xb - L * 0.16;
  const top = (t: number): number => o.spring + (o.crown - o.spring) * (1 - Math.pow(2 * t - 1, 2));
  const dep = (t: number): number => 0.16 + 0.32 * Math.pow(2 * t - 1, 2);
  const n = 18;
  const zz = [z - 0.26, z + 0.26];
  for (const zl of zz) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const x0 = lerp(arcA, arcB, t0);
      const x1 = lerp(arcA, arcB, t1);
      p.rod([x0, top(t0), zl], [x1, top(t1), zl], 0.034, steel, 4);
      p.rod([x0, top(t0) - dep(t0), zl], [x1, top(t1) - dep(t1), zl], 0.028, steel, 4);
      p.rod([x0, top(t0) - dep(t0), zl], [x1, top(t1), zl], 0.012, steel2, 3);
      // the hangers down to the deck, where the arch is above it
      if (top(t0) - dep(t0) > o.deck + 0.1) p.rod([x0, top(t0) - dep(t0), zl], [x0, o.deck, zl], 0.012, steel2, 3);
    }
  }
  // the deck: through the arch and out over the approaches
  p.box((xa + xb) / 2, o.deck - 0.1, z, L, 0.1, 0.62, '#8f979e');
  p.box((xa + xb) / 2, o.deck, z - 0.3, L, 0.04, 0.025, '#c9d0d4', { ao: 0 });
  p.box((xa + xb) / 2, o.deck, z + 0.3, L, 0.04, 0.025, '#c9d0d4', { ao: 0 });
  // the pylons at both ends: four granite towers
  for (const px of [arcA - 0.28, arcB + 0.28]) {
    for (const zl of [z - 0.3, z + 0.3]) {
      const ground = k.ground(px, zl);
      p.box(px, ground - 0.3, zl, 0.46, o.deck + 0.9 - ground + 0.3, 0.42, '#c3b497');
      p.box(px, o.deck + 0.9, zl, 0.54, 0.06, 0.5, '#b3a47f', { ao: 0 });
      p.pyramid(px, o.deck + 0.96, zl, 0.4, 0.18, 0.36, '#a89972');
    }
  }
  // the approach spans stand on piers
  for (let x = xa + 0.25; x < xb; x += 0.8) {
    if (x > arcA - 0.5 && x < arcB + 0.5) continue;
    p.box(x, -0.9, z, 0.14, 0.9 + o.deck - 0.1, 0.5, '#b9b5ab');
  }
  // the arch bearings
  for (const px of [arcA, arcB]) p.box(px, k.ground(px, z) - 0.2, z, 0.3, 0.2 + o.spring - 0.1, 0.62, '#b3a47f');
  k.reserve((xa + xb) / 2, z, L / 2, 0.5);
}

const sydney: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9cb46a', land2: '#8fab63', hill: '#7c9c58', rock: '#c8a878', sand: '#f0e0b0', haze: '#d4e6ee' };
    k.shape = { ...k.shape, relief: 0.8, range: 2.0, rise: 6, rough: 0.35, freq: 0.08 };
    k.shore = 'rock';
    const m = k.mole.dir;
    const cx = mid(k, -14);
    // the harbour runs straight back between its banks: the bridge crosses it
    canal(k, cx + m * 5.6, 2.5, -44);
    k.plateau(cx - m * 2.6, -14.0, 7.2, 2.8, LAND_Y + 0.06, 0.35);
    k.plateau(cx + m * 10.0, -15.0, 6, 5.0, LAND_Y + 0.1, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14);
    const X = (dx: number): number => cx + m * dx;
    const lo = (a: number, b: number): number => Math.min(X(a), X(b));
    const hi = (a: number, b: number): number => Math.max(X(a), X(b));
    // the Opera House on Bennelong Point
    opera(k, X(-1.7), -13.3, 0.9);
    // the bridge across the harbour behind it
    harbourBridge(k, lo(1.0, 10.8), hi(1.0, 10.8), -17.2, { crown: 3.1, deck: 1.2, spring: 0.75 });
    // the city: towers of the CBD and the tower with its golden turret
    const sk: Array<[number, number, number, number, number, Col, Col, ('flat' | 'spire' | 'crown')?]> = [
      [-8.2, -16.0, 0.8, 0.7, 2.2, '#d6dfe4', '#4a6a86'],
      [-6.8, -17.2, 0.8, 0.8, 3.2, '#cfd8de', '#3f5f78', 'crown'],
      [-5.4, -16.2, 0.7, 0.7, 2.4, '#e6e0d0', '#35546e'],
      [-4.2, -18.2, 0.9, 0.8, 3.0, '#b8c8d2', '#35546e'],
      [-9.6, -17.4, 0.8, 0.7, 2.6, '#e6e0d0', '#4a6a86'],
      [-3.0, -17.0, 0.7, 0.7, 1.9, '#eae4d4', '#4a6a86'],
    ];
    for (const [dx, z, w, d, h, wall, glass, top] of sk) skyscraper(k, X(dx), z, w, d, h, wall, { glass, top });
    // Sydney Tower: a slim shaft with a golden turret
    const tx = X(-5.6);
    const ty = k.ground(tx, -19.4);
    p.cyl(tx, ty - 0.05, -19.4, 0.07, 0.04, 3.2, '#d8d4c8', { seg: 6 });
    p.cyl(tx, ty + 2.9, -19.4, 0.26, 0.2, 0.2, '#e4b43c', { seg: 10 });
    p.cone(tx, ty + 3.1, -19.4, 0.2, 0.2, '#c99a2c', { seg: 10 });
    p.cyl(tx, ty + 3.3, -19.4, 0.012, 0.008, 0.5, '#8a8f94', { seg: 4 });
    k.reserve(tx, -19.4, 0.4, 0.4);
    // the Rocks and the north shore: sandstone houses with terracotta roofs
    const au = REGIONS.austral!.houses;
    town(k, au, 2, -15.6, { x0: lo(0.4, 2.7), x1: hi(0.4, 2.7), rowStep: 0.55, gaps: 0.1 });
    town(k, au, 3, -14.8, { x0: lo(8.8, 16), x1: hi(8.8, 16), rowStep: 0.6, gaps: 0.1, rowRise: 0.2 });
    town(k, au, 2, -15.0, { x0: lo(-16, -10), x1: hi(-16, -10), rowStep: 0.6, gaps: 0.15 });
    // ferries, yachts, a tug
    boat(k, X(5.2), -11.2, 'ferry', rng, 0.12, '#2f7d52');
    boat(k, X(7.6), -14.6, 'ferry', rng, Math.PI / 2 - 0.1, '#2f7d52');
    boat(k, X(3.6), -12.4, 'sail', rng, 0.2, '#f6f3ea');
    boat(k, X(8.2), -10.6, 'sail', rng, -0.15, '#c8302a');
    tug(k, X(-6.6), -11.2, 1, '#2c5da8');
    gums(k, rng, lo(-13, 13), hi(-13, 13), -13.1, -16.5, 20);
    palms(k, rng, lo(-12, -9), hi(-12, -9), -13.0, 3, 1.1, 1.4, 0.2);
  },
  rows: 0,
  quiet: true,
  flag: { dx: 2.3, z: -12.6 },
};

// @@ports2

// @@ports

export const LANDMARKS: Record<string, Landmark> = { fujairah, portsaid, suez, jeddah, djibouti, khorfakkan, jebelali, salalah, sohar, capetown, durban, sydney };

export const PORTS: Array<[string, RegionId, string?]> = [['Fujairah', 'gulf', 'fujairah'], ['Port Said', 'gulf', 'portsaid'], ['Suez', 'gulf', 'suez'], ['Jeddah', 'gulf', 'jeddah'], ['Djibouti', 'gulf', 'djibouti'], ['Khor Fakkan', 'gulf', 'khorfakkan'], ['Jebel Ali', 'gulf', 'jebelali'], ['Salalah', 'gulf', 'salalah'], ['Sohar', 'gulf', 'sohar'], ['Cape Town', 'austral', 'capetown'], ['Durban', 'austral', 'durban'], ['Sydney', 'austral', 'sydney']];
