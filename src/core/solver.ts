import { bandOf, needPlan } from './rules';
import type { BoxId, Call, Level } from './types';

/**
 * The exact optimum, by decomposition. A *manifest* (which boxes sail) fixes the weight profile of
 * every leg, so the cheapest bunker plan depends on the manifest only (a tiny DP), and the stowage
 * only adds restow fees (a small search). V(M) = freight − min bunkers − fee · min restows.
 */

export interface FuelPlan {
  cost: number;
  /** tonnes bought at each port (index = port) */
  buy: number[];
  /** fuel on arrival at each port */
  arrive: number[];
}

export interface Manifest {
  mask: number;
  freight: number;
  /** cargo weight aboard on each leg */
  legW: number[];
  legReefers: number[];
  fuel: FuelPlan | null;
  /** freight − fuel cost (an upper bound on V) */
  ub: number;
}

export interface StowPlan {
  restows: number;
  /** loads per port, in push order */
  loads: { box: BoxId; bay: number }[][];
}

export interface Solution {
  value: number;
  mask: number;
  plan: Call[];
  restows: number;
  fuelCost: number;
  freight: number;
}

const NEG = -1e9;

/** All per-manifest data computed incrementally over bitmasks. */
export class ManifestTable {
  readonly level: Level;
  readonly n: number;
  readonly legs: number;
  readonly mandatory: number;
  private fuelMemo = new Map<string, FuelPlan | null>();
  private stowMemo = new Map<number, StowPlan | null>();

  constructor(level: Level) {
    this.level = level;
    this.n = level.boxes.length;
    this.legs = level.ports.length - 1;
    let m = 0;
    for (const b of level.boxes) if (b.contract) m |= 1 << b.id;
    this.mandatory = m;
    if (this.n > 20) throw new Error('too many boxes for the exact solver');
  }

  /** Weight profile and freight of a mask; null if it can't physically fit (slots, plugs). */
  profile(mask: number): { freight: number; legW: number[]; legReefers: number[] } | null {
    const { boxes, ship } = this.level;
    const legW = new Array(this.legs).fill(0);
    const legN = new Array(this.legs).fill(0);
    const legR = new Array(this.legs).fill(0);
    let freight = 0;
    const reeferRule = this.level.mechanics.includes('reefer');
    for (let i = 0; i < this.n; i++) {
      if (!(mask & (1 << i))) continue;
      const b = boxes[i];
      freight += b.freight;
      for (let l = b.from; l < b.to; l++) {
        legW[l] += b.weight;
        legN[l]++;
        if (b.reefer && reeferRule) legR[l]++;
      }
    }
    const slots = ship.bays * ship.tiers;
    const plugSlots = (ship.plugs?.length ?? 0) * ship.tiers;
    for (let l = 0; l < this.legs; l++) {
      if (legN[l] > slots) return null;
      if (reeferRule && legR[l] > plugSlots) return null;
      if (legW[l] > ship.capacity) return null;
    }
    return { freight, legW, legReefers: legR };
  }

  /** Cheapest bunker plan for a weight profile (null = no safe plan). */
  fuel(legW: number[], legReefers: number[]): FuelPlan | null {
    const key = legW.join(',') + '|' + legReefers.join(',');
    const hit = this.fuelMemo.get(key);
    if (hit !== undefined) return hit;
    const res = fuelDP(this.level, legW, legReefers);
    this.fuelMemo.set(key, res);
    return res;
  }

  manifest(mask: number): Manifest | null {
    if ((mask & this.mandatory) !== this.mandatory) return null;
    const p = this.profile(mask);
    if (!p) return null;
    const fuel = this.fuel(p.legW, p.legReefers);
    return { mask, freight: p.freight, legW: p.legW, legReefers: p.legReefers, fuel, ub: fuel ? p.freight - fuel.cost : NEG };
  }

  stow(mask: number): StowPlan | null {
    const hit = this.stowMemo.get(mask);
    if (hit !== undefined) return hit;
    const res = stowSearch(this.level, mask);
    this.stowMemo.set(mask, res);
    return res;
  }

  /** Exact value of a manifest (−1e9 if it can't sail). */
  value(mask: number): number {
    const m = this.manifest(mask);
    if (!m || !m.fuel) return NEG;
    const s = this.stow(mask);
    if (!s) return NEG;
    return m.ub - s.restows * this.level.restowFee;
  }

  /** Every manifest's upper bound (freight − bunkers), NEG where it can't sail. */
  ubTable(): Float64Array {
    const size = 1 << this.n;
    const t = new Float64Array(size);
    for (let mask = 0; mask < size; mask++) {
      const m = this.manifest(mask);
      t[mask] = m && m.fuel ? m.ub : NEG;
    }
    return t;
  }
}

