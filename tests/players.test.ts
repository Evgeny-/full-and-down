import { describe, expect, it } from 'vitest';
import { measure, thresholds } from '../src/core/metrics';
import {
  applyBunkers,
  carefulPlayer,
  gasFuel,
  judge,
  kExchange,
  Landscape,
  NEG,
  playNatural,
  quickStow,
  sensiblePlay,
  strongPlayer,
  tinkerer,
} from '../src/core/players';
import { emptyPlan, needPlan, simulate } from '../src/core/rules';
import { Rng } from '../src/core/rng';
import { ManifestTable, maskOf, solve } from '../src/core/solver';
import type { Level } from '../src/core/types';
import { AUTHORED } from '../src/core/authored';
import { B2, B3 } from './fixtures';

describe('the manifest landscape', () => {
  it('matches ManifestTable.value on every manifest', () => {
    for (const lv of [B2, B3]) {
      const t = new ManifestTable(lv);
      const land = new Landscape(lv);
      for (let m = 0; m < land.size; m++) expect(land.value(m)).toBe(t.value(m));
      expect(land.best()!.value).toBe(solve(lv)!.value);
    }
  });
  it('quickStow only returns legal stowages', () => {
    const land = new Landscape(B3);
    for (let m = 0; m < land.size; m++) {
      const s = quickStow(B3, m);
      if (!s) continue;
      const plan = s.map((loads) => ({ loads, bunker: 0 }));
      expect(simulate(B3, plan).bounced).toEqual([]);
    }
  });
});

describe('bunkering rules', () => {
  it('NEED equals needPlan where every port has a pump', () => {
    const lv: Level = { ...B2, startFuel: 1, reserve: 1 };
    const land = new Landscape(lv);
    for (let m = 0; m < land.size; m++) {
      if (land.value(m) <= NEG) continue;
      const plan = quickStow(lv, m)!.map((loads) => ({ loads, bunker: 0 }));
      const a = applyBunkers(lv, plan, 'need').map((c) => c.bunker);
      const b = needPlan(lv, plan).map((c) => c.bunker);
      expect(a).toEqual(b);
    }
  });
  it('the NEED valuation of a manifest is what its NEED plan earns in simulate()', () => {
    for (const lv of [B2, B3]) {
      const land = new Landscape(lv);
      const gas = land.gasUb();
      for (let m = 0; m < land.size; m++) {
        if (land.value(m) <= NEG) continue;
        const plan = applyBunkers(lv, land.table.stow(m)!.loads.slice(0, -1).map((loads) => ({ loads, bunker: 0 })), 'need');
        const j = judge(lv, plan);
        if (j.legal) expect(gas[m]).toBe(j.profit);
        else expect(gas[m]).toBe(NEG);
      }
    }
  });
  it('NEED carries the fuel past a dry port', () => {
    // B3: no bunkers at P1, so P0 must stem for legs 1 and 2
    const buy = gasFuel(B3, [0, 0, 0], [0, 0, 0]);
    expect(buy[0]).toBe(3);
    expect(buy[1]).toBe(0);
    const plan = applyBunkers(B3, emptyPlan(B3), 'need');
    expect(judge(B3, plan).legal).toBe(true);
  });
});

describe('natural starts on the B3 fixture', () => {
  const land = new Landscape(B3);
  const vstar = solve(B3)!.value;
  it('the freight greedy with NEED bunkering scores less than the optimum', () => {
    const g = playNatural(B3, 'freight', land);
    expect(g.legal).toBe(true);
    expect(g.profit).toBeLessThan(vstar);
    expect(simulate(B3, g.plan).projection.profit).toBe(g.profit);
  });
  it('every natural start is a legal plan below the optimum', () => {
    for (const k of ['freight', 'density', 'tank', 'myopic'] as const) {
      const p = playNatural(B3, k, land);
      expect(p.legal, k).toBe(true);
      expect(p.profit, k).toBeLessThan(vstar);
      expect(maskOf(p.plan)).toBe(p.mask);
    }
  });
  it('filling the tank first costs cargo', () => {
    const tank = playNatural(B3, 'tank', land);
    const dens = playNatural(B3, 'density', land);
    expect(tank.plan[0].bunker).toBeGreaterThan(dens.plan[0].bunker);
  });
});

