// Open every level, screenshot it, auto-solve it, check it can sail at ★★★, screenshot again.
// usage: node scripts/qa-levels.mjs [from] [to] [outdir] [w,h]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const [from = '1', to = '72', out = '.shots/qa', size = '390,844'] = process.argv.slice(2);
const [width, height] = size.split(',').map(Number);
mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? 'http://localhost:5200/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  let errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  for (let n = Number(from); n <= Number(to); n++) {
    errors = [];
    await page.goto(`${base}?debug&nointro&level=${n}`, { waitUntil: 'load' });
    await sleep(1400);
    await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}a.png` });
    await page.evaluate(() => window.game.autoSolve());
    await sleep(900);
    const st = await page.evaluate(() => window.game.debugState());
    const sail = await page.evaluate(() => !document.querySelector('.dock .sail').disabled);
    await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}b.png` });
    const ok = st && st.stars === 3 && sail && !st.problems.length && !errors.length;
    report.push({ n, ok, ...st, sail, errors: errors.slice(0, 2) });
    console.log(n, ok ? 'ok' : 'FAIL', JSON.stringify(st), sail ? '' : 'sail disabled', errors.slice(0, 2).join(' | '));
  }
} finally {
  await browser.close();
}
const bad = report.filter((r) => !r.ok);
console.log(`${report.length - bad.length}/${report.length} ok`);
