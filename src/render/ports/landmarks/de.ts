import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, lerp, smooth, type Col } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { tint } from '../town';
import { boat, gantryCrane, turbine, stack, factory, containerStack } from '../props';
import { pane, winZ, lancetZ, dial, spireTower, nave, gable, hull, frigate, barge } from './benl';

/** Germany: Bremerhaven, Bremen, Kiel, Emden, Cologne, Duisburg, Mannheim and Wilhelmshaven. */

type Part = PortKit['solid'];

// ───────────────────────────── shared pieces ─────────────────────────────

/** A lattice tower: four posts, ring beams and X-bracing on every face, `levels` bays high. */
function latticeTower(p: Part, x: number, y: number, z: number, w: number, h: number, col: Col, levels = 5): void {
  const hw = w / 2;
  const top = y + h;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const wt = hw * 0.62; // the posts lean in toward the top
    p.rod([x + dx * hw, y - 0.2, z + dz * hw], [x + dx * wt, top, z + dz * wt], 0.03, col, 4);
  }
  for (let i = 0; i <= levels; i++) {
    const t = i / levels;
    const yy = lerp(y, top, t);
    const r = lerp(hw, hw * 0.62, t);
    p.box(x, yy, z + r, r * 2, 0.025, 0.025, col, { ao: 0 });
    p.box(x, yy, z - r, r * 2, 0.025, 0.025, col, { ao: 0 });
    p.box(x + r, yy, z, 0.025, 0.025, r * 2, col, { ao: 0 });
    p.box(x - r, yy, z, 0.025, 0.025, r * 2, col, { ao: 0 });
    if (i === levels) break;
    const t2 = (i + 1) / levels;
    const y2 = lerp(y, top, t2);
    const r2 = lerp(hw, hw * 0.62, t2);
    for (const sgn of [1, -1]) {
      p.rod([x - r, yy, z + sgn * r], [x + r2, y2, z + sgn * r2], 0.014, col, 3);
      p.rod([x + r, yy, z + sgn * r], [x - r2, y2, z + sgn * r2], 0.014, col, 3);
      p.rod([x + sgn * r, yy, z - r], [x + sgn * r2, y2, z + r2], 0.014, col, 3);
      p.rod([x + sgn * r, yy, z + r], [x + sgn * r2, y2, z - r2], 0.014, col, 3);
    }
  }
}

/** A parabolic steel arch with hangers, in the plane z, spanning x0 to x1 over a deck at y = deck. */
function arch(p: Part, x0: number, x1: number, z: number, deck: number, rise: number, col: Col, hangers = 8, r = 0.026): void {
  const n = hangers * 2;
  let prev: [number, number] = [x0, deck];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur: [number, number] = [lerp(x0, x1, t), deck + rise * 4 * t * (1 - t)];
    p.rod([prev[0], prev[1], z], [cur[0], cur[1], z], r, col, 4);
    if (i % 2 === 0 && i < n) p.rod([cur[0], deck, z], [cur[0], cur[1], z], 0.012, col, 3);
    prev = cur;
  }
}

/** A water channel running inland from the shore (the ground drops under the sea level); `bank` is the slope's width. */
function channel(k: PortKit, cx: number, half: number, zBack: number, bank = 0.55, zFront = SHORE_Z + 0.9, floor = -0.45): void {
  k.feature((x, z, h) => {
    if (z > zFront) return h;
    const w = smooth(half + bank, half, Math.abs(x - cx)) * smooth(zBack - 0.2, zBack + 0.6, z) * smooth(zFront, zFront - 0.3, z);
    return lerp(h, Math.min(h, floor), w);
  });
}

/** Steam puffs: a few white blobs drifting up and to the right of a stack. */
function steam(p: Part, x: number, y: number, z: number, s = 1): void {
  const puffs: Array<[number, number, number, number]> = [[0, 0, 0, 0.2], [0.18, 0.28, 0.02, 0.27], [0.4, 0.58, 0.0, 0.34], [0.72, 0.95, 0.03, 0.4], [1.12, 1.36, 0.0, 0.46]];
  for (const [dx, dy, dz, r] of puffs) p.blob(x + dx * s, y + dy * s, z + dz, r * s, new THREE.Color(1.45 - dy * 0.1, 1.48 - dy * 0.1, 1.5 - dy * 0.1), { ao: 0, sy: 0.85 });
}

/** A row of parked cars on a quay (little boxes with a roof box). */
function cars(k: PortKit, x: number, z: number, nx: number, nz: number, rng: Rng, y = LAND_Y): void {
  const p = k.solid;
  const cols = ['#c8302a', '#2c5da8', '#d9d4c7', '#2d3138', '#8c969d', '#e9a31a', '#f4f1ea', '#3f8d6b'];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const c = cols[Math.floor(rng.next() * cols.length)];
      p.box(x + i * 0.15, y, z - j * 0.11, 0.12, 0.04, 0.07, c, { ao: 0.1 });
      p.box(x + i * 0.15 - 0.005, y + 0.04, z - j * 0.11, 0.06, 0.03, 0.062, tint(c, 0.12), { ao: 0 });
    }
  }
  k.reserve(x + (nx * 0.15) / 2, z - (nz * 0.11) / 2, (nx * 0.15) / 2 + 0.05, (nz * 0.11) / 2 + 0.05);
}

/** A car-carrier ship: a navy hull under a huge white box of car decks, a bridge forward, funnel aft. */
function carCarrier(k: PortKit, x: number, z: number, len: number, ry = 0): void {
  const p = k.solid;
  const s = len / 6.4;
  k.at(x, 0, z, ry, s, () => {
    hull(p, 6.4, 1.25, '#1d2f4d', { freeboard: 0.5, depth: 0.25, bow: 0.14 });
    p.box(-0.55, 0.5, 0, 5.5, 1.6, 1.16, '#f3f1ea');
    p.box(-0.55, 0.5, 0.584, 5.5, 0.1, 0.004, '#c8302a', { ao: 0 });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 22; i++) pane(k, -3.1 + i * 0.25, 0.82 + r * 0.42, 0.58, 0.12, 0.1, '#33414f', 0.2);
    // the sloping bow block and the bridge on top
    p.box(2.35, 0.5, 0, 0.5, 1.2, 1.0, '#ebe8e0');
    p.box(1.5, 2.1, 0, 0.9, 0.4, 1.1, '#ece9e1');
    p.box(1.96, 2.2, 0, 0.02, 0.18, 1.04, '#33414f', { ao: 0 });
    p.box(1.5, 2.5, 0, 0.95, 0.025, 1.15, '#c9ccd0', { ao: 0 });
    p.cyl(1.5, 2.52, 0.0, 0.012, 0.01, 0.3, '#8a8f94', { seg: 4 });
    // the funnel aft and the stern ramp
    p.box(-2.9, 2.1, 0, 0.5, 0.3, 0.7, '#ece9e1');
    p.cyl(-2.9, 2.4, 0, 0.16, 0.14, 0.3, '#c8302a', { seg: 8 });
    p.box(-3.32, 0.12, 0, 0.05, 1.6, 0.9, '#3a4452', { rz: 0.12, ao: 0 });
  });
}

