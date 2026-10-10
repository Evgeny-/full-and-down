import * as THREE from 'three';
import { SHORE_Z, LAND_Y, MOLE_Z, lerp, smooth, type PortKit, type Part, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { tint } from '../town';
import { tower, battlement, roundTower, gothicTower } from '../structures';
import { lighthouse } from '../harbour';
import { gantryCrane, containerStack, stack, turbine } from '../props';
import { Rng } from '../../../core/rng';

/** France: Marseille, Le Havre, Rouen, Nantes, Bordeaux, Strasbourg, Calais, Dunkirk, Cherbourg, Brest, Montoir. */

// ───────────────────────────── helpers ─────────────────────────────

const PI = Math.PI;

/** Dark window quads in a grid on the +z face; (x, y) is the bottom centre of the wall area, z the face. */
function winsZ(p: Part, x: number, y: number, z: number, w: number, h: number, cols: number, rows: number, color: Col, fw = 0.5, fh = 0.55): void {
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x - w / 2 + cw * (c + 0.5);
      const y0 = y + rh * r + (rh * (1 - fh)) / 2;
      const hw = (cw * fw) / 2;
      const hh = rh * fh;
      p.quad([cx - hw, y0, z], [cx + hw, y0, z], [cx + hw, y0 + hh, z], [cx - hw, y0 + hh, z], color);
    }
  }
}

/** The same on the +x face; z is the centre of the face, d its depth. */
function winsX(p: Part, x: number, y: number, z: number, d: number, h: number, cols: number, rows: number, color: Col, fw = 0.5, fh = 0.55): void {
  const cw = d / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cz = z + d / 2 - cw * (c + 0.5);
      const y0 = y + rh * r + (rh * (1 - fh)) / 2;
      const hw = (cw * fw) / 2;
      const hh = rh * fh;
      p.quad([x, y0, cz + hw], [x, y0, cz - hw], [x, y0 + hh, cz - hw], [x, y0 + hh, cz + hw], color);
    }
  }
}

/** Outline of an arched opening (round or pointed), x centred, y up from 0; for `extrude`. */
function archPts(w: number, h: number, pointed = false, m = 5): [number, number][] {
  const r = w / 2;
  const pts: [number, number][] = [];
  if (pointed) {
    const sy = h - 0.866 * w;
    pts.push([-r, 0], [r, 0], [r, sy]);
    for (let i = 1; i <= m; i++) {
      const t = (i / m) * (PI / 3);
      pts.push([-r + w * Math.cos(t), sy + w * Math.sin(t)]);
    }
    for (let i = 1; i < m; i++) {
      const t = (2 * PI) / 3 + (i / m) * (PI / 3);
      pts.push([r + w * Math.cos(t), sy + w * Math.sin(t)]);
    }
    pts.push([-r, sy]);
  } else {
    const sy = Math.max(0.0, h - r);
    pts.push([-r, 0], [r, 0], [r, sy]);
    for (let i = 1; i < m * 2; i++) {
      const a = (i / (m * 2)) * PI;
      pts.push([r * Math.cos(a), sy + r * Math.sin(a)]);
    }
    pts.push([-r, sy]);
  }
  return pts;
}

/** A convex polygon in the plane of a +z wall: (u, v) = right, up from (x, y). */
function polyZ(p: Part, x: number, y: number, z: number, pts: [number, number][], color: Col): void {
  for (let i = 1; i < pts.length - 1; i++) p.tri([x + pts[0][0], y + pts[0][1], z], [x + pts[i][0], y + pts[i][1], z], [x + pts[i + 1][0], y + pts[i + 1][1], z], color);
}

/** The same on a +x wall (u runs toward -z). */
function polyX(p: Part, x: number, y: number, z: number, pts: [number, number][], color: Col): void {
  for (let i = 1; i < pts.length - 1; i++) p.tri([x, y + pts[0][1], z - pts[0][0]], [x, y + pts[i][1], z - pts[i][0]], [x, y + pts[i + 1][1], z - pts[i + 1][0]], color);
}

/** A cheap (3 to 4 triangles) arched or pointed opening. */
function archLo(w: number, h: number, pointed: boolean): [number, number][] {
  const r = w / 2;
  if (pointed) {
    const sy = Math.max(0.01, h - w * 0.8);
    return [[-r, 0], [r, 0], [r, sy], [0, h], [-r, sy]];
  }
  const sy = Math.max(0.01, h - r * 0.9);
  return [[-r, 0], [r, 0], [r, sy], [r * 0.55, sy + r * 0.85], [-r * 0.55, sy + r * 0.85], [-r, sy]];
}

/** A dark arched window / portal sitting on the +z face at z (smooth when big, cheap when small). */
function archZ(p: Part, x: number, y: number, z: number, w: number, h: number, color: Col, pointed = false): void {
  if (w >= 0.3) p.extrude(archPts(w, h, pointed), 0.012, x, y, z + 0.004, color, { ao: 0 });
  else polyZ(p, x, y, z + 0.005, archLo(w, h, pointed), color);
}

/** The same on the +x face, z is its centre. */
function archX(p: Part, x: number, y: number, z: number, w: number, h: number, color: Col, pointed = false): void {
  if (w >= 0.3) p.extrude(archPts(w, h, pointed), 0.012, x + 0.004, y, z, color, { ao: 0, ry: PI / 2 });
  else polyX(p, x + 0.005, y, z, archLo(w, h, pointed), color);
}

/** A flat disc facing +z (rose windows, clock faces): a triangle fan. */
function disc(p: Part, x: number, y: number, z: number, r: number, color: Col, seg = 14): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * PI * 2;
    const a1 = ((i + 1) / seg) * PI * 2;
    p.tri([x, y, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], color);
  }
}

/** A flat disc facing +x. */
function discX(p: Part, x: number, y: number, z: number, r: number, color: Col, seg = 14): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * PI * 2;
    const a1 = ((i + 1) / seg) * PI * 2;
    p.tri([x, y, z], [x, y + Math.sin(a0) * r, z - Math.cos(a0) * r], [x, y + Math.sin(a1) * r, z - Math.cos(a1) * r], color);
  }
}

/** A square frustum (tapering block) from (x, y, z). */
function frustum(p: Part, x: number, y: number, z: number, w0: number, d0: number, w1: number, d1: number, h: number, color: Col): void {
  const v: V3[] = [
    [x - w0 / 2, y, z - d0 / 2], [x + w0 / 2, y, z - d0 / 2], [x + w0 / 2, y, z + d0 / 2], [x - w0 / 2, y, z + d0 / 2],
    [x - w1 / 2, y + h, z - d1 / 2], [x + w1 / 2, y + h, z - d1 / 2], [x + w1 / 2, y + h, z + d1 / 2], [x - w1 / 2, y + h, z + d1 / 2],
  ];
  p.solid(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], color);
}

/** Stacked horizontal stripes of alternating colours (a striped wall block). */
function stripes(p: Part, x: number, y: number, z: number, w: number, h: number, d: number, n: number, a: Col, b: Col): void {
  const sh = h / n;
  for (let i = 0; i < n; i++) p.box(x, y + i * sh, z, w, sh + (i === n - 1 ? 0 : 0.002), d, i % 2 ? b : a);
}

/** A pinnacle: a slim shaft with a pointed cap. */
function pinnacle(p: Part, x: number, y: number, z: number, w: number, h: number, stone: Col, cap: Col): void {
  p.box(x, y, z, w, h * 0.62, w, stone);
  p.pyramid(x, y + h * 0.62, z, w * 1.15, h * 0.38, w * 1.15, cap);
}

/**
 * An octagonal spire (flat face to the camera) with dark lancet openings on the visible faces and light ribs
 * on the eight arrises: the open lacework of Rouen and Strasbourg.
 */
function lacework(p: Part, x: number, y: number, z: number, r0: number, r1: number, h: number, color: Col, hole: Col, rib: Col | null, bands: number, open = 0.62): void {
  p.cyl(x, y, z, r0, r1, h, color, { seg: 8, ry: PI / 8, ao: 0.08 });
  const cos = Math.cos(PI / 8);
  for (let b = 0; b < bands; b++) {
    const t0 = (b + 0.18) / bands;
    const t1 = (b + 0.86) / bands;
    const rr0 = lerp(r0, r1, t0) * cos;
    const rr1 = lerp(r0, r1, t1) * cos;
    const fw0 = rr0 * 0.765 * open;
    const fw1 = rr1 * 0.765 * open * 0.28;
    for (const a of [-PI / 4, 0, PI / 4, PI / 2]) {
      const nx = Math.sin(a);
      const nz = Math.cos(a);
      const rx = Math.cos(a);
      const rz = -Math.sin(a);
      const o = 0.006;
      const c0: V3 = [x + nx * (rr0 + o), y + h * t0, z + nz * (rr0 + o)];
      const c1: V3 = [x + nx * (rr1 + o), y + h * t1, z + nz * (rr1 + o)];
      p.quad([c0[0] - rx * fw0, c0[1], c0[2] - rz * fw0], [c0[0] + rx * fw0, c0[1], c0[2] + rz * fw0], [c1[0] + rx * fw1, c1[1], c1[2] + rz * fw1], [c1[0] - rx * fw1, c1[1], c1[2] - rz * fw1], hole);
    }
  }
  if (rib) {
    for (let i = 0; i < 8; i++) {
      const a = PI / 8 + (i * PI) / 4;
      p.rod([x + Math.sin(a) * r0, y, z + Math.cos(a) * r0], [x + Math.sin(a) * r1, y + h, z + Math.cos(a) * r1], 0.016, rib, 4);
    }
  }
}

/** A tube through points (trunks, pipes): rods with a ball at each joint. */
function tube(p: Part, pts: V3[], r0: number, r1: number, color: Col, seg = 7): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = lerp(r0, r1, i / n);
    const rb = lerp(r0, r1, (i + 1) / n);
    p.rod(pts[i], pts[i + 1], (ra + rb) / 2, color, seg);
    p.ball(pts[i][0], pts[i][1], pts[i][2], ra * 1.02, color);
  }
  p.ball(pts[n][0], pts[n][1], pts[n][2], r1 * 1.02, color);
}

const LIME = new THREE.Color('#dcd4be');
const SAND = new THREE.Color('#e5d8ae');
const BANK = new THREE.Color('#a39a78');
const GRASS = new THREE.Color('#93ad6c');

/** A river channel with gentle banks (`bank` wide) from the shore back to `zBack`, its banks painted as mud and grass. */
function carve(k: PortKit, rx: number, half: number, zBack = -30, bank = 2.2): void {
  k.feature((x, z, h) => {
    if (z > SHORE_Z + 1 || z < zBack) return h;
    const t = smooth(half + bank, half, Math.abs(x - rx)) * smooth(zBack, zBack + 6, z);
    return lerp(h, Math.min(h, -0.35), t);
  });
  k.paint((x, y, z, _slope, c) => {
    if (z > SHORE_Z + 1.2 || z < zBack - 2) return;
    const d = Math.abs(x - rx);
    if (d > half + bank + 0.4) return;
    const t = smooth(half + bank + 0.4, half + 0.3, d) * (1 - smooth(0.0, 0.5, y));
    c.lerp(BANK, t * 0.85);
  });
}

