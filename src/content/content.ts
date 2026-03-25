import {
  type ImmichUserPublic,
  AVATAR_COLOR_BG,
  appendSharedLinkSearchParams,
  avatarInitialLetter,
  parseCurrentUserIdFromMeJson,
  parseUserIdFromProfileImageUrl,
  parseUserJson,
  userDetailAbsoluteUrl,
} from '../shared/immich-user';
import { profileImageAbsoluteUrl, resolveImmichUsersApiBase } from '../shared/profile-image';
import {
  folderPageHref,
  parseOriginalPathFromAssetJson,
  parseOwnerIdFromAssetJson,
} from '../shared/asset-original-path';
import {
  applyPathMappings,
  filterCompleteMappings,
  folderLinkTextLooksLikePathDisplay,
  sortMappingsForReplace,
} from '../shared/path-mapping';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type ExtensionSettings,
  type PathMappingRow,
} from '../shared/storage-types';
import { isUrlEnabled } from '../shared/url-match';
import { applyFoldersPathRelabel } from './folders-path-relabel';

const MSG_SOURCE = 'immich-ui-helper';
const MSG_TYPE = 'ownerPairs';
const MSG_CURRENT_USER = 'currentUser';
const MSG_ASSET_DETAIL = 'assetDetail';
const MSG_USER_DETAIL = 'userDetail';

type AssetApiDetail = { ownerId: string | null; originalPath: string | null };
/** Latest GET /api/assets/:id body fields from the page's own fetch (main world). */
const assetApiDetailById = new Map<string, AssetApiDetail>();

const SHOW_FILE_LOCATION_LABELS = [
  'Show file location',
  'Dateipfad anzeigen',
  'Afficher le chemin du fichier',
  'Mostrar ubicación del archivo',
  'ファイルの場所を表示',
];

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
/** False until `chrome.storage.sync` returns — avoids treating default `enabledUrls` as real and wiping state. */
let settingsHydrated = false;
/** Detail panel file path: avoid re-clicking "show file location" after the user hides the path (runs every rAF). */
let detailPanelMounted = false;
let fileLocationAssetKey = '';
let sawPathLinkThisAsset = false;
let didAutoClickShowLocation = false;
/**
 * User hid the path while the viewer stayed open — keep it hidden on prev/next, like Immich `showAssetPath` persisting
 * across assets (reset when the info panel is closed/remounted or the path is shown again).
 */
let userDismissedPathThisAsset = false;

const ownerByAsset = new Map<string, string>();
/** Logged-in user id from navbar profile-image URL and/or Immich's GET /api/users/me (observed via injected fetch). */
let sessionUserId: string | undefined = undefined;
const userByOwnerId = new Map<string, ImmichUserPublic>();
const userFetchInflight = new Map<string, Promise<ImmichUserPublic | null>>();
/** Avoid duplicate GET /api/assets/:id while injecting partner file path. */
const partnerPathInflight = new Map<string, Promise<void>>();
/** Fill `assetApiDetailById` when the URL already changed but the fetch hook has not posted yet. */
const assetDetailFetchInflight = new Map<string, Promise<void>>();
/** Asset ids where GET /api/assets confirmed the current user is the owner — skip inject (use Immich toggle). */
const pathInjectionUseNativeOnly = new Set<string>();
/** Partner `originalPath` waiting for `#detail-panel` filename row to exist (cold loads). */
const pendingPartnerPathByAssetId = new Map<string, string>();
/** Dedupe concurrent GET /api/users/me when navbar/`sessionUserId` is not ready yet (cold photo loads). */
let resolveMeUserIdInflight: Promise<string | null> | null = null;
let injectRequested = false;
let rafScheduled = false;
/** Invalidate in-flight partner badge work when the same overlay is rescheduled (MutationObserver churn). */
const badgeRenderGenByContainer = new WeakMap<HTMLElement, number>();

