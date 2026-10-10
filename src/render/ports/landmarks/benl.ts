import * as THREE from 'three';
import { Rng } from '../../../core/rng';
import { PortKit, SHORE_Z, LAND_Y, MOLE_Z, lerp, clamp, type Col, type V3 } from '../kit';
import type { Landmark } from '../landmark';
import type { RegionId } from '../regions';
import { REGIONS } from '../regions';
import { buildTown, tint } from '../town';
import { roundTower, tallShip } from '../structures';
import { gantryCrane, turbine, factory, containerStack } from '../props';
import { lighthouse, LH_STYLES } from '../harbour';

/**
 * Belgium and the Netherlands: Antwerp, Amsterdam, Zeebrugge, Ostend, Vlissingen, Den Helder and Liege.
 * The helpers up here (windows, gothic towers, naves, gables, hulls) are also used by de.ts.
 */

// ───────────────────────────── windows ─────────────────────────────

/** A window quad on a +z face; ~40 % of plain dark ones are the "lit at night" kind. */
export function pane(k: PortKit, x: number, y: number, zf: number, w: number, h: number, col: Col, lit = 0.4): void {
  const z = zf + 0.004;
  const part = lit > 0 && k.rng.chance(lit) ? k.lit : k.solid;
  part.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], col);
}

/** The same on a +x face (z runs the other way: the face is seen from +x). */
export function paneX(k: PortKit, xf: number, y: number, z: number, w: number, h: number, col: Col, lit = 0.4): void {
  const x = xf + 0.004;
  const part = lit > 0 && k.rng.chance(lit) ? k.lit : k.solid;
  part.quad([x, y, z + w / 2], [x, y, z - w / 2], [x, y + h, z - w / 2], [x, y + h, z + w / 2], col);
}

/** A grid of windows on a +z face centred on cx, spanning width w and height h from y0. */
export function winZ(k: PortKit, cx: number, y0: number, zf: number, w: number, h: number, cols: number, rows: number, col: Col, fw = 0.55, fh = 0.55, lit = 0.4): void {
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pane(k, cx - w / 2 + cw * (c + 0.5), y0 + ch * r + (ch * (1 - fh)) / 2, zf, cw * fw, ch * fh, col, lit);
}

/** A grid of windows on a +x face at x = xf, spanning depth d centred on cz. */
export function winX(k: PortKit, xf: number, y0: number, cz: number, d: number, h: number, cols: number, rows: number, col: Col, fw = 0.55, fh = 0.55, lit = 0.4): void {
  const cw = d / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) paneX(k, xf, y0 + ch * r + (ch * (1 - fh)) / 2, cz + d / 2 - cw * (c + 0.5), cw * fw, ch * fh, col, lit);
}

/** A pointed (lancet) window on a +z face. */
export function lancetZ(p: PortKit['solid'], x: number, y: number, zf: number, w: number, h: number, col: Col): void {
  const z = zf + 0.004;
  const sh = h * 0.66;
  p.quad([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + sh, z], [x - w / 2, y + sh, z], col);
  p.tri([x - w / 2, y + sh, z], [x + w / 2, y + sh, z], [x, y + h, z], col);
}

/** A pointed (lancet) window on a +x face. */
export function lancetX(p: PortKit['solid'], xf: number, y: number, z: number, w: number, h: number, col: Col): void {
  const x = xf + 0.004;
  const sh = h * 0.66;
  p.quad([x, y, z + w / 2], [x, y, z - w / 2], [x, y + sh, z - w / 2], [x, y + sh, z + w / 2], col);
  p.tri([x, y + sh, z + w / 2], [x, y + sh, z - w / 2], [x, y + h, z], col);
}

/** A round dial (clock face, rose window) on a +z face (`face` 'z') or a +x face. */
export function dial(p: PortKit['solid'], x: number, y: number, z: number, r: number, col: Col, face: 'z' | 'x' = 'z'): void {
  if (face === 'z') p.cyl(x, y, z - 0.004, r, r, 0.012, col, { rx: Math.PI / 2, seg: 12, ao: 0 });
  else p.cyl(x - 0.004, y, z, r, r, 0.012, col, { rz: -Math.PI / 2, seg: 12, ao: 0 });
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

// ───────────────────────────── gothic towers and naves ─────────────────────────────

export interface SpireOpts {
  w: number;
  /** height of the square shaft (three stages) */
  shaft: number;
  /** height of the octagonal spire on top */
  spire: number;
  stone: Col;
  roof: Col;
  dark?: Col;
  /** small crockets climbing the spire's edges */
  crockets?: boolean;
  /** a gold cross/ball on top */
  finial?: Col;
}

/**
 * A gothic church tower: three stages (buttressed base with lancets, a narrower middle stage, a belfry with
 * louvred openings), four corner pinnacles, and an octagonal spire. Builds in the current frame, foot on y.
 * Returns the y of its tip.
 */
export function spireTower(k: PortKit, x: number, y: number, z: number, o: SpireOpts): number {
  const p = k.solid;
  const w = o.w;
  const H = o.shaft;
  const stone = o.stone;
  const dark = o.dark ?? '#2b313b';
  const trim = tint(stone, 0.1);
  // stage 1: buttressed base
  p.box(x, y - 0.25, z, w, 0.25 + H * 0.5, w, stone);
  for (const [dx, dz] of CORNERS) {
    p.box(x + dx * w * 0.5, y - 0.25, z + dz * w * 0.5, w * 0.2, 0.25 + H * 0.46, w * 0.2, tint(stone, -0.06));
    p.pyramid(x + dx * w * 0.5, y + H * 0.46, z + dz * w * 0.5, w * 0.22, H * 0.06, w * 0.22, o.roof);
  }
  lancetZ(p, x, y + H * 0.12, z + w / 2, w * 0.28, H * 0.3, dark);
  lancetX(p, x + w / 2, y + H * 0.12, z, w * 0.28, H * 0.3, dark);
  p.box(x, y + H * 0.5, z, w + 0.04, H * 0.025, w + 0.04, trim);
  // stage 2: a narrower shaft with paired lancets and a clock-like roundel
  const w2 = w * 0.84;
  p.box(x, y + H * 0.525, z, w2, H * 0.25, w2, tint(stone, 0.03));
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * w2 * 0.2, y + H * 0.58, z + w2 / 2, w2 * 0.13, H * 0.14, dark);
    lancetX(p, x + w2 / 2, y + H * 0.58, z + f * w2 * 0.2, w2 * 0.13, H * 0.14, dark);
  }
  p.box(x, y + H * 0.775, z, w2 + 0.035, H * 0.02, w2 + 0.035, trim);
  // stage 3: the belfry, two tall louvred openings on each face
  const w3 = w * 0.78;
  const by = y + H * 0.795;
  p.box(x, by, z, w3, H * 0.205, w3, stone);
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * w3 * 0.22, by + H * 0.025, z + w3 / 2, w3 * 0.2, H * 0.15, dark);
    lancetX(p, x + w3 / 2, by + H * 0.025, z + f * w3 * 0.22, w3 * 0.2, H * 0.15, dark);
  }
  // corner pinnacles around the foot of the spire
  const top = y + H;
  for (const [dx, dz] of CORNERS) {
    p.box(x + dx * w3 * 0.46, top - 0.02, z + dz * w3 * 0.46, w * 0.1, H * 0.05, w * 0.1, stone);
    p.cone(x + dx * w3 * 0.46, top + H * 0.03, z + dz * w3 * 0.46, w * 0.09, H * 0.17, o.roof, { seg: 4 });
  }
  // the spire: three tapering octagonal stages
  const S = o.spire;
  const cols: Col[] = [o.roof, tint(o.roof, 0.05), tint(o.roof, 0.1)];
  p.cyl(x, top, z, w * 0.46, w * 0.31, S * 0.36, cols[0], { seg: 8, ao: 0.1 });
  p.cyl(x, top + S * 0.36, z, w * 0.31, w * 0.15, S * 0.4, cols[1], { seg: 8, ao: 0 });
  p.cyl(x, top + S * 0.76, z, w * 0.15, w * 0.02, S * 0.24, cols[2], { seg: 8, ao: 0 });
  // four little gables (lucarnes) at the spire's foot
  for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    p.pyramid(x + dx * w * 0.36, top + S * 0.1, z + dz * w * 0.36, w * 0.12, S * 0.07, w * 0.12, stone);
  }
  if (o.crockets) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      for (let j = 0; j < 4; j++) {
        const t = 0.1 + j * 0.2;
        const r = lerp(w * 0.44, w * 0.04, t) * 1.04;
        p.box(x + Math.cos(a) * r, top + S * t, z + Math.sin(a) * r, w * 0.07, S * 0.04, w * 0.07, tint(stone, -0.1), { ao: 0 });
      }
    }
  }
  const tipY = top + S;
  p.cyl(x, tipY - 0.02, z, 0.012, 0.006, 0.2, o.finial ?? '#e8b923', { seg: 4, ao: 0 });
  p.ball(x, tipY + 0.1, z, 0.03, o.finial ?? '#e8b923');
  return tipY + 0.2;
}

