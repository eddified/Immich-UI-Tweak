import {
  type ImmichUserPublic,
  AVATAR_COLOR_BG,
  avatarInitialLetter,
  parseUserIdFromProfileImageUrl,
  parseUserJson,
  userDetailAbsoluteUrl,
} from '../shared/immich-user';
import { profileImageAbsoluteUrl, resolveImmichUsersApiBase } from '../shared/profile-image';
import { applyPathMappings } from '../shared/path-mapping';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type ExtensionSettings,
  type PathMappingRow,
} from '../shared/storage-types';
import { isUrlEnabled } from '../shared/url-match';

const MSG_SOURCE = 'immich-ui-helper';
const MSG_TYPE = 'ownerPairs';
const MSG_CURRENT_USER = 'currentUser';

const SHOW_FILE_LOCATION_LABELS = [
  'Show file location',
  'Dateipfad anzeigen',
  'Afficher le chemin du fichier',
  'Mostrar ubicación del archivo',
  'ファイルの場所を表示',
];

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
/** Detail panel file path: avoid re-clicking "show file location" after the user hides the path (runs every rAF). */
let detailPanelMounted = false;
let fileLocationAssetKey = '';
let sawPathLinkThisAsset = false;
let didAutoClickShowLocation = false;
let userDismissedPathThisAsset = false;

const ownerByAsset = new Map<string, string>();
/** Logged-in user id from navbar profile-image URL and/or Immich's GET /api/users/me (observed via injected fetch). */
let sessionUserId: string | undefined = undefined;
const userByOwnerId = new Map<string, ImmichUserPublic>();
const userFetchInflight = new Map<string, Promise<ImmichUserPublic | null>>();
/** Profile photo blobs when user.profileImagePath is set (UserAvatar shows img). */
const profileBlobUrlByOwner = new Map<string, string>();
let injectRequested = false;
let rafScheduled = false;

