import { simulate } from '../src/core/rules';
import type { Call, Level } from '../src/core/types';

/** Brute force over every plan (tiny levels only): the test oracle for the decomposition. */
export function naiveBest(level: Level): number {
  const P = level.ports.length;
  let best = -Infinity;
  const plan: Call[] = level.ports.slice(0, -1).map(() => ({ loads: [], bunker: 0 }));
  const offers = (i: number) => level.boxes.filter((b) => b.from === i).map((b) => b.id);
  const placements = (ids: number[]): { box: number; bay: number }[][] => {
    const out: { box: number; bay: number }[][] = [[]];
    const rec = (left: number[], acc: { box: number; bay: number }[]) => {
      for (let k = 0; k < left.length; k++) {
        for (let bay = 0; bay < level.ship.bays; bay++) {
          const next = [...acc, { box: left[k], bay }];
          out.push(next);
          rec(left.filter((_, j) => j !== k), next);
        }
      }
    };
    rec(ids, []);
    return out;
  };
  const go = (i: number) => {
    if (i === P - 1) {
      const r = simulate(level, plan);
      if (r.bounced.length || r.projection.problems.length) return;
      best = Math.max(best, r.projection.profit);
      return;
    }
    const port = level.ports[i];
    const maxBuy = port.price === null ? 0 : level.ship.tank;
    for (const loads of placements(offers(i))) {
      for (let b = 0; b <= maxBuy; b += port.lot ?? 1) {
        plan[i] = { loads, bunker: b };
        go(i + 1);
      }
    }
  };
  go(0);
  return best;
}
