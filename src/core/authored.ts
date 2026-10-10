/**
 * Hand-authored levels: the tutorials (docs/design-process/22 §2.2, 20 §8). Each was tuned with the
 * solver and the simulated players (scripts/build-levels.ts measures them like any other level):
 *
 * - L1 "Fuel Weighs": four boxes fill her deadweight exactly with the reserve aboard, so there is no
 *   room for the 2 t the passage burns. SAIL is refused until a box stays ashore; landing the 2 t box
 *   puts her on the mark and on the reserve (par). Every sensible load passes.
 * - L2 "The Stripe": the 4 t box pays best and is the densest, so every greedy loads it first and
 *   the next box tips her into the LADEN band (4 t of bunkers instead of 2, at $3). Par leaves it
 *   ashore and fills the LIGHT band to the stripe with the two 3 t boxes: $8 against $5.
 * - L3 "Two Calls": the 5 t Oslo box pays best but rides both legs, which keeps the long leg LADEN.
 *   Par takes the 5 t Aarhus box instead: it comes off halfway and she sails the 2-day leg LIGHT, on
 *   the stripe. $13 against $10 for every instinctive load.
 * - L15 "Never Bury": a 2 × 2 hold. Le Havre offers four Antwerp boxes; Southampton a rich box for
 *   Hamburg. Every instinctive load fills both stacks with Antwerp boxes, so the Hamburg box would
 *   stand on a box that leaves earlier and stays ashore. Par stacks the two 4 t Antwerp boxes in one
 *   bay and keeps the other clear (never-bury alone costs $4: relax it and V* rises by 4).
 */
import type { Level } from './types';

export interface Authored {
  level: Level;
  /** star thresholds when the measured ones don't fit a tutorial (L1 passes on any sensible load) */
  stars?: [number, number, number];
  logbook: string;
}

const base = { startFuel: 1, reserve: 1, restowFee: 0, auto: true, stars: [0, 0, 0] as [number, number, number], format: 'spot' as const };

export const AUTHORED: Record<number, Authored> = {
  1: {
    level: {
      ...base,
      n: 1,
      chapter: 1,
      title: 'Fuel Weighs',
      band: 'T0',
      ship: { name: 'Kittiwake', capacity: 11, tank: 6, bays: 4, tiers: 1, bands: [{ upTo: 11, rate: 1 }] },
      ports: [
        { name: 'Felixstowe', code: 'FXT', flag: 'F', price: 1 },
        { name: 'Rotterdam', code: 'RTM', flag: 'R', price: null },
      ],
      legs: [{ days: 2 }],
      boxes: [
        { id: 0, from: 0, to: 1, weight: 4, freight: 5 },
        { id: 1, from: 0, to: 1, weight: 3, freight: 4 },
        { id: 2, from: 0, to: 1, weight: 2, freight: 3 },
        { id: 3, from: 0, to: 1, weight: 1, freight: 2 },
      ],
      mechanics: ['weight'],
      intro: 'weight',
    },
    stars: [5, 7, 9],
    logbook: 'Four boxes put her down to her marks with no room for the 2 t the passage burns; the 2 t box stayed ashore and the bunkers took its place.',
  },
  2: {
    level: {
      ...base,
      n: 2,
      chapter: 1,
      title: 'The Stripe',
      band: 'B2',
      ship: { name: 'Kittiwake', capacity: 12, tank: 8, bays: 4, tiers: 1, bands: [{ upTo: 9, rate: 1 }, { upTo: 12, rate: 2 }] },
      ports: [
        { name: 'Rotterdam', code: 'RTM', flag: 'R', price: 3 },
        { name: 'Esbjerg', code: 'EBJ', flag: 'E', price: null },
      ],
      legs: [{ days: 2 }],
      boxes: [
        { id: 0, from: 0, to: 1, weight: 4, freight: 10 },
        { id: 1, from: 0, to: 1, weight: 3, freight: 7 },
        { id: 2, from: 0, to: 1, weight: 3, freight: 7 },
        { id: 3, from: 0, to: 1, weight: 2, freight: 3 },
      ],
      mechanics: ['weight', 'bands'],
      intro: 'bands',
    },
    logbook: 'The 4 t box paid best, but any box beside it put her in the LADEN band; leaving it ashore kept her LIGHT on 2 t of bunkers instead of 4.',
  },
  3: {
    level: {
      ...base,
      n: 3,
      chapter: 1,
      title: 'Two Calls',
      band: 'B2',
      ship: { name: 'Fulmar', capacity: 15, tank: 8, bays: 4, tiers: 1, bands: [{ upTo: 9, rate: 1 }, { upTo: 15, rate: 2 }] },
      ports: [
        { name: 'Kiel', code: 'KIE', flag: 'K', price: 2 },
        { name: 'Aarhus', code: 'AAR', flag: 'A', price: 2 },
        { name: 'Oslo', code: 'OSL', flag: 'O', price: null },
      ],
      legs: [{ days: 1 }, { days: 2 }],
      boxes: [
        { id: 0, from: 0, to: 1, weight: 5, freight: 7 },
        { id: 1, from: 0, to: 1, weight: 4, freight: 4 },
        { id: 2, from: 0, to: 2, weight: 5, freight: 10 },
        { id: 3, from: 0, to: 2, weight: 3, freight: 8 },
        { id: 4, from: 0, to: 2, weight: 3, freight: 6 },
      ],
      mechanics: ['weight', 'bands', 'calls'],
      intro: 'calls',
    },
    logbook: 'The 5 t Oslo box paid best, but it rode both legs and kept her LADEN to Oslo; the 5 t Aarhus box came off halfway and she sailed the long leg LIGHT.',
  },
};

AUTHORED[15] = {
  level: {
    ...base,
    auto: false,
    n: 15,
    chapter: 2,
    title: 'Never Bury',
    band: 'B2',
    ship: { name: 'Cormorant', capacity: 18, tank: 10, bays: 2, tiers: 2, bands: [{ upTo: 12, rate: 1 }, { upTo: 18, rate: 2 }] },
    ports: [
      { name: 'Le Havre', code: 'LEH', flag: 'L', price: 1 },
      { name: 'Southampton', code: 'SOU', flag: 'S', price: 1 },
      { name: 'Antwerp', code: 'ANR', flag: 'A', price: 1 },
      { name: 'Hamburg', code: 'HAM', flag: 'H', price: null },
    ],
    legs: [{ days: 1 }, { days: 1 }, { days: 2 }],
    boxes: [
      { id: 0, from: 0, to: 2, weight: 4, freight: 12 },
      { id: 1, from: 0, to: 2, weight: 4, freight: 12 },
      { id: 2, from: 0, to: 2, weight: 2, freight: 4 },
      { id: 3, from: 0, to: 2, weight: 1, freight: 2 },
      { id: 4, from: 1, to: 3, weight: 3, freight: 9 },
      { id: 5, from: 2, to: 3, weight: 2, freight: 4 },
    ],
    mechanics: ['weight', 'bands', 'calls', 'pickup', 'tiers'],
    intro: 'tiers',
  },
  logbook: 'The small Antwerp boxes filled the second stack at Le Havre, and the Southampton box for Hamburg had nowhere to stand: nothing may sit on a box that leaves earlier. Stack the Antwerp boxes together and keep a bay clear.',
};

export function authoredLevel(n: number): Authored | null {
  return AUTHORED[n] ?? null;
}
