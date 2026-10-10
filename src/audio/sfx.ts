/**
 * Harbour foley played like an instrument: steel, rope, water and air, all synthesized. Every sound
 * is a small recipe over a "kit" of physically-inspired primitives (struck steel and bronze, chain
 * links, a typhon, bubbles, stick–slip squeaks, cloth flutter). Each one is baked once per variant
 * into a short stereo buffer with its own bit of space (a small room, and for the big ones the
 * harbour answering back from the quay walls), then simply played back.
 *
 * Identity: wet and low. No accordion, no marimba, no square-wave blips.
 */
import {
  addModes, biquad, chirp, clampInt, crackle, echoes, fadeIn, fadeOut, loudest, mix, type Mode, mtof, noiseBurst,
  noiseShaped, normalize, peakOf, pulse, Rng, room, samples, saturate, saw, scale, tailEnd, TAU, tone,
} from './dsp';

export type SfxName =
  | 'button' | 'pick' | 'drop' | 'crane' | 'glug' | 'cell' | 'drain' | 'ratchet'
  | 'horn' | 'toot' | 'bell' | 'pipe' | 'gull' | 'splash' | 'flag' | 'stamp'
  | 'invalid' | 'undo' | 'sputter' | 'whistle' | 'coin' | 'win' | 'fail' | 'unlock' | 'star';

/** One-shots used by the harbour ambience only. */
export type BedSound = 'slap' | 'creak' | 'gullFar' | 'buoy';
export type BakeName = SfxName | BedSound;

export const SFX_NAMES: SfxName[] = [
  'button', 'pick', 'drop', 'crane', 'glug', 'cell', 'drain', 'ratchet', 'horn', 'toot', 'bell', 'pipe', 'gull', 'splash', 'flag',
  'stamp', 'invalid', 'undo', 'sputter', 'whistle', 'coin', 'win', 'fail', 'unlock', 'star',
];

/** How many `pitch` steps a sound understands (others ignore it). */
export const PITCH_STEPS: Partial<Record<SfxName, number>> = { drop: 5, crane: 5, cell: 12, drain: 12, stamp: 3, star: 3, horn: 5 };

/** Minimum gap between two plays of the same sound (seconds): frequent sounds never machine-gun. */
export const RATE: Partial<Record<BakeName, number>> = {
  button: 0.03, pick: 0.06, drop: 0.05, crane: 0.08, glug: 0.05, cell: 0.03, drain: 0.03, ratchet: 0.025, invalid: 0.1, undo: 0.08,
  horn: 0.8, toot: 0.25, bell: 0.4, pipe: 0.8, gull: 0.3, splash: 0.1, flag: 0.2, stamp: 0.06, whistle: 0.5, coin: 0.05, star: 0.05,
  win: 1, fail: 1, unlock: 0.5, sputter: 1,
};

/** How many differently-seeded takes of each sound are baked (picked at random, never the same twice in a row). */
export const VARIANTS: Partial<Record<BakeName, number>> = {
  horn: 2, toot: 2, bell: 2, pipe: 2, gull: 4, gullFar: 3, win: 1, fail: 1, unlock: 1, star: 2, cell: 2, drain: 2, sputter: 1,
  coin: 2, whistle: 2, glug: 4, stamp: 2, slap: 4, creak: 3, buoy: 2,
};

/** Pitch wobble per play (fraction of playback rate): tuned sounds barely move, noisy foley more. */
export const WOBBLE: Partial<Record<BakeName, number>> = {
  cell: 0.002, drain: 0.004, star: 0.002, bell: 0.002, buoy: 0.002, coin: 0.006, win: 0, unlock: 0.002, fail: 0.003, pipe: 0.006,
  horn: 0.004, toot: 0.01, whistle: 0.01, invalid: 0.003, gull: 0.04, gullFar: 0.04,
};

/**
 * Bake rate per sound: dark sounds (nothing above ~3 kHz) need fewer samples, and less memory on
 * phones. `minRate` is the lowest rate the context accepts for buffers (16 kHz nearly everywhere).
 */
const LOW_RATE = new Set<BakeName>(['horn', 'toot', 'drop', 'glug', 'crane', 'sputter', 'fail', 'win', 'slap', 'creak', 'buoy']);
export const bakeRate = (name: BakeName, minRate = 16000): number => (LOW_RATE.has(name) ? Math.max(16000, minRate) : 24000);

/** Short, nearly dry sounds are kept mono (their little room adds no width worth the memory). */
export const MONO = new Set<BakeName>(['button', 'pick', 'drop', 'crane', 'glug', 'cell', 'drain', 'ratchet', 'stamp', 'invalid', 'undo', 'slap', 'creak']);

export interface SfxParams {
  pitch?: number;
  /** tonic pitch class of the current music (the win flourish plays in its key) */
  key?: number;
}

/** Cache key: the parameters that change the baked sound. */
export function sfxKey(name: BakeName, p: SfxParams): string {
  const steps = PITCH_STEPS[name as SfxName];
  if (steps) return `${name}:${clampInt(p.pitch ?? 0, 0, steps - 1)}`;
  if (name === 'win') return `win:${clampInt(p.key ?? 7, 0, 11)}`;
  return name;
}

/** Major-pentatonic steps: rising pitches (a tank filling cell by cell) always sound sweet. */
const PENTA = [0, 2, 4, 7, 9];
const penta = (i: number) => PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
const smooth = (u: number) => {
  const v = Math.max(0, Math.min(1, u));
  return v * v * (3 - 2 * v);
};

export interface Baked {
  L: Float32Array;
  R: Float32Array;
  sr: number;
}

/** Open-air answers: [delay s, gain, pan]. */
type Taps = [number, number, number][];
/** The quay wall right next to us. */
const NEAR: Taps = [[0.075, 0.14, -0.5], [0.17, 0.08, 0.6]];
/** Sheds across the basin. */
const MID: Taps = [[0.21, 0.2, -0.55], [0.46, 0.1, 0.65]];
/** The whole harbour answers the ship's horn. */
const WIDE: Taps = [[0.34, 0.3, -0.6], [0.74, 0.17, 0.7], [1.25, 0.08, -0.25]];

