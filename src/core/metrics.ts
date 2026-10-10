/**
 * Difficulty metrics (docs/design-process/13 §2.2, 21 §3.2, 20 §3): the optimum, the natural
 * starts, the star thresholds, decoys, exchange depth, the editors' and the tinkerer's rates, the
 * ablation of every mechanic present, the arrival remarks and the difficulty index
 * DI = 40(1−S★) + 30(1−S★★★) + 30(1−C★★★).
 */
import { isLesson } from './progression';
import { simulate } from './rules';
import { fuelDP, ManifestTable, toPlan } from './solver';
import { Rng } from './rng';
import type { Call, Level, Mechanic } from './types';
import {
  carefulPlayer,
  climbManifest,
  improvingNeighbours,
  kExchange,
  Landscape,
  NATURAL_KINDS,
  NEG,
  playNatural,
  quickStow,
  strongPlayer,
  tinkerer,
  type NaturalKind,
  type Played,
} from './players';

export interface Metrics {
  /** the optimum (★★★) and its manifest */
  vstar: number;
  bestMask: number;
  best: Call[];
  /** optimal manifests, identical boxes merged */
  omega: number;
  naturals: Played[];
  /** the best natural start's profit and kind */
  greedyBest: number;
  greedyKind: NaturalKind;
  /** 1 − greedyBest / V* */
  gap: number;
  stars: [number, number, number];
  /** 1-exchange local optima worth ≥ 90% of V* (identical boxes merged) */
  decoys: number;
  bestDecoy: number | null;
  bestDecoyMask: number | null;
  /** exchange depth X: the smallest k whose k-exchange climb from ≥ 50% of the natural starts reaches V* (4 = none ≤ 3) */
  depth: number;
  /** strong editor: share of runs reaching ★ / ★★ / ★★★, mean edits */
  s1: number;
  s2: number;
  s3: number;
  edits: number;
  /** careful editor: share reaching ★★★ */
  c3: number;
  /** random tinkerer: share reaching ★ / ★★★ */
  t1: number;
  t3: number;
  /**
   * V*(rule relaxed) − V* per mechanic present (|Δ| for calls; V* − V*(no pickups) for pickup;
   * tiers relaxes the whole hold: no never-bury and no slot limit)
   */
  ablation: Partial<Record<Mechanic, number>>;
  /** remarks of the optimum: on the mark at some departure; ROB on the reserve at the last berth */
  onMark: boolean;
  onReserve: boolean;
  /** heaviest leg's cargo / deadweight, for the optimum */
  cargoFill: number;
  /** boxes in the optimum */
  optBoxes: number;
  /** Hamming distance from the best natural start's manifest to the nearest optimum; boxes it carries that par leaves ashore */
  trap: number;
  sacrifice: number;
  di: number;
}

export interface MeasureOptions {
  strongRuns: number;
  carefulRandom: number;
  tinkerRuns: number;
  seed: number;
  /** mechanics to ablate (default: all present) */
  ablate?: Mechanic[];
}

export const FULL: Omit<MeasureOptions, 'seed'> = { strongRuns: 64, carefulRandom: 6, tinkerRuns: 200 };
export const QUICK: Omit<MeasureOptions, 'seed'> = { strongRuns: 40, carefulRandom: 4, tinkerRuns: 30 };

/**
 * Star thresholds (doc 13 §3.2, critic 20's separation rule): T3 = V*; T1 = the best natural start
 * + 1; T2 = the best decoy + 1 if that is above T1, else the midpoint; each at least 2 above the one
 * below. When the range is too narrow for that, lesson levels (T0, B1, B2) let ★ and ★★ (or all
 * three) coincide; other levels keep them strictly increasing as far as the range allows.
 */
export function thresholds(vstar: number, greedyBest: number, bestDecoy: number | null, lesson = true): [number, number, number] {
  const T3 = vstar;
  let T1 = Math.min(greedyBest + 1, T3);
  const aim = (lo: number, hi: number) => {
    const t = bestDecoy !== null && bestDecoy + 1 > T1 ? bestDecoy + 1 : Math.round((T1 + T3) / 2);
    return Math.max(lo, Math.min(hi, t));
  };
  let T2: number;
  if (T3 - T1 >= 4) T2 = aim(T1 + 2, T3 - 2);
  // too narrow for both gaps: keep ★★★ two clear of ★★ (never "★★★ by one coin") where it fits
  else if (T3 - T1 >= 2) T2 = lesson ? T1 : T3 - T1 >= 3 ? T1 + 1 : aim(T1 + 1, T3 - 1);
  else {
    T1 = T3;
    T2 = T3;
  }
  return [T1, T2, T3];
}

