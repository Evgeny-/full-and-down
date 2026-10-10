import { Rng } from '../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, clamp, lerp, type Col, type V3 } from './kit';
import { pick, tint } from './town';

/** Reusable structures shared by regional styles and landmarks. All are built with their foot on y. */

// ───────────────────────────── energy & industry ─────────────────────────────

/** A wind turbine; its rotor is an instance spun by the scene's update hook. */
export function turbine(k: PortKit, x: number, z: number, h = 1.7, y = k.ground(x, z) - 0.02): void {
  const p = k.solid;
  p.cyl(x, y, z, 0.05 * (h / 1.7), 0.026 * (h / 1.7), h, '#eef0f1', { seg: 10, ao: 0.1 });
  p.box(x, y + h - 0.02, z + 0.02, 0.085, 0.075, 0.2, '#e3e6e8');
  k.rotors.push({ x, y: y + h + 0.015, z: z + 0.15, s: h / 1.7, speed: 0.9 + ((x * 7.13) % 0.5), phase: (x * 3.7) % 6.28 });
}

/** A row of turbines on a line (a wind farm on the dike). */
export function turbineRow(k: PortKit, x0: number, x1: number, z: number, n: number, h = 1.7): void {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1));
    const zz = z - (i % 2) * 0.8;
    if (k.isReserved(x, zz, 0.2)) continue;
    turbine(k, x, zz, h * (0.9 + (i % 3) * 0.06));
    k.reserve(x, zz, 0.15, 0.15);
  }
}

/** A smokestack with a banded top. */
export function stack(k: PortKit, x: number, z: number, h: number, r = 0.1, y = k.ground(x, z) - 0.02, band: Col = '#c8302a'): void {
  const p = k.solid;
  p.cyl(x, y, z, r, r * 0.62, h, '#bdb5a8', { seg: 12 });
  p.cyl(x, y + h * 0.82, z, r * 0.7, r * 0.64, h * 0.07, band, { seg: 12, ao: 0 });
  p.cyl(x, y + h * 0.93, z, r * 0.63, r * 0.62, h * 0.07, band, { seg: 12, ao: 0 });
  p.cyl(x, y + h, z, r * 0.64, r * 0.64, 0.02, '#4a4a4a', { seg: 12, ao: 0 });
}

export function factory(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col = '#c9c3b6', roof: Col = '#7f8a92'): void {
  const y = k.groundMax(x, z, w / 2, d / 2);
  const p = k.solid;
  p.box(x, y - 0.1, z, w, h + 0.1, d, wall);
  p.prism(x, y + h, z, w + 0.03, 0.12, d + 0.03, roof, { ry: Math.PI / 2 });
  for (let i = 0; i < Math.floor(w / 0.22); i++) p.quad([x - w / 2 + 0.1 + i * 0.22, y + h * 0.5, z + d / 2 + 0.004], [x - w / 2 + 0.19 + i * 0.22, y + h * 0.5, z + d / 2 + 0.004], [x - w / 2 + 0.19 + i * 0.22, y + h * 0.82, z + d / 2 + 0.004], [x - w / 2 + 0.1 + i * 0.22, y + h * 0.82, z + d / 2 + 0.004], '#566574');
  k.reserve(x, z, w / 2, d / 2);
}

// ───────────────────────────── towers ─────────────────────────────

