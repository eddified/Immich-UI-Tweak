import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chromeRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pathToExtension = path.join(chromeRoot, 'dist');

/** Visible browser: `HEADED=1 npx playwright test` or `npm run test:e2e:headed` */
function extensionTestsHeadless(): boolean {
  const v = process.env.HEADED;
  if (v === '1' || v === 'true') return false;
  return true;
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: extensionTestsHeadless(),
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
      viewport: { width: 1280, height: 800 },
    });
    for (const p of context.pages()) {
      await p.close();
    }
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    const extensionId = worker.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
