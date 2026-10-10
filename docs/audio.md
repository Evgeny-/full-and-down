# Full & Down: audio

Everything you hear is synthesized in the browser with the Web Audio API. There are no audio files.

## The identity

**Harbour foley played like an instrument: steel, rope, water, air. Wet and low.** (See section 5 of
`docs/design-process/12-art-direction.md`.)

- Sound effects are physically modelled, not beeps. Steel and bronze are sets of inharmonic partials
  that beat slowly, as real struck metal does. Chains and pawls are jittered metal clinks. Water is
  splash noise plus Minnaert bubbles (small sines that rise in pitch). The halyard and mooring lines
  are stick–slip pulse trains through rope and wood resonances. The typhon is two detuned saws a
  fifth apart through a horn-shaped low-pass.
- Big sounds get the harbour answering back: lowpassed echoes off the quay walls and the sheds across
  the basin, as well as a small room.
- Tuned "progress" sounds climb a major pentatonic, so any run of them sounds sweet. These are the
  fuel cells (tink) and the cells burning down (blip).
- Music is a small harbour band: a reed organ (harmonium) pad, a concertina, a plucked upright bass,
  brushes, a knuckle on the hull or a wooden block for the waves' rhythm, an ocean drum (beads rolling
  in a frame drum) and now and then a ship's bell. The band is recoloured for each sea region.
- There is no accordion (Mise en Place owns it) and no marimba (Pixel Picnic owns it). The organ's
  two reeds beat slowly (0.5 Hz); it is not a musette tremolo.

## Files

| file | what it does |
| --- | --- |
| `src/audio/audio.ts` | the engine: graph and buses, `audio.play`, ambience, engine, music start/stop/crossfade, ducking, volumes, idle-time baking, SFX memory budget |
| `src/audio/sfx.ts` | every sound effect's recipe, over a "kit" of harbour primitives (each baked once per variant into a short buffer) |
| `src/audio/beds.ts` | the harbour bed and the diesel: seamless baked loops and their live players |
| `src/audio/instruments.ts` | the band: baked seamless-loop reeds, Karplus–Strong plucks, modal tabla and bell, percussion; `Band` and `Recorder` |
| `src/audio/music.ts` | the five sea-region themes (tunes and arrangements) |
| `src/audio/song.ts`, `theory.ts` | the bar-by-bar song runner, melody/chord notation and voicings (shared with Mise en Place) |
| `src/audio/dsp.ts` | sample-level synthesis: filters, noise, modes, band-limited saw/pulse, plucks, room, echoes, loopify |
| `src/audio/render.ts` | offline renders through the real graph, loudness metrics (BS.1770), WAV export |
| `src/audio/audio.test.ts` | vitest: every method safe without Web Audio, every SFX bakes cleanly, reed and bed loops are seamless, themes parse and play 200 bars |
| `review/audio.html`, `review/audio.ts` | the audition page |
| `review/audio-check.mjs` | headless Chrome check plus measurement table |

## API

```ts
import { audio } from './audio/audio';

audio.unlock();                        // on the first pointerdown/keydown (safe to call on every one)
audio.play('drop', { pitch: 3 });      // pitch: sound-specific step (below); volume 0..1 (≤2); pan -1..1
audio.ambience(true);                  // harbour bed on/off (2.5 s fade in, 2 s out)
audio.engine(true, 0.6);               // diesel on, load 0..1. Call as often as you like: tiny changes are ignored, the RPM glides
audio.engine(false);                   // winds down and fades (~1.5 s)
audio.startMusic(region);              // 0 North Sea, 1 Mediterranean, 2 Suez/Indian Ocean, 3 Pacific, 4 North Atlantic; no arg = last region
audio.stopMusic(1.5);
audio.setSfxVolume(0.8);               // 0..1; the ambience bed follows it
audio.setMusicVolume(0.5);             // 0..1
audio.duck(0.25, 2);                   // music down to 25 % of its level for 2 s, then back up over 1.2 s
audio.ready;                           // true once the AudioContext is running
```

