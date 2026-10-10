import { Rng } from '../../../core/rng';
import { PortKit, Part, SHORE_Z, LAND_Y, lerp, smooth, noise2, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { tint, buildTown, type HouseStyle } from '../town';
import { turbine, factory } from '../props';
import { lighthouse } from '../harbour';
import { oilRig, tower as skyTower } from '../structures';

/** United Kingdom: Dover, Felixstowe, Southampton, Teesport, Grimsby, Aberdeen, Immingham, Harwich, Goole (+ London). */

// ───────────────────────────── helpers ─────────────────────────────

/** A row of n dark windows on a +z face (lit at night). */
function winF(k: PortKit, x0: number, x1: number, y: number, h: number, zf: number, n: number, fill = 0.55): void {
  const sp = (x1 - x0) / n;
  const ww = sp * fill;
  for (let i = 0; i < n; i++) {
    const cx = x0 + sp * (i + 0.5);
    k.lit.quad([cx - ww / 2, y, zf], [cx + ww / 2, y, zf], [cx + ww / 2, y + h, zf], [cx - ww / 2, y + h, zf], '#000');
  }
}

/** A row of n dark windows on a +x face, z0 < z1. */
function winS(k: PortKit, z0: number, z1: number, y: number, h: number, xf: number, n: number, fill = 0.55): void {
  const sp = (z1 - z0) / n;
  const ww = sp * fill;
  for (let i = 0; i < n; i++) {
    const cz = z0 + sp * (i + 0.5);
    k.lit.quad([xf, y, cz + ww / 2], [xf, y, cz - ww / 2], [xf, y + h, cz - ww / 2], [xf, y + h, cz + ww / 2], '#000');
  }
}

/** Carve a channel (river, dock cut) through the shore. */
function carve(k: PortKit, cx: number, half: number, zBack: number, bankW = 0.9, floor = -0.35): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1 || z < zBack) return h;
    const bank = smooth(half + bankW, half, Math.abs(x - cx));
    const end = smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, floor), bank * end);
  });
}

/** A battlemented wall run: merlons on the +z face and on the +x end (the faces the camera sees). */
function wall(p: Part, x: number, y: number, z: number, w: number, h: number, d: number, col: Col, pitch = 0.2): void {
  p.box(x, y - 0.2, z, w, h + 0.2, d, col);
  const m = tint(col, 0.1);
  const n = Math.max(2, Math.round(w / pitch));
  for (let i = 0; i < n; i += 2) p.box(x - w / 2 + (i + 0.5) * (w / n), y + h, z + d / 2 - 0.025, w / n, 0.06, 0.05, m, { ao: 0 });
  if (d > 0.3) {
    const nz = Math.max(2, Math.round(d / pitch));
    for (let i = 0; i < nz; i += 2) p.box(x + w / 2 - 0.025, y + h, z - d / 2 + (i + 0.5) * (d / nz), 0.05, 0.06, d / nz, m, { ao: 0 });
  }
}

/** A square tower with a crenellated top. */
function squareTower(p: Part, x: number, y: number, z: number, w: number, h: number, col: Col, roof?: Col): void {
  p.box(x, y - 0.2, z, w, h + 0.2, w, col);
  p.box(x, y + h - 0.02, z, w + 0.06, 0.05, w + 0.06, tint(col, 0.06), { ao: 0 });
  if (roof) p.pyramid(x, y + h + 0.03, z, w + 0.06, w * 0.9, w + 0.06, roof);
  else for (const [dx, dz] of [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1]] as const) p.box(x + dx * w * 0.42, y + h + 0.03, z + dz * w * 0.42, w * 0.18, 0.06, w * 0.18, tint(col, 0.1), { ao: 0 });
}

/** A hull plan (x along the ship, bow at +x), as a polygon in (x, z). */
function plan(L: number, B: number, bow: number, stern = 0.3): [number, number][] {
  return [
    [-L / 2, -B * 0.42], [-L / 2 + stern, -B / 2], [L / 2 - bow, -B / 2], [L / 2, -B * 0.07],
    [L / 2, B * 0.07], [L / 2 - bow, B / 2], [-L / 2 + stern, B / 2], [-L / 2, B * 0.42],
  ];
}

/** A flat slab from a plan polygon, between two heights. */
function slabPlan(p: Part, pts: [number, number][], y0: number, y1: number, x: number, z: number, col: Col, ao = 0.1): void {
  p.extrude(pts, y1 - y0, x, (y0 + y1) / 2, z, col, { rx: Math.PI / 2, ao });
}

interface LinerOpts {
  L: number;
  B: number;
  hull: Col;
  funnel: Col;
  band: Col;
  decks: number;
  boot?: Col;
  top?: Col;
  ry?: number;
  /** x of the funnel as a fraction of the length from the middle (negative = aft) */
  fx?: number;
  funnels?: number;
  /** funnel size multiplier */
  fs?: number;
  /** height of one deck, and of the hull above water */
  dh?: number;
  ht?: number;
}

/** A cruise liner / ferry afloat at (x, z): navy hull, white decks with window ribbons, a funnel with a band. */
function liner(k: PortKit, x: number, z: number, o: LinerOpts): number {
  const p = k.solid;
  const { L, B } = o;
  const hb = -0.3;
  const ht = o.ht ?? 0.5;
  const dh = o.dh ?? 0.18;
  let y = ht;
  k.at(x, 0, z, o.ry ?? 0, 1, () => {
    slabPlan(p, plan(L, B, L * 0.16, 0.35), hb, ht, 0, 0, o.hull);
    // boot topping and a pale sheer strake under the rail
    slabPlan(p, plan(L * 1.004, B * 1.01, L * 0.16, 0.35), -0.04, 0.06, 0, 0, o.boot ?? '#a8312c', 0);
    for (let i = 0; i < 9; i++) p.box(-L / 2 + 0.7 + i * (L - 1.6) / 8, 0.22, B / 2 + 0.003, 0.06, 0.07, 0.01, '#e9ecef', { ao: 0 });
    let topX = 0;
    for (let i = 0; i < o.decks; i++) {
      const x0 = -L / 2 + 0.35 + i * (L * 0.03);
      const x1 = L / 2 - L * 0.12 - i * (L * 0.04);
      const bd = B * (0.98 - i * 0.045);
      const pts: [number, number][] = [[x0, -bd / 2], [x1 - 0.3, -bd / 2], [x1, -bd * 0.3], [x1, bd * 0.3], [x1 - 0.3, bd / 2], [x0, bd / 2]];
      slabPlan(p, pts, y, y + dh, 0, 0, o.top ?? '#f4f1e8', 0.06);
      if (i > 0) {
        // window ribbon on the side, balcony strip under it
        winF(k, x0 + 0.25, x1 - 0.45, y + 0.05, 0.075, bd / 2 + 0.004, Math.round((x1 - x0 - 0.7) / 0.2), 0.62);
        p.box((x0 + x1) / 2 - 0.1, y + 0.012, bd / 2 + 0.008, x1 - x0 - 0.5, 0.03, 0.016, '#cfd6dc', { ao: 0 });
      } else {
        winF(k, x0 + 0.4, x1 - 0.6, y + 0.06, 0.07, bd / 2 + 0.004, Math.round((x1 - x0 - 1.0) / 0.3), 0.5);
      }
      winS(k, -bd * 0.26, bd * 0.26, y + 0.05, 0.075, x1 + 0.004, 3, 0.55);
      if (i === 1) {
        for (let b = 0; b < 6; b++) p.box(x0 + 0.9 + b * 0.62, y + 0.045, bd / 2 + 0.04, 0.26, 0.075, 0.075, '#e8731a', { ao: 0 });
      }
      y += dh;
      topX = x1;
    }
    // funnel(s)
    const nf = o.funnels ?? 1;
    for (let f = 0; f < nf; f++) {
      const fx = L * (o.fx ?? -0.08) - f * 0.9;
      const fs = o.fs ?? 1;
      p.box(fx, y - 0.02, 0, 0.42 * fs, 0.06, B * 0.5, '#f4f1e8');
      p.cyl(fx, y, 0, 0.2 * fs, 0.17 * fs, 0.5 * fs, o.funnel, { seg: 10, ao: 0.1 });
      p.cyl(fx, y + 0.24 * fs, 0, 0.196 * fs, 0.186 * fs, 0.17 * fs, o.band, { seg: 10, ao: 0 });
      p.cyl(fx, y + 0.5 * fs, 0, 0.17 * fs, 0.17 * fs, 0.07 * fs, '#23272e', { seg: 10, ao: 0 });
    }
    // bridge house with its wings and a mast
    const bx = topX - 0.55;
    p.box(bx, y, 0, 0.5, 0.15, B * 0.62, '#f4f1e8');
    p.box(bx + 0.25 + 0.004, y + 0.04, 0, 0.01, 0.07, B * 0.55, '#27333f', { ao: 0 });
    p.box(bx, y + 0.15, 0, 0.55, 0.03, B * 0.7, '#dfe3e6', { ao: 0 });
    p.cyl(bx - 0.1, y + 0.18, 0, 0.012, 0.01, 0.4, '#d9dde0', { seg: 5, ao: 0 });
    p.box(bx - 0.1, y + 0.45, 0, 0.02, 0.025, 0.14, '#9aa3ab', { ao: 0 });
    // the sun deck: pool and loungers
    p.box(-0.9, y, 0, 1.0, 0.025, B * 0.5, '#9fc8d6', { ao: 0 });
    p.box(L * 0.05, y - 0.005, 0, 0.5, 0.02, B * 0.4, '#d9c9a8', { ao: 0 });
  });
  return y;
}

/** A tanker moored at (x, z): dark hull with a red boot, a white house aft, pipes and a manifold. */
function tanker(k: PortKit, x: number, z: number, L: number, B: number, hull = '#2b2f36', ry = 0): void {
  const p = k.solid;
  k.at(x, 0, z, ry, 1, () => {
    slabPlan(p, plan(L, B, L * 0.14, 0.3), -0.35, 0.34, 0, 0, hull);
    slabPlan(p, plan(L * 1.004, B * 1.01, L * 0.14, 0.3), -0.04, 0.07, 0, 0, '#b3322a', 0);
    slabPlan(p, plan(L * 0.98, B * 0.96, L * 0.14, 0.3), 0.34, 0.37, 0, 0, '#7d8388', 0);
    // aft house with a funnel
    const hx = -L / 2 + 0.62;
    p.box(hx, 0.37, 0, 0.8, 0.42, B * 0.8, '#f4f1e8');
    p.box(hx + 0.03, 0.79, 0, 0.5, 0.18, B * 0.78, '#f4f1e8');
    winF(k, hx - 0.33, hx + 0.37, 0.52, 0.07, B * 0.4 + 0.004, 5, 0.6);
    winF(k, hx - 0.2, hx + 0.24, 0.86, 0.06, B * 0.39 + 0.004, 4, 0.6);
    p.cyl(hx - 0.2, 0.97, 0, 0.1, 0.09, 0.28, '#b3322a', { seg: 8 });
    p.cyl(hx - 0.2, 1.2, 0, 0.09, 0.09, 0.05, '#23272e', { seg: 8, ao: 0 });
    // deck pipework and manifold
    p.box(0.1, 0.37, B * 0.14, L * 0.62, 0.04, 0.04, '#c9c5ba', { ao: 0 });
    p.box(0.1, 0.37, -B * 0.14, L * 0.62, 0.04, 0.04, '#c9c5ba', { ao: 0 });
    p.box(0.1, 0.37, 0, 0.12, 0.09, B * 0.7, '#c8302a');
    for (let i = 0; i < 5; i++) p.cyl(-0.5 + i * 0.5, 0.37, 0, 0.07, 0.07, 0.1, '#7d8388', { seg: 7, ao: 0 });
    p.box(L / 2 - 0.55, 0.37, 0, 0.3, 0.12, B * 0.5, '#7d8388');
  });
}

