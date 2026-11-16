import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 700 } });
await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.locator('.demo-card').filter({ hasText: 'Jet' }).first().click();
await page.waitForFunction(() => document.querySelector('.viewport-chip')?.textContent?.includes('mm'), null, { timeout: 30000 });
await page.waitForTimeout(300);
const selector =
  'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
const info = await page.evaluate((selector) => {
  document.querySelectorAll('[data-tab-probe]').forEach((el) => el.removeAttribute('data-tab-probe'));
  const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
  });
  const scope = dialog ?? document;
  const elements = Array.from(scope.querySelectorAll(selector)).filter((element) => {
    if (element.closest('[inert]')) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (element.disabled) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
  elements.forEach((element, index) => element.setAttribute('data-tab-probe', String(index)));
  elements[0]?.focus();
  return elements.map((element, index) => {
    const label =
      element.getAttribute('aria-label') ||
      element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) ||
      element.getAttribute('title') ||
      element.tagName;
    const fieldset = element.closest('fieldset');
    return {
      index,
      tag: element.tagName,
      cls: String(element.className).slice(0, 40),
      label,
      disabledAncestor: fieldset ? fieldset.disabled : null,
      inPanel: !!element.closest('.right-panel'),
    };
  });
}, selector);
console.log(info.map((item) => `${item.index}: <${item.tag} class="${item.cls}"> ${item.label} fieldsetDisabled=${item.disabledAncestor} right=${item.inPanel}`).join('\n'));

const seen = new Set();
const order = [];
for (let i = 0; i < info.length * 2 + 6; i += 1) {
  const probe = await page.evaluate(() => {
    const active = document.activeElement;
    const value = active?.getAttribute('data-tab-probe');
    return {
      probe: value == null ? null : Number(value),
      tag: active?.tagName,
      label: (active?.getAttribute('aria-label') || active?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
    };
  });
  if (probe.probe != null) seen.add(probe.probe);
  order.push(`${i}:${probe.probe ?? '-'}:${probe.tag}:${probe.label}`);
  await page.keyboard.press('Tab');
}
console.log('\nmissed', info.filter((item) => !seen.has(item.index)));
console.log('\ncycle:\n' + order.join('\n'));
await browser.close();