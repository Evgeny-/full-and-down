import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { Part, PortKit, SHORE_Z, LAND_Y, lerp, smooth, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { buildTown, tint, type HouseStyle } from '../town';
import { tower, tallShip, oilRig } from '../structures';
import { church, turbine } from '../props';
import { windowOpening } from '../facades';

/**
 * Denmark, southern Norway and Sweden: Oslo (Opera House), Bergen (Bryggen), Esbjerg (Man meets the Sea),
 * Gothenburg (Barken Viking + the Lipstick), Stavanger (Sverd i fjell), Aarhus (ARoS), Copenhagen (Nyhavn),
 * Alesund (Art Nouveau). Every town brings its own house style (wood colours differ on purpose) and its own
 * ground: hill shape, rock colour and shoreline.
 */

// ───────────────────────────── helpers ─────────────────────────────

const c3 = (hex: string): THREE.Color => new THREE.Color(hex);

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

interface GableOpts {
  y?: number;
  floors?: number;
  win?: Col;
  trim?: Col;
  /** a loading hatch with a hoist beam in the gable */
  hoist?: boolean;
  /** window rows get shutters of this colour */
  shutter?: Col;
  /** far-away building: no floor bands, no side windows */
  lite?: boolean;
}

/** A wooden warehouse / house with its gable end towards the water (+z): ridge runs along z. */
function gable(k: PortKit, x: number, z: number, w: number, d: number, wallH: number, roofH: number, wall: Col, roof: Col, o: GableOpts = {}): number {
  const p = k.solid;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const sink = o.y !== undefined ? 0.25 : Math.max(0.25, y - k.groundMin(x, z, w / 2, d / 2) + 0.1);
  const zf = z + d / 2;
  p.box(x, y - sink, z, w, wallH + sink, d, wall);
  p.prism(x, y + wallH, z, w + 0.07, roofH, d + 0.06, roof);
  p.tri([x - w / 2 - 0.035, y + wallH, zf + 0.034], [x + w / 2 + 0.035, y + wallH, zf + 0.034], [x, y + wallH + roofH * 0.98, zf + 0.034], wall);
  const floors = o.floors ?? 3;
  const win = o.win ?? '#2e2a2a';
  const fh = wallH / floors;
  const cols = Math.max(1, Math.round(w / 0.3));
  const sp = w / cols;
  const trim = o.trim ?? tint(wall, 0.14);
  if (!o.lite) {
    p.boxV(x, y, z, w + 0.016, 0.04, d + 0.016, tint(wall, -0.22));
    p.boxV(x, y + wallH - 0.028, z, w + 0.035, 0.028, d + 0.035, trim);
  }
  for (let f = 0; f < floors; f++) {
    const y0 = y + f * fh + fh * 0.28;
    for (let i = 0; i < cols; i++) {
      const cx = x - w / 2 + sp * (i + 0.5);
      if (o.lite) fq(p, cx - 0.045, cx + 0.045, y0, y0 + fh * 0.5, zf + 0.004, win);
      else windowOpening(k, p, 'front', [cx, y0, zf + 0.004], 0.09, fh * 0.5, win, trim);
      if (o.shutter) {
        fq(p, cx - 0.075, cx - 0.05, y0, y0 + fh * 0.5, zf + 0.005, o.shutter);
        fq(p, cx + 0.05, cx + 0.075, y0, y0 + fh * 0.5, zf + 0.005, o.shutter);
      }
    }
    if (o.lite) continue;
    if (f) p.box(x, y + f * fh - 0.012, z, w + 0.02, 0.024, d + 0.02, o.trim ?? tint(wall, -0.16), { ao: 0 });
    const sc = Math.max(1, Math.round(d / 0.32));
    for (let i = 0; i < sc; i++) {
      const cz = zf - (d / sc) * (i + 0.5);
      windowOpening(k, p, 'right', [x + w / 2 + 0.004, y0, cz], 0.08, fh * 0.5, win, trim);
    }
  }
  // gable window or hoist
  const gy = y + wallH + roofH * 0.2;
  if (o.hoist) {
    fq(p, x - 0.06, x + 0.06, gy, gy + roofH * 0.28, zf + 0.036, '#3a2c26');
    p.box(x, y + wallH + roofH * 0.9, zf + 0.03, 0.03, 0.03, 0.14, '#4a3a30', { ao: 0 });
  } else fq(p, x - 0.04, x + 0.04, gy, gy + roofH * 0.26, zf + 0.036, win);
  k.reserve(x, z, w / 2 + 0.03, d / 2 + 0.03);
  return y + wallH + roofH;
}

/** A wooden (or stone) jetty / quay slab: top at `top`, sunk to the sea floor, with plank lines on its face. */
function quayDeck(k: PortKit, x0: number, x1: number, zBack: number, zFront: number, top: number, color: Col, plank = true): void {
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

/** A seated white figure (knees drawn up, arms resting on them, looking +z at the sea): Esbjerg's "Man meets the Sea". */
function seated(k: PortKit, x: number, y: number, z: number, s: number, c: Col): void {
  const p = k.solid;
  const limb = tint(c, -0.06);
  p.at(x, y, z, 0, s, () => {
    p.box(0, 0, -0.2, 0.52, 0.22, 0.4, limb); // hips
    p.cyl(0, 0.16, -0.22, 0.27, 0.25, 0.62, c, { seg: 8, rx: 0.1 }); // torso, leaning back a little
    p.cyl(0, 0.74, -0.2, 0.08, 0.08, 0.1, c, { seg: 6 }); // neck
    p.ball(0, 0.98, -0.16, 0.17, c, { sy: 1.08 }); // head
    for (const sx of [-1, 1]) {
      p.blob(sx * 0.27, 0.72, -0.2, 0.15, c); // shoulder
      p.rod([sx * 0.14, 0.22, -0.12], [sx * 0.15, 0.55, 0.36], 0.105, limb, 7); // thigh up to the raised knee
      p.blob(sx * 0.15, 0.55, 0.36, 0.125, limb); // knee
      p.rod([sx * 0.15, 0.55, 0.36], [sx * 0.15, 0.04, 0.56], 0.088, limb, 7); // shin
      p.box(sx * 0.15, 0.0, 0.6, 0.16, 0.07, 0.24, limb); // foot
      p.rod([sx * 0.28, 0.66, -0.2], [sx * 0.31, 0.45, 0.12], 0.07, c, 6); // upper arm
      p.rod([sx * 0.31, 0.45, 0.12], [sx * 0.19, 0.58, 0.35], 0.062, c, 6); // forearm onto the knee
    }
  });
}

/** Houses for one town: the pipeline's buildTown with this port's own style and a built-in site filter. */
function town(k: PortKit, hs: HouseStyle, rows: number, z: number, o: { rowStep?: number; gaps?: number; rowRise?: number; minY?: number; maxSlope?: number; shift?: number } = {}): void {
  buildTown(k, { x0: -k.width / 2 - 2, x1: k.width / 2 + 2, z, rows, rowStep: o.rowStep ?? 0.6, hs, gaps: o.gaps ?? 0.06, rowRise: o.rowRise ?? 0, cx: k.vx(z) + (o.shift ?? 0), minY: o.minY, maxSlope: o.maxSlope });
}

const baseStyle: HouseStyle = {
  walls: ['#e8d9b0'],
  roofs: ['#4a4f58'],
  trim: '#f6f3ea',
  win: '#2f3d4d',
  floors: [2, 3],
  floorH: 0.2,
  w: [0.36, 0.56],
  d: [0.34, 0.48],
  roofKinds: [['gable', 5], ['front', 3]],
  pitch: 0.7,
  chimney: 0.3,
  gap: [0.02, 0.12],
  door: '#e8e1d0',
};

// ───────────────────────────── Oslo ─────────────────────────────

/** The Opera House: a white faceted slab rising from the fjord, a glass foyer under its lifted edge, a tall fly tower. */
function operaHouse(k: PortKit, x0: number): void {
  const p = k.solid;
  const zf = -11.85;
  const zb = -14.2;
  const xs = [-3.7, -1.9, -0.1, 1.7, 3.7].map((v) => x0 + v);
  const f = [0.14, 0.14, 0.75, 1.35, 1.45];
  const g = [1.5, 2.3, 2.8, 2.55, 2.2];
  const cols = ['#f7f6f2', '#e4e8ec', '#fbfaf7', '#e9edf0'];
  // the apron: stone paving that runs out into the water
  p.box(x0, -0.9, zf + 0.45, 8.2, 1.04, 0.9, '#dedbd2');
  p.box(x0, 0.12, zf + 0.46, 8.3, 0.025, 0.93, '#ebe8e0', { ao: 0 });
  for (let i = 0; i < 4; i++) {
    const [xa, xb] = [xs[i], xs[i + 1]];
    const v: V3[] = [
      [xa, f[i], zf], [xb, f[i + 1], zf], [xb, g[i + 1], zb], [xa, g[i], zb],
      [xa, -0.3, zf], [xb, -0.3, zf], [xb, -0.3, zb], [xa, -0.3, zb],
    ];
    p.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], cols[i], { ao: 0 });
    // the glass foyer under the lifted edge
    if (f[i] > 0.3) {
      k.glass.quad([xa, 0.13, zf + 0.012], [xb, 0.13, zf + 0.012], [xb, f[i + 1] - 0.14, zf + 0.012], [xa, f[i] - 0.14, zf + 0.012], '#86bfd4');
      const n = Math.round((xb - xa) / 0.34);
      for (let m = 0; m <= n; m++) {
        const t = m / n;
        const mx = lerp(xa, xb, t);
        p.box(mx, 0.12, zf + 0.02, 0.025, lerp(f[i], f[i + 1], t) - 0.26, 0.02, '#f1f3f4', { ao: 0 });
      }
    }
  }
  // seams between the slabs and the long ramp lines
  for (let i = 1; i < 4; i++) p.rod([xs[i], f[i] + 0.012, zf], [xs[i], g[i] + 0.012, zb], 0.014, '#c3c9ce', 4);
  p.rod([xs[0], f[0] + 0.012, zf], [xs[0], g[0] + 0.012, zb], 0.014, '#c3c9ce', 4);
  // the fly tower behind, clad in pale aluminium panels
  const tx = x0 + 0.9;
  p.box(tx, -0.3, -14.75, 3.0, 4.9, 1.3, '#f2f2ef');
  p.box(tx, 4.5, -14.75, 3.06, 0.07, 1.36, '#dde1e4');
  for (let x = tx - 1.4; x < tx + 1.45; x += 0.21) fq(p, x, x + 0.07, 3.0, 4.45, -14.095, '#dfe3e6');
  for (let y = 3.1; y < 4.4; y += 0.4) fq(p, tx - 1.5, tx + 1.5, y, y + 0.03, -14.094, '#cdd2d6');
  for (let y = 3.1; y < 4.4; y += 0.4) rq(p, tx + 1.502, y, y + 0.03, -14.1, -15.4, '#cdd2d6');
  k.reserve(x0, -13, 4.2, 1.9);
}

