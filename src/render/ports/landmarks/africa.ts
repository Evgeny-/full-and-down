import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { LAND_Y, SHORE_Z, lerp, noise2, smooth, type Col, type Part, type PortKit, type TerrainPalette, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { tint, tree } from '../town';
import { tower } from '../structures';
import { containerStack, gantryCrane } from '../props';
import { lighthouse } from '../harbour';

/**
 * North and West Africa. North (afN) is sand, ochre and white-wash; the west coast (afW) is humid green with laterite
 * red, and colourful. Landmarks: Casablanca (Hassan II Mosque), Dakar (African Renaissance Monument), Lagos
 * (Lekki-Ikoyi bridge), Abidjan (Plateau), Banjul (Arch 22), Lome, Tema (Black Star arch), Agadir (kasbah), Tanger Med,
 * Tangier (medina), Nouakchott, Freetown.
 */

// ───────────────────────────── shared helpers ─────────────────────────────

const rngOf = (k: PortKit): Rng => new Rng(k.seed ^ 12345);

/** x of the view centre at depth z, nudged away from the breakwater head (the head stands on the -dir side) so the lighthouse and flag keep clear. */
const mid = (k: PortKit, z: number, dx = 0): number => k.vx(z) + k.mole.dir * 0.8 + dx;

/** Humid green coast with red laterite rock (afW). */
function greenCoast(k: PortKit, o: Partial<TerrainPalette> = {}): void {
  k.palette = { ...k.palette, land: '#86a95a', land2: '#7aa352', hill: '#5f9448', rock: '#b4693f', sand: '#efdca8', haze: '#d6ebe3', ...o };
}

/** Sand, ochre and pale haze (afN). */
function aridCoast(k: PortKit, o: Partial<TerrainPalette> = {}): void {
  k.palette = { ...k.palette, land: '#dcc48f', land2: '#d3b982', hill: '#c9aa74', rock: '#b58f63', sand: '#f0e0b2', haze: '#eae6d8', ...o };
}

/** A 2D face mapping: (u right, v up) to world. onZ faces +z, onX faces +x (u runs toward -z). */
type Map2 = (u: number, v: number) => V3;
const onZ = (x: number, z: number): Map2 => (u, v) => [x + u, v, z];
const onX = (x: number, z: number): Map2 => (u, v) => [x, v, z - u];

/** A convex polygon (counter-clockwise on the face) as a triangle fan. */
function fan(p: Part, m: Map2, pts: Array<[number, number]>, c: Col): void {
  for (let i = 1; i < pts.length - 1; i++) p.tri(m(pts[0][0], pts[0][1]), m(pts[i][0], pts[i][1]), m(pts[i + 1][0], pts[i + 1][1]), c);
}

function archPts(w: number, h: number, kind: 'round' | 'point'): Array<[number, number]> {
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
function arch(p: Part, m: Map2, u: number, v: number, w: number, h: number, c: Col, kind: 'round' | 'point' = 'round'): void {
  fan(p, (a, b) => m(u + a, v + b), archPts(w, h, kind), c);
}

function rect(p: Part, m: Map2, u0: number, v0: number, u1: number, v1: number, c: Col): void {
  p.quad(m(u0, v0), m(u1, v0), m(u1, v1), m(u0, v1), c);
}

/** A truncated pyramid (hipped roof with a flat top): base w × d, top tw × td. */
function frustum(p: Part, x: number, y: number, z: number, w: number, d: number, tw: number, td: number, h: number, c: Col): void {
  const v: V3[] = [
    [x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2],
    [x - tw / 2, y + h, z - td / 2], [x + tw / 2, y + h, z - td / 2], [x + tw / 2, y + h, z + td / 2], [x - tw / 2, y + h, z + td / 2],
  ];
  p.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], c);
}

/** A row of palms (jittered) on dry land. */
function palms(k: PortKit, rng: Rng, x0: number, x1: number, z: number, n: number, s0: number, s1: number): void {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1)) + rng.range(-0.25, 0.25);
    const zz = z + rng.range(-0.3, 0.3);
    const y = k.ground(x, zz);
    if (y < 0.2 || k.isReserved(x, zz, 0.1)) continue;
    tree(k, 'palm', x, zz, rng.range(s0, s1), rng, y - 0.02);
  }
}

/** A painted fishing canoe (pirogue) with a raised prow, afloat at y = 0 or beached on the ground. */
function pirogue(k: PortKit, x: number, y: number, z: number, ry: number, hull: Col, stripe: Col, s = 1): void {
  const p = k.solid;
  k.at(x, y, z, ry, s, () => {
    p.box(0, -0.06, 0, 0.78, 0.1, 0.13, hull, { ao: 0.1 });
    p.box(0.4, -0.02, 0, 0.18, 0.13, 0.1, hull, { rz: -0.6, ao: 0.05 });
    p.box(-0.4, -0.04, 0, 0.12, 0.1, 0.1, hull, { rz: 0.5, ao: 0.05 });
    p.box(0, 0.035, 0, 0.8, 0.02, 0.15, stripe, { ao: 0 });
    p.box(0.04, -0.02, 0.066, 0.5, 0.045, 0.005, stripe, { ao: 0 });
    p.box(-0.08, 0.04, 0, 0.07, 0.11, 0.07, '#f4efe6');
    p.ball(-0.08, 0.17, 0, 0.035, '#5b4636');
    p.box(-0.45, 0.0, 0, 0.05, 0.1, 0.04, '#2b2f35');
  });
}

/** A star (n = 5) polygon for an extrusion, point up. */
function starPts(R: number, r: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return pts;
}

/**
 * A free-standing gate: two legs and a lintel, with an arched opening, extruded along z.
 * `half` is the half-width at the base, `open` the half-width of the opening, `apex` its height, `top` the height of the lintel.
 */
function archGate(k: PortKit, x: number, y: number, z: number, o: { half: number; open: number; apex: number; top: number; taper: number; depth: number; color: Col; kind?: 'round' | 'point' }): void {
  const pts: Array<[number, number]> = [[-o.half, 0], [-o.open, 0]];
  const n = 9;
  if (o.kind === 'point') {
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      pts.push([-o.open * (1 - Math.pow(t, 2.2)), o.apex * t]);
    }
    for (let i = n - 1; i >= 0; i--) {
      const t = i / n;
      pts.push([o.open * (1 - Math.pow(t, 2.2)), o.apex * t]);
    }
  } else {
    const spring = o.apex - o.open;
    pts.push([-o.open, spring]);
    for (let i = 1; i < n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      pts.push([o.open * Math.cos(a), spring + o.open * Math.sin(a)]);
    }
    pts.push([o.open, spring]);
  }
  pts.push([o.open, 0], [o.half, 0], [o.half - o.taper, o.top], [-(o.half - o.taper), o.top]);
  k.solid.extrude(pts, o.depth, x, y, z, o.color);
}

/**
 * A square minaret: cream shaft with arched windows, tile bands, a tiled upper stage, balcony, lantern, cap and spire.
 * Foot on y; `h` is the height of the shaft stack (the spire adds a little).
 */
function minaret(k: PortKit, x: number, y: number, z: number, h: number, w: number, o: { wall?: Col; tile?: Col; trim?: Col; cap?: Col } = {}): number {
  const p = k.solid;
  const wall = o.wall ?? '#f0e8d4';
  const tile = o.tile ?? '#3f8a62';
  const trim = o.trim ?? '#e6d7ae';
  const cap = o.cap ?? tile;
  const sh = h * 0.7;
  const dark = '#33403f';
  p.box(x, y - 0.25, z, w, sh + 0.25, w, wall);
  const fz = z + w / 2 + 0.004;
  const fx = x + w / 2 + 0.004;
  const rows = Math.max(2, Math.round(sh / 0.9));
  for (let i = 0; i < rows; i++) {
    const yy = y + sh * (0.07 + (i / rows) * 0.82);
    const ah = Math.min(sh * 0.14, w * 1.1);
    const aw = w * 0.2;
    for (const u of [-w * 0.2, w * 0.2]) {
      arch(p, onZ(x, fz), u, yy, aw, ah, dark);
      arch(p, onX(fx, z + w / 2), w / 2 + u, yy, aw, ah, dark);
    }
  }
  for (const f of [0.34, 0.62]) p.box(x, y + sh * f, z, w + 0.03, Math.max(0.05, sh * 0.04), w + 0.03, tile, { ao: 0 });
  // tiled upper stage with cream openings
  const uw = w * 0.8;
  const uh = h * 0.17;
  p.box(x, y + sh, z, uw, uh, uw, tile);
  for (const u of [-uw * 0.2, uw * 0.2]) {
    arch(p, onZ(x, z + uw / 2 + 0.004), u, y + sh + uh * 0.18, uw * 0.2, uh * 0.62, trim);
    arch(p, onX(x + uw / 2 + 0.004, z + uw / 2), uw / 2 + u, y + sh + uh * 0.18, uw * 0.2, uh * 0.62, trim);
  }
  const by = y + sh + uh;
  p.box(x, by, z, w * 1.22, 0.05, w * 1.22, wall);
  const lh = h * 0.09;
  p.box(x, by + 0.05, z, w * 0.58, lh, w * 0.58, wall);
  arch(p, onZ(x, z + w * 0.29 + 0.004), 0, by + 0.05 + lh * 0.12, w * 0.24, lh * 0.7, dark);
  arch(p, onX(x + w * 0.29 + 0.004, z + w * 0.29), w * 0.29, by + 0.05 + lh * 0.12, w * 0.24, lh * 0.7, dark);
  const ty = by + 0.05 + lh;
  p.box(x, ty, z, w * 0.7, 0.04, w * 0.7, tile);
  p.pyramid(x, ty + 0.04, z, w * 0.62, h * 0.08, w * 0.62, cap);
  p.cyl(x, ty + 0.04 + h * 0.08, z, 0.03, 0.01, h * 0.09, '#e8b923', { seg: 5, ao: 0 });
  k.glow.ball(x, ty + 0.04 + h * 0.175, z, 0.04, '#bff3ff');
  k.reserve(x, z, w * 0.8, w * 0.8);
  return ty + h * 0.17;
}