/** A stump tower that was never finished: buttressed shaft, belfry and a squat cap. */
export function stubTower(k: PortKit, x: number, y: number, z: number, w: number, h: number, stone: Col, roof: Col, dark: Col = '#2b313b'): void {
  const p = k.solid;
  p.box(x, y - 0.25, z, w, 0.25 + h * 0.62, w, stone);
  for (const [dx, dz] of CORNERS) p.box(x + dx * w * 0.5, y - 0.25, z + dz * w * 0.5, w * 0.2, 0.25 + h * 0.58, w * 0.2, tint(stone, -0.06));
  lancetZ(p, x, y + h * 0.1, z + w / 2, w * 0.28, h * 0.34, dark);
  lancetX(p, x + w / 2, y + h * 0.1, z, w * 0.28, h * 0.34, dark);
  p.box(x, y + h * 0.62, z, w + 0.04, h * 0.03, w + 0.04, tint(stone, 0.1));
  const w3 = w * 0.84;
  p.box(x, y + h * 0.65, z, w3, h * 0.2, w3, tint(stone, 0.03));
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * w3 * 0.22, y + h * 0.68, z + w3 / 2, w3 * 0.2, h * 0.14, dark);
    lancetX(p, x + w3 / 2, y + h * 0.68, z + f * w3 * 0.22, w3 * 0.2, h * 0.14, dark);
  }
  p.box(x, y + h * 0.85, z, w + 0.05, h * 0.03, w + 0.05, tint(stone, 0.12));
  p.pyramid(x, y + h * 0.88, z, w * 0.9, h * 0.12, w * 0.9, roof);
  for (const [dx, dz] of CORNERS) p.pyramid(x + dx * w * 0.42, y + h * 0.88, z + dz * w * 0.42, w * 0.12, h * 0.1, w * 0.12, tint(stone, -0.03));
}

export interface NaveOpts {
  len: number;
  nave: number;
  aisle: number;
  wallH: number;
  aisleH: number;
  roofH: number;
  stone: Col;
  roof: Col;
  bays?: number;
  /** a slender spirelet over the crossing */
  fleche?: boolean;
  apse?: boolean;
  win?: Col;
}

/**
 * A church nave with two aisles, buttresses and flying buttresses, built in a local frame: the west front is
 * the plane z = 0, the nave runs to z = -len, centred on x = 0, foot at y = 0. Call inside k.at().
 */
export function nave(k: PortKit, o: NaveOpts): void {
  const p = k.solid;
  const bays = o.bays ?? 6;
  const half = o.nave / 2 + o.aisle;
  const win = o.win ?? '#2e3a4a';
  const bayLen = o.len / bays;
  p.box(0, -0.25, -o.len / 2, o.nave, o.wallH + 0.25, o.len, o.stone);
  p.prism(0, o.wallH, -o.len / 2, o.nave + 0.1, o.roofH, o.len + 0.04, o.roof);
  const rh = o.aisleH * 0.34;
  for (const s of [1, -1]) {
    const ax = s * (o.nave / 2 + o.aisle / 2);
    p.box(ax, -0.25, -o.len / 2, o.aisle, o.aisleH + 0.25, o.len, tint(o.stone, -0.04));
    p.prism(ax, o.aisleH, -o.len / 2, o.aisle + 0.06, rh, o.len + 0.03, tint(o.roof, 0.04), { ax: -0.5 * s });
  }
  // windows and buttresses on the side facing the camera (+x)
  for (let i = 0; i < bays; i++) {
    const zc = -(i + 0.5) * bayLen;
    lancetX(p, half, o.aisleH * 0.16, zc, bayLen * 0.34, o.aisleH * 0.68, win);
    lancetX(p, o.nave / 2, o.aisleH + rh + 0.05, zc, bayLen * 0.3, o.wallH - o.aisleH - rh - 0.2, win);
  }
  for (let i = 0; i <= bays; i++) {
    const zb = -i * bayLen;
    p.box(half - 0.01, -0.25, zb, 0.1, 0.25 + o.aisleH + 0.2, 0.1, tint(o.stone, -0.08));
    p.pyramid(half - 0.01, o.aisleH + 0.2, zb, 0.12, 0.2, 0.12, o.roof);
    p.rod([half, o.aisleH + 0.18, zb], [o.nave / 2, o.wallH - 0.18, zb], 0.03, tint(o.stone, -0.04), 4);
    p.rod([-half, o.aisleH + 0.18, zb], [-o.nave / 2, o.wallH - 0.18, zb], 0.03, tint(o.stone, -0.04), 4);
  }
  if (o.apse) {
    p.cyl(0, -0.25, -o.len, o.nave / 2, o.nave / 2 * 0.96, o.wallH + 0.25, o.stone, { seg: 8 });
    p.cone(0, o.wallH, -o.len, o.nave / 2 + 0.05, o.roofH * 1.35, o.roof, { seg: 8 });
    p.cyl(0, -0.25, -o.len, half * 0.98, half * 0.98, o.aisleH + 0.25, tint(o.stone, -0.04), { seg: 8 });
    p.cone(0, o.aisleH, -o.len, half * 0.98 + 0.04, rh * 1.6, tint(o.roof, 0.04), { seg: 8 });
  }
  if (o.fleche) {
    const zf = -o.len * 0.42;
    p.box(0, o.wallH + o.roofH * 0.6, zf, 0.2, 0.2, 0.2, o.stone);
    p.cyl(0, o.wallH + o.roofH * 0.6 + 0.2, zf, 0.1, 0.012, 1.15, o.roof, { seg: 6 });
  }
}

// ───────────────────────────── gabled townhouses ─────────────────────────────

export type GableKind = 'step' | 'bell' | 'neck' | 'spout' | 'pediment';

/** Right half of a gable's outline, base to top, as [fraction of half-width, fraction of height]. */
const GABLES: Record<GableKind, Array<[number, number]>> = {
  step: [[1, 0], [1, 0.17], [0.8, 0.17], [0.8, 0.34], [0.6, 0.34], [0.6, 0.51], [0.4, 0.51], [0.4, 0.68], [0.2, 0.68], [0.2, 0.86], [0, 0.86]],
  bell: [[1, 0], [1, 0.14], [0.86, 0.22], [0.62, 0.32], [0.52, 0.44], [0.54, 0.58], [0.6, 0.7], [0.5, 0.84], [0.3, 0.95], [0, 1]],
  neck: [[1, 0], [1, 0.2], [0.8, 0.24], [0.52, 0.38], [0.44, 0.5], [0.44, 0.84], [0.54, 0.86], [0.54, 0.94], [0, 1.1]],
  spout: [[1, 0], [1, 0.3], [0.84, 0.36], [0.6, 0.6], [0.42, 0.72], [0.32, 0.86], [0.32, 0.96], [0, 1]],
  pediment: [[1, 0], [1, 0.1], [1.06, 0.1], [1.06, 0.17], [0.6, 0.17], [0, 0.62]],
};

