import { Page, expect } from '@playwright/test';

export async function bootGame(page: Page, query = 'quality=low'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as any).__MOYUE__?.mode && (window as any).__MOYUE__.mode !== 'loading', null, { timeout: 90_000 });
  return errors;
}

export async function mode(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__MOYUE__.mode);
}

export async function playerPos(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as any).__MOYUE__.player.position.toArray());
}

export async function rects(page: Page): Promise<Record<string, { x: number; y: number; r: number; visible: boolean }>> {
  return page.evaluate(() => (window as any).__MOYUE__.touch.debugRects());
}

/** Dispatch a touch-like pointer sequence on the touch layer. */
export async function touchDrag(page: Page, id: number, x0: number, y0: number, x1: number, y1: number, holdMs: number): Promise<void> {
  await page.evaluate(({ id, x0, y0, x1, y1, holdMs }) => new Promise<void>((resolve) => {
    const root = document.getElementById('moyue-touch')!;
    // like a real finger: the first event targets the element under the point
    const first = (document.elementFromPoint(x0, y0) as HTMLElement | null) ?? root;
    const target = root.contains(first) ? first : root;
    const ev = (type: string, x: number, y: number) =>
      (type === 'pointerdown' ? target : root).dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    ev('pointerdown', x0, y0);
    let k = 0;
    const steps = 6;
    const iv = setInterval(() => {
      k++;
      ev('pointermove', x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps);
      if (k >= steps) clearInterval(iv);
    }, 30);
    setTimeout(() => {
      ev('pointerup', x1, y1);
      resolve();
    }, holdMs);
  }), { id, x0, y0, x1, y1, holdMs });
}

export async function touchTap(page: Page, id: number, x: number, y: number, holdMs = 120): Promise<void> {
  await touchDrag(page, id, x, y, x, y, holdMs);
}

export { expect };
