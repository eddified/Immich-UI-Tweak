/**
 * Launch Firefox with the unpacked add-on loaded (headed), apply the same options + demo login
 * as Playwright e2e (`shared/e2e/demo-e2e-preset.ts`), then open Immich. Stop with Ctrl+C.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from '@playwright/test';
import { withExtension } from 'playwright-webextext';
import { FIREFOX_EXTENSION_ID } from '../tests/e2e/fixtures';

const firefoxRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./configure-playwright-env.mjs').then(({ configurePlaywrightEnv }) => configurePlaywrightEnv());

const { applyDemoExtensionSettings, demoOrigin, loginDemoImmich } = await import(
  '../../shared/e2e/demo-e2e-preset.js'
);

const pathToExtension = path.join(firefoxRoot, 'dist');
const DEMO = demoOrigin();
const landingUrl = process.env.IMMICH_DEV_URL ?? `${DEMO}/photos`;

const firefoxWithExtension = withExtension(firefox, pathToExtension);

const context = await firefoxWithExtension.launchPersistentContext(
  path.join(firefoxRoot, '.firefox-profile-dev'),
  {
    headless: false,
    viewport: { width: 1280, height: 800 },
  },
);

for (const p of [...context.pages()]) {
  await p.close().catch(() => {});
}

const page = await context.newPage();
await applyDemoExtensionSettings(page, FIREFOX_EXTENSION_ID, 'moz-extension');
await loginDemoImmich(page);
await page.goto(landingUrl, { waitUntil: 'domcontentloaded' });

console.log('');
console.log('Immich UI Tweak — Firefox dev browser');
console.log('  Add-on:', pathToExtension);
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
