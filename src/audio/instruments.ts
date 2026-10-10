/**
 * The harbour band's instruments. Everything is baked into buffers once per pitch and played back:
 *
 * - Reeds (reed organ / harmonium pad, concertina, a flute stop, a low drone, an Indian harmonium)
 *   are additive wavetable voices baked as *seamless loops*: a short attack, then a sustain whose
 *   every component (the reeds, the slow celeste beating between two reeds, the bellows tremor, the
 *   wind noise) repeats exactly over 1–2 s. A held note is one looping buffer source and one gain,
 *   however long it lasts; the exact pitch is set with playbackRate.
 * - Plucked strings (upright bass, nylon guitar, harp, tanpura) are Karplus–Strong; the tabla and
 *   the ship's bell are modal (sums of decaying partials). They are pitched, baked per MIDI note.
 * - Percussion (brushes, wooden block, a hull knock, an ocean drum, a soft frame drum, the bayan)
 *   is baked in three variants each.
 */
import { addModes, biquad, chirp, crackle, dcBlock, loopify, mix, mtof, noiseBurst, noiseShaped, normalize, pluck, rmsOf, Rng, samples, TAU } from './dsp';

export type PluckInst = 'bass' | 'guitar' | 'harp' | 'tanpura' | 'tabla' | 'bell';
export type PercName = 'brush' | 'brushTap' | 'block' | 'knock' | 'oceanDrum' | 'frame' | 'ge';
export type ReedKind = 'organ' | 'drone' | 'flute' | 'concertina' | 'harmonium';

interface PluckDef {
  sr: number;
  sec: number;
  gain: number;
  pan: number;
  wet: number;
  /** damper release time constant at the note's end (s) */
  rel: number;
  make(sr: number, f: number, r: Rng): Float32Array;
}

const P = (sec: number, o: Parameters<typeof pluck>[3]) => (sr: number, f: number, r: Rng) => pluck(sr, f, sec, o, r);

/** A long, bright string with a buzzing bridge (the tanpura's jawari, roughly). */
function tanpura(sr: number, f: number, r: Rng): Float32Array {
  const x = pluck(sr, f, 3.4, { t60: 4.5, damp: 0.07, pick: 0.06, hard: 0.6, noise: 0.35, course: 3 }, r);
  for (let i = 0; i < x.length; i++) x[i] = x[i] + 0.3 * x[i] * x[i] - 0.08 * x[i] * x[i] * x[i];
  dcBlock(x);
  biquad(x, 'lp', 5000, 0.7, sr);
  return normalize(x, 1);
}

/** The tabla's ringing "na": a tuned membrane with nearly harmonic partials and a finger's slap. */
function tabla(sr: number, f: number, r: Rng): Float32Array {
  const x = samples(sr, 0.7);
  addModes(x, 0, sr, [
    { f, a: 1, t60: 0.55 }, { f: f * 2, a: 0.6, t60: 0.4 }, { f: f * 3, a: 0.35, t60: 0.3 }, { f: f * 4, a: 0.2, t60: 0.2 },
    { f: f * 5, a: 0.1, t60: 0.12 }, { f: f * 1.52, a: 0.15, t60: 0.08 },
  ], 1, 0.0004);
  const slap = noiseBurst(sr, 0.008, r, 0.0002, 0.004);
  biquad(slap, 'bp', 3000, 1, sr);
  mix(x, normalize(slap, 1), 0, sr, 0.25);
  return normalize(x, 1);
}

/** A small ship's bell rung softly, tuned so its strike note (the nominal) is `f`. */
function shipBell(sr: number, f: number, r: Rng): Float32Array {
  const prime = f / 2;
  const x = samples(sr, 3.2);
  const P: [number, number, number, number][] = [
    [0.5, 0.3, 3.2, 0.5], [1, 0.5, 2.6, 0.9], [1.19, 0.35, 2.1, 1.3], [1.5, 0.2, 1.6, 0], [2, 1, 2.2, 1.6], [2.52, 0.25, 1.1, 2.1], [3.01, 0.15, 0.7, 0], [4.08, 0.06, 0.4, 0],
  ];
  addModes(x, 0, sr, P.map(([ra, a, t60, beat]) => ({ f: prime * ra, a: a * r.range(0.9, 1.1), t60, beat })), 1, 0.0008);
  return normalize(x, 1);
}