function gableOutline(kind: GableKind, hw: number, gh: number): Array<[number, number]> {
  const r = GABLES[kind].map(([fx, fy]) => [fx * hw, fy * gh] as [number, number]);
  const l: Array<[number, number]> = [];
  for (let i = r.length - 1; i >= 0; i--) if (r[i][0] > 1e-6) l.push([-r[i][0], r[i][1]]);
  return [...r, ...l];
}

/** A gable plate standing on y = top at the front face zf: a pale border plate behind a wall-coloured one. */
export function gable(p: PortKit['solid'], kind: GableKind, x: number, top: number, zf: number, w: number, gh: number, wall: Col, trim: Col, depth = 0.1): void {
  p.extrude(gableOutline(kind, (w / 2) * 1.04, gh * 1.05), depth * 0.7, x, top - 0.01, zf - depth * 0.3, trim, { ao: 0.06 });
  p.extrude(gableOutline(kind, (w / 2) * 0.9, gh * 0.95), depth, x, top, zf - depth * 0.45 + 0.012, wall, { ao: 0.06 });
}

export interface HouseOpts {
  roof?: Col;
  trim?: Col;
  /** floor height */
  fh?: number;
  y?: number;
  /** floors of window rows, columns */
  cols?: number;
  gh?: number;
}

/** A tall, narrow gabled townhouse (canal house, guild house): front windows with pale frames, a shaped gable. */
export function canalHouse(k: PortKit, x: number, z: number, w: number, d: number, floors: number, wall: Col, kind: GableKind, o: HouseOpts = {}): number {
  const p = k.solid;
  const fh = o.fh ?? 0.46;
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const H = floors * fh;
  const trim = o.trim ?? '#efe9dc';
  const zf = z + d / 2;
  const cols = o.cols ?? (w > 0.58 ? 2 : 1);
  p.box(x, y - 0.25, z, w, 0.25 + H, d, wall);
  const cw = w / cols;
  for (let f = 0; f < floors; f++) {
    const ww = Math.min(0.2, cw * 0.55) * (f === floors - 1 ? 0.85 : 1);
    const wh = fh * 0.62;
    for (let c = 0; c < cols; c++) {
      const cx = x - w / 2 + cw * (c + 0.5);
      if (f === 0 && c === Math.floor(cols / 2)) {
        // the front door with its stoop
        p.box(cx, y, zf - 0.005, ww * 0.9, fh * 0.55, 0.02, '#4a3a30', { ao: 0 });
        p.box(cx, y - 0.03, zf, ww * 1.5, 0.07, 0.08, '#b9b3a4');
        continue;
      }
      const yy = y + f * fh + fh * 0.2;
      p.quad([cx - ww / 2 - 0.018, yy - 0.018, zf + 0.003], [cx + ww / 2 + 0.018, yy - 0.018, zf + 0.003], [cx + ww / 2 + 0.018, yy + wh + 0.018, zf + 0.003], [cx - ww / 2 - 0.018, yy + wh + 0.018, zf + 0.003], trim);
      pane(k, cx, yy, zf + 0.002, ww, wh, '#33465a', 0.3);
    }
    if (f > 0) p.box(x, y + f * fh - 0.012, z, w + 0.02, 0.024, d + 0.02, tint(trim, -0.04), { ao: 0 });
  }
  p.box(x, y + H - 0.02, z, w + 0.045, 0.045, d + 0.045, trim, { ao: 0 });
  const gh = o.gh ?? 0.3 + w * 0.6;
  gable(p, kind, x, y + H, zf, w, gh, wall, trim);
  p.prism(x, y + H, z - 0.03, w - 0.02, gh * 0.72, d - 0.06, o.roof ?? '#4b5058');
  k.reserve(x, z, w / 2 + 0.01, d / 2 + 0.01);
  return y + H + gh;
}

// ───────────────────────────── ships ─────────────────────────────

export interface HullOpts {
  /** below the waterline and above it */
  depth?: number;
  freeboard?: number;
  /** fraction of the length that stays full width before the bow narrows */
  bow?: number;
}

/**
 * A faceted hull with its bow toward +x, length `len`, beam `b`: stern at -len/2. Builds in the current frame,
 * water at y = 0. Returns nothing: decks and houses are boxes added by the callers.
 */
export function hull(p: PortKit['solid'], len: number, b: number, col: Col, o: HullOpts = {}): void {
  const d = o.depth ?? 0.22;
  const h = o.freeboard ?? 0.4;
  const L = len;
  const bow = o.bow ?? 0.18;
  const v: V3[] = [
    [-L / 2, -d, -b * 0.36], [-L / 2, -d, b * 0.36], [-L / 2, h, b * 0.5], [-L / 2, h, -b * 0.5],
    [L * (0.5 - bow - 0.08), -d, b * 0.42], [L * (0.5 - bow - 0.08), -d, -b * 0.42], [L * (0.5 - bow), h, b * 0.5], [L * (0.5 - bow), h, -b * 0.5],
    [L / 2 + 0.03 * L, h, 0], [L / 2 - 0.05 * L, -d * 0.4, 0],
  ];
  p.solid(v, [[0, 1, 2, 3], [0, 1, 4, 5], [4, 5, 9], [1, 2, 6, 4], [0, 3, 7, 5], [3, 2, 6, 7], [7, 6, 8], [4, 6, 8, 9], [5, 7, 8, 9]], col, { ao: 0.1 });
}

/** A ro-ro ferry: dark hull, a white car-deck block, accommodation decks, bridge and funnel; bow toward +x. */
export function ferry(k: PortKit, x: number, z: number, len: number, o: { ry?: number; hullCol?: Col; funnel?: Col; stripe?: Col } = {}): void {
  const p = k.solid;
  const s = len / 5.6;
  k.at(x, 0, z, o.ry ?? 0, s, () => {
    hull(p, 5.6, 1.1, o.hullCol ?? '#1d2f4d', { freeboard: 0.5, depth: 0.22 });
    p.box(-0.45, 0.5, 0, 4.6, 0.02, 1.06, '#cfd3d6', { ao: 0 });
    // car decks: a long white box with rows of small dark openings
    p.box(-0.45, 0.5, 0, 4.5, 0.5, 1.02, '#f4f1ea');
    p.box(-0.45, 0.62, 0.516, 4.5, 0.05, 0.004, o.stripe ?? '#c8302a', { ao: 0 });
    for (let i = 0; i < 18; i++) pane(k, -2.5 + i * 0.25, 0.78, 0.51, 0.13, 0.11, '#2f3d4f', 0.25);
    // accommodation: two stepped decks, then the bridge house
    p.box(-0.5, 1.0, 0, 3.4, 0.36, 0.96, '#f6f3ec');
    p.box(-0.3, 1.36, 0, 2.2, 0.3, 0.88, '#f1eee6');
    for (let i = 0; i < 14; i++) {
      pane(k, -1.9 + i * 0.22, 1.12, 0.48, 0.12, 0.1, '#2f3d4f', 0.25);
      if (i > 2 && i < 12) pane(k, -1.2 + (i - 3) * 0.2, 1.46, 0.44, 0.11, 0.1, '#2f3d4f', 0.25);
    }
    p.box(0.55, 1.66, 0, 0.8, 0.22, 0.8, '#ece9e1');
    p.box(0.95, 1.7, 0, 0.04, 0.14, 0.82, '#2f3d4f', { ao: 0 });
    p.box(0.6, 1.88, 0, 0.7, 0.025, 0.84, '#c9ccd0', { ao: 0 });
    // funnel with a colour band, and a mast
    p.cyl(-1.0, 1.66, 0, 0.26, 0.2, 0.62, o.funnel ?? '#c8302a', { seg: 8 });
    p.cyl(-1.0, 2.1, 0, 0.21, 0.21, 0.1, '#23282f', { seg: 8, ao: 0 });
    p.cyl(0.7, 1.9, 0, 0.012, 0.01, 0.4, '#8a8f94', { seg: 4, ao: 0 });
    // lifeboats
    for (const f of [-1, 1]) p.box(-0.2 + f * 0.3, 1.34, 0.5, 0.4, 0.07, 0.07, '#e9702c');
    // the bow visor and the stern ramp
    p.box(2.0, 0.5, 0, 0.1, 0.42, 0.56, '#e9e6dd');
    p.box(-2.74, 0.12, 0, 0.04, 0.34, 0.8, '#2c3440', { ao: 0 });
  });
}