export const difficultyIndex = (s1: number, s3: number, c3: number) => 40 * (1 - s1) + 30 * (1 - s3) + 30 * (1 - c3);

const clone = (l: Level): Level => JSON.parse(JSON.stringify(l));

/** The level with some boxes taken off the quays (ids renumbered). */
export function withoutBoxes(level: Level, drop: (id: number) => boolean): Level {
  const out = clone(level);
  out.boxes = out.boxes.filter((b) => !drop(b.id)).map((b, i) => ({ ...b, id: i }));
  delete out.best;
  return out;
}

/**
 * A level with one rule switched off (ablation), or null when the rule has no relaxation.
 * `ignoreStow`: stowage order no longer matters (never bury off).
 */
export function relax(level: Level, m: Mechanic): { level: Level; ignoreStow?: boolean } | null {
  const L = clone(level);
  const last = L.ports.length - 1;
  switch (m) {
    case 'weight': {
      // fuel gets its own space: it no longer shares the marks with the cargo
      L.ship.capacity += L.ship.tank;
      L.ship.bands[L.ship.bands.length - 1].upTo = L.ship.capacity;
      return { level: L };
    }
    case 'bands':
      L.ship.bands = [{ upTo: L.ship.capacity, rate: Math.min(...L.ship.bands.map((b) => b.rate)) }];
      return { level: L };
    case 'calls':
      for (const b of L.boxes) b.to = last;
      return { level: L };
    case 'pickup':
      return { level: withoutBoxes(level, (id) => level.boxes[id].from > 0) };
    case 'noPump': {
      let price = L.ports[0].price ?? 1;
      for (let i = 0; i < last; i++) {
        if (L.ports[i].price === null) L.ports[i].price = price;
        else price = L.ports[i].price!;
      }
      return { level: L };
    }
    case 'prices': {
      const pumps = L.ports.slice(0, last).filter((p) => p.price !== null);
      const min = Math.min(...pumps.map((p) => p.price!));
      for (const p of pumps) p.price = min;
      return { level: L };
    }
    case 'lot':
      for (const p of L.ports) delete p.lot;
      return { level: L };
    case 'tiers':
      // the hold no longer limits anything: stacks as high as the quay offers, in any order
      L.ship.tiers = Math.max(L.ship.tiers, L.boxes.length);
      return { level: L, ignoreStow: true };
    case 'bar':
      for (const p of L.ports) delete p.bar;
      return { level: L };
    case 'contract':
      for (const b of L.boxes) delete b.contract;
      return { level: L };
    case 'heavy':
    case 'reefer':
    case 'zone':
    case 'bridge':
      L.mechanics = L.mechanics.filter((x) => x !== m);
      return { level: L };
  }
}

/** V* of a level (NEG if nothing can sail). */
export function vstarOf(level: Level, ignoreStow = false): number {
  const b = new Landscape(level, { ignoreStow }).best();
  return b ? b.value : NEG;
}

/** A lower bound on any voyage's bunker bill: every leg burns at least days × the lowest rate, bought at the cheapest pump. */
function fuelLowerBound(L: Level): number {
  const pumps = L.ports.slice(0, -1).filter((p) => p.price !== null);
  if (!pumps.length) return 0;
  const minPrice = Math.min(...pumps.map((p) => p.price!));
  const minRate = Math.min(...L.ship.bands.map((b) => b.rate));
  const burn = L.legs.reduce((s, l) => s + l.days * minRate, 0);
  return Math.max(0, burn - (L.startFuel - L.reserve)) * minPrice;
}

/**
 * V* of a relaxed level with the same boxes as `base` (a relaxation only removes constraints, so
 * V*(relaxed) ≥ `floor` = V*). Masks are walked richest first and pruned by a bunker lower bound;
 * the per-mask weight profiles are the base landscape's.
 */
