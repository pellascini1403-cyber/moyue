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
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});
