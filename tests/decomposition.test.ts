import { describe, expect, it } from 'vitest';
import { solve } from '../src/core/solver';
import { Rng } from '../src/core/rng';
import type { Level, Mechanic } from '../src/core/types';
import { naiveBest } from './naive';

function randomLevel(seed: number): Level {
  const r = new Rng(seed);
  const P = r.int(2, 3);
  const nBoxes = r.int(2, 5);
  const C = r.int(8, 14);
  const mid = r.int(3, C - 3);
  const mech: Mechanic[] = ['weight', 'bands', 'calls', 'pickup', 'tiers'];
  const heavy = r.chance(0.4);
  if (heavy) mech.push('heavy');
  const level: Level = {
    n: 0, chapter: 0, title: 'random', band: 'B3', stars: [0, 0, 0],
    ship: { name: 'R', capacity: C, tank: r.int(4, 8), bays: 2, tiers: 2, bands: [{ upTo: mid, rate: 1 }, { upTo: C, rate: 2 }] },
    ports: Array.from({ length: P }, (_, i) => ({ name: 'P' + i, code: 'P' + i, flag: 'K', price: i === P - 1 ? null : r.chance(0.75) ? r.int(1, 3) : null, bar: r.chance(0.15) ? r.int(5, C) : undefined })),
    legs: Array.from({ length: P - 1 }, () => ({ days: r.int(1, 2) })),
    boxes: [],
    startFuel: r.int(0, 3),
    reserve: r.int(0, 1),
    restowFee: r.int(1, 3),
    mechanics: mech,
  };
  for (let k = 0; k < nBoxes; k++) {
    const from = r.int(0, P - 2);
    const to = r.int(from + 1, P - 1);
    level.boxes.push({ id: k, from, to, weight: r.int(1, 4), freight: r.int(1, 9) });
  }
  return level;
}

describe('decomposition equals brute force', () => {
  it('on 150 random tiny levels', () => {
    let checked = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const level = randomLevel(seed);
      const naive = naiveBest(level);
      const s = solve(level);
      if (naive === -Infinity) {
        expect(s).toBeNull();
      } else {
        expect(s?.value, `seed ${seed}`).toBe(naive);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
