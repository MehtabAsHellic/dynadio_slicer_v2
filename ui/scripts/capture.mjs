import { chromium } from 'playwright';
import fs from 'node:fs';

const out = '../artifacts/screenshots';
fs.mkdirSync(out, { recursive: true });

const sizes = [
  { width: 1180, height: 700, tag: '1180x700' },
  { width: 1920, height: 1080, tag: '1920x1080' },
];
const themes = ['light', 'dark'];

const browser = await chromium.launch();
const problems = [];

async function dismissToasts(page) {
  const close = page.locator('.toast .icon-btn');
  while ((await close.count()) > 0) {
    await close.first().click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
}

async function loadJet(page) {
  await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.demo-card').first().click();
  await page.waitForFunction(
    () => {
      const chip = document.querySelector('.viewport-chip');
      return !!chip && chip.textContent.includes('mm');
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(700);
  await dismissToasts(page);
  await page.waitForTimeout(200);
}

async function slice(page) {
  await page.getByRole('button', { name: /^Slice/i }).first().click();
  await page.waitForFunction(
    () => document.querySelector('.statusbar')?.textContent?.includes('Points'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(700);
  await dismissToasts(page);
  await page.waitForTimeout(300);
}

for (const size of sizes) {
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await context.addInitScript((value) => {
      window.localStorage.setItem('dynadio.theme', value);
    }, theme);
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.push(`${size.tag} ${theme}: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`${size.tag} ${theme} console: ${msg.text()}`);
    });

    await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/empty-${theme}-${size.tag}.png` });

    await loadJet(page);
    await page.screenshot({ path: `${out}/prepare-${theme}-${size.tag}.png` });

    await slice(page);
    await page.screenshot({ path: `${out}/preview-${theme}-${size.tag}.png` });

    for (const tab of ['strokes', 'quality', 'pump', 'gcode']) {
      await page.locator(`[data-testid="inspector-${tab}"]`).click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${out}/inspector-${tab}-${theme}-${size.tag}.png` });
    }

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Export G-code/i }).first().click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/export-${theme}-${size.tag}.png` });
    await page.keyboard.press('Escape');

    await context.close();
    console.log(`captured ${theme} ${size.tag}`);
  }
}

await browser.close();
console.log('problems:', problems.length ? problems : 'none');