function readSettingsFromStorage(cb: (s: ExtensionSettings) => void): void {
  chrome.storage.sync.get(
    [
      STORAGE_KEYS.enabledUrls,
      STORAGE_KEYS.pathMappings,
      STORAGE_KEYS.showPartnerIcons,
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
      cb({
        enabledUrls: enabledUrls.slice(0, 32),
        pathMappings,
        showPartnerIcons,
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

/** Early hook so Immich fetches after SPA boot are intercepted (storage/URL checks stay async). */
requestMainWorldInject();

function scheduleDomUpdate(): void {
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

function shouldShowPartnerUploader(ownerId: string): boolean {
  if (sessionUserId === undefined) return true;
  return ownerId.toLowerCase() !== sessionUserId;
}

function removeExtensionElements(): void {
  for (const url of profileBlobUrlByOwner.values()) {
    URL.revokeObjectURL(url);
  }
  profileBlobUrlByOwner.clear();
  userByOwnerId.clear();
  userFetchInflight.clear();
  sessionUserId = undefined;

  document.querySelectorAll('.immich-ui-helper-uploader-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.immich-ui-helper-viewer-avatar').forEach((el) => el.remove());
  document.querySelectorAll('[data-asset].immich-ui-helper-thumb-anchor').forEach((el) => {
    el.classList.remove('immich-ui-helper-thumb-anchor');
  });

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

async function ensureProfilePhotoBlob(ownerId: string, user: ImmichUserPublic): Promise<string | null> {
  const hit = profileBlobUrlByOwner.get(ownerId);
  if (hit) return hit;
  const url = profileImageAbsoluteUrl(ownerId, user.profileChangedAt);
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const burl = URL.createObjectURL(blob);
    profileBlobUrlByOwner.set(ownerId, burl);
    return burl;
  } catch {
    return null;
  }
}

function renderLetterFigure(
  figure: HTMLElement,
  letter: string,
  avatarColor: string,
  size: 'thumb' | 'viewer',
): void {
  figure.className = `immich-ui-helper-avatar immich-ui-helper-avatar--${size} immich-ui-helper-avatar--letter`;
  figure.style.backgroundColor = AVATAR_COLOR_BG[avatarColor] ?? AVATAR_COLOR_BG.gray;
  figure.style.color = '#f8fafc';
  const span = document.createElement('span');
  span.className = 'immich-ui-helper-avatar-letter';
  span.textContent = letter;
  span.dataset.immichUiHelperAvatarLetter = letter;
  figure.replaceChildren(span);
}

function renderPhotoFigure(figure: HTMLElement, blobUrl: string, size: 'thumb' | 'viewer', user: ImmichUserPublic): void {
  figure.className = `immich-ui-helper-avatar immich-ui-helper-avatar--${size} immich-ui-helper-avatar--photo`;
  figure.style.backgroundColor = '';
  figure.style.color = '';
  const img = document.createElement('img');
  img.className = 'immich-ui-helper-avatar-img';
  img.alt = '';
  img.decoding = 'async';
  img.src = blobUrl;
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

  void (async () => {
    const jobOwner = ownerId;
    const user = await fetchUser(jobOwner);
    if (container.dataset.immichUiHelperBadgeOwner !== jobOwner || !container.isConnected) return;

    let figure = container.querySelector<HTMLElement>('figure.immich-ui-helper-avatar');
    if (!figure) {
      figure = document.createElement('figure');
      container.appendChild(figure);
    }

    if (!user) {
      renderLetterFigure(figure, '?', 'gray', size);
      return;
    }

    const hasPhoto = Boolean(user.profileImagePath?.trim());
    if (!hasPhoto) {
      renderLetterFigure(figure, avatarInitialLetter(user.name, user.email), user.avatarColor, size);
      return;
    }

    const blobUrl = await ensureProfilePhotoBlob(jobOwner, user);
    if (container.dataset.immichUiHelperBadgeOwner !== jobOwner || !container.isConnected) return;

    if (blobUrl) {
      renderPhotoFigure(figure, blobUrl, size, user);
    } else {
      renderLetterFigure(figure, avatarInitialLetter(user.name, user.email), user.avatarColor, size);
    }
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
    const assetId = thumb.dataset.asset;
    if (!assetId) return;

    const ownerId = ownerByAsset.get(assetId);
    if (!ownerId) {
      thumb.querySelector('.immich-ui-helper-uploader-overlay')?.remove();
      thumb.classList.remove('immich-ui-helper-thumb-anchor');
      return;
    }

    if (!shouldShowPartnerUploader(ownerId)) {
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
  return m ? m[1] : null;
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

  const ownerId = ownerByAsset.get(assetId);
  if (!ownerId) {
    actions.querySelector('.immich-ui-helper-viewer-avatar')?.remove();
    return;
  }

  if (!shouldShowPartnerUploader(ownerId)) {
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
    fileLocationAssetKey = key;
    sawPathLinkThisAsset = false;
    didAutoClickShowLocation = false;
    userDismissedPathThisAsset = false;
  }
}

function findFolderPathLink(panel: HTMLElement): HTMLAnchorElement | null {
  const links = panel.querySelectorAll<HTMLAnchorElement>('a[href*="/folders"]');
  for (const a of links) {
    const t = a.textContent?.trim() ?? '';
    if (t.startsWith('/') || t.includes(':\\')) {
      return a;
    }
  }
  return null;
}

/** @returns true if a toggle button was clicked */
function clickShowFileLocationIfNeeded(panel: HTMLElement): boolean {
  if (findFolderPathLink(panel)) return false;

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

  const link = findFolderPathLink(panel);
  if (link) {
    sawPathLinkThisAsset = true;
    const raw = link.textContent?.trim() ?? '';
    if (!raw) return;
    const next = applyPathMappings(raw, settings.pathMappings);
    if (next !== raw) {
      link.textContent = next;
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
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const d = event.data as {
    source?: string;
    type?: string;
    userId?: string;
    pairs?: { assetId: string; ownerId: string }[];
  };
  if (d?.source !== MSG_SOURCE) return;

  if (d.type === MSG_CURRENT_USER && typeof d.userId === 'string') {
    sessionUserId = d.userId.toLowerCase();
    scheduleDomUpdate();
    return;
  }

  if (d.type === MSG_TYPE && Array.isArray(d.pairs)) {
    for (const p of d.pairs) {
      if (p.assetId && p.ownerId) {
        ownerByAsset.set(p.assetId, p.ownerId);
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
    changes[STORAGE_KEYS.showPartnerIcons]
  ) {
    readSettingsFromStorage((s) => {
      settings = s;
      scheduleDomUpdate();
    });
  }
});

readSettingsFromStorage((s) => {
  settings = s;
  if (!isUrlEnabled(location.href, settings.enabledUrls)) {
    return;
  }
  scheduleDomUpdate();
});
