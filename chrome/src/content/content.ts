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
  parseExifLatLngFromAssetJson,
  parseOriginalPathFromAssetJson,
  parseOwnerIdFromAssetJson,
} from '../shared/asset-original-path';
import {
  applyPathMappings,
  filterCompleteMappings,
  folderLinkTextLooksLikePathDisplay,
  normalizePathMappingRow,
  pathPrefixMatches,
  sortMappingsForReplace,
} from '../shared/path-mapping';
import {
  DEFAULT_SETTINGS,
  readDetailRowPanelModeForKind,
  STORAGE_KEYS,
  type DetailRowKind,
  type DetailRowsExplicit,
  type ExtensionSettings,
  type PathMappingRow,
} from '../shared/storage-types';
import { isUrlEnabled } from '../shared/url-match';
import { applyFoldersPathRelabel } from './folders-path-relabel';
import {
  applyInfoPanelDetailRows,
  cleanupDetailPanelDetailRowsInDocument,
  setDetailRowPointerGate,
  setDetailRowUserToggleHandler,
} from './info-panel-detail-rows';
import { installSlashFocusSearch } from './slash-focus-search';

const MSG_SOURCE = 'immich-ui-tweak';
const MSG_TYPE = 'ownerPairs';
const MSG_CURRENT_USER = 'currentUser';
const MSG_ASSET_DETAIL = 'assetDetail';
const MSG_USER_DETAIL = 'userDetail';

/** Toggled on `<html>` when the user opts into an uncapped description textarea in `#detail-panel`. */
const INFO_PANEL_LARGE_DESCRIPTION_ROOT_CLASS = 'immich-ui-tweak-info-panel-large-description';

type AssetApiDetail = {
  ownerId: string | null;
  originalPath: string | null;
  latitude: number | null;
  longitude: number | null;
};

function emptyAssetDetail(): AssetApiDetail {
  return { ownerId: null, originalPath: null, latitude: null, longitude: null };
}

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
/**
 * Session-only per-row collapse overrides after toggles in the viewer (same lifetime as `userDismissedPathThisAsset`:
 * survives prev/next asset, resets on full reload, detail panel remount, or when collapse defaults change in sync).
 */
let detailRowsSessionExplicit: DetailRowsExplicit = {};
/** Detail panel file path: avoid re-clicking "show file location" after the user hides the path (runs every rAF). */
let detailPanelMounted = false;
/** When Immich mounts duplicate asset viewers (e.g. map + timeline), the active `#detail-panel` element changes — reset auto-expand state. */
let lastActiveDetailPanelEl: HTMLElement | null = null;
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
/**
 * After a GET /api/assets/:id backfill still left no GPS, avoid refetching every animation frame
 * when the Google Maps row is enabled.
 */
const assetGpsLookupExhausted = new Set<string>();
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
      STORAGE_KEYS.replaceFoldersPageNames,
      STORAGE_KEYS.showPartnerIcons,
      STORAGE_KEYS.showOwnProfileIcon,
      STORAGE_KEYS.autoOpenFileLocation,
      STORAGE_KEYS.remapSlashToFocusSearch,
      STORAGE_KEYS.googleMapsLinkInInfoPanel,
      STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel,
      STORAGE_KEYS.infoPanelDetailRowFile,
      STORAGE_KEYS.infoPanelDetailRowCamera,
      STORAGE_KEYS.infoPanelDetailRowLens,
      STORAGE_KEYS.infoPanelLargeDescriptionField,
      'infoPanelDefaultCollapseFileRow',
      'infoPanelDefaultCollapseCameraRow',
      'infoPanelDefaultCollapseLensRow',
    ],
    (sync) => {
      const syncRec = sync as Record<string, unknown>;
      const enabledUrls = Array.isArray(sync[STORAGE_KEYS.enabledUrls])
        ? (sync[STORAGE_KEYS.enabledUrls] as string[])
        : DEFAULT_SETTINGS.enabledUrls;
      const pathMappings = (Array.isArray(sync[STORAGE_KEYS.pathMappings])
        ? (sync[STORAGE_KEYS.pathMappings] as PathMappingRow[])
        : DEFAULT_SETTINGS.pathMappings
      ).map(normalizePathMappingRow);
      const replaceFoldersPageNames =
        typeof sync[STORAGE_KEYS.replaceFoldersPageNames] === 'boolean'
          ? (sync[STORAGE_KEYS.replaceFoldersPageNames] as boolean)
          : DEFAULT_SETTINGS.replaceFoldersPageNames;
      const showPartnerIcons =
        typeof sync[STORAGE_KEYS.showPartnerIcons] === 'boolean'
          ? (sync[STORAGE_KEYS.showPartnerIcons] as boolean)
          : DEFAULT_SETTINGS.showPartnerIcons;
      const showOwnProfileIcon =
        typeof sync[STORAGE_KEYS.showOwnProfileIcon] === 'boolean'
          ? (sync[STORAGE_KEYS.showOwnProfileIcon] as boolean)
          : DEFAULT_SETTINGS.showOwnProfileIcon;
      const autoOpenFileLocation =
        typeof sync[STORAGE_KEYS.autoOpenFileLocation] === 'boolean'
          ? (sync[STORAGE_KEYS.autoOpenFileLocation] as boolean)
          : DEFAULT_SETTINGS.autoOpenFileLocation;
      const remapSlashToFocusSearch =
        typeof sync[STORAGE_KEYS.remapSlashToFocusSearch] === 'boolean'
          ? (sync[STORAGE_KEYS.remapSlashToFocusSearch] as boolean)
          : DEFAULT_SETTINGS.remapSlashToFocusSearch;
      const googleMapsLinkInInfoPanel =
        typeof sync[STORAGE_KEYS.googleMapsLinkInInfoPanel] === 'boolean'
          ? (sync[STORAGE_KEYS.googleMapsLinkInInfoPanel] as boolean)
          : DEFAULT_SETTINGS.googleMapsLinkInInfoPanel;
      const googleMapsEmbedInsteadOfOsmInInfoPanel =
        typeof sync[STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel] === 'boolean'
          ? (sync[STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel] as boolean)
          : DEFAULT_SETTINGS.googleMapsEmbedInsteadOfOsmInInfoPanel;
      const infoPanelDetailRowFile = readDetailRowPanelModeForKind(syncRec, 'file');
      const infoPanelDetailRowCamera = readDetailRowPanelModeForKind(syncRec, 'camera');
      const infoPanelDetailRowLens = readDetailRowPanelModeForKind(syncRec, 'lens');
      const infoPanelLargeDescriptionField =
        typeof sync[STORAGE_KEYS.infoPanelLargeDescriptionField] === 'boolean'
          ? (sync[STORAGE_KEYS.infoPanelLargeDescriptionField] as boolean)
          : DEFAULT_SETTINGS.infoPanelLargeDescriptionField;
      cb({
        enabledUrls: enabledUrls.slice(0, 32),
        pathMappings,
        replaceFoldersPageNames,
        showPartnerIcons,
        showOwnProfileIcon,
        autoOpenFileLocation,
        remapSlashToFocusSearch,
        googleMapsLinkInInfoPanel,
        googleMapsEmbedInsteadOfOsmInInfoPanel,
        infoPanelDetailRowFile,
        infoPanelDetailRowCamera,
        infoPanelDetailRowLens,
        infoPanelLargeDescriptionField,
      });
    },
  );
}

