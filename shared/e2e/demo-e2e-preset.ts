/**
 * Shared demo setup: extension options + Immich login (same behavior as Playwright e2e).
 * Used by dev-browser scripts and shared e2e test suites.
 */
import type { Page } from '@playwright/test';
import { extensionOptionsUrl, type ExtensionProtocol } from './extension-url.ts';

export function demoOrigin(): string {
  return process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
}

export type DemoPathMapping = { localPath: string; immichPath: string };

export type SiteExtensionSettings = {
  /** e.g. `https://photos.example.com` (trailing slash optional). */
  enabledOrigin: string;
  pathMappings: DemoPathMapping[];
};

export type ExtensionConfig = {
  enabledOrigin: string;
  pathMappings?: DemoPathMapping[];
  showPartnerIcons?: boolean;
  showOwnProfileIcon?: boolean;
  replaceFoldersPageNames?: boolean;
  googleMapsLinkInInfoPanel?: boolean;
  googleMapsEmbedInsteadOfOsmInInfoPanel?: boolean;
  infoPanelDetailRowFile?: 'open' | 'collapse' | 'hide';
  infoPanelDetailRowCamera?: 'open' | 'collapse' | 'hide';
  infoPanelDetailRowLens?: 'open' | 'collapse' | 'hide';
};

const STORAGE_KEYS = {
  enabledUrls: 'enabledUrls',
  pathMappings: 'pathMappings',
  replaceFoldersPageNames: 'replaceFoldersPageNames',
  showPartnerIcons: 'showPartnerIcons',
  showOwnProfileIcon: 'showOwnProfileIcon',
  autoOpenFileLocation: 'autoOpenFileLocation',
  remapSlashToFocusSearch: 'remapSlashToFocusSearch',
  googleMapsLinkInInfoPanel: 'googleMapsLinkInInfoPanel',
  googleMapsEmbedInsteadOfOsmInInfoPanel: 'googleMapsEmbedInsteadOfOsmInInfoPanel',
  infoPanelDetailRowFile: 'infoPanelDetailRowFile',
  infoPanelDetailRowCamera: 'infoPanelDetailRowCamera',
  infoPanelDetailRowLens: 'infoPanelDetailRowLens',
  infoPanelLargeDescriptionField: 'infoPanelLargeDescriptionField',
} as const;

const E2E_APPLY_SETTINGS = 'immich-ui-tweak:e2e-apply-settings';
const E2E_SETTINGS_APPLIED = 'immich-ui-tweak:e2e-settings-applied';
const E2E_TOKEN = 'immich-ui-tweak-e2e';

function buildSyncPayload(config: ExtensionConfig): Record<string, unknown> {
  const origin = config.enabledOrigin.replace(/\/$/, '');
  const payload: Record<string, unknown> = {
    [STORAGE_KEYS.enabledUrls]: [`${origin}/`],
    [STORAGE_KEYS.pathMappings]: config.pathMappings ?? [],
    [STORAGE_KEYS.replaceFoldersPageNames]: config.replaceFoldersPageNames ?? true,
    [STORAGE_KEYS.showPartnerIcons]: config.showPartnerIcons ?? true,
    [STORAGE_KEYS.showOwnProfileIcon]: config.showOwnProfileIcon ?? false,
    [STORAGE_KEYS.autoOpenFileLocation]: true,
    [STORAGE_KEYS.remapSlashToFocusSearch]: true,
    [STORAGE_KEYS.googleMapsLinkInInfoPanel]: config.googleMapsLinkInInfoPanel ?? true,
    [STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel]:
      config.googleMapsEmbedInsteadOfOsmInInfoPanel ?? false,
    [STORAGE_KEYS.infoPanelDetailRowFile]: config.infoPanelDetailRowFile ?? 'open',
    [STORAGE_KEYS.infoPanelDetailRowCamera]: config.infoPanelDetailRowCamera ?? 'open',
    [STORAGE_KEYS.infoPanelDetailRowLens]: config.infoPanelDetailRowLens ?? 'open',
    [STORAGE_KEYS.infoPanelLargeDescriptionField]: true,
  };
  return payload;
}

/** Playwright Firefox cannot navigate to moz-extension:// pages; seed sync via the content-script bridge. */
async function applySettingsViaContentBridge(page: Page, config: ExtensionConfig): Promise<void> {
  const origin = config.enabledOrigin.replace(/\/$/, '');
  await page.goto(`${origin}/auth/login?autoLaunch=0`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const payload = buildSyncPayload(config);
  await page.evaluate(
    async ({ payload: settings, token, applyType, appliedType }) => {
      window.postMessage({ type: applyType, token, settings }, '*');
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        window.addEventListener(appliedType, done, { once: true });
        setTimeout(done, 5_000);
      });
    },
    {
      payload,
      token: E2E_TOKEN,
      applyType: E2E_APPLY_SETTINGS,
      appliedType: E2E_SETTINGS_APPLIED,
    },
  );
  await page.waitForTimeout(300);
}

