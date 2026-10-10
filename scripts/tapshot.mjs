// Open a level, dismiss dialogs, tap quay boxes one by one, screenshot after each tap.
// usage: node scripts/tapshot.mjs <level> <outPrefix> [w,h] [taps]
import puppeteer from 'puppeteer-core';
const [lv, out, size = '390,844', taps = '2'] = process.argv.slice(2);
const [width, height] = size.split(',').map(Number);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5200/?level=${lv}&progress=${Number(lv) - 1}&debug&reset`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
for (let k = 0; k < 3; k++) {
  const b = await page.$('.overlay .actions .btn');
  if (!b) break;
  await b.click();
  await new Promise((r) => setTimeout(r, 600));
}
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${out}-0.png` });
for (let i = 0; i < Number(taps); i++) {
  const p = await page.evaluate(() => { const m = window.game.model; const q = m.quayAt(m.port); if (!q.length) return null; const s = window.game.view.boxScreen(q[0]); return s && { x: s.x, y: s.y }; });
  if (!p) break;
  await page.mouse.click(p.x, p.y);
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: `${out}-${i + 1}.png` });
}
console.log('done', errors.join(' | '));
await browser.close();
