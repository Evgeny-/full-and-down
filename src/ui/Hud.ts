import { h } from './dom';
import { glyph, starSvg } from './glyphs';
import { portFlagImg } from '../render/portFlag';
import { portColor } from '../render/portStyle';
import { bandOf } from '../core/rules';
import type { Level, Projection } from '../core/types';
import type { PlanModel } from '../game/Plan';
import { shipKind, type Anchors } from '../render/GameView';

export interface HudHandlers {
  onPause(): void;
  onTab(port: number): void;
  onBunker(delta: number): void;
  onNeed(): void;
  onUndo(): void;
  onHint(): void;
  onSail(): void;
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
 * The game HUD. At the top: the title, the profit rule with its stars and the route (ports, legs,
 * and the fuel she carries from here to the next pump). At the bottom, the call she's making now:
 * the load bar (cargo and fuel share her deadweight, and the weight sets the burn) and the fuel
 * she buys here. Then the dock: undo, hint, SAIL.
 */
export class Hud {
  readonly root: HTMLElement;
  private head: HTMLElement;
  private foot: HTMLElement;
  private title: HTMLElement;
  private rule: HTMLElement;
  private strip: HTMLElement;
  private load: HTMLElement;
  private fuel: HTMLElement;
  private sailBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private hintBtn: HTMLButtonElement;
  private tags: HTMLElement;
  private tagEls = new Map<number, HTMLElement>();
  private level!: Level;
  private lastProfit = 0;
  private preview: { weight: number; to: number } | null = null;
  private lastModel: PlanModel | null = null;
  private bestStars = 0;

  constructor(parent: HTMLElement, private on: HudHandlers) {
    this.root = h('div', { class: 'hud passthru' });
    this.head = h('div', { class: 'hud-head passthru' });
    const top = h('div', { class: 'hud-top' });
    const pause = h('button', { class: 'btn token', html: glyph('pause', 20), attrs: { 'aria-label': 'Pause' } });
    pause.addEventListener('click', () => on.onPause());
    this.title = h('div', { class: 'title plate' });
    top.append(pause, this.title);
    this.rule = h('div', { class: 'rule plate' });
    this.strip = h('div', { class: 'strip plate' });
    this.head.append(top, this.rule, this.strip);
    this.tags = h('div', { class: 'tags passthru' });
    this.foot = h('div', { class: 'hud-foot passthru' });
    const panel = h('div', { class: 'cargo plate' });
    this.load = h('div', { class: 'load' });
    this.fuel = h('div', { class: 'fuel' });
    panel.append(this.load, this.fuel);
    const dock = h('div', { class: 'dock' });
    this.undoBtn = h('button', { class: 'btn token', html: glyph('undo', 22), attrs: { 'aria-label': 'Undo' } });
    this.undoBtn.addEventListener('click', () => on.onUndo());
    this.hintBtn = h('button', { class: 'btn pilot', html: `${glyph('bulb', 22)}<span>Hint</span>` });
    this.hintBtn.addEventListener('click', () => on.onHint());
    this.sailBtn = h('button', { class: 'btn blue sail', html: `<span class="flagsw P"></span><span class="lbl"><span class="to">Sail</span><small></small></span>` });
    this.sailBtn.addEventListener('click', () => on.onSail());
    dock.append(this.undoBtn, this.hintBtn, this.sailBtn);
    this.foot.append(panel, dock);
    this.root.append(this.head, this.tags, this.foot);
    parent.append(this.root);
  }

  setLevel(level: Level, area: string, best: number): void {
    this.level = level;
    this.bestStars = best;
    const fmt = level.format === 'exact' ? '<i class="fmt fd">Full &amp; Down</i>' : level.format === 'contract' ? '<i class="fmt ct">Contract</i>' : '';
    this.title.innerHTML = `<span class="lv num">${level.n}</span><span class="tt"><b>${level.title}</b><small class="caps">${area}${fmt}</small></span><span class="best">${[0, 1, 2].map((i) => starSvg(i < best, 15)).join('')}</span>`;
    this.lastProfit = 0;
    this.fuelKey = '';
    this.tagEls.forEach((t) => t.remove());
    this.tagEls.clear();
  }

