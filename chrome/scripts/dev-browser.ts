/**
 * Launch Chromium with the unpacked extension loaded (headed), apply the same options + demo login
 * as Playwright e2e (`scripts/demo-e2e-preset.ts`), then open Immich. Stop with Ctrl+C.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';

const chromeRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./configure-playwright-env.mjs').then(({ configurePlaywrightEnv }) => configurePlaywrightEnv());

const { chromium } = await import('@playwright/test');
const { applyDemoExtensionSettings, demoOrigin, loginDemoImmich } = await import(
  '../../shared/e2e/demo-e2e-preset.js'
);

const pathToExtension = path.join(chromeRoot, 'dist');
const DEMO = demoOrigin();
const landingUrl = process.env.IMMICH_DEV_URL ?? `${DEMO}/photos`;

async function getExtensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
  }
  return worker.url().split('/')[2];
}

const context = await chromium.launchPersistentContext(path.join(chromeRoot, '.chrome-profile-dev'), {
  channel: 'chromium',
  headless: false,
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ],
  viewport: { width: 1280, height: 800 },
});

for (const p of [...context.pages()]) {
  await p.close().catch(() => {});
}

const extensionId = await getExtensionId(context);
const page = await context.newPage();
await applyDemoExtensionSettings(page, extensionId, 'chrome-extension');
await loginDemoImmich(page);
await page.goto(landingUrl, { waitUntil: 'domcontentloaded' });

console.log('');
console.log('Immich UI Tweak — dev browser');
console.log('  Extension:', pathToExtension);
console.log('  Options: same as Playwright e2e (/var/test ↔ /data/upload, enabled URL demo/)');
console.log('  Logged in:', DEMO);
console.log('  Opened:', landingUrl);
console.log('  Press Ctrl+C here to quit (browser will close).');
console.log('');

const shutdown = async () => {
  try {
    await context.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

context.on('close', () => process.exit(0));

await new Promise(() => {
  /* hold until SIGINT/SIGTERM or context close */
});
