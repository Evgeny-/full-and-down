import { Rng } from '../../core/rng';
import { PortKit, clamp, lerp, type Col, type V3 } from './kit';
import { tint } from './town';

/**
 * Bigger reusable structures for landmarks. Every function builds with its foot on `y` (default: the
 * ground under it) and records a reservation so houses keep clear. Colours are plain hex strings.
 */

// ───────────────────────────── towers & buildings ─────────────────────────────

export interface TowerOpts {
  /** window colour; windows are drawn as dark quads in rows */
  win?: Col;
  rows?: number;
  cols?: number;
  /** roof: flat, pyramid, spire, slant (sloping to the +x side), dome */
  roof?: 'flat' | 'pyramid' | 'spire' | 'slant' | 'dome' | 'none';
  roofColor?: Col;
  roofH?: number;
  /** a coloured band every n rows */
  band?: Col;
  glass?: boolean;
  y?: number;
  ry?: number;
}

/** A tower block / skyscraper with rows of windows on the two visible faces (+z and +x). */
export function tower(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col, o: TowerOpts = {}): number {
  const y = o.y ?? k.groundMax(x, z, w / 2, d / 2);
  const p = o.glass ? k.glass : k.solid;
  const rows = o.rows ?? Math.max(2, Math.round(h / 0.17));
  const cols = o.cols ?? Math.max(1, Math.round(w / 0.17));
  k.at(x, y, z, o.ry ?? 0, 1, () => {
    p.box(0, -0.15, 0, w, h + 0.15, d, wall);
    const win = o.win ?? '#35506a';
    const ww = (w / cols) * 0.55;
    const rh = (h * 0.92) / rows;
    for (let r = 0; r < rows; r++) {
      const yy = h * 0.05 + r * rh + rh * 0.2;
      for (let c = 0; c < cols; c++) {
        const cx = -w / 2 + (w / cols) * (c + 0.5);
        (k.rng.chance(0.35) ? k.lit : k.solid).quad([cx - ww / 2, yy, d / 2 + 0.004], [cx + ww / 2, yy, d / 2 + 0.004], [cx + ww / 2, yy + rh * 0.55, d / 2 + 0.004], [cx - ww / 2, yy + rh * 0.55, d / 2 + 0.004], win);
      }
      const dc = Math.max(1, Math.round(d / 0.17));
      const dw = (d / dc) * 0.55;
      for (let c = 0; c < dc; c++) {
        const cz = d / 2 - (d / dc) * (c + 0.5);
        (k.rng.chance(0.35) ? k.lit : k.solid).quad([w / 2 + 0.004, yy, cz + dw / 2], [w / 2 + 0.004, yy, cz - dw / 2], [w / 2 + 0.004, yy + rh * 0.55, cz - dw / 2], [w / 2 + 0.004, yy + rh * 0.55, cz + dw / 2], win);
      }
      if (o.band && r % 4 === 3) k.solid.box(0, yy + rh * 0.62, 0, w + 0.012, 0.02, d + 0.012, o.band, { ao: 0 });
    }
    const rc = o.roofColor ?? tint(wall, -0.15);
    const rH = o.roofH ?? 0.2;
    switch (o.roof ?? 'flat') {
      case 'flat':
        k.solid.box(0, h, 0, w + 0.02, 0.025, d + 0.02, rc);
        break;
      case 'pyramid':
        k.solid.pyramid(0, h, 0, w + 0.02, rH, d + 0.02, rc);
        break;
      case 'spire':
        k.solid.pyramid(0, h, 0, w, rH * 1.8, d, rc);
        break;
      case 'dome':
        k.solid.lathe(0, h, 0, [[w * 0.5, 0], [w * 0.5, rH * 0.2], [w * 0.4, rH * 0.7], [w * 0.2, rH * 0.95], [0.001, rH]], rc, { seg: 12 });
        break;
      case 'slant': {
        // a roof falling from the back-left to the front-right: the plane through four corners
        const a: V3 = [-w / 2, h + rH, -d / 2];
        const b: V3 = [w / 2, h, -d / 2];
        const c: V3 = [w / 2, h, d / 2];
        const e: V3 = [-w / 2, h + rH, d / 2];
        k.solid.quad(b, c, e, a, rc, true);
        k.solid.tri([-w / 2, h, d / 2], [w / 2, h, d / 2], e, wall);
        break;
      }
      default:
        break;
    }
  });
  k.reserve(x, z, w / 2 + 0.05, d / 2 + 0.05);
  return y + h;
}

