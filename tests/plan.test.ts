import { describe, expect, it } from 'vitest';
import { PlanModel } from '../src/game/Plan';
import { B3 } from './fixtures';
import type { Level } from '../src/core/types';

const lv: Level = { ...B3, stars: [20, 22, 23] };

describe('plan model', () => {
  it('loads, lands and undoes', () => {
    const m = new PlanModel(lv);
    expect(m.place(3, 0).ok).toBe(true);
    expect(m.baysAt(0)[0]).toEqual([3]);
    expect(m.quayAt(0)).not.toContain(3);
    expect(m.unload(3)).toBe(true);
    expect(m.baysAt(0)[0]).toEqual([]);
    m.undo();
    expect(m.baysAt(0)[0]).toEqual([3]);
  });

  it('refuses to bury a box that leaves earlier', () => {
    const m = new PlanModel(lv);
    m.place(0, 0); // to P1
    const r = m.place(3, 0); // to P3 on top of a P1 box
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bury');
  });

  it('bounces a later pickup when an earlier change fills the stack', () => {
    const m = new PlanModel(lv);
    m.place(3, 0); // P3 box, bay 0
    m.place(4, 1); // P3 box, bay 1
    m.select(1);
    m.place(5, 0); // pickup at P1 onto bay 0 (P3 on P3: fine)
    expect(m.baysAt(1)[0]).toEqual([3, 5]);
    m.select(0);
    m.place(2, 0); // a P2 box on top of the P3 box at P0: bay 0 is now full at P1
    expect(m.sim.plan[1].loads).toEqual([]);
    expect(m.bouncedPorts.has(1)).toBe(true);
  });

  it('plays the optimum to 23 with no problems', () => {
    const m = new PlanModel(lv);
    m.place(3, 0);
    m.place(2, 0);
    m.place(4, 1);
    m.bunker(9);
    m.select(1);
    m.place(5, 1);
    m.select(2);
    m.place(7, 0);
    m.bunker(1);
    expect(m.sim.projection.problems).toEqual([]);
    expect(m.profit).toBe(23);
    expect(m.sailRefusal()).toBeNull();
    expect(m.stars).toBe(3);
  });

  it('NEED buys just enough to reach the next pump (through the dry port)', () => {
    const m = new PlanModel(lv);
    m.place(3, 0);
    const n = m.need();
    // P1 sells nothing: 4 t + 3 t = 7 t LIGHT burns 2 to P1, then 5 t LIGHT burns 1 to P2
    expect(n).toBe(3);
    expect(m.sim.projection.legs[1].fuelIn).toBe(0);
  });

  it('the automatic valve orders the cheapest safe plan', () => {
    const auto: Level = { ...lv, auto: true };
    const m = new PlanModel(auto);
    m.place(3, 0);
    m.place(4, 1);
    // P3 boxes ride all three legs; no bunkers at P1 or P3, dear at P2: the Chief buys at home
    expect(m.sim.projection.problems).toEqual([]);
    expect(m.sim.plan[0].bunker).toBeGreaterThan(0);
  });
});
