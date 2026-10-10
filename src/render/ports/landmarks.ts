import type { Landmark } from './landmark';
import type { RegionId } from './regions';
import * as nlde from './landmarks/nlde';
import * as benl from './landmarks/benl';
import * as de from './landmarks/de';
import * as uk from './landmarks/uk';
import * as fr from './landmarks/fr';
import * as iberia from './landmarks/iberia';
import * as italy from './landmarks/italy';
import * as africa from './landmarks/africa';
import * as nordic from './landmarks/nordic';
import * as arctic from './landmarks/arctic';
import * as baltic from './landmarks/baltic';
import * as blacksea from './landmarks/blacksea';
import * as gulf from './landmarks/gulf';
import * as asia from './landmarks/asia';
import * as latam from './landmarks/latam';
import * as pacific from './landmarks/pacific';
import { REGIONS } from './regions';

interface Group {
  LANDMARKS: Record<string, Landmark>;
  PORTS: Array<[string, RegionId, string?]>;
  /** a world module brings its own regional looks */
  REGIONS?: Partial<Record<RegionId, import('./regions').Region>>;
}

/** One module per area, each exporting its landmarks and the port rows that use them. */
export const GROUPS: Group[] = [nlde, benl, de, uk, fr, iberia, italy, africa, nordic, arctic, baltic, blacksea, gulf, asia, latam, pacific];

for (const g of GROUPS) if (g.REGIONS) Object.assign(REGIONS, g.REGIONS);

/** Landmark id → builder. */
export const LANDMARKS: Record<string, Landmark> = Object.assign({}, ...GROUPS.map((g) => g.LANDMARKS));
