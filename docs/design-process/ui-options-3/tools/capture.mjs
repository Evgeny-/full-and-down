// Real game shots for the polish pass: for each state, "now" (HUD as it is) and "bg" (HUD hidden, for
// the mockup to sit on). The coach bubble is hidden in both so only the HUD differs.
//   L12 mid   = Kiel, the 3 t Copenhagen box aboard, 5 t of fuel (bought 4): 1 t short at Copenhagen
//   L12 ready = the same, 6 t of fuel (bought 5)
//   L2        = Rotterdam at the start: nothing loaded, 1 t aboard, 2 t short at Esbjerg
// usage: node docs/design-process/ui-options-3/tools/capture.mjs <outdir>
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? '.';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (page, hud) => page.evaluate((hud) => {
  let s = document.getElementById('shot-css');
  if (!s) { s = document.createElement('style'); s.id = 'shot-css'; document.head.append(s); }
  s.textContent = `.coach{display:none!important}` + (hud ? '' : `.hud-head,.hud-foot{visibility:hidden!important}`);
}, hud);
async function both(page, name) {
  await css(page, true); await sleep(300);
  await page.screenshot({ path: `${out}/now-${name}.png` });
  await css(page, false); await sleep(300);
  await page.screenshot({ path: `${out}/assets/bg-${name}.png` });
  await css(page, true);
  console.log(name, JSON.stringify(await page.evaluate(() => window.game.debugState())));
}
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto('http://localhost:5200/?debug&nointro&level=12', { waitUntil: 'load' });
  await sleep(3000);
  const pts = () => page.evaluate(() => window.game.debugPoints());
  let d = await pts();
  const q = d.quay.find((x) => x.id === 2), b = d.bays[0];
  await page.mouse.move(q.p.x, q.p.y); await page.mouse.down();
  for (let k = 1; k <= 8; k++) { await page.mouse.move(q.p.x + ((b.x - q.p.x) * k) / 8, q.p.y + ((b.y - q.p.y) * k) / 8); await sleep(30); }
  await page.mouse.up(); await sleep(900);
  const bunkerTo = async (want) => {
    for (let k = 0; k < 20; k++) {
      d = await pts();
      if (d.plan[0].bunker === want) return;
      await page.click(d.plan[0].bunker < want ? '.fuel .plus' : '.fuel .minus'); await sleep(150);
    }
  };
  await bunkerTo(4); await sleep(1500); await both(page, 'L12-mid');
  await bunkerTo(5); await sleep(1500); await both(page, 'L12-ready');
  await page.goto('http://localhost:5200/?debug&nointro&level=2', { waitUntil: 'load' });
  await sleep(3500); await both(page, 'L2');
} finally {
  await browser.close();
}
