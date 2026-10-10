import { describe, expect, it } from 'vitest';
import levelsJson from '../src/data/levels.json';
import { AREAS, CAMPAIGN_LEVELS, checkPalette, INTRO_AT, isLesson, rowOf } from '../src/core/progression';
import { simulate } from '../src/core/rules';
import { solve } from '../src/core/solver';
import type { Level, Mechanic } from '../src/core/types';

const levels = levelsJson as unknown as Level[];

describe('the campaign file', () => {
  it('has every level of the ladder, in order', () => {
    expect(levels).toHaveLength(CAMPAIGN_LEVELS);
    levels.forEach((l, i) => {
      expect(l.n).toBe(i + 1);
      expect(l.chapter).toBe(rowOf(l.n).area + 1);
      expect(l.title).toBe(rowOf(l.n).title);
    });
    expect(AREAS).toHaveLength(8);
  });

  it('introduces every mechanic at its level, and never earlier', () => {
    for (const l of levels) for (const m of l.mechanics) expect(INTRO_AT[m], `L${l.n} ${m}`).toBeLessThanOrEqual(l.n);
    for (const [m, n] of Object.entries(INTRO_AT) as [Mechanic, number][]) {
      expect(levels[n - 1].intro, `L${n}`).toBe(m);
      expect(levels[n - 1].mechanics).toContain(m);
    }
  });

  it('keeps to the number palette', () => {
    for (const l of levels) expect(checkPalette(l)).toEqual([]);
  });
});

describe.each(levels.map((l) => [l.n, l] as const))('L%i', (_n, l) => {
  it('best replays to ★★★ with no problems', () => {
    expect(l.best).toBeDefined();
    const sim = simulate(l, l.best!);
    expect(sim.bounced).toEqual([]);
    expect(sim.projection.problems).toEqual([]);
    expect(sim.projection.profit).toBe(l.stars[2]);
  });

  it('★★★ is the exact optimum', () => {
    expect(solve(l)!.value).toBe(l.stars[2]);
  });

  it('stars increase (strictly outside lesson levels)', () => {
    const [a, b, c] = l.stars;
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    if (!isLesson(l.band)) {
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
    }
    // ★ is above every instinctive plan from L2 on
    if (l.n >= 2) expect(a).toBeGreaterThan(Number(l.stats!.greedy));
  });

  it('has a title, a logbook line and stats', () => {
    expect(l.title.length).toBeGreaterThan(2);
    expect((l.logbook ?? '').length).toBeGreaterThan(20);
    expect(typeof l.stats!.di).toBe('number');
  });
});