export interface GothicOpts {
  stone?: Col;
  roof?: Col;
  /** height of the shaft and of the spire above it */
  shaft: number;
  spire: number;
  w?: number;
  y?: number;
}

/**
 * A gothic church tower: a stepped square shaft with buttresses, a pierced belfry and a tall octagonal
 * spire with four corner pinnacles. The spire is the silhouette; it must read from a distance.
 */
export function gothicTower(k: PortKit, x: number, z: number, o: GothicOpts): number {
  const w = o.w ?? 0.36;
  const y = o.y ?? k.groundMax(x, z, w / 2, w / 2);
  const stone = o.stone ?? '#d6cdb8';
  const roof = o.roof ?? '#5f7f78';
  const p = k.solid;
  const H = o.shaft;
  p.box(x, y - 0.15, z, w, H * 0.5 + 0.15, w, stone);
  // buttresses on the four corners
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) p.box(x + dx * w * 0.5, y - 0.15, z + dz * w * 0.5, w * 0.16, H * 0.46 + 0.15, w * 0.16, tint(stone, -0.05));
  p.box(x, y + H * 0.5, z, w * 0.88, H * 0.28, w * 0.88, tint(stone, 0.04));
  // tall lancet windows
  for (const f of [1, -1]) {
    p.box(x + f * w * 0.18, y + H * 0.2, z + w / 2 + 0.003, w * 0.1, H * 0.22, 0.01, '#3a4452', { ao: 0 });
    p.box(x + w / 2 + 0.003, y + H * 0.2, z + f * w * 0.18, 0.01, H * 0.22, w * 0.1, '#3a4452', { ao: 0 });
  }
  // belfry with louvred openings
  const by = y + H * 0.78;
  p.box(x, by, z, w * 0.84, H * 0.22, w * 0.84, stone);
  p.box(x, by + H * 0.04, z + w * 0.42 + 0.004, w * 0.3, H * 0.14, 0.01, '#2a2f38', { ao: 0 });
  p.box(x + w * 0.42 + 0.004, by + H * 0.04, z, 0.01, H * 0.14, w * 0.3, '#2a2f38', { ao: 0 });
  // corner pinnacles
  const top = y + H;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    p.box(x + dx * w * 0.4, top - 0.01, z + dz * w * 0.4, w * 0.1, H * 0.06, w * 0.1, stone);
    p.pyramid(x + dx * w * 0.4, top + H * 0.05, z + dz * w * 0.4, w * 0.12, H * 0.14, w * 0.12, roof);
  }
  // the spire: a tapering octagon with a pointed tip
  p.cyl(x, top, z, w * 0.5, w * 0.3, o.spire * 0.45, roof, { seg: 8, ao: 0.1 });
  p.cyl(x, top + o.spire * 0.45, z, w * 0.3, w * 0.07, o.spire * 0.4, tint(roof, 0.05), { seg: 8, ao: 0 });
  p.cyl(x, top + o.spire * 0.85, z, w * 0.07, 0.004, o.spire * 0.15, tint(roof, 0.1), { seg: 6, ao: 0 });
  p.cyl(x, top + o.spire, z, 0.004, 0.004, 0.09, '#e8b923', { seg: 4, ao: 0 });
  k.reserve(x, z, w * 0.7, w * 0.7);
  return top + o.spire;
}

/** A battlement-topped wall run (a castle curtain): a box with merlons along the top edge. */
export function battlement(k: PortKit, x: number, z: number, w: number, d: number, h: number, wall: Col, y = k.groundMax(x, z, w / 2, d / 2)): void {
  const p = k.solid;
  p.box(x, y - 0.2, z, w, h + 0.2, d, wall);
  const n = Math.max(2, Math.floor(w / 0.1));
  for (let i = 0; i < n; i += 2) {
    p.box(x - w / 2 + (i + 0.5) * (w / n), y + h, z + d / 2 - 0.02, w / n, 0.045, 0.04, tint(wall, 0.06), { ao: 0 });
    p.box(x - w / 2 + (i + 0.5) * (w / n), y + h, z - d / 2 + 0.02, w / n, 0.045, 0.04, tint(wall, 0.06), { ao: 0 });
  }
}

