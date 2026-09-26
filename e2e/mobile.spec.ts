import { test, devices } from '@playwright/test';
import { bootGame, rects, touchDrag, touchTap, expect, playerPos } from './helpers';

const VIEWPORTS = [
  { name: 'iPhone 15 landscape', width: 852, height: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } },
  { name: 'iPhone SE landscape', width: 667, height: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'Android phone landscape', width: 915, height: 412, safe: { top: 0, right: 0, bottom: 24, left: 32 } },
  { name: 'iPad landscape', width: 1180, height: 820, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  { name: 'Android tablet landscape', width: 1280, height: 800, safe: { top: 0, right: 0, bottom: 48, left: 0 } },
  { name: 'phone portrait', width: 393, height: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
];

for (const vp of VIEWPORTS) {
  test(`controls stay inside the safe area — ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript((s) => ((window as any).__MOYUE_SAFE__ = s), vp.safe);
    await bootGame(page, 'quality=low&play=1');
    await page.waitForTimeout(800);
    const r = await rects(page);
    const minX = vp.safe.left, maxX = vp.width - vp.safe.right, minY = vp.safe.top, maxY = vp.height - vp.safe.bottom;
    for (const [id, b] of Object.entries(r)) {
      if (!b.visible) continue;
      expect(b.x - b.r, `${id} left`).toBeGreaterThanOrEqual(minX - 0.5);
      expect(b.x + b.r, `${id} right`).toBeLessThanOrEqual(maxX + 0.5);
      expect(b.y - b.r, `${id} top`).toBeGreaterThanOrEqual(minY - 0.5);
      expect(b.y + b.r, `${id} bottom`).toBeLessThanOrEqual(maxY + 0.5);
    }
    // action buttons must not overlap each other
    const ids = ['jump', 'attack', 'dash', 'special', 'lock'].filter((k) => r[k]?.visible);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = r[ids[i]], b = r[ids[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${ids[i]} vs ${ids[j]}`).toBeGreaterThan((a.r + b.r) * 0.95);
      }
    // big thumbs: primary buttons are at least ~44pt
    expect(r.jump.r * 2).toBeGreaterThanOrEqual(44);
    expect(r.attack.r * 2).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/mobile-${vp.name.replace(/\W+/g, '-')}.png` });
    await ctx.close();
  });
}

test('touch: stick moves, jump button jumps, strike button attacks, simultaneously', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await bootGame(page, 'quality=low&spawn=-28,98.7,-52');
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play');
  const r = await rects(page);
  const p0 = await playerPos(page);
  // hold the stick forward while tapping jump then strike with the other thumb
  const drag = touchDrag(page, 1, 150, 280, 150, 200, 2600);
  await page.waitForTimeout(700);
  const airborne = page.waitForFunction(() => !(window as any).__MOYUE__.player.ctrl.grounded, null, { timeout: 15_000 });
  await touchTap(page, 2, r.jump.x, r.jump.y, 250);
  await airborne;
  const attacked = page.waitForFunction(() => !!(window as any).__MOYUE__.player.ctrl.attack, null, { timeout: 15_000 });
  await touchTap(page, 3, r.attack.x, r.attack.y, 100);
  await attacked;
  await drag;
  const p1 = await playerPos(page);
  expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])).toBeGreaterThan(1);
  // camera drag on the right side changes the camera yaw
  const yaw0 = await page.evaluate(() => (window as any).__MOYUE__.cam.yaw);
  await touchDrag(page, 4, 560, 150, 460, 150, 900);
  await page.waitForTimeout(600);
  const yaw1 = await page.evaluate(() => (window as any).__MOYUE__.cam.yaw);
  expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.2);
  await ctx.close();
});

test('touch: pause button opens the pause menu and resume returns to play', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await bootGame(page, 'quality=low&play=1');
  const r = await rects(page);
  await touchTap(page, 1, r.top_pause.x, r.top_pause.y);
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'pause');
  await expect(page.locator('.moyue-panel-title')).toHaveText('Stillness');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play');
  await ctx.close();
});