/** A Dutch tower mill: tapering white/brick body, dark cap, four lattice sails. */
export function windmill(k: PortKit, x: number, z: number, s = 1, body: Col = '#efe9da', y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  p.cyl(x, y, z, 0.2 * s, 0.2 * s, 0.08 * s, '#8d7a64', { seg: 8 });
  p.cyl(x, y + 0.08 * s, z, 0.19 * s, 0.11 * s, 0.62 * s, body, { seg: 8 });
  p.cyl(x, y + 0.7 * s, z, 0.125 * s, 0.1 * s, 0.05 * s, '#3b3f46', { seg: 8 });
  p.cone(x, y + 0.75 * s, z, 0.14 * s, 0.17 * s, '#3b3f46', { seg: 8 });
  p.box(x, y + 0.08 * s, z + 0.17 * s, 0.07 * s, 0.12 * s, 0.03 * s, '#6b4b3a');
  const hubZ = z + 0.14 * s;
  const hubY = y + 0.72 * s;
  p.ball(hubX(x), hubY, hubZ, 0.03 * s, '#3b3f46');
  for (let i = 0; i < 4; i++) {
    const a = 0.4 + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const L = 0.6 * s;
    p.rod([x, hubY, hubZ], [x + c * L, hubY + sn * L, hubZ], 0.008 * s, '#5b4636');
    // the sail: a lighter lattice panel along one side of the whorl
    const nx = -sn;
    const ny = c;
    const q = (t: number, w: number): V3 => [x + c * L * t + nx * w * s, hubY + sn * L * t + ny * w * s, hubZ + 0.004];
    p.quad(q(0.22, 0.01), q(0.98, 0.01), q(0.98, 0.1), q(0.22, 0.1), '#e9e2d0', true);
    p.quad(q(0.22, 0.01), q(0.98, 0.01), q(0.98, 0.1), q(0.22, 0.1), '#e9e2d0', true);
  }
  k.reserve(x, z, 0.3 * s, 0.3 * s);
}
const hubX = (x: number): number => x;

/** A church: nave with a gabled roof, a west tower with a spire. */
export function church(k: PortKit, x: number, z: number, o: { wall?: Col; roof?: Col; spire?: Col; h?: number; ry?: number; nave?: number; style?: 'spire' | 'onion' | 'flat' } = {}): void {
  const y = k.groundMax(x, z, 0.5, 0.3);
  const p = k.solid;
  const wall = o.wall ?? '#e9dfc9';
  const roof = o.roof ?? '#7b4a3c';
  const h = o.h ?? 1.0;
  const nave = o.nave ?? 0.85;
  k.at(x, y, z, o.ry ?? 0, 1, () => {
    p.box(0, -0.12, 0, nave, 0.12 + 0.34, 0.38, wall);
    p.prism(0, 0.34, 0, 0.42, 0.2, nave + 0.04, roof, { ry: Math.PI / 2 });
    p.tri([nave / 2 + 0.002, 0.34, 0.21], [nave / 2 + 0.002, 0.34, -0.21], [nave / 2 + 0.002, 0.54, 0], wall);
    for (let i = 0; i < 4; i++) p.quad([-nave / 2 + 0.1 + i * 0.18, 0.1, 0.194], [-nave / 2 + 0.16 + i * 0.18, 0.1, 0.194], [-nave / 2 + 0.16 + i * 0.18, 0.26, 0.194], [-nave / 2 + 0.1 + i * 0.18, 0.1 + 0.16, 0.194], '#455a72');
    const tx = -nave / 2 - 0.05;
    p.box(tx, -0.12, 0, 0.22, 0.12 + h * 0.5, 0.22, wall);
    p.box(tx, h * 0.5 - 0.02, 0, 0.19, h * 0.18, 0.19, tint(wall, 0.05));
    for (const dx of [0.0951]) p.quad([tx + dx, h * 0.52, 0.06], [tx + dx, h * 0.52, -0.06], [tx + dx, h * 0.64, -0.06], [tx + dx, h * 0.64, 0.06], '#3a4452');
    p.quad([tx - 0.06, h * 0.52, 0.0951], [tx + 0.06, h * 0.52, 0.0951], [tx + 0.06, h * 0.64, 0.0951], [tx - 0.06, h * 0.64, 0.0951], '#3a4452');
    const sp = o.spire ?? '#4d6b5c';
    if (o.style === 'flat') p.box(tx, h * 0.68 - 0.02, 0, 0.24, 0.04, 0.24, sp);
    else if (o.style === 'onion') {
      p.ball(tx, h * 0.76, 0, 0.12, sp, { sy: 1.2 });
      p.cone(tx, h * 0.78, 0, 0.06, 0.3, sp, { seg: 8 });
    } else p.pyramid(tx, h * 0.68 - 0.02, 0, 0.21, h * 0.5, 0.21, sp);
    p.cyl(tx, h * 0.68 + h * 0.48 - 0.02, 0, 0.004, 0.004, 0.08, '#e8b923', { seg: 4 });
  });
  k.reserve(x, z, nave / 2 + 0.3, 0.35);
}

