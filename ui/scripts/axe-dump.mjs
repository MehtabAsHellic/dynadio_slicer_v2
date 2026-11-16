import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 700 } });
  await context.addInitScript((value) => window.localStorage.setItem('dynadio.theme', value), theme);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
  const violations = results.violations.filter((v) => v.id === 'color-contrast');
  console.log(`\n=== ${theme} empty: ${violations.reduce((n, v) => n + v.nodes.length, 0)} nodes`);
  for (const violation of violations) {
    for (const node of violation.nodes) {
      console.log(node.target.join(' '), '|', node.html.slice(0, 110));
      console.log('   ', node.failureSummary?.split('\n').slice(1, 3).join(' ').trim());
    }
  }
  await context.close();
}
await browser.close();