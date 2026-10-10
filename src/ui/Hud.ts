import { h } from './dom';
import { glyph, starSvg } from './glyphs';
import { flagSvg, type FlagId } from '../render/flags';
import { portColor } from '../render/portStyle';
import { bandOf } from '../core/rules';
import type { Level, Projection } from '../core/types';
import type { PlanModel } from '../game/Plan';
import type { Anchors } from '../render/GameView';

export interface HudHandlers {
  onPause(): void;
  onTab(port: number): void;
  onBunker(delta: number): void;
  onNeed(): void;
  onUndo(): void;
  onHint(): void;
  onSail(): void;
  onVoice(): void;
}

const BAND_NAMES = ['LIGHT', 'LADEN', 'DEEP'];
const BAND_COLORS = ['#8fb3d9', '#4a6fa5', '#1f2e4d'];

function bandName(level: Level, b: number): string {
  if (level.ship.bands.length === 2) return ['LIGHT', 'LADEN'][b];
  return BAND_NAMES[b] ?? 'DEEP';
}

const BAND_NIGHT = ['#8fb3d9', '#6d8fc4', '#c9d6ea'];

export function bandColor(level: Level, b: number): string {
  const cols = document.documentElement.classList.contains('night') ? BAND_NIGHT : BAND_COLORS;
  if (level.ship.bands.length === 2) return [cols[0], cols[2]][b];
  return cols[b];
}

/**
 * The game HUD: the title row, the freight rule with its stars, the route strip (port tabs, legs
 * with their burn, ROB at each port), the deadweight bar, the bunker valve, the dock and the
 * voice line that says why she can't sail yet.
 */
export class Hud {
  readonly root: HTMLElement;
  private top: HTMLElement;
  private title: HTMLElement;
  private rule: HTMLElement;
  private strip: HTMLElement;
  private dwt: HTMLElement;
  private bunker: HTMLElement;
  private voice: HTMLElement;
  private dock: HTMLElement;
  private sailBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private hintBtn: HTMLButtonElement;
  private tags: HTMLElement;
  private tagEls = new Map<number, HTMLElement>();
  private level!: Level;
  private lastProfit = 0;
  private preview: { weight: number; to: number } | null = null;
  private lastModel: PlanModel | null = null;
  private lastAnchors: Anchors | null = null;
  private bestStars = 0;

  constructor(parent: HTMLElement, private on: HudHandlers) {
    this.root = h('div', { class: 'hud passthru' });
    this.top = h('div', { class: 'hud-top' });
    const pause = h('button', { class: 'btn token', html: glyph('pause', 20), attrs: { 'aria-label': 'Pause' } });
    pause.addEventListener('click', () => on.onPause());
    this.title = h('div', { class: 'title plate' });
    this.top.append(pause, this.title);
    this.rule = h('div', { class: 'rule plate' });
    this.strip = h('div', { class: 'strip plate' });
    this.dwt = h('div', { class: 'dwt' });
    this.tags = h('div', { class: 'tags passthru' });
    this.bunker = h('div', { class: 'bunker plate' });
    this.voice = h('button', { class: 'voice' });
    this.voice.addEventListener('click', () => on.onVoice());
    this.dock = h('div', { class: 'dock' });
    this.undoBtn = h('button', { class: 'btn token', html: glyph('undo', 22), attrs: { 'aria-label': 'Undo' } });
    this.undoBtn.addEventListener('click', () => on.onUndo());
    this.hintBtn = h('button', { class: 'btn pilot', html: `<span class="flagsw G"></span><span>Pilot</span>` });
    this.hintBtn.addEventListener('click', () => on.onHint());
    this.sailBtn = h('button', { class: 'btn blue sail', html: `<span class="flagsw P"></span><span>Sail</span>` });
    this.sailBtn.addEventListener('click', () => on.onSail());
    this.dock.append(this.undoBtn, this.hintBtn, this.sailBtn);
    this.root.append(this.top, this.rule, this.strip, this.dwt, this.tags, this.bunker, this.voice, this.dock);
    parent.append(this.root);
  }