/** A supply vessel (offshore): navy hull, white wheelhouse forward, an open cargo deck aft. */
function supply(k: PortKit, x: number, z: number, L: number, ry = 0): void {
  const p = k.solid;
  const B = L * 0.22;
  k.at(x, 0, z, ry, 1, () => {
    slabPlan(p, plan(L, B, L * 0.22, 0.12), -0.22, 0.26, 0, 0, '#c8402a');
    slabPlan(p, plan(L * 1.004, B * 1.012, L * 0.22, 0.12), 0.1, 0.27, 0, 0, '#27395c', 0);
    p.box(L * 0.2, 0.26, 0, L * 0.2, 0.3, B * 0.86, '#f4f1e8');
    p.box(L * 0.2 + 0.02, 0.56, 0, L * 0.16, 0.14, B * 0.9, '#f4f1e8');
    p.box(L * 0.2 + L * 0.08 + 0.004, 0.6, 0, 0.01, 0.07, B * 0.8, '#27333f', { ao: 0 });
    p.box(L * 0.2 - 0.02, 0.7, 0, L * 0.1, 0.1, B * 0.4, '#f4f1e8');
    p.cyl(L * 0.02, 0.26, 0, 0.05, 0.05, 0.32, '#c8302a', { seg: 7 });
    for (let i = 0; i < 3; i++) p.box(-L * 0.42 + i * 0.28, 0.26, i % 2 ? 0.05 : -0.04, 0.24, 0.14, 0.18, i % 2 ? '#2c5da8' : '#e8731a');
  });
}

/** A coaster at (x, z): hull, white house aft with a funnel, a long hatch. */
function coaster(k: PortKit, x: number, z: number, L: number, hull: Col, ry = 0): void {
  const p = k.solid;
  const B = L * 0.2;
  k.at(x, 0, z, ry, 1, () => {
    slabPlan(p, plan(L, B, L * 0.16, 0.12), -0.25, 0.3, 0, 0, hull);
    slabPlan(p, plan(L * 1.004, B * 1.012, L * 0.16, 0.12), -0.04, 0.05, 0, 0, '#b3322a', 0);
    const hx = -L / 2 + 0.38;
    p.box(hx, 0.3, 0, 0.55, 0.3, B * 0.86, '#f4f1e8');
    p.box(hx, 0.6, 0, 0.45, 0.12, B * 0.8, '#f4f1e8');
    winF(k, hx - 0.22, hx + 0.2, 0.37, 0.06, B * 0.43 + 0.004, 4, 0.6);
    p.cyl(hx - 0.12, 0.72, 0, 0.07, 0.06, 0.2, '#c8302a', { seg: 7 });
    p.box(L * 0.1, 0.3, 0, L * 0.5, 0.1, B * 0.62, '#6f7f5a');
    p.box(L * 0.1, 0.4, 0, L * 0.5, 0.012, B * 0.66, '#4d5a3d', { ao: 0 });
    p.cyl(L / 2 - 0.2, 0.3, 0, 0.012, 0.01, 0.35, '#d9dde0', { seg: 5, ao: 0 });
  });
}

interface CraneOpts {
  s?: number;
  leg?: Col;
  beam?: Col;
  house?: Col;
  /** boom length and its rise above the horizontal (radians) */
  boom?: number;
  angle?: number;
  y?: number;
}

/** A ship-to-shore container crane: A-legs, a portal, a raised lattice boom, a back-reach and stays. Boom points +z (to the water). */
function stsCrane(k: PortKit, x: number, z: number, o: CraneOpts = {}): void {
  const s = o.s ?? 1.5;
  const y = o.y ?? LAND_Y;
  const leg = o.leg ?? '#2c5da8';
  const beam = o.beam ?? '#f1f2ee';
  const p = k.solid;
  const lx = 0.34 * s;
  const lz = 0.4 * s;
  const H = 1.15 * s;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(x + sx * lx, y - 0.1, z + sz * lz, 0.07 * s, H + 0.1, 0.07 * s, leg);
  p.box(x, y + 0.05 * s, z + lz, 2 * lx, 0.05 * s, 0.06 * s, leg, { ao: 0 });
  p.box(x, y + 0.05 * s, z - lz, 2 * lx, 0.05 * s, 0.06 * s, leg, { ao: 0 });
  p.box(x + lx, y + 0.05 * s, z, 0.06 * s, 0.05 * s, 2 * lz, leg, { ao: 0 });
  p.rod([x - lx, y + 0.08 * s, z + lz], [x + lx, y + H * 0.92, z + lz], 0.011 * s, leg, 4);
  p.rod([x + lx, y + 0.08 * s, z + lz], [x - lx, y + H * 0.92, z + lz], 0.011 * s, leg, 4);
  p.rod([x + lx, y + 0.08 * s, z + lz], [x + lx, y + H * 0.92, z - lz], 0.011 * s, leg, 4);
  p.rod([x + lx, y + 0.08 * s, z - lz], [x + lx, y + H * 0.92, z + lz], 0.011 * s, leg, 4);
  // portal: a pale girder frame with the machinery house on top
  p.box(x, y + H - 0.02 * s, z, 2 * lx + 0.1 * s, 0.1 * s, 2 * lz + 0.1 * s, beam);
  p.box(x, y + H + 0.08 * s, z - 0.1 * s, 0.46 * s, 0.22 * s, 0.4 * s, o.house ?? leg);
  const py = y + H + 0.05 * s;
  const a = o.angle ?? 0.75;
  const bl = (o.boom ?? 1.7) * s;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // the boom: a pale girder with two dark edge chords, rising toward the water
  const mid: V3 = [x, py + (sa * bl) / 2, z + lz + (ca * bl) / 2];
  p.box(mid[0], mid[1] - 0.05 * s * ca, mid[2] + 0.05 * s * sa, 0.11 * s, 0.1 * s, bl, beam, { rx: -a, ao: 0 });
  for (const sx of [-1, 1]) p.box(mid[0] + sx * 0.06 * s, mid[1] - 0.05 * s * ca, mid[2] + 0.05 * s * sa, 0.03 * s, 0.11 * s, bl, leg, { rx: -a, ao: 0 });
  const tip: V3 = [x, py + sa * bl, z + lz + ca * bl];
  p.box(tip[0], tip[1] - 0.03 * s, tip[2], 0.16 * s, 0.1 * s, 0.1 * s, '#2f353c', { ao: 0 });
  // back-reach with its counterweight
  p.box(x, py - 0.02 * s, z - 0.5 * s, 0.1 * s, 0.1 * s, 1.0 * s, beam, { ao: 0 });
  p.box(x, py - 0.04 * s, z - 0.95 * s, 0.22 * s, 0.18 * s, 0.2 * s, '#5b636b');
  // the apex and the stays
  const apex: V3 = [x, py + 0.62 * s, z + 0.1 * s];
  p.rod([x - 0.12 * s, py, z + 0.1 * s], apex, 0.012 * s, leg, 4);
  p.rod([x + 0.12 * s, py, z + 0.1 * s], apex, 0.012 * s, leg, 4);
  p.rod(apex, [tip[0], tip[1], tip[2] - 0.05 * s], 0.007 * s, '#2f353c', 3);
  p.rod(apex, [x, py, z - 0.9 * s], 0.007 * s, '#2f353c', 3);
  k.reserve(x, z, 0.5 * s, 0.6 * s);
}

const BOX_PAL = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#2fa3b5'];

/**
 * A block of stacked containers: bodies in runs of three columns, each container a coloured quad on the
 * visible faces (front +z, right +x). x0, z0 = left-front corner; slots are cw wide, cd deep, ch tall.
 */
function boxes(k: PortKit, x0: number, zf: number, nx: number, nz: number, tiers: number, rng: Rng, pal: readonly Col[], o: { y?: number; cw?: number; cd?: number; ch?: number; vary?: number; roof?: Col } = {}): void {
  const p = k.solid;
  const cw = o.cw ?? 0.34;
  const cd = o.cd ?? 0.13;
  const ch = o.ch ?? 0.11;
  const y = o.y ?? k.groundMax(x0 + (nx * cw) / 2, zf - (nz * cd) / 2, (nx * cw) / 2, (nz * cd) / 2) - 0.03;
  const run = 3;
  let colour = pal[rng.int(0, pal.length - 1)];
  for (let i0 = 0; i0 < nx; i0 += run) {
    const g = Math.min(run, nx - i0);
    const t = Math.max(1, tiers - (rng.chance(o.vary ?? 0.4) ? rng.int(1, 2) : 0));
    const bx = x0 + i0 * cw + (g * cw) / 2;
    p.box(bx, y - 0.02, zf - (nz * cd) / 2, g * cw, t * ch + 0.02, nz * cd, o.roof ?? '#8c9096', { ao: 0.2 });
    for (let i = 0; i < g; i++) {
      const cx = x0 + (i0 + i) * cw + cw / 2;
      colour = pal[rng.int(0, pal.length - 1)];
      for (let h = 0; h < t; h++) {
        if (h > 0 && rng.chance(0.3)) colour = pal[rng.int(0, pal.length - 1)];
        const c = tint(colour, (h % 2) * 0.05 - 0.025);
        const yy = y + h * ch + 0.006;
        p.quad([cx - cw * 0.47, yy, zf + 0.003], [cx + cw * 0.47, yy, zf + 0.003], [cx + cw * 0.47, yy + ch * 0.9, zf + 0.003], [cx - cw * 0.47, yy + ch * 0.9, zf + 0.003], c);
      }
    }
    if (i0 + g >= nx) {
      const xr = x0 + nx * cw + 0.003;
      for (let j = 0; j < nz; j++) {
        const cz = zf - j * cd - cd / 2;
        colour = pal[rng.int(0, pal.length - 1)];
        for (let h = 0; h < t; h++) {
          const c = tint(colour, (h % 2) * 0.05 - 0.025);
          const yy = y + h * ch + 0.006;
          p.quad([xr, yy, cz + cd * 0.47], [xr, yy, cz - cd * 0.47], [xr, yy + ch * 0.9, cz - cd * 0.47], [xr, yy + ch * 0.9, cz + cd * 0.47], c);
        }
      }
    }
  }
  k.reserve(x0 + (nx * cw) / 2, zf - (nz * cd) / 2, (nx * cw) / 2 + 0.05, (nz * cd) / 2 + 0.05);
}

