import type { Page } from '@playwright/test';
import {
  applyDemoExtensionSettings,
  applyExtensionSettingsForSite,
  type DemoPathMapping,
  demoOrigin,
  loginDemoImmich,
} from '../../scripts/demo-e2e-preset.js';
import { expect, test } from './fixtures';

const DEMO = demoOrigin();
const PARTNERS = `${DEMO}/partners/743f389e-ee80-4682-8d56-2cd45f692c40`;
const PHOTO = `${DEMO}/photos/6418c37d-35b0-4011-882d-36946bc00eb7`;
/** Partner Mich asset for cold `/photos/:id` (owner ≠ logged-in demo user); id from partner timeline API. */
const PARTNER_PHOTO_COLD = `${DEMO}/photos/41908224-87c9-4588-bde1-b89c77f122fd`;
/** Demo asset to open before exercising viewer “next” (order of neighbors is not asserted). */
const PHOTO_ARROW_A = `${DEMO}/photos/2c5bb067-8541-407d-8d31-2f9ce6f30e2c`;

const EXPECTED_MAPPED_PATH =
  '/var/test/6bbe2767-7851-461a-aa2d-afbd3460aa85/19/eb/19eb57f1-adf2-4f40-abbd-10412d55a70f.jpg';

/** Demo folders deep path (library + nested segments). */
const FOLDERS_DEEP_SERVER_PATH =
  '/data/upload/6bbe2767-7851-461a-aa2d-afbd3460aa85/00/00';

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

async function saveExtensionOptions(
  page: import('@playwright/test').Page,
  extensionId: string,
  pathMapping?: DemoPathMapping,
) {
  await applyDemoExtensionSettings(page, extensionId, pathMapping);
  await page.close();
}

/** Multi-row mappings + explicit origin (demo URLs; no `.env` credentials). */
async function saveExtensionOptionsForSite(
  page: import('@playwright/test').Page,
  extensionId: string,
  pathMappings: DemoPathMapping[],
) {
  await applyExtensionSettingsForSite(page, extensionId, {
    enabledOrigin: DEMO,
    pathMappings,
  });
  await page.close();
}

/** Immich persists detail open/closed (`asset-viewer-state`); `i` toggles — ensure open for assertions. */
async function ensureAssetViewerDetailPanelOpen(page: Page) {
  const panel = page.locator('#detail-panel');
  for (let i = 0; i < 8; i++) {
    if (await panel.isVisible().catch(() => false)) return;
    await page.keyboard.press('i');
    await page.waitForTimeout(250);
  }
}

/** Same toggle as content.ts SHOW_FILE_LOCATION_LABELS (Immich i18n). */
function showFileLocationButton(page: Page) {
  return page.getByRole('button', {
    name: /show file location|dateipfad anzeigen|afficher le chemin du fichier|mostrar ubicación del archivo|ファイルの場所を表示/i,
  });
}

