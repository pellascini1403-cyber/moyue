import { Page, test } from '@playwright/test';
import { bootGame, expect } from './helpers';

/** Start a game straight into play (no damage) and put the player at a spot. */
async function startAt(page: Page, x: number, y: number, z: number, yaw: number): Promise<string[]> {
  const errors = await bootGame(page, 'quality=low&play=1&god=1');
  await page.waitForFunction(() => (window as any).__MOYUE__.mode === 'play', null, { timeout: 90_000 });
  await page.evaluate(([x, y, z, yaw]) => {
    const g = (window as any).__MOYUE__;
    const V = g.player.position.constructor;
    g.settings.showHints = false;
    g.spawnPlayer(new V(x, y, z), yaw);
  }, [x, y, z, yaw]);
  // let the spawn settle for a moment of game time
  await waitGame(page, 0.5);
  return errors;
}

/** Wait for `s` seconds of game time (software WebGL can take seconds per frame). */
async function waitGame(page: Page, s: number): Promise<void> {
  const t0 = await page.evaluate(() => (window as any).__MOYUE__.time);
  await page.waitForFunction(([t0, s]) => (window as any).__MOYUE__.time - t0 >= s, [t0, s], { timeout: 120_000 });
}

test('keyboard: Space jumps over 3 m and K dashes forward, with no abilities', async ({ page }) => {
  const errors = await startAt(page, -4, 86.1, -100, Math.PI / 2);
  expect(await page.evaluate(() => (window as any).__MOYUE__.progress.abilities.dash)).toBe(false);
  // record the highest point reached, every fixed step
  await page.evaluate(() => {
    const c = (window as any).__MOYUE__.player.ctrl;
    const w = window as any;
    w.__y0 = c.position.y;
    w.__maxY = -1e9;
    const orig = c.update.bind(c);
    c.update = (dt: number, inp: unknown, world: unknown) => {
      orig(dt, inp, world);
      w.__maxY = Math.max(w.__maxY, c.position.y);
    };
  });
  await page.keyboard.down('Space');
  await waitGame(page, 1.2);
  await page.keyboard.up('Space');
  const rise = await page.evaluate(() => (window as any).__maxY - (window as any).__y0);
  expect(rise).toBeGreaterThan(3.0);

  await waitGame(page, 0.6);
  const p0 = await page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
  await page.keyboard.down('KeyK');
  await waitGame(page, 0.1);
  await page.keyboard.up('KeyK');
  await waitGame(page, 0.6);
  const p1 = await page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
  expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])).toBeGreaterThan(3.5);
  expect(errors).toEqual([]);
});

/**
 * Run at the Great Gap from the bridge (facing west), jump at the edge and,
 * optionally, dash at the top of the jump. Inputs are injected per fixed step
 * so the timing does not depend on the frame rate.
 */
async function leapTheGreatGap(page: Page, dash: boolean): Promise<{ landed: number[]; end: number[] }> {
  await page.evaluate((dash) => {
    const g = (window as any).__MOYUE__;
    const c = g.player.ctrl;
    const w = window as any;
    const V = c.position.constructor;
    w.__landed = null;
    let jumped = false, dashed = false, airborne = false;
    // always wrap the controller's own update (not a previous attempt's wrapper)
    w.__origUpdate = w.__origUpdate ?? c.update.bind(c);
    const orig = w.__origUpdate;
    c.update = (dt: number, inp: any, world: any) => {
      const p = c.position;
      const ahead = g.physics.raycast(new V(p.x - 0.6, p.y + 0.5, p.z), new V(0, -1, 0), 1.2);
      const i = { ...inp, moveX: -1, moveZ: 0, jumpHeld: true, jumpPressed: false, dashPressed: false };
      if (!jumped && c.grounded && !ahead) {
        i.jumpPressed = true;
        jumped = true;
      }
      if (jumped && !c.grounded) airborne = true;
      if (dash && airborne && !dashed && c.velocity.y < 1) {
        i.dashPressed = true;
        dashed = true;
      }
      orig(dt, i, world);
      if (airborne && c.grounded && !w.__landed) w.__landed = p.toArray();
    };
  }, dash);
  await page.waitForFunction(() => !!(window as any).__landed || (window as any).__MOYUE__.player.ctrl.position.y < 44, null, { timeout: 120_000 });
  await waitGame(page, 1.0);
  return page.evaluate(() => ({ landed: (window as any).__landed ?? [], end: (window as any).__MOYUE__.player.position.toArray() }));
}

test('the Great Gap: a jump alone falls short; jump + the forward dash crosses it (no abilities)', async ({ page }) => {
  const errors = await startAt(page, 25.5, 50.1, -124, -Math.PI / 2);
  const short = await leapTheGreatGap(page, false);
  // fell into the mist and was put back on the near side
  expect(short.end[0]).toBeGreaterThan(18);

  await page.evaluate(() => {
    const g = (window as any).__MOYUE__;
    const V = g.player.position.constructor;
    g.spawnPlayer(new V(25.5, 50.1, -124), -Math.PI / 2);
  });
  await waitGame(page, 0.5);
  const across = await leapTheGreatGap(page, true);
  expect(across.landed[0]).toBeLessThan(15.5);
  expect(across.landed[1]).toBeGreaterThan(48.5);
  // and stays there (no hazard respawn)
  expect(across.end[0]).toBeLessThan(15.5);
  expect(errors).toEqual([]);
});