/** A tall mast with a lamp head (container yards, quays). */
function lightMast(k: PortKit, x: number, z: number, h: number, y = LAND_Y): void {
  const p = k.solid;
  p.cyl(x, y - 0.05, z, 0.035, 0.022, h, '#cfd3d6', { seg: 6, ao: 0.05 });
  p.box(x, y + h - 0.02, z, 0.34, 0.04, 0.1, '#6b7279', { ao: 0 });
  for (let i = 0; i < 4; i++) k.glow.box(x - 0.13 + i * 0.087, y + h - 0.045, z + 0.055, 0.06, 0.03, 0.02, '#fff6d8');
}

/** A cargo ship alongside with containers on deck (for terminals). */
function boxShip(k: PortKit, x: number, z: number, L: number, hull: Col, rng: Rng, pal: readonly Col[]): void {
  const p = k.solid;
  const B = 1.15;
  k.at(x, 0, z, 0, 1, () => {
    slabPlan(p, plan(L, B, L * 0.12, 0.35), -0.35, 0.34, 0, 0, hull);
    slabPlan(p, plan(L * 1.004, B * 1.01, L * 0.12, 0.35), -0.04, 0.08, 0, 0, '#a8312c', 0);
    // accommodation block and funnel aft
    const hx = -L / 2 + 0.55;
    p.box(hx, 0.34, 0, 0.6, 0.62, B * 0.8, '#f4f1e8');
    winF(k, hx - 0.25, hx + 0.25, 0.5, 0.06, B * 0.4 + 0.004, 4, 0.6);
    winF(k, hx - 0.25, hx + 0.25, 0.7, 0.06, B * 0.4 + 0.004, 4, 0.6);
    winF(k, hx - 0.25, hx + 0.25, 0.9, 0.06, B * 0.4 + 0.004, 4, 0.6);
    p.box(hx + 0.05, 0.96, 0, 0.5, 0.1, B * 0.86, '#dfe3e6');
    p.cyl(hx - 0.12, 1.06, 0, 0.09, 0.08, 0.26, '#c8302a', { seg: 8 });
  });
  // the deck cargo, in two bays (world coordinates: the ship is not turned)
  const x0 = x - L / 2 + 1.35;
  const bays = Math.max(1, Math.floor((L - 2.3) / 2.3));
  for (let b = 0; b < bays; b++) boxes(k, x0 + b * 2.35, z + 0.4, 6, 6, 4 + (b % 2), rng, pal, { y: 0.34, cd: 0.145, ch: 0.11 });
}

// ───────────────────────────── Dover ─────────────────────────────

const CHALK = '#f1f0e8';
const DOVER_H = 3.2;

/** z of the foot of the white cliff at x. */
function doverEdge(x: number): number {
  return -12.4 - 0.45 * noise2(x * 0.6, 4.2, 7) - 0.2 * noise2(x * 1.7, 9.1, 3);
}

const dover: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape.relief = 0.6;
    k.shape.range = 2.0;
    const cv = k.vx(-14);
    const xL = cv - 3.2; // the Eastern cliffs: from here on to the right
    const xW = cv - 11; // the Western Heights: up to here on the left
    k.feature((x, z, h) => {
      const east = smooth(xL - 0.9, xL, x);
      const west = 0.6 * (1 - smooth(xW, xW + 1.0, x));
      const m = Math.max(east, west);
      if (m <= 0) return h;
      const edge = doverEdge(x);
      const wallK = smooth(edge + 0.15, edge - 0.6, z);
      const back = 1 - smooth(-17.5, -25, z);
      return h + DOVER_H * m * wallK * back;
    });
    k.paint((x, y, z, slope, c) => {
      if (y < 0.45 || z < -22) return;
      const face = smooth(0.05, 0.14, slope);
      if (face <= 0) return;
      const n = 0.93 + 0.1 * noise2(x * 1.4, y * 2.6, 5);
      c.lerp(c.clone().set(CHALK).multiplyScalar(n), face);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cv = k.vx(-15.4);
    const y0 = LAND_Y + DOVER_H;
    const x0 = cv + 1.4;
    const z0 = -15.8;
    k.plateau(x0, z0, 5.4, 2.9, y0, 0.4);
    const p = k.solid;
    const stone = '#d8ceb2';
    const dk = '#b9b098';
    // the outer curtain wall with its mural towers and the Constable's Gate
    wall(p, x0, y0, z0 + 1.35, 7.2, 0.4, 0.16, dk);
    wall(p, x0 - 3.6, y0, z0 - 0.1, 0.16, 0.4, 2.9, dk);
    wall(p, x0 + 3.6, y0, z0 - 0.1, 0.16, 0.4, 2.9, dk);
    for (const dx of [-3.6, -2.5, -0.3, 0.8, 1.9, 3.0, 3.6]) squareTower(p, x0 + dx, y0, z0 + 1.35, 0.34, 0.78, dk);
    for (const dx of [-1.2, -0.8]) {
      p.cyl(x0 + dx, y0 - 0.2, z0 + 1.45, 0.2, 0.19, 1.0, stone, { seg: 10 });
      p.cyl(x0 + dx, y0 + 0.78, z0 + 1.45, 0.24, 0.24, 0.07, tint(stone, 0.08), { seg: 10, ao: 0 });
      p.cone(x0 + dx, y0 + 0.85, z0 + 1.45, 0.25, 0.3, '#5d6b78', { seg: 10 });
    }
    p.box(x0 - 1.0, y0, z0 + 1.45, 0.34, 0.5, 0.2, '#2c2f36', { ao: 0 });
    // the inner curtain
    wall(p, x0, y0, z0 + 0.75, 4.6, 0.85, 0.2, stone);
    wall(p, x0 - 2.3, y0, z0 - 0.15, 0.2, 0.85, 1.8, stone);
    wall(p, x0 + 2.3, y0, z0 - 0.15, 0.2, 0.85, 1.8, stone);
    for (const dx of [-2.3, -1.15, 0, 1.15, 2.3]) squareTower(p, x0 + dx, y0, z0 + 0.75, 0.4, 1.2, stone);
    for (const dx of [-2.3, 2.3]) squareTower(p, x0 + dx, y0, z0 - 1.05, 0.4, 1.2, stone);
    // the Great Tower (Henry II's keep) with four corner turrets
    const kx = x0 + 0.15;
    const kz = z0 - 0.3;
    const kw = 1.8;
    const kd = 1.5;
    const kh = 2.7;
    p.box(kx, y0 - 0.2, kz, kw, kh + 0.2, kd, '#e0d6bb');
    p.box(kx, y0 + kh - 0.02, kz, kw + 0.1, 0.06, kd + 0.1, '#cfc5aa', { ao: 0 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      squareTower(p, kx + sx * (kw / 2 - 0.02), y0 + 1.3, kz + sz * (kd / 2 - 0.02), 0.44, kh - 1.3 + 0.4, '#d6ccaf');
    }
    for (const yy of [0.95, 1.65]) p.box(kx, y0 + yy, kz, kw + 0.04, 0.04, kd + 0.04, '#eee6cf', { ao: 0 });
    for (const yy of [1.12, 1.82]) {
      winF(k, kx - 0.6, kx + 0.6, y0 + yy, 0.28, kz + kd / 2 + 0.004, 3, 0.4);
      winS(k, kz - 0.35, kz + 0.35, y0 + yy, 0.28, kx + kw / 2 + 0.004, 2, 0.4);
    }
    // the forebuilding with its stair
    p.box(kx + 0.5, y0, kz + kd / 2 + 0.2, 0.7, 0.8, 0.4, '#d6ccaf');
    p.prism(kx + 0.5, y0 + 0.8, kz + kd / 2 + 0.2, 0.74, 0.18, 0.44, '#7b5a4a', { ry: Math.PI / 2 });
    // a flagstaff on the north-west turret
    p.cyl(kx - kw / 2 + 0.2, y0 + kh + 0.4, kz - kd / 2 + 0.2, 0.012, 0.01, 0.7, '#d9dde0', { seg: 4, ao: 0 });
    p.quad([kx - kw / 2 + 0.21, y0 + kh + 0.82, kz - kd / 2 + 0.2], [kx - kw / 2 + 0.55, y0 + kh + 0.78, kz - kd / 2 + 0.2], [kx - kw / 2 + 0.55, y0 + kh + 1.0, kz - kd / 2 + 0.2], [kx - kw / 2 + 0.21, y0 + kh + 1.04, kz - kd / 2 + 0.2], '#c8302a', true);
    // the Roman pharos beside St Mary in Castro
    const px = x0 + 2.95;
    const pz = z0 - 0.3;
    p.cyl(px, y0 - 0.2, pz, 0.27, 0.22, 1.5, '#cfc7b0', { seg: 8 });
    p.cyl(px, y0 + 1.3, pz, 0.26, 0.26, 0.05, '#bdb59c', { seg: 8, ao: 0 });
    p.cyl(px, y0 + 1.35, pz, 0.18, 0.15, 0.28, '#d8d0b8', { seg: 8 });
    winF(k, px - 0.05, px + 0.05, y0 + 0.55, 0.16, pz + 0.24, 1, 0.9);
    const cxn = x0 - 2.4;
    p.box(cxn, y0 - 0.1, z0 - 0.1, 0.9, 0.5, 0.42, '#d9d0b7');
    p.prism(cxn, y0 + 0.4, z0 - 0.1, 0.46, 0.22, 0.94, '#6b4a42', { ry: Math.PI / 2 });
    squareTower(p, cxn + 0.5, y0, z0 - 0.1, 0.26, 0.9, '#d9d0b7', '#5d6b78');
    k.reserve(x0, z0, 5.6, 3.1);
    k.reserve(x0 + 8, -15.8, 14, 2.6);
    k.reserve(cv - 20, -15.8, 10, 2.6);
    // chalk boulders and shingle along the foot of the cliffs
    const xs = cv - 3.6;
    for (let x = xs; x < xs + 17; x += 0.5 + rng.next() * 0.3) {
      const rz = doverEdge(x) + 0.3 + rng.next() * 0.25;
      const g = k.ground(x, rz);
      if (g < -0.12) continue;
      p.rock(x, g - 0.04, rz, rng.range(0.1, 0.22), rng.chance(0.6) ? '#ebe9df' : '#d6d3c6', { sy: 0.7, ry: rng.next() * 6, ao: 0.1 });
    }
    // the cross-channel ferry in the harbour
    liner(k, cv - 5.4, -10.4, { L: 4.4, B: 0.9, hull: '#1f3f6e', funnel: '#2c5da8', band: '#f4f1e8', decks: 3, boot: '#b3322a', fx: -0.12 });
  },
  rows: 3,
  quiet: true,
};

// ───────────────────────────── Felixstowe ─────────────────────────────

const felixstowe: Landmark = {
  terrain(k) {
    k.shape.relief = 0.25;
    k.shape.range = 0.7;
    k.shape.rise = 7;
    const cx = k.vx(-16);
    k.plateau(cx, -17.2, 14, 4.8, LAND_Y, 0.4);
    k.paint((x, y, z, s, c) => {
      if (z < -12.25 && z > -19.2 && Math.abs(x - cx) < 9.6) c.set('#b3b1a8').multiplyScalar(0.96 + 0.06 * noise2(x * 0.8, z * 0.8, 3));
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14);
    const p = k.solid;
    // quay rails and ship-to-shore cranes: blue legs, white booms, raised
    p.box(cx, LAND_Y, -12.7, 18, 0.025, 0.05, '#4a4f55', { ao: 0 });
    p.box(cx, LAND_Y, -13.6, 18, 0.025, 0.05, '#4a4f55', { ao: 0 });
    const ang = [0.95, 0.7, 1.05, 0.8, 0.95, 0.7, 1.0];
    for (let i = 0; i < 7; i++) stsCrane(k, cx - 5.4 + i * 1.8, -13.15, { s: 1.35 + (i % 3) * 0.05, leg: '#2c5da8', beam: '#f4f6f6', house: '#2c5da8', angle: ang[i] });
    // the stacks: long blocks parallel to the quay, tall and every colour
    for (let row = 0; row < 3; row++) {
      const zf = -14.75 - row * 1.55;
      let x = cx - 7.2 + (row % 2) * 0.5;
      while (x < cx + 6.6) {
        const nx = rng.int(8, 13);
        boxes(k, x, zf, nx, 3, 5 - (row === 1 ? 1 : 0), rng, BOX_PAL, { vary: 0.5 });
        x += nx * 0.34 + 0.6;
      }
    }
    for (let i = 0; i < 4; i++) lightMast(k, cx - 5.5 + i * 3.7, -15.5, 2.3);
    // sheds and a few turbines behind the yard
    for (let i = 0; i < 3; i++) {
      const sx = cx - 5 + i * 5;
      const sy = LAND_Y;
      p.box(sx, sy - 0.1, -20.3, 3.0, 0.9, 1.3, i === 1 ? '#c9c7bf' : '#aeb4ba');
      p.prism(sx, sy + 0.78, -20.3, 3.04, 0.22, 1.32, '#7c8892', { ry: Math.PI / 2 });
      winF(k, sx - 1.3, sx + 1.3, sy + 0.4, 0.2, -20.3 + 0.65 + 0.004, 8, 0.6);
    }
    k.reserve(cx, -17.6, 9, 3.7);
    turbine(k, cx - 6.8, -23.2, 2.2, LAND_Y - 0.02);
    turbine(k, cx + 5.4, -24.5, 2.0, LAND_Y - 0.02);
    turbine(k, cx + 9.5, -22.5, 2.1, LAND_Y - 0.02);
    // a laden container ship under the cranes
    boxShip(k, cx + 0.3, -10.4, 6.4, '#27384f', rng, BOX_PAL);
  },
  rows: 0,
  quiet: true,
  flag: { dx: -7.3, z: -12.5 },
};

// ───────────────────────────── Southampton ─────────────────────────────

const southampton: Landmark = {
  terrain(k) {
    k.shape.relief = 0.7;
    k.shape.range = 1.8;
    const cx = k.vx(-12.8);
    k.plateau(cx + 6.2, -14.4, 4.6, 2.2, LAND_Y, 0.4);
    k.plateau(cx - 8, -14.2, 4.2, 2.0, LAND_Y, 0.4);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-12.8);
    liner(k, cx + 0.7, -11.15, { L: 8.8, B: 1.35, hull: '#1b2d54', funnel: '#f4f1e8', band: '#c8302a', decks: 7, boot: '#a8312c', fx: -0.1, fs: 1.45, dh: 0.22, ht: 0.58 });
    // the container berth to the left: pale grey cranes with low booms, blue and grey stacks
    for (let i = 0; i < 3; i++) stsCrane(k, cx - 6.4 - i * 1.7, -13.1, { s: 1.35, leg: '#9aa4ad', beam: '#eceff1', house: '#c8d0d6', angle: 0.35, boom: 1.9 });
    k.reserve(cx - 8, -13.4, 4, 1.4);
    const pal = ['#2c5da8', '#3b6ea8', '#9aa4ad', '#d9d4c7', '#1f3f6e', '#c8302a'];
    k.reserve(cx + 6.0, -13.8, 4.2, 1.9);
    for (let row = 0; row < 2; row++) {
      for (let b = 0; b < 2; b++) boxes(k, cx + 3.4 + row * 0.2 + b * 2.4, -13.0 - row * 1.5, 6, 3, 5, rng, pal);
    }
    lightMast(k, cx + 3.0, -14.4, 2.1);
    lightMast(k, cx + 8.4, -14.4, 2.1);
  },
  rows: 3,
  quiet: true,
  mole: 'none',
  flag: { dx: -3.9, z: -12.4 },
};

// ───────────────────────────── shared industrial bits ─────────────────────────────

/** A tapering four-legged lattice tower: legs, ring beams and X bracing on all four faces. */
function lattice(p: Part, x: number, y: number, z: number, w0: number, d0: number, w1: number, d1: number, h: number, col: Col, bays: number, rl = 0.03, rb = 0.014): void {
  const at = (t: number, sx: number, sz: number): V3 => [x + (sx * lerp(w0, w1, t)) / 2, y + t * h, z + (sz * lerp(d0, d1, t)) / 2];
  const cs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of cs) p.rod(at(0, sx, sz), at(1, sx, sz), rl, col, 5);
  for (let b = 0; b <= bays; b++) {
    const t = b / bays;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i];
      const [bx, bz] = cs[(i + 1) % 4];
      p.rod(at(t, ax, az), at(t, bx, bz), rb * 1.25, col, 4);
      if (b < bays) {
        const t2 = (b + 1) / bays;
        p.rod(at(t, ax, az), at(t2, bx, bz), rb, col, 4);
        p.rod(at(t, bx, bz), at(t2, ax, az), rb, col, 4);
      }
    }
  }
}

