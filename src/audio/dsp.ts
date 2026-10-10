/**
 * Sample-level synthesis: pure functions that fill Float32Arrays. Struck steel and bronze (modal
 * synthesis), filtered and brown noise, band-limited saws and pulses, plucked strings
 * (Karplus–Strong), seamless loops and a compact Freeverb-style room.
 *
 * The engine bakes SFX, instrument notes and the ambience/engine loops with these into AudioBuffers
 * once and afterwards only plays buffers, which keeps the live Web Audio graph tiny on phones.
 * (Much of this is shared with Mise en Place's audio.)
 */

export const TAU = Math.PI * 2;
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const clampInt = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, Math.round(v)));

/** Small deterministic xorshift generator. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
    for (let i = 0; i < 4; i++) this.next();
  }
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    this.s = s;
    return s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)];
  }
  /** uniform in [-1, 1) */
  bi(): number {
    return this.next() * 2 - 1;
  }
  /** roughly normal, mean 0, sd ~1 */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.73;
  }
}

export const samples = (sr: number, sec: number): Float32Array => new Float32Array(Math.max(1, Math.ceil(sr * sec)));

// ------------------------------------------------------------------ filters

export type BQ = 'lp' | 'hp' | 'bp' | 'peak' | 'ls' | 'hs';

