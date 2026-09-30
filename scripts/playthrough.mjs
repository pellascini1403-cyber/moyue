// Plays the whole critical path in the real, rendered game: an autopilot drives
// the player controller step by step (inputs injected per fixed 60 Hz step, so
// frame rate does not matter) through every region, and reports each leg.
// Unlike tests/traversal.test.ts (headless physics), this catches problems a
// player would meet on screen, such as a platform that collides but is not drawn.
// usage: npm run dev, then  node scripts/playthrough.mjs [outDir] [segment]
//   outDir: where to save a gameplay-camera capture at each marked leg (optional)
//   segment: run only one of threshold | terraces | mistfall | stair | sanctum
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [,, outDir = '', only = ''] = process.argv;
if (outDir) mkdirSync(outDir, { recursive: true });

/** Legs as in tests/traversal.test.ts. `shot` = capture the view when the leg starts. */
const SEGMENTS = [
  {
    name: 'threshold', start: [0, 100.45, 1.6, Math.PI], abilities: '',
    legs: [
      { to: [0, 100, -3.5], jump: 'none', label: 'leave the tomb' },
      { to: [0, 100, -9], jump: 'none', label: 'overlook', shot: 1 },
      { to: [-5.2, 100, -11.6], jump: 'none', label: 'stair top' },
      { to: [-15, 97, -12], jump: 'none', label: 'first landing' },
      { to: [-22.5, 97, -12], label: 'first gap', shot: 1 },
      { to: [-28, 98.6, -12], label: 'step up' },
      { to: [-28, 98.6, -15.5], jump: 'none', label: 'bridge start', shot: 1 },
      { to: [-28, 98.6, -45], tol: 1.2, label: 'broken bridge', timeout: 15 },
      { to: [-28, 98.6, -52], jump: 'none', label: 'plateau' },
      { to: [-24, 96.4, -64.6], label: 'hanging raft', tol: 0.8, shot: 1 },
      { to: [-20, 96.4, -64.6], jump: 'none', label: 'step onto the lantern raft', tol: 0.8 },
      { to: [-7, 93.4, -70], label: 'ride and hop off', tol: 1.2, waitPlat: ['th_lift_mp', '>', -11.4] },
      { to: [-7, 90, -81.5], jump: 'none', label: 'down to the terrace gate' },
    ],
  },
  {
    name: 'terraces', start: [-7, 90.1, -82.5, Math.PI], abilities: '',
    legs: [
      { to: [-7, 86, -93.6], jump: 'none', label: 'stairs to the court', shot: 1 },
      { to: [5.8, 86, -100], jump: 'none', label: 'court east' },
      { to: [14.6, 82, -100], jump: 'none', label: 'down to the trial terrace', shot: 1 },
      { to: [28, 82, -99], jump: 'none', label: 'trial terrace east' },
      { to: [34, 54, -100], jump: 'none', tol: 2.5, label: 'walk off the edge to the pagoda foot', timeout: 10 },
      { to: [30, 54, -110.3], jump: 'none', label: 'pagoda foot north', shot: 1 },
      { to: [30, 48, -124], jump: 'none', label: 'stairs down to the mist landing' },
    ],
  },
  {
    name: 'mistfall', start: [30, 48.1, -124, -Math.PI / 2], abilities: '',
    legs: [
      { to: [27, 48, -124], jump: 'none', label: 'bridge start' },
      { to: [21.2, 50, -124], jump: 'none', tol: 0.5, label: 'edge of the Great Gap', shot: 1 },
      { to: [8, 49.4, -124], dash: 1, tol: 1.5, label: 'jump + dash across the Great Gap' },
      { to: [0, 48, -124], jump: 'none', label: 'pilgrim rock' },
      { to: [0, 48, -129], jump: 'none', label: 'north span start' },
      { to: [0, 48, -147.5], label: 'broken span', timeout: 14, shot: 1 },
      { to: [-5, 48, -148.4], jump: 'none', label: 'stair top' },
      { to: [-24, 44, -155], jump: 'none', label: 'cloister garden', shot: 1 },
    ],
  },
  {
    name: 'stair', start: [-24, 44.1, -160, Math.PI], abilities: '&abilities=all',
    legs: [
      { to: [-24, 44, -167.5], jump: 'none', tol: 0.6, label: 'foot of the hanging stair', shot: 1 },
      { to: [-24, 47.8, -170.6], double: 1, label: 'ledge 1' },
      { to: [-19.6, 51.6, -173.6], double: 1, label: 'ledge 2' },
      { to: [-24.4, 55.4, -176.6], double: 1, label: 'ledge 3' },
      { to: [-22, 59.2, -181.5], double: 1, label: "hermit's terrace", shot: 1 },
    ],
  },
  {
    name: 'sanctum', start: [-34, 16.1, -197.5, -Math.PI / 2], abilities: '&abilities=all',
    legs: [
      { to: [-27, 16, -198], jump: 'none', label: 'out through the doorway', shot: 1 },
      { to: [-22, 16, -200.5], jump: 'none', label: 'approach start' },
      { to: [-9.5, 16, -202.5], jump: 'none', label: 'crimson approach' },
      { to: [-6, 16, -213], jump: 'none', label: 'shrine' },
      { to: [-5.5, 16, -222], jump: 'none', label: 'bridge', shot: 1 },
      { to: [6, 16, -222], jump: 'none', label: 'courtyard' },
      { to: [12, 16, -222], jump: 'now', slam: 1, reachBelowY: 8, timeout: 8, label: 'bell strike the seal' },
    ],
  },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const seg of SEGMENTS) {
  if (only && seg.name !== only) continue;
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:5173/?quality=medium&play=1&god=1${seg.abilities}`);
  await page.waitForFunction(() => window.__MOYUE__?.mode === 'play', null, { timeout: 120000 });
  console.log(`== ${seg.name}`);
  await page.evaluate(([start, legs]) => {
  const g = window.__MOYUE__; const c = g.player.ctrl; const V = c.position.constructor; const w = window;
  g.settings.showHints = true;
  if (start) g.spawnPlayer(new V(start[0], start[1], start[2]), start[3] ?? 0);
  w.__log = []; w.__done = false; w.__fail = null; w.__shot = -1;
  let li = 0, jumped = false, jf = 0, settle = 0, legFrames = 0, dashed = false, doubled = false, slammed = false, shotTaken = -1, hazards = 0;
  const plat = (id) => g.entities.find((e) => e.id === id)?.position;
  const orig = c.update.bind(c);
  c.update = (dt, inp, world) => {
    if (w.__done || w.__fail) return orig(dt, inp, world);
    if (w.__shot >= 0) return; // frozen while the page is captured
    const leg = legs[li];
    if (leg.shot && shotTaken !== li) { shotTaken = li; w.__shot = li; return; }
    const p = c.position;
    const i = { ...inp, moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, attackPressed: false, specialPressed: false };
    if (leg.waitPlat) {
      const pp = plat(leg.waitPlat[0]); const k = leg.waitPlat[1];
      const ok = pp && (k === '<' ? pp.x < leg.waitPlat[2] : k === '>' ? pp.x > leg.waitPlat[2] : pp.y > leg.waitPlat[2]);
      if (!ok && legFrames < 60 * 25) { legFrames++; return orig(dt, i, world); }
    }
    legFrames++;
    if (c.body.hazard) hazards++;
    const to = leg.to; const dx = to[0] - p.x, dz = to[2] - p.z; const hd = Math.hypot(dx, dz);
    const tol = leg.tol ?? 0.9;
    const below = leg.reachBelowY !== undefined && p.y < leg.reachBelowY;
    if (below || (hd < tol && c.grounded && (leg.ignoreY || Math.abs(p.y - to[1]) < 1.3))) {
      settle++;
      if (below || settle > 6) {
        w.__log.push(`ok  ${leg.label}  (${p.toArray().map((n) => n.toFixed(1))})`);
        li++; jumped = false; jf = 0; settle = 0; legFrames = 0; dashed = false; doubled = false; slammed = false;
        if (li >= legs.length) w.__done = true;
      }
      return orig(dt, i, world);
    }
    if (legFrames > (leg.timeout ?? 12) * 60) { w.__fail = `FAILED  ${leg.label}  at (${p.toArray().map((n) => n.toFixed(2))}) state ${c.state}`; return orig(dt, i, world); }
    const mag = hd < 1.2 && c.grounded ? Math.max(0.35, hd / 1.2) : 1;
    i.moveX = (dx / (hd || 1)) * mag; i.moveZ = (dz / (hd || 1)) * mag;
    const want = leg.jump ?? 'edge';
    if (!jumped && c.grounded && want !== 'none') {
      let doJump = want === 'now';
      if (want === 'edge') {
        const probe = new V(p.x + (dx / (hd || 1)) * 0.75, p.y + 0.5, p.z + (dz / (hd || 1)) * 0.75);
        const hit = g.physics.raycast(probe, new V(0, -1, 0), 1.4);
        const higher = to[1] - p.y > 0.5 && hd < 5.5;
        doJump = !hit || hit.collider.hazard > 0 || higher;
      }
      if (doJump) { i.jumpPressed = true; jumped = true; }
    }
    if (jumped) {
      jf++; i.jumpHeld = true;
      if (leg.dash && !dashed && jf > 10 && c.velocity.y < 4) { i.dashPressed = true; dashed = true; }
      if (leg.double && !doubled && jf > 12 && c.velocity.y < 1.5 && !c.grounded) { i.jumpPressed = true; doubled = true; }
      if (leg.slam && !slammed && jf > 14 && hd < 0.8 && !c.grounded) { i.specialPressed = true; slammed = true; }
      if (c.grounded && jf > 5) { jumped = false; jf = 0; dashed = false; doubled = false; }
    }
    return orig(dt, i, world);
  };
}, [seg.start, seg.legs]);
  let last = 0;
  let result = 'TIMEOUT';
  for (let k = 0; k < 900; k++) {
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ log: window.__log, done: window.__done, fail: window.__fail, shot: window.__shot }));
    for (const l of st.log.slice(last)) console.log('  ' + l);
    last = st.log.length;
    if (st.shot >= 0) {
      if (outDir) {
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${outDir}/${seg.name}_${String(st.shot).padStart(2, '0')}.png` });
      }
      await page.evaluate(() => { window.__shot = -1; });
    }
    if (st.done || st.fail) {
      result = st.fail ?? 'DONE';
      break;
    }
  }
  if (result !== 'DONE') failures++;
  console.log(`  ${result}${errs.length ? '  ERRORS: ' + errs.slice(0, 3).join(' | ') : ''}`);
  if (errs.length) failures++;
  await page.close();
}
await browser.close();
console.log(failures ? `${failures} problem(s)` : 'all segments passed');
process.exit(failures ? 1 : 0);
