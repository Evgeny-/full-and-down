/**
 * Full & Down — the rules contract. Pure data, shared by the simulation, the solver, the
 * generator, the tests and the view.
 *
 * A level is a voyage: ports in rotation order, a leg between each pair. The player plans one
 * call per port (except the last): which offered boxes to load and on which bay, and how many
 * tonnes of bunkers to buy. Then the ship sails the whole plan.
 */

export type PortIx = number;
export type BoxId = number;

/** Weight aboard ≤ upTo burns `rate` tonnes of fuel per sea day (LIGHT / LADEN / DEEP). */
export interface Band {
  upTo: number;
  rate: number;
}

export interface Ship {
  name: string;
  /** deadweight: cargo + bunkers may not exceed it at departure ("her marks") */
  capacity: number;
  /** bunker tank capacity (tonnes) */
  tank: number;
  bays: number;
  tiers: number;
  /** ascending; the last band's upTo is the capacity */
  bands: Band[];
  /** bays with reefer plugs (every tier in them is powered) */
  plugs?: number[];
}

export interface Port {
  name: string;
  /** three-letter port code shown on tabs, boxes and the strip */
  code: string;
  /** International Code of Signals letter (never B, P, Q or V: those mean things) */
  flag: string;
  /** bunker price per tonne; null = no bunkers here */
  price: number | null;
  /** bunkers are sold in lots of this many tonnes (minimum stem); default 1 */
  lot?: number;
  /** harbour bar: weight aboard may not exceed this while in this port (arrival and departure) */
  bar?: number;
}

export interface Box {
  id: BoxId;
  from: PortIx;
  to: PortIx;
  weight: number;
  freight: number;
  reefer?: boolean;
  /** contract cargo: must be shipped */
  contract?: boolean;
}

export type Mechanic =
  | 'weight' // fuel and cargo share the deadweight
  | 'bands' // heavier ship burns more
  | 'calls' // more than one port: discharge midway
  | 'pickup' // cargo offered at intermediate ports
  | 'prices' // two pumps, two prices
  | 'noPump' // a port without bunkers
  | 'tiers' // stacks two or three high, restows
  | 'heavy' // a box may not stand on a lighter box
  | 'bar' // harbour bar: max weight in port
  | 'contract' // contract boxes must sail
  | 'reefer' // reefers need plugs and burn extra
  | 'lot' // bunkers sold in lots
  | 'zone' // winter load-line zone on a leg
  | 'bridge'; // air draft: a minimum weight to pass under a bridge

export interface Leg {
  days: number;
  /**
   * Winter zone: after `at` days of this leg the ship crosses into the winter zone, where the
   * weight aboard may not exceed `limit`.
   */
  zone?: { at: number; limit: number };
  /** a low bridge on this leg: the ship must weigh at least `min` when she passes under it (at departure) */
  bridge?: { min: number };
}

/** One port call in the player's plan. */
export interface Call {
  /** boxes loaded at this call, in push order */
  loads: { box: BoxId; bay: number }[];
  /** tonnes of bunkers bought here */
  bunker: number;
}

export interface Level {
  n: number;
  chapter: number;
  title: string;
  /** difficulty band label (T0 tutorial … B6 boss) */
  band: string;
  ship: Ship;
  ports: Port[];
  legs: Leg[];
  boxes: Box[];
  /** bunkers aboard at the start (free) */
  startFuel: number;
  /** MIN ROB: arrive at every port with at least this much */
  reserve: number;
  /** restow fee (unused while overstows are refused; kept for the solver's generality) */
  restowFee: number;
  /** bunkers are planned automatically (the cheapest safe plan for the cargo) */
  auto?: boolean;
  /** profit thresholds: ★ (pass), ★★, ★★★ (the optimum) */
  stars: [number, number, number];
  mechanics: Mechanic[];
  /** the mechanic this level introduces (shows a Notice to Mariners) */
  intro?: Mechanic;
  /** spot: choose from the offers; contract: sealed boxes must sail; exact: the Full & Down exact fit */
  format?: 'spot' | 'contract' | 'exact';
  /** one optimal plan */
  best?: Call[];
  /** names the trap, shown after ★★★ */
  logbook?: string;
  stats?: Record<string, number | string>;
}

/** Why an action or the whole plan is refused, in the voice of who would stop you. */
export interface Refusal {
  who: 'chief' | 'mate' | 'pilot' | 'office' | 'harbour';
  code:
    | 'bayFull'
    | 'notTop'
    | 'bury'
    | 'heavy'
    | 'plug'
    | 'contract'
    | 'overMarks'
    | 'bar'
    | 'barAhead'
    | 'short'
    | 'tankFull'
    | 'noPump'
    | 'zone'
    | 'bridge'
    | 'stars'
    | 'loadedEarlier';
  /** the port where it happens */
  port: PortIx;
  /** tonnes over/short, when it applies */
  amount?: number;
  text: string;
}

/** The state of the ship at a port, after discharge and before/after this call's actions. */
export interface CallState {
  port: PortIx;
  /** bottom → top */
  bays: BoxId[][];
  /** boxes discharged here (delivered) */
  delivered: BoxId[];
  /** boxes lifted and put back (restows) here */
  restowed: BoxId[];
  /** fuel on arrival (before buying) */
  arrivalFuel: number;
  /** weight aboard on arrival (after discharge) */
  arrivalWeight: number;
}

export interface LegResult {
  /** weight aboard at departure (cargo + fuel) */
  weight: number;
  band: number;
  burn: number;
  /** fuel at departure, at arrival */
  fuelOut: number;
  fuelIn: number;
  /** reefers aboard on this leg */
  reefers: number;
}

/** A plan fully simulated: what the strip, the dwt bar and the result card read. */
export interface Projection {
  calls: CallState[];
  legs: LegResult[];
  freight: number;
  fuelCost: number;
  restowCost: number;
  profit: number;
  /** the first problem in the plan, if any */
  problems: Refusal[];
  /** remarks for the arrival report */
  onMark: boolean[];
  restows: number;
  finalRob: number;
}
