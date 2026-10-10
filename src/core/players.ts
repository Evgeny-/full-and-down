/**
 * Simulated players (docs/design-process/13 §2.1, 21 §3.2, 20 §1).
 *
 * - **Natural starts** play the voyage port by port through `simulate()`, as a person does with the
 *   live projection: greedy by freight, greedy by freight per tonne, fill-the-tank-first, and a
 *   myopic player that optimises each call on its own. Each loads boxes in its preference order and
 *   skips a box when the projection turns red. Bunkers: the Chief's cheapest safe plan on AUTO
 *   levels, otherwise the NEED ("gas station") rule.
 * - **Editors** search the manifest landscape (which boxes sail) with exact values: the strong
 *   editor (best improvement over add / drop / 1↔1 / 2↔1 / 1↔2, 5% slips, ≤ 20 edits) and the
 *   careful editor (3-exchange, no slips).
 * - **The random tinkerer** (critic 20's gate) makes random legal edits on the plan and keeps any
 *   edit that doesn't lower the score.
 */
import { bandOf, clonePlan, emptyPlan, placeRefusal, simulate, type SimResult } from './rules';
import { fuelDP, ManifestTable, maskOf, popcount, type FuelPlan } from './solver';
import type { Box, BoxId, Call, Level } from './types';
import { Rng } from './rng';

export const NEG = -1e9;

// ---------------------------------------------------------------------------------------------
// The manifest landscape

/**
 * Every manifest's exact value: freight − the cheapest safe bunker plan (`fuelDP`), or NEG when it
 * can't sail (slots, plugs, marks, fuel) or can't be stowed (never bury, heavy below light, plugs).
 * Values are those of `ManifestTable.value` (restows are refused, so the restow fee never applies);
 * the table is built incrementally over bitmasks and stowage is checked lazily.
 */
export class Landscape {
  readonly level: Level;
  readonly table: ManifestTable;
  readonly n: number;
  readonly size: number;
  readonly legs: number;
  readonly mandatory: number;
  /** freight − min bunkers (NEG if it can't sail); an upper bound on the value */
  readonly ub: Float64Array;
  readonly freight: Int32Array;
  /** per mask × leg: cargo weight and reefers aboard */
  readonly legW: Int16Array;
  readonly legR: Int16Array;
  /** canonical representative of each mask (identical boxes merged) */
  private readonly groups: number[][];
  private readonly stowOk: Int8Array;
  private readonly fuelMemo = new Map<number, FuelPlan | null>();
  private readonly ignoreStow: boolean;
  private order: Int32Array | null = null;

  constructor(level: Level, opts: { ignoreStow?: boolean; table?: ManifestTable } = {}) {
    this.level = level;
    this.table = opts.table ?? new ManifestTable(level);
    this.ignoreStow = !!opts.ignoreStow;
    const n = (this.n = level.boxes.length);
    const L = (this.legs = level.ports.length - 1);
    const size = (this.size = 1 << n);
    const { ship, boxes } = level;
    let mand = 0;
    for (const b of boxes) if (b.contract) mand |= 1 << b.id;
    this.mandatory = mand;
    const reeferRule = level.mechanics.includes('reefer');
    const W = (this.legW = new Int16Array(size * L));
    const N = new Int16Array(size * L);
    const R = (this.legR = new Int16Array(size * L));
    const F = (this.freight = new Int32Array(size));
    const ub = (this.ub = new Float64Array(size));
    const slots = ship.bays * ship.tiers;
    const plugSlots = (ship.plugs?.length ?? 0) * ship.tiers;
    const legWArr = new Array(L).fill(0);
    const legRArr = new Array(L).fill(0);
    for (let mask = 0; mask < size; mask++) {
      if (mask) {
        const low = mask & -mask;
        const i = 31 - Math.clz32(low);
        const prev = mask ^ low;
        const b = boxes[i];
        F[mask] = F[prev] + b.freight;
        const o = mask * L;
        const p = prev * L;
        for (let l = 0; l < L; l++) {
          let w = W[p + l];
          let c = N[p + l];
          let r = R[p + l];
          if (l >= b.from && l < b.to) {
            w += b.weight;
            c++;
            if (b.reefer && reeferRule) r++;
          }
          W[o + l] = w;
          N[o + l] = c;
          R[o + l] = r;
        }
      }
      if ((mask & mand) !== mand) {
        ub[mask] = NEG;
        continue;
      }
      const o = mask * L;
      let ok = true;
      let key = 0;
      for (let l = 0; l < L; l++) {
        if (N[o + l] > slots || W[o + l] > ship.capacity || (reeferRule && R[o + l] > plugSlots)) {
          ok = false;
          break;
        }
        key = key * 32 + W[o + l];
      }
      if (!ok) {
        ub[mask] = NEG;
        continue;
      }
      for (let l = 0; l < L; l++) key = key * 16 + R[o + l];
      let fuel = this.fuelMemo.get(key);
      if (fuel === undefined) {
        for (let l = 0; l < L; l++) {
          legWArr[l] = W[o + l];
          legRArr[l] = R[o + l];
        }
        fuel = fuelDP(level, legWArr, legRArr);
        this.fuelMemo.set(key, fuel);
      }
      ub[mask] = fuel ? F[mask] - fuel.cost : NEG;
    }
    this.stowOk = new Int8Array(size);
    // identical boxes (same route, weight, freight and tags) are one choice for the player
    const sig = new Map<string, number[]>();
    for (const b of boxes) {
      const k = `${b.from}:${b.to}:${b.weight}:${b.freight}:${b.reefer ? 1 : 0}:${b.contract ? 1 : 0}`;
      if (!sig.has(k)) sig.set(k, []);
      sig.get(k)!.push(b.id);
    }
    this.groups = [...sig.values()].filter((g) => g.length > 1);
  }