/** A square brick campanile with an open belfry and a pyramid cap. */
export function campanile(k: PortKit, x: number, z: number, h = 1.5, o: { wall?: Col; roof?: Col; w?: number } = {}): void {
  const y = k.groundMax(x, z, 0.2, 0.2);
  const p = k.solid;
  const w = o.w ?? 0.26;
  const wall = o.wall ?? '#c97b58';
  p.box(x, y - 0.1, z, w, h * 0.72 + 0.1, w, wall);
  p.box(x, y + h * 0.72, z, w + 0.02, 0.025, w + 0.02, tint(wall, 0.2));
  // belfry: four dark arches and slim piers
  const by = y + h * 0.74;
  const bh = h * 0.15;
  p.box(x, by, z, w - 0.02, bh, w - 0.02, '#2a2f38');
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + (dx * (w - 0.03)) / 2, by, z + (dz * (w - 0.03)) / 2, 0.035, bh, 0.035, tint(wall, 0.1));
  p.box(x, by + bh, z, w + 0.02, 0.03, w + 0.02, tint(wall, 0.2));
  p.pyramid(x, by + bh + 0.03, z, w, h * 0.22, w, o.roof ?? '#7a8f6a');
  p.cyl(x, by + bh + 0.03 + h * 0.22, z, 0.004, 0.004, 0.08, '#e8b923', { seg: 4 });
  // clock face / window on the shaft
  p.quad([x - 0.03, y + h * 0.4, z + w / 2 + 0.003], [x + 0.03, y + h * 0.4, z + w / 2 + 0.003], [x + 0.03, y + h * 0.4 + 0.14, z + w / 2 + 0.003], [x - 0.03, y + h * 0.4 + 0.14, z + w / 2 + 0.003], '#3a4452');
  k.reserve(x, z, w, w);
}

/** A mosque: cubic prayer hall under a dome, with a minaret beside it. */
export function mosque(k: PortKit, x: number, z: number, s = 1, o: { wall?: Col; dome?: Col; minarets?: number } = {}): void {
  const y = k.groundMax(x, z, 0.5 * s, 0.4 * s);
  const p = k.solid;
  const wall = o.wall ?? '#f4eee0';
  const dome = o.dome ?? '#3f8d86';
  p.box(x, y - 0.1, z, 0.8 * s, 0.1 + 0.4 * s, 0.6 * s, wall);
  p.box(x, y + 0.4 * s, z, 0.84 * s, 0.03 * s, 0.64 * s, tint(wall, -0.06));
  p.lathe(x, y + 0.43 * s, z, [[0.26 * s, 0], [0.27 * s, 0.07 * s], [0.22 * s, 0.2 * s], [0.12 * s, 0.3 * s], [0.03 * s, 0.36 * s], [0.0, 0.38 * s]], dome, { seg: 14 });
  p.cyl(x, y + 0.43 * s + 0.37 * s, z, 0.005, 0.005, 0.1 * s, '#e8b923', { seg: 4 });
  for (let i = 0; i < 4; i++) p.box(x - 0.25 * s + i * 0.17 * s, y + 0.1 * s, z + 0.3 * s + 0.002, 0.07 * s, 0.17 * s, 0.01, '#3a4a58', { ao: 0 });
  const n = o.minarets ?? 1;
  for (let i = 0; i < n; i++) minaret(k, x + (i ? 0.52 : -0.52) * s, z + 0.1 * s, 1.5 * s, y);
  k.reserve(x, z, (0.5 + (n > 1 ? 0.5 : 0.1)) * s + 0.3, 0.45 * s);
}