// ───────────────────────────── Bremerhaven ─────────────────────────────

const bremerhaven: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.8;
    k.plateau(k.vx(-15.5, 0.6), -15.5, 6.5, 3.0, LAND_Y + 0.05);
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14.5, 0.9);
    const zS = -14.6;
    const y = LAND_Y + 0.05;
    // Sail City: a tall, curved glass sail leaning on a low white base
    const H = 5.4;
    const xl = (yy: number) => -0.95 + 0.5 * (yy / H);
    const xr = (yy: number) => -0.45 + 1.55 * Math.pow(1 - yy / H, 1.4);
    const pts: Array<[number, number]> = [[xl(0), 0]];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const yy = (i / n) * H;
      pts.push([xr(yy), yy]);
    }
    for (let i = n; i >= 1; i--) pts.push([xl((i / n) * H), (i / n) * H]);
    p.box(cx + 0.1, y - 0.25, zS, 2.7, 0.25 + 0.5, 1.6, '#e8e6df');
    p.box(cx + 0.1, y + 0.5, zS, 2.76, 0.05, 1.66, '#c9c6bc', { ao: 0 });
    k.glass.extrude(pts, 1.1, cx, y + 0.55, zS, '#4f9fd0', { ao: 0.04 });
    for (let yy = 0.28; yy < H - 0.1; yy += 0.26) {
      const a = xl(yy) + 0.02;
      const b = xr(yy) - 0.02;
      if (b - a < 0.1) break;
      p.box((a + b) / 2 + cx, y + 0.55 + yy, zS + 0.553, b - a, 0.022, 0.006, '#eef6f9', { ao: 0 });
    }
    for (let i = 1; i < 6; i++) {
      const fx = lerp(-0.85, 0.9, i / 6);
      const topY = H * (1 - Math.pow(Math.max(0, (fx + 0.45) / 1.55), 1 / 1.4));
      if (fx > xr(0.05) - 0.05 || topY < 0.4) continue;
      p.box(cx + fx, y + 0.55, zS + 0.553, 0.012, Math.min(topY, H) - 0.05, 0.006, '#eef6f9', { ao: 0 });
    }
    p.cyl(cx - 0.35, y + 0.55 + H - 0.02, zS, 0.012, 0.01, 0.55, '#c8302a', { seg: 4 });
    k.reserve(cx + 0.1, zS, 1.5, 0.9);
    // the Radarturm: a slim white shaft with a round observation head and a radar antenna
    const rx = cx - 3.4;
    const rz = -16.0;
    const ry = k.ground(rx, rz) - 0.02;
    p.cyl(rx, ry - 0.2, rz, 0.2, 0.13, 0.2 + 3.7, '#f2f2ee', { seg: 10 });
    p.lathe(rx, ry + 3.6, rz, [[0.13, 0], [0.32, 0.12], [0.52, 0.26], [0.52, 0.66], [0.44, 0.76], [0.0, 0.8]], '#f2f2ee', { seg: 10 });
    k.glass.cyl(rx, ry + 3.95, rz, 0.535, 0.535, 0.32, '#5f8fb0', { seg: 10 });
    p.cyl(rx, ry + 4.4, rz, 0.015, 0.012, 0.65, '#c8302a', { seg: 4 });
    p.box(rx, ry + 4.9, rz, 0.62, 0.05, 0.1, '#9aa0a4', { ao: 0 });
    p.box(rx, ry + 4.95, rz, 0.1, 0.1, 0.1, '#6e777e');
    k.reserve(rx, rz, 0.6, 0.6);
    // container cranes and stacks on the quay
    const cranes = [cx - 7.0, cx - 5.3, cx + 4.4, cx + 6.1, cx + 7.8];
    cranes.forEach((x, i) => gantryCrane(k, x, SHORE_Z - 0.45, { color: i % 2 ? '#2c5da8' : '#c9402e', s: 0.95 }));
    containerStack(k, cx + 3.2, -13.3, 12, 3, 3, rng);
    containerStack(k, cx - 8.1, -13.4, 8, 3, 3, rng);
  },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Bremen ─────────────────────────────

/** The Roland: a stone knight with a raised sword and a gold shield on a stepped pedestal. */
function roland(k: PortKit, x: number, y: number, z: number, s: number): void {
  const p = k.solid;
  const stone = '#d6cfbd';
  const dk = tint(stone, -0.14);
  p.box(x, y - 0.2, z, 1.0 * s, 0.35, 1.0 * s, '#b9b3a4');
  p.box(x, y + 0.1, z, 0.78 * s, 0.14 * s, 0.78 * s, '#c9c3b2');
  p.box(x, y + 0.1 + 0.14 * s, z, 0.58 * s, 0.7 * s, 0.58 * s, stone);
  p.box(x, y + 0.1 + 0.84 * s, z, 0.68 * s, 0.06 * s, 0.68 * s, tint(stone, -0.06));
  k.at(x, y + 0.1 + 0.9 * s, z, 0, s, () => {
    p.box(-0.1, 0, 0, 0.16, 0.5, 0.2, dk);
    p.box(0.1, 0, 0, 0.16, 0.5, 0.2, dk);
    p.box(0, 0.42, 0, 0.52, 0.34, 0.34, stone);
    p.box(0, 0.74, 0, 0.46, 0.5, 0.3, stone);
    p.box(0, 0.76, 0, 0.5, 0.05, 0.34, '#d9b94a', { ao: 0 });
    p.box(0, 1.24, 0, 0.4, 0.08, 0.22, dk);
    p.ball(0, 1.42, 0, 0.15, stone, { sy: 1.1 });
    p.cyl(0, 1.5, 0, 0.17, 0.16, 0.1, '#d9b94a', { seg: 8 });
    // the sword arm and the sword held upright
    p.box(0.32, 0.86, 0.02, 0.12, 0.4, 0.14, stone);
    p.rod([0.38, 0.8, 0.06], [0.38, 1.95, 0.06], 0.026, '#e6e1d2', 4);
    p.box(0.38, 0.92, 0.06, 0.26, 0.04, 0.05, '#d9b94a');
    // the shield on the left arm, facing the square
    p.extrude([[-0.17, 0], [0.17, 0], [0.17, 0.26], [0, 0.46], [-0.17, 0.26]], 0.05, -0.34, 0.6, 0.15, '#7a6a2a');
    p.extrude([[-0.14, 0.02], [0.14, 0.02], [0.14, 0.25], [0, 0.42], [-0.14, 0.25]], 0.05, -0.34, 0.6, 0.165, '#e6bd3c');
    p.box(-0.34, 0.72, 0.195, 0.1, 0.2, 0.01, '#2d3138', { ao: 0 });
  });
  k.reserve(x, z, 0.6 * s, 0.6 * s);
}