function readSettingsFromStorage(cb: (s: ExtensionSettings) => void): void {
  chrome.storage.sync.get(
    [
      STORAGE_KEYS.enabledUrls,
      STORAGE_KEYS.pathMappings,
      STORAGE_KEYS.showPartnerIcons,
      STORAGE_KEYS.showOwnProfileIcon,
    ],
    (sync) => {
      const enabledUrls = Array.isArray(sync[STORAGE_KEYS.enabledUrls])
        ? (sync[STORAGE_KEYS.enabledUrls] as string[])
        : DEFAULT_SETTINGS.enabledUrls;
      const pathMappings = Array.isArray(sync[STORAGE_KEYS.pathMappings])
        ? (sync[STORAGE_KEYS.pathMappings] as PathMappingRow[])
        : DEFAULT_SETTINGS.pathMappings;
      const showPartnerIcons =
        typeof sync[STORAGE_KEYS.showPartnerIcons] === 'boolean'
          ? (sync[STORAGE_KEYS.showPartnerIcons] as boolean)
          : DEFAULT_SETTINGS.showPartnerIcons;
      const showOwnProfileIcon =
        typeof sync[STORAGE_KEYS.showOwnProfileIcon] === 'boolean'
          ? (sync[STORAGE_KEYS.showOwnProfileIcon] as boolean)
          : DEFAULT_SETTINGS.showOwnProfileIcon;
      cb({
        enabledUrls: enabledUrls.slice(0, 32),
        pathMappings,
        showPartnerIcons,
        showOwnProfileIcon,
      });
    },
  );
}

function requestMainWorldInject(): void {
  if (injectRequested) return;
  injectRequested = true;
  chrome.runtime.sendMessage({ type: 'immich-ui-helper:inject-main' }, () => {
    void chrome.runtime.lastError;
  });
}

/**
 * Main-world `injected.js` is registered at `document_start` only on allowlisted URLs.
 * This message remains a fallback when `registerContentScripts` cannot use `world: 'MAIN'`.
 */
requestMainWorldInject();

function scheduleDomUpdate(): void {
  if (!settingsHydrated) return;
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    if (!isUrlEnabled(location.href, settings.enabledUrls)) {
      removeExtensionElements();
      return;
    }
    syncSessionUserIdFromNavbar();
    updateThumbnailOverlays();
    updateViewerOverlay();
    expandAndRewriteFilePath();
    applyFoldersPathRelabel(settings);
  });
}

/** Top-nav UserAvatar uses the same `/api/users/{id}/profile-image` URL we already parse for partners. */
function syncSessionUserIdFromNavbar(): void {
  const nav = document.getElementById('dashboard-navbar');
  if (!nav) return;
  for (const img of nav.querySelectorAll('img')) {
    const id = parseUserIdFromProfileImageUrl(img.currentSrc || img.src);
    if (id) {
      sessionUserId = id;
      return;
    }
  }
}

function shouldShowUploaderOverlay(ownerId: string): boolean {
  if (sessionUserId === undefined) return true;
  const isOwn = ownerId.toLowerCase() === sessionUserId.toLowerCase();
  if (isOwn) return settings.showOwnProfileIcon;
  return true;
}

function removeExtensionElements(): void {
  userByOwnerId.clear();
  userFetchInflight.clear();
  partnerPathInflight.clear();
  assetDetailFetchInflight.clear();
  pathInjectionUseNativeOnly.clear();
  pendingPartnerPathByAssetId.clear();
  assetApiDetailById.clear();
  resolveMeUserIdInflight = null;
  sessionUserId = undefined;

  document.querySelectorAll('.immich-ui-helper-uploader-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.immich-ui-helper-viewer-avatar').forEach((el) => el.remove());
  document.querySelectorAll('[data-asset].immich-ui-helper-thumb-anchor').forEach((el) => {
    el.classList.remove('immich-ui-helper-thumb-anchor');
  });

  removeInjectedPartnerPath(document.getElementById('detail-panel'));

  detailPanelMounted = false;
  fileLocationAssetKey = '';
  sawPathLinkThisAsset = false;
  didAutoClickShowLocation = false;
  userDismissedPathThisAsset = false;
}

async function fetchUser(ownerId: string): Promise<ImmichUserPublic | null> {
  const cached = userByOwnerId.get(ownerId);
  if (cached) return cached;

  let inflight = userFetchInflight.get(ownerId);
  if (!inflight) {
    inflight = (async () => {
      resolveImmichUsersApiBase();
      try {
        const res = await fetch(userDetailAbsoluteUrl(ownerId), { credentials: 'include' });
        if (!res.ok) return null;
        const raw = await res.json();
        const u = parseUserJson(raw);
        if (u) userByOwnerId.set(ownerId, u);
        return u;
      } catch {
        return null;
      }
    })().finally(() => {
      userFetchInflight.delete(ownerId);
    });
    userFetchInflight.set(ownerId, inflight);
  }
  return inflight;
}

