/**
 * The loops that run under everything: the harbour bed and the ship's diesel.
 *
 * Both are baked once into short seamless loops (everything periodic is laid out circularly, noise
 * is cross-faded into itself) and played by a handful of live nodes, so they cost almost nothing:
 *
 * - Sea: a deep brown-noise swell (11.3 s loop) and water lapping at the quay with a fizz of foam
 *   (14.7 s loop, different on each side), both breathing under slow LFOs that never line up, plus
 *   one-shots on a timer: slaps on the quay, a mooring line creaking, rare distant gulls, rarer
 *   still a bell buoy out by the breakwater.
 * - Diesel: eight firing pulses of a 44 Hz thump with harmonics, exhaust chuffs and valve ticks
 *   (one loop), and a "grit" loop of injector knock, rattle and hard exhaust in step with it.
 *   RPM is the loops' playbackRate (pitch and pulse rate rise together, as on a real engine:
 *   35→55 Hz, 5→8 pulses a second); load also opens a low-pass and brings the grit in.
 */
import { biquad, brown, clamp, crackle, loopify, mixWrap, noiseBurst, normalize, peakOf, rmsOf, Rng, samples, scale, TAU } from './dsp';
import type { BedSound } from './sfx';

export const BED_RATE = 22050;

export interface Loop2 {
  L: Float32Array;
  R: Float32Array;
  sr: number;
}

/** Set the loudness of a stereo loop (RMS), keeping its peaks under 0.95. */
function setRms(L: Float32Array, R: Float32Array, to: number): void {
  let g = to / Math.max(rmsOf(L), rmsOf(R), 1e-9);
  const pk = Math.max(peakOf(L), peakOf(R)) * g;
  if (pk > 0.95) g *= 0.95 / pk;
  scale(L, g);
  scale(R, g);
}

/** The deep swell: brown noise below 500 Hz, two decorrelated sides. */
export function bakeSwell(seed: number): Loop2 {
  const sr = BED_RATE;
  const r = new Rng(seed);
  const side = () => {
    const x = brown(sr, 11.3 + 1.2, r, 18);
    biquad(x, 'lp', 500, 0.7, sr);
    biquad(x, 'lp', 500, 0.7, sr);
    biquad(x, 'hp', 35, 0.7, sr);
    return loopify(x, 1.2, sr);
  };
  const a = side();
  const b = side();
  const L = new Float32Array(a.length);
  const R = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    L[i] = a[i] + 0.35 * b[i];
    R[i] = b[i] + 0.35 * a[i];
  }
  setRms(L, R, 0.2);
  return { L, R, sr };
}

/** Water lapping at the quay: washes at irregular intervals, each leaving a fizz of foam. */
export function bakeLap(seed: number): Loop2 {
  const sr = BED_RATE;
  const len = 14.7;
  const N = Math.round(len * sr);
  const side = (r: Rng) => {
    const env = new Float32Array(N);
    const foamEnv = new Float32Array(N);
    for (let t = r.range(0, 1); t < len; t += r.range(1.3, 3.4)) {
      const rise = r.range(0.3, 0.6);
      const fall = r.range(0.8, 1.7);
      const a = r.range(0.35, 1);
      const i0 = Math.round(t * sr);
      const n = Math.round((rise + fall * 2) * sr);
      for (let k = 0; k < n; k++) {
        const tt = k / sr;
        env[(i0 + k) % N] += a * (tt < rise ? Math.pow(Math.sin(((Math.PI / 2) * tt) / rise), 2) : Math.exp(-(tt - rise) / (fall * 0.4)));
      }
      const f0 = i0 + Math.round(rise * sr);
      for (let k = 0, nf = Math.round(fall * 1.5 * sr); k < nf; k++) foamEnv[(f0 + k) % N] += a * Math.exp(-k / sr / (fall * 0.5));
    }
    const raw = new Float32Array(N + Math.round(0.5 * sr));
    for (let i = 0; i < raw.length; i++) raw[i] = r.bi();
    biquad(raw, 'bp', 600, 0.5, sr);
    biquad(raw, 'lp', 1500, 0.7, sr);
    const water = loopify(raw, 0.5, sr);
    const foam = loopify(crackle(sr, len + 0.5, r, 900, 900), 0.5, sr);
    biquad(foam, 'bp', 4200, 0.9, sr);
    normalize(water, 1);
    normalize(foam, 1);
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = water[i] * env[i] + 0.25 * foam[i] * foamEnv[i];
    return out;
  };
  const a = side(new Rng(seed));
  const b = side(new Rng(seed * 31 + 7));
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    L[i] = a[i] + 0.25 * b[i];
    R[i] = b[i] + 0.25 * a[i];
  }
  setRms(L, R, 0.12);
  return { L, R, sr };
}

export interface DieselLoops {
  clean: Float32Array;
  grit: Float32Array;
  sr: number;
}