function requestMainWorldInject(): void {
  if (injectRequested) return;
  injectRequested = true;
  chrome.runtime.sendMessage({ type: 'immich-ui-tweak:inject-main' }, () => {
    void chrome.runtime.lastError;
  });
}

/**
 * Main-world `injected.js` is registered at `document_start` only on allowlisted URLs.
 * This message remains a fallback when `registerContentScripts` cannot use `world: 'MAIN'`.
 */
requestMainWorldInject();

const DOM_UPDATE_MO_OPTIONS = { subtree: true, childList: true, characterData: true } as const;

function syncInfoPanelLargeDescriptionRootClass(): void {
  if (!settingsHydrated || !isUrlEnabled(location.href, settings.enabledUrls)) {
    document.documentElement.classList.remove(INFO_PANEL_LARGE_DESCRIPTION_ROOT_CLASS);
    return;
  }
  if (settings.infoPanelLargeDescriptionField) {
    document.documentElement.classList.add(INFO_PANEL_LARGE_DESCRIPTION_ROOT_CLASS);
  } else {
    document.documentElement.classList.remove(INFO_PANEL_LARGE_DESCRIPTION_ROOT_CLASS);
  }
}

function runScheduledDomPass(): void {
  syncInfoPanelLargeDescriptionRootClass();
  syncSessionUserIdFromNavbar();
  updateThumbnailOverlays();
  updateViewerOverlay();
  expandAndRewriteFilePath();
  document.querySelectorAll('#detail-panel').forEach((el) => {
    if (el instanceof HTMLElement) applyInfoPanelDetailRows(el, settings, detailRowsSessionExplicit);
  });
  if (settings.replaceFoldersPageNames) {
    applyFoldersPathRelabel(settings);
    /* Svelte can overwrite folder labels after our rAF; re-apply on the next task and after layout. */
    const snap = settings;
    if (location.pathname === '/folders' || location.pathname.startsWith('/folders/')) {
      queueMicrotask(() => applyFoldersPathRelabel(snap));
      setTimeout(() => applyFoldersPathRelabel(snap), 0);
      setTimeout(() => applyFoldersPathRelabel(snap), 400);
    }
  }
  updateGoogleMapsLinkInDetailPanel();
  updateGoogleMapsEmbedInDetailPanel();
}

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
    domUpdateMutationObserver.disconnect();
    try {
      runScheduledDomPass();
    } finally {
      domUpdateMutationObserver.observe(document.documentElement, DOM_UPDATE_MO_OPTIONS);
    }
  });
}

const domUpdateMutationObserver = new MutationObserver(() => scheduleDomUpdate());
domUpdateMutationObserver.observe(document.documentElement, DOM_UPDATE_MO_OPTIONS);

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

const GOOGLE_MAPS_EMBED_ATTR = 'data-immich-ui-tweak-google-maps-embed';
const GOOGLE_MAPS_EMBED_HOST_CLASS = 'immich-ui-tweak-google-maps-embed-host';

function removeGoogleMapsEmbedElements(): void {
  document.querySelectorAll(`[${GOOGLE_MAPS_EMBED_ATTR}]`).forEach((el) => el.remove());
  document.querySelectorAll<HTMLElement>(`.${GOOGLE_MAPS_EMBED_HOST_CLASS}`).forEach((el) => {
    el.classList.remove(GOOGLE_MAPS_EMBED_HOST_CLASS);
  });
}