/** A Warren truss girder along x between x0 and x1 (front and back planes), chords at yb..yt. */
function truss(p: Part, x0: number, x1: number, z: number, yb: number, yt: number, wid: number, col: Col, panels: number, r = 0.014): void {
  const len = x1 - x0;
  const pn = len / panels;
  const cx = (x0 + x1) / 2;
  for (const s of [-1, 1]) {
    const zz = z + (s * wid) / 2;
    p.box(cx, yt - 0.03, zz - 0.03, len, 0.06, 0.06, col, { ao: 0 });
    p.box(cx, yb, zz - 0.03, len, 0.05, 0.06, col, { ao: 0 });
    for (let i = 0; i < panels; i++) {
      const xa = x0 + i * pn;
      p.rod([xa, yb + 0.02, zz], [xa + pn / 2, yt - 0.02, zz], r, col, 4);
      p.rod([xa + pn / 2, yt - 0.02, zz], [xa + pn, yb + 0.02, zz], r, col, 4);
    }
  }
  p.box(cx, yt - 0.01, z - wid / 2, len, 0.02, wid, tint(col, -0.12), { ao: 0 });
  p.box(cx, yb, z - wid / 2, len, 0.025, wid, tint(col, -0.12), { ao: 0 });
}

/** A storage tank with a conical roof, a darker rim and a ladder stripe. */
function tank(k: PortKit, x: number, z: number, r: number, h: number, col: Col, y = k.groundMax(x, z, r, r) - 0.02): void {
  const p = k.solid;
  p.cyl(x, y - 0.1, z, r, r, h + 0.1, col, { seg: 14 });
  p.cyl(x, y + h, z, r * 1.02, r * 1.02, 0.04, tint(col, -0.18), { seg: 14, ao: 0 });
  p.cone(x, y + h + 0.04, z, r * 0.99, r * 0.22, tint(col, -0.05), { seg: 14 });
  p.box(x + r * 0.7, y, z + r * 0.72, 0.035, h, 0.02, '#8a9097', { ao: 0 });
  k.reserve(x, z, r + 0.05, r + 0.05);
}

/** A distillation column with platform rings. */
function column(k: PortKit, x: number, z: number, r: number, h: number, col: Col = '#c9cfd3', y = k.groundMax(x, z, r, r) - 0.02): void {
  const p = k.solid;
  p.cyl(x, y - 0.1, z, r, r, h + 0.1, col, { seg: 10 });
  p.cone(x, y + h, z, r, r * 1.4, tint(col, -0.08), { seg: 10 });
  for (let i = 1; i < 5; i++) p.cyl(x, y + (h * i) / 5, z, r * 1.35, r * 1.35, 0.025, '#7d858c', { seg: 10, ao: 0 });
  p.box(x + r + 0.02, y, z + r * 0.4, 0.03, h, 0.03, '#7d858c', { ao: 0 });
  k.reserve(x, z, r + 0.1, r + 0.1);
}

/** A flare stack: a lattice-ringed pipe with a burning tip. */
function flare(k: PortKit, x: number, z: number, h: number, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  p.cyl(x, y - 0.1, z, 0.1, 0.055, h + 0.1, '#a9b0b6', { seg: 6 });
  for (let i = 1; i < 7; i++) p.cyl(x, y + (h * i) / 7, z, 0.085, 0.085, 0.025, '#6b737a', { seg: 6, ao: 0 });
  p.box(x + 0.09, y, z, 0.03, h, 0.03, '#6b737a', { ao: 0 });
  k.glow.cone(x, y + h - 0.02, z, 0.16, 0.7, '#ff7a22', { seg: 6 });
  k.glow.cone(x, y + h - 0.02, z, 0.09, 0.46, '#ffe28a', { seg: 6 });
  k.reserve(x, z, 0.2, 0.2);
}

/** A tall striped chimney, optionally with a plume of steam. */
function chimney(k: PortKit, x: number, z: number, h: number, r: number, c1: Col, c2: Col, o: { y?: number; plume?: boolean } = {}): void {
  const p = k.solid;
  const y = o.y ?? k.ground(x, z) - 0.02;
  const rr = (t: number) => r * (1 - 0.38 * t);
  p.cyl(x, y - 0.1, z, r, r * 0.62, h + 0.1, c1, { seg: 10 });
  for (let i = 0; i < 3; i++) {
    const t = 0.6 + i * 0.13;
    p.cyl(x, y + h * t, z, rr(t) * 1.04, rr(t + 0.07) * 1.04, h * 0.07, c2, { seg: 10, ao: 0 });
  }
  p.cyl(x, y + h, z, r * 0.62, r * 0.62, 0.02, '#3d4046', { seg: 10, ao: 0 });
  if (o.plume) {
    p.blob(x + 0.06, y + h + 0.22, z, r * 1.5, '#f2f4f4', { sy: 0.8 });
    p.blob(x + 0.2, y + h + 0.52, z, r * 1.9, '#f7f9f9', { sy: 0.75 });
    p.blob(x + 0.4, y + h + 0.86, z, r * 1.6, '#eef2f3', { sy: 0.7 });
  }
  k.reserve(x, z, r + 0.05, r + 0.05);
}

/** A hyperbolic cooling tower with a plume. */
function cooling(k: PortKit, x: number, z: number, s: number, y = k.groundMax(x, z, 0.5 * s, 0.5 * s) - 0.02): void {
  const p = k.solid;
  const col = '#d8d5cc';
  p.lathe(x, y - 0.1, z, [[0.55 * s, 0], [0.5 * s, 0.4 * s], [0.4 * s, 1.0 * s], [0.34 * s, 1.5 * s], [0.36 * s, 1.9 * s], [0.4 * s, 2.15 * s]], col, { seg: 14 });
  p.cyl(x, y + 2.13 * s, z, 0.4 * s, 0.4 * s, 0.03, '#9aa0a3', { seg: 14, ao: 0 });
  p.blob(x, y + 2.35 * s, z, 0.34 * s, '#f6f8f8', { sy: 0.8 });
  p.blob(x + 0.12 * s, y + 2.65 * s, z, 0.26 * s, '#fbfcfc', { sy: 0.8 });
  k.reserve(x, z, 0.6 * s, 0.6 * s);
}