/** A rampart (battlemented wall) along x or z that follows the ground: boxes sunk to the low side, merlons on alternate bays. */
function rampart(k: PortKit, x0: number, z0: number, x1: number, z1: number, h: number, thick: number, wall: Col, merlon: Col): void {
  const p = k.solid;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.5));
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = lerp(x0, x1, t);
    const cz = lerp(z0, z1, t);
    const w = alongX ? seg : thick;
    const d = alongX ? thick : seg;
    const hi = k.groundMax(cx, cz, w / 2, d / 2);
    const lo = k.groundMin(cx, cz, w / 2, d / 2);
    p.box(cx, lo - 0.1, cz, w + 0.005, hi - lo + 0.1 + h, d + 0.005, wall);
    if (i % 2 === 0) p.box(cx, hi + h, cz, alongX ? w * 0.62 : thick * 1.08, 0.1, alongX ? thick * 1.08 : d * 0.62, merlon, { ao: 0 });
  }
  k.reserve((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + thick, Math.abs(z1 - z0) / 2 + thick);
}

/** A square tower with merlons on the corners. */
function bastion(k: PortKit, x: number, z: number, w: number, h: number, wall: Col, merlon: Col): void {
  const p = k.solid;
  const hi = k.groundMax(x, z, w / 2, w / 2);
  const lo = k.groundMin(x, z, w / 2, w / 2);
  p.box(x, lo - 0.1, z, w, hi - lo + 0.1 + h, w, wall);
  p.box(x, hi + h, z, w + 0.06, 0.05, w + 0.06, merlon, { ao: 0 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + dx * w * 0.42, hi + h + 0.05, z + dz * w * 0.42, w * 0.2, 0.1, w * 0.2, merlon, { ao: 0 });
  arch(p, onZ(x, z + w / 2 + 0.004), 0, hi + h * 0.5, w * 0.22, h * 0.34, '#3b3126');
  k.reserve(x, z, w * 0.7, w * 0.7);
}

/** Terraced houses scattered on a slope: white-wash or colour, flat or mono-pitched roofs, windows, doors. */
function hillHouses(
  k: PortKit,
  rng: Rng,
  o: { x0: number; x1: number; z0: number; z1: number; stepX?: number; stepZ?: number; skip?: number; walls: Col[]; roofs?: Col[]; trim?: Col; minY?: number; size?: number; door?: Col; win?: Col },
): void {
  const p = k.solid;
  const stepX = o.stepX ?? 0.5;
  const stepZ = o.stepZ ?? 0.42;
  const size = o.size ?? 1;
  let row = 0;
  for (let z = o.z0; z > o.z1; z -= stepZ, row++) {
    for (let x = o.x0 + (row % 2) * stepX * 0.5; x < o.x1; x += stepX) {
      if (rng.chance(o.skip ?? 0.12)) continue;
      const px = x + rng.range(-0.08, 0.08);
      const pz = z + rng.range(-0.06, 0.06);
      const w = rng.range(0.3, 0.44) * size;
      const d = rng.range(0.28, 0.38) * size;
      const hi = k.groundMax(px, pz, w / 2, d / 2);
      const lo = k.groundMin(px, pz, w / 2, d / 2);
      if (lo < (o.minY ?? 0.3) || hi - lo > 0.75) continue;
      if (k.isReserved(px, pz, 0.02)) continue;
      const fl = rng.chance(0.35) ? 2 : 1;
      const h = fl * 0.17 + 0.04;
      const wall = o.walls[Math.floor(rng.next() * o.walls.length)];
      p.box(px, lo - 0.08, pz, w, hi - lo + 0.08 + h, d, wall);
      const top = hi + h;
      if (o.roofs) {
        const roof = o.roofs[Math.floor(rng.next() * o.roofs.length)];
        p.prism(px, top, pz, w + 0.05, 0.09 * size, d + 0.05, roof, { ax: 0.5 });
      } else p.box(px, top, pz, w + 0.03, 0.03, d + 0.03, o.trim ?? '#fbf8ef');
      const win = o.win ?? '#3a4a58';
      const zf = pz + d / 2 + 0.004;
      for (let f = 0; f < fl; f++) {
        const yy = hi + 0.06 + f * 0.17;
        rect(p, onZ(px, zf), -w * 0.3 - 0.025, yy, -w * 0.3 + 0.025, yy + 0.07, win);
        rect(p, onZ(px, zf), w * 0.3 - 0.025, yy, w * 0.3 + 0.025, yy + 0.07, win);
      }
      rect(p, onZ(px, zf), -0.03, hi, 0.03, hi + 0.11, o.door ?? '#4b6a8a');
      k.reserve(px, pz, w / 2, d / 2);
    }
  }
}

// ───────────────────────────── Casablanca ─────────────────────────────

const casablanca: Landmark = {
  terrain(k) {
    aridCoast(k, { land: '#dccb9d', land2: '#d4c08e', hill: '#cdb683', haze: '#e6e8e0' });
    k.shape.relief = 0.7;
    k.shape.range = 2.2;
    k.plateau(mid(k, -13.2), -13.4, 5.6, 2.8, LAND_Y + 0.08, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const cx = mid(k, -13.2) + 0.1;
    // the terrace over the sea: a solid mass down to the sea floor, an arcade of dark arches on its face, rocks at the foot
    const zf = -11.3;
    const zb = -14.7;
    const zc = (zf + zb) / 2;
    const dz = zf - zb;
    const W = 8.6;
    const top = 0.46;
    p.box(cx, -0.9, zc, W, 0.9 + top, dz, '#d6ccb4');
    p.box(cx, top - 0.06, zc, W + 0.08, 0.08, dz + 0.08, '#e9dfc6');
    const nA = Math.round(W / 0.5);
    for (let i = 0; i < nA; i++) arch(p, onZ(cx, zf + dz * 0 + 0.004 + 0.04), -W / 2 + (i + 0.5) * (W / nA), -0.02, 0.3, 0.38, '#4b4a46');
    for (let i = 0; i < 6; i++) arch(p, onX(cx + W / 2 + 0.004, zf), 0.3 + i * 0.55, -0.02, 0.3, 0.38, '#4b4a46');
    for (let x = cx - W / 2 - 0.1; x < cx + W / 2 + 0.4; x += 0.62 + rng.range(-0.1, 0.1)) p.rock(x, -0.3, zf + 0.18, rng.range(0.2, 0.3), rng.chance(0.5) ? '#8f8a7e' : '#a29c8e', { ry: rng.next() * 6 });
    for (let z = zf - 0.3; z > zb + 0.3; z -= 0.7) p.rock(cx + W / 2 + 0.12, -0.3, z, rng.range(0.2, 0.3), '#8f8a7e', { ry: rng.next() * 6 });
    // the upper plinth
    const yb = top + 0.16;
    p.box(cx + 0.1, top, zc - 0.1, W - 1.2, 0.16, dz - 0.9, '#e7ddc5');
    // the prayer hall: cream walls, a band of green tile under the cornice, rows of arches, a green hipped roof
    const hx = cx + 0.9;
    const hz = -13.35;
    const HW = 4.4;
    const HD = 2.1;
    const HH = 1.4;
    p.box(hx, yb - 0.05, hz, HW, HH + 0.05, HD, '#f1e9d6');
    p.box(hx, yb + HH - 0.12, hz, HW + 0.1, 0.12, HD + 0.1, '#e3d7b8');
    const zfront = hz + HD / 2;
    const xside = hx + HW / 2;
    rect(p, onZ(hx, zfront + 0.004), -HW / 2, yb + HH - 0.38, HW / 2, yb + HH - 0.16, '#3f8a62');
    rect(p, onX(xside + 0.004, zfront), 0, yb + HH - 0.38, HD, yb + HH - 0.16, '#3f8a62');
    for (let i = 0; i < 7; i++) {
      const u = -HW / 2 + (i + 0.5) * (HW / 7);
      if (i === 3) continue;
      arch(p, onZ(hx, zfront + 0.004), u, yb + 0.16, 0.5, 0.98, '#dcc58c');
      arch(p, onZ(hx, zfront + 0.007), u, yb + 0.2, 0.38, 0.9, '#2f3d3c');
    }
    // the grand portal
    p.box(hx, yb, zfront - 0.02, 1.3, 1.1, 0.06, '#3f8a62', { ao: 0 });
    arch(p, onZ(hx, zfront + 0.012), 0, yb, 1.12, 1.05, '#e6d6a6');
    arch(p, onZ(hx, zfront + 0.016), 0, yb + 0.02, 0.84, 0.95, '#2a3636');
    for (let j = 0; j < 3; j++) {
      const u = (j + 0.5) * (HD / 3);
      arch(p, onX(xside + 0.004, zfront), u, yb + 0.16, 0.5, 0.98, '#dcc58c');
      arch(p, onX(xside + 0.007, zfront), u, yb + 0.2, 0.38, 0.9, '#2f3d3c');
    }
    frustum(p, hx, yb + HH, hz, HW + 0.16, HD + 0.16, HW - 1.0, HD - 0.9, 0.36, '#3f8a62');
    p.box(hx, yb + HH + 0.36, hz, HW - 1.0, 0.04, HD - 0.9, '#58a67c', { ao: 0 });
    // a low wing to the right with a small green roof
    const wx = hx + HW / 2 + 0.65;
    p.box(wx, yb - 0.05, hz + 0.1, 1.1, 0.75, HD - 0.5, '#efe5cf');
    frustum(p, wx, yb + 0.7, hz + 0.1, 1.2, HD - 0.4, 0.8, HD - 1.0, 0.22, '#3f8a62');
    for (let j = 0; j < 2; j++) arch(p, onZ(wx, hz + 0.1 + (HD - 0.5) / 2 + 0.004), -0.25 + j * 0.5, yb + 0.1, 0.28, 0.5, '#2f3d3c');
    // the minaret: the tallest in the world, at the left end of the hall
    minaret(k, hx - HW / 2 - 0.5, yb, hz + 0.1, 5.2, 0.78);
    k.reserve(cx, zc, W / 2, dz / 2);
    // a modern city behind: white towers
    const towers: Array<[number, number, number, number, number, Col]> = [
      [-5.4, -17.4, 0.8, 0.7, 2.4, '#f1ede2'],
      [-6.6, -18.4, 0.7, 0.7, 1.7, '#e3dccb'],
      [5.2, -17.8, 0.8, 0.7, 2.9, '#e9e3d4'],
      [6.5, -17.2, 0.7, 0.6, 1.9, '#f4efe4'],
    ];
    for (const [dx, z, w, d, h, c] of towers) tower(k, cx + dx, z, w, d, h, c, { win: '#42586b' });
    palms(k, rng, cx - 5.2, cx - 4.6, -14.6, 2, 1.3, 1.6);
    palms(k, rng, cx + 5.0, cx + 6.8, -14.0, 3, 1.3, 1.6);
  },
  rows: 4,
  quiet: true,
  flag: { dx: 5.6, z: -12.5 },
};

// ───────────────────────────── Dakar ─────────────────────────────

const dakar: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.9;
    k.shape.range = 3;
    const hx = mid(k, -16.2) + 0.3;
    k.bump(hx, -16.4, 5.4, 3.7, 2.6, 1.1);
    const top = k.ground(hx, -16.4);
    k.plateau(hx, -16.4, 1.9, 1.35, top - 0.1, 0.45);
    // the volcanic hillocks of the Mamelles
    k.bump(hx - 6.2, -14.4, 1.9, 1.5, 1.4);
    k.bump(hx - 4.3, -15.3, 1.6, 1.3, 1.0);
    k.paint((x, y, _z, slope, c) => {
      if (x < hx - 3 && slope > 0.2 && y > 0.6) c.lerp(new THREE.Color('#b0663f'), 0.55);
    });
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const hx = mid(k, -16.2) + 0.3;
    const hz = -16.4;
    const gy = k.groundMax(hx, hz, 1.4, 1.0);
    // the stepped base with its dark doorway
    p.box(hx, gy - 0.5, hz, 3.2, 0.5 + 0.55, 2.3, '#d2bf94');
    p.box(hx, gy + 0.55, hz, 2.5, 0.4, 1.7, '#c5b084');
    p.box(hx, gy + 0.95, hz, 2.2, 0.05, 1.45, '#d9c9a3');
    arch(p, onZ(hx, hz + 1.15 + 0.004), 0, gy - 0.05, 0.6, 0.55, '#3b3229');
    for (let i = 0; i < 5; i++) rect(p, onZ(hx, hz + 1.15 + 0.004), -1.4 + i * 0.7, gy + 0.62, -1.4 + i * 0.7 + 0.4, gy + 0.9, '#b49f72');
    // the group in green bronze: a man lifting a child, pointing out to sea; a woman behind with her arm swept forward
    const G = '#5f927c';
    const G2 = '#7bad97';
    const G3 = '#4a7a68';
    k.at(hx, gy + 1.0, hz + 0.05, 0.12, 1.12, () => {
      p.box(-0.2, 0, 0, 0.3, 1.0, 0.32, G3);
      p.box(0.2, 0, 0.05, 0.3, 1.0, 0.32, G3);
      p.box(0, 0.95, 0, 0.76, 0.62, 0.44, G);
      p.box(0, 1.5, 0, 0.94, 0.62, 0.48, G, { ao: 0 });
      p.cyl(0.03, 2.08, 0.02, 0.1, 0.09, 0.16, G, { seg: 6 });
      p.ball(0.05, 2.32, 0.04, 0.23, G2);
      p.rod([0.45, 1.97, 0.05], [1.85, 2.4, 0.62], 0.11, G, 6);
      p.ball(1.9, 2.42, 0.64, 0.13, G2);
      p.rod([-0.45, 1.97, 0.05], [-0.88, 2.25, 0.42], 0.1, G, 6);
      p.rod([-0.88, 2.25, 0.42], [-0.55, 2.55, 0.76], 0.09, G, 6);
      p.box(-0.5, 2.5, 0.7, 0.32, 0.52, 0.22, G2, { rx: -0.1 });
      p.ball(-0.44, 3.12, 0.76, 0.14, G2);
      p.rod([-0.35, 2.95, 0.76], [0.55, 3.2, 1.05], 0.065, G2, 6);
      // the woman, behind and to the left, her cloth streaming back
      p.cone(-0.85, 0, -0.85, 0.55, 1.35, G, { seg: 8 });
      p.box(-0.85, 1.25, -0.85, 0.5, 0.6, 0.34, G2, { rx: -0.12 });
      p.ball(-0.82, 2.04, -0.82, 0.19, G2);
      p.rod([-0.62, 1.75, -0.85], [0.5, 2.28, -0.3], 0.085, G2, 6);
      p.rod([-0.9, 1.95, -0.9], [-1.75, 2.55, -1.05], 0.07, G3, 5);
      p.rod([-0.9, 1.7, -0.9], [-1.7, 1.85, -1.1], 0.06, G3, 5);
    });
    k.reserve(hx, hz, 1.9, 1.4);
    // the Mamelles lighthouse on its hillock
    const lx = hx - 6.2;
    lighthouse(k, lx, k.ground(lx, -14.4) - 0.05, -14.4, { h: 1.2, r0: 0.17, r1: 0.12, bands: [['#f6f3ea', 0.7], ['#2d3138', 0.3]], cap: '#d62f2b', gallery: '#d62f2b' });
    k.reserve(lx, -14.4, 0.5, 0.5);
    // baobabs on the slopes and the plain
    for (const [dx, z, s] of [[3.6, -15.2, 2.7], [-3.0, -14.9, 2.3], [6.0, -16.8, 2.9], [-3.8, -17.8, 2.5], [1.8, -13.5, 2.2]] as Array<[number, number, number]>) {
      const x = hx + dx;
      const y = k.ground(x, z);
      if (y < 0.25 || k.isReserved(x, z, 0.3)) continue;
      tree(k, 'baobab', x, z, s, rng, y - 0.04);
      k.reserve(x, z, 0.4, 0.4);
    }
    // painted pirogues on the water
    pirogue(k, hx - 1.8, 0, -10.6, 0.2, '#d3402f', '#f4efe6');
    pirogue(k, hx + 0.6, 0, -9.7, -0.15, '#2f8f5a', '#f5c518');
    pirogue(k, hx + 3.2, 0, -10.9, 0.3, '#2c5da8', '#f08a2c');
    palms(k, rng, hx - 7.5, hx + 7.5, -13.1, 8, 1.2, 1.6);
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── Lagos ─────────────────────────────

/** A water channel from the sea straight back inland (a lagoon inlet). */
function channel(k: PortKit, cx: number, half: number, zBack = -34): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1 || z < zBack) return h;
    const d = Math.abs(x - cx);
    const bank = smooth(half + 0.9, half, d);
    const end = smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, -0.35), bank * end);
  });
}