  /** Bottom of the top block (for the 3D framing). */
  topHeight(): number {
    if (this.root.parentElement?.classList.contains('landscape')) return 8;
    return this.head.getBoundingClientRect().bottom;
  }

  /** Height of the bottom block, from the bottom of the screen. */
  bottomHeight(): number {
    return window.innerHeight - this.foot.getBoundingClientRect().top;
  }

  /** While a box is held, the load bar shows the cells it would take. */
  setPreview(p: { weight: number; to: number } | null): void {
    this.preview = p;
    if (this.lastModel) this.renderLoad(this.lastModel, this.lastModel.sim.projection);
  }

  update(m: PlanModel, _anchors: Anchors | null): void {
    this.lastModel = m;
    const lv = this.level;
    const pr = m.sim.projection;
    // red only for a loss: shortfalls at later calls are bought there, not here
    this.renderRule(pr.profit, pr.profit < 0);
    this.renderStrip(m, pr);
    this.renderLoad(m, pr);
    this.renderFuel(m, pr);
    const refusal = m.legRefusal();
    this.sailBtn.classList.toggle('blocked', !!refusal);
    const next = lv.ports[Math.min(lv.ports.length - 1, m.port + 1)];
    this.sailBtn.querySelector('.to')!.textContent = 'Sail';
    this.sailBtn.querySelector('small')!.textContent = refusal ? shortReason(lv, refusal) : `to ${next.name}${m.port + 1 === lv.ports.length - 1 ? ' · final' : ''}`;
    this.undoBtn.disabled = !m.canUndo;
  }

  /** Pulse a part of the HUD so the eye goes there. */
  pulse(what: 'need' | 'plus' | 'dwt' | 'rule' | 'sail' | 'strip' | 'bunker' | null): void {
    this.root.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse'));
    if (!what) return;
    const el = {
      need: this.fuel.querySelector('.buy'),
      plus: this.fuel.querySelector('.plus'),
      dwt: this.load,
      rule: this.rule,
      sail: this.sailBtn,
      strip: this.strip,
      bunker: this.fuel,
    }[what];
    el?.classList.add('pulse');
  }

