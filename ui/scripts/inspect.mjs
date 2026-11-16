import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('.num-field')];
  return fields.map((field) => {
    const input = field.querySelector('input');
    const cs = input ? getComputedStyle(input) : null;
    const box = input?.getBoundingClientRect();
    return {
      value: input?.value,
      aria: input?.getAttribute('aria-label'),
      box: box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null,
      fieldBox: (() => { const b = field.getBoundingClientRect(); return { w: b.width, h: b.height }; })(),
      color: cs?.color,
      textFill: cs ? cs.webkitTextFillColor : null,
      opacity: cs?.opacity,
      disabled: input?.disabled,
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await page.locator('.transform-card').screenshot({ path: '../artifacts/screenshots/smoke-transform.png' });
await browser.close();