/** Holmenkollen: white judges' tower and an inrun curving down to the take-off, on a wooded hill. */
function skiJump(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.ground(x, z) - 0.05;
  k.at(x, y, z, 0.0, s, () => {
    const top: Array<[number, number]> = [[0.1, 2.65], [0.8, 2.3], [1.5, 1.72], [2.1, 1.12], [2.6, 0.84], [3.1, 0.78]];
    const bot: Array<[number, number]> = top.map(([a, b], i) => [a, b - (i === 5 ? 0.22 : 0.2)] as [number, number]).reverse();
    p.extrude([...top, ...bot], 0.3, 0, 0, 0, '#f3f4f2', { ao: 0 });
    p.box(0, -0.6, 0, 0.5, 3.3, 0.5, '#eceeee');
    k.glass.box(0, 2.35, 0, 0.62, 0.3, 0.56, '#7fb4c8');
    p.box(0, 2.65, 0, 0.7, 0.06, 0.62, '#d63a30');
    for (const [lx, ly] of [[0.8, 2.0], [1.5, 1.45], [2.1, 0.92]] as Array<[number, number]>) {
      p.box(lx, -1.3, -0.1, 0.06, 1.3 + ly, 0.06, '#d9dcdd');
      p.box(lx, -1.3, 0.1, 0.06, 1.3 + ly, 0.06, '#d9dcdd');
    }
    p.box(3.2, -1.5, 0, 0.12, 1.5 + 0.85, 0.3, '#d9dcdd');
    p.cyl(0.0, 2.7, 0, 0.012, 0.012, 0.55, '#d9dcdd', { seg: 4 });
  });
  k.reserve(x + 1.5 * s, z, 2.0 * s, 0.8 * s);
}

const osloStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#e8d9b0', '#dccb9d', '#f1ead7', '#cfd2d2', '#e8c9a0', '#d4b98a', '#e7e1cf'],
  roofs: ['#4a4f58', '#5a5f68', '#6b4a40', '#3f444c'],
  floors: [3, 5],
  floorH: 0.17,
  w: [0.42, 0.66],
  d: [0.4, 0.5],
  roofKinds: [['hip', 3], ['flat', 3], ['gable', 2]],
  pitch: 0.4,
  gap: [0.0, 0.05],
  chimney: 0.1,
};