function renderLetterFigure(
  figure: HTMLElement,
  letter: string,
  avatarColor: string,
  size: 'thumb' | 'viewer',
): void {
  const bg = AVATAR_COLOR_BG[avatarColor] ?? AVATAR_COLOR_BG.gray;
  const existingSpan = figure.querySelector<HTMLElement>('span.immich-ui-helper-avatar-letter');
  if (
    existingSpan &&
    existingSpan.dataset.immichUiHelperAvatarLetter === letter &&
    figure.classList.contains(`immich-ui-helper-avatar--${size}`) &&
    figure.classList.contains('immich-ui-helper-avatar--letter')
  ) {
    if (figure.style.backgroundColor !== bg) figure.style.backgroundColor = bg;
    return;
  }

  figure.className = `immich-ui-helper-avatar immich-ui-helper-avatar--${size} immich-ui-helper-avatar--letter`;
  figure.style.backgroundColor = bg;
  figure.style.color = '#f8fafc';
  const span = document.createElement('span');
  span.className = 'immich-ui-helper-avatar-letter';
  span.textContent = letter;
  span.dataset.immichUiHelperAvatarLetter = letter;
  figure.replaceChildren(span);
}

function renderPhotoFigure(figure: HTMLElement, photoUrl: string, size: 'thumb' | 'viewer', user: ImmichUserPublic): void {
  const existing = figure.querySelector<HTMLImageElement>('img.immich-ui-helper-avatar-img');
  if (existing && existing.src === photoUrl) {
    return;
  }

  figure.className = `immich-ui-helper-avatar immich-ui-helper-avatar--${size} immich-ui-helper-avatar--photo`;
  figure.style.backgroundColor = '';
  figure.style.color = '';
  const img = document.createElement('img');
  img.className = 'immich-ui-helper-avatar-img';
  img.alt = '';
  img.decoding = 'async';
  img.src = photoUrl;
  img.onerror = () => {
    img.onerror = null;
    renderLetterFigure(figure, avatarInitialLetter(user.name, user.email), user.avatarColor, size);
  };
  figure.replaceChildren(img);
}

/**
 * Match Immich UserAvatar: use GET /users/:id → profileImagePath ? photo : name[0] + avatarColor.
 */
function scheduleUploaderBadge(container: HTMLElement, ownerId: string, size: 'thumb' | 'viewer'): void {
  container.dataset.immichUiHelperBadgeOwner = ownerId;
  const myGen = (badgeRenderGenByContainer.get(container) ?? 0) + 1;
  badgeRenderGenByContainer.set(container, myGen);

  void (async () => {
    const jobOwner = ownerId;
    const user = await fetchUser(jobOwner);
    if (
      badgeRenderGenByContainer.get(container) !== myGen ||
      container.dataset.immichUiHelperBadgeOwner !== jobOwner ||
      !container.isConnected
    ) {
      return;
    }

    let figure = container.querySelector<HTMLElement>('figure.immich-ui-helper-avatar');
    if (!figure) {
      figure = document.createElement('figure');
      container.appendChild(figure);
    }

    if (!user) {
      const sig = `${jobOwner}|err`;
      if (container.dataset.immichUiHelperBadgeSig === sig) return;
      renderLetterFigure(figure, '?', 'gray', size);
      container.dataset.immichUiHelperBadgeSig = sig;
      return;
    }

    const hasPhoto = Boolean(user.profileImagePath?.trim());
    const changed = user.profileChangedAt ?? '';
    if (!hasPhoto) {
      const letter = avatarInitialLetter(user.name, user.email);
      const sig = `${jobOwner}|${changed}|l|${letter}|${user.avatarColor}`;
      if (container.dataset.immichUiHelperBadgeSig === sig) return;
      renderLetterFigure(figure, letter, user.avatarColor, size);
      container.dataset.immichUiHelperBadgeSig = sig;
      return;
    }

    resolveImmichUsersApiBase();
    const photoUrl = profileImageAbsoluteUrl(jobOwner, user.profileChangedAt);
    const sig = `${jobOwner}|${changed}|p|${photoUrl}`;
    if (container.dataset.immichUiHelperBadgeSig === sig) return;

    renderPhotoFigure(figure, photoUrl, size, user);
    if (
      badgeRenderGenByContainer.get(container) !== myGen ||
      container.dataset.immichUiHelperBadgeOwner !== jobOwner ||
      !container.isConnected
    ) {
      return;
    }
    container.dataset.immichUiHelperBadgeSig = sig;
  })();
}