- **Before `unlock()`** every call is safe. `play` is dropped. `ambience`, `engine` and
  `startMusic` are remembered and start on unlock. Volumes are remembered.
- **Without Web Audio** (tests, old browsers) every method is a no-op and nothing throws. Calls from
  untyped JS with unknown names or NaN arguments are ignored too.
- **Auto-duck:** `horn` (music to 35 % for 1.7 s), `win` (25 %, 2.4 s), `fail` (45 %, 1.4 s) and
  `toot` (65 %, 0.5 s) dip the music themselves. Call `duck` for any other big moment.
- **`pitch` steps:** `drop` and `crane` 0..4 (weight 1–5, heavier is lower; heavy loads drop the crane
  motor by a fifth). `cell` and `drain` 0..11 (a major pentatonic upward). `stamp` and `star` 0..2
  (rising). `horn` 0..4 (ship size, two semitones lower per step). Other sounds ignore it.
- `win` plays its brass flourish in the key of the region whose music was last started.
- The tab hiding suspends the AudioContext; showing it resumes it.

## Sound effects

Levels are what you get at the game's default volumes (SFX 80 %), measured offline through the real
chain: L50 is the loudest 50 ms RMS (what the ear notices on short sounds); peaks are sample peaks.

| name | the sound | how it's made | L50 dBFS |
| --- | --- | --- | --- |
| `button` | Aldis-lamp shutter: two crisp clicks | two metal clinks (2.5–3.3 kHz partials and a tick), a snap, a tiny lamp-body thump | −30 |
| `pick` | the hook takes the box | struck steel (5 inharmonic partials, 620 Hz), a thump, 0.3 s of chain links | −26 |
| `drop` 0–4 | twist-lock clunk | sine thump falling 95→48 Hz, the box's hollow boom (band-passed noise at 165 Hz), steel partials, then the twist-locks "clunk-chk" 30 ms later; each weight step is 12 % of an octave lower, longer and louder | −25…−23 |
| `crane` 0–4 | slew/hoist motor, 0.55 s | a saw and a pulse spinning up and down (52→110 Hz) through a band-pass that tracks speed (300→700 Hz), gearbox whine at 13×, a little chain, a brake click; up to a fifth lower | −30 |
| `glug` | one pump pulse | noise through a resonant low-pass sweeping 400→150 Hz in 120 ms, one or two rising bubbles, a pump thud | −27 |
| `cell` 0–11 | a fuel cell is full | a gauge tick and a soft steel "tink" (bar partials 1 : 2.76 : 5.4) from C5 up a major pentatonic | −28 |
| `drain` 0–11 | a cell burns | a soft sine blip falling a fourth (from E4 up the pentatonic), a puff of air | −30 |
| `ratchet` | handwheel notch | three pawl clinks 32–42 ms apart, each with a spoke tick | −31 |
| `horn` 0–4 | ship's typhon, 1.35 s | two saws at ≈110/165 Hz, each doubled 6 cents off, low-passed (900 Hz, 24 dB/oct) with a bell resonance; 120 ms attack with a pitch scoop, slight vibrato, sag at the end, breath on the attack, light saturation; big room and three harbour echoes (0.34/0.74/1.25 s) | −19 |
| `toot` | tug/pilot boat | the same voice two octaves up, 0.3 s | −24 |
| `bell` | ship's bell, ding-ding | bronze modes (hum, prime, minor-third tierce, quint, nominal …, slowly beating) struck twice 0.3 s apart, clapper tick | −21 |
| `pipe` | bosun's call | a sine with faint harmonics gliding 1.6→2.4 kHz, a 13 Hz trill, a fall to 1.3 kHz; breath | −26 |
| `gull` | "kee-ow" ×2–3 (4 variants) | a nasal tone (5 harmonics) rising into "kee" at ≈2.2 kHz and falling to ≈1.3 kHz, 18 Hz flutter, breath | −25 |
| `splash` | a mooring line hits the water | darkening splash noise, a body "plunk", a slap, 14 rising bubbles, drops falling back | −25 |
| `flag` | hoisting a flag | two hand-over-hand halyard squeaks (stick–slip through a sheave) and cloth fluttering up the mast | −28 |
| `stamp` 0–2 | customs stamp | thump, paper slap, a short desk ring (three semitones higher per star), rubber peeling off | −22 |
| `invalid` | two-tone reversing beeper | 1180/940 Hz pulse beeps ×2, low-passed, heard from the crane cab | −28 |
| `undo` | reversed whoosh | a whoosh with a hook clink, played backwards, then a soft settle | −29 |
| `sputter` | out of fuel | engine chugs falter and drop out, two backfire pops, silence, one drip | −22 |
| `whistle` | harbour master's pea whistle | "tweet – tweeeet" at ≈3 kHz, with the pea warbling pitch (±4.5 %) and level at ≈29 Hz | −29 |
| `coin` | freight paid | the register's lever (two clicks), the drawer, a small bright dome bell (2.35 kHz, beating), coins settling | −22 |
| `win` | arrival fanfare, ≈2 s | a short typhon blast, the bell ding-ding, a brass run (sol-do-mi-sol) up to a held tonic chord. The brass is saws through a low-pass that opens with the breath. Plays in the current music's key | −18 |
| `fail` | gentle "wah-wah" | two low reed notes (B♭2, A2) with a formant opening and closing, the second drooping | −24 |
| `unlock` | new mechanic or chapter | a reed-organ G chord swells under four bronze chimes climbing G5–B5–D6–G6, a sparkle | −20 |
| `star` 0–2 | one star | a bronze chime (C6, E6, G6) with its octave below and a wisp of sparkle | −20 |

