/**
 * The harbour band: one slow, warm, shanty-flavoured theme per sea region. Original tunes, in 6/8
 * or 3/4, each looping a 32-bar form (A B A and a quiet "break" for thinking) after a two-bar
 * intro. Repeats change who plays the tune, add harmony or percussion and vary the melody a little,
 * so hours of play keep moving without ever getting busy.
 *
 * Palette: reed organ / harmonium pad, concertina, plucked upright bass, brushes, a wooden block or
 * a knuckle on the hull for the waves' rhythm, the ocean drum, now and then a ship's bell.
 * Index = sea region.
 */
import type { PluckInst, Player as Band, ReedKind } from './instruments';
import type { Bar, SongDef } from './song';
import { bassOf, type Chord, chordTone, inKey, type Note, scaleStep, voicing } from './theory';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];

type Lead = PluckInst | ReedKind;
const REED = new Set<string>(['organ', 'drone', 'flute', 'concertina', 'harmonium']);

// ------------------------------------------------------------------ playing helpers

/** One note of a tune: reeds hold it under the bellows, strings pluck it. */
function voice(band: Band, inst: Lead, m: number, t: number, dur: number, v: number): void {
  if (REED.has(inst)) band.reed(inst as ReedKind, [m], t, Math.max(0.12, dur * 0.94), v);
  else band.note(inst as PluckInst, m, t, Math.max(dur * 1.05, 0.25), v);
}

interface MelOpts {
  vel?: number;
  /** octaves up/down */
  oct?: number;
  /** play it this many scale steps away: -2 = a third below (a harmony line) */
  shift?: number;
  notes?: Note[];
}

/** The bar's tune on `inst`. */
function melody(band: Band, b: Bar, inst: Lead, o: MelOpts = {}): void {
  for (const n of o.notes ?? b.mel) {
    if (n.midi === null) continue;
    let m = n.midi + 12 * (o.oct ?? 0);
    if (o.shift) m = scaleStep(m, o.shift, b.key, b.scale);
    const accent = n.flags.includes("'") ? 1.12 : n.flags.includes(',') ? 0.72 : 1;
    const v = b.vel((o.vel ?? 0.8) * accent * (n.step === 0 ? 1.04 : 1), 0.07);
    voice(band, inst, m, b.at(n.step, 0.008), n.dur * b.step, v);
  }
}

/** The step from which the tune rests until the end of the bar (2+ steps), or null. */
function restFrom(b: Bar): number | null {
  if (!b.mel.length) return null;
  const last = b.mel[b.mel.length - 1];
  const end = last.step + last.dur;
  return end <= b.steps - 2 ? end : null;
}

/** A few improvised notes: chord tones on the beats, steps in between. Sparse by design. */
function improv(band: Band, b: Bar, inst: Lead, o: { density: number; center: number; vel: number; every?: number }): void {
  const every = o.every ?? 1;
  let last = (b.mem[`imp:${inst}`] as number | undefined) ?? o.center;
  const per = b.steps / b.beats;
  for (let s = 0; s < b.steps; s += every) {
    const strong = s % per === 0;
    if (b.r.next() > o.density * (strong ? 1.3 : 0.8)) continue;
    let m = strong ? chordTone(b.chordAt(s), last + Math.round(b.r.gauss() * 2.5)) : scaleStep(last, b.r.next() < 0.5 ? 1 : -1, b.key, b.scale);
    if (m > o.center + 8) m = scaleStep(m, -3, b.key, b.scale);
    if (m < o.center - 8) m = scaleStep(m, 3, b.key, b.scale);
    const len = every * (b.r.next() < 0.35 ? 2 : 1);
    voice(band, inst, m, b.at(s, 0.012), len * b.step, b.vel(o.vel, 0.12));
    last = m;
  }
  b.mem[`imp:${inst}`] = last;
}

