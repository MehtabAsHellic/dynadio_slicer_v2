import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { dismissToasts, loadSample, openApp, openInspector, slice, type Theme } from './helpers';

const SIZES = [
  { width: 1180, height: 700, tag: '1180x700' },
  { width: 1920, height: 1080, tag: '1920x1080' },
];
const THEMES: Theme[] = ['light', 'dark'];
const OUT = path.resolve(process.cwd(), '..', 'artifacts', 'screenshots');

test.describe('interface evidence', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240_000);

  for (const size of SIZES) {
    for (const theme of THEMES) {
      test(`captures ${theme} ${size.tag}`, async ({ page }) => {
        fs.mkdirSync(OUT, { recursive: true });
        await page.setViewportSize({ width: size.width, height: size.height });
        await openApp(page, theme);
        await page.waitForTimeout(350);

        const shot = async (name: string) => {
          await page.screenshot({ path: path.join(OUT, `${name}-${theme}-${size.tag}.png`) });
        };

        await shot('empty');
        await loadSample(page, 'Jet');
        await dismissToasts(page);
        await shot('prepare');
        await page.getByRole('button', { name: 'Show the bed grid' }).focus();
        await shot('prepare-focus');

        await slice(page);
        await shot('preview');

        for (const tab of ['strokes', 'quality', 'pump', 'gcode']) {
          await openInspector(page, tab);
          await shot(`inspector-${tab}`);
        }

        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: /^Export G-code/i }).first().click();
        await page.waitForSelector('.modal');
        await page.waitForTimeout(200);
        await shot('export');
      });
    }
  }
});