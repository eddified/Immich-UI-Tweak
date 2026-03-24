import type { Page } from '@playwright/test';
import {
  applyDemoExtensionSettings,
  demoOrigin,
  loginDemoImmich,
} from '../../scripts/demo-e2e-preset.js';
import { expect, test } from './fixtures';

const DEMO = demoOrigin();
const PARTNERS = `${DEMO}/partners/743f389e-ee80-4682-8d56-2cd45f692c40`;
const PHOTO = `${DEMO}/photos/6418c37d-35b0-4011-882d-36946bc00eb7`;

const EXPECTED_MAPPED_PATH =
  '/var/test/6bbe2767-7851-461a-aa2d-afbd3460aa85/19/eb/19eb57f1-adf2-4f40-abbd-10412d55a70f.jpg';

/**
 * Partner / virtual timeline: scroll until the first Jan 22 thumbnail is mounted.
 * Immich puts `data-asset` and `role="link"` on the same node; accessible name comes from image/alt text.
 */
async function scrollToFirstJan22Thumbnail(page: Page) {
  const grid = page.locator('#asset-grid');
  const thumb = page.getByRole('link', { name: /Image taken on January 22/i }).first();
  for (let i = 0; i < 100; i++) {
    if (await thumb.isVisible().catch(() => false)) {
      return thumb;
    }
    await grid.evaluate((el) => {
      el.scrollTop += 500;
    });
    await page.waitForTimeout(40);
  }
  return thumb;
}

async function saveExtensionOptions(page: import('@playwright/test').Page, extensionId: string) {
  await applyDemoExtensionSettings(page, extensionId);
  await page.close();
}

/** Immich persists detail open/closed (`asset-viewer-state`); `i` toggles — ensure open for assertions. */
async function ensureAssetViewerDetailPanelOpen(page: Page) {
  const panel = page.locator('#detail-panel');
  for (let i = 0; i < 3; i++) {
    if (await panel.isVisible().catch(() => false)) return;
    await page.keyboard.press('i');
    await page.waitForTimeout(150);
  }
}

/** Same toggle as content.ts SHOW_FILE_LOCATION_LABELS (Immich i18n). */
function showFileLocationButton(page: Page) {
  return page.getByRole('button', {
    name: /show file location|dateipfad anzeigen|afficher le chemin du fichier|mostrar ubicación del archivo|ファイルの場所を表示/i,
  });
}

test.describe('Immich demo (extension loaded)', () => {
  test('partner timeline: uploader overlay on Jan 22 first thumbnail', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await saveExtensionOptions(page, extensionId);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    await appPage.goto(PARTNERS, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('[data-asset]').first().waitFor({ state: 'visible', timeout: 30_000 });

    const thumb = await scrollToFirstJan22Thumbnail(appPage);
    await expect(thumb).toBeVisible({ timeout: 12_000 });
    await expect(thumb).toHaveAttribute('data-asset', /[0-9a-f-]{8}-/i);

    const overlay = thumb.locator('[data-immich-ui-helper-uploader]');
    await expect(overlay).toBeVisible();
    // Partner Mich has no profile photo on demo — extension shows letter avatar like Immich UserAvatar.
    const letter = overlay.locator('[data-immich-ui-helper-avatar-letter]');
    await expect(letter).toHaveText('M', { timeout: 15_000 });

    const thumbBox = await thumb.boundingBox();
    const overlayBox = await overlay.boundingBox();
    expect(thumbBox).toBeTruthy();
    expect(overlayBox).toBeTruthy();
    if (thumbBox && overlayBox) {
      expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(thumbBox.x + thumbBox.width + 2);
      expect(overlayBox.y).toBeGreaterThanOrEqual(thumbBox.y - 2);
    }
  });

  test('photo view: mapped file path visible in info panel', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await saveExtensionOptions(page, extensionId);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    await appPage.goto(PHOTO, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('[data-testid="asset-viewer-navbar-actions"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    // Own assets: no viewer overlay unless Show Own Profile Icon is on (default off).
    await expect(appPage.locator('.immich-ui-helper-viewer-avatar')).toHaveCount(0, { timeout: 15_000 });

    await ensureAssetViewerDetailPanelOpen(appPage);
    await expect(appPage.locator('#detail-panel')).toBeVisible();

    await expect(appPage.getByText(EXPECTED_MAPPED_PATH)).toBeVisible();
  });

  test('info panel: file path stays hidden after user toggles it off', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await saveExtensionOptions(page, extensionId);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    await appPage.goto(PHOTO, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('[data-testid="asset-viewer-navbar-actions"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });

    await ensureAssetViewerDetailPanelOpen(appPage);
    await expect(appPage.locator('#detail-panel')).toBeVisible();

    const pathText = appPage.getByText(EXPECTED_MAPPED_PATH);
    await expect(pathText).toBeVisible({ timeout: 15_000 });

    await showFileLocationButton(appPage).click();
    await expect(pathText).toBeHidden({ timeout: 3_000 });

    // Regression: extension used to re-click every frame and re-open the path.
    await expect
      .poll(async () => pathText.isVisible(), { timeout: 5_000, intervals: [250, 400, 600, 800, 1_000] })
      .toBe(false);
  });
});