export const PLUCKS: Record<PluckInst, PluckDef> = {
  bass: { sr: 22050, sec: 1.8, gain: 0.107, pan: 0, wet: 0.08, rel: 0.06, make: P(1.8, { t60: 1.6, damp: 0.42, pick: 0.24, hard: 0.3, noise: 0.08, lp: 1300, body: [{ f: 95, q: 1, db: 3 }] }) },
  guitar: { sr: 24000, sec: 1.8, gain: 0.26, pan: 0.22, wet: 0.24, rel: 0.05, make: P(1.8, { t60: 2.2, damp: 0.3, pick: 0.2, hard: 0.45, noise: 0.2, body: [{ f: 110, q: 1.4, db: 3 }, { f: 240, q: 2, db: 2 }] }) },
  harp: { sr: 24000, sec: 2.4, gain: 0.24, pan: 0.22, wet: 0.36, rel: 0.08, make: P(2.4, { t60: 2.8, damp: 0.22, pick: 0.32, hard: 0.42, noise: 0.12 }) },
  tanpura: { sr: 24000, sec: 3.4, gain: 0.12, pan: -0.2, wet: 0.34, rel: 0.3, make: tanpura },
  tabla: { sr: 32000, sec: 0.7, gain: 0.16, pan: 0.18, wet: 0.16, rel: 0.05, make: tabla },
  bell: { sr: 24000, sec: 3.2, gain: 0.2, pan: 0.3, wet: 0.5, rel: 0.4, make: shipBell },
};

interface PercDef {
  sr: number;
  gain: number;
  pan: number;
  wet: number;
  make(sr: number, r: Rng): Float32Array;
}

function band(x: Float32Array, sr: number, ...f: [type: 'lp' | 'hp' | 'bp', f: number, q: number][]): Float32Array {
  for (const [t, fr, q] of f) biquad(x, t, fr, q, sr);
  return normalize(x, 1);
}

