import puppeteer from 'puppeteer-core';
const lv = process.argv[2] ?? '1';
const extra = process.argv[3] ?? '';
const b = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const p = await b.newPage(); await p.setViewport({width:390,height:844,deviceScaleFactor:2});
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const S=(ms)=>new Promise(r=>setTimeout(r,ms));
const shot = async (n) => p.screenshot({path:`.shots/t${n}.png`});
await p.goto(`http://localhost:5200/?level=${lv}&nointro&reset&debug${extra}`,{waitUntil:'load'}); await S(2200);
await shot(1);
const d = await p.evaluate(()=>window.game.debugPoints());
for (const q of d.quay) { await p.mouse.click(q.p.x, q.p.y); await S(450); if (q === d.quay[0]) await shot(2); await p.mouse.click(d.bays[d.quay.indexOf(q)].x, d.bays[d.quay.indexOf(q)].y); await S(800); }
await shot(3);
await p.click('.fuel .buy'); await S(600);
await shot(4);
await p.click('.dock .sail'); await S(700);
await shot(5);
console.log(JSON.stringify(await p.evaluate(()=>window.game.debugState())));
await b.close();
