/**
 * Full & Down audio: harbour foley played like an instrument, a harbour bed, the ship's diesel and
 * a small harbour band per sea region. Everything is synthesized in the browser; there are no files.
 *
 * - SFX (sfx.ts) are baked once into small stereo buffers (a few takes each, in idle time) and
 *   played with a little pitch/level wobble so repeats never sound canned.
 * - Ambience and engine (beds.ts) are baked seamless loops under a few live nodes.
 * - Music (music.ts) is scheduled bar by bar (song.ts) ahead of time with baked reeds, plucks and
 *   percussion (instruments.ts).
 *
 * Graph: SFX bus, ambience bus and music bus (ducked for big moments, one shared procedural
 * reverb) into a master gain and a gentle compressor. Every public method is safe before
 * `unlock()` and without Web Audio at all (it never throws); the engine can also be attached to an
 * OfflineAudioContext for renders and measurements (render.ts).
 */
import { BedBuffers, DieselRun, SeaBed } from './beds';
import { clamp, Rng } from './dsp';
import { Band, Resources } from './instruments';
import { SONGS } from './music';
import { bakeRate, bakeSfx, type BakeName, type BedSound, RATE, SFX_NAMES, sfxKey, type SfxName, type SfxParams, VARIANTS, WOBBLE } from './sfx';
import { Song } from './song';

export type { SfxName } from './sfx';

export interface PlayOpts {
  /** sound-specific step: drop/crane 0..4 (weight), cell/drain 0..11, stamp/star 0..2, horn 0..4 (ship size) */
  pitch?: number;
  /** 0..1 (up to 2 for a boost) */
  volume?: number;
  /** -1..1 */
  pan?: number;
}

export interface Audio {
  /** Create/resume the AudioContext; call on the first user gesture (and freely after). */
  unlock(): void;
  play(name: SfxName, opts?: PlayOpts): void;
  /** The harbour bed: waves, slaps on the quay, rope creaks, rare distant gulls. */
  ambience(on: boolean): void;
  /** The ship's diesel; `load` 0..1 raises RPM and grit (smoothly). */
  engine(on: boolean, load?: number): void;
  /** Background music for a sea region (0..4); without an argument, the last region. */
  startMusic(theme?: number): void;
  stopMusic(fadeSec?: number): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  /** Dip the music to `amount` (0..1 of its level) for `sec` seconds, then let it back up. */
  duck(amount: number, sec: number): void;
  readonly ready: boolean;
}

/** The game's default volumes. */
export const DEFAULT_SFX_VOLUME = 0.8;
export const DEFAULT_MUSIC_VOLUME = 0.5;

/** Bus gains at volume 1, calibrated against each other (see docs/audio.md). */
const MUSIC_GAIN = 1.0;
const AMBIENCE_GAIN = 0.7;
const ENGINE_GAIN = 0.32;
const MASTER_GAIN = 0.9;
/** Undoes the compressor's automatic makeup gain, so levels below its threshold pass unchanged (measured). */
const COMPRESSOR_TRIM = 0.71;
/** Seconds of music scheduled ahead of the clock (bars are scheduled whole). */
const LOOKAHEAD = 0.5;

/** Big moments dip the music on their own: [music level, seconds]. */
const AUTO_DUCK: Partial<Record<SfxName, [number, number]>> = { horn: [0.35, 1.7], win: [0.25, 2.4], fail: [0.45, 1.4], toot: [0.65, 0.5] };

