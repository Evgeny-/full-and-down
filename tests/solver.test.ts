import { describe, expect, it } from 'vitest';
import { solve, ManifestTable } from '../src/core/solver';
import { simulate } from '../src/core/rules';
import { B2, B3 } from './fixtures';

describe('solver', () => {
  it('B2 optimum is 15', () => {
    const s = solve(B2)!;
    expect(s.value).toBe(15);
    const sim = simulate(B2, s.plan);
    expect(sim.projection.problems).toEqual([]);
    expect(sim.projection.profit).toBe(15);
  });
  it('B3 optimum is 23 and its plan replays', () => {
    const s = solve(B3)!;
    expect(s.value).toBe(23);
    const sim = simulate(B3, s.plan);
    expect(sim.bounced).toEqual([]);
    expect(sim.projection.problems).toEqual([]);
    expect(sim.projection.profit).toBe(23);
  });
  it('B3 optimum is unique by manifest', () => {
    const t = new ManifestTable(B3);
    let n = 0;
    for (let m = 0; m < 1 << B3.boxes.length; m++) if (t.value(m) === 23) n++;
    expect(n).toBe(1);
  });
});
