import type { Box, BoxId, Call, CallState, Leg, LegResult, Level, Projection, Refusal, Ship } from './types';

/** Index of the burn band for a weight aboard. */
export function bandOf(ship: Ship, w: number): number {
  for (let i = 0; i < ship.bands.length; i++) if (w <= ship.bands[i].upTo) return i;
  return ship.bands.length - 1;
}

/** Fuel burned on a leg sailed at weight `w` with `reefers` reefers plugged in. */
export function burnOf(ship: Ship, leg: Leg, w: number, reefers: number): number {
  return leg.days * ship.bands[bandOf(ship, w)].rate + reefers;
}

export type ShipKind = 'feeder' | 'bulker';

/**
 * Which ship sails a level: a single-tier hold is sometimes a small bulk carrier (open holds, a grab,
 * parcels of grain, coal, steel…), else a container feeder. Stacking levels always sail the feeder.
 */
export function shipKind(level: Level): ShipKind {
  const bulky = level.ship.tiers === 1 && !level.mechanics.some((m) => m === 'reefer' || m === 'contract' || m === 'tiers');
  return bulky && level.n % 2 === 0 ? 'bulker' : 'feeder';
}

export function emptyPlan(level: Level): Call[] {
  return level.ports.slice(0, -1).map(() => ({ loads: [], bunker: 0 }));
}

export function clonePlan(plan: Call[]): Call[] {
  return plan.map((c) => ({ loads: c.loads.map((l) => ({ ...l })), bunker: c.bunker }));
}

const portName = (level: Level, i: number) => level.ports[i]?.name ?? '?';

/** Can `box` go on top of `bay` (given the bay's current contents)? Returns the refusal code. */
export function placeRefusal(level: Level, bay: BoxId[], bayIx: number, box: Box): Refusal['code'] | null {
  const ship = level.ship;
  if (bay.length >= ship.tiers) return 'bayFull';
  if (bay.length) {
    const top = level.boxes[bay[bay.length - 1]];
    // never bury: nothing may stand on a box that leaves earlier
    if (top.to < box.to) return 'bury';
    if (level.mechanics.includes('heavy') && top.weight < box.weight) return 'heavy';
  }
  if (box.reefer && level.mechanics.includes('reefer') && !(ship.plugs ?? []).includes(bayIx)) return 'plug';
  return null;
}

export interface SimResult {
  projection: Projection;
  /** the plan with every illegal action removed */
  plan: Call[];
  /** actions dropped from the plan, by port */
  bounced: { port: number; box?: BoxId; bunker?: number }[];
}

/**
 * Sail a plan on paper. Every rule lives here: the game, the solver's tests, the hint and the
 * generator all read the same projection. Illegal loads are dropped (bounced to their quay),
 * bunkers are clamped to what the port and the tank allow; problems that only the player can fix
 * (over the marks, short of fuel…) are reported, not repaired.
 */