/** Baked right after unlock in idle time, the most frequent sounds first. */
const PREWARM: [BakeName, SfxParams][] = [
  ['button', {}], ['pick', {}], ['drop', { pitch: 0 }], ['drop', { pitch: 1 }], ['drop', { pitch: 2 }], ['crane', { pitch: 0 }], ['crane', { pitch: 1 }],
  ['glug', {}], ['cell', { pitch: 0 }], ['cell', { pitch: 1 }], ['cell', { pitch: 2 }], ['cell', { pitch: 3 }], ['ratchet', {}], ['invalid', {}],
  ['undo', {}], ['drop', { pitch: 3 }], ['drop', { pitch: 4 }], ['crane', { pitch: 2 }], ['cell', { pitch: 4 }], ['cell', { pitch: 5 }],
  ['horn', {}], ['toot', {}], ['bell', {}], ['flag', {}], ['splash', {}], ['gull', {}], ['drain', { pitch: 0 }], ['drain', { pitch: 1 }],
  ['pipe', {}], ['coin', {}], ['stamp', { pitch: 0 }], ['stamp', { pitch: 1 }], ['stamp', { pitch: 2 }], ['star', { pitch: 0 }],
  ['star', { pitch: 1 }], ['star', { pitch: 2 }], ['whistle', {}], ['sputter', {}], ['fail', {}], ['unlock', {}], ['slap', {}], ['creak', {}], ['gullFar', {}],
];

const SFX_SET = new Set<string>(SFX_NAMES);
const mod = (n: number, m: number) => ((n % m) + m) % m;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type IdleDeadline = { timeRemaining(): number };
type IdleWindow = { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number };

export class AudioEngine implements Audio {
  ctx: BaseAudioContext | null = null;
  private live: AudioContext | null = null;
  private res: Resources | null = null;
  private beds: BedBuffers | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private sfxCache = new Map<string, AudioBuffer[]>();
  private pending = new Set<string>();
  private lastVariant = new Map<string, number>();
  private last = new Map<SfxName, number>();
  private sfxVol = DEFAULT_SFX_VOLUME;
  private musicVol = DEFAULT_MUSIC_VOLUME;
  private wantTheme: number | null = null;
  private lastTheme = 0;
  private song: Song | null = null;
  private songOut: GainNode | null = null;
  private songTheme = -1;
  private wantSea = false;
  private sea: SeaBed | null = null;
  private wantEngine = false;
  private engineLoad = 0.5;
  private diesel: DieselRun | null = null;
  private timer = 0;
  private suspendedByHide = false;
  private rnd = new Rng((Date.now() & 0xffff) + 1);
  private queue: (() => void)[] = [];
  private idle = false;

  get ready(): boolean {
    return !!this.live && this.live.state === 'running';
  }

  // ---------------------------------------------------------------- lifecycle