/** A round tower with a conical roof, or a flat crenellated top when `cap` is null. */
export function roundTower(k: PortKit, x: number, z: number, r: number, h: number, wall: Col, cap: Col | null, y = k.ground(x, z) - 0.03): void {
  const p = k.solid;
  p.cyl(x, y - 0.2, z, r * 1.04, r, h + 0.2, wall, { seg: 12 });
  if (cap) {
    p.cyl(x, y + h, z, r * 1.1, r * 1.1, 0.035, tint(wall, -0.1), { seg: 12 });
    p.cone(x, y + h + 0.035, z, r * 1.12, r * 1.3, cap, { seg: 12 });
  } else {
    p.cyl(x, y + h, z, r * 1.12, r * 1.12, 0.05, tint(wall, 0.05), { seg: 12 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283;
      p.box(x + Math.cos(a) * r * 1.02, y + h + 0.05, z + Math.sin(a) * r * 1.02, r * 0.4, 0.05, r * 0.4, tint(wall, 0.06), { ao: 0 });
    }
  }
}

// ───────────────────────────── bridges ─────────────────────────────

export interface BridgeOpts {
  /** y of the roadway */
  deck: number;
  /** half-width of the deck (z) */
  half?: number;
  color?: Col;
  deckColor?: Col;
  cable?: Col;
}

function piers(k: PortKit, xs: number[], z: number, deck: number, half: number, color: Col): void {
  for (const x of xs) k.solid.box(x, -0.9, z, 0.22, deck + 0.9, half * 1.5, color);
}

/**
 * A cable-stayed bridge along x at depth z: a deck on piers, pylons with fans of stays. `pylons` gives
 * each pylon's x and height above the deck; `lean` tilts a pylon (Erasmus Bridge) and `back` anchors its stays
 * on one side only (asymmetric).
 */
export function cableStayed(k: PortKit, x0: number, x1: number, z: number, pylons: Array<{ x: number; h: number; side?: -1 | 1; lean?: number }>, o: BridgeOpts): void {
  const half = o.half ?? 0.12;
  const col = o.color ?? '#f4f4f0';
  const cable = o.cable ?? '#dfe3e6';
  const p = k.solid;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  p.box(cx, o.deck - 0.07, z, len, 0.07, half * 2, o.deckColor ?? '#9aa0a6');
  p.box(cx, o.deck, z - half + 0.01, len, 0.02, 0.02, '#d9dde0', { ao: 0 });
  p.box(cx, o.deck, z + half - 0.01, len, 0.02, 0.02, '#d9dde0', { ao: 0 });
  const span = len / 6;
  const px: number[] = [];
  for (let x = x0 + span * 0.5; x < x1; x += span) px.push(x);
  px.push(...pylons.map((q) => q.x));
  piers(k, px, z, o.deck - 0.07, half, '#b9b5ab');
  for (const q of pylons) {
    const topX = q.x + (q.lean ?? 0);
    // an inverted-Y pylon: two legs meeting up high
    p.rod([q.x, o.deck, z - half * 0.9], [topX, o.deck + q.h, z], 0.045, col, 6);
    p.rod([q.x, o.deck, z + half * 0.9], [topX, o.deck + q.h, z], 0.045, col, 6);
    // stays: a fan toward the main span (side), a few steep back stays the other way (or both ways)
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const ay = o.deck + q.h * (0.97 - 0.42 * t);
      const reach = len * (0.06 + t * 0.34);
      const sides: Array<-1 | 1> = q.side ? [q.side] : [-1, 1];
      for (const side of sides) {
        const ex = clamp(q.x + side * reach, x0, x1);
        p.rod([topX, ay, z], [ex, o.deck, z - half * 0.8], 0.007, cable, 3);
        p.rod([topX, ay, z], [ex, o.deck, z + half * 0.8], 0.007, cable, 3);
      }
      if (q.side && i % 2 === 0) {
        const ex = clamp(q.x - q.side * len * (0.03 + t * 0.05), x0, x1);
        p.rod([topX, ay, z], [ex, o.deck, z - half * 0.8], 0.007, cable, 3);
        p.rod([topX, ay, z], [ex, o.deck, z + half * 0.8], 0.007, cable, 3);
      }
    }
  }
}

