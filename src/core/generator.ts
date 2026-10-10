/**
 * The level generator (docs/design-process/13 §5, 21 §3.3): per ladder row, draft random voyages
 * that honour the row's mechanics and the number palette, then hill-climb them toward the band's
 * targets (targets.ts) with small mutations — a box's weight or freight, a route, a price, a pump, a
 * band edge, the deadweight, the tank, a day, a bar, a planted decoy… A mutation is kept when the
 * score does not get worse. Deterministic per seed.
 */
import { simulate } from './rules';
import { FULL, measure, QUICK, statsRecord, type Metrics } from './metrics';
import { checkPalette, isLesson, PALETTE, type LadderRow } from './progression';
import { AREA_PORTS, AREA_SHIPS, flagsFor } from './ports';
import { Rng } from './rng';
import { aim, shortfall, targetFor, type Shortfall, type Target } from './targets';
import type { Box, Leg, Level, Mechanic, Port } from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------------------------
// Drafts

/** Boxes sorted by port of loading, then destination, heavy first; ids renumbered 0..n-1. */
export function normalize(level: Level): void {
  level.boxes.sort((a, b) => a.from - b.from || a.to - b.to || b.weight - a.weight || b.freight - a.freight || a.id - b.id);
  level.boxes.forEach((b, i) => (b.id = i));
  delete level.best;
}

const has = (row: LadderRow, m: Mechanic) => row.mechanics.includes(m);

/** Freight for a box: about weight × legs carried × 1–1.5, with ±1 noise. */
function freightFor(rng: Rng, weight: number, legs: number): number {
  const f = Math.round(weight * legs * rng.range(1, 1.6) + rng.int(-1, 1));
  return Math.max(PALETTE.freight[0], Math.min(PALETTE.freight[1], f));
}

/** The tank a ship needs to sail every pump-to-pump stretch at her top band, on the reserve. */
function stretchNeed(level: Level): number {
  const top = level.ship.bands[level.ship.bands.length - 1].rate;
  const P = level.ports.length;
  let need = 0;
  let acc = 0;
  for (let i = 0; i < P - 1; i++) {
    if (level.ports[i].price !== null) acc = 0;
    acc += level.legs[i].days * top;
    need = Math.max(need, acc);
  }
  return need + level.reserve;
}

function setBands(level: Level, count: number, rng: Rng): void {
  const C = level.ship.capacity;
  if (count === 1) level.ship.bands = [{ upTo: C, rate: 1 }];
  else if (count === 2) {
    const e = Math.max(2, Math.min(C - 2, Math.round(C * rng.range(0.45, 0.7))));
    level.ship.bands = [
      { upTo: e, rate: 1 },
      { upTo: C, rate: 2 },
    ];
  } else {
    const e1 = Math.max(2, Math.round(C * rng.range(0.3, 0.48)));
    const e2 = Math.max(e1 + 2, Math.min(C - 2, Math.round(C * rng.range(0.6, 0.82))));
    level.ship.bands = [
      { upTo: e1, rate: 1 },
      { upTo: e2, rate: 2 },
      { upTo: C, rate: 3 },
    ];
  }
}

