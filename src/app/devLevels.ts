import type { Level } from '../core/types';
import { solve } from '../core/solver';

/** Hand-made levels used while the campaign isn't built (and by ?dev). */
function finish(l: Omit<Level, 'stars' | 'best'> & { stars?: [number, number, number] }): Level {
  const lv = { ...l, stars: l.stars ?? ([0, 0, 0] as [number, number, number]) } as Level;
  const s = solve(lv);
  if (s) {
    lv.best = s.plan;
    if (!l.stars) lv.stars = [Math.max(1, s.value - 4), Math.max(2, s.value - 2), s.value];
  }
  return lv;
}

export const DEV_LEVELS: Level[] = [
  finish({
    n: 1,
    chapter: 1,
    title: 'Fuel Weighs',
    band: 'T0',
    ship: { name: 'Full & Down', capacity: 12, tank: 10, bays: 4, tiers: 1, bands: [{ upTo: 12, rate: 1 }] },
    ports: [
      { name: 'Rotterdam', code: 'RTM', flag: 'R', price: 1 },
      { name: 'Felixstowe', code: 'FXT', flag: 'F', price: null },
    ],
    legs: [{ days: 2 }],
    boxes: [
      { id: 0, from: 0, to: 1, weight: 4, freight: 8 },
      { id: 1, from: 0, to: 1, weight: 3, freight: 6 },
      { id: 2, from: 0, to: 1, weight: 2, freight: 5 },
      { id: 3, from: 0, to: 1, weight: 1, freight: 2 },
    ],
    startFuel: 1,
    reserve: 1,
    restowFee: 0,
    auto: true,
    mechanics: ['weight'],
    intro: 'weight',
  }),
  finish({
    n: 2,
    chapter: 1,
    title: 'No Bunkers at Esbjerg',
    band: 'B4',
    ship: { name: 'Full & Down', capacity: 16, tank: 10, bays: 2, tiers: 2, bands: [{ upTo: 8, rate: 1 }, { upTo: 16, rate: 2 }] },
    ports: [
      { name: 'Rotterdam', code: 'RTM', flag: 'R', price: 1 },
      { name: 'Esbjerg', code: 'EBJ', flag: 'E', price: null },
      { name: 'Aberdeen', code: 'ABZ', flag: 'A', price: 3 },
      { name: 'Grimsby', code: 'GSY', flag: 'G', price: null },
    ],
    legs: [{ days: 2 }, { days: 1 }, { days: 2 }],
    boxes: [
      { id: 0, from: 0, to: 1, weight: 2, freight: 3 },
      { id: 1, from: 0, to: 1, weight: 4, freight: 7 },
      { id: 2, from: 0, to: 2, weight: 2, freight: 5 },
      { id: 3, from: 0, to: 3, weight: 4, freight: 11 },
      { id: 4, from: 0, to: 3, weight: 1, freight: 5 },
      { id: 5, from: 1, to: 3, weight: 3, freight: 7 },
      { id: 6, from: 1, to: 2, weight: 1, freight: 1 },
      { id: 7, from: 2, to: 3, weight: 3, freight: 7 },
    ],
    startFuel: 0,
    reserve: 0,
    restowFee: 0,
    mechanics: ['weight', 'bands', 'calls', 'pickup', 'prices', 'noPump', 'tiers'],
    stars: [20, 22, 23],
  }),
];
