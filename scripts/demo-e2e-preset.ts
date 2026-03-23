/**
 * Shared demo setup: extension options + Immich login (same behavior as Playwright e2e).
 * Used by `scripts/dev-browser.ts` and `tests/e2e/immich-demo.spec.ts`.
 */
import type { Page } from '@playwright/test';

export function demoOrigin(): string {
  return process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
}

export async function applyDemoExtensionSettings(page: Page, extensionId: string): Promise<void> {
  const demo = process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // Match Playwright fresh profile + DEFAULT_SETTINGS.showPartnerIcons (persistent dev profiles may differ).
  await page.locator('#show-partner-icons').setChecked(true);
  await page.locator('#url-list input').first().fill(`${demo}/`);
  const rows = page.locator('#mapping-body tr');
  if ((await rows.count()) === 0) {
    await page.locator('#add-mapping').click();
  }
  const firstRow = page.locator('#mapping-body tr').first();
  const inputs = firstRow.locator('input');
  await inputs.nth(0).fill('/var/test');
  await inputs.nth(1).fill('/data/upload');
  await page.locator('#save').click();
  await page.locator('#save-status').filter({ hasText: /Saved/i }).waitFor({
    state: 'visible',
    timeout: 5_000,
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