/** A short answer where the tune rests: a few notes stepping down from a chord tone. */
function answer(band: Band, b: Bar, inst: Lead, from: number, vel: number): void {
  const rest = restFrom(b);
  if (rest === null) return;
  let m = chordTone(b.chordAt(rest), from);
  for (let s = rest; s < b.steps; s++) {
    voice(band, inst, m, b.at(s, 0.008), b.step * 1.6, b.vel(vel * (1 - (s - rest) * 0.08)));
    m = scaleStep(m, -1, b.key, b.scale);
  }
}

/** The reed organ holds the bar's chords, the bellows swelling a little through each. */
function pad(band: Band, b: Bar, kind: ReedKind, center: number, n: number, vel: number, swell = 0.25): void {
  for (const c of b.chords) {
    const key = `pad:${kind}`;
    const v = voicing(c.chord, center, n, b.mem[key] as number[] | undefined);
    b.mem[key] = v;
    band.reed(kind, v, b.at(c.step, 0.01), c.dur * b.step + 0.15, b.vel(vel, 0.05), { swell });
  }
}

/** Chord tones from `lo` upwards, `count` of them (for arpeggios). */
function tonesUp(c: Chord, lo: number, count: number): number[] {
  const out: number[] = [];
  for (let m = lo; out.length < count && m < lo + 48; m++) if (c.iv.some((iv) => (((c.root + iv - m) % 12) + 12) % 12 === 0)) out.push(m);
  return out;
}

const fifthOf = (root: number, top: number) => (root + 7 > top ? root - 5 : root + 7);
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length];

// ------------------------------------------------------------------ 0 · North Sea

