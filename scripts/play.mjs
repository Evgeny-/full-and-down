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
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()), process.env.VERBOSE && m.text().startsWith('down') && console.log('  page:', m.text())));
  await page.goto(`${base}?debug&nointro&level=${lv}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 2500));
  const pts = () => page.evaluate(() => window.game.debugPoints());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let d = await pts();
  const best = d.best;
  let shot = 0;
  const snap = async (name) => page.screenshot({ path: `${out}/${String(++shot).padStart(2, '0')}-${name}.png` });
  for (let i = 0; i < best.length; i++) {
    for (const ld of best[i].loads) {
      d = await pts();
      const q = d.quay.find((x) => x.id === ld.box);
      if (!q?.p) throw new Error(`box ${ld.box} not on the quay at port ${i}`);
      const b = d.bays[ld.bay];
      // drag it onto the exact stack of the optimal plan
      await page.mouse.move(q.p.x, q.p.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) {
        await page.mouse.move(q.p.x + ((b.x - q.p.x) * k) / 8, q.p.y + ((b.y - q.p.y) * k) / 8);
        await sleep(25);
      }
      if (i === 0 && ld === best[i].loads[0]) await snap('drag');
      await page.mouse.up();
      await sleep(750);
    }
    for (let k = 0; k < 30; k++) {
      d = await pts();
      const cur = d.plan[i].bunker;
      const want = best[i].bunker;
      if (cur === want) break;
      const sel = cur < want ? '.fuel .plus' : '.fuel .minus';
      if (!(await page.$(sel))) break;
      await page.click(sel);
      await sleep(120);
    }
    await sleep(900);
    await snap(`port${i}`);
    if (process.env.VERBOSE) console.log('port', i, JSON.stringify((await pts()).plan[i]));
    await page.click('.dock .sail');
    if (i === best.length - 1) break;
    // wait for her to arrive at the next port
    for (let k = 0; k < 40; k++) {
      await sleep(400);
      const st = await page.evaluate(() => window.game.debugPoints());
      if (st.mode === 'plan' && st.port === i + 1) break;
      if (k === 4) await snap(`voyage${i}`);
    }
  }
  const state = await page.evaluate(() => window.game.debugState());
  console.log('state', JSON.stringify(state));
  for (let k = 0; k < 40; k++) {
    await sleep(500);
    if (await page.$('.report .stamp.slam')) break;
  }
  await sleep(1800);
  await snap('report');
  console.log('done', errors.length ? `errors: ${errors.join(' | ')}` : 'no errors');
} finally {
  await browser.close();
}