  profile(mask: number): { legW: number[]; legR: number[] } {
    const o = mask * this.legs;
    return { legW: Array.from(this.legW.subarray(o, o + this.legs)), legR: Array.from(this.legR.subarray(o, o + this.legs)) };
  }

  fuelOf(mask: number): FuelPlan | null {
    if (this.ub[mask] <= NEG) return null;
    const p = this.profile(mask);
    return this.table.fuel(p.legW, p.legR);
  }

  stowable(mask: number): boolean {
    if (this.ignoreStow) return true;
    const s = this.stowOk[mask];
    if (s) return s > 0;
    const { ship } = this.level;
    let ok: boolean;
    if (ship.tiers === 1 && !this.level.mechanics.includes('reefer')) ok = true;
    else ok = quickStow(this.level, mask) !== null || this.table.stow(mask) !== null;
    this.stowOk[mask] = ok ? 1 : -1;
    return ok;
  }

  /** Exact value of a manifest (NEG if it can't sail). */
  value(mask: number): number {
    const u = this.ub[mask];
    if (u <= NEG) return NEG;
    return this.stowable(mask) ? u : NEG;
  }

  /** Masks by upper bound, best first (ties: fewer boxes, then lower mask). */
  sorted(): Int32Array {
    if (this.order) return this.order;
    const idx: number[] = [];
    for (let m = 0; m < this.size; m++) if (this.ub[m] > NEG) idx.push(m);
    idx.sort((a, b) => this.ub[b] - this.ub[a] || popcount(a) - popcount(b) || a - b);
    this.order = Int32Array.from(idx);
    return this.order;
  }

  /** The optimum V* and its manifest (the same choice as `solve()`), null if nothing can sail. */
  best(): { value: number; mask: number } | null {
    for (const m of this.sorted()) if (this.stowable(m)) return { value: this.ub[m], mask: m };
    return null;
  }

  /** Every manifest worth exactly `v` (stowable). */
  masksWorth(v: number): number[] {
    const out: number[] = [];
    for (const m of this.sorted()) {
      if (this.ub[m] < v) break;
      if (this.ub[m] === v && this.stowable(m)) out.push(m);
    }
    return out;
  }

  /** The representative of a mask with identical boxes merged (lowest ids first). */
  canonical(mask: number): number {
    let m = mask;
    for (const g of this.groups) {
      let c = 0;
      for (const id of g) if (m & (1 << id)) c++;
      for (const id of g) m &= ~(1 << id);
      for (let k = 0; k < c; k++) m |= 1 << g[k];
    }
    return m;
  }
}

/**
 * A fast stowage that is legal by construction (null if it gets stuck): at each call, boxes go
 * farthest-first onto the stack whose top leaves soonest after them (an empty stack last). A
 * sufficient check; `stowSearch` is exact.
 */
