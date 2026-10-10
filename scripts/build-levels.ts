/**
 * Builds the campaign (72 levels, src/core/progression.ts) into src/data/levels.json.
 *
 * Each ladder row is either authored (src/core/authored.ts: measured like any other level) or
 * generated: drafts hill-climbed toward the row's band (src/core/generator.ts, targets.ts), then
 * measured again with fresh seeds (holdout) for the stored stats and stars.
 *
 *   bun scripts/build-levels.ts                 build all 72 (finished levels come from the checkpoint)
 *   LEVELS=1-20 bun scripts/build-levels.ts     (re)build a range (also LEVELS=5,9,30-36); others are kept from levels.json
 *   JOBS=8                                      parallel workers (child processes; default: CPU count)
 *   FRESH=1                                     ignore the checkpoint (.cache/levels/), rebuild everything selected
 *   SALT=2                                      different seeds (LEVEL_SALTS below records the ones kept)
 *   ATTEMPTS=12 ITERS=800                       drafts per seed and climb steps per draft
 *   RETRIES=4                                   seeds tried while a level breaks a hard rule (generator.ts hardProblems)
 *
 * Checkpoint: every finished level is written to .cache/levels/L<n>.json with a key (the source of
 * the core modules + the options). A rerun with the same code reuses it, so an interrupted build
 * resumes where it stopped.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { authoredLevel } from '../src/core/authored';
import { finalize, generate, hardProblems } from '../src/core/generator';
import { FULL, measure, statsRecord } from '../src/core/metrics';
import { CAMPAIGN_LEVELS, rowOf, type LadderRow } from '../src/core/progression';
import { hashString } from '../src/core/rng';
import { simulate } from '../src/core/rules';
import { shortfall, targetFor } from '../src/core/targets';
import type { Level } from '../src/core/types';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const OUT = join(ROOT, 'src/data/levels.json');
const CACHE = join(ROOT, '.cache/levels');
/**
 * Per-level seeds chosen after a build (a re-roll that landed closer to its band); SALT= overrides
 * them for the levels being built.
 */
const LEVEL_SALTS: Record<number, string> = { 17: 'r2', 21: 'r1', 44: 'r1', 57: 'r1', 58: 'r1', 59: 'r2', 63: 'r1' };
const saltOf = (n: number) => process.env.SALT ?? LEVEL_SALTS[n] ?? '';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 12);
const ITERS = Number(process.env.ITERS ?? 800);
const JOBS = Math.max(1, Number(process.env.JOBS ?? cpus().length));
/** seeds tried per level when the result breaks a hard rule */
const RETRIES = Number(process.env.RETRIES ?? 4);

interface Built {
  key: string;
  n: number;
  level: Level;
  ms: number;
  off: number;
  misses: string;
}

function parseRange(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let n = a; n <= (b || a); n++) out.add(n);
  }
  return [...out].filter((n) => n >= 1 && n <= CAMPAIGN_LEVELS).sort((x, y) => x - y);
}

/** The checkpoint key: the core sources and the build options. */
function keyFor(n: number): string {
  const h = createHash('sha1');
  for (const f of ['rules', 'solver', 'types', 'players', 'metrics', 'targets', 'generator', 'progression', 'authored', 'ports', 'rng']) {
    h.update(readFileSync(join(ROOT, `src/core/${f}.ts`)));
  }
  h.update(JSON.stringify({ n, salt: saltOf(n), ATTEMPTS, ITERS, RETRIES }));
  return h.digest('hex').slice(0, 16);
}

/** Build one level (in a worker). */
function buildOne(n: number): Built {
  const t0 = performance.now();
  const key = keyFor(n);
  const row = rowOf(n);
  const SALT = saltOf(n);
  const seed = hashString(`full-and-down:${n}${SALT ? ':' + SALT : ''}`);
  const a = authoredLevel(n);
  let level: Level;
  let off = 0;
  let misses = '';
  if (a) {
    const L: Level = JSON.parse(JSON.stringify(a.level));
    const m = measure(L, { ...FULL, seed: seed ^ 0x2545f491, baseline: 'instinct' })!;
    const short = shortfall(m, targetFor(row));
    L.stars = a.stars ?? m.stars;
    L.best = m.best;
    L.logbook = a.logbook;
    L.title = row.title;
    L.stats = statsRecord(m, { off: Math.round(short.total * 100) / 100, misses: short.misses.join('; '), authored: 1 });
    level = L;
    off = short.total;
    misses = short.misses.join('; ');
  } else {
    // a level that breaks a hard rule (stars, the instinctive plan passing, the exact fit…) is
    // regenerated from other seeds; the best of the valid ones is kept
    let best: { level: Level; off: number; misses: string; hard: string[] } | null = null;
    for (let k = 0; k < RETRIES && !(best && !best.hard.length); k++) {
      const s = k ? hashString(`full-and-down:${n}${SALT ? ':' + SALT : ''}:retry${k}`) : seed;
      const res = generate(row, s, { attempts: ATTEMPTS, iters: ITERS });
      if (!res) continue;
      const f = finalize(res.level, row, s);
      const hard = hardProblems(f.level, f.metrics);
      if (!f.metrics.naturals.some((p) => p.legal)) hard.push('no natural start sails');
      const cand = { level: f.level, off: f.short.total, misses: f.short.misses.join('; '), hard };
      if (!best || hard.length < best.hard.length || (hard.length === best.hard.length && cand.off < best.off)) best = cand;
    }
    if (!best) throw new Error(`level ${n}: generation failed`);
    if (best.hard.length) console.error(`L${n}: still breaks ${best.hard.join(', ')}`);
    level = best.level;
    off = best.off;
    misses = best.misses;
  }
  // the stored optimum must replay to ★★★ exactly
  const sim = simulate(level, level.best!);
  if (sim.projection.problems.length || sim.bounced.length || sim.projection.profit !== level.stars[2]) {
    throw new Error(`level ${n}: best plan does not replay (${sim.projection.profit} vs ${level.stars[2]})`);
  }
  return { key, n, level, ms: performance.now() - t0, off, misses };
}