  unlock(): void {
    try {
      if (typeof window === 'undefined') return;
      if (!this.live) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.live = ctx;
        this.attach(ctx, ctx.destination);
        // older iOS only unlocks output once something has played inside the gesture
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
              if (ctx.state === 'running') {
                this.suspendedByHide = true;
                void ctx.suspend().catch(() => undefined);
              }
            } else if (this.suspendedByHide) {
              this.suspendedByHide = false;
              void ctx.resume().catch(() => undefined);
            }
          });
        }
        for (const [n, p] of PREWARM) this.enqueue(() => this.variant(n, p, 0));
        this.enqueue(() => this.beds?.swell);
        this.enqueue(() => this.beds?.lap);
        this.enqueue(() => this.beds?.diesel);
        // anything asked for before the first tap starts now
        if (this.wantSea) this.ambience(true);
        if (this.wantEngine) this.engine(true);
        if (this.wantTheme !== null) this.startMusic(this.wantTheme);
      }
      if (this.live.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) void this.live.resume().catch(() => undefined);
    } catch {
      /* no audio */
    }
  }

  /** Build the graph on a context (the live one, or an OfflineAudioContext for renders). */
  attach(ctx: BaseAudioContext, out: AudioNode = ctx.destination): void {
    this.ctx = ctx;
    this.res = new Resources(ctx);
    this.beds = new BedBuffers(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.3;
    const trim = ctx.createGain();
    trim.gain.value = COMPRESSOR_TRIM;
    comp.connect(trim);
    trim.connect(out);
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.sfxVol * AMBIENCE_GAIN;
    this.ambBus.connect(master);
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = ENGINE_GAIN;
    this.engineBus.connect(this.sfxBus);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * MUSIC_GAIN;
    this.musicBus.connect(this.duckGain);
    // the one shared room: the music's sends (SFX carry their own baked space)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(ctx);
    const ret = ctx.createGain();
    ret.gain.value = 0.55;
    this.reverb.connect(ret);
    ret.connect(this.musicBus);
  }

  /** A procedural room: a few early reflections and a 1.8 s tail that darkens as it fades. */
  private impulse(ctx: BaseAudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.8);
    const buf = ctx.createBuffer(2, len, sr);
    const r = new Rng(7);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const a = Math.min(0.95, 0.2 + t * 0.6);
        lp = lp * a + r.bi() * (1 - a);
        const env = Math.exp(-t * 3.6) * Math.min(1, t / 0.012) * (1 - i / len);
        d[i] = lp * env * (1 + a * 3);
      }
      for (const [ms, g] of [[11, 0.3], [17, 0.22], [26, 0.18], [37, 0.13], [52, 0.09]]) {
        const k = Math.round(((ms + ch * 2.3) * sr) / 1000);
        d[k] += g * (r.next() < 0.5 ? -1 : 1);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- volumes

  setSfxVolume(v: number): void {
    try {
      this.sfxVol = finite(v) ? clamp(v, 0, 1) : this.sfxVol;
      this.fade(this.sfxBus, this.sfxVol);
      this.fade(this.ambBus, this.sfxVol * AMBIENCE_GAIN);
    } catch {
      /* ignore */
    }
  }

  setMusicVolume(v: number): void {
    try {
      this.musicVol = finite(v) ? clamp(v, 0, 1) : this.musicVol;
      this.fade(this.musicBus, this.musicVol * MUSIC_GAIN);
    } catch {
      /* ignore */
    }
  }

  private fade(bus: GainNode | null, volume: number): void {
    if (!bus || !this.ctx) return;
    const now = this.ctx.currentTime;
    const g = bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    // a short finite ramp avoids zipper clicks and reaches exact silence at zero
    g.linearRampToValueAtTime(volume, now + 0.03);
  }

  duck(amount: number, sec: number): void {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.duckGain || !finite(amount) || !finite(sec)) return;
      const a = clamp(amount, 0, 1);
      const g = this.duckGain.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(a, t + 0.15);
      g.setValueAtTime(a, t + 0.15 + Math.max(0, sec));
      g.linearRampToValueAtTime(1, t + 0.15 + Math.max(0, sec) + 1.2);
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- music

  startMusic(theme?: number): void {
    try {
      const th = finite(theme) ? mod(Math.round(theme), SONGS.length) : this.lastTheme;
      this.wantTheme = th;
      this.lastTheme = th;
      if (!this.ctx || !this.musicBus) return;
      if (this.song && this.songTheme === th) return;
      this.startMusicAt(th, this.ctx.currentTime + 0.1);
    } catch {
      /* ignore */
    }
  }

  /** Start a region's theme at context time `t`. Live contexts are pumped by a timer; offline renders call `pumpMusic`. */
  startMusicAt(theme: number, t: number, seed?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.res) return;
    this.fadeOutSong(2);
    const def = SONGS[mod(theme, SONGS.length)];
    this.songTheme = theme;
    this.lastTheme = theme;
    const out = ctx.createGain();
    const level = Math.pow(10, def.trim / 20);
    out.gain.setValueAtTime(0, Math.min(t, ctx.currentTime));
    out.gain.linearRampToValueAtTime(level, t + 2.5);
    out.connect(this.musicBus);
    const s = seed ?? (this.rnd.next() * 1e9) | 0;
    this.song = new Song(def, new Band(this.res, out, this.reverb, { ...def.mix }, s), t, s);
    this.songOut = out;
    if (ctx === this.live) {
      this.pumpMusic();
      this.ensureTimer();
      // bake the notes this theme will need in idle time, so the music never hitches later
      for (const key of Song.preview(def)) this.enqueue(() => this.res?.warm(key));
    }
  }

  /** Schedule music up to `until` (default: a little ahead of now). */
  pumpMusic(until?: number): void {
    if (!this.song || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.song.pump(until ?? now + LOOKAHEAD, until === undefined ? now : -Infinity);
  }

  private fadeOutSong(fade: number): void {
    const song = this.song;
    const out = this.songOut;
    this.song = null;
    this.songOut = null;
    this.songTheme = -1;
    if (!song || !out || !this.ctx) return;
    const now = this.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
    if (this.ctx === this.live) {
      // notes already scheduled run a bar or two ahead; let them die out silently, then let go
      setTimeout(() => {
        song.band.dispose();
        out.disconnect();
      }, (fade + 8) * 1000);
    }
  }

  stopMusic(fadeSec = 1.5): void {
    try {
      this.wantTheme = null;
      this.fadeOutSong(finite(fadeSec) ? fadeSec : 1.5);
    } catch {
      /* ignore */
    }
  }

  /** What the band is playing (audition page). */
  musicInfo(): { theme: number; name: string; sec: string; bar: number; pass: number; cycle: number } | null {
    if (!this.song) return null;
    return { theme: this.songTheme, name: this.song.def.name, ...this.song.now };
  }

  // ---------------------------------------------------------------- ambience and engine

  ambience(on: boolean): void {
    try {
      this.wantSea = !!on;
      if (!this.ctx || !this.ambBus) return;
      const now = this.ctx.currentTime;
      if (on && !this.sea) {
        this.startAmbienceAt(now + 0.05);
        this.ensureTimer();
      } else if (!on && this.sea) {
        this.sea.stop(now);
        this.sea = null;
      }
    } catch {
      /* ignore */
    }
  }

  /** Start the harbour bed at `t` (offline renders then call `pumpAmbience`). */
  startAmbienceAt(t: number): void {
    if (!this.ctx || !this.ambBus || !this.beds) return;
    this.sea = new SeaBed(this.ctx, this.ambBus, this.beds, (n, at, v, p) => this.shot(n, at, v, p), new Rng(this.rnd.int(1e9) + 1), t);
    this.sea.pump(t + LOOKAHEAD);
  }

  pumpAmbience(until?: number): void {
    if (this.sea && this.ctx) this.sea.pump(until ?? this.ctx.currentTime + LOOKAHEAD);
  }

  engine(on: boolean, load?: number): void {
    try {
      if (finite(load)) this.engineLoad = clamp(load, 0, 1);
      this.wantEngine = !!on;
      if (!this.ctx || !this.engineBus || !this.beds) return;
      const now = this.ctx.currentTime;
      if (on) {
        if (this.diesel) this.diesel.setLoad(this.engineLoad, now);
        else this.diesel = new DieselRun(this.ctx, this.engineBus, this.beds, now + 0.03, this.engineLoad);
      } else if (this.diesel) {
        this.diesel.stop(now);
        this.diesel = null;
      }
    } catch {
      /* ignore */
    }
  }

  /** Start the diesel at `t` (offline renders). */
  startEngineAt(t: number, load: number): void {
    if (!this.ctx || !this.engineBus || !this.beds) return;
    this.diesel = new DieselRun(this.ctx, this.engineBus, this.beds, t, load);
  }

  /** One timer drives the music and the ambience one-shots while either runs. */
  private ensureTimer(): void {
    if (this.timer || typeof window === 'undefined' || this.ctx !== this.live) return;
    this.timer = window.setInterval(() => {
      try {
        this.pumpMusic();
        this.pumpAmbience();
        if (!this.song && !this.sea) {
          clearInterval(this.timer);
          this.timer = 0;
        }
      } catch {
        /* keep going */
      }
    }, 100);
  }

  // ---------------------------------------------------------------- sfx

  play(name: SfxName, opts: PlayOpts = {}): void {
    try {
      const ctx = this.live;
      if (!ctx || ctx.state !== 'running' || this.sfxVol <= 0.001 || !SFX_SET.has(name)) return;
      const now = ctx.currentTime;
      const gap = RATE[name];
      if (gap && now - (this.last.get(name) ?? -1) < gap) return;
      this.last.set(name, now);
      this.playAt(name, now + 0.005, opts ?? {});
      const d = AUTO_DUCK[name];
      if (d) this.duck(d[0], d[1]);
    } catch {
      /* never break the game because of audio */
    }
  }

  /** Play a sound at context time `t` (also used by offline renders). */
  playAt(name: SfxName, t: number, opts: PlayOpts = {}): void {
    const p: SfxParams = { pitch: finite(opts.pitch) ? opts.pitch : undefined, key: name === 'win' ? SONGS[mod(this.lastTheme, SONGS.length)].key : undefined };
    this.out(name, p, t, finite(opts.volume) ? clamp(opts.volume, 0, 2) : 1, finite(opts.pan) ? clamp(opts.pan, -1, 1) : 0, this.sfxBus);
  }

  /** An ambience one-shot. */
  private shot(name: BedSound, t: number, volume: number, pan: number): void {
    try {
      this.out(name, {}, t, volume, pan, this.ambBus);
    } catch {
      /* skip */
    }
  }

  private out(name: BakeName, p: SfxParams, t: number, volume: number, pan: number, bus: GainNode | null): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(name, p);
    const w = WOBBLE[name] ?? 0.02;
    src.playbackRate.value = 1 + (this.rnd.next() - 0.5) * 2 * w;
    const g = ctx.createGain();
    g.gain.value = volume * (1 + (this.rnd.next() - 0.5) * 0.12);
    src.connect(g);
    let node: AudioNode = g;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      g.connect(sp);
      node = sp;
    }
    node.connect(bus);
    src.start(t);
  }

  /** A baked take of the sound: a random one of its variants, never the same twice in a row. */
  private buffer(name: BakeName, p: SfxParams): AudioBuffer {
    const key = sfxKey(name, p);
    const list = this.sfxCache.get(key);
    if (!list || !list.length) return this.variant(name, p, 0);
    const want = VARIANTS[name] ?? 3;
    if (list.length < want && this.ctx === this.live) {
      const v = list.length;
      const job = `${key}#${v}`;
      if (!this.pending.has(job)) {
        this.pending.add(job);
        this.enqueue(() => {
          this.pending.delete(job);
          this.variant(name, p, v);
        });
      }
    }
    let i = this.rnd.int(list.length);
    if (list.length > 1 && i === this.lastVariant.get(key)) i = (i + 1) % list.length;
    this.lastVariant.set(key, i);
    return list[i];
  }

  /** Bake variant `v` of a sound if it is not there yet. */
  private variant(name: BakeName, p: SfxParams, v: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = sfxKey(name, p);
    let list = this.sfxCache.get(key);
    if (!list) this.sfxCache.set(key, (list = []));
    if (list[v]) return list[v];
    const b = bakeSfx(name, p, bakeRate(name), hash(key) + v * 7919);
    const buf = ctx.createBuffer(2, b.L.length, b.sr);
    buf.getChannelData(0).set(b.L);
    buf.getChannelData(1).set(b.R);
    list[v] = buf;
    return buf;
  }

  /** Bytes held in baked SFX buffers (audition page). */
  cacheBytes(): number {
    let n = 0;
    for (const list of this.sfxCache.values()) for (const b of list) if (b) n += b.length * b.numberOfChannels * 4;
    return n;
  }

  // ---------------------------------------------------------------- idle-time work

  private enqueue(job: () => void): void {
    this.queue.push(job);
    this.kick();
  }

  private kick(): void {
    if (this.idle || !this.queue.length || typeof window === 'undefined') return;
    this.idle = true;
    const ric = (window as unknown as IdleWindow).requestIdleCallback;
    const run = (d?: IdleDeadline) => {
      this.idle = false;
      const t0 = performance.now();
      do {
        try {
          this.queue.shift()?.();
        } catch {
          /* skip */
        }
      } while (this.queue.length && (d ? d.timeRemaining() > 6 : performance.now() - t0 < 6));
      this.kick();
    };
    if (ric) ric(run, { timeout: 2000 });
    else setTimeout(() => run(), 40);
  }
}

/** The engine instance (with the extras the audition page and renders use). */
export const audioEngine = new AudioEngine();
/** The game's audio. */
export const audio: Audio = audioEngine;