export const PERC: Record<PercName, PercDef> = {
  brush: {
    sr: 32000, gain: 0.14, pan: -0.15, wet: 0.12,
    make(sr, r) {
      const x = noiseShaped(sr, 0.24, r, (u) => (u < 0.3 ? u / 0.3 : Math.exp(-(u - 0.3) * 5)));
      return band(x, sr, ['bp', 3600 * r.range(0.9, 1.1), 0.6], ['lp', 7500, 0.7]);
    },
  },
  brushTap: {
    sr: 32000, gain: 0.15, pan: -0.15, wet: 0.12,
    make(sr, r) {
      const x = band(noiseBurst(sr, 0.07, r, 0.001, 0.05), sr, ['bp', 3000, 0.7]);
      mix(x, normalize(chirp(sr, 0.08, 230, 195, 0.02, 0.06), 1), 0, sr, 0.2);
      return normalize(x, 1);
    },
  },
  block: {
    // a low, round wooden block: the rocking beat of the waves
    sr: 32000, gain: 0.11, pan: 0.25, wet: 0.16,
    make(sr, r) {
      const x = samples(sr, 0.18);
      const f = 610 * r.range(0.98, 1.02);
      addModes(x, 0, sr, [{ f, a: 1, t60: 0.12 }, { f: f * 2.68, a: 0.22, t60: 0.05 }, { f: f * 0.5, a: 0.15, t60: 0.08 }], 1, 0.0006);
      mix(x, band(noiseBurst(sr, 0.004, r, 0.0002, 0.002), sr, ['bp', 2200, 0.8]), 0, sr, 0.2);
      return normalize(x, 1);
    },
  },
  knock: {
    // a knuckle on a wooden hull: low and hollow
    sr: 24000, gain: 0.22, pan: -0.1, wet: 0.14,
    make(sr, r) {
      const ex = noiseBurst(sr, 0.12, r, 0.0004, 0.006);
      biquad(ex, 'lp', 2500, 0.7, sr);
      const x = samples(sr, 0.12);
      for (const [f, g, q] of [[175, 1, 7], [410, 0.55, 6], [930, 0.2, 5]]) {
        const y = Float32Array.from(ex);
        biquad(y, 'bp', f * r.range(0.97, 1.03), q, sr);
        biquad(y, 'bp', f, q, sr);
        mix(x, normalize(y, 1), 0, sr, g);
      }
      return normalize(x, 1);
    },
  },
  oceanDrum: {
    // beads rolling across a frame drum: a wave in the hands
    sr: 32000, gain: 0.095, pan: 0.1, wet: 0.22,
    make(sr, r) {
      const dur = 1.6;
      const env = (u: number) => (u < 0.42 ? Math.pow(u / 0.42, 1.6) : Math.pow(1 - (u - 0.42) / 0.58, 1.8));
      const beads = crackle(sr, dur, r, 2600, 2600, env);
      biquad(beads, 'bp', 4200 * r.range(0.9, 1.1), 0.7, sr);
      const hiss = noiseShaped(sr, dur, r, env);
      biquad(hiss, 'bp', 2400, 0.6, sr);
      mix(beads, normalize(hiss, 1), 0, sr, 0.35);
      biquad(beads, 'lp', 7500, 0.7, sr);
      return normalize(beads, 1);
    },
  },
  frame: {
    // a soft frame drum (a bodhrán played with the hand)
    sr: 22050, gain: 0.18, pan: 0, wet: 0.12,
    make(sr, r) {
      const x = chirp(sr, 0.45, 98, 72, 0.06, 0.38, 0.0015);
      mix(x, band(noiseBurst(sr, 0.04, r, 0.0006, 0.025), sr, ['lp', 800, 0.7]), 0, sr, 0.3);
      return normalize(x, 1);
    },
  },
  ge: {
    // the bayan's "ge": a low stroke whose pitch the wrist bends upward
    sr: 22050, gain: 0.13, pan: -0.15, wet: 0.14,
    make(sr, r) {
      const x = samples(sr, 0.6);
      const f0 = 82 * r.range(0.97, 1.03);
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / sr;
        ph += (f0 * (1 + 0.28 * (1 - Math.exp(-t / 0.12)))) / sr;
        x[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.16) * Math.min(1, t / 0.002);
      }
      mix(x, band(noiseBurst(sr, 0.02, r, 0.0005, 0.012), sr, ['lp', 600, 0.7]), 0, sr, 0.25);
      return normalize(x, 1);
    },
  },
};

// ------------------------------------------------------------------ reeds

interface ReedDef {
  sr: number;
  /** loop length (s): every periodic component repeats exactly over it */
  loop: number;
  /** baked attack before the loop starts (s) */
  attack: number;
  /** weight of harmonic `n` at frequency `fn` */
  spectrum(n: number, fn: number): number;
  /** a second reed this many Hz sharp (a multiple of 1/loop): the slow celeste beating */
  celeste?: number;
  celesteAmp?: number;
  /** a reed an octave below (Indian harmonium "bass reed") */
  sub?: number;
  /** bellows tremor [Hz (×loop must be whole), depth] */
  trem?: [number, number];
  /** wind noise level */
  air?: number;
  /** speaks this many cents flat and settles */
  scoop?: number;
  /** live: level, pan, reverb send, attack and release of the gain envelope */
  gain: number;
  pan: number;
  wet: number;
  attackLive: number;
  release: number;
}

/** A broad resonance (in octaves) around `fc`. */
const bump = (fn: number, fc: number, oct = 0.6) => Math.exp(-Math.pow(Math.log2(fn / fc) / oct, 2));
/** A smooth low-pass of `order` (×6 dB/oct) at `fc`. */
const lpw = (fn: number, fc: number, order = 2) => 1 / Math.sqrt(1 + Math.pow(fn / fc, 2 * order));