const bremen: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.8;
    k.plateau(k.vx(-15.5, 0.4), -15.5, 7.2, 3.6, LAND_Y + 0.05);
    k.paint((x, y, z, slope, c) => {
      if (z > -16.6 && z < -12.6 && Math.abs(x - k.vx(-14, 0.2)) < 6) c.lerp(new THREE.Color('#d3cbb6'), 0.8);
    });
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(-15, 0.5);
    const y0 = LAND_Y + 0.05;
    // St Peter's Cathedral: twin green-copper spires over a high nave
    const x0 = cx + 1.9;
    const z0 = -16.2;
    const stone = '#cbbb98';
    const green = '#5e9a85';
    k.at(x0, y0, z0, -0.25, 1, () => {
      p.box(0, -0.25, -0.5, 1.2, 0.25 + 2.5, 1.0, stone);
      lancetZ(p, 0, 0, 0, 0.5, 1.1, '#3a2f2a');
      k.glass.quad([-0.2, 1.3, 0.012], [0.2, 1.3, 0.012], [0.2, 2.1, 0.012], [-0.2, 2.1, 0.012], '#6f93b0');
      k.glass.tri([-0.2, 2.1, 0.012], [0.2, 2.1, 0.012], [0, 2.45, 0.012], '#6f93b0');
      p.extrude([[-0.6, 0], [0.6, 0], [0, 0.85]], 0.14, 0, 2.5, -0.07, tint(stone, 0.04), { ao: 0.05 });
      p.cone(0, 3.3, -0.06, 0.05, 0.4, green, { seg: 4 });
      for (const sx of [-1, 1]) {
        spireTower(k, sx * 1.075, 0, -0.475, { w: 0.95, shaft: 3.0, spire: 3.2, stone: tint(stone, -0.03), roof: green, finial: '#e8b923' });
      }
      k.at(0, 0, -1.0, 0, 1, () => nave(k, { len: 3.8, nave: 1.2, aisle: 0.95, wallH: 1.9, aisleH: 1.1, roofH: 1.0, stone, roof: '#5f7a72', bays: 5, apse: true }));
    });
    for (let i = 0; i < 5; i++) k.reserve(x0 + i * 0.25, z0 - 0.7 - i * 0.85, 1.9, 0.7);
    k.reserve(x0 - 0.9, -14.3, 3.3, 1.2);
    // the Roland on the market square
    roland(k, cx - 1.4, y0, -13.7, 1.5);
    // the Rathaus: a long renaissance hall with an arcade, big windows, shaped gables and a copper roof
    const rx = cx - 5.2;
    const rz = -15.1;
    const W = 3.4;
    const D = 1.1;
    const H = 1.5;
    const sand = '#dcd3ba';
    p.box(rx, y0 - 0.25, rz, W, 0.25 + H, D, sand);
    for (let i = 0; i < 8; i++) lancetZ(p, rx - W / 2 + 0.22 + (i * (W - 0.44)) / 7, y0, rz + D / 2, 0.22, 0.52, '#4a4136');
    p.box(rx, y0 + 0.6, rz, W + 0.04, 0.045, D + 0.04, '#f0e9d6', { ao: 0 });
    winZ(k, rx, y0 + 0.7, rz + D / 2, W - 0.3, 0.72, 8, 2, '#3d5268', 0.5, 0.66);
    p.box(rx, y0 + H, rz, W + 0.08, 0.05, D + 0.08, '#f0e9d6', { ao: 0 });
    p.prism(rx, y0 + H + 0.05, rz, D + 0.04, 0.85, W + 0.06, '#5e9a85', { ry: Math.PI / 2 });
    gable(p, 'neck', rx, y0 + H, rz + D / 2, 1.0, 1.0, sand, '#f0e9d6');
    gable(p, 'bell', rx - 1.2, y0 + H, rz + D / 2, 0.7, 0.62, sand, '#f0e9d6');
    gable(p, 'bell', rx + 1.2, y0 + H, rz + D / 2, 0.7, 0.62, sand, '#f0e9d6');
    for (const sx of [-1, 1]) {
      p.cyl(rx + sx * 1.45, y0 + H + 0.2, rz + 0.05, 0.1, 0.1, 0.4, sand, { seg: 8 });
      p.cone(rx + sx * 1.45, y0 + H + 0.6, rz + 0.05, 0.13, 0.5, '#5e9a85', { seg: 8 });
    }
    k.reserve(rx, rz, W / 2 + 0.1, D / 2 + 0.1);
    // a couple of barges on the Weser
    const rng = new Rng(k.seed ^ 12345);
    barge(k, cx - 2.5, -10.5, 3.4, 'sand', rng, 0);
    barge(k, cx + 4.5, -10.8, 3.2, 'coal', rng, 0.02);
  },
  mole: 'none',
  flag: { dx: 5.0, z: -12.9 },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Kiel ─────────────────────────────

/** A road bridge on a bowstring arch: a deck, two arch ribs and hangers. */
function bowstring(p: Part, x0: number, x1: number, z: number, deck: number, rise: number, col: Col): void {
  p.box((x0 + x1) / 2, deck - 0.08, z, x1 - x0, 0.08, 0.7, '#8d9298');
  for (const dz of [-0.3, 0.3]) {
    p.box((x0 + x1) / 2, deck, z + dz, x1 - x0, 0.035, 0.03, col, { ao: 0 });
    arch(p, x0, x1, z + dz, deck, rise, col, 6, 0.03);
  }
  p.box((x0 + x1) / 2, deck + rise * 0.7, z, 0.03, 0.03, 0.6, col, { ao: 0 });
}