/** A half-timbered house: cream plaster, dark beams, jettied upper floors, steep roof. `front` turns the gable to the street. */
function timbered(k: PortKit, x: number, z: number, w: number, d: number, floors: number, wall: Col, roof: Col, o: { beam?: Col; front?: boolean; fh?: number; y?: number; win?: Col } = {}): void {
  const p = k.solid;
  const beam = o.beam ?? '#4d3b30';
  const win = o.win ?? '#3a4654';
  const fh = o.fh ?? 0.2;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  let top = y;
  for (let f = 0; f < floors; f++) {
    const j = f * 0.035;
    const ww = w + j * 2;
    const dd = d + j * 2;
    const lift = f === 0 ? 0.25 : 0;
    p.box(x, top - lift, z, ww, fh + lift, dd, wall);
    const zf = z + dd / 2 + 0.005;
    const xf = x + ww / 2 + 0.005;
    const xl = x - ww / 2 - 0.006;
    const xr = x + ww / 2 + 0.006;
    // front (+z): sill and head beams, posts, braces, windows
    p.quad([xl, top, zf], [xr, top, zf], [xr, top + 0.03, zf], [xl, top + 0.03, zf], beam);
    const n = Math.max(2, Math.round(ww / 0.13));
    for (let i = 0; i <= n; i++) {
      const px = x - ww / 2 + (ww * i) / n;
      p.quad([px - 0.011, top, zf], [px + 0.011, top, zf], [px + 0.011, top + fh, zf], [px - 0.011, top + fh, zf], beam);
    }
    for (let i = 0; i < n; i++) {
      const a = x - ww / 2 + (ww * i) / n;
      const b = x - ww / 2 + (ww * (i + 1)) / n;
      if ((i + f) % 2 === 0) {
        const up = (i >> 1) % 2 === 0;
        const [xa, xb] = up ? [a, b] : [b, a];
        p.quad([xa - 0.01, top + 0.03, zf], [xa + 0.01, top + 0.03, zf], [xb + 0.01, top + fh, zf], [xb - 0.01, top + fh, zf], beam);
      } else {
        const m = (a + b) / 2;
        p.quad([m - 0.021, top + 0.07, zf], [m + 0.021, top + 0.07, zf], [m + 0.021, top + 0.15, zf], [m - 0.021, top + 0.15, zf], win);
      }
    }
    // right (+x): sill and posts
    p.quad([xf, top, z + dd / 2 + 0.006], [xf, top, z - dd / 2 - 0.006], [xf, top + 0.03, z - dd / 2 - 0.006], [xf, top + 0.03, z + dd / 2 + 0.006], beam);
    const m = Math.max(2, Math.round(dd / 0.15));
    for (let i = 0; i <= m; i++) {
      const pz = z + dd / 2 - (dd * i) / m;
      p.quad([xf, top, pz + 0.011], [xf, top, pz - 0.011], [xf, top + fh, pz - 0.011], [xf, top + fh, pz + 0.011], beam);
    }
    top += fh;
  }
  const hw = (w + floors * 0.07) / 2;
  const hd = (d + floors * 0.07) / 2;
  if (o.front) {
    const rr = hw * 1.5;
    p.prism(x, top, z, hw * 2 + 0.06, rr, hd * 2 + 0.05, roof);
    const zg = z + hd + 0.0285;
    p.tri([x - hw, top, zg], [x + hw, top, zg], [x, top + rr, zg], wall);
    p.quad([x - hw, top, zg + 0.003], [x + hw, top, zg + 0.003], [x + hw, top + 0.03, zg + 0.003], [x - hw, top + 0.03, zg + 0.003], beam);
    p.quad([x - 0.011, top, zg + 0.003], [x + 0.011, top, zg + 0.003], [x + 0.011, top + rr * 0.95, zg + 0.003], [x - 0.011, top + rr * 0.95, zg + 0.003], beam);
    p.quad([x - hw * 0.5 - 0.01, top + 0.03, zg + 0.003], [x - hw * 0.5 + 0.01, top + 0.03, zg + 0.003], [x + 0.01, top + rr * 0.5, zg + 0.003], [x - 0.01, top + rr * 0.5, zg + 0.003], beam);
    p.quad([x + hw * 0.5 - 0.01, top + 0.03, zg + 0.003], [x + hw * 0.5 + 0.01, top + 0.03, zg + 0.003], [x + 0.01, top + rr * 0.5, zg + 0.003], [x - 0.01, top + rr * 0.5, zg + 0.003], beam);
  } else {
    const rr = hd * 1.25;
    p.prism(x, top, z, hd * 2 + 0.08, rr, hw * 2 + 0.06, roof, { ry: PI / 2 });
    p.tri([x + hw + 0.032, top, z + hd + 0.04], [x + hw + 0.032, top, z - hd - 0.04], [x + hw + 0.032, top + rr, z], wall);
  }
  k.reserve(x, z, w / 2 + 0.04, d / 2 + 0.04);
}

/** A hammerhead dockyard crane: a tall tower with a horizontal jib and a counterweight. */
function hammerCrane(k: PortKit, x: number, z: number, h: number, color: Col, y = LAND_Y): void {
  const p = k.solid;
  const w = 0.2;
  p.box(x, y - 0.1, z, w * 2.2, 0.16, w * 2.2, '#5a6068');
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + dx * w * 0.5, y, z + dz * w * 0.5, 0.045, h, 0.045, color);
  for (let i = 1; i < 8; i++) p.box(x, y + (h * i) / 8, z, w + 0.045, 0.025, w + 0.045, color, { ao: 0 });
  p.box(x, y + h, z, w + 0.2, 0.2, w + 0.2, '#e9e4d4');
  p.box(x, y + h + 0.2, z, 0.14, 0.28, 0.14, color);
  // jib toward the water (+z) and the counter jib with its weight
  p.box(x, y + h + 0.05, z + 0.55, 0.1, 0.1, 1.5, color, { ao: 0 });
  p.box(x, y + h + 0.05, z - 0.55, 0.1, 0.1, 0.8, color, { ao: 0 });
  p.box(x, y + h - 0.02, z - 0.95, 0.2, 0.2, 0.3, '#4a5058');
  p.rod([x, y + h + 0.48, z], [x, y + h + 0.1, z + 1.25], 0.01, '#3a3f46', 4);
  p.rod([x, y + h + 0.48, z], [x, y + h + 0.1, z - 0.9], 0.01, '#3a3f46', 4);
  p.rod([x, y + h + 0.05, z + 1.1], [x, y + h - 0.45, z + 1.1], 0.008, '#3a3f46', 4);
  p.box(x, y + h - 0.55, z + 1.05, 0.07, 0.1, 0.07, '#c8302a');
  k.reserve(x, z, 0.4, 0.4);
}

// ───────────────────────────── Marseille ─────────────────────────────

const MS_Z = -14.6;
const marseille: Landmark = {
  terrain(k) {
    const hx = k.vx(MS_Z, 0.5);
    const top = k.baseHeight(hx, MS_Z) + 2.0;
    k.bump(hx, MS_Z, 3.3, 2.7, 2.2, 1.2);
    k.plateau(hx, MS_Z, 1.7, 1.2, top, 0.5);
    k.paint((x, y, z, slope, c) => {
      const dd = Math.hypot((x - hx) / 3.3, (z - MS_Z) / 2.7);
      if (dd > 0.85) return;
      // pale limestone cliffs on the hill, greying out on the steep facets, scrub lower down
      const t = smooth(0.85, 0.3, dd) * (0.4 + 0.5 * smooth(0.05, 0.3, slope));
      c.lerp(LIME, t);
      if (y > top - 0.25) c.lerp(SAND, 0.35);
    });
  },
  build(k) {
    const hx = k.vx(MS_Z, 0.5);
    const hz = MS_Z;
    const y0 = k.groundMax(hx, hz, 1.3, 0.95);
    const cream = '#ece4cf';
    const green = '#5f8160';
    const stone = '#d9d0b8';
    k.at(hx, y0, hz, 0, 1, () => {
      const p = k.solid;
      // terrace and the lower church: a fortress-like podium of pale limestone with round arched windows
      p.box(0, -1.1, 0, 2.7, 1.1, 1.8, '#cdc4ab');
      p.box(0, -0.06, 0, 2.78, 0.06, 1.88, '#e3dcc8');
      p.box(0, 0, 0, 2.1, 0.5, 1.15, stone);
      p.box(0, 0.5, 0, 2.2, 0.05, 1.25, '#ebe4d0');
      for (let i = 0; i < 7; i++) archZ(p, -0.9 + i * 0.3, 0.1, 0.575, 0.15, 0.28, '#4a443c');
      for (let i = 0; i < 4; i++) archX(p, 1.05, 0.1, 0.36 - i * 0.24, 0.15, 0.28, '#4a443c');
      for (const sx of [-1, 1]) {
        p.cyl(sx * 1.08, -0.1, 0.58, 0.17, 0.17, 0.67, stone, { seg: 8 });
        p.cone(sx * 1.08, 0.57, 0.58, 0.2, 0.16, '#8a9a82', { seg: 8 });
      }
      // the upper church: cream and green stripes under a low green roof
      stripes(p, -0.1, 0.55, -0.12, 1.8, 0.78, 0.8, 8, cream, green);
      p.prism(-0.1, 1.33, -0.12, 0.92, 0.26, 1.86, '#6d8f78', { ry: PI / 2 });
      p.tri([0.8, 1.33, 0.28], [0.8, 1.33, -0.52], [0.8, 1.59, -0.12], cream);
      for (let i = 0; i < 5; i++) archZ(p, -0.78 + i * 0.3, 0.7, 0.285, 0.1, 0.3, '#4a5560');
      for (let i = 0; i < 2; i++) archX(p, 0.805, 0.7, -0.05 - i * 0.28, 0.1, 0.3, '#4a5560');
      // the dome of the crossing, behind-left
      p.cyl(-0.55, 1.33, -0.38, 0.3, 0.3, 0.2, cream, { seg: 10 });
      p.lathe(-0.55, 1.53, -0.38, [[0.31, 0], [0.31, 0.04], [0.24, 0.16], [0.12, 0.25], [0.0, 0.28]], '#6d8f78', { seg: 10 });
      // the bell tower: striped shaft, open belfry, a smaller lantern and the golden Madonna
      const tx = 0.25;
      const tz = 0.12;
      const tw = 0.66;
      stripes(p, tx, 0.55, tz, tw, 1.1, tw, 9, cream, green);
      const fz = tz + tw / 2;
      for (let i = 0; i < 3; i++) archZ(p, tx - 0.18 + i * 0.18, 0.72, fz, 0.1, 0.3, '#4a5560');
      archZ(p, tx, 1.18, fz, 0.13, 0.36, '#4a5560');
      archX(p, tx + tw / 2, 1.18, tz, 0.13, 0.36, '#4a5560');
      archX(p, tx + tw / 2, 0.72, tz, 0.1, 0.3, '#4a5560');
      p.box(tx, 1.65, tz, tw + 0.1, 0.07, tw + 0.1, '#efe9d8');
      // open belfry: dark core, four cream posts
      p.box(tx, 1.72, tz, 0.54, 0.42, 0.54, '#3d3a37');
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(tx + dx * 0.25, 1.72, tz + dz * 0.25, 0.09, 0.42, 0.09, cream);
      for (const dx of [-0.08, 0.08]) p.box(tx + dx, 1.72, tz + 0.274, 0.035, 0.42, 0.015, cream, { ao: 0 });
      for (const dz of [-0.08, 0.08]) p.box(tx + 0.274, 1.72, tz + dz, 0.015, 0.42, 0.035, cream, { ao: 0 });
      p.box(tx, 2.14, tz, 0.66, 0.06, 0.66, '#efe9d8');
      stripes(p, tx, 2.2, tz, 0.42, 0.36, 0.42, 4, cream, green);
      archZ(p, tx, 2.27, tz + 0.21, 0.1, 0.22, '#4a5560');
      archX(p, tx + 0.21, 2.27, tz, 0.1, 0.22, '#4a5560');
      p.box(tx, 2.56, tz, 0.52, 0.05, 0.52, '#efe9d8');
      frustum(p, tx, 2.61, tz, 0.4, 0.4, 0.2, 0.2, 0.3, cream);
      p.cyl(tx, 2.91, tz, 0.075, 0.07, 0.16, '#efe9d8', { seg: 8 });
      // the golden Madonna (unlit so that she shines)
      const g = k.glow;
      const gold = '#f0b830';
      g.cone(tx, 3.07, tz, 0.11, 0.34, gold, { seg: 7 });
      g.ball(tx, 3.46, tz, 0.056, gold);
      g.ball(tx + 0.075, 3.25, tz + 0.06, 0.04, '#ffd35a');
      g.box(tx - 0.19, 3.15, tz, 0.38, 0.03, 0.02, gold, { rz: 0.35, ao: 0 });
    });
    k.reserve(hx, hz, 1.6, 1.2);

    // Fort Saint-Jean at the water: honey-coloured walls, the square Tour du Roi René and the round Tour du Fanal
    const fx = k.vx(-13.2, -4.6);
    const fz = -13.2;
    const fy = k.groundMax(fx, fz, 1.2, 0.4);
    const honey = '#dcc99a';
    battlement(k, fx, fz, 2.3, 0.7, 0.55, honey, fy);
    battlement(k, fx - 0.9, fz - 0.55, 0.7, 0.7, 0.7, tint(honey, -0.04), fy);
    k.solid.box(fx - 0.5, fy - 0.15, fz - 0.05, 0.62, 1.3 + 0.15, 0.62, tint(honey, 0.04));
    k.solid.box(fx - 0.5, fy + 1.15, fz - 0.05, 0.72, 0.08, 0.72, tint(honey, -0.08));
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) k.solid.box(fx - 0.5 + dx * 0.3, fy + 1.23, fz - 0.05 + dz * 0.3, 0.12, 0.12, 0.12, tint(honey, 0.06), { ao: 0 });
    archZ(k.solid, fx - 0.5, fy + 0.55, fz + 0.265, 0.12, 0.28, '#5a5042');
    archX(k.solid, fx - 0.19, fy + 0.55, fz - 0.05, 0.12, 0.28, '#5a5042');
    for (let i = 0; i < 4; i++) archZ(k.solid, fx + 0.1 + i * 0.28, fy + 0.12, fz + 0.355, 0.07, 0.2, '#5a5042');
    roundTower(k, fx + 1.2, fz + 0.1, 0.27, 1.0, tint(honey, 0.03), null, fy - 0.03);
    k.reserve(fx, fz, 1.4, 0.6);
    // a cube museum with a dark lattice skin at the water's edge
    const mx = fx + 3.0;
    const mz = -12.7;
    const my = k.groundMax(mx, mz, 0.5, 0.5);
    k.glass.box(mx, my - 0.1, mz, 0.95, 0.95 + 0.1, 0.95, '#6f8a8c', { ao: 0.1 });
    const lat = '#2c3a3f';
    const n = 9;
    const s = 0.95 / n;
    for (let i = 0; i <= n; i++) {
      k.solid.box(mx - 0.475 + i * s, my, mz + 0.475 + 0.004, 0.026, 0.93, 0.014, lat, { ao: 0 });
      k.solid.box(mx + 0.475 + 0.004, my, mz - 0.475 + i * s, 0.014, 0.93, 0.026, lat, { ao: 0 });
      if (i < n) {
        k.solid.box(mx, my + i * s, mz + 0.475 + 0.004, 0.95, 0.026, 0.014, lat, { ao: 0 });
        k.solid.box(mx + 0.475 + 0.004, my + i * s, mz, 0.014, 0.026, 0.95, lat, { ao: 0 });
      }
    }
    k.solid.box(mx, my + 0.93, mz, 1.0, 0.05, 1.0, '#454f52');
    k.reserve(mx, mz, 0.7, 0.7);
  },
  mole: { dir: -1, endX: 1.4 },
  rows: 4,
  quiet: true,
  flag: { dx: 5.6, z: -13.2 },
};