export const REEDS: Record<ReedKind, ReedDef> = {
  // the reed organ / harmonium pad: dark, warm, two reeds beating slowly (not an accordion's musette)
  organ: {
    sr: 22050, loop: 2, attack: 0.3, celeste: 0.5, celesteAmp: 0.8, trem: [0.5, 0.03], air: 0.004, scoop: 6,
    spectrum: (n, fn) => Math.pow(n, -0.9) * (n % 2 ? 1 : 0.75) * (1 + 1.2 * bump(fn, 650)) * lpw(fn, 1900),
    gain: 0.12, pan: -0.12, wet: 0.36, attackLive: 0.2, release: 0.5,
  },
  // a low drone (Suez, the winter sea): darker still, very slow to speak
  drone: {
    sr: 22050, loop: 2, attack: 0.4, celeste: 0.5, celesteAmp: 0.7, trem: [0.5, 0.02], air: 0.003, scoop: 4,
    spectrum: (n, fn) => Math.pow(n, -1) * (1 + bump(fn, 400)) * lpw(fn, 1100),
    gain: 0.07, pan: 0, wet: 0.3, attackLive: 0.9, release: 1.1,
  },
  // the flute stop: almost a sine, airy, a light tremulant (the Pacific)
  flute: {
    sr: 22050, loop: 1, attack: 0.2, trem: [5, 0.035], air: 0.008, scoop: 5,
    spectrum: (n, fn) => (n === 1 ? 1 : n === 2 ? 0.22 : n === 3 ? 0.12 : 0.04 / n) * lpw(fn, 3500, 1),
    gain: 0.16, pan: 0.15, wet: 0.42, attackLive: 0.06, release: 0.22,
  },
  // the English concertina: one bright, slightly nasal reed per button, a hand's tremor on the bellows
  concertina: {
    sr: 22050, loop: 1, attack: 0.2, trem: [5, 0.035], air: 0.003, scoop: 10,
    spectrum: (n, fn) => Math.pow(n, -0.7) * (1 + 1.5 * bump(fn, 1150, 0.5) + 0.7 * bump(fn, 2700, 0.5)) * lpw(fn, 4200),
    gain: 0.17, pan: 0.12, wet: 0.26, attackLive: 0.015, release: 0.08,
  },
  // the Indian hand-pumped harmonium: a bright reed with a bass reed an octave below
  harmonium: {
    sr: 22050, loop: 1, attack: 0.2, celeste: 1, celesteAmp: 0.45, sub: 0.45, trem: [5, 0.02], air: 0.004, scoop: 8,
    spectrum: (n, fn) => Math.pow(n, -0.75) * (1 + bump(fn, 900)) * lpw(fn, 3000),
    gain: 0.16, pan: -0.1, wet: 0.3, attackLive: 0.025, release: 0.12,
  },
};

export interface ReedNote {
  data: Float32Array;
  sr: number;
  loopStart: number;
  loopEnd: number;
  /** the frequency it was baked at (play at mtof(midi)/fr) */
  fr: number;
}

const TABLE = 2048;
let sinTable: Float32Array | null = null;

/** One cycle of a harmonic spectrum, as a wavetable (+1 guard point for interpolation). */
function wavetable(def: ReedDef, f0: number, sr: number): Float32Array {
  if (!sinTable) {
    sinTable = new Float32Array(TABLE);
    for (let j = 0; j < TABLE; j++) sinTable[j] = Math.sin((TAU * j) / TABLE);
  }
  const s = sinTable;
  const t = new Float32Array(TABLE + 1);
  const H = Math.min(64, Math.floor((sr * 0.45) / f0));
  for (let n = 1; n <= H; n++) {
    const w = def.spectrum(n, n * f0);
    if (w < 1e-4) continue;
    for (let j = 0; j < TABLE; j++) t[j] += w * s[(n * j) % TABLE];
  }
  t[TABLE] = t[0];
  return normalize(t, 1);
}

