/**
 * Give every level of src/data/levels.json its real ports, countries and ship
 * (src/core/naming.ts). The puzzles are untouched. build-levels.ts runs the same pass on save.
 * usage: bun scripts/name-levels.ts
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { nameLevel } from '../src/core/naming';
import type { Level } from '../src/core/types';

const OUT = join(dirname(new URL(import.meta.url).pathname), '..', 'src/data/levels.json');
const levels: Level[] = JSON.parse(readFileSync(OUT, 'utf8'));
const used = new Map<string, number>();
const named = levels.map((l) => nameLevel(l, used));
writeFileSync(OUT + '.tmp', '[\n' + named.map((l) => JSON.stringify(l)).join(',\n') + '\n]\n');
renameSync(OUT + '.tmp', OUT);
for (const l of named) console.log(l.n, l.title.padEnd(22), l.ship.name.padEnd(16), l.ports.map((p) => `${p.name}${p.bar !== undefined ? '[bar]' : ''}${p.price === null ? '' : '$' + p.price}`).join(' → '));
