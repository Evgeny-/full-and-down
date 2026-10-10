import { describe, expect, it } from 'vitest';
import { audio } from './audio';
import { bakeDiesel, bakeLap, bakeSwell } from './beds';
import { loudest, peakOf } from './dsp';
import { bakeReed, Recorder, REEDS, type ReedKind } from './instruments';
import { outOfKey, SONGS } from './music';
import { bakeRate, bakeSfx, type BedSound, sfxCatalog } from './sfx';
import { compile, loopBars, Song } from './song';

describe('without Web Audio', () => {
  it('every method is a safe no-op', () => {
    expect(() => {
      audio.unlock();
      audio.play('horn', { pitch: 2, volume: 0.5, pan: -0.3 });
      audio.ambience(true);
      audio.engine(true, 0.7);
      audio.engine(true, Number.NaN);
      audio.startMusic(3);
      audio.startMusic();
      audio.duck(0.3, 1);
      audio.setSfxVolume(0.4);
      audio.setMusicVolume(2);
      audio.stopMusic();
      audio.engine(false);
      audio.ambience(false);
      audio.play('nope' as never);
    }).not.toThrow();
    expect(audio.ready).toBe(false);
  });
});

describe('sound effects', () => {
  for (const { name, opts, label } of sfxCatalog()) {
    it(`${label} bakes clean, at level, not too long`, () => {
      const b = bakeSfx(name, { ...opts, key: 4 }, bakeRate(name), 99);
      const sec = b.L.length / b.sr;
      expect(sec).toBeGreaterThan(0.08);
      expect(sec).toBeLessThan(name === 'horn' || name === 'win' || name === 'bell' || name === 'sputter' ? 7 : 4);
      const peak = Math.max(peakOf(b.L), peakOf(b.R));
      expect(peak).toBeLessThan(0.9);
      expect(peak).toBeGreaterThan(0.01);
      expect(Number.isFinite(loudest(b.L, b.sr))).toBe(true);
    });
  }
  for (const name of ['slap', 'creak', 'gullFar', 'buoy'] as BedSound[]) {
    it(`ambience one-shot ${name} bakes`, () => {
      const b = bakeSfx(name, {}, bakeRate(name), 3);
      expect(peakOf(b.L)).toBeGreaterThan(0.001);
      expect(peakOf(b.L)).toBeLessThan(0.9);
    });
  }
});

describe('loops', () => {
  for (const kind of Object.keys(REEDS) as ReedKind[]) {
    it(`${kind} reed notes loop without a seam`, () => {
      for (const midi of [43, 57, 64, 76]) {
        const n = bakeReed(kind, midi, { next: () => 0.5, bi: () => 0 } as never);
        const A = Math.round(n.loopStart * n.sr);
        const N = Math.round((n.loopEnd - n.loopStart) * n.sr);
        expect(A + N).toBe(n.data.length);
        // the sustain is periodic: the samples just before the loop equal those a period later
        let worst = 0;
        for (let i = A - 200; i < A; i++) worst = Math.max(worst, Math.abs(n.data[i + N] - n.data[i]));
        expect(worst).toBeLessThan(2e-3);
        expect(peakOf(n.data)).toBeLessThanOrEqual(0.99);
      }
    });
  }
  it('harbour bed and diesel loops are seamless and sane', () => {
    for (const l of [bakeSwell(1), bakeLap(2)]) {
      for (const ch of [l.L, l.R]) {
        expect(Math.abs(ch[ch.length - 1] - ch[0])).toBeLessThan(0.05);
        expect(peakOf(ch)).toBeLessThan(1);
      }
    }
    const d = bakeDiesel(3);
    expect(Math.abs(d.clean[d.clean.length - 1] - d.clean[0])).toBeLessThan(0.05);
    expect(peakOf(d.grit)).toBeGreaterThan(0.1);
  });
});

describe('music', () => {
  for (const def of SONGS) {
    it(`${def.id}: every section parses, the loop is 16–32 bars, it plays for 200 bars`, () => {
      const secs = compile(def);
      for (const f of def.form) expect(secs[f]).toBeTruthy();
      const bars = loopBars(def);
      expect(bars).toBeGreaterThanOrEqual(16);
      expect(bars).toBeLessThanOrEqual(32);
      const rec = new Recorder();
      const s = new Song(def, rec, 0, 3);
      s.pump(s.barLen * 200);
      expect(rec.keys.size).toBeGreaterThan(8);
    });
  }
  it('tunes stay in their mode (one deliberate C# in the Mediterranean bridge)', () => {
    for (const def of SONGS) {
      const notes: number[] = [];
      for (const sec of Object.values(compile(def))) for (const bar of sec.mel ?? []) for (const n of bar) if (n.midi !== null) notes.push(n.midi);
      expect(outOfKey(def, notes).length).toBe(def.id === 'mediterranean' ? 1 : 0);
    }
  });
});