/** A random voyage for a ladder row (not yet measured). */
export function draft(row: LadderRow, rng: Rng): Level {
  const P = row.ports;
  const names = flagsFor(rng.shuffle(AREA_PORTS[row.area].slice()).slice(0, P));
  const flat = rng.pick(row.area <= 1 ? [1, 1, 2] : [1, 1, 2, 2, 3]);
  const ports: Port[] = names.map((p, i) => ({ name: p.name, code: p.code, flag: p.flag, price: i === P - 1 ? null : flat }));
  if (has(row, 'prices')) {
    for (let i = 0; i < P - 1; i++) ports[i].price = rng.int(1, 3);
  }
  if (has(row, 'noPump')) {
    const dry = rng.shuffle([...Array(P - 2).keys()].map((i) => i + 1)).slice(0, P >= 5 && rng.chance(0.5) ? 2 : 1);
    for (const i of dry) ports[i].price = null;
  }
  if (has(row, 'prices')) {
    const pumps = ports.slice(0, P - 1).filter((p) => p.price !== null);
    if (new Set(pumps.map((p) => p.price)).size < 2) {
      pumps[0].price = pumps[0].price === 1 ? rng.int(2, 3) : 1;
      if (pumps.length > 1 && pumps[1].price === pumps[0].price) pumps[1].price = pumps[0].price === 1 ? 3 : 1;
    }
  }
  if (has(row, 'lot')) {
    const pumps = [...Array(P - 1).keys()].filter((i) => ports[i].price !== null);
    for (const i of rng.shuffle(pumps).slice(0, rng.int(1, Math.min(2, pumps.length)))) ports[i].lot = rng.int(2, 4);
  }
  const maxDays = row.area < 2 ? 2 : 3;
  const legs: Leg[] = Array.from({ length: P - 1 }, () => ({ days: rng.int(1, maxDays) }));

  // boxes: the first call offers the most
  const nBoxes = rng.int(row.boxes[0], row.boxes[1]);
  const offerPorts = has(row, 'pickup') ? P - 1 : 1;
  const counts = new Array(P - 1).fill(0);
  for (let k = 0; k < nBoxes; k++) {
    const w = counts.map((c, i) => (i < offerPorts && c < PALETTE.maxOffers ? (i === 0 ? 1.6 : 1) : 0));
    const i = rng.weighted(w);
    if (i < 0) break;
    counts[i]++;
  }
  if (has(row, 'pickup') && P >= 3 && counts.slice(1).every((c) => c === 0)) {
    counts[0]--;
    counts[1]++;
  }
  const boxes: Box[] = [];
  counts.forEach((c, from) => {
    for (let k = 0; k < c; k++) {
      const to = rng.int(from + 1, P - 1);
      // stacked holds get lighter boxes, so the slots bind as well as the marks
      const weight = row.tiers >= 2 ? rng.pick([1, 1, 2, 2, 2, 3, 3, 4, 5]) : rng.int(1, 5);
      boxes.push({ id: boxes.length, from, to, weight, freight: freightFor(rng, weight, to - from) });
    }
  });

  const level: Level = {
    n: row.n,
    chapter: row.area + 1,
    title: row.title,
    band: row.band,
    ship: { name: rng.pick(AREA_SHIPS[row.area]), capacity: 10, tank: 8, bays: row.bays, tiers: row.tiers, bands: [] },
    ports,
    legs,
    boxes,
    startFuel: PALETTE.reserve,
    reserve: PALETTE.reserve,
    restowFee: 0,
    auto: row.auto,
    stars: [0, 0, 0],
    mechanics: row.mechanics.slice(),
    format: row.format,
  };
  if (row.intro) level.intro = row.intro;

  // deadweight: the heaviest leg's offers overflow her marks
  const legW = new Array(P - 1).fill(0);
  const legN = new Array(P - 1).fill(0);
  for (const b of boxes) for (let l = b.from; l < b.to; l++) (legW[l] += b.weight), legN[l]++;
  const slots = row.bays * row.tiers;
  const heaviest = Math.max(...legW.map((w, l) => (legN[l] > slots ? (w * slots) / legN[l] : w)));
  const fuelEst = 2 * Math.max(...legs.map((l) => l.days)) + 1;
  // with stacks, let the slots bind as often as the marks
  const C = Math.round(heaviest * (row.tiers >= 2 ? rng.range(0.6, 1) : rng.range(0.5, 0.8)) + fuelEst);
  level.ship.capacity = Math.max(row.capacity[0], Math.min(row.capacity[1], C));
  setBands(level, row.bands, rng);
  level.ship.tank = Math.max(4, Math.min(PALETTE.maxTank, stretchNeed(level) + rng.int(0, 3)));

  if (has(row, 'reefer')) {
    const nPlugs = row.bays >= 4 && rng.chance(0.5) ? 2 : 1;
    level.ship.plugs = rng.shuffle([...Array(row.bays).keys()]).slice(0, nPlugs).sort((a, b) => a - b);
    const nReefer = Math.max(2, Math.round(boxes.length * rng.range(0.2, 0.4)));
    for (const b of rng.shuffle(boxes.slice()).slice(0, nReefer)) {
      b.reefer = true;
      b.freight = Math.min(PALETTE.freight[1], b.freight + rng.int(1, 2));
    }
  }
  if (row.format === 'contract') {
    for (const b of rng.shuffle(boxes.slice()).slice(0, rng.int(2, 3))) b.contract = true;
  }
  const C2 = level.ship.capacity;
  if (has(row, 'bar')) {
    const at = rng.shuffle([...Array(P - 1).keys()].map((i) => i + 1)).slice(0, P >= 4 && rng.chance(0.4) ? 2 : 1);
    for (const i of at) ports[i].bar = Math.round(C2 * rng.range(0.5, 0.8));
  }
  if (has(row, 'zone')) {
    const l = rng.int(0, P - 2);
    legs[l].days = Math.max(legs[l].days, 2);
    legs[l].zone = { at: rng.int(1, legs[l].days), limit: Math.round(C2 * rng.range(0.55, 0.85)) };
  }
  if (has(row, 'bridge')) {
    const l = rng.int(0, P - 2);
    legs[l].bridge = { min: Math.round(C2 * rng.range(0.3, 0.6)) };
  }
  normalize(level);
  return level;
}

// ---------------------------------------------------------------------------------------------
// Mutations

type Mutation = (L: Level, row: LadderRow, rng: Rng, m: Metrics | null) => boolean;