const oslo: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8db06a', land2: '#84a863', hill: '#57875a', rock: '#8d969c', sand: '#c9c4b4', haze: '#cfe3ec' };
    k.shape = { relief: 2.3, range: 4.5, rise: 3.2, rough: 0.35, freq: 0.09 };
    k.shore = 'quay';
    const x0 = centre(k, -13.2, 1.1);
    k.plateau(x0, -13.0, 5.0, 2.5, LAND_Y, 0.4);
    k.bump(x0 - 2.6, -20.5, 7.5, 4.8, 3.4);
    const dark = c3('#40744a');
    k.paint((x, y, z, slope, c) => {
      if (y > 1.3 && z < -15) c.lerp(dark, 0.55 * smooth(1.3, 2.8, y));
    });
  },
  build(k) {
    const x0 = centre(k, -13.2, 1.1);
    operaHouse(k, x0);
    skiJump(k, x0 - 3.0, -19.7, 1.15);
    // "Barcode": slim towers in white, grey and dark glass behind the opera, to the right
    const bar: Array<[number, number, number, Col, Col]> = [
      [4.2, 2.3, 0.4, '#e9ecee', '#5b7184'],
      [4.85, 3.0, 0.42, '#51657a', '#9db4c4'],
      [5.5, 2.5, 0.4, '#dfe3e5', '#5b7184'],
      [6.15, 3.4, 0.44, '#3f5368', '#8fa8ba'],
      [6.8, 2.6, 0.4, '#e4e7e8', '#5b7184'],
      [7.45, 2.1, 0.4, '#58697c', '#9db4c4'],
    ];
    for (const [dx, h, w, wall, win] of bar) tower(k, x0 + dx, -16.3 - (h > 2.9 ? 0.4 : 0), w, 0.5, h, wall, { win, cols: 2, rows: Math.round(h / 0.2) });
    town(k, osloStyle, 3, SHORE_Z - 3.6, { rowStep: 0.7, rowRise: 0.3, gaps: 0.05 });
  },
  rows: 0,
  quiet: true,
  flag: undefined,
};

// ───────────────────────────── Bergen ─────────────────────────────

const bergenStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#f3efe4', '#ece6d6', '#f6f3ea', '#e2dac6', '#d9c9a8', '#efe6d0'],
  roofs: ['#3b3a3c', '#4a3a36', '#5a3f38', '#33363b'],
  floors: [2, 3],
  floorH: 0.19,
  w: [0.34, 0.5],
  d: [0.34, 0.46],
  roofKinds: [['front', 5], ['gable', 3]],
  pitch: 0.8,
  gap: [0.0, 0.05],
  chimney: 0.4,
};

function funicular(k: PortKit, xa: number, za: number, xb: number, zb: number, lift = 0.1): void {
  const p = k.solid;
  const n = 14;
  let prev: V3 | null = null;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(xa, xb, t);
    const z = lerp(za, zb, t);
    pts.push([x, k.ground(x, z) + lift, z]);
  }
  for (const q of pts) {
    if (prev) {
      p.quad([prev[0] - 0.13, prev[1], prev[2]], [prev[0] + 0.13, prev[1], prev[2]], [q[0] + 0.13, q[1], q[2]], [q[0] - 0.13, q[1], q[2]], '#d6cdb8', true);
      for (const dx of [-0.07, 0.07]) p.rod([prev[0] + dx, prev[1] + 0.012, prev[2]], [q[0] + dx, q[1] + 0.012, q[2]], 0.012, '#4a4d52', 4);
    }
    prev = q;
  }
  // the red car, two thirds up
  const t = 0.62;
  const cxm = lerp(xa, xb, t);
  const czm = lerp(za, zb, t);
  const cy = k.ground(cxm, czm) + lift + 0.04;
  p.box(cxm, cy, czm, 0.3, 0.2, 0.3, '#c8302a', { rx: 0.35 });
  p.box(cxm, cy + 0.08, czm + 0.002, 0.22, 0.06, 0.3, '#2f3d4d', { rx: 0.35, ao: 0 });
  // top station
  const [tx, tz] = [xb, zb];
  const ty = k.ground(tx, tz) - 0.05;
  p.box(tx, ty, tz, 0.7, 0.34, 0.5, '#f1ece0');
  p.prism(tx, ty + 0.34, tz, 0.78, 0.2, 0.56, '#b8433a', { ry: Math.PI / 2 * 0 });
  k.reserve(tx, tz, 0.5, 0.4);
}