const lagos: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.5;
    k.shape.range = 2.5;
    const cx = k.vx(-15) + 0.2;
    channel(k, cx, 2.8);
    // tidy the banks of the inlet: grass and sand instead of bare rock
    k.paint((x, y, z, _slope, c) => {
      if (z < SHORE_Z + 1 && z > -26 && Math.abs(x - cx) < 4.2) c.lerp(new THREE.Color(y < 0.12 ? '#e6d3a0' : '#86a95a'), 0.85);
    });
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    // m = +1: the pylon stands on the right bank; m = -1 mirrors everything (the breakwater head stands on the other side)
    const m = k.mole.dir;
    const cx = k.vx(-15) + 0.2;
    const X = (dx: number): number => cx + m * dx;
    const z = -14.7;
    const deck = 0.95;
    const half = 0.17;
    const px = X(3.4);
    const xL = Math.min(X(-7.6), X(7.2));
    const xR = Math.max(X(-7.6), X(7.2));
    // the Lekki-Ikoyi bridge: one white curved pylon with a fan of stays over a deck on piers
    p.box((xL + xR) / 2, deck - 0.09, z, xR - xL, 0.09, half * 2, '#a5a9ad');
    p.box((xL + xR) / 2, deck, z - half + 0.01, xR - xL, 0.05, 0.025, '#f4f4f0', { ao: 0 });
    p.box((xL + xR) / 2, deck, z + half - 0.01, xR - xL, 0.05, 0.025, '#f4f4f0', { ao: 0 });
    for (let dx = -6.9; dx < 6.9; dx += 1.4) {
      if (dx > -2.6 && dx < 2.8) continue;
      p.box(X(dx), -0.9, z, 0.2, 0.9 + deck - 0.09, 0.3, '#b9b5ab');
    }
    p.box(px, -0.9, z, 0.62, 0.9 + deck, 0.5, '#dcd8cd');
    const H = 4.3;
    const lean = -0.6 * m;
    const pos = (t: number): [number, number] => [px + lean * t * t, deck + H * t];
    const legZ = (t: number): number => 0.16 * (1 - 0.86 * t);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const [xa, ya] = pos(i / n);
      const [xb, yb] = pos((i + 1) / n);
      for (const s of [-1, 1]) p.rod([xa, ya, z + s * legZ(i / n)], [xb, yb, z + s * legZ((i + 1) / n)], 0.06 - i * 0.003, '#f6f6f2', 6);
    }
    for (const t of [0.3, 0.6]) {
      const [x, y] = pos(t);
      p.box(x, y, z, 0.1, 0.07, legZ(t) * 2, '#f6f6f2', { ao: 0 });
    }
    const cable = '#e8ecef';
    for (let i = 0; i < 10; i++) {
      const t = 0.4 + i * 0.058;
      const [tx, ty] = pos(t);
      const ax = px - m * (0.55 + i * 0.58);
      for (const s of [-1, 1]) p.rod([tx, ty, z + s * legZ(t) * 0.5], [ax, deck, z + s * (half - 0.02)], 0.015, cable, 3);
    }
    for (let i = 0; i < 7; i++) {
      const t = 0.5 + i * 0.07;
      const [tx, ty] = pos(t);
      const ax = px + m * (0.6 + i * 0.42);
      for (const s of [-1, 1]) p.rod([tx, ty, z + s * legZ(t) * 0.5], [ax, deck, z + s * (half - 0.02)], 0.015, cable, 3);
    }
    k.reserve(cx, z, 7.5, 0.5);
    // Victoria Island's skyline on the far bank, a few blocks on the pylon's bank
    const sky: Array<[number, number, number, number, number, Col, boolean]> = [
      [-4.6, -16.0, 0.8, 0.7, 3.2, '#aebfcc', true],
      [-5.7, -15.4, 0.7, 0.6, 2.0, '#e6dfcc', false],
      [-6.6, -17.0, 0.9, 0.7, 4.3, '#8fa7b9', true],
      [-7.5, -15.9, 0.7, 0.7, 2.4, '#ead7af', false],
      [-3.9, -18.2, 0.8, 0.7, 3.9, '#d7d3c6', false],
      [-5.5, -18.7, 0.9, 0.8, 5.0, '#9fb4c2', true],
      [-7.2, -18.2, 0.8, 0.7, 3.0, '#c4d0d8', true],
      [4.9, -16.0, 0.8, 0.7, 2.2, '#f0e8d6', false],
      [6.1, -16.6, 0.8, 0.7, 2.9, '#9fb4c2', true],
      [7.2, -15.8, 0.8, 0.6, 1.7, '#e3b88f', false],
    ];
    for (const [dx, zz, w, d, h, c, glass] of sky) {
      const top = tower(k, X(dx), zz, w, d, h, c, { win: glass ? '#2f4c63' : '#4a6376', glass: false, rows: Math.round(h / 0.15), cols: 3, band: glass ? '#e8eef2' : undefined });
      if (h > 3) {
        p.box(X(dx), top, zz, w * 0.5, 0.2, d * 0.5, '#cdd5da');
        p.cyl(X(dx), top + 0.2, zz, 0.012, 0.008, 0.45, '#8a9096', { seg: 4 });
      }
    }
    // the container cranes of Apapa and their stacks
    gantryCrane(k, X(-7.8), SHORE_Z - 0.55, { color: '#d9622b', s: 0.95 });
    gantryCrane(k, X(-6.3), SHORE_Z - 0.55, { color: '#2c5da8', s: 0.95 });
    gantryCrane(k, X(-4.8), SHORE_Z - 0.55, { color: '#d9622b', s: 0.95 });
    containerStack(k, m > 0 ? X(-8.2) : X(-8.2) - 6 * 0.215, -13.7, 6, 2, 3, rng);
    // canoes and palms
    pirogue(k, X(-0.9), 0, -10.9, 0.15, '#2f8f5a', '#f5c518');
    pirogue(k, X(1.2), 0, -11.5, -0.2, '#d3402f', '#f4efe6');
    palms(k, rng, X(3.8), X(8.0), -13.0, 5, 1.3, 1.7);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Abidjan ─────────────────────────────

