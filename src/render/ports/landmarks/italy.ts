import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, MOLE_Z, smooth, noise2, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import { REGIONS, type RegionId } from '../regions';
import { buildTown, house, tint, tree, type HouseStyle } from '../town';
import { roundTower } from '../structures';
import { gantryCrane } from '../props';

/** Italy, Slovenia, Malta and Greece: Naples, Genoa, Marsaxlokk, Piraeus, Trieste, Livorno, La Spezia, Gioia Tauro, Koper. */

type Part = PortKit['solid'];

const MED: HouseStyle = REGIONS.med.houses;
const col = (h: string): THREE.Color => new THREE.Color(h);
const BOXC = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5'];

// ───────────────────────────── shared helpers ─────────────────────────────

/** A dark window quad on the +z face (some of them light up at night). */
function wz(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, litChance = 0.35): void {
  (rng.chance(litChance) ? k.lit : k.solid).quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], c);
}

/** A dark window quad on the +x face. */
function wx(k: PortKit, rng: Rng, x: number, y: number, z: number, w: number, h: number, c: Col, litChance = 0.35): void {
  (rng.chance(litChance) ? k.lit : k.solid).quad([x, y, z + w / 2], [x, y, z - w / 2], [x, y + h, z - w / 2], [x, y + h, z + w / 2], c);
}

/** A pointed (lancet) window on the +z face: a tall quad with a triangle on top. */
function lancet(p: Part, x: number, y: number, z: number, w: number, h: number, c: Col): void {
  p.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h * 0.7, z], [x - w / 2, y + h * 0.7, z], c);
  p.tri([x - w / 2, y + h * 0.7, z], [x + w / 2, y + h * 0.7, z], [x, y + h, z], c);
}

/** Alternate merlons along the top of a rectangle (all four sides). */
function merlons(p: Part, x: number, y: number, z: number, w: number, d: number, c: Col, step = 0.13, mh = 0.065): void {
  const nx = Math.max(3, Math.round(w / step));
  const nz = Math.max(3, Math.round(d / step));
  for (let i = 0; i < nx; i += 2) {
    for (const s of [-1, 1]) p.box(x - w / 2 + ((i + 0.5) * w) / nx, y, z + s * (d / 2 - 0.03), (w / nx) * 0.95, mh, 0.06, c, { ao: 0 });
  }
  for (let i = 2; i < nz - 1; i += 2) {
    for (const s of [-1, 1]) p.box(x + s * (w / 2 - 0.03), y, z - d / 2 + ((i + 0.5) * d) / nz, 0.06, mh, (d / nz) * 0.95, c, { ao: 0 });
  }
}

interface Ring {
  y: number;
  rx: number;
  rz?: number;
}

/**
 * A faceted mountain / rock: stacked rings of vertices (radial and vertical jitter), one flat-shaded quad per
 * facet with a colour per band. Returns the y of the top ring. Rings should start below the ground.
 */
function massif(k: PortKit, cx: number, cz: number, y0: number, rings: Ring[], bands: Col[], o: { seg?: number; jitter?: number; cap?: Col; rot?: number } = {}): number {
  const seg = o.seg ?? 11;
  const jit = o.jitter ?? 0.1;
  const rng = new Rng(k.seed ^ Math.imul(Math.round(cx * 97) + 5, 2654435761));
  const rot = o.rot ?? 0;
  const R: V3[][] = rings.map((r, i) => {
    const row: V3[] = [];
    for (let s = 0; s < seg; s++) {
      const a = rot + (s / seg) * Math.PI * 2;
      const j = 1 + (noise2(s * 1.3 + 7, i * 2.9 + cx * 0.37, 11) - 0.5) * 2 * jit;
      const dy = i > 0 && i < rings.length - 1 ? (noise2(s * 2.1 + 3, i * 1.7 + cz * 0.41, 13) - 0.5) * jit * 1.6 : 0;
      row.push([cx + Math.cos(a) * r.rx * j, y0 + r.y + dy, cz + Math.sin(a) * (r.rz ?? r.rx) * j]);
    }
    return row;
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const c = bands[Math.min(i, bands.length - 1)];
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      k.solid.quad(R[i][s], R[i + 1][s], R[i + 1][s2], R[i][s2], tint(c, rng.range(-0.09, 0.07)));
    }
  }
  if (o.cap) {
    const top = R[R.length - 1];
    for (let s = 1; s < seg - 1; s++) k.solid.tri(top[0], top[s + 1], top[s], o.cap);
  }
  return y0 + rings[rings.length - 1].y;
}

/**
 * A block of stacked containers, cheap: a dark body box per column plus coloured quads on the faces the
 * camera sees (front, right, top). The block's front-left corner is (x0, z0); it runs back (-z) by nz slots.
 */
function yard(k: PortKit, x0: number, z0: number, nx: number, nz: number, tiers: number, rng: Rng, y = LAND_Y): void {
  const p = k.solid;
  const cw = 0.26;
  const ch = 0.12;
  const cd = 0.12;
  const m = 0.01;
  const hs: number[] = [];
  for (let i = 0; i < nx; i++) hs.push(Math.max(1, tiers - (rng.chance(0.35) ? 1 : 0) - (rng.chance(0.15) ? 1 : 0)));
  const colour = (): THREE.Color => tint(BOXC[rng.int(0, BOXC.length - 1)], rng.range(-0.1, 0.06));
  for (let i = 0; i < nx; i++) {
    const bx = x0 + i * cw;
    const hh = hs[i] * ch;
    p.box(bx + cw / 2, y - 0.03, z0 - (nz * cd) / 2, cw, hh + 0.03, nz * cd, '#454a52', { ao: 0.1 });
    for (let t = 0; t < hs[i]; t++) {
      const yb = y + t * ch + m;
      p.quad([bx + m, yb, z0 + 0.003], [bx + cw - m, yb, z0 + 0.003], [bx + cw - m, yb + ch - 2 * m, z0 + 0.003], [bx + m, yb + ch - 2 * m, z0 + 0.003], colour());
    }
    for (let j = 0; j < nz; j++) {
      const zf = z0 - j * cd - m;
      const zb = z0 - (j + 1) * cd + m;
      p.quad([bx + m, y + hh + 0.002, zf], [bx + cw - m, y + hh + 0.002, zf], [bx + cw - m, y + hh + 0.002, zb], [bx + m, y + hh + 0.002, zb], colour());
    }
    // the +x face shows where the next column is lower (or at the end)
    const hn = i === nx - 1 ? 0 : hs[i + 1];
    for (let t = hn; t < hs[i]; t++) {
      for (let j = 0; j < nz; j++) {
        const zf = z0 - j * cd - m;
        const zb = z0 - (j + 1) * cd + m;
        const yb = y + t * ch + m;
        p.quad([bx + cw + 0.003, yb, zf], [bx + cw + 0.003, yb, zb], [bx + cw + 0.003, yb + ch - 2 * m, zb], [bx + cw + 0.003, yb + ch - 2 * m, zf], tint(colour(), -0.08));
      }
    }
  }
  k.reserve(x0 + (nx * cw) / 2, z0 - (nz * cd) / 2, (nx * cw) / 2 + 0.05, (nz * cd) / 2 + 0.05);
}