const bergen: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#86a96a', land2: '#7c9f64', hill: '#4f7f55', rock: '#6f8a76', sand: '#8f8575', haze: '#cfe0e8' };
    k.shape = { relief: 2.0, range: 6.5, rise: 4.4, rough: 0.5, freq: 0.1 };
    k.shore = 'rock';
    const cx = centre(k, -13.0, 0.9);
    // Floyen: a steep, rounded, wooded mountain right behind the old quarter, Ulriken further left
    k.bump(cx + 1.2, -22.0, 11.5, 7.0, 4.4, 0.9);
    k.bump(cx - 9, -22, 6, 5, 3.4);
    k.plateau(cx, -13.3, 5.0, 1.6, LAND_Y + 0.03, 0.4);
    const forest = c3('#3d6b47');
    k.paint((x, y, z, slope, c) => {
      if (y > 1.0 && z < -15) c.lerp(forest, 0.65 * smooth(1.0, 2.2, y) * (1 - smooth(0.25, 0.5, slope)));
    });
  },
  build(k) {
    const cx = centre(k, -13.0, 0.9);
    const p = k.solid;
    // the wooden quay along the water
    quayDeck(k, cx - 4.7, cx + 4.7, -12.5, -11.55, 0.42, '#8a6a4a');
    // Bryggen: a row of steep gabled wooden warehouses, gable ends to the water
    const wall: Col[] = ['#b8433a', '#e0b04a', '#f1ece0', '#d8c25a', '#a33a30', '#e9e2d0', '#cf8a34', '#b8433a', '#e6d069'];
    const roof: Col[] = ['#5a3f38', '#3b3f46', '#7a4a3a', '#46403c', '#5a3f38', '#3b3f46', '#7a4a3a', '#46403c', '#5a3f38'];
    const wallH = [1.06, 0.94, 1.12, 0.99, 1.08, 0.92, 1.1, 1.01, 0.96];
    const w = 0.8;
    for (let i = 0; i < 9; i++) {
      const x = cx - 4 * (w + 0.03) + i * (w + 0.03);
      gable(k, x, -13.15, w, 1.15, wallH[i], 0.78 + (i % 3) * 0.06, wall[i], roof[i], { y: 0.4, hoist: i % 2 === 0, floors: 3, trim: tint(wall[i], -0.2) });
    }
    // a second, higher row of gables behind, shifted
    for (let i = 0; i < 5; i++) {
      const x = cx - 2.9 + i * 1.45 + (i % 2) * 0.1;
      gable(k, x, -14.4, 0.8, 1.0, 1.1 + (i % 2) * 0.1, 0.7, wall[(i * 2 + 3) % 9], roof[(i + 4) % 9], { hoist: i % 2 === 1, floors: 3 });
    }
    // barrels / boxes on the quay
    for (let i = 0; i < 6; i++) p.cyl(cx - 3.9 + i * 1.6 + (i % 2) * 0.2, 0.42, -11.95, 0.07, 0.07, 0.12, '#6a4a32', { seg: 6 });
    // the funicular up Floyen
    funicular(k, cx + 1.4, -16.0, cx + 3.0, -21.4);
    // white wooden houses on the lower slopes
    town(k, bergenStyle, 4, -15.3, { rowStep: 0.62, rowRise: 0, gaps: 0.1, maxSlope: 0.4, minY: 0.3 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.5], ['#c8302a', 0.5]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Esbjerg ─────────────────────────────

const esbjergStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#a8453b', '#b5543a', '#a04030', '#c97b58', '#d8b765', '#e4d6b0', '#b04a3c'],
  roofs: ['#a84a34', '#b8553d', '#8a3c2e', '#7a3f33'],
  trim: '#f6f3ea',
  floors: [1, 2],
  floorH: 0.2,
  w: [0.36, 0.58],
  d: [0.34, 0.46],
  roofKinds: [['gable', 5], ['front', 2], ['hip', 2]],
  pitch: 0.75,
  gap: [0.02, 0.2],
  chimney: 0.5,
};

const esbjerg: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#7fa058', land2: '#8bab5f', hill: '#74985a', rock: '#a8a49a', sand: '#e6d9ae', haze: '#d6e6ec' };
    k.shape = { relief: 0.18, range: 0.7, rise: 9, rough: 0.2, freq: 0.06 };
    k.shore = 'beach';
    const cx = centre(k, -13.6, 0.9);
    k.bump(cx, -13.9, 6.6, 2.2, 1.0, 0.9);
    const dune = c3('#8c9a58');
    k.paint((x, y, z, slope, c) => {
      if (y > 0.6 && z > -16.5 && z < -12.6) c.lerp(dune, 0.75 * smooth(0.6, 0.95, y));
    });
  },
  build(k) {
    const cx = centre(k, -13.6, 0.9);
    // Man meets the Sea: four giant white figures sitting side by side on the dune, looking out over the water
    const rng = new Rng(k.seed ^ 12345);
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * 1.95;
      const z = -13.7 + (i % 2) * 0.04;
      seated(k, x, k.groundMax(x, z, 0.6, 0.6) - 0.05, z, 2.7, i % 2 ? '#f6f4ee' : '#f1f0ea');
      k.reserve(x, z, 0.9, 0.9);
    }
    // offshore wind farm
    for (let i = 0; i < 9; i++) {
      const x = cx - 12 + i * 3.0 + rng.range(-0.3, 0.3);
      if (Math.abs(x - cx) < 4.6) continue;
      const z = -10.6 - (i % 3) * 0.55;
      turbine(k, x, z, 2.7, -0.95);
    }
    // a white village church with a red roof, off to the side
    church(k, cx + 6.2, -15.6, { wall: '#f4f0e6', roof: '#a84a34', spire: '#a84a34', h: 1.2 });
    // low brick houses
    town(k, esbjergStyle, 3, SHORE_Z - 4.2, { rowStep: 0.7, gaps: 0.12 });
  },
  rows: 0,
  quiet: true,
};


// ───────────────────────────── Stavanger ─────────────────────────────

/** One bronze sword of "Sverd i fjell", point down in the rock, a broad blade, a crossguard, a ball pommel. */
function sword(k: PortKit, x: number, y: number, z: number, H: number, ry: number): void {
  const p = k.solid;
  const bw = 0.5 + H * 0.06;
  const bronze = '#a8803c';
  const dark = '#7c5a2a';
  k.at(x, y, z, ry, 1, () => {
    const hTop = H * 0.82;
    p.extrude([[-bw / 2, hTop], [bw / 2, hTop], [bw * 0.48, H * 0.4], [0, -0.1], [-bw * 0.48, H * 0.4]], 0.11, 0, 0, 0, bronze, { ao: 0.05 });
    fq(p, -bw * 0.07, bw * 0.07, H * 0.24, hTop - 0.05, 0.057, dark);
    fq(p, -bw * 0.07, bw * 0.07, H * 0.24, hTop - 0.05, -0.057, dark);
    p.box(0, hTop, 0, bw * 2.2, 0.15, 0.16, dark, { ao: 0 });
    p.box(0, hTop + 0.15, 0, bw * 2.3, 0.05, 0.14, bronze, { ao: 0 });
    p.cyl(0, hTop + 0.2, 0, 0.065, 0.065, H * 0.11, '#6a4a22', { seg: 6, ao: 0 });
    p.ball(0, hTop + 0.2 + H * 0.11 + 0.09, 0, 0.14, bronze, { sy: 0.9 });
  });
}

const stavangerStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#f6f3ea', '#f4efe4', '#efe8d8', '#f1ece0', '#e9e1cc', '#f6f3ea'],
  roofs: ['#b5543a', '#a8503a', '#c4673f', '#9c4a35'],
  floors: [1, 2],
  floorH: 0.2,
  w: [0.34, 0.5],
  d: [0.34, 0.44],
  roofKinds: [['gable', 6], ['front', 2]],
  pitch: 0.55,
  gap: [0.04, 0.2],
  chimney: 0.6,
};