// ------------------------------------------------------------------ the kit: harbour primitives

class Kit {
  readonly m: Float32Array;
  constructor(readonly sr: number, sec: number, readonly r: Rng) {
    this.m = samples(sr, sec);
  }

  /** Mix a primitive in, normalized so `gain` is its peak level. */
  put(x: Float32Array, at: number, gain: number): void {
    normalize(x, 1);
    mix(this.m, x, at, this.sr, gain);
  }

  /** Struck steel (a hook, a box corner, a beam): inharmonic, slowly beating partials and a strike click. */
  steel(at: number, f: number, gain: number, o: { ratios?: number[]; t60?: number; bright?: number } = {}): void {
    const { sr, r } = this;
    const ratios = o.ratios ?? [1, 1.58, 2.37, 3.41, 4.62];
    const t60 = o.t60 ?? 0.3;
    const b = o.bright ?? 0.5;
    const out = samples(sr, t60 + 0.05);
    const modes: Mode[] = ratios.map((ra, j) => ({
      f: f * ra * r.range(0.985, 1.015),
      a: Math.pow(0.5 + b * 0.42, j) * r.range(0.7, 1),
      t60: t60 / (1 + j * 0.45),
      beat: r.range(0.4, 2.2) * (1 + j * 0.6),
    }));
    addModes(out, 0, sr, modes, 1, 0.0003);
    const click = noiseBurst(sr, 0.006, r, 0.0001, 0.003);
    biquad(click, 'bp', Math.min(sr * 0.4, f * 6), 0.8, sr);
    mix(out, normalize(click, 1), 0, sr, 0.25 * b);
    this.put(out, at, gain);
  }

  /** A soft low bump: a sine falling f0→f1 and a felt puff. */
  thump(at: number, f0: number, f1: number, gain: number, len = 0.16): void {
    const { sr, r } = this;
    const out = chirp(sr, len, f0, f1, len * 0.35, len * 0.75, 0.0015);
    const n = noiseBurst(sr, Math.min(len, 0.03), r, 0.0008, 0.02);
    biquad(n, 'lp', 380, 0.7, sr);
    mix(out, normalize(n, 1), 0, sr, 0.3);
    this.put(out, at, gain);
  }

  /** A tiny metal click (a pawl, a shutter louvre, a chain link): a few high partials and a tick. */
  clink(at: number, f: number, gain: number, t60 = 0.03): void {
    const { sr, r } = this;
    const out = samples(sr, t60 + 0.02);
    addModes(out, 0, sr, [
      { f, a: 1, t60 },
      { f: f * r.range(1.45, 1.6), a: 0.6, t60: t60 * 0.7 },
      { f: f * r.range(2.3, 2.6), a: 0.3, t60: t60 * 0.5 },
    ], 1, 0.0002);
    const tick = noiseBurst(sr, 0.003, r, 0.0001, 0.0015);
    biquad(tick, 'hp', 1800, 0.7, sr);
    mix(out, normalize(tick, 1), 0, sr, 0.5);
    this.put(out, at, gain);
  }

  /** A chain paying out or swinging: jittered clinks that thin out. */
  chain(at: number, dur: number, gain: number, o: { rate?: number; f?: number } = {}): void {
    const { r } = this;
    const rate = o.rate ?? 36;
    const f = o.f ?? 2600;
    for (let t = 0; t < dur; t += (1 / rate) * r.range(0.3, 1.7)) {
      this.clink(at + t, f * r.range(0.75, 1.3), gain * (1 - (t / dur) * 0.75) * r.range(0.35, 1), r.range(0.015, 0.04));
    }
  }