/** A grey warship moored along +x (bow at +x), waterline at y = 0. */
function warship(k: PortKit, x: number, z: number, len: number, ry = 0, hull = '#8e99a2'): void {
  const p = k.solid;
  k.at(x, 0, z, ry, len / 3.2, () => {
    p.extrude([[-1.6, 0.3], [-1.55, -0.12], [1.15, -0.12], [1.62, 0.28], [1.55, 0.32], [1.15, 0.3]], 0.52, 0, 0, 0, hull, { ao: 0.1 });
    p.box(-0.2, -0.02, 0, 2.7, 0.05, 0.54, '#5b6168', { ao: 0, ry: 0 });
    p.box(-0.35, 0.3, 0, 2.4, 0.015, 0.5, '#7b848c', { ao: 0 });
    // superstructure: bridge block, a second deck, funnel, mast with a radar
    p.box(-0.2, 0.3, 0, 1.1, 0.26, 0.38, '#a9b2b9');
    p.box(0.05, 0.56, 0, 0.5, 0.2, 0.32, '#b4bcc2');
    p.box(0.28, 0.76, 0, 0.18, 0.06, 0.26, '#2a3038');
    p.box(-0.55, 0.56, 0, 0.3, 0.2, 0.26, '#8e969c', { rz: 0 });
    p.cyl(0.0, 0.76, 0, 0.03, 0.025, 0.55, '#8d949a', { seg: 5 });
    p.box(0.0, 1.22, 0, 0.3, 0.04, 0.06, '#7f868c', { ao: 0 });
    p.box(-0.58, 0.76, 0, 0.2, 0.06, 0.16, '#6e757b');
    // forward gun and a launcher
    p.cyl(0.95, 0.3, 0, 0.1, 0.09, 0.09, '#7b848c', { seg: 8 });
    p.rod([0.95, 0.38, 0], [1.28, 0.4, 0], 0.018, '#5b6168', 4);
    p.box(0.55, 0.3, 0, 0.2, 0.07, 0.2, '#6c747b');
    // aft deck: a helicopter pad
    p.box(-1.2, 0.3, 0, 0.5, 0.012, 0.42, '#4d555c', { ao: 0 });
    // hull numbers and a boot-top stripe on the side the camera sees
    for (let i = 0; i < 3; i++) p.quad([0.95 + i * 0.1, 0.12, 0.263], [1.02 + i * 0.1, 0.12, 0.263], [1.02 + i * 0.1, 0.22, 0.263], [0.95 + i * 0.1, 0.22, 0.263], '#eef1f2');
    p.box(-0.2, -0.02, 0.256, 2.7, 0.03, 0.012, '#6a2e2a', { ao: 0 });
  });
}

/** The hand-painted luzzu of Malta: high curved prow, bright stripes, the Eye of Osiris on the bow. */
function luzzu(k: PortKit, x: number, z: number, ry: number, s: number, main: Col, band: Col): void {
  const p = k.solid;
  k.at(x, 0, z, ry, s, () => {
    p.extrude([[-0.52, 0.16], [-0.5, -0.02], [-0.38, -0.11], [0.3, -0.11], [0.5, 0.0], [0.6, 0.18], [0.66, 0.4], [0.58, 0.4], [0.5, 0.2], [0.2, 0.12], [-0.2, 0.11]], 0.17, 0, 0, 0, main, { ao: 0.1 });
    p.extrude([[-0.515, 0.15], [-0.2, 0.105], [0.2, 0.115], [0.5, 0.19], [0.585, 0.31], [0.575, 0.25], [0.5, 0.14], [0.2, 0.065], [-0.2, 0.055], [-0.515, 0.1]], 0.176, 0, 0, 0, band, { ao: 0 });
    p.box(-0.02, 0.1, 0, 0.92, 0.02, 0.15, '#e9dcba', { ao: 0 });
    p.box(-0.14, 0.12, 0, 0.16, 0.11, 0.12, '#f6f2e6');
    p.box(-0.14, 0.23, 0, 0.19, 0.014, 0.15, band, { ao: 0 });
    p.rod([0.6, 0.4, 0], [0.74, 0.5, 0], 0.012, '#5b4636', 4);
    for (const sz of [1, -1]) {
      const zz = sz * 0.0905;
      const f = (a: number, b: number): V3 => [0.47 + a, 0.2 + b, zz];
      if (sz > 0) {
        p.quad(f(-0.07, -0.045), f(0.07, -0.045), f(0.07, 0.05), f(-0.07, 0.05), '#fbf8ee', false, 0);
        p.quad(f(-0.02, -0.025), f(0.03, -0.025), f(0.03, 0.025), f(-0.02, 0.025), '#1d3d6b', false, 0);
      } else {
        p.quad(f(0.07, -0.045), f(-0.07, -0.045), f(-0.07, 0.05), f(0.07, 0.05), '#fbf8ee', false, 0);
        p.quad(f(0.03, -0.025), f(-0.02, -0.025), f(-0.02, 0.025), f(0.03, 0.025), '#1d3d6b', false, 0);
      }
    }
  });
}

function townFor(k: PortKit, hs: HouseStyle, o: { rows: number; rowStep?: number; z?: number; gaps?: number; rowRise?: number; maxSlope?: number; minY?: number; shift?: number }): void {
  const w = k.width;
  buildTown(k, { x0: -w / 2 - 2, x1: w / 2 + 2, z: o.z ?? SHORE_Z - 1.3, rows: o.rows, rowStep: o.rowStep ?? 0.55, hs, gaps: o.gaps, rowRise: o.rowRise, cx: k.vx(SHORE_Z - 2) + (o.shift ?? 0), maxSlope: o.maxSlope, minY: o.minY });
}

// ───────────────────────────── Naples ─────────────────────────────

/** Run `fn` in a local frame (origin on the ground, scaled by `S`) and keep houses off the footprint. */
function placed(k: PortKit, x: number, y: number, z: number, S: number, rx: number, rz: number, fn: () => void, ry = 0): void {
  k.at(x, y, z, ry, S, fn);
  k.reserve(x, z, rx * S, rz * S);
}