const abidjan: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.5;
    k.shape.range = 3;
    k.bump(mid(k, -19), -19, 9, 3.6, 0.9);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    // m = +1 puts the cathedral on the right; -1 mirrors the layout (the breakwater head is on the other side)
    const m = k.mole.dir;
    const cx = mid(k, -15);
    const X = (dx: number): number => cx + m * dx;
    // La Pyramide: a white stepped ziggurat with green terraces and ribbons of windows
    const px = X(-1.9);
    const pz = -14.2;
    const pw = [2.4, 2.1, 1.8, 1.5, 1.2, 0.9];
    const pd = [1.6, 1.4, 1.2, 1.0, 0.8, 0.6];
    const th = 0.36;
    let y = k.groundMax(px, pz, 1.2, 0.8);
    for (let i = 0; i < pw.length; i++) {
      const zc = pz - i * 0.12;
      p.box(px, y - (i ? 0 : 0.25), zc, pw[i], th + (i ? 0 : 0.25), pd[i], '#efe9dc');
      const zf = zc + pd[i] / 2 + 0.004;
      const n = Math.floor((pw[i] - 0.2) / 0.19);
      for (let j = 0; j < n; j++) {
        const u = -pw[i] / 2 + 0.1 + (j + 0.5) * ((pw[i] - 0.2) / n);
        rect(p, onZ(px, zf), u - 0.065, y + 0.07, u + 0.065, y + th - 0.06, '#3c5568');
      }
      const q = Math.floor((pd[i] - 0.14) / 0.19);
      for (let j = 0; j < q; j++) {
        const u = 0.07 + (j + 0.5) * ((pd[i] - 0.14) / q);
        rect(p, onX(px + pw[i] / 2 + 0.004, zc + pd[i] / 2), u - 0.065, y + 0.07, u + 0.065, y + th - 0.06, '#3c5568');
      }
      if (i < pw.length - 1) p.box(px, y + th, zc + pd[i] / 2 - 0.1, pw[i] - 0.1, 0.05, 0.2, '#69a04f');
      y += th;
    }
    k.reserve(px, pz, 1.4, 1.0);
    // Saint Paul's cathedral: a big wave of white concrete roof over a glass front, with a cross
    const sx = X(2.8);
    const sz = -13.7;
    const sy = k.groundMax(sx, sz, 0.9, 0.6);
    const prof: Array<[number, number]> = m > 0
      ? [[-0.95, 0], [0.95, 0], [0.95, 1.35], [0.6, 1.85], [0.0, 2.3], [-0.45, 2.15], [-0.95, 1.5]]
      : [[-0.95, 0], [0.95, 0], [0.95, 1.5], [0.45, 2.15], [0.0, 2.3], [-0.6, 1.85], [-0.95, 1.35]];
    p.extrude(prof, 1.2, sx, sy - 0.05, sz, '#f4f0e6');
    const glassFace: Array<[number, number]> = m > 0
      ? [[-0.74, 0.12], [0.74, 0.12], [0.74, 1.25], [0.45, 1.65], [-0.02, 2.0], [-0.38, 1.88], [-0.74, 1.35]]
      : [[-0.74, 0.12], [0.74, 0.12], [0.74, 1.35], [0.38, 1.88], [0.02, 2.0], [-0.45, 1.65], [-0.74, 1.25]];
    fan(k.glass, onZ(sx, sz + 0.6 + 0.004), glassFace.map(([a, b]) => [a, b + sy - 0.05] as [number, number]), '#5c7d8f');
    for (let i = -2; i <= 2; i++) p.box(sx + i * 0.3, sy + 0.1, sz + 0.606, 0.02, 1.2, 0.01, '#f4f0e6', { ao: 0 });
    p.box(sx - 0.02 * m, sy + 2.2, sz, 0.05, 0.62, 0.05, '#f4f0e6');
    p.box(sx - 0.02 * m, sy + 2.62, sz, 0.3, 0.05, 0.05, '#f4f0e6');
    const bx = sx + m * 1.3;
    p.box(bx, sy - 0.1, sz - 0.2, 0.26, 2.6, 0.26, '#efe9dc');
    p.box(bx, sy + 2.5, sz - 0.2, 0.34, 0.06, 0.34, '#d6cfbf');
    p.box(bx, sy + 2.56, sz - 0.2, 0.04, 0.4, 0.04, '#efe9dc');
    p.box(bx, sy + 2.78, sz - 0.2, 0.2, 0.04, 0.04, '#efe9dc');
    k.reserve(sx + m * 0.3, sz, 1.6, 0.8);
    // the Plateau's towers
    const sky: Array<[number, number, number, number, number, Col]> = [
      [0.6, -17.2, 0.85, 0.7, 4.5, '#7fa9bd'],
      [1.9, -16.5, 0.7, 0.6, 3.4, '#d8d2c2'],
      [-0.5, -18.4, 0.95, 0.65, 3.9, '#9fb7c6'],
      [-3.2, -17.4, 0.8, 0.6, 3.0, '#e4cf9c'],
      [-4.8, -16.8, 0.7, 0.6, 2.2, '#cfc9ba'],
      [4.7, -17.6, 0.6, 0.55, 3.3, '#a9bfcc'],
      [5.5, -17.6, 0.6, 0.55, 3.3, '#a9bfcc'],
      [-1.4, -17.0, 0.6, 0.6, 2.4, '#b9c8d0'],
    ];
    for (const [dx, zz, w, d, h, c] of sky) {
      const top = tower(k, X(dx), zz, w, d, h, c, { win: '#2f4c63', rows: Math.round(h / 0.14), cols: 3, band: '#eef2f4' });
      p.box(X(dx), top, zz, w * 0.55, 0.18, d * 0.55, '#c9d2d8');
      if (h > 3.8) p.cyl(X(dx), top + 0.18, zz, 0.014, 0.008, 0.5, '#8a9096', { seg: 4 });
    }
    palms(k, rng, cx - 8, cx + 8, -12.7, 11, 1.4, 1.8);
    pirogue(k, X(-0.6), 0, -10.8, 0.1, '#2c5da8', '#f5c518');
    pirogue(k, X(2.0), 0, -11.3, -0.25, '#d3402f', '#f4efe6');
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Banjul ─────────────────────────────