/** A sloping pipe rack: a long low box with a few coloured pipes along it. */
function pipeRack(k: PortKit, x: number, z: number, len: number, y = k.ground(x, z)): void {
  const p = k.solid;
  p.box(x, y - 0.05, z, len, 0.07, 0.34, '#6b737a');
  for (let i = 0; i < 4; i++) p.box(x, y + 0.08 + (i % 2) * 0.05, z - 0.11 + i * 0.075, len, 0.04, 0.04, ['#c9c5ba', '#c8302a', '#9aa4ad', '#e9a31a'][i], { ao: 0 });
  for (let i = 0; i <= Math.floor(len / 0.8); i++) p.box(x - len / 2 + 0.05 + i * 0.8, y - 0.1, z, 0.045, 0.2, 0.3, '#7d858c', { ao: 0 });
  k.reserve(x, z, len / 2, 0.22);
}

/** A trawler / fishing boat afloat: hull, wheelhouse, mast and gantry. */
function trawler(k: PortKit, x: number, z: number, L: number, hull: Col, house: Col, ry = 0): void {
  const p = k.solid;
  const B = L * 0.3;
  k.at(x, 0, z, ry, 1, () => {
    slabPlan(p, plan(L, B, L * 0.24, 0.1), -0.2, 0.2, 0, 0, hull);
    slabPlan(p, plan(L * 1.004, B * 1.012, L * 0.24, 0.1), 0.15, 0.22, 0, 0, '#f1ece0', 0);
    p.box(L * 0.18, 0.2, 0, L * 0.26, 0.28, B * 0.76, house);
    p.box(L * 0.18, 0.48, 0, L * 0.3, 0.03, B * 0.82, '#eee9dc', { ao: 0 });
    p.box(L * 0.18 + L * 0.13 + 0.004, 0.3, 0, 0.01, 0.1, B * 0.6, '#27333f', { ao: 0 });
    p.cyl(L * 0.08, 0.48, 0, 0.015, 0.012, 0.45, '#5b4636', { seg: 5, ao: 0 });
    p.rod([-L * 0.38, 0.2, -B * 0.4], [-L * 0.3, 0.62, 0], 0.012, '#5b4636', 4);
    p.rod([-L * 0.38, 0.2, B * 0.4], [-L * 0.3, 0.62, 0], 0.012, '#5b4636', 4);
    p.box(-L * 0.3, 0.6, 0, 0.03, 0.03, B * 0.45, '#5b4636', { ao: 0 });
    p.box(-L * 0.12, 0.2, 0, 0.2, 0.1, 0.16, '#d9d4c7');
  });
}

/** A jetty or pier on piles: a deck from (x0, z0) to (x1, z1) with a pile under every stride. */
function pier(k: PortKit, x0: number, z0: number, x1: number, z1: number, w: number, top: number, deck: Col, pile: Col): void {
  const p = k.solid;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(-(z1 - z0), x1 - x0);
  p.box((x0 + x1) / 2, top - 0.06, (z0 + z1) / 2, len, 0.06, w, deck, { ry: ang });
  const n = Math.max(2, Math.round(len / 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = lerp(x0, x1, t);
    const pz = lerp(z0, z1, t);
    for (const s of [-1, 1]) {
      const ox = Math.sin(ang) * (w / 2 - 0.03) * s;
      const oz = Math.cos(ang) * (w / 2 - 0.03) * s;
      p.box(px + ox, -0.9, pz + oz, 0.05, 0.9 + top - 0.06, 0.05, pile, { ao: 0.05 });
    }
  }
}

/** Grass and mud on the banks of a carved channel (the rock colour would turn them into grey cliffs). */
function paintBanks(k: PortKit, cx: number, half: number, zBack: number, bankW = 0.9): void {
  k.paint((x, y, z, slope, c) => {
    if (z > SHORE_Z - 0.1 || z < zBack) return;
    if (Math.abs(x - cx) > half + bankW + 0.1) return;
    c.set(y < 0.05 ? '#8f9a68' : '#a4b36e').multiplyScalar(0.95 + 0.08 * noise2(x * 1.3, z * 1.3, 11));
  });
}

// ───────────────────────────── Teesport ─────────────────────────────

const teesport: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape.relief = 0.5;
    k.shape.range = 1.4;
    const xr = k.vx(-15.2) + 0.3;
    k.plateau(xr - 9, -20.5, 5, 3.4, LAND_Y, 0.4);
    k.plateau(xr + 9, -20.5, 5, 3.4, LAND_Y, 0.4);
    carve(k, xr, 3.0, -36, 1.6);
    paintBanks(k, xr, 3.0, -36, 1.6);
  },
  build(k) {
    const xr = k.vx(-15.2) + 0.3;
    const z = -15.2;
    const p = k.solid;
    const steel = '#3f6ea5';
    const light = '#6f98c4';
    const xA = xr - 4.15;
    const xB = xr + 4.15;
    const th = 5.0;
    for (const tx of [xA, xB]) {
      const y0 = k.groundMax(tx, z, 0.6, 0.5) - 0.04;
      p.box(tx, y0 - 0.2, z, 1.25, 0.4, 1.05, '#9d9a90');
      lattice(p, tx, y0 + 0.15, z, 0.9, 0.8, 0.46, 0.42, th, steel, 5, 0.035, 0.016);
      p.box(tx, y0 + th + 0.12, z, 0.62, 0.1, 0.55, light);
      p.box(tx, y0 + th + 0.22, z, 0.34, 0.14, 0.3, '#f1f2ee');
      k.reserve(tx, z, 0.7, 0.6);
    }
    // the high-level girder, cantilevering past both towers, stayed from the tower heads
    const yt = k.groundMax(xA, z, 0.6, 0.5) - 0.04 + th + 0.1;
    const yb = yt - 0.46;
    const gx0 = xA - 1.9;
    const gx1 = xB + 1.9;
    truss(p, gx0, gx1, z, yb, yt, 0.46, light, 24, 0.016);
    for (const [tx, dirs] of [[xA, [-1.9, 2.3]], [xB, [1.9, -2.3]]] as Array<[number, number[]]>) {
      for (const dx of dirs) for (const s of [-1, 1]) p.rod([tx, yt + 0.32, z + s * 0.1], [tx + dx, yt - 0.04, z + s * 0.23], 0.013, '#c9d4de', 4);
    }
    // the gondola hangs from a trolley by cables
    const gx = xr + 0.5;
    const gy = 0.42;
    p.box(gx, yb - 0.14, z, 0.55, 0.1, 0.3, '#2f353c');
    for (const dx of [-0.55, 0.55]) for (const s of [-1, 1]) p.rod([gx + dx * 0.45, yb - 0.14, z + s * 0.13], [gx + dx, gy + 0.06, z + s * 0.2], 0.011, '#2f353c', 4);
    p.box(gx, gy - 0.02, z, 1.4, 0.07, 0.5, '#59636d');
    p.box(gx - 0.35, gy + 0.05, z, 0.44, 0.3, 0.36, '#f4f1e8');
    p.box(gx - 0.35, gy + 0.35, z, 0.5, 0.04, 0.42, '#c8302a', { ao: 0 });
    winF(k, gx - 0.52, gx - 0.18, gy + 0.18, 0.1, z + 0.18 + 0.004, 3, 0.6);
    p.box(gx + 0.38, gy + 0.05, z, 0.4, 0.17, 0.26, '#e9a31a');
    p.box(gx + 0.62, gy + 0.05, z, 0.18, 0.1, 0.26, '#c8302a');
    // chemical works on both banks: tanks and a stack on the left, cooling towers, stacks and a flare on the right
    const L = xr - 8.8;
    const R = xr + 8.4;
    tank(k, L - 1.4, -18.4, 0.62, 0.8, '#eceae2');
    tank(k, L + 0.1, -18.6, 0.52, 0.65, '#d9dde0');
    tank(k, L - 0.6, -20.2, 0.7, 0.9, '#eceae2');
    tank(k, L + 1.4, -20.0, 0.5, 0.6, '#cfd4d8');
    chimney(k, L + 2.4, -19.6, 3.1, 0.14, '#cfc9bc', '#c8302a', { plume: true });
    column(k, L - 2.4, -19.6, 0.17, 2.0);
    pipeRack(k, L, -17.2, 3.6);
    cooling(k, R + 1.1, -20.6, 1.15);
    cooling(k, R - 0.7, -21.6, 1.0);
    chimney(k, R - 2.2, -18.8, 3.4, 0.16, '#d9d4c7', '#2c5da8');
    chimney(k, R - 1.6, -19.9, 2.5, 0.12, '#d9d4c7', '#c8302a');
    flare(k, R + 3.0, -18.6, 3.0);
    tank(k, R + 0.2, -18.3, 0.5, 0.6, '#eceae2');
    pipeRack(k, R + 1.2, -16.9, 3.0);
    for (let i = 0; i < 3; i++) factory(k, L - 2.8 + i * 1.5, -22.8, 1.2, 0.9, 0.5, '#bdb5a8', '#7f8a92');
  },
  rows: 1,
  quiet: true,
  townShift: 4,
  flag: { dx: -5.6, z: -12.5 },
};

// ───────────────────────────── Grimsby ─────────────────────────────