describe('editors and the tinkerer', () => {
  const land = new Landscape(B3);
  const vstar = solve(B3)!.value;
  const starts = (['freight', 'density', 'tank', 'myopic'] as const).map((k) => playNatural(B3, k, land));
  it('the careful editor (3-exchange) finds the optimum', () => {
    const vals = carefulPlayer(land, starts.map((s) => s.mask), 2, new Rng(1));
    expect(Math.max(...vals)).toBe(vstar);
    for (const v of vals) expect(v).toBeLessThanOrEqual(vstar);
  });
  it('the strong editor never beats the optimum and is deterministic per seed', () => {
    const s = starts.map((p) => ({ kind: p.kind, mask: p.mask, noisy: false }));
    const a = strongPlayer(land, s, 32, new Rng(5));
    const b = strongPlayer(land, s, 32, new Rng(5));
    expect(a.values).toEqual(b.values);
    for (const v of a.values) expect(v).toBeLessThanOrEqual(vstar);
    for (const e of a.edits) expect(e).toBeLessThanOrEqual(20);
  });
  it('the 3-exchange neighbourhood includes every 1- and 2-exchange', () => {
    const k3 = kExchange(3);
    expect(k3).toContainEqual([2, 1]);
    expect(k3).toContainEqual([1, 2]);
    expect(k3).toHaveLength(15);
  });
  it('the tinkerer only ends on safe plans', () => {
    const rng = new Rng(9);
    for (let r = 0; r < 20; r++) {
      const v = tinkerer(B3, rng, 40, land);
      expect(v === NEG || v <= vstar).toBe(true);
    }
  });
});

describe('metrics', () => {
  it('stars: separation of 2 where the range allows, ★ and ★★ apart whenever they can be', () => {
    expect(thresholds(30, 20, 26)).toEqual([21, 27, 30]);
    expect(thresholds(30, 20, null)).toEqual([21, 26, 30]);
    expect(thresholds(30, 20, 29)).toEqual([21, 28, 30]);
    expect(thresholds(30, 26, null)).toEqual([27, 28, 30]);
    expect(thresholds(30, 27, null)).toEqual([28, 29, 30]);
    expect(thresholds(30, 28, null)).toEqual([29, 30, 30]);
    expect(thresholds(30, 29, null)).toEqual([30, 30, 30]);
  });
  it('the sensible human repairs the instinctive load with single changes', () => {
    const land = new Landscape(B3);
    const inst = (['freight', 'density'] as const).map((k) => playNatural(B3, k, land));
    const s = sensiblePlay(B3, land, inst)!;
    expect(s.legal).toBe(true);
    expect(s.profit).toBeGreaterThanOrEqual(Math.max(...inst.map((p) => p.profit)));
    expect(s.profit).toBeLessThanOrEqual(solve(B3)!.value);
    expect(simulate(B3, s.plan).projection.profit).toBe(s.profit);
  });
  it('the tutorials teach what they say', () => {
    const l2 = measure(AUTHORED[2].level, { strongRuns: 16, carefulRandom: 2, tinkerRuns: 10, seed: 1, baseline: 'instinct' })!;
    // every instinctive load takes the 4 t box and goes LADEN; par leaves it ashore
    expect(l2.greedyBest).toBeLessThan(l2.stars[0]);
    expect(l2.bestMask & 1).toBe(0);
    expect(l2.ablation.bands).toBeGreaterThan(0);
    const l1 = measure(AUTHORED[1].level, { strongRuns: 8, carefulRandom: 0, tinkerRuns: 0, seed: 1 })!;
    expect(l1.onMark && l1.onReserve).toBe(true);
    expect(l1.ablation.weight).toBeGreaterThan(0);
    const l3 = measure(AUTHORED[3].level, { strongRuns: 16, carefulRandom: 2, tinkerRuns: 10, seed: 1, baseline: 'instinct' })!;
    expect(l3.greedyBest).toBeLessThan(l3.stars[0]);
    expect(l3.ablation.calls).toBeGreaterThan(0);
  });
});
