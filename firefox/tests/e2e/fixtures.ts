import { test as base, firefox, type Browser, type BrowserContext } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const firefoxRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pathToExtension = path.join(firefoxRoot, 'dist');

/** Fixed add-on id from `src/manifest.json` → `browser_specific_settings.gecko.id`. */
export const FIREFOX_EXTENSION_ID = 'immich-ui-tweak@local';

const firefoxWithExtension = withExtension(firefox, pathToExtension);

/** Visible browser: `HEADED=1 npx playwright test` or `npm run test:e2e:headed` */
function extensionTestsHeadless(): boolean {
  const v = process.env.HEADED;
  if (v === '1' || v === 'true') return false;
  return true;
}

export const test = base.extend<{
  browserWithExtension: Browser;
  context: BrowserContext;
  extensionId: string;
}>({
  browserWithExtension: async ({}, use) => {
    const browser = await firefoxWithExtension.launch({
      headless: extensionTestsHeadless(),
    });
    const engine = browser.browserType().name();
    if (engine !== 'firefox') {
      throw new Error(`Expected Playwright Firefox, got "${engine}" (${browser.version()})`);
    }
    // Allow temporary add-on install + background content-script registration.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await use(browser);
    await browser.close();
  },
  context: async ({ browserWithExtension }, use) => {
    const context = await browserWithExtension.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({}, use) => {
    await use(FIREFOX_EXTENSION_ID);
  },
});

export const expect = test.expect;
