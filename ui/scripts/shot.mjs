import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '../artifacts/screenshots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/smoke-empty.png` });

console.log('title:', await page.title());
console.log('errors:', errors);
console.log('body:', (await page.locator('body').innerText()).slice(0, 1200));
await browser.close();