/** A frigate: a grey hull with a forward gun, tall superstructure with a radar cube and funnels, hangar aft. */
export function frigate(k: PortKit, x: number, z: number, len: number, o: { ry?: number; hullCol?: Col } = {}): void {
  const p = k.solid;
  const s = len / 5.4;
  const grey = o.hullCol ?? '#8c969d';
  k.at(x, 0, z, o.ry ?? 0, s, () => {
    hull(p, 5.4, 0.86, grey, { freeboard: 0.36, depth: 0.2, bow: 0.22 });
    p.box(-0.1, 0.36, 0, 4.2, 0.02, 0.8, '#7b858c', { ao: 0 });
    // forward gun
    p.cyl(1.7, 0.36, 0, 0.12, 0.1, 0.1, '#6e777e', { seg: 8 });
    p.box(1.7, 0.46, 0, 0.18, 0.11, 0.17, '#98a2a8');
    p.rod([1.76, 0.52, 0], [2.14, 0.54, 0], 0.012, '#6e777e', 4);
    // the main superstructure: a stepped block with a lighter top and rows of windows
    p.box(0.1, 0.36, 0, 1.7, 0.34, 0.72, '#a4adb3');
    p.box(0.45, 0.7, 0, 1.0, 0.28, 0.62, '#9aa4ab');
    for (let i = 0; i < 7; i++) pane(k, -0.65 + i * 0.22, 0.48, 0.36, 0.1, 0.09, '#2f3d4f', 0.2);
    for (let i = 0; i < 4; i++) pane(k, 0.1 + i * 0.22, 0.83, 0.31, 0.1, 0.08, '#2f3d4f', 0.2);
    // the sensor mast with its radar cube and dome
    p.box(0.55, 0.98, 0, 0.5, 0.3, 0.46, '#8e989f');
    p.box(0.55, 1.28, 0, 0.42, 0.42, 0.42, '#a9b3b9');
    p.box(0.55, 1.7, 0, 0.14, 0.1, 0.14, '#8c969d');
    p.cyl(0.55, 1.8, 0, 0.01, 0.01, 0.36, '#6e777e', { seg: 4, ao: 0 });
    p.ball(0.0, 1.0, 0, 0.12, '#e9ecee', { sy: 0.9 });
    // twin funnels and the hangar aft
    p.box(-0.55, 0.7, 0, 0.55, 0.3, 0.5, '#98a2a8');
    p.box(-0.55, 0.98, 0, 0.3, 0.14, 0.34, '#7f8990', { rz: 0.0 });
    p.box(-1.6, 0.36, 0, 1.2, 0.34, 0.66, '#9ea8ae');
    p.box(-2.2, 0.36, 0, 0.02, 0.1, 0.6, '#3c444b', { ao: 0 });
    // the flight deck, a pennant number stripe and the guardrail
    p.box(-2.3, 0.37, 0, 0.5, 0.01, 0.7, '#6f7a80', { ao: 0 });
    p.box(-0.1, 0.2, 0.4, 3.6, 0.07, 0.01, '#f1f2ee', { ao: 0 });
    p.box(-0.1, 0.38, 0.4, 3.9, 0.07, 0.01, '#707a81', { ao: 0 });
  });
}

/** A Rhine barge: low black hull, a white wheelhouse aft and a mound of cargo. */
export function barge(k: PortKit, x: number, z: number, len: number, cargo: 'coal' | 'boxes' | 'sand' | 'tank', rng: Rng, ry = 0, hullCol: Col = '#2b3038'): void {
  const p = k.solid;
  const s = len / 3.6;
  k.at(x, 0, z, ry, s, () => {
    p.box(0, -0.12, 0, 3.4, 0.27, 0.62, hullCol, { ao: 0.1 });
    p.box(1.72, -0.12, 0, 0.3, 0.2, 0.42, hullCol, { ao: 0.1 });
    p.box(0, 0.14, 0, 3.42, 0.025, 0.64, '#c9402e', { ao: 0 });
    p.box(-1.3, 0.14, 0, 0.55, 0.3, 0.46, '#f4f1ea');
    p.box(-1.3, 0.44, 0, 0.6, 0.03, 0.5, '#6a727b', { ao: 0 });
    p.box(-1.05, 0.2, 0, 0.02, 0.1, 0.34, '#2f3d4f', { ao: 0 });
    p.cyl(-1.5, 0.44, 0.1, 0.012, 0.012, 0.25, '#4a4f56', { seg: 4 });
    switch (cargo) {
      case 'coal':
        p.box(0.35, 0.14, 0, 2.2, 0.16, 0.5, '#23262b');
        for (let i = 0; i < 4; i++) p.rock(-0.3 + i * 0.55, 0.28, 0, 0.3, '#2b2e34', { sy: 0.45, ry: rng.next() * 3 });
        break;
      case 'sand':
        p.box(0.35, 0.14, 0, 2.2, 0.12, 0.5, '#c9b88a');
        for (let i = 0; i < 4; i++) p.rock(-0.3 + i * 0.55, 0.24, 0, 0.3, '#d6c493', { sy: 0.4, ry: rng.next() * 3 });
        break;
      case 'boxes':
        for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) p.box(-0.55 + i * 0.46, 0.17 + j * 0.15, 0, 0.42, 0.14, 0.5, ['#c8302a', '#2c5da8', '#e9a31a', '#3f8d6b', '#d9d4c7'][(i * 2 + j) % 5]);
        break;
      case 'tank':
        for (let i = 0; i < 2; i++) p.cyl(-0.1 + i * 1.3, 0.15, 0, 0.24, 0.24, 1.15, '#c9c5ba', { seg: 10, rz: Math.PI / 2 });
        break;
    }
  });
}

// ───────────────────────────── landmarks ─────────────────────────────

const BRICKS = ['#a3472f', '#b5543a', '#8c3d2f', '#c4673f', '#9a4a38', '#c98a5c', '#b0603f'];