// ───────────────────────────── Le Havre ─────────────────────────────

const lehavre: Landmark = {
  terrain(k) {
    k.shape.relief = 0.6;
    k.plateau(k.vx(-14.2, 0.4), -14.2, 3.2, 1.8, LAND_Y + 0.1, 0.4);
  },
  build(k) {
    const lx = k.vx(-14.2, 0.4);
    const lz = -14.2;
    const y0 = k.groundMax(lx, lz, 0.9, 0.8);
    const conc = '#aeaea8';
    const concL = '#c9c9c2';
    const slit = '#46566a';
    // Saint-Joseph's church by Perret: a cross of low concrete wings round a very tall square lantern tower
    k.at(lx, y0, lz, 0, 1, () => {
      const p = k.solid;
      p.box(0, -0.3, 0, 2.0, 0.3 + 0.55, 0.86, conc);
      p.box(0, -0.3, 0, 0.86, 0.3 + 0.55, 1.7, conc);
      p.box(0, 0.55, 0, 2.06, 0.04, 0.92, concL, { ao: 0 });
      p.box(0, 0.55, 0, 0.92, 0.04, 1.76, concL, { ao: 0 });
      winsZ(p, -0.7, 0.1, 0.43 + 0.006, 0.5, 0.36, 4, 1, slit, 0.5, 0.9);
      winsZ(p, 0.7, 0.1, 0.43 + 0.006, 0.5, 0.36, 4, 1, slit, 0.5, 0.9);
      winsX(p, 1.0 + 0.006, 0.1, 0, 0.86, 0.36, 7, 1, slit, 0.5, 0.9);
      // the tower: a tapering square shaft with dense vertical slits and pale corner fins
      const bw = 0.98;
      frustum(p, 0, 0.55, 0, bw, bw, 0.84, 0.84, 2.7, conc);
      winsZ(p, 0, 0.75, bw / 2 - 0.044 + 0.008, 0.62, 2.35, 7, 8, slit, 0.46, 0.72);
      winsX(p, bw / 2 - 0.044 + 0.008, 0.75, 0, 0.62, 2.35, 7, 8, slit, 0.46, 0.72);
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]] as const) p.box(dx * 0.43, 0.55, dz * 0.43, 0.12, 2.72, 0.12, concL, { rx: 0, ao: 0.05 });
      p.box(0, 3.22, 0, 0.98, 0.07, 0.98, concL);
      // the lantern: three drums of coloured glass (blue, aqua, amber) between pale ribs
      const gl = k.glass;
      gl.cyl(0, 3.29, 0, 0.5, 0.48, 0.5, '#4f66b8', { seg: 8, ry: PI / 8, ao: 0 });
      gl.cyl(0, 3.79, 0, 0.48, 0.44, 0.46, '#5fa6d8', { seg: 8, ry: PI / 8, ao: 0 });
      gl.cyl(0, 4.25, 0, 0.44, 0.38, 0.42, '#e8b455', { seg: 8, ry: PI / 8, ao: 0 });
      for (let i = 0; i < 8; i++) {
        const a = PI / 8 + (i * PI) / 4;
        p.rod([Math.sin(a) * 0.52, 3.29, Math.cos(a) * 0.52], [Math.sin(a) * 0.4, 4.67, Math.cos(a) * 0.4], 0.022, concL, 4);
      }
      p.cyl(0, 3.76, 0, 0.51, 0.51, 0.04, concL, { seg: 8, ry: PI / 8, ao: 0 });
      p.cyl(0, 4.22, 0, 0.47, 0.47, 0.04, concL, { seg: 8, ry: PI / 8, ao: 0 });
      p.cyl(0, 4.67, 0, 0.44, 0.44, 0.06, concL, { seg: 8, ry: PI / 8 });
      p.cone(0, 4.73, 0, 0.36, 0.2, conc, { seg: 8, ry: PI / 8 });
      p.cyl(0, 4.9, 0, 0.012, 0.01, 0.4, '#7c8288', { seg: 4, ao: 0 });
    });
    k.reserve(lx, lz, 1.1, 0.95);

    // Niemeyer's Volcano: two white bowls of concrete on a shared plaza
    const vx = lx - 3.3;
    const vz = -13.4;
    const vy = k.groundMax(vx, vz, 1.0, 1.0);
    k.at(vx, vy, vz, 0, 1, () => {
      const p = k.solid;
      p.cyl(0, -0.3, 0, 1.15, 1.15, 0.3 + 0.08, '#cfcfc8', { seg: 14 });
      p.lathe(0, 0.08, 0, [[0, 0], [0.98, 0], [0.98, 0.5], [0.9, 0.78], [0.55, 0.62], [0.0, 0.5]], '#f2f0ea', { seg: 14 });
      p.box(0, 0.12, 0.93, 0.5, 0.18, 0.06, '#33495c', { ao: 0 });
      p.cyl(1.55, -0.3, 0.25, 0.7, 0.7, 0.3 + 0.08, '#cfcfc8', { seg: 12 });
      p.lathe(1.55, 0.08, 0.25, [[0, 0], [0.6, 0], [0.6, 0.42], [0.54, 0.6], [0.3, 0.46], [0.0, 0.4]], '#f6f4ee', { seg: 12 });
      p.box(1.55, 0.1, 0.25 + 0.58, 0.3, 0.14, 0.05, '#33495c', { ao: 0 });
    });
    k.reserve(vx + 0.8, vz, 2.0, 1.2);

    // Perret's concrete apartment blocks, uniform grids of windows
    tower(k, lx + 2.9, -14.6, 0.9, 0.5, 1.7, '#bdb8aa', { rows: 9, cols: 5, win: '#59687a', roof: 'flat' });
    tower(k, lx + 4.1, -15.4, 0.7, 0.5, 2.2, '#c4bfb2', { rows: 11, cols: 4, win: '#59687a', roof: 'flat' });
    tower(k, lx + 5.2, -14.0, 0.8, 0.42, 1.2, '#b4b0a3', { rows: 6, cols: 4, win: '#59687a', roof: 'flat' });
    tower(k, lx - 6.2, -15.0, 0.8, 0.5, 1.6, '#bdb8aa', { rows: 8, cols: 4, win: '#59687a', roof: 'flat' });
    // the container terminal
    gantryCrane(k, lx + 6.6, SHORE_Z - 0.5, { color: '#c9402e', s: 0.9, y: LAND_Y });
    gantryCrane(k, lx - 7.4, SHORE_Z - 0.5, { color: '#2c5da8', s: 0.9, y: LAND_Y });
    containerStack(k, lx + 3.9, -12.9, 6, 2, 3, new Rng(k.seed ^ 12345));
  },
  mole: { dir: -1, endX: 0.9 },
  rows: 3,
  quiet: true,
  flag: { dx: 2.1, z: -12.6 },
};

// ───────────────────────────── Rouen ─────────────────────────────

const RZ = -14.2;
const rouen: Landmark = {
  terrain(k) {
    k.plateau(k.vx(RZ, 0.3), RZ - 1.0, 2.9, 1.7, k.baseHeight(k.vx(RZ, 0.3), RZ - 0.5), 0.6);
  },
  build(k) {
    const cx = k.vx(RZ, 0.3);
    const S = 1.2;
    const y0 = k.groundMax(cx, RZ, 1.4, 0.6);
    const stone = '#dccfb0';
    const stoneL = '#eee5ca';
    const dark = '#3a342f';
    const slate = '#5c6873';
    k.at(cx, y0, RZ, 0, S, () => {
      const p = k.solid;
      // the gothic west front: two towers of unequal height round a gabled centre with three portals
      p.box(0, -0.3, 0, 2.4, 0.3 + 1.7, 0.9, stone);
      for (const sx of [-1, 1]) {
        const tx = sx * 0.88;
        const th = sx < 0 ? 2.45 : 2.75;
        p.box(tx, -0.3, 0, 0.64, 0.3 + th, 0.96, stone);
        p.box(tx, 1.2, 0, 0.7, 0.04, 1.0, stoneL, { ao: 0 });
        p.box(tx, 2.0, 0, 0.7, 0.04, 1.0, stoneL, { ao: 0 });
        archZ(p, tx, 0.05, 0.48, 0.3, 0.62, dark, true);
        archZ(p, tx, 0.78, 0.48, 0.13, 0.36, dark, true);
        archZ(p, tx, 1.5, 0.48, 0.14, 0.4, dark, true);
        archX(p, tx + 0.32, 0.78, 0, 0.13, 0.36, dark, true);
        archX(p, tx + 0.32, 1.5, 0, 0.14, 0.4, dark, true);
        archZ(p, tx - 0.11, 2.12, 0.48, 0.14, 0.42, dark, true);
        archZ(p, tx + 0.11, 2.12, 0.48, 0.14, 0.42, dark, true);
        archX(p, tx + 0.32, 2.12, 0.0, 0.16, 0.42, dark, true);
        p.box(tx, th, 0, 0.72, 0.05, 1.02, stoneL);
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pinnacle(p, tx + dx * 0.3, th + 0.04, dz * 0.45, 0.1, 0.34, stone, slate);
        if (sx < 0) p.pyramid(tx, th + 0.04, 0, 0.5, 0.55, 0.7, slate);
        else {
          p.cyl(tx, th + 0.04, 0, 0.25, 0.25, 0.3, stoneL, { seg: 8, ry: PI / 8 });
          p.lathe(tx, th + 0.34, 0, [[0.27, 0], [0.26, 0.05], [0.2, 0.2], [0.1, 0.34], [0.03, 0.46], [0.0, 0.5]], '#d5c48d', { seg: 8 });
          p.ball(tx, th + 0.86, 0, 0.03, '#e8b923');
        }
      }
      // buttresses with pinnacles
      for (const sx of [-1, 1]) {
        p.box(sx * 0.57, -0.3, 0.46, 0.1, 0.3 + 1.7, 0.08, stoneL, { ao: 0.05 });
        pinnacle(p, sx * 0.57, 1.7, 0.4, 0.1, 0.42, stoneL, stone);
      }
      // the central portal in its gabled frame, the rose window and the lace gable above
      archZ(p, 0, 0.0, 0.452, 0.74, 1.12, stoneL, true);
      archZ(p, 0, 0.0, 0.462, 0.5, 0.88, dark, true);
      p.tri([-0.4, 1.0, 0.462], [0.4, 1.0, 0.462], [0, 1.6, 0.462], stoneL);
      p.tri([-0.28, 1.04, 0.47], [0.28, 1.04, 0.47], [0, 1.46, 0.47], '#b8ac90');
      disc(p, 0, 1.26, 0.452, 0.27, stoneL, 16);
      disc(p, 0, 1.26, 0.462, 0.2, '#36445a', 16);
      for (let i = 0; i < 8; i++) p.box(0, 1.26, 0.476, 0.016, 0.2, 0.008, stoneL, { rz: (i * PI) / 4, ao: 0 });
      p.tri([-0.56, 1.7, 0.456], [0.56, 1.7, 0.456], [0, 2.4, 0.456], stone);
      p.tri([-0.4, 1.78, 0.464], [0.4, 1.78, 0.464], [0, 2.26, 0.464], stoneL);
      p.tri([-0.3, 1.8, 0.472], [0.3, 1.8, 0.472], [0, 2.14, 0.472], '#8b8372');
      for (let i = -2; i <= 2; i++) archZ(p, i * 0.17, 1.82, 0.476, 0.07, 0.2, dark, true);
      p.rod([0, 2.4, 0.45], [0, 2.6, 0.45], 0.012, '#e8b923', 4);
      // the nave behind, under a lead roof
      p.box(0, -0.3, -1.4, 1.6, 0.3 + 1.45, 1.9, stone);
      p.prism(0, 1.45, -1.4, 1.74, 0.6, 2.0, slate);
      // the crossing tower
      const sx0 = -0.654;
      const sz0 = -1.9;
      p.box(sx0, 1.4, sz0, 0.8, 0.9, 0.8, stone);
      p.box(sx0, 2.3, sz0, 0.9, 0.05, 0.9, stoneL);
      p.box(sx0, 2.35, sz0, 0.62, 0.55, 0.62, stone);
      archZ(p, sx0, 2.45, sz0 + 0.31, 0.14, 0.38, dark, true);
      archX(p, sx0 + 0.31, 2.45, sz0, 0.14, 0.38, dark, true);
      p.box(sx0, 2.9, sz0, 0.7, 0.05, 0.7, stoneL);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pinnacle(p, sx0 + dx * 0.3, 2.95, sz0 + dz * 0.3, 0.09, 0.55, stone, '#6e8a7c');
      // the cast-iron spire: dark grey-green lacework, very tall
      lacework(p, sx0, 2.95, sz0, 0.3, 0.012, 3.3, '#6c897b', '#2b3a35', '#9bb8a8', 6);
      p.ball(sx0, 6.3, sz0, 0.032, '#e8b923');
    });
    k.reserve(cx, RZ, 1.4 * S, 0.6 * S);
    k.reserve(cx - 0.65 * S, RZ - 1.9 * S, 0.6 * S, 0.6 * S);
    k.reserve(cx, RZ - 1.4 * S, 0.9 * S, 1.0 * S);

    // half-timbered houses of the old town: cream plaster, dark beams, gables to the street
    const walls = ['#eadfc4', '#e5cfae', '#efe6d0', '#dccdae', '#e9d6b8'];
    const roofs = ['#5c6068', '#6a4a40', '#575d66'];
    const rows: Array<[number, number, number, number, number]> = [
      [-4.4, -13.2, 0.55, 0.5, 3], [-3.75, -13.35, 0.5, 0.48, 4], [-3.15, -13.15, 0.5, 0.5, 3], [-5.4, -13.4, 0.55, 0.5, 3], [-3.4, -14.5, 0.5, 0.5, 3],
      [3.5, -13.2, 0.55, 0.5, 4], [4.2, -13.35, 0.5, 0.48, 3], [4.85, -13.15, 0.5, 0.5, 3], [5.5, -13.4, 0.52, 0.5, 4], [3.9, -14.5, 0.5, 0.5, 3],
    ];
    rows.forEach(([dx, z, w, d, fl], i) => {
      const hx = cx + dx + (k.vx(z) - k.vx(RZ)) * 0;
      timbered(k, hx, z, w, d, fl, walls[i % walls.length], roofs[i % roofs.length], { front: i % 3 !== 1 });
    });
  },
  mole: { dir: 1, endX: -4.25 },
  rows: 3,
  quiet: true,
  flag: { dx: -6.3, z: -12.7 },
};

