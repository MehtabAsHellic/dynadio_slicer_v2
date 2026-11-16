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
await page.getByRole('button', { name: /^Jet/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/smoke-prepare.png` });
console.log('after load errors:', errors);

const slice = page.getByRole('button', { name: /^Slice/i }).first();
console.log('slice disabled:', await slice.isDisabled(), 'label:', await slice.innerText());
await slice.click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/smoke-after-slice.png` });
console.log('after slice errors:', errors);
console.log('stage preview buttons:', await page.getByRole('button', { name: 'Preview' }).count());
console.log('status:', await page.locator('.statusbar').innerText());
await browser.close();