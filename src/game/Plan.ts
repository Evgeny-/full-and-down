import { clonePlan, emptyPlan, needAt, placeRefusal, simulate, starsFor, type SimResult } from '../core/rules';
import { autoBunker, ManifestTable } from '../core/solver';
import type { BoxId, Call, Level, Refusal } from '../core/types';

export interface PlanSnapshot {
  plan: Call[];
  port: number;
}

export type PlaceResult = { ok: true } | { ok: false; code: Refusal['code']; text: string };

/**
 * The player's passage plan: one call per port, edited in any order. Every edit re-simulates the
 * whole voyage; actions an earlier change made illegal bounce back to their quay.
 */
export class PlanModel {
  readonly level: Level;
  plan: Call[];
  /** the port call being edited (tab) */
  port = 0;
  sim!: SimResult;
  /** ports whose actions bounced on the last edit */
  bouncedPorts = new Set<number>();
  private undoStack: PlanSnapshot[] = [];
  private table: ManifestTable;

  constructor(level: Level, plan?: Call[]) {
    this.level = level;
    this.table = new ManifestTable(level);
    this.plan = plan ? clonePlan(plan) : emptyPlan(level);
    this.resim();
  }

  get calls(): number {
    return this.plan.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get profit(): number {
    return this.sim.projection.profit;
  }

  get stars(): number {
    return this.sim.projection.problems.length ? 0 : starsFor(this.level, this.profit);
  }

  /** Bays as they stand during the call at `port` (after discharge and this call's loads). */
  baysAt(port: number): BoxId[][] {
    const call = this.sim.projection.calls[port];
    const bays = call.bays.map((b) => b.slice());
    for (const ld of this.sim.plan[port]?.loads ?? []) bays[ld.bay].push(ld.box);
    return bays;
  }

  /** Boxes offered at `port` still on the quay. */
  quayAt(port: number): BoxId[] {
    const loaded = new Set(this.sim.plan[port]?.loads.map((l) => l.box) ?? []);
    return this.level.boxes.filter((b) => b.from === port && !loaded.has(b.id)).map((b) => b.id);
  }

  loadedHere(port: number): Set<BoxId> {
    return new Set(this.sim.plan[port]?.loads.map((l) => l.box) ?? []);
  }

  /** Where is this box during the call at `port`? */
  whereAt(port: number, box: BoxId): { at: 'ship'; bay: number; tier: number } | { at: 'quay' } | { at: 'gone' } {
    const bays = this.baysAt(port);
    for (let i = 0; i < bays.length; i++) {
      const t = bays[i].indexOf(box);
      if (t >= 0) return { at: 'ship', bay: i, tier: t };
    }
    if (this.level.boxes[box].from === port) return { at: 'quay' };
    return { at: 'gone' };
  }

  snapshot(): PlanSnapshot {
    return { plan: clonePlan(this.plan), port: this.port };
  }

  private push(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
  }

  undo(): PlanSnapshot | null {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.plan = s.plan;
    this.port = s.port;
    this.resim();
    return s;
  }

  reset(): void {
    this.push();
    this.plan = emptyPlan(this.level);
    this.port = 0;
    this.resim();
  }

  restore(plan: Call[]): void {
    this.push();
    this.plan = clonePlan(plan);
    this.resim();
  }

  select(port: number): void {
    this.port = Math.max(0, Math.min(this.calls - 1, port));
  }

  /** Can `box` (on this port's quay) go onto `bay` right now? */
  canPlace(box: BoxId, bay: number): PlaceResult {
    const lv = this.level;
    const b = lv.boxes[box];
    if (b.from !== this.port) return { ok: false, code: 'loadedEarlier', text: 'That box is not on this quay.' };
    const bays = this.baysAt(this.port);
    const code = placeRefusal(lv, bays[bay], bay, b);
    if (!code) return { ok: true };
    const top = bays[bay].length ? lv.boxes[bays[bay][bays[bay].length - 1]] : null;
    const name = (i: number) => lv.ports[i].name;
    const text: Record<string, string> = {
      bayFull: `MATE: that stack is full (${lv.ship.tiers} high).`,
      bury: top ? `MATE: it would bury the ${name(top.to)} box. Nothing goes on a box that leaves earlier.` : 'MATE: no.',
      heavy: top ? `MATE: ${b.weight} t can't stand on ${top.weight} t. Heavy goes below light.` : 'MATE: no.',
      plug: 'MATE: reefers need a plugged stack.',
    };
    return { ok: false, code, text: text[code] ?? 'MATE: not there.' };
  }

  place(box: BoxId, bay: number): PlaceResult {
    const r = this.canPlace(box, bay);
    if (!r.ok) return r;
    this.push();
    this.plan[this.port].loads.push({ box, bay });
    this.resim();
    return r;
  }

  /** Land a box loaded at this call (it must be on top of its stack). */
  unload(box: BoxId): boolean {
    const call = this.plan[this.port];
    const i = call.loads.findIndex((l) => l.box === box);
    if (i < 0) return false;
    const bays = this.baysAt(this.port);
    const bay = call.loads[i].bay;
    if (bays[bay][bays[bay].length - 1] !== box) return false;
    this.push();
    call.loads.splice(i, 1);
    this.resim();
    return true;
  }

  /** Change this port's bunkers by `delta` lots. Returns false if nothing changed. */
  bunker(delta: number, merge = false): boolean {
    const p = this.level.ports[this.port];
    if (p.price === null || this.level.auto) return false;
    const lot = p.lot ?? 1;
    const cur = this.sim.plan[this.port].bunker;
    const next = Math.max(0, cur + delta * lot);
    if (next === cur) return false;
    const before = this.snapshot();
    this.plan[this.port].bunker = next;
    this.resim();
    if (this.sim.plan[this.port].bunker === cur) {
      this.plan = before.plan;
      this.resim();
      return false;
    }
    if (!merge) this.undoStack.push(before);
    return true;
  }

  /** Set this port's bunkers to just enough for the next leg. */
  need(): number | null {
    if (this.level.auto) return null;
    const n = needAt(this.level, this.plan, this.port);
    if (n === null) return null;
    if (n === this.sim.plan[this.port].bunker) return n;
    this.push();
    this.plan[this.port].bunker = n;
    this.resim();
    return n;
  }

  /** Cheapest safe plan for the current cargo (World 1's automatic valve). */
  private applyAuto(): void {
    if (!this.level.auto) return;
    this.plan = autoBunker(this.level, this.plan, this.table);
  }

  resim(): void {
    // drop bounced actions from the stored plan so they don't come back by surprise
    this.applyAuto();
    const sim = simulate(this.level, this.plan);
    this.bouncedPorts = new Set(sim.bounced.filter((b) => b.box !== undefined).map((b) => b.port));
    this.plan = clonePlan(sim.plan);
    this.sim = sim;
  }

  /** Why SAIL is refused, in the voice of whoever would stop her (null = clear to sail). */
  sailRefusal(): Refusal | null {
    const pr = this.sim.projection;
    if (pr.problems.length) return pr.problems[0];
    if (pr.profit < this.level.stars[0]) {
      return { who: 'office', code: 'stars', port: 0, amount: this.level.stars[0] - pr.profit, text: `OFFICE: the charter needs $${this.level.stars[0]}. This plan makes ${pr.profit < 0 ? '−$' + -pr.profit : '$' + pr.profit}.` };
    }
    return null;
  }
}