const northSea: SongDef = {
  id: 'north-sea',
  name: 'North Sea · grey water',
  desc: 'D dorian, 6/8, slow. Reed organ chords, concertina tune, upright bass, a knuckle on the hull and brushes rocking, the ocean drum every two bars, a ship’s bell at the turn.',
  bpm: 50,
  beats: 2,
  steps: 6,
  key: 2,
  scale: DORIAN,
  trim: 0,
  sections: {
    intro: { chords: 'Dm | Dm' },
    A: {
      chords: 'Dm | Dm | C | C | Dm | G | F C | Dm',
      mel: 'A4:2 D5 D5:2 E5 | F5:2 E5 D5:3 | E5:2 C5 C5:2 D5 | E5:3 D5:2 C5 | A4:2 D5 F5:2 A5 | B5:3 A5:2 G5 | A5:2 F5 E5:2 C5 | D5:6~',
    },
    B: {
      chords: 'F | C | Dm | Am | F | C | Em G | Am',
      mel: 'C6:3 A5:2 F5 | G5:2 E5 C5:3 | D5:2 F5 A5:2 D6 | C6:2 B5 A5:3 | A5:2 C6 A5:2 F5 | G5:3 E5:2 C5 | E5:2 G5 B5:2 D6 | C6:3 A5:2 E5',
    },
    break: { chords: 'Dm | C | Dm | G | Dm | C | Am | Dm' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // the sea's rhythm: a knuckle on the hull on the downbeat, brushes rocking on the second beat
    if (s !== 'intro') {
      band.perc('knock', b.at(0), b.vel(s === 'break' ? 0.45 : 0.6));
      band.perc('brushTap', b.at(3), b.vel(0.45));
      if (b.r.next() < 0.5) band.perc('brushTap', b.at(5), b.vel(0.22));
      if (s === 'B' || b.pass % 2 === 1) band.perc('brush', b.at(3, 0.01), b.vel(0.4));
    }
    // a wave every two bars: its crest lands on the downbeat
    if (b.i % 2 === 1) band.perc('oceanDrum', b.at(4, 0.01), b.vel(0.75));
    if ((s === 'intro' && b.i === 0) || (s === 'B' && b.i === 0 && b.pass % 2 === 0)) band.note('bell', 74, b.at(0, 0), 3, 0.75);

    pad(band, b, 'organ', 57, 3, s === 'break' ? 0.55 : 0.7);

    // upright bass: the root, then the fifth (or the next chord) on the second beat
    const root = bassOf(b.chord, 38);
    band.note('bass', root, b.at(0, 0.004), b.step * 2.8, b.vel(0.8));
    if (b.chords.length > 1) band.note('bass', bassOf(b.chords[1].chord, 38), b.at(3, 0.004), b.step * 2.8, b.vel(0.7));
    else if (b.phraseEnd && s !== 'intro') {
      const to = bassOf(b.next, 38);
      band.note('bass', fifthOf(root, 49), b.at(3, 0.004), b.step * 1.8, b.vel(0.55));
      if (to !== root) band.note('bass', scaleStep(to, to > root ? -1 : 1, b.key, b.scale), b.at(5, 0.004), b.step * 0.9, b.vel(0.5));
    } else if (s !== 'intro') band.note('bass', fifthOf(root, 49), b.at(3, 0.004), b.step * 2.6, b.vel(0.55));

    if (s === 'intro') return;
    if (s === 'break') {
      if (b.i % 2 === 1 || b.pass % 2 === 1) improv(band, b, 'concertina', { density: 0.22, center: 72, vel: 0.55 });
      return;
    }
    // the tune: concertina; the second time a reed-organ third below; the third time the organ sings it
    const turn = s === 'A' ? b.pass % 3 : b.pass % 2;
    if (s === 'A' && turn === 2) {
      melody(band, b, 'organ', { vel: 0.9, oct: -1 });
      answer(band, b, 'concertina', 79, 0.45);
    } else {
      melody(band, b, 'concertina', { vel: 0.85 });
      if (turn === 1) melody(band, b, 'organ', { vel: 0.4, shift: -2 });
    }
  },
};

// ------------------------------------------------------------------ 1 · Mediterranean

const mediterranean: SongDef = {
  id: 'mediterranean',
  name: 'Mediterranean · warm stone',
  desc: 'G major, 3/4. Fingerpicked nylon guitar, upright bass, concertina and guitar trading the tune, a soft reed organ underneath on repeats, brushes; a bell at the bridge.',
  bpm: 84,
  beats: 3,
  steps: 6,
  key: 7,
  scale: MAJOR,
  trim: 0,
  mix: { organ: 0.8 },
  sections: {
    intro: { chords: 'G | D' },
    A: {
      chords: 'G | Em | C | D | G | Bm | C D | G',
      mel: 'B4:2 D5 G5:3 | F#5 G5 E5:4 | E5:2 C5 E5 G5:2 | F#5:4 D5:2 | B4:2 D5 G5:2 B5 | D6:3 B5:2 F#5 | E5:2 G5 F#5:2 A5 | G5:6~',
    },
    B: {
      chords: 'C | G | Am | D | C | G | A7 | D',
      mel: 'G5:2 E5 C5:3 | D5:2 G5 B5:3 | A5:2 C6 B5:2 A5 | F#5:4 A5:2 | G5:2 E5 C5:2 E5 | D5:3 B4:3 | C#5:2 E5 G5:2 A5 | F#5:3 E5 D5:2',
    },
    break: { chords: 'G | Em | C | D | G | Em | Am | D' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    const lead: Lead | null = s === 'A' ? pick(['concertina', 'guitar', 'concertina'] as const, b.pass) : s === 'B' ? pick(['concertina', 'guitar'] as const, b.pass) : null;
    const guitarLeads = lead === 'guitar';

    // fingerpicked guitar: the bass string, then up and down the chord in eighths
    for (const c of b.chords) {
      const v = voicing(c.chord, 62, 3, b.mem.arp as number[] | undefined);
      b.mem.arp = v;
      const low = bassOf(c.chord, 43);
      const pat = guitarLeads ? [low, -1, v[0], -1, v[1], -1] : [low, v[0], v[1], v[2], v[1], v[0]];
      for (let k = 0; k < c.dur; k++) {
        const m = pat[k];
        if (m < 0) continue;
        band.note('guitar', m, b.at(c.step + k, 0.006), b.step * 2.4, b.vel(k === 0 ? 0.5 : 0.32));
      }
    }
    // bass on one; a pickup into the next phrase
    const root = bassOf(b.chord, 31);
    band.note('bass', root, b.at(0, 0.004), b.beat * 1.9, b.vel(0.75));
    if (b.chords.length > 1) band.note('bass', bassOf(b.chords[1].chord, 31), b.at(3, 0.004), b.beat * 1.4, b.vel(0.65));
    else if (b.phraseEnd) band.note('bass', fifthOf(root, 43), b.at(4, 0.004), b.beat * 0.9, b.vel(0.55));
    // brushes on two and three, a swish now and then
    if (s !== 'intro') {
      band.perc('brushTap', b.at(2), b.vel(0.32));
      band.perc('brushTap', b.at(4), b.vel(0.26));
      if (b.i % 2 === 0) band.perc('brush', b.at(0, 0.01), b.vel(0.3));
    }
    if (s === 'B' && b.i === 0 && b.pass % 2 === 0) band.note('bell', 79, b.at(0, 0), 3, 0.7);
    // the reed organ warms the room on repeats and in the bridge
    if (s === 'B' || (s === 'A' && b.pass > 0) || s === 'break') pad(band, b, 'organ', 55, 3, s === 'break' ? 0.4 : 0.5, 0.2);

    if (s === 'intro') return;
    if (s === 'break') {
      improv(band, b, 'guitar', { density: 0.28, center: 76, vel: 0.5 });
      return;
    }
    if (!lead) return;
    melody(band, b, lead, { vel: guitarLeads ? 0.95 : 0.8 });
    if (s === 'A' && b.pass % 3 === 2) melody(band, b, 'guitar', { vel: 0.5, shift: -2 });
    if (!guitarLeads) answer(band, b, 'guitar', 76, 0.5);
  },
};

// ------------------------------------------------------------------ 2 · Suez & the Indian Ocean

const suez: SongDef = {
  id: 'suez',
  name: 'Suez · Indian Ocean',
  desc: 'E phrygian dominant (hijaz) over a drone, 6/8 (dadra). Harmonium and concertina share the tune over a reed drone and a tanpura cycle; tabla and bayan; a soft bell.',
  bpm: 48,
  beats: 2,
  steps: 6,
  key: 4,
  scale: HIJAZ,
  trim: 0,
  sections: {
    intro: { chords: 'E | E' },
    A: {
      chords: 'E | E | Dm | E | E | F | Dm | E',
      mel: 'B4:2 C5 B4:2 A4 | G#4:2 A4 B4:3 | D5:2 C5 B4:2 A4 | G#4:2 F4 E4:3 | E4:2 G#4 B4:2 D5 | C5:3 B4:2 A4 | A4:2 C5 B4:2 A4 | G#4:2 F4 E4:3',
    },
    B: {
      chords: 'Am | Am | E | E | Dm | Dm | F | E',
      mel: 'C5:2 E5 A5:3 | G#5:2 A5 B5:2 A5 | G#5:3 F5:2 E5 | E5:6~ | F5:2 E5 D5:2 F5 | E5:2 D5 C5:3 | A4:2 C5 F5:2 E5 | E5:3 B4:3',
    },
    break: { chords: 'E | E | Dm | E | E | F | E | E' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    // the drone breathes every two bars; the tanpura turns round its cycle (Pa, Sa, Sa, low Sa)
    if (b.i % 2 === 0) band.reed('drone', [40, 47], b.at(0, 0), b.len * Math.min(2, b.n - b.i) + 0.6, 0.85);
    [[47, 0], [52, 1.5], [52, 3], [40, 4.5]].forEach(([m, st]) => band.note('tanpura', m, b.at(st, 0.006), 2.6, b.vel(0.55, 0.1)));
    if (s === 'A' && b.i === 0 && b.pass === 0) band.note('bell', 76, b.at(0, 0), 3, 0.55);

    // dadra on tabla and bayan: dha dhin na | dha tin na
    if (s === 'A' || s === 'B' || (s === 'break' && b.i % 2 === 1)) {
      const light = (s === 'A' && b.pass === 0) || s === 'break';
      const strokes: [number, number, number][] = [[0, 0.55, 0.6], [1, 0.4, 0.3], [2, 0.35, 0], [3, 0.5, 0.45], [4, 0.25, 0], [5, 0.35, 0]];
      for (const [st, na, ge] of strokes) {
        if (light && (st === 1 || st === 4)) continue;
        if (na) band.note('tabla', 64, b.at(st, 0.006), 0.5, b.vel(na, 0.12));
        if (ge) band.perc('ge', b.at(st, 0.006), b.vel(ge, 0.12));
      }
    }
    // reed-organ colour where the harmony leaves the drone
    if (s === 'B' && b.chord.name !== 'E') pad(band, b, 'organ', 57, 3, 0.45, 0.3);
    if (s === 'intro') return;
    if (s === 'break') {
      if (b.i % 2 === 0 || b.pass % 2 === 1) improv(band, b, 'harmonium', { density: 0.25, center: 66, vel: 0.55 });
      return;
    }
    if (b.pass % 2 === 0) melody(band, b, 'harmonium', { vel: 0.8 });
    else {
      melody(band, b, 'concertina', { vel: 0.8, oct: 1 });
      melody(band, b, 'harmonium', { vel: 0.35 });
    }
  },
};

// ------------------------------------------------------------------ 3 · Pacific

const pacific: SongDef = {
  id: 'pacific',
  name: 'Pacific · open water',
  desc: 'C major pentatonic, 3/4, open chords. A flute stop and a harp trade the tune over flowing harp arpeggios and an airy reed pad; the ocean drum; a high bell.',
  bpm: 72,
  beats: 3,
  steps: 6,
  key: 0,
  scale: PENTA,
  trim: 0,
  sections: {
    intro: { chords: 'Cadd9 | Cadd9' },
    A: {
      chords: 'Cadd9 | Am7 | Fmaj7 | Gsus4 | Cadd9 | Am7 | Fmaj7 Gsus4 | Cadd9',
      mel: 'E5:2 G5:2 A5:2 | G5:4 E5:2 | A5:3 G5 E5:2 | D5:6~ | E5:2 G5:2 C6:2 | D6:3 C6 A5:2 | G5:2 E5 D5:3 | C5:6~',
    },
    B: {
      chords: 'Am7 | Em7 | Fmaj7 | Cadd9 | Am7 | Dm7 | Fmaj7 | Gsus4',
      mel: 'A5:2 C6:2 D6:2 | E6:6~ | D6:2 C6:2 A5:2 | G5:6~ | E5:2 G5:2 A5:2 | C6:4 A5:2 | G5:2 E5:2 D5:2 | D5:4 -:2',
    },
    break: { chords: 'Cadd9 | Am7 | Fmaj7 | Gsus4 | Cadd9 | Am7 | Fmaj7 | Gsus4' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    const harpLeads = s !== 'break' && s !== 'intro' && b.pass % 2 === 1;
    // flowing harp arpeggios (thinner when the harp has the tune)
    const pat = [0, 2, 4, 5, 3, 1];
    for (let st = 0; st < 6; st++) {
      if (harpLeads && st % 2 === 1) continue;
      const tones = tonesUp(b.chordAt(st), 55, 6);
      band.note('harp', tones[pat[st]], b.at(st, 0.007), b.step * 2.5, b.vel(st === 0 ? 0.42 : 0.3, 0.1));
    }
    pad(band, b, 'flute', 64, 3, s === 'intro' ? 0.45 : 0.55, 0.3);
    const root = bassOf(b.chord, 36);
    band.note('bass', root, b.at(0, 0.004), b.beat * 2.5, b.vel(0.62));
    if (b.chords.length > 1) band.note('bass', bassOf(b.chords[1].chord, 36), b.at(3, 0.004), b.beat * 1.4, b.vel(0.55));
    else if (b.phraseEnd) band.note('bass', fifthOf(root, 47), b.at(4, 0.004), b.beat * 0.9, b.vel(0.5));
    if (b.i % 2 === 1) band.perc('oceanDrum', b.at(3, 0.01), b.vel(0.7));
    if (b.i === 0 && b.pass === 0 && (s === 'A' || s === 'B')) band.note('bell', s === 'A' ? 84 : 79, b.at(0, 0), 3, 0.55);

    if (s === 'intro') return;
    if (s === 'break') {
      improv(band, b, 'harp', { density: 0.2, center: 76, vel: 0.5 });
      return;
    }
    if (harpLeads) melody(band, b, 'harp', { vel: 0.9 });
    else melody(band, b, 'flute', { vel: 0.85 });
  },
};

// ------------------------------------------------------------------ 4 · North Atlantic, winter

const atlantic: SongDef = {
  id: 'atlantic',
  name: 'North Atlantic · winter',
  desc: 'E aeolian, 6/8, very slow and sparse. A lone concertina (or harp) over a low reed drone, the organ joining in the second half, a bass note now and then, a distant bell.',
  bpm: 42,
  beats: 2,
  steps: 6,
  key: 4,
  scale: AEOLIAN,
  trim: 0,
  sections: {
    intro: { chords: 'Em | Em' },
    A: {
      chords: 'Em | C | Am | Em | Em | C | D | Em',
      mel: 'B4:3 E5:2 F#5 | G5:4 -:2 | A5:2 G5 E5:3 | B4:4 -:2 | E5:2 F#5 G5:2 B5 | C6:3 B5:2 G5 | A5:2 F#5 D5:3 | E5:4 -:2',
    },
    B: {
      chords: 'C | G | D | Em | C | Am | D | Bm',
      mel: 'E5:2 G5 C6:3 | B5:4 -:2 | A5:2 F#5 D5:3 | E5:6~ | G5:2 E5 C5:3 | A4:2 C5 E5:3 | F#5:3 E5:2 D5 | B4:4 -:2',
    },
    break: { chords: 'Em | C | Em | D | Em | C | Am | Em' },
  },
  form: ['intro', 'A', 'B', 'A', 'break'],
  loop: 1,
  arrange(b, band) {
    const s = b.sec;
    if (b.i % 4 === 0) band.reed('drone', [40, 47], b.at(0, 0), b.len * Math.min(4, b.n - b.i) + 0.8, 0.7);
    if (s === 'B' || s === 'break' || (s === 'A' && b.pass > 0)) pad(band, b, 'organ', 55, 2, 0.4, 0.35);
    if (b.i % 2 === 0) band.note('bass', bassOf(b.chord, 28), b.at(0, 0.004), b.len * 0.9, b.vel(0.55));
    if (b.i % 4 === 3) band.perc('oceanDrum', b.at(3, 0.01), b.vel(0.5));
    if (b.i === 0 && (s === 'A' || s === 'intro')) band.note('bell', 71, b.at(s === 'intro' ? 0 : 3, 0), 3, 0.5);

    if (s === 'intro') return;
    if (s === 'break') {
      improv(band, b, 'harp', { density: 0.15, center: 71, vel: 0.45, every: 2 });
      return;
    }
    const harpTurn = s === 'A' && b.pass % 2 === 1;
    if (harpTurn) melody(band, b, 'harp', { vel: 0.85 });
    else melody(band, b, 'concertina', { vel: 0.75, oct: s === 'B' && b.pass % 2 === 0 ? -1 : 0 });
    answer(band, b, harpTurn ? 'concertina' : 'harp', 79, 0.4);
  },
};

/** Every sea region's theme, indexed by region. */
export const SONGS: SongDef[] = [northSea, mediterranean, suez, pacific, atlantic];

/** A keyless check that the notes are in key (used by tests): every tune note snaps to itself. */
export function outOfKey(def: SongDef, notes: number[]): number[] {
  return notes.filter((m) => inKey(m, def.key, def.scale) !== m);
}