const kiel: Landmark = {
  terrain(k) {
    k.shore = 'dike';
    k.shape.relief = 0.3;
    k.shape.range = 1.0;
    channel(k, k.vx(-15.5, 0.2), 1.5, -22.6);
    channel(k, k.vx(-15.5, 0.2), 1.5, -40, 1.7, -22.0);
    k.paint((x, y, z, slope, c) => {
      if (z < -21 && Math.abs(x - k.vx(-15.5, 0.2)) < 3.6) c.lerp(new THREE.Color('#9cba68'), 0.95);
    });
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-15.5, 0.2);
    const wallTop = LAND_Y + 0.4;
    const zA = -12.2;
    const zB = -22.5;
    const brick = '#a8503a';
    // lock walls
    for (const s of [-1, 1]) {
      p.box(cx + s * 1.85, -0.95, (zA + zB) / 2, 0.6, 0.95 + wallTop, zA - zB, '#aaa598');
      p.box(cx + s * 1.85, wallTop, (zA + zB) / 2, 0.64, 0.045, zA - zB, '#cdc8b9', { ao: 0 });
    }
    // the lock gates: two pairs of mitre leaves, dark steel with a red top rail
    for (const zg of [-13.4, -19.6]) {
      for (const s of [-1, 1]) {
        p.box(cx + s * 0.64, -0.9, zg + 0.34, 1.0, 0.9 + 0.72, 0.18, '#2f3b48', { ry: s * 0.45, ao: 0.06 });
        p.box(cx + s * 0.64, 0.7, zg + 0.34, 1.0, 0.06, 0.2, '#c8302a', { ry: s * 0.45, ao: 0 });
      }
    }
    // a road bridge over the chamber
    bowstring(p, cx - 1.9, cx + 1.9, -15.9, wallTop + 0.55, 1.0, '#3d5560');
    // the two big gate houses at the sea head of the lock: brick halls with a clock tower each
    for (const s of [-1, 1]) {
      const gx = cx + s * 3.55;
      const gz = -13.7;
      const gy = k.groundMax(gx, gz, 0.8, 0.8);
      p.box(gx, gy - 0.25, gz, 1.5, 0.25 + 1.5, 1.2, brick);
      winZ(k, gx, gy + 0.2, gz + 0.6, 1.3, 1.1, 3, 2, '#34455a', 0.45, 0.62);
      p.box(gx, gy + 1.5, gz, 1.62, 0.05, 1.32, '#efe9dc', { ao: 0 });
      p.prism(gx, gy + 1.55, gz, 1.32, 0.7, 1.5, '#4b5058', { ry: Math.PI / 2 });
      // the tower at the outer corner
      const tx = gx + s * 0.55;
      p.box(tx, gy - 0.25, gz - 0.1, 0.62, 0.25 + 2.6, 0.62, tint(brick, 0.04));
      winZ(k, tx, gy + 1.0, gz - 0.1 + 0.31, 0.4, 1.2, 1, 3, '#34455a', 0.5, 0.55);
      dial(p, tx, gy + 2.15, gz - 0.1 + 0.31, 0.15, '#f1ead6');
      p.box(tx, gy + 2.6, gz - 0.1, 0.7, 0.05, 0.7, '#efe9dc', { ao: 0 });
      p.pyramid(tx, gy + 2.65, gz - 0.1, 0.7, 0.65, 0.7, '#5e9a85');
      p.ball(tx, gy + 3.33, gz - 0.1, 0.04, '#e8b923');
      k.reserve(gx, gz, 1.0, 0.8);
    }
    k.reserve(cx, -17.2, 2.4, 5.6);
    // a little ferry in the chamber, sailing yachts in the fairway
    k.at(cx, 0, -17.6, Math.PI / 2, 1.5, () => boat(k, 0, 0, 'ferry', rng, 0));
    const cols = ['#c8302a', '#2c5da8', '#f6f3ea', '#e9a31a', '#3f8d6b', '#f6f3ea'];
    const spots: Array<[number, number]> = [[-4.6, -9.3], [-2.9, -10.7], [-0.4, -9.2], [1.8, -10.4], [3.6, -9.0], [5.4, -10.6]];
    spots.forEach(([dx, z], i) => {
      k.at(cx + dx, 0, z, rng.range(-0.5, 0.5), 2.4, () => boat(k, 0, 0, 'sail', rng, 0, cols[i % cols.length]));
    });
    // a red-and-white beacon on the north pier
    p.cyl(cx - 5.9, LAND_Y - 0.2, -12.9, 0.22, 0.2, 0.4, '#b9b3a4', { seg: 10 });
    p.cyl(cx - 5.9, LAND_Y + 0.2, -12.9, 0.17, 0.12, 1.5, '#f6f3ea', { seg: 10 });
    p.cyl(cx - 5.9, LAND_Y + 0.6, -12.9, 0.16, 0.14, 0.4, '#c8302a', { seg: 10 });
    p.cyl(cx - 5.9, LAND_Y + 1.7, -12.9, 0.15, 0.15, 0.1, '#2d3138', { seg: 10 });
    k.glow.ball(cx - 5.9, LAND_Y + 1.85, -12.9, 0.08, '#fff1b0');
    p.cone(cx - 5.9, LAND_Y + 1.92, -12.9, 0.14, 0.2, '#c8302a', { seg: 10 });
    k.reserve(cx - 5.9, -12.9, 0.4, 0.4);
  },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Emden ─────────────────────────────