/** Bake a reed note: an attack, then a sustain that loops seamlessly over `def.loop` seconds. */
export function bakeReed(kind: ReedKind, midi: number, rng: Rng): ReedNote {
  const def = REEDS[kind];
  const sr = def.sr;
  const T = def.loop;
  const N = Math.round(T * sr);
  const A = Math.round(def.attack * sr);
  const f = mtof(midi);
  // every frequency on the loop's grid (k/T Hz), so the sustain repeats exactly; with a sub-octave
  // reed the main reed must be on the 2/T grid
  const grid = def.sub ? 2 : 1;
  const k = Math.max(grid, Math.round((f * T) / grid) * grid);
  const fr = k / T;
  const reeds: { f: number; a: number; tab: Float32Array }[] = [{ f: fr, a: 1, tab: wavetable(def, fr, sr) }];
  if (def.celeste) reeds.push({ f: fr + def.celeste, a: def.celesteAmp ?? 0.7, tab: reeds[0].tab });
  if (def.sub) reeds.push({ f: fr / 2, a: def.sub, tab: wavetable(def, fr / 2, sr) });
  // wind noise, itself a seamless loop of N samples
  let air: Float32Array | null = null;
  if (def.air) {
    const raw = new Float32Array(N + Math.round(0.1 * sr));
    for (let i = 0; i < raw.length; i++) raw[i] = rng.bi();
    biquad(raw, 'bp', Math.min(sr * 0.4, Math.max(1200, fr * 3)), 0.8, sr);
    air = normalize(loopify(raw, 0.1, sr), 1);
  }
  const out = new Float32Array(A + N);
  const ph = reeds.map(() => rng.next());
  const att = def.attack * 0.6;
  const scoop = Math.pow(2, -(def.scoop ?? 0) / 1200) - 1;
  const [tr, td] = def.trem ?? [0, 0];
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const u = Math.min(1, t / att);
    const env = 1 - Math.pow(1 - u, 3);
    const bend = 1 + scoop * Math.pow(1 - u, 2);
    let s = 0;
    for (let j = 0; j < reeds.length; j++) {
      const rd = reeds[j];
      ph[j] += (rd.f * bend) / sr;
      ph[j] -= Math.floor(ph[j]);
      const x = ph[j] * TABLE;
      const xi = x | 0;
      s += rd.a * (rd.tab[xi] + (rd.tab[xi + 1] - rd.tab[xi]) * (x - xi));
    }
    if (air) s += def.air! * 40 * air[i % N];
    out[i] = s * env * (1 + td * Math.sin(TAU * tr * t));
  }
  // consistent loudness from note to note: set the loop's RMS
  const rms = rmsOf(out, A, A + N);
  if (rms > 1e-9) {
    let g = 0.25 / rms;
    let pk = 0;
    for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
    if (pk * g > 0.98) g = 0.98 / pk;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return { data: out, sr, loopStart: A / sr, loopEnd: (A + N) / sr, fr };
}

// ------------------------------------------------------------------ per-context resources

interface ReedBuf {
  buf: AudioBuffer;
  loopStart: number;
  loopEnd: number;
  fr: number;
}

/** Per-context baked notes (LRU), percussion takes and the music room's impulse response. */
export class Resources {
  private notes = new Map<string, AudioBuffer>();
  private reeds = new Map<string, ReedBuf>();
  private percs = new Map<string, AudioBuffer>();
  private seed = 1;

  constructor(readonly ctx: BaseAudioContext) {}

  private toBuffer(data: Float32Array, sr: number): AudioBuffer {
    const b = this.ctx.createBuffer(1, data.length, sr);
    b.getChannelData(0).set(data);
    return b;
  }

  private touch<T>(map: Map<string, T>, key: string): T | undefined {
    const v = map.get(key);
    if (v !== undefined) {
      map.delete(key);
      map.set(key, v);
    }
    return v;
  }

  note(inst: PluckInst, midi: number): AudioBuffer {
    const key = `${inst}:${midi}`;
    let b = this.touch(this.notes, key);
    if (b) return b;
    const def = PLUCKS[inst];
    b = this.toBuffer(def.make(def.sr, mtof(midi), new Rng(midi * 7919 + inst.length * 131)), def.sr);
    this.notes.set(key, b);
    if (this.notes.size > 64) this.notes.delete(this.notes.keys().next().value!);
    return b;
  }