/**
 * Immich stack badge: top-right flex row with locale-formatted count + burst icon (thumbnail.svelte).
 * When present, shift our uploader overlay left so it does not cover the count or icon.
 */
function thumbnailHasStackBadge(thumb: HTMLElement): boolean {
  for (const wrap of thumb.querySelectorAll<HTMLElement>('div.absolute')) {
    const cn = wrap.className;
    if (typeof cn !== 'string' || !cn.includes('flex') || !cn.includes('place-items-center')) continue;
    if (!cn.includes('top-0') && !cn.includes('top-7')) continue;
    if (!cn.includes('inset-e-') && !cn.includes('inset-inline-end-')) continue;
    const inner = wrap.querySelector<HTMLElement>('span.flex.place-items-center.gap-1');
    if (!inner) continue;
    const numEl = inner.querySelector('p');
    const svg = inner.querySelector('svg');
    if (!numEl || !svg) continue;
    const n = (numEl.textContent ?? '').replace(/\s/g, '');
    if (/^[\d,]+$/.test(n)) return true;
  }
  return false;
}

function updateThumbnailOverlays(): void {
  if (!settings.showPartnerIcons) {
    document.querySelectorAll('.immich-ui-helper-uploader-overlay').forEach((el) => el.remove());
    return;
  }

  const thumbs = document.querySelectorAll<HTMLElement>('[data-asset]');
  thumbs.forEach((thumb) => {
    const assetId = thumb.dataset.asset?.toLowerCase();
    if (!assetId) return;

    const ownerId = ownerByAsset.get(assetId);
    if (!ownerId) {
      thumb.querySelector('.immich-ui-helper-uploader-overlay')?.remove();
      thumb.classList.remove('immich-ui-helper-thumb-anchor');
      return;
    }

    if (!shouldShowUploaderOverlay(ownerId)) {
      thumb.querySelector('.immich-ui-helper-uploader-overlay')?.remove();
      thumb.classList.remove('immich-ui-helper-thumb-anchor');
      return;
    }

    thumb.classList.add('immich-ui-helper-thumb-anchor');

    let overlay = thumb.querySelector<HTMLElement>('.immich-ui-helper-uploader-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'immich-ui-helper-uploader-overlay';
      overlay.dataset.immichUiHelperUploader = '';
      thumb.appendChild(overlay);
    }
    overlay.classList.toggle('immich-ui-helper-uploader-overlay--stack', thumbnailHasStackBadge(thumb));
    scheduleUploaderBadge(overlay, ownerId, 'thumb');
  });
}

function parseAssetIdFromHref(): string | null {
  const m = location.pathname.match(/\/photos\/([0-9a-f-]{36})/i);
  return m ? m[1].toLowerCase() : null;
}

function updateViewerOverlay(): void {
  const actions = document.querySelector<HTMLElement>('[data-testid="asset-viewer-navbar-actions"]');
  if (!actions || !settings.showPartnerIcons) {
    document.querySelectorAll('.immich-ui-helper-viewer-avatar').forEach((el) => el.remove());
    return;
  }

  const assetId = parseAssetIdFromHref();
  if (!assetId) {
    actions.querySelector('.immich-ui-helper-viewer-avatar')?.remove();
    return;
  }

  const ownerId = ownerByAsset.get(assetId.toLowerCase());
  if (!ownerId) {
    actions.querySelector('.immich-ui-helper-viewer-avatar')?.remove();
    return;
  }

  if (!shouldShowUploaderOverlay(ownerId)) {
    actions.querySelector('.immich-ui-helper-viewer-avatar')?.remove();
    return;
  }

  let wrap = actions.querySelector<HTMLElement>('.immich-ui-helper-viewer-avatar');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'immich-ui-helper-viewer-avatar';
    wrap.dataset.immichUiHelperUploader = '';
    actions.prepend(wrap);
  }
  scheduleUploaderBadge(wrap, ownerId, 'viewer');
}

