// Audition page for Full & Down's audio: every SFX (and each of its pitch steps), the harbour bed,
// the diesel with a load slider, each sea region's music, a few in-context scenes, and offline
// measurements. Also exposes `window.audit` for review/audio-check.mjs.
import { audio, audioEngine, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME, type SfxName } from '../src/audio/audio';
import { SONGS } from '../src/audio/music';
import { bakedInfo, measure, type Metrics, renderAmbience, renderEngine, renderMusic, renderSfx, toWav } from '../src/audio/render';
import { PITCH_STEPS, sfxCatalog } from '../src/audio/sfx';

const main = document.getElementById('main')!;
const status = document.getElementById('status')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ volumes and unlock

let sfxVol = DEFAULT_SFX_VOLUME;
let musicVol = DEFAULT_MUSIC_VOLUME;
let muted = false;
const applyVolumes = () => {
  audio.setSfxVolume(muted ? 0 : sfxVol);
  audio.setMusicVolume(muted ? 0 : musicVol);
};
window.addEventListener('pointerdown', () => {
  audio.unlock();
  applyVolumes();
}, { capture: true });
window.addEventListener('keydown', () => audio.unlock(), { capture: true });

const muteBtn = document.getElementById('mute') as HTMLButtonElement;
muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.classList.toggle('on', muted);
  muteBtn.textContent = muted ? 'Muted' : 'Mute';
  applyVolumes();
};
(document.getElementById('sfx') as HTMLInputElement).oninput = (e) => {
  sfxVol = Number((e.target as HTMLInputElement).value);
  applyVolumes();
};
(document.getElementById('music') as HTMLInputElement).oninput = (e) => {
  musicVol = Number((e.target as HTMLInputElement).value);
  applyVolumes();
};

// ------------------------------------------------------------------ SFX

const GROUPS: [string, string, SfxName[]][] = [
  ['Crane and cargo', 'loading the ship', ['button', 'pick', 'crane', 'drop', 'undo', 'invalid']],
  ['Bunkering', 'fuel from the barge', ['ratchet', 'glug', 'cell', 'drain']],
  ['Ship and harbour', 'signals, water, the crew', ['horn', 'toot', 'bell', 'pipe', 'gull', 'splash', 'flag', 'whistle', 'sputter']],
  ['Results', 'the customs desk and rewards', ['stamp', 'star', 'coin', 'win', 'fail', 'unlock']],
];
const NOTES: Partial<Record<SfxName, string>> = {
  button: 'Aldis shutter (UI tap)',
  pick: 'hook clank + chain',
  crane: 'slew/hoist motor (pitch: light→heavy)',
  drop: 'twist-lock clunk (pitch: weight 1–5)',
  undo: 'reversed whoosh',
  invalid: 'reversing beeper',
  ratchet: 'handwheel notch',
  glug: 'one pump pulse',
  cell: 'cell full (0–11 climbs)',
  drain: 'cell burned (0–11)',
  horn: 'typhon (pitch: ship size)',
  toot: 'tug / pilot',
  bell: "ship's bell, ding-ding",
  pipe: "bosun's call",
  gull: 'kee-ow',
  splash: 'line hits the water',
  flag: 'halyard + cloth',
  whistle: 'harbour master',
  sputter: 'out of fuel',
  stamp: 'customs stamp (0–2)',
  star: 'one star (0–2)',
  coin: 'freight paid',
  win: 'arrival fanfare (in the key of the last music)',
  fail: 'gentle wah-wah',
  unlock: 'new mechanic',
};

for (const [title, sub, names] of GROUPS) {
  main.append(el('h2', {}, title, el('small', {}, sub)));
  const grid = el('div', { className: 'grid' });
  for (const name of names) {
    const steps = PITCH_STEPS[name];
    if (!steps) {
      grid.append(el('button', { onclick: () => audio.play(name) }, name, el('small', {}, NOTES[name] ?? '')));
      continue;
    }
    for (let p = 0; p < steps; p++) {
      grid.append(el('button', { onclick: () => audio.play(name, { pitch: p }) }, `${name} ${p}`, el('small', {}, p === 0 ? (NOTES[name] ?? '') : ' ')));
    }
  }
  main.append(grid);
}

// ------------------------------------------------------------------ scenes

const scene = (label: string, desc: string, run: () => Promise<void>) =>
  el('button', { onclick: () => void run() }, label, el('small', {}, desc));

