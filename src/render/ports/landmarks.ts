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

interface Group {
  LANDMARKS: Record<string, Landmark>;
  PORTS: Array<[string, RegionId, string?]>;
}

/** One module per area, each exporting its landmarks and the port rows that use them. */
export const GROUPS: Group[] = [nlde, benl, de, uk, fr, iberia, italy, africa, nordic, arctic];

/** Landmark id → builder. */
export const LANDMARKS: Record<string, Landmark> = Object.assign({}, ...GROUPS.map((g) => g.LANDMARKS));
