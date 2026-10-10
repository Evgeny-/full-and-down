// Local, playable comparison. The published HUD and all game rules stay in src/.
// ?current shows the original load panel; ?level=N selects any campaign mission.
import '@fontsource-variable/oswald';
import '@fontsource-variable/sofia-sans';
import '../src/ui/base.css';
import '../src/ui/game.css';
import '../src/ui/screens.css';
import './load-labels.css';
import { Hud } from '../src/ui/Hud';
import { glyph } from '../src/ui/glyphs';
import { bandOf } from '../src/core/rules';
import type { PlanModel } from '../src/game/Plan';
import type { Level, Projection } from '../src/core/types';

const params = new URLSearchParams(location.search);
params.set('debug', '');
params.set('nointro', '');
if (!params.has('level')) params.set('level', '2');
history.replaceState(null, '', `${location.pathname}?${params}`);

// These fields are private in the production class. Access is confined to this
// review page so the proposal can use its real cells, projection and controls.
type ReviewHud = {
  level: Level;
  load: HTMLElement;
  preview: { weight: number; to: number } | null;
  renderLoad(m: PlanModel, pr: Projection): void;
  renderFuel(m: PlanModel, pr: Projection): void;
};
const names = (level: Level, index: number) =>
  level.ship.bands.length === 2 ? ['LIGHT', 'LADEN'][index] : ['LIGHT', 'LADEN', 'DEEP'][index];

if (!params.has('current')) {
  document.documentElement.classList.add('review-load-labels');
  const proto = Hud.prototype as unknown as ReviewHud;
  const original = proto.renderLoad;
  proto.renderLoad = function (m, pr) {
    original.call(this, m, pr);
    const leg = pr.legs[m.port];
    if (!leg) return;
    const capacity = this.level.ship.capacity;
    const cargo = m.baysAt(m.port).flat().reduce((sum, id) => sum + this.level.boxes[id].weight, 0);
    const aboard = cargo + leg.fuelOut;
    const held = this.preview?.weight ?? 0;
    const missing = this.load.querySelectorAll('.c-need').length;
    const free = this.load.querySelectorAll('.c-free').length;
    const purchasable = this.level.ports[m.port].price !== null && m.needTotal() !== null;
    const projected = aboard + held + missing;
    const row = this.load.querySelector<HTMLElement>('.lrow')!;
    const existingHint = row.querySelector('.lhint')!;
    const note = document.createElement('div');
    note.className = 'load-state';
    row.querySelector('.eq')!.innerHTML = `<b class="c">Cargo</b> ${cargo} t + <span class="f" aria-label="Fuel" title="Fuel">${glyph('fuel', 11)}</span> ${leg.fuelOut} t`;
    const total = row.querySelector('.tot')!;
    total.innerHTML = `<small class="aboard-label">Aboard</small> ${aboard}<small>/${capacity} t</small>`;
    total.classList.toggle('bad', aboard > capacity);
    existingHint.remove();
    // Holding cargo is a preview, and has not changed the actual voyage yet.
    if (held) {
      note.innerHTML = `<span class="preview-note ${projected > capacity ? 'bad' : ''}">+${held} t ${projected > capacity ? `· ${projected - capacity} t over` : 'preview'}</span>`;
      note.title = `Preview +${held} t → ${projected}/${capacity} t; fuel unchanged`;
    } else if (aboard > capacity || projected > capacity) {
      note.append(existingHint);
      note.title = `${missing} t fuel ${purchasable ? 'to buy' : 'short'}; ${existingHint.textContent}`;
    } else if (missing && purchasable) {
      note.innerHTML = `<span class="need-note">Buy ${missing} t fuel</span>`;
      note.title = `${missing} t fuel to buy; ${free} t free after buying`;
    } else if (missing) {
      const previousPump = this.level.ports.slice(0, m.port).reverse().find(p => p.price !== null);
      const supply = this.level.ports[m.port].price === null && previousPump ? ` · carry from ${previousPump.code}` : '';
      note.innerHTML = `<span class="need-note bad">${missing} t fuel short</span>`;
      note.title = `${missing} t fuel short${supply}; ${Math.max(0, capacity - aboard)} t free aboard`;
    } else {
      note.append(existingHint);
    }
    note.setAttribute('aria-label', note.title || note.textContent || '');
    row.append(note);
    const cells = this.load.querySelector<HTMLElement>('.cells')!;
    // Label only the grey range, leaving cargo and fuel cells unobscured.
    if (free) {
      const n = Math.max(capacity, projected);
      const width = cells.clientWidth * free / n;
      if (width >= (missing ? 64 : 38)) {
        const label = document.createElement('span');
        label.className = 'free-label';
        label.style.left = `${projected / n * 100}%`;
        label.style.width = `${free / n * 100}%`;
        label.textContent = missing
          ? width >= 125 && purchasable ? `${free} t free after buying` : `${free} t after fuel`
          : `${free} t free`;
        label.title = `${free} t free ${held ? 'with preview' : missing ? 'including the missing fuel' : 'aboard'}`;
        cells.append(label);
      }
    }

    const now = bandOf(this.level.ship, Math.min(aboard, capacity));
    const after = bandOf(this.level.ship, Math.min(projected, capacity));
    const zones = this.load.querySelector<HTMLElement>('.zones')!;
    const state = held ? 'after loading the preview' : missing ? purchasable ? 'after buying fuel' : 'including the missing fuel' : 'aboard';
    zones.setAttribute('aria-label', `Burn bands. Aboard: ${names(this.level, now)}. ${names(this.level, after)} ${state}.`);
    zones.title = zones.getAttribute('aria-label')!;
    note.setAttribute('aria-description', zones.title);
  };
  const originalFuel = proto.renderFuel;
  proto.renderFuel = function (m, pr) {
    originalFuel.call(this, m, pr);
    if (this.level.ports[m.port].price !== null) return;
    const previous = this.level.ports.slice(0, m.port).reverse().find(p => p.price !== null);
    const carry = this.load.parentElement?.querySelector('.fuel .nf');
    if (carry && previous) carry.textContent = `Carry from ${previous.code}`;
  };
}

// Import after setting the query: App captures its debug/intro flags at import.
const { App } = await import('../src/app/App');
await new App().init();
