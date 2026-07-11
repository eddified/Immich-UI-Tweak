import type { Expect, TestType } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyExtensionConfig } from './demo-e2e-preset.ts';
import { type ExtensionProtocol } from './extension-url.ts';

type ExtensionTestFixtures = {
  context: import('@playwright/test').BrowserContext;
  extensionId: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load repo `.env` so MY_IMMICH_URL / MY_USERNAME / MY_PASSWORD work without manual export. */
function loadRepoDotEnv(): void {
  const envPath = resolve(__dirname, '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadRepoDotEnv();

const ORIGIN = (process.env.MY_IMMICH_URL ?? '').replace(/\/$/, '');
const EMAIL = process.env.MY_USERNAME ?? '';
const PASSWORD = process.env.MY_PASSWORD ?? '';
const PARTNER_PHOTO_PATH = '/photos/9d6467cb-c049-4d26-ba69-21bcd4f58bb3';

async function applyExtensionForOrigin(
  page: import('@playwright/test').Page,
  extensionId: string,
  protocol: ExtensionProtocol,
) {
  await applyExtensionConfig(page, extensionId, protocol, {
    enabledOrigin: ORIGIN,
    showPartnerIcons: true,
  });
}

async function loginImmich(page: import('@playwright/test').Page) {
  await page.goto(`${ORIGIN}/auth/login?autoLaunch=0`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 15_000 });
  const passwordVisible = await page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (!passwordVisible) {
    return 'no-password-field';
  }
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(
    (url) => /\/photos(\/|$|\?)/.test(url.pathname) || url.pathname === '/',
    { timeout: 30_000 },
  );
  return 'ok';
}

async function ensureAssetViewerDetailPanelOpen(page: import('@playwright/test').Page) {
  const panel = page.locator('#detail-panel');
  for (let i = 0; i < 5; i++) {
    if (await panel.isVisible().catch(() => false)) return;
    await page.keyboard.press('i');
    await page.waitForTimeout(200);
  }
}

export function registerImmichUserInstancePartnerPathTests(
  test: TestType<ExtensionTestFixtures, object>,
  expect: Expect,
  protocol: ExtensionProtocol,
): void {
  test.describe('User Immich instance (extension + partner path)', () => {
  /**
   * Placeholder: keeps `.env` login + SSO skip behavior for future partner-path tests here.
   * Partner cold-load coverage lives in `immich-demo.spec.ts` (`cold load: partner photo shows injected file path row`).
   */
  test('placeholder: reaches Immich after password login (or skips on SSO)', async ({ context, extensionId }) => {
    test.skip(!ORIGIN || !EMAIL || !PASSWORD, 'Set MY_IMMICH_URL, MY_USERNAME, MY_PASSWORD in .env');

    const opt = await context.newPage();
    await applyExtensionForOrigin(opt, extensionId, protocol);
    await opt.close();

    const app = await context.newPage();
    const loginResult = await loginImmich(app);
    if (loginResult === 'no-password-field') {
      test.skip(
        true,
        'Immich login uses Cloudflare Access / SSO (no password field). After you log in manually in Chrome with this extension, cold-open a partner photo and confirm [data-immich-ui-tweak-injected-path] appears in #detail-panel.',
      );
    }

    const path = new URL(app.url()).pathname;
    expect(path === '/' || /^\/photos(\/|$)/.test(path)).toBe(true);
  });
  });
}