function currentFileLocationAssetKey(): string {
  return parseAssetIdFromHref() ?? `${location.pathname}${location.search}`;
}

function resetFileLocationTrackingIfAssetChanged(): void {
  const key = currentFileLocationAssetKey();
  if (key !== fileLocationAssetKey) {
    removeInjectedPartnerPath(document.getElementById('detail-panel'));
    if (fileLocationAssetKey) {
      pathInjectionUseNativeOnly.delete(fileLocationAssetKey);
      pendingPartnerPathByAssetId.delete(fileLocationAssetKey);
      assetApiDetailById.delete(fileLocationAssetKey.toLowerCase());
    }
    fileLocationAssetKey = key;
    sawPathLinkThisAsset = false;
    didAutoClickShowLocation = false;
    /* Keep userDismissedPathThisAsset — same idea as Immich not resetting showAssetPath on asset change. */
  }
}

function removeInjectedPartnerPath(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.querySelectorAll('[data-immich-ui-helper-injected-path]').forEach((el) => el.remove());
}

const FILENAME_EXT_RE =
  /\.(heic|heif|jpe?g|png|gif|webp|raw|mov|mp4|dng|tif|tiff|avif|cr2|cr3|nef|arw|svg)$/i;

/**
 * Filename block in detail-panel: `div.flex.gap-4.py-4` with image icon, second column holds `p` + optional path.
 * Do not rely on a single `p.break-all` query — multiple rows share that pattern (EXIF blocks).
 */
function findFilenameRow(panel: HTMLElement): HTMLElement | null {
  for (const row of panel.querySelectorAll<HTMLElement>('div.flex.gap-4.py-4')) {
    const contentCol = row.children[1];
    if (!(contentCol instanceof HTMLElement)) continue;
    const p =
      contentCol.querySelector<HTMLElement>(':scope > p.break-all') ??
      contentCol.querySelector<HTMLElement>(':scope > p');
    if (!p || p.dataset.immichUiHelperInjectedPath) continue;
    const t = p.textContent?.trim() ?? '';
    if (FILENAME_EXT_RE.test(t)) return p;
  }

  for (const p of panel.querySelectorAll<HTMLElement>('p.break-all')) {
    const cls = p.className;
    if (typeof cls === 'string' && cls.includes('flex') && cls.includes('place-items-center')) {
      if (!p.dataset.immichUiHelperInjectedPath) return p;
    }
  }
  return null;
}

/** GET /api/assets/:id in the page main world (same cookies as Immich). Isolated fetch can miss session on cold loads. */
function fetchAssetViaMainWorld(
  assetId: string,
): Promise<{ ownerId: string; originalPath: string } | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'immich-ui-helper:fetch-asset-main', assetId },
      (resp: {
        ok?: boolean;
        ownerId?: string | null;
        originalPath?: string | null;
      }) => {
        void chrome.runtime.lastError;
        if (
          resp?.ok &&
          typeof resp.ownerId === 'string' &&
          resp.ownerId &&
          typeof resp.originalPath === 'string' &&
          resp.originalPath
        ) {
          resolve({ ownerId: resp.ownerId.toLowerCase(), originalPath: resp.originalPath });
        } else resolve(null);
      },
    );
  });
}

function linkTextLooksLikeImmichServerPath(text: string, mappings: PathMappingRow[]): boolean {
  const sorted = sortMappingsForReplace(mappings);
  if (sorted.length === 0) return true;
  const t = text.trim();
  if (!t) return false;
  for (const { immichPath } of sorted) {
    const imm = immichPath.trim();
    if (imm && t.startsWith(imm)) return true;
  }
  return false;
}

function scheduleAssetDetailFetchIfMissing(assetId: string): void {
  const key = assetId.toLowerCase();
  const row = assetApiDetailById.get(key);
  if (typeof row?.originalPath === 'string' && row.originalPath.trim()) return;
  if (assetDetailFetchInflight.has(key)) return;
  const inflight = (async () => {
    try {
      const fromMain = await fetchAssetViaMainWorld(assetId);
      if (fromMain) {
        assetApiDetailById.set(key, { ownerId: fromMain.ownerId, originalPath: fromMain.originalPath });
        return;
      }
      const assetUrl = new URL(`/api/assets/${encodeURIComponent(assetId)}`, location.origin);
      appendSharedLinkSearchParams(assetUrl);
      const res = await fetch(assetUrl.href, { credentials: 'include' });
      if (!res.ok) return;
      const json: unknown = await res.json();
      const ownerId = parseOwnerIdFromAssetJson(json);
      const originalPath = parseOriginalPathFromAssetJson(json);
      if (ownerId && originalPath) {
        assetApiDetailById.set(key, { ownerId, originalPath });
      }
    } finally {
      assetDetailFetchInflight.delete(key);
    }
  })();
  assetDetailFetchInflight.set(key, inflight);
  void inflight.then(() => scheduleDomUpdate());
}

