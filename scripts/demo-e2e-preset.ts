/**
 * Shared demo setup: extension options + Immich login (same behavior as Playwright e2e).
 * Used by `scripts/dev-browser.ts` and `tests/e2e/immich-demo.spec.ts`.
 */
import type { Page } from '@playwright/test';

export function demoOrigin(): string {
  return process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
}

export type DemoPathMapping = { localPath: string; immichPath: string };

export type SiteExtensionSettings = {
  /** e.g. `https://photos.example.com` (trailing slash optional). */
  enabledOrigin: string;
  pathMappings: DemoPathMapping[];
};

export async function applyExtensionSettingsForSite(
  page: Page,
  extensionId: string,
  site: SiteExtensionSettings,
): Promise<void> {
  const origin = site.enabledOrigin.replace(/\/$/, '');
  const rows = site.pathMappings;
  if (rows.length === 0) {
    throw new Error('applyExtensionSettingsForSite: pathMappings must be non-empty');
  }
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#show-partner-icons').setChecked(true);
  await page.locator('#url-list input').first().fill(`${origin}/`);
  const mappingRows = page.locator('#mapping-body tr');
  const addMapping = page.locator('#add-mapping');
  while ((await mappingRows.count()) < rows.length) {
    await addMapping.click();
  }
  for (let i = 0; i < rows.length; i++) {
    const row = mappingRows.nth(i);
    const inputs = row.locator('input');
    await inputs.nth(0).fill(rows[i].localPath);
    await inputs.nth(1).fill(rows[i].immichPath);
  }
  await page.locator('#replace-folders-page-names').setChecked(true);
  await page.locator('#save').click();
  await page.locator('#save-status').filter({ hasText: /Saved/i }).waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  await page.waitForTimeout(300);
}

export async function applyDemoExtensionSettings(
  page: Page,
  extensionId: string,
  pathMapping?: DemoPathMapping,
): Promise<void> {
  const demo = process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
  const localPath = pathMapping?.localPath ?? '/var/test';
  const immichPath = pathMapping?.immichPath ?? '/data/upload';
  await applyExtensionSettingsForSite(page, extensionId, {
    enabledOrigin: demo,
    pathMappings: [{ localPath, immichPath }],
  });
}

export async function loginDemoImmich(
  page: Page,
  creds: { email?: string; password?: string } = {},
): Promise<void> {
  const demo = process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
  const email = creds.email ?? process.env.IMMICH_DEMO_EMAIL ?? 'demo@immich.app';
  const password = creds.password ?? process.env.IMMICH_DEMO_PASSWORD ?? 'demo';
  await page.goto(`${demo}/auth/login?autoLaunch=0`, { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: /login|sign in|anmelden/i }).click();
  await page.waitForURL(
    (url) => /\/photos(\/|$|\?)/.test(url.pathname) || url.pathname === '/',
    { timeout: 20_000 },
  );
}
