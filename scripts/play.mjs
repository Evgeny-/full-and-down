// Play a level's optimal plan with real taps in headless Chrome, screenshotting along the way.
// usage: node scripts/play.mjs <level> [outdir] [width,height]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const [lv = '2', out = '.shots/play', size = '390,844'] = process.argv.slice(2);
const [width, height] = size.split(',').map(Number);
mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? 'http://localhost:5200/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  await page.goto(`${base}?debug&nointro&level=${lv}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 2500));
  const pts = () => page.evaluate(() => window.game.debugPoints());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let d = await pts();
  const best = d.best;
  let shot = 0;
  const snap = async (name) => page.screenshot({ path: `${out}/${String(++shot).padStart(2, '0')}-${name}.png` });
  for (let i = 0; i < best.length; i++) {
    if (i > 0) {
      await page.click(`.strip .port[data-port="${i}"]`);
      await sleep(500);
    }
    for (const ld of best[i].loads) {
      d = await pts();
      const q = d.quay.find((x) => x.id === ld.box);
      if (!q?.p) throw new Error(`box ${ld.box} not on the quay at port ${i}`);
      await page.mouse.click(q.p.x, q.p.y);
      await sleep(300);
      if (i === 0 && ld === best[i].loads[0]) await snap('held');
      const b = d.bays[ld.bay];
      await page.mouse.click(b.x, b.y);
      await sleep(750);
    }
    // bunkers (manual levels): tap + until the plan matches
    for (let k = 0; k < 30; k++) {
      d = await pts();
      const cur = d.plan[i].bunker;
      const want = best[i].bunker;
      if (cur === want) break;
      const sel = cur < want ? '.bunker .plus' : '.bunker .minus';
      if (!(await page.$(sel))) break;
      await page.click(sel);
      await sleep(120);
    }
    await snap(`port${i}`);
  }
  const state = await page.evaluate(() => window.game.debugState());
  console.log('state', JSON.stringify(state));
  await page.click('.dock .sail');
  for (let k = 0; k < 6; k++) {
    await sleep(1400);
    await snap(`voyage${k}`);
  }
  await sleep(4500);
  await snap('report');
  await sleep(1500);
  await snap('report2');
  console.log('done', errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
} finally {
  await browser.close();
}