const banjul: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.25;
    k.shape.range = 1.5;
    k.plateau(mid(k, -14), -14, 4.2, 2.2, LAND_Y + 0.02, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const cx = mid(k, -14);
    const y = k.groundMax(cx, -14, 1.8, 0.5);
    // Arch 22: a tall white gate with a pointed opening, a wide deck, and a viewing tower with a green roof
    k.at(cx, y, -14, 0.1, 1.0, () => {
      const wht = '#f6f3ea';
      archGate(k, 0, -0.2, 0, { half: 1.7, open: 0.82, apex: 2.5, top: 3.1, taper: 0.4, depth: 0.85, color: wht, kind: 'point' });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) rect(p, onZ(0, 0.425 + 0.004), s * 1.25 - 0.07, 0.4 + i * 0.75, s * 1.25 + 0.07, 0.9 + i * 0.75, '#46586a');
        rect(p, onZ(0, 0.425 + 0.004), s * 1.0 - 0.04, 0, s * 1.0 + 0.04, 2.0, '#e0b23a');
      }
      p.box(0, 3.0, 0, 3.9, 0.3, 1.15, wht);
      p.box(0, 3.0, 0.58, 3.92, 0.06, 0.04, '#2f8f5b', { ao: 0 });
      p.box(0, 3.3, 0, 1.15, 1.15, 0.95, wht);
      for (let r = 0; r < 3; r++) for (const u of [-0.3, 0, 0.3]) rect(p, onZ(0, 0.475 + 0.004), u - 0.07, 3.45 + r * 0.32, u + 0.07, 3.65 + r * 0.32, '#46586a');
      p.box(0, 4.45, 0, 1.7, 0.2, 1.3, wht);
      k.glass.box(0, 4.65, 0, 1.5, 0.34, 1.1, '#78b3c9', { ao: 0 });
      p.box(0, 4.99, 0, 1.8, 0.06, 1.4, '#2f8f5b');
      p.pyramid(0, 5.05, 0, 1.3, 0.55, 1.0, '#2f8f5b');
      p.cyl(0, 5.6, 0, 0.03, 0.012, 0.55, '#c9c5ba', { seg: 5, ao: 0 });
      for (const s of [-1, 1]) {
        p.box(s * 1.78, 3.3, 0, 0.22, 0.9, 0.22, wht);
        p.pyramid(s * 1.78, 4.2, 0, 0.3, 0.32, 0.3, '#2f8f5b');
      }
    });
    k.reserve(cx, -14, 2.2, 1.0);
    // baobabs and palms, pirogues on the Gambia
    for (const [dx, z, s] of [[-3.8, -14.3, 3.0], [3.9, -14.0, 2.6], [-5.8, -15.5, 2.4]] as Array<[number, number, number]>) {
      const x = cx + dx;
      const gy = k.ground(x, z);
      if (gy < 0.25) continue;
      tree(k, 'baobab', x, z, s, rng, gy - 0.04);
      k.reserve(x, z, 0.5, 0.5);
    }
    palms(k, rng, cx - 8, cx + 8, -13.0, 10, 1.3, 1.8);
    pirogue(k, cx - 2.6, 0, -10.5, 0.15, '#2f8f5a', '#f5c518');
    pirogue(k, cx - 0.2, 0, -9.6, -0.1, '#d3402f', '#f4efe6');
    pirogue(k, cx + 2.4, 0, -10.8, 0.3, '#2c5da8', '#f08a2c');
    pirogue(k, cx + 4.2, 0, -9.9, -0.2, '#f5c518', '#d3402f');
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Lome ─────────────────────────────