function removeExtensionElements(): void {
  userByOwnerId.clear();
  userFetchInflight.clear();
  partnerPathInflight.clear();
  assetDetailFetchInflight.clear();
  pathInjectionUseNativeOnly.clear();
  pendingPartnerPathByAssetId.clear();
  assetApiDetailById.clear();
  assetGpsLookupExhausted.clear();
  resolveMeUserIdInflight = null;
  sessionUserId = undefined;

  document.querySelectorAll('.immich-ui-tweak-uploader-overlay').forEach((el) => el.remove());
  document.querySelectorAll('[data-immich-ui-tweak-uploader-row]').forEach((el) => el.remove());
  document.querySelectorAll('[data-immich-ui-tweak-uploader-layer]').forEach((el) => el.remove());
  document.querySelectorAll('.immich-ui-tweak-viewer-avatar').forEach((el) => el.remove());
  document.querySelectorAll('[data-immich-ui-tweak-google-maps-row]').forEach((el) => el.remove());
  removeGoogleMapsEmbedElements();

  removeInjectedPartnerPathAllViewers();
  cleanupDetailPanelDetailRowsInDocument();

  detailPanelMounted = false;
  lastActiveDetailPanelEl = null;
  fileLocationAssetKey = '';
  sawPathLinkThisAsset = false;
  didAutoClickShowLocation = false;
  userDismissedPathThisAsset = false;
  detailRowsSessionExplicit = {};
  document.documentElement.classList.remove(INFO_PANEL_LARGE_DESCRIPTION_ROOT_CLASS);
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
  const existingSpan = figure.querySelector<HTMLElement>('span.immich-ui-tweak-avatar-letter');
  if (
    existingSpan &&
    existingSpan.dataset.immichUiTweakAvatarLetter === letter &&
    figure.classList.contains(`immich-ui-tweak-avatar--${size}`) &&
    figure.classList.contains('immich-ui-tweak-avatar--letter')
  ) {
    if (figure.style.backgroundColor !== bg) figure.style.backgroundColor = bg;
    return;
  }

  figure.className = `immich-ui-tweak-avatar immich-ui-tweak-avatar--${size} immich-ui-tweak-avatar--letter`;
  figure.style.backgroundColor = bg;
  figure.style.color = '#f8fafc';
  const span = document.createElement('span');
  span.className = 'immich-ui-tweak-avatar-letter';
  span.textContent = letter;
  span.dataset.immichUiTweakAvatarLetter = letter;
  figure.replaceChildren(span);
}

function renderPhotoFigure(figure: HTMLElement, photoUrl: string, size: 'thumb' | 'viewer', user: ImmichUserPublic): void {
  const existing = figure.querySelector<HTMLImageElement>('img.immich-ui-tweak-avatar-img');
  if (existing && existing.src === photoUrl) {
    return;
  }

  figure.className = `immich-ui-tweak-avatar immich-ui-tweak-avatar--${size} immich-ui-tweak-avatar--photo`;
  figure.style.backgroundColor = '';
  figure.style.color = '';
  const img = document.createElement('img');
  img.className = 'immich-ui-tweak-avatar-img';
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
  container.dataset.immichUiTweakBadgeOwner = ownerId;
  const myGen = (badgeRenderGenByContainer.get(container) ?? 0) + 1;
  badgeRenderGenByContainer.set(container, myGen);

  void (async () => {
    const jobOwner = ownerId;
    const user = await fetchUser(jobOwner);
    if (
      badgeRenderGenByContainer.get(container) !== myGen ||
      container.dataset.immichUiTweakBadgeOwner !== jobOwner ||
      !container.isConnected
    ) {
      return;
    }

    let figure = container.querySelector<HTMLElement>('figure.immich-ui-tweak-avatar');
    if (!figure) {
      figure = document.createElement('figure');
      container.appendChild(figure);
    }

    if (!user) {
      const sig = `${jobOwner}|err`;
      if (container.dataset.immichUiTweakBadgeSig === sig) return;
      renderLetterFigure(figure, '?', 'gray', size);
      container.dataset.immichUiTweakBadgeSig = sig;
      return;
    }

    const hasPhoto = Boolean(user.profileImagePath?.trim());
    const changed = user.profileChangedAt ?? '';
    if (!hasPhoto) {
      const letter = avatarInitialLetter(user.name, user.email);
      const sig = `${jobOwner}|${changed}|l|${letter}|${user.avatarColor}`;
      if (container.dataset.immichUiTweakBadgeSig === sig) return;
      renderLetterFigure(figure, letter, user.avatarColor, size);
      container.dataset.immichUiTweakBadgeSig = sig;
      return;
    }

    resolveImmichUsersApiBase();
    const photoUrl = profileImageAbsoluteUrl(jobOwner, user.profileChangedAt);
    const sig = `${jobOwner}|${changed}|p|${photoUrl}`;
    if (container.dataset.immichUiTweakBadgeSig === sig) return;

    renderPhotoFigure(figure, photoUrl, size, user);
    if (
      badgeRenderGenByContainer.get(container) !== myGen ||
      container.dataset.immichUiTweakBadgeOwner !== jobOwner ||
      !container.isConnected
    ) {
      return;
    }
    container.dataset.immichUiTweakBadgeSig = sig;
  })();
}

const THUMBNAIL_ICON_ROW_CLASSES = [
  '@container',
  'absolute',
  'inset-x-0',
  'top-0',
  'flex',
  'justify-end',
  'place-items-center',
  'gap-1',
  'text-white',
  'text-shadow-[1px_1px_6px_rgb(0_0_0)]',
].join(' ');

/**
 * The extension's thumbnail uploader badge is absolutely positioned inside the same top-right icon
 * row Immich uses for its overlay icons (video duration, stack count, live photo, etc.). Using
 * `inset-inline-end-0` plus a dynamic `marginInlineEnd` lets us offset the badge by the actual width
 * of those native icons in both LTR and RTL layouts, without relying on DOM order or scanning only
 * SVG elements.
 */
const THUMBNAIL_UPLOADER_PLACEMENT_CLASSES = [
  'immich-ui-tweak-uploader-overlay',
  'absolute',
  'end-0',
  'top-0',
  'pt-2',
  'pe-2',
  '@max-[99px]:scale-75',
  '@max-[99px]:pt-1',
  '@max-[99px]:pe-1',
  'drop-shadow-[1px_1px_6px_rgb(0_0_0)]',
].join(' ');

const THUMBNAIL_ICON_LAYER_CLASSES = [
  'absolute',
  'h-full',
  'w-full',
  'pointer-events-none',
  'group-focus-visible:rounded-lg',
].join(' ');

