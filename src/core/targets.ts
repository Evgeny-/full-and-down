/**
 * Difficulty targets per band (docs/design-process/13 §2.3, remapped to 8 areas: the bands slide
 * from area 1 to area 8), and the objective the generator climbs: the distance of the measured
 * metrics from the band, plus penalties for the structural requirements (decoys, gap, star
 * separation, the tinkerer gate, uniqueness, ablation, the exact fit).
 */
import type { Metrics } from './metrics';
import { CORE, isLesson, type BandId, type LadderRow } from './progression';
import type { Mechanic } from './types';

export interface Target {
  band: BandId;
  /** strong editor: share reaching ★ and ★★★; careful editor: share reaching ★★★ */
  s1: [number, number];
  s3: [number, number];
  c3: [number, number];
  /** exchange depth X */
  depth: [number, number];
  minDecoys: number;
  /** greedy gap 1 − best natural / V*, at least */
  minGap: number;
  /** T3 − T1, at least */
  minSpread: number;
  /** each star threshold ≥ 2 above the one below */
  separation: boolean;
  /** random tinkerer: share reaching ★ / ★★★, at most */
  maxT1: number;
  maxT3: number;
  maxOmega: number;
  /** Full & Down: the unique optimum departs on the mark and arrives on the reserve */
  exact: boolean;
  /** difficulty index range (docs/design-process/13 §2.3) */
  di: [number, number];
  /** the optimum's heaviest leg carries at least this share of the deadweight in cargo */
  minFill: number;
  /** the intro mechanic (must bind) and the advanced ones present (should bind) */
  intro?: Mechanic;
  mechanics: Mechanic[];
  ports: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const slide = (a: [number, number], b: [number, number], t: number): [number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

const DI: Record<BandId, [[number, number], [number, number]]> = {
  T0: [[0, 100], [0, 100]],
  B1: [[5, 25], [10, 28]],
  B2: [[12, 30], [22, 40]],
  B3: [[25, 40], [38, 55]],
  B4: [[35, 50], [48, 65]],
  B5: [[48, 65], [62, 78]],
  B6: [[58, 78], [72, 90]],
};

export function targetFor(row: LadderRow): Target {
  const t = row.area / 7;
  const base = {
    di: slide(DI[row.band][0], DI[row.band][1], t), band: row.band, intro: row.intro, mechanics: row.mechanics, ports: row.ports, exact: false, minFill: 0.45 };
  switch (row.band) {
    case 'T0':
      return { ...base, s1: [0, 1], s3: [0, 1], c3: [0, 1], depth: [1, 4], minDecoys: 0, minGap: 0, minSpread: 0, separation: false, maxT1: 1, maxT3: 1, maxOmega: 9 };
    case 'B1':
      return { ...base, exact: true, minFill: 0.5, s1: [0.85, 1], s3: [0.45, 0.95], c3: [0.9, 1], depth: [1, 2], minDecoys: 0, minGap: 0.04, minSpread: 2, separation: false, maxT1: 1, maxT3: 0.5, maxOmega: 1 };
    case 'B2':
      return { ...base, s1: slide([0.75, 1], [0.65, 0.9], t), s3: slide([0.3, 0.75], [0.2, 0.55], t), c3: [0.9, 1], depth: [1, 2], minDecoys: 0, minGap: 0.05, minSpread: 2, separation: false, maxT1: 0.8, maxT3: 0.3, maxOmega: 1 };
    case 'B3':
      return { ...base, s1: slide([0.6, 0.9], [0.5, 0.75], t), s3: slide([0.15, 0.45], [0.1, 0.3], t), c3: [0.75, 1], depth: [2, 3], minDecoys: 1, minGap: 0.07, minSpread: 4, separation: true, maxT1: 0.5, maxT3: 0.1, maxOmega: 2 };
    case 'B4':
      return { ...base, s1: slide([0.45, 0.75], [0.35, 0.6], t), s3: slide([0.08, 0.3], [0.05, 0.2], t), c3: [0.6, 1], depth: [2, 3], minDecoys: 2, minGap: 0.08, minSpread: 4, separation: true, maxT1: 0.5, maxT3: 0.08, maxOmega: 1 };
    case 'B5':
      return { ...base, s1: slide([0.25, 0.55], [0.2, 0.45], t), s3: [0, lerp(0.15, 0.1, t)], c3: [0.35, 0.75], depth: [3, 4], minDecoys: 3, minGap: 0.1, minSpread: 5, separation: true, maxT1: 0.4, maxT3: 0.05, maxOmega: 1 };
    case 'B6':
      return { ...base, s1: slide([0.15, 0.45], [0.1, 0.35], t), s3: [0, lerp(0.08, 0.05, t)], c3: [0.25, 0.6], depth: [3, 4], minDecoys: 4, minGap: 0.1, minSpread: 5, separation: true, maxT1: 0.35, maxT3: 0.05, maxOmega: 1 };
  }
}

/** Par worth sailing for: a soft floor on V* per band. */
const MIN_VSTAR: Record<BandId, number> = { T0: 0, B1: 8, B2: 10, B3: 12, B4: 14, B5: 16, B6: 18 };

const linBand = (v: number, b: [number, number]) => (v < b[0] ? b[0] - v : v > b[1] ? v - b[1] : 0);

export interface Shortfall {
  total: number;
  /** what misses, for the build log */
  misses: string[];
}

/** Distance of a level's metrics from its target (0 = on target), with the reasons. */
export function shortfall(m: Metrics, t: Target): Shortfall {
  const misses: string[] = [];
  let v = 0;
  const add = (x: number, why: string) => {
    if (x > 1e-9) {
      v += x;
      misses.push(why);
    }
  };
  add(2 * linBand(m.s1, t.s1), `S★ ${pct(m.s1)}`);
  add(2 * linBand(m.s3, t.s3), `S★★★ ${pct(m.s3)}`);
  add(1 * linBand(m.c3, t.c3), `C★★★ ${pct(m.c3)}`);
  add(0.25 * linBand(m.depth, t.depth), `X ${m.depth}`);
  add(0.15 * Math.max(0, t.minDecoys - m.decoys), `decoys ${m.decoys}`);
  add(4 * Math.max(0, t.minGap - m.gap), `gap ${pct(m.gap)}`);
  const [T1, T2, T3] = m.stars;
  add(0.25 * Math.max(0, t.minSpread - (T3 - T1)), `spread ${T3 - T1}`);
  if (t.separation) add(0.2 * (Math.max(0, 2 - (T2 - T1)) + Math.max(0, 2 - (T3 - T2))), `stars ${T1}/${T2}/${T3}`);
  if (!isLesson(t.band) && !(T1 < T2 && T2 < T3)) add(2, 'stars collapse');
  add(1.5 * Math.max(0, m.t1 - t.maxT1), `T★ ${pct(m.t1)}`);
  add(3 * Math.max(0, m.t3 - t.maxT3), `T★★★ ${pct(m.t3)}`);
  add(0.5 * Math.max(0, m.omega - t.maxOmega), `ω ${m.omega}`);
  if (m.greedyBest >= m.vstar && t.band !== 'T0') add(3, 'greedy finds par');
  for (const mech of t.mechanics) {
    const d = m.ablation[mech];
    if (d === undefined || d > 0) continue;
    if (mech === t.intro) add(3, `intro ${mech} idle`);
    else if (mech === 'tiers') add(1.5, `${mech} idle`);
    else if (CORE.includes(mech)) add(0.5, `${mech} idle`);
    else add(1, `${mech} idle`);
  }
  // the difficulty index inside the band's range (the sawtooth)
  add(0.04 * linBand(m.di, t.di), `DI ${Math.round(m.di)}`);
  // par must be worth sailing for, and ★ must earn something
  add(0.1 * Math.max(0, MIN_VSTAR[t.band] - m.vstar), `V* ${m.vstar}`);
  if (t.band !== 'T0' && m.stars[0] < 3) add(2, `★ ${m.stars[0]}`);
  if (t.exact) {
    if (!m.onMark) add(2, 'not on the mark');
    if (!m.onReserve) add(2, 'not on the reserve');
  }
  add(2 * Math.max(0, t.minFill - m.cargoFill), `fill ${pct(m.cargoFill)}`);
  if (m.optBoxes < 2) add(1, 'carries almost nothing');
  return { total: v, misses };
}

/** How far the rates are from the middle of their bands (to choose among on-target levels). */
export function aim(m: Metrics, t: Target): number {
  const mid = (b: [number, number]) => (b[0] + b[1]) / 2;
  return Math.abs(m.s1 - mid(t.s1)) + Math.abs(m.s3 - mid(t.s3)) + 0.5 * Math.abs(m.c3 - mid(t.c3));
}

const pct = (x: number) => `${Math.round(100 * x)}%`;