/** The diesel's loops at playbackRate 1: 6.5 pulses a second over a 44 Hz thump. */
export function bakeDiesel(seed: number): DieselLoops {
  const sr = BED_RATE;
  const r = new Rng(seed);
  const PULSES = 8;
  const P = Math.round(sr / 6.5);
  const N = P * PULSES;
  // whole cycles of the hum in the loop, so it repeats without a seam
  const hum = (Math.round((44 * N) / sr) * sr) / N;
  const clean = new Float32Array(N);
  const grit = new Float32Array(N);
  for (let i = 0; i < N; i++) clean[i] = 0.18 * Math.sin((TAU * hum * i) / sr) + 0.07 * Math.sin((TAU * 2 * hum * i) / sr + 0.7);
  // cylinder to cylinder, no two firings are quite alike
  const amps = [1, 0.86, 0.95, 0.8, 1, 0.9, 0.84, 0.93];
  for (let j = 0; j < PULSES; j++) {
    const at = (j * P) / sr + r.range(-0.003, 0.003);
    const a = amps[j] * r.range(0.95, 1.05);
    const x = samples(sr, 0.25);
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.05);
      x[i] = e * (Math.sin(TAU * hum * t) + 0.5 * Math.sin(TAU * 2 * hum * t) + 0.3 * Math.sin(TAU * 3 * hum * t) + 0.15 * Math.sin(TAU * 4.1 * hum * t));
    }
    mixWrap(clean, x, at, sr, a * 0.8);
    const chuff = noiseBurst(sr, 0.12, r, 0.003, 0.08);
    biquad(chuff, 'lp', 380, 0.7, sr);
    mixWrap(clean, normalize(chuff, 1), at + 0.004, sr, a * 0.35);
    const tick = noiseBurst(sr, 0.01, r, 0.0003, 0.006);
    biquad(tick, 'bp', 2200, 1.2, sr);
    mixWrap(clean, normalize(tick, 1), at + 0.03, sr, 0.05);
    // the grit: injector knock, a rattle, a harder exhaust
    const knock = noiseBurst(sr, 0.05, r, 0.0005, 0.03);
    biquad(knock, 'bp', 1250, 1.5, sr);
    mixWrap(grit, normalize(knock, 1), at + 0.008, sr, a * 0.6);
    const rattle = crackle(sr, 0.12, r, 600, 200);
    biquad(rattle, 'bp', 3000, 1, sr);
    mixWrap(grit, normalize(rattle, 1), at + 0.01, sr, a * 0.25);
    const ex = noiseBurst(sr, 0.1, r, 0.002, 0.07);
    biquad(ex, 'lp', 900, 0.7, sr);
    mixWrap(grit, normalize(ex, 1), at, sr, a * 0.6);
  }
  normalize(clean, 0.9);
  normalize(grit, 0.7);
  return { clean, grit, sr };
}

// ------------------------------------------------------------------ live players

const stereoBuffer = (ctx: BaseAudioContext, l: Loop2): AudioBuffer => {
  const b = ctx.createBuffer(2, l.L.length, l.sr);
  b.getChannelData(0).set(l.L);
  b.getChannelData(1).set(l.R);
  return b;
};
const monoBuffer = (ctx: BaseAudioContext, x: Float32Array, sr: number): AudioBuffer => {
  const b = ctx.createBuffer(1, x.length, sr);
  b.getChannelData(0).set(x);
  return b;
};

/** Baked bed buffers for one context (made on first use). */
export class BedBuffers {
  private sw: AudioBuffer | null = null;
  private lp: AudioBuffer | null = null;
  private dz: { clean: AudioBuffer; grit: AudioBuffer } | null = null;
  constructor(private ctx: BaseAudioContext) {}
  get swell(): AudioBuffer {
    return (this.sw ??= stereoBuffer(this.ctx, bakeSwell(11)));
  }
  get lap(): AudioBuffer {
    return (this.lp ??= stereoBuffer(this.ctx, bakeLap(23)));
  }
  get diesel(): { clean: AudioBuffer; grit: AudioBuffer } {
    if (!this.dz) {
      const d = bakeDiesel(5);
      this.dz = { clean: monoBuffer(this.ctx, d.clean, d.sr), grit: monoBuffer(this.ctx, d.grit, d.sr) };
    }
    return this.dz;
  }
}

/** A one-shot request: which sound, when, how loud, where. */
export type Shot = (name: BedSound, t: number, volume: number, pan: number) => void;

/** How often each one-shot comes round (seconds between, min..max) and how loud. */
const EVENTS: Record<BedSound, { gap: [number, number]; vol: [number, number]; first: [number, number] }> = {
  slap: { gap: [2.5, 8], vol: [0.45, 1], first: [1, 4] },
  creak: { gap: [12, 30], vol: [0.4, 0.8], first: [6, 14] },
  gullFar: { gap: [24, 60], vol: [0.5, 1], first: [8, 20] },
  buoy: { gap: [70, 140], vol: [0.6, 1], first: [30, 60] },
};