function thumbnailIconOverlayLayer(thumb: HTMLElement): HTMLElement {
  for (const layer of thumb.querySelectorAll<HTMLElement>('div.pointer-events-none')) {
    const cn = layer.className;
    if (typeof cn !== 'string') continue;
    if (!cn.includes('absolute') || !cn.includes('h-full') || !cn.includes('w-full')) continue;
    return layer;
  }

  const media = thumb.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
  const mediaLayer = media?.parentElement;
  const layer = document.createElement('div');
  layer.className = THUMBNAIL_ICON_LAYER_CLASSES;
  layer.dataset.immichUiTweakUploaderLayer = '';
  if (mediaLayer) {
    mediaLayer.insertBefore(layer, media.nextSibling);
  } else {
    thumb.appendChild(layer);
  }
  return layer;
}

function thumbnailTopRightIconRow(thumb: HTMLElement, iconLayer: HTMLElement): HTMLElement {
  // Search the whole thumbnail for Immich's native top-right icon row rather than scanning a single
  // overlay layer. This prevents us from attaching to an extension-created empty row and applying
  // zero offset when native icons live in a different layer/row.
  for (const row of thumb.querySelectorAll<HTMLElement>('div.absolute')) {
    const cn = row.className;
    if (typeof cn !== 'string') continue;
    // Skip rows injected by a previous extension run; otherwise we'd hide Immich's native icons
    // from our measurement and apply no dynamic offset.
    if (row.dataset.immichUiTweakUploaderRow !== undefined) continue;
    if (
      cn.includes('inset-x-0') &&
      cn.includes('top-0') &&
      cn.includes('flex') &&
      cn.includes('justify-end') &&
      cn.includes('place-items-center')
    ) {
      return row;
    }
  }

  const existingExtensionRow = iconLayer.querySelector<HTMLElement>('[data-immich-ui-tweak-uploader-row]');
  if (existingExtensionRow) return existingExtensionRow;

  const row = document.createElement('div');
  row.className = THUMBNAIL_ICON_ROW_CLASSES;
  row.dataset.immichUiTweakUploaderRow = '';
  iconLayer.appendChild(row);
  return row;
}

function removeThumbnailUploaderOverlay(thumb: HTMLElement): void {
  const placement = thumb.querySelector<HTMLElement>('[data-immich-ui-tweak-uploader]');
  const row = placement?.parentElement;
  const layer = row?.parentElement;
  placement?.remove();
  if (row instanceof HTMLElement && row.dataset.immichUiTweakUploaderRow !== undefined && row.childElementCount === 0) {
    row.remove();
  }
  if (
    layer instanceof HTMLElement &&
    layer.dataset.immichUiTweakUploaderLayer !== undefined &&
    layer.childElementCount === 0
  ) {
    layer.remove();
  }
}

function attachPlacementToIconRow(iconRow: HTMLElement, placement: HTMLElement): void {
  if (placement.parentElement !== iconRow) {
    iconRow.appendChild(placement);
  }
}

/**
 * Dynamically offset the extension's uploader badge so it sits just to the inline-start of Immich's
 * native thumbnail overlay icons (video duration, stack count, live photo, etc.).
 *
 * The placement is absolutely positioned at the inline-end edge of the shared icon row. We measure
 * the actual bounding boxes of *all* native icon row children (not just SVGs, so we capture text
 * labels too), then push the badge toward the inline-start by the full cluster width plus a small
 * gap. This works for LTR and RTL and avoids a hard-coded icon type check.
 */
function reserveThumbnailNativeIconSpace(iconRow: HTMLElement, placement: HTMLElement): void {
  const rowBox = iconRow.getBoundingClientRect();
  if (rowBox.width <= 0) {
    placement.style.marginInlineEnd = '';
    return;
  }

  const nativeBoxes = Array.from(iconRow.children)
    .filter((child) => child !== placement && child instanceof HTMLElement)
    .map((child) => child.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0);

  if (nativeBoxes.length === 0) {
    placement.style.marginInlineEnd = '';
    return;
  }

  // Push the placement away from the row's inline-end edge just enough to clear the full native
  // icon cluster. Using the row edge rather than the cluster width covers cases where Immich's
  // justify-end icons don't quite touch the edge.
  const isRtl = getComputedStyle(iconRow).direction === 'rtl';
  const occupiedFromEnd = isRtl
    ? Math.max(...nativeBoxes.map((box) => box.right)) - rowBox.left
    : rowBox.right - Math.min(...nativeBoxes.map((box) => box.left));

  // Small extra gap so the badge is visually separated from the native icons.
  const reserve = Math.max(0, occupiedFromEnd) + 6;
  placement.style.marginInlineEnd = `${Math.ceil(reserve)}px`;
}

function updateThumbnailOverlays(): void {
  if (!settings.showPartnerIcons) {
    document.querySelectorAll('.immich-ui-tweak-uploader-overlay').forEach((el) => el.remove());
    document.querySelectorAll('[data-immich-ui-tweak-uploader-row]').forEach((el) => el.remove());
    document.querySelectorAll('[data-immich-ui-tweak-uploader-layer]').forEach((el) => el.remove());
    return;
  }

  const thumbs = document.querySelectorAll<HTMLElement>('[data-asset]');
  thumbs.forEach((thumb) => {
    const assetId = thumb.dataset.asset?.toLowerCase();
    if (!assetId) return;

    const ownerId = ownerByAsset.get(assetId);
    if (!ownerId) {
      removeThumbnailUploaderOverlay(thumb);
      return;
    }

    if (!shouldShowUploaderOverlay(ownerId)) {
      removeThumbnailUploaderOverlay(thumb);
      return;
    }

    const iconLayer = thumbnailIconOverlayLayer(thumb);
    const iconRow = thumbnailTopRightIconRow(thumb, iconLayer);

    let placement = thumb.querySelector<HTMLElement>('[data-immich-ui-tweak-uploader]');
    if (!placement) {
      placement = document.createElement('span');
      placement.dataset.immichUiTweakUploader = '';
    }
    placement.className = THUMBNAIL_UPLOADER_PLACEMENT_CLASSES;
    attachPlacementToIconRow(iconRow, placement);
    reserveThumbnailNativeIconSpace(iconRow, placement);

    let badge = placement.querySelector<HTMLElement>('.immich-ui-tweak-uploader-badge');
    if (!badge) {
      badge = document.createElement('div');
      placement.replaceChildren(badge);
    }
    badge.className = 'immich-ui-tweak-uploader-badge';
    scheduleUploaderBadge(badge, ownerId, 'thumb');
  });
}

