import { Rng } from './rng';
import { AREA_PORTS, AREA_SHIPS, BULKER_NAMES, flagsFor, type PortName } from './ports';
import { shipKind } from './rules';
import type { Level } from './types';

/**
 * Real names for a generated voyage. The puzzle (weights, prices, days, bars) is fixed first; then
 * the voyage takes a run of neighbouring ports from its sea area's route, chosen so each port suits
 * its role. A harbour bar falls on a river port (the Danube, the Columbia), a dry call on a small port,
 * the cheapest bunkers on a hub (Fujairah, Singapore, Gibraltar), and a low bridge on a leg under a
 * real one (the Bosphorus, Lions Gate, the Bridge of the Americas). The North Sea keeps its own names.
 */

/** River and lagoon ports, where a bar or a dredged channel limits the draught. */
const RIVER = new Set([
  'Galați', 'Reni', 'Izmail', 'Mykolaiv', 'Szczecin', 'Riga', 'Lübeck', 'Guayaquil', 'Portland',
  'Ho Chi Minh City', 'Hai Phong', 'Shanghai', 'Turbo', 'Santos', 'Houston', 'Suez',
]);

/** Small ports that sell no bunkers. */
const SMALL = new Set([
  'Reni', 'Izmail', 'Pivdennyi', 'Poti', 'Kotka', 'Turku', 'Sohar', 'Djibouti', 'Paita', 'Turbo',
  'Puerto Bolívar', 'Santo Tomás', 'Dutch Harbor', 'Kodiak', 'Kushiro', 'Tomakomai', 'Prince Rupert',
  'Tanjung Pelepas', 'Laem Chabang', 'Hai Phong', 'Santa Marta', 'Samsun', 'Batumi',
]);

/** The world's bunkering hubs: where fuel is cheap. */
const HUB = new Set([
  'Rotterdam', 'Gibraltar', 'Algeciras', 'Las Palmas', 'Marsaxlokk', 'Piraeus', 'Port Said', 'Fujairah',
  'Khor Fakkan', 'Singapore', 'Hong Kong', 'Busan', 'Balboa', 'Houston', 'Istanbul', 'Colombo',
  'Long Beach', 'Gothenburg', 'Copenhagen', 'Odessa', 'Panama', 'Cartagena', 'Kingston', 'Vancouver',
  'Shanghai', 'Jebel Ali', 'Durban',
]);

/** Ports reached under a famous low bridge (the leg INTO them carries the air-draught limit). */
const BRIDGED = new Set([
  'Istanbul', 'Copenhagen', 'Lübeck', 'Vancouver', 'Portland', 'Balboa', 'Sydney', 'Busan', 'Long Beach',
  'Galați', 'Riga', 'Seattle', 'Tacoma',
]);

/** Swap port names inside a sentence (longest first, whole words only). */
function swapNames(text: string, from: string[], to: string[]): string {
  const order = from.map((f, i) => ({ f, t: to[i] })).sort((a, b) => b.f.length - a.f.length);
  // two passes through placeholders, so A→B and B→C don't chain
  let out = text;
  order.forEach(({ f }, i) => {
    out = out.replace(new RegExp(`(?<![\\p{L}])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu'), `\u0000${i}\u0000`);
  });
  order.forEach(({ t }, i) => {
    out = out.split(`\u0000${i}\u0000`).join(t);
  });
  return out;
}

/**
 * Name one level. `used` counts how often each port has served so far in the campaign (pass the
 * same map to every call, in level order): a port that has had its turn yields to its neighbours,
 * so a sea area's voyages spread along its whole route.
 */
export function nameLevel(level: Level, used: Map<string, number> = new Map()): Level {
  const bulker = shipKind(level) === 'bulker' ? BULKER_NAMES[(used.get('#bulker') ?? 0) % BULKER_NAMES.length] : null;
  if (bulker) used.set('#bulker', (used.get('#bulker') ?? 0) + 1);
  const area = Math.max(0, Math.min(AREA_PORTS.length - 1, (level.chapter || Math.ceil(level.n / 9)) - 1));
  const list = AREA_PORTS[area];
  const P = level.ports.length;
  // home waters keep their names; every port still gets its country and its true code
  if (area === 0) {
    const ports = level.ports.map((pt) => {
      const known = list.find((x) => x.name === pt.name) ?? AREA_PORTS.flat().find((x) => x.name === pt.name);
      return known ? { ...pt, code: known.code, country: known.country } : pt;
    });
    return { ...level, ports, ship: bulker ? { ...level.ship, name: bulker } : level.ship };
  }
  const rng = new Rng(0x5eed + level.n * 7919);
  const last = P - 1;
  const prices = level.ports.slice(0, last).map((p) => p.price).filter((x): x is number => x !== null);
  const cheapest = prices.length > 1 && new Set(prices).size > 1 ? Math.min(...prices) : null;
  const score = (names: PortName[]): number => {
    let s = rng.next() * 1.2;
    names.forEach((pt, i) => {
      const role = level.ports[i];
      s -= 0.9 * (used.get(pt.name) ?? 0);
      if (role.bar !== undefined) s += RIVER.has(pt.name) ? 3 : -1;
      if (i < last && role.price === null) s += SMALL.has(pt.name) ? 1 : HUB.has(pt.name) ? -2 : 0;
      if (i < last && cheapest !== null && role.price === cheapest) s += HUB.has(pt.name) ? 1.5 : 0;
      if (i > 0 && level.legs[i - 1]?.bridge) s += BRIDGED.has(pt.name) ? 3 : 0;
    });
    return s;
  };
  let best: PortName[] = list.slice(0, P);
  let bestScore = -Infinity;
  for (let start = 0; start + P <= list.length; start++) {
    for (const dir of [1, -1]) {
      const run = list.slice(start, start + P);
      const names = dir === 1 ? run : run.slice().reverse();
      const sc = score(names);
      if (sc > bestScore) {
        bestScore = sc;
        best = names;
      }
    }
  }
  for (const pt of best) used.set(pt.name, (used.get(pt.name) ?? 0) + 1);
  const named = flagsFor(best);
  const ports = level.ports.map((pt, i) => ({ ...pt, name: named[i].name, code: named[i].code, flag: named[i].flag, country: named[i].country }));
  const pick = rng.pick(AREA_SHIPS[area]);
  const ship = { ...level.ship, name: bulker ?? pick };
  const logbook = level.logbook ? swapNames(level.logbook, level.ports.map((p) => p.name), ports.map((p) => p.name)) : level.logbook;
  return { ...level, ports, ship, logbook };
}
