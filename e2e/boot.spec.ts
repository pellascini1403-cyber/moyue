import { test } from '@playwright/test';
import { bootGame, mode, expect } from './helpers';

test('boots to the title screen without errors', async ({ page }) => {
  const errors = await bootGame(page);
  expect(await mode(page)).toBe('title');
  await expect(page.locator('.moyue-title-name')).toHaveText('MÒYUÈ');
  await expect(page.locator('canvas#moyue-canvas')).toBeVisible();
  const info = await page.evaluate(() => (window as any).__MOYUE__.debugInfo());
  expect(info.world.triangles).toBeGreaterThan(50_000);
  expect(errors).toEqual([]);
});

test('begin the descent → opening → gameplay; keyboard moves the player', async ({ page }) => {
  const errors = await bootGame(page);
  await page.getByRole('button', { name: /Begin the Descent|New Descent/ }).click();
  await page.waitForFunction(() => ['cutscene', 'play'].includes((window as any).__MOYUE__.mode));
  // pressing a movement key skips the opening once it has run a moment
  await page.waitForTimeout(3000);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play', null, { timeout: 60_000 });
  const before = await page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
  // hold for one second of *game* time: software WebGL in CI can take seconds per frame
  const t0 = await page.evaluate(() => (window as any).__MOYUE__.time);
  await page.waitForFunction((t0) => (window as any).__MOYUE__.time - t0 >= 1, t0, { timeout: 60_000 });
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('the full opening hands the camera back with the player in view', async ({ page }) => {
  const errors = await bootGame(page);
  await page.getByRole('button', { name: /Begin the Descent|New Descent/ }).click();
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'cutscene', null, { timeout: 30_000 });
  // no input: let the whole cutscene play out
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play', null, { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const view = await page.evaluate(() => {
    const g = (window as any).__MOYUE__;
    const cam = g.cam.camera.position;
    const head = g.player.position.clone();
    head.y += 0.6;
    return { cinematic: g.cam.cinematic, dist: cam.distanceTo(head), los: g.physics.hasLineOfSight(cam, head) };
  });
  expect(view.cinematic).toBeNull();
  expect(view.dist).toBeLessThan(8);
  expect(view.los).toBe(true);
  expect(errors).toEqual([]);
});