function parseAssetIdFromHref(): string | null {
  const m = location.pathname.match(/\/photos\/([0-9a-f-]{36})/i);
  return m ? m[1].toLowerCase() : null;
}

const ASSET_ID_IN_MEDIA_PATH_RE = /\/api\/assets\/([0-9a-f-]{36})\//i;

function viewerRootsFromDom(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#immich-asset-viewer'));
}

function isViewerRootVisuallyPresent(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden') return false;
  const op = parseFloat(st.opacity);
  if (Number.isFinite(op) && op < 0.02) return false;
  return true;
}

/**
 * Immich can mount more than one `#immich-asset-viewer` (e.g. map page portal + timeline portal). Pick the one that
 * receives paint at the viewport center, else the last visually-present root (topmost portal / fullscreen viewer).
 */
function getActiveAssetViewerRoot(): HTMLElement | null {
  const roots = viewerRootsFromDom();
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0] ?? null;

  const x = Math.floor(window.innerWidth / 2);
  const y = Math.floor(window.innerHeight / 2);
  let top: Element | null = null;
  try {
    top = document.elementFromPoint(x, y);
  } catch {
    top = null;
  }
  if (top) {
    const hit = top.closest('#immich-asset-viewer');
    if (hit instanceof HTMLElement && roots.includes(hit)) return hit;
  }

  const visible = roots.filter(isViewerRootVisuallyPresent);
  const pool = visible.length > 0 ? visible : roots;
  for (let i = pool.length - 1; i >= 0; i--) {
    const el = pool[i];
    if (el && isViewerRootVisuallyPresent(el)) return el;
  }
  return pool[pool.length - 1] ?? null;
}

function getActiveDetailPanel(): HTMLElement | null {
  const root = getActiveAssetViewerRoot();
  if (!root) return null;
  return root.querySelector<HTMLElement>('#detail-panel');
}

/** Resolve asset id from URL (`/photos/uuid`) or from the visible viewer's media URLs (map / duplicate viewers). */
function parseAssetIdFromActiveViewer(): string | null {
  const root = getActiveAssetViewerRoot();
  if (!root) return null;
  for (const el of root.querySelectorAll<HTMLElement>('img, video, source')) {
    const src =
      (el instanceof HTMLImageElement && (el.currentSrc || el.src)) ||
      (el instanceof HTMLVideoElement && el.src) ||
      (el instanceof HTMLSourceElement && el.src) ||
      el.getAttribute('src') ||
      '';
    if (!src) continue;
    const m = src.match(ASSET_ID_IN_MEDIA_PATH_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function parseCurrentAssetId(): string | null {
  return parseAssetIdFromHref() ?? parseAssetIdFromActiveViewer();
}

function updateViewerOverlay(): void {
  if (!settings.showPartnerIcons) {
    document.querySelectorAll('.immich-ui-tweak-viewer-avatar').forEach((el) => el.remove());
    return;
  }

  const activeRoot = getActiveAssetViewerRoot();
  for (const el of document.querySelectorAll<HTMLElement>('[data-testid="asset-viewer-navbar-actions"]')) {
    const host = el.closest('#immich-asset-viewer');
    if (host !== activeRoot) {
      el.querySelector('.immich-ui-tweak-viewer-avatar')?.remove();
    }
  }

  const actions = activeRoot?.querySelector<HTMLElement>('[data-testid="asset-viewer-navbar-actions"]');
  if (!actions) {
    return;
  }

  const assetId = parseCurrentAssetId();
  if (!assetId) {
    actions.querySelector('.immich-ui-tweak-viewer-avatar')?.remove();
    return;
  }

  const ownerId = ownerByAsset.get(assetId.toLowerCase());
  if (!ownerId) {
    actions.querySelector('.immich-ui-tweak-viewer-avatar')?.remove();
    return;
  }

  if (!shouldShowUploaderOverlay(ownerId)) {
    actions.querySelector('.immich-ui-tweak-viewer-avatar')?.remove();
    return;
  }

  let wrap = actions.querySelector<HTMLElement>('.immich-ui-tweak-viewer-avatar');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'immich-ui-tweak-viewer-avatar';
    wrap.dataset.immichUiTweakUploader = '';
    actions.prepend(wrap);
  }
  scheduleUploaderBadge(wrap, ownerId, 'viewer');
}

function currentFileLocationAssetKey(): string {
  return parseCurrentAssetId() ?? `${location.pathname}${location.search}`;
}

function resetFileLocationTrackingIfAssetChanged(): void {
  const key = currentFileLocationAssetKey();
  if (key !== fileLocationAssetKey) {
    removeInjectedPartnerPathAllViewers();
    if (fileLocationAssetKey) {
      pathInjectionUseNativeOnly.delete(fileLocationAssetKey);
      pendingPartnerPathByAssetId.delete(fileLocationAssetKey);
      assetApiDetailById.delete(fileLocationAssetKey.toLowerCase());
      assetGpsLookupExhausted.delete(fileLocationAssetKey.toLowerCase());
    }
    fileLocationAssetKey = key;
    sawPathLinkThisAsset = false;
    didAutoClickShowLocation = false;
    /* Keep userDismissedPathThisAsset — same idea as Immich not resetting showAssetPath on asset change. */
  }
}

function removeInjectedPartnerPath(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.querySelectorAll('[data-immich-ui-tweak-injected-path]').forEach((el) => el.remove());
}

function forEachDetailPanelInViewers(fn: (panel: HTMLElement) => void): void {
  for (const root of viewerRootsFromDom()) {
    const p = root.querySelector<HTMLElement>('#detail-panel');
    if (p) fn(p);
  }
}

function removeInjectedPartnerPathAllViewers(): void {
  forEachDetailPanelInViewers((p) => removeInjectedPartnerPath(p));
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
    if (!p || p.dataset.immichUiTweakInjectedPath) continue;
    const t = p.textContent?.trim() ?? '';
    if (FILENAME_EXT_RE.test(t)) return p;
  }

  for (const p of panel.querySelectorAll<HTMLElement>('p.break-all')) {
    const cls = p.className;
    if (typeof cls === 'string' && cls.includes('flex') && cls.includes('place-items-center')) {
      if (!p.dataset.immichUiTweakInjectedPath) return p;
    }
  }
  return null;
}

/** GET /api/assets/:id in the page main world (same cookies as Immich). Isolated fetch can miss session on cold loads. */
function fetchAssetViaMainWorld(
  assetId: string,
): Promise<{
  ownerId: string;
  originalPath: string;
  latitude: number | null;
  longitude: number | null;
} | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'immich-ui-tweak:fetch-asset-main', assetId },
      (resp: {
        ok?: boolean;
        ownerId?: string | null;
        originalPath?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }) => {
        void chrome.runtime.lastError;
        if (
          resp?.ok &&
          typeof resp.ownerId === 'string' &&
          resp.ownerId &&
          typeof resp.originalPath === 'string' &&
          resp.originalPath
        ) {
          const lat =
            typeof resp.latitude === 'number' && Number.isFinite(resp.latitude) ? resp.latitude : null;
          const lng =
            typeof resp.longitude === 'number' && Number.isFinite(resp.longitude) ? resp.longitude : null;
          resolve({
            ownerId: resp.ownerId.toLowerCase(),
            originalPath: resp.originalPath,
            latitude: lat,
            longitude: lng,
          });
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
    if (immichPath && pathPrefixMatches(t, immichPath)) return true;
  }
  return false;
}