const antwerp: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.25;
    k.shape.range = 0.9;
    k.plateau(k.vx(-16, 0.6), -16, 5.2, 4.8, LAND_Y + 0.05);
    // the square in front of the cathedral is paved
    k.paint((x, y, z, slope, c) => {
      if (z > -16 && z < -12.6 && Math.abs(x - (k.vx(-14, 0.2))) < 3.2) c.lerp(new THREE.Color('#d6cfbc'), 0.85);
    });
  },
  build(k) {
    const p = k.solid;
    const x0 = k.vx(-15, 0.3);
    const z0 = -15.5;
    const a = -0.3;
    const y0 = LAND_Y + 0.05;
    const stone = '#e6ddc6';
    const slate = '#59636e';
    const spireCol = '#cdc5ae';
    k.at(x0, y0, z0, a, 1, () => {
      // the west front: a central block between the towers, with portals, a great window and a gable
      const cw = 1.4;
      p.box(0, -0.25, -0.5, cw, 0.25 + 2.5, 1.0, stone);
      p.box(0, 1.55, 0.02, cw + 0.02, 0.05, 0.06, tint(stone, -0.08), { ao: 0 });
      lancetZ(p, 0, 0, 0, 0.5, 1.1, '#3a2f2a');
      lancetZ(p, -0.5, 0, 0, 0.22, 0.7, '#3a2f2a');
      lancetZ(p, 0.5, 0, 0, 0.22, 0.7, '#3a2f2a');
      for (const dx of [-0.5, 0, 0.5]) p.cone(dx, 0.9 - (dx === 0 ? 0 : 0.35) + 0.02, 0.05, 0.1, 0.22, tint(stone, -0.06), { seg: 4 });
      const gz = 0.012;
      k.glass.quad([-0.22, 1.25, gz], [0.22, 1.25, gz], [0.22, 2.0, gz], [-0.22, 2.0, gz], '#6f93b0');
      k.glass.tri([-0.22, 2.0, gz], [0.22, 2.0, gz], [0, 2.4, gz], '#6f93b0');
      p.extrude([[-0.7, 0], [0.7, 0], [0, 1.0]], 0.14, 0, 2.5, -0.07, tint(stone, 0.04), { ao: 0.05 });
      dial(p, 0, 2.62, 0.0, 0.12, '#3a4a60');
      for (const dx of [-0.66, 0.66]) {
        p.box(dx, 2.3, -0.06, 0.1, 0.4, 0.12, tint(stone, -0.05));
        p.cone(dx, 2.7, -0.06, 0.07, 0.5, spireCol, { seg: 4 });
      }
      p.cone(0, 3.45, -0.06, 0.05, 0.4, spireCol, { seg: 4 });
      // the north tower: very tall and slender, the south tower stops short
      spireTower(k, 1.175, 0, -0.475, { w: 0.95, shaft: 3.4, spire: 3.7, stone, roof: spireCol, crockets: true });
      stubTower(k, -1.175, 0, -0.475, 0.95, 3.0, stone, '#5f7a72');
      // the long nave behind
      k.at(0, 0, -1.0, 0, 1, () => nave(k, { len: 4.4, nave: 1.4, aisle: 0.95, wallH: 2.0, aisleH: 1.1, roofH: 1.1, stone, roof: slate, bays: 6, fleche: true, apse: true }));
    });
    // the cathedral stands in one reserved rectangle after another along its axis
    for (let i = 0; i < 6; i++) k.reserve(x0 + i * 0.3 + 0.1, z0 - 0.8 - i * 0.9, 1.9, 0.75);
    k.reserve(k.vx(-14, 0.2), -14.1, 3.1, 1.5);
    // brick guild houses with shaped gables on both sides of the square
    const kinds: GableKind[] = ['step', 'bell', 'neck', 'spout', 'step', 'bell', 'neck', 'spout'];
    const rng = new Rng(k.seed ^ 12345);
    let xx = x0 - 6.6;
    for (let i = 0; i < 4; i++) {
      const w = 0.62 + rng.next() * 0.16;
      canalHouse(k, xx + w / 2, -13.15, w, 0.7, 3 + (i % 2), BRICKS[(i * 3 + 1) % BRICKS.length], kinds[i]);
      xx += w + 0.02;
    }
    xx = x0 + 3.1;
    for (let i = 0; i < 4; i++) {
      const w = 0.62 + rng.next() * 0.16;
      canalHouse(k, xx + w / 2, -13.15, w, 0.7, 3 + ((i + 1) % 2), BRICKS[(i * 2 + 2) % BRICKS.length], kinds[i + 4]);
      xx += w + 0.02;
    }
  },
  mole: { armour: 'tetrapods' },
  quiet: true,
  rows: 3,
};

/** The Westerkerk tower: brick shaft, clock stage, stone lantern, a blue bulb and the gold imperial crown. */
function westerkerk(k: PortKit, x: number, y: number, z: number, s = 1): void {
  const p = k.solid;
  const brick = '#a9503a';
  const stone = '#e4dcc8';
  const dark = '#2b313b';
  const w = 1.0 * s;
  const h1 = 2.5 * s;
  p.box(x, y - 0.25, z, w, 0.25 + h1, w, brick);
  for (const [dx, dz] of CORNERS) p.box(x + dx * w * 0.5, y - 0.25, z + dz * w * 0.5, 0.13 * s, 0.25 + h1, 0.13 * s, stone);
  for (const f of [-1, 1]) {
    lancetZ(p, x + f * w * 0.22, y + h1 * 0.14, z + w / 2, w * 0.17, h1 * 0.4, dark);
    lancetX(p, x + w / 2, y + h1 * 0.14, z + f * w * 0.22, w * 0.17, h1 * 0.4, dark);
  }
  p.box(x, y + h1 * 0.62, z + w / 2, w * 0.6, 0.05, 0.02, stone, { ao: 0 });
  p.box(x, y + h1, z, w + 0.1, 0.07, w + 0.1, stone);
  // the clock stage
  const w2 = 0.84 * s;
  const y2 = y + h1 + 0.07;
  const h2 = 0.95 * s;
  p.box(x, y2, z, w2, h2, w2, brick);
  for (const [dx, dz] of CORNERS) p.box(x + dx * w2 * 0.5, y2, z + dz * w2 * 0.5, 0.11 * s, h2, 0.11 * s, stone);
  dial(p, x, y2 + h2 * 0.5, z + w2 / 2 + 0.008, 0.27 * s, '#f1ead6');
  dial(p, x + w2 / 2 + 0.008, y2 + h2 * 0.5, z, 0.27 * s, '#f1ead6', 'x');
  p.box(x, y2 + h2 * 0.5, z + w2 / 2 + 0.03, 0.02, 0.2 * s, 0.01, dark, { ao: 0 });
  p.box(x + 0.05, y2 + h2 * 0.5 - 0.01, z + w2 / 2 + 0.03, 0.1 * s, 0.02, 0.01, dark, { ao: 0 });
  p.box(x, y2 + h2, z, w2 + 0.1, 0.06, w2 + 0.1, stone);
  // the open stone lantern: an octagon with dark openings
  const y3 = y2 + h2 + 0.06;
  const h3 = 0.75 * s;
  p.cyl(x, y3, z, 0.42 * s, 0.4 * s, h3, stone, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.box(x + Math.cos(a) * 0.38 * s, y3 + h3 * 0.2, z + Math.sin(a) * 0.38 * s, 0.13 * s, h3 * 0.6, 0.13 * s, dark, { ao: 0, ry: -a });
  }
  p.cyl(x, y3 + h3, z, 0.46 * s, 0.46 * s, 0.05, tint(stone, -0.08), { seg: 8 });
  // the blue-grey bulb and the lantern above it
  const y4 = y3 + h3 + 0.05;
  p.lathe(x, y4, z, [[0.36 * s, 0], [0.43 * s, 0.1 * s], [0.38 * s, 0.3 * s], [0.22 * s, 0.5 * s], [0.14 * s, 0.62 * s], [0.14 * s, 0.78 * s]], '#3d5068', { seg: 10 });
  p.cyl(x, y4 + 0.78 * s, z, 0.2 * s, 0.2 * s, 0.05, '#e5b72f', { seg: 8 });
  p.cyl(x, y4 + 0.83 * s, z, 0.1 * s, 0.1 * s, 0.22 * s, stone, { seg: 8 });
  // the imperial crown: gold band, red and blue arches, a cross
  const y5 = y4 + 1.0 * s;
  p.cyl(x, y5, z, 0.26 * s, 0.26 * s, 0.07 * s, '#e5b72f', { seg: 8 });
  p.lathe(x, y5 + 0.07 * s, z, [[0.26 * s, 0], [0.3 * s, 0.1 * s], [0.26 * s, 0.24 * s], [0.14 * s, 0.34 * s], [0.0, 0.38 * s]], '#c8302a', { seg: 8 });
  for (let i = 0; i < 4; i++) p.box(x + Math.cos((i * Math.PI) / 4) * 0.0, y5 + 0.07 * s, z, 0.02, 0.36 * s, 0.56 * s, '#e5b72f', { ao: 0, ry: (i * Math.PI) / 4 });
  p.ball(x, y5 + 0.48 * s, z, 0.1 * s, '#2d5da8', { sy: 0.9 });
  p.cyl(x, y5 + 0.55 * s, z, 0.02, 0.02, 0.26 * s, '#e5b72f', { seg: 5 });
  p.box(x, y5 + 0.72 * s, z, 0.12 * s, 0.03, 0.03, '#e5b72f', { ao: 0 });
  k.reserve(x, z, w * 0.6, w * 0.6);
}