const emden: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
    k.plateau(k.vx(-15, 0.2), -15, 5.5, 2.6, LAND_Y + 0.05);
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-14.5, 0.2);
    const y0 = LAND_Y + 0.05;
    const zr = -14.6;
    const brick = '#a8483a';
    const W = 3.6;
    const D = 1.2;
    const H = 1.45;
    // the Rathaus hall: red brick with pale stone bands, a steep slate roof, stepped gables
    p.box(cx, y0 - 0.25, zr, W, 0.25 + H, D, brick);
    for (const yy of [0.5, 1.0]) p.box(cx, y0 + yy, zr, W + 0.03, 0.04, D + 0.03, '#efe6d2', { ao: 0 });
    winZ(k, cx, y0 + 0.08, zr + D / 2, W - 0.5, 0.36, 8, 1, '#34455a', 0.5, 0.8);
    winZ(k, cx, y0 + 0.6, zr + D / 2, W - 0.5, 0.36, 8, 1, '#34455a', 0.5, 0.8);
    winZ(k, cx, y0 + 1.08, zr + D / 2, W - 0.5, 0.3, 8, 1, '#34455a', 0.5, 0.8);
    p.box(cx, y0 + H, zr, W + 0.06, 0.05, D + 0.06, '#efe6d2', { ao: 0 });
    p.prism(cx, y0 + H + 0.05, zr, D + 0.04, 0.95, W + 0.06, '#4b5058', { ry: Math.PI / 2 });
    for (const sx of [-1, 1]) {
      gable(p, 'step', cx + sx * 1.3, y0 + H, zr + D / 2, 0.95, 0.95, brick, '#efe6d2');
      for (let r = 0; r < 3; r++) pane(k, cx + sx * 1.3, y0 + H + 0.12 + r * 0.22, zr + D / 2 + 0.05, 0.1, 0.14, '#34455a', 0.3);
    }
    // the tall central tower: brick shaft, a clock, a copper lantern and a needle spire
    const tx = cx + 0.1;
    const tz = zr + 0.15;
    p.box(tx, y0 - 0.25, tz, 0.9, 0.25 + 3.2, 0.9, tint(brick, 0.04));
    for (const yy of [0.9, 1.7, 2.5]) p.box(tx, y0 + yy, tz, 0.94, 0.04, 0.94, '#efe6d2', { ao: 0 });
    lancetZ(p, tx, y0 + 0.9, tz + 0.45, 0.26, 0.7, '#34455a');
    winZ(k, tx, y0 + 1.9, tz + 0.45, 0.5, 0.5, 2, 1, '#34455a', 0.5, 0.8);
    dial(p, tx, y0 + 2.8, tz + 0.455, 0.25, '#f1ead6');
    dial(p, tx + 0.455, y0 + 2.8, tz, 0.25, '#f1ead6', 'x');
    p.box(tx, y0 + 3.2, tz, 1.0, 0.07, 1.0, '#efe6d2');
    p.box(tx, y0 + 3.27, tz, 0.7, 0.4, 0.7, '#4f7a66');
    p.pyramid(tx, y0 + 3.67, tz, 0.78, 0.35, 0.78, '#4f7a66');
    p.lathe(tx, y0 + 3.95, tz, [[0.2, 0], [0.26, 0.12], [0.2, 0.3], [0.1, 0.42], [0.04, 0.5]], '#4f7a66', { seg: 8 });
    p.cyl(tx, y0 + 4.4, tz, 0.014, 0.006, 0.9, '#4f7a66', { seg: 4 });
    p.ball(tx, y0 + 5.32, tz, 0.04, '#e8b923');
    k.reserve(cx, zr, W / 2 + 0.1, D / 2 + 0.1);
    // wind turbines behind and beside it
    const ws: Array<[number, number]> = [[-7.2, -16.4], [-4.0, -18.8], [4.6, -18.0], [7.4, -16.2], [0.3, -21.0]];
    for (const [dx, z] of ws) {
      const x = cx + dx;
      if (k.isReserved(x, z, 0.2)) continue;
      turbine(k, x, z, 2.4);
      k.reserve(x, z, 0.2, 0.2);
    }
    // a car carrier at the quay with its cars lined up behind
    carCarrier(k, k.vx(-10.65, k.mole.dir * 2.7), -10.65, 5.4);
    cars(k, cx - 6.6, -13.1, 9, 3, rng);
    cars(k, cx + 3.7, -13.2, 9, 3, rng);
  },
  mole: { armour: 'tetrapods' },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Cologne ─────────────────────────────

const cologne: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.3;
    k.shape.range = 1.0;
    k.plateau(k.vx(-16.5, 0.0), -16.5, 5.4, 4.6, LAND_Y + 0.05);
    k.paint((x, y, z, slope, c) => {
      if (z > -16.5 && z < -12.6 && Math.abs(x - k.vx(-14, 0.1)) < 3.0) c.lerp(new THREE.Color('#cfc8b6'), 0.85);
    });
  },
  build(k) {
    const p = k.solid;
    const x0 = k.vx(-15.5, 0.1);
    const z0 = -15.6;
    const y0 = LAND_Y + 0.05;
    const stone = '#716b61';
    const dark = '#5c574f';
    k.at(x0, y0, z0, -0.3, 1, () => {
      // the west front: a deep portal block between the two towers
      p.box(0, -0.25, -0.5, 1.1, 0.25 + 3.1, 1.0, stone);
      for (const f of [-0.34, 0, 0.34]) lancetZ(p, f, 0, 0, 0.28, 1.0, '#1f1c18');
      k.glass.quad([-0.24, 1.35, 0.012], [0.24, 1.35, 0.012], [0.24, 2.4, 0.012], [-0.24, 2.4, 0.012], '#6f93b0');
      k.glass.tri([-0.24, 2.4, 0.012], [0.24, 2.4, 0.012], [0, 2.9, 0.012], '#6f93b0');
      p.extrude([[-0.55, 0], [0.55, 0], [0, 1.0]], 0.14, 0, 3.1, -0.07, tint(stone, 0.05), { ao: 0.05 });
      p.cone(0, 4.05, -0.06, 0.06, 0.45, dark, { seg: 4 });
      for (const sx of [-1, 1]) {
        spireTower(k, sx * 1.1, 0, -0.5, { w: 1.1, shaft: 3.9, spire: 3.9, stone, roof: dark, crockets: true, dark: '#1f1c18' });
      }
      k.at(0, 0, -1.0, 0, 1, () => nave(k, { len: 4.2, nave: 1.1, aisle: 1.1, wallH: 2.4, aisleH: 1.3, roofH: 1.3, stone, roof: '#58665f', bays: 6, fleche: true, apse: true, win: '#1f1c18' }));
    });
    for (let i = 0; i < 6; i++) k.reserve(x0 + i * 0.28, z0 - 0.7 - i * 0.8, 2.0, 0.7);
    k.reserve(k.vx(-14, 0.1), -14.1, 3.0, 1.5);
    // the Hohenzollern Bridge: three steel arches on stone piers, with a brick tower at the bank
    const bz = -10.2;
    const deck = 0.65;
    const bx0 = x0 - 9.0;
    const span = 3.8;
    const col = '#4f5f5c';
    for (let i = 0; i <= 3; i++) p.box(bx0 + i * span, -0.95, bz, 0.5, 0.95 + deck, 0.9, '#a89a82');
    p.box(bx0 + 1.5 * span, deck - 0.08, bz, 3 * span, 0.1, 0.8, '#6b6f73');
    p.box(bx0 + 1.5 * span, deck + 0.0, bz - 0.38, 3 * span, 0.04, 0.03, col, { ao: 0 });
    p.box(bx0 + 1.5 * span, deck + 0.0, bz + 0.38, 3 * span, 0.04, 0.03, col, { ao: 0 });
    for (let i = 0; i < 3; i++) {
      for (const dz of [-0.38, 0.38]) arch(p, bx0 + i * span, bx0 + (i + 1) * span, bz + dz, deck, 1.5, col, 7, 0.032);
      for (let j = 1; j < 6; j++) p.box(bx0 + i * span + (j * span) / 6, deck + 1.5 * 4 * (j / 6) * (1 - j / 6) - 0.03, bz, 0.025, 0.025, 0.76, col, { ao: 0 });
    }
    // a train on the bridge
    p.box(bx0 + 4.5, deck, bz, 3.0, 0.3, 0.3, '#c8302a');
    p.box(bx0 + 4.5, deck + 0.3, bz, 2.9, 0.05, 0.28, '#f1ece0');
    // the end of the bridge: a stone tower on the right bank, joined to the quay by an embankment
    const ex = bx0 + 3 * span;
    p.box(ex + 0.7, -0.95, (bz + SHORE_Z - 0.2) / 2, 1.5, 0.95 + deck + 0.3, Math.abs(bz - SHORE_Z) + 0.6, '#a89a82');
    for (const dz of [-0.4, 0.4]) {
      p.box(ex + 0.2, deck, bz + dz, 0.5, 1.5, 0.5, '#a08f78');
      p.box(ex + 0.2, deck + 1.5, bz + dz, 0.58, 0.06, 0.58, '#c9bfa8', { ao: 0 });
      p.cone(ex + 0.2, deck + 1.56, bz + dz, 0.4, 0.5, '#4a5560', { seg: 8 });
      for (let q = 0; q < 6; q++) p.box(ex + 0.2 + Math.cos((q / 6) * 6.28) * 0.27, deck + 1.56, bz + dz + Math.sin((q / 6) * 6.28) * 0.27, 0.07, 0.1, 0.07, '#a08f78', { ao: 0 });
    }
    k.reserve(ex + 0.7, -11.4, 0.9, 1.0);
  },
  mole: 'none',
  flag: { dx: 5.0, z: -12.9 },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Duisburg ─────────────────────────────