// ───────────────────────────── Nantes ─────────────────────────────

const NZ = -13.4;
const nantes: Landmark = {
  terrain(k) {
    k.plateau(k.vx(NZ, 0.5), NZ, 2.6, 1.3, k.baseHeight(k.vx(NZ, 0.5), NZ), 0.6);
    k.plateau(k.vx(-14.4, -4.4), -14.4, 3.6, 1.8, k.baseHeight(k.vx(-14.4, -4.4), -14.4), 0.6);
  },
  build(k) {
    const ex = k.vx(NZ, 0.5);
    const ey = k.groundMax(ex, NZ, 1.3, 0.5);
    const wood = '#b57f4b';
    const woodL = '#c9985f';
    const woodD = '#8a5b34';
    const steel = '#8b949b';
    // the Great Elephant of the Machines de l'ile: poplar and steel, trunk raised, a platform on its back
    k.at(ex, ey - 0.02, NZ, 0, 0.95, () => {
      const p = k.solid;
      p.ball(0, 1.65, 0, 1, wood, { sx: 1.45, sy: 0.82, sz: 0.78, ao: 0.1 });
      p.ball(-0.3, 1.9, 0, 1, woodL, { sx: 1.05, sy: 0.6, sz: 0.74, ao: 0 });
      for (const [lx, lz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]] as const) {
        p.cyl(lx, 0.1, lz, 0.31, 0.27, 1.05, woodD, { seg: 8 });
        p.cyl(lx, 0.45, lz, 0.33, 0.33, 0.1, steel, { seg: 8, ao: 0 });
        p.cyl(lx, 0.0, lz, 0.34, 0.34, 0.14, '#6f787f', { seg: 8 });
      }
      p.ball(1.62, 2.05, 0, 1, wood, { sx: 0.62, sy: 0.7, sz: 0.55, ao: 0.05 });
      p.ball(1.5, 2.3, 0, 1, woodL, { sx: 0.4, sy: 0.35, sz: 0.5, ao: 0 });
      for (const sz of [-1, 1]) {
        p.ball(1.15, 2.2, sz * 0.62, 1, woodD, { sx: 0.5, sy: 0.62, sz: 0.09, ao: 0.05 });
        p.ball(1.15, 2.2, sz * 0.7, 1, '#cf9f68', { sx: 0.36, sy: 0.47, sz: 0.04, ao: 0 });
        p.ball(1.98, 2.3, sz * 0.46, 0.075, '#241b14');
        p.cone(1.9, 1.5, sz * 0.34, 0.085, 0.75, '#efe6d0', { seg: 6, rz: -1.15 });
        p.ball(0.95, 1.95, sz * 0.7, 1, steel, { sx: 0.34, sy: 0.3, sz: 0.06, ao: 0 });
        p.ball(-0.6, 1.75, sz * 0.74, 1, steel, { sx: 0.3, sy: 0.28, sz: 0.05, ao: 0 });
      }
      // the raised trunk
      tube(p, [[2.1, 1.85, 0], [2.5, 1.5, 0], [2.95, 1.45, 0], [3.3, 1.75, 0], [3.42, 2.3, 0], [3.3, 2.85, 0], [3.05, 3.2, 0]], 0.3, 0.12, woodD, 7);
      for (const [x, y] of [[2.95, 1.45], [3.42, 2.3]] as const) p.ball(x, y, 0, 0.19, steel, { sy: 0.4 });
      p.rod([-1.4, 2.05, 0], [-1.62, 1.2, 0], 0.045, woodD, 5);
      p.ball(-1.63, 1.12, 0, 0.09, '#5a3d22');
      // the passengers' platform with railings and a few visitors
      p.box(-0.35, 2.33, 0, 1.7, 0.08, 0.95, '#6f5036');
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(-0.35 + dx * 0.8, 2.41, dz * 0.44, 0.05, 0.42, 0.05, steel);
      p.box(-0.35, 2.78, 0.44, 1.7, 0.04, 0.04, steel, { ao: 0 });
      p.box(-0.35, 2.78, -0.44, 1.7, 0.04, 0.04, steel, { ao: 0 });
      p.box(-1.15, 2.78, 0, 0.04, 0.04, 0.92, steel, { ao: 0 });
      p.box(0.45, 2.78, 0, 0.04, 0.04, 0.92, steel, { ao: 0 });
      ['#c8302a', '#2c5da8', '#e8b923', '#3f8d6b', '#d9d4c7'].forEach((c, i) => {
        const fx = -0.95 + i * 0.32;
        const fz = i % 2 ? 0.14 : -0.12;
        p.box(fx, 2.41, fz, 0.13, 0.22, 0.1, c);
        p.ball(fx, 2.68, fz, 0.062, '#e0b48e');
      });
    });
    k.reserve(ex + 0.4, NZ, 2.6, 0.9);

    // the Tour de Bretagne: a very tall dark grey slab with ribbons of windows
    const bx = k.vx(-17.4, 6.0);
    tower(k, bx, -17.4, 0.85, 0.58, 5.2, '#575b61', { rows: 26, cols: 4, win: '#a5b4c0', roof: 'flat' });
    const by = k.groundMax(bx, -17.4, 0.42, 0.3);
    k.solid.box(bx, by + 5.2, -17.4, 0.78, 0.22, 0.52, '#3e4247');
    k.solid.box(bx + 0.1, by + 5.42, -17.4, 0.3, 0.14, 0.2, '#6a6e74');
    k.solid.box(bx - 0.62, by - 0.1, -17.2, 0.5, 0.5 + 0.1, 0.5, '#6d7076');

    // the Castle of the Dukes of Brittany: white walls, big round towers with dark bases and slate caps
    const cx = k.vx(-14.4, -4.4);
    const cz = -14.4;
    const CS = 1.3;
    const cy = k.groundMax(cx, cz, 1.8, 0.9);
    const white = '#f0ead9';
    const schist = '#8f8d85';
    const cap = '#565e68';
    k.at(cx, cy, cz, 0, CS, () => {
      const p = k.solid;
      p.box(0, -0.3, 0, 3.1, 0.3 + 0.2, 1.6, schist);
      battlement(k, 0, 0.62, 2.7, 0.2, 0.55, white, 0);
      battlement(k, 0, -0.62, 2.7, 0.2, 0.5, white, 0);
      battlement(k, -1.37, 0, 0.2, 1.3, 0.5, white, 0);
      battlement(k, 1.37, 0, 0.2, 1.3, 0.5, white, 0);
      archZ(p, 0, 0.0, 0.725, 0.28, 0.42, '#3a342f');
      // the Grand Logis behind the wall, with steep roof and dormers
      p.box(0.35, 0, -0.18, 1.7, 0.78, 0.55, white);
      p.prism(0.35, 0.78, -0.18, 0.62, 0.34, 1.76, cap, { ry: PI / 2 });
      winsZ(p, 0.35, 0.22, 0.11, 1.5, 0.5, 6, 2, '#4a5560', 0.4, 0.6);
      for (let i = 0; i < 3; i++) {
        p.box(-0.1 + i * 0.45, 0.8, 0.0, 0.14, 0.14, 0.12, white);
        p.prism(-0.1 + i * 0.45, 0.94, 0.0, 0.16, 0.12, 0.14, cap);
      }
      p.box(-0.85, 0, -0.1, 0.8, 0.55, 0.5, '#e6dfcb');
      p.prism(-0.85, 0.55, -0.1, 0.54, 0.22, 0.86, cap, { ry: PI / 2 });
      for (const [tx, tz, r, h] of [[-1.35, 0.62, 0.34, 1.0], [1.35, 0.62, 0.34, 1.0], [-1.35, -0.62, 0.3, 0.85], [1.35, -0.62, 0.3, 0.85]] as const) {
        roundTower(k, tx, tz, r, h, white, null, 0);
        p.cyl(tx, -0.05, tz, r * 1.1, r * 1.04, 0.3, schist, { seg: 12 });
        p.cyl(tx, h + 0.05, tz, r * 1.12, r * 1.12, 0.05, '#d8d0bc', { seg: 12, ao: 0 });
        p.cone(tx, h + 0.1, tz, r * 1.05, r * 0.95, cap, { seg: 12 });
        for (let i = 0; i < 3; i++) archZ(p, tx - 0.12 + i * 0.12, h * 0.4, tz + r * 0.9, 0.06, 0.18, '#3d4650');
      }
    });
    k.reserve(cx, cz, 1.7 * CS, 0.9 * CS);
  },
  mole: { dir: -1, endX: 0.95 },
  rows: 3,
  quiet: true,
  flag: { dx: -2.4, z: -12.5 },
};

// ───────────────────────────── Bordeaux ─────────────────────────────

/** A long cream facade with an arcaded ground floor, balconied windows, a mansard roof and dormers. */
function facade(k: PortKit, x0: number, x1: number, z: number, floors = 3, o: { wall?: Col; roof?: Col; fh?: number; depth?: number } = {}): void {
  const p = k.solid;
  const wall = o.wall ?? '#ebdfc4';
  const roof = o.roof ?? '#5d6b79';
  const fh = o.fh ?? 0.27;
  const d = o.depth ?? 0.5;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const y = k.groundMax(cx, z, w / 2, d / 2);
  const h = floors * fh;
  p.box(cx, y - 0.25, z, w, 0.25 + h, d, wall);
  const n = Math.max(2, Math.round(w / 0.36));
  const bw = w / n;
  const zf = z + d / 2;
  for (let i = 0; i < n; i++) {
    const bx = x0 + (i + 0.5) * bw;
    archZ(p, bx, y + 0.01, zf, bw * 0.4, fh * 0.78, '#4b4a46');
    for (let f = 1; f < floors; f++) {
      archZ(p, bx, y + f * fh + 0.05, zf, bw * 0.3, fh * 0.62, '#3f4b58');
      if (f === 1) p.box(bx, y + f * fh, zf + 0.012, bw * 0.62, 0.02, 0.04, '#4a4f55', { ao: 0 });
    }
    if (i % 2 === 0) {
      p.box(bx, y + h + 0.02, z + d * 0.18, bw * 0.45, 0.13, 0.13, wall);
      p.prism(bx, y + h + 0.15, z + d * 0.18, bw * 0.5, 0.1, 0.15, roof);
    }
  }
  for (let f = 1; f < floors; f++) p.box(cx, y + f * fh - 0.012, z, w + 0.02, 0.024, d + 0.02, '#f6efd8', { ao: 0 });
  p.box(cx, y + h, z, w + 0.04, 0.03, d + 0.04, '#f6efd8', { ao: 0 });
  p.prism(cx, y + h + 0.03, z, d + 0.06, 0.3, w + 0.04, roof, { ry: PI / 2 });
  // a pedimented pavilion in the middle
  const pw = bw * 3;
  p.box(cx, y - 0.1, zf, pw, 0.1 + h + 0.06, 0.05, '#f2e9d0');
  p.tri([cx - pw / 2, y + h + 0.06, zf + 0.027], [cx + pw / 2, y + h + 0.06, zf + 0.027], [cx, y + h + 0.26, zf + 0.027], '#f2e9d0');
  p.tri([cx - pw / 2 + 0.07, y + h + 0.08, zf + 0.032], [cx + pw / 2 - 0.07, y + h + 0.08, zf + 0.032], [cx, y + h + 0.21, zf + 0.032], '#ddd2b6');
  k.reserve(cx, z, w / 2 + 0.02, d / 2 + 0.05);
}