function scheduleAssetDetailFetchIfMissing(assetId: string): void {
  const key = assetId.toLowerCase();
  const row = assetApiDetailById.get(key);
  const hasPath = typeof row?.originalPath === 'string' && Boolean(row.originalPath.trim());
  const hasGps =
    typeof row?.latitude === 'number' &&
    typeof row?.longitude === 'number' &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude);
  /* Do not stop at path-only rows when we still need GPS for the Google Maps row or embed. */
  if (hasPath && hasGps) return;
  if (hasPath && !settings.googleMapsLinkInInfoPanel && !settings.googleMapsEmbedInsteadOfOsmInInfoPanel) return;
  if (
    hasPath &&
    !hasGps &&
    (settings.googleMapsLinkInInfoPanel || settings.googleMapsEmbedInsteadOfOsmInInfoPanel) &&
    assetGpsLookupExhausted.has(key)
  ) {
    return;
  }
  if (assetDetailFetchInflight.has(key)) return;
  const inflight = (async () => {
    try {
      const fromMain = await fetchAssetViaMainWorld(assetId);
      if (fromMain) {
        assetApiDetailById.set(key, {
          ownerId: fromMain.ownerId,
          originalPath: fromMain.originalPath,
          latitude: fromMain.latitude,
          longitude: fromMain.longitude,
        });
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
        const ll = parseExifLatLngFromAssetJson(json);
        assetApiDetailById.set(key, {
          ownerId,
          originalPath,
          latitude: ll?.lat ?? null,
          longitude: ll?.lng ?? null,
        });
      }
    } finally {
      assetDetailFetchInflight.delete(key);
      const snap = settings;
      const after = assetApiDetailById.get(key);
      const pathNow = typeof after?.originalPath === 'string' && Boolean(after.originalPath.trim());
      const gpsNow =
        typeof after?.latitude === 'number' &&
        typeof after?.longitude === 'number' &&
        Number.isFinite(after.latitude) &&
        Number.isFinite(after.longitude);
      if ((snap.googleMapsLinkInInfoPanel || snap.googleMapsEmbedInsteadOfOsmInInfoPanel) && pathNow && !gpsNow) {
        assetGpsLookupExhausted.add(key);
      }
    }
  })();
  assetDetailFetchInflight.set(key, inflight);
  void inflight.then(() => scheduleDomUpdate());
}

/** GET /api/users/me in the page main world — isolated `fetch` often returns 401 without session cookies. */
function fetchMeViaMainWorld(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'immich-ui-tweak:fetch-me-main' }, (resp: { ok?: boolean; userId?: string | null }) => {
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
  if (panel.querySelector(`[data-immich-ui-tweak-injected-path="${esc}"]`)) return true;
  const filenameRow = findFilenameRow(panel);
  if (!filenameRow?.isConnected) return false;

  const mapped = applyPathMappings(rawPath, settings.pathMappings);
  const row = document.createElement('p');
  row.className =
    'text-xs opacity-50 break-all pb-2 hover:text-primary whitespace-pre-wrap';
  row.dataset.immichUiTweakInjectedPath = assetId;

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
    `p[data-immich-ui-tweak-injected-path="${esc}"] a[data-raw-path]`,
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
            assetApiDetailById.set(keyId, {
              ownerId,
              originalPath: rawPath,
              latitude: fromMain.latitude,
              longitude: fromMain.longitude,
            });
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
            const ll = parseExifLatLngFromAssetJson(json);
            assetApiDetailById.set(keyId, {
              ownerId,
              originalPath: rawPath,
              latitude: ll?.lat ?? null,
              longitude: ll?.lng ?? null,
            });
          }
        }

        if (!ownerId || !rawPath) return;

        const meId = await resolveMeIdForPartnerPath();
        if (!meId) return;

        if (ownerId === meId) {
          pathInjectionUseNativeOnly.add(assetId);
          return;
        }

        if (parseCurrentAssetId() !== assetId) return;

        const pnl = getActiveDetailPanel();
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
    if (a.closest('[data-immich-ui-tweak-injected-path]')) continue;
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
  const panel = getActiveDetailPanel();
  if (!panel) {
    detailPanelMounted = false;
    lastActiveDetailPanelEl = null;
    return;
  }

  if (panel !== lastActiveDetailPanelEl) {
    lastActiveDetailPanelEl = panel;
    detailPanelMounted = false;
  }

  // Immich removes #detail-panel when the info panel is closed; remount resets showAssetPath, so allow auto-expand again.
  if (!detailPanelMounted) {
    detailPanelMounted = true;
    sawPathLinkThisAsset = false;
    didAutoClickShowLocation = false;
    userDismissedPathThisAsset = false;
    detailRowsSessionExplicit = {};
  }

  resetFileLocationTrackingIfAssetChanged();

  const link = findFolderPathLink(panel, settings.pathMappings);
  if (link) {
    removeInjectedPartnerPath(panel);
    userDismissedPathThisAsset = false;
    sawPathLinkThisAsset = true;
    const aid = parseCurrentAssetId();
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

  if (
    settings.autoOpenFileLocation &&
    !didAutoClickShowLocation &&
    clickShowFileLocationIfNeeded(panel)
  ) {
    didAutoClickShowLocation = true;
  }

  const aid = parseCurrentAssetId();
  if (aid) {
    schedulePartnerPathInjection(panel, aid);
  }
}

