// Which world ports have no nation (flag) yet? usage: bun scripts/check-nations.ts
import { AREA_PORTS } from '../src/core/ports';
import { nationOfPort } from '../src/render/nations';
import { PORT_TABLE, norm } from '../src/render/ports/registry';
import '../src/render/ports/table';
for (const [i, list] of AREA_PORTS.entries()) {
  const out = list.map((p) => `${p.name}:${nationOfPort(p.name) ?? '??'}${PORT_TABLE[norm(p.name)] ? '' : '*'}`);
  console.log(i, out.join('  '));
}