/**
 * A suspension bridge: two towers (portal frames), a catenary main cable on each side, vertical hangers,
 * a truss deck. Towers at `towers[0]` and `towers[1]`.
 */
export function suspension(k: PortKit, x0: number, x1: number, z: number, towers: [number, number], towerH: number, o: BridgeOpts): void {
  const half = o.half ?? 0.14;
  const col = o.color ?? '#c8302a';
  const cable = o.cable ?? col;
  const p = k.solid;
  const len = x1 - x0;
  p.box((x0 + x1) / 2, o.deck - 0.08, z, len, 0.08, half * 2, o.deckColor ?? '#a7a8aa');
  p.box((x0 + x1) / 2, o.deck - 0.16, z, len, 0.08, half * 1.4, tint(col, -0.1), { ao: 0 });
  const piersX = [...towers];
  for (let x = x0 + 0.5; x < x1; x += 1.6) if (Math.abs(x - towers[0]) > 0.7 && Math.abs(x - towers[1]) > 0.7) piersX.push(x);
  piers(k, piersX, z, o.deck - 0.16, half, '#b9b5ab');
  for (const tx of towers) {
    for (const side of [-1, 1]) p.box(tx, o.deck - 0.1, z + side * half * 0.95, 0.07, towerH + 0.1, 0.07, col);
    for (const f of [0.35, 0.7, 0.97]) p.box(tx, o.deck + towerH * f - 0.03, z, 0.07, 0.06, half * 2, col, { ao: 0 });
  }
  // main cables: sag between the towers, then down to the anchorages at the ends
  const sag = towerH * 0.82;
  const pts: Array<[number, number]> = [];
  const [ta, tb] = towers;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([lerp(ta, tb, t), o.deck + towerH - sag * 4 * t * (1 - t) * 0.95]);
  }
  const sideSpans: Array<[number, number, number]> = [[x0, ta, -1], [tb, x1, 1]];
  for (const side of [-1, 1]) {
    const zz = z + side * half * 0.95;
    for (let i = 0; i < pts.length - 1; i++) p.rod([pts[i][0], pts[i][1], zz], [pts[i + 1][0], pts[i + 1][1], zz], 0.014, cable, 4);
    for (const [a, b, dir] of sideSpans) {
      const from = dir < 0 ? b : a;
      const to = dir < 0 ? a : b;
      const m = 6;
      let prev: [number, number] = [from, o.deck + towerH];
      for (let i = 1; i <= m; i++) {
        const t = i / m;
        const cur: [number, number] = [lerp(from, to, t), o.deck + towerH - (towerH - 0.04) * (0.25 * t + 0.75 * t * t)];
        p.rod([prev[0], prev[1], zz], [cur[0], cur[1], zz], 0.014, cable, 4);
        prev = cur;
      }
    }
    // hangers from the cable to the deck
    for (let i = 1; i < n; i++) {
      p.rod([pts[i][0], pts[i][1], zz], [pts[i][0], o.deck, zz], 0.004, cable, 3);
    }
  }
}

