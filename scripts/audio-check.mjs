// Verifies the audio graph builds and runs without errors in Chromium (no listening possible here).
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto('http://127.0.0.1:5173/?quality=low');
await page.waitForFunction(() => window.__MOYUE__?.mode === 'title', null, { timeout: 60000 });
await page.mouse.click(400, 225);
await page.waitForTimeout(500);
const r = await page.evaluate(async () => {
  const g = window.__MOYUE__;
  const a = g.audio;
  a.unlock();
  await new Promise((r) => setTimeout(r, 500));
  const names = ['slash','slashHeavy','spin','hit','hitHeavy','kill','clang','jump','wingbeat','walljump','land','landHeavy','step','dash','cling','pogo','chargeReady','healStart','heal','flare','flareHit','slamStart','slam','hurt','death','awaken','jade','fragment','ability','shrine','regionChime','urn','lever','gateOpen','sealBreak','crumble','rockHit','arenaStart','arenaClear','lockOn','buy','uiMove','uiSelect','uiBack','miteAlert','miteWindup','miteLunge','wispAlert','wispCharge','wispDive','spit','emberImpact','guardAlert','guardWindup','guardStrike','censerWind','censerLift','smokeWind','censerSwing','smoke','slamBoss','bellWind','bellToll','bellCrack','bossJump','bossLeap','bossCharge','bossPhase','bossAwaken','bossDeath'];
  for (const n of names) { a.sfx(n); await new Promise((r) => setTimeout(r, 30)); }
  for (const m of ['title','opening','threshold','terraces','mistfall','sanctum','battle','boss','ending']) { a.setMusic(m); await new Promise((r) => setTimeout(r, 300)); a.update(0.3, g.cam.camera.position, { x: 0, y: 0, z: -1 }); }
  for (const m of ['cave','terraces','water','sanctum']) { a.setAmbience(m); await new Promise((r) => setTimeout(r, 300)); a.update(0.3, g.cam.camera.position, { x: 0, y: 0, z: -1 }); }
  return { state: a.ctx?.state, sampleRate: a.ctx?.sampleRate, sounds: names.length };
});
console.log(JSON.stringify(r));
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors');
await browser.close();