/** Castel Nuovo (the Maschio Angioino): a dark squat block with big round towers and a white marble arch. Local frame. */
function castelNuovo(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#a99d8a';
  const stone = '#d8cdb6';
  p.box(0, -0.3, 0, 2.1, 0.3 + 0.62, 1.15, wall);
  p.box(0, 0.62, 0, 2.1, 0.04, 1.15, tint(wall, 0.12), { ao: 0 });
  p.box(0, 0.66, 0, 1.5, 0.26, 0.75, tint(wall, 0.05));
  merlons(p, 0, 0.92, 0, 1.5, 0.75, stone);
  // the triumphal arch between the two front towers
  p.box(0, 0, 0.58, 0.56, 0.62, 0.09, '#efe8d8');
  p.box(0, 0.62, 0.58, 0.64, 0.05, 0.12, '#f7f2e6');
  wz(k, rng, 0, 0, 0.634, 0.2, 0.3, '#3a3733', 0);
  p.tri([-0.1, 0.3, 0.634], [0.1, 0.3, 0.634], [0, 0.42, 0.634], '#3a3733');
  for (const sx of [-1, 1]) wz(k, rng, sx * 0.42, 0.18, 0.585, 0.07, 0.17, '#3a3733', 0.2);
  // four round corner towers with dark machicolation bands
  for (const [dx, dz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const tx = dx * 1.0;
    const tz = dz * 0.52;
    roundTower(k, tx, tz, 0.3, 1.1, wall, null, -0.02);
    p.cyl(tx, 0.86, tz, 0.33, 0.33, 0.05, '#6f6558', { seg: 12, ao: 0 });
    wz(k, rng, tx, 0.5, tz + 0.29, 0.06, 0.14, '#3a3733', 0.2);
  }
  // a taller keep behind
  p.box(0.1, 0.66, -0.2, 0.7, 0.55, 0.5, tint(wall, -0.03));
  merlons(p, 0.1, 1.21, -0.2, 0.7, 0.5, stone, 0.11);
}

/** Castel dell'Ovo on its rock: a long battlemented curtain, a palace block and the Norman tower. Local frame. */
function castelOvo(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#dcb87c';
  const trim = '#efdcaa';
  p.box(0, -0.4, 0, 2.1, 0.4 + 0.5, 0.7, wall);
  merlons(p, 0, 0.5, 0, 2.1, 0.7, trim, 0.14, 0.07);
  p.box(-0.55, 0.5, -0.04, 0.85, 0.55, 0.55, tint(wall, 0.04));
  p.prism(-0.55, 1.05, -0.04, 0.9, 0.2, 0.6, '#b8553d');
  p.box(0.78, 0.4, 0, 0.42, 1.0, 0.42, tint(wall, -0.03));
  p.box(0.78, 1.4, 0, 0.5, 0.05, 0.5, trim, { ao: 0 });
  merlons(p, 0.78, 1.45, 0, 0.5, 0.5, trim, 0.1, 0.06);
  p.cyl(-0.1, -0.4, 0.4, 0.26, 0.24, 0.4 + 0.62, wall, { seg: 10 });
  p.cyl(-0.1, 0.32, 0.4, 0.28, 0.28, 0.05, trim, { seg: 10, ao: 0 });
  for (let i = 0; i < 5; i++) wz(k, rng, -0.9 + i * 0.4, 0.12, 0.352, 0.07, 0.17, '#4a4237', 0.25);
  for (let i = 0; i < 3; i++) wz(k, rng, -0.85 + i * 0.3, 0.66, 0.26, 0.06, 0.15, '#4a4237', 0.25);
}

const naples: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.1, range: 3.2 };
    // the broad green massif under the volcano
    k.bump(k.vx(-25, 1.5), -25, 14, 9, 1.7, 1.1);
    // the rock of Castel dell'Ovo, flattened on top for the castle
    const ox = k.vx(-11.4, -2.9);
    k.bump(ox, -11.4, 2.4, 1.4, 1.4, 0.5);
    k.plateau(ox, -11.4, 1.8, 1.0, 0.95, 0.3);
    const rock = col('#b9a98c');
    k.paint((x, y, z, slope, c) => {
      if (Math.hypot((x - ox) / 2.7, (z + 11.4) / 1.7) < 1 && y > -0.35) c.lerp(rock, 0.9);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const p = k.solid;
    // Vesuvius: a big cone with a crater and its older, lower rim (Monte Somma) beside it
    const cx = k.vx(-24, 1.9);
    const cz = -24.2;
    const y0 = k.groundMin(cx, cz, 8.5, 6.5) - 0.3;
    massif(
      k,
      cx - 5.6,
      -27.6,
      y0 + 0.2,
      [
        { y: 0, rx: 8.0, rz: 5.2 },
        { y: 1.2, rx: 6.2, rz: 4.0 },
        { y: 2.7, rx: 4.3, rz: 2.9 },
        { y: 4.0, rx: 2.5, rz: 1.7 },
        { y: 5.0, rx: 1.4, rz: 0.9 },
      ],
      ['#a0a863', '#86975a', '#7e7258', '#6b6056', '#6a5f58'],
      { seg: 11, cap: '#6a5f58', rot: 0.2 },
    );
    const top = massif(
      k,
      cx,
      cz,
      y0,
      [
        { y: 0, rx: 10.0, rz: 7.8 },
        { y: 1.1, rx: 8.2, rz: 6.4 },
        { y: 2.6, rx: 5.8, rz: 4.6 },
        { y: 4.2, rx: 3.6, rz: 2.9 },
        { y: 5.7, rx: 2.1, rz: 1.7 },
        { y: 6.8, rx: 1.2, rz: 1.0 },
        { y: 7.3, rx: 0.9, rz: 0.78 },
        { y: 6.85, rx: 0.55, rz: 0.46 },
      ],
      ['#a2a964', '#85985a', '#7f7a58', '#6f6358', '#5a514b', '#4a423d', '#3a3330'],
      { seg: 12, cap: '#2c2725', rot: 0.3, jitter: 0.07 },
    );
    // a thin plume leaning away to the right
    const plume: Array<[number, number, number]> = [[0.0, 0.35, 0.5], [0.3, 0.95, 0.58], [0.75, 1.6, 0.66], [1.35, 2.2, 0.72], [2.1, 2.7, 0.7], [2.9, 3.1, 0.6]];
    plume.forEach(([dx, dy, r], i) => p.blob(cx + dx, top + dy, cz, r, i % 2 ? '#fbf9f6' : '#f1eeea', { sy: 0.8, ry: i }));
    // Castel Nuovo on the quay, Castel dell'Ovo on its rock
    placed(k, k.vx(-13.7, 2.5), LAND_Y, -13.7, 1.4, 1.5, 0.9, () => castelNuovo(k, rng));
    const ox = k.vx(-11.4, -2.9);
    placed(k, ox, k.groundMax(ox, -11.4, 0.9, 0.4), -11.4, 1.25, 1.3, 0.7, () => castelOvo(k, rng));
  },
  quiet: true,
};

// ───────────────────────────── Genoa ─────────────────────────────

const LIGURIA: HouseStyle = {
  ...MED,
  walls: ['#e9b86a', '#e89a86', '#f3d484', '#d98a5c', '#f0c9a2', '#c9776a', '#f4e2b6', '#e8a65a', '#c9a07a', '#a9c0c4'],
  roofs: ['#b8553d', '#a64b36', '#8c5a48', '#6f7a80'],
  floors: [3, 5],
  floorH: 0.17,
  w: [0.28, 0.42],
  d: [0.3, 0.42],
  roofKinds: [['hip', 3], ['gable', 3], ['flat', 2]],
  pitch: 0.35,
  gap: [0, 0.03],
  winW: 0.045,
  winH: 0.09,
  runs: false,
};

/** The Lanterna of Genoa: two stacked square towers with corbelled galleries and a lantern on top. */
function lanterna(k: PortKit, x: number, z: number, y: number): void {
  const p = k.solid;
  const rng = new Rng(k.seed ^ 777);
  const stone = '#e8dec6';
  const quoin = '#f6f0de';
  const dark = '#34383f';
  const gal = '#cfc3a6';
  // the stone plinth on the mole head
  p.box(x, y - 0.05, z, 1.12, 0.4, 1.12, '#cbbfa3');
  p.box(x, y + 0.35, z, 1.2, 0.05, 1.2, '#ddd2b6', { ao: 0 });
  const y1 = y + 0.4;
  const h1 = 2.3;
  p.box(x, y1, z, 0.86, h1, 0.86, stone);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + sx * 0.43, y1, z + sz * 0.43, 0.07, h1, 0.07, quoin, { ao: 0 });
  // belts and a column of windows on each face the camera sees
  for (const t of [0.34, 0.7]) p.box(x, y1 + h1 * t, z, 0.9, 0.04, 0.9, quoin, { ao: 0 });
  wz(k, rng, x, y1, z + 0.433, 0.2, 0.34, '#43372a', 0);
  p.tri([x - 0.1, y1 + 0.34, z + 0.433], [x + 0.1, y1 + 0.34, z + 0.433], [x, y1 + 0.43, z + 0.433], '#43372a');
  for (let i = 0; i < 5; i++) {
    const wy = y1 + 0.5 + i * 0.35;
    wz(k, rng, x, wy, z + 0.433, 0.08, 0.17, dark, 0.3);
    wx(k, rng, x + 0.433, wy, z, 0.08, 0.17, dark, 0.3);
  }
  // first gallery on corbels
  const yg = y1 + h1;
  p.box(x, yg - 0.1, z, 0.96, 0.1, 0.96, '#a99d84');
  p.box(x, yg, z, 1.16, 0.1, 1.16, gal);
  p.box(x, yg + 0.1, z, 1.1, 0.14, 1.1, stone);
  merlons(p, x, yg + 0.24, z, 1.1, 1.1, quoin, 0.15, 0.08);
  // the second, slimmer tower
  const y2 = yg + 0.1;
  const h2 = 1.2;
  p.box(x, y2 + 0.14, z, 0.6, h2, 0.6, stone);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + sx * 0.3, y2 + 0.14, z + sz * 0.3, 0.05, h2, 0.05, quoin, { ao: 0 });
  for (let i = 0; i < 3; i++) {
    wz(k, rng, x, y2 + 0.3 + i * 0.32, z + 0.303, 0.08, 0.17, dark, 0.3);
    wx(k, rng, x + 0.303, y2 + 0.3 + i * 0.32, z, 0.08, 0.17, dark, 0.3);
  }
  // second gallery
  const yg2 = y2 + 0.14 + h2;
  p.box(x, yg2 - 0.06, z, 0.7, 0.08, 0.7, '#a99d84');
  p.box(x, yg2, z, 0.82, 0.08, 0.82, gal);
  p.box(x, yg2 + 0.08, z, 0.78, 0.11, 0.78, stone);
  merlons(p, x, yg2 + 0.19, z, 0.78, 0.78, quoin, 0.13, 0.07);
  // the lantern: glass drum, dark cap and a lamp
  const yl = yg2 + 0.08;
  k.glass.cyl(x, yl, z, 0.2, 0.2, 0.46, '#bfe3ee', { seg: 8 });
  k.glow.ball(x, yl + 0.24, z, 0.1, '#fff1b0');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.box(x + Math.cos(a) * 0.2, yl, z + Math.sin(a) * 0.2, 0.025, 0.46, 0.025, dark, { ao: 0 });
  }
  p.cyl(x, yl + 0.46, z, 0.26, 0.26, 0.04, dark, { seg: 8 });
  p.cone(x, yl + 0.5, z, 0.25, 0.26, '#3b4048', { seg: 8 });
  p.cyl(x, yl + 0.76, z, 0.012, 0.012, 0.22, dark, { seg: 4 });
  k.reserve(x, z, 0.7, 0.7);
}