const BZ = -14.8;
const bordeaux: Landmark = {
  terrain(k) {
    k.shape.relief = 0.25;
    k.shape.range = 1.5;
    k.palette.rock = '#b4b78a';
    carve(k, k.vx(BZ, 0.5), 3.0, -26);
  },
  build(k) {
    const rx = k.vx(BZ, 0.5);
    const p = k.solid;
    // the Pont de Pierre: a long stone bridge, nine round arches (a wall with arched openings)
    const N = 9;
    const sp = 0.7;
    const L = N * sp;
    const deck = 0.74;
    const wall: [number, number][] = [[-L / 2, -0.9], [L / 2, -0.9], [L / 2, deck], [-L / 2, deck]];
    const holes: [number, number][][] = [];
    for (let i = 0; i < N; i++) {
      const c = -L / 2 + sp * (i + 0.5);
      const hw = 0.25;
      const pts: [number, number][] = [[c - hw, -0.5], [c + hw, -0.5], [c + hw, 0.12]];
      for (let j = 1; j < 8; j++) {
        const a = (j / 8) * PI;
        pts.push([c + hw * Math.cos(a), 0.12 + hw * 1.15 * Math.sin(a)]);
      }
      pts.push([c - hw, 0.12]);
      holes.push(pts);
    }
    const stone = '#d9c9a3';
    p.extrude(wall, 0.34, rx, 0, BZ, stone, { holes, ao: 0.08 });
    p.box(rx, deck, BZ, L + 0.04, 0.07, 0.4, '#e9dcb8');
    p.box(rx, deck + 0.07, BZ + 0.17, L + 0.04, 0.05, 0.05, '#efe4c2', { ao: 0 });
    p.box(rx, deck + 0.07, BZ - 0.17, L + 0.04, 0.05, 0.05, '#efe4c2', { ao: 0 });
    for (let i = 1; i < N; i++) disc(p, rx - L / 2 + i * sp, 0.52, BZ + 0.172, 0.065, '#a85a42', 10);
    // approach ramps down to the quays
    for (const sx of [-1, 1]) {
      const xa = rx + sx * L / 2;
      const xb = rx + sx * (L / 2 + 1.1);
      p.solid([[xa, -0.3, BZ - 0.19], [xb, -0.3, BZ - 0.19], [xb, 0.42, BZ - 0.19], [xa, deck, BZ - 0.19], [xa, -0.3, BZ + 0.19], [xb, -0.3, BZ + 0.19], [xb, 0.42, BZ + 0.19], [xa, deck, BZ + 0.19]], [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]], stone);
    }
    k.reserve(rx, BZ, L / 2 + 1.2, 0.5);

    // the Fleche Saint-Michel: a free-standing gothic spire beside its basilica
    const fx = rx - 6.1;
    const fz = -14.6;
    const FS = 1.3;
    const fy = k.groundMax(fx, fz, 0.5, 0.5);
    k.at(fx, fy, fz, 0, FS, () => {
      gothicTower(k, 0, 0, { shaft: 2.1, spire: 2.9, w: 0.54, stone: '#d6ccb0', roof: '#cbc1a4', y: 0 });
      p.box(-0.1, -0.35, -1.3, 1.9, 0.35 + 0.95, 0.8, '#d8cfb4');
      p.prism(-0.1, 0.95, -1.3, 0.9, 0.5, 1.96, '#79848d', { ry: PI / 2 });
      for (let i = 0; i < 5; i++) archZ(p, -0.1 - 0.7 + i * 0.35, 0.2, -0.9 + 0.004, 0.1, 0.5, '#3e4650', true);
    });
    k.reserve(fx, fz, 0.4 * FS, 0.4 * FS);
    k.reserve(fx - 0.1 * FS, fz - 1.3 * FS, 1.1 * FS, 0.5 * FS);

    // cream 18th-century quay facades along the water
    facade(k, rx - 11.4, rx - 5.5, -13.2, 3);
    facade(k, rx + 5.5, rx + 11.6, -13.2, 4, { wall: '#efe4ca' });
    facade(k, rx + 5.9, rx + 10, -15.6, 3, { wall: '#e6d9bb', roof: '#667380' });
  },
  mole: { dir: -1, endX: 1.2 },
  rows: 3,
  quiet: true,
  flag: { dx: 3.3, z: -12.7 },
};

// ───────────────────────────── Strasbourg ─────────────────────────────

const SZ = -14.5;
const strasbourg: Landmark = {
  terrain(k) {
    k.plateau(k.vx(SZ, 0.2), SZ - 1.0, 2.9, 1.7, k.baseHeight(k.vx(SZ, 0.2), SZ - 0.5), 0.6);
  },
  build(k) {
    const cx = k.vx(SZ, 0.2);
    const S = 1.2;
    const y0 = k.groundMax(cx, SZ, 1.4, 0.6);
    const pink = '#c88a7d';
    const pinkL = '#dba797';
    const pinkD = '#b97a6e';
    const dark = '#40302e';
    k.at(cx, y0, SZ, 0, S, () => {
      const p = k.solid;
      // the west front: a wide wall of pink Vosges sandstone with three portals, a rose window and a screen of lancets
      p.box(0, -0.3, 0, 2.3, 0.3 + 2.55, 0.9, pink);
      for (const sx of [-1, 1]) {
        p.box(sx * 1.1, -0.3, 0.46, 0.16, 0.3 + 2.55, 0.1, pinkL, { ao: 0.05 });
        pinnacle(p, sx * 1.1, 2.55, 0.44, 0.12, 0.5, pinkL, pinkD);
      }
      for (const sx of [-0.4, 0.4]) p.box(sx, -0.3, 0.46, 0.08, 0.3 + 2.55, 0.08, pinkL, { ao: 0.05 });
      archZ(p, 0, 0, 0.472, 0.46, 0.85, dark, true);
      archZ(p, -0.7, 0, 0.472, 0.34, 0.6, dark, true);
      archZ(p, 0.7, 0, 0.472, 0.34, 0.6, dark, true);
      p.tri([-0.3, 0.9, 0.462], [0.3, 0.9, 0.462], [0, 1.28, 0.462], pinkL);
      p.tri([-0.22, 0.94, 0.468], [0.22, 0.94, 0.468], [0, 1.18, 0.468], pinkD);
      disc(p, 0, 1.78, 0.456, 0.4, pinkL, 18);
      disc(p, 0, 1.78, 0.466, 0.31, '#3a4660', 18);
      disc(p, 0, 1.78, 0.476, 0.07, pinkL, 10);
      for (let i = 0; i < 12; i++) p.box(0, 1.78, 0.482, 0.016, 0.3, 0.008, pinkL, { rz: (i * PI) / 6, ao: 0 });
      for (let i = -6; i <= 6; i++) {
        if (Math.abs(i) < 3) continue;
        archZ(p, i * 0.17, 1.35, 0.464, 0.08, 0.5, dark, true);
        archZ(p, i * 0.17, 2.1, 0.464, 0.08, 0.4, dark, true);
      }
      for (let i = -2; i <= 2; i++) archZ(p, i * 0.2, 2.25, 0.464, 0.08, 0.26, dark, true);
      p.box(0, 2.55, 0, 2.4, 0.05, 1.0, pinkL);
      // the single tower, on the left: four stair turrets round an octagon, then the open spire
      const tx = -0.62;
      const wh = 0.86;
      p.box(tx, 2.6, 0, wh, 0.4, wh, pink);
      archZ(p, tx - 0.18, 2.66, wh / 2, 0.1, 0.3, dark, true);
      archZ(p, tx + 0.18, 2.66, wh / 2, 0.1, 0.3, dark, true);
      archX(p, tx + wh / 2, 2.66, -0.18, 0.1, 0.3, dark, true);
      archX(p, tx + wh / 2, 2.66, 0.18, 0.1, 0.3, dark, true);
      p.box(tx, 3.0, 0, wh + 0.06, 0.05, wh + 0.06, pinkL);
      p.cyl(tx, 3.05, 0, 0.36, 0.34, 0.85, pink, { seg: 8, ry: PI / 8 });
      for (const a of [-PI / 4, 0, PI / 4, PI / 2]) {
        const nx = Math.sin(a);
        const nz = Math.cos(a);
        const rx = Math.cos(a);
        const rz = -Math.sin(a);
        for (const o of [-0.1, 0.1]) {
          const ap = 0.34 * Math.cos(PI / 8) + 0.004;
          p.quad([tx + nx * ap + rx * (o - 0.045), 3.2, nz * ap + rz * (o - 0.045)], [tx + nx * ap + rx * (o + 0.045), 3.2, nz * ap + rz * (o + 0.045)], [tx + nx * ap + rx * (o + 0.045), 3.7, nz * ap + rz * (o + 0.045)], [tx + nx * ap + rx * (o - 0.045), 3.7, nz * ap + rz * (o - 0.045)], dark);
        }
      }
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        p.cyl(tx + dx * 0.4, 3.05, dz * 0.4, 0.085, 0.075, 1.15, pinkL, { seg: 8 });
        p.cone(tx + dx * 0.4, 4.2, dz * 0.4, 0.1, 0.4, pinkD, { seg: 8 });
      }
      p.cyl(tx, 3.9, 0, 0.37, 0.37, 0.05, pinkL, { seg: 8, ry: PI / 8 });
      lacework(p, tx, 3.95, 0, 0.3, 0.012, 2.2, '#c98f82', '#4a3532', '#e5b8aa', 5);
      p.ball(tx, 6.2, 0, 0.032, '#e8b923');
      // the lower stump on the right: a flat platform with small pinnacles
      p.box(0.74, 2.6, 0, 0.8, 0.28, 0.84, pink);
      p.box(0.74, 2.88, 0, 0.88, 0.05, 0.92, pinkL);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pinnacle(p, 0.74 + dx * 0.36, 2.93, dz * 0.38, 0.09, 0.34, pink, pinkD);
      // the nave behind
      p.box(0, -0.3, -1.5, 1.7, 0.3 + 1.7, 2.1, pink);
      p.prism(0, 1.7, -1.5, 1.86, 0.7, 2.2, '#9a5a48');
    });
    k.reserve(cx, SZ, 1.4 * S, 0.6 * S);
    k.reserve(cx, SZ - 1.5 * S, 1.0 * S, 1.1 * S);

    // half-timbered houses on the riverside
    const walls = ['#efe0c0', '#e8c9a0', '#e5b9a8', '#d9e0d0', '#efe6d0', '#e7d08f'];
    const roofs = ['#a8553d', '#9c4b38', '#8f5a48'];
    const rows: Array<[number, number, number, number, number]> = [
      [-3.9, -13.2, 0.55, 0.5, 4], [-4.55, -13.35, 0.5, 0.48, 3], [-5.2, -13.15, 0.55, 0.5, 4], [-3.3, -14.0, 0.5, 0.5, 3],
      [4.0, -13.2, 0.55, 0.5, 4], [4.65, -13.4, 0.5, 0.48, 3], [5.3, -13.15, 0.55, 0.5, 3], [3.6, -14.2, 0.5, 0.5, 3],
    ];
    rows.forEach(([dx, z, w, d, fl], i) => {
      timbered(k, cx + dx, z, w, d, fl, walls[i % walls.length], roofs[i % roofs.length], { front: i % 2 === 0, beam: '#5a3d2b' });
    });
  },
  mole: { dir: 1, endX: -4.55 },
  rows: 3,
  quiet: true,
  flag: { dx: 6.2, z: -12.8 },
};

// ───────────────────────────── Calais ─────────────────────────────