/** `href` must still carry Immich server paths in `path=` (never mapped local roots). */
function expectFoldersHrefUsesServerPath(href: string | null, baseOrigin: string): void {
  expect(href).toBeTruthy();
  const u = new URL(href!, baseOrigin);
  const p = u.searchParams.get('path');
  expect(p).toBeTruthy();
  expect(p!.startsWith('/data')).toBe(true);
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

    const overlay = thumb.locator('[data-immich-ui-tweak-uploader]');
    await expect(overlay).toBeVisible();
    // Partner Mich has no profile photo on demo — extension shows letter avatar like Immich UserAvatar.
    const letter = overlay.locator('[data-immich-ui-tweak-avatar-letter]');
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

  test('cold load: partner photo shows injected file path row', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await saveExtensionOptions(page, extensionId);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    await appPage.goto(PARTNER_PHOTO_COLD, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await appPage.locator('[data-testid="asset-viewer-navbar-actions"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await ensureAssetViewerDetailPanelOpen(appPage);
    await expect(appPage.locator('#detail-panel')).toBeVisible({ timeout: 10_000 });

    const injected = appPage.locator('[data-immich-ui-tweak-injected-path]');
    await expect(injected).toBeVisible({ timeout: 25_000 });
    const link = injected.locator('a[href*="/folders"]');
    await expect(link).toBeVisible();
    const text = await link.textContent();
    expect(text?.trim().length).toBeGreaterThan(3);
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
    await expect(appPage.locator('.immich-ui-tweak-viewer-avatar')).toHaveCount(0, { timeout: 15_000 });

    await ensureAssetViewerDetailPanelOpen(appPage);
    await expect(appPage.locator('#detail-panel')).toBeVisible();

    await expect(appPage.getByText(EXPECTED_MAPPED_PATH)).toBeVisible();
  });

  test('photo view: mapped path updates on next photo (local roots without leading slash)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    // Regression: `A` / `B` (not `/A`) — mapped text has no leading slash; extension must keep finding the folder link.
    await saveExtensionOptionsForSite(page, extensionId, [
      { localPath: 'A', immichPath: '/data/upload/library' },
      { localPath: 'B', immichPath: '/data/upload' },
    ]);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    await appPage.goto(PHOTO_ARROW_A, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('[data-testid="asset-viewer-navbar-actions"]').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await ensureAssetViewerDetailPanelOpen(appPage);
    await expect(appPage.locator('#detail-panel')).toBeVisible();

    const pathLink = appPage.locator('#detail-panel a[href*="/folders"]').first();
    await expect(pathLink).toBeVisible({ timeout: 15_000 });
    await expect(pathLink).toHaveText(/^(A|B)\/.+/, { timeout: 20_000 });
    const pathBefore = (await pathLink.textContent())?.trim() ?? '';

    const nextBtn = appPage.locator('#immich-asset-viewer .col-start-4 button[type="button"]').first();
    await expect(nextBtn).toBeVisible({ timeout: 10_000 });
    const photoPathBeforeNext = new URL(appPage.url()).pathname.toLowerCase();
    await nextBtn.click();
    await appPage.waitForURL(
      (u) => u.pathname.toLowerCase() !== photoPathBeforeNext,
      { timeout: 15_000 },
    );

    await expect
      .poll(async () => (await pathLink.textContent())?.trim() ?? '', {
        timeout: 15_000,
        intervals: [100, 200, 400, 600, 800],
      })
      .not.toBe(pathBefore);
    await expect(pathLink).toHaveText(/^(A|B)\/.+/);
  });

  /** Smoke: extension relabels visible text only; `path=` must stay the Immich server path. Uses `demoOrigin()` / default demo credentials — not `MY_IMMICH_*` from `.env`. */
  test('folders page: breadcrumb or tree link href keeps server path in query', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await saveExtensionOptions(page, extensionId);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    const folderUrl = `${DEMO}/folders?path=${encodeURIComponent('/data/upload')}`;
    await appPage.goto(folderUrl, { waitUntil: 'load', timeout: 30_000 });

    await appPage.locator('main nav.flex.items-center.py-2').waitFor({ state: 'visible', timeout: 30_000 });

    const breadcrumbLinks = appPage.locator(
      'main nav.flex.items-center.py-2 ol.flex a[href*="/folders"][href*="path="]',
    );
    const treeLinks = appPage.locator('#sidebar ul.list-none.ms-2 a[href*="/folders"][href*="path="]');

    const link =
      (await breadcrumbLinks.count()) > 0 ? breadcrumbLinks.first() : treeLinks.first();
    await expect(link).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => link.getAttribute('href'), { timeout: 10_000 })
      .toBeTruthy();

    expectFoldersHrefUsesServerPath(await link.getAttribute('href'), DEMO);
  });

  test('folders page: current crumb shows /z when /data/upload maps to /z', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await saveExtensionOptionsForSite(page, extensionId, [
      { localPath: '/z', immichPath: '/data/upload' },
    ]);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    const folderUrl = `${DEMO}/folders?path=${encodeURIComponent('/data/upload')}`;
    await appPage.goto(folderUrl, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('main nav.flex.items-center.py-2').waitFor({ state: 'visible', timeout: 30_000 });

    expect(new URL(appPage.url()).searchParams.get('path'), `got ${appPage.url()}`).toBe('/data/upload');

    const currentCrumb = appPage.locator(
      'main nav.flex.items-center.py-2 ol.flex li p.cursor-default.whitespace-pre-wrap',
    );
    await expect(currentCrumb).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => (await currentCrumb.textContent())?.trim() ?? '', {
        timeout: 20_000,
        intervals: [100, 200, 400, 600, 800],
      })
      .toBe('/z');
  });

  test('folders deep path: breadcrumb and sidebar show /z for /data/upload segment', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await saveExtensionOptionsForSite(page, extensionId, [
      { localPath: '/z', immichPath: '/data/upload' },
    ]);

    const appPage = await context.newPage();
    await loginDemoImmich(appPage);

    const folderUrl = `${DEMO}/folders?path=${encodeURIComponent(FOLDERS_DEEP_SERVER_PATH)}`;
    await appPage.goto(folderUrl, { waitUntil: 'load', timeout: 30_000 });
    await appPage.locator('main nav.flex.items-center.py-2').waitFor({ state: 'visible', timeout: 30_000 });

    expect(new URL(appPage.url()).searchParams.get('path')).toBe(FOLDERS_DEEP_SERVER_PATH);

    /** Immich collapses `/data/upload` with the next segment — no `path=/data/upload` crumb. */
    const immichLibraryRoot = '/data/upload';

    const breadcrumbAnchors = appPage.locator(
      'main nav.flex.items-center.py-2 ol.flex a[href*="/folders"][href*="path="]',
    );
    const currentCrumb = appPage.locator(
      'main nav.flex.items-center.py-2 ol.flex li p.cursor-default.whitespace-pre-wrap',
    );

    const nbc = await breadcrumbAnchors.count();
    let shallowBreadcrumbPath: string | null = null;
    for (let i = 0; i < nbc; i++) {
      const h = await breadcrumbAnchors.nth(i).getAttribute('href');
      if (!h) continue;
      const p = new URL(h, DEMO).searchParams.get('path');
      if (!p || !(p === immichLibraryRoot || p.startsWith(`${immichLibraryRoot}/`))) continue;
      if (shallowBreadcrumbPath === null || p.length < shallowBreadcrumbPath.length) {
        shallowBreadcrumbPath = p;
      }
    }
    expect(shallowBreadcrumbPath).not.toBeNull();

    await expect
      .poll(async () => {
        for (let i = 0; i < nbc; i++) {
          const h = await breadcrumbAnchors.nth(i).getAttribute('href');
          if (!h) continue;
          const p = new URL(h, DEMO).searchParams.get('path');
          if (p === shallowBreadcrumbPath) return (await breadcrumbAnchors.nth(i).textContent())?.trim() ?? '';
        }
        return '';
      }, { timeout: 25_000, intervals: [100, 200, 400, 600, 800] })
      .toMatch(/^\/z(\/|$)/);

    await expect
      .poll(async () => (await currentCrumb.textContent())?.trim() ?? '', {
        timeout: 20_000,
        intervals: [100, 200, 400, 600, 800],
      })
      .toBe('00');

    const treeAnchors = appPage.locator('#sidebar ul.list-none.ms-2 a[href*="/folders"][href*="path="]');
    const ntr = await treeAnchors.count();
    let shallowTreePath: string | null = null;
    for (let i = 0; i < ntr; i++) {
      const h = await treeAnchors.nth(i).getAttribute('href');
      if (!h) continue;
      const p = new URL(h, DEMO).searchParams.get('path');
      if (!p || !(p === immichLibraryRoot || p.startsWith(`${immichLibraryRoot}/`))) continue;
      if (shallowTreePath === null || p.length < shallowTreePath.length) {
        shallowTreePath = p;
      }
    }
    expect(shallowTreePath).not.toBeNull();

    await expect
      .poll(async () => {
        for (let i = 0; i < ntr; i++) {
          const h = await treeAnchors.nth(i).getAttribute('href');
          if (!h) continue;
          const p = new URL(h, DEMO).searchParams.get('path');
          if (p === shallowTreePath) {
            const span = treeAnchors.nth(i).locator('span.font-mono.whitespace-pre-wrap');
            return (await span.textContent())?.trim() ?? '';
          }
        }
        return '';
      }, { timeout: 25_000, intervals: [100, 200, 400, 600, 800] })
      .toMatch(/^\/z(\/|$)/);
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
