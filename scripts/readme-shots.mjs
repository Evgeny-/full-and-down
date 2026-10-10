// The README screenshots (docs/screens/*.jpg, 540 wide) and the social card (public/og.jpg).
// usage: node scripts/readme-shots.mjs   (with the dev server on :5200)
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5200/';
const tmp = '.shots/readme';
mkdirSync(tmp, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });

async function open(url, w = 390, h = 844, dpr = 2) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(base + url, { waitUntil: 'load' });
  await sleep(2800);
  return page;
}

/** Tap the quay boxes with these ids (one-tap load), then optionally buy fuel. */
async function tapBoxes(page, n) {
  for (let i = 0; i < n; i++) {
    const p = await page.evaluate(() => { const m = window.game.model; const q = m.quayAt(m.port); const s = q.length && window.game.view.boxScreen(q[0]); return s ? { x: s.x, y: s.y } : null; });
    if (!p) break;
    await page.mouse.click(p.x, p.y);
    await sleep(1300);
  }
}

// a container call in Rotterdam, two boxes loaded, fuel still to buy
let page = await open('?debug&nointro&progress=72&level=66');
await tapBoxes(page, 2);
await sleep(800);
await page.screenshot({ path: `${tmp}/plan.png` });
await page.close();

// a bulk carrier at Antwerp
page = await open('?debug&nointro&progress=72&level=12');
await tapBoxes(page, 1);
await page.click('.fuel .buy');
await sleep(1600);
await page.screenshot({ path: `${tmp}/sail.png` });
await page.close();

// the chart
page = await open('?progress=30&map');
await sleep(600);
await page.screenshot({ path: `${tmp}/chart.png` });
await page.close();

// the social card
page = await open('?og&level=66&progress=72', 1200, 630, 1);
await sleep(1500);
await page.screenshot({ path: `${tmp}/og.png` });
await page.close();
await browser.close();

const jpg = (src, dst, w) => execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${src}').convert('RGB'); im=im.resize((${w}, round(im.height*${w}/im.width)), Image.LANCZOS); im.save('${dst}', quality=84, optimize=True)`]);
for (const n of ['plan', 'sail', 'chart']) jpg(`${tmp}/${n}.png`, `docs/screens/${n}.jpg`, 540);
jpg(`${tmp}/og.png`, 'public/og.jpg', 1200);
console.log('done');