Every sound has 1–4 baked takes (`VARIANTS`). Each play adds a small pitch wobble (0–4 %, tiny on
tuned sounds) and a ±6 % level wobble. Frequent sounds have a minimum gap between plays (`RATE`), and
at most 16 SFX voices play at once. Nothing clips: the loudest sample peak through the chain is
−8.3 dBFS (`win`), and baked buffers peak at most 0.69.

## Ambience and engine

- **Harbour bed** (`ambience(true)`): two seamless loops under slow LFOs that never line up. The
  first is a deep swell: brown noise below 500 Hz, 11.3 s, breathing at 0.071 and 0.031 Hz. The
  second is water lapping the quay with a fizz of foam: 14.7 s, different on each side, breathing at
  0.113 Hz. One-shots come on a random schedule:
  - a wave slapping the quay every 2.5–8 s
  - a mooring line creaking every 12–30 s
  - a distant gull every 24–60 s
  - a bell buoy out by the breakwater every 70–140 s

  The bed sits around −38 LUFS: always there, never in the way.
- **Diesel** (`engine(true, load)`): one loop of eight firing pulses of a 44 Hz thump with harmonics,
  plus exhaust chuffs and valve ticks (no two cylinders alike), and a "grit" loop in step with it
  (injector knock, rattle, hard exhaust). RPM is the loops' playbackRate, 0.8 + 0.45·load. So the
  thump runs 35→55 Hz and the pulses 5→8 per second, rising together as on a real engine. Load also
  brings in the grit and opens a low-pass (700→2900 Hz). Starting, she cranks over slowly and
  catches; stopping, the revs sag as she fades. Levels: −34.5 / −33 / −31.5 LUFS at load 0 / 0.5 / 1.

## Music

One slow, warm theme per sea region. All tunes are original. Each plays a two-bar intro, then loops
a 32-bar form (A B A break) forever with no restart gap. On repeats the tune moves between
instruments, harmony lines come and go, percussion thickens or thins, and the melody is varied a
little (passing notes, turns, dropped notes), so it never repeats exactly. The "break" is a quiet
stretch with only the bed and a few improvised notes. Timing (a few ms) and velocity are humanised.