/** GET /api/users/me in the page main world — isolated `fetch` often returns 401 without session cookies. */
function fetchMeViaMainWorld(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'immich-ui-helper:fetch-me-main' }, (resp: { ok?: boolean; userId?: string | null }) => {
      void chrome.runtime.lastError;
      if (resp?.ok && typeof resp.userId === 'string' && resp.userId) {
        resolve(resp.userId.toLowerCase());
      } else resolve(null);
    });
  });
}

async function ensureSessionUserIdFromApi(): Promise<string | null> {
  if (sessionUserId !== undefined) return sessionUserId;
  if (!resolveMeUserIdInflight) {
    resolveMeUserIdInflight = (async () => {
      try {
        const meUrl = new URL('/api/users/me', location.origin);
        appendSharedLinkSearchParams(meUrl);
        const meRes = await fetch(meUrl.href, { credentials: 'include' });
        if (!meRes.ok) return null;
        const meJson: unknown = await meRes.json();
        const parsed = parseCurrentUserIdFromMeJson(meJson);
        if (parsed) sessionUserId = parsed;
        return parsed;
      } catch {
        return null;
      } finally {
        resolveMeUserIdInflight = null;
      }
    })();
  }
  return resolveMeUserIdInflight;
}

/** Cold loads: `/api/users/me` may complete after our first check; Immich posts `currentUser` from the patched fetch. */
async function resolveMeIdForPartnerPath(): Promise<string | null> {
  if (sessionUserId !== undefined) return sessionUserId;
  let meId: string | null =
    (await fetchMeViaMainWorld()) ?? (await ensureSessionUserIdFromApi());
  if (!meId) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (sessionUserId !== undefined) {
        meId = sessionUserId;
        break;
      }
    }
  }
  if (meId) sessionUserId = meId;
  return meId;
}