function relaxedVstar(base: Landscape, L: Level, floor: number, ignoreStow: boolean): number {
  const { ship } = L;
  const legs = base.legs;
  const reeferRule = L.mechanics.includes('reefer');
  const slots = ship.bays * ship.tiers;
  const plugSlots = (ship.plugs?.length ?? 0) * ship.tiers;
  let mand = 0;
  for (const b of L.boxes) if (b.contract) mand |= 1 << b.id;
  const lb = fuelLowerBound(L);
  const memo = new Map<number, number>();
  const table = ignoreStow ? null : new ManifestTable(L);
  const W = new Array(legs).fill(0);
  const R = new Array(legs).fill(0);
  const counts = (m: number, l: number) => {
    let c = 0;
    for (const b of L.boxes) if (m & (1 << b.id) && b.from <= l && l < b.to) c++;
    return c;
  };
  let best = floor;
  for (const m of base.byFreight()) {
    const f = base.freight[m];
    if (f - lb <= best) break;
    if ((m & mand) !== mand) continue;
    const o = m * legs;
    let ok = true;
    let key = 0;
    for (let l = 0; l < legs; l++) {
      W[l] = base.legW[o + l];
      R[l] = reeferRule ? base.legR[o + l] : 0;
      if (W[l] > ship.capacity || (reeferRule && R[l] > plugSlots)) {
        ok = false;
        break;
      }
      key = key * 32 + W[l];
    }
    if (!ok) continue;
    for (let l = 0; l < legs; l++) key = key * 16 + R[l];
    let cost = memo.get(key);
    if (cost === undefined) {
      const fp = fuelDP(L, W, R);
      cost = fp ? fp.cost : Infinity;
      memo.set(key, cost);
    }
    const v = f - cost;
    if (v <= best) continue;
    let slotsOk = true;
    for (let l = 0; l < legs && slotsOk; l++) if (counts(m, l) > slots) slotsOk = false;
    if (!slotsOk) continue;
    if (table && !(ship.tiers === 1 && !reeferRule) && !quickStow(L, m) && !table.stow(m)) continue;
    best = v;
  }
  return best;
}

/** ΔV* when the rule is switched off (see `Metrics.ablation`). */
export function ablation(level: Level, vstar: number, m: Mechanic, base?: Landscape): number | null {
  const r = relax(level, m);
  if (!r) return null;
  if (base && m !== 'calls' && m !== 'pickup') {
    return relaxedVstar(base, r.level, vstar, !!r.ignoreStow) - vstar;
  }
  if (base && m === 'pickup' && !level.boxes.some((b) => b.from > 0 && b.contract)) {
    let pick = 0;
    for (const b of level.boxes) if (b.from > 0) pick |= 1 << b.id;
    for (const mask of base.sorted()) if (!(mask & pick) && base.stowable(mask)) return vstar - base.ub[mask];
    return vstar;
  }
  const v = vstarOf(r.level, r.ignoreStow);
  if (v <= NEG) return 0;
  if (m === 'calls') return Math.abs(v - vstar);
  if (m === 'pickup') return vstar - v;
  return v - vstar;
}

/** The 1-exchange local optima worth at least `floor` (and less than V*), identical boxes merged. */
export function decoysOf(land: Landscape, vstar: number, floor: number): { mask: number; value: number }[] {
  const out = new Map<number, number>();
  const moves = kExchange(1);
  for (const m of land.sorted()) {
    const u = land.ub[m];
    if (u < floor) break;
    if (u >= vstar) continue;
    if (!land.stowable(m)) continue;
    const c = land.canonical(m);
    if (out.has(c)) continue;
    const better = improvingNeighbours(land, m, u, moves).some((nb) => land.stowable(nb));
    if (!better) out.set(c, u);
  }
  return [...out.entries()].map(([mask, value]) => ({ mask, value })).sort((a, b) => b.value - a.value);
}

const hamming = (a: number, b: number) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
};

/**
 * The natural starts that make sense on a level. The myopic player searches each call on its own:
 * where every decision is taken at one call (no pickups, one pump) that search is the optimum
 * itself, not an instinct, so it only plays voyages with pickups or a second pump.
 */
export function naturalKinds(level: Level): NaturalKind[] {
  const last = level.ports.length - 1;
  const pumps = level.ports.slice(0, last).filter((p) => p.price !== null).length;
  const pickups = level.boxes.some((b) => b.from > 0);
  return last >= 2 && (pickups || pumps >= 2) ? NATURAL_KINDS : NATURAL_KINDS.filter((k) => k !== 'myopic');
}