async function applySettingsViaOptionsPage(page: Page, extensionId: string, config: ExtensionConfig): Promise<void> {
  await openExtensionOptions(page, extensionId, 'chrome-extension');
  if (config.showPartnerIcons !== undefined) {
    await page.locator('#show-partner-icons').setChecked(config.showPartnerIcons);
  }
  if (config.showOwnProfileIcon !== undefined) {
    await page.locator('#show-own-profile-icon').setChecked(config.showOwnProfileIcon);
  }
  const origin = config.enabledOrigin.replace(/\/$/, '');
  await page.locator('#url-list input').first().fill(`${origin}/`);
  const mappings = config.pathMappings ?? [];
  const mappingRows = page.locator('#mapping-body tr');
  const addMapping = page.locator('#add-mapping');
  while ((await mappingRows.count()) < mappings.length) {
    await addMapping.click();
  }
  for (let i = 0; i < mappings.length; i++) {
    const row = mappingRows.nth(i);
    const inputs = row.locator('input');
    await inputs.nth(0).fill(mappings[i].localPath);
    await inputs.nth(1).fill(mappings[i].immichPath);
  }
  if (config.replaceFoldersPageNames !== undefined) {
    await page.locator('#replace-folders-page-names').setChecked(config.replaceFoldersPageNames);
  }
  if (config.googleMapsLinkInInfoPanel !== undefined) {
    await page.locator('#google-maps-link-info-panel').setChecked(config.googleMapsLinkInInfoPanel);
  }
  if (config.googleMapsEmbedInsteadOfOsmInInfoPanel !== undefined) {
    await page
      .locator('#google-maps-embed-instead-of-osm-info-panel')
      .setChecked(config.googleMapsEmbedInsteadOfOsmInInfoPanel);
  }
  if (config.infoPanelDetailRowFile) {
    await page.locator(`input[name="detail-row-file"][value="${config.infoPanelDetailRowFile}"]`).check();
  }
  if (config.infoPanelDetailRowCamera) {
    await page.locator(`input[name="detail-row-camera"][value="${config.infoPanelDetailRowCamera}"]`).check();
  }
  if (config.infoPanelDetailRowLens) {
    await page.locator(`input[name="detail-row-lens"][value="${config.infoPanelDetailRowLens}"]`).check();
  }
  await page.locator('#save').click();
  await page.locator('#save-status').filter({ hasText: /Saved/i }).waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  await page.waitForTimeout(300);
}

export async function applyExtensionConfig(
  page: Page,
  extensionId: string,
  protocol: ExtensionProtocol,
  config: ExtensionConfig,
): Promise<void> {
  if (protocol === 'moz-extension') {
    await applySettingsViaContentBridge(page, config);
    return;
  }
  await applySettingsViaOptionsPage(page, extensionId, config);
}

export async function openExtensionOptions(
  page: Page,
  extensionId: string,
  protocol: ExtensionProtocol,
): Promise<void> {
  if (protocol === 'moz-extension') {
    await page.goto(`${demoOrigin()}/auth/login?autoLaunch=0`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    return;
  }
  const url = extensionOptionsUrl(protocol, extensionId);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes(`another navigation to "${url}"`)) {
      throw e;
    }
    await page.waitForLoadState('domcontentloaded');
  }
  await page.locator('#save').waitFor({ state: 'visible', timeout: 5_000 });
}

export async function applyExtensionSettingsForSite(
  page: Page,
  extensionId: string,
  site: SiteExtensionSettings,
  protocol: ExtensionProtocol,
): Promise<void> {
  const rows = site.pathMappings;
  if (rows.length === 0) {
    throw new Error('applyExtensionSettingsForSite: pathMappings must be non-empty');
  }
  await applyExtensionConfig(page, extensionId, protocol, {
    enabledOrigin: site.enabledOrigin,
    pathMappings: rows,
    showPartnerIcons: true,
    replaceFoldersPageNames: true,
  });
}

export async function applyDemoExtensionSettings(
  page: Page,
  extensionId: string,
  protocol: ExtensionProtocol,
  pathMapping?: DemoPathMapping,
): Promise<void> {
  const demo = process.env.IMMICH_DEMO_ORIGIN ?? 'https://demo.immich.app';
  const localPath = pathMapping?.localPath ?? '/var/test';
  const immichPath = pathMapping?.immichPath ?? '/data/upload';
  await applyExtensionSettingsForSite(
    page,
    extensionId,
    {
      enabledOrigin: demo,
      pathMappings: [{ localPath, immichPath }],
    },
    protocol,
  );
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
