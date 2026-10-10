import type { Level } from '../src/core/types';

const base = { n: 0, chapter: 0, title: 'fixture', band: 'B3', stars: [0, 0, 0] as [number, number, number] };

/** Doc 10, B2: "Bunker where it's cheap, but not too much" (optimum 15). */
export const B2: Level = {
  ...base,
  ship: { name: 'T', capacity: 14, tank: 10, bays: 2, tiers: 2, bands: [{ upTo: 7, rate: 1 }, { upTo: 14, rate: 2 }] },
  ports: [
    { name: 'P0', code: 'PZR', flag: 'K', price: 1 },
    { name: 'P1', code: 'PON', flag: 'A', price: 2 },
    { name: 'P2', code: 'PTW', flag: 'O', price: null },
  ],
  legs: [{ days: 2 }, { days: 2 }],
  boxes: [
    { id: 0, from: 0, to: 1, weight: 4, freight: 9 }, // a
    { id: 1, from: 0, to: 1, weight: 2, freight: 3 }, // d
    { id: 2, from: 0, to: 2, weight: 3, freight: 5 }, // b
    { id: 3, from: 0, to: 2, weight: 2, freight: 3 }, // c
    { id: 4, from: 1, to: 2, weight: 3, freight: 6 }, // e
  ],
  startFuel: 0,
  reserve: 0,
  restowFee: 2,
  mechanics: ['weight', 'bands', 'calls', 'pickup', 'prices', 'tiers'],
};

/** Doc 10, B3: "No bunkers at Port 1" (optimum 23, unique). */
export const B3: Level = {
  ...base,
  ship: { name: 'T', capacity: 16, tank: 10, bays: 2, tiers: 2, bands: [{ upTo: 8, rate: 1 }, { upTo: 16, rate: 2 }] },
  ports: [
    { name: 'P0', code: 'PZR', flag: 'K', price: 1 },
    { name: 'P1', code: 'PON', flag: 'A', price: null },
    { name: 'P2', code: 'PTW', flag: 'O', price: 3 },
    { name: 'P3', code: 'PTH', flag: 'T', price: null },
  ],
  legs: [{ days: 2 }, { days: 1 }, { days: 2 }],
  boxes: [
    { id: 0, from: 0, to: 1, weight: 2, freight: 3 }, // a
    { id: 1, from: 0, to: 1, weight: 4, freight: 7 }, // e
    { id: 2, from: 0, to: 2, weight: 2, freight: 5 }, // c
    { id: 3, from: 0, to: 3, weight: 4, freight: 11 }, // b
    { id: 4, from: 0, to: 3, weight: 1, freight: 5 }, // d
    { id: 5, from: 1, to: 3, weight: 3, freight: 7 }, // f
    { id: 6, from: 1, to: 2, weight: 1, freight: 1 }, // g
    { id: 7, from: 2, to: 3, weight: 3, freight: 7 }, // h
  ],
  startFuel: 0,
  reserve: 0,
  restowFee: 3,
  mechanics: ['weight', 'bands', 'calls', 'pickup', 'prices', 'noPump', 'tiers'],
};