const pct = (x: unknown) => (typeof x === 'number' ? String(Math.round(100 * x)).padStart(3) : '  -');

function line(b: Built, row: LadderRow): string {
  const L = b.level;
  const s = L.stats!;
  return [
    String(L.n).padStart(2),
    `${row.area + 1}.${row.local}`,
    L.band.padEnd(2),
    L.title.slice(0, 20).padEnd(20),
    `${L.boxes.length}bx ${L.ports.length}p ${L.ship.bays}x${L.ship.tiers}`.padEnd(13),
    `V*${String(s.vstar).padStart(3)}`,
    `★${L.stars.join('/')}`.padEnd(12),
    `g${String(s.greedy).padStart(3)}`,
    `X${s.depth}`,
    `d${String(s.decoys).padStart(2)}`,
    `ω${s.omega}`,
    `S${pct(s.s1)}/${pct(s.s3)} C${pct(s.c3)} T${pct(s.t1)}/${pct(s.t3)}`,
    `DI${String(s.di).padStart(3)}`,
    b.off > 0 ? `OFF ${b.off.toFixed(2)} [${b.misses}]` : 'ok',
    `${(b.ms / 1000).toFixed(1)}s`,
  ].join(' ');
}

// ---------------------------------------------------------------------------------------------

if (process.argv[2] === '--worker') {
  const n = Number(process.argv[3]);
  const b = buildOne(n);
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `L${n}.json`);
  writeFileSync(file + '.tmp', JSON.stringify(b));
  renameSync(file + '.tmp', file);
  process.exit(0);
}

const selected = process.env.LEVELS ? parseRange(process.env.LEVELS) : [...Array(CAMPAIGN_LEVELS).keys()].map((i) => i + 1);
const stored: Level[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
const levels = new Map<number, Level>();
for (const l of stored) if (!selected.includes(l.n)) levels.set(l.n, l);

const results = new Map<number, Built>();
const readCache = (n: number): Built | null => {
  const file = join(CACHE, `L${n}.json`);
  if (!existsSync(file)) return null;
  const b: Built = JSON.parse(readFileSync(file, 'utf8'));
  return b.key === keyFor(n) ? b : null;
};
const fromCache = (n: number): Built | null => (process.env.FRESH === '1' ? null : readCache(n));

function save(): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const all = [...levels.values()].sort((a, b) => a.n - b.n);
  writeFileSync(OUT + '.tmp', '[\n' + all.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
  renameSync(OUT + '.tmp', OUT);
}

const t0 = performance.now();
const todo: number[] = [];
for (const n of selected) {
  const c = fromCache(n);
  if (c) {
    results.set(n, c);
    levels.set(n, c.level);
    console.log(line(c, rowOf(n)) + ' (checkpoint)');
  } else todo.push(n);
}
// the slowest rows first, so the workers finish together
const cost: Record<string, number> = { B6: 6, B5: 5, B4: 4, B3: 3, B2: 2, B1: 1, T0: 0 };
todo.sort((a, b) => cost[rowOf(b).band] - cost[rowOf(a).band] || a - b);
console.log(`building ${todo.length} level(s) with ${Math.min(JOBS, todo.length)} worker(s), ${ATTEMPTS} drafts × ${ITERS} steps`);

let failed = 0;
async function worker(): Promise<void> {
  while (todo.length) {
    const n = todo.shift()!;
    const code = await new Promise<number>((resolve) => {
      const proc = spawn(process.execPath, [new URL(import.meta.url).pathname, '--worker', String(n)], { stdio: 'inherit', env: process.env });
      proc.on('exit', (c) => resolve(c ?? 1));
    });
    const b = code === 0 ? readCache(n) : null;
    if (!b) {
      failed++;
      console.log(`L${n}: worker failed (exit ${code})`);
      continue;
    }
    results.set(n, b);
    levels.set(n, b.level);
    save();
    console.log(line(b, rowOf(n)));
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, Math.max(1, todo.length)) }, worker));
save();

const built = [...results.values()].sort((a, b) => a.n - b.n);
const offs = built.filter((b) => b.off > 0);
console.log(`\nwrote ${levels.size} levels to ${OUT} in ${((performance.now() - t0) / 1000).toFixed(1)}s` + (failed ? `, ${failed} FAILED` : ''));
console.log(`DI: ${built.map((b) => b.level.stats!.di).join(' ')}`);
if (offs.length) console.log(`off target (${offs.length}): ${offs.map((b) => `L${b.n} ${b.off.toFixed(2)}`).join(', ')}`);
if (failed) process.exit(1);