/** Forward DP over (port, fuel on arrival). */
export function fuelDP(level: Level, legW: number[], legReefers: number[]): FuelPlan | null {
  const { ship, ports, legs } = level;
  const T = ship.tank;
  const P = ports.length;
  const INF = 1e9;
  // cost[i][f]: cheapest way to arrive at port i with f tonnes aboard
  const cost: number[][] = Array.from({ length: P }, () => new Array(T + 1).fill(INF));
  const from: [number, number][][] = Array.from({ length: P }, () => new Array(T + 1).fill(null));
  if (level.startFuel > T) return null;
  cost[0][level.startFuel] = 0;
  const zoneOn = level.mechanics.includes('zone');
  const bridgeOn = level.mechanics.includes('bridge');
  for (let i = 0; i < P - 1; i++) {
    const port = ports[i];
    const leg = legs[i];
    const lot = port.lot ?? 1;
    const nextBar = ports[i + 1].bar;
    for (let f = 0; f <= T; f++) {
      const c0 = cost[i][f];
      if (c0 >= INF) continue;
      const maxBuy = port.price === null ? 0 : T - f;
      for (let b = 0; b <= maxBuy; b += lot) {
        const F = f + b;
        const w = legW[i] + F;
        if (w > ship.capacity) break;
        if (port.bar !== undefined && w > port.bar) break;
        if (bridgeOn && leg.bridge && w < leg.bridge.min) continue;
        const band = bandOf(ship, w);
        const rate = ship.bands[band].rate;
        if (zoneOn && leg.zone && w - leg.zone.at * rate > leg.zone.limit) continue;
        const burn = leg.days * rate + legReefers[i];
        const fin = F - burn;
        if (fin < level.reserve) continue;
        if (nextBar !== undefined && w - burn > nextBar) continue;
        const c = c0 + b * (port.price ?? 0);
        if (c < cost[i + 1][fin]) {
          cost[i + 1][fin] = c;
          from[i + 1][fin] = [f, b];
        }
      }
    }
  }
  let best = INF;
  let bf = -1;
  for (let f = 0; f <= T; f++) {
    // ties: arrive with less fuel (nothing wasted)
    if (cost[P - 1][f] < best) {
      best = cost[P - 1][f];
      bf = f;
    }
  }
  if (bf < 0) return null;
  const buy = new Array(P).fill(0);
  const arrive = new Array(P).fill(0);
  let f = bf;
  for (let i = P - 1; i > 0; i--) {
    arrive[i] = f;
    const [pf, b] = from[i][f];
    buy[i - 1] = b;
    f = pf;
  }
  arrive[0] = level.startFuel;
  return { cost: best, buy, arrive };
}

/**
 * Minimum restows for a manifest, with a stowage that honours tiers, heavy-below-light and plugs.
 * Depth-first over each call's pushes, memoised on (port, boxes left this call, bays).
 */
