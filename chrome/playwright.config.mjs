import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurePlaywrightEnv } from './scripts/configure-playwright-env.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

configurePlaywrightEnv();

export default defineConfig({
  testDir: path.join(dir, 'tests', 'e2e'),
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium-extension', testMatch: /.*\.spec\.ts/ }],
});