const amsterdam: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.8;
    k.plateau(k.vx(-15, 0.5), -15, 6.2, 3.0, LAND_Y + 0.05);
  },
  build(k) {
    const kinds: GableKind[] = ['neck', 'bell', 'step', 'spout', 'neck', 'bell', 'step'];
    const floors = [4, 5, 4, 5, 4, 4, 5];
    const ws = [0.72, 0.66, 0.78, 0.7, 0.8, 0.68, 0.74];
    const walls = ['#9c4a35', '#b5543a', '#7e3b2e', '#c4673f', '#a9503a', '#8f4332', '#c98a5c'];
    let x = k.vx(-13.4, -4.4);
    const zr = -13.45;
    for (let i = 0; i < kinds.length; i++) {
      canalHouse(k, x + ws[i] / 2, zr + (i % 2) * 0.02, ws[i], 0.72, floors[i], walls[i], kinds[i], { fh: 0.5, gh: 0.3 + ws[i] * 0.62 });
      x += ws[i] + 0.01;
    }
    // the Westerkerk tower rising behind and beside the row
    westerkerk(k, x + 0.55, k.groundMax(x + 0.55, -14.6, 0.5, 0.5), -14.6);
    // the church body
    const cy = k.groundMax(x + 0.55, -17.3, 1.0, 1.0);
    k.solid.box(x + 0.55, cy - 0.25, -17.3, 2.2, 0.25 + 1.5, 2.6, '#a9503a');
    k.solid.prism(x + 0.55, cy + 1.5, -17.3, 2.35, 1.0, 2.7, '#58636d');
    k.reserve(x + 0.55, -17.3, 1.2, 1.4);
    // a few plane trees on the quay
    const rng = new Rng(k.seed ^ 12345);
    for (let i = 0; i < 4; i++) {
      const tx = k.vx(-12.7) - 6 + i * 3.3 + rng.range(-0.3, 0.3);
      if (k.isReserved(tx, -12.75, 0.1)) continue;
      k.solid.cyl(tx, LAND_Y, -12.75, 0.025, 0.02, 0.28, '#6a523f', { seg: 5 });
      k.solid.blob(tx, LAND_Y + 0.42, -12.75, 0.22, '#5b8a4d', { sy: 0.9 });
    }
  },
  mole: { armour: 'rocks' },
  quiet: true,
  rows: 3,
};

const zeebrugge: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
  },
  build(k) {
    const p = k.solid;
    const rng = new Rng(k.seed ^ 12345);
    const cx = k.vx(-12);
    // a ro-ro ferry alongside the quay, ramp aft, bridge forward
    const hs = -k.mole.dir; // the side of the breakwater's head: keep the ferry clear of it
    ferry(k, k.vx(-10.6, -hs * 1.4), -10.6, 6.4, { hullCol: '#1d2f4d', funnel: '#d62f2b', stripe: '#c8302a' });
    // container cranes and stacks on the terminal to the right
    gantryCrane(k, cx + 3.2, SHORE_Z - 0.45, { color: '#2c5da8', s: 0.95 });
    gantryCrane(k, cx + 5.0, SHORE_Z - 0.45, { color: '#2c5da8', s: 0.95 });
    containerStack(k, cx + 1.7, -13.2, 10, 3, 3, rng);
    containerStack(k, cx + 1.9, -14.6, 9, 3, 3, rng);
    // low terminal sheds on the left
    factory(k, cx - 4.6, -13.5, 1.9, 0.8, 0.5, '#d4d1c6', '#8d98a1');
    factory(k, cx - 2.2, -13.6, 1.8, 0.8, 0.55, '#c9d3d8', '#8d98a1');
    // the wind farm on the land behind
    const ws: Array<[number, number]> = [[-6.8, -15.4], [-3.9, -17.0], [-0.8, -16.2], [2.2, -18.4], [5.1, -16.6], [7.6, -18.2]];
    for (const [dx, z] of ws) {
      const tx = cx + dx;
      if (k.isReserved(tx, z, 0.2)) continue;
      turbine(k, tx, z, 2.5);
      k.reserve(tx, z, 0.2, 0.2);
    }
    // the Mole: a round fort tower on the long breakwater
    const dir = k.mole.dir;
    const fx = k.mole.endX + dir * 2.7;
    roundTower(k, fx, MOLE_Z, 0.46, 1.0, '#bcb199', null, 0.28);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.box(fx + Math.cos(a) * 0.3, 0.28 + 0.3, MOLE_Z + Math.sin(a) * 0.3 + 0.0, 0.05, 0.1, 0.02, '#2b313b', { ao: 0 });
    }
    p.cyl(fx, 1.35, MOLE_Z, 0.16, 0.16, 0.5, '#a89f8a', { seg: 8 });
    p.cone(fx, 1.85, MOLE_Z, 0.21, 0.28, '#7a3f32', { seg: 8 });
  },
  mole: { armour: 'tetrapods' },
  quiet: true,
  rows: 3,
};

const ostend: Landmark = {
  terrain(k) {
    k.shore = 'dike';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
    k.plateau(k.vx(-14.5), -14.5, 7.5, 2.6, LAND_Y + 0.12);
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(-14.2, 0.2);
    const hs = -k.mole.dir; // the side of the breakwater's head
    const zc = -14.9;
    const y = LAND_Y + 0.12;
    const R = 6.6;
    const n = 9;
    const span = 0.72;
    // the Kursaal: a long white building bent into an arc around the sea front
    for (let i = 0; i < n; i++) {
      const th = ((i / (n - 1)) * 2 - 1) * span;
      const sx = cx + R * Math.sin(th);
      const sz = zc + R * (1 - Math.cos(th));
      const chord = R * (span * 2 / (n - 1)) * 1.04;
      const mid = i === (n - 1) / 2;
      const h = mid ? 1.9 : 1.4;
      const d = mid ? 1.1 : 0.9;
      k.at(sx, y, sz, -th, 1, () => {
        p.box(0, -0.25, 0, chord, 0.25 + h, d, '#f6f3ec');
        p.box(0, h, 0, chord + 0.03, 0.06, d + 0.12, '#e6e1d4');
        k.glass.quad([-chord / 2 + 0.06, 0.34, d / 2 + 0.004], [chord / 2 - 0.06, 0.34, d / 2 + 0.004], [chord / 2 - 0.06, h * 0.72, d / 2 + 0.004], [-chord / 2 + 0.06, h * 0.72, d / 2 + 0.004], '#5e93b6');
        for (let c = 0; c <= 4; c++) p.cyl(-chord / 2 + 0.05 + (c * (chord - 0.1)) / 4, 0, d / 2 + 0.1, 0.028, 0.028, h - 0.02, '#ffffff', { seg: 6, ao: 0.06 });
        p.box(0, h - 0.18, d / 2 + 0.05, chord, 0.04, 0.12, '#ffffff', { ao: 0 });
        winZ(k, 0, h * 0.78, d / 2 + 0.01, chord * 0.9, h * 0.16, 3, 1, '#2f3d4f', 0.6, 0.7, 0.3);
        if (mid) {
          // a drum and a dome in the middle
          p.cyl(0, h + 0.06, 0, 0.5, 0.5, 0.3, '#f6f3ec', { seg: 12 });
          p.lathe(0, h + 0.36, 0, [[0.52, 0], [0.5, 0.06], [0.4, 0.28], [0.24, 0.44], [0.08, 0.52], [0.0, 0.54]], '#8fb8a8', { seg: 12 });
          p.cyl(0, h + 0.88, 0, 0.012, 0.012, 0.4, '#b9bcc0', { seg: 4 });
          k.glass.cyl(0, h + 0.06, 0.0, 0.5, 0.5, 0.0, '#5e93b6');
        }
      });
    }
    k.reserve(cx, -13.55, 4.9, 0.8);
    for (let i = 0; i < n + 2; i++) k.reserve(cx + R * Math.sin(((i / (n + 1)) * 2 - 1) * span), zc + R * (1 - Math.cos(((i / (n + 1)) * 2 - 1) * span)), 0.9, 0.8);
    // the red-and-white lighthouse on the sea wall
    const lx = cx - hs * 5.4;
    const lz = -13.5;
    const ly = k.ground(lx, lz);
    p.cyl(lx, ly - 0.25, lz, 0.5, 0.46, 0.45, '#b9b3a4', { seg: 12 });
    lighthouse(k, lx, ly + 0.2, lz, { ...LH_STYLES[0], h: 3.3, r0: 0.3, r1: 0.2, seg: 12 });
    k.reserve(lx, lz, 0.6, 0.6);
    // the three-masted barque Mercator moored in front
    tallShip(k, k.vx(-9.9, -hs * 1.6), -9.9, 4.2, 3, '#f2efe6', { ry: -1.85, sail: '#ffffff', trim: '#2b3340' });
    // a sea-wall promenade with lamp posts
    p.box(cx, y - 0.1, -12.62, 16, 0.2, 0.22, '#c9c4b6');
    for (let i = 0; i < 9; i++) {
      const lx2 = cx - 7.5 + i * 1.9;
      p.cyl(lx2, y + 0.08, -12.7, 0.014, 0.014, 0.26, '#2d3138', { seg: 4 });
      k.glow.ball(lx2, y + 0.36, -12.7, 0.03, '#fff1b0');
    }
  },
  mole: { armour: 'wall', light: { h: 1.5, bands: [['#f6f3ea', 1]], cap: '#2f7a5c', gallery: '#2f7a5c' } },
  quiet: true,
  rows: 3,
};