| # | region | the band |
| --- | --- | --- |
| 0 | **North Sea** · *grey water* | D dorian, 6/8, ♩.=50 (one 32-bar loop ≈ 77 s). Reed-organ chords; concertina tune (B naturals for the dorian colour). The second time a reed-organ line a third below; the third time the organ sings it and the concertina answers. Upright bass on root and fifth with walk-ups; a knuckle on the hull on 1, brushes rocking on 2; the ocean drum every two bars, its crest on the downbeat; a ship's bell (D) at the turn. |
| 1 | **Mediterranean** · *warm stone* | G major, 3/4, 84 bpm. Fingerpicked nylon guitar arpeggios, bass on one. The tune passes between concertina and guitar, with the guitar answering in the rests and harmonising on repeats. A soft reed organ underneath on repeats and in the bridge, which goes through A7 to D. Brushes on 2 and 3; a bell at the bridge. |
| 2 | **Suez · Indian Ocean** | E phrygian dominant (hijaz) over a reed drone (E–B), 6/8 played as dadra (dha dhin na \| dha tin na) on tabla and bayan. A tanpura cycle (Pa Sa Sa low-Sa). The tune is on the Indian harmonium (bright reed plus a bass reed an octave down), or on the concertina an octave up with the harmonium shadowing. Organ colour where the harmony leaves the drone; a soft bell. |
| 3 | **Pacific** · *open water* | C major pentatonic, 3/4, 72 bpm, open chords (add9, maj7, sus4). Flowing harp arpeggios and an airy flute-stop pad. The tune passes between the flute stop and the harp. Bass on one, the ocean drum every two bars, a high bell. |
| 4 | **North Atlantic** · *winter* | E aeolian, 6/8, ♩.=42, very sparse (one loop ≈ 91 s). A lone concertina, sometimes an octave down, or a harp, over a low reed drone; the organ joins in the second half. The harp answers in the long rests, a bass note comes every other bar, and a distant bell rings at each A. |

How it is made: the reeds are additive wavetable voices baked as **seamless loops** (a 0.2–0.4 s
attack, then 1–2 s in which every component repeats exactly: the reeds, the slow celeste beating,
the bellows tremor and the wind noise). A held chord of any length is one looping buffer per note
under one gain envelope, which "swells" with the bellows. The exact pitch is set with playbackRate.
Plucks are Karplus–Strong; the tabla and the bell are modal. Everything is baked once per pitch, in
idle time, from a silent dry run of the theme. Bars are scheduled 0.5 s ahead by a 100 ms timer; if
the main thread stalls, the timeline slips instead of cramming late notes. Switching regions
crossfades over 2–2.5 s.

## Buses and levels

```
SFX ─────────── sfxBus (SFX volume) ───────────────┐
diesel ─ engineBus (×0.185) ─┘                     │
ambience ────── ambBus (SFX volume × 0.7) ─────────┼─ master (×0.9) ─ compressor ─ trim (×0.665) ─ out
music ─ theme fader (trim) ─ musicBus (music volume × 1.41) ─ duck ─┘
   └─ sends ─ one convolver (procedural 1.8 s IR) ─ return ×0.55 ─┘ (into musicBus)
```

- The compressor is gentle: threshold −16 dB, knee 12, ratio 2.5, attack 8 ms, release 300 ms.
  Chrome's (and WebKit/Gecko's) compressor adds an automatic makeup gain of +3.55 dB with these
  settings. The 0.665 trim undoes it, so everything below the knee passes at unity, and only
  stacked peaks get squeezed (about 2 dB at −10 dB RMS, 4 dB at −6).
- At the default volumes (SFX 80 %, music 50 %), measured by `review/audio-check.mjs`:

| layer | loudness |
| --- | --- |
| music, 150 s (integrated LUFS) | North Sea −31.0, Mediterranean −31.0, Suez −31.0, Pacific −31.2, North Atlantic −32.1 (sparse, on purpose); peaks −14…−17 dBFS (−8…−11 at music 100 %) |
| ambience bed | −38.4 LUFS |
| diesel | −34.5 … −31.5 LUFS (load 0 … 1) |
| gameplay SFX (L50) | −23 … −31 dBFS |
| moments and rewards (L50) | −18 … −22 dBFS (`horn`, `win` the loudest) |

- Inside each band (`--stems`: ungated loudness of each instrument soloed, relative to the whole
  mix, 150 s). The instrument carrying the tune sits 2–5 dB under the mix: concertina, harmonium, or
  guitar or harp where they share the tune with their own arpeggios. Bass and pad sit 3–8 dB under
  the lead; drone and tanpura about 4 dB under it. Hull knock, tabla, bayan and the ocean drum are
  10–15 dB under; brushes and the bell are 15–22 dB under (they are sparse).
- Per-theme `trim` (dB) and `mix` (per-instrument gain) live in `music.ts`. `MUSIC_GAIN`,
  `AMBIENCE_GAIN`, `ENGINE_GAIN` and `COMPRESSOR_TRIM` are in `audio.ts`. The bed layer levels are in
  `beds.ts`.

## Performance and memory

- Each SFX play is one buffer source and one gain (plus a panner if panned). Bakes take 1–17 ms each.
  They run lazily on first use, and the common ones are prewarmed in idle time after unlock (6 ms
  slices).
- SFX are baked at 24 kHz, or 16 kHz for the dark ones (horn, drop, crane, glug, sputter, fail, win,
  bed one-shots). On engines that refuse 16 kHz buffers it falls back to 22.05 kHz. Short dry sounds
  are mono. One take of every sound and every pitch step is 8.3 MB; the cache is capped at 12 MB (LRU,
  rebaked on demand).
- Music: one source and one gain per note, about 10–20 voices at a time. Notes are cached LRU (64
  plucked, 44 reed). Starting a theme costs 1–20 ms on the main thread. A 150 s render of a theme
  takes 5–9 % of real time on an M-series Mac.
- Loops: the bed is 2 looping sources, 3 LFOs and a few gains; the diesel is 2 looping sources, 3
  gains and a low-pass. There is one convolver in total.

## Auditioning and checks

- **Listen:** `npx vite --port 5210` then open http://localhost:5210/review/audio.html. The page
  has every SFX and each pitch step, scenes (load a box, a no-go, bunker a tank, cast off, burn fuel,
  run out of fuel, arrive, overloaded), toggles for the ambience and the engine (with a load slider),
  play/stop for each theme with the current section, bar, pass and loop, a duck button, volume
  sliders, and "Measure" buttons that render offline and show the numbers.
- **Check:** `node review/audio-check.mjs` loads the page in headless Chrome, clicks sounds and toggles,
  and fails on console errors. It then renders every SFX offline and checks it is not silent, not
  clipping (peak < 1), of a sensible length and without DC, and prints a table. Last it measures each
  theme, the bed and the diesel. `--seconds 150` gives longer music excerpts; `--stems` measures each
  instrument's loudness inside each band; `--music-only` is for quick iteration; `--wav <dir>` writes
  every render as WAV.
- **Tests:** `npx vitest run src/audio`.

## Caveats

- The compressor's makeup gain (+3.55 dB) was measured in Chrome. WebKit and Gecko use the same
  (Blink-derived) kernel. A fresh compressor also starts fully compressed and settles in about 0.25 s,
  so the very first sound after unlock is a few dB quieter.
- iOS: Web Audio follows the ringer switch, as is usual for games. `navigator.audioSession` is not
  touched.
- The music is calibrated by measurement, not by ear. Give the five themes a listen on phone speakers
  as well as headphones; most of the diesel's thump is below what phone speakers reproduce, and the
  chuffs and grit carry it there.
