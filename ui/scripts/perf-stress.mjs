import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.bringToFront();
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.locator('.demo-card').filter({ hasText: 'Torus' }).click();
await page.waitForFunction(() => document.querySelector('.viewport-chip')?.textContent?.includes('mm'), null, { timeout: 30000 });
await page.getByRole('group', { name: 'Up axis' }).getByRole('button', { name: 'Z' }).click();
await page.waitForTimeout(300);
const pitch = page.getByLabel('Layer distance').first();
await pitch.fill('0.08');
await pitch.press('Enter');
await page.waitForTimeout(300);
const t0 = Date.now();
await page.getByRole('button', { name: /^Slice/i }).first().click();
await page.waitForSelector('.footer-progress', { timeout: 10000 });
await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent?.includes('Points'), null, { timeout: 120000 });
console.log('slice seconds', ((Date.now() - t0) / 1000).toFixed(2));
console.log('status:', (await page.locator('.statusbar').textContent())?.replace(/\s+/g, ' ').trim());
await page.waitForTimeout(2000);
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [];
      const start = performance.now();
      function tick(t) {
        times.push(t);
        if (t - start < 3000) requestAnimationFrame(tick);
        else {
          const deltas = [];
          for (let i = 1; i < times.length; i += 1) deltas.push(times[i] - times[i - 1]);
          deltas.sort((a, b) => a - b);
          const avg = deltas.reduce((s, v) => s + v, 0) / deltas.length;
          resolve({ frames: deltas.length, avg: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2) });
        }
      }
      requestAnimationFrame(tick);
    }),
);
console.log('fps', fps);
await page.screenshot({ path: '../artifacts/screenshots/perf-300k.png' });
await browser.close();