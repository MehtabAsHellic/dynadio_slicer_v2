import { defineConfig } from '@playwright/test';

const baseURL = process.env.DYNADIO_URL || 'http://127.0.0.1:8765';
const serverCommand =
  process.platform === 'win32'
    ? '..\\.venv\\Scripts\\dynadio-api.exe --port 8765'
    : '../.venv/bin/dynadio-api --port 8765';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../artifacts/playwright-report' }]],
  use: {
    baseURL,
    viewport: { width: 1180, height: 700 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.DYNADIO_NO_SERVER
    ? undefined
    : {
        command: serverCommand,
        url: `${baseURL}/api/health`,
        cwd: '..',
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});