  reed(kind: ReedKind, midi: number): ReedBuf {
    const key = `${kind}:${midi}`;
    let b = this.touch(this.reeds, key);
    if (b) return b;
    const n = bakeReed(kind, midi, new Rng(midi * 104729 + kind.length * 31));
    b = { buf: this.toBuffer(n.data, n.sr), loopStart: n.loopStart, loopEnd: n.loopEnd, fr: n.fr };
    this.reeds.set(key, b);
    if (this.reeds.size > 44) this.reeds.delete(this.reeds.keys().next().value!);
    return b;
  }

  perc(name: PercName): AudioBuffer {
    const v = this.seed++ % 3;
    const key = `${name}:${v}`;
    let b = this.percs.get(key);
    if (!b) {
      const def = PERC[name];
      b = this.toBuffer(def.make(def.sr, new Rng(v * 104729 + name.length * 17 + 3)), def.sr);
      this.percs.set(key, b);
    }
    return b;
  }

  /** Bake ahead of time: `pluck:inst:midi`, `reed:kind:midi` or `perc:name` (see Recorder). */
  warm(key: string): void {
    const [a, b, c] = key.split(':');
    if (a === 'perc' && b in PERC) for (let i = 0; i < 3; i++) this.perc(b as PercName);
    else if (a === 'pluck' && b in PLUCKS) this.note(b as PluckInst, Number(c));
    else if (a === 'reed' && b in REEDS) this.reed(b as ReedKind, Number(c));
  }
}

// ------------------------------------------------------------------ players

export interface ReedOpts {
  /** 0..1: the bellows push the chord a little louder through the middle, then ease off */
  swell?: number;
  attack?: number;
  release?: number;
}

/** What an arrangement can ask of a band (a real one, or a recorder for dry runs). */
export interface Player {
  note(inst: PluckInst, midi: number, t: number, dur: number, vel: number, cents?: number): void;
  strum(inst: PluckInst, midis: number[], t: number, vel: number, dur: number, down?: boolean, spread?: number): void;
  perc(name: PercName, t: number, vel: number, pan?: number): void;
  reed(kind: ReedKind, midis: number[], t: number, dur: number, vel: number, o?: ReedOpts): void;
  dispose(): void;
}

/** A silent band that only notes which baked notes and drums a song will ask for. */
export class Recorder implements Player {
  readonly keys = new Set<string>();
  note(inst: PluckInst, midi: number): void {
    this.keys.add(`pluck:${inst}:${Math.round(midi)}`);
  }
  strum(inst: PluckInst, midis: number[]): void {
    for (const m of midis) this.note(inst, m);
  }
  perc(name: PercName): void {
    this.keys.add(`perc:${name}`);
  }
  reed(kind: ReedKind, midis: number[]): void {
    for (const m of midis) this.keys.add(`reed:${kind}:${Math.round(m)}`);
  }
  dispose(): void {}
}

interface Chan {
  input: GainNode;
  nodes: AudioNode[];
}

/**
 * One band playing into `out` (a song's fader). Every instrument gets a channel (level, pan,
 * reverb send) the first time it plays; every note is one buffer source and one gain.
 */
export class Band implements Player {
  private chans = new Map<string, Chan>();
  private r: Rng;
  private ctx: BaseAudioContext;

  /** `solo`: only these instrument channels are audible (stem analysis). */
  constructor(readonly res: Resources, readonly out: AudioNode, private reverb: AudioNode | null, private trims: Partial<Record<string, number>> = {}, seed = 1, private solo?: string[]) {
    this.ctx = res.ctx;
    this.r = new Rng(seed);
  }