export function quickStow(level: Level, mask: number): { box: BoxId; bay: number }[][] | null {
  const { ship, boxes, ports } = level;
  const plugs = new Set(ship.plugs ?? []);
  const reeferRule = level.mechanics.includes('reefer');
  const bays: BoxId[][] = Array.from({ length: ship.bays }, () => []);
  const loads: { box: BoxId; bay: number }[][] = [];
  for (let i = 0; i < ports.length - 1; i++) {
    for (const bay of bays) {
      const k = bay.findIndex((id) => boxes[id].to <= i);
      if (k >= 0) bay.splice(k);
    }
    const here = boxes.filter((b) => mask & (1 << b.id) && b.from === i);
    here.sort((a, b) => b.to - a.to || b.weight - a.weight || (b.reefer ? 1 : 0) - (a.reefer ? 1 : 0));
    const call: { box: BoxId; bay: number }[] = [];
    for (const b of here) {
      let best = -1;
      let bestKey = Infinity;
      for (let k = 0; k < bays.length; k++) {
        if (placeRefusal(level, bays[k], k, b)) continue;
        const top = bays[k].length ? boxes[bays[k][bays[k].length - 1]] : null;
        // tight fit first; an empty stack costs more; plugs are kept for reefers
        let key = top ? (top.to - b.to) * 10 + (ship.tiers - bays[k].length) : 1000;
        if (reeferRule && plugs.has(k) && !b.reefer) key += 500;
        if (key < bestKey) {
          bestKey = key;
          best = k;
        }
      }
      if (best < 0) return null;
      bays[best].push(b.id);
      call.push({ box: b.id, bay: best });
    }
    loads.push(call);
  }
  return loads;
}

// ---------------------------------------------------------------------------------------------
// Bunkering rules

/** auto: the Chief's cheapest safe plan; need: NEED at every pump; tank: fill the tank first, then NEED. */
export type BunkerRule = 'auto' | 'need' | 'tank';

/**
 * The NEED ("gas station") rule on a weight profile: at each pump, the least that reaches the next
 * pump (or the last port) on the reserve, with no bunkers at the dry ports in between. Where there
 * is no dry port this is exactly `needPlan` (rules.ts); past a dry port it is NEED plus the fix the
 * Chief's warning asks for. `firstBuy` fixes the first call's stem (fill the tank).
 */
export function gasFuel(level: Level, legW: number[], legR: number[], firstBuy?: number): number[] {
  const { ports, legs, ship, reserve } = level;
  const P = ports.length;
  const buy = new Array(P).fill(0);
  let fuel = level.startFuel;
  const burnAt = (l: number, w: number) => legs[l].days * ship.bands[bandOf(ship, w)].rate + legR[l];
  for (let i = 0; i < P - 1; i++) {
    const port = ports[i];
    if (port.price !== null) {
      const lot = port.lot ?? 1;
      let j = i + 1;
      while (j < P - 1 && ports[j].price === null) j++;
      let chosen = -1;
      if (i === 0 && firstBuy !== undefined) {
        chosen = Math.max(0, Math.floor(Math.min(firstBuy, ship.tank - fuel) / lot) * lot);
      } else {
        for (let b = 0; fuel + b <= ship.tank; b += lot) {
          let f = fuel + b;
          let ok = true;
          for (let l = i; l < j; l++) {
            f -= burnAt(l, legW[l] + f);
            if (f < reserve) {
              ok = false;
              break;
            }
          }
          if (ok) {
            chosen = b;
            break;
          }
        }
        // nothing reaches: the most she can take (the projection shows the shortfall)
        if (chosen < 0) chosen = Math.max(0, Math.floor((ship.tank - fuel) / lot) * lot);
      }
      buy[i] = chosen;
      fuel += chosen;
    }
    fuel -= burnAt(i, legW[i] + fuel);
  }
  return buy;
}

/** Per-leg cargo weight and reefers aboard for the boxes a plan loads. */
export function planProfile(level: Level, plan: Call[]): { legW: number[]; legR: number[] } {
  const L = level.ports.length - 1;
  const legW = new Array(L).fill(0);
  const legR = new Array(L).fill(0);
  const reeferRule = level.mechanics.includes('reefer');
  for (const c of plan)
    for (const ld of c.loads) {
      const b = level.boxes[ld.box];
      for (let l = b.from; l < b.to; l++) {
        legW[l] += b.weight;
        if (b.reefer && reeferRule) legR[l]++;
      }
    }
  return { legW, legR };
}

