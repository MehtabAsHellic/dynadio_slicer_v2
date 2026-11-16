import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  assertNoClippedText,
  assertTabReachable,
  dismissToasts,
  loadSample,
  openApp,
  openInspector,
  slice,
  type Theme,
} from './helpers';

async function expectNoContrastViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
  const violations = results.violations.filter((violation) => violation.id === 'color-contrast');
  const detail = violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      state: label,
      target: node.target.join(' '),
      html: node.html,
      summary: node.failureSummary,
    })),
  );
  expect(detail, JSON.stringify(detail, null, 2)).toEqual([]);
}

const THEMES: Theme[] = ['light', 'dark'];

for (const theme of THEMES) {
  test.describe(`accessibility (${theme})`, () => {
    test.setTimeout(300_000);

    test('empty, prepare, preview, inspector and export pass contrast and clipping', async ({ page }) => {
      await openApp(page, theme);

      await assertNoClippedText(page);
      await expectNoContrastViolations(page, 'empty');
      expect(await assertTabReachable(page)).toBeGreaterThan(5);

      await loadSample(page, 'Jet');
      await dismissToasts(page);
      await assertNoClippedText(page);
      await expectNoContrastViolations(page, 'prepare');
      expect(await assertTabReachable(page)).toBeGreaterThan(20);

      await slice(page);
      await assertNoClippedText(page);
      await expectNoContrastViolations(page, 'preview');
      expect(await assertTabReachable(page)).toBeGreaterThan(30);

      await openInspector(page, 'strokes');
      await assertNoClippedText(page);
      await expectNoContrastViolations(page, 'inspector-strokes');
      expect(await assertTabReachable(page)).toBeGreaterThan(35);

      for (const tab of ['quality', 'pump', 'gcode']) {
        await page.getByTestId(`inspector-${tab}`).click();
        await page.waitForTimeout(200);
        await expectNoContrastViolations(page, `inspector-${tab}`);
      }

      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Export G-code/i }).first().click();
      await page.waitForSelector('.modal');
      await assertNoClippedText(page);
      await expectNoContrastViolations(page, 'export');
      expect(await assertTabReachable(page)).toBeGreaterThanOrEqual(4);
    });
  });
}

test('every control in the shortcuts sheet is reachable with Tab', async ({ page }) => {
  await openApp(page, 'light');
  await page.keyboard.press('?');
  await page.waitForSelector('.modal');
  await assertNoClippedText(page);
  expect(await assertTabReachable(page)).toBeGreaterThan(1);
});