const pickBox = (L: Level, rng: Rng) => (L.boxes.length ? rng.pick(L.boxes) : null);
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inMask = (mask: number, id: number) => (mask & (1 << id)) !== 0;

const MUTATIONS: { name: string; w: number; when?: (row: LadderRow) => boolean; fn: Mutation }[] = [
  {
    name: 'weight',
    w: 3,
    fn: (L, _r, rng) => {
      const b = pickBox(L, rng);
      if (!b) return false;
      const w = clampInt(b.weight + (rng.chance(0.5) ? 1 : -1), 1, 5);
      if (w === b.weight) return false;
      b.weight = w;
      return true;
    },
  },
  {
    name: 'freight',
    w: 4,
    fn: (L, _r, rng) => {
      const b = pickBox(L, rng);
      if (!b) return false;
      const f = clampInt(b.freight + rng.pick([-2, -1, 1, 2]), 1, 12);
      if (f === b.freight) return false;
      b.freight = f;
      return true;
    },
  },
  {
    name: 'route',
    w: 2,
    when: (r) => r.ports >= 3,
    fn: (L, row, rng) => {
      const b = pickBox(L, rng);
      if (!b) return false;
      const P = L.ports.length;
      const from = has(row, 'pickup') && rng.chance(0.4) ? rng.int(0, P - 2) : b.from;
      const to = rng.int(from + 1, P - 1);
      if (from === b.from && to === b.to) return false;
      b.from = from;
      b.to = to;
      return true;
    },
  },
  {
    name: 'add',
    w: 1.5,
    fn: (L, row, rng) => {
      if (L.boxes.length >= row.boxes[1]) return false;
      const P = L.ports.length;
      const from = has(row, 'pickup') ? rng.int(0, P - 2) : 0;
      const to = rng.int(from + 1, P - 1);
      const weight = rng.int(1, 5);
      const b: Box = { id: L.boxes.length, from, to, weight, freight: freightFor(rng, weight, to - from) };
      if (has(row, 'reefer') && rng.chance(0.3)) b.reefer = true;
      L.boxes.push(b);
      return true;
    },
  },
  {
    name: 'remove',
    w: 1.5,
    fn: (L, row, rng) => {
      if (L.boxes.length <= row.boxes[0]) return false;
      const b = pickBox(L, rng)!;
      L.boxes = L.boxes.filter((x) => x !== b);
      return true;
    },
  },
  {
    name: 'price',
    w: 1.5,
    fn: (L, row, rng) => {
      const pumps = L.ports.slice(0, -1).filter((p) => p.price !== null);
      const d = rng.chance(0.5) ? 1 : -1;
      if (has(row, 'prices')) {
        const p = rng.pick(pumps);
        const v = clampInt(p.price! + d, 1, 3);
        if (v === p.price) return false;
        p.price = v;
        return true;
      }
      const v = clampInt(pumps[0].price! + d, 1, 3);
      if (v === pumps[0].price) return false;
      for (const p of pumps) p.price = v;
      return true;
    },
  },
  {
    name: 'pump',
    w: 1.5,
    when: (r) => r.mechanics.includes('noPump'),
    fn: (L, row, rng) => {
      const P = L.ports.length;
      const mids = [...Array(P - 2).keys()].map((i) => i + 1);
      const dry = mids.filter((i) => L.ports[i].price === null);
      const wet = mids.filter((i) => L.ports[i].price !== null);
      if (!wet.length || !dry.length) return false;
      const a = rng.pick(dry);
      const b = rng.pick(wet);
      const price = L.ports[b].price;
      L.ports[b].price = null;
      L.ports[a].price = price;
      if (L.ports[b].lot) {
        L.ports[a].lot = L.ports[b].lot;
        delete L.ports[b].lot;
      }
      return true;
    },
  },
  {
    name: 'edge',
    w: 2,
    when: (r) => r.bands >= 2,
    fn: (L, _r, rng) => {
      const bands = L.ship.bands;
      const i = rng.int(0, bands.length - 2);
      const v = bands[i].upTo + (rng.chance(0.5) ? 1 : -1);
      const lo = i ? bands[i - 1].upTo + 1 : 1;
      const hi = bands[i + 1].upTo - 1;
      if (v < lo || v > hi) return false;
      bands[i].upTo = v;
      return true;
    },
  },
  {
    name: 'capacity',
    w: 2,
    fn: (L, row, rng) => {
      const s = L.ship;
      const v = s.capacity + (rng.chance(0.5) ? 1 : -1);
      if (v < row.capacity[0] || v > row.capacity[1]) return false;
      if (s.bands.length >= 2 && v <= s.bands[s.bands.length - 2].upTo) return false;
      s.capacity = v;
      s.bands[s.bands.length - 1].upTo = v;
      return true;
    },
  },
  {
    // one bay more or less than the ladder's nominal hold
    name: 'bays',
    w: 1,
    when: (r) => r.tiers >= 2,
    fn: (L, row, rng) => {
      const v = L.ship.bays + (rng.chance(0.5) ? 1 : -1);
      if (v < Math.max(2, row.bays - 1) || v > Math.min(PALETTE.maxBays(row.n), row.bays + 1)) return false;
      L.ship.bays = v;
      if (L.ship.plugs) {
        L.ship.plugs = L.ship.plugs.filter((p) => p < v);
        if (!L.ship.plugs.length) L.ship.plugs = [0];
      }
      return true;
    },
  },
  {
    name: 'tank',
    w: 1,
    fn: (L, _r, rng) => {
      const v = L.ship.tank + (rng.chance(0.5) ? 1 : -1);
      // never so small that the tank becomes a rule of its own
      if (v < 5 || v > PALETTE.maxTank) return false;
      L.ship.tank = v;
      return true;
    },
  },
  {
    name: 'days',
    w: 1.5,
    fn: (L, row, rng) => {
      const leg = rng.pick(L.legs);
      const v = clampInt(leg.days + (rng.chance(0.5) ? 1 : -1), 1, row.area < 2 ? 2 : 3);
      if (v === leg.days) return false;
      if (leg.zone && leg.zone.at > v) return false;
      leg.days = v;
      return true;
    },
  },
  {
    name: 'bar',
    w: 2,
    when: (r) => r.mechanics.includes('bar'),
    fn: (L, _r, rng) => {
      const barred = L.ports.filter((p) => p.bar !== undefined);
      if (!barred.length) return false;
      const p = rng.pick(barred);
      if (rng.chance(0.25)) {
        const others = L.ports.filter((q, i) => i > 0 && q.bar === undefined);
        if (!others.length) return false;
        const q = rng.pick(others);
        q.bar = p.bar;
        delete p.bar;
        return true;
      }
      const v = p.bar! + rng.pick([-2, -1, 1, 2]);
      if (v < 3 || v >= L.ship.capacity) return false;
      p.bar = v;
      return true;
    },
  },
  {
    name: 'zone',
    w: 2,
    when: (r) => r.mechanics.includes('zone'),
    fn: (L, _r, rng) => {
      const l = L.legs.findIndex((g) => g.zone);
      if (l < 0) return false;
      const z = L.legs[l].zone!;
      const r = rng.int(0, 2);
      if (r === 0) {
        const v = z.limit + rng.pick([-2, -1, 1, 2]);
        if (v < 3 || v >= L.ship.capacity) return false;
        z.limit = v;
      } else if (r === 1) {
        const v = z.at + (rng.chance(0.5) ? 1 : -1);
        if (v < 1 || v > L.legs[l].days) return false;
        z.at = v;
      } else {
        const k = rng.int(0, L.legs.length - 1);
        if (k === l || L.legs[k].days < z.at) return false;
        L.legs[k].zone = z;
        delete L.legs[l].zone;
      }
      return true;
    },
  },
  {
    name: 'bridge',
    w: 2,
    when: (r) => r.mechanics.includes('bridge'),
    fn: (L, _r, rng) => {
      const l = L.legs.findIndex((g) => g.bridge);
      if (l < 0) return false;
      const br = L.legs[l].bridge!;
      if (rng.chance(0.25)) {
        const k = rng.int(0, L.legs.length - 1);
        if (k === l) return false;
        L.legs[k].bridge = br;
        delete L.legs[l].bridge;
        return true;
      }
      const v = br.min + rng.pick([-2, -1, 1, 2]);
      if (v < 2 || v >= L.ship.capacity) return false;
      br.min = v;
      return true;
    },
  },
  {
    name: 'lot',
    w: 1.5,
    when: (r) => r.mechanics.includes('lot'),
    fn: (L, _r, rng) => {
      const lotted = L.ports.filter((p) => (p.lot ?? 1) > 1);
      if (!lotted.length) return false;
      const p = rng.pick(lotted);
      if (rng.chance(0.3)) {
        const free = L.ports.slice(0, -1).filter((q) => q.price !== null && (q.lot ?? 1) === 1);
        if (!free.length) return false;
        rng.pick(free).lot = p.lot;
        delete p.lot;
        return true;
      }
      const v = clampInt(p.lot! + (rng.chance(0.5) ? 1 : -1), 2, PALETTE.maxLot);
      if (v === p.lot) return false;
      p.lot = v;
      return true;
    },
  },
  {
    name: 'reefer',
    w: 1.5,
    when: (r) => r.mechanics.includes('reefer'),
    fn: (L, _r, rng) => {
      if (rng.chance(0.3)) {
        const s = L.ship;
        const k = rng.int(0, s.bays - 1);
        const plugs = new Set(s.plugs ?? []);
        if (plugs.has(k)) {
          if (plugs.size <= 1) return false;
          plugs.delete(k);
        } else {
          if (plugs.size >= 2) return false;
          plugs.add(k);
        }
        s.plugs = [...plugs].sort((a, b) => a - b);
        return true;
      }
      const b = pickBox(L, rng);
      if (!b) return false;
      if (b.reefer) {
        if (L.boxes.filter((x) => x.reefer).length <= 2) return false;
        delete b.reefer;
      } else b.reefer = true;
      return true;
    },
  },
  {
    name: 'contract',
    w: 1.5,
    when: (r) => r.format === 'contract',
    fn: (L, _r, rng) => {
      const b = pickBox(L, rng);
      if (!b) return false;
      if (b.contract) {
        if (L.boxes.filter((x) => x.contract).length <= 1) return false;
        delete b.contract;
      } else {
        if (L.boxes.filter((x) => x.contract).length >= 4) return false;
        b.contract = true;
      }
      return true;
    },
  },
  {
    // the overshoot decoy: a richer twin of a box par carries, one tonne heavier
    name: 'decoy',
    w: 1.5,
    fn: (L, row, rng, m) => {
      if (!m) return false;
      const inOpt = L.boxes.filter((b) => inMask(m.bestMask, b.id) && b.weight < 5 && !b.contract);
      if (!inOpt.length) return false;
      const src = rng.pick(inOpt);
      const twin: Box = { ...src, id: L.boxes.length, weight: src.weight + 1, freight: Math.min(12, src.freight + rng.int(1, 2)) };
      delete twin.contract;
      if (L.boxes.length >= row.boxes[1]) {
        const out = L.boxes.filter((b) => !inMask(m.bestMask, b.id) && !b.contract);
        if (!out.length) return false;
        const victim = rng.pick(out);
        L.boxes = L.boxes.filter((b) => b !== victim);
      }
      L.boxes.push(twin);
      return true;
    },
  },
  {
    // a lure: a box par leaves ashore pays a little more
    name: 'lure',
    w: 1,
    fn: (L, _r, rng, m) => {
      if (!m) return false;
      const out = L.boxes.filter((b) => !inMask(m.bestMask, b.id) && b.freight < 12);
      if (!out.length) return false;
      const b = rng.pick(out);
      b.freight = Math.min(12, b.freight + rng.int(1, 2));
      return true;
    },
  },
  {
    // Full & Down: her marks at the optimum's first departure
    name: 'snap',
    w: 3,
    when: (r) => r.format === 'exact',
    fn: (L, row, rng, m) => {
      if (!m || !m.best.length) return false;
      const legs = simulate(L, m.best).projection.legs;
      const w = rng.pick(legs).weight;
      const s = L.ship;
      if (w === s.capacity || w < row.capacity[0] || w > row.capacity[1]) return false;
      if (s.bands.length >= 2 && w <= s.bands[s.bands.length - 2].upTo) return false;
      s.capacity = w;
      s.bands[s.bands.length - 1].upTo = w;
      for (const p of L.ports) if (p.bar !== undefined && p.bar >= w) delete p.bar;
      return true;
    },
  },
];

