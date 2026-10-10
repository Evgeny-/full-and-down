// Checks Full & Down's audio in headless Chrome:
//  1. loads review/audio.html, clicks some sounds, toggles the ambience, the engine and a music
//     theme, and fails on any console error or page exception;
//  2. renders every SFX (each pitch step) through the real engine in an OfflineAudioContext and
//     checks it is non-silent, not clipping (peak < 1) and of a sensible length;
//  3. renders each region's music, the harbour bed and the diesel, and reports loudness.
//
//   node review/audio-check.mjs                 everything (music: 30 s per theme)
//   node review/audio-check.mjs --seconds 90    longer music excerpts (loudness calibration)
//   node review/audio-check.mjs --wav <dir>     also write every render as WAV into <dir>
//   node review/audio-check.mjs --url http://localhost:5210   use a running dev server
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : (args[i + 1] ?? def);
};
const seconds = Number(opt('seconds', 30));
const wavDir = opt('wav', null) ? resolve(opt('wav', '')) : null;
if (wavDir) mkdirSync(wavDir, { recursive: true });

let server = null;
let base = opt('url', null);
if (!base) {
  const { createServer } = await import('vite');
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5211, strictPort: false, hmr: false } });
  await server.listen();
  base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? 'http://127.0.0.1:5211';
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
  protocolTimeout: 600000,
});
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL ${msg}`);
};
const db = (v, w = 6) => (Number.isFinite(v) ? v.toFixed(1) : '-inf').padStart(w);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message ?? e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(`${base}/review/audio.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.auditReady === true, { timeout: 60000 });

  // ---------------------------------------------------------------- 1. the page, live
  console.log(`\n1. live page at ${base}/review/audio.html`);
  const clickText = async (text) => {
    const ok = await page.evaluate((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t));
      if (!b) return false;
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      b.click();
      return true;
    }, text);
    if (!ok) fail(`no button "${text}"`);
    await new Promise((r) => setTimeout(r, 120));
  };
  // a real mouse click first, so the AudioContext is created inside a user gesture
  const first = await page.$('main button');
  await first.click();
  await new Promise((r) => setTimeout(r, 300));
  for (const t of ['pick', 'crane 2', 'drop 4', 'glug', 'cell 5', 'ratchet', 'horn 0', 'bell', 'gull', 'win', 'stamp 1', 'star 2', 'invalid', 'whistle']) await clickText(t);
  await clickText('Ambience: off');
  await clickText('Engine: off');
  await page.evaluate(() => {
    const s = document.querySelector('input[type=range][max="1"][step="0.05"][value="0.5"]:not(#music)');
    if (s) {
      s.value = '0.9';
      s.dispatchEvent(new Event('input'));
    }
  });
  await clickText('Play 0');
  await new Promise((r) => setTimeout(r, 3500));
  const st = await page.evaluate(() => window.audit.state());
  console.log(`  context running: ${st.ready}; music: ${st.info ? `${st.info.name} (${st.info.sec} bar ${st.info.bar + 1})` : 'none'}; SFX cache ${(st.cacheBytes / 1024).toFixed(0)} KB`);
  if (!st.ready) fail('AudioContext is not running after clicks');
  if (!st.info) fail('music did not start');
  await clickText('Play 3');
  await new Promise((r) => setTimeout(r, 1500));
  await clickText('Stop 3');
  await clickText('Engine: on');
  await clickText('Ambience: on');
  await clickText('Cast off');
  await new Promise((r) => setTimeout(r, 1000));
  const st2 = await page.evaluate(() => window.audit.state());
  console.log(`  after more clicks: SFX cache ${(st2.cacheBytes / 1024).toFixed(0)} KB`);

  // ---------------------------------------------------------------- 2. every SFX, offline
  console.log('\n2. SFX rendered offline through the engine (default volumes)');
  console.log('sound        baked s  baked pk  bake ms   out pk dB  L50 dB  mom LUFS  clipped  verdict');
  const catalog = await page.evaluate(() => window.audit.catalog);
  for (let i = 0; i < catalog.length; i++) {
    const r = await page.evaluate((k, w) => window.audit.sfx(k, w), i, !!wavDir);
    const m = r.metrics;
    const problems = [];
    if (!(m.peak > 0.01)) problems.push('silent');
    if (r.raw.peak >= 1 || m.peak >= 1 || m.clipped) problems.push('clips');
    if (r.raw.seconds < 0.08 || r.raw.seconds > 6) problems.push(`length ${r.raw.seconds.toFixed(2)} s`);
    if (m.dc > 0.01) problems.push('DC');
    const verdict = problems.length ? problems.join(', ') : 'ok';
    console.log(`${r.label.padEnd(12)} ${r.raw.seconds.toFixed(2).padStart(7)}  ${r.raw.peak.toFixed(3).padStart(8)}  ${r.bakeMs.toFixed(1).padStart(7)}  ${db(m.peakDb, 10)}  ${db(m.l50Db)}  ${db(m.momentaryMax, 8)}  ${String(m.clipped).padStart(7)}  ${verdict}`);
    if (problems.length) fail(`${r.label}: ${verdict}`);
    if (wavDir && r.wav) writeFileSync(join(wavDir, `${r.label}.wav`), Buffer.from(r.wav, 'base64'));
  }

  // ---------------------------------------------------------------- 3. music and loops
  console.log(`\n3. music (${seconds} s each, music volume 50 %) and loops`);
  console.log('what                              LUFS  mom max  peak dB  clipped  render ms');
  const songs = await page.evaluate(() => window.audit.songs);
  for (let i = 0; i < songs.length; i++) {
    const r = await page.evaluate((k, s, w) => window.audit.music(k, s, w), i, seconds, !!wavDir);
    const m = r.metrics;
    console.log(`${songs[i].name.padEnd(30)} ${db(m.lufs, 7)}  ${db(m.momentaryMax, 7)}  ${db(m.peakDb, 7)}  ${String(m.clipped).padStart(7)}  ${r.renderMs.toFixed(0).padStart(9)}`);
    if (m.peak >= 1 || m.clipped) fail(`${songs[i].id} clips`);
    if (m.lufs < -50) fail(`${songs[i].id} is (nearly) silent`);
    if (wavDir && r.wav) writeFileSync(join(wavDir, `music-${i}-${songs[i].id}.wav`), Buffer.from(r.wav, 'base64'));
  }
  for (const [label, fn] of [
    ['ambience (30 s)', () => page.evaluate(() => window.audit.ambience(30))],
    ['engine, load 0 (8 s)', () => page.evaluate(() => window.audit.engine(8, 0))],
    ['engine, load 0.5 (8 s)', () => page.evaluate(() => window.audit.engine(8, 0.5))],
    ['engine, load 1 (8 s)', () => page.evaluate(() => window.audit.engine(8, 1))],
  ]) {
    const { metrics: m } = await fn();
    console.log(`${label.padEnd(30)} ${db(m.lufs, 7)}  ${db(m.momentaryMax, 7)}  ${db(m.peakDb, 7)}  ${String(m.clipped).padStart(7)}`);
    if (m.peak >= 1 || m.clipped) fail(`${label} clips`);
    if (m.lufs < -60) fail(`${label} is silent`);
  }

  await new Promise((r) => setTimeout(r, 300));
  console.log(`\nconsole errors / exceptions: ${errors.length}`);
  for (const e of errors) fail(e);
} finally {
  await browser.close();
  await server?.close();
}
console.log(failures.length ? `\n${failures.length} problem(s)` : '\nall good');
process.exit(failures.length ? 1 : 0);