main.append(el('h2', {}, 'Scenes', el('small', {}, 'a few moves of the game, in order')));
main.append(el('div', { className: 'grid' },
  scene('Load a box', 'pick, slew, drop', async () => {
    audio.play('pick');
    await wait(200);
    audio.play('crane', { pitch: 1 });
    await wait(650);
    audio.play('crane', { pitch: 1 });
    await wait(500);
    audio.play('drop', { pitch: 2 });
  }),
  scene('Load heavy, then a no-go', 'heavy box, invalid slot, undo', async () => {
    audio.play('pick');
    await wait(180);
    audio.play('crane', { pitch: 4 });
    await wait(600);
    audio.play('invalid');
    await wait(700);
    audio.play('undo');
    await wait(500);
    audio.play('drop', { pitch: 4 });
  }),
  scene('Bunker a tank', 'handwheel, then a glug per cell', async () => {
    for (let i = 0; i < 4; i++) {
      audio.play('ratchet');
      await wait(110);
    }
    await wait(300);
    for (let i = 0; i < 8; i++) {
      audio.play('glug');
      await wait(140);
      audio.play('cell', { pitch: i });
      await wait(330);
    }
  }),
  scene('Cast off', 'pipe, flag, horn, tug, splash, engine', async () => {
    audio.play('pipe');
    await wait(1400);
    audio.play('flag');
    await wait(900);
    audio.play('horn');
    await wait(1900);
    audio.play('splash');
    await wait(400);
    audio.play('toot');
    audio.engine(true, 0.4);
    setEngineUi(true, 0.4);
  }),
  scene('Burn the fuel', 'cells drain down on the chart', async () => {
    for (let i = 7; i >= 0; i--) {
      audio.play('drain', { pitch: i });
      await wait(380);
    }
  }),
  scene('Run out of fuel', 'sputter, then the tug', async () => {
    audio.engine(false);
    setEngineUi(false);
    audio.play('sputter');
    await wait(3200);
    audio.play('gull');
    await wait(1500);
    audio.play('toot');
  }),
  scene('Arrive', 'win, stamps and stars, freight', async () => {
    audio.engine(false);
    setEngineUi(false);
    audio.play('win');
    await wait(2600);
    for (let i = 0; i < 3; i++) {
      audio.play('stamp', { pitch: i });
      await wait(90);
      audio.play('star', { pitch: i });
      await wait(520);
    }
    await wait(300);
    audio.play('coin');
  }),
  scene('Overloaded', 'whistle', async () => {
    audio.play('whistle');
  }),
));

// ------------------------------------------------------------------ loops

main.append(el('h2', {}, 'Loops', el('small', {}, 'the harbour bed and the ship’s diesel')));
const ambBtn = el('button', {}, 'Ambience: off');
let ambOn = false;
ambBtn.onclick = () => {
  ambOn = !ambOn;
  audio.ambience(ambOn);
  ambBtn.classList.toggle('on', ambOn);
  ambBtn.textContent = `Ambience: ${ambOn ? 'on' : 'off'}`;
};
const engBtn = el('button', {}, 'Engine: off');
const load = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.5' });
const loadLabel = el('span', { className: 'desc' }, 'load 0.50');
let engOn = false;
function setEngineUi(on: boolean, l?: number): void {
  engOn = on;
  engBtn.classList.toggle('on', on);
  engBtn.textContent = `Engine: ${on ? 'on' : 'off'}`;
  if (l !== undefined) {
    load.value = String(l);
    loadLabel.textContent = `load ${l.toFixed(2)}`;
  }
}
engBtn.onclick = () => {
  setEngineUi(!engOn);
  audio.engine(engOn, Number(load.value));
};
load.oninput = () => {
  loadLabel.textContent = `load ${Number(load.value).toFixed(2)}`;
  if (engOn) audio.engine(true, Number(load.value));
};
main.append(el('div', { className: 'row' }, ambBtn, engBtn, el('label', { className: 'vol' }, 'Engine load ', load), loadLabel,
  el('button', { onclick: () => audio.duck(0.25, 2) }, 'Duck music 2 s')));

// ------------------------------------------------------------------ music

main.append(el('h2', {}, 'Music', el('small', {}, 'one theme per sea region; click again to stop')));
const cards = el('div', { className: 'cards' });
const themeBtns: HTMLButtonElement[] = [];
const nows: HTMLElement[] = [];
let playing = -1;
SONGS.forEach((def, i) => {
  const btn = el('button', {}, `Play ${i}`);
  const now = el('div', { className: 'now' });
  btn.onclick = () => {
    if (playing === i) {
      audio.stopMusic(1.5);
      playing = -1;
    } else {
      audio.startMusic(i);
      playing = i;
    }
    themeBtns.forEach((b, k) => {
      b.classList.toggle('on', k === playing);
      b.textContent = k === playing ? `Stop ${k}` : `Play ${k}`;
    });
  };
  themeBtns.push(btn);
  nows.push(now);
  cards.append(el('div', { className: 'card' }, el('b', {}, def.name), el('div', { className: 'desc' }, def.desc), el('div', { className: 'row' }, btn), now));
});
main.append(cards);