function escapeForCssAttr(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function insertPartnerPathRowAfterFilename(
  panel: HTMLElement,
  assetId: string,
  rawPath: string,
  esc: string,
): boolean {
  if (panel.querySelector(`[data-immich-ui-helper-injected-path="${esc}"]`)) return true;
  const filenameRow = findFilenameRow(panel);
  if (!filenameRow?.isConnected) return false;

  const mapped = applyPathMappings(rawPath, settings.pathMappings);
  const row = document.createElement('p');
  row.className =
    'text-xs opacity-50 break-all pb-2 hover:text-primary whitespace-pre-wrap';
  row.dataset.immichUiHelperInjectedPath = assetId;

  const a = document.createElement('a');
  a.href = folderPageHref(rawPath);
  a.className = 'whitespace-pre-wrap hover:text-primary';
  a.title = 'Go to folder';
  a.textContent = mapped;
  a.dataset.rawPath = rawPath;

  row.appendChild(a);
  filenameRow.insertAdjacentElement('afterend', row);
  return true;
}

/**
 * Immich only renders "Show file location" for the asset owner. For others' photos, fetch the asset
 * (and current user when needed), compare ownerId to session user, then inject the path row.
 */
function schedulePartnerPathInjection(panel: HTMLElement, assetId: string): void {
  if (userDismissedPathThisAsset) return;
  if (findFolderPathLink(panel, settings.pathMappings)) return;
  if (pathInjectionUseNativeOnly.has(assetId)) return;

  const esc = escapeForCssAttr(assetId);
  const existingAnchor = panel.querySelector<HTMLAnchorElement>(
    `p[data-immich-ui-helper-injected-path="${esc}"] a[data-raw-path]`,
  );
  if (existingAnchor) {
    const raw = existingAnchor.dataset.rawPath;
    if (raw) {
      const next = applyPathMappings(raw, settings.pathMappings);
      if (existingAnchor.textContent !== next) existingAnchor.textContent = next;
      existingAnchor.setAttribute('href', folderPageHref(raw));
    }
    return;
  }

  const rawPending = pendingPartnerPathByAssetId.get(assetId);
  if (rawPending !== undefined) {
    if (insertPartnerPathRowAfterFilename(panel, assetId, rawPending, esc)) {
      pendingPartnerPathByAssetId.delete(assetId);
    }
    return;
  }

  let inflight = partnerPathInflight.get(assetId);
  if (!inflight) {
    inflight = (async () => {
      try {
        const keyId = assetId.toLowerCase();
        let ownerId = assetApiDetailById.get(keyId)?.ownerId ?? null;
        let rawPath = assetApiDetailById.get(keyId)?.originalPath ?? null;

        if (!ownerId || !rawPath) {
          const fromMain = await fetchAssetViaMainWorld(assetId);
          if (fromMain) {
            ownerId = fromMain.ownerId;
            rawPath = fromMain.originalPath;
            assetApiDetailById.set(keyId, { ownerId, originalPath: rawPath });
          }
        }

        if (!ownerId || !rawPath) {
          const assetUrl = new URL(`/api/assets/${encodeURIComponent(assetId)}`, location.origin);
          appendSharedLinkSearchParams(assetUrl);
          const res = await fetch(assetUrl.href, { credentials: 'include' });
          if (!res.ok) return;
          const json: unknown = await res.json();
          ownerId = parseOwnerIdFromAssetJson(json);
          rawPath = parseOriginalPathFromAssetJson(json);
          if (ownerId && rawPath) {
            assetApiDetailById.set(keyId, { ownerId, originalPath: rawPath });
          }
        }

        if (!ownerId || !rawPath) return;

        const meId = await resolveMeIdForPartnerPath();
        if (!meId) return;

        if (ownerId === meId) {
          pathInjectionUseNativeOnly.add(assetId);
          return;
        }

        if (parseAssetIdFromHref() !== assetId) return;

        const pnl = document.getElementById('detail-panel');
        if (!pnl?.isConnected) return;
        if (findFolderPathLink(pnl, settings.pathMappings)) return;

        const escInner = escapeForCssAttr(assetId);
        if (!insertPartnerPathRowAfterFilename(pnl, assetId, rawPath, escInner)) {
          pendingPartnerPathByAssetId.set(assetId, rawPath);
        }
      } finally {
        partnerPathInflight.delete(assetId);
      }
    })();
    partnerPathInflight.set(assetId, inflight);
  }

  void inflight.then(() => scheduleDomUpdate());
}

/** Immich-native path row only — ignore our injected row (same folder-link shape). */
function findFolderPathLink(panel: HTMLElement, pathMappings: PathMappingRow[]): HTMLAnchorElement | null {
  const links = panel.querySelectorAll<HTMLAnchorElement>('a[href*="/folders"]');
  for (const a of links) {
    if (a.closest('[data-immich-ui-helper-injected-path]')) continue;
    const t = a.textContent?.trim() ?? '';
    if (folderLinkTextLooksLikePathDisplay(t, pathMappings)) {
      return a;
    }
  }
  return null;
}

/** @returns true if a toggle button was clicked */
function clickShowFileLocationIfNeeded(panel: HTMLElement): boolean {
  if (findFolderPathLink(panel, settings.pathMappings)) return false;

  for (const label of SHOW_FILE_LOCATION_LABELS) {
    const btn = panel.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (btn) {
      btn.click();
      return true;
    }
  }

  const filenameRow = panel.querySelector('p.break-all');
  if (filenameRow) {
    const btn = filenameRow.querySelector<HTMLButtonElement>('button[aria-label]');
    if (btn && /file|location|chemin|ubicación|場所|pfad/i.test(btn.getAttribute('aria-label') ?? '')) {
      btn.click();
      return true;
    }
  }
  return false;
}

function expandAndRewriteFilePath(): void {
  const panel = document.getElementById('detail-panel');
  if (!panel) {
    detailPanelMounted = false;
    return;
  }

  // Immich removes #detail-panel when the info panel is closed; remount resets showAssetPath, so allow auto-expand again.
  if (!detailPanelMounted) {
    detailPanelMounted = true;
    sawPathLinkThisAsset = false;
    didAutoClickShowLocation = false;
    userDismissedPathThisAsset = false;
  }

  resetFileLocationTrackingIfAssetChanged();

  const link = findFolderPathLink(panel, settings.pathMappings);
  if (link) {
    removeInjectedPartnerPath(panel);
    userDismissedPathThisAsset = false;
    sawPathLinkThisAsset = true;
    const aid = parseAssetIdFromHref()?.toLowerCase();
    const apiRow = aid ? assetApiDetailById.get(aid) : undefined;
    const canonicalFromApi =
      typeof apiRow?.originalPath === 'string' && apiRow.originalPath.trim()
        ? apiRow.originalPath.trim()
        : '';

    if (aid && !canonicalFromApi && filterCompleteMappings(settings.pathMappings).length > 0) {
      scheduleAssetDetailFetchIfMissing(aid);
    }

    const linkText = link.textContent?.trim() ?? '';
    let raw = canonicalFromApi;
    if (!raw) {
      if (!linkTextLooksLikeImmichServerPath(linkText, settings.pathMappings)) {
        return;
      }
      raw = linkText;
    }

    const next = applyPathMappings(raw, settings.pathMappings);
    if (link.textContent?.trim() !== next) {
      link.textContent = next;
    }
    const wantHref = folderPageHref(raw);
    try {
      const cur = new URL(link.href).href;
      const want = new URL(wantHref, location.origin).href;
      if (cur !== want) {
        link.setAttribute('href', wantHref);
      }
    } catch {
      link.setAttribute('href', wantHref);
    }
    return;
  }

  if (sawPathLinkThisAsset) {
    userDismissedPathThisAsset = true;
  }

  if (userDismissedPathThisAsset) {
    return;
  }

  if (!didAutoClickShowLocation && clickShowFileLocationIfNeeded(panel)) {
    didAutoClickShowLocation = true;
  }

  const aid = parseAssetIdFromHref();
  if (aid) {
    schedulePartnerPathInjection(panel, aid);
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data as {
    source?: string;
    type?: string;
    userId?: string;
    pairs?: { assetId: string; ownerId: string }[];
    assetId?: string;
    ownerId?: string | null;
    originalPath?: string | null;
    user?: unknown;
  };
  if (d?.source !== MSG_SOURCE) return;

  if (d.type === MSG_USER_DETAIL && typeof d.ownerId === 'string') {
    const u = parseUserJson(d.user);
    if (u && u.id.toLowerCase() === d.ownerId.toLowerCase()) {
      userByOwnerId.set(d.ownerId.toLowerCase(), u);
      scheduleDomUpdate();
    }
    return;
  }

  if (d.type === MSG_CURRENT_USER && typeof d.userId === 'string') {
    sessionUserId = d.userId.toLowerCase();
    scheduleDomUpdate();
    return;
  }

  if (d.type === MSG_ASSET_DETAIL && typeof d.assetId === 'string') {
    const key = d.assetId.toLowerCase();
    const prev = assetApiDetailById.get(key) ?? { ownerId: null, originalPath: null };
    const nextOwner =
      typeof d.ownerId === 'string' && d.ownerId.trim() ? d.ownerId.toLowerCase() : prev.ownerId;
    const nextPath =
      typeof d.originalPath === 'string' && d.originalPath.trim() ? d.originalPath : prev.originalPath;
    assetApiDetailById.set(key, { ownerId: nextOwner, originalPath: nextPath });
    scheduleDomUpdate();
    return;
  }

  if (d.type === MSG_TYPE && Array.isArray(d.pairs)) {
    for (const p of d.pairs) {
      if (p.assetId && p.ownerId) {
        ownerByAsset.set(p.assetId.toLowerCase(), p.ownerId.toLowerCase());
      }
    }
    scheduleDomUpdate();
  }
});

const mo = new MutationObserver(() => scheduleDomUpdate());
mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (
    changes[STORAGE_KEYS.enabledUrls] ||
    changes[STORAGE_KEYS.pathMappings] ||
    changes[STORAGE_KEYS.showPartnerIcons] ||
    changes[STORAGE_KEYS.showOwnProfileIcon]
  ) {
    readSettingsFromStorage((s) => {
      settings = s;
      settingsHydrated = true;
      scheduleDomUpdate();
    });
  }
});

readSettingsFromStorage((s) => {
  settings = s;
  settingsHydrated = true;
  scheduleDomUpdate();
});