const genoa: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 3.0, range: 7.5, rise: 2.2, rough: 0.55 };
    k.palette.land = '#aab274';
    k.palette.hill = '#7f9a5c';
    k.palette.rock = '#9a9283';
    k.bump(k.vx(-19), -19, 13, 7, 3.4, 0.9);
  },
  build(k) {
    const x = k.mole.endX;
    lanterna(k, x, MOLE_Z, k.mole.top + 0.05);
    townFor(k, LIGURIA, { rows: 8, rowStep: 0.5, z: SHORE_Z - 0.62, gaps: 0.04, maxSlope: 1.0, minY: 0.2 });
    // a couple of container cranes at the right-hand quay
    gantryCrane(k, k.vx(-12) + 5.6, SHORE_Z - 0.7, { color: '#c9402e', s: 0.9, y: LAND_Y });
    gantryCrane(k, k.vx(-12) + 7.2, SHORE_Z - 0.7, { color: '#2c5da8', s: 0.9, y: LAND_Y });
  },
  mole: { light: false },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Marsaxlokk ─────────────────────────────

const MALTA: HouseStyle = {
  ...MED,
  walls: ['#e6c98f', '#ecd49c', '#dcb77a', '#f0dcae', '#e3c08a', '#d9b27a'],
  roofs: ['#d2b27a'],
  trim: '#f3e6c3',
  floors: [2, 3],
  roofKinds: [['flat', 1]],
  gap: [0, 0.03],
  door: '#4f7a5c',
  win: '#4a5a62',
};

/** Our Lady of Pompeii: a honey-stone church with a big ribbed dome and two bell turrets. */
function maltaChurch(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  const stone = '#e5c88c';
  const light = '#f2dfae';
  const lead = '#a9aca2';
  p.box(x, y - 0.2, z, 1.9, 1.2 + 0.2, 1.4, stone);
  p.box(x, y + 1.2, z, 1.98, 0.06, 1.48, light, { ao: 0 });
  // a central pedimented front with a big door
  p.box(x, y - 0.1, z + 0.72, 0.9, 1.1, 0.08, light);
  p.prism(x, y + 1.0, z + 0.72, 0.98, 0.32, 0.1, light);
  p.quad([x - 0.14, y, z + 0.77], [x + 0.14, y, z + 0.77], [x + 0.14, y + 0.4, z + 0.77], [x - 0.14, y + 0.4, z + 0.77], '#4d3b2a');
  p.tri([x - 0.14, y + 0.4, z + 0.77], [x + 0.14, y + 0.4, z + 0.77], [x, y + 0.5, z + 0.77], '#4d3b2a');
  lancet(p, x, y + 0.62, z + 0.77, 0.12, 0.3, '#3d4a54');
  for (const sx of [-1, 1]) {
    for (let r = 0; r < 2; r++) {
      lancet(p, x + sx * 0.7, y + 0.2 + r * 0.5, z + 0.703, 0.1, 0.28, '#3d4a54');
      lancet(p, x + sx * 0.3, y + 0.2 + r * 0.5, z + 0.703, 0.1, 0.28, '#3d4a54');
    }
  }
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) wx(k, rng, x + 0.953, y + 0.2 + r * 0.5, z - 0.4 + i * 0.4, 0.1, 0.28, '#3d4a54', 0);
  // the drum, the dome, the lantern
  const yd = y + 1.26;
  p.cyl(x, yd, z, 0.58, 0.58, 0.5, stone, { seg: 8 });
  p.cyl(x, yd + 0.46, z, 0.64, 0.64, 0.06, light, { seg: 8, ao: 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    lancet(p, x + Math.cos(a) * 0.585, yd + 0.1, z + Math.sin(a) * 0.585, 0.001, 0.0, stone);
  }
  p.lathe(x, yd + 0.5, z, [[0.6, 0], [0.62, 0.12], [0.55, 0.38], [0.4, 0.62], [0.2, 0.8], [0.12, 0.88], [0.001, 0.9]], lead, { seg: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.rod([x + Math.cos(a) * 0.61, yd + 0.55, z + Math.sin(a) * 0.61], [x + Math.cos(a) * 0.13, yd + 1.37, z + Math.sin(a) * 0.13], 0.014, '#c9cabf', 4);
  }
  p.cyl(x, yd + 1.4, z, 0.1, 0.1, 0.3, stone, { seg: 8 });
  k.glass.cyl(x, yd + 1.45, z, 0.095, 0.095, 0.16, '#9fc4d4', { seg: 8 });
  p.cone(x, yd + 1.7, z, 0.13, 0.22, lead, { seg: 8 });
  p.cyl(x, yd + 1.9, z, 0.012, 0.012, 0.22, '#e8c23a', { seg: 4 });
  p.box(x, yd + 2.0, z, 0.1, 0.014, 0.014, '#e8c23a', { ao: 0 });
  // the two bell turrets on the front corners
  for (const sx of [-1, 1]) {
    const tx = x + sx * 0.72;
    const tz = z + 0.58;
    p.box(tx, y + 1.2, tz, 0.3, 0.46, 0.3, stone);
    p.box(tx, y + 1.66, tz, 0.34, 0.04, 0.34, light, { ao: 0 });
    wz(k, rng, tx, y + 1.34, tz + 0.152, 0.1, 0.22, '#2a2f38', 0);
    p.cone(tx, y + 1.7, tz, 0.2, 0.34, lead, { seg: 8 });
    p.cyl(tx, y + 2.04, tz, 0.01, 0.01, 0.16, '#e8c23a', { seg: 4 });
  }
}

const marsaxlokk: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.8, range: 4 };
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const p = k.solid;
    const cx = k.vx(-12.5);
    // the fleet of luzzi moored in the bay in front of the town
    const fleet: Array<[number, number, number, string, string]> = [
      [-4.9, -11.55, 0.0, '#f2c230', '#c8302a'],
      [-2.6, -11.45, 0.1, '#2f66b3', '#f2c230'],
      [-0.2, -11.55, -0.08, '#d33a2e', '#f2c230'],
      [2.1, -11.5, 0.06, '#2f9b64', '#f2c230'],
      [4.5, -11.55, -0.05, '#f08a24', '#2f66b3'],
      [-3.8, -10.25, Math.PI + 0.1, '#2f66b3', '#f6f1e4'],
      [-1.4, -10.2, Math.PI - 0.08, '#f2c230', '#2f66b3'],
      [1.0, -10.3, Math.PI + 0.05, '#2f9b64', '#d33a2e'],
      [3.4, -10.25, Math.PI - 0.1, '#d33a2e', '#2f66b3'],
    ];
    for (const [dx, z, ry, c1, c2] of fleet) luzzu(k, cx + dx, z, ry, 2.7, c1, c2);
    // mooring posts on the quay edge
    // the front row of honey houses with wooden enclosed balconies (gallariji)
    const gal = ['#2f7a52', '#2c5da8', '#c0392b', '#7a4a2a', '#2f9b9b'];
    let x = cx - 6.4;
    let n = 0;
    while (x < cx + 6.4) {
      const w = rng.range(0.5, 0.72);
      const d = 0.46;
      const fl = rng.int(2, 3);
      const px = x + w / 2;
      const wall = MALTA.walls[rng.int(0, MALTA.walls.length - 1)];
      house(k, px, -12.65, w, d, fl, MALTA, rng, 'flat', wall, '#d2b27a');
      const gy = k.groundMax(px, -12.65, w / 2, d / 2) + MALTA.floorH + 0.03;
      p.box(px, gy, -12.65 + d / 2 + 0.05, w * 0.58, 0.17, 0.1, gal[n % gal.length], { ao: 0.05 });
      p.box(px, gy + 0.17, -12.65 + d / 2 + 0.05, w * 0.62, 0.02, 0.12, tint(gal[n % gal.length], 0.2), { ao: 0 });
      x += w + rng.range(0, 0.03);
      n++;
    }
    // the parish church, big and domed
    const chx = cx + 0.8;
    const chz = -14.7;
    placed(k, chx, k.groundMax(chx, chz, 1.1, 0.9), chz, 1.3, 1.25, 0.95, () => maltaChurch(k, rng, 0, 0, 0));
    townFor(k, MALTA, { rows: 4, rowStep: 0.55, z: -13.45, gaps: 0.05 });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Piraeus ─────────────────────────────

