import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadSample, openApp, slice } from './helpers';

const ROOT = path.resolve(process.cwd(), '..');
const REFERENCE = path.join(ROOT, 'reference', 'out_default.gcode');
const REFERENCE_MD5 = '9e60ab040ea5956f98df0e24abf7f4fa';

function md5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

function codeLines(buffer: Buffer): string[] {
  return buffer
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(';'));
}

test('exported G-code is byte-identical to the command line and matches the reference toolpath', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const reference = fs.readFileSync(REFERENCE);
  expect(md5(reference), 'the read-only golden file').toBe(REFERENCE_MD5);

  await openApp(page, 'light');
  await loadSample(page, 'Jet');
  await slice(page);

  await page.getByRole('button', { name: /^Export G-code/i }).first().click();
  await page.waitForSelector('.modal');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-save').click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = fs.readFileSync(downloadPath as string);

  expect(download.suggestedFilename()).toBe('jet.gcode');
  expect(exported.length).toBeGreaterThan(100_000);

  // The command line is the other public front end and must produce the exact
  // same bytes as the export sheet for the same model and settings.
  const cli = path.join(
    ROOT,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'dynadio.exe' : 'dynadio',
  );
  const cliOut = testInfo.outputPath('cli-jet.gcode');
  execFileSync(
    cli,
    [
      'slice',
      path.join(ROOT, 'samples', 'jet.stl'),
      cliOut,
      '--quiet',
      '--up-axis',
      'x',
      '--length',
      '9.7',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  const commandLine = fs.readFileSync(cliOut);

  expect(md5(exported), 'export sheet vs command line').toBe(md5(commandLine));
  expect(exported.equals(commandLine)).toBe(true);

  // Every instruction and coordinate matches the read-only reference; only
  // the provenance header differs because the model file has another name.
  expect(codeLines(exported)).toEqual(codeLines(reference));

  // Two slices must be deterministic byte for byte.
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('.footer-progress');
  await page.waitForFunction(() => !document.querySelector('.footer-progress'), null, { timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+E');
  await page.waitForSelector('.modal');
  const [second] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-save').click(),
  ]);
  const secondPath = await second.path();
  expect(secondPath).not.toBeNull();
  expect(md5(fs.readFileSync(secondPath as string))).toBe(md5(exported));
});