const duisburg: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.7;
    k.plateau(k.vx(-15.5, 0.3), -15.5, 8, 4.0, LAND_Y + 0.05);
    k.paint((x, y, z, slope, c) => {
      if (z > -21 && z < -12.5 && Math.abs(x - k.vx(-15.5, 0.3)) < 8) c.lerp(new THREE.Color('#8f8a7c'), 0.7);
    });
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-15.5, 0.3);
    const y0 = LAND_Y + 0.05;
    const steel = '#9a7a68';
    const rust = '#6f4636';
    // the blast furnace: a waisted vessel on a heavy base with a bell on top
    const fx = cx - 0.6;
    const fz = -16.0;
    p.cyl(fx, y0 - 0.25, fz, 0.85, 0.85, 0.25 + 0.5, '#6e7378', { seg: 12 });
    p.lathe(fx, y0 + 0.5, fz, [[0.7, 0], [0.8, 0.5], [0.72, 1.3], [0.5, 2.3], [0.36, 2.9], [0.3, 3.2], [0.0, 3.3]], steel, { seg: 12 });
    for (const yy of [0.3, 0.9, 1.5, 2.1]) p.cyl(fx, y0 + 0.5 + yy, fz, 0.8 - yy * 0.1, 0.8 - yy * 0.1, 0.06, rust, { seg: 12, ao: 0 });
    p.cyl(fx, y0 + 3.8, fz, 0.2, 0.2, 0.3, '#6e7378', { seg: 8 });
    p.cone(fx, y0 + 4.1, fz, 0.26, 0.3, '#6e7378', { seg: 8 });
    // three hot stoves: tall cylinders with domed heads, banded with rust
    for (let i = 0; i < 3; i++) {
      const sx = cx + 1.9 + i * 0.95;
      const sz = -15.5 - i * 0.15;
      const h = 4.1 - i * 0.12;
      p.cyl(sx, y0 - 0.25, sz, 0.42, 0.42, 0.25 + h * 0.86, '#b09685', { seg: 10 });
      p.lathe(sx, y0 + h * 0.86, sz, [[0.42, 0], [0.38, 0.14], [0.26, 0.26], [0.1, 0.32], [0.0, 0.34]], '#b09685', { seg: 10 });
      for (const f of [0.2, 0.45, 0.7]) p.cyl(sx, y0 + h * f, sz, 0.435, 0.435, 0.07, rust, { seg: 10, ao: 0 });
      p.box(sx, y0 + h * 0.35, sz + 0.42, 0.14, 0.2, 0.02, '#3a3f46', { ao: 0 });
    }
    // gas mains: a fat pipe from the furnace top to the stoves, and the down-comers
    p.rod([fx, y0 + 4.0, fz], [cx + 1.9, y0 + 3.7, -15.5], 0.1, '#7d848a', 6);
    p.rod([cx + 1.9, y0 + 3.7, -15.5], [cx + 3.8, y0 + 3.55, -15.8], 0.09, '#7d848a', 6);
    p.rod([fx + 0.3, y0 + 3.6, fz], [fx + 0.3, y0 + 0.5, fz + 0.3], 0.06, '#7d848a', 5);
    p.rod([cx + 0.6, y0 + 3.3, -15.7], [cx + 0.6, y0 + 0.3, -15.2], 0.05, '#7d848a', 5);
    p.rod([cx + 1.2, y0 + 0.7, -15.2], [cx + 3.8, y0 + 0.7, -15.4], 0.08, '#6e7378', 5);
    // the skip incline: an inclined girder carrying the charging buckets up to the furnace top
    p.rod([cx - 3.5, y0 + 0.2, -15.0], [fx - 0.2, y0 + 3.9, fz + 0.45], 0.04, '#5b6670', 4);
    p.rod([cx - 3.35, y0 + 0.2, -14.8], [fx - 0.1, y0 + 3.85, fz + 0.55], 0.04, '#5b6670', 4);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      p.rod([lerp(cx - 3.5, fx - 0.2, t), lerp(y0 + 0.2, y0 + 3.9, t), -15.0], [lerp(cx - 3.35, fx - 0.1, t), lerp(y0 + 0.2, y0 + 3.85, t), -14.8], 0.018, '#5b6670', 3);
    }
    p.box(cx - 2.2, y0 + 1.75, -14.95, 0.2, 0.18, 0.2, '#c9402e', { rz: 0.75 });
    // two tall stacks with steam, a gas holder, coking and sinter plants
    stack(k, cx - 2.9, -17.8, 4.4, 0.2, k.ground(cx - 2.9, -17.8) - 0.02, '#c8302a');
    stack(k, cx + 6.1, -17.4, 3.8, 0.17, k.ground(cx + 6.1, -17.4) - 0.02, '#c8302a');
    steam(p, cx - 2.9, y0 + 4.5, -17.8, 1.0);
    steam(p, cx + 6.1, y0 + 3.9, -17.4, 0.9);
    p.cyl(cx - 5.6, y0 - 0.25, -16.6, 0.9, 0.9, 0.25 + 1.6, '#aab0b3', { seg: 14 });
    p.cyl(cx - 5.6, y0 + 1.6, -16.6, 0.92, 0.92, 0.08, '#6e7378', { seg: 14 });
    factory(k, cx - 3.0, -13.6, 2.0, 0.9, 0.7, '#a89f90', '#6e7378');
    factory(k, cx + 1.4, -13.5, 1.8, 0.9, 0.6, '#9fa5a9', '#6e7378');
    factory(k, cx + 5.0, -13.6, 2.2, 0.9, 0.7, '#a89f90', '#6e7378');
    k.reserve(cx, -15.8, 6.5, 1.2);
    // cranes on the quay and loaded barges alongside
    gantryCrane(k, cx - 4.6, SHORE_Z - 0.45, { color: '#e0a21a', s: 0.9 });
    gantryCrane(k, cx + 3.4, SHORE_Z - 0.45, { color: '#e0a21a', s: 0.9 });
    barge(k, cx - 3.0, -10.4, 3.6, 'coal', rng, 0);
    barge(k, cx + 2.2, -10.5, 3.6, 'sand', rng, 0.02);
    barge(k, cx + 6.2, -10.3, 3.4, 'boxes', rng, 0);
  },
  mole: 'none',
  flag: { dx: 5.4, z: -12.9 },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Mannheim ─────────────────────────────

