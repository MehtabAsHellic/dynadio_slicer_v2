import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.keyboard.press('?');
await page.waitForSelector('.modal');
await page.waitForTimeout(300);
const describe = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a
      ? `${a.tagName}.${String(a.className).slice(0, 40)} "${(a.textContent ?? '').trim().slice(0, 30)}" aria=${a.getAttribute('aria-label')}`
      : 'none';
  });
console.log('initial', await describe());
console.log(
  'probe counts',
  await page.evaluate(() => ({
    all: document.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length,
    modal: document.querySelectorAll('.modal button:not([disabled]), .modal a[href]').length,
    inModal: document.querySelectorAll('.modal button:not([disabled])').length,
  })),
);
await page.evaluate(() => document.activeElement?.blur());
console.log('blurred', await describe());
for (let i = 0; i < 8; i += 1) {
  await page.keyboard.press('Tab');
  console.log(`tab ${i + 1}`, await describe());
}
await browser.close();