/** Everything the generator, the build and the audit read about a level. Null if nothing can sail. */
export function measure(level: Level, o: MeasureOptions): Metrics | null {
  const land = new Landscape(level);
  const opt = land.best();
  if (!opt) return null;
  const vstar = opt.value;
  const rng = new Rng(o.seed);

  // the optimal plan: the cheapest bunkers and a stowage for the optimal manifest
  const fuel = land.fuelOf(opt.mask)!;
  const stow = land.table.stow(opt.mask);
  const best = stow ? toPlan(level, fuel, stow) : [];

  // on a single leg the myopic player's per-call search is the optimum itself: not an instinct
  const kinds = naturalKinds(level);
  const naturals = kinds.map((k) => playNatural(level, k, land));
  const legal = naturals.filter((p) => p.legal);
  const top = legal.length ? legal.reduce((a, b) => (b.profit > a.profit ? b : a)) : null;
  const greedyBest = top ? top.profit : Math.floor(vstar / 2) - 1;

  const decoys = decoysOf(land, vstar, Math.ceil(0.9 * vstar));
  const bestDecoy = decoys.length ? decoys[0].value : null;
  const stars = thresholds(vstar, greedyBest, bestDecoy, isLesson(level.band));

  const optimal = land.masksWorth(vstar);
  const omega = new Set(optimal.map((m) => land.canonical(m))).size;

  // exchange depth from the natural starts
  const startMasks = naturals.map((p) => p.mask);
  let depth = 4;
  for (let k = 1; k <= 3; k++) {
    const moves = kExchange(k);
    const hits = startMasks.filter((m) => climbManifest(land, m, moves, { maxEdits: 40 }).value >= vstar).length;
    if (hits * 2 >= startMasks.length) {
      depth = k;
      break;
    }
  }

  // the strong editor: pure starts and jittered ones (two per kind)
  const starts: { kind: NaturalKind; mask: number; noisy: boolean }[] = naturals.map((p) => ({ kind: p.kind, mask: p.mask, noisy: false }));
  for (const k of kinds) {
    if (k === 'myopic') continue;
    for (let j = 0; j < 2; j++) starts.push({ kind: k, mask: playNatural(level, k, land, new Rng(rng.int(1, 1e9))).mask, noisy: true });
  }
  const strong = strongPlayer(land, starts, o.strongRuns, rng);
  const share = (vals: number[], t: number) => vals.filter((v) => v >= t).length / Math.max(1, vals.length);
  const s1 = share(strong.values, stars[0]);
  const s2 = share(strong.values, stars[1]);
  const s3 = share(strong.values, stars[2]);
  const careful = carefulPlayer(land, startMasks, o.carefulRandom, rng);
  const c3 = share(careful, vstar);

  const tink: number[] = [];
  for (let r = 0; r < o.tinkerRuns; r++) tink.push(tinkerer(level, rng, 40, land));
  const t1 = share(tink, stars[0]);
  const t3 = share(tink, stars[2]);

  const abl: Partial<Record<Mechanic, number>> = {};
  for (const m of o.ablate ?? level.mechanics) {
    const d = ablation(level, vstar, m, land);
    if (d !== null) abl[m] = d;
  }

  const sim = simulate(level, best).projection;
  const prof = land.profile(opt.mask);
  const nearestOpt = top ? optimal.reduce((a, b) => (hamming(b, top.mask) < hamming(a, top.mask) ? b : a)) : opt.mask;
  const nearest = top ? hamming(nearestOpt, top.mask) : 0;
  const sacrifice = top ? hamming(top.mask & ~nearestOpt, 0) : 0;
  return {
    vstar,
    bestMask: opt.mask,
    best,
    omega,
    naturals,
    greedyBest,
    greedyKind: top?.kind ?? 'density',
    gap: vstar > 0 ? 1 - greedyBest / vstar : 0,
    stars,
    decoys: decoys.length,
    bestDecoy,
    bestDecoyMask: decoys.length ? decoys[0].mask : null,
    depth,
    s1,
    s2,
    s3,
    edits: strong.edits.reduce((a, b) => a + b, 0) / Math.max(1, strong.edits.length),
    c3,
    t1,
    t3,
    ablation: abl,
    onMark: sim.onMark.some((x) => x),
    onReserve: sim.finalRob === level.reserve,
    cargoFill: Math.max(...prof.legW) / level.ship.capacity,
    optBoxes: hamming(opt.mask, 0),
    trap: nearest,
    sacrifice,
    di: difficultyIndex(s1, s3, c3),
  };
}

/** The numbers stored with a level (`Level.stats`). */
export function statsRecord(m: Metrics, extra: Record<string, number | string> = {}): Record<string, number | string> {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const out: Record<string, number | string> = {
    vstar: m.vstar,
    omega: m.omega,
    greedy: m.greedyBest,
    greedyKind: m.greedyKind,
    gap: r2(m.gap),
    decoys: m.decoys,
    bestDecoy: m.bestDecoy ?? -1,
    depth: m.depth,
    s1: r2(m.s1),
    s2: r2(m.s2),
    s3: r2(m.s3),
    c3: r2(m.c3),
    t1: r2(m.t1),
    t3: r2(m.t3),
    edits: Math.round(m.edits * 10) / 10,
    di: Math.round(m.di),
    trap: m.trap,
    sacrifice: m.sacrifice,
    onMark: m.onMark ? 1 : 0,
    onReserve: m.onReserve ? 1 : 0,
    fill: r2(m.cargoFill),
  };
  for (const p of m.naturals) out['g_' + p.kind] = p.legal ? p.profit : -1;
  for (const [k, v] of Object.entries(m.ablation)) out['abl_' + k] = v!;
  return { ...out, ...extra };
}