/** The plan with its bunkers set by a rule (the loads are kept as they are). */
export function applyBunkers(level: Level, plan: Call[], rule: BunkerRule, land?: Landscape): Call[] {
  const out = plan.map((c) => ({ loads: c.loads.slice(), bunker: 0 }));
  const prof = planProfile(level, plan);
  let buy: number[] | null = null;
  if (rule === 'auto') {
    const mask = maskOf(plan);
    const f = land && mask < land.size ? land.fuelOf(mask) : null;
    if (f) buy = f.buy;
    else if (!land) {
      const f2 = fuelDP(level, prof.legW, prof.legR);
      if (f2 && prof.legW.every((w) => w <= level.ship.capacity)) buy = f2.buy;
    }
  }
  if (!buy) buy = gasFuel(level, prof.legW, prof.legR, rule === 'tank' ? level.ship.tank : undefined);
  out.forEach((c, i) => (c.bunker = buy![i]));
  return out;
}

export interface Judged {
  profit: number;
  /** problems in the plan: 0 = safe to sail */
  bad: number;
  legal: boolean;
  sim: SimResult;
}

/**
 * How red the projection is. Contract boxes offered at ports after `upTo` don't count yet (the
 * player hasn't reached those tabs).
 */
export function judge(level: Level, plan: Call[], upTo = Infinity): Judged {
  const sim = simulate(level, plan);
  let bad = 0;
  for (const p of sim.projection.problems) {
    if (p.code === 'contract' && p.port > upTo) continue;
    bad += 1 + (p.amount ?? 0);
  }
  const boxBounces = sim.bounced.filter((b) => b.box !== undefined).length;
  bad += boxBounces;
  return { profit: sim.projection.profit, bad, legal: sim.projection.problems.length === 0 && boxBounces === 0, sim };
}

/** The bays at port `i` after this call's loads so far. */
export function stateAt(level: Level, plan: Call[], i: number): BoxId[][] {
  const r = simulate(level, plan);
  const bays = r.projection.calls[i].bays.map((b) => b.slice());
  for (const ld of r.plan[i]?.loads ?? []) bays[ld.bay].push(ld.box);
  return bays;
}

/**
 * Where a person puts a box: on the legal stack that keeps the most future boxes placeable (each
 * future box is checked against the stacks as they'll stand at its port), the tightest fit on ties.
 */
export function chooseBay(level: Level, bays: BoxId[][], box: Box, future: Box[]): number {
  let best = -1;
  let bestScore = -Infinity;
  const { boxes } = level;
  for (let k = 0; k < bays.length; k++) {
    if (placeRefusal(level, bays[k], k, box)) continue;
    const nb = bays.map((b) => b.slice());
    nb[k].push(box.id);
    let s = 0;
    for (const fb of future) {
      let c = 0;
      for (let j = 0; j < nb.length; j++) {
        const st = fb.from === box.from ? nb[j] : nb[j].filter((id) => boxes[id].to > fb.from);
        if (!placeRefusal(level, st, j, fb)) c++;
      }
      s += c > 0 ? 1 + 0.01 * c : 0;
    }
    const top = bays[k].length ? boxes[bays[k][bays[k].length - 1]] : null;
    const fit = top ? top.to - box.to : 50;
    const score = s - 0.001 * fit - 0.00001 * k;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Natural starts

export type NaturalKind = 'freight' | 'density' | 'tank' | 'myopic';
export const NATURAL_KINDS: NaturalKind[] = ['freight', 'density', 'tank', 'myopic'];

export interface Played {
  kind: NaturalKind;
  plan: Call[];
  profit: number;
  legal: boolean;
  mask: number;
}

function ruleFor(level: Level, kind: NaturalKind): BunkerRule {
  if (level.auto) return 'auto';
  return kind === 'tank' ? 'tank' : 'need';
}

function prefKey(kind: NaturalKind, b: Box): number {
  if (kind === 'freight') return b.freight + 0.01 / b.weight;
  return b.freight / b.weight + 0.001 * b.freight;
}

/** A greedy player: port by port, boxes in preference order, each kept only if the projection stays clean. */
function greedyPlay(level: Level, kind: NaturalKind, land: Landscape | undefined, noise?: Rng): Call[] {
  const rule = ruleFor(level, kind);
  const P = level.ports.length;
  const jitter = new Map<number, number>();
  if (noise) for (const b of level.boxes) jitter.set(b.id, noise.range(0.82, 1.18));
  const key = (b: Box) => prefKey(kind, b) * (jitter.get(b.id) ?? 1);
  let plan = applyBunkers(level, emptyPlan(level), rule, land);
  let cur = judge(level, plan, 0);
  for (let i = 0; i < P - 1; i++) {
    cur = judge(level, plan, i);
    const offers = level.boxes
      .filter((b) => b.from === i)
      .sort((a, b) => (b.contract ? 1 : 0) - (a.contract ? 1 : 0) || key(b) - key(a) || a.id - b.id);
    for (let k = 0; k < offers.length; k++) {
      const box = offers[k];
      const bays = stateAt(level, plan, i);
      const future = [...offers.slice(k + 1), ...level.boxes.filter((b) => b.from > i)];
      const bay = chooseBay(level, bays, box, future);
      if (bay < 0) continue;
      const trial = clonePlan(plan);
      trial[i].loads.push({ box: box.id, bay });
      const t2 = applyBunkers(level, trial, rule, land);
      const j = judge(level, t2, i);
      if (j.bad <= cur.bad) {
        plan = t2;
        cur = j;
      }
    }
  }
  return plan;
}

function subsetsOf<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let m = 0; m < 1 << xs.length; m++) out.push(xs.filter((_, i) => m & (1 << i)));
  return out;
}