const stavanger: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#92b06a', land2: '#86a862', hill: '#7a9a5e', rock: '#8f9c92', sand: '#aaa699', haze: '#d3e4eb' };
    k.shape = { relief: 1.1, range: 2.8, rise: 3.2, rough: 0.5, freq: 0.1 };
    k.shore = 'rock';
    const mx = centre(k, -13.7, 1.7);
    // a rocky knoll by the water for the swords
    k.bump(mx, -14.0, 4.2, 2.2, 0.85, 0.9);
    // an open bay on the other side (the oil rig stands out in it)
    const side = -k.mole.dir;
    const c0 = k.vx(-13.7);
    k.feature((x, z, h) => {
      const bay = smooth(2.8, 6.4, side * (x - c0)) * smooth(-22, -17.0, z);
      return lerp(h, Math.min(h, -0.5), bay);
    });
  },
  build(k) {
    const p = k.solid;
    const mx = centre(k, -13.7, 1.7);
    const mz = -14.0;
    const gy = k.ground(mx, mz);
    // the rock: a mound of grey boulders on the shore, the swords planted in its crest
    const rng = new Rng(k.seed ^ 12345);
    const cols = ['#8a8d8c', '#7a7d7c', '#9a9c98', '#868a89', '#a2a39f'];
    const big: Array<[number, number, number, number]> = [[-1.2, 0.1, 1.15, 0.6], [0.0, -0.3, 1.45, 0.62], [1.2, 0.0, 1.1, 0.6], [-0.4, 0.55, 1.0, 0.5], [0.7, 0.6, 0.95, 0.5], [-2.0, 0.3, 0.8, 0.55], [2.0, 0.3, 0.8, 0.55]];
    big.forEach(([dx, dz, r, sy], i) => {
      const bx = mx + dx;
      const bz = mz + dz;
      p.rock(bx, Math.max(-0.6, k.ground(bx, bz) - 0.3), bz, r, cols[i % 5], { sy, ry: i * 1.3 });
    });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const bx = mx + Math.cos(a) * rng.range(1.9, 2.5);
      const bz = mz + Math.min(0.9, Math.sin(a)) * rng.range(0.8, 1.2);
      p.rock(bx, Math.max(-0.6, k.ground(bx, bz) - 0.2), bz, rng.range(0.35, 0.6), cols[(i + 1) % 5], { sy: rng.range(0.6, 0.9), ry: rng.next() * 6 });
    }
    // three swords of different heights, the tallest in the middle, set at different angles
    sword(k, mx - 1.3, gy + 0.55, mz + 0.1, 3.5, 0.55);
    sword(k, mx, gy + 0.85, mz - 0.1, 4.7, 0.0);
    sword(k, mx + 1.25, gy + 0.5, mz + 0.05, 3.1, -0.5);
    k.reserve(mx, mz, 2.6, 1.3);
    // the oil platform out in the bay
    oilRig(k, k.vx(-15.0) - k.mole.dir * 6.3, -15.0, 1.35);
    // old white wooden houses with red tile roofs
    town(k, stavangerStyle, 4, SHORE_Z - 1.6, { rowStep: 0.62, rowRise: 0, gaps: 0.1 });
  },
  rows: 0,
  quiet: true,
  mole: { light: { bands: [['#f6f3ea', 0.7], ['#c8302a', 0.3]], cap: '#2d3138', gallery: '#2d3138' } },
};

// ───────────────────────────── Gothenburg ─────────────────────────────

/** A Falu-red cottage with white trim and a dark roof. */
function cottage(k: PortKit, x: number, y: number, z: number, s: number, ry = 0): void {
  const p = k.solid;
  k.at(x, y, z, ry, s, () => {
    p.box(0, -0.05, 0, 0.44, 0.3, 0.32, '#a8362a');
    p.prism(0, 0.25, 0, 0.5, 0.19, 0.36, '#2f3338', { ry: Math.PI / 2 * 0 });
    p.tri([-0.25, 0.25, 0.186], [0.25, 0.25, 0.186], [0, 0.44, 0.186], '#a8362a');
    for (const sx of [-1, 1]) p.box(sx * 0.22, -0.05, 0.17, 0.025, 0.3, 0.025, '#f1ece0', { ao: 0 });
    for (const wx of [-0.11, 0.11]) {
      fq(p, wx - 0.045, wx + 0.045, 0.06, 0.16, 0.162, '#f1ece0');
      fq(p, wx - 0.03, wx + 0.03, 0.08, 0.14, 0.164, '#2f3d4d');
    }
    p.box(0.12, 0.3, -0.05, 0.05, 0.14, 0.05, '#7a3a30');
  });
}

/** A granite skerry: a rounded hump of pink-grey rock from the sea floor, with cottages on top. */
function skerry(k: PortKit, x: number, z: number, r: number, cottages: Array<[number, number, number]>): void {
  const p = k.solid;
  p.cyl(x, -0.9, z, r * 1.2, r * 0.85, 1.25, '#a39489', { seg: 7, ry: x });
  p.cyl(x + r * 0.1, 0.1, z, r * 0.8, r * 0.55, 0.22, '#b3a497', { seg: 7, ry: x * 2 });
  p.rock(x - r * 0.7, -0.05, z + r * 0.25, r * 0.4, '#948679', { sy: 0.6 });
  for (const [dx, dz, s] of cottages) cottage(k, x + dx * r, 0.3, z + dz * r, s, dx * 0.2);
  k.reserve(x, z, r + 0.3, r + 0.3);
}

/** Skanskaskrapan "the Lipstick": a red-and-white banded round tower with a flat top. */
function lipstick(k: PortKit, x: number, z: number, h: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.8, 0.6);
  p.box(x, y - 0.25, z, 2.0, 0.25 + 0.4, 1.2, '#a0a6aa');
  p.box(x + 0.5, y + 0.4, z + 0.1, 1.2, 0.04, 0.9, '#868c90', { ao: 0 });
  const r = 0.56;
  const n = 14;
  const bh = h / n;
  for (let i = 0; i < n; i++) p.cyl(x, y + 0.4 + i * bh, z, r, r, bh + 0.002, i % 2 ? '#f3efe9' : '#c4382d', { seg: 14, ao: 0, ry: 0.2 });
  p.cyl(x, y + 0.4 + h, z, r + 0.04, r + 0.04, 0.09, '#8f9498', { seg: 14, ao: 0 });
  p.cyl(x, y + 0.49 + h, z, 0.16, 0.16, 0.2, '#b9bdc0', { seg: 8 });
  k.reserve(x, z, 1.0, 0.7);
}

const gothenburgStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#d9a441', '#c9852e', '#a8453b', '#b8664a', '#e3c27a', '#8a4a35', '#cf9a4a'],
  roofs: ['#4a4038', '#3b3f46', '#6a4a3c', '#5a3f38'],
  floors: [3, 4],
  floorH: 0.18,
  w: [0.44, 0.7],
  d: [0.4, 0.5],
  roofKinds: [['hip', 4], ['gable', 3], ['flat', 1]],
  pitch: 0.45,
  gap: [0.0, 0.06],
  chimney: 0.2,
};