/** RBJ cookbook biquad coefficients, normalised: [b0, b1, b2, a1, a2]. 'bp' has 0 dB peak gain. */
export function coefs(type: BQ, f: number, q: number, sr: number, db = 0): number[] {
  const w = (TAU * Math.min(Math.max(f, 5), sr * 0.49)) / sr;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const A = Math.pow(10, db / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (type) {
    case 'lp':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'hp':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'bp':
      b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
      break;
    case 'peak':
      b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A;
      break;
    case 'ls': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 'hs': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Biquad in place. `f` may be a function of time (seconds) for sweeps (coefficients refresh every 32 samples). */
export function biquad(x: Float32Array, type: BQ, f: number | ((t: number) => number), q: number, sr: number, db = 0): Float32Array {
  const sweep = typeof f === 'function';
  let c = coefs(type, sweep ? f(0) : f, q, sr, db);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (sweep && (i & 31) === 0 && i > 0) c = coefs(type, f(i / sr), q, sr, db);
    const xi = x[i];
    const y = c[0] * xi + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** One-pole lowpass in place. */
export function lowpass1(x: Float32Array, f: number, sr: number): Float32Array {
  const a = Math.exp((-TAU * f) / sr);
  let z = 0;
  for (let i = 0; i < x.length; i++) {
    z = x[i] * (1 - a) + z * a;
    x[i] = z;
  }
  return x;
}

/** DC blocker in place. */
export function dcBlock(x: Float32Array, r = 0.995): Float32Array {
  let x1 = 0, y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + r * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Gentle saturation in place (tanh, level-preserving for small signals). */
export function saturate(x: Float32Array, drive: number): Float32Array {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

// ------------------------------------------------------------------ helpers

export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return Math.sqrt(e / Math.max(1, to - from));
}

export function scale(x: Float32Array, g: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function normalize(x: Float32Array, to = 1): Float32Array {
  const p = peakOf(x);
  return p > 1e-9 ? scale(x, to / p) : x;
}

/** Add `src` into `dst` starting at `at` seconds. */
export function mix(dst: Float32Array, src: Float32Array, at: number, sr: number, gain = 1): void {
  const o = Math.round(at * sr);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
}

/** Add `src` into a loop `dst`, wrapping around the end (circular, for seamless loops). */
export function mixWrap(dst: Float32Array, src: Float32Array, at: number, sr: number, gain = 1): void {
  const n = dst.length;
  const o = ((Math.round(at * sr) % n) + n) % n;
  for (let i = 0; i < src.length; i++) dst[(o + i) % n] += src[i] * gain;
}

export function fadeOut(x: Float32Array, sec: number, sr: number): Float32Array {
  const n = Math.min(x.length, Math.round(sec * sr));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
  return x;
}

export function fadeIn(x: Float32Array, sec: number, sr: number): Float32Array {
  const n = Math.min(x.length, Math.round(sec * sr));
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}

/** Loudest short-term RMS (50 ms windows, 25 ms hop): a simple "how loud does this feel". */
export function loudest(x: Float32Array, sr: number, win = 0.05): number {
  const w = Math.max(1, Math.round(win * sr));
  const hop = Math.max(1, w >> 1);
  let best = 0;
  for (let i = 0; i < Math.max(1, x.length - w + 1); i += hop) {
    let e = 0;
    const n = Math.min(w, x.length - i);
    for (let j = 0; j < n; j++) e += x[i + j] * x[i + j];
    best = Math.max(best, e / w);
  }
  return Math.sqrt(best);
}

/** Length after which everything is below `floorDb` (keeps baked buffers short). */
export function tailEnd(x: Float32Array, floorDb = -70): number {
  const lim = Math.pow(10, floorDb / 20) * peakOf(x);
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]) > lim) return i + 1;
  return 1;
}

/**
 * Make `x` loop seamlessly: the last `xfade` seconds are cross-faded (equal power) into the start
 * and cut off. The result is `xfade` seconds shorter.
 */
export function loopify(x: Float32Array, xfade: number, sr: number): Float32Array {
  const m = Math.min(Math.floor(x.length / 2), Math.round(xfade * sr));
  const n = x.length - m;
  const out = x.slice(0, n);
  for (let i = 0; i < m; i++) {
    const u = i / m;
    out[i] = x[i] * Math.sin((u * Math.PI) / 2) + x[n + i] * Math.cos((u * Math.PI) / 2);
  }
  return out;
}

// ------------------------------------------------------------------ sources

/** White noise shaped by an attack and an exponential decay (t60 seconds), `dur` seconds long. */
export function noiseBurst(sr: number, dur: number, rng: Rng, attack = 0.001, t60 = dur): Float32Array {
  const x = samples(sr, dur);
  const na = Math.max(1, Math.round(attack * sr));
  const k = Math.pow(10, -3 / (t60 * sr));
  let env = 1;
  for (let i = 0; i < x.length; i++) {
    const a = i < na ? i / na : 1;
    if (i >= na) env *= k;
    x[i] = rng.bi() * a * env;
  }
  return x;
}

/** Noise with a free-form envelope `env(u)` over u in [0,1]. */
export function noiseShaped(sr: number, dur: number, rng: Rng, env: (u: number) => number): Float32Array {
  const x = samples(sr, dur);
  for (let i = 0; i < x.length; i++) x[i] = rng.bi() * env(i / x.length);
  return x;
}

/** Brown (red) noise: leaky-integrated white noise, normalised to peak 1. */
export function brown(sr: number, dur: number, rng: Rng, corner = 20): Float32Array {
  const x = samples(sr, dur);
  const leak = Math.exp((-TAU * corner) / sr);
  let z = 0;
  for (let i = 0; i < x.length; i++) {
    z = z * leak + rng.bi() * (1 - leak) * 6;
    x[i] = z;
  }
  dcBlock(x, 0.9995);
  return normalize(x, 1);
}

export interface Mode {
  /** frequency (Hz) */
  f: number;
  /** amplitude */
  a: number;
  /** time to fall by 60 dB (s) */
  t60: number;
  /** split into two partials this many Hz apart: the slow beating of real bells and plates */
  beat?: number;
}

/** Struck object: decaying sinusoids added into `out` at `at` seconds (recursive oscillators, cheap). */
export function addModes(out: Float32Array, at: number, sr: number, modes: Mode[], gain = 1, attack = 0.0006): void {
  const start = Math.max(0, Math.round(at * sr));
  const na = Math.max(1, Math.round(attack * sr));
  for (const m of modes) {
    if (m.f <= 0 || m.f >= sr * 0.46 || m.a <= 0) continue;
    const parts = m.beat ? [m.f - m.beat / 2, m.f + m.beat / 2] : [m.f];
    const len = Math.min(out.length - start, Math.ceil(m.t60 * sr));
    const k = Math.pow(10, -3 / (m.t60 * sr));
    for (const f of parts) {
      const w = (TAU * f) / sr;
      const c = 2 * Math.cos(w);
      let s1 = Math.sin(-w), s2 = Math.sin(-2 * w);
      let env = (m.a * gain) / parts.length;
      for (let i = 0; i < len; i++) {
        const s = c * s1 - s2;
        s2 = s1;
        s1 = s;
        out[start + i] += s * env * (i < na ? i / na : 1);
        env *= k;
      }
    }
  }
}

/** A sine that glides from f0 to f1 (exponentially over `glide` s) and decays (t60). */
export function chirp(sr: number, dur: number, f0: number, f1: number, glide: number, t60: number, attack = 0.002): Float32Array {
  const x = samples(sr, dur);
  const na = Math.max(1, Math.round(attack * sr));
  const k = Math.pow(10, -3 / (t60 * sr));
  let ph = 0;
  let env = 1;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const f = t < glide ? f0 * Math.pow(f1 / f0, t / glide) : f1;
    ph += f / sr;
    ph -= Math.floor(ph);
    if (i >= na) env *= k;
    x[i] = Math.sin(TAU * ph) * env * (i < na ? i / na : 1);
  }
  return x;
}

/**
 * A tone with a free pitch curve `f(t)`, harmonic weights `harm` (1 = fundamental) and amplitude
 * envelope `amp(t)`: whistles, calls, the gull. Harmonics above 0.45·sr are dropped.
 */
export function tone(sr: number, dur: number, f: (t: number) => number, amp: (t: number) => number, harm: number[] = [1]): Float32Array {
  const x = samples(sr, dur);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const fi = f(t);
    ph += fi / sr;
    ph -= Math.floor(ph);
    let s = 0;
    for (let h = 0; h < harm.length; h++) if (harm[h] && fi * (h + 1) < sr * 0.45) s += harm[h] * Math.sin(TAU * ph * (h + 1));
    x[i] = s * amp(t);
  }
  return x;
}

/** Band-limited (polyBLEP) sawtooth with a pitch curve `f(t)`. */
export function saw(sr: number, dur: number, f: (t: number) => number, phase0 = 0): Float32Array {
  const x = samples(sr, dur);
  let ph = phase0 - Math.floor(phase0);
  for (let i = 0; i < x.length; i++) {
    const dt = Math.min(0.45, f(i / sr) / sr);
    ph += dt;
    if (ph >= 1) ph -= 1;
    x[i] = 2 * ph - 1 - blep(ph, dt);
  }
  return x;
}

/** Band-limited (polyBLEP) pulse wave, duty 0..1, with a pitch curve `f(t)`. */
export function pulse(sr: number, dur: number, f: (t: number) => number, duty = 0.5): Float32Array {
  const x = samples(sr, dur);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const dt = Math.min(0.45, f(i / sr) / sr);
    ph += dt;
    if (ph >= 1) ph -= 1;
    let p2 = ph + duty;
    if (p2 >= 1) p2 -= 1;
    // difference of two saws: a pulse with both edges band-limited
    x[i] = 2 * ph - 1 - blep(ph, dt) - (2 * p2 - 1 - blep(p2, dt));
  }
  return x;
}