const lome: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.4;
    k.shape.range = 2.2;
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const m = k.mole.dir;
    const cx = mid(k, -14.8);
    const X = (dx: number): number => cx + m * dx;
    // Hotel du 2 Fevrier: a slim pale tower on a podium with a round glass crown
    const tx = X(-1.4);
    const tz = -15.2;
    const ty = k.groundMax(tx, tz, 0.7, 0.5);
    p.box(tx, ty - 0.2, tz + 0.1, 1.5, 1.0 + 0.2, 0.9, '#d8d0bf');
    for (let i = 0; i < 6; i++) rect(p, onZ(tx, tz + 0.1 + 0.45 + 0.004), -0.62 + i * 0.25, ty + 0.3, -0.62 + i * 0.25 + 0.16, ty + 0.8, '#3d5a70');
    const hTop = tower(k, tx, tz, 0.72, 0.6, 4.1, '#ece8de', { y: ty + 1.0, rows: 24, cols: 3, win: '#3d5a70', band: '#c9c3b2' });
    p.cyl(tx, hTop, tz, 0.5, 0.5, 0.18, '#e6e0d0', { seg: 14 });
    k.glass.cyl(tx, hTop + 0.18, tz, 0.52, 0.52, 0.36, '#78b3c9', { seg: 14 });
    p.cyl(tx, hTop + 0.54, tz, 0.58, 0.58, 0.07, '#e6e0d0', { seg: 14 });
    p.cone(tx, hTop + 0.61, tz, 0.4, 0.2, '#c9c3b2', { seg: 14 });
    p.cyl(tx, hTop + 0.8, tz, 0.02, 0.01, 0.55, '#8a9096', { seg: 4 });
    k.reserve(tx, tz, 0.9, 0.7);
    // the cathedral with two towers
    const sx = X(2.3);
    const sz = -13.8;
    const sy = k.groundMax(sx, sz, 1.1, 0.7);
    const wall = '#f1e7d2';
    p.box(sx, sy - 0.2, sz, 1.0, 0.2 + 0.85, 1.4, wall);
    p.prism(sx, sy + 0.85, sz, 1.0, 0.42, 1.4, '#8a4a35');
    p.tri([sx - 0.5, sy + 0.85, sz + 0.703], [sx + 0.5, sy + 0.85, sz + 0.703], [sx, sy + 1.27, sz + 0.703], wall);
    arch(p, onZ(sx, sz + 0.704), 0, sy, 0.36, 0.52, '#3a2f2a');
    fan(p, onZ(sx, sz + 0.707), [[-0.09, 0.72], [0.09, 0.72], [0.12, 0.84], [0.0, 0.98], [-0.12, 0.84]].map(([a, b]) => [a, b + sy] as [number, number]), '#4a6a85');
    for (const s of [-1, 1]) {
      const tx2 = sx + s * 0.72;
      p.box(tx2, sy - 0.2, sz + 0.25, 0.46, 0.2 + 1.9, 0.5, wall);
      p.box(tx2, sy + 1.55, sz + 0.25, 0.5, 0.05, 0.54, '#d8cdb2', { ao: 0 });
      arch(p, onZ(tx2, sz + 0.25 + 0.254), 0, sy + 1.0, 0.18, 0.38, '#2f2a28');
      arch(p, onZ(tx2, sz + 0.25 + 0.254), 0, sy + 0.25, 0.14, 0.34, '#4a6a85');
      arch(p, onX(tx2 + 0.234, sz + 0.25 + 0.25), 0.25, sy + 1.0, 0.18, 0.38, '#2f2a28');
      p.pyramid(tx2, sy + 1.7, sz + 0.25, 0.54, 0.62, 0.58, '#8a4a35');
      p.cyl(tx2, sy + 2.32, sz + 0.25, 0.012, 0.01, 0.22, '#e8b923', { seg: 4, ao: 0 });
    }
    k.reserve(sx, sz, 1.4, 0.9);
    // palms along the beach and canoes
    palms(k, rng, cx - 8, cx + 8, -12.9, 14, 1.7, 2.2);
    pirogue(k, X(-1.0), 0, -10.7, 0.1, '#f5c518', '#2c5da8');
    pirogue(k, X(1.1), 0, -9.8, -0.15, '#d3402f', '#f4efe6');
    pirogue(k, X(-3.6), k.ground(X(-3.6), -12.3), -12.3, 0.4, '#2f8f5a', '#f5c518');
    pirogue(k, X(5.0), k.ground(X(5.0), -12.2), -12.2, -0.3, '#2c5da8', '#f08a2c');
    gantryCrane(k, X(-6.8), SHORE_Z - 0.9, { color: '#2c5da8', s: 0.8 });
  },
  rows: 4,
  quiet: true,
};

// ───────────────────────────── Tema ─────────────────────────────

