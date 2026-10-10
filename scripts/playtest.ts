/**
 * A text-mode harness for playtesting levels without the 3D view.
 *
 *   bun scripts/playtest.ts show <n>                 # describe level n (what a player sees)
 *   bun scripts/playtest.ts try <n> '<plan json>'    # sail a plan on paper: problems, profit, stars
 *
 * A plan is one call per port except the last: [{"loads":[{"box":3,"bay":0}],"bunker":4}, …].
 * On levels with the automatic valve, bunkers are set for you (the cheapest safe plan).
 */
import { readFileSync } from 'node:fs';
import { simulate, starsFor, bandOf } from '../src/core/rules';
import { autoBunker } from '../src/core/solver';
import type { Call, Level, Mechanic } from '../src/core/types';

const levels: Level[] = JSON.parse(readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8'));
const [cmd, nArg, planArg] = process.argv.slice(2);
const level = levels.find((l) => l.n === Number(nArg));
if (!level) {
  console.error(`no level ${nArg} (1..${levels.length})`);
  process.exit(1);
}

/** Rule names in a player's words (the `mechanics` ids are internal). */
const RULE_NAMES: Record<Mechanic, string> = {
  weight: 'fuel weighs (cargo + fuel share the deadweight)',
  bands: 'burn bands',
  calls: 'discharge at each port',
  pickup: 'pickups at later ports',
  noPump: 'some ports sell no bunkers',
  tiers: 'stacks (never bury)',
  bar: 'harbour bars',
  prices: 'bunker prices differ by port',
  lot: 'bunkers sold in lots',
  heavy: 'heavy below light',
  reefer: 'reefers need plugs',
  contract: 'contract boxes must sail',
  zone: 'winter load line',
  bridge: 'low bridge',
};

/** "up to 7 t", "8–11 t", "12 t" — never "12–12 t" or "0–1 t". */
function bandRange(s: Level['ship'], i: number): string {
  const lo = i ? s.bands[i - 1].upTo + 1 : 0;
  const hi = s.bands[i].upTo;
  if (i === 0) return `up to ${hi} t`;
  return lo === hi ? `${hi} t` : `${lo}–${hi} t`;
}

const bandLabel = (s: Level['ship'], w: number) => {
  const i = bandOf(s, w);
  return `band ${i + 1} of ${s.bands.length}, ×${s.bands[i].rate}`;
};

function show(lv: Level): void {
  const s = lv.ship;
  console.log(`LEVEL ${lv.n} · ${lv.title} (area ${lv.chapter})`);
  console.log(`Ship: deadweight ${s.capacity} t (cargo + fuel at departure), tank ${s.tank} t, hold ${s.bays} stacks × ${s.tiers} high`);
  console.log(`Burn bands (weight aboard at departure → t of fuel per sea day): ${s.bands.map((b, i) => `${bandRange(s, i)}: ×${b.rate}`).join(', ')}`);
  if (s.plugs?.length && lv.mechanics.includes('reefer')) console.log(`Reefer plugs on stacks: ${s.plugs.join(', ')} (each reefer aboard burns +1 t per leg)`);
  console.log(`Start with ${lv.startFuel} t aboard. MIN ROB (reserve): arrive at every port with at least ${lv.reserve} t.`);
  console.log(`Rules: ${lv.mechanics.map((m) => RULE_NAMES[m]).join(', ')}${lv.auto ? ' · bunkers are automatic (cheapest safe plan)' : ' · you set the bunkers ("bunker": t per call)'}`);
  console.log('Ports:');
  lv.ports.forEach((p, i) => console.log(`  ${i} ${p.name} (${p.code}): ${p.price === null ? 'no bunkers' : `bunkers $${p.price}/t${p.lot && p.lot > 1 ? ` in lots of ${p.lot}` : ''}`}${p.bar !== undefined ? `, harbour bar: at most ${p.bar} t aboard on arrival and on departure` : ''}`));
  console.log('Legs:');
  lv.legs.forEach((l, i) => console.log(`  ${i}: ${lv.ports[i].code} → ${lv.ports[i + 1].code}, ${l.days} day${l.days === 1 ? '' : 's'}${l.zone && lv.mechanics.includes('zone') ? `, winter line after ${l.zone.at} of ${l.days} days: weight after ${l.zone.at} days' burn at most ${l.zone.limit} t` : ''}${l.bridge && lv.mechanics.includes('bridge') ? `, low bridge: at least ${l.bridge.min} t aboard at departure` : ''}`));
  console.log('Boxes (id: from → to, weight, freight):');
  for (const b of lv.boxes) console.log(`  ${b.id}: ${lv.ports[b.from].code} → ${lv.ports[b.to].code}, ${b.weight} t, $${b.freight}${b.reefer && lv.mechanics.includes('reefer') ? ', REEFER' : ''}${b.contract ? ', CONTRACT (must sail)' : ''}`);
  console.log(`Stars: ★ $${lv.stars[0]} · ★★ $${lv.stars[1]} · ★★★ $${lv.stars[2]}`);
  console.log('Stacking: a box may not stand on a box that comes off earlier' + (lv.mechanics.includes('heavy') ? ', nor on a lighter box (equal weights are fine).' : '.'));
}

/** The plan must have one call per port but the last, and on manual levels a bunker figure for each. */
function checkPlan(lv: Level, plan: unknown): string | null {
  const calls = lv.ports.length - 1;
  if (!Array.isArray(plan)) return 'the plan must be a JSON array of calls';
  if (plan.length !== calls) return `the plan needs ${calls} call(s), one per port except the last (got ${plan.length})`;
  for (let i = 0; i < plan.length; i++) {
    const c = plan[i] as Partial<Call> | null;
    if (!c || !Array.isArray(c.loads)) return `call ${i} (${lv.ports[i].code}) needs "loads": [{"box":…,"bay":…}, …]`;
    for (const l of c.loads) if (typeof l?.box !== 'number' || typeof l?.bay !== 'number') return `call ${i}: every load needs a numeric "box" and "bay"`;
    if (!lv.auto && typeof c.bunker !== 'number') return `call ${i} (${lv.ports[i].code}) needs "bunker": tonnes to buy (0 if none); bunkers are manual on this level`;
  }
  return null;
}

function tryPlan(lv: Level, plan: Call[]): void {
  const bad = checkPlan(lv, plan);
  if (bad) {
    console.error(`bad plan: ${bad}`);
    process.exit(1);
  }
  let p = plan.map((c) => ({ loads: c.loads, bunker: c.bunker ?? 0 }));
  if (lv.auto) p = autoBunker(lv, plan);
  const r = simulate(lv, p);
  const pr = r.projection;
  if (r.bounced.length) console.log('BOUNCED (illegal, removed):', JSON.stringify(r.bounced));
  pr.legs.forEach((l, i) => {
    const leg = lv.legs[i];
    const arrive = l.weight - l.burn;
    const bar = lv.ports[i + 1].bar;
    const zone = leg.zone && lv.mechanics.includes('zone') ? `, at the winter line ${l.weight - leg.zone.at * lv.ship.bands[l.band].rate} t (max ${leg.zone.limit})` : '';
    console.log(
      `leg ${i} ${lv.ports[i].code}→${lv.ports[i + 1].code}: departs ${l.weight} t (${bandLabel(lv.ship, l.weight)}), burns ${l.burn}, fuel ${l.fuelOut} → ${l.fuelIn}` +
        `${zone}, arrives ${arrive} t${bar !== undefined ? ` (bar ${bar})` : ''}${lv.auto ? `, bunkered ${r.plan[i].bunker}` : ''}`,
    );
  });
  console.log(`freight $${pr.freight} − bunkers $${pr.fuelCost} = profit $${pr.profit}`);
  if (pr.problems.length) console.log('PROBLEMS:', pr.problems.map((x) => x.text).join(' | '));
  else console.log(`stars: ${starsFor(lv, pr.profit)} (can sail: ${pr.profit >= lv.stars[0] ? 'yes' : 'no, below ★'})`);
}

if (cmd === 'show') show(level);
else if (cmd === 'try') tryPlan(level, JSON.parse(planArg ?? '[]'));
else console.log('usage: show <n> | try <n> <plan json>');
