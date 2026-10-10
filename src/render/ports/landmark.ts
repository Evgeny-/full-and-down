import type { PortKit } from './kit';
import type { LighthouseOpts, MoleOpts } from './harbour';

/**
 * A recognisable landmark for a port. `terrain` runs first (raise a hill, flatten a site, repaint cliffs),
 * then `build` places structures on the finished ground. Everything is built with the kit's parts, so it
 * merges into the scene's few draw calls.
 */
export interface Landmark {
  terrain?(k: PortKit): void;
  build(k: PortKit): void;
  /** the breakwater: default (with a lighthouse), or customised, or none at all */
  mole?: 'none' | (Partial<MoleOpts> & { light?: LighthouseOpts | false });
  /** fewer / no town rows (the landmark brings its own surroundings) */
  rows?: number;
  /** skip the region's set pieces (church, windmills) which would compete with the landmark */
  quiet?: boolean;
  /** where the flagpole goes if not on the breakwater: x offset from the view centre, z, and y of its foot */
  flag?: { dx: number; z: number; y?: number };
  /** where the town is centred / which side it favours (dx from the view centre) */
  townShift?: number;
}
