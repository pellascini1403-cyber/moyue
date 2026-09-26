// Drives the real game in Chromium: auto-pilot chases the nearest enemy and attacks.
// usage: node scripts/combat-check.mjs "<spawn x,y,z>" <seconds> <out.png> [abilities]
import { chromium } from '@playwright/test';
const [,, spawn = '-28,98.7,-49', secs = '25', out = '/tmp/combat.png', ab = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:5173/?quality=low&spawn=${spawn}&god=1${ab ? '&abilities=all' : ''}`);
await page.waitForFunction(() => window.__MOYUE__?.mode === 'play', null, { timeout: 60000 });
const result = await page.evaluate(async (secs) => {
  const g = window.__MOYUE__;
  const log = { kills: 0, hitsLanded: 0, damageTaken: 0, attacks: 0 };
  g.events.on('enemyKilled', () => log.kills++);
  g.events.on('playerDamaged', () => log.damageTaken++);
  const start = performance.now();
  let press = false;
  while (performance.now() - start < secs * 1000) {
    const p = g.player.position;
    let best = null, bd = 1e9;
    for (const d of g.damageables) {
      if (!d.canBeHit() || !d.kind) continue;
      const c = d.hurtboxes()[0].center;
      const dist = Math.hypot(c.x - p.x, c.z - p.z) + Math.abs(c.y - p.y) * 0.5;
      if (dist < bd && dist < 25) { bd = dist; best = c; }
    }
    if (best) {
      const b = g.cam.basis();
      const dx = best.x - p.x, dz = best.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      // world dir -> stick (x = right, y = forward)
      const sx = (dx * b.rx + dz * b.rz) / l, sy = (dx * b.fx + dz * b.fz) / l;
      const near = l < 1.8;
      g.input.setMove('kb', near ? sx * 0.2 : sx, near ? sy * 0.2 : sy);
      press = !press;
      if (press && l < 3.2) { g.input.press('kb', 'attack'); log.attacks++; }
      else g.input.release('kb', 'attack');
      if (best.y - p.y > 1.2 && g.player.ctrl.grounded && Math.random() < 0.2) g.input.press('kb', 'jump');
      else g.input.release('kb', 'jump');
    } else g.input.setMove('kb', 0, 0);
    await new Promise((r) => setTimeout(r, 90));
  }
  g.input.releaseAll();
  const arena = g.progress.flags;
  return { ...log, flags: Object.keys(arena).filter((k) => k.startsWith("arena") || k.startsWith("slain")), altarSealed: g.altars.map((a) => a.id + ":" + a.sealed), health: g.player.health, moonlight: g.player.moonlight, jade: g.progress.jade, pos: g.player.position.toArray().map((v) => +v.toFixed(1)), state: g.player.ctrl.state, fps: Math.round(g.fps) };
}, +secs);
await page.screenshot({ path: out });
console.log(JSON.stringify(result));
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n') : 'no errors');
await browser.close();