/** The myopic player: at each call, the load that pays best against this call's bunkers, ignoring what comes later. */
function myopicPlay(level: Level, land: Landscape | undefined): Call[] {
  const rule = ruleFor(level, 'myopic');
  const P = level.ports.length;
  let plan = applyBunkers(level, emptyPlan(level), rule, land);
  for (let i = 0; i < P - 1; i++) {
    const base = judge(level, plan, i);
    const offers = level.boxes.filter((b) => b.from === i);
    const mand = offers.filter((b) => b.contract);
    const opt = offers.filter((b) => !b.contract);
    let best: Call[] | null = null;
    let bestScore = -Infinity;
    let bestN = Infinity;
    for (const sub of subsetsOf(opt)) {
      const chosen = [...mand, ...sub].sort((a, b) => b.to - a.to || b.weight - a.weight);
      const trial = clonePlan(plan);
      let ok = true;
      for (let k = 0; k < chosen.length; k++) {
        const bays = stateAt(level, trial, i);
        const future = [...chosen.slice(k + 1), ...level.boxes.filter((b) => b.from > i)];
        const bay = chooseBay(level, bays, chosen[k], future);
        if (bay < 0) {
          ok = false;
          break;
        }
        trial[i].loads.push({ box: chosen[k].id, bay });
      }
      if (!ok) continue;
      const t2 = applyBunkers(level, trial, rule, land);
      const j = judge(level, t2, i);
      if (j.bad > base.bad && sub.length) continue;
      const freight = chosen.reduce((s, b) => s + b.freight, 0);
      const fuel = rule === 'auto' ? j.sim.projection.fuelCost : t2[i].bunker * (level.ports[i].price ?? 0);
      const score = freight - fuel - (j.bad > base.bad ? 1000 : 0);
      if (score > bestScore || (score === bestScore && chosen.length < bestN)) {
        bestScore = score;
        best = t2;
        bestN = chosen.length;
      }
    }
    if (best) plan = best;
  }
  return applyBunkers(level, plan, rule, land);
}

/** One natural start, as a full plan evaluated by `simulate()`. `noise` jitters the preferences (±18%). */
export function playNatural(level: Level, kind: NaturalKind, land?: Landscape, noise?: Rng): Played {
  const plan = kind === 'myopic' ? myopicPlay(level, land) : greedyPlay(level, kind === 'tank' ? 'tank' : kind, land, noise);
  const j = judge(level, plan);
  return { kind, plan, profit: j.sim.projection.profit, legal: j.legal, mask: maskOf(plan) };
}

// ---------------------------------------------------------------------------------------------
// Editors on the manifest landscape

/** (boxes dropped, boxes added) per move. */
export type Move = [number, number];
export const STRONG_MOVES: Move[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [2, 1],
  [1, 2],
];
export function kExchange(k: number): Move[] {
  const out: Move[] = [];
  for (let d = 0; d <= k; d++) for (let a = 0; a <= k; a++) if (d || a) out.push([d, a]);
  return out;
}