/** A masonry arch bridge along x: a parapeted deck on `n` round arches, with piers into the water. */
export function archBridge(k: PortKit, x0: number, x1: number, z: number, n: number, deck: number, color: Col = '#d6c9ae', half = 0.16): void {
  const len = x1 - x0;
  const sp = len / n;
  const p = k.solid;
  p.box(x0 + len / 2, deck - 0.08, z, len, 0.1, half * 2, color);
  p.box(x0 + len / 2, deck + 0.02, z - half + 0.015, len, 0.06, 0.03, tint(color, 0.08));
  p.box(x0 + len / 2, deck + 0.02, z + half - 0.015, len, 0.06, 0.03, tint(color, 0.08));
  const r = sp * 0.34;
  for (let i = 0; i <= n; i++) p.box(x0 + sp * i, -0.9, z, sp * 0.3, 0.9 + deck - 0.12 - r * 0.5, half * 1.8, color);
  // each arch: a quarter-turn of segments spanning pier to pier
  for (let i = 0; i < n; i++) {
    const cx = x0 + sp * (i + 0.5);
    const m = 8;
    for (let j = 0; j < m; j++) {
      const a0 = Math.PI * (j / m);
      const a1 = Math.PI * ((j + 1) / m);
      const ya = deck - 0.12 - r * 0.45 + Math.sin(a0) * r * 0.5;
      const yb = deck - 0.12 - r * 0.45 + Math.sin(a1) * r * 0.5;
      const xa = cx - Math.cos(a0) * r;
      const xb = cx - Math.cos(a1) * r;
      p.quad([xa, ya, z - half * 0.9], [xb, yb, z - half * 0.9], [xb, yb, z + half * 0.9], [xa, ya, z + half * 0.9], color, true);
    }
    p.box(cx, -0.9, z, sp * 0.5, 0.9, half * 1.8, color);
  }
}

// ───────────────────────────── figures, ships, sea things ─────────────────────────────

/** A stylised human figure: legs, torso, head, arms. `pose` 'stand' or 'sit' (knees up, facing +z). */
export function figure(k: PortKit, x: number, y: number, z: number, s: number, color: Col, pose: 'stand' | 'sit' | 'wave' = 'stand', ry = 0): void {
  const p = k.solid;
  p.at(x, y, z, ry, s, () => {
    if (pose === 'sit') {
      p.box(0, 0, 0, 0.5, 0.18, 0.5, color);
      p.box(-0.12, 0.18, 0.18, 0.2, 0.55, 0.2, color, { rx: -0.2 });
      p.box(0.12, 0.18, 0.18, 0.2, 0.55, 0.2, color, { rx: -0.2 });
      p.box(0, 0.18, 0, 0.42, 0.6, 0.3, color, { rx: 0.1 });
      p.ball(0, 0.95, 0.04, 0.14, color, { sy: 1.1 });
    } else {
      p.box(-0.1, 0, 0, 0.17, 0.5, 0.17, color);
      p.box(0.1, 0, 0, 0.17, 0.5, 0.17, color);
      p.box(0, 0.48, 0, 0.42, 0.55, 0.26, color);
      p.box(-0.27, 0.5, 0, 0.12, 0.45, 0.14, color, { rz: pose === 'wave' ? 0.1 : -0.1 });
      p.box(0.27, pose === 'wave' ? 0.62 : 0.5, 0, 0.12, 0.45, 0.14, color, { rz: pose === 'wave' ? -2.3 : 0.1 });
      p.ball(0, 1.17, 0, 0.14, color, { sy: 1.1 });
    }
  });
}

/**
 * A tall ship at the waterline: hull, `masts` masts with square sails (or a fore-and-aft rig), bowsprit.
 * `len` ≈ the hull length; y = 0 is the water.
 */