export function simulate(level: Level, input: Call[]): SimResult {
  const { ship, ports, legs, boxes } = level;
  const last = ports.length - 1;
  const plan: Call[] = [];
  const bounced: SimResult['bounced'] = [];
  const bays: BoxId[][] = Array.from({ length: ship.bays }, () => []);
  const calls: CallState[] = [];
  const legResults: LegResult[] = [];
  const problems: Refusal[] = [];
  const onMark: boolean[] = [];
  const loaded = new Set<BoxId>();
  let fuel = level.startFuel;
  let freight = 0;
  let fuelCost = 0;
  let restows = 0;
  const cargoWeight = () => bays.reduce((s, b) => s + b.reduce((t, id) => t + boxes[id].weight, 0), 0);
  const reefersAboard = () => (level.mechanics.includes('reefer') ? bays.reduce((s, b) => s + b.filter((id) => boxes[id].reefer).length, 0) : 0);

  for (let i = 0; i <= last; i++) {
    // discharge: in each bay the lowest box for this port and everything above it come off;
    // boxes for later ports are restowed onto the same bay in the same order
    const delivered: BoxId[] = [];
    const restowed: BoxId[] = [];
    for (const bay of bays) {
      const k = bay.findIndex((id) => boxes[id].to === i);
      if (k < 0) continue;
      const lifted = bay.splice(k);
      for (const id of lifted) {
        if (boxes[id].to === i) {
          delivered.push(id);
          freight += boxes[id].freight;
        } else {
          restowed.push(id);
          bay.push(id);
        }
      }
    }
    restows += restowed.length;
    calls.push({ port: i, bays: bays.map((b) => b.slice()), delivered, restowed, arrivalFuel: fuel, arrivalWeight: cargoWeight() + fuel });
    if (i > 0) {
      const bar = ports[i].bar;
      const w = cargoWeight() + fuel;
      // arrival bar is checked on the leg (barAhead); nothing to do here
      void bar;
      void w;
    }
    if (i === last) break;

    // this call's loads
    const src = input[i] ?? { loads: [], bunker: 0 };
    const call: Call = { loads: [], bunker: 0 };
    for (const ld of src.loads) {
      const box = boxes[ld.box];
      if (!box || box.from !== i || loaded.has(ld.box) || ld.bay < 0 || ld.bay >= ship.bays) {
        bounced.push({ port: i, box: ld.box });
        continue;
      }
      if (placeRefusal(level, bays[ld.bay], ld.bay, box)) {
        bounced.push({ port: i, box: ld.box });
        continue;
      }
      bays[ld.bay].push(ld.box);
      loaded.add(ld.box);
      call.loads.push({ box: ld.box, bay: ld.bay });
    }
    // bunkers
    const port = ports[i];
    let buy = Math.max(0, Math.round(src.bunker));
    if (port.price === null) buy = 0;
    const lot = port.lot ?? 1;
    buy = Math.floor(buy / lot) * lot;
    while (fuel + buy > ship.tank && buy > 0) buy -= lot;
    buy = Math.max(0, buy);
    if (buy !== src.bunker) bounced.push({ port: i, bunker: src.bunker - buy });
    call.bunker = buy;
    fuel += buy;
    fuelCost += buy * (port.price ?? 0);
    plan.push(call);

    // contract boxes offered here must sail
    for (const b of boxes) {
      if (b.contract && b.from === i && !loaded.has(b.id)) {
        problems.push({ who: 'office', code: 'contract', port: i, text: `OFFICE: the contract box for ${portName(level, b.to)} must sail from ${port.name}.` });
      }
    }

    // departure
    const cargo = cargoWeight();
    const w = cargo + fuel;
    onMark.push(w === ship.capacity);
    if (w > ship.capacity) {
      problems.push({ who: 'mate', code: 'overMarks', port: i, amount: w - ship.capacity, text: `MATE: over her marks by ${w - ship.capacity} t at ${port.name}.` });
    }
    if (port.bar !== undefined && w > port.bar) {
      problems.push({ who: 'pilot', code: 'bar', port: i, amount: w - port.bar, text: `PILOT: ${w - port.bar} t too deep to cross the ${port.name} bar.` });
    }
    const leg = legs[i];
    const reefers = reefersAboard();
    const band = bandOf(ship, w);
    const burn = burnOf(ship, leg, w, reefers);
    if (leg.bridge && level.mechanics.includes('bridge') && w < leg.bridge.min) {
      problems.push({ who: 'harbour', code: 'bridge', port: i, amount: leg.bridge.min - w, text: `HARBOUR MASTER: she floats ${leg.bridge.min - w} t too high for the bridge.` });
    }
    if (leg.zone && level.mechanics.includes('zone')) {
      const atLine = w - leg.zone.at * ship.bands[band].rate;
      if (atLine > leg.zone.limit) {
        problems.push({ who: 'mate', code: 'zone', port: i, amount: atLine - leg.zone.limit, text: `MATE: ${atLine - leg.zone.limit} t over her winter mark at the zone line.` });
      }
    }
    const fuelIn = fuel - burn;
    if (fuelIn < level.reserve) {
      const n = level.reserve - fuelIn;
      let text = `CHIEF: ${n} t short for the ${ports[i + 1].name} leg.`;
      if (port.price === null) {
        // a dry port: the fuel had to come from the last pump
        let k = i - 1;
        while (k >= 0 && ports[k].price === null) k--;
        text = `CHIEF: ${n} t short for the ${ports[i + 1].name} leg, and ${port.name} sells no bunkers.${k >= 0 ? ` Carry it from ${ports[k].name}.` : ''}`;
      }
      problems.push({ who: 'chief', code: 'short', port: i, amount: n, text });
    }
    const nextBar = ports[i + 1].bar;
    if (nextBar !== undefined && w - burn > nextBar) {
      problems.push({ who: 'pilot', code: 'barAhead', port: i + 1, amount: w - burn - nextBar, text: `PILOT: ${w - burn - nextBar} t too deep for the ${ports[i + 1].name} bar.` });
    }
    legResults.push({ weight: w, band, burn, fuelOut: fuel, fuelIn, reefers });
    fuel = fuelIn;
  }
  const restowCost = restows * level.restowFee;
  return {
    projection: {
      calls,
      legs: legResults,
      freight,
      fuelCost,
      restowCost,
      profit: freight - fuelCost - restowCost,
      problems,
      onMark,
      restows,
      finalRob: fuel,
    },
    plan,
    bounced,
  };
}