export function minaret(k: PortKit, x: number, z: number, h: number, y = k.ground(x, z) - 0.03, wall: Col = '#f4eee0', cap: Col = '#3f8d86'): void {
  const p = k.solid;
  p.box(x, y - 0.1, z, 0.13, 0.1 + h * 0.62, 0.13, wall);
  p.box(x, y + h * 0.62, z, 0.16, 0.035, 0.16, tint(wall, -0.1));
  p.cyl(x, y + h * 0.655, z, 0.052, 0.045, h * 0.2, wall, { seg: 8 });
  p.cyl(x, y + h * 0.855, z, 0.075, 0.075, 0.03, tint(wall, -0.1), { seg: 8 });
  p.cyl(x, y + h * 0.885, z, 0.04, 0.034, h * 0.06, wall, { seg: 8 });
  p.cone(x, y + h * 0.945, z, 0.05, h * 0.075, cap, { seg: 8 });
  p.ball(x, y + h * 1.03, z, 0.012, '#e8b923');
  p.quad([x - 0.02, y + h * 0.3, z + 0.067], [x + 0.02, y + h * 0.3, z + 0.067], [x + 0.02, y + h * 0.3 + 0.09, z + 0.067], [x - 0.02, y + h * 0.3 + 0.09, z + 0.067], '#3a4a58');
}

export function waterTower(k: PortKit, x: number, z: number, o: { s?: number; tank?: Col; roof?: Col; y?: number } = {}): void {
  const s = o.s ?? 1;
  const y = o.y ?? k.ground(x, z) - 0.03;
  const p = k.solid;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    p.cyl(x + dx * 0.11 * s, y, z + dz * 0.11 * s, 0.012 * s, 0.012 * s, 0.62 * s, '#5b6670', { seg: 5, ao: 0.05 });
  }
  p.box(x, y + 0.3 * s, z, 0.26 * s, 0.012, 0.26 * s, '#5b6670', { ao: 0 });
  p.cyl(x, y + 0.62 * s, z, 0.19 * s, 0.19 * s, 0.26 * s, o.tank ?? '#d9d4c7', { seg: 14 });
  p.cone(x, y + 0.88 * s, z, 0.2 * s, 0.13 * s, o.roof ?? '#7b8a94', { seg: 14 });
  k.reserve(x, z, 0.2 * s, 0.2 * s);
}

// ───────────────────────────── port equipment ─────────────────────────────