const grimsby: Landmark = {
  terrain(k) {
    k.shape.relief = 0.5;
    k.shape.range = 1.2;
    const cx = k.vx(-14.4) + 0.4;
    k.plateau(cx, -14.4, 3.6, 2.4, LAND_Y, 0.4);
    k.paint((x, y, z, s, c) => {
      if (z < -12.3 && z > -15.8 && Math.abs(x - cx) < 3.7) c.set('#b9b5a8').multiplyScalar(0.95 + 0.07 * noise2(x * 1.1, z * 1.1, 9));
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14.4) + 0.4;
    const z = -14.4;
    const y = LAND_Y - 0.02;
    const p = k.solid;
    const brick = '#a8553c';
    const stone = '#d9cdb0';
    // the Dock Tower: a slender Italianate campanile in red brick
    p.box(cx, y - 0.2, z, 1.1, 0.5, 1.1, '#c8bfa6');
    p.box(cx, y + 0.28, z, 0.92, 0.07, 0.92, stone, { ao: 0 });
    const sh = 3.7;
    const sy = y + 0.35;
    const w = 0.64;
    p.box(cx, sy, z, w, sh, w, brick);
    for (let i = 0; i < 7; i++) p.box(cx, sy + 0.4 + i * 0.5, z, w + 0.045, 0.045, w + 0.045, stone, { ao: 0 });
    for (let i = 0; i < 6; i++) {
      const yy = sy + 0.5 + i * 0.52;
      p.quad([cx - 0.065, yy, z + w / 2 + 0.003], [cx + 0.065, yy, z + w / 2 + 0.003], [cx + 0.065, yy + 0.3, z + w / 2 + 0.003], [cx - 0.065, yy + 0.3, z + w / 2 + 0.003], stone);
      winF(k, cx - 0.04, cx + 0.04, yy + 0.02, 0.26, z + w / 2 + 0.006, 1, 1);
      p.quad([w / 2 + cx + 0.003, yy, z + 0.065], [w / 2 + cx + 0.003, yy, z - 0.065], [w / 2 + cx + 0.003, yy + 0.3, z - 0.065], [w / 2 + cx + 0.003, yy + 0.3, z + 0.065], stone);
      winS(k, z - 0.04, z + 0.04, yy + 0.02, 0.26, cx + w / 2 + 0.006, 1, 1);
    }
    // the clock stage and the corbelled gallery
    const gy = sy + sh;
    p.box(cx, gy - 0.02, z, w + 0.2, 0.1, w + 0.2, stone);
    p.box(cx, gy + 0.08, z, w + 0.12, 0.05, w + 0.12, tint(stone, -0.06), { ao: 0 });
    // the open loggia: dark inside, slender pale columns and corner piers
    const ly = gy + 0.13;
    const lh = 0.62;
    p.box(cx, ly, z, w, lh, w, '#37312d');
    const lw = w + 0.1;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(cx + dx * (lw / 2 - 0.04), ly, z + dz * (lw / 2 - 0.04), 0.09, lh, 0.09, stone);
    for (const f of [-1, 1]) {
      p.cyl(cx + f * 0.14, ly, z + lw / 2 - 0.05, 0.022, 0.022, lh - 0.1, stone, { seg: 6, ao: 0 });
      p.cyl(cx + lw / 2 - 0.05, ly, z + f * 0.14, 0.022, 0.022, lh - 0.1, stone, { seg: 6, ao: 0 });
    }
    p.box(cx, ly + lh - 0.1, z + lw / 2 - 0.05, lw, 0.1, 0.06, stone, { ao: 0 });
    p.box(cx + lw / 2 - 0.05, ly + lh - 0.1, z, 0.06, 0.1, lw, stone, { ao: 0 });
    p.box(cx, ly + lh, z, lw + 0.12, 0.07, lw + 0.12, stone);
    p.pyramid(cx, ly + lh + 0.07, z, lw + 0.14, 1.0, lw + 0.14, '#5f7f78');
    p.cyl(cx, ly + lh + 0.95, z, 0.01, 0.008, 0.4, '#d6d9dc', { seg: 4, ao: 0 });
    p.ball(cx, ly + lh + 1.33, z, 0.03, '#e8b923');
    k.reserve(cx, z, 0.8, 0.8);
    // low brick dock offices on either side of the tower's yard, and a few crates
    for (const [dx, bw, bz] of [[-2.0, 1.6, -13.2], [2.1, 1.7, -13.3]] as Array<[number, number, number]>) {
      const bx = cx + dx;
      const by = k.groundMax(bx, bz, bw / 2, 0.35) - 0.03;
      p.box(bx, by - 0.1, bz, bw, 0.55 + 0.1, 0.7, dx < 0 ? '#9c4f3a' : '#a65a42');
      p.box(bx, by + 0.28, bz + 0.351, bw + 0.02, 0.04, 0.012, stone, { ao: 0 });
      p.prism(bx, by + 0.55, bz, 0.76, 0.26, bw + 0.06, '#4a4f58', { ry: Math.PI / 2 });
      winF(k, bx - bw / 2 + 0.12, bx + bw / 2 - 0.12, by + 0.1, 0.16, bz + 0.354, Math.round(bw / 0.28), 0.55);
      winF(k, bx - bw / 2 + 0.12, bx + bw / 2 - 0.12, by + 0.34, 0.14, bz + 0.354, Math.round(bw / 0.28), 0.55);
      k.reserve(bx, bz, bw / 2 + 0.05, 0.4);
    }
    k.reserve(cx, -13.9, 3.4, 1.7);
    // the fishing fleet at the quay
    const cols: Array<[Col, Col]> = [['#2c5da8', '#f1ece0'], ['#c8302a', '#f4f0e6'], ['#3f8d6b', '#f4f0e6'], ['#23272e', '#f1ece0'], ['#e9a31a', '#f4f0e6'], ['#7a4a8c', '#f4f0e6'], ['#c8302a', '#f4f0e6']];
    for (let i = 0; i < 7; i++) {
      const bx = cx - 5.6 + i * 1.75 + rng.range(-0.2, 0.2);
      trawler(k, bx, -11.0 - (i % 2) * 0.7, 1.55 + rng.range(-0.1, 0.2), cols[i][0], cols[i][1], rng.range(-0.05, 0.05));
    }
    // wind turbines on the Humber bank
    for (const [tx, tz, h] of [[cx - 6.5, -20.5, 2.1], [cx + 5.6, -21.5, 2.3], [cx - 2.2, -26.0, 2.0], [cx + 9.2, -19.5, 2.1]] as Array<[number, number, number]>) turbine(k, tx, tz, h);
  },
  rows: 3,
  quiet: true,
  townShift: 0,
  flag: { dx: 5.8, z: -12.7 },
};

// ───────────────────────────── Aberdeen ─────────────────────────────

const GRANITE: HouseStyle = {
  walls: ['#a9acaf', '#b6b8ba', '#9ea1a4', '#c0c2c3', '#adb0a8'],
  roofs: ['#3f464f', '#454c56', '#383e47'],
  trim: '#dfe0e0',
  win: '#212a36',
  floors: [3, 4],
  floorH: 0.19,
  w: [0.3, 0.46],
  d: [0.4, 0.55],
  roofKinds: [['gable', 7], ['front', 2], ['hip', 1]],
  pitch: 0.5,
  chimney: 0.9,
  gap: [0, 0.01],
  door: '#3a2f2f',
  runs: true,
};

const aberdeen: Landmark = {
  terrain(k) {
    k.shape.relief = 1.1;
    k.shape.range = 2.4;
    k.palette = { ...k.palette, land: '#93ad6c', land2: '#9fb673', hill: '#7e9a62' };
    const cx = k.vx(-13.6);
    k.plateau(cx, -13.8, 3.8, 1.2, LAND_Y, 0.4);
    // the Girdle Ness headland
    k.bump(cx - 6.6, -11.5, 1.7, 1.5, 1.3);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-13.6);
    const z = -13.8;
    const p = k.solid;
    const gr = '#b9bdc1';
    const gd = '#9ea2a7';
    const gl = '#d2d5d8';
    const y = LAND_Y - 0.02;
    // Marischal College: a long Gothic granite front with a pinnacle on every buttress and a tall central tower
    const W = 5.6;
    const D = 0.8;
    const hh = 1.35;
    p.box(cx, y - 0.2, z, W, hh + 0.2, D, gr);
    p.box(cx, y + 0.28, z + D / 2 + 0.01, W + 0.02, 0.05, 0.02, gd, { ao: 0 });
    p.box(cx, y + 0.78, z + D / 2 + 0.01, W + 0.02, 0.04, 0.02, gl, { ao: 0 });
    p.box(cx, y + hh - 0.04, z, W + 0.1, 0.08, D + 0.1, gl, { ao: 0 });
    const bays = 22;
    const bw = W / bays;
    for (let i = 0; i < bays; i++) {
      const bx = cx - W / 2 + (i + 0.5) * bw;
      if (Math.abs(bx - cx) < 0.62) continue;
      // buttress, then a pointed window on each of three floors
      p.box(bx - bw / 2, y, z + D / 2, 0.035, hh, 0.045, gd, { ao: 0 });
      p.pyramid(bx - bw / 2, y + hh + 0.04, z + D / 2 - 0.04, 0.08, 0.3, 0.08, gl);
      for (const [fy, fh] of [[0.1, 0.2], [0.42, 0.3], [0.9, 0.22]] as Array<[number, number]>) {
        const zf = z + D / 2 + 0.004;
        const hw = bw * 0.26;
        k.lit.quad([bx - hw, y + fy, zf], [bx + hw, y + fy, zf], [bx + hw, y + fy + fh, zf], [bx - hw, y + fy + fh, zf], '#000');
        k.lit.tri([bx - hw, y + fy + fh, zf], [bx + hw, y + fy + fh, zf], [bx, y + fy + fh + 0.08, zf], '#000');
      }
      p.pyramid(bx, y + hh + 0.04, z + D / 2 - 0.04, 0.06, 0.18, 0.06, tint(gl, -0.03));
    }
    // the end pavilions, taller, with crowns
    for (const sx of [-1, 1]) {
      const ex = cx + sx * (W / 2 - 0.3);
      p.box(ex, y - 0.2, z + 0.1, 0.62, hh + 0.65, D, tint(gr, 0.03));
      p.box(ex, y + hh + 0.45, z + 0.1, 0.7, 0.07, D + 0.08, gl, { ao: 0 });
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.pyramid(ex + dx * 0.27, y + hh + 0.52, z + 0.1 + dz * 0.33, 0.1, 0.42, 0.1, gl);
      p.pyramid(ex, y + hh + 0.52, z + 0.1, 0.4, 0.55, 0.5, '#6f767d');
      for (const fy of [0.15, 0.55, 1.0, 1.35]) winF(k, ex - 0.2, ex + 0.2, y + fy, 0.22, z + 0.1 + D / 2 + 0.004, 2, 0.45);
    }
    // the Mitchell Tower: tall, square, a clock stage, a crown of pinnacles and a spirelet
    const tw = 1.15;
    p.box(cx, y - 0.2, z + 0.12, tw, 2.9 + 0.2, D - 0.1, '#bfc3c7');
    p.box(cx, y + 1.55, z + 0.12, tw + 0.08, 0.07, D - 0.02, gl, { ao: 0 });
    p.box(cx, y + 2.75, z + 0.12, tw + 0.14, 0.1, D + 0.04, gl);
    for (const fy of [0.15, 0.6, 1.0]) winF(k, cx - 0.4, cx + 0.4, y + fy, 0.26, z + 0.12 + (D - 0.1) / 2 + 0.004, 3, 0.4);
    winF(k, cx - 0.35, cx + 0.35, y + 1.7, 0.4, z + 0.12 + (D - 0.1) / 2 + 0.004, 2, 0.4);
    p.cyl(cx, y + 2.05, z + 0.12 + (D - 0.1) / 2 + 0.01, 0.22, 0.22, 0.025, '#f3efe0', { seg: 14, rx: Math.PI / 2, ao: 0 });
    p.box(cx, y + 2.05 + 0.02, z + 0.12 + (D - 0.1) / 2 + 0.03, 0.02, 0.16, 0.012, '#2d3138', { ao: 0 });
    p.box(cx + 0.05, y + 2.05, z + 0.12 + (D - 0.1) / 2 + 0.03, 0.12, 0.02, 0.012, '#2d3138', { ao: 0 });
    p.box(cx, y + 2.85, z + 0.12, tw - 0.1, 0.4, D - 0.2, '#8d9296');
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.pyramid(cx + dx * 0.5, y + 2.85, z + 0.12 + dz * 0.3, 0.14, 0.62, 0.14, gl);
    p.pyramid(cx, y + 3.25, z + 0.12, 0.7, 0.75, 0.55, '#6f767d');
    p.cyl(cx, y + 3.95, z + 0.12, 0.01, 0.008, 0.25, '#d6d9dc', { seg: 4, ao: 0 });
    k.reserve(cx, z + 0.1, W / 2 + 0.2, D / 2 + 0.6);
    // the granite city around and behind it
    buildTown(k, { x0: -k.width / 2 - 2, x1: k.width / 2 + 2, z: SHORE_Z - 1.3, rows: 4, rowStep: 0.55, hs: GRANITE, cx: k.vx(SHORE_Z - 2), rowRise: 0.15 });
    // Girdle Ness lighthouse on its headland, with rocks at its feet
    const lx = cx - 6.6;
    const lz = -11.5;
    const ly = k.ground(lx, lz) - 0.03;
    lighthouse(k, lx, ly, lz, { h: 2.5, r0: 0.3, r1: 0.19, bands: [['#f6f3ea', 1]], cap: '#2d3138', gallery: '#2d3138', cottage: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rx = lx + Math.cos(a) * 1.5 * (0.9 + rng.next() * 0.3);
      const rz = lz + Math.sin(a) * 1.35 * (0.9 + rng.next() * 0.3);
      const g = k.ground(rx, rz);
      if (g > -0.3 && g < 0.5) p.rock(rx, Math.min(g, 0) - 0.05, rz, rng.range(0.16, 0.26), rng.chance(0.5) ? '#8a867c' : '#797670', { sy: 0.8, ry: rng.next() * 6 });
    }
    k.reserve(lx, lz, 1.0, 1.0);
    // the North Sea: a jack-up rig and a supply vessel
    oilRig(k, cx - 3.9, -10.6, 1.4);
    supply(k, cx - 1.3, -10.9, 2.5);
  },
  rows: 0,
  quiet: true,
  flag: { dx: 5.2, z: -12.6 },
};

// ───────────────────────────── Immingham ─────────────────────────────

const immingham: Landmark = {
  terrain(k) {
    k.shape.relief = 0.3;
    k.shape.range = 0.9;
    k.shape.rise = 7;
    const cx = k.vx(-17);
    k.plateau(cx, -17.6, 11, 4.8, LAND_Y, 0.4);
    k.paint((x, y, z, s, c) => {
      if (z < -12.4 && z > -20.2 && Math.abs(x - cx) < 7.8) c.lerp(c.clone().set('#a6a69c'), 0.75);
    });
  },
  build(k) {
    const cx = k.vx(-17);
    const p = k.solid;
    const white = '#eeece4';
    // the tank farm: front row small, back row large
    for (let i = 0; i < 5; i++) tank(k, cx - 5.4 + i * 1.55, -14.4, 0.62, 0.6 + (i % 2) * 0.12, white);
    for (let i = 0; i < 4; i++) tank(k, cx - 4.6 + i * 2.1, -16.2, 0.82, 0.85, i % 2 ? '#d7dbde' : white);
    // the process units: columns, furnace, stacks, flares
    for (const [dx, h, r] of [[1.0, 3.3, 0.22], [1.7, 4.2, 0.27], [2.4, 3.0, 0.2], [3.1, 3.7, 0.23]] as Array<[number, number, number]>) column(k, cx + dx + 3.4, -18.4, r, h);
    p.box(cx + 3.2, LAND_Y - 0.05, -19.4, 1.4, 0.6, 0.7, '#8d9298');
    pipeRack(k, cx + 4.6, -17.0, 4.0);
    pipeRack(k, cx - 1.5, -17.8, 3.6);
    chimney(k, cx - 4.4, -19.2, 4.4, 0.2, '#eceae2', '#c8302a', { plume: true });
    chimney(k, cx - 3.4, -19.6, 3.4, 0.16, '#eceae2', '#c8302a');
    flare(k, cx - 6.6, -18.2, 4.8);
    flare(k, cx + 8.4, -19.0, 3.6);
    for (let i = 0; i < 3; i++) factory(k, cx - 2.5 + i * 1.6, -21.4, 1.3, 0.8, 0.5, '#bdb5a8', '#7f8a92');
    // the long jetty: a pipe trestle out to a loading head, a tanker alongside
    const jx = cx - 1.6;
    pier(k, jx, -12.1, jx, -9.7, 0.34, 0.5, '#8d9298', '#7d858c');
    p.box(jx, 0.42, -11.0, 0.05, 0.1, 2.2, '#c8302a', { ao: 0 });
    pier(k, jx - 0.3, -9.65, jx + 5.4, -9.65, 0.42, 0.5, '#8d9298', '#7d858c');
    for (const dx of [1.1, 2.7, 4.3]) {
      p.box(jx + dx, 0.5, -9.65, 0.22, 0.5, 0.22, '#c9c5ba');
      p.rod([jx + dx, 0.95, -9.65], [jx + dx + 0.35, 0.7, -10.0], 0.02, '#c8302a', 4);
    }
    p.box(jx + 5.2, 0.5, -9.65, 0.4, 0.3, 0.38, '#f4f1e8');
    tanker(k, jx + 3.5, -10.55, 4.6, 0.92, '#23272e');
    k.reserve(jx + 2.5, -10.5, 4, 1.2);
    for (const [tx, tz, h] of [[cx - 8.0, -23.0, 2.2], [cx + 6.0, -24.0, 2.3], [cx + 10.0, -22.0, 2.1]] as Array<[number, number, number]>) turbine(k, tx, tz, h, LAND_Y - 0.02);
  },
  rows: 0,
  quiet: true,
  flag: { dx: -6.8, z: -12.6 },
};

// ───────────────────────────── Harwich ─────────────────────────────

/** An octagonal tower of flat facets, tapering from r0 to r1 over h. */
function octagon(p: Part, x: number, y: number, z: number, r0: number, r1: number, h: number, col: Col): void {
  const v: V3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    v.push([x + Math.cos(a) * r0, y, z + Math.sin(a) * r0]);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    v.push([x + Math.cos(a) * r1, y + h, z + Math.sin(a) * r1]);
  }
  const faces: number[][] = [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]];
  for (let i = 0; i < 8; i++) faces.push([i, (i + 1) % 8, 8 + ((i + 1) % 8), 8 + i]);
  p.solid(v, faces, col, { ao: 0 });
}

const harwich: Landmark = {
  terrain(k) {
    k.shape.relief = 0.7;
    k.shape.range = 1.5;
    const cx = k.vx(-14);
    k.plateau(cx + 4.6, -14.8, 4.4, 2.3, LAND_Y, 0.4);
    k.bump(cx + 0.4, -15.3, 1.6, 1.2, 0.55);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14);
    const p = k.solid;
    // the High Light: a tall octagonal tower of white stucco, on the rise behind
    const hx = cx + 0.5;
    const hz = -15.3;
    const hy = k.groundMax(hx, hz, 0.4, 0.4) - 0.03;
    octagon(p, hx, hy - 0.1, hz, 0.46, 0.46, 0.4, '#b9b3a7');
    octagon(p, hx, hy + 0.25, hz, 0.4, 0.27, 3.0, '#ffffff');
    octagon(p, hx, hy + 1.5, hz, 0.343, 0.337, 0.07, '#8a8f94');
    for (let i = 0; i < 4; i++) winF(k, hx - 0.025, hx + 0.025, hy + 0.7 + i * 0.6, 0.18, hz + 0.34 - i * 0.03 + 0.0, 1, 1);
    const yt = hy + 3.25;
    p.cyl(hx, yt, hz, 0.36, 0.36, 0.05, '#2d3138', { seg: 8 });
    p.cyl(hx, yt + 0.05, hz, 0.34, 0.34, 0.07, '#2d3138', { seg: 8, ao: 0 });
    k.glass.cyl(hx, yt + 0.05, hz, 0.2, 0.2, 0.26, '#bfe6f2', { seg: 8 });
    k.glow.ball(hx, yt + 0.18, hz, 0.12, '#fff1b0');
    p.cyl(hx, yt + 0.31, hz, 0.25, 0.25, 0.03, '#2d3138', { seg: 8 });
    p.cone(hx, yt + 0.34, hz, 0.24, 0.26, '#2d3138', { seg: 8 });
    p.cyl(hx, yt + 0.6, hz, 0.008, 0.006, 0.14, '#2d3138', { seg: 4, ao: 0 });
    k.reserve(hx, hz, 0.7, 0.7);
    // the Low Light: round, squat and white with a red lantern roof, on the shore edge in front
    const lx = cx - 1.5;
    const lz = -12.9;
    const ly = k.groundMax(lx, lz, 0.4, 0.4) - 0.03;
    p.cyl(lx, ly - 0.15, lz, 0.5, 0.5, 0.2, '#b9b3a7', { seg: 14 });
    lighthouse(k, lx, ly + 0.05, lz, { h: 1.9, r0: 0.36, r1: 0.27, seg: 16, bands: [['#f4f1e8', 1]], cap: '#c8302a', gallery: '#c8302a', cottage: true });
    k.reserve(lx, lz, 0.9, 0.7);
    // the beacon on the breakwater head: a red-banded stub with a green lamp
    const mx = k.mole.endX;
    p.cyl(mx, k.mole.top + 0.08, k.mole.z, 0.16, 0.12, 0.55, '#f4f1e8', { seg: 10 });
    p.cyl(mx, k.mole.top + 0.3, k.mole.z, 0.15, 0.14, 0.14, '#c8302a', { seg: 10, ao: 0 });
    p.cone(mx, k.mole.top + 0.63, k.mole.z, 0.16, 0.2, '#2d3138', { seg: 10 });
    k.glow.ball(mx, k.mole.top + 0.68, k.mole.z, 0.07, '#7dffa0');
    // Ha'penny Pier: a timber deck on piles with a little pavilion at the head
    pier(k, cx - 4.0, -12.2, cx - 4.0, -9.5, 0.3, 0.45, '#8a6a4a', '#5b4636');
    p.box(cx - 4.0, 0.39, -9.7, 0.5, 0.3, 0.4, '#f1ece0');
    p.prism(cx - 4.0, 0.69, -9.7, 0.56, 0.18, 0.44, '#b8432f', { ry: Math.PI / 2 });
    // Parkeston Quay: red cranes, a blue ferry, tidy red and orange stacks
    for (let i = 0; i < 3; i++) stsCrane(k, cx + 2.9 + i * 1.7, -13.1, { s: 1.3, leg: '#c8302a', beam: '#f4f6f6', house: '#c8302a', angle: [0.55, 0.9, 0.5][i], boom: 1.8 });
    liner(k, cx + 4.3, -10.5, { L: 5.0, B: 0.95, hull: '#27345a', funnel: '#2c5da8', band: '#f4f1e8', decks: 3, boot: '#b3322a', fx: -0.12 });
    const pal = ['#c8302a', '#e86a2c', '#d9d4c7', '#b02a2a', '#e9a31a'];
    k.reserve(cx + 5.0, -14.3, 3.8, 1.8);
    for (let row = 0; row < 2; row++) for (let b = 0; b < 2; b++) boxes(k, cx + 2.2 + b * 2.6, -14.0 - row * 1.4, 7, 2, 4, rng, pal, { cw: 0.3 });
    for (const [tx, tz, h] of [[cx - 7.5, -21.5, 2.0], [cx + 8.4, -22.5, 2.2]] as Array<[number, number, number]>) turbine(k, tx, tz, h);
  },
  rows: 3,
  quiet: true,
  townShift: -3,
  mole: { light: false },
  flag: { dx: -6.3, z: -12.6 },
};

// ───────────────────────────── Goole ─────────────────────────────

/** One "pot": a white concrete water tower with a flared tank under a domed top. */
function pot(k: PortKit, x: number, z: number, h: number, wTank: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.5, 0.5) - 0.03;
  const white = '#f1efe8';
  p.cyl(x, y - 0.1, z, 0.66, 0.64, 0.3, '#b9b3a7', { seg: 12 });
  p.lathe(x, y + 0.2, z, [[0.54, 0], [0.5, 0.5], [0.46, h * 0.55], [0.48, h * 0.62], [wTank * 0.75, h * 0.66], [wTank, h * 0.7], [wTank, h * 0.9], [wTank * 0.96, h * 0.94]], white, { seg: 12 });
  p.lathe(x, y + 0.2 + h * 0.94, z, [[wTank * 0.96, 0], [wTank * 0.8, h * 0.06], [wTank * 0.5, h * 0.1], [wTank * 0.2, h * 0.13], [0.001, h * 0.14]], '#dcd9cf', { seg: 12 });
  p.cyl(x, y + 0.2 + h * 1.07, z, 0.06, 0.04, 0.18, '#e9e6dc', { seg: 6 });
  p.ball(x, y + 0.2 + h * 1.07 + 0.2, z, 0.04, '#e8b923');
  // a band of windows on the tank belt, a door at the foot
  winF(k, x - wTank * 0.7, x + wTank * 0.7, y + 0.2 + h * 0.76, 0.1, z + wTank * 0.74, 4, 0.5);
  winS(k, z - wTank * 0.4, z + wTank * 0.4, y + 0.2 + h * 0.76, 0.1, x + wTank * 0.93, 2, 0.5);
  p.box(x, y + 0.18, z + 0.54, 0.12, 0.22, 0.02, '#4a5360', { ao: 0 });
  k.reserve(x, z, wTank + 0.1, wTank + 0.1);
}

const goole: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape.relief = 0.4;
    k.shape.range = 1.2;
    const cx = k.vx(-15);
    const xd = k.vx(-14.5) + 4.0;
    k.plateau(cx, -16.5, 12, 4.4, LAND_Y, 0.4);
    carve(k, xd, 1.6, -22, 1.0);
    paintBanks(k, xd, 1.6, -22, 1.0);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-15);
    const xd = k.vx(-14.5) + 4.0;
    const p = k.solid;
    // the Salt and Pepper Pots: two white water towers beside the docks
    pot(k, cx - 1.9, -15.2, 3.4, 0.72);
    pot(k, cx - 0.2, -14.7, 3.0, 0.66);
    // the dock cut with a coaster, and the steel truss bridge over its mouth
    coaster(k, xd, -16.6, 2.7, '#2d4a6b', Math.PI / 2);
    const bz = -13.6;
    const bx0 = xd - 2.4;
    const bx1 = xd + 2.4;
    const steel = '#58708a';
    p.box((bx0 + bx1) / 2, 0.55, bz, bx1 - bx0, 0.1, 0.62, '#6f7378');
    p.box((bx0 + bx1) / 2, 0.64, bz, bx1 - bx0, 0.02, 0.01, '#d9dde0', { ao: 0 });
    truss(p, bx0 + 0.2, bx1 - 0.2, bz, 0.62, 1.4, 0.58, steel, 8, 0.02);
    for (const x of [bx0 + 0.2, bx1 - 0.2]) for (const s of [-1, 1]) p.box(x - 0.03, 0.55, bz + s * 0.29 - 0.03, 0.07, 0.9, 0.06, steel);
    p.box(bx0 - 0.15, -0.9, bz, 0.5, 1.5, 0.7, '#9d9a90');
    p.box(bx1 + 0.15, -0.9, bz, 0.5, 1.5, 0.7, '#9d9a90');
    k.reserve(xd, bz, 2.9, 0.5);
    // brick warehouses and small cranes along the quay
    factory(k, cx + 1.6, -16.4, 2.3, 0.9, 0.7, '#a65a42', '#4a4f58');
    factory(k, cx - 4.4, -16.0, 2.4, 0.9, 0.6, '#9c4f3a', '#4a4f58');
    for (let i = 0; i < 2; i++) stsCrane(k, cx - 6.8 + i * 1.3, -13.3, { s: 0.9, leg: '#c8302a', beam: '#f1f2ee', house: '#c8302a', angle: 0.4, boom: 1.6 });
    boxes(k, cx + 0.2, -18.4, 8, 2, 3, rng, ['#7a8f5a', '#c8302a', '#2c5da8', '#d9d4c7'], { cw: 0.3 });
    coaster(k, cx - 2.4, -10.5, 3.0, '#6b2b2b', 0);
    turbine(k, cx - 8.5, -21.5, 2.1, LAND_Y - 0.02);
    turbine(k, cx + 9.0, -23.5, 2.0, LAND_Y - 0.02);
  },
  rows: 2,
  quiet: true,
  flag: { dx: -6.0, z: -12.6 },
};

// ───────────────────────────── London (Tower Bridge) ─────────────────────────────

const london: Landmark = {
  terrain(k) {
    k.shore = 'beach';
    k.shape.relief = 0.3;
    k.shape.range = 0.9;
    const xr = k.vx(-15) + 0.2;
    carve(k, xr, 5.0, -38, 1.5);
    paintBanks(k, xr, 5.0, -38, 1.5);
  },
  build(k) {
    const xr = k.vx(-15) + 0.2;
    const z = -15.0;
    const p = k.solid;
    const stone = '#d6cdb8';
    const stoneD = '#9f9a8c';
    const blue = '#2c68b0';
    const slate = '#4f5f70';
    const tx = 2.3;
    for (const s of [-1, 1]) {
      const x = xr + s * tx;
      // the pier in the river, the tower, its turrets and roofs
      p.box(x, -0.9, z, 1.3, 0.9 + 0.95, 1.05, stoneD);
      p.box(x, 0.95, z, 1.12, 2.15, 0.9, stone);
      p.box(x, 0.95, z + 0.45 + 0.006, 1.16, 0.06, 0.012, '#eee6d1', { ao: 0 });
      for (const fy of [1.25, 1.75, 2.25]) {
        winF(k, x - 0.38, x + 0.38, fy, 0.3, z + 0.45 + 0.004, 3, 0.42);
        winS(k, z - 0.22, z + 0.22, fy, 0.3, x + 0.56 + 0.004, 2, 0.42);
      }
      p.box(x, 3.05, z, 1.2, 0.1, 0.98, '#eee6d1');
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        p.cyl(x + dx * 0.48, 3.05, z + dz * 0.4, 0.13, 0.12, 0.45, stone, { seg: 8 });
        p.cone(x + dx * 0.48, 3.5, z + dz * 0.4, 0.15, 0.42, slate, { seg: 8 });
      }
      p.pyramid(x, 3.15, z, 0.8, 0.85, 0.62, slate);
      p.cyl(x, 3.95, z, 0.012, 0.008, 0.22, '#d6d9dc', { seg: 4, ao: 0 });
      k.reserve(x, z, 0.8, 0.7);
    }
    // the low bascule roadway between the towers and on the side spans, the blue high-level walkway above
    const deck = 0.95;
    p.box(xr, deck - 0.1, z, tx * 2, 0.1, 0.62, '#8d9298');
    p.box(xr, deck, z - 0.3, tx * 2, 0.07, 0.03, '#eee6d1', { ao: 0 });
    p.box(xr, deck, z + 0.3, tx * 2, 0.07, 0.03, '#eee6d1', { ao: 0 });
    p.box(xr, deck - 0.01, z, tx * 2, 0.012, 0.012, '#e9e2cf', { ao: 0 });
    truss(p, xr - tx + 0.55, xr + tx - 0.55, z, 2.5, 2.85, 0.5, blue, 8, 0.02);
    // side spans: suspension chains from the tower heads down to the shore towers
    const ax = 6.55;
    for (const s of [-1, 1]) {
      const xa = xr + s * (tx + 0.56);
      const xe = xr + s * ax;
      p.box((xa + xe) / 2, deck - 0.1, z, Math.abs(xe - xa), 0.1, 0.62, '#8d9298');
      for (const e of [-1, 1]) p.box((xa + xe) / 2, deck, z + e * 0.3, Math.abs(xe - xa), 0.07, 0.03, '#eee6d1', { ao: 0 });
      for (let i = 0; i < 2; i++) p.box(xa + (xe - xa) * (0.35 + i * 0.4), -0.9, z, 0.2, 0.9 + deck - 0.1, 0.5, stoneD);
      // the shore tower
      p.box(xe, -0.2, z, 0.62, 2.0, 0.55, stone);
      p.pyramid(xe, 1.78, z, 0.7, 0.55, 0.62, slate);
      winF(k, xe - 0.2, xe + 0.2, 1.05, 0.28, z + 0.275 + 0.004, 2, 0.45);
      for (const e of [-1, 1]) {
        const zz = z + e * 0.3;
        let px = xa;
        let py = 2.95;
        const n = 8;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const nx = lerp(xa, xe, t);
          const ny = lerp(2.95, 1.75, t) - 0.55 * Math.sin(Math.PI * t) * 0.9;
          p.rod([px, py, zz], [nx, ny, zz], 0.03, blue, 4);
          if (i < n) p.rod([nx, ny, zz], [nx, deck, zz], 0.012, '#8fb3de', 3);
          px = nx;
          py = ny;
        }
      }
    }
    // the Shard and a few blocks on the banks behind
    const sx = xr - 6.6;
    const sz = -20.8;
    const sy = k.groundMax(sx, sz, 0.5, 0.5) - 0.03;
    k.glass.pyramid(sx, sy, sz, 1.2, 5.6, 1.2, '#9cc0d6', { ry: 0.5, ao: 0.05 });
    p.box(sx, sy - 0.15, sz, 1.0, 0.2, 1.0, '#8fa3ae');
    k.reserve(sx, sz, 0.9, 0.9);
    skyTower(k, xr - 8.0, -19.0, 0.9, 0.7, 2.2, '#cfd8dd', { win: '#4f6f86', glass: false, rows: 12, cols: 4 });
    skyTower(k, xr + 6.8, -19.5, 0.8, 0.7, 2.7, '#c5cfd5', { win: '#4f6f86', rows: 14, cols: 3 });
    skyTower(k, xr + 8.4, -22.5, 1.1, 0.8, 3.0, '#d3dbe0', { win: '#4f6f86', rows: 16, cols: 5 });
  },
  rows: 3,
  quiet: true,
  flag: { dx: 5.9, z: -12.6 },
};

export const LANDMARKS: Record<string, Landmark> = { dover, felixstowe, southampton, teesport, grimsby, aberdeen, immingham, harwich, goole, london };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Dover', 'uk', 'dover'],
  ['Felixstowe', 'uk', 'felixstowe'],
  ['Southampton', 'uk', 'southampton'],
  ['Teesport', 'uk', 'teesport'],
  ['Grimsby', 'uk', 'grimsby'],
  ['Aberdeen', 'uk', 'aberdeen'],
  ['Immingham', 'uk', 'immingham'],
  ['Harwich', 'uk', 'harwich'],
  ['Goole', 'uk', 'goole'],
  ['London', 'uk', 'london'],
];