const gothenburg: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8fa66c', land2: '#839c64', hill: '#6c9160', rock: '#a99a8e', sand: '#a89c8c', haze: '#d0e1e8' };
    k.shape = { relief: 1.5, range: 3.2, rise: 3.0, rough: 0.85, freq: 0.14 };
    k.shore = 'rock';
    const cx = centre(k, -14.0, 1.4);
    k.bump(cx - 7.5, -15.5, 3.2, 2.4, 1.3);
    k.bump(cx + 8.0, -16.5, 4, 2.6, 1.5);
    const granite = c3('#b3a193');
    k.paint((x, y, z, slope, c) => {
      if (y > 0.7 && slope > 0.05) c.lerp(granite, 0.75);
    });
  },
  build(k) {
    const cx = centre(k, -14.0, 1.4);
    const p = k.solid;
    // Barken Viking: four-masted barque with a red hull, moored at the quay
    tallShip(k, cx - 1.6, -10.95, 6.4, 4, '#9c2f2a', { sail: '#ffffff', trim: '#e8d6a0' });
    // a stone quay for it
    quayDeck(k, cx - 6.5, cx + 3.9, -12.45, -11.75, 0.4, '#8d8780', false);
    // the Lipstick and the Gothia Towers
    lipstick(k, cx + 3.4, -14.6, 4.1);
    tower(k, cx + 5.4, -16.2, 0.95, 0.8, 4.9, '#b8cad6', { glass: true, win: '#3f6078', cols: 4, rows: 24 });
    tower(k, cx + 6.5, -16.9, 0.9, 0.75, 4.2, '#b8cad6', { glass: true, win: '#3f6078', cols: 4, rows: 21 });
    // skerries with red cottages, in front of the ship and out to the sides
    skerry(k, cx - 4.4, -9.5, 0.62, [[0.0, 0.0, 0.9]]);
    skerry(k, cx + 2.7, -9.2, 0.5, [[0.0, 0.05, 0.8]]);
    skerry(k, cx - 8.0, -10.4, 0.75, [[-0.1, 0.05, 1.0], [0.45, -0.25, 0.8]]);
    skerry(k, cx + 6.6, -10.3, 0.7, [[-0.15, 0, 0.95], [0.4, -0.2, 0.75]]);
    // pink-grey granite along the shore and on the knolls behind
    const rr = new Rng(k.seed ^ 12345);
    const granite = ['#a99a8e', '#b3a193', '#9c8d82', '#bba99c'];
    for (let i = 0; i < 26; i++) {
      const x = i % 2 ? cx + rr.range(4.8, 13) : cx + rr.range(-15, -7.6);
      const z = SHORE_Z + rr.range(-0.3, 0.5);
      p.rock(x, -0.35, z, rr.range(0.3, 0.65), granite[i % 4], { sy: rr.range(0.6, 0.9), ry: rr.next() * 6 });
    }
    for (let i = 0; i < 14; i++) {
      const x = cx + rr.range(-9, 9);
      const z = rr.range(-19, -15.6);
      if (k.isReserved(x, z, 0.3)) continue;
      const y = k.ground(x, z);
      if (y < 0.7) continue;
      p.rock(x, y - 0.1, z, rr.range(0.35, 0.8), granite[i % 4], { sy: rr.range(0.55, 0.85), ry: rr.next() * 6 });
    }
    // yellow, ochre and brown town houses on the rocky hill
    town(k, gothenburgStyle, 4, SHORE_Z - 1.4, { rowStep: 0.68, rowRise: 0.2, gaps: 0.08, maxSlope: 0.7 });
    void p;
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Aarhus ─────────────────────────────

/** ARoS: a brick cube with the rainbow-glass ring walkway on its roof. */
function aros(k: PortKit, x: number, z: number): void {
  const p = k.solid;
  const y = LAND_Y;
  const W = 4.2;
  const D = 2.6;
  const H = 2.5;
  p.box(x, y - 0.25, z, W, H + 0.25, D, '#8e4234');
  p.box(x, y + H, z, W + 0.1, 0.1, D + 0.1, '#6a3027');
  p.box(x, y - 0.05, z, W + 0.08, 0.14, D + 0.08, '#6a3027');
  // small square windows in an irregular grid, front and right
  const rng = new Rng(k.seed ^ 777);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 9; c++) {
      if (!rng.chance(0.6)) continue;
      const wx = x - W / 2 + 0.3 + c * ((W - 0.6) / 8);
      const wy = y + 0.55 + r * 0.48;
      fq(p, wx - 0.08, wx + 0.08, wy, wy + 0.2, z + D / 2 + 0.004, '#2c3440');
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      if (!rng.chance(0.55)) continue;
      const wz = z - D / 2 + 0.3 + c * ((D - 0.6) / 4);
      const wy = y + 0.55 + r * 0.48;
      rq(p, x + W / 2 + 0.004, wy, wy + 0.2, wz + 0.08, wz - 0.08, '#2c3440');
    }
  }
  // the entrance: a tall glass opening on the ground floor
  k.glass.quad([x - 0.6, y + 0.05, z + D / 2 + 0.012], [x + 0.6, y + 0.05, z + D / 2 + 0.012], [x + 0.6, y + 0.75, z + D / 2 + 0.012], [x - 0.6, y + 0.75, z + D / 2 + 0.012], '#7fb0c4');
  // "Your rainbow panorama": a ring of rainbow glass on the roof
  const R = 1.3;
  const ry0 = y + H + 0.1;
  p.cyl(x, ry0, z, R + 0.08, R + 0.08, 0.07, '#d3d4d4', { seg: 28, ao: 0 });
  const n = 30;
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    col.setHSL(((i / n) * 0.92 + 0.0) % 1, 0.82, 0.54);
    const A: V3 = [x + Math.cos(a0) * R, ry0 + 0.07, z + Math.sin(a0) * R];
    const B: V3 = [x + Math.cos(a1) * R, ry0 + 0.07, z + Math.sin(a1) * R];
    const hgt = 0.62;
    p.quad(A, B, [B[0], B[1] + hgt, B[2]], [A[0], A[1] + hgt, A[2]], col.clone(), true);
  }
  p.cyl(x, ry0 + 0.69, z, R + 0.02, R + 0.02, 0.025, '#e8e9ea', { seg: 28, ao: 0, open: true });
  k.reserve(x, z, W / 2 + 0.1, D / 2 + 0.1);
}