const CYCLADES: HouseStyle = {
  ...MED,
  walls: ['#fbfaf4', '#f6f3ea', '#efe9d9', '#f8f5ec', '#e8eef0', '#fbf6ea'],
  roofs: ['#f4f1e8'],
  trim: '#f9f7f0',
  win: '#2d6aa8',
  floors: [1, 3],
  floorH: 0.2,
  roofKinds: [['flat', 1]],
  gap: [0, 0.04],
  door: '#2d6fc4',
  winW: 0.06,
  winH: 0.09,
  runs: false,
};

/** The Parthenon: stepped base, 8 x 13 Doric columns, entablature and a pedimented roof, facing the camera. */
function parthenon(k: PortKit, x: number, y: number, z: number): void {
  const p = k.solid;
  const W = 2.9;
  const D = 4.97;
  const stone = '#ecdfbd';
  const shade = '#bba97f';
  for (let i = 0; i < 3; i++) p.box(x, y - 0.1 + i * 0.08, z, W + 0.54 - i * 0.18, 0.18, D + 0.54 - i * 0.18, tint(stone, -0.06 + i * 0.02));
  const fl = y + 0.14;
  p.box(x, fl, z, W - 0.5, 1.0, D - 0.5, shade);
  const nF = 8;
  const nS = 13;
  const sp = (W - 0.22) / (nF - 1);
  const colH = 1.02;
  for (let i = 0; i < nF; i++) {
    for (const sz of [-1, 1]) p.cyl(x - (W - 0.22) / 2 + i * sp, fl, z + (sz * (D - 0.22)) / 2, 0.085, 0.07, colH, stone, { seg: 7, open: true });
  }
  for (let j = 1; j < nS - 1; j++) {
    const zz = z - (D - 0.22) / 2 + (j * (D - 0.22)) / (nS - 1);
    for (const sx of [-1, 1]) p.cyl(x + (sx * (W - 0.22)) / 2, fl, zz, 0.085, 0.07, colH, stone, { seg: 7, open: true });
  }
  // entablature, triglyph frieze on the front, cornice
  const ye = fl + colH;
  p.box(x, ye, z, W, 0.12, D, stone);
  p.box(x, ye + 0.12, z, W - 0.02, 0.1, D - 0.02, tint(stone, -0.04));
  for (let i = 0; i < 15; i++) p.quad([x - W / 2 + 0.12 + i * ((W - 0.24) / 14) - 0.03, ye + 0.125, z + D / 2 - 0.009], [x - W / 2 + 0.12 + i * ((W - 0.24) / 14) + 0.03, ye + 0.125, z + D / 2 - 0.009], [x - W / 2 + 0.12 + i * ((W - 0.24) / 14) + 0.03, ye + 0.215, z + D / 2 - 0.009], [x - W / 2 + 0.12 + i * ((W - 0.24) / 14) - 0.03, ye + 0.215, z + D / 2 - 0.009], shade);
  p.box(x, ye + 0.22, z, W + 0.16, 0.05, D + 0.16, tint(stone, 0.06), { ao: 0 });
  // pediment with a recessed shaded tympanum, and the low pitched roof
  const yp = ye + 0.27;
  const ph = 0.46;
  p.prism(x, yp, z, W + 0.16, ph, D + 0.16, tint(stone, 0.03));
  const zf = z + (D + 0.16) / 2 + 0.004;
  p.tri([x - W / 2 + 0.12, yp + 0.02, zf], [x + W / 2 - 0.12, yp + 0.02, zf], [x, yp + ph - 0.1, zf], '#c6b58a');
  k.reserve(x, z, W / 2 + 0.5, D / 2 + 0.5);
}

function blueChapel(k: PortKit, x: number, z: number, s: number): void {
  const p = k.solid;
  const y = k.groundMax(x, z, 0.3 * s, 0.3 * s);
  p.box(x, y - 0.25, z, 0.6 * s, 0.25 + 0.5 * s, 0.55 * s, '#fcfbf6');
  p.box(x, y + 0.5 * s, z, 0.66 * s, 0.04, 0.6 * s, '#f3f0e6', { ao: 0 });
  p.lathe(x, y + 0.54 * s, z, [[0.3 * s, 0], [0.31 * s, 0.07 * s], [0.25 * s, 0.22 * s], [0.14 * s, 0.34 * s], [0.04 * s, 0.4 * s], [0.001, 0.41 * s]], '#2a6bc2', { seg: 12 });
  p.cyl(x, y + 0.54 * s + 0.4 * s, z, 0.008, 0.008, 0.14 * s, '#f6f3ea', { seg: 4 });
  p.box(x, y + 0.54 * s + 0.5 * s, z, 0.07 * s, 0.012, 0.012, '#f6f3ea', { ao: 0 });
  p.quad([x - 0.07 * s, y, z + 0.276 * s], [x + 0.07 * s, y, z + 0.276 * s], [x + 0.07 * s, y + 0.24 * s, z + 0.276 * s], [x - 0.07 * s, y + 0.24 * s, z + 0.276 * s], '#2a6bc2');
  p.quad([x - 0.2 * s, y + 0.26 * s, z + 0.276 * s], [x - 0.1 * s, y + 0.26 * s, z + 0.276 * s], [x - 0.1 * s, y + 0.4 * s, z + 0.276 * s], [x - 0.2 * s, y + 0.4 * s, z + 0.276 * s], '#2a6bc2');
  p.quad([x + 0.1 * s, y + 0.26 * s, z + 0.276 * s], [x + 0.2 * s, y + 0.26 * s, z + 0.276 * s], [x + 0.2 * s, y + 0.4 * s, z + 0.276 * s], [x + 0.1 * s, y + 0.4 * s, z + 0.276 * s], '#2a6bc2');
  k.reserve(x, z, 0.4 * s, 0.38 * s);
}

const piraeus: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 2.0, range: 4.5 };
    k.palette.rock = '#c3b392';
    k.bump(k.vx(-17.5, -0.8), -17.5, 9.5, 5.2, 3.0, 1.0);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    // the Acropolis rock far behind, with the Parthenon on top
    const ax = k.vx(-27.5, 3.2);
    const az = -27.5;
    const ay = k.groundMin(ax, az, 4, 3) - 0.4;
    const topY = massif(
      k,
      ax,
      az,
      ay,
      [
        { y: 0, rx: 6.2, rz: 4.4 },
        { y: 1.2, rx: 5.2, rz: 3.8 },
        { y: 2.6, rx: 4.6, rz: 3.5 },
        { y: 3.8, rx: 4.3, rz: 3.4 },
      ],
      ['#a89a6e', '#c4b48e', '#d0c19b'],
      { seg: 12, cap: '#b9b484', jitter: 0.06 },
    );
    parthenon(k, ax - 0.1, topY, az);
    // the village chapels with blue domes, placed before the houses so they keep clear
    blueChapel(k, k.vx(-15.2, -0.4), -15.2, 1.15);
    blueChapel(k, k.vx(-17.4, 2.6), -17.4, 0.85);
    blueChapel(k, k.vx(-16.3, -3.9), -16.3, 0.7);
    townFor(k, CYCLADES, { rows: 7, rowStep: 0.5, z: SHORE_Z - 0.7, gaps: 0.05, maxSlope: 0.9, minY: 0.2 });
    // a pair of container cranes on the quay to the right
    gantryCrane(k, k.vx(-12) + 6.0, SHORE_Z - 0.7, { color: '#c9402e', s: 0.9, y: LAND_Y });
    gantryCrane(k, k.vx(-12) + 7.6, SHORE_Z - 0.7, { color: '#2c5da8', s: 0.9, y: LAND_Y });
    void rng;
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Trieste ─────────────────────────────