const vlissingen: Landmark = {
  terrain(k) {
    k.shore = 'dike';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
    k.plateau(k.vx(-13.6, 0.3), -13.6, 4.2, 1.5, LAND_Y + 0.26);
  },
  build(k) {
    const p = k.solid;
    const sx = k.vx(-13.5, 0.3);
    const sz = -13.55;
    const y = LAND_Y + 0.26;
    const stone = '#d8d0bc';
    const bronze = '#4f6f5f';
    // the boulevard: a paved terrace with a balustrade and lamps
    p.box(sx, y - 0.2, -12.78, 11, 0.2 + 0.0, 0.32, '#c9c3b2');
    p.box(sx, y, -12.78, 11, 0.12, 0.06, tint(stone, -0.05));
    for (let i = 0; i < 10; i++) {
      const lx = sx - 5 + i * 1.1;
      p.cyl(lx, y, -12.85, 0.014, 0.014, 0.32, '#2d3138', { seg: 4 });
      k.glow.ball(lx, y + 0.35, -12.85, 0.035, '#fff1b0');
    }
    // the plinth: steps, a tall pedestal with a cornice
    p.box(sx, y - 0.2, sz, 2.0, 0.3, 1.3, '#b9b3a4');
    p.box(sx, y + 0.1, sz, 1.7, 0.2, 1.1, '#c9c3b2');
    p.box(sx, y + 0.3, sz, 1.3, 1.7, 0.9, stone);
    p.box(sx, y + 0.3, sz + 0.455, 0.8, 0.8, 0.01, '#bfb7a2', { ao: 0 });
    p.box(sx, y + 1.25, sz + 0.456, 0.52, 0.34, 0.006, '#8d8573', { ao: 0 });
    p.box(sx + 0.66, y + 0.3, sz, 0.01, 1.4, 0.7, '#bfb7a2', { ao: 0 });
    p.box(sx, y + 2.0, sz, 1.46, 0.1, 1.06, tint(stone, -0.06));
    p.box(sx, y + 2.1, sz, 1.16, 0.08, 0.8, tint(stone, 0.05));
    // Admiral De Ruyter: boots, long coat, sash and sword, a wide hat, the commander's baton
    const ty = y + 2.18;
    k.at(sx, ty, sz, 0, 1.5, () => {
      p.box(-0.13, 0, 0.02, 0.2, 0.5, 0.26, bronze);
      p.box(0.13, 0, 0.0, 0.2, 0.5, 0.24, bronze);
      p.box(0, 0.42, 0, 0.62, 0.62, 0.42, bronze);
      p.prism(0, 0.42, 0, 0.66, 0.0 + 0.1, 0.46, tint(bronze, 0.06));
      p.box(0, 0.98, 0, 0.56, 0.55, 0.36, bronze);
      p.box(0, 1.0, 0.185, 0.07, 0.5, 0.01, '#d9b94a', { ao: 0, rz: 0.5 });
      p.box(0, 0.92, 0, 0.6, 0.06, 0.4, '#8a6a30', { ao: 0 });
      // the cloak hanging behind
      p.box(0, 0.5, -0.24, 0.6, 0.95, 0.1, tint(bronze, -0.08));
      // left hand on the hilt, the sword hanging at the hip
      p.box(-0.34, 0.9, 0.04, 0.13, 0.5, 0.15, bronze, { rz: -0.35 });
      p.rod([-0.42, 0.88, 0.1], [-0.52, 0.12, 0.16], 0.025, '#b9b6a0', 4);
      p.box(-0.46, 0.84, 0.1, 0.18, 0.03, 0.04, '#d9b94a', { ao: 0 });
      // right arm out, with the baton
      p.box(0.4, 0.92, 0.12, 0.13, 0.12, 0.42, bronze, { rx: 0.0 });
      p.rod([0.4, 0.98, 0.34], [0.4, 0.2, 0.34], 0.02, '#d9b94a', 4);
      p.ball(0, 1.7, 0, 0.17, bronze, { sy: 1.1 });
      p.cyl(0, 1.78, 0, 0.34, 0.3, 0.035, tint(bronze, -0.06), { seg: 10 });
      p.cyl(0, 1.8, 0, 0.17, 0.2, 0.24, tint(bronze, -0.06), { seg: 8 });
      p.box(0.15, 1.97, 0.0, 0.2, 0.2, 0.03, tint(bronze, 0.1), { rz: -0.5, ao: 0 });
    });
    k.reserve(sx, sz, 1.2, 0.9);
    // the striped lighthouse at the end of the boulevard
    const lx = sx + 4.4;
    const lz = -13.1;
    const ly = k.ground(lx, lz);
    p.cyl(lx, ly - 0.25, lz, 0.5, 0.46, 0.4, '#b9b3a4', { seg: 12 });
    lighthouse(k, lx, ly + 0.15, lz, { ...LH_STYLES[0], h: 3.0, r0: 0.3, r1: 0.2, seg: 12 });
    k.reserve(lx, lz, 0.6, 0.6);
  },
  mole: { armour: 'rocks', light: { h: 1.4, bands: [['#f6f3ea', 1]], cap: '#2d3138', gallery: '#2d3138', r0: 0.2, r1: 0.14 } },
  quiet: true,
  rows: 4,
};

/** The Lange Jaap: a red cast-iron tower of riveted rings, a white gallery and lantern. */
function langeJaap(k: PortKit, x: number, y: number, z: number, h: number): void {
  const p = k.solid;
  const red = '#bd3a2e';
  const r0 = 0.44;
  const r1 = 0.27;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const ra = lerp(r0, r1, i / n);
    const rb = lerp(r0, r1, (i + 1) / n);
    p.cyl(x, y + (h * i) / n, z, ra, rb, h / n + 0.003, i % 2 ? tint(red, -0.05) : red, { seg: 12, ao: i ? 0.02 : 0.14 });
    p.cyl(x, y + (h * (i + 1)) / n - 0.02, z, rb + 0.022, rb + 0.022, 0.04, '#8e2b23', { seg: 12, ao: 0 });
    if (i % 2 === 1) p.box(x, y + (h * (i + 0.35)) / n, z + lerp(ra, rb, 0.35) - 0.003, 0.05, h / n * 0.34, 0.016, '#2b313b', { ao: 0 });
  }
  p.cyl(x, y - 0.25, z, r0 * 1.22, r0 * 1.18, 0.55, '#b9b3a4', { seg: 12 });
  p.box(x, y + 0.02, z + r0 * 1.2, 0.12, 0.2, 0.03, '#3a2f2a', { ao: 0 });
  const yt = y + h;
  p.cyl(x, yt, z, r1 + 0.16, r1 + 0.16, 0.05, '#f4f0e6', { seg: 14 });
  p.cyl(x, yt + 0.05, z, r1 + 0.15, r1 + 0.15, 0.1, '#f4f0e6', { seg: 14, open: true, ao: 0 });
  k.glass.cyl(x, yt + 0.05, z, r1 * 0.78, r1 * 0.78, 0.38, '#bfe6f2', { seg: 12 });
  k.glow.ball(x, yt + 0.22, z, r1 * 0.5, '#fff1b0');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.box(x + Math.cos(a) * r1 * 0.78, yt + 0.05, z + Math.sin(a) * r1 * 0.78, 0.02, 0.38, 0.02, '#f4f0e6', { ao: 0 });
  }
  p.cyl(x, yt + 0.43, z, r1 * 0.9, r1 * 0.9, 0.04, '#f4f0e6', { seg: 12 });
  p.cone(x, yt + 0.47, z, r1 * 0.88, 0.26, '#7a2a22', { seg: 12 });
  p.ball(x, yt + 0.75, z, 0.035, '#2d3138');
}

