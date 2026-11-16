import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.locator('.demo-card').filter({ hasText: 'Torus' }).click();
await page.waitForFunction(() => document.querySelector('.viewport-chip')?.textContent?.includes('mm'), null, { timeout: 30000 });
await page.getByRole('button', { name: /^Slice/i }).first().click();
await page.waitForSelector('.footer-progress');
await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent?.includes('Points'), null, { timeout: 120000 });
await page.waitForTimeout(1500);
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
const gl = await page.evaluate(() => {
  const canvas = document.querySelector('.viewport-canvas canvas');
  const context = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
  const info = context?.getExtension('WEBGL_debug_renderer_info');
  return context && info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('renderer', gl);
await browser.close();