function combos(items: number[], k: number): number[] {
  const out: number[] = [];
  const rec = (start: number, left: number, acc: number) => {
    if (!left) {
      out.push(acc);
      return;
    }
    for (let i = start; i <= items.length - left; i++) rec(i + 1, left - 1, acc | (1 << items[i]));
  };
  rec(0, k, 0);
  return out;
}

/** Neighbours of `mask` whose upper bound beats `v` (only those can improve on it). */
export function improvingNeighbours(land: Landscape, mask: number, v: number, moves: Move[]): number[] {
  const inS: number[] = [];
  const outS: number[] = [];
  for (let i = 0; i < land.n; i++) (mask & (1 << i) ? inS : outS).push(i);
  const maxD = Math.max(...moves.map((m) => m[0]));
  const maxA = Math.max(...moves.map((m) => m[1]));
  const drops: number[][] = [];
  const adds: number[][] = [];
  for (let d = 0; d <= maxD; d++) drops.push(combos(inS, d));
  for (let a = 0; a <= maxA; a++) adds.push(combos(outS, a));
  const out: number[] = [];
  const ub = land.ub;
  for (const [d, a] of moves) {
    for (const D of drops[d]) {
      const base = mask & ~D;
      for (const A of adds[a]) {
        const nb = base | A;
        if (ub[nb] > v) out.push(nb);
      }
    }
  }
  return out;
}

/** One best-improvement step (or a random improving step when `slip`); null at a local optimum. */
export function step(land: Landscape, mask: number, v: number, moves: Move[], rng?: Rng, slip = false): number | null {
  const cand = improvingNeighbours(land, mask, v, moves);
  if (!cand.length) return null;
  if (slip && rng) {
    rng.shuffle(cand);
    for (const nb of cand) if (land.stowable(nb)) return nb;
    return null;
  }
  cand.sort((a, b) => land.ub[b] - land.ub[a] || popcount(a) - popcount(b) || a - b);
  for (const nb of cand) if (land.stowable(nb)) return nb;
  return null;
}

/** Hill climb from `start`; returns the final manifest and its value. */
export function climbManifest(land: Landscape, start: number, moves: Move[], o: { maxEdits?: number; slip?: number; rng?: Rng } = {}): { mask: number; value: number; edits: number } {
  let mask = start;
  let v = land.value(mask);
  let edits = 0;
  const max = o.maxEdits ?? 1000;
  while (edits < max) {
    const slip = !!o.rng && o.slip !== undefined && o.rng.next() < o.slip;
    const nb = step(land, mask, v, moves, o.rng, slip);
    if (nb === null) break;
    mask = nb;
    v = land.value(nb);
    edits++;
  }
  return { mask, value: v, edits };
}

/** A random maximal load: boxes in random order, each kept if the manifest can still sail. */
export function randomMaximal(land: Landscape, rng: Rng): number {
  let mask = land.mandatory;
  const ids = rng.shuffle([...Array(land.n).keys()]);
  for (const i of ids) {
    const m = mask | (1 << i);
    if (m !== mask && land.value(m) > NEG) mask = m;
  }
  return mask;
}

/** The share of natural starts the strong player begins from (doc 13 §2.1). */
export const STRONG_START_WEIGHTS: Record<NaturalKind, number> = { density: 0.4, freight: 0.3, tank: 0.15, myopic: 0.15 };

export interface StrongResult {
  values: number[];
  edits: number[];
}

/**
 * The strong editor: `runs` games, each from a natural start (pure, or with jittered preferences),
 * best improvement over add / drop / 1↔1 / 2↔1 / 1↔2 with 5% slips, at most 20 edits.
 */
export function strongPlayer(land: Landscape, starts: { kind: NaturalKind; mask: number; noisy: boolean }[], runs: number, rng: Rng): StrongResult {
  const values: number[] = [];
  const edits: number[] = [];
  const byKind = new Map<NaturalKind, { pure: number[]; noisy: number[] }>();
  for (const s of starts) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, { pure: [], noisy: [] });
    byKind.get(s.kind)![s.noisy ? 'noisy' : 'pure'].push(s.mask);
  }
  const kinds = NATURAL_KINDS.filter((k) => byKind.has(k));
  const weights = kinds.map((k) => STRONG_START_WEIGHTS[k]);
  for (let r = 0; r < runs; r++) {
    const kind = kinds[rng.weighted(weights)];
    const pool = byKind.get(kind)!;
    const useNoisy = pool.noisy.length > 0 && rng.chance(0.5);
    const start = useNoisy ? rng.pick(pool.noisy) : rng.pick(pool.pure.length ? pool.pure : pool.noisy);
    const res = climbManifest(land, start, STRONG_MOVES, { maxEdits: 20, slip: 0.05, rng });
    values.push(res.value);
    edits.push(res.edits);
  }
  return { values, edits };
}