const CZ = -14.0;
const calais: Landmark = {
  terrain(k) {
    const x = k.vx(CZ);
    k.plateau(x, CZ - 0.6, 5.4, 1.8, k.baseHeight(x, CZ - 0.3), 0.6);
  },
  build(k) {
    const cx = k.vx(CZ, -1.3);
    const brick = '#a6503a';
    const cream = '#ebe1c8';
    const slate = '#4e5a69';
    const y0 = k.groundMax(cx, CZ, 1.6, 0.5);
    k.at(cx, y0, CZ, 0, 1.12, () => {
      const p = k.solid;
      // the town hall: a long Flemish-Renaissance block of red brick with stone dressings and a steep slate roof
      p.box(0, -0.3, 0, 3.2, 0.3 + 1.02, 0.8, brick);
      for (const y of [0.34, 0.68, 1.0]) p.box(0, y - 0.015, 0, 3.24, 0.03, 0.84, cream, { ao: 0 });
      for (let i = 0; i < 8; i++) {
        const bx = -1.4 + i * 0.4;
        polyZ(p, bx, 0.02, 0.405, archLo(0.26, 0.3, false), cream);
        archZ(p, bx, 0.03, 0.405, 0.18, 0.26, '#3a3430');
        for (let f = 1; f < 3; f++) {
          polyZ(p, bx, f * 0.34 + 0.05, 0.405, archLo(0.22, 0.25, false), cream);
          archZ(p, bx, f * 0.34 + 0.06, 0.405, 0.14, 0.21, '#3b4856');
        }
      }
      for (let i = 0; i < 2; i++) {
        for (let f = 0; f < 3; f++) archX(p, 1.6, f * 0.34 + 0.06, 0.2 - i * 0.4, 0.14, 0.21, '#3b4856');
      }
      p.prism(0, 1.02, 0, 0.88, 0.5, 3.3, slate, { ry: PI / 2 });
      for (let i = 0; i < 4; i++) {
        const dx = -1.15 + i * 0.76;
        p.box(dx, 1.16, 0.2, 0.3, 0.2, 0.2, brick);
        archZ(p, dx, 1.2, 0.3, 0.12, 0.14, '#3b4856');
        p.box(dx, 1.36, 0.2, 0.34, 0.05, 0.22, cream, { ao: 0 });
        p.box(dx, 1.41, 0.2, 0.22, 0.05, 0.2, cream, { ao: 0 });
        p.pyramid(dx, 1.46, 0.2, 0.14, 0.1, 0.18, slate);
      }
      // the belfry: a tall brick tower, cream string courses and corner quoins, a clock, two open lanterns and a slate spire
      const tx = 0.58;
      const tz = 0.14;
      const tw = 0.76;
      p.box(tx, -0.3, tz, tw, 0.3 + 2.72, tw, brick);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(tx + (dx * tw) / 2, -0.3, tz + (dz * tw) / 2, 0.08, 0.3 + 2.72, 0.08, cream, { ao: 0.05 });
      for (const y of [0.95, 1.9, 2.72]) p.box(tx, y - 0.025, tz, tw + 0.1, 0.05, tw + 0.1, cream, { ao: 0 });
      const fz = tz + tw / 2;
      archZ(p, tx, 0.0, fz, 0.22, 0.5, '#3a3430');
      for (const dx of [-0.17, 0.17]) {
        polyZ(p, tx + dx, 1.12, fz + 0.003, archLo(0.2, 0.55, false), cream);
        archZ(p, tx + dx, 1.14, fz + 0.003, 0.12, 0.5, '#3b4856');
        polyZ(p, tx + dx, 2.1, fz + 0.003, archLo(0.2, 0.5, false), cream);
        archZ(p, tx + dx, 2.12, fz + 0.003, 0.12, 0.45, '#3b4856');
        polyX(p, tx + tw / 2 + 0.003, 1.12, tz + dx, archLo(0.2, 0.55, false), cream);
        archX(p, tx + tw / 2 + 0.003, 1.14, tz + dx, 0.12, 0.5, '#3b4856');
      }
      disc(p, tx, 1.62, fz + 0.004, 0.2, cream, 14);
      disc(p, tx, 1.62, fz + 0.01, 0.16, '#33383e', 14);
      p.quad([tx - 0.01, 1.62, fz + 0.016], [tx + 0.01, 1.62, fz + 0.016], [tx + 0.01, 1.76, fz + 0.016], [tx - 0.01, 1.76, fz + 0.016], '#efe4c0');
      p.quad([tx, 1.605, fz + 0.016], [tx + 0.1, 1.605, fz + 0.016], [tx + 0.1, 1.625, fz + 0.016], [tx, 1.625, fz + 0.016], '#efe4c0');
      discX(p, tx + tw / 2 + 0.004, 1.62, tz, 0.2, cream, 14);
      discX(p, tx + tw / 2 + 0.01, 1.62, tz, 0.16, '#33383e', 14);
      p.box(tx, 2.72, tz, tw + 0.14, 0.06, tw + 0.14, cream);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pinnacle(p, tx + dx * 0.34, 2.78, tz + dz * 0.34, 0.08, 0.32, cream, slate);
      p.box(tx, 2.78, tz, 0.54, 0.52, 0.54, cream);
      archZ(p, tx, 2.88, tz + 0.27, 0.16, 0.34, '#3a4452');
      archX(p, tx + 0.27, 2.88, tz, 0.16, 0.34, '#3a4452');
      p.box(tx, 3.3, tz, 0.64, 0.05, 0.64, tint(cream, -0.08));
      p.box(tx, 3.35, tz, 0.38, 0.4, 0.38, cream);
      archZ(p, tx, 3.43, tz + 0.19, 0.12, 0.26, '#3a4452');
      archX(p, tx + 0.19, 3.43, tz, 0.12, 0.26, '#3a4452');
      p.box(tx, 3.75, tz, 0.46, 0.04, 0.46, tint(cream, -0.08));
      p.lathe(tx, 3.79, tz, [[0.25, 0], [0.29, 0.07], [0.24, 0.2], [0.13, 0.38], [0.06, 0.6], [0.025, 0.85], [0.0, 1.0]], slate, { seg: 10 });
      p.ball(tx, 4.82, tz, 0.03, '#e8b923');
      p.rod([tx, 4.82, tz], [tx, 5.0, tz], 0.008, '#2d3138', 4);
    });
    k.reserve(cx, CZ, 1.9, 0.7);

    // the lighthouse: a tall, tapering square white tower with a black gallery and lantern
    const lx = k.vx(-13.9, 3.7);
    const lz = -13.9;
    const ly = k.groundMax(lx, lz, 0.5, 0.5);
    k.at(lx, ly, lz, 0, 1, () => {
      const p = k.solid;
      p.box(0, -0.3, 0, 0.84, 0.3 + 0.32, 0.84, '#d9d4c6');
      frustum(p, 0, 0.3, 0, 0.7, 0.7, 0.5, 0.5, 3.3, '#f4f1e8');
      for (const y of [0.9, 1.6, 2.3, 2.9]) {
        const half = 0.35 - 0.1 * ((y - 0.3) / 3.3);
        p.quad([-0.035, y, half + 0.006], [0.035, y, half + 0.006], [0.035, y + 0.16, half + 0.006], [-0.035, y + 0.16, half + 0.006], '#2a3340');
        p.quad([half + 0.006, y, 0.035], [half + 0.006, y, -0.035], [half + 0.006, y + 0.16, -0.035], [half + 0.006, y + 0.16, 0.035], '#2a3340');
      }
      archZ(p, 0, 0.3, 0.35 + 0.006, 0.14, 0.3, '#3a2a22');
      p.box(0, 3.6, 0, 0.76, 0.06, 0.76, '#23262b');
      for (const [bx, bz, w, d] of [[0, 0.36, 0.76, 0.03], [0, -0.36, 0.76, 0.03], [0.36, 0, 0.03, 0.76], [-0.36, 0, 0.03, 0.76]] as const) p.box(bx, 3.66, bz, w, 0.13, d, '#23262b', { ao: 0 });
      k.glass.box(0, 3.66, 0, 0.34, 0.42, 0.34, '#bfe6f2', { ao: 0 });
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(dx * 0.17, 3.66, dz * 0.17, 0.045, 0.42, 0.045, '#23262b', { ao: 0 });
      k.glow.ball(0, 3.88, 0, 0.1, '#fff1b0');
      p.box(0, 4.08, 0, 0.46, 0.05, 0.46, '#23262b');
      p.pyramid(0, 4.13, 0, 0.42, 0.28, 0.42, '#23262b');
      p.ball(0, 4.43, 0, 0.03, '#23262b');
      p.box(0.78, -0.2, 0.1, 0.8, 0.2 + 0.36, 0.5, '#f1ece0');
      p.prism(0.78, 0.36, 0.1, 0.56, 0.2, 0.86, '#b8553d', { ry: PI / 2 });
    });
    k.reserve(lx + 0.4, lz, 1.0, 0.5);
  },
  mole: { dir: 1, endX: -6.6, light: { h: 1.3, r0: 0.24, r1: 0.18, bands: [['#d62f2b', 1]], cap: '#2d3138', gallery: '#2d3138' } },
  rows: 3,
  quiet: true,
  flag: { dx: 1.5, z: -12.7 },
};

// ───────────────────────────── Dunkirk ─────────────────────────────

const DZ = -14.3;
const dunkirk: Landmark = {
  terrain(k) {
    const dune = (cx: number, cz: number, rx: number, rz: number, h: number) => k.bump(cx, cz, rx, rz, h, 0.9);
    dune(k.vx(-14.5, -7.2), -14.5, 3.0, 1.6, 0.85);
    dune(k.vx(-15.5, -4.4), -15.5, 2.6, 1.5, 0.7);
    dune(k.vx(-13.6, -9.8), -13.6, 2.4, 1.2, 0.6);
    k.plateau(k.vx(DZ, 0.2), DZ - 0.4, 2.2, 1.4, k.baseHeight(k.vx(DZ, 0.2), DZ), 0.6);
    k.plateau(k.vx(DZ, 6.0), DZ - 1.0, 4.4, 2.6, k.baseHeight(k.vx(DZ, 6.0), DZ), 0.6);
    k.paint((x, y, z, _s, c) => {
      for (const [dx, dz, rx, rz] of [[-7.2, -14.5, 3.0, 1.6], [-4.4, -15.5, 2.6, 1.5], [-9.8, -13.6, 2.4, 1.2]] as const) {
        const d = Math.hypot((x - k.vx(dz, dx)) / rx, (z - dz) / rz);
        if (d < 1 && y > 0.3) c.lerp(SAND, smooth(1.0, 0.5, d) * 0.85);
      }
    });
  },
  build(k) {
    const bx = k.vx(DZ, 0.2);
    const brick = '#b4694b';
    const cream = '#e8dcc0';
    const slate = '#4f5964';
    const y0 = k.groundMax(bx, DZ, 0.5, 0.5);
    // the belfry of Saint-Eloi: a brick tower with stone corners, an open belfry stage and a baroque domed top
    k.at(bx, y0, DZ, 0, 1.12, () => {
      const p = k.solid;
      const w = 0.78;
      p.box(0, -0.3, 0, w + 0.14, 0.3 + 0.28, w + 0.14, '#d9cfb4');
      p.box(0, -0.3, 0, w, 0.3 + 2.55, w, brick);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box((dx * w) / 2, -0.3, (dz * w) / 2, 0.09, 0.3 + 2.55, 0.09, cream, { ao: 0.05 });
      for (const y of [0.9, 1.75, 2.55]) p.box(0, y - 0.025, 0, w + 0.1, 0.05, w + 0.1, cream, { ao: 0 });
      const fz = w / 2;
      archZ(p, 0, 0.28, fz, 0.2, 0.44, '#3a3430');
      for (const dx of [-0.17, 0.17]) {
        polyZ(p, dx, 1.05, fz + 0.003, archLo(0.18, 0.5, false), cream);
        archZ(p, dx, 1.07, fz + 0.003, 0.11, 0.45, '#3b4856');
        polyX(p, w / 2 + 0.003, 1.05, dx, archLo(0.18, 0.5, false), cream);
        archX(p, w / 2 + 0.003, 1.07, dx, 0.11, 0.45, '#3b4856');
      }
      disc(p, 0, 2.15, fz + 0.004, 0.18, cream, 14);
      disc(p, 0, 2.15, fz + 0.01, 0.145, '#33383e', 14);
      discX(p, w / 2 + 0.004, 2.15, 0, 0.18, cream, 14);
      discX(p, w / 2 + 0.01, 2.15, 0, 0.145, '#33383e', 14);
      p.box(0, 2.55, 0, w + 0.14, 0.06, w + 0.14, cream);
      // open belfry stage
      p.box(0, 2.61, 0, 0.58, 0.55, 0.58, '#3d3a37');
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(dx * 0.26, 2.61, dz * 0.26, 0.1, 0.55, 0.1, cream);
      p.box(0, 3.16, 0, 0.68, 0.06, 0.68, cream);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) pinnacle(p, dx * 0.3, 3.22, dz * 0.3, 0.07, 0.28, cream, slate);
      // the dome and its lanterns
      p.lathe(0, 3.22, 0, [[0.3, 0], [0.34, 0.08], [0.33, 0.2], [0.24, 0.36], [0.14, 0.5], [0.09, 0.58]], slate, { seg: 12 });
      p.cyl(0, 3.8, 0, 0.1, 0.1, 0.22, cream, { seg: 8 });
      archZ(p, 0, 3.86, 0.1, 0.07, 0.12, '#3a4452');
      p.lathe(0, 4.02, 0, [[0.12, 0], [0.15, 0.04], [0.11, 0.14], [0.05, 0.24], [0.0, 0.3]], slate, { seg: 8 });
      p.rod([0, 4.3, 0], [0, 4.55, 0], 0.01, '#2d3138', 4);
      p.ball(0, 4.55, 0, 0.03, '#e8b923');
    });
    k.reserve(bx, DZ, 0.8, 0.8);
    // the church beside it: pale stone, columns and a pediment
    const cx = bx - 2.1;
    const cz = -14.8;
    const cy = k.groundMax(cx, cz, 1.0, 0.7);
    k.at(cx, cy, cz, 0, 1.1, () => {
      const p = k.solid;
      p.box(0, -0.3, 0, 1.7, 0.3 + 0.9, 1.3, '#d8cfb3');
      p.prism(0, 0.9, 0, 1.1, 0.4, 1.8, '#5a636d', { ry: PI / 2 });
      p.box(0, -0.3, 0.7, 1.1, 0.3 + 0.75, 0.2, '#e3dac0');
      p.tri([-0.6, 0.75, 0.805], [0.6, 0.75, 0.805], [0, 1.1, 0.805], '#e3dac0');
      p.tri([-0.46, 0.79, 0.812], [0.46, 0.79, 0.812], [0, 1.03, 0.812], '#c9bf9f');
      for (let i = 0; i < 5; i++) p.cyl(-0.45 + i * 0.225, 0, 0.84, 0.035, 0.035, 0.74, '#f2ead2', { seg: 6 });
      archZ(p, 0, 0, 0.805, 0.2, 0.46, '#3a3430');
      for (let i = 0; i < 4; i++) archX(p, 0.855, 0.2, 0.45 - i * 0.3, 0.1, 0.38, '#3b4856');
    });
    k.reserve(cx, cz, 1.2, 0.9);

    // the steelworks: blast furnace, hot stoves, a stack and pipes
    const sx = k.vx(-15.2, 4.3);
    const sz = -15.2;
    const sy = k.groundMax(sx, sz, 0.6, 0.6);
    k.at(sx, sy, sz, 0, 1.2, () => {
      const p = k.solid;
      p.cyl(0, -0.2, 0, 0.5, 0.45, 0.2 + 1.0, '#9ca5ac', { seg: 12 });
      p.cyl(0, 0.8, 0, 0.55, 0.5, 0.15, '#8a5a40', { seg: 12 });
      p.cyl(0, 0.95, 0, 0.5, 0.42, 1.3, '#a7b0b7', { seg: 12 });
      p.cone(0, 2.25, 0, 0.42, 0.5, '#8d979f', { seg: 12 });
      p.cyl(0, 2.7, 0, 0.1, 0.1, 0.28, '#7b8389', { seg: 8 });
      for (let i = 0; i < 5; i++) p.cyl(0, 0.5 + i * 0.4, 0, 0.53, 0.53, 0.04, '#7b8389', { seg: 12, ao: 0 });
      // dust catcher, downcomer and hot stoves
      p.cyl(1.0, -0.2, -0.15, 0.3, 0.3, 0.2 + 1.5, '#9aa3aa', { seg: 10 });
      p.cone(1.0, 1.5, -0.15, 0.3, 0.3, '#8d979f', { seg: 10 });
      p.rod([0, 2.65, 0], [1.0, 1.9, -0.15], 0.06, '#7b8389', 6);
      p.rod([0, 2.75, 0], [0.0, 2.9, 0], 0.03, '#7b8389', 4);
      for (let i = 0; i < 3; i++) {
        const x = -1.35 - i * 0.62;
        p.cyl(x, -0.2, -0.1, 0.27, 0.27, 0.2 + 1.9, i % 2 ? '#c3623f' : '#b5593f', { seg: 10 });
        p.lathe(x, 1.7, -0.1, [[0.27, 0], [0.26, 0.1], [0.16, 0.22], [0.0, 0.28]], '#8a5a40', { seg: 10 });
        p.cyl(x, 1.0, -0.1, 0.285, 0.285, 0.04, '#6c4a38', { seg: 10, ao: 0 });
      }
      p.rod([0.2, 0.7, 0.45], [-1.9, 0.7, 0.45], 0.05, '#7b8389', 6);
      p.rod([0.2, 0.9, 0.5], [-1.9, 0.9, 0.5], 0.035, '#9aa3aa', 6);
      for (const x of [-0.8, -1.4, -2.0]) p.box(x, 0, 0.45, 0.04, 0.9, 0.04, '#6a7076');
      // the stack, with steam
      stack(k, 1.9, -0.5, 3.4, 0.14, 0, '#c8302a');
      p.blob(1.95, 3.55, -0.5, 0.2, '#f4f4f2', { sy: 0.7 });
      p.blob(2.15, 3.8, -0.5, 0.15, '#f1f1ef', { sy: 0.7 });
      // sheds and ore heaps
      p.box(1.0, -0.2, 1.0, 1.5, 0.2 + 0.45, 0.6, '#aeb5bb');
      p.prism(1.0, 0.45, 1.0, 0.64, 0.14, 1.52, '#7d868e', { ry: PI / 2 });
      p.box(-0.6, -0.2, 1.1, 1.0, 0.2 + 0.32, 0.5, '#b9bfc4');
      p.rock(-2.1, -0.02, 1.0, 0.4, '#3a3a3a', { sy: 0.7 });
      p.rock(-2.6, -0.02, 0.9, 0.32, '#4a4540', { sy: 0.8 });
    });
    k.reserve(sx - 0.6, sz, 3.6, 1.7);
    // wind turbines on the dunes
    turbine(k, k.vx(-15.3, -6.6), -15.3, 2.1);
    turbine(k, k.vx(-16.4, -3.8), -16.4, 2.0);
    turbine(k, k.vx(-14.2, -9.4), -14.2, 2.1);
    turbine(k, k.vx(-17.4, 1.0), -17.4, 2.0);
    turbine(k, k.vx(-17.8, 8.6), -17.8, 2.0);
    k.reserve(k.vx(-14.5, -7.2), -14.5, 3.0, 1.5);
  },
  mole: { dir: 1, endX: -6.3 },
  rows: 3,
  quiet: true,
  flag: { dx: -4.4, z: -12.7 },
};

