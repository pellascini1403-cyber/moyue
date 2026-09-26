// Dev helper: open the game in headless Chromium, run optional JS, save screenshots.
// usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [evalJs]
import { chromium } from '@playwright/test';
const [,, url = 'http://127.0.0.1:5173/', out = 'shot.png', w = '1280', h = '720', wait = '4000', js = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (js) {
  const r = await page.evaluate(js);
  if (r !== undefined) console.log('eval:', JSON.stringify(r));
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
const info = await page.evaluate(() => window.__MOYUE__?.debugInfo?.());
console.log(JSON.stringify(info));
console.log(logs.filter((l,i,a)=>a.indexOf(l)===i).slice(0,25).join('\n').slice(0,6000));
await browser.close();
