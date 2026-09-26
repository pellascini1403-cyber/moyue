// Dev helper: take screenshots from a list of camera viewpoints.
// usage: node scripts/tour.mjs <outPrefix> <json [[px,py,pz,lx,ly,lz],...]> [w] [h] [query]
import { chromium } from '@playwright/test';
const [,, prefix = '/tmp/tour', json = '[]', w = '960', h = '540', query = 'quality=low&play=1'] = process.argv;
const views = JSON.parse(json);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:5173/?${query}`);
await page.waitForFunction(() => window.__MOYUE__ && window.__MOYUE__.mode !== 'loading', null, { timeout: 60000 });
await page.waitForTimeout(1500);
let i = 0;
for (const v of views) {
  await page.evaluate((v) => {
    const g = window.__MOYUE__;
    const V = g.player.position.constructor;
    if (v.length === 6) g.cam.cinematic = { pos: new V(v[0], v[1], v[2]), look: new V(v[3], v[4], v[5]), lambda: 1000 };
    else { g.cam.cinematic = null; g.spawnPlayer(new V(v[0], v[1], v[2]), v[3] ?? 0); }
  }, v);
  await page.waitForTimeout(v.length === 6 ? 2500 : 3500);
  await page.screenshot({ path: `${prefix}${i++}.png` });
}
console.log(JSON.stringify(await page.evaluate(() => window.__MOYUE__.debugInfo())));
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n'));
await browser.close();
