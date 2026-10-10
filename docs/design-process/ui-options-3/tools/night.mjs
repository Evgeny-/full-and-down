// Night-mode shot of level 12: sets the save's night setting, reloads, screenshots.
// usage: node docs/design-process/ui-options-3/tools/night.mjs <save key> <out.png>
import puppeteer from 'puppeteer-core';
const [key, out] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto('http://localhost:5200/?debug&nointro&level=12', { waitUntil: 'load' });
await p.evaluate((key) => { const s = JSON.parse(localStorage.getItem(key) || '{}'); s.settings = { ...(s.settings || { sfx: 0.9, music: 0.5 }), night: 'on' }; localStorage.setItem(key, JSON.stringify(s)); }, key);
await p.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4000));
await p.screenshot({ path: out });
await b.close();
