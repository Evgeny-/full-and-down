import { GameView, type Anchors } from '../render/GameView';
import { loadFonts } from '../render/paint';
import { Hud } from '../ui/Hud';
import { h, button } from '../ui/dom';
import { glyph, starSvg } from '../ui/glyphs';
import { openDialog, initDialogs, toast, closeAllDialogs, dialogOpen, escapeHtml } from '../ui/dialogs';
import { MapScreen } from '../ui/MapScreen';
import { portColor as portColorOf } from '../render/portStyle';
import { audio } from '../audio/audio';
import { PlanModel } from '../game/Plan';
import { campaign } from './levels';
import { loadSave, writeSave, resetSave, unlockedUpTo, type SaveData } from './save';
import { NOTICES, COACH, type CoachStep } from './notices';
import { areaOf } from './areas';
import { starsFor } from '../core/rules';
import { maskOf, solve } from '../core/solver';
import { flagSvg, type FlagId } from '../render/flags';
import type { BoxId, Call, Level } from '../core/types';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

type Mode = 'map' | 'plan' | 'sailing' | 'report';

export class App {
  private save: SaveData = loadSave();
  private levels: Level[] = [];
  private stage = document.getElementById('stage')!;
  private ui = document.getElementById('ui')!;
  private view!: GameView;
  private hud: Hud | null = null;
  private map!: MapScreen;
  private model: PlanModel | null = null;
  private level: Level | null = null;
  private mode: Mode = 'map';
  private held: BoxId | null = null;
  private drag: { x: number; y: number; moved: boolean; box: BoxId } | null = null;
  private anchors: Anchors | null = null;
  private last = 0;
  private coach: { steps: CoachStep[]; i: number; el: HTMLElement } | null = null;
  private fast = false;
  private darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