const tema: Landmark = {
  terrain(k) {
    greenCoast(k);
    k.shape.relief = 0.4;
    k.shape.range = 2.4;
    k.plateau(mid(k, -14.2), -14.2, 7.4, 2.6, LAND_Y + 0.02, 0.4);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    // the cranes stand on the side away from the breakwater head, the arch on the head's side
    const m = k.mole.dir;
    const cx = mid(k, -14.2);
    const X = (dx: number): number => cx + m * dx;
    const stackAt = (dx: number, z: number, nx: number, nz: number, tiers: number): void => containerStack(k, m > 0 ? X(dx) : X(dx) - nx * 0.215, z, nx, nz, tiers, rng);
    // four container gantry cranes, two colours, over the water at the quay
    for (let i = 0; i < 4; i++) gantryCrane(k, X(1.5 + i * 1.3), SHORE_Z - 0.55, { color: i % 2 ? '#e0752a' : '#2c5da8', s: 1.05 });
    // container stacks behind them
    stackAt(0.9, -13.5, 11, 3, 3);
    stackAt(1.0, -15.1, 10, 3, 4);
    stackAt(1.3, -16.9, 9, 2, 3);
    // the Black Star arch: a big gate in the national colours with a black star on top
    const ax = X(-2.6);
    const az = -13.7;
    const ay = k.groundMax(ax, az, 1.5, 0.5);
    k.at(ax, ay, az, 0.1, 1.0, () => {
      archGate(k, 0, -0.15, 0, { half: 1.6, open: 0.8, apex: 1.75, top: 2.2, taper: 0.0, depth: 0.8, color: '#e6e0d0' });
      for (let i = 0; i < 3; i++) rect(p, onZ(0, 0.4 + 0.004), -1.6, 1.9 + i * 0.1, 1.6, 1.98 + i * 0.1, ['#c8302a', '#f5c518', '#2e8b4a'][i]);
      for (const s of [-1, 1]) rect(p, onZ(0, 0.4 + 0.004), s * 1.2 - 0.12, 0.2, s * 1.2 + 0.12, 1.6, '#c9bf9f');
      p.box(0, 2.05, 0, 3.4, 0.3, 0.9, '#e6e0d0');
      p.extrude(starPts(1.05, 0.42), 0.22, 0, 2.35 + 1.0, 0, '#1c1c1c');
    });
    k.reserve(ax, az, 1.7, 0.8);
    // canoes
    pirogue(k, X(-1.0), 0, -10.6, 0.15, '#d3402f', '#f5c518');
    pirogue(k, X(1.8), 0, -10.0, -0.2, '#2f8f5a', '#f4efe6');
    pirogue(k, X(-5.8), k.ground(X(-5.8), -12.3), -12.3, 0.3, '#f5c518', '#2c5da8');
    palms(k, rng, X(-6.5), X(-4.8), -14.8, 3, 1.4, 1.8);
    palms(k, rng, X(5.5), X(8.0), -13.8, 3, 1.4, 1.8);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Agadir ─────────────────────────────

const agadir: Landmark = {
  terrain(k) {
    aridCoast(k, { hill: '#c9a46d', rock: '#b98558' });
    k.shape.relief = 0.8;
    k.shape.range = 2.6;
    const hx = mid(k, -16.2) + 1.2;
    k.bump(hx, -16.2, 4.8, 3.6, 3.3, 1.2);
    const top = k.ground(hx, -16.2);
    k.plateau(hx, -16.2, 2.5, 1.7, top - 0.15, 0.45);
    k.paint((x, y, z, _slope, c) => {
      if (Math.hypot((x - hx) / 4.8, (z + 16.2) / 3.6) < 1 && y > 0.7) c.lerp(new THREE.Color('#bf8c5a'), 0.6);
    });
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const hx = mid(k, -16.2) + 1.2;
    const hz = -16.2;
    // the kasbah: a walled enclosure with corner bastions, crenellated sandy ramparts, a gate and a few flat-roofed houses inside
    const wall = '#d9b98a';
    const lite = '#e6cd9f';
    const x0 = hx - 2.1;
    const x1 = hx + 2.1;
    const zf = hz + 1.3;
    const zb = hz - 1.3;
    rampart(k, x0, zf, x1, zf, 0.5, 0.2, wall, lite);
    rampart(k, x0, zb, x1, zb, 0.5, 0.2, wall, lite);
    rampart(k, x0, zb, x0, zf, 0.5, 0.2, wall, lite);
    rampart(k, x1, zb, x1, zf, 0.5, 0.2, wall, lite);
    for (const [bx, bz, h] of [[x0, zf, 0.9], [x1, zf, 0.9], [x1, zb, 0.8], [x0, zb, 0.8], [hx - 0.55, zf, 0.8], [hx + 0.55, zf, 0.8]] as Array<[number, number, number]>) bastion(k, bx, bz, 0.5, h, tint(wall, -0.04), lite);
    const gy = k.ground(hx, zf);
    arch(p, onZ(hx, zf + 0.1 + 0.004), 0, gy, 0.5, 0.62, '#3b3126');
    for (let i = 0; i < 7; i++) {
      const bx = hx - 1.7 + i * 0.58 + rng.range(-0.1, 0.1);
      const bz = hz + rng.range(-0.7, 0.6);
      const g = k.groundMax(bx, bz, 0.25, 0.2);
      p.box(bx, g - 0.15, bz, 0.42, 0.15 + rng.range(0.25, 0.45), 0.34, '#ecd7ac');
    }
    k.reserve(hx, hz, 2.5, 1.7);
    // the great inscription in white on the hillside
    const ty = k.ground(hx, hz) - 1.25;
    const zOn = (x: number, yy: number): number => {
      let lo = hz + 0.3;
      let hi = hz + 4.2;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (k.ground(x, mid) > yy) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const A = hx - 2.2;
    const B = hx + 2.2;
    const Y0 = ty - 1.55;
    const Y1 = ty - 0.2;
    const pt = (u: number, v: number): V3 => {
      const x = lerp(A, B, u);
      const yy = lerp(Y0, Y1, v);
      return [x, yy + 0.04, zOn(x, yy) + 0.06];
    };
    const stroke = (pts: Array<[number, number]>): void => {
      for (let i = 0; i < pts.length - 1; i++) p.rod(pt(pts[i][0], pts[i][1]), pt(pts[i + 1][0], pts[i + 1][1]), 0.05, '#f6f3ea', 4);
    };
    // a flowing baseline, tall letter strokes with hooks, loops under the line and dots over it
    const wave: Array<[number, number]> = [];
    for (let i = 0; i <= 26; i++) wave.push([i / 26, 0.3 + 0.045 * Math.sin(i * 0.9)]);
    stroke(wave);
    for (const [u, h] of [[0.05, 0.95], [0.21, 0.78], [0.38, 1.0], [0.57, 0.74], [0.74, 0.96], [0.92, 0.8]] as Array<[number, number]>) {
      stroke([[u, 0.3], [u, h]]);
      stroke([[u, h], [u + 0.035, h + 0.05]]);
    }
    for (const u of [0.13, 0.31, 0.5, 0.66, 0.83]) {
      const ring: Array<[number, number]> = [];
      for (let i = 0; i <= 9; i++) ring.push([u + 0.045 * Math.cos((i / 9) * 6.283 + 3.14), 0.14 + 0.13 * Math.sin((i / 9) * 6.283 + 3.14)]);
      stroke(ring);
    }
    for (const u of [0.28, 0.46, 0.62, 0.86]) {
      const [dx, dy, dz] = pt(u, 0.62);
      p.ball(dx, dy, dz, 0.055, '#f6f3ea');
    }
    // white-and-pink hotels along the beach, palms
    const cx = mid(k, -13.4);
    const hotels: Array<[number, number, number, Col]> = [
      [-7.4, 1.5, 0.95, '#f7f1ea'],
      [-6.0, 1.9, 0.95, '#eec1b4'],
      [-4.6, 1.3, 0.95, '#f7f1ea'],
      [-3.2, 1.7, 0.95, '#f2cfc2'],
      [-1.8, 1.2, 0.9, '#f7f1ea'],
    ];
    for (const [dx, h, w, c] of hotels) {
      const top = tower(k, cx + dx, -13.5, w, 0.7, h, c, { win: '#4a6376', rows: Math.round(h / 0.19), cols: 4, band: '#eec1b4' });
      p.box(cx + dx, top, -13.5, w + 0.04, 0.04, 0.74, '#e8dcc0');
    }
    palms(k, rng, cx - 8.5, cx + 1.0, -12.6, 10, 1.3, 1.7);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Tanger Med ─────────────────────────────

const tangermed: Landmark = {
  terrain(k) {
    aridCoast(k, { land: '#c5b784', land2: '#bcae7c', hill: '#8f9a62', rock: '#9a8a6e', haze: '#dde2d8' });
    k.shape.relief = 2.4;
    k.shape.range = 7;
    k.shape.rise = 6;
    k.plateau(mid(k, -14.8), -14.8, 8.5, 2.9, LAND_Y + 0.02, 0.35);
    // the Rif: green maquis patches and bare ochre rock on the mountains
    const green = new THREE.Color('#6f8c4f');
    const ochre = new THREE.Color('#a99468');
    k.paint((x, _y, z, _s, c) => {
      const t = noise2(x * 0.3 + 3, z * 0.3, 21);
      c.lerp(t > 0.52 ? green : ochre, 0.5 * smooth(-16, -24, z));
    });
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const cx = mid(k, -14.8);
    for (let i = 0; i < 5; i++) gantryCrane(k, cx - 1.0 + i * 1.4, SHORE_Z - 0.55, { color: i % 2 ? '#e0752a' : '#2c5da8', s: 1.25 });
    containerStack(k, cx - 2.0, -13.7, 9, 3, 4, rng);
    containerStack(k, cx + 0.2, -15.4, 9, 3, 3, rng);
    containerStack(k, cx + 2.8, -13.7, 6, 3, 4, rng);
    // the control tower and a long warehouse
    const tx = cx - 3.6;
    const gy = k.ground(tx, -15.4);
    p.box(tx, gy - 0.1, -15.4, 0.5, 2.0, 0.5, '#e9e6dc');
    p.box(tx, gy + 1.9, -15.4, 0.8, 0.5, 0.8, '#5a7a8c');
    p.box(tx, gy + 2.4, -15.4, 0.9, 0.06, 0.9, '#cfcbbf');
    p.cyl(tx, gy + 2.46, -15.4, 0.02, 0.01, 0.5, '#8a9096', { seg: 4 });
    k.reserve(tx, -15.4, 0.6, 0.6);
    const wx = cx - 4.6;
    const wy = k.ground(wx, -17.4);
    p.box(wx, wy - 0.1, -17.4, 3.0, 0.7, 1.0, '#cfcbbf');
    p.prism(wx, wy + 0.6, -17.4, 3.1, 0.18, 1.04, '#7f8a92', { ry: Math.PI / 2 });
    k.reserve(wx, -17.4, 1.6, 0.6);
    // a container ship alongside
    const sx = cx + 1.6;
    const sz = -11.1;
    p.box(sx, -0.45, sz, 6.4, 0.45 + 0.55, 1.15, '#223a63');
    p.box(sx, 0.08, sz + 0.575, 6.4, 0.05, 0.02, '#c8302a', { ao: 0 });
    p.box(sx, -0.45, sz, 6.5, 0.2, 1.17, '#b8362b', { ao: 0 });
    p.box(sx - 2.6, 0.55, sz, 0.9, 0.7, 0.9, '#f4f0e6');
    p.box(sx - 2.6, 1.25, sz, 0.8, 0.28, 0.8, '#e9e6dd');
    p.box(sx - 2.6, 1.53, sz, 0.5, 0.2, 0.7, '#3d5a70');
    p.box(sx - 2.95, 1.2, sz, 0.18, 0.35, 0.18, '#c8302a');
    const cols = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#e86a2c'];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) for (let t = 0; t < 2 + ((i + j) % 2); t++) p.box(sx - 1.65 + i * 0.37, 0.55 + t * 0.12, sz - 0.33 + j * 0.33, 0.35, 0.11, 0.31, cols[(i * 3 + j * 2 + t) % cols.length], { ao: 0.15 });
  },
  rows: 2,
  quiet: true,
};

// ───────────────────────────── Tangier ─────────────────────────────

const tangier: Landmark = {
  terrain(k) {
    aridCoast(k, { land: '#cdbf8a', land2: '#c5b680', hill: '#b4ad74', rock: '#b08e66', haze: '#e1e5da' });
    k.shape.relief = 1.0;
    k.shape.range = 3.4;
    const hx = mid(k, -15.6) + 0.4;
    k.bump(hx, -15.8, 5.8, 3.8, 2.7, 1.15);
    const top = k.ground(hx, -15.8);
    k.plateau(hx + 0.3, -16.2, 1.9, 1.3, top - 0.12, 0.45);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const hx = mid(k, -15.6) + 0.4;
    // the kasbah on top and a tall tiled minaret, a medina of white cubes with blue doors falling to the shore
    const x0 = hx - 1.0;
    const x1 = hx + 1.6;
    const zf = -15.0;
    const zb = -17.4;
    const wall = '#efe6cf';
    rampart(k, x0, zf, x1, zf, 0.45, 0.18, wall, '#f7f0dc');
    rampart(k, x0, zb, x1, zb, 0.45, 0.18, wall, '#f7f0dc');
    rampart(k, x0, zb, x0, zf, 0.45, 0.18, wall, '#f7f0dc');
    rampart(k, x1, zb, x1, zf, 0.45, 0.18, wall, '#f7f0dc');
    bastion(k, x1, zf, 0.5, 0.75, '#e9dfc4', '#f7f0dc');
    bastion(k, x0, zf, 0.5, 0.75, '#e9dfc4', '#f7f0dc');
    arch(p, onZ(hx + 0.3, zf + 0.09 + 0.004), 0, k.ground(hx + 0.3, zf), 0.4, 0.5, '#2d4a6a');
    const gy = k.groundMax(hx + 0.3, -16.2, 1.0, 0.8);
    p.box(hx + 0.3, gy - 0.1, -16.2, 1.5, 0.1 + 0.5, 1.0, '#f4efe0');
    p.box(hx + 0.3, gy + 0.5, -16.2, 1.6, 0.05, 1.1, '#2f8f5b');
    for (let j = 0; j < 4; j++) arch(p, onZ(hx + 0.3, -16.2 + 0.504), -0.55 + j * 0.37, gy + 0.08, 0.2, 0.34, '#2d4a6a');
    minaret(k, hx - 0.5, k.groundMax(hx - 0.5, -16.7, 0.3, 0.3), -16.7, 2.4, 0.44, { tile: '#2f8f5b', wall: '#f4efe0' });
    k.reserve(hx + 0.3, -16.2, 2.0, 1.4);
    hillHouses(k, rng, { x0: hx - 5.5, x1: hx + 5.6, z0: -13.2, z1: -17.0, walls: ['#f6f3ea', '#f6f3ea', '#f0e9d6', '#a6c8df', '#f1d8b4'], door: '#2d6aa8', skip: 0.08 });
    palms(k, rng, hx - 8, hx + 8, -12.7, 9, 1.2, 1.6);
  },
  rows: 2,
  quiet: true,
};

// ───────────────────────────── Nouakchott ─────────────────────────────

const nouakchott: Landmark = {
  terrain(k) {
    aridCoast(k, { land: '#e6d09a', land2: '#e0c88e', hill: '#dcc088', rock: '#c9a574', sand: '#f2e3b4', haze: '#eee7d4' });
    k.shape.relief = 0.2;
    k.shape.range = 1.2;
    // dunes: sharp-crested ridges marching inland
    k.feature((x, z, h) => {
      const d = SHORE_Z - z;
      if (d < 2.2) return h;
      const w = smooth(2.2, 6.5, d);
      const crest = 1 - Math.abs(Math.sin(x * 0.42 + noise2(x * 0.18, z * 0.18, 5) * 3.2 + z * 0.3));
      return h + w * (1.15 * crest * crest + 0.5 * noise2(x * 0.3, z * 0.3, 9));
    });
    k.plateau(mid(k, -14), -14.2, 3.6, 1.7, LAND_Y + 0.05, 0.4);
    const dark = new THREE.Color('#c9a56a');
    k.paint((x, y, z, slope, c) => {
      if (z < SHORE_Z - 2.5 && y > 0.5) c.lerp(dark, 0.45 * Math.min(1, slope * 3.5));
    });
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const cx = mid(k, -14.2);
    const gy = k.groundMax(cx, -14.2, 2.0, 0.9);
    // the big mosque: a long cream hall, a shallow dome and two slim minarets
    const hw = 3.8;
    p.box(cx, gy - 0.25, -14.2, hw, 0.25 + 1.15, 1.5, '#efe3c4');
    p.box(cx, gy + 1.15, -14.2, hw + 0.1, 0.09, 1.6, '#d9c79e');
    for (let i = 0; i < 7; i++) {
      const u = -hw / 2 + 0.34 + i * ((hw - 0.68) / 6);
      arch(p, onZ(cx, -14.2 + 0.754), u, gy + 0.14, 0.38, 0.82, '#3a4a58');
    }
    for (let j = 0; j < 3; j++) arch(p, onX(cx + hw / 2 + 0.004, -14.2 + 0.75), 0.3 + j * 0.45, gy + 0.14, 0.34, 0.82, '#3a4a58');
    p.lathe(cx, gy + 1.24, -14.2, [[0.85, 0], [0.88, 0.12], [0.76, 0.5], [0.46, 0.84], [0.14, 1.02], [0.0, 1.05]], '#e8dcc0', { seg: 14 });
    p.cyl(cx, gy + 1.24 + 1.03, -14.2, 0.012, 0.012, 0.28, '#e8b923', { seg: 4 });
    minaret(k, cx - hw / 2 - 0.2, gy, -14.2, 3.0, 0.48, { tile: '#3a86a8', wall: '#f3ead2', cap: '#3a86a8' });
    minaret(k, cx + hw / 2 + 0.2, gy, -14.2, 3.0, 0.48, { tile: '#3a86a8', wall: '#f3ead2', cap: '#3a86a8' });
    k.reserve(cx, -14.2, hw / 2 + 0.8, 1.0);
    // pirogues pulled up on the beach, and palms
    const cols: Array<[Col, Col]> = [['#2c5da8', '#f5c518'], ['#d3402f', '#f4efe6'], ['#2f8f5a', '#f08a2c'], ['#f5c518', '#2c5da8'], ['#e86a2c', '#f4efe6'], ['#7a4a8c', '#f5c518'], ['#2fa3b5', '#d3402f']];
    for (let i = 0; i < 7; i++) {
      const x = cx - 4.8 + i * 1.6 + rng.range(-0.2, 0.2);
      const z = -12.25 + rng.range(-0.2, 0.2);
      pirogue(k, x, k.ground(x, z) + 0.02, z, rng.range(-0.4, 0.4) + (i % 2 ? 0.2 : 0), cols[i][0], cols[i][1], 1.7);
    }
    palms(k, rng, cx - 8, cx + 8, -13.3, 6, 1.2, 1.6);
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Freetown ─────────────────────────────

const freetown: Landmark = {
  terrain(k) {
    greenCoast(k, { land: '#79a855', land2: '#6f9f4e', hill: '#4f8a42', rock: '#a5623f' });
    k.shape.relief = 3.0;
    k.shape.range = 6;
    k.shape.rise = 2.0;
    k.bump(mid(k, -15.6), -15.4, 6.5, 3.6, 2.0);
    const grass = new THREE.Color('#8ab35a');
    k.paint((_x, y, z, _s, c) => {
      if (z > -16.5 && y < 2.4) c.lerp(grass, 0.8 * smooth(2.4, 0.9, y));
    });
    k.bump(mid(k, -14.2) - 6.4, -14.2, 1.9, 1.5, 1.2);
  },
  build(k) {
    const rng = rngOf(k);
    const p = k.solid;
    const cx = mid(k, -15.4);
    hillHouses(k, rng, { x0: cx - 6.0, x1: cx + 6.4, z0: -13.2, z1: -17.4, walls: ['#e8c14a', '#d8744b', '#4e9fa0', '#e6dcc7', '#c9806a', '#7aa6c2', '#9fc272', '#e4a24a'], roofs: ['#b3532f', '#9aa3a8', '#7d8a93', '#c46b3c'], skip: 0.1, stepX: 0.46, stepZ: 0.4 });
    // the Cotton Tree: a great grey trunk with buttress roots and a huge spreading crown
    const tx = cx + 0.4;
    const tz = -14.3;
    const ty = k.ground(tx, tz) - 0.05;
    p.cyl(tx, ty, tz, 0.3, 0.16, 1.5, '#a79c8a', { seg: 8 });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + 0.4;
      p.rod([tx + Math.cos(a) * 0.5, ty - 0.02, tz + Math.sin(a) * 0.5], [tx + Math.cos(a) * 0.12, ty + 0.9, tz + Math.sin(a) * 0.12], 0.07, '#a79c8a', 5);
    }
    const crown = ['#4d8a3e', '#5a9a46', '#3f7a38', '#66a64d'];
    p.blob(tx, ty + 1.75, tz, 0.95, crown[0], { sy: 0.65 });
    p.blob(tx - 0.7, ty + 1.55, tz + 0.1, 0.7, crown[2], { sy: 0.6 });
    p.blob(tx + 0.75, ty + 1.6, tz + 0.1, 0.72, crown[1], { sy: 0.6 });
    p.blob(tx + 0.1, ty + 2.2, tz - 0.1, 0.65, crown[3], { sy: 0.6 });
    k.reserve(tx, tz, 1.0, 0.8);
    // the Cape Sierra Leone lighthouse on its headland
    const lx = mid(k, -14.2) - 6.4;
    lighthouse(k, lx, k.ground(lx, -14.2) - 0.05, -14.2, { h: 1.0, r0: 0.16, r1: 0.12, bands: [['#f6f3ea', 0.6], ['#d62f2b', 0.4]], cap: '#2d3138' });
    k.reserve(lx, -14.2, 0.5, 0.5);
    palms(k, rng, cx - 8, cx + 8, -13.0, 10, 1.3, 1.8);
    pirogue(k, cx - 2.2, 0, -10.6, 0.2, '#2c5da8', '#f5c518');
    pirogue(k, cx + 2.0, 0, -9.8, -0.1, '#d3402f', '#f4efe6');
  },
  rows: 2,
  quiet: true,
};

export const LANDMARKS: Record<string, Landmark> = { casablanca, dakar, lagos, abidjan, banjul, lome, tema, agadir, tangermed, tangier, nouakchott, freetown };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Casablanca', 'afN', 'casablanca'],
  ['Dakar', 'afW', 'dakar'],
  ['Lagos', 'afW', 'lagos'],
  ['Abidjan', 'afW', 'abidjan'],
  ['Banjul', 'afW', 'banjul'],
  ['Lome', 'afW', 'lome'],
  ['Tema', 'afW', 'tema'],
  ['Agadir', 'afN', 'agadir'],
  ['Tanger Med', 'afN', 'tangermed'],
  ['Tangier', 'afN', 'tangier'],
  ['Nouakchott', 'afN', 'nouakchott'],
  ['Freetown', 'afW', 'freetown'],
];