/** Miramare Castle: white, battlemented, a tall corner tower, a round turret and pointed windows. Local frame. */
function miramare(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#f4f0e4';
  const trim = '#dcd5c2';
  const win = '#3d4a5c';
  // the main block with a battlemented roof line
  p.box(0, -0.4, 0, 2.7, 0.4 + 0.95, 1.1, wall);
  p.box(0, 0.95, 0, 2.78, 0.05, 1.18, trim, { ao: 0 });
  merlons(p, 0, 1.0, 0, 2.78, 1.18, wall, 0.15, 0.08);
  // the lower wing to the right and its round turret
  p.box(1.75, -0.4, 0.1, 0.9, 0.4 + 0.7, 0.8, tint(wall, -0.03));
  merlons(p, 1.75, 0.7, 0.1, 0.9, 0.8, wall, 0.14, 0.07);
  p.cyl(2.28, -0.4, 0.4, 0.2, 0.19, 0.4 + 1.05, wall, { seg: 10 });
  p.cyl(2.28, 0.75, 0.4, 0.23, 0.23, 0.05, trim, { seg: 10, ao: 0 });
  p.cone(2.28, 0.8, 0.4, 0.23, 0.35, '#8a6a58', { seg: 10 });
  // the tall corner tower with its own turret
  const tx = -1.0;
  const tz = 0.58;
  p.box(tx, -0.4, tz, 0.62, 0.4 + 2.15, 0.62, wall);
  p.box(tx, 1.85, tz, 0.72, 0.06, 0.72, trim, { ao: 0 });
  p.box(tx, 1.91, tz, 0.66, 0.2, 0.66, tint(wall, 0.02));
  merlons(p, tx, 2.11, tz, 0.66, 0.66, wall, 0.12, 0.08);
  p.cyl(tx - 0.2, 2.0, tz - 0.2, 0.13, 0.12, 0.45, wall, { seg: 8 });
  p.cone(tx - 0.2, 2.45, tz - 0.2, 0.15, 0.3, '#8a6a58', { seg: 8 });
  // pointed windows
  for (let f = 0; f < 2; f++) for (let i = 0; i < 6; i++) lancet(p, -0.15 + i * 0.37, 0.1 + f * 0.45, 0.554, 0.1, 0.27, win);
  for (let f = 0; f < 4; f++) lancet(p, tx, 0.12 + f * 0.5, tz + 0.314, 0.11, 0.3, win);
  for (let f = 0; f < 4; f++) wx(k, rng, tx + 0.313, 0.15 + f * 0.5, tz, 0.1, 0.26, win, 0.25);
  for (let i = 0; i < 2; i++) lancet(p, 1.55 + i * 0.35, 0.15, 0.51, 0.1, 0.28, win);
  // the sea-front terrace with a balustrade
  p.box(0.1, -1.6, 0.88, 3.6, 1.6, 0.5, '#d4cab4');
  p.box(0.1, -0.02, 0.88, 3.64, 0.04, 0.54, '#e6e0cf', { ao: 0 });
  p.box(0.1, 0, 1.1, 3.6, 0.1, 0.05, '#f1ecdd', { ao: 0 });
}

const trieste: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.6, range: 4 };
    const px = k.vx(-12.2, 0.6);
    k.bump(px, -11.2, 4.4, 2.9, 2.3, 0.45);
    k.plateau(px - 0.2, -11.3, 3.1, 1.9, 1.45, 0.35);
    const grass = col('#6f9b55');
    const cliff = col('#c9bfa6');
    k.paint((x, y, z, slope, c) => {
      const d = Math.hypot((x - px) / 4.6, (z + 11.2) / 3.1);
      if (d < 1) {
        c.lerp(grass, 0.8 * smooth(0.0, 0.5, y));
        if (y < 0.5) c.lerp(cliff, 0.55);
      }
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const px = k.vx(-12.2, 0.6);
    const y = k.groundMax(px - 0.6, -11.5, 1.8, 0.5);
    placed(k, px - 0.5, y, -11.5, 1.3, 2.7, 1.0, () => miramare(k, rng));
    // the park around the castle: pines and cypresses on the promontory
    for (let i = 0; i < 16; i++) {
      const tx = px - 2.8 + rng.range(0, 5.8);
      const tz = -11.5 + rng.range(-1.7, 1.3);
      if (k.isReserved(tx, tz, 0.05) || k.ground(tx, tz) < 0.4) continue;
      tree(k, rng.chance(0.6) ? 'cypress' : 'pine', tx, tz, rng.range(1.0, 1.5), rng);
    }
  },
  mole: { light: { bands: [['#e9dcb8', 1]], cap: '#3a3f46', gallery: '#7a6f5d', h: 1.9, r0: 0.3, r1: 0.22, square: true } },
  quiet: true,
};

// ───────────────────────────── Livorno ─────────────────────────────

/** The Terrazza Mascagni: a promenade tiled like a chessboard, behind a white balustrade. */
function terrazza(k: PortKit, x0: number, x1: number, zFront: number, depth: number): void {
  const p = k.solid;
  const y = LAND_Y + 0.04;
  const cx = (x0 + x1) / 2;
  p.box(cx, y - 0.14, zFront - depth / 2, x1 - x0, 0.14, depth, '#f4f0e4');
  const tile = 0.5;
  const nx = Math.round((x1 - x0) / tile);
  const nz = Math.round(depth / tile);
  const zs = depth / nz;
  const xs = (x1 - x0) / nx;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if ((i + j) % 2) continue;
      const xa = x0 + i * xs;
      const za = zFront - j * zs;
      p.quad([xa, y + 0.003, za], [xa + xs, y + 0.003, za], [xa + xs, y + 0.003, za - zs], [xa, y + 0.003, za - zs], '#2b2d33');
    }
  }
  // balustrade along the sea edge, with taller posts and lamps
  p.box(cx, y, zFront - 0.02, x1 - x0, 0.1, 0.07, '#f8f5ec');
  for (let x = x0 + 0.1; x < x1; x += 0.5) {
    p.box(x, y, zFront - 0.02, 0.1, 0.2, 0.1, '#fbf9f2');
    k.glow.ball(x, y + 0.26, zFront - 0.02, 0.035, '#fff1c8');
  }
  k.reserve(cx, zFront - depth / 2, (x1 - x0) / 2, depth / 2 + 0.1);
}

/** Fortezza Vecchia: a brick fort with arrow-head bastions, a square keep and the round Mastio tower. Local frame. */
function fortezza(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const brick = '#c78f68';
  const light = '#e0b88f';
  p.box(0, -0.4, 0, 2.7, 0.4 + 0.55, 1.5, brick);
  merlons(p, 0, 0.55, 0, 2.7, 1.5, light, 0.16, 0.07);
  for (const [dx, dz] of [[-1.5, 0.78], [1.5, 0.78], [-1.5, -0.78], [1.5, -0.78]] as const) {
    p.cyl(dx, -0.4, dz, 0.5, 0.36, 0.4 + 0.62, brick, { seg: 4, ry: Math.PI / 4 });
    p.cyl(dx, 0.22, dz, 0.4, 0.4, 0.04, light, { seg: 4, ry: Math.PI / 4, ao: 0 });
  }
  p.cyl(0, -0.4, 0.95, 0.46, 0.34, 0.4 + 0.6, brick, { seg: 5 });
  // the square keep and the round Mastio tower
  p.box(-0.35, 0.55, -0.1, 0.85, 0.95, 0.75, tint(brick, 0.05));
  p.box(-0.35, 1.5, -0.1, 0.95, 0.06, 0.85, light, { ao: 0 });
  merlons(p, -0.35, 1.56, -0.1, 0.95, 0.85, light, 0.13, 0.08);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) wz(k, rng, -0.6 + i * 0.5, 0.7 + j * 0.27, 0.284, 0.07, 0.14, '#3a2f2a', 0.2);
  p.cyl(0.62, 0.55, -0.15, 0.33, 0.3, 0.8, tint(brick, -0.02), { seg: 12 });
  p.cyl(0.62, 1.35, -0.15, 0.37, 0.37, 0.06, light, { seg: 12, ao: 0 });
  p.cone(0.62, 1.41, -0.15, 0.37, 0.28, '#8a5a48', { seg: 12 });
}