const GOOGLE_MAPS_ROW_ATTR = 'data-immich-ui-tweak-google-maps-row';

function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function formatGoogleMapsCoordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
}

function updateGoogleMapsLinkInDetailPanel(): void {
  if (!settingsHydrated || !settings.googleMapsLinkInInfoPanel) {
    document.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    return;
  }
  if (!isUrlEnabled(location.href, settings.enabledUrls)) {
    document.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    return;
  }

  const panel = getActiveDetailPanel();
  if (!panel) {
    document.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    return;
  }

  const assetId = parseCurrentAssetId();
  if (!assetId) {
    document.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    return;
  }

  const detail = assetApiDetailById.get(assetId);
  const lat = detail?.latitude;
  const lng = detail?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    document.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    return;
  }

  forEachDetailPanelInViewers((p) => {
    if (p !== panel) {
      p.querySelectorAll(`[${GOOGLE_MAPS_ROW_ATTR}]`).forEach((el) => el.remove());
    }
  });

  const href = googleMapsSearchUrl(lat, lng);
  const label = formatGoogleMapsCoordLabel(lat, lng);

  const host =
    panel.querySelector<HTMLElement>(':scope > div.h-90') ??
    panel.querySelector<HTMLElement>('div.h-90');

  let wrap = panel.querySelector<HTMLElement>(`[${GOOGLE_MAPS_ROW_ATTR}]`);
  if (wrap && wrap.dataset.immichUiTweakGoogleMapsAsset === assetId) {
    const a = wrap.querySelector<HTMLAnchorElement>('[data-testid="immich-ui-tweak-google-maps-link"]');
    if (a && a.getAttribute('href') === href && (a.textContent ?? '').includes(label)) {
      /* Map mounts after first paint — move the row above it so the link stays in view. */
      if (host?.isConnected && wrap.nextElementSibling !== host) {
        host.insertAdjacentElement('beforebegin', wrap);
      }
      return;
    }
  }
  wrap?.remove();

  wrap = document.createElement('div');
  wrap.setAttribute(GOOGLE_MAPS_ROW_ATTR, '');
  wrap.className = 'immich-ui-tweak-google-maps-row';
  wrap.dataset.immichUiTweakGoogleMapsAsset = assetId;

  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('data-testid', 'immich-ui-tweak-google-maps-link');
  a.setAttribute('aria-label', 'Open in Google Maps');
  a.className = 'immich-ui-tweak-google-maps-link';

  const pinImg = document.createElement('img');
  pinImg.className = 'immich-ui-tweak-google-maps-pin';
  pinImg.src = chrome.runtime.getURL('assets/google-maps-icon-2026-48w.png');
  pinImg.alt = '';
  pinImg.width = 24;
  pinImg.height = 24;
  pinImg.decoding = 'async';
  pinImg.draggable = false;

  const textSpan = document.createElement('span');
  textSpan.textContent = label;

  a.append(pinImg, textSpan);
  wrap.append(a);

  if (host?.isConnected) {
    host.insertAdjacentElement('beforebegin', wrap);
  } else {
    /* Map hidden or layout changed — still show the link inside the info panel. */
    panel.appendChild(wrap);
  }
}

function googleMapsEmbedIframeSrc(lat: number, lng: number): string {
  const q = `${lat},${lng}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=14&output=embed`;
}