function blep(ph: number, dt: number): number {
  if (ph < dt) {
    const u = ph / dt;
    return u + u - u * u - 1;
  }
  if (ph > 1 - dt) {
    const u = (ph - 1) / dt;
    return u * u + u + u + 1;
  }
  return 0;
}

/** Sparse crackle: random tiny impulses whose rate goes from r0 to r1 per second (beads, foam, fizz). */
export function crackle(sr: number, dur: number, rng: Rng, r0: number, r1: number, env: (u: number) => number = () => 1): Float32Array {
  const x = samples(sr, dur);
  for (let i = 0; i < x.length; i++) {
    const u = i / x.length;
    const rate = r0 + (r1 - r0) * u;
    if (rng.next() < rate / sr) {
      const a = env(u) * (0.3 + 0.7 * rng.next()) * (rng.next() < 0.5 ? -1 : 1);
      const w = 1 + rng.int(3);
      for (let j = 0; j < w && i + j < x.length; j++) x[i + j] += a * (j === 0 ? 1 : -0.6);
    }
  }
  return x;
}

// ------------------------------------------------------------------ plucked string

export interface PluckOpts {
  /** decay of the fundamental at 220 Hz (s); higher notes decay faster */
  t60: number;
  /** loop smoothing 0..0.5: more = darker, the highs die sooner */
  damp: number;
  /** pluck position as a fraction of the string (0.05 near the bridge = twangy, 0.5 = hollow) */
  pick: number;
  /** excitation brightness 0..1 (finger vs pick) */
  hard: number;
  /** share of noise in the excitation (vs a smooth plucked shape) */
  noise?: number;
  /** a second string this many cents away (double courses) */
  course?: number;
  body?: { f: number; q: number; db: number }[];
  lp?: number;
}