/** Apply one random mutation in place; false if the chosen one had nothing to change. */
export function mutate(L: Level, row: LadderRow, rng: Rng, m: Metrics | null): boolean {
  const ok = MUTATIONS.filter((x) => !x.when || x.when(row));
  const i = rng.weighted(ok.map((x) => x.w));
  return ok[i].fn(L, row, rng, m);
}

// ---------------------------------------------------------------------------------------------
// The climb

export interface GenOptions {
  /** drafts per seed */
  attempts: number;
  /** hill-climb steps per draft */
  iters: number;
}

export interface GenResult {
  level: Level;
  metrics: Metrics;
  short: Shortfall;
  score: number;
}

/** Structural checks the palette can't express: offers per port, at least one box per call where needed. */
function wellFormed(L: Level, row: LadderRow): boolean {
  if (checkPalette(L).length) return false;
  if (L.boxes.length < row.boxes[0] || L.boxes.length > row.boxes[1]) return false;
  if (has(row, 'pickup') && !L.boxes.some((b) => b.from > 0)) return false;
  if (has(row, 'reefer') && L.boxes.filter((b) => b.reefer).length < 1) return false;
  if (row.format === 'contract' && !L.boxes.some((b) => b.contract)) return false;
  if (has(row, 'noPump') && !L.ports.slice(1, -1).some((p) => p.price === null)) return false;
  if (has(row, 'prices')) {
    const pr = new Set(L.ports.slice(0, -1).filter((p) => p.price !== null).map((p) => p.price));
    if (pr.size < 2) return false;
  }
  if (has(row, 'bar') && !L.ports.some((p) => p.bar !== undefined)) return false;
  if (has(row, 'lot') && !L.ports.some((p) => (p.lot ?? 1) > 1)) return false;
  // the voyage must be sailable empty
  return true;
}