/** The harbour bed, live: two looping layers under slow LFOs, and one-shots on a schedule. */
export class SeaBed {
  readonly out: GainNode;
  private srcs: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private next: Record<BedSound, number>;
  private stopped = false;

  constructor(private ctx: BaseAudioContext, dest: AudioNode, bufs: BedBuffers, private shot: Shot, private r: Rng, t: number) {
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + 2.5);
    this.out.connect(dest);
    this.nodes.push(this.out);
    this.layer(bufs.swell, 0.75, [[0.071, 0.2], [0.031, 0.12]], t);
    this.layer(bufs.lap, 0.7, [[0.113, 0.18]], t);
    this.next = { slap: 0, creak: 0, gullFar: 0, buoy: 0 };
    for (const k of Object.keys(EVENTS) as BedSound[]) this.next[k] = t + r.range(...EVENTS[k].first);
  }

  private layer(buf: AudioBuffer, level: number, lfos: [number, number][], t: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = level;
    for (const [hz, depth] of lfos) {
      const o = ctx.createOscillator();
      o.frequency.value = hz * this.r.range(0.9, 1.1);
      const d = ctx.createGain();
      d.gain.value = depth;
      o.connect(d);
      d.connect(g.gain);
      o.start(t);
      this.srcs.push(o);
      this.nodes.push(d);
    }
    src.connect(g);
    g.connect(this.out);
    src.start(t, this.r.range(0, buf.duration));
    this.srcs.push(src);
    this.nodes.push(g);
  }

  /** Schedule the one-shots that fall before `until`. */
  pump(until: number): void {
    if (this.stopped) return;
    for (const k of Object.keys(EVENTS) as BedSound[]) {
      const e = EVENTS[k];
      while (this.next[k] < until) {
        this.shot(k, this.next[k], this.r.range(...e.vol), this.r.range(-0.8, 0.8));
        this.next[k] += this.r.range(...e.gap);
      }
    }
  }

  stop(t: number, fade = 2): void {
    if (this.stopped) return;
    this.stopped = true;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    for (const s of this.srcs) s.stop(t + fade + 0.1);
    const nodes = this.nodes;
    this.srcs[0].onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }
}

const rateOf = (load: number) => 0.8 + 0.45 * load;
const gritOf = (load: number) => 0.08 + 0.9 * Math.pow(load, 1.4);
const toneOf = (load: number) => 700 + 2200 * load;

/** The ship's diesel, live: two loops in step, RPM = playbackRate, load = grit and brightness. */
export class DieselRun {
  private srcs: AudioBufferSourceNode[] = [];
  private grit: GainNode;
  private lp: BiquadFilterNode;
  private out: GainNode;
  private stopped = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode, bufs: BedBuffers, t: number, load: number) {
    const l = clamp(load, 0, 1);
    const { clean, grit } = bufs.diesel;
    this.out = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.6;
    this.lp.frequency.setValueAtTime(toneOf(l) * 0.6, t);
    this.lp.frequency.setTargetAtTime(toneOf(l), t, 0.8);
    this.grit = ctx.createGain();
    this.grit.gain.setValueAtTime(0, t);
    this.grit.gain.setTargetAtTime(gritOf(l), t + 0.4, 0.8);
    const body = ctx.createGain();
    body.gain.value = 1;
    for (const [buf, g] of [[clean, body], [grit, this.grit]] as const) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      // she cranks over slowly, then catches and runs up to speed
      s.playbackRate.setValueAtTime(0.5, t);
      s.playbackRate.setTargetAtTime(rateOf(l), t + 0.15, 0.7);
      s.connect(g);
      g.connect(this.lp);
      s.start(t);
      this.srcs.push(s);
    }
    this.lp.connect(this.out);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.setTargetAtTime(1, t, 0.45);
    this.out.connect(dest);
  }

  setLoad(load: number, t: number): void {
    if (this.stopped) return;
    const l = clamp(load, 0, 1);
    for (const s of this.srcs) s.playbackRate.setTargetAtTime(rateOf(l), t, 0.6);
    this.grit.gain.setTargetAtTime(gritOf(l), t, 0.5);
    this.lp.frequency.setTargetAtTime(toneOf(l), t, 0.5);
  }

  /** Fade out, the revs sagging as she winds down. */
  stop(t: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.45);
    for (const s of this.srcs) {
      s.playbackRate.cancelScheduledValues(t);
      s.playbackRate.setTargetAtTime(0.45, t, 0.8);
      s.stop(t + 2.6);
    }
    const out = this.out;
    this.srcs[0].onended = () => out.disconnect();
  }
}