const mannheim: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.8;
    k.plateau(k.vx(-15, 0.3), -15, 6.5, 3.4, LAND_Y + 0.05);
    k.paint((x, y, z, slope, c) => {
      if (z > -15.8 && z < -12.7 && Math.abs(x - k.vx(-14, 0.3)) < 4.2) c.lerp(new THREE.Color('#7fb26a'), 0.9);
    });
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-15.2, 0.3);
    const y0 = LAND_Y + 0.05;
    const wz = -16.2;
    const sand = '#a4503f';
    const light = '#e8dcc2';
    // the Wasserturm: a red sandstone drum, a ring of columns, a copper dome and a statue on top
    p.cyl(cx, y0 - 0.25, wz, 1.25, 1.2, 0.25 + 0.35, '#8c4638', { seg: 16 });
    p.cyl(cx, y0 + 0.35, wz, 1.1, 1.0, 2.5, sand, { seg: 16 });
    for (let i = 0; i < 4; i++) p.cyl(cx, y0 + 0.9 + i * 0.55, wz, 1.07 - i * 0.03, 1.07 - i * 0.03, 0.05, light, { seg: 16, ao: 0 });
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.12 + (i / 7) * Math.PI * 0.76;
      p.box(cx + Math.cos(a) * 1.02, y0 + 0.6 + (i % 2) * 0.7, wz + Math.sin(a) * 1.02, 0.1, 0.34, 0.03, '#34455a', { ry: -a + Math.PI / 2, ao: 0 });
    }
    p.cyl(cx, y0 + 2.85, wz, 1.08, 1.08, 0.12, light, { seg: 16 });
    // the colonnade
    const cr = 0.94;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      p.cyl(cx + Math.cos(a) * cr, y0 + 2.97, wz + Math.sin(a) * cr, 0.055, 0.05, 0.75, light, { seg: 6 });
    }
    p.cyl(cx, y0 + 2.97, wz, 0.82, 0.82, 0.75, '#7a3a2e', { seg: 14 });
    p.cyl(cx, y0 + 3.72, wz, 1.08, 1.08, 0.1, light, { seg: 16 });
    // the upper drum and the copper dome
    p.cyl(cx, y0 + 3.82, wz, 0.82, 0.8, 0.5, sand, { seg: 16 });
    for (let i = 0; i < 5; i++) pane(k, cx + (i - 2) * 0.22, y0 + 3.98, wz + Math.sqrt(0.8 * 0.8 - ((i - 2) * 0.22) ** 2) * 1.0 - 0.0, 0.08, 0.2, '#34455a', 0.3);
    p.cyl(cx, y0 + 4.32, wz, 0.9, 0.9, 0.08, light, { seg: 16 });
    p.lathe(cx, y0 + 4.4, wz, [[0.88, 0], [0.86, 0.1], [0.72, 0.36], [0.5, 0.58], [0.26, 0.74], [0.1, 0.82], [0.0, 0.84]], '#6aa393', { seg: 14 });
    p.cyl(cx, y0 + 5.2, wz, 0.07, 0.05, 0.28, '#d9b94a', { seg: 6 });
    p.ball(cx, y0 + 5.55, wz, 0.1, '#d9b94a');
    k.reserve(cx, wz, 1.4, 1.4);
    // the arcaded garden in front: two long colonnaded wings around hedges, flower beds and a fountain
    for (const s of [-1, 1]) {
      const ax = cx + s * 3.0;
      p.box(ax, y0 - 0.2, -14.5, 2.6, 0.2 + 0.9, 0.55, '#e4d8bc');
      for (let i = 0; i < 6; i++) lancetZ(p, ax - 1.05 + i * 0.42, y0, -14.5 + 0.275, 0.24, 0.7, '#6b4f3f');
      p.box(ax, y0 + 0.9, -14.5, 2.68, 0.07, 0.62, '#f2ead6');
      p.box(ax, y0 + 0.97, -14.5, 2.6, 0.12, 0.4, '#b9b3a4');
      k.reserve(ax, -14.5, 1.4, 0.4);
    }
    const flower = ['#d6453a', '#e9b32a', '#e07aa0', '#f4f1ea'];
    for (let i = 0; i < 4; i++) {
      const bx = cx - 1.35 + (i % 2) * 2.7;
      const bz = -13.75 - Math.floor(i / 2) * 0.8;
      p.box(bx, y0, bz, 1.2, 0.07, 0.55, '#5f9a52', { ao: 0.05 });
      for (let j = 0; j < 5; j++) p.box(bx - 0.42 + j * 0.21, y0 + 0.07, bz, 0.14, 0.02, 0.4, flower[(i + j) % 4], { ao: 0 });
    }
    p.cyl(cx, y0, -13.9, 0.45, 0.45, 0.14, '#cfc8b4', { seg: 12 });
    k.glass.cyl(cx, y0 + 0.1, -13.9, 0.38, 0.38, 0.04, '#6fb0d0', { seg: 12 });
    p.cyl(cx, y0 + 0.1, -13.9, 0.06, 0.04, 0.35, '#cfc8b4', { seg: 8 });
    k.reserve(cx, -14.0, 3.0, 0.9);
    // chimneys of the industry behind, and a couple of barges on the river
    for (const [dx, z, h] of [[-5.4, -19.2, 3.4], [-4.6, -20.6, 4.2], [5.8, -19.6, 3.6]] as Array<[number, number, number]>) {
      stack(k, cx + dx, z, h, 0.14, k.ground(cx + dx, z) - 0.02, '#c8302a');
      steam(p, cx + dx, k.ground(cx + dx, z) + h, z, 0.7);
    }
    barge(k, cx - 3.0, -10.4, 3.4, 'tank', rng, 0);
    barge(k, cx + 3.8, -10.6, 3.4, 'coal', rng, 0.02);
  },
  mole: 'none',
  flag: { dx: 5.3, z: -12.9 },
  quiet: true,
  rows: 3,
};

