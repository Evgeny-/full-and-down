// Verifies the level-12 numbers used in the mockups against the real rules (run with vite-node).
import levels from '../../../../src/data/levels.json';
import { simulate, needAt, bandOf } from '../../../../src/core/rules';
import type { Level, Call } from '../../../../src/core/types';

const all = (Array.isArray(levels) ? levels : (levels as any).levels) as Level[];
const lv = all.find((l) => l.n === 12)!;
const show = (label: string, plan: Call[], port = 0) => {
  const r = simulate(lv, plan);
  const pr = r.projection;
  console.log(`\n== ${label}`);
  pr.legs.forEach((l, i) => console.log(`leg ${lv.ports[i].code}->${lv.ports[i + 1].code}: weight ${l.weight} band ${bandOf(lv.ship, l.weight)} burn ${l.burn} fuelOut ${l.fuelOut} fuelIn ${l.fuelIn}`));
  console.log('arrival fuel', pr.calls.map((c) => `${lv.ports[c.port].code}:${c.arrivalFuel}`).join(' '));
  console.log('profit', pr.profit, 'freight', pr.freight, 'fuelCost', pr.fuelCost);
  console.log('problems', pr.problems.map((p) => `[port ${p.port}] ${p.text}`));
  console.log('legRefusal at port', port, pr.problems.find((x) => (x.port === port && x.code !== 'barAhead') || (x.code === 'barAhead' && x.port === port + 1))?.text ?? 'none -> SAIL enabled');
  console.log('needAt', port, needAt(lv, plan, port));
};
const empty = (): Call[] => [{ loads: [], bunker: 0 }, { loads: [], bunker: 0 }, { loads: [], bunker: 0 }];
let p = empty();
show('start', p);
p = empty(); p[0].loads.push({ box: 2, bay: 0 }); p[0].bunker = 4;
show('mid: 3t CPH box, +4 (5 aboard)', p);
p = empty(); p[0].loads.push({ box: 2, bay: 0 }); p[0].bunker = 5;
show('ready: 3t CPH box, +5 (6 aboard)', p);
p = empty(); p[0].loads.push({ box: 2, bay: 0 }); p[0].bunker = 7;
show('expert: 3t CPH box, +7 (8 aboard)', p);
// band-crossing example: 4t CPH box + 1 fuel... find a case where short != buy
for (const box of [0, 1, 2]) for (let b = 0; b <= 7; b++) {
  const q = empty(); q[0].loads.push({ box, bay: 0 }); q[0].bunker = b;
  const r = simulate(lv, q).projection;
  const need = needAt(lv, q, 0);
  const shortCPH = lv.reserve - r.calls[2].arrivalFuel;
  const shortLBC = lv.reserve - r.calls[1].arrivalFuel;
  if (need !== null && need - b !== Math.max(shortCPH, shortLBC) && need > b) console.log(`box ${box} (${lv.boxes[box].weight}t) bunker ${b}: short LBC ${shortLBC} CPH ${shortCPH}, buy ${need - b}`);
}

// held: the 4 t Copenhagen box over the ship as well (preview), 5 t aboard
p = empty(); p[0].loads.push({ box: 2, bay: 0 }, { box: 1, bay: 1 }); p[0].bunker = 4;
show('held preview: 3t + 4t CPH boxes, 5 aboard', p);