setInterval(() => {
  const info = audioEngine.musicInfo();
  nows.forEach((n, i) => {
    n.textContent = info && info.theme === i ? `${info.sec} · bar ${info.bar + 1} · pass ${info.pass + 1} · loop ${info.cycle + 1}` : '';
  });
  const kb = Math.round(audioEngine.cacheBytes() / 1024);
  status.textContent = audio.ready ? `running · SFX cache ${kb} KB` : 'tap anything to start audio';
}, 250);

// ------------------------------------------------------------------ measurements

main.append(el('h2', {}, 'Measure', el('small', {}, 'offline renders through the real chain at the default volumes')));
const out = el('div', { className: 'wrap' });
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const sfxRow = (label: string, m: Metrics, raw: { seconds: number; peak: number }) =>
  el('tr', {},
    el('td', {}, label), el('td', {}, fmt(raw.seconds, 2)), el('td', {}, fmt(raw.peak, 3)), el('td', {}, fmt(m.peakDb)), el('td', {}, fmt(m.l50Db)),
    el('td', {}, fmt(m.momentaryMax)), el('td', { className: m.clipped ? 'warn' : '' }, String(m.clipped)));
main.append(el('div', { className: 'row' },
  el('button', {
    onclick: async () => {
      const t = el('table', {}, el('tr', {}, ...['sound', 'baked s', 'baked peak', 'out peak dB', 'L50 dB', 'mom. LUFS', 'clipped'].map((h) => el('th', {}, h))));
      out.replaceChildren(t);
      for (const c of sfxCatalog()) {
        const m = measure(await renderSfx(c.name, c.opts));
        t.append(sfxRow(c.label, m, bakedInfo(c.name, c.opts)));
      }
    },
  }, 'Measure every SFX'),
  el('button', {
    onclick: async () => {
      const t = el('table', {}, el('tr', {}, ...['loop', 'seconds', 'LUFS', 'peak dB', 'clipped'].map((h) => el('th', {}, h))));
      out.replaceChildren(t);
      const row = (label: string, m: Metrics) => t.append(el('tr', {}, el('td', {}, label), el('td', {}, fmt(m.seconds, 0)), el('td', {}, fmt(m.lufs)), el('td', {}, fmt(m.peakDb)), el('td', { className: m.clipped ? 'warn' : '' }, String(m.clipped))));
      for (let i = 0; i < SONGS.length; i++) row(SONGS[i].name, measure(await renderMusic(i, 30)));
      row('ambience', measure(await renderAmbience(30)));
      row('engine, load 0', measure(await renderEngine(8, 0)));
      row('engine, load 1', measure(await renderEngine(8, 1)));
    },
  }, 'Measure music and loops (30 s each)'),
));
main.append(out);

// ------------------------------------------------------------------ hooks for review/audio-check.mjs

const b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const catalog = sfxCatalog();
declare global {
  interface Window {
    audit: unknown;
    auditReady: boolean;
  }
}
window.audit = {
  catalog: catalog.map((c) => ({ name: c.name, label: c.label, opts: c.opts })),
  songs: SONGS.map((s) => ({ id: s.id, name: s.name })),
  async sfx(i: number, wav = false) {
    const c = catalog[i];
    const t0 = performance.now();
    const raw = bakedInfo(c.name, c.opts);
    const bakeMs = performance.now() - t0;
    const b = await renderSfx(c.name, c.opts);
    return { label: c.label, raw, bakeMs, metrics: measure(b), wav: wav ? b64(toWav(b)) : null };
  },
  async music(i: number, seconds: number, wav = false) {
    const t0 = performance.now();
    const b = await renderMusic(i, seconds);
    return { id: SONGS[i].id, renderMs: performance.now() - t0, metrics: measure(b), wav: wav ? b64(toWav(b)) : null };
  },
  /** Loudness of each instrument of a theme, soloed (balance check). */
  async stems(i: number, seconds: number) {
    const names = ['organ', 'drone', 'flute', 'concertina', 'harmonium', 'bass', 'guitar', 'harp', 'tanpura', 'tabla', 'bell', 'brush', 'brushTap', 'block', 'knock', 'oceanDrum', 'frame', 'ge'];
    const out: Record<string, number> = { all: measure(await renderMusic(i, seconds)).ungated };
    for (const n of names) {
      const m = measure(await renderMusic(i, seconds, { solo: [n] }));
      if (m.ungated > -100) out[n] = m.ungated;
    }
    return out;
  },
  /** How long starting a theme blocks the main thread (the first bars bake synchronously). */
  startCost(i: number) {
    const t0 = performance.now();
    audio.startMusic(i);
    return performance.now() - t0;
  },
  async ambience(seconds: number) {
    return { metrics: measure(await renderAmbience(seconds)) };
  },
  async engine(seconds: number, load: number) {
    return { metrics: measure(await renderEngine(seconds, load)) };
  },
  state: () => ({ ready: audio.ready, info: audioEngine.musicInfo(), cacheBytes: audioEngine.cacheBytes() }),
  stopMusic: () => audio.stopMusic(0),
};
window.auditReady = true;