/** Stars earned by a profit (0–3). */
export function starsFor(level: Level, profit: number): number {
  let s = 0;
  for (const t of level.stars) if (profit >= t) s++;
  return s;
}

/** Bays as they stand at port `i` during its call (after discharge, after this call's loads). */
export function baysAt(level: Level, plan: Call[], port: number): BoxId[][] {
  const trimmed = plan.slice(0, port + 1);
  // simulate the prefix and take the state after this port's loads: re-run with later calls empty
  const res = simulate(level, [...trimmed, ...plan.slice(port + 1).map(() => ({ loads: [], bunker: 0 }))]);
  const call = res.projection.calls[port];
  const bays = call.bays.map((b) => b.slice());
  for (const ld of res.plan[port]?.loads ?? []) bays[ld.bay].push(ld.box);
  return bays;
}

/**
 * Tonnes to buy at `port` so she reaches the next port that sells bunkers on the reserve (the NEED
 * button): the smallest lot that works, given everything else in the plan. Null if none works.
 */
export function needAt(level: Level, plan: Call[], port: number): number | null {
  const p = level.ports[port];
  if (p.price === null) return null;
  const lot = p.lot ?? 1;
  // cover every leg until the next port that sells bunkers (or the end of the voyage)
  let until = port + 1;
  while (until < level.ports.length - 1 && level.ports[until].price === null) until++;
  const trial = clonePlan(plan);
  for (let b = 0; b <= level.ship.tank; b += lot) {
    trial[port].bunker = b;
    const r = simulate(level, trial);
    if (r.plan[port].bunker !== b) return null; // tank full
    let ok = true;
    for (let i = port; i < until; i++) {
      const leg = r.projection.legs[i];
      if (!leg || leg.fuelIn < level.reserve) ok = false;
    }
    if (ok) return b;
  }
  return null;
}

/** Set every port's bunkers to NEED in turn (the myopic "gas station" plan). */
export function needPlan(level: Level, plan: Call[]): Call[] {
  const out = clonePlan(plan);
  for (let i = 0; i < out.length; i++) {
    out[i].bunker = 0;
  }
  for (let i = 0; i < out.length; i++) {
    const n = needAt(level, out, i);
    if (n !== null) out[i].bunker = n;
  }
  return out;
}