  async init(): Promise<void> {
    initDialogs(this.ui);
    await loadFonts();
    this.levels = campaign();
    this.view = new GameView(this.stage);
    audio.setSfxVolume(this.save.settings.sfx);
    audio.setMusicVolume(this.save.settings.music);
    this.applyNight();
    this.darkQuery?.addEventListener('change', () => this.applyNight());
    this.map = new MapScreen(this.ui, {
      onPlay: (n) => this.play(n),
      onSettings: () => this.openSettings(),
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    window.addEventListener('resize', () => this.onResize());
    this.stage.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (params.has('reset')) {
      resetSave();
      this.save = loadSave();
    }
    if (params.has('progress')) {
      const n = Number(params.get('progress'));
      for (let i = 1; i <= n; i++) this.save.levels[i] = { stars: 3, profit: this.levels[i - 1]?.stars[2] ?? 0 };
    }
    this.onResize();
    if (params.has('og')) {
      // the social card: a loaded ship at her berth, no HUD, the title on an enamel plate
      this.play(Number(params.get('level')) || 64);
      this.autoSolve();
      this.ui.classList.add('og');
      this.hud?.root.remove();
      this.hud = null;
      this.view.insets = { top: 150, bottom: 6 };
      this.view.resize(window.innerWidth, window.innerHeight);
      this.anchors = this.view.layout();
      this.ui.append(h('div', { class: 'og-title', html: '<span class="mark"></span><span><b>Full &amp; Down</b><small>Load her to the marks. Not a tonne more.</small></span>' }));
      requestAnimationFrame((t) => this.frame(t));
      document.getElementById('boot')?.remove();
      return;
    }
    const lv = Number(params.get('level'));
    // first launch goes straight into the first voyage (the map comes after the first report)
    if (lv) this.play(lv);
    else if (!Object.keys(this.save.levels).length && !params.has('map')) this.play(1);
    else this.showMap();
    requestAnimationFrame((t) => this.frame(t));
    document.getElementById('boot')?.classList.add('out');
    setTimeout(() => document.getElementById('boot')?.remove(), 600);
  }

  private applyNight(): void {
    const mode = this.save.settings.night;
    const on = mode === 'on' || (mode === 'auto' && !!this.darkQuery?.matches);
    document.documentElement.classList.toggle('night', on);
    this.view?.setNight(on);
  }

  // ───────────────────────────── screens ─────────────────────────────

  showMap(): void {
    this.mode = 'map';
    this.clearCoach();
    this.hud?.root.remove();
    this.hud = null;
    this.model = null;
    this.level = null;
    audio.ambience(false);
    this.map.show(this.levels, this.save);
  }

  play(n: number): void {
    const level = this.levels.find((l) => l.n === n) ?? this.levels[0];
    this.map.hide();
    closeAllDialogs();
    this.level = level;
    this.model = new PlanModel(level);
    this.mode = 'plan';
    this.held = null;
    this.hud?.root.remove();
    this.hud = new Hud(this.ui, {
      onPause: () => this.openPause(),
      onTab: (p) => this.peek(p),
      onBunker: (d) => this.bunker(d),
      onNeed: () => this.need(),
      onUndo: () => this.undo(),
      onHint: () => this.hint(),
      onSail: () => void this.sail(),
      onVoice: () => this.onVoice(),
    });
    this.hud.setLevel(level, areaOf(level).name, this.save.levels[level.n]?.stars ?? 0);
    this.updatePilots();
    this.view.load(level);
    this.onResize();
    this.view.sync(0, this.model.baysAt(0), this.model.quayAt(0), 'instant');
    this.refresh(false);
    this.onResize();
    audio.ambience(true);
    audio.startMusic(Math.min(4, Math.floor(((level.chapter || 1) - 1) * 5 / 8)));
    audio.play('pipe');
    if (DEBUG) (window as unknown as { game: unknown }).game = this;
    const intro = level.intro ? NOTICES[level.intro] : undefined;
    const go = () => {
      if (intro && !this.save.seen.includes(level.intro!) && !params.has('nointro')) this.showNotice(level, () => this.startCoach(level));
      else this.startCoach(level);
    };
    const area = areaOf(level);
    const firstOfArea = this.levels.filter((l) => areaOf(l) === area)[0]?.n === level.n;
    if (firstOfArea && !this.save.levels[level.n] && !params.has('nointro')) this.showArea(level, go);
    else go();
  }

  /** New waters: the sea area's name card, once, on its first voyage. */
  private showArea(level: Level, then: () => void): void {
    const area = areaOf(level);
    const idx = Math.max(1, level.chapter || 1);
    const el = h('div', { class: 'area-card', html: `<div class="ac-in"><span class="caps">Sea area ${idx} of 8</span><b>${escapeHtml(area.name)}</b><small>${escapeHtml(area.blurb)}</small></div>` });
    this.ui.append(el);
    audio.play('bell');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
      then();
    };
    el.addEventListener('pointerdown', finish);
    setTimeout(finish, 2200);
  }

  /** The rules on one card (first voyage, and from the pause menu). */
  private showHowTo(then?: () => void): void {
    const steps = [
      ['1', 'Load boxes', 'Tap a box on the quay, then tap the ship. Each box pays its <b>freight</b> when it reaches its port.'],
      ['2', 'Buy fuel', 'The voyage burns fuel: the route strip shows how much. Tap <b>NEED</b> for just enough, or − / +.'],
      ['3', 'Mind her marks', 'Boxes <b>and fuel</b> must fit her deadweight. Fuel weighs too, and a heavier ship burns more.'],
      ['4', 'Sail', 'Earn the charter (★) and <b>SAIL</b>. If she can\'t go yet, tap SAIL and the crew tells you why.'],
    ];
    openDialog({
      title: 'How to play',
      cls: 'howto',
      body: [h('ol', { class: 'howto-steps', html: steps.map(([n, t, d]) => `<li><span class="hn num">${n}</span><span><b>${t}</b><small>${d}</small></span></li>`).join('') })],
      buttons: [{ label: then ? 'Let\'s load her' : 'Got it', cls: 'blue', onClick: () => then?.() }],
    });
  }

  private showNotice(level: Level, then: () => void): void {
    if (level.intro === 'weight') {
      this.save.seen.push('weight');
      writeSave(this.save);
      return this.showHowTo(then);
    }
    const n = NOTICES[level.intro!]!;
    const body: HTMLElement[] = [];
    body.push(h('div', { class: 'notice-sub caps', text: `${n.kind} · Nº ${String(level.n).padStart(3, '0')}` }));
    if (n.art) body.push(h('div', { class: 'notice-art', html: n.art }));
    for (const l of n.lines) body.push(h('p', { html: l }));
    openDialog({
      title: n.title,
      head: n.kind === 'NOTICE TO MARINERS' ? 'hazard' : 'navy',
      cls: 'notice',
      body,
      buttons: [{ label: 'Noted', cls: 'blue', onClick: () => {
        this.save.seen.push(level.intro!);
        writeSave(this.save);
        then();
      } }],
    });
  }

  // ───────────────────────────── coach marks ─────────────────────────────

  /** Level 1: the pilot always says (and points at) the one next thing to do. */
  private tutor: { el: HTMLElement; arrow: HTMLElement; target: { box?: BoxId; bay?: number } | null; text: string } | null = null;

  private tutorTick(): void {
    const m = this.model;
    const t = this.tutor;
    if (!m || !t || this.mode !== 'plan') return;
    const lv = m.level;
    const pr = m.sim.projection;
    const loaded = m.sim.plan[0].loads.length;
    const best = lv.best?.[0].loads.map((l) => l.box) ?? [];
    const onQuay = m.quayAt(0);
    const pickable = best.find((id) => onQuay.includes(id)) ?? onQuay[0];
    const over = pr.problems.find((p) => p.code === 'overMarks');
    const short = pr.problems.find((p) => p.code === 'short');
    let text = '';
    let target: { box?: BoxId; bay?: number } | null = null;
    let pulse: Parameters<Hud['pulse']>[0] = null;
    if (this.held !== null) {
      text = 'Drop it on a stack of the ship.';
      const bays = m.baysAt(0);
      const bay = bays.findIndex((_, i) => m.canPlace(this.held!, i).ok);
      target = bay >= 0 ? { bay } : null;
    } else if (!loaded) {
      text = 'Each box pays its freight when it gets there. Tap a box to load it.';
      target = pickable !== undefined ? { box: pickable } : null;
    } else if (over) {
      // point at a box the best voyage leaves ashore (else the last one loaded)
      const loads = m.sim.plan[0].loads;
      const bays = m.baysAt(0);
      const tops = new Set(bays.map((b) => b[b.length - 1]).filter((x) => x !== undefined));
      const spare = loads.find((l) => !best.includes(l.box) && tops.has(l.box)) ?? loads[loads.length - 1];
      text = `Too heavy by ${over.amount} t: fuel weighs too! Tap a box on the ship to take it off.`;
      target = spare ? { box: spare.box } : null;
      pulse = 'dwt';
    } else if (short && m.sim.plan[0].bunker === 0) {
      text = 'She needs fuel for the trip. Tap BUY for just enough.';
      pulse = 'need';
    } else if (short) {
      text = 'Still short of fuel: tap BUY.';
      pulse = 'need';
    } else if (m.profit < lv.stars[0]) {
      const leg = pr.legs[0];
      const room = lv.ship.capacity - leg.weight;
      const want = pickable !== undefined ? lv.boxes[pickable] : null;
      if (want && want.weight > room) {
        const loads = m.sim.plan[0].loads;
        const cheap = loads.find((l) => !best.includes(l.box));
        text = `The charter pays from $${lv.stars[0]}. No room for the $${want.freight} box: land a cheaper one to make room.`;
        target = cheap ? { box: cheap.box } : { box: want.id };
      } else {
        text = `The charter pays from $${lv.stars[0]}. Load the $${want?.freight ?? ''} box too.`;
        target = want ? { box: want.id } : null;
      }
      pulse = 'rule';
    } else {
      text = `All clear: loaded and fuelled. Tap SAIL to ${lv.ports[1].name}!`;
      pulse = 'sail';
    }
    if (text !== t.text) {
      t.text = text;
      t.el.innerHTML = `<b>PILOT</b><span>${text}</span>`;
      t.el.classList.remove('in');
      void t.el.offsetWidth;
      t.el.classList.add('in');
    }
    t.target = target;
    this.hud?.pulse(pulse);
  }

  private placeTutorArrow(): void {
    const t = this.tutor;
    if (!t) return;
    let p: { x: number; y: number } | null = null;
    if (t.target?.box !== undefined) {
      const s = this.view.boxScreen(t.target.box);
      if (s) p = { x: s.x, y: s.y - 0.45 * this.view.unitPx };
    } else if (t.target?.bay !== undefined) {
      const s = this.view.bayScreen(t.target.bay);
      p = { x: s.x, y: s.y - 0.9 * this.view.unitPx };
    }
    t.arrow.style.display = p && this.mode === 'plan' ? 'block' : 'none';
    if (p) t.arrow.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }

  private startCoach(level: Level): void {
    this.clearCoach();
    if (level.n === 1 && !(this.save.levels[1]?.stars ?? 0)) {
      const el = h('div', { class: 'coach in' });
      const arrow = h('div', { class: 'coach-arrow', html: '<svg width="34" height="40" viewBox="0 0 34 40"><path d="M10 2h14v18h8L17 38 2 20h8z" fill="#f5c518" stroke="#15181e" stroke-width="2.5" stroke-linejoin="round"/></svg>' });
      this.ui.append(el, arrow);
      this.ui.classList.add('has-coach');
      this.tutor = { el, arrow, target: null, text: '' };
      this.tutorTick();
      return;
    }
    if (!this.model?.quayAt(0).length) toast(this.ui, `No cargo at ${level.ports[0].name}: fuel her and sail on to pick some up.`, 4000);
    else if (level.format === 'exact') toast(this.ui, 'OFFICE: one load puts her exactly on the mark and lands her on the reserve. Find it.', 4200);
    else if (level.format === 'contract' && level.n !== 46) toast(this.ui, 'OFFICE: the sealed boxes are under contract and must sail.', 3600);
    const steps = COACH[level.n];
    if (!steps || (this.save.levels[level.n]?.stars ?? 0) > 0) return;
    const el = h('div', { class: 'coach' });
    this.ui.append(el);
    this.ui.classList.add('has-coach');
    this.coach = { steps, i: 0, el };
    this.showCoach();
  }

  private showCoach(): void {
    if (!this.coach) return;
    const s = this.coach.steps[this.coach.i];
    if (!s) return this.clearCoach();
    this.coach.el.innerHTML = `<b>PILOT</b><span>${s.text}</span>`;
    this.coach.el.classList.remove('in');
    void this.coach.el.offsetWidth;
    this.coach.el.classList.add('in');
    if (s.until === 'tap') setTimeout(() => this.coachEvent('tap'), 5000);
  }

  private coachEvent(ev: CoachStep['until']): void {
    if (!this.coach) return;
    const s = this.coach.steps[this.coach.i];
    if (s && s.until === ev) {
      this.coach.i++;
      this.showCoach();
    }
  }

  private clearCoach(): void {
    this.coach?.el.remove();
    this.coach = null;
    this.tutor?.el.remove();
    this.tutor?.arrow.remove();
    this.tutor = null;
    this.hud?.pulse(null);
    this.ui.classList.remove('has-coach');
  }

  // ───────────────────────────── planning ─────────────────────────────

  private refresh(kick = true): void {
    const m = this.model;
    if (!m || !this.hud) return;
    const lv = m.level;
    const leg = m.sim.projection.legs[m.port];
    const before = this.lastWeight;
    this.view.setLoad(leg.weight / lv.ship.capacity, kick);
    if (leg.weight === lv.ship.capacity && before !== leg.weight && kick) {
      this.view.onMarkGlint();
      audio.play('bell');
    }
    this.lastWeight = leg.weight;
    this.view.setBunker(lv.ports[m.port].price !== null ? m.sim.plan[m.port].bunker : 0);
    this.hud.update(m, this.anchors);
    this.view.setBluePeter(!m.legRefusal());
    this.tutorTick();
    if (m.sim.projection.problems.some((p) => p.code === 'overMarks')) this.coachEvent('over');
  }

  private lastWeight = -1;

  /** Show the ship at her current port (after undo across a leg). */
  private showPort(): void {
    const m = this.model;
    if (!m) return;
    this.release();
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'tab');
    this.view.setPortSign(m.port);
    this.lastWeight = -1;
    this.refresh();
  }

