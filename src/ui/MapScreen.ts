import { h } from './dom';
import { glyph, starSvg } from './glyphs';
import { AREAS } from '../app/areas';
import { unlockedUpTo, type SaveData } from '../app/save';
import type { Level } from '../core/types';
import { audio } from '../audio/audio';

export interface MapHandlers {
  onPlay(n: number): void;
  onSettings(): void;
}

const ROSE = `<svg class="rose" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="none" stroke="#c2257e" stroke-width="1.2" opacity=".55"/><circle cx="60" cy="60" r="44" fill="none" stroke="#c2257e" stroke-width=".8" opacity=".45"/>${Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2;
  const r1 = i % 4 === 0 ? 40 : 48;
  return `<line x1="${60 + Math.cos(a) * r1}" y1="${60 + Math.sin(a) * r1}" x2="${60 + Math.cos(a) * 54}" y2="${60 + Math.sin(a) * 54}" stroke="#c2257e" stroke-width=".8" opacity=".5"/>`;
}).join('')}<path d="M60 8 L67 60 L60 112 L53 60Z" fill="#c2257e" opacity=".5"/><path d="M8 60 L60 53 L112 60 L60 67Z" fill="#c2257e" opacity=".35"/><text x="60" y="6" font-family="Oswald Variable, Oswald, sans-serif" font-size="9" text-anchor="middle" fill="#c2257e">N</text></svg>`;

/** The pilot chart: eight sea areas, nine ports each, on a dashed magenta track. */
export class MapScreen {
  readonly el: HTMLElement;
  private scroller: HTMLElement;
  private header: HTMLElement;

  constructor(parent: HTMLElement, private on: MapHandlers) {
    this.el = h('div', { class: 'map hidden' });
    this.header = h('div', { class: 'map-top' });
    this.scroller = h('div', { class: 'map-scroll' });
    this.el.append(this.scroller, this.header);
    parent.append(this.el);
  }

  show(levels: Level[], save: SaveData): void {
    this.el.classList.remove('hidden');
    const total = levels.reduce((s, l) => s + (save.levels[l.n]?.stars ?? 0), 0);
    this.header.innerHTML = '';
    const logo = h('div', { class: 'logo', html: `<span class="mark"></span><span><b>Full &amp; Down</b><small class="caps">Load her to the marks</small></span>` });
    const stars = h('div', { class: 'plate tot', html: `${starSvg(true, 16)}<span class="num">${total}</span><span class="of">/${levels.length * 3}</span>` });
    const gear = h('button', { class: 'btn token', html: glyph('gear', 20), attrs: { 'aria-label': 'Settings' } });
    gear.addEventListener('click', () => {
      audio.play('button');
      this.on.onSettings();
    });
    this.header.append(logo, stars, gear);

    const open = unlockedUpTo(save, levels.length);
    this.scroller.innerHTML = '';
    const chart = h('div', { class: 'chart' });
    let current: HTMLElement | null = null;
    const per = 9;
    const areas = Math.ceil(levels.length / per);
    for (let a = 0; a < areas; a++) {
      const area = AREAS[a] ?? AREAS[AREAS.length - 1];
      const list = levels.slice(a * per, a * per + per);
      const got = list.reduce((s, l) => s + (save.levels[l.n]?.stars ?? 0), 0);
      const locked = list[0] && list[0].n > open;
      const sec = h('section', { class: 'area' + (locked ? ' locked' : '') });
      sec.style.setProperty('--sea', area.sea);
      sec.style.setProperty('--land', area.land);
      sec.append(
        h('div', { class: 'area-head plate rivets', html: `<span class="an num">${a + 1}</span><span class="at"><b>${area.name}</b><small>${area.blurb}</small></span><span class="as">${starSvg(true, 13)}<span class="num">${got}/${list.length * 3}</span></span>` }),
      );
      const W = 340;
      const step = 74;
      const pts = list.map((_, k) => ({ x: W / 2 + Math.sin(k * 1.05 + a * 1.7) * W * 0.3, y: 46 + k * step }));
      const H = 46 + list.length * step;
      const path = pts.map((p, k) => (k ? `S${(pts[k - 1].x + p.x) / 2 + (k % 2 ? 30 : -30)} ${p.y - step / 2} ${p.x} ${p.y}` : `M${p.x} ${p.y}`)).join(' ');
      const coast = `<path d="M0 0 C 40 ${H * 0.2} 10 ${H * 0.5} 34 ${H * 0.75} S 8 ${H} 0 ${H} Z" fill="var(--land)"/><path d="M${W} 0 C ${W - 30} ${H * 0.3} ${W - 6} ${H * 0.55} ${W - 26} ${H * 0.8} S ${W} ${H} ${W} ${H} Z" fill="var(--land)"/>`;
      const svgEl = h('div', {
        class: 'track',
        html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${coast}<path d="${path}" fill="none" stroke="#c2257e" stroke-width="2.4" stroke-dasharray="7 6" opacity=".75"/></svg>`,
      });
      svgEl.style.height = `${H}px`;
      list.forEach((lv, k) => {
        const p = pts[k];
        const rec = save.levels[lv.n];
        const isOpen = lv.n <= open;
        const isCur = lv.n === open && !rec?.stars;
        const boss = (lv.n - 1) % per === per - 1;
        const breather = (lv.n - 1) % per === 4;
        const btn = h('button', {
          class: `node${isOpen ? '' : ' locked'}${isCur ? ' cur' : ''}${boss ? ' boss' : ''}${breather ? ' fd' : ''}${rec?.stars === 3 ? ' full' : ''}`,
          html: `<span class="disc num">${isOpen ? lv.n : glyph('lock', 16)}</span>${rec?.stars ? `<span class="ns">${[0, 1, 2].map((i) => starSvg(i < rec.stars, 12)).join('')}</span>` : ''}${isCur ? `<span class="you">${glyph('ship', 18)}</span>` : ''}<span class="nt">${lv.title}</span>`,
          attrs: { 'aria-label': `Voyage ${lv.n}: ${lv.title}` },
        });
        btn.style.left = `${(p.x / W) * 100}%`;
        btn.style.top = `${p.y}px`;
        btn.classList.add(p.x > W / 2 ? 'right' : 'left');
        if (isOpen) btn.addEventListener('click', () => {
          audio.unlock();
          audio.play('button');
          this.on.onPlay(lv.n);
        });
        if (isCur || (!current && lv.n === open)) current = btn;
        svgEl.append(btn);
      });
      sec.append(svgEl);
      chart.append(sec);
    }
    chart.insertAdjacentHTML('afterbegin', ROSE);
    chart.append(h('p', { class: 'map-foot', html: 'Full &amp; Down · a puzzle about bunkers, boxes and the marks' }));
    this.scroller.append(chart);
    requestAnimationFrame(() => {
      if (current) {
        const r = current.getBoundingClientRect();
        this.scroller.scrollTop += r.top - window.innerHeight * 0.55;
      }
    });
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}
