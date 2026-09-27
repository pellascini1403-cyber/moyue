// Dev helper: render the protagonist from the front, left, back and right in the character viewer.
// usage: node scripts/model-views.mjs <out.png> ["&extra=viewer&params"]   (needs `npm run dev` on :5173)
import { chromium } from '@playwright/test';
const [,, out, extra = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [];
for (const yaw of [0, 90, 180, -90]) {
  const page = await browser.newPage({ viewport: { width: 440, height: 600 } });
  await page.goto(`http://127.0.0.1:5173/viewer.html?yaw=${yaw}&pitch=6&dist=4.2&look=0.6${extra}`);
  await page.waitForFunction(() => (window.__VIEWER__?.frames ?? 0) > 10, null, { timeout: 120000 });
  shots.push((await page.screenshot()).toString('base64'));
  await page.close();
}
const cmp = await browser.newPage({ viewport: { width: 440 * 4 + 18, height: 600 } });
await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:6px">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`);
await cmp.screenshot({ path: out });
await browser.close();