  /** A later port, read-only: what she'll find there. */
  private peek(p: number): void {
    const m = this.model;
    if (!m) return;
    const lv = m.level;
    const port = lv.ports[p];
    if (p === m.port) return;
    const offers = lv.boxes.filter((b) => b.from === p);
    const rows = offers
      .map((b) => `<li><span class="pk-box" style="--c:${portColorOf(b.to)}">${b.weight} t</span><span>to <b>${escapeHtml(lv.ports[b.to].name)}</b></span><b class="num">$${b.freight}</b></li>`)
      .join('');
    const past = p < m.port;
    openDialog({
      title: port.name,
      onClose: () => undefined,
      cls: 'peek',
      body: [
        h('p', { html: past ? 'Already called here. Tap <b>Undo</b> to go back and change that call.' : p === lv.ports.length - 1 ? 'The final port: everything aboard for here comes off and pays.' : 'A later call. You plan it when she gets there.' }),
        h('div', { class: 'pk-facts', html: `<span>${port.price === null ? 'No bunkers here' : `Bunkers <b>$${port.price}/t</b>${port.lot && port.lot > 1 ? ` in lots of ${port.lot}` : ''}`}</span>${port.bar !== undefined ? `<span>Harbour bar: at most <b>${port.bar} t</b> aboard</span>` : ''}` }),
        offers.length ? h('ul', { class: 'pk-list', html: rows }) : h('p', { text: 'No cargo offered here.' }),
      ],
    });
  }

