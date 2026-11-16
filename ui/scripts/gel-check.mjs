import { chromium } from 'playwright';

const browser = await chromium.launch();
const problems = [];
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 700 } });
  await context.addInitScript((value) => {
    window.localStorage.setItem('dynadio.theme', value);
  }, theme);
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`${theme}: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`${theme} console: ${msg.text()}`);
  });
  await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  await page.locator('.demo-card').first().click();
  await page.waitForFunction(() => document.querySelector('.viewport-chip')?.textContent?.includes('mm'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.getByRole('button', { name: /^Slice/i }).first().click();
  await page.waitForFunction(() => document.querySelector('.statusbar')?.textContent?.includes('Points'), null, { timeout: 30000 });
  console.log(theme, 'slice seconds', ((Date.now() - t0) / 1000).toFixed(2));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `../artifacts/screenshots/gel-${theme}.png` });
  await page.locator('#legend-colour').selectOption('layer');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `../artifacts/screenshots/gel-${theme}-layer.png` });
  await context.close();
}
await browser.close();
console.log('problems:', problems.length ? problems : 'none');