  /** Air: band-passed noise sweeping from f0 to f1. */
  swish(at: number, dur: number, f0: number, f1: number, gain: number, q = 1.1, env?: (u: number) => number): void {
    const { sr, r } = this;
    const x = noiseShaped(sr, dur, r, env ?? ((u) => Math.pow(Math.sin(Math.PI * u), 2)));
    biquad(x, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / dur)), q, sr);
    biquad(x, 'lp', 7000, 0.7, sr);
    this.put(x, at, gain);
  }

  /** One bubble (Minnaert resonance): a sine that rises as it nears the surface. */
  bubble(at: number, f: number, gain: number, t60 = 0.06): void {
    this.put(chirp(this.sr, t60 + 0.02, f, f * this.r.range(1.3, 1.6), t60 * 0.8, t60, 0.001), at, gain);
  }

  /** Water hitting water: broadband, darkening fast. */
  splashNoise(at: number, dur: number, gain: number, bright = 0.5): void {
    const { sr, r } = this;
    const x = noiseBurst(sr, dur, r, 0.002, dur * 0.7);
    biquad(x, 'lp', (t) => 600 + (2500 + bright * 3000) * Math.exp(-t / (dur * 0.25)), 0.7, sr);
    this.put(x, at, gain);
  }

  /** A ship's bell (or a buoy's): bronze partials — hum, prime, minor-third tierce, quint, nominal… — slowly beating. */
  bell(at: number, prime: number, gain: number, strike = 1, len = 3.2): void {
    const { sr, r } = this;
    const P: [number, number, number, number][] = [
      [0.5, 0.35, 3.4, 0.6], [1, 0.55, 2.8, 1.1], [1.19, 0.45, 2.3, 1.5], [1.51, 0.22, 1.7, 0], [2.0, 1, 2.1, 1.8],
      [2.52, 0.35, 1.2, 2.4], [2.68, 0.22, 0.9, 0], [3.02, 0.2, 0.7, 3.1], [4.08, 0.12, 0.45, 0], [5.24, 0.06, 0.3, 0],
    ];
    const k = len / 3.2;
    const out = samples(sr, len);
    addModes(out, 0, sr, P.map(([ra, a, t60, beat]) => ({ f: prime * ra, a: a * (ra > 2.2 ? strike : 1) * r.range(0.85, 1.1), t60: t60 * k, beat })), 1, 0.0004);
    const tick = noiseBurst(sr, 0.004, r, 0.0001, 0.0015);
    biquad(tick, 'hp', 2500, 0.7, sr);
    mix(out, normalize(tick, 1), 0, sr, 0.15 * strike);
    mix(out, normalize(chirp(sr, 0.04, 420, 300, 0.01, 0.025, 0.0005), 1), 0, sr, 0.06);
    this.put(out, at, gain);
  }

  /** A small bronze chime (a handbell): stars, the unlock. */
  chime(at: number, f: number, gain: number, t60 = 1.2, bright = 0.6): void {
    const { sr, r } = this;
    const out = samples(sr, t60 + 0.05);
    addModes(out, 0, sr, [
      { f, a: 1, t60, beat: r.range(0.6, 1.1) },
      { f: f * 2.01, a: 0.35 * bright, t60: t60 * 0.55, beat: r.range(1, 1.6) },
      { f: f * 2.98, a: 0.25 * bright, t60: t60 * 0.4 },
      { f: f * 4.16, a: 0.1 * bright, t60: t60 * 0.25 },
      { f: f * 5.43, a: 0.05 * bright, t60: t60 * 0.15 },
    ], 1, 0.0006);
    const click = noiseBurst(sr, 0.004, r, 0.0002, 0.002);
    biquad(click, 'hp', 3000, 0.7, sr);
    mix(out, normalize(click, 1), 0, sr, 0.08 * bright);
    this.put(out, at, gain);
  }

  /**
   * The ship's typhon: two saws a fifth apart (≈110 and 165 Hz), each doubled a few cents off,
   * through a horn-shaped low-pass; the pitch scoops up as the diaphragm starts, wavers a little
   * and sags as the air runs out; breath on the attack; a little grit.
   */
  horn(at: number, f: number, dur: number, gain: number, o: { attack?: number; scoop?: number; breath?: number } = {}): void {
    const { sr, r } = this;
    const att = o.attack ?? 0.12;
    const rel = 0.22;
    const total = dur + rel + 0.04;
    const vibR = r.range(4.6, 5.6);
    const scoop = o.scoop ?? 0.025;
    const pitch = (t: number) => {
      let m = 1 - scoop * Math.exp(-t / 0.05);
      if (t > 0.25) m *= 1 + 0.0025 * Math.sin(TAU * vibR * t) * Math.min(1, (t - 0.25) / 0.3);
      if (t > dur) m *= 1 - 0.015 * Math.min(1, (t - dur) / rel);
      return m;
    };
    const env = (t: number) =>
      t < att ? Math.pow(t / att, 1.5) : t < dur ? 1 - 0.08 * Math.min(1, (t - att) / dur) : 0.92 * Math.pow(Math.max(0, 1 - (t - dur) / rel), 2);
    const out = samples(sr, total);
    for (const [ra, g] of [[1, 1], [1.0035, 0.8], [1.5, 0.8], [1.4965, 0.6]]) mix(out, saw(sr, total, (t) => f * ra * pitch(t), r.next()), 0, sr, g);
    const lp = Math.min(sr * 0.4, 900 * Math.pow(f / 110, 0.8));
    biquad(out, 'lp', lp, 0.9, sr);
    biquad(out, 'lp', lp * 1.2, 0.7, sr);
    biquad(out, 'peak', Math.min(sr * 0.4, f * 3.5), 1.4, sr, 4);
    for (let i = 0; i < out.length; i++) out[i] *= env(i / sr);
    normalize(out, 1);
    saturate(out, 1.4);
    const br = noiseShaped(sr, total, r, (u) => {
      const t = u * total;
      return (t < att * 1.5 ? 1 : 0.35) * env(t);
    });
    biquad(br, 'bp', Math.min(sr * 0.4, f * 10), 0.8, sr);
    mix(out, normalize(br, 1), 0, sr, o.breath ?? 0.06);
    this.put(out, at, gain);
  }

  /** A brass-ish note: saws through a low-pass that opens with the breath (the "blat"), a scoop and late vibrato. */
  brass(at: number, f: number, dur: number, gain: number): void {
    const { sr, r } = this;
    const total = dur + 0.16;
    const env = (t: number) =>
      t < 0.03 ? (t / 0.03) * 1.1 : t < 0.09 ? 1.1 - ((t - 0.03) / 0.06) * 0.25 : t < dur ? 0.85 : 0.85 * Math.max(0, 1 - (t - dur) / 0.13);
    const pitch = (t: number) => (1 - 0.012 * Math.exp(-t / 0.03)) * (t > 0.2 ? 1 + 0.003 * Math.sin(TAU * 5.2 * t) : 1);
    const x = saw(sr, total, (t) => f * pitch(t), r.next());
    mix(x, saw(sr, total, (t) => f * 1.003 * pitch(t), r.next()), 0, sr, 0.7);
    biquad(x, 'lp', (t) => Math.min(sr * 0.42, f * (1.2 + 5 * env(t))), 0.8, sr);
    for (let i = 0; i < x.length; i++) x[i] *= env(i / sr);
    biquad(x, 'peak', 1200, 1, sr, 2);
    this.put(x, at, gain);
  }

  /** A low reed note with a "wah" (a formant opening and closing), drooping when told to. */
  reedWah(at: number, f: number, dur: number, gain: number, droop = 0): void {
    const { sr, r } = this;
    const total = dur + 0.12;
    const pitch = (t: number) => (1 - droop * smooth(t / dur)) * (t > 0.3 ? 1 + 0.004 * Math.sin(TAU * 4.6 * t) * Math.min(1, (t - 0.3) / 0.3) : 1);
    const x = pulse(sr, total, (t) => f * pitch(t), 0.32);
    mix(x, saw(sr, total, (t) => f * pitch(t) * 1.002, r.next()), 0, sr, 0.5);
    biquad(x, 'peak', (t) => 330 + 650 * Math.pow(Math.sin(Math.PI * Math.min(1, t / dur)), 1.5), 2.2, sr, 13);
    biquad(x, 'lp', 1700, 0.7, sr);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] *= Math.min(1, t / 0.05) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.1) : 1);
    }
    const br = noiseShaped(sr, total, r, (u) => Math.min(1, (u * total) / 0.05) * (u * total > dur ? 0 : 1));
    biquad(br, 'bp', 900, 1, sr);
    mix(x, normalize(br, peakOf(x)), 0, sr, 0.05);
    this.put(x, at, gain);
  }

  /** A gull's "kee-ow": up into the "kee", a long nasal fall on the "ow", an 18 Hz flutter, breath. */
  gullCall(at: number, gain: number, len: number, peak: number, low: number): void {
    const { sr, r } = this;
    const kee = 0.06;
    const f = (t: number) => {
      const base = t < kee ? peak * (0.78 + 0.22 * smooth(t / kee)) : peak * Math.pow(low / peak, smooth((t - kee) / (len - kee)));
      return base * (1 + 0.03 * Math.sin(TAU * 18 * t));
    };
    const amp = (t: number) => Math.min(1, t / 0.012) * (t < kee ? 1 : Math.pow(Math.max(0, 1 - (t - kee) / (len - kee)), 0.7)) * (1 + 0.25 * Math.sin(TAU * 18 * t + 1));
    const x = tone(sr, len, f, amp, [1, 0.55, 0.3, 0.12, 0.05]);
    biquad(x, 'peak', 2600, 1.2, sr, 5);
    const br = noiseShaped(sr, len, r, (u) => amp(u * len));
    biquad(br, 'bp', 3000, 1.5, sr);
    mix(x, normalize(br, peakOf(x)), 0, sr, 0.12);
    this.put(x, at, gain);
  }

  /**
   * Room, echoes, trim and level. `levelDb` is the loudest 50 ms RMS in dBFS (what the ear notices
   * for short sounds); peaks are kept under -1 dBFS.
   */
  finish(levelDb: number, wet: number, o: { size?: number; damp?: number; tail?: number; echo?: Taps; echoLp?: number } = {}): Baked {
    let [L, R] = room(this.m, this.sr, { wet, size: o.size ?? 0.42, damp: o.damp ?? 0.6, tail: o.tail ?? 0.6 });
    if (o.echo) [L, R] = echoes(L, R, this.sr, o.echo, o.echoLp);
    const end = Math.max(tailEnd(L, -54), tailEnd(R, -54));
    const l = L.slice(0, end);
    const rr = R.slice(0, end);
    fadeOut(l, 0.012, this.sr);
    fadeOut(rr, 0.012, this.sr);
    const loud = Math.max(loudest(l, this.sr), loudest(rr, this.sr), 1e-9);
    let g = Math.pow(10, levelDb / 20) / loud;
    const pk = Math.max(peakOf(l), peakOf(rr)) * g;
    if (pk > 0.89) g *= 0.89 / pk;
    return { L: scale(l, g), R: scale(rr, g), sr: this.sr };
  }
}

