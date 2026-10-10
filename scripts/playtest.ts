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
import type { Call, Level } from '../src/core/types';

const levels: Level[] = JSON.parse(readFileSync(new URL('../src/data/levels.json', import.meta.url), 'utf8'));
const [cmd, nArg, planArg] = process.argv.slice(2);
const level = levels.find((l) => l.n === Number(nArg));
if (!level) {
  console.error(`no level ${nArg} (1..${levels.length})`);
  process.exit(1);
}

function show(lv: Level): void {
  const s = lv.ship;
  console.log(`LEVEL ${lv.n} · ${lv.title} (area ${lv.chapter})`);
  console.log(`Ship: deadweight ${s.capacity} t (cargo + fuel at departure), tank ${s.tank} t, hold ${s.bays} stacks × ${s.tiers} high`);
  console.log(`Burn bands (weight aboard at departure → t of fuel per sea day): ${s.bands.map((b, i) => `${i ? s.bands[i - 1].upTo + 1 : 0}–${b.upTo} t: ×${b.rate}`).join(', ')}`);
  if (s.plugs?.length && lv.mechanics.includes('reefer')) console.log(`Reefer plugs on stacks: ${s.plugs.join(', ')} (each reefer aboard burns +1 t per leg)`);
  console.log(`Start with ${lv.startFuel} t aboard. MIN ROB (reserve): arrive at every port with at least ${lv.reserve} t.`);
  console.log(`Rules: ${lv.mechanics.join(', ')}${lv.auto ? ' · bunkers are automatic (cheapest safe plan)' : ''}`);
  console.log('Ports:');
  lv.ports.forEach((p, i) => console.log(`  ${i} ${p.name} (${p.code}): ${p.price === null ? 'no bunkers' : `bunkers $${p.price}/t${p.lot && p.lot > 1 ? ` in lots of ${p.lot}` : ''}`}${p.bar !== undefined ? `, harbour bar: max ${p.bar} t aboard in port` : ''}`));
  console.log('Legs:');
  lv.legs.forEach((l, i) => console.log(`  ${i}: ${lv.ports[i].code} → ${lv.ports[i + 1].code}, ${l.days} days${l.zone && lv.mechanics.includes('zone') ? `, winter zone after ${l.zone.at} days: max ${l.zone.limit} t aboard there` : ''}${l.bridge && lv.mechanics.includes('bridge') ? `, low bridge: at least ${l.bridge.min} t aboard` : ''}`));
  console.log('Boxes (id: from → to, weight, freight):');
  for (const b of lv.boxes) console.log(`  ${b.id}: ${lv.ports[b.from].code} → ${lv.ports[b.to].code}, ${b.weight} t, $${b.freight}${b.reefer && lv.mechanics.includes('reefer') ? ', REEFER' : ''}${b.contract ? ', CONTRACT (must sail)' : ''}`);
  console.log(`Stars: ★ $${lv.stars[0]} · ★★ $${lv.stars[1]} · ★★★ $${lv.stars[2]}`);
  console.log('Stacking: a box may not stand on a box that comes off earlier' + (lv.mechanics.includes('heavy') ? ', nor on a lighter box.' : '.'));
}

function tryPlan(lv: Level, plan: Call[]): void {
  let p = plan;
  if (lv.auto) p = autoBunker(lv, plan);
  const r = simulate(lv, p);
  const pr = r.projection;
  if (r.bounced.length) console.log('BOUNCED (illegal, removed):', JSON.stringify(r.bounced));
  pr.legs.forEach((l, i) => console.log(`leg ${i}: departs ${l.weight} t (band ${bandOf(lv.ship, l.weight)}), burns ${l.burn}, fuel ${l.fuelOut} → ${l.fuelIn}${lv.auto ? `, bunkered ${r.plan[i].bunker}` : ''}`));
  console.log(`freight $${pr.freight} − bunkers $${pr.fuelCost} = profit $${pr.profit}`);
  if (pr.problems.length) console.log('PROBLEMS:', pr.problems.map((x) => x.text).join(' | '));
  else console.log(`stars: ${starsFor(lv, pr.profit)} (can sail: ${pr.profit >= lv.stars[0] ? 'yes' : 'no, below ★'})`);
}

if (cmd === 'show') show(level);
else if (cmd === 'try') tryPlan(level, JSON.parse(planArg ?? '[]'));
else console.log('usage: show <n> | try <n> <plan json>');