export function stowSearch(level: Level, mask: number): StowPlan | null {
  const { boxes, ship, ports } = level;
  const heavy = level.mechanics.includes('heavy');
  const reefer = level.mechanics.includes('reefer');
  const plugs = new Set(ship.plugs ?? []);
  const P = ports.length;
  const byPort: number[][] = Array.from({ length: P }, () => []);
  for (const b of boxes) if (mask & (1 << b.id)) byPort[b.from].push(b.id);
  // later destinations first is the natural push order: try those first so the first leaf is good
  for (const list of byPort) list.sort((a, b) => boxes[b].to - boxes[a].to || boxes[b].weight - boxes[a].weight);

  const memo = new Map<string, number>();
  const choice = new Map<string, [number, string] | null>();
  const INF = 1e6;

  const key = (port: number, left: number, bays: number[][]) => {
    // bays are interchangeable inside their plug group: canonicalise by sorting
    const parts = bays.map((b, i) => (plugs.has(i) ? 'p' : 'n') + b.join('.'));
    const sorted = parts.slice().sort();
    return port + '/' + left + '/' + sorted.join('|');
  };

  const discharge = (bays: number[][], port: number): number => {
    let n = 0;
    for (const bay of bays) {
      const k = bay.findIndex((id) => boxes[id].to === port);
      if (k < 0) continue;
      const lifted = bay.splice(k);
      for (const id of lifted) {
        if (boxes[id].to !== port) {
          n++;
          bay.push(id);
        }
      }
    }
    return n;
  };

  // solve(port, leftIdx bitmask over byPort[port], bays) → min restows from here on
  const solve = (port: number, left: number, bays: number[][]): number => {
    if (port >= P - 1) return 0;
    const k = key(port, left, bays);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    const list = byPort[port];
    let best = INF;
    let bestChoice: [number, string] | null = null;
    if (left === 0) {
      // sail to the next port and discharge there
      const next = bays.map((b) => b.slice());
      const r = discharge(next, port + 1);
      best = r + solve(port + 1, (1 << byPort[port + 1].length) - 1, next);
    } else {
      const seen = new Set<string>();
      for (let j = 0; j < list.length; j++) {
        if (!(left & (1 << j))) continue;
        const id = list[j];
        const b = boxes[id];
        // identical boxes: only try the first
        const sig = `${b.to}:${b.weight}:${b.reefer ? 1 : 0}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const triedBays = new Set<string>();
        for (let bi = 0; bi < bays.length; bi++) {
          const bay = bays[bi];
          if (bay.length >= ship.tiers) continue;
          if (bay.length && boxes[bay[bay.length - 1]].to < b.to) continue;
          if (heavy && bay.length && boxes[bay[bay.length - 1]].weight < b.weight) continue;
          if (reefer && b.reefer && !plugs.has(bi)) continue;
          const bsig = (plugs.has(bi) ? 'p' : 'n') + bay.join('.');
          if (triedBays.has(bsig)) continue;
          triedBays.add(bsig);
          bay.push(id);
          const r = solve(port, left & ~(1 << j), bays);
          bay.pop();
          if (r < best) {
            best = r;
            bestChoice = [j, bsig];
            if (best === 0) break;
          }
        }
        if (best === 0) break;
      }
    }
    memo.set(k, best);
    choice.set(k, bestChoice);
    return best;
  };

  const bays0: number[][] = Array.from({ length: ship.bays }, () => []);
  const total = solve(0, (1 << byPort[0].length) - 1, bays0);
  if (total >= INF) return null;
  // reconstruct
  const loads: { box: BoxId; bay: number }[][] = Array.from({ length: P }, () => []);
  let bays = bays0.map((b) => b.slice());
  for (let port = 0; port < P - 1; port++) {
    let left = (1 << byPort[port].length) - 1;
    while (left) {
      const c = choice.get(key(port, left, bays));
      if (!c) return null;
      const [j, sig] = c;
      const bi = bays.findIndex((b, i) => (plugs.has(i) ? 'p' : 'n') + b.join('.') === sig);
      if (bi < 0) return null;
      bays[bi].push(byPort[port][j]);
      loads[port].push({ box: byPort[port][j], bay: bi });
      left &= ~(1 << j);
    }
    bays = bays.map((b) => b.slice());
    discharge(bays, port + 1);
  }
  return { restows: total, loads };
}

/** Exact optimum: walk manifests by upper bound, check stowage lazily. */
export function solve(level: Level, table = new ManifestTable(level)): Solution | null {
  const size = 1 << table.n;
  const cand: { mask: number; ub: number }[] = [];
  for (let mask = 0; mask < size; mask++) {
    const m = table.manifest(mask);
    if (m && m.fuel) cand.push({ mask, ub: m.ub });
  }
  cand.sort((a, b) => b.ub - a.ub || popcount(a.mask) - popcount(b.mask));
  let best: Solution | null = null;
  for (const c of cand) {
    if (best && c.ub < best.value) break;
    if (best && c.ub === best.value) continue;
    const stow = table.stow(c.mask);
    if (!stow) continue;
    const v = c.ub - stow.restows * level.restowFee;
    if (!best || v > best.value) {
      const m = table.manifest(c.mask)!;
      best = { value: v, mask: c.mask, plan: toPlan(level, m.fuel!, stow), restows: stow.restows, fuelCost: m.fuel!.cost, freight: m.freight };
    }
  }
  return best;
}

export function toPlan(level: Level, fuel: FuelPlan, stow: StowPlan): Call[] {
  return level.ports.slice(0, -1).map((_, i) => ({ loads: stow.loads[i].slice(), bunker: fuel.buy[i] }));
}

export function popcount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/** The manifest (bitmask) of a plan. */
export function maskOf(plan: Call[]): number {
  let m = 0;
  for (const c of plan) for (const l of c.loads) m |= 1 << l.box;
  return m;
}

/**
 * The cheapest safe bunker plan for the boxes a plan loads (World 1's automatic valve). Falls back
 * to the myopic NEED plan when no safe plan exists, so the strip still shows where she runs short.
 */
export function autoBunker(level: Level, plan: Call[], table = new ManifestTable(level)): Call[] {
  const mask = maskOf(plan);
  const p = table.profile(mask);
  const out = plan.map((c) => ({ loads: c.loads.slice(), bunker: 0 }));
  if (p) {
    const f = table.fuel(p.legW, p.legReefers);
    if (f) {
      out.forEach((c, i) => (c.bunker = f.buy[i]));
      return out;
    }
  }
  return needPlan(level, out);
}