  setLevel(level: Level, area: string, best: number): void {
    this.level = level;
    this.bestStars = best;
    const fmt = level.format === 'exact' ? '<i class="fmt fd">Full &amp; Down</i>' : level.format === 'contract' ? '<i class="fmt ct">Contract</i>' : '';
    this.title.innerHTML = `<span class="lv num">${level.n}</span><span class="tt"><b>${level.title}</b><small class="caps">${area}${fmt}</small></span><span class="best">${[0, 1, 2].map((i) => starSvg(i < best, 15)).join('')}</span>`;
    this.lastProfit = 0;
    this.tagEls.forEach((t) => t.remove());
    this.tagEls.clear();
  }

  /** Height of the top block (for the 3D framing). */
  topHeight(): number {
    const r = this.strip.getBoundingClientRect();
    return r.bottom + 8;
  }

  bottomHeight(): number {
    const r = this.bunker.getBoundingClientRect();
    return window.innerHeight - r.top + 4;
  }

  /** While a box is held, the deadweight bar shows the cells it would take. */
  setPreview(p: { weight: number; to: number } | null): void {
    this.preview = p;
    if (this.lastModel) this.renderDwt(this.lastModel, this.lastModel.sim.projection, this.lastAnchors);
  }

  update(m: PlanModel, anchors: Anchors | null): void {
    this.lastModel = m;
    this.lastAnchors = anchors;
    const lv = this.level;
    const pr = m.sim.projection;
    this.renderRule(pr.profit, pr.problems.length > 0);
    this.renderStrip(m, pr);
    this.renderDwt(m, pr, anchors);
    this.renderBunker(m, pr);
    const refusal = m.sailRefusal();
    this.sailBtn.disabled = !!refusal;
    this.undoBtn.disabled = !m.canUndo;
    this.voice.classList.toggle('show', !!refusal);
    if (refusal) {
      const who = { chief: 'CHIEF', mate: 'MATE', pilot: 'PILOT', office: 'OFFICE', harbour: 'HARBOUR MASTER' }[refusal.who];
      const raw = refusal.text.replace(/^[A-Z ]+:\s*/, '');
      const text = raw.charAt(0).toUpperCase() + raw.slice(1);
      this.voice.innerHTML = `<b>${who}</b><span>${text}</span>${refusal.port !== m.port && refusal.code !== 'stars' ? `<em>${lv.ports[refusal.port].code} ›</em>` : ''}`;
      this.voice.dataset.port = String(refusal.port);
      this.voice.classList.toggle('money', refusal.code === 'stars');
    }
  }

  private renderRule(profit: number, bad: boolean): void {
    const [t1, t2, t3] = this.level.stars;
    // the track spans a window around the thresholds so the marks spread out
    const spread = Math.max(4, t3 - t1);
    const lo = Math.max(0, t1 - spread * 1.6);
    const hi = t3 + Math.max(2, spread * 0.25);
    const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
    const bump = profit !== this.lastProfit;
    this.lastProfit = profit;
    const money = profit < 0 ? `−<small>$</small>${-profit}` : `<small>$</small>${profit}`;
    const marks = [t1, t2, t3]
      .map((t, i) => ({ t, i }))
      .filter((x, k, arr) => arr.findIndex((y) => y.t === x.t) === k || true)
      .map(({ t, i }) => `<div class="mark ${profit >= t ? 'on' : ''}" style="left:${pos(t)}"><i>${'•'.repeat(i + 1)}</i></div>`)
      .join('');
    this.rule.innerHTML = `
      <div class="money num ${bad || profit < 0 ? 'bad' : ''} ${bump ? 'bump' : ''}">${money}</div>
      <div class="rcol">
        <div class="track">
          <div class="fill ${bad ? 'bad' : ''}" style="width:${pos(Math.max(lo, profit))}"></div>
          ${marks}
        </div>
        <div class="legend">${this.legend(profit)}</div>
      </div>`;
  }