function updateGoogleMapsEmbedInDetailPanel(): void {
  if (!settingsHydrated || !settings.googleMapsEmbedInsteadOfOsmInInfoPanel) {
    removeGoogleMapsEmbedElements();
    return;
  }
  if (!isUrlEnabled(location.href, settings.enabledUrls)) {
    removeGoogleMapsEmbedElements();
    return;
  }

  const panel = getActiveDetailPanel();
  if (!panel) {
    removeGoogleMapsEmbedElements();
    return;
  }

  const assetId = parseCurrentAssetId();
  const detail = assetId ? assetApiDetailById.get(assetId) : undefined;
  const lat = detail?.latitude;
  const lng = detail?.longitude;
  const validGps =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  if (!assetId || !validGps) {
    removeGoogleMapsEmbedElements();
    return;
  }

  const host =
    panel.querySelector<HTMLElement>(':scope > div.h-90') ??
    panel.querySelector<HTMLElement>(':scope div.h-90');
  if (!host?.isConnected) {
    removeGoogleMapsEmbedElements();
    return;
  }

  const src = googleMapsEmbedIframeSrc(lat, lng);
  const existing = host.querySelector<HTMLElement>(`[${GOOGLE_MAPS_EMBED_ATTR}]`);
  if (existing?.dataset.immichUiTweakGoogleMapsEmbedAsset === assetId) {
    const iframe = existing.querySelector<HTMLIFrameElement>('iframe');
    if (iframe?.getAttribute('src') === src) {
      host.classList.add(GOOGLE_MAPS_EMBED_HOST_CLASS);
      return;
    }
  }

  for (const el of document.querySelectorAll<HTMLElement>(`[${GOOGLE_MAPS_EMBED_ATTR}]`)) {
    el.remove();
  }
  for (const el of document.querySelectorAll<HTMLElement>(`.${GOOGLE_MAPS_EMBED_HOST_CLASS}`)) {
    el.classList.remove(GOOGLE_MAPS_EMBED_HOST_CLASS);
  }

  const wrap = document.createElement('div');
  wrap.setAttribute(GOOGLE_MAPS_EMBED_ATTR, '');
  wrap.className = 'immich-ui-tweak-google-maps-embed-wrap';
  wrap.dataset.immichUiTweakGoogleMapsEmbedAsset = assetId;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-testid', 'immich-ui-tweak-google-maps-embed-iframe');
  iframe.title = 'Google Maps';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.loading = 'lazy';
  iframe.className = 'immich-ui-tweak-google-maps-embed-iframe';
  iframe.src = src;
  wrap.appendChild(iframe);
  host.appendChild(wrap);
  host.classList.add(GOOGLE_MAPS_EMBED_HOST_CLASS);
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
    latitude?: number | null;
    longitude?: number | null;
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
    const prev = assetApiDetailById.get(key) ?? emptyAssetDetail();
    const nextOwner =
      typeof d.ownerId === 'string' && d.ownerId.trim() ? d.ownerId.toLowerCase() : prev.ownerId;
    const nextPath =
      typeof d.originalPath === 'string' && d.originalPath.trim() ? d.originalPath : prev.originalPath;
    let nextLat = prev.latitude;
    let nextLng = prev.longitude;
    if ('latitude' in d) {
      nextLat =
        typeof d.latitude === 'number' && Number.isFinite(d.latitude) ? d.latitude : null;
    }
    if ('longitude' in d) {
      nextLng =
        typeof d.longitude === 'number' && Number.isFinite(d.longitude) ? d.longitude : null;
    }
    assetApiDetailById.set(key, {
      ownerId: nextOwner,
      originalPath: nextPath,
      latitude: nextLat,
      longitude: nextLng,
    });
    if (
      typeof nextLat === 'number' &&
      typeof nextLng === 'number' &&
      Number.isFinite(nextLat) &&
      Number.isFinite(nextLng)
    ) {
      assetGpsLookupExhausted.delete(key);
    }
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (
    changes[STORAGE_KEYS.infoPanelDetailRowFile] ||
    changes[STORAGE_KEYS.infoPanelDetailRowCamera] ||
    changes[STORAGE_KEYS.infoPanelDetailRowLens] ||
    changes.infoPanelDefaultCollapseFileRow ||
    changes.infoPanelDefaultCollapseCameraRow ||
    changes.infoPanelDefaultCollapseLensRow
  ) {
    detailRowsSessionExplicit = {};
  }
  if (
    changes[STORAGE_KEYS.googleMapsLinkInInfoPanel]?.newValue === true ||
    changes[STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel]?.newValue === true
  ) {
    assetGpsLookupExhausted.clear();
  }
  if (
    changes[STORAGE_KEYS.enabledUrls] ||
    changes[STORAGE_KEYS.pathMappings] ||
    changes[STORAGE_KEYS.replaceFoldersPageNames] ||
    changes[STORAGE_KEYS.showPartnerIcons] ||
    changes[STORAGE_KEYS.showOwnProfileIcon] ||
    changes[STORAGE_KEYS.autoOpenFileLocation] ||
    changes[STORAGE_KEYS.remapSlashToFocusSearch] ||
    changes[STORAGE_KEYS.googleMapsLinkInInfoPanel] ||
    changes[STORAGE_KEYS.googleMapsEmbedInsteadOfOsmInInfoPanel] ||
    changes[STORAGE_KEYS.infoPanelDetailRowFile] ||
    changes[STORAGE_KEYS.infoPanelDetailRowCamera] ||
    changes[STORAGE_KEYS.infoPanelDetailRowLens] ||
    changes[STORAGE_KEYS.infoPanelLargeDescriptionField] ||
    changes.infoPanelDefaultCollapseFileRow ||
    changes.infoPanelDefaultCollapseCameraRow ||
    changes.infoPanelDefaultCollapseLensRow
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

setDetailRowPointerGate(() => settingsHydrated && isUrlEnabled(location.href, settings.enabledUrls));

setDetailRowUserToggleHandler((kind: DetailRowKind, collapsed: boolean) => {
  detailRowsSessionExplicit = { ...detailRowsSessionExplicit, [kind]: collapsed };
  scheduleDomUpdate();
});

installSlashFocusSearch(
  () =>
    settingsHydrated &&
    settings.remapSlashToFocusSearch &&
    isUrlEnabled(location.href, settings.enabledUrls),
);

/** E2E only: Playwright Firefox cannot open moz-extension:// options; tests seed sync from the page. */
const E2E_APPLY_SETTINGS = 'immich-ui-tweak:e2e-apply-settings';
const E2E_SETTINGS_APPLIED = 'immich-ui-tweak:e2e-settings-applied';
const E2E_TOKEN = 'immich-ui-tweak-e2e';

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== E2E_APPLY_SETTINGS || data.token !== E2E_TOKEN) {
    return;
  }
  const payload = data.settings;
  if (!payload || typeof payload !== 'object') return;
  chrome.storage.sync.set(payload, () => {
    void chrome.runtime.lastError;
    window.dispatchEvent(new CustomEvent(E2E_SETTINGS_APPLIED));
  });
});