/** A ship-to-shore container crane at the quay edge (boom raised over the water, +z). */
export function gantryCrane(k: PortKit, x: number, z: number, o: { color?: Col; s?: number; y?: number; boom?: number } = {}): void {
  const s = o.s ?? 1;
  const y = o.y ?? LAND_Y;
  const c = o.color ?? '#2c5da8';
  const p = k.solid;
  const legs: Array<[number, number]> = [[-0.3, -0.34], [0.3, -0.34], [-0.3, 0.34], [0.3, 0.34]];
  const H = 1.25 * s;
  for (const [dx, dz] of legs) p.box(x + dx * s, y - 0.1, z + dz * s, 0.07 * s, H + 0.1, 0.07 * s, c);
  // sill beams and cross braces
  p.box(x, y + 0.08, z - 0.34 * s, 0.67 * s, 0.05 * s, 0.05 * s, c);
  p.box(x, y + 0.08, z + 0.34 * s, 0.67 * s, 0.05 * s, 0.05 * s, c);
  p.rod([x - 0.3 * s, y + 0.1, z + 0.34 * s], [x + 0.3 * s, y + H - 0.05, z + 0.34 * s], 0.01 * s, c);
  p.rod([x + 0.3 * s, y + 0.1, z + 0.34 * s], [x - 0.3 * s, y + H - 0.05, z + 0.34 * s], 0.01 * s, c);
  // portal beams and the machinery house
  p.box(x, y + H - 0.05 * s, z, 0.67 * s, 0.1 * s, 0.75 * s, '#f1f2ee');
  p.box(x, y + H + 0.05 * s, z, 0.32 * s, 0.14 * s, 0.34 * s, c);
  // boom: a lattice girder rising toward the water
  const bl = (o.boom ?? 1.9) * s;
  const a = -0.28;
  p.box(x, y + H + 0.02 * s, z + 0.05 * s, 0.1 * s, 0.1 * s, bl, '#f1f2ee', { rx: a, ao: 0 });
  p.box(x - 0.055 * s, y + H + 0.02 * s, z + 0.05 * s, 0.025 * s, 0.1 * s, bl, c, { rx: a, ao: 0 });
  p.box(x + 0.055 * s, y + H + 0.02 * s, z + 0.05 * s, 0.025 * s, 0.1 * s, bl, c, { rx: a, ao: 0 });
  // back-reach and the A-frame with stays
  p.box(x, y + H + 0.02 * s, z - 0.5 * s, 0.1 * s, 0.1 * s, 0.7 * s, '#f1f2ee', { rx: 0.12, ao: 0 });
  const fy = y + H + 0.3 * s;
  p.rod([x, fy, z + 0.02 * s], [x, y + H + 0.05 * s, z + 0.02 * s], 0.012 * s, c);
  p.rod([x, fy, z + 0.02 * s], [x, y + H + 0.02 * s + Math.sin(-a) * bl * 0.95, z + 0.05 * s + Math.cos(a) * bl * 0.95], 0.006 * s, '#3a3f46');
  p.rod([x, fy, z + 0.02 * s], [x, y + H - 0.0, z - 0.8 * s], 0.006 * s, '#3a3f46');
  k.reserve(x, z, 0.5 * s, 0.5 * s);
}

const BOX_COLORS = ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7', '#7a4a8c', '#e86a2c', '#4a5568', '#2fa3b5'];

/** A block of stacked containers (w × d slots of 0.2 × 0.1). */
export function containerStack(k: PortKit, x: number, z: number, nx: number, nz: number, tiers: number, rng: Rng, y = LAND_Y): void {
  const p = k.solid;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const t = Math.max(1, tiers - (rng.chance(0.3) ? 1 : 0) - (i === 0 || j === 0 ? 0 : 0));
      const c = pick(rng, BOX_COLORS);
      for (let h = 0; h < t; h++) p.box(x + i * 0.215, y + h * 0.105, z - j * 0.115, 0.205, 0.1, 0.105, h ? tint(c, (h % 2) * 0.06 - 0.03) : c, { ao: 0.2 });
    }
  }
  k.reserve(x + (nx * 0.215) / 2 - 0.1, z - (nz * 0.115) / 2 + 0.05, (nx * 0.215) / 2 + 0.05, (nz * 0.115) / 2 + 0.05);
}

// ───────────────────────────── boats ─────────────────────────────