const livorno: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.2, range: 3.6 };
    k.plateau(k.vx(-13.0, 5.4), -13.4, 5.8, 1.8, LAND_Y, 0.2);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    placed(k, k.vx(-14.0, -2.6), LAND_Y, -14.0, 1.5, 1.8, 1.1, () => fortezza(k, rng));
    terrazza(k, k.vx(-13.0, 0.4), k.vx(-13.0, 10.4), SHORE_Z - 0.2, 2.5);
  },
  mole: { light: { bands: [['#e2cfa8', 0.5], ['#d7c398', 0.5]], cap: '#6f5a48', gallery: '#6a5a48', h: 2.5, r0: 0.3, r1: 0.2, seg: 8 } },
  quiet: true,
};

// ───────────────────────────── La Spezia ─────────────────────────────

const PASTEL: HouseStyle = {
  ...MED,
  walls: ['#eaa3a0', '#f3d479', '#e89a5a', '#f4c9a4', '#dd8a78', '#f1e5c4', '#f0b27a', '#e6b6b0'],
  roofs: ['#b8553d', '#c4673f', '#a64b36'],
  floors: [2, 4],
  floorH: 0.18,
  roofKinds: [['hip', 4], ['gable', 3], ['flat', 1]],
  gap: [0, 0.03],
  door: '#5a7a5a',
  runs: false,
};

/** Castello San Giorgio: sand-coloured walls, four round towers and a keep. Local frame. */
function castelloSanGiorgio(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#cdb899';
  const light = '#e4d3b2';
  p.box(0, -0.5, 0, 2.2, 0.5 + 0.62, 1.5, wall);
  merlons(p, 0, 0.62, 0, 2.2, 1.5, light, 0.15, 0.07);
  for (const [dx, dz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const tx = dx * 1.12;
    const tz = dz * 0.77;
    p.cyl(tx, -0.5, tz, 0.3, 0.27, 0.5 + 1.05, wall, { seg: 10 });
    p.cyl(tx, 0.65, tz, 0.33, 0.33, 0.05, light, { seg: 10, ao: 0 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.box(tx + Math.cos(a) * 0.31, 0.7, tz + Math.sin(a) * 0.31, 0.1, 0.07, 0.1, light, { ao: 0 });
    }
  }
  p.box(-0.2, 0.6, 0, 0.9, 0.7, 0.8, tint(wall, 0.04));
  merlons(p, -0.2, 1.3, 0, 0.9, 0.8, light, 0.13, 0.08);
  p.box(0.55, 0.6, -0.1, 0.45, 1.1, 0.45, tint(wall, 0.02));
  merlons(p, 0.55, 1.7, -0.1, 0.45, 0.45, light, 0.11, 0.08);
  for (let i = 0; i < 4; i++) wz(k, rng, -0.7 + i * 0.3, 0.75, 0.404, 0.07, 0.17, '#3a3430', 0.2);
  for (let i = 0; i < 4; i++) wz(k, rng, -0.75 + i * 0.5, 0.18, 0.754, 0.08, 0.2, '#3a3430', 0.2);
}

const laSpezia: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 2.0, range: 5.5, rise: 3, rough: 0.5 };
    k.palette.land = '#9db36b';
    k.palette.land2 = '#93ab62';
    k.palette.hill = '#7ba05a';
    k.palette.rock = '#a79d86';
    k.bump(k.vx(-18.5, 0.8), -18.5, 12, 6, 1.9, 1.0);
    // the knoll of the castle, levelled on top
    const kx = k.vx(-18.4, 1.8);
    k.bump(kx, -18.4, 5.0, 3.2, 1.4, 0.9);
    k.plateau(kx, -18.4, 2.5, 1.7, k.ground(kx, -18.4) - 0.1, 0.55);
    // terraces: alternating green bands following the contours of the slope
    const dark = col('#6f954f');
    const lightG = col('#a9c070');
    const green = col('#7fa65a');
    k.paint((x, y, z, slope, c) => {
      if (Math.hypot((x - kx) / 5.4, (z + 18.4) / 3.6) < 1 && y > 1.2) c.lerp(green, 0.75);
      if (z > SHORE_Z - 2.6 || y < 0.6 || slope > 0.4) return;
      const band = Math.floor(y * 3.4) % 2;
      c.lerp(band ? dark : lightG, 0.55);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const kx = k.vx(-18.4, 1.8);
    placed(k, kx, k.groundMax(kx, -18.4, 1.3, 0.9), -18.4, 1.2, 1.9, 1.1, () => castelloSanGiorgio(k, rng));
    townFor(k, PASTEL, { rows: 6, rowStep: 0.55, z: SHORE_Z - 0.7, gaps: 0.06, maxSlope: 0.8, minY: 0.2 });
    // grey naval ships at the quay, and a few cranes
    warship(k, k.vx(-11.4, 0.4), -11.3, 5.0, 0);
    warship(k, k.vx(-11.4, 4.4), -11.3, 3.4, 0, '#98a2aa');
    gantryCrane(k, k.vx(-12) - 7.0, SHORE_Z - 0.7, { color: '#2c5da8', s: 0.9, y: LAND_Y });
    gantryCrane(k, k.vx(-12) - 8.6, SHORE_Z - 0.7, { color: '#c9402e', s: 0.9, y: LAND_Y });
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Gioia Tauro ─────────────────────────────

const gioiaTauro: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { relief: 1.4, range: 7.0, rise: 8, rough: 0.85, freq: 0.1 };
    k.palette = { land: '#8d9179', land2: '#868b73', hill: '#4a6a4c', rock: '#5f6a5c', sand: '#cfc7b0', haze: '#c9d9df' };
    const cx = k.vx(-15.5);
    k.plateau(cx, -15.8, 15, 3.6, LAND_Y, 0.25);
    const conc = col('#a2a29a');
    k.paint((x, y, z, slope, c) => {
      if (Math.abs(x - cx) < 14.5 && z < SHORE_Z + 0.2 && z > -18.6 && y < 0.7) c.lerp(conc, 0.8);
    });
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-13.5);
    // the quay crane row: two colours, boom over the water
    const n = 10;
    for (let i = 0; i < n; i++) gantryCrane(k, cx - 7.4 + i * 1.64, SHORE_Z - 0.75, { color: i % 2 ? '#c9402e' : '#2f62b0', s: 1.1, y: LAND_Y });
    // endless stacks of containers behind
    for (let r = 0; r < 3; r++) {
      const z0 = SHORE_Z - 1.75 - r * 1.15;
      for (let b = 0; b < 6; b++) {
        const x0 = cx - 9.8 + b * 3.45 + (r % 2) * 0.5;
        yard(k, x0, z0, rng.int(10, 12), 6, r === 0 ? 3 : 4 + (b % 2), rng);
      }
    }
    // high-mast floodlights between the stacks
    for (let i = 0; i < 4; i++) {
      const x = cx - 6.6 + i * 4.6;
      const z = SHORE_Z - 5.4;
      k.solid.cyl(x, LAND_Y - 0.02, z, 0.035, 0.022, 2.1, '#b7bbbd', { seg: 5, ao: 0.05 });
      k.solid.box(x, LAND_Y + 2.1, z, 0.36, 0.05, 0.12, '#6a7076', { ao: 0 });
      k.glow.box(x, LAND_Y + 2.06, z + 0.04, 0.3, 0.03, 0.05, '#fff4c8', { ao: 0 });
      k.reserve(x, z, 0.1, 0.1);
    }
    // a gate-house shed
    k.solid.box(cx + 9.6, LAND_Y - 0.1, SHORE_Z - 2.0, 1.8, 0.5, 0.9, '#d6d2c6');
    k.solid.box(cx + 9.6, LAND_Y + 0.4, SHORE_Z - 2.0, 1.9, 0.05, 1.0, '#7f8a92');
    // dark pines on the mountainsides
    for (let i = 0; i < 40; i++) {
      const x = cx - 14 + rng.range(0, 28);
      const z = rng.range(-30, -19.5);
      const y = k.ground(x, z);
      if (y < 0.6 || y > 6) continue;
      tree(k, 'pine', x, z, rng.range(1.2, 1.9), rng, y - 0.03);
    }
  },
  rows: 0,
  quiet: true,
};

// ───────────────────────────── Koper ─────────────────────────────

