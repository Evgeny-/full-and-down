// Screenshots of a sailing leg after auto-solving the call. usage: node scripts/sailshot.mjs <level> <outPrefix> [w,h] [times ms comma]
import puppeteer from 'puppeteer-core';
const [lv, out, size = '390,844', times = '600,1300,1900,2600,3400'] = process.argv.slice(2);
const [width, height] = size.split(',').map(Number);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:5200/?level=${lv}&progress=72&debug`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { document.querySelectorAll('.overlay').forEach((o) => o.remove()); window.game.autoSolve(); });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${out}-0.png` });
await page.evaluate(() => { window.game.sail(); });
let t0 = 0;
for (const [i, t] of times.split(',').map(Number).entries()) {
  await new Promise((r) => setTimeout(r, t - t0));
  t0 = t;
  await page.screenshot({ path: `${out}-${i + 1}.png` });
}
console.log('done', errors.join(' | '));
await browser.close();