  /** Star labels; equal thresholds share one label. */
  private legend(profit: number): string {
    const [t1, t2, t3] = this.level.stars;
    const groups: { t: number; n: number }[] = [];
    [t1, t2, t3].forEach((t, i) => {
      const g = groups.find((x) => x.t === t);
      if (g) g.n = i + 1;
      else groups.push({ t, n: i + 1 });
    });
    return groups
      .map((g) => {
        const on = profit >= g.t;
        return `<span class="${on ? 'on' : ''}">${starSvg(on, 12).repeat(g.n)}<b class="num">$${g.t}</b></span>`;
      })
      .join('');
  }

  private renderStrip(m: PlanModel, pr: Projection): void {
    const lv = this.level;
    const P = lv.ports.length;
    const cols: string[] = [];
    for (let i = 0; i < P; i++) {
      cols.push('auto');
      if (i < P - 1) cols.push('1fr');
    }
    this.strip.style.gridTemplateColumns = cols.join(' ');
    this.strip.classList.toggle('dense', P >= 5 || (P >= 4 && this.strip.clientWidth < 360));
    const parts: string[] = [];
    const problemPorts = new Set(pr.problems.map((p) => p.port));
    for (let i = 0; i < P; i++) {
      const p = lv.ports[i];
      const sel = i === m.port;
      const last = i === P - 1;
      const arrive = i > 0 ? pr.calls[i].arrivalFuel : null;
      const robOk = arrive === null || arrive >= lv.reserve;
      const pump = p.price === null ? `<span class="pump none">no fuel</span>` : `<span class="pump">${glyph('fuel', 11)}$${p.price}${p.lot && p.lot > 1 ? `<i>×${p.lot}</i>` : ''}</span>`;
      const bar = p.bar !== undefined ? `<span class="barsign" title="Harbour bar: at most ${p.bar} t aboard here">≤${p.bar}</span>` : '';
      const dot = m.bouncedPorts.has(i) || problemPorts.has(i) ? '<i class="dot"></i>' : '';
      parts.push(`
        <button class="port ${sel ? 'sel' : ''} ${last ? 'last' : ''}" data-port="${i}" ${last ? 'disabled' : ''}>
          <span class="pflag">${flagSvg(p.flag as FlagId, 24, 16)}${dot}${bar}</span>
          <span class="code num">${p.code}</span>
          ${last ? '<span class="pump fin">final</span>' : pump}
          ${arrive !== null ? `<span class="rob num ${robOk ? '' : 'bad'}">ROB ${arrive}</span>` : `<span class="rob num start">ROB ${lv.startFuel}</span>`}
        </button>`);
      if (!last) {
        const leg = pr.legs[i];
        const L = lv.legs[i];
        const short = Math.max(0, lv.reserve - leg.fuelIn);
        const cells: string[] = [];
        for (let k = 0; k < leg.burn; k++) cells.push(`<i class="${k >= leg.burn - short ? 'short' : ''}"></i>`);
        const zone = L.zone && lv.mechanics.includes('zone') ? `<span class="zone" title="Winter zone: after ${L.zone.at} day(s) she must weigh at most ${L.zone.limit} t">W≤${L.zone.limit}<small> @${L.zone.at}d</small></span>` : '';
        const bridge = L.bridge && lv.mechanics.includes('bridge') ? `<span class="bridge" title="Low bridge: she must weigh at least ${L.bridge.min} t when she sails">⌒≥${L.bridge.min}</span>` : '';
        parts.push(`
          <div class="leg ${short ? 'shortleg' : ''}" style="--band:${bandColor(lv, leg.band)}">
            <span class="ltop caps">${L.days}d<span class="bn"> · ${bandName(lv, leg.band)}</span></span>
            <span class="arrow"></span>
            <span class="cells">${cells.join('')}</span>
            <span class="burn num">−${leg.burn}${leg.reefers ? `<small>❄${leg.reefers}</small>` : ''}</span>
            ${zone || bridge ? `<span class="legsigns">${zone}${bridge}</span>` : ''}
          </div>`);
      }
    }
    this.strip.innerHTML = parts.join('');
    this.strip.querySelectorAll<HTMLButtonElement>('.port').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.port);
        if (i < P - 1) this.on.onTab(i);
      }),
    );
  }

  private renderDwt(m: PlanModel, pr: Projection, a: Anchors | null): void {
    const lv = this.level;
    const C = lv.ship.capacity;
    const leg = pr.legs[m.port];
    const bays = m.baysAt(m.port);
    // cargo by destination, then fuel (reserve shown darker), then spare
    const byDest = new Map<number, number>();
    for (const bay of bays) for (const id of bay) {
      const b = lv.boxes[id];
      byDest.set(b.to, (byDest.get(b.to) ?? 0) + b.weight);
    }
    const cells: string[] = [];
    const dests = [...byDest.keys()].sort((x, y) => x - y);
    for (const d of dests) for (let k = 0; k < byDest.get(d)!; k++) cells.push(`<i style="background:${portColor(d)}"></i>`);
    const pv = this.preview;
    if (pv) for (let k = 0; k < pv.weight; k++) cells.push(`<i class="ghost" style="--c:${portColor(pv.to)}"></i>`);
    const cargo = cells.length;
    const fuel = leg.fuelOut;
    for (let k = 0; k < fuel; k++) cells.push(`<i class="${k < lv.reserve ? 'res' : 'fuel'}"></i>`);
    const used = cargo + fuel;
    for (let k = used; k < C; k++) cells.push('<i class="free"></i>');
    const over = Math.max(0, used - C);
    // band zones under the cells
    let prev = 0;
    const zones = lv.ship.bands
      .map((b, i) => {
        const w = ((b.upTo - prev) / Math.max(C, used)) * 100;
        prev = b.upTo;
        return `<span style="width:${w}%;background:${bandColor(lv, i)}" class="${leg.band === i ? 'on' : ''}">×${b.rate}</span>`;
      })
      .join('');
    const band = bandOf(lv.ship, used);
    const nextUp = lv.ship.bands[band].upTo;
    const hint = pv ? `<b class="pv">+${pv.weight} t</b> → ${used > C ? `<b class="over">${over} t over</b>` : used === C ? '<b class="mark">on the mark</b>' : `${C - used} t spare`}` : used > C ? `<b class="over">${over} t over</b>` : used === C ? `<b class="mark">ON THE MARK</b>` : band < lv.ship.bands.length - 1 ? `▲${nextUp - used + 1} t to ${bandName(lv, band + 1)}` : `▲${C - used} t to the mark`;
    this.dwt.innerHTML = `
      <div class="dwt-row"><span class="caps">Deadweight</span><span class="num tot ${over ? 'bad' : ''}">${used}<small>/${C} t</small></span><span class="hint caps">${hint}</span></div>
      <div class="cells ${over ? 'over' : ''}" style="--n:${Math.max(C, used)}">${cells.join('')}<b class="smark" style="left:${(C / Math.max(C, used)) * 100}%">S</b></div>
      <div class="zones">${zones}</div>`;
    if (a) {
      this.dwt.style.top = `${Math.round(a.waterY + 11)}px`;
      const land = this.root.parentElement?.classList.contains('landscape');
      this.dwt.style.left = '12px';
      this.dwt.style.right = land ? '388px' : '12px';
    }
  }

  private bunkerKey = '';

  private renderBunker(m: PlanModel, pr: Projection): void {
    const lv = this.level;
    const p = lv.ports[m.port];
    const leg = pr.legs[m.port];
    const bought = m.sim.plan[m.port].bunker;
    const key = `${lv.n}|${m.port}|${p.price}|${lv.auto ? 1 : 0}`;
    if (key !== this.bunkerKey) {
      this.bunkerKey = key;
      this.bunker.classList.toggle('none', p.price === null);
      if (p.price === null) {
        this.bunker.innerHTML = `<span class="bk-l"><span class="caps">Bunkers</span><b>No bunkers at ${p.name}</b></span><span class="bk-r caps"><span class="aboard"></span></span>`;
      } else if (lv.auto) {
        this.bunker.innerHTML = `<span class="bk-l"><span class="caps">Bunkers $${p.price}/t · ${p.name}</span><b>${glyph('fuel', 14)} Chief orders <span class="num amt"></span></b></span><span class="bk-r caps auto">Auto<br>valve</span>`;
      } else {
        const lot = p.lot ?? 1;
        this.bunker.innerHTML = `
          <span class="bk-l"><span class="caps">Bunkers $${p.price}/t · ${p.name}</span><b>${glyph('fuel', 14)} <span class="num aboard"></span> aboard${lot > 1 ? ` <em class="lot">lots of ${lot}</em>` : ''}</b></span>
          <span class="stepper"><button class="btn small token minus" aria-label="Less fuel">${glyph('minus', 18)}</button><span class="num amt"></span><button class="btn small token plus" aria-label="More fuel">${glyph('plus', 18)}</button></span>
          <button class="btn small need">Need</button>`;
        holdRepeat(this.bunker.querySelector<HTMLButtonElement>('.minus')!, () => this.on.onBunker(-1));
        holdRepeat(this.bunker.querySelector<HTMLButtonElement>('.plus')!, () => this.on.onBunker(1));
        this.bunker.querySelector('.need')!.addEventListener('click', () => this.on.onNeed());
      }
    }
    const amt = this.bunker.querySelector('.amt');
    if (amt) amt.textContent = lv.auto ? `${bought} t` : String(bought);
    const aboard = this.bunker.querySelector('.aboard');
    if (aboard) aboard.textContent = p.price === null ? `ROB ${pr.calls[m.port].arrivalFuel} t aboard` : `${leg.fuelOut} t`;
    const minus = this.bunker.querySelector<HTMLButtonElement>('.minus');
    const plus = this.bunker.querySelector<HTMLButtonElement>('.plus');
    if (minus) minus.disabled = bought <= 0;
    if (plus) plus.disabled = leg.fuelOut + (p.lot ?? 1) > lv.ship.tank;
  }

  /** Freight tags under the boxes on the quay. */
  placeTags(items: { id: number; x: number; y: number; freight: number; to: number; held: boolean }[]): void {
    const seen = new Set<number>();
    for (const it of items) {
      seen.add(it.id);
      let el = this.tagEls.get(it.id);
      if (!el) {
        const port = this.level.ports[it.to];
        el = h('div', { class: 'tag', html: `<b class="num">$${it.freight}</b><span class="caps" style="--pc:${portColor(it.to)}">${port.code}</span>` });
        this.tags.append(el);
        this.tagEls.set(it.id, el);
      }
      el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) translate(-50%, 0)`;
      el.classList.toggle('held', it.held);
    }
    for (const [id, el] of this.tagEls) if (!seen.has(id)) {
      el.remove();
      this.tagEls.delete(id);
    }
  }

  positionBottom(_a: Anchors | null): void {
    /* the bunker plate is anchored to the bottom (CSS) */
  }

  setBusy(on: boolean): void {
    this.root.classList.toggle('sailing', on);
  }

  flashSail(): void {
    this.sailBtn.classList.remove('ready');
    void this.sailBtn.offsetWidth;
    this.sailBtn.classList.add('ready');
  }

  get bestEarned(): number {
    return this.bestStars;
  }
}

function holdRepeat(btn: HTMLButtonElement, fn: () => void): void {
  let timer = 0;
  let fired = false;
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    fired = true;
    fn();
    let delay = 380;
    const rep = () => {
      if (btn.disabled) return stop();
      fn();
      delay = Math.max(70, delay * 0.7);
      timer = window.setTimeout(rep, delay);
    };
    timer = window.setTimeout(rep, delay);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('click', (e) => {
    // keyboard activation
    if (!fired) fn();
    fired = false;
    e.preventDefault();
  });
}
