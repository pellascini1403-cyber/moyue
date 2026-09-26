import { test } from '@playwright/test';
import { bootGame, expect } from './helpers';

test('settings persist across reloads', async ({ page }) => {
  await bootGame(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Audio' }).click();
  const music = page.getByLabel('Music');
  await music.fill('0.25');
  await music.dispatchEvent('input');
  await page.reload();
  await bootGame(page);
  const v = await page.evaluate(() => (window as any).__MOYUE__.settings.musicVolume);
  expect(v).toBeCloseTo(0.25, 2);
});

test('resting at a shrine saves; continue restores the shrine, abilities and pickups', async ({ page }) => {
  await bootGame(page, 'quality=low&spawn=-31,98.7,-56');
  await page.evaluate(() => {
    const g = (window as any).__MOYUE__;
    g.progress.abilities.dash = true;
    g.progress.jade = 42;
    g.consume('th_urn_test');
    g.restAtShrine(g.shrines.get('shrine_threshold'));
  });
  await page.reload();
  await bootGame(page);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play');
  const s = await page.evaluate(() => {
    const g = (window as any).__MOYUE__;
    return { shrine: g.progress.shrine, dash: g.player.ctrl.abilities.dash, jade: g.progress.jade, consumed: g.isConsumed('th_urn_test'), region: g.region?.def.id };
  });
  expect(s).toEqual({ shrine: 'shrine_threshold', dash: true, jade: 42, consumed: true, region: 'threshold' });
});

test('a corrupted save falls back to the backup', async ({ page }) => {
  await bootGame(page, 'quality=low&spawn=-31,98.7,-56');
  await page.evaluate(() => {
    const g = (window as any).__MOYUE__;
    g.progress.jade = 7;
    g.writeSave();
    g.progress.jade = 9;
    g.writeSave();
    localStorage.setItem('moyue_save_v1', '{"data":{"version":1,"shrine":"x"},"sum":"bad"}');
  });
  await page.reload();
  await bootGame(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play');
  expect(await page.evaluate(() => (window as any).__MOYUE__.progress.jade)).toBe(7);
});
