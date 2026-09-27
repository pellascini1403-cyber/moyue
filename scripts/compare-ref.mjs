// Dev helper: render the protagonist in the viewer and place it beside a reference image.
// usage: node scripts/compare-ref.mjs <reference.jpg> <out.png> "<viewer query>" [width] [height] [crop x,y,w,h of the reference]
//   (needs `npm run dev` on :5173; the reference image is only read, never copied into the repo)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [,, ref, out, query = 'yaw=20&pitch=8', w = '880', h = '1200', crop = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:5173/viewer.html?${query}`);
await page.waitForFunction(() => (window.__VIEWER__?.frames ?? 0) > 20, null, { timeout: 120000 });
await page.waitForTimeout(500);
const render = (await page.screenshot()).toString('base64');
const refData = readFileSync(ref).toString('base64');
const cmp = await browser.newPage({ viewport: { width: +w * 2 + 12, height: +h } });
const [cx, cy, cw, ch] = crop ? crop.split(',').map(Number) : [0, 0, 0, 0];
const scale = crop ? Math.min(+w / cw, +h / ch) : 1;
const refEl = crop
  ? `<div style="width:${w}px;height:${h}px;overflow:hidden;position:relative;background:#222"><img src="data:image/jpeg;base64,${refData}" style="position:absolute;left:${-cx * scale}px;top:${-cy * scale}px;transform-origin:0 0;transform:scale(${scale})"></div>`
  : `<img src="data:image/jpeg;base64,${refData}" style="width:${w}px;height:${h}px;object-fit:contain">`;
await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:12px">
  ${refEl}
  <img src="data:image/png;base64,${render}" style="width:${w}px;height:${h}px"></body>`);
await cmp.waitForTimeout(300);
await cmp.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
