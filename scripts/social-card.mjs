// Capture the current game at 1200x630 and refresh its versioned share metadata.
// Run with the dev server at :5200, or set BASE to another game URL.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { updateSocialMetadata } from './social-metadata.mjs';

const base = process.env.BASE ?? 'http://localhost:5200/';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`${base}?og&level=2&progress=72&debug&nointro`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game?.view?.ship && !document.getElementById('boot'));
  await page.evaluate(() => document.fonts.ready);
  // Let the native crane/loading animation settle before photographing the deck.
  await page.waitForFunction(() => window.game.view.crane.busy === 0 && window.game.view.crane.target === null);
  await new Promise(resolve => setTimeout(resolve, 1200));
  if (errors.length) throw new Error(errors.join('\n'));
  await page.screenshot({
    path: fileURLToPath(new URL('../public/og.jpg', import.meta.url)),
    type: 'jpeg', quality: 90,
  });
} finally {
  await browser.close();
}
console.log(updateSocialMetadata());