/** Karplus–Strong string with a tuned fractional delay (allpass), so notes are in tune at any pitch. */
function ksString(out: Float32Array, sr: number, f: number, o: PluckOpts, rng: Rng, gain: number): void {
  const P = sr / f;
  const S = Math.max(0.02, Math.min(0.5, o.damp));
  let L = Math.floor(P - S - 0.1);
  if (L < 4) L = 4;
  const d = P - S - L;
  const C = (1 - d) / (1 + d);
  const w = (TAU * f) / sr;
  const mag = Math.sqrt(Math.pow(1 - S + S * Math.cos(w), 2) + Math.pow(S * Math.sin(w), 2));
  const t60 = o.t60 * Math.pow(220 / f, 0.4);
  const rho = Math.min(0.99997, Math.pow(10, -3 / (t60 * f)) / mag);
  const ex = new Float32Array(L);
  const pk = Math.max(1, Math.min(L - 1, Math.round(o.pick * L)));
  const nz = o.noise ?? 0.3;
  const noise = new Float32Array(L);
  for (let i = 0; i < L; i++) noise[i] = rng.bi();
  for (let i = 0; i < L; i++) {
    const tri = i < pk ? i / pk : (L - i) / (L - pk);
    const n = noise[i] - noise[(i - pk + L) % L];
    ex[i] = tri * (1 - nz) + n * 0.5 * nz;
  }
  const fc = 500 + o.hard * o.hard * 9000;
  const a = Math.exp((-TAU * fc) / sr);
  let z = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < L; i++) {
    z = ex[i] * (1 - a) + z * a;
    ex[i] = z;
  }
  let mean = 0;
  for (let i = 0; i < L; i++) mean += ex[i];
  mean /= L;
  let pmax = 0;
  for (let i = 0; i < L; i++) {
    ex[i] -= mean;
    pmax = Math.max(pmax, Math.abs(ex[i]));
  }
  if (pmax > 0) for (let i = 0; i < L; i++) ex[i] /= pmax;
  const dl = ex;
  let idx = 0, prev = 0, apIn = 0, apOut = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = dl[idx];
    const v = (1 - S) * cur + S * prev;
    prev = cur;
    const ap = C * v + apIn - C * apOut;
    apIn = v;
    apOut = ap;
    dl[idx] = ap * rho;
    if (++idx >= L) idx = 0;
    out[i] += cur * gain;
  }
}