const scoreOf = (m: Metrics, t: Target) => {
  const s = shortfall(m, t);
  return { s, score: s.total * 10 + aim(m, t) };
};

/** Draft and climb toward the row's target; the best of `attempts` drafts. */
export function generate(row: LadderRow, seed: number, o: GenOptions): GenResult | null {
  const target = targetFor(row);
  let best: GenResult | null = null;
  for (let a = 0; a < o.attempts; a++) {
    const rng = new Rng(seed + a * 7919);
    const mseed = seed ^ 0x5bd1e995;
    let level: Level | null = null;
    let m: Metrics | null = null;
    for (let tries = 0; tries < 40 && !m; tries++) {
      const d = draft(row, rng);
      if (!wellFormed(d, row)) continue;
      const mm = measure(d, { ...QUICK, seed: mseed });
      if (!mm) continue;
      level = d;
      m = mm;
    }
    if (!level || !m) continue;
    let { s, score } = scoreOf(m, target);
    for (let it = 0; it < o.iters; it++) {
      const cand: Level = clone(level!);
      if (!mutate(cand, row, rng, m)) continue;
      normalize(cand);
      if (!wellFormed(cand, row)) continue;
      const m2 = measure(cand, { ...QUICK, seed: mseed });
      if (!m2) continue;
      const r = scoreOf(m2, target);
      if (r.score <= score) {
        level = cand;
        m = m2;
        s = r.s;
        score = r.score;
        if (s.total === 0 && aim(m, target) < 0.25) break;
      }
    }
    if (!best || score < best.score) best = { level: level!, metrics: m!, short: s, score };
    if (best.short.total === 0) break;
  }
  return best;
}