  private renderRule(profit: number, bad: boolean): void {
    const [t1, , t3] = this.level.stars;
    // the track spans a window around the thresholds so the marks spread out
    const spread = Math.max(4, t3 - t1);
    const lo = Math.max(0, t1 - spread * 1.6);
    const hi = t3 + Math.max(2, spread * 0.25);
    const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
    const bump = profit !== this.lastProfit;
    this.lastProfit = profit;
    const money = `<span class="v">${profit < 0 ? `−<small>$</small>${-profit}` : `<small>$</small>${profit}`}</span>`;
    const marks = this.level.stars.map((t, i) => `<div class="mark ${profit >= t ? 'on' : ''}" style="left:${pos(t)}"><i>${'•'.repeat(i + 1)}</i></div>`).join('');
    this.rule.innerHTML = `
      <div class="money num ${bad || profit < 0 ? 'bad' : ''} ${bump ? 'bump' : ''}"><span class="cap">Profit</span>${money}</div>
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
    const groups: { t: number; n: number }[] = [];
    this.level.stars.forEach((t, i) => {
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

  /** The last port the fuel bought here has to reach: the next one that sells bunkers. */
  private reach(m: PlanModel): number {
    const lv = this.level;
    let until = m.port + 1;
    while (until < lv.ports.length - 1 && lv.ports[until].price === null) until++;
    return until;
  }

  /**
   * The route. Ports carry their flag, a code chip in the colour of the boxes bound there, and the
   * pump price. The legs this call's fuel must cover show their burn, and the ports along them
   * show the fuel she'll have left: fuel aboard → −burn → left on arrival.
   */
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
    const until = this.reach(m);
    const dests = new Set(lv.boxes.map((b) => b.to));
    const parts: string[] = [];
    for (let i = 0; i < P; i++) {
      const p = lv.ports[i];
      const last = i === P - 1;
      const state = i < m.port ? 'done' : i === m.port ? 'here' : 'later';
      const pump = last ? '<span class="pump fin">final</span>' : p.price === null ? '<span class="pump none">no fuel</span>' : `<span class="pump">${glyph('fuel', 11)}$${p.price}${p.lot && p.lot > 1 ? `<i>×${p.lot}</i>` : ''}</span>`;
      const bar = p.bar !== undefined ? `<span class="barsign" title="Harbour bar: at most ${p.bar} t aboard here">≤${p.bar}</span>` : '';
      const code = dests.has(i) ? `<span class="code chip num" style="--pc:${portColor(i)}">${p.code}</span>` : `<span class="code num">${p.code}</span>`;
      let fuel = '<span class="arr"></span>';
      if (state === 'here') fuel = `<span class="arr have num">${glyph('fuel', 10)}${pr.legs[i]?.fuelOut ?? 0} t</span>`;
      else if (i > m.port && i <= until) {
        const left = pr.calls[i].arrivalFuel;
        const short = lv.reserve - left;
        fuel = short > 0 ? `<span class="arr bad num">${short} t short</span>` : `<span class="arr ok num">${glyph('fuel', 10)}${left} t</span>`;
      }
      parts.push(`
        <button class="port ${state} ${last ? 'last' : ''}" data-port="${i}">
          ${state === 'here' ? `<span class="youare">${glyph('anchor', 10)}${p.name}</span>` : state === 'done' ? '<span class="tick">✓</span>' : ''}
          <span class="pflag">${portFlagImg(p, 24, 16)}${bar}</span>
          ${code}
          ${pump}
          ${fuel}
        </button>`);
      if (!last) {
        const leg = pr.legs[i];
        const L = lv.legs[i];
        const active = i >= m.port && i < until;
        const short = active ? Math.max(0, lv.reserve - leg.fuelIn) : 0;
        const zone = L.zone && lv.mechanics.includes('zone') ? `<span class="zone" title="Winter zone: after ${L.zone.at} day(s) she must weigh at most ${L.zone.limit} t">W≤${L.zone.limit}<small> @${L.zone.at}d</small></span>` : '';
        const bridge = L.bridge && lv.mechanics.includes('bridge') ? `<span class="bridge" title="Low bridge: she must weigh at least ${L.bridge.min} t when she sails">⌒≥${L.bridge.min}</span>` : '';
        parts.push(`
          <div class="leg ${active ? 'active' : i < m.port ? 'done' : 'later'} ${short ? 'shortleg' : ''}" style="--band:${active ? bandColor(lv, leg.band) : 'var(--enamel-3)'}">
            <span class="ltop caps">${L.days} day${L.days > 1 ? 's' : ''}</span>
            <span class="arrow"></span>
            ${active ? `<span class="burn num">−${leg.burn} t${leg.reefers ? `<small>❄${leg.reefers}</small>` : ''}</span>` : ''}
            ${zone || bridge ? `<span class="legsigns">${zone}${bridge}</span>` : ''}
          </div>`);
      }
    }
    this.strip.innerHTML = parts.join('');
    this.strip.querySelectorAll<HTMLButtonElement>('.port').forEach((b) =>
      b.addEventListener('click', () => {
        this.on.onTab(Number(b.dataset.port));
      }),
    );
  }

  /** Fuel she still has to take on here to reach the next pump (0 when she has enough). */
  private missingFuel(m: PlanModel): number {
    const need = m.needTotal();
    if (need !== null) return Math.max(0, need - m.sim.plan[m.port].bunker);
    const r = m.legRefusal();
    return r?.code === 'short' ? (r.amount ?? 0) : 0;
  }

  /**
   * The load bar: one cell per tonne of her deadweight. Cargo in the colours of its ports, fuel in
   * amber, the fuel she still needs hatched, then the free tonnes. Underneath, the weight bands:
   * the heavier she sails, the more she burns a day.
   */
  private renderLoad(m: PlanModel, pr: Projection): void {
    const lv = this.level;
    const C = lv.ship.capacity;
    const leg = pr.legs[m.port];
    if (!leg) return;
    const bays = m.baysAt(m.port);
    const byDest = new Map<number, number>();
    for (const bay of bays) for (const id of bay) {
      const b = lv.boxes[id];
      byDest.set(b.to, (byDest.get(b.to) ?? 0) + b.weight);
    }
    const cells: string[] = [];
    let cargo = 0;
    for (const d of [...byDest.keys()].sort((x, y) => x - y)) for (let k = 0; k < byDest.get(d)!; k++, cargo++) cells.push(`<i style="background:${portColor(d)}"></i>`);
    const pv = this.preview;
    if (pv) for (let k = 0; k < pv.weight; k++) cells.push(`<i class="c-ghost" style="--c:${portColor(pv.to)}"></i>`);
    const fuel = leg.fuelOut;
    for (let k = 0; k < fuel; k++) cells.push('<i class="c-fuel"></i>');
    const missing = pv ? 0 : this.missingFuel(m);
    for (let k = 0; k < missing; k++) cells.push('<i class="c-need"></i>');
    const used = cargo + (pv?.weight ?? 0) + fuel;
    const total = used + missing;
    for (let k = total; k < C; k++) cells.push('<i class="c-free"></i>');
    const n = Math.max(C, total);
    // cells past her marks are drawn over the red line
    const over = Math.max(0, used - C);
    let hint: string;
    if (pv) hint = used > C ? `<b class="bad">+${pv.weight} t → ${used - C} t over</b>` : `<b>+${pv.weight} t → ${used}/${C} t</b>`;
    else if (over) hint = `<b class="bad">${over} t too heavy</b>`;
    else if (missing && total > C) hint = `<b class="bad">no room for ${missing} t fuel</b>`;
    else if (missing) hint = `<b class="short">needs ${missing} t more fuel</b>`;
    else if (used === C) hint = '<b class="mark">on her marks</b>';
    else hint = `${C - used} t spare`;
    let prev = 0;
    const bands = lv.ship.bands;
    const sailBand = bandOf(lv.ship, Math.min(used + missing, C));
    const zones = bands
      .map((b, i) => {
        const frac = (b.upTo - prev) / n;
        prev = b.upTo;
        const wide = frac > 0.24;
        return `<span style="width:${frac * 100}%;--z:${bandColor(lv, i)}" class="${sailBand === i ? 'on' : ''}">${wide ? `${bandName(lv, i)} · ` : ''}${b.rate} t/day</span>`;
      })
      .join('');
    this.load.innerHTML = `
      <div class="lrow"><span class="eq caps"><b class="c">Cargo</b> ${cargo + (pv?.weight ?? 0)} t + <b class="f">fuel</b> ${fuel} t</span><span class="num tot ${over ? 'bad' : ''}">${used}<small>/${C} t</small></span><span class="lhint">${hint}</span></div>
      <div class="cells ${over || total > C ? 'over' : ''}" style="--n:${n}">${cells.join('')}<b class="smark" style="left:${(C / n) * 100}%"></b></div>
      ${bands.length > 1 ? `<div class="zones">${zones}</div>` : `<div class="zones one"><span class="on" style="width:100%;--z:${bandColor(lv, 0)}">burns ${bands[0].rate} t/day</span></div>`}`;
  }

  private fuelKey = '';

  private renderFuel(m: PlanModel, pr: Projection): void {
    const lv = this.level;
    const p = lv.ports[m.port];
    const leg = pr.legs[m.port];
    if (!leg) return;
    const bought = m.sim.plan[m.port].bunker;
    const key = `${lv.n}|${m.port}|${p.price}|${lv.auto ? 1 : 0}`;
    if (key !== this.fuelKey) {
      this.fuelKey = key;
      this.fuel.classList.toggle('none', p.price === null);
      if (p.price === null) {
        this.fuel.innerHTML = `<div class="fl"><span class="caps">No fuel sold at ${p.name}</span><span class="fa">${glyph('fuel', 15)}<b class="num aboard"></b><small>aboard</small></span></div><span class="nf caps">Carry what<br>you need</span>`;
      } else if (lv.auto) {
        this.fuel.innerHTML = `<div class="fl"><span class="caps">Fuel · $${p.price}/t at ${p.name}</span><span class="fa">${glyph('fuel', 15)}<b class="num aboard"></b><small class="bought"></small></span></div><span class="nf caps">Chief<br>orders</span>`;
      } else {
        const lot = p.lot ?? 1;
        this.fuel.innerHTML = `
          <div class="fl"><span class="caps">Fuel · <b>$${p.price}</b>/t at ${p.name}${lot > 1 ? ` · lots of ${lot}` : ''}</span><span class="fa">${glyph('fuel', 15)}<b class="num aboard"></b><small class="bought"></small></span></div>
          <button class="btn small token minus" aria-label="Less fuel">${glyph('minus', 18)}</button>
          <button class="btn small token plus" aria-label="More fuel">${glyph('plus', 18)}</button>
          <button class="btn small buy">Buy</button>`;
        holdRepeat(this.fuel.querySelector<HTMLButtonElement>('.minus')!, () => this.on.onBunker(-1));
        holdRepeat(this.fuel.querySelector<HTMLButtonElement>('.plus')!, () => this.on.onBunker(1));
        this.fuel.querySelector('.buy')!.addEventListener('click', () => this.on.onNeed());
      }
    }
    this.fuel.querySelector('.aboard')!.textContent = `${leg.fuelOut} t`;
    const small = this.fuel.querySelector('.bought');
    if (small) small.textContent = bought > 0 ? `aboard · +${bought} t $${bought * (p.price ?? 0)}` : 'aboard';
    const minus = this.fuel.querySelector<HTMLButtonElement>('.minus');
    const plus = this.fuel.querySelector<HTMLButtonElement>('.plus');
    if (minus) minus.disabled = bought <= 0;
    if (plus) plus.disabled = leg.fuelOut + (p.lot ?? 1) > lv.ship.tank;
    const buy = this.fuel.querySelector<HTMLButtonElement>('.buy');
    if (buy && p.price !== null) {
      const total = m.needTotal();
      const more = total === null ? null : total - bought;
      buy.classList.remove('ok', 'spare');
      if (more === null) {
        buy.innerHTML = 'Can’t<small>reach it</small>';
        buy.disabled = true;
      } else if (more > 0) {
        buy.innerHTML = `Buy ${more} t<small>$${more * p.price}</small>`;
        buy.disabled = false;
      } else if (more === 0) {
        buy.innerHTML = `<span class="ck">${glyph('check', 15)}Enough</span>`;
        buy.disabled = true;
        buy.classList.add('ok');
      } else {
        // more than the next pump needs: fine if she's carrying it on purpose; a tap trims it
        buy.innerHTML = `<span class="ck">${glyph('check', 14)}Enough</span><small>+${-more} t spare</small>`;
        buy.disabled = false;
        buy.classList.add('ok', 'spare');
      }
    }
  }

  /** Freight tags under the boxes on the quay. */
  placeTags(items: { id: number; x: number; y: number; freight: number; to: number; held: boolean }[]): void {
    const seen = new Set<number>();
    for (const it of items) {
      seen.add(it.id);
      let el = this.tagEls.get(it.id);
      if (!el) {
        const port = this.level.ports[it.to];
        // a bulk parcel's weight plate is small: the tag repeats it
        const wt = shipKind(this.level) === 'bulker' ? `<i class="wt num">${this.level.boxes[it.id].weight} t</i>` : '';
        el = h('div', { class: 'tag', html: `${wt}<b class="num">$${it.freight}</b><span class="caps" style="--pc:${portColor(it.to)}">${port.code}</span>` });
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
    /* the bottom block is anchored to the bottom (CSS) */
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

/** A couple of words for the SAIL button: why she can't go yet. */
export function shortReason(level: Level, r: { code: string; amount?: number }): string {
  const n = r.amount ?? 0;
  switch (r.code) {
    case 'short':
      return `${n} t fuel short`;
    case 'overMarks':
      return `${n} t too heavy`;
    case 'bar':
    case 'barAhead':
      return `${n} t too deep`;
    case 'zone':
      return `${n} t over winter mark`;
    case 'bridge':
      return `${n} t too light`;
    case 'contract':
      return 'contract box ashore';
    case 'stars':
      return `earn $${level.stars[0]}`;
    default:
      return 'not ready';
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
