import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.locator('.demo-card').first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Slice/i }).first().click();
await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent?.includes('Points'), null, { timeout: 30000 });
await page.waitForTimeout(500);
for (const sel of ['.viewport', '.preview-dock', '.dock-inner', '.legend', '.legend-labels', '.layer-rail', '.footer']) {
  const info = await page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: s.bottom, z: s.zIndex };
  });
  console.log(sel, info);
}
await browser.close();