/** The City Hall tower: a slim pale-brick shaft with a clock and a flat overhanging top. */
function clockTower(k: PortKit, x: number, z: number, h: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.3, 0.3);
  const w = 0.74;
  p.box(x, y - 0.25, z, w + 0.6, 0.25 + 0.7, 1.0, '#d9cdb7');
  p.box(x, y, z, w, h, w, '#d6c5a8');
  for (let r = 0; r < 9; r++) {
    fq(p, x - 0.12, x - 0.04, y + 0.9 + r * 0.28, y + 1.05 + r * 0.28, z + w / 2 + 0.004, '#4a4f58');
    fq(p, x + 0.04, x + 0.12, y + 0.9 + r * 0.28, y + 1.05 + r * 0.28, z + w / 2 + 0.004, '#4a4f58');
  }
  // the clock, front and right
  const cy = y + h - 0.65;
  fq(p, x - 0.2, x + 0.2, cy, cy + 0.4, z + w / 2 + 0.006, '#f6f3ea');
  fq(p, x - 0.015, x + 0.015, cy + 0.2, cy + 0.36, z + w / 2 + 0.008, '#2a2f38');
  fq(p, x - 0.015, x + 0.1, cy + 0.19, cy + 0.215, z + w / 2 + 0.008, '#2a2f38');
  rq(p, x + w / 2 + 0.006, cy, cy + 0.4, z + 0.2, z - 0.2, '#f6f3ea');
  p.box(x, y + h - 0.15, z, w + 0.08, 0.15, w + 0.08, '#b9a98c');
  p.box(x, y + h, z, w + 0.2, 0.07, w + 0.2, '#8f8470');
  p.box(x, y + h + 0.07, z, w * 0.5, 0.26, w * 0.5, '#d6c5a8');
  p.box(x, y + h + 0.33, z, w * 0.62, 0.05, w * 0.62, '#8f8470');
  k.reserve(x, z, 0.5, 0.6);
}

const aarhusStyle: HouseStyle = {
  ...baseStyle,
  walls: ['#e9c13a', '#d9573a', '#4a78a8', '#8bb58f', '#e8b58a', '#f1ece0', '#c96a4a', '#e39a8f', '#d99a3a'],
  roofs: ['#a84a34', '#4a4f58', '#8a3c2e', '#5a3f38'],
  floors: [2, 3],
  floorH: 0.2,
  w: [0.38, 0.6],
  d: [0.36, 0.46],
  roofKinds: [['gable', 4], ['front', 3], ['hip', 1]],
  pitch: 0.6,
  gap: [0.0, 0.05],
  chimney: 0.3,
  runs: false,
};

const aarhus: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#95b968', land2: '#a3c26e', hill: '#6f9f5c', rock: '#9a9488', sand: '#e2d6aa', haze: '#d2e4ec' };
    k.shape = { relief: 1.7, range: 3.2, rise: 3.4, rough: 0.4, freq: 0.09 };
    k.shore = 'quay';
    const cx = centre(k, -14.4, 1.8);
    k.plateau(cx - 0.8, -14.3, 3.2, 2.2, LAND_Y, 0.35);
    k.plateau(cx + 3.6, -15.3, 1.2, 1.0, LAND_Y + 0.1, 0.4);
  },
  build(k) {
    const cx = centre(k, -14.4, 1.8);
    aros(k, cx - 0.8, -14.3);
    clockTower(k, cx + 3.7, -15.3, 4.1);
    town(k, aarhusStyle, 3, SHORE_Z - 1.3, { rowStep: 0.66, gaps: 0.06 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Copenhagen (Nyhavn) ─────────────────────────────

const nyhavn: Col[] = ['#e8c53a', '#c9402e', '#3f6fa3', '#e39a8f', '#d99a3a', '#f1ece0', '#7fae8a', '#e08a3a', '#4f8aa0', '#c9402e'];

const copenhagen: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#9bb86a', land2: '#a6bf70', hill: '#87aa62', rock: '#9a9488', sand: '#d8cfae', haze: '#d4e5ec' };
    k.shape = { relief: 0.3, range: 1.0, rise: 7, rough: 0.2, freq: 0.07 };
    k.shore = 'quay';
    const cx = centre(k, -13.4, 1.0);
    k.plateau(cx, -13.5, 6.4, 1.9, LAND_Y, 0.3);
  },
  build(k) {
    const cx = centre(k, -13.4, 1.0);
    const p = k.solid;
    quayDeck(k, cx - 6.4, cx + 6.4, -12.8, -11.8, 0.4, '#938e84', false);
    // Nyhavn: tall narrow gabled townhouses in every bright colour, steep roofs and stepped gables
    const w = 0.8;
    for (let i = 0; i < 10; i++) {
      const x = cx - 4.5 * (w + 0.02) + i * (w + 0.02);
      const h = 1.25 + (i % 3) * 0.14;
      const top = gable(k, x, -13.3, w, 1.0, h, 0.62 - (i % 2) * 0.12, nyhavn[i], i % 3 === 1 ? '#3b3f46' : '#7a4a3a', { y: 0.4, floors: 4, trim: '#f6f3ea', shutter: i % 2 ? '#f6f3ea' : undefined });
      void top;
      if (i % 3 === 2) {
        const sy = 0.4 + h;
        p.box(x, sy, -12.78, w * 0.9, 0.1, 0.05, tint(nyhavn[i], 0.15));
        p.box(x, sy + 0.1, -12.78, w * 0.6, 0.1, 0.05, tint(nyhavn[i], 0.15));
      }
    }
    // old wooden ships along the quay
    tallShip(k, cx - 2.3, -10.9, 4.8, 3, '#20262e', { sail: '#fff8e6', trim: '#c8a24a' });
    tallShip(k, cx + 3.0, -10.9, 3.8, 2, '#8a2f2a', { sail: '#fff8e6', trim: '#e8d6a0' });
    // the Little Mermaid on her rock
    const mx = cx + 6.4;
    p.rock(mx, -0.35, -11.4, 0.55, '#8d8f8e', { sy: 0.9 });
    p.rock(mx + 0.4, -0.35, -11.5, 0.35, '#7d807f', { sy: 1.1 });
    k.at(mx, 0.3, -11.4, -0.3, 0.55, () => {
      p.box(0, 0, 0, 0.5, 0.18, 0.5, '#6f8f7a');
      p.box(0, 0.16, 0, 0.3, 0.5, 0.2, '#6f8f7a');
      p.ball(0, 0.78, 0, 0.13, '#6f8f7a');
      p.box(0.1, 0.0, 0.3, 0.2, 0.2, 0.5, '#6f8f7a', { rx: -0.2 });
    });
    // the Opera: a huge flat roof floating over a glass hall
    const ox = cx - 7.6;
    const oz = -15.2;
    p.box(ox, -0.2, oz, 3.4, 0.2 + 0.4 + 0.9, 1.6, '#c9bda4');
    k.glass.box(ox + 0.1, 0.4, oz + 0.82, 3.0, 0.9, 0.04, '#8fc0d2');
    p.box(ox + 0.2, 1.35, oz + 0.3, 4.3, 0.12, 2.3, '#eceae4');
    p.box(ox + 0.2, 1.47, oz + 0.3, 4.3, 0.025, 2.3, '#9aa0a4', { ao: 0 });
    k.reserve(ox, oz, 2.2, 1.4);
    town(k, { ...aarhusStyle, floors: [3, 4], roofs: ['#4a4f58', '#6a4a40', '#3b3f46'] }, 3, -15.0, { rowStep: 0.68, gaps: 0.05 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Alesund ─────────────────────────────

const jugendWalls: Col[] = ['#e8d3a8', '#d9b88a', '#c9d3cf', '#e3bfb6', '#d3dcc4', '#e9de9a', '#b9c6d3', '#e6c9b0'];
const jugendRoofs: Col[] = ['#4b525c', '#59616b', '#3d5a52', '#6a4a42'];
const jugendSpires: Col[] = ['#4f7f74', '#3d4650', '#6a4a42', '#5f8f86'];

/** An Art Nouveau stone house: gabled, pastel, a corner turret with a tall spire. */
function jugend(k: PortKit, x: number, z: number, rng: Rng): void {
  const w = rng.range(0.42, 0.58);
  const d = rng.range(0.42, 0.52);
  const floors = rng.int(3, 5);
  const wall = jugendWalls[rng.int(0, jugendWalls.length - 1)];
  const roof = jugendRoofs[rng.int(0, jugendRoofs.length - 1)];
  const gTop = k.groundMax(x, z, w / 2, d / 2);
  const gLow = k.groundMin(x, z, w / 2, d / 2);
  if (gLow < 0.28 || gTop - gLow > 0.9 || k.isReserved(x, z, 0.02)) return;
  const wallH = floors * 0.19;
  gable(k, x, z, w, d, wallH, rng.range(0.28, 0.5), wall, roof, { floors, win: '#3a4452', lite: z < -13.5 });
  if (rng.chance(0.68)) {
    const side = rng.chance(0.5) ? 1 : -1;
    const tx = x + side * (w / 2 - 0.02);
    const tz = z + d / 2 - 0.02;
    const r = 0.1;
    const spire = jugendSpires[rng.int(0, jugendSpires.length - 1)];
    k.solid.cyl(tx, gTop - 0.2, tz, r, r, wallH + 0.2 + 0.1 + rng.range(0, 0.12), tint(wall, 0.05), { seg: 8 });
    const th = gTop + wallH + 0.1 + 0.1;
    k.solid.cone(tx, th, tz, r * 1.35, rng.range(0.4, 0.62), spire, { seg: 8 });
    for (let f = 0; f < floors; f++) fq(k.solid, tx - 0.025, tx + 0.025, gTop + f * 0.19 + 0.06, gTop + f * 0.19 + 0.14, tz + r + 0.002, '#3a4452');
  }
}

const alesund: Landmark = {
  terrain(k) {
    k.palette = { ...k.palette, land: '#8aa768', land2: '#7f9e64', hill: '#5f8a5a', rock: '#7f9088', sand: '#a79f90', haze: '#d4e4ec', snowLine: 7.0, snow: '#f2f6f8' };
    k.shape = { relief: 1.8, range: 7.0, rise: 2.6, rough: 0.8, freq: 0.12 };
    k.shore = 'quay';
    const cx = centre(k, -14.4, 1.0);
    // the town island: a steep dome (Aksla) with water around it
    k.bump(cx + 0.5, -18.6, 7.2, 5.6, 3.0, 1.0);
    k.plateau(cx, -13.0, 7.5, 2.4, LAND_Y + 0.02, 1.0);
    k.feature((x, z, h) => {
      const side = smooth(7.4, 9.4, Math.abs(x - cx)) * smooth(-22, -18, z);
      return lerp(h, Math.min(h, -0.5), side);
    });
    const forest = c3('#496f4d');
    k.paint((x, y, z, slope, c) => {
      if (y > 1.4 && z < -15.5) c.lerp(forest, 0.5 * smooth(1.4, 2.6, y) * (1 - smooth(0.3, 0.55, slope)));
    });
  },
  build(k) {
    const cx = centre(k, -14.4, 1.0);
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    // the harbour quay
    quayDeck(k, cx - 7.2, cx + 7.2, -12.55, -11.85, 0.4, '#8f8b84', false);
    // crowded Art Nouveau stone houses stepping up the steep island
    for (let r = 0; r < 5; r++) {
      const z = -13.3 - r * 0.62;
      for (let x = cx - 7.0 + rng.range(0, 0.2); x < cx + 7.4; x += 0.6) jugend(k, x + rng.range(-0.04, 0.04), z, rng);
    }
    // the Fjellstua viewing pavilion on top of Aksla and the zig-zag stairs up to it
    const px = cx + 0.6;
    const pz = -19.0;
    const py = k.ground(px, pz);
    p.box(px, py - 0.3, pz, 0.9, 0.3 + 0.32, 0.6, '#f1ece0');
    k.glass.box(px, py + 0.04, pz + 0.301, 0.82, 0.24, 0.02, '#7fb0c4');
    p.prism(px, py + 0.32, pz, 1.0, 0.22, 0.66, '#b8433a', { ry: Math.PI / 2 * 0 });
    p.cyl(px - 0.55, py, pz, 0.012, 0.012, 0.7, '#e8e8e8', { seg: 4 });
    k.reserve(px, pz, 0.7, 0.5);
    let sx = cx - 1.2;
    let sz = -15.4;
    const zig: Array<[number, number]> = [[cx - 0.6, -16.4], [cx - 1.6, -17.3], [cx - 0.2, -18.1], [px - 0.5, pz + 0.3]];
    for (const [ex, ez] of zig) {
      for (let i = 0; i < 4; i++) {
        const t0 = i / 4;
        const t1 = (i + 1) / 4;
        const ax = lerp(sx, ex, t0);
        const az = lerp(sz, ez, t0);
        const bx = lerp(sx, ex, t1);
        const bz = lerp(sz, ez, t1);
        const ya = k.ground(ax, az) + 0.1;
        const yb = k.ground(bx, bz) + 0.1;
        p.quad([ax - 0.05, ya, az], [ax + 0.05, ya, az], [bx + 0.05, yb, bz], [bx - 0.05, yb, bz], '#d9d3c4', true);
      }
      sx = ex;
      sz = ez;
    }
  },
  rows: 0,
  quiet: true,
  mole: { light: { h: 2.4, bands: [['#f1ede2', 0.78], ['#c8302a', 0.22]], cap: '#c8302a', gallery: '#c8302a', cottage: true } },
};

export const LANDMARKS: Record<string, Landmark> = { oslo, bergen, esbjerg, stavanger, gothenburg, aarhus, copenhagen, alesund };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Oslo', 'scan', 'oslo'],
  ['Bergen', 'scan', 'bergen'],
  ['Esbjerg', 'scan', 'esbjerg'],
  ['Stavanger', 'scan', 'stavanger'],
  ['Gothenburg', 'scan', 'gothenburg'],
  ['Aarhus', 'scan', 'aarhus'],
  ['Copenhagen', 'scan', 'copenhagen'],
  ['Alesund', 'scan', 'alesund'],
];