// ------------------------------------------------------------------ recipes

/** Bake one take of a sound at sample rate `sr` (deterministic for a seed). */
export function bakeSfx(name: BakeName, p: SfxParams, sr: number, seed: number): Baked {
  const r = new Rng(seed);
  switch (name) {
    case 'button': {
      // an Aldis lamp's shutter: the louvres snap open and shut, a little ring and the lamp body
      const k = new Kit(sr, 0.16, r);
      const shutter = (at: number, f: number, g: number) => {
        k.clink(at, f, g, 0.022);
        const t = noiseBurst(sr, 0.004, r, 0.0001, 0.0018);
        biquad(t, 'bp', f * 1.3, 1, sr);
        k.put(t, at, g * 0.8);
        k.thump(at, 420, 300, g * 0.25, 0.03);
      };
      shutter(0, r.range(2900, 3300), 1);
      shutter(r.range(0.05, 0.065), r.range(2500, 2800), 0.75);
      return k.finish(-26, 0.04);
    }
    case 'pick': {
      // the hook takes the lifting eye (clank) and the chain sways
      const k = new Kit(sr, 0.7, r);
      k.steel(0, r.range(560, 660), 1, { ratios: [1, 1.72, 2.63, 3.91, 5.28], t60: 0.32, bright: 0.65 });
      k.thump(0, 150, 95, 0.35, 0.09);
      k.chain(0.035, 0.32, 0.45, { rate: 34, f: 2400 });
      return k.finish(-23, 0.08, { echo: NEAR });
    }
    case 'drop': {
      // a box lands: weight on the deck, the steel box booms, and the twist-locks seat (clunk-chk)
      const w = clampInt(p.pitch ?? 0, 0, 4);
      const low = Math.pow(2, -w * 0.12);
      const k = new Kit(sr, 1.1, r);
      k.thump(0, 95 * low, 48 * low, 1, 0.24 + w * 0.05);
      const boom = noiseBurst(sr, 0.5, r, 0.0008, 0.2 + w * 0.05);
      biquad(boom, 'bp', 165 * low, 6, sr);
      biquad(boom, 'bp', 165 * low, 6, sr);
      k.put(boom, 0.002, 0.55 + w * 0.08);
      k.steel(0.003, 330 * low * r.range(0.97, 1.03), 0.5, { t60: 0.28 + w * 0.03, bright: 0.45 });
      const tl = 0.03 + r.range(0, 0.012);
      k.steel(tl, r.range(850, 1000), 0.28, { ratios: [1, 2.07, 3.36], t60: 0.07, bright: 0.8 });
      k.clink(tl + r.range(0.012, 0.02), r.range(2000, 2500), 0.16, 0.025);
      return k.finish(-22.5 + w * 0.7, 0.08, { echo: NEAR });
    }
    case 'crane': {
      // a slew/hoist motor spins up and down: a saw through a band-pass that follows its speed,
      // the gearbox singing above it, a little chain, a brake click. Heavy loads: a fifth lower.
      const step = clampInt(p.pitch ?? 0, 0, 4);
      const down = Math.pow(2, (-step * 7) / 12 / 4);
      const dur = 0.55;
      const k = new Kit(sr, dur + 0.1, r);
      const spd = (t: number) => {
        const u = t / dur;
        return u < 0.25 ? smooth(u / 0.25) : u < 0.7 ? 1 : 1 - 0.75 * smooth((u - 0.7) / 0.3);
      };
      const f0 = (t: number) => (52 + 58 * spd(t)) * down;
      const m = saw(sr, dur, f0, r.next());
      mix(m, pulse(sr, dur, (t) => f0(t) * 2.003, 0.3), 0, sr, 0.35);
      biquad(m, 'bp', (t) => (300 + 400 * spd(t)) * down, 2.2, sr);
      biquad(m, 'lp', 1800, 0.7, sr);
      for (let i = 0; i < m.length; i++) {
        const t = i / sr;
        m[i] *= Math.pow(spd(t), 0.8) * Math.min(1, (dur - t) / 0.04);
      }
      k.put(m, 0, 1);
      k.put(tone(sr, dur, (t) => f0(t) * 13, (t) => spd(t) * spd(t) * Math.min(1, (dur - t) / 0.04), [1, 0.2]), 0, 0.12);
      k.chain(0.06, 0.4, 0.14, { rate: 22, f: 2200 });
      k.clink(dur - 0.03, 1300 * down, 0.18, 0.05);
      return k.finish(-27, 0.05, { echo: NEAR });
    }
    case 'glug': {
      // one pump pulse through the hose: noise through a resonant low-pass sweeping 400→150 Hz, a bubble or two
      const k = new Kit(sr, 0.42, r);
      const n = noiseBurst(sr, 0.26, r, 0.012, 0.2);
      const fa = r.range(370, 430);
      biquad(n, 'lp', (t) => fa * Math.pow(150 / fa, Math.min(1, t / 0.12)), 9, sr);
      biquad(n, 'lp', 900, 0.7, sr);
      k.put(n, 0, 1);
      k.bubble(0.04 + r.range(0, 0.02), r.range(170, 230), 0.45, 0.09);
      k.bubble(0.1 + r.range(0, 0.04), r.range(260, 340), 0.2, 0.06);
      k.thump(0, 70, 50, 0.4, 0.1);
      return k.finish(-24, 0.05);
    }
    case 'cell': {
      // a fuel cell is full: a gauge tick and a soft steel "tink" one step up a major pentatonic
      const f = mtof(72 + penta(clampInt(p.pitch ?? 0, 0, 11)));
      const k = new Kit(sr, 0.9, r);
      k.clink(0, r.range(3200, 3800), 0.35, 0.012);
      const out = samples(sr, 0.8);
      addModes(out, 0, sr, [{ f, a: 1, t60: 0.6, beat: r.range(0.8, 1.5) }, { f: f * 2.76, a: 0.25, t60: 0.22 }, { f: f * 5.4, a: 0.07, t60: 0.08 }], 1, 0.0015);
      k.put(out, 0.004, 1);
      k.thump(0.004, 180, 140, 0.15, 0.08);
      return k.finish(-24, 0.1);
    }
    case 'drain': {
      // a cell is burned: a soft descending blip and a puff (it flies off to the funnel)
      const f = mtof(64 + penta(clampInt(p.pitch ?? 0, 0, 11)));
      const k = new Kit(sr, 0.4, r);
      k.put(chirp(sr, 0.26, f * 1.45, f, 0.1, 0.2, 0.004), 0, 1);
      const puff = noiseBurst(sr, 0.08, r, 0.01, 0.06);
      biquad(puff, 'bp', 700, 0.9, sr);
      k.put(puff, 0, 0.22);
      return k.finish(-27, 0.06);
    }
    case 'ratchet': {
      // the valve handwheel's pawl drops over three teeth
      const k = new Kit(sr, 0.2, r);
      const gap = r.range(0.032, 0.042);
      for (let i = 0; i < 3; i++) {
        const at = i * gap * r.range(0.9, 1.1);
        k.clink(at, r.range(2700, 3300) * (1 - i * 0.03), 1 - i * 0.15, 0.025);
        k.thump(at, 520, 380, 0.25, 0.02);
      }
      return k.finish(-27, 0.04);
    }
    case 'horn': {
      // the ship's typhon; `pitch` = ship size (bigger ships are lower); the harbour answers
      const size = clampInt(p.pitch ?? 0, 0, 4);
      const k = new Kit(sr, 2, r);
      k.horn(0, 110 * Math.pow(2, (-size * 2) / 12) * r.range(0.995, 1.005), 1.35, 1, { attack: 0.12, breath: 0.07 });
      return k.finish(-15, 0.22, { size: 0.85, tail: 2.4, damp: 0.7, echo: WIDE });
    }
    case 'toot': {
      // a tug or the pilot boat: the same voice two octaves up, short and cheeky
      const k = new Kit(sr, 0.6, r);
      k.horn(0, 440 * r.range(0.99, 1.01), 0.3, 1, { attack: 0.03, scoop: 0.04, breath: 0.05 });
      return k.finish(-21, 0.12, { size: 0.6, tail: 1.2, echo: MID });
    }
    case 'bell': {
      // the ship's bell struck in a sailor's pair: ding-ding
      const k = new Kit(sr, 3.6, r);
      const prime = 560 * r.range(0.997, 1.003);
      k.bell(0, prime, 1, r.range(0.85, 1));
      k.bell(r.range(0.28, 0.33), prime, 0.82, r.range(0.75, 0.9));
      return k.finish(-17, 0.16, { size: 0.6, tail: 1.6, echo: MID });
    }
    case 'pipe': {
      // the bosun's call: a glide 1.6→2.4 kHz, a trill, a fall
      const k = new Kit(sr, 1.5, r);
      const T = [0.05, 0.38, 0.95, 1.25];
      const tr = r.range(12, 14);
      const f = (t: number) => {
        if (t < T[0]) return 1600;
        if (t < T[1]) return 1600 * Math.pow(2400 / 1600, smooth((t - T[0]) / (T[1] - T[0])));
        if (t < T[2]) {
          const w = 0.5 + 0.5 * Math.sin(TAU * tr * (t - T[1]));
          return 2400 * (1 - 0.13 * w * w);
        }
        return 2400 * Math.pow(1300 / 2400, smooth((t - T[2]) / (T[3] - T[2])));
      };
      const amp = (t: number) => Math.min(1, t / 0.025) * (t > T[3] - 0.08 ? Math.max(0, (T[3] - t) / 0.08) : 1) * (t > T[1] && t < T[2] ? 0.92 : 1);
      k.put(tone(sr, T[3] + 0.01, f, amp, [1, 0.06, 0.02]), 0, 1);
      const br = noiseShaped(sr, T[3], r, (u) => amp(u * T[3]));
      biquad(br, 'bp', 2400, 2, sr);
      k.put(br, 0, 0.1);
      return k.finish(-23, 0.12, { echo: MID });
    }
    case 'gull':
    case 'gullFar': {
      // "kee-ow" two or three times; far gulls are fewer, darker and further off
      const far = name === 'gullFar';
      const n = far ? 1 + r.int(2) : 2 + r.int(2);
      const k = new Kit(sr, 1.6, r);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const len = i === 0 ? r.range(0.3, 0.38) : r.range(0.2, 0.28);
        k.gullCall(t, 1 - i * 0.18, len, r.range(2050, 2350), r.range(1200, 1400));
        t += len + r.range(0.06, 0.14);
      }
      biquad(k.m, 'lp', far ? 3200 : 6000, 0.7, sr);
      return far ? k.finish(-30, 0.4, { size: 0.7, tail: 1.4, echo: WIDE }) : k.finish(-22, 0.12, { echo: MID });
    }
    case 'splash': {
      // a mooring line slaps the water: the hit, a body "plunk", bubbles, drops falling back
      const k = new Kit(sr, 1.0, r);
      k.splashNoise(0, 0.3, 1, 0.6);
      k.thump(0, 190, 105, 0.45, 0.14);
      const slap = noiseBurst(sr, 0.018, r, 0.0005, 0.01);
      biquad(slap, 'hp', 900, 0.7, sr);
      k.put(slap, 0, 0.6);
      for (let i = 0; i < 14; i++) k.bubble(0.015 + 0.45 * Math.pow(r.next(), 1.8), r.range(450, 1500), r.range(0.06, 0.28), r.range(0.03, 0.08));
      for (let i = 0; i < 5; i++) k.bubble(r.range(0.3, 0.85), r.range(1300, 2600), r.range(0.04, 0.1), 0.025);
      return k.finish(-22, 0.1, { echo: NEAR });
    }
    case 'flag': {
      // hoisting: the halyard squeaks through its block, hand over hand, and the cloth ruffles up the mast
      const k = new Kit(sr, 1.0, r);
      for (const [at, g] of [[0, 1], [r.range(0.3, 0.36), 0.8]]) {
        const len = r.range(0.13, 0.18);
        const f0 = r.range(600, 760);
        const x = samples(sr, len);
        for (let t = 0; t < len; t += (1 / (f0 * (1 + (0.35 * t) / len))) * r.range(0.96, 1.04)) x[Math.round(t * sr)] += Math.sin((Math.PI * t) / len);
        const y = Float32Array.from(x);
        biquad(y, 'bp', 1400, 5, sr);
        const y2 = Float32Array.from(x);
        biquad(y2, 'bp', 2900, 4, sr);
        mix(y, normalize(y2, peakOf(y)), 0, sr, 0.5);
        k.put(y, at, g * 0.45);
      }
      const dur = 0.85;
      const fl = samples(sr, dur);
      const off = r.range(0, TAU);
      let ph = 0;
      for (let i = 0; i < fl.length; i++) {
        const t = i / sr;
        ph += (11 + 5 * Math.sin(TAU * 1.3 * t + off)) / sr;
        const flap = Math.pow(0.5 + 0.5 * Math.sin(TAU * ph), 3);
        fl[i] = r.bi() * flap * Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.25);
      }
      biquad(fl, 'bp', 1100, 0.8, sr);
      biquad(fl, 'lp', 3500, 0.7, sr);
      k.put(fl, 0.08, 0.6);
      return k.finish(-25, 0.06);
    }
    case 'stamp': {
      // customs: the stamp's thump, the paper's slap, the desk ringing (a little higher each star), the rubber peeling off
      const s = clampInt(p.pitch ?? 0, 0, 2);
      const k = new Kit(sr, 0.5, r);
      k.thump(0, 150, 72, 1, 0.13);
      const paper = noiseBurst(sr, 0.03, r, 0.0004, 0.018);
      biquad(paper, 'bp', 1900, 0.9, sr);
      biquad(paper, 'hp', 500, 0.7, sr);
      k.put(paper, 0.001, 0.7);
      const f = 185 * Math.pow(2, (s * 3) / 12) * r.range(0.98, 1.02);
      const desk = samples(sr, 0.3);
      addModes(desk, 0, sr, [{ f, a: 1, t60: 0.16 }, { f: f * 2.31, a: 0.5, t60: 0.09 }, { f: f * 3.9, a: 0.25, t60: 0.05 }], 1, 0.0008);
      k.put(desk, 0.002, 0.5);
      const peel = noiseBurst(sr, 0.04, r, 0.006, 0.03);
      biquad(peel, 'bp', 3200, 1.5, sr);
      k.put(peel, 0.11 + r.range(0, 0.02), 0.12);
      return k.finish(-19 + s * 0.5, 0.07);
    }
    case 'invalid': {
      // a two-tone reversing beeper, heard from the crane cab: beep-boop, beep-boop
      const k = new Kit(sr, 0.55, r);
      const beep = (at: number, f: number, g: number) => {
        const len = 0.085;
        const x = pulse(sr, len, () => f, 0.5);
        for (let i = 0; i < x.length; i++) x[i] *= Math.min(1, i / sr / 0.004) * Math.min(1, (len - i / sr) / 0.012);
        biquad(x, 'lp', 2400, 0.7, sr);
        biquad(x, 'peak', 2 * f, 3, sr, 3);
        k.put(x, at, g);
      };
      beep(0, 1180, 1);
      beep(0.115, 940, 0.9);
      beep(0.23, 1180, 0.8);
      beep(0.345, 940, 0.72);
      return k.finish(-25, 0.05, { echo: NEAR });
    }
    case 'undo': {
      // the crane carries the box back: a whoosh with a hook clink, played backwards, then it settles
      const k = new Kit(sr, 0.45, r);
      const b = new Kit(sr, 0.34, r);
      b.swish(0, 0.3, 2600, 450, 1, 1.0, (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 2));
      b.clink(0, 1800, 0.25, 0.08);
      b.steel(0, 620, 0.2, { t60: 0.2, bright: 0.4 });
      const rev = Float32Array.from(b.m).reverse();
      fadeIn(rev, 0.01, sr);
      fadeOut(rev, 0.004, sr);
      k.put(rev, 0, 1);
      k.thump(0.33, 130, 90, 0.3, 0.08);
      return k.finish(-25, 0.06);
    }
    case 'sputter': {
      // out of fuel: the engine's beat falters and drops out, two backfires, silence… one drip
      const k = new Kit(sr, 3.0, r);
      const chug = (at: number, g: number) => {
        const x = chirp(sr, 0.16, 62, 44, 0.03, 0.12, 0.003);
        mix(x, chirp(sr, 0.1, 124, 90, 0.03, 0.07, 0.003), 0, sr, 0.4);
        const ch = noiseBurst(sr, 0.08, r, 0.002, 0.05);
        biquad(ch, 'lp', 500, 0.7, sr);
        mix(x, normalize(ch, 1), 0, sr, 0.35);
        k.put(x, at, g);
      };
      [[0, 1], [0.15, 0.95], [0.3, 0.9], [0.46, 0.7], [0.63, 0.85], [0.98, 0.55], [1.2, 0.35]].forEach(([at, g]) => chug(at + r.range(-0.01, 0.01), g * 0.7));
      const pop = (at: number, g: number) => {
        const n = noiseBurst(sr, 0.06, r, 0.0003, 0.04);
        biquad(n, 'lp', 2600, 0.7, sr);
        k.put(n, at, g);
        k.thump(at, 140, 55, g * 0.8, 0.25);
      };
      pop(1.36, 1);
      pop(1.58, 0.75);
      k.put(chirp(sr, 0.09, 950, 1750, 0.025, 0.06, 0.0008), 2.45, 0.3);
      const plip = noiseBurst(sr, 0.006, r, 0.0002, 0.004);
      biquad(plip, 'hp', 2000, 0.7, sr);
      k.put(plip, 2.45, 0.08);
      return k.finish(-18, 0.1, { echo: MID });
    }
    case 'whistle': {
      // the harbour master's pea whistle: tweet — tweeeet (the pea warbles pitch and level)
      const k = new Kit(sr, 1.0, r);
      const blast = (at: number, len: number, g: number) => {
        const rate = r.range(26, 32);
        const f0 = r.range(2850, 3100);
        const pea = (t: number) => Math.sin(TAU * rate * t + 0.6 * Math.sin(TAU * 3.1 * t));
        const f = (t: number) => f0 * (1 + 0.045 * pea(t)) * (1 - 0.02 * Math.exp(-t / 0.02));
        const amp = (t: number) => Math.min(1, t / 0.015) * Math.max(0, Math.min(1, (len - t) / 0.03)) * (0.72 + 0.28 * pea(t + 0.004));
        const x = tone(sr, len, f, amp, [1, 0.12, 0.03]);
        const br = noiseShaped(sr, len, r, (u) => amp(u * len));
        biquad(br, 'bp', f0, 2, sr);
        mix(x, normalize(br, peakOf(x)), 0, sr, 0.2);
        k.put(x, at, g);
      };
      blast(0, 0.16, 0.9);
      blast(0.24, 0.52, 1);
      biquad(k.m, 'lp', 7000, 0.7, sr);
      return k.finish(-25, 0.08, { echo: MID });
    }
    case 'coin': {
      // freight paid: the register's lever, the drawer, its bright little bell, coins settling
      const k = new Kit(sr, 1.4, r);
      k.clink(0, 1500, 0.35, 0.03);
      k.clink(0.045, 1250, 0.3, 0.035);
      k.thump(0.05, 170, 110, 0.25, 0.06);
      const f = 2350 * r.range(0.995, 1.005);
      const bell = samples(sr, 1.3);
      addModes(bell, 0, sr, [{ f, a: 1, t60: 1.1, beat: 1.6 }, { f: f * 2.32, a: 0.4, t60: 0.5, beat: 2.7 }, { f: f * 4.07, a: 0.12, t60: 0.22 }], 1, 0.0005);
      k.put(bell, 0.07, 1);
      for (const [at, g] of [[0.15, 0.22], [0.22, 0.15], [0.27, 0.1]]) {
        const c = samples(sr, 0.2);
        const j = r.range(0.95, 1.05);
        addModes(c, 0, sr, [{ f: 3600 * j, a: 1, t60: 0.12 }, { f: 5100 * j, a: 0.6, t60: 0.08 }, { f: 7300 * j, a: 0.3, t60: 0.05 }], 1, 0.0002);
        k.put(c, at + r.range(0, 0.01), g);
      }
      return k.finish(-19, 0.1);
    }
    case 'win': {
      // arrival: the typhon greets the port, the bell rings twice, and a brass flourish climbs to the
      // tonic of the music that is playing
      const key = clampInt(p.key ?? 7, 0, 11);
      const T = 55 + ((key - 7 + 12) % 12);
      const k = new Kit(sr, 3.0, r);
      k.horn(0, mtof(T - 12), 0.55, 0.55, { attack: 0.1 });
      k.bell(0.22, 560, 0.5, 0.9);
      k.bell(0.48, 560, 0.42, 0.8);
      [-5, 0, 4, 7].forEach((iv, i) => k.brass(0.62 + i * 0.12, mtof(T + iv), 0.11, 0.55 + i * 0.07));
      const end = 0.62 + 4 * 0.12;
      for (const iv of [0, 4, 7, 12]) k.brass(end, mtof(T + iv), 0.85, 0.5);
      k.brass(end, mtof(T - 12), 0.85, 0.45);
      return k.finish(-14, 0.18, { size: 0.7, tail: 1.8, echo: MID });
    }
    case 'fail': {
      // a gentle "wah-wah" on a low reed: never punishing
      const k = new Kit(sr, 1.8, r);
      k.reedWah(0, mtof(46), 0.36, 1);
      k.reedWah(0.42, mtof(45), 0.95, 1, 0.035);
      return k.finish(-21, 0.12);
    }
    case 'unlock': {
      // something new: a reed-organ chord swells and four bronze chimes climb over it
      const k = new Kit(sr, 2.4, r);
      const pad = samples(sr, 1.8);
      for (const m of [55, 59, 62, 67]) mix(pad, saw(sr, 1.8, () => mtof(m) * r.range(0.999, 1.001), r.next()), 0, sr, 0.25);
      biquad(pad, 'lp', 1100, 0.7, sr);
      biquad(pad, 'lp', 1400, 0.7, sr);
      for (let i = 0; i < pad.length; i++) pad[i] *= Math.pow(Math.sin((Math.PI * i) / pad.length), 1.5);
      k.put(pad, 0.02, 0.35);
      [79, 83, 86, 91].forEach((m, i) => k.chime(0.06 + i * 0.1, mtof(m), 0.8 + i * 0.06, 1.3));
      const sp = crackle(sr, 0.9, r, 220, 30, (u) => 1 - u);
      biquad(sp, 'bp', 6500, 0.8, sr);
      k.put(sp, 0.3, 0.08);
      return k.finish(-17, 0.18, { echo: MID });
    }
    case 'star': {
      // one star: a bronze chime, a step higher each time, with a wisp of sparkle
      const s = clampInt(p.pitch ?? 0, 0, 2);
      const f = mtof([84, 88, 91][s]);
      const k = new Kit(sr, 1.8, r);
      k.chime(0, f, 1, 1.5);
      k.chime(0.002, f / 2, 0.18, 1.0, 0.2);
      const sp = crackle(sr, 0.5, r, 260, 40, (u) => 1 - u);
      biquad(sp, 'bp', 6500, 0.8, sr);
      k.put(sp, 0.01, 0.1);
      return k.finish(-17, 0.16);
    }
    // ---------------------------------------------------------------- ambience one-shots
    case 'slap': {
      // a wave slaps the quay: a hollow "chock" under the stones, spray, a few bubbles
      const k = new Kit(sr, 0.7, r);
      const body = noiseBurst(sr, 0.25, r, r.range(0.004, 0.012), r.range(0.08, 0.15));
      const b1 = Float32Array.from(body);
      biquad(b1, 'bp', r.range(180, 320), 3.5, sr);
      biquad(body, 'lp', 900, 0.7, sr);
      mix(body, normalize(b1, 1), 0, sr, 0.8);
      k.put(body, 0, 1);
      const spray = noiseBurst(sr, 0.35, r, 0.01, 0.25);
      biquad(spray, 'hp', 1500, 0.7, sr);
      biquad(spray, 'lp', 6000, 0.7, sr);
      k.put(spray, 0.01, 0.18);
      for (let i = 0, n = 3 + r.int(4); i < n; i++) k.bubble(r.range(0.02, 0.3), r.range(400, 1100), r.range(0.05, 0.15), r.range(0.03, 0.07));
      return k.finish(-30, 0.1);
    }
    case 'creak': {
      // a mooring line creaks on its bollard: slow stick–slip through the rope and the wood
      const k = new Kit(sr, 1.1, r);
      const len = r.range(0.5, 0.9);
      const x = samples(sr, len + 0.05);
      const f0 = r.range(25, 45);
      const f1 = f0 * r.range(1.6, 2.4);
      for (let t = 0; t < len;) {
        const u = t / len;
        x[Math.round(t * sr)] += Math.sin(Math.PI * u) * r.range(0.5, 1);
        t += (1 / (f0 + (f1 - f0) * Math.sin(Math.PI * u * 0.5))) * r.range(0.9, 1.1);
      }
      const a = Float32Array.from(x);
      biquad(a, 'bp', r.range(380, 520), 4, sr);
      const b = Float32Array.from(x);
      biquad(b, 'bp', r.range(900, 1200), 3, sr);
      mix(a, normalize(b, peakOf(a)), 0, sr, 0.5);
      k.put(a, 0, 1);
      return k.finish(-30, 0.08);
    }
    case 'buoy': {
      // a bell buoy out by the breakwater, rocking: two or three uneven strikes, far away
      const k = new Kit(sr, 4.2, r);
      const prime = 420 * r.range(0.99, 1.01);
      let t = 0;
      for (let i = 0, n = 2 + r.int(2); i < n; i++) {
        k.bell(t, prime, 1 - i * 0.2, r.range(0.6, 0.9), 2.6);
        t += r.range(0.45, 0.9);
      }
      biquad(k.m, 'lp', 2400, 0.7, sr);
      return k.finish(-32, 0.4, { size: 0.75, tail: 1.8, echo: WIDE });
    }
  }
}

/** Every distinct sound worth auditioning or measuring (name, params, label). */
export function sfxCatalog(): { name: SfxName; opts: SfxParams; label: string }[] {
  const out: { name: SfxName; opts: SfxParams; label: string }[] = [];
  for (const name of SFX_NAMES) {
    const steps = PITCH_STEPS[name];
    if (steps) for (let i = 0; i < steps; i++) out.push({ name, opts: { pitch: i }, label: `${name}-${i}` });
    else out.push({ name, opts: {}, label: name });
  }
  return out;
}