// ───────────────────────────── Wilhelmshaven ─────────────────────────────

const wilhelmshaven: Landmark = {
  terrain(k) {
    k.shore = 'dike';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
    channel(k, k.vx(-16.5, 0.3), 3.1, -21.6);
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(-16.5, 0.3);
    const wallTop = LAND_Y + 0.4;
    const zA = -12.2;
    const zB = -21.5;
    // stone quay walls down both sides of the harbour basin
    for (const s of [-1, 1]) {
      p.box(cx + s * 3.45, -0.95, (zA + zB) / 2, 0.6, 0.95 + wallTop, zA - zB, '#aaa598');
      p.box(cx + s * 3.45, wallTop, (zA + zB) / 2, 0.64, 0.045, zA - zB, '#cdc8b9', { ao: 0 });
    }
    p.box(cx, -0.95, zB - 0.2, 7.0, 0.95 + wallTop, 0.5, '#aaa598');
    // the Kaiser-Wilhelm swing bridge: two lattice towers, a girder between them and stays to the deck
    const bz = -15.4;
    const deck = wallTop + 0.7;
    const tx = 2.05;
    const steel = '#6a7f86';
    p.box(cx, deck - 0.1, bz, 8.4, 0.1, 0.8, '#8d9298');
    p.box(cx, deck, bz - 0.38, 8.4, 0.05, 0.03, steel, { ao: 0 });
    p.box(cx, deck, bz + 0.38, 8.4, 0.05, 0.03, steel, { ao: 0 });
    for (const s of [-1, 1]) {
      const x = cx + s * tx;
      p.box(x, -0.95, bz, 0.7, 0.95 + deck - 0.1, 0.7, '#a89f8a');
      latticeTower(p, x, deck, bz, 0.7, 3.0, steel, 5);
      p.box(x, deck + 3.0, bz, 0.9, 0.08, 0.9, '#8f989c');
    }
    // the swing arm: a deep truss girder running between the tower heads, with the stays to the deck
    const gy = deck + 3.05;
    for (const dz of [-0.25, 0.25]) {
      p.box(cx, gy, bz + dz, tx * 2 + 1.2, 0.05, 0.05, steel, { ao: 0 });
      p.box(cx, gy - 0.5, bz + dz, tx * 2 + 1.2, 0.04, 0.04, steel, { ao: 0 });
      for (let i = 0; i < 9; i++) {
        const x1 = cx - tx - 0.6 + (i * (tx * 2 + 1.2)) / 9;
        const x2 = cx - tx - 0.6 + ((i + 1) * (tx * 2 + 1.2)) / 9;
        p.rod([x1, gy - 0.5, bz + dz], [x2, gy, bz + dz], 0.014, steel, 3);
        p.rod([x1, gy, bz + dz], [x2, gy - 0.5, bz + dz], 0.014, steel, 3);
      }
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const sx = cx + s * (tx + 0.25 + i * 0.32);
        p.rod([cx + s * tx, deck + 2.95 - i * 0.12, bz - 0.2], [sx, deck, bz - 0.34], 0.012, steel, 3);
        p.rod([cx + s * tx, deck + 2.95 - i * 0.12, bz + 0.2], [sx, deck, bz + 0.34], 0.012, steel, 3);
      }
    }
    k.reserve(cx, bz, 4.4, 0.8);
    k.reserve(cx, -17.5, 3.3, 4.6);
    // frigates alongside the quay, container cranes of the new terminal
    const hs = -k.mole.dir; // the breakwater's head is on this side: keep clear of it
    frigate(k, k.vx(-10.9, -hs * 4.2), -10.9, 5.6);
    frigate(k, cx, -19.4, 4.6);
    gantryCrane(k, cx - 8.4, SHORE_Z - 0.45, { color: '#2c5da8', s: 0.95 });
    gantryCrane(k, cx + 8.6, SHORE_Z - 0.45, { color: '#2c5da8', s: 0.95 });
    factory(k, cx - 6.0, -14.0, 2.2, 1.0, 0.6, '#b9bdb8', '#6f7a80');
    factory(k, cx + 6.2, -14.2, 2.2, 1.0, 0.6, '#c4c8c2', '#6f7a80');
  },
  quiet: true,
  rows: 3,
};

export const LANDMARKS: Record<string, Landmark> = { bremerhaven, bremen, kiel, emden, cologne, duisburg, mannheim, wilhelmshaven };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Bremerhaven', 'de', 'bremerhaven'],
  ['Bremen', 'de', 'bremen'],
  ['Kiel', 'de', 'kiel'],
  ['Emden', 'de', 'emden'],
  ['Cologne', 'de', 'cologne'],
  ['Duisburg', 'de', 'duisburg'],
  ['Mannheim', 'de', 'mannheim'],
  ['Wilhelmshaven', 'de', 'wilhelmshaven'],
];