/** The rules a stored level may never break (the build retries other seeds until none is broken). */
export function hardProblems(L: Level, m: Metrics): string[] {
  const out: string[] = [...checkPalette(L)];
  const [T1, T2, T3] = L.stars;
  if (!(T1 <= T2 && T2 <= T3)) out.push('stars not increasing');
  if (!isLesson(L.band) && !(T1 < T2 && T2 < T3)) out.push('stars not strictly increasing');
  if (!isLesson(L.band) && T3 - T2 < 2) out.push('★★★ by one coin');
  if (L.n >= 2 && !(T1 > m.greedyBest)) out.push('★ does not beat the instinctive plan');
  if (L.band !== 'T0' && (m.vstar < 6 || T1 < 2)) out.push(`par too small (${m.vstar})`);
  if (L.format === 'exact' && !(m.onMark && m.onReserve && m.omega === 1)) out.push('not an exact fit');
  if (!L.best) out.push('no best plan');
  else {
    const sim = simulate(L, L.best);
    if (sim.projection.problems.length || sim.bounced.length || sim.projection.profit !== T3) out.push('best plan does not replay');
  }
  return out;
}

/** Holdout measurement, stars, the optimal plan, the logbook line and the stats. */
export function finalize(level: Level, row: LadderRow, seed: number): { level: Level; metrics: Metrics; short: Shortfall } {
  const L = clone(level);
  normalize(L);
  const m = measure(L, { ...FULL, seed: seed ^ 0x2545f491 })!;
  const t = targetFor(row);
  const short = shortfall(m, t);
  L.title = row.title;
  L.stars = m.stars;
  L.best = m.best;
  L.logbook = logbookFor(L, m);
  L.stats = statsRecord(m, { off: Math.round(short.total * 100) / 100, misses: short.misses.join('; ') });
  return { level: L, metrics: m, short };
}

// ---------------------------------------------------------------------------------------------
// Logbook lines: one sentence naming the trap, in the chief mate's voice

const BAND_NAMES = ['LIGHT', 'LADEN', 'DEEP'];

function boxName(L: Level, id: number): string {
  const b = L.boxes[id];
  return `the ${b.weight} t ${L.ports[b.to].name}${b.reefer ? ' reefer' : ' box'}`;
}

function legName(L: Level, i: number): string {
  return `${L.ports[i].name}–${L.ports[i + 1].name}`;
}