// ───────────────────────────── Cherbourg ─────────────────────────────

/** A round stone fort standing in the sea on its foundations: casemates, a crenellated parapet, optionally a second tier. */
function seaFort(k: PortKit, x: number, z: number, r: number, y1: number, tiers: number, o: { stone?: Col; deck?: number } = {}): number {
  const p = k.solid;
  const stone = o.stone ?? '#a29f95';
  const deck = o.deck ?? y1;
  // foundations down to the sea floor
  p.cyl(x, -0.9, z, r + 0.06, r + 0.04, 0.9 + deck, tint(stone, -0.06), { seg: 18 });
  let y = deck;
  let rr = r;
  for (let t = 0; t < tiers; t++) {
    const h = t === 0 ? 0.62 : 0.42;
    p.cyl(x, y, z, rr, rr * 0.97, h, tint(stone, t * 0.04), { seg: 18 });
    // casemate ports on the side that faces the camera
    const n = t === 0 ? 11 : 8;
    for (let i = 0; i < n; i++) {
      const a = -1.5 + (i * 3.0) / (n - 1);
      p.box(x + Math.sin(a) * (rr * 0.985), y + h * 0.3, z + Math.cos(a) * (rr * 0.985), rr * 0.2, h * 0.38, 0.03, '#2c2a28', { ry: a, ao: 0 });
    }
    p.cyl(x, y + h, z, rr + 0.04, rr + 0.04, 0.05, tint(stone, 0.12), { seg: 18, ao: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      p.box(x + Math.cos(a) * (rr + 0.01), y + h + 0.05, z + Math.sin(a) * (rr + 0.01), rr * 0.3, 0.07, 0.06, tint(stone, 0.1), { ry: -a + PI / 2, ao: 0 });
    }
    y += h + 0.05;
    rr *= 0.66;
  }
  return y;
}

const cherbourg: Landmark = {
  terrain(k) {
    const x = k.vx(-17.8, 5.6);
    k.bump(x, -17.8, 4.6, 3.2, 1.7, 1.1);
    k.palette.rock = '#a9a79d';
    k.paint((px, _y, pz, slope, c) => {
      const d = Math.hypot((px - x) / 4.6, (pz + 17.8) / 3.2);
      if (d < 1) c.lerp(GRASS, smooth(1.0, 0.5, d) * (1 - smooth(0.3, 0.5, slope) * 0.4));
    });
    k.plateau(k.vx(-14.0, 2.6), -14.2, 3.6, 1.5, k.baseHeight(k.vx(-14.0, 2.6), -14.0), 0.6);
  },
  build(k) {
    const p = k.solid;
    // the Digue: a huge breakwater with round stone forts; the fort on the head carries a small lighthouse
    const hx = k.mole.endX;
    const hz = MOLE_Z;
    const top = seaFort(k, hx, hz, 0.88, k.mole.top - 0.04, 2);
    lighthouse(k, hx, top - 0.02, hz, { h: 0.85, r0: 0.17, r1: 0.12, bands: [['#f6f3ea', 0.55], ['#c8302a', 0.45]], cap: '#c8302a', gallery: '#2d3138' });
    seaFort(k, hx + k.mole.dir * 4.6, hz, 0.56, k.mole.top - 0.04, 1);
    seaFort(k, hx + k.mole.dir * 9.2, hz, 0.56, k.mole.top - 0.04, 1);

    // the Cite de la Mer: a long Art Deco maritime station with a central tower block
    const cx = k.vx(-14.2, 3.0);
    const cz = -14.2;
    const cy = k.groundMax(cx, cz, 1.8, 0.5);
    k.at(cx, cy, cz, 0, 1.1, () => {
      const q = k.solid;
      q.box(0, -0.3, 0, 3.6, 0.3 + 0.8, 0.7, '#e7e1d1');
      q.box(0, 0.8, 0, 3.68, 0.05, 0.76, '#cfc8b4', { ao: 0 });
      for (let i = 0; i < 9; i++) archZ(q, -1.5 + i * 0.375, 0.12, 0.35, 0.2, 0.5, '#46525e');
      for (let i = 0; i < 2; i++) archX(q, 1.8, 0.12, 0.15 - i * 0.3, 0.16, 0.5, '#46525e');
      q.box(0, -0.3, 0.08, 0.95, 0.3 + 1.4, 0.8, '#efe9da');
      q.box(0, 1.1, 0.08, 1.02, 0.06, 0.86, '#cfc8b4');
      winsZ(q, 0, 0.2, 0.486, 0.5, 0.8, 1, 1, '#46525e', 0.4, 0.92);
      winsZ(q, 0, 1.0, 0.486, 0.6, 0.3, 3, 1, '#46525e', 0.5, 0.75);
      winsX(q, 0.475, 0.2, 0.08, 0.7, 0.9, 2, 2, '#46525e', 0.45, 0.6);
      disc(q, 0, 1.24, 0.486, 0.1, '#cfc8b4', 12);
      q.box(0, 1.16, 0.08, 0.7, 0.18, 0.6, '#e7e1d1');
    });
    k.reserve(cx, cz, 2.1, 0.8);

    // the submarine Redoutable on cradles on the quay: a long black cigar with a sail and cruciform tail
    const sx = k.vx(-12.9, 1.2);
    const sz = -12.85;
    const sy = k.groundMax(sx, sz, 1.7, 0.3);
    const hull = '#252a30';
    const L = 3.6;
    const ya = sy + 0.46;
    for (const dx of [0.5, 1.7, 2.9]) p.box(sx - L / 2 + dx, sy - 0.1, sz, 0.12, 0.1 + 0.36, 0.34, '#7a4a30');
    p.lathe(sx - L / 2, ya, sz, [[0.0, 0.0], [0.05, 0.1], [0.13, 0.4], [0.2, 0.95], [0.225, 1.7], [0.225, 2.7], [0.21, 3.0], [0.15, 3.3], [0.07, 3.5], [0.0, 3.58]], hull, { seg: 12, rz: -PI / 2 });
    p.box(sx + 0.15, ya + 0.14, sz, 0.55, 0.38, 0.14, '#30363d', { ao: 0.05 });
    p.box(sx + 0.42, ya + 0.3, sz, 0.12, 0.1, 0.5, '#30363d', { ao: 0 });
    p.box(sx + 0.15, ya + 0.52, sz, 0.45, 0.03, 0.15, '#3a4048', { ao: 0 });
    p.box(sx - L / 2 + 0.2, ya - 0.12, sz, 0.3, 0.26, 0.03, '#30363d', { ao: 0 });
    p.box(sx - L / 2 + 0.2, ya, sz, 0.3, 0.03, 0.5, '#30363d', { ao: 0 });
    p.rock(sx - L / 2 - 0.1, ya - 0.08, sz, 0.05, '#6a6a6a', { sy: 1 });
    k.reserve(sx, sz, 1.9, 0.4);
    // the arsenal's crane and sheds
    hammerCrane(k, k.vx(-13.2, -6.2), -13.2, 2.3, '#c9402e');
    gantryCrane(k, k.vx(-12.6, -3.2), SHORE_Z - 0.5, { color: '#2c5da8', s: 0.85, y: LAND_Y });
    // Fort du Roule on its hill behind the town
    const fx = k.vx(-17.8, 5.6);
    const fy = k.groundMax(fx, -17.8, 0.7, 0.4);
    p.box(fx, fy - 0.3, -17.8, 1.5, 0.3 + 0.5, 0.7, '#a9a69b');
    for (let i = 0; i < 8; i++) p.box(fx - 0.7 + i * 0.2, fy + 0.5, -17.8 + 0.3, 0.1, 0.07, 0.07, '#bab7ab', { ao: 0 });
    for (let i = 0; i < 4; i++) archZ(p, fx - 0.5 + i * 0.33, fy + 0.1, -17.8 + 0.35, 0.1, 0.25, '#35302c');
    k.reserve(fx, -17.8, 1.0, 0.6);
  },
  mole: { dir: 1, endX: -6.0, armour: 'wall', light: false, headR: 0.9 },
  rows: 3,
  quiet: true,
  flag: { dx: -2.6, z: -12.7 },
};

// ───────────────────────────── Brest ─────────────────────────────

const BRZ = -14.6;
const brest: Landmark = {
  terrain(k) {
    k.shape.relief = 0.6;
    carve(k, k.vx(BRZ, -3.9), 1.55, -24);
    k.palette.rock = '#a3a28e';
    k.plateau(k.vx(-14.6, 1.6), -14.8, 3.2, 1.7, k.baseHeight(k.vx(-14.6, 1.6), -14.4) + 0.12, 0.5);
  },
  build(k) {
    const p = k.solid;
    // the Recouvrance lift bridge: two tall square towers carrying a lifting span
    const rx = k.vx(BRZ, -3.9);
    const steel = '#98a1aa';
    const blue = '#2f4a66';
    const th = 3.5;
    const span = 2.35;
    for (const sx of [-1, 1]) {
      const tx = rx + sx * 2.05;
      const ty = k.groundMax(tx, BRZ, 0.3, 0.3);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(tx + dx * 0.24, ty - 0.2, BRZ + dz * 0.24, 0.07, th + 0.2, 0.07, steel);
      for (let i = 0; i < 5; i++) {
        const y = ty + 0.3 + i * 0.7;
        p.box(tx, y, BRZ, 0.55, 0.05, 0.55, steel, { ao: 0 });
        p.rod([tx - 0.24, y, BRZ + 0.24], [tx + 0.24, y + 0.7, BRZ + 0.24], 0.016, steel, 4);
        p.rod([tx + 0.24, y, BRZ + 0.24], [tx - 0.24, y + 0.7, BRZ + 0.24], 0.016, steel, 4);
        p.rod([tx + 0.24, y, BRZ + 0.24], [tx + 0.24, y + 0.7, BRZ - 0.24], 0.016, steel, 4);
        p.rod([tx + 0.24, y, BRZ - 0.24], [tx + 0.24, y + 0.7, BRZ + 0.24], 0.016, steel, 4);
      }
      p.box(tx, ty + th, BRZ, 0.62, 0.14, 0.62, blue);
      p.box(tx, ty + th + 0.14, BRZ, 0.4, 0.16, 0.4, '#d9dde0');
      p.box(tx - sx * 0.05, ty + 1.0, BRZ, 0.2, 0.55, 0.2, '#4a5058');
      // cables up to the sheaves and down to the span
      for (const dz of [-0.14, 0.14]) {
        p.rod([tx, ty + th + 0.1, BRZ + dz], [tx - sx * 0.55, ty + span + 0.1, BRZ + dz], 0.012, '#3a3f46', 4);
      }
    }
    const dy = k.groundMax(rx, BRZ, 2.0, 0.3) + span;
    p.box(rx, dy, BRZ, 3.55, 0.1, 0.4, '#59626b');
    p.box(rx, dy + 0.1, BRZ - 0.17, 3.55, 0.15, 0.04, '#d9dde0', { ao: 0 });
    p.box(rx, dy + 0.1, BRZ + 0.17, 3.55, 0.15, 0.04, '#d9dde0', { ao: 0 });
    p.box(rx, dy - 0.07, BRZ, 3.55, 0.07, 0.3, blue, { ao: 0 });
    k.reserve(rx, BRZ, 2.5, 0.6);

    // the Chateau de Brest: grey stone walls on a rock above the harbour, round towers with slate cones, a square keep
    const cx = k.vx(-14.8, 1.8);
    const cz = -14.8;
    const CS = 1.12;
    const cy = k.groundMax(cx, cz, 1.9, 0.9);
    const stone = '#b0aea4';
    const cone = '#46505c';
    k.at(cx, cy, cz, 0, CS, () => {
      const q = k.solid;
      q.box(0, -0.4, 0, 3.8, 0.4 + 0.12, 1.7, '#8d8b82');
      for (const [rxx, rzz, r] of [[-1.6, 0.75, 0.3], [-0.9, 0.82, 0.22], [0.2, 0.84, 0.28], [1.2, 0.8, 0.24], [1.75, 0.55, 0.26], [-1.85, 0.2, 0.22]] as const) q.rock(rxx, 0.0, rzz, r, '#8f8c82', { sy: 0.7 });
      battlement(k, 0, 0.62, 3.2, 0.22, 0.65, stone, 0.1);
      battlement(k, 0, -0.62, 3.2, 0.22, 0.65, stone, 0.1);
      battlement(k, -1.6, 0, 0.22, 1.1, 0.65, stone, 0.1);
      battlement(k, 1.6, 0, 0.22, 1.1, 0.65, stone, 0.1);
      archZ(q, 0.9, 0.1, 0.735, 0.26, 0.4, '#3a342f');
      for (let i = 0; i < 6; i++) archZ(q, -1.3 + i * 0.38, 0.35, 0.735, 0.07, 0.17, '#3a342f');
      // the keep behind, with a pyramid roof, and the long slate-roofed range
      q.box(0.3, 0.1, -0.2, 1.7, 0.85, 0.55, '#bdbbb0');
      q.prism(0.3, 0.95, -0.2, 0.7, 0.34, 1.76, cone, { ry: PI / 2 });
      winsZ(q, 0.3, 0.3, 0.078, 1.5, 0.55, 6, 2, '#3b4856', 0.4, 0.6);
      q.box(-0.55, 0.1, -0.3, 0.6, 1.5, 0.6, '#b6b4a9');
      q.pyramid(-0.55, 1.6, -0.3, 0.74, 0.5, 0.74, cone);
      archZ(q, -0.55, 1.0, 0.0, 0.12, 0.3, '#3b4856');
      for (const [tx, tz, r, h, ch] of [[-1.6, 0.62, 0.36, 1.3, 0.75], [1.6, 0.62, 0.3, 1.05, 0.65], [-1.6, -0.62, 0.3, 1.0, 0.6], [1.6, -0.62, 0.3, 1.1, 0.62]] as const) {
        q.cyl(tx, 0.0, tz, r * 1.08, r, h, stone, { seg: 12 });
        q.cyl(tx, h, tz, r * 1.15, r * 1.15, 0.05, '#c7c5ba', { seg: 12 });
        q.cone(tx, h + 0.05, tz, r * 1.18, ch, cone, { seg: 12 });
        for (let i = 0; i < 3; i++) archZ(q, tx - 0.1 + i * 0.1, h * 0.4, tz + r * 0.95, 0.05, 0.16, '#3a342f');
      }
    });
    k.reserve(cx, cz, 2.2, 1.1);
    // naval cranes in the dockyard
    hammerCrane(k, k.vx(-13.4, 5.4), -13.4, 2.7, '#2c5da8');
    hammerCrane(k, k.vx(-13.9, 7.0), -13.9, 2.4, '#c9402e');
  },
  mole: { dir: 1, endX: -4.85 },
  rows: 3,
  quiet: true,
  flag: { dx: 4.5, z: -12.7 },
};

// ───────────────────────────── Montoir ─────────────────────────────

const MZ = -15.6;
const montoir: Landmark = {
  terrain(k) {
    k.shape.relief = 0.4;
    k.shape.range = 2.5;
    const cx = k.vx(-21.5);
    // the Loire estuary: a strip of water far behind the terminal, crossed by the great bridge
    k.feature((x, z, h) => {
      const dz = Math.abs(z + 21.5);
      const dx = Math.abs(x - cx);
      const w = smooth(2.9, 1.9, dz) * smooth(26, 21, dx);
      return lerp(h, Math.min(h, -0.4), w);
    });
    k.plateau(k.vx(MZ), MZ, 7.0, 2.4, k.baseHeight(k.vx(MZ), MZ - 0.5) + 0.05, 0.5);
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(MZ);
    // three big white LNG tanks with domed roofs and a blue band
    const tanks: Array<[number, number, number]> = [[-2.75, -15.2, 0.95], [-0.1, -15.9, 1.0], [2.65, -15.2, 0.95]];
    k.reserve(cx, -14.4, 8.2, 1.15);
    for (const [dx, tz, r] of tanks) {
      const tx = cx + dx;
      const ty = k.groundMax(tx, tz, r, r);
      p.cyl(tx, ty - 0.3, tz, r + 0.06, r + 0.06, 0.3 + 0.12, '#bdbdb5', { seg: 16 });
      p.cyl(tx, ty + 0.1, tz, r, r, 1.15, '#f2f1eb', { seg: 16 });
      p.cyl(tx, ty + 1.0, tz, r + 0.012, r + 0.012, 0.13, '#3b78b8', { seg: 16, ao: 0 });
      p.cyl(tx, ty + 1.25, tz, r + 0.02, r + 0.02, 0.04, '#d5d5cf', { seg: 16, ao: 0 });
      p.lathe(tx, ty + 1.25, tz, [[r, 0], [r * 0.98, 0.12], [r * 0.83, 0.3], [r * 0.57, 0.45], [r * 0.26, 0.54], [0.0, 0.58]], '#e9e8e2', { seg: 16 });
      p.cyl(tx, ty + 1.83, tz, 0.09, 0.09, 0.1, '#9aa0a6', { seg: 8 });
      p.box(tx + r * 0.45, ty + 1.62, tz + r * 0.2, 0.16, 0.14, 0.16, '#9aa0a6');
      // an access stair and handrail on the wall
      p.rod([tx + r * 0.2, ty + 0.1, tz + r * 0.97], [tx + r * 0.6, ty + 1.25, tz + r * 0.78], 0.015, '#9aa0a6', 4);
      k.reserve(tx, tz, r + 0.1, r + 0.1);
    }
    // the flare stack with a small flame
    const fx = cx + 5.3;
    const fz = -16.4;
    const fy = k.groundMax(fx, fz, 0.2, 0.2);
    p.cyl(fx, fy - 0.1, fz, 0.17, 0.09, 0.1 + 3.4, '#a0a6ac', { seg: 8 });
    p.cyl(fx, fy + 3.05, fz, 0.16, 0.16, 0.06, '#7b8389', { seg: 8, ao: 0 });
    p.cyl(fx, fy + 3.3, fz, 0.13, 0.11, 0.14, '#5f666c', { seg: 8, ao: 0 });
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) p.rod([fx + dx * 0.6, fy, fz + dz * 0.6], [fx, fy + 2.4, fz], 0.014, '#6a7076', 4);
    k.glow.cone(fx, fy + 3.4, fz, 0.17, 0.6, '#ff8f2a', { seg: 6 });
    k.glow.cone(fx - 0.08, fy + 3.4, fz, 0.1, 0.42, '#ff7a1f', { seg: 6, rz: 0.45 });
    k.glow.cone(fx + 0.08, fy + 3.4, fz, 0.1, 0.46, '#ff7a1f', { seg: 6, rz: -0.4 });
    k.glow.cone(fx, fy + 3.4, fz, 0.1, 0.38, '#ffe27a', { seg: 6 });
    k.reserve(fx, fz, 0.6, 0.6);
    // the jetty with loading arms, and a pipe rack running up to the tanks
    const jx = cx + 1.2;
    p.box(jx, 0.46, -11.0, 0.3, 0.07, 3.0, '#a8a69e');
    for (let i = 0; i < 6; i++) p.box(jx, -0.9, -12.0 + i * 0.5 + 0.05, 0.12, 0.9 + 0.46, 0.12, '#8b8880');
    p.box(jx, 0.46, -9.5, 1.1, 0.07, 0.6, '#a8a69e');
    for (const dx of [-0.35, 0, 0.35]) {
      p.box(jx + dx, 0.53, -9.4, 0.05, 0.7, 0.05, '#f1f1ee', { rz: dx * 0.5 });
      p.rod([jx + dx, 1.2, -9.4], [jx + dx, 1.05, -9.05], 0.02, '#3b78b8', 4);
    }
    for (const dx of [-0.8, 0.8]) p.cyl(jx + dx, -0.9, -9.5, 0.1, 0.1, 0.9 + 0.5, '#8b8880', { seg: 8 });
    p.rod([jx - 0.06, 0.62, -12.0], [jx - 0.06, 0.62, -9.5], 0.035, '#9aa0a6', 6);
    p.rod([jx + 0.06, 0.62, -12.0], [jx + 0.06, 0.62, -9.5], 0.03, '#d6d6d0', 6);
    k.reserve(jx, -11.0, 0.8, 1.6);

    // the Saint-Nazaire bridge in the distance: a very long, low, pale deck humped over the shipping channel
    const bz = -21.5;
    const half = 24;
    const prof = (x: number): number => 0.7 + 2.0 * Math.exp(-Math.pow(x / 8.5, 2));
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n;
      top.push([x, prof(x)]);
      bot.push([x, prof(x) - 0.11]);
    }
    p.extrude([...bot, ...top.reverse()], 0.26, cx, 0, bz, '#d6d8d4', { ao: 0 });
    for (let x = -half + 0.8; x < half; x += 1.5) {
      const gy = k.ground(cx + x, bz);
      const dy = prof(x) - 0.11;
      if (dy - gy < 0.15) continue;
      p.box(cx + x, Math.min(gy, 0) - 0.5, bz, 0.2, dy - Math.min(gy, 0) + 0.5, 0.16, '#c4c6c2');
    }
    // a pipe rack along the front of the terminal, a control building and a few small tanks
    const rz = -13.35;
    for (let x = cx - 7.2; x <= cx + 7.2; x += 1.2) {
      const gy = k.ground(x, rz);
      p.box(x, gy - 0.1, rz, 0.06, 0.1 + 0.42, 0.2, '#7b8389');
    }
    const ry = k.ground(cx, rz);
    p.box(cx, ry + 0.4, rz, 14.6, 0.04, 0.22, '#9aa0a6');
    p.rod([cx - 7.3, ry + 0.5, rz - 0.04], [cx + 7.3, ry + 0.5, rz - 0.04], 0.045, '#e6e6e0', 6);
    p.rod([cx - 7.3, ry + 0.5, rz + 0.06], [cx + 7.3, ry + 0.5, rz + 0.06], 0.035, '#3b78b8', 6);
    const by = k.ground(cx - 5.0, -14.2);
    p.box(cx - 5.0, by - 0.1, -14.2, 1.0, 0.1 + 0.4, 0.5, '#e4e0d4');
    p.box(cx - 5.0, by + 0.4, -14.2, 1.06, 0.04, 0.56, '#9aa0a6');
    winsZ(p, cx - 5.0, by + 0.1, -14.2 + 0.256, 0.8, 0.22, 4, 1, '#3b4856', 0.5, 0.8);
    for (const dx of [-5.9, -5.9 + 0.55]) {
      const gy = k.ground(cx + dx, -15.8);
      p.ball(cx + dx, gy + 0.3, -15.8, 0.28, '#e4e4de', { sy: 1 });
    }
    k.reserve(cx - 5.0, -14.2, 0.6, 0.4);
  },
  mole: { dir: 1, endX: -6.9 },
  rows: 1,
  quiet: true,
  flag: { dx: 6.4, z: -12.7 },
};

export const LANDMARKS: Record<string, Landmark> = { marseille, lehavre, rouen, nantes, bordeaux, strasbourg, calais, dunkirk, cherbourg, brest, montoir };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Marseille', 'med', 'marseille'],
  ['Le Havre', 'fr', 'lehavre'],
  ['Rouen', 'fr', 'rouen'],
  ['Nantes', 'fr', 'nantes'],
  ['Bordeaux', 'fr', 'bordeaux'],
  ['Strasbourg', 'fr', 'strasbourg'],
  ['Calais', 'fr', 'calais'],
  ['Dunkirk', 'fr', 'dunkirk'],
  ['Cherbourg', 'fr', 'cherbourg'],
  ['Brest', 'fr', 'brest'],
  ['Montoir', 'fr', 'montoir'],
];

// referenced by landmarks added below

