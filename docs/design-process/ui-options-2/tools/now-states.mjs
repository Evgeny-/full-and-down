// The real game (level 12, at Kiel) in the two states the mockups show:
//   mid   = the 3 t Copenhagen box aboard, 5 t of bunkers aboard (bought 4): 1 t short at Copenhagen
//   ready = the same box, 6 t aboard (bought 5): Copenhagen on the reserve
// usage: node docs/design-process/ui-options-2/tools/now-states.mjs <outdir>
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? '.';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto('http://localhost:5200/?debug&nointro&level=12', { waitUntil: 'load' });
  await sleep(3000);
  const pts = () => page.evaluate(() => window.game.debugPoints());
  let d = await pts();
  const q = d.quay.find((x) => x.id === 2);
  const b = d.bays[0];
  await page.mouse.move(q.p.x, q.p.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(q.p.x + ((b.x - q.p.x) * k) / 8, q.p.y + ((b.y - q.p.y) * k) / 8);
    await sleep(30);
  }
  await page.mouse.up();
  await sleep(900);
  const bunkerTo = async (want) => {
    for (let k = 0; k < 20; k++) {
      d = await pts();
      const cur = d.plan[0].bunker;
      if (cur === want) return;
      await page.click(cur < want ? '.fuel .plus' : '.fuel .minus');
      await sleep(150);
    }
  };
  await bunkerTo(4);
  await sleep(1500);
  await page.screenshot({ path: `${out}/now-L12-mid.png` });
  console.log('mid', JSON.stringify(await page.evaluate(() => window.game.debugState())));
  await bunkerTo(5);
  await sleep(1500);
  await page.screenshot({ path: `${out}/now-L12-ready.png` });
  console.log('ready', JSON.stringify(await page.evaluate(() => window.game.debugState())));
} finally {
  await browser.close();
}