const VENETIAN: HouseStyle = {
  ...MED,
  walls: ['#ecdfc0', '#e6c9a0', '#e9d3a8', '#d9b88a', '#f1e7d0', '#dcc9a4'],
  roofs: ['#b8553d', '#c4673f', '#a64b36', '#b9633f'],
  floors: [2, 4],
  floorH: 0.19,
  roofKinds: [['gable', 5], ['hip', 3]],
  pitch: 0.45,
  gap: [0, 0.03],
  door: '#5a4a3a',
  runs: false,
};

/** The bell tower of Koper's cathedral: a tall square shaft, a belfry with arches, a pointed baroque cap. */
function kopTower(k: PortKit, rng: Rng, x: number, z: number, y: number): void {
  const p = k.solid;
  const stone = '#e8dcbc';
  const belt = '#f5ecd2';
  const w = 0.56;
  const H = 2.45;
  p.box(x, y - 0.3, z, w, 0.3 + H, w, stone);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + (sx * w) / 2, y - 0.3, z + (sz * w) / 2, 0.06, 0.3 + H, 0.06, belt, { ao: 0 });
  for (const t of [0.3, 0.6]) p.box(x, y + H * t, z, w + 0.04, 0.035, w + 0.04, belt, { ao: 0 });
  for (let i = 0; i < 2; i++) {
    lancet(p, x, y + 0.45 + i * 0.7, z + w / 2 + 0.003, 0.1, 0.3, '#3d4450');
    wx(k, rng, x + w / 2 + 0.003, y + 0.5 + i * 0.7, z, 0.09, 0.24, '#3d4450', 0);
  }
  // a clock face, white with a dark rim
  p.quad([x - 0.13, y + 1.62, z + w / 2 + 0.004], [x + 0.13, y + 1.62, z + w / 2 + 0.004], [x + 0.13, y + 1.88, z + w / 2 + 0.004], [x - 0.13, y + 1.88, z + w / 2 + 0.004], '#2e3138');
  p.quad([x - 0.1, y + 1.65, z + w / 2 + 0.006], [x + 0.1, y + 1.65, z + w / 2 + 0.006], [x + 0.1, y + 1.85, z + w / 2 + 0.006], [x - 0.1, y + 1.85, z + w / 2 + 0.006], '#f6f3ea');
  p.box(x, y + 1.75, z + w / 2 + 0.01, 0.014, 0.1, 0.004, '#2e3138', { ao: 0 });
  // belfry: open arches on all sides, cornice, then the cap
  const yb = y + H;
  p.box(x, yb, z, w + 0.1, 0.05, w + 0.1, belt, { ao: 0 });
  p.box(x, yb + 0.05, z, w - 0.04, 0.42, w - 0.04, '#34383f');
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + (sx * (w - 0.04)) / 2, yb + 0.05, z + (sz * (w - 0.04)) / 2, 0.075, 0.42, 0.075, stone);
  p.box(x, yb + 0.47, z, w + 0.1, 0.05, w + 0.1, belt, { ao: 0 });
  p.box(x, yb + 0.52, z, w + 0.02, 0.1, w + 0.02, stone);
  p.pyramid(x, yb + 0.62, z, w + 0.04, 0.5, w + 0.04, '#6f9a86');
  p.cyl(x, yb + 1.1, z, 0.1, 0.1, 0.05, '#6f9a86', { seg: 8 });
  p.cone(x, yb + 1.15, z, 0.1, 0.42, '#5f8a76', { seg: 8 });
  p.ball(x, yb + 1.6, z, 0.035, '#e8c23a');
  k.reserve(x, z, 0.5, 0.5);
}

/** The Praetorian Palace: a Venetian-Gothic block with a row of pointed arches and a battlemented roof line. Local frame. */
function pretoriana(k: PortKit, rng: Rng): void {
  const p = k.solid;
  const wall = '#f0e4c6';
  p.box(0, -0.3, 0, 1.3, 0.3 + 0.62, 0.6, wall);
  p.box(0, 0.62, 0, 1.38, 0.05, 0.66, '#d9c9a0', { ao: 0 });
  merlons(p, 0, 0.67, 0, 1.38, 0.66, '#f8f0dc', 0.12, 0.08);
  for (let i = 0; i < 5; i++) lancet(p, -0.52 + i * 0.26, 0.05, 0.303, 0.11, 0.26, '#6a4f3a');
  for (let i = 0; i < 5; i++) lancet(p, -0.52 + i * 0.26, 0.36, 0.303, 0.09, 0.22, '#3d4450');
  p.box(0, 0.33, 0.31, 1.3, 0.03, 0.04, '#d9c9a0', { ao: 0 });
  for (let i = 0; i < 2; i++) wx(k, rng, 0.653, 0.1 + i * 0.3, 0, 0.1, 0.2, '#3d4450', 0.2);
}

const koper: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape = { ...k.shape, relief: 1.6, range: 4.2 };
    const px = k.vx(-11.9, 0.0);
    k.bump(px, -11.2, 3.9, 2.2, 1.35, 0.5);
    k.plateau(px, -11.4, 3.0, 1.5, 0.62, 0.45);
  },
  build(k) {
    const rng = new Rng(k.seed ^ 12345);
    const px = k.vx(-11.9, 0.0);
    // the old town on its peninsula: dense, terracotta, with the bell tower in the middle
    kopTower(k, rng, px + 0.3, -11.55, k.groundMax(px + 0.3, -11.55, 0.4, 0.4));
    const nave = k.groundMax(px - 0.95, -11.5, 0.5, 0.4);
    k.solid.box(px - 0.95, nave - 0.2, -11.5, 0.9, 0.2 + 0.5, 0.75, '#ecdfc0');
    k.solid.prism(px - 0.95, nave + 0.5, -11.5, 0.8, 0.26, 0.95, '#b8553d', { ry: Math.PI / 2 });
    k.reserve(px - 0.95, -11.5, 0.6, 0.5);
    placed(k, px + 1.55, k.groundMax(px + 1.55, -11.1, 0.7, 0.35), -11.1, 1.0, 0.75, 0.4, () => pretoriana(k, rng));
    for (let r = 0; r < 3; r++) {
      const zr = -10.35 - r * 0.62;
      for (let x = px - 3.4; x < px + 3.5; ) {
        const w = rng.range(0.34, 0.54);
        const d = rng.range(0.34, 0.46);
        const hx = x + w / 2;
        x += w + rng.range(0, 0.04);
        if (k.isReserved(hx, zr, 0.02)) continue;
        if (k.groundMin(hx, zr, w / 2, d / 2) < 0.2) continue;
        const kind = rng.chance(0.7) ? 'gable' : 'hip';
        house(k, hx, zr, w, d, rng.int(2, 4), VENETIAN, rng, kind, VENETIAN.walls[rng.int(0, VENETIAN.walls.length - 1)], tint(VENETIAN.roofs[rng.int(0, VENETIAN.roofs.length - 1)], rng.range(-0.06, 0.06)));
      }
    }
    townFor(k, VENETIAN, { rows: 3, rowStep: 0.55, z: SHORE_Z - 1.4, gaps: 0.1 });
    // Luka Koper: a few cranes and container stacks on the pier to the right
    for (let i = 0; i < 3; i++) gantryCrane(k, px + 5.6 + i * 1.6, SHORE_Z - 0.75, { color: i % 2 ? '#c9402e' : '#2f62b0', s: 1.0, y: LAND_Y });
    yard(k, px + 4.8, SHORE_Z - 1.9, 9, 5, 4, rng);
  },
  rows: 0,
  quiet: true,
};

export const LANDMARKS: Record<string, Landmark> = {
  naples,
  genoa,
  marsaxlokk,
  piraeus,
  trieste,
  livorno,
  laspezia: laSpezia,
  gioiatauro: gioiaTauro,
  koper,
};

/** [port name, region, landmark id] */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Naples', 'med', 'naples'],
  ['Genoa', 'med', 'genoa'],
  ['Marsaxlokk', 'med', 'marsaxlokk'],
  ['Piraeus', 'med', 'piraeus'],
  ['Trieste', 'med', 'trieste'],
  ['Livorno', 'med', 'livorno'],
  ['La Spezia', 'med', 'laspezia'],
  ['Gioia Tauro', 'med', 'gioiatauro'],
  ['Koper', 'med', 'koper'],
];