export function pluck(sr: number, freq: number, sec: number, o: PluckOpts, rng: Rng): Float32Array {
  const out = samples(sr, sec);
  const courses = o.course ? [-o.course / 2, o.course / 2] : [0];
  for (const c of courses) ksString(out, sr, freq * Math.pow(2, c / 1200), o, rng, 1 / courses.length);
  if (o.body) for (const b of o.body) biquad(out, 'peak', b.f, b.q, sr, b.db);
  if (o.lp) biquad(out, 'lp', o.lp, 0.7, sr);
  dcBlock(out);
  fadeIn(out, 0.0008, sr);
  fadeOut(out, Math.min(0.08, sec * 0.2), sr);
  return normalize(out, 1);
}

// ------------------------------------------------------------------ space

/**
 * A room (Freeverb-style: parallel damped combs into allpasses), stereo out.
 * Returns new L/R arrays `tail` seconds longer than the input; the dry signal is mixed in.
 */
export function room(dry: Float32Array, sr: number, o: { wet: number; size?: number; damp?: number; tail?: number; pre?: number; width?: number }): [Float32Array, Float32Array] {
  const tail = o.tail ?? 1.2;
  const n = dry.length + Math.ceil(tail * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  L.set(dry);
  R.set(dry);
  if (o.wet <= 0) return [L, R];
  const k = sr / 44100;
  const size = o.size ?? 0.5;
  const fb = 0.7 + size * 0.26;
  const damp = (o.damp ?? 0.5) * 0.45;
  const combs = [1116, 1188, 1277, 1356, 1422, 1557];
  const aps = [556, 441, 341];
  const pre = Math.round((o.pre ?? 0.012) * sr);
  const width = o.width ?? 0.8;
  const run = (spread: number): Float32Array => {
    const y = new Float32Array(n);
    for (const c of combs) {
      const len = Math.max(2, Math.round((c + spread) * k * (0.75 + size * 0.35)));
      const buf = new Float32Array(len);
      let idx = 0, store = 0;
      for (let i = 0; i < n; i++) {
        const xin = i - pre >= 0 && i - pre < dry.length ? dry[i - pre] * 0.09 : 0;
        const out = buf[idx];
        store = out * (1 - damp) + store * damp;
        buf[idx] = xin + store * fb;
        if (++idx >= len) idx = 0;
        y[i] += out;
      }
    }
    for (const a of aps) {
      const len = Math.max(2, Math.round((a + spread) * k));
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const out = -y[i] + b;
        buf[idx] = y[i] + b * 0.5;
        if (++idx >= len) idx = 0;
        y[i] = out;
      }
    }
    return y;
  };
  const wl = run(0);
  const wr = run(23);
  const w1 = o.wet * (1 + width) * 0.5;
  const w2 = o.wet * (1 - width) * 0.5;
  for (let i = 0; i < n; i++) {
    L[i] += wl[i] * w1 + wr[i] * w2;
    R[i] += wr[i] * w1 + wl[i] * w2;
  }
  return [L, R];
}

/**
 * Open-air reflections: the harbour answers from the quay walls and warehouses. Each tap is
 * [delay s, gain, pan -1..1]; echoes are darker than the source. Returns new, longer L/R arrays.
 */
export function echoes(L: Float32Array, R: Float32Array, sr: number, taps: [number, number, number][], lp = 1800): [Float32Array, Float32Array] {
  const extra = Math.ceil(Math.max(0, ...taps.map((t) => t[0])) * sr);
  const l = new Float32Array(L.length + extra);
  const r = new Float32Array(R.length + extra);
  l.set(L);
  r.set(R);
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  biquad(mono, 'lp', lp, 0.6, sr);
  biquad(mono, 'hp', 140, 0.6, sr);
  for (const [d, g, p] of taps) {
    const o = Math.round(d * sr);
    const gl = g * Math.cos(((p + 1) * Math.PI) / 4) * Math.SQRT2;
    const gr = g * Math.sin(((p + 1) * Math.PI) / 4) * Math.SQRT2;
    for (let i = 0; i < mono.length; i++) {
      l[o + i] += mono[i] * gl;
      r[o + i] += mono[i] * gr;
    }
  }
  return [l, r];
}