/** The careful editor: 3-exchange from every natural start and a few random maximal loads, no slips. */
export function carefulPlayer(land: Landscape, starts: number[], randomLoads: number, rng: Rng): number[] {
  const all = [...starts];
  for (let k = 0; k < randomLoads; k++) all.push(randomMaximal(land, rng));
  return all.map((m) => climbManifest(land, m, kExchange(3), { maxEdits: 40 }).value);
}

// ---------------------------------------------------------------------------------------------
// The random tinkerer

function tinkerScore(j: Judged): number {
  return j.legal ? j.profit : -1e6 - 100 * j.bad + j.profit;
}

/** One random edit a player can make in the planner (null if the chosen edit has nothing to act on). */
function randomEdit(level: Level, plan: Call[], rng: Rng, rule: BunkerRule, land: Landscape | undefined): Call[] | null {
  const P = level.ports.length;
  const loaded = new Set<number>();
  for (const c of plan) for (const l of c.loads) loaded.add(l.box);
  const manual = rule !== 'auto';
  const kinds = manual ? [0.4, 0.2, 0.1, 0.18, 0.12] : [0.55, 0.3, 0.15, 0, 0];
  const what = rng.weighted(kinds);
  let next = clonePlan(plan);
  let refuel = !manual;
  if (what === 0) {
    const free = level.boxes.filter((b) => !loaded.has(b.id));
    if (!free.length) return null;
    const box = rng.pick(free);
    const bays = stateAt(level, next, box.from);
    const legal = bays.map((b, k) => (placeRefusal(level, b, k, box) ? -1 : k)).filter((k) => k >= 0);
    if (!legal.length) return null;
    next[box.from].loads.push({ box: box.id, bay: rng.pick(legal) });
    if (manual && rng.chance(0.5)) refuel = true;
  } else if (what === 1) {
    if (!loaded.size) return null;
    const id = rng.pick([...loaded]);
    for (const c of next) c.loads = c.loads.filter((l) => l.box !== id);
    if (manual && rng.chance(0.5)) refuel = true;
  } else if (what === 2) {
    if (!loaded.size) return null;
    const id = rng.pick([...loaded]);
    const box = level.boxes[id];
    const call = next[box.from];
    call.loads = call.loads.filter((l) => l.box !== id);
    const bays = stateAt(level, next, box.from);
    const legal = bays.map((b, k) => (placeRefusal(level, b, k, box) ? -1 : k)).filter((k) => k >= 0);
    if (!legal.length) return null;
    call.loads.push({ box: id, bay: rng.pick(legal) });
  } else if (what === 3) {
    const pumps = [...Array(P - 1).keys()].filter((i) => level.ports[i].price !== null);
    if (!pumps.length) return null;
    const i = rng.pick(pumps);
    const lot = level.ports[i].lot ?? 1;
    next[i].bunker = Math.max(0, next[i].bunker + (rng.chance(0.5) ? lot : -lot));
  } else {
    refuel = true;
  }
  // later actions that no longer fit bounce back to their quay
  next = simulate(level, next).plan;
  if (refuel) next = applyBunkers(level, next, manual ? 'need' : 'auto', land);
  return next;
}

/**
 * Critic 20's random tinkerer: `edits` random edits from an empty plan, each kept if it doesn't
 * lower the score (an unsafe plan scores below every safe one). Returns the final profit (NEG if the
 * plan can't sail).
 */
export function tinkerer(level: Level, rng: Rng, edits = 40, land?: Landscape): number {
  const rule: BunkerRule = level.auto ? 'auto' : 'need';
  let plan = applyBunkers(level, emptyPlan(level), rule, land);
  let j = judge(level, plan);
  let s = tinkerScore(j);
  for (let e = 0; e < edits; e++) {
    const next = randomEdit(level, plan, rng, rule, land);
    if (!next) continue;
    const j2 = judge(level, next);
    const s2 = tinkerScore(j2);
    if (s2 >= s) {
      plan = next;
      j = j2;
      s = s2;
    }
  }
  return j.legal ? j.profit : NEG;
}