/** A small boat afloat at the waterline (hull bottom below y = 0). */
export function boat(k: PortKit, x: number, z: number, kind: 'fishing' | 'sail' | 'luzzu' | 'ferry', rng: Rng, ry = 0, color: Col = '#c8302a'): void {
  const p = k.solid;
  p.at(x, 0, z, ry, 1, () => {
    switch (kind) {
      case 'fishing': {
        p.box(0, -0.06, 0, 0.62, 0.13, 0.2, color, { ao: 0.1 });
        p.prism(0.34, -0.06, 0, 0.2, 0.13, 0.19, color, { ry: -Math.PI / 2 * 0 });
        p.box(0, 0.07, 0, 0.6, 0.012, 0.19, '#d9d4c7', { ao: 0 });
        p.box(-0.1, 0.07, 0, 0.18, 0.15, 0.15, '#f4f0e6');
        p.box(-0.1, 0.22, 0, 0.2, 0.012, 0.17, '#b8432f');
        p.cyl(0.08, 0.07, 0, 0.008, 0.008, 0.3, '#5b4636', { seg: 4 });
        break;
      }
      case 'luzzu': {
        // the Maltese fishing boat: high prow, bright stripes, an eye on the bow
        p.box(0, -0.05, 0, 0.46, 0.1, 0.16, color, { ao: 0.1 });
        p.box(0, 0.045, 0, 0.47, 0.03, 0.17, '#f5c518', { ao: 0 });
        p.box(0.27, -0.01, 0, 0.13, 0.17, 0.12, color, { rz: -0.4, ao: 0.1 });
        p.box(-0.27, -0.03, 0, 0.1, 0.1, 0.12, color, { rz: 0.3, ao: 0.1 });
        p.box(0, 0.075, 0, 0.45, 0.015, 0.16, '#eadfc6', { ao: 0 });
        p.box(0.26, 0.0, 0.065, 0.035, 0.035, 0.005, '#f6f3ea', { ao: 0 });
        p.box(-0.05, 0.075, 0, 0.12, 0.1, 0.1, '#f4f0e6');
        p.box(-0.05, 0.175, 0, 0.14, 0.01, 0.12, '#2c5da8');
        break;
      }
      case 'sail': {
        p.box(0, -0.04, 0, 0.5, 0.09, 0.15, '#f4f0e6', { ao: 0.1 });
        p.prism(0.28, -0.04, 0, 0.15, 0.09, 0.14, '#f4f0e6', { ry: 0 });
        p.box(0, 0.05, 0, 0.5, 0.012, 0.15, '#b98a5a', { ao: 0 });
        p.cyl(0.05, 0.05, 0, 0.008, 0.008, 0.75, '#c9c5ba', { seg: 4 });
        p.tri([0.04, 0.12, 0], [0.04, 0.78, 0], [-0.3, 0.12, 0], '#f6f3ea', true);
        p.tri([0.07, 0.12, 0], [0.07, 0.7, 0], [0.34, 0.12, 0], color, true);
        break;
      }
      case 'ferry': {
        p.box(0, -0.08, 0, 1.4, 0.2, 0.32, '#1f2e4d', { ao: 0.1 });
        p.box(0, 0.12, 0, 1.3, 0.14, 0.3, '#f4f0e6');
        p.box(0.1, 0.26, 0, 0.9, 0.12, 0.28, '#f4f0e6');
        p.box(0.1, 0.38, 0, 0.5, 0.08, 0.25, '#e9e6dd');
        p.box(-0.45, 0.38, 0, 0.15, 0.2, 0.12, color);
        for (let i = 0; i < 9; i++) p.box(-0.5 + i * 0.13, 0.15, 0.151, 0.07, 0.05, 0.005, '#2a3a4c', { ao: 0 });
        break;
      }
    }
  });
  void rng;
}

/** Boats moored along the far quay: a handful, spaced, clear of the carved channels. */
export function harbourBoats(k: PortKit, rng: Rng, kinds: Array<'fishing' | 'sail' | 'luzzu'>, n: number, colors: Col[], z = SHORE_Z + 0.65): void {
  const cx = k.vx(z);
  for (let i = 0, placed = 0; i < 40 && placed < n; i++) {
    const x = cx + rng.range(-9, 9);
    if (k.ground(x, z) > -0.15 || k.ground(x + 0.5, z) > -0.15 || k.ground(x - 0.5, z) > -0.15) continue;
    if (k.isReserved(x, z, 0.5)) continue;
    boat(k, x, z + rng.range(-0.12, 0.12), pick(rng, kinds), rng, rng.range(-0.08, 0.08) + (rng.chance(0.5) ? 0 : Math.PI), pick(rng, colors));
    k.reserve(x, z, 0.5, 0.3);
    placed++;
  }
}

export function clampY(v: number): number {
  return clamp(v, 0, 99);
}

export { SHORE_Z };
