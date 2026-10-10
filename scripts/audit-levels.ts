/**
 * Audits the campaign in src/data/levels.json and writes docs/difficulty.md.
 *
 * - re-solves every level with the exact solver: V* must equal ★★★;
 * - replays every stored `best` plan through simulate(): no problems, nothing bounced, profit = ★★★;
 * - re-measures the deterministic metrics (natural starts, decoys, ω, exchange depth) and checks
 *   them against the stored stats (a mismatch means the rules changed since the build: rebuild);
 * - checks the stars (increasing, separated by ≥ 2 outside lesson levels, ★ above every instinctive
 *   plan from L2 on), the number palette, and that no mechanic appears before its intro;
 * - writes per-area tables and the DI curve.
 *
 *   bun scripts/audit-levels.ts [levels=src/data/levels.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { measure } from '../src/core/metrics';
import { AREAS, CAMPAIGN_LEVELS, checkPalette, INTRO_AT, isLesson, LADDER, rowOf } from '../src/core/progression';
import { simulate } from '../src/core/rules';
import { solve } from '../src/core/solver';
import type { Level, Mechanic } from '../src/core/types';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const FILE = process.argv[2] ?? join(ROOT, 'src/data/levels.json');
const DOC = join(ROOT, 'docs/difficulty.md');
if (!existsSync(FILE)) throw new Error(`${FILE} is missing: run bun scripts/build-levels.ts`);
const levels: Level[] = JSON.parse(readFileSync(FILE, 'utf8'));

const problems: string[] = [];
const warn: string[] = [];
const t0 = performance.now();

if (levels.length !== CAMPAIGN_LEVELS) problems.push(`${levels.length} levels, expected ${CAMPAIGN_LEVELS}`);
levels.forEach((l, i) => {
  if (l.n !== i + 1) problems.push(`level at index ${i} is L${l.n}`);
});

// mechanics: none before its intro, and each intro level is the first to carry it
const firstSeen = new Map<Mechanic, number>();
for (const l of levels) for (const m of l.mechanics) if (!firstSeen.has(m)) firstSeen.set(m, l.n);
for (const [m, n] of Object.entries(INTRO_AT) as [Mechanic, number][]) {
  const seen = firstSeen.get(m);
  if (seen !== undefined && seen < n) problems.push(`${m} appears at L${seen}, before its intro at L${n}`);
  const introLevel = levels.find((l) => l.n === n);
  if (introLevel && introLevel.intro !== m) problems.push(`L${n} should introduce ${m}`);
}

for (const l of levels) {
  const row = rowOf(l.n);
  for (const p of checkPalette(l)) problems.push(p);
  if (l.band !== row.band) problems.push(`L${l.n}: band ${l.band} ≠ ladder ${row.band}`);
  if (l.mechanics.join() !== row.mechanics.join()) problems.push(`L${l.n}: mechanics differ from the ladder`);
  const [T1, T2, T3] = l.stars;
  const lesson = isLesson(l.band);
  if (!(T1 <= T2 && T2 <= T3)) problems.push(`L${l.n}: stars ${l.stars} not increasing`);
  if (!lesson && !(T1 < T2 && T2 < T3)) problems.push(`L${l.n}: stars ${l.stars} not strictly increasing`);
  if (!lesson && (T2 - T1 < 2 || T3 - T2 < 2)) warn.push(`L${l.n}: stars ${l.stars} closer than 2`);
  const s = solve(l);
  if (!s) {
    problems.push(`L${l.n}: no plan can sail`);
    continue;
  }
  if (s.value !== T3) problems.push(`L${l.n}: solver V* ${s.value} ≠ ★★★ ${T3}`);
  if (!l.best) problems.push(`L${l.n}: no best plan`);
  else {
    const sim = simulate(l, l.best);
    if (sim.projection.problems.length) problems.push(`L${l.n}: best plan has problems: ${sim.projection.problems.map((p) => p.text).join(' ')}`);
    if (sim.bounced.length) problems.push(`L${l.n}: best plan bounces ${sim.bounced.length} action(s)`);
    if (sim.projection.profit !== T3) problems.push(`L${l.n}: best plan earns ${sim.projection.profit}, ★★★ is ${T3}`);
  }
  // deterministic metrics must match the build
  const m = measure(l, { strongRuns: 8, carefulRandom: 0, tinkerRuns: 0, seed: 1, ablate: [] });
  const st = l.stats ?? {};
  if (!m) continue;
  if (m.vstar !== st.vstar) problems.push(`L${l.n}: V* ${m.vstar} ≠ stored ${st.vstar}`);
  if (m.greedyBest !== st.greedy) problems.push(`L${l.n}: best natural start ${m.greedyBest} ≠ stored ${st.greedy}`);
  if (m.omega !== st.omega || m.decoys !== st.decoys || m.depth !== st.depth) problems.push(`L${l.n}: ω/decoys/X re-measured ${m.omega}/${m.decoys}/${m.depth} ≠ stored ${st.omega}/${st.decoys}/${st.depth}`);
  if (l.n >= 2 && !(T1 > m.greedyBest)) problems.push(`L${l.n}: ★ ${T1} does not beat the instinctive plan (${m.greedyBest})`);
  if (!m.naturals.some((p) => p.legal)) problems.push(`L${l.n}: no natural start sails (★ has no instinctive plan to beat)`);
  if (l.format === 'exact' && !(m.onMark && m.onReserve && m.omega === 1)) warn.push(`L${l.n}: Full & Down is not an exact fit (mark ${m.onMark}, reserve ${m.onReserve}, ω ${m.omega})`);
  if (typeof st.off === 'number' && st.off > 0) warn.push(`L${l.n} off target ${st.off}: ${st.misses}`);
}

// ---------------------------------------------------------------------------------------------
// docs/difficulty.md

const num = (x: unknown) => (typeof x === 'number' ? x : NaN);
const pct = (x: unknown) => (typeof x === 'number' && x >= 0 ? `${Math.round(100 * x)}` : '–');
const MECH_SHORT: Record<Mechanic, string> = {
  weight: 'wt',
  bands: 'bd',
  calls: 'ca',
  pickup: 'pu',
  noPump: 'dry',
  tiers: 'st',
  bar: 'bar',
  prices: '$',
  lot: 'lot',
  heavy: 'hv',
  reefer: 'rf',
  contract: 'ct',
  zone: 'zn',
  bridge: 'br',
};

function mechCell(l: Level): string {
  return l.mechanics
    .map((m) => {
      const d = num(l.stats?.['abl_' + m]);
      const s = MECH_SHORT[m];
      const tag = m === l.intro ? `**${s}**` : s;
      return Number.isNaN(d) ? tag : d > 0 ? tag : `${tag}°`;
    })
    .join(' ');
}

const lines: string[] = [];
lines.push('# Difficulty: how the campaign is measured');
lines.push('');
lines.push('Generated by `bun scripts/audit-levels.ts` from `src/data/levels.json` (built by `bun scripts/build-levels.ts`).');
lines.push('Do not edit by hand.');
lines.push('');
lines.push('## The players');
lines.push('');
lines.push('- **Natural starts** (`src/core/players.ts`) play the voyage port by port through `simulate()`, as a person');
lines.push('  does with the live projection, and skip a box when the projection turns red: greedy by freight, greedy by');
lines.push('  freight per tonne, fill-the-tank-first (buy a full tank at the first pump), and a myopic player that picks');
lines.push("  each call's load against that call's stem only (multi-port levels). Bunkers: the Chief's cheapest safe plan on");
lines.push('  AUTO levels (World 1), otherwise NEED at every pump (enough to reach the next pump on the reserve — the');
lines.push('  "gas station" habit, the trap at dry ports and price spreads). Boxes go on the stack that keeps the most');
lines.push('  later boxes placeable.');
lines.push('- **Strong editor**: 64 games, each from a natural start (density 40%, freight 30%, tank 15%, myopic 15%; half');
lines.push('  of them with ±18% jitter on the preferences), best improvement on the manifest landscape (exact values:');
lines.push('  freight − the cheapest bunker plan, stowage checked) over add / drop / 1↔1 / 2↔1 / 1↔2, 5% slips, at most 20');
lines.push("  edits. On levels with a manual valve (World 2 on) half of the runs value a load with NEED bunkers instead of the");
lines.push("  cheapest plan (critic 21's gas-station fuel): they never think of carrying cheap fuel or stemming past a dry port");
lines.push("  beyond what NEED asks. A strong human's first session.");
lines.push('- **Careful editor**: 3-exchange best improvement from every natural start and 6 random maximal loads, no slips.');
lines.push('  The fairness check.');
lines.push("- **Random tinkerer** (critic 20's gate): 40 random legal edits on the plan from an empty ship (add a box on a");
lines.push('  random legal stack, land one, move one, bunkers ± a lot, NEED), keeping every edit that does not lower the');
lines.push('  score (an unsafe plan scores below every safe one). 200 runs.');
lines.push('');
lines.push('## The numbers');
lines.push('');
lines.push('- **V\\*** — the exact optimum (`src/core/solver.ts`), = ★★★. **ω** — optimal manifests, identical boxes merged.');
lines.push('- **Stars** — ★ = the best natural start + 1 (the instinctive plan never passes from L2 on); ★★ = the best decoy + 1');
lines.push('  if that is above ★, else the midpoint; ★★★ = V\\*. Each at least 2 above the one below where the range allows;');
lines.push('  on lesson levels (T0, B1, B2) ★ and ★★ (or all three) may coincide.');
lines.push('- **Greedy** — the best natural start; **gap** = 1 − greedy / V\\*.');
lines.push('- **X** — exchange depth: the smallest k whose k-exchange climb (k boxes out and k in per edit) from at least half');
lines.push('  of the natural starts reaches V\\* (4 = none up to 3).');
lines.push('- **Decoys** — 1-exchange local optima worth ≥ 90% of V\\* (every single add, drop or swap makes it worse).');
lines.push('- **S★ / S★★★** — share of strong runs reaching ★ / ★★★; **C★★★** — share of careful runs reaching ★★★;');
lines.push('  **T★ / T★★★** — share of tinkerer runs reaching ★ / ★★★ (gate on B3+: ≤ 50% / ≤ 10%).');
lines.push('- **DI** = 40(1 − S★) + 30(1 − S★★★) + 30(1 − C★★★): 0 = trivial, 100 = nobody wins.');
lines.push('- **Mechanics** — wt fuel weighs, bd bands, ca calls, pu pickups, dry no-pump port, st stacks (never bury), bar');
lines.push('  harbour bar, $ price spread, lot barge lots, hv heavy below light, rf reefers, ct contract, zn winter zone,');
lines.push('  br bridge. **Bold** = introduced here; ° = the ablation found no change in V\\* (the rule is present but idle).');
lines.push('');
lines.push('Bands (docs/design-process/13 §2.3): B1 breather (exact fit), B2 intro, B3 normal, B4 normal-high, B5 spike, B6 boss;');
lines.push('targets slide from area 1 to area 8 (`src/core/targets.ts`).');
lines.push('');

lines.push('## DI curve');
lines.push('');
lines.push('```');
for (let a = 0; a < AREAS.length; a++) {
  const ls = levels.filter((l) => l.chapter === a + 1);
  lines.push(`${AREAS[a].name.padEnd(15)} ${ls.map((l) => String(l.stats?.di ?? '?').padStart(3)).join(' ')}`);
}
lines.push('```');
lines.push('');

lines.push('## By band');
lines.push('');
lines.push('| Band | Levels | mean DI | mean S★ | mean S★★★ | mean C★★★ | mean X | mean decoys | mean T★ / T★★★ |');
lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const band of ['T0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6']) {
  const ls = levels.filter((l) => l.band === band);
  if (!ls.length) continue;
  const mean = (k: string) => ls.reduce((s, l) => s + num(l.stats?.[k]), 0) / ls.length;
  lines.push(
    `| ${band} | ${ls.length} | ${mean('di').toFixed(0)} | ${pct(mean('s1'))} | ${pct(mean('s3'))} | ${pct(mean('c3'))} | ${mean('depth').toFixed(1)} | ${mean('decoys').toFixed(1)} | ${pct(mean('t1'))} / ${pct(mean('t3'))} |`,
  );
}
lines.push('');

for (let a = 0; a < AREAS.length; a++) {
  const ls = levels.filter((l) => l.chapter === a + 1);
  lines.push(`## ${a + 1}. ${AREAS[a].name}`);
  lines.push('');
  lines.push(`*${AREAS[a].blurb}*`);
  lines.push('');
  lines.push('| # | Title | Band | Ship · ports · boxes | Mechanics | V\\* | ★ / ★★ / ★★★ | Greedy | Gap | X | Decoys | ω | S★ / S★★★ / C★★★ | T★ / T★★★ | DI |');
  lines.push('|---:|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---|---|---:|');
  for (const l of ls) {
    const s = l.stats ?? {};
    lines.push(
      `| ${l.n} | ${l.title}${l.format === 'exact' ? ' (exact)' : l.format === 'contract' ? ' (contract)' : ''} | ${l.band} | ${l.ship.bays}×${l.ship.tiers}, C${l.ship.capacity} · ${l.ports.length} · ${l.boxes.length} | ${mechCell(l)} | ${s.vstar} | ${l.stars.join(' / ')} | ${s.greedy} | ${pct(s.gap)}% | ${s.depth} | ${s.decoys} | ${s.omega} | ${pct(s.s1)} / ${pct(s.s3)} / ${pct(s.c3)} | ${pct(s.t1)} / ${pct(s.t3)} | ${s.di} |`,
    );
  }
  lines.push('');
  lines.push('Logbook lines:');
  lines.push('');
  for (const l of ls) lines.push(`- **${l.n} ${l.title}** — ${l.logbook ?? ''}`);
  lines.push('');
}

const offs = levels.filter((l) => num(l.stats?.off) > 0);
lines.push('## Off target');
lines.push('');
if (!offs.length) lines.push('Every generated level is inside its band.');
else {
  lines.push('Levels whose holdout measurement misses part of its band (the build keeps the closest draft):');
  lines.push('');
  for (const l of offs) lines.push(`- L${l.n} ${l.title} (${l.band}${l.stats?.authored ? ', authored' : ''}): ${l.stats?.misses}`);
}
lines.push('');
lines.push(`Ladder: ${LADDER.length} rows; levels file: ${levels.length}. Audit: ${problems.length} problem(s), ${warn.length} warning(s).`);
lines.push('');

writeFileSync(DOC, lines.join('\n'));
for (const w of warn) console.log('warn: ' + w);
for (const p of problems) console.log('PROBLEM: ' + p);
console.log(`audited ${levels.length} levels in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${problems.length} problem(s), ${warn.length} warning(s); wrote ${DOC}`);
if (problems.length) process.exit(1);