const denhelder: Landmark = {
  terrain(k) {
    k.shore = 'dike';
    k.shape.relief = 0.2;
    k.shape.range = 0.6;
    k.bump(k.vx(-13.9, 0.5), -13.9, 2.2, 1.6, 0.34);
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(-13.9, 0.5);
    const gy = k.ground(cx, -13.9);
    langeJaap(k, cx, gy, -13.9, 4.5);
    k.reserve(cx, -13.9, 0.8, 0.8);
    // the keeper's house and the dike's stone footing
    p.box(cx + 1.1, gy - 0.15, -13.6, 0.8, 0.15 + 0.4, 0.5, '#f1ece0');
    p.prism(cx + 1.1, gy + 0.4, -13.6, 0.86, 0.3, 0.55, '#a84a38', { ry: 0 });
    winZ(k, cx + 1.1, gy + 0.1, -13.6 + 0.25, 0.7, 0.24, 3, 1, '#34455a', 0.55, 0.8, 0.3);
    k.reserve(cx + 1.1, -13.6, 0.5, 0.35);
    // a naval frigate alongside the quay, and dockyard sheds
    frigate(k, k.vx(-10.8, k.mole.dir * 1.7), -10.8, 5.6);
    factory(k, cx + 4.6, -13.5, 1.8, 0.9, 0.55, '#b9bdb8', '#6f7a80');
    factory(k, cx - 5.2, -13.6, 1.8, 0.9, 0.5, '#c4c8c2', '#6f7a80');
    gantryCrane(k, cx + 6.4, SHORE_Z - 0.45, { color: '#7a858c', s: 0.85 });
  },
  mole: { armour: 'rocks', light: { h: 1.4, bands: [['#f6f3ea', 1]], cap: '#2f7a5c', gallery: '#2f7a5c', r0: 0.2, r1: 0.14 } },
  quiet: true,
  rows: 3,
};

const liege: Landmark = {
  terrain(k) {
    k.shore = 'quay';
    k.shape.relief = 0.6;
    k.shape.range = 1.6;
    k.bump(k.vx(-21, 0.4), -21.5, 9, 5.2, 2.7);
    k.plateau(k.vx(-15.2, 0.3), -15.2, 4.6, 2.2, LAND_Y + 0.05);
  },
  build(k) {
    const p = k.solid;
    const cx = k.vx(-15, 0.3);
    const zs = -15.0;
    const y = LAND_Y + 0.05;
    const L = 6.2;
    // the podium and platform
    p.box(cx, y - 0.25, zs, L + 0.3, 0.25 + 0.45, 3.4, '#d7d3c9');
    p.box(cx, y + 0.45, zs + 0.9, L + 0.3, 0.04, 1.6, '#b9b5ab', { ao: 0 });
    // the long vault of white steel ribs and glass, lopsided like a wing and rising and falling along its length
    const arch = (t: number, u: number): [number, number] => {
      const a = Math.PI * t;
      const zz = -Math.cos(a) * 1.5 - 0.05;
      const sc = 0.62 + 0.38 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * u)), 0.7);
      const yy = Math.pow(Math.sin(a), 0.82) * 2.6 * sc * (1 - 0.1 * (t - 0.4));
      return [zz, yy];
    };
    const ribs = 13;
    const seg = 10;
    const x0 = cx - L / 2;
    k.at(0, y + 0.49, zs, 0, 1, () => {
      for (let r = 0; r < ribs; r++) {
        const rx = x0 + (r * L) / (ribs - 1);
        const u = r / (ribs - 1);
        let prev = arch(0, u);
        for (let i = 1; i <= seg; i++) {
          const cur = arch(i / seg, u);
          p.rod([rx, prev[1], prev[0]], [rx, cur[1], cur[0]], 0.026, '#f4f6f6', 4);
          prev = cur;
        }
        if (r < ribs - 1) {
          const u2 = (r + 1) / (ribs - 1);
          const rb = rx + L / (ribs - 1);
          for (let i = 0; i < seg; i++) {
            const a1 = arch(i / seg, u);
            const b1 = arch((i + 1) / seg, u);
            const a2 = arch(i / seg, u2);
            const b2 = arch((i + 1) / seg, u2);
            k.glass.quad([rx, a1[1], a1[0]], [rb, a2[1], a2[0]], [rb, b2[1], b2[0]], [rx, b1[1], b1[0]], i % 3 === 2 ? '#e9eef0' : '#6fa6c4', true);
          }
          // longitudinal purlins between the ribs
          for (let i = 1; i < seg; i += 2) {
            const a1 = arch(i / seg, u);
            const a2 = arch(i / seg, u2);
            p.rod([rx, a1[1], a1[0]], [rb, a2[1], a2[0]], 0.016, '#f4f6f6', 3);
          }
        }
      }
      // the end wall at +x: a glazed arch with mullions
      const xe = x0 + L + 0.01;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= seg; i++) {
        const [zz, yy] = arch(i / seg, 1);
        pts.push([-zz, yy]);
      }
      k.glass.extrude(pts, 0.03, xe, 0, 0, '#7fb2cf', { ry: Math.PI / 2, ao: 0 });
      for (let i = 1; i < 8; i++) {
        const zz = -1.5 + (i * 3.0) / 8;
        const t = Math.acos(clamp(-(zz + 0.05) / 1.5, -1, 1)) / Math.PI;
        p.box(xe + 0.01, 0, zz, 0.012, arch(t, 1)[1], 0.012, '#f4f6f6', { ao: 0 });
      }
      p.box(xe + 0.01, 0.5, 0, 0.012, 0.014, 3.0, '#f4f6f6', { ao: 0 });
    });
    for (let i = 0; i < 4; i++) k.reserve(cx - 2.3 + i * 1.55, zs, 0.95, 1.9);
    // the hill of houses behind, as on the Citadelle slope
    buildTown(k, { x0: cx - 11, x1: cx + 11, z: -17.8, rows: 6, rowStep: 0.58, hs: REGIONS.fr.houses, cx, minY: 0.5, maxSlope: 0.8, rowRise: 0.15 });
    // barges on the river
    const rng = new Rng(k.seed ^ 12345);
    barge(k, cx - 3.6, -10.6, 3.6, 'coal', rng, 0);
    barge(k, cx + 3.6, -10.5, 3.4, 'boxes', rng, 0.02);
  },
  mole: 'none',
  flag: { dx: 5.3, z: -12.9 },
  quiet: true,
  rows: 3,
};

export const LANDMARKS: Record<string, Landmark> = { antwerp, amsterdam, zeebrugge, ostend, vlissingen, denhelder, liege };

/** [port name, region, landmark id] rows registered for this group. */
export const PORTS: Array<[string, RegionId, string?]> = [
  ['Antwerp', 'nl', 'antwerp'],
  ['Amsterdam', 'nl', 'amsterdam'],
  ['Zeebrugge', 'nl', 'zeebrugge'],
  ['Ostend', 'nl', 'ostend'],
  ['Vlissingen', 'nl', 'vlissingen'],
  ['Den Helder', 'nl', 'denhelder'],
  ['Liège', 'fr', 'liege'],
];
