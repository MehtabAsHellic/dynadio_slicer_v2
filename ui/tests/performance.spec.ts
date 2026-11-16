import { expect, test } from '@playwright/test';
import { chromium } from 'playwright';
import { openApp } from './helpers';

const URL = process.env.DYNADIO_URL || 'http://127.0.0.1:8765';

interface FrameStats {
  frames: number;
  fps: number;
  averageMs: number;
  p95Ms: number;
}

async function prepareStressModel(page: import('playwright').Page): Promise<void> {
  await page.locator('.demo-card').filter({ hasText: 'Torus' }).first().click();
  await page.waitForFunction(
    () => document.querySelector('.viewport-chip')?.textContent?.includes('mm'),
    null,
    { timeout: 30_000 },
  );
  await page.getByRole('group', { name: 'Up axis' }).getByRole('button', { name: 'Z' }).click();
  const pitch = page.getByLabel('Layer distance').first();
  await pitch.fill('0.08');
  await pitch.press('Enter');
  await page.waitForTimeout(300);
}

async function measureFps(page: import('playwright').Page, durationMs = 3000): Promise<FrameStats> {
  return page.evaluate(
    (duration) =>
      new Promise<FrameStats>((resolve) => {
        const times: number[] = [];
        const start = performance.now();
        const tick = (now: number) => {
          times.push(now);
          if (now - start < duration) {
            requestAnimationFrame(tick);
            return;
          }
          const deltas: number[] = [];
          for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
          deltas.sort((a, b) => a - b);
          const average = deltas.reduce((sum, value) => sum + value, 0) / Math.max(1, deltas.length);
          resolve({
            frames: deltas.length,
            fps: Number((1000 / average).toFixed(1)),
            averageMs: Number(average.toFixed(2)),
            p95Ms: Number(deltas[Math.floor(deltas.length * 0.95)].toFixed(2)),
          });
        };
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

test('300,000+ preview points render at 30 fps or better', async () => {
  test.skip(!!process.env.CI, 'This measurement needs a headed browser with a hardware GPU.');
  test.setTimeout(300_000);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
    await page.bringToFront();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await prepareStressModel(page);

    const started = Date.now();
    await page.getByRole('button', { name: /^Slice/i }).first().click();
    await page.waitForSelector('.footer-progress');
    await page.waitForFunction(
      () => document.querySelector('.statusbar')?.textContent?.includes('Points'),
      null,
      { timeout: 180_000 },
    );
    const sliceSeconds = (Date.now() - started) / 1000;
    await page.waitForTimeout(2500);

    const status = (await page.locator('.statusbar').textContent()) ?? '';
    const match = /Points\s*([\d,]+)/.exec(status.replace(/\s+/g, ' '));
    const points = match ? Number(match[1].replace(/,/g, '')) : 0;
    expect(points, `status bar: ${status}`).toBeGreaterThanOrEqual(300_000);

    const stats = await measureFps(page, 3000);
    console.log(
      `preview performance: ${points.toLocaleString('en-US')} points, ` +
        `slice ${sliceSeconds.toFixed(2)} s, ${stats.frames} frames, ` +
        `${stats.fps} fps average, p95 ${stats.p95Ms} ms`,
    );

    await page.getByRole('button', { name: 'Frame the model' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '../artifacts/screenshots/perf-300k.png' });
    expect(stats.fps).toBeGreaterThanOrEqual(30);
  } finally {
    await browser.close();
  }
});

test('Cancel stops a large slice within one second', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page, 'light');
  await prepareStressModel(page);

  await page.getByRole('button', { name: /^Slice/i }).first().click();
  await page.waitForSelector('.footer-progress');
  await page.waitForTimeout(250);
  const started = Date.now();
  await page.getByRole('button', { name: /Cancel/i }).click();
  await page.waitForSelector('.footer-progress', { state: 'detached', timeout: 5000 });
  const elapsed = Date.now() - started;
  console.log(`cancel returned to idle in ${elapsed} ms`);
  expect(elapsed).toBeLessThan(1000);
  await expect(page.getByText('Slicing cancelled')).toBeVisible({ timeout: 5000 });
});