export function tallShip(k: PortKit, x: number, z: number, len: number, masts: number, hull: Col, o: { ry?: number; sail?: Col; trim?: Col; rig?: 'square' | 'barque' } = {}): void {
  const p = k.solid;
  const sail = o.sail ?? '#f1ece0';
  const trim = o.trim ?? '#e8c36a';
  k.at(x, 0, z, o.ry ?? 0, len / 3, () => {
    // hull: a long box with a raked bow and a raised stern castle
    p.box(0, -0.2, 0, 3.0, 0.5, 0.7, hull, { ao: 0.12 });
    p.prism(1.62, -0.2, 0, 0.7, 0.5, 0.2, hull, { ry: Math.PI / 2 * 0 });
    p.box(1.62, -0.2, 0, 0.3, 0.5, 0.45, hull, { rz: 0, ao: 0.1 });
    p.box(0, 0.28, 0, 3.0, 0.04, 0.72, trim, { ao: 0 });
    p.box(-1.1, 0.3, 0, 0.8, 0.28, 0.66, hull);
    p.box(-1.1, 0.58, 0, 0.82, 0.03, 0.68, trim, { ao: 0 });
    for (let i = 0; i < 8; i++) p.box(-1.4 + i * 0.4, 0.05, 0.352, 0.1, 0.08, 0.01, '#1a1a1a', { ao: 0 });
    p.rod([1.5, 0.3, 0], [2.25, 0.62, 0], 0.025, '#6a4a32', 5);
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? 0 : lerp(-0.9, 1.0, m / (masts - 1));
      const hgt = 2.4 - Math.abs(m - (masts - 1) / 2) * 0.2;
      p.cyl(mx, 0.3, 0, 0.03, 0.02, hgt, '#6a4a32', { seg: 5 });
      for (let sl = 0; sl < 3; sl++) {
        const sy = 0.55 + sl * 0.6;
        const w = (1.0 - sl * 0.18) * (m === masts - 1 && masts > 2 ? 0.8 : 1);
        p.rod([mx, sy + 0.5, -w / 2 - 0.08], [mx, sy + 0.5, w / 2 + 0.08], 0.012, '#5b4636', 4);
        // a bellied sail facing the bow (+x)
        p.quad([mx + 0.03, sy, -w / 2], [mx + 0.03, sy, w / 2], [mx + 0.03, sy + 0.5, w / 2], [mx + 0.03, sy + 0.5, -w / 2], sail, true);
        p.quad([mx + 0.03, sy, -w / 2], [mx + 0.14, sy + 0.01, -w / 2 + 0.01], [mx + 0.14, sy + 0.49, -w / 2 + 0.01], [mx + 0.03, sy + 0.5, -w / 2], tint(sail, -0.12), true);
      }
    }
  });
}

/** A floating iceberg / ice floe: a faceted white-blue block that sits half in the water. */
export function iceberg(k: PortKit, x: number, z: number, s: number, rng: Rng): void {
  const p = k.solid;
  const base = ['#eaf6fb', '#dff0f7', '#f4fafc'];
  p.rock(x, -0.18 * s, z, 0.45 * s, base[0], { sy: 1.0, ry: rng.next() * 6, ao: 0.05 });
  p.rock(x + 0.2 * s, -0.12 * s, z + 0.05 * s, 0.3 * s, base[1], { sy: 1.3, ry: rng.next() * 6, ao: 0.05 });
  p.rock(x - 0.15 * s, -0.1 * s, z - 0.05 * s, 0.25 * s, base[2], { sy: 1.2, ry: rng.next() * 6, ao: 0.05 });
}

/** A drilling platform: four legs, a deck with a derrick and a flare boom, standing on the sea floor. */
export function oilRig(k: PortKit, x: number, z: number, s = 1): void {
  const p = k.solid;
  const lg: Array<[number, number]> = [[-0.4, -0.25], [0.4, -0.25], [0.4, 0.25], [-0.4, 0.25]];
  for (const [dx, dz] of lg) p.cyl(x + dx * s, -0.8, z + dz * s, 0.04 * s, 0.04 * s, 1.5 * s + 0.8, '#c8302a', { seg: 6 });
  p.rod([x - 0.4 * s, 0.1, z + 0.25 * s], [x + 0.4 * s, 0.9 * s, z + 0.25 * s], 0.012 * s, '#8a8f94', 4);
  p.rod([x + 0.4 * s, 0.1, z + 0.25 * s], [x - 0.4 * s, 0.9 * s, z + 0.25 * s], 0.012 * s, '#8a8f94', 4);
  p.box(x, 1.35 * s, z, 1.1 * s, 0.14 * s, 0.7 * s, '#d9d4c7');
  p.box(x - 0.25 * s, 1.49 * s, z, 0.3 * s, 0.22 * s, 0.3 * s, '#f4f0e6');
  p.pyramid(x + 0.2 * s, 1.49 * s, z, 0.2 * s, 0.7 * s, 0.2 * s, '#c8302a');
  p.rod([x + 0.5 * s, 1.45 * s, z - 0.3 * s], [x + 0.95 * s, 1.75 * s, z - 0.3 * s], 0.01 * s, '#8a8f94', 4);
  k.glow.ball(x + 0.96 * s, 1.8 * s, z - 0.3 * s, 0.035 * s, '#ffb347');
}