  private hold(box: BoxId): void {
    const m = this.model!;
    this.held = box;
    const bays = m.baysAt(m.port);
    const legal = bays.map((_, i) => i).filter((i) => m.canPlace(box, i).ok);
    this.view.setHeld(box, legal, bays);
    const b = m.level.boxes[box];
    this.hud?.setPreview({ weight: b.weight, to: b.to });
    audio.play('pick', { volume: 0.5 });
    this.tutorTick();
    this.coachEvent('pick');
  }

  private release(): void {
    if (this.held === null) return;
    this.held = null;
    this.view.setHeld(null);
    this.hud?.setPreview(null);
    this.tutorTick();
  }

  private place(box: BoxId, bay: number): void {
    const m = this.model!;
    const r = m.place(box, bay);
    if (!r.ok) {
      this.view.wiggle(box);
      audio.play('invalid');
      toast(this.ui, r.text);
      return;
    }
    this.held = null;
    this.view.setHeld(null);
    this.hud?.setPreview(null);
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'edit');
    this.afterEdit();
    this.coachEvent('place');
  }

  /** One tap: the crane puts the box on the best legal stack. */
  private autoLoad(box: BoxId): void {
    const m = this.model!;
    const bay = m.autoBay(box);
    if (bay === null) {
      const lv = m.level;
      const bays = m.baysAt(m.port);
      const full = bays.every((b) => b.length >= lv.ship.tiers);
      const r = full ? null : m.canPlace(box, bays.findIndex((b) => b.length < lv.ship.tiers));
      this.view.wiggle(box);
      audio.play('invalid');
      toast(this.ui, full ? 'MATE: the hold is full. Take a box off first.' : r && !r.ok ? r.text : 'MATE: no stack can take it.');
      return;
    }
    this.place(box, bay);
  }

  private unload(box: BoxId): void {
    const m = this.model!;
    if (!m.unload(box)) return;
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'edit');
    this.afterEdit();
    this.coachEvent('unload');
  }

  private afterEdit(): void {
    const m = this.model!;
    if (m.bouncedPorts.size) {
      const ports = [...m.bouncedPorts].map((p) => m.level.ports[p].name).join(', ');
      toast(this.ui, `MATE: that change bounced boxes back to the quay at ${ports}.`);
    }
    const wasSail = this.canSail;
    this.refresh();
    if (!wasSail && this.canSail) {
      audio.play('flag');
      this.hud?.flashSail();
    }
  }

  private get canSail(): boolean {
    return !!this.model && !this.model.legRefusal();
  }

  private bunker(d: number): void {
    const m = this.model;
    if (!m || this.mode !== 'plan') return;
    if (m.bunker(d, true)) {
      audio.play(d > 0 ? 'cell' : 'drain', { pitch: Math.min(11, m.sim.plan[m.port].bunker) });
      this.view.setBunker(m.sim.plan[m.port].bunker, d > 0);
      this.afterEdit();
    } else audio.play('invalid', { volume: 0.5 });
  }

  private need(): void {
    const m = this.model;
    if (!m || this.mode !== 'plan') return;
    const n = m.need();
    if (n === null) {
      audio.play('invalid');
      toast(this.ui, `CHIEF: no amount here gets her to ${m.level.ports[m.port + 1].name} safely.`);
      return;
    }
    audio.play('glug');
    this.view.setBunker(n, true);
    this.afterEdit();
  }

  private undo(): void {
    const m = this.model;
    if (!m || this.mode !== 'plan') return;
    const prevPort = m.port;
    if (!m.undo()) return;
    this.release();
    audio.play('undo');
    if (m.port !== prevPort) {
      toast(this.ui, `Back at ${m.level.ports[m.port].name}.`);
      this.showPort();
      return;
    }
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'edit');
    this.refresh();
  }

  private onVoice(): void {
    const m = this.model;
    if (!m) return;
    const r = m.sailRefusal();
    void r;
  }

  // ───────────────────────────── the pilot (hints) ─────────────────────────────

  private bestPlan: Call[] | null = null;
  private lastHint: { key: string; msg: string; port: number; box?: BoxId; ashore?: boolean } | null = null;

  private hint(): void {
    const m = this.model;
    if (!m || this.mode !== 'plan') return;
    const key = JSON.stringify(m.plan);
    if (this.lastHint && this.lastHint.key === key) {
      // the same advice again is free
      this.showHint(this.lastHint);
      return;
    }
    if (this.save.pilots <= 0 && !DEBUG) {
      toast(this.ui, 'PILOT: no hints left. Earn one with every new ★★★.');
      return;
    }
    if (!this.bestPlan) this.bestPlan = m.level.best ?? solve(m.level)?.plan ?? null;
    const best = this.bestPlan;
    if (!best) return;
    const lv = m.level;
    if (m.profit >= lv.stars[2] && !m.sailRefusal()) {
      toast(this.ui, 'PILOT: this is the best voyage there is. Sail on!');
      return;
    }
    const mine = maskOf(m.plan);
    const ideal = maskOf(best);
    const name = (id: BoxId) => {
      const b = lv.boxes[id];
      return `the ${b.weight} t ${lv.ports[b.to].name} box`;
    };
    let msg = '';
    let port = m.port;
    let box: BoxId | undefined;
    let ashore = false;
    // 1) a box that shouldn't sail
    const extra = lv.boxes.filter((b) => mine & (1 << b.id) && !(ideal & (1 << b.id)));
    const missing = lv.boxes.filter((b) => ideal & (1 << b.id) && !(mine & (1 << b.id)));
    if (extra.length) {
      const b = extra.sort((x, y) => (x.from === m.port ? -1 : 0) - (y.from === m.port ? -1 : 0))[0];
      port = b.from;
      box = b.id;
      ashore = true;
      msg = b.from < m.port ? `PILOT: back at ${lv.ports[b.from].name}, ${name(b.id)} should have stayed ashore. Undo to go back.` : b.from > m.port ? `PILOT: at ${lv.ports[b.from].name}, leave ${name(b.id)} ashore.` : `PILOT: leave ${name(b.id)} ashore.`;
    } else if (missing.length) {
      const b = missing.sort((x, y) => (x.from === m.port ? -1 : 0) - (y.from === m.port ? -1 : 0))[0];
      port = b.from;
      box = b.id;
      const bay = best[b.from].loads.find((l) => l.box === b.id)?.bay;
      msg = b.from < m.port ? `PILOT: ${name(b.id)} should have sailed from ${lv.ports[b.from].name}. Undo to go back.` : b.from > m.port ? `PILOT: at ${lv.ports[b.from].name}, ship ${name(b.id)}. Leave room for it.` : `PILOT: ship ${name(b.id)}${bay !== undefined && lv.ship.tiers > 1 ? ` on stack ${bay + 1}` : ''}.`;
    } else {
      const i = best.findIndex((c, k) => c.bunker !== m.plan[k].bunker);
      if (i >= 0 && !lv.auto) {
        port = i;
        msg = i === m.port ? `PILOT: bunker ${best[i].bunker} t here.` : i < m.port ? `PILOT: at ${lv.ports[i].name} she should have bunkered ${best[i].bunker} t. Undo to go back.` : `PILOT: at ${lv.ports[i].name}, bunker ${best[i].bunker} t.`;
      } else {
        msg = 'PILOT: right boxes, wrong stacks. Mind what comes off first.';
      }
    }
    if (!DEBUG) this.save.pilots--;
    writeSave(this.save);
    this.updatePilots();
    this.lastHint = { key, msg, port, box, ashore };
    this.showHint(this.lastHint);
  }

  private showHint(hint: { msg: string; port: number; box?: BoxId; ashore?: boolean }): void {
    const m = this.model!;
    audio.play('bell');
    toast(this.ui, hint.msg, 4200);
    if (hint.box === undefined) return;
    const where = m.whereAt(m.port, hint.box);
    if (!hint.ashore && where.at === 'quay') this.view.tweens.after(0.35, () => this.mode === 'plan' && this.hold(hint.box!));
    else this.view.tweens.after(0.35, () => this.view.wiggle(hint.box!));
  }

  private updatePilots(): void {
    const el = this.ui.querySelector('.dock .pilot');
    if (el) el.setAttribute('data-n', String(this.save.pilots));
  }

  // ───────────────────────────── input ─────────────────────────────

  private onDown(e: PointerEvent): void {
    if (this.mode === 'sailing') {
      this.fast = true;
      this.view.flush();
      return;
    }
    if (this.mode !== 'plan' || dialogOpen() || !this.model) return;
    const m = this.model;
    const p = this.view.pick(e.clientX, e.clientY);
    if (!p) return;
    if (p.kind === 'box') {
      const where = m.whereAt(m.port, p.box);
      if (where.at === 'quay') {
        // a tap loads it; a drag lets you choose the stack
        this.drag = { x: e.clientX, y: e.clientY, moved: false, box: p.box };
        return;
      }
      if (where.at === 'ship') {
        const here = m.loadedHere(m.port);
        if (here.has(p.box)) {
          const bays = m.baysAt(m.port);
          if (bays[where.bay][bays[where.bay].length - 1] === p.box) return this.unload(p.box);
          toast(this.ui, 'MATE: take the box on top off first.');
          return;
        }
        const from = m.level.boxes[p.box].from;
        toast(this.ui, `MATE: loaded at ${m.level.ports[from].name}. Undo to go back there.`);
        audio.play('invalid', { volume: 0.4 });
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) return;
    if (!d.moved) {
      d.moved = true;
      this.hold(d.box);
    }
    this.view.dragHeld(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.model) return;
    if (!d.moved) return this.autoLoad(d.box);
    if (this.held === null) return;
    const bay = e.clientY < (this.anchors?.waterY ?? 0) + 20 ? this.view.bayAtX(e.clientX) : null;
    if (bay !== null) this.place(this.held, bay);
    else {
      this.release();
      this.view.sync(this.model.port, this.model.baysAt(this.model.port), this.model.quayAt(this.model.port), 'edit');
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.mode !== 'plan' || dialogOpen()) return;
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.undo();
    } else if (e.key === 'Escape') this.release();
    else if (e.key === '+' || e.key === '=') this.bunker(1);
    else if (e.key === '-') this.bunker(-1);
    else if (e.key === 'Enter' && this.canSail) void this.sail();
  }

  // ───────────────────────────── layout and frame ─────────────────────────────

  private onResize(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const landscape = w > hgt * 1.25 && hgt < 600;
    const compact = hgt < 760 && !landscape;
    this.ui.classList.toggle('compact', compact);
    this.ui.classList.toggle('landscape', landscape);
    this.view.insets.right = landscape ? 376 : 0;
    if (this.hud && landscape) {
      this.view.insets.top = 8;
      this.view.insets.bottom = 42;
    } else if (this.hud) {
      this.view.insets.top = this.hud.topHeight() + 6;
      // dock 66, voice 48, bunker 58, quay tags 32, quay boxes ~30, deadweight bar 58
      // dock 66 + bunker 62 + freight tags 34 (from the bottom of the screen)
      this.view.insets.bottom = compact ? 58 + 52 + 30 + 14 : 66 + 62 + 34 + 14;
    }
    if (this.hud) this.ui.style.setProperty('--top-block', `${Math.round(this.view.insets.top)}px`);
    this.view.resize(w, hgt);
    this.anchors = this.view.layout();
    if (this.hud && this.model) {
      this.hud.positionBottom(this.anchors);
      this.hud.update(this.model, this.anchors);
    }
  }

  private frame(t: number): void {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000) * (this.fast && this.mode === 'sailing' ? 2.5 : 1);
    if (this.last) this.view.sampleFrame(t - this.last, t);
    this.last = t;
    if (this.mode !== 'map') {
      this.view.update(dt);
      this.view.render();
      this.placeTags();
      this.placeTutorArrow();
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private placeTags(): void {
    const m = this.model;
    if (!m || !this.hud) return;
    if (this.mode !== 'plan') {
      this.hud.placeTags([]);
      return;
    }
    const items: { id: number; x: number; y: number; freight: number; to: number; held: boolean }[] = [];
    for (const id of m.quayAt(m.port)) {
      const s = this.view.boxScreen(id);
      if (!s) continue;
      const b = m.level.boxes[id];
      items.push({ id, x: s.x, y: s.y + 0.26 * this.view.unitPx + 8, freight: b.freight, to: b.to, held: this.held === id });
    }
    this.hud.placeTags(items);
  }

  // ───────────────────────────── the voyage ─────────────────────────────

  /** SAIL tapped while she can't go: say why, in the voice of who stops her, and point at the fix. */
  private explain(): void {
    const m = this.model;
    if (!m) return;
    const r = m.legRefusal();
    if (!r) return;
    audio.play('whistle', { volume: 0.5 });
    let advice = '';
    let pulse: Parameters<Hud['pulse']>[0] = null;
    if (r.code === 'short') {
      advice = m.level.ports[m.port].price === null ? ' Undo to go back to the last port with bunkers.' : ' Tap BUY for just enough.';
      pulse = 'need';
    } else if (r.code === 'overMarks') {
      advice = ' Fuel weighs too: take a box off (tap it on the ship) or buy less fuel.';
      pulse = 'dwt';
    } else if (r.code === 'bar' || r.code === 'barAhead' || r.code === 'zone') {
      advice = ' Carry less, or take less fuel.';
      pulse = 'dwt';
    } else if (r.code === 'bridge') {
      advice = ' She needs more weight aboard to sit low enough.';
      pulse = 'dwt';
    }
    this.hud?.pulse(pulse);
    setTimeout(() => this.hud?.pulse(null), 3200);
    toast(this.ui, r.text + advice, 4600);
  }

  /** Sail one leg: from the port she's at to the next, then plan the next call there. */
  private async sail(): Promise<void> {
    const m = this.model;
    if (!m || this.mode !== 'plan') return;
    if (!this.canSail) return this.explain();
    this.release();
    this.mode = 'sailing';
    this.fast = false;
    if (!this.tutor) this.clearCoach();
    this.tutor?.el.classList.add('hide');
    this.coachEvent('sail');
    this.hud?.setBusy(true);
    const lv = m.level;
    const pr = m.sim.projection;
    const P = lv.ports.length;
    const i = m.port;
    const banner = h('div', { class: 'banner' });
    this.ui.append(banner);
    const say = (big: string, small = '') => (banner.innerHTML = `${escapeHtml(big)}${small ? `<small>${escapeHtml(small)}</small>` : ''}`);
    const wait = (sec: number) => new Promise<void>((r) => this.view.tweens.after(sec, r));
    audio.play('flag');
    const leg = pr.legs[i];
    this.view.setBunker(0);
    say(i === 0 ? 'Let go all lines' : `Sailing from ${lv.ports[i].name}`, `to ${lv.ports[i + 1].name} · ${lv.legs[i].days} day${lv.legs[i].days > 1 ? 's' : ''} · burns ${leg.burn} t`);
    audio.engine(true, leg.band / Math.max(1, lv.ship.bands.length - 1));
    await this.view.steam('out', 1.1);
    say('Full away', `fuel ${leg.fuelOut} t → ${leg.fuelIn} t at ${lv.ports[i + 1].name}`);
    // burn the leg: the hull rises a tick per tonne
    const cargo = leg.weight - leg.fuelOut;
    for (let k = 0; k < leg.burn; k++) {
      await wait(Math.max(0.06, 0.7 / leg.burn));
      audio.play('drain', { pitch: Math.max(0, 11 - k) });
      this.view.setLoad((cargo + leg.fuelOut - k - 1) / lv.ship.capacity, false);
    }
    // arrive: the boxes for here are still aboard
    const next = i + 1;
    this.view.sync(next, m.baysAt(i), lv.boxes.filter((b) => b.from === next).map((b) => b.id), 'tab');
    this.view.setPortSign(next);
    await this.view.steam('in', 1.1);
    audio.engine(false);
    audio.play('toot');
    say(`${lv.ports[next].name}`, `arrived · ${leg.fuelIn} t of fuel left`);
    const delivered = pr.calls[next].delivered;
    const dur = this.view.discharge(delivered, (id, at) => {
      this.pop(`+$${lv.boxes[id].freight}`, at.x, at.y);
      audio.play('coin', { pitch: Math.random() });
    }, this.fast ? 0.1 : 0.22);
    await wait(dur);
    banner.remove();
    m.advance();
    if (next >= P - 1) {
      this.view.setLoad(Math.max(0, pr.finalRob) / lv.ship.capacity);
      await this.report();
      return;
    }
    // the next call: plan it here
    this.mode = 'plan';
    this.hud?.setBusy(false);
    this.tutor?.el.classList.remove('hide');
    this.view.sync(next, m.baysAt(next), m.quayAt(next), 'edit');
    this.lastWeight = -1;
    this.refresh();
    toast(this.ui, m.quayAt(next).length ? `${lv.ports[next].name}: load what's offered here, buy fuel, sail on.` : `${lv.ports[next].name}: no cargo here. Fuel her and sail on.`, 3200);
  }

  private pop(text: string, x: number, y: number): void {
    const el = h('div', { class: 'pop', text });
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.ui.append(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ───────────────────────────── the arrival report ─────────────────────────────

  private async report(): Promise<void> {
    const m = this.model!;
    const lv = m.level;
    const pr = m.sim.projection;
    const stars = starsFor(lv, pr.profit);
    this.mode = 'report';
    const prev = this.save.levels[lv.n];
    const firstThree = stars === 3 && (prev?.stars ?? 0) < 3;
    if (!prev || stars > prev.stars || pr.profit > prev.profit) {
      this.save.levels[lv.n] = { stars: Math.max(stars, prev?.stars ?? 0), profit: Math.max(pr.profit, prev?.profit ?? -999) };
    }
    if (firstThree) this.save.pilots = Math.min(9, this.save.pilots + 1);
    writeSave(this.save);
    if (stars === 3) this.view.celebrate();
    audio.play(stars ? 'win' : 'fail');
    // let the moment land before the paperwork
    await new Promise<void>((r) => setTimeout(r, stars === 3 ? 1900 : 900));
    const last = lv.ports[lv.ports.length - 1];
    const onMark = pr.onMark.some(Boolean);
    const onReserve = pr.finalRob === lv.reserve;
    const remarks = [
      `<li class="${onMark ? 'ok' : ''}">${onMark ? '✓' : '·'} On the mark${onMark ? ` at ${lv.ports[pr.onMark.indexOf(true)].name}` : ''}</li>`,
      `<li class="ok">✓ Clean stow</li>`,
      `<li class="${onReserve ? 'ok' : ''}">${onReserve ? '✓ On the reserve' : `· ROB ${pr.finalRob} t, reserve ${lv.reserve}: ${pr.finalRob - lv.reserve} t extra`}</li>`,
    ];
    const bunkers = m.sim.plan
      .map((c, i) => (c.bunker ? `<div class="ln"><span>Bunkers ${lv.ports[i].code} ${c.bunker} t × $${lv.ports[i].price}</span><b class="num">−$${c.bunker * (lv.ports[i].price ?? 0)}</b></div>` : ''))
      .join('');
    const card = h('div', {
      class: 'report',
      html: `
        <div class="rep-head"><span class="caps">Arrival report</span><span class="num">Nº ${String(lv.n).padStart(3, '0')}</span><span class="caps">${last.code} · FWE</span></div>
        <div class="stamps">${[0, 1, 2].map((i) => `<div class="stamp s${i} ${i < stars ? 'on' : ''}">${starSvg(i < stars, 30)}<span class="caps">${['Contract', 'Sharp', 'Full & Down'][i]}</span></div>`).join('')}</div>
        <div class="ln"><span>Freight delivered</span><b class="num">$${pr.freight}</b></div>
        ${bunkers}
        <div class="ln net"><span>Net</span><b class="num">$${pr.profit}</b></div>
        <div class="par caps">★ $${lv.stars[0]} · ★★ $${lv.stars[1]} · ★★★ $${lv.stars[2]}</div>
        <ul class="remarks">${remarks.join('')}</ul>
        <p class="logbook">${stars === 3 ? escapeHtml(lv.logbook ?? 'Full and down, and not a tonne wasted.') : !stars ? `The charter needed <b>$${lv.stars[0]}</b>. Try another load: more freight, less fuel.` : `The best voyage earns <b>$${lv.stars[2]}</b>. ${pr.profit < lv.stars[1] ? 'Look again at what you left ashore.' : 'Close. One more change.'}`}</p>`,
    });
    const isLast = lv.n >= this.levels.length;
    openDialog({
      title: stars === 3 ? 'Full & Down' : stars === 2 ? 'Well sailed' : stars ? 'Contract met' : 'Contract not met',
      head: stars === 3 ? 'yellow' : stars ? 'navy' : 'red',
      cls: 'report-dlg',
      body: [card],
      row: true,
      buttons: stars
        ? [
            { label: 'Improve', onClick: () => this.backToPlan() },
            { label: isLast ? 'Chart' : 'Next voyage', cls: 'blue', onClick: () => (isLast ? this.showMap() : this.play(lv.n + 1)) },
          ]
        : [{ label: 'Try again', cls: 'blue', onClick: () => this.backToPlan() }],
    });
    // stamps slam one by one
    const els = [...document.querySelectorAll<HTMLElement>('.report .stamp.on')];
    els.forEach((el, i) =>
      setTimeout(() => {
        el.classList.add('slam');
        audio.play('stamp', { pitch: i });
      }, 450 + i * 380),
    );
  }

  /** Back to the first port with the same plan, to try again or improve it. */
  private backToPlan(): void {
    const m = this.model;
    if (!m) return;
    m.select(0);
    this.mode = 'plan';
    this.hud?.setBusy(false);
    this.view.load(m.level);
    this.onResize();
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'instant');
    this.lastWeight = -1;
    this.refresh(false);
    this.tutor?.el.classList.remove('hide');
  }

  // ───────────────────────────── menus ─────────────────────────────

  private openPause(): void {
    const lv = this.level;
    if (!lv) return;
    const d = openDialog({
      title: `${lv.n} · ${lv.title}`,
      onClose: () => undefined,
      body: [h('p', { text: areaOf(lv).name }), h('div', { class: 'par-chips', html: [...new Set(lv.stars)].map((t) => `<span>${starSvg(true, 13).repeat(lv.stars.lastIndexOf(t) + 1)} $${t}</span>`).join('') })],
      buttons: [
        { label: 'Resume', cls: 'blue', onClick: () => undefined },
        { label: 'How to play', onClick: () => (this.showHowTo(), true) },
        { label: 'Clear the plan', onClick: () => this.clearPlan() },
        { label: 'Chart', onClick: () => this.showMap() },
        { label: 'Settings', onClick: () => (this.openSettings(), true) },
        ...(DEBUG ? [{ label: 'Auto-solve', onClick: () => this.autoSolve() }] : []),
      ],
    });
    void d;
  }

  private clearPlan(): void {
    const m = this.model;
    if (!m) return;
    m.reset();
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'tab');
    this.refresh();
  }

  private autoSolve(): void {
    const m = this.model;
    if (!m) return;
    const best = m.level.best ?? solve(m.level)?.plan;
    if (!best) return;
    m.restore(best);
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'tab');
    this.refresh();
  }

  private openSettings(): void {
    const s = this.save.settings;
    const row = (label: string, ctl: HTMLElement) => h('div', { class: 'set-row' }, h('span', { text: label }), ctl);
    const slider = (v: number, on: (v: number) => void) => {
      const i = h('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.05', value: String(v) } });
      i.addEventListener('input', () => on(Number(i.value)));
      return i;
    };
    const nightSel = h('div', { class: 'seg' });
    for (const k of ['off', 'auto', 'on'] as const) {
      const b = button(k, 'small' + (s.night === k ? ' navy' : ''), () => {
        s.night = k;
        writeSave(this.save);
        this.applyNight();
        nightSel.querySelectorAll('button').forEach((x) => x.classList.toggle('navy', x.textContent === k));
      });
      nightSel.append(b);
    }
    openDialog({
      title: 'Settings',
      onClose: () => undefined,
      cls: 'settings',
      body: [
        row('Sound', slider(s.sfx, (v) => {
          s.sfx = v;
          audio.setSfxVolume(v);
          writeSave(this.save);
        })),
        row('Music', slider(s.music, (v) => {
          s.music = v;
          audio.setMusicVolume(v);
          writeSave(this.save);
        })),
        row('Night', nightSel),
        h('p', { class: 'credits', html: 'Full &amp; Down · fonts Oswald and Sofia Sans (OFL) · 3D three.js (MIT). All sounds are synthesised.' }),
      ],
      buttons: [
        { label: 'Reset progress', cls: 'red small', onClick: () => {
          openDialog({
            title: 'Reset all 72 voyages?',
            head: 'red',
            body: ['Your stars and pilots go overboard. This cannot be undone.'],
            row: true,
            buttons: [
              { label: 'Keep', onClick: () => undefined },
              { label: 'Reset', cls: 'red', onClick: () => {
                closeAllDialogs();
                resetSave();
                this.save = loadSave();
                this.showMap();
              } },
            ],
          });
          return false;
        } },
      ],
    });
  }

  /** ?debug helpers for puppeteer: screen points of things to tap */
  debugPoints(): unknown {
    const m = this.model;
    if (!m) return null;
    const v = this.view;
    const quay = m.quayAt(m.port).map((id) => ({ id, p: v.boxScreen(id) }));
    const bays = Array.from({ length: m.level.ship.bays }, (_, i) => v.bayScreen(i));
    return { port: m.port, quay, bays, best: m.level.best, plan: m.plan, mode: this.mode };
  }

  /** ?debug helper for puppeteer */
  debugState(): unknown {
    const m = this.model;
    return m ? { port: m.port, profit: m.profit, stars: m.stars, problems: m.sim.projection.problems.map((p) => p.text) } : null;
  }

  get unlocked(): number {
    return unlockedUpTo(this.save, this.levels.length);
  }
}

export function flagHtml(id: string, w = 24, h2 = 16): string {
  return flagSvg(id as FlagId, w, h2);
}

void glyph;