  private chan(name: string, pan: number, wet: number): Chan {
    let c = this.chans.get(name);
    if (c) return c;
    const ctx = this.ctx;
    const input = ctx.createGain();
    const base = name.split('@')[0];
    input.gain.value = this.solo && !this.solo.includes(base) ? 0 : (this.trims[base] ?? 1);
    const nodes: AudioNode[] = [input];
    let node: AudioNode = input;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      node = p;
      nodes.push(p);
    }
    node.connect(this.out);
    if (wet > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(this.reverb);
      nodes.push(s);
    }
    c = { input, nodes };
    this.chans.set(name, c);
    return c;
  }

  /** small random wobble, in cents, so repeated notes are never identical */
  private wobble(): number {
    return (this.r.next() - 0.5) * 5;
  }

  note(inst: PluckInst, midi: number, t: number, dur: number, vel: number, cents = 0): void {
    const def = PLUCKS[inst];
    const buf = this.res.note(inst, Math.round(midi));
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (cents + this.wobble()) / 1200);
    const g = ctx.createGain();
    const level = Math.max(0, vel) * def.gain;
    g.gain.setValueAtTime(level, t);
    const end = t + dur;
    src.connect(g);
    g.connect(this.chan(inst, def.pan, def.wet).input);
    src.start(t);
    if (dur < buf.duration - 0.05) {
      g.gain.setValueAtTime(level, end);
      g.gain.setTargetAtTime(0, end, def.rel);
      src.stop(end + def.rel * 4.5);
    } else src.stop(t + buf.duration + 0.02);
  }

  strum(inst: PluckInst, midis: number[], t: number, vel: number, dur: number, down = true, spread = 0.016): void {
    const order = down ? midis : midis.slice().reverse();
    order.forEach((m, k) => this.note(inst, m, t + k * spread * (0.8 + this.r.next() * 0.4), dur, vel * (down ? 1 - k * 0.06 : 0.75 - k * 0.05)));
  }

  perc(name: PercName, t: number, vel: number, pan?: number): void {
    const def = PERC[name];
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.res.perc(name);
    src.playbackRate.value = Math.pow(2, this.wobble() / 600);
    const g = ctx.createGain();
    g.gain.value = Math.max(0, vel) * def.gain;
    src.connect(g);
    g.connect(this.chan(pan === undefined ? name : `${name}@${pan}`, pan ?? def.pan, def.wet).input);
    src.start(t);
  }

  /** A held reed chord (or a single melody note): looping baked notes under one bellows envelope. */
  reed(kind: ReedKind, midis: number[], t: number, dur: number, vel: number, o: ReedOpts = {}): void {
    if (!midis.length) return;
    const def = REEDS[kind];
    const ctx = this.ctx;
    const g = ctx.createGain();
    const peak = (Math.max(0, vel) * def.gain) / Math.sqrt(midis.length);
    const a = Math.min(o.attack ?? def.attackLive, dur * 0.5);
    const rel = o.release ?? def.release;
    const end = t + dur;
    const sw = Math.max(0, Math.min(0.8, o.swell ?? 0));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak * (1 - sw), t + a);
    if (sw > 0) {
      g.gain.linearRampToValueAtTime(peak, t + a + (dur - a) * 0.45);
      g.gain.linearRampToValueAtTime(peak * (1 - sw * 0.6), end);
    } else g.gain.linearRampToValueAtTime(peak * 0.9, end);
    g.gain.setTargetAtTime(0, end, rel / 3);
    const stop = end + rel * 2.2 + 0.05;
    g.connect(this.chan(kind, def.pan, def.wet).input);
    for (const m of midis) {
      const nb = this.res.reed(kind, Math.round(m));
      const src = ctx.createBufferSource();
      src.buffer = nb.buf;
      src.loop = true;
      src.loopStart = nb.loopStart;
      src.loopEnd = nb.loopEnd;
      src.playbackRate.value = (mtof(m) / nb.fr) * Math.pow(2, this.wobble() / 1200);
      src.connect(g);
      src.start(t);
      src.stop(stop);
    }
  }

  /** Release every channel (after the song's fader has done its job). */
  dispose(): void {
    for (const c of this.chans.values()) for (const n of c.nodes) n.disconnect();
    this.chans.clear();
  }
}
