// Dev helper: photograph the protagonist close up — idle from several angles,
// then actions caught in slow motion (software WebGL runs at ~10 fps here).
// usage: node scripts/pose-shots.mjs <outPrefix> ["x,y,z"] [yaw] [quality]   (needs `npm run dev` on :5173)
import { chromium } from '@playwright/test';
const [,, prefix = '/tmp/pose', spawn = '-33.4,98.8,-52.5', yaw = '3.14', quality = 'high'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:5173/?quality=${quality}&spawn=${spawn}&abilities=all&god=1`);
await page.waitForFunction(() => window.__MOYUE__?.mode === 'play', null, { timeout: 120000 });
await page.evaluate(([yaw]) => {
  const g = window.__MOYUE__;
  g.spawnPlayer(g.player.position.clone(), +yaw);
  g.hud.hint(null);
  g.settings.showHints = false;
}, [yaw]);
await page.waitForTimeout(2500);

/** Park the camera at an offset in the player's frame (right, up, forward) looking at chest height. */
const cam = (r, u, f, look = 0.55) => page.evaluate(([r, u, f, look]) => {
  const g = window.__MOYUE__;
  const p = g.player.position, y = g.player.ctrl.facing;
  const V = p.constructor;
  const fwd = new V(Math.sin(y), 0, Math.cos(y)), right = new V(-Math.cos(y), 0, Math.sin(y));
  g.cam.cinematic = { pos: p.clone().addScaledVector(right, r).addScaledVector(fwd, f).add(new V(0, u, 0)), look: p.clone().add(new V(0, look, 0)), lambda: 1000 };
}, [r, u, f, look]);
let n = 0;
const shot = async (name) => page.screenshot({ path: `${prefix}${String(n++).padStart(2, '0')}_${name}.png` });

for (const [name, r, u, f] of [['front', 0.4, 0.75, 2.6], ['threequarter', 1.7, 0.9, 1.9], ['side', 2.6, 0.7, 0.1], ['back', -0.8, 1.0, -2.4]]) {
  await cam(r, u, f);
  await page.waitForTimeout(900);
  await shot(`idle_${name}`);
}

// actions in slow motion, viewed three-quarter
await cam(2.0, 0.9, 2.2);
const slow = (scale) => page.evaluate((s) => { window.__MOYUE__.slowmo = { t: 999, scale: s }; }, scale);
const act = async (label, keys, times, scale = 0.06) => {
  await slow(scale);
  for (const k of keys) await page.keyboard.down(k);
  for (let i = 0; i < times.length; i++) {
    await page.waitForTimeout(times[i]);
    await shot(`${label}${i}`);
  }
  for (const k of keys) await page.keyboard.up(k);
  await slow(1);
  await page.waitForTimeout(1500);
};
await act('slash1_', ['KeyJ'], [250, 450, 700, 1100]);
await page.keyboard.up('KeyJ');
await act('jump_', ['Space'], [300, 1500, 3500]);
await act('dash_', ['KeyK'], [200, 900]);
// walk / run: hold W with the camera trailing
await cam(1.8, 1.0, -2.6);
await slow(0.25);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1600);
await shot('run');
await page.keyboard.up('KeyW');
await slow(1);
console.log(JSON.stringify(await page.evaluate(() => window.__MOYUE__.debugInfo())));
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors');
await browser.close();
