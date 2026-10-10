import { GameView, type Anchors } from '../render/GameView';
import { loadFonts } from '../render/paint';
import { Hud } from '../ui/Hud';
import { h, button } from '../ui/dom';
import { glyph, starSvg } from '../ui/glyphs';
import { openDialog, initDialogs, toast, closeAllDialogs, dialogOpen, escapeHtml } from '../ui/dialogs';
import { MapScreen } from '../ui/MapScreen';
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
      onTab: (p) => this.selectPort(p),
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

  private showNotice(level: Level, then: () => void): void {
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

  private startCoach(level: Level): void {
    this.clearCoach();
    if (level.format === 'exact') toast(this.ui, 'OFFICE: one load puts her exactly on the mark and lands her on the reserve. Find it.', 4200);
    else if (level.format === 'contract' && level.n !== 46) toast(this.ui, 'OFFICE: the sealed boxes are under contract and must sail.', 3600);
    const steps = COACH[level.n];
    if (!steps || (this.save.levels[level.n]?.stars ?? 0) > 0) return;
    const el = h('div', { class: 'coach' });
    this.ui.append(el);
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
    this.view.setBluePeter(!m.sailRefusal());
    if (m.sim.projection.problems.some((p) => p.code === 'overMarks')) this.coachEvent('over');
  }

  private lastWeight = -1;

  private selectPort(p: number): void {
    const m = this.model;
    if (!m || this.mode !== 'plan' || p === m.port) return;
    this.release();
    const from = m.port;
    m.select(p);
    audio.play('button');
    const delivered = m.sim.projection.calls[p].delivered;
    if (p === from + 1 && delivered.length) {
      // show her arriving: this port's boxes come off with their freight, then this call's loads
      this.view.sync(p, m.baysAt(from), m.quayAt(p), 'tab');
      const dur = this.view.discharge(delivered, (id, at) => this.pop(`+$${m.level.boxes[id].freight}`, at.x, at.y), 0.1);
      this.view.tweens.after(Math.min(dur, 0.9), () => {
        if (this.model === m && m.port === p && this.mode === 'plan') this.view.sync(p, m.baysAt(p), m.quayAt(p), 'edit');
      });
    } else {
      this.view.sync(p, m.baysAt(p), m.quayAt(p), 'tab');
    }
    this.lastWeight = -1;
    this.refresh();
    this.coachEvent('tab');
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
    this.coachEvent('pick');
  }

  private release(): void {
    if (this.held === null) return;
    this.held = null;
    this.view.setHeld(null);
    this.hud?.setPreview(null);
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
    return !!this.model && !this.model.sailRefusal();
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
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), m.port === prevPort ? 'edit' : 'tab');
    this.refresh();
  }

  private onVoice(): void {
    const m = this.model;
    if (!m) return;
    const r = m.sailRefusal();
    if (r && r.code !== 'stars' && r.port !== m.port && r.port < m.calls) this.selectPort(r.port);
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
      toast(this.ui, 'PILOT: no pilots left. Earn one with every new ★★★.');
      return;
    }
    if (!this.bestPlan) this.bestPlan = m.level.best ?? solve(m.level)?.plan ?? null;
    const best = this.bestPlan;
    if (!best) return;
    const lv = m.level;
    if (m.profit >= lv.stars[2] && !m.sailRefusal()) {
      toast(this.ui, 'PILOT: she is ready. That is the best voyage there is. Sail!');
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
      msg = `PILOT: leave ${name(b.id)} ashore at ${lv.ports[b.from].name}.`;
    } else if (missing.length) {
      const b = missing.sort((x, y) => (x.from === m.port ? -1 : 0) - (y.from === m.port ? -1 : 0))[0];
      port = b.from;
      box = b.id;
      const bay = best[b.from].loads.find((l) => l.box === b.id)?.bay;
      msg = `PILOT: ship ${name(b.id)} from ${lv.ports[b.from].name}${bay !== undefined && lv.ship.tiers > 1 ? `, stack ${bay + 1}` : ''}.`;
    } else {
      const i = best.findIndex((c, k) => c.bunker !== m.plan[k].bunker);
      if (i >= 0 && !lv.auto) {
        port = i;
        msg = `PILOT: bunker ${best[i].bunker} t at ${lv.ports[i].name}.`;
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
    if (hint.port !== m.port && hint.port < m.calls) this.selectPort(hint.port);
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
    if (DEBUG) console.log('down', e.clientX, e.clientY, JSON.stringify(p), 'held', this.held, 'port', m.port);
    if (!p) {
      this.release();
      return;
    }
    if (p.kind === 'box') {
      const where = m.whereAt(m.port, p.box);
      if (where.at === 'quay') {
        if (this.held === p.box) {
          this.release();
          return;
        }
        this.hold(p.box);
        this.drag = { x: e.clientX, y: e.clientY, moved: false, box: p.box };
        return;
      }
      if (where.at === 'ship') {
        if (this.held !== null) return this.place(this.held, where.bay);
        const here = m.loadedHere(m.port);
        if (here.has(p.box)) {
          const bays = m.baysAt(m.port);
          if (bays[where.bay][bays[where.bay].length - 1] === p.box) return this.unload(p.box);
          toast(this.ui, 'MATE: take the box on top off first.');
          return;
        }
        const from = m.level.boxes[p.box].from;
        toast(this.ui, `MATE: loaded at ${m.level.ports[from].name}. Plan it there.`);
        audio.play('invalid', { volume: 0.4 });
        return;
      }
    }
    if (p.kind === 'bay' && this.held !== null) this.place(this.held, p.bay);
  }

  private onMove(e: PointerEvent): void {
    if (!this.drag || this.held === null) return;
    if (!this.drag.moved && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) < 10) return;
    this.drag.moved = true;
    this.view.dragHeld(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.moved || this.held === null) return;
    const bay = e.clientY < (this.anchors?.waterY ?? 0) + 20 ? this.view.bayAtX(e.clientX) : null;
    if (bay !== null) this.place(this.held, bay);
    else {
      const b = this.held;
      this.release();
      this.view.sync(this.model!.port, this.model!.baysAt(this.model!.port), this.model!.quayAt(this.model!.port), 'edit');
      void b;
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
      // dock 66 + voice 50 + bunker 62 + freight tags 34 (from the bottom of the screen)
      this.view.insets.bottom = compact ? 58 + 40 + 52 + 30 : 66 + 50 + 62 + 34;
    }
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

  private async sail(): Promise<void> {
    const m = this.model;
    if (!m || this.mode !== 'plan' || !this.canSail) return;
    this.release();
    this.mode = 'sailing';
    this.fast = false;
    this.clearCoach();
    this.coachEvent('sail');
    this.hud?.setBusy(true);
    const lv = m.level;
    const pr = m.sim.projection;
    const P = lv.ports.length;
    let freight = 0;
    const banner = h('div', { class: 'banner' });
    this.ui.append(banner);
    const say = (big: string, small = '') => (banner.innerHTML = `${escapeHtml(big)}${small ? `<small>${escapeHtml(small)}</small>` : ''}`);
    const wait = (s: number) => new Promise<void>((r) => this.view.tweens.after(s, r));
    audio.play('flag');
    for (let i = 0; i < P - 1; i++) {
      // at port i, as planned
      this.view.sync(i, m.baysAt(i), m.quayAt(i), 'tab');
      const leg = pr.legs[i];
      this.view.setLoad(leg.weight / lv.ship.capacity, false);
      say(i === 0 ? 'Let go all lines' : `Sailing from ${lv.ports[i].name}`, `${lv.ports[i].code} ▸ ${lv.ports[i + 1].code} · ${lv.legs[i].days} days · burns ${leg.burn} t`);
      audio.engine(true, leg.band / Math.max(1, lv.ship.bands.length - 1));
      await this.view.steam('out', 1.1);
      say('Full away', `fuel ${leg.fuelOut} t ▸ ${leg.fuelIn} t at ${lv.ports[i + 1].name}`);
      // burn the leg: the hull rises a tick per tonne
      const cargo = leg.weight - leg.fuelOut;
      for (let k = 0; k < leg.burn; k++) {
        await wait(Math.max(0.06, 0.7 / leg.burn));
        audio.play('drain', { pitch: Math.max(0, 11 - k) });
        this.view.setLoad((cargo + leg.fuelOut - k - 1) / lv.ship.capacity, false);
      }
      // arrive at i + 1: the boxes for here are still aboard
      const next = i + 1;
      this.view.sync(next, m.baysAt(i), lv.boxes.filter((b) => b.from === next).map((b) => b.id).filter((id) => next < P - 1), 'tab');
      this.view.setPortSign(next);
      await this.view.steam('in', 1.1);
      audio.engine(false);
      audio.play('toot');
      say(`${lv.ports[next].name}`, `${lv.ports[next].code} · ROB ${leg.fuelIn} t`);
      const delivered = pr.calls[next].delivered;
      const dur = this.view.discharge(delivered, (id, at) => {
        const b = lv.boxes[id];
        freight += b.freight;
        this.pop(`+$${b.freight}`, at.x, at.y);
        audio.play('coin', { pitch: Math.random() });
      }, this.fast ? 0.1 : 0.22);
      await wait(dur);
      if (next < P - 1) {
        this.view.setLoad(pr.legs[next].weight / lv.ship.capacity);
        this.view.sync(next, m.baysAt(next), m.quayAt(next), 'edit');
        await wait(m.sim.plan[next].loads.length ? 0.75 : 0.2);
      } else {
        this.view.setLoad(Math.max(0, pr.finalRob) / lv.ship.capacity);
      }
    }
    banner.remove();
    void freight;
    await this.report();
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
    audio.play('win');
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
        <p class="logbook">${stars === 3 ? escapeHtml(lv.logbook ?? 'Full and down, and not a tonne wasted.') : `The best voyage earns <b>$${lv.stars[2]}</b>. ${pr.profit < lv.stars[1] ? 'Look again at what you left ashore.' : 'Close. One more change.'}`}</p>`,
    });
    const isLast = lv.n >= this.levels.length;
    openDialog({
      title: stars === 3 ? 'Full & Down' : stars === 2 ? 'Well sailed' : 'Contract met',
      head: stars === 3 ? 'yellow' : 'navy',
      cls: 'report-dlg',
      body: [card],
      row: true,
      buttons: [
        { label: 'Improve', onClick: () => this.backToPlan() },
        { label: isLast ? 'Chart' : 'Next voyage', cls: 'blue', onClick: () => (isLast ? this.showMap() : this.play(lv.n + 1)) },
      ],
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

  private backToPlan(): void {
    const m = this.model;
    if (!m) return;
    this.mode = 'plan';
    this.hud?.setBusy(false);
    this.view.load(m.level);
    this.onResize();
    this.view.sync(m.port, m.baysAt(m.port), m.quayAt(m.port), 'instant');
    this.lastWeight = -1;
    this.refresh(false);
  }

  // ───────────────────────────── menus ─────────────────────────────

  private openPause(): void {
    const lv = this.level;
    if (!lv) return;
    const d = openDialog({
      title: `${lv.n} · ${lv.title}`,
      onClose: () => undefined,
      body: [h('p', { html: `${escapeHtml(areaOf(lv).name)}. ★ $${lv.stars[0]} · ★★ $${lv.stars[1]} · ★★★ $${lv.stars[2]}` })],
      buttons: [
        { label: 'Resume', cls: 'blue', onClick: () => undefined },
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
          resetSave();
          this.save = loadSave();
          this.showMap();
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