const ids = (mask: number, n: number) => [...Array(n).keys()].filter((i) => mask & (1 << i));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function listing(L: Level, list: number[]): string {
  const names = list.map((i) => boxName(L, i));
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/** One sentence naming the trap, from the difference between the instinctive plan and par. */
export function logbookFor(L: Level, m: Metrics): string {
  const n = L.boxes.length;
  const g = m.naturals.filter((p) => p.legal).sort((a, b) => b.profit - a.profit)[0];
  const opt = simulate(L, m.best).projection;
  const focus: Mechanic[] = [];
  if (L.intro) focus.push(L.intro);
  const adv = (Object.entries(m.ablation) as [Mechanic, number][]).filter(([k, d]) => d > 0 && !focus.includes(k)).sort((a, b) => b[1] - a[1]);
  for (const [k] of adv) focus.push(k);
  if (L.format === 'exact') focus.unshift('weight');

  const last = L.ports.length - 1;
  const fuelT = (plan: { bunker: number }[]) => plan.reduce((s, c) => s + c.bunker, 0);
  if (L.format === 'exact') {
    const legs = opt.legs.map((l, i) => (l.weight === L.ship.capacity ? i : -1)).filter((i) => i >= 0);
    const at = legs.length ? L.ports[legs[0]].name : L.ports[0].name;
    return `One load and no other: ${listing(L, ids(m.bestMask, n))} with ${fuelT(m.best)} t of bunkers put her on the mark at ${at}, and she berthed at ${L.ports[last].name} on the reserve.`;
  }
  if (!g) return `Par is $${m.vstar}; the obvious loads don't sail at all.`;
  const gs = simulate(L, g.plan).projection;
  const left = ids(g.mask & ~m.bestMask, n).sort((a, b) => L.boxes[b].freight - L.boxes[a].freight);
  const took = ids(m.bestMask & ~g.mask, n).sort((a, b) => L.boxes[b].freight - L.boxes[a].freight);
  const lowerLegs = opt.legs.map((l, i) => (l.band < gs.legs[i].band ? i : -1)).filter((i) => i >= 0);
  const fuelSaved = fuelT(g.plan) - fuelT(m.best);
  const costSaved = gs.fuelCost - opt.fuelCost;

  for (const f of focus) {
    switch (f) {
      case 'bands':
      case 'weight': {
        if (!lowerLegs.length || !left.length) break;
        const band = BAND_NAMES[gs.legs[lowerLegs[0]].band] ?? 'LADEN';
        const where = lowerLegs.length === L.legs.length ? (L.legs.length === 1 ? 'for the passage' : L.legs.length === 2 ? 'for both legs' : 'for every leg') : lowerLegs.length === 1 ? `on the ${legName(L, lowerLegs[0])} leg` : `for ${lowerLegs.length} legs`;
        const b = L.boxes[left[0]];
        const saved = fuelSaved > 0 ? `saved ${fuelSaved} t of bunkers` : `paid $${m.vstar - g.profit} more`;
        return `The ${b.weight} t ${L.ports[b.to].name} box paid $${b.freight}, but it put her in the ${band} band ${where}; leaving it ashore ${saved}.`;
      }
      case 'pickup': {
        const pick = took.find((i) => L.boxes[i].from > 0);
        if (pick === undefined) break;
        const b = L.boxes[pick];
        const rival = left.find((i) => L.boxes[i].from <= b.from);
        if (rival !== undefined && L.boxes[rival].from === b.from) {
          return `At ${L.ports[b.from].name} par takes ${boxName(L, pick)} and leaves ${boxName(L, rival)}: it paid $${b.freight} at ${L.ports[b.to].name} and kept her in a cheaper band.`;
        }
        const room = opt.legs[b.from - 1] ? L.ship.capacity - opt.legs[b.from - 1].weight : 0;
        const filled = rival !== undefined ? `Filling her with ${boxName(L, rival)} at ${L.ports[L.boxes[rival].from].name}` : `Loading to the marks at ${L.ports[0].name}`;
        const light = room > 0 && room <= 6 ? `sailing ${room} t light into ${L.ports[b.from].name}` : `keeping room for it`;
        return `${filled} left no room for the ${L.ports[b.from].name} pickup; ${light} paid $${b.freight} at ${L.ports[b.to].name}.`;
      }
      case 'calls': {
        const near = took.find((i) => L.boxes[i].to < last);
        const far = left.find((i) => L.boxes[i].to === last);
        if (near === undefined || far === undefined) break;
        const richer = L.boxes[far].freight > L.boxes[near].freight ? ` paid $${L.boxes[far].freight}, but it` : '';
        return `${cap(boxName(L, far))}${richer} rode every leg; ${boxName(L, near)} came off at ${L.ports[L.boxes[near].to].name} and she sailed on lighter.`;
      }
      case 'noPump': {
        const dry = L.ports.findIndex((p, i) => i > 0 && i < last && p.price === null);
        if (dry < 0) break;
        let src = dry - 1;
        while (src > 0 && L.ports[src].price === null) src--;
        const carried = m.best[src]?.bunker ?? 0;
        const tail = left.length ? `, so ${boxName(L, left[0])} stayed ashore` : took.length ? `, and ${boxName(L, took[0])} still fitted` : '';
        return `No bunkers at ${L.ports[dry].name}: the fuel for the ${legName(L, dry)} leg came from ${L.ports[src].name}, ${carried} t stemmed there, and every tonne of it weighed on the first leg${tail}.`;
      }
      case 'prices': {
        const pumps = L.ports.slice(0, last).map((p, i) => ({ p, i })).filter((x) => x.p.price !== null);
        const cheap = pumps.reduce((a, b) => (b.p.price! < a.p.price! ? b : a));
        const dear = pumps.reduce((a, b) => (b.p.price! > a.p.price! ? b : a));
        if (cheap.p.price === dear.p.price) break;
        const atCheap = m.best[cheap.i].bunker;
        const saved = costSaved > 0 ? `; it saved $${costSaved} on the stem` : '';
        return `Bunkers were $${cheap.p.price} at ${cheap.p.name} and $${dear.p.price} at ${dear.p.name}: par stems ${atCheap} t at ${cheap.p.name}, and not a tonne more than the marks allow${saved}.`;
      }
      case 'tiers': {
        const pick = took.find((i) => L.boxes[i].from > 0) ?? took[0];
        if (pick === undefined) break;
        return `Stow by discharge port: with the far boxes low and the near ones on top, ${boxName(L, pick)} from ${L.ports[L.boxes[pick].from].name} had a stack to go on.`;
      }
      case 'bar': {
        const bp = L.ports.findIndex((p) => p.bar !== undefined);
        if (bp < 0) break;
        return `The ${L.ports[bp].name} bar takes her at ${L.ports[bp].bar} t: deliver first, burn down to it, and bunker after the bar${left.length ? `; ${boxName(L, left[0])} would have kept her too deep` : ''}.`;
      }
      case 'lot': {
        const lp = L.ports.findIndex((p) => (p.lot ?? 1) > 1);
        if (lp < 0) break;
        return `${L.ports[lp].name} sells bunkers in lots of ${L.ports[lp].lot}: par stems ${m.best[lp]?.bunker ?? 0} t there and plans the cargo round the barge, not the other way about.`;
      }
      case 'heavy': {
        const heavy = took.length ? took : ids(m.bestMask, n);
        const hb = heavy.sort((a, b) => L.boxes[b].weight - L.boxes[a].weight)[0];
        if (hb === undefined) break;
        return `Heavy below light: ${boxName(L, hb)} had to go to the bottom of its stack, and that decided what else could stand on it.`;
      }
      case 'reefer': {
        const r = left.find((i) => L.boxes[i].reefer) ?? took.find((i) => L.boxes[i].reefer);
        if (r === undefined) break;
        const inPar = inMask(m.bestMask, r);
        return inPar
          ? `${cap(boxName(L, r))} needs a plugged stack and burns a tonne a leg, and it was still worth the plug at $${L.boxes[r].freight}.`
          : `${cap(boxName(L, r))} paid $${L.boxes[r].freight}, but a reefer burns a tonne a leg and takes a plugged stack; par leaves it ashore.`;
      }
      case 'contract': {
        const top = took[0] ?? ids(m.bestMask, n).find((i) => !L.boxes[i].contract);
        if (top === undefined) break;
        return `The sealed boxes sail first and set her draft; the top-off that fitted round them was ${boxName(L, top)}${left.length ? `, not ${boxName(L, left[0])}` : ''}.`;
      }
      case 'zone': {
        const zl = L.legs.findIndex((l) => l.zone);
        if (zl < 0) break;
        const z = L.legs[zl].zone!;
        const leg = opt.legs[zl];
        const atLine = leg.weight - z.at * L.ship.bands[leg.band].rate;
        const over = leg.weight - z.limit;
        if (over > 0) return `The winter line allows ${z.limit} t, ${plural(z.at, 'day')} out of ${L.ports[zl].name}; par sails ${over} t over it and burns down to ${atLine} t by the line, because she burns down to it.`;
        return `The winter line on the ${legName(L, zl)} leg allows ${z.limit} t: par crosses it at ${atLine} t${left.length ? `, and ${boxName(L, left[0])} would have put her over her winter mark` : ''}.`;
      }
      case 'bridge': {
        const bl = L.legs.findIndex((l) => l.bridge);
        if (bl < 0) break;
        const min = L.legs[bl].bridge!.min;
        return `The bridge on the ${legName(L, bl)} leg wants ${min} t aboard: ${took.length ? `${boxName(L, took[0])} went as ballast that pays` : 'par sails her down to it with cargo, not seawater'}.`;
      }
    }
  }
  if (left.length && took.length) return `${cap(listing(L, left))} looked best; par leaves ${left.length === 1 ? 'it' : 'them'} ashore for ${listing(L, took)}, and earns $${m.vstar} against $${g.profit}.`;
  if (left.length) return `${cap(listing(L, left))} cost more in bunkers than ${left.length === 1 ? 'it' : 'they'} paid: par sails without ${left.length === 1 ? 'it' : 'them'} for $${m.vstar}.`;
  if (took.length) return `The instinctive load never made room for ${listing(L, took)}; with ${took.length === 1 ? 'it' : 'them'} aboard she earns $${m.vstar}.`;
  return `Same boxes, better bunkers: par stems ${plural(fuelT(m.best), 'tonne')} where the instinct stems ${fuelT(g.plan)}.`;
}
