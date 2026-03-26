import { parseCurrentUserIdFromMeJson } from './shared/immich-user';
import { parseOriginalPathFromAssetJson, parseOwnerIdFromAssetJson } from './shared/asset-original-path';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './shared/storage-types';
import { enabledUrlsToMatchPatterns } from './shared/url-match';

const CONTENT_SCRIPT_ID = 'immich-ui-tweak-content';
const INJECTED_MAIN_CS_ID = 'immich-ui-tweak-injected-main';

function loadEnabledUrlsFromSync(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.enabledUrls], (sync) => {
      const enabledUrls = Array.isArray(sync[STORAGE_KEYS.enabledUrls])
        ? (sync[STORAGE_KEYS.enabledUrls] as string[])
        : DEFAULT_SETTINGS.enabledUrls;
      resolve(enabledUrls);
    });
  });
}

/**
 * Register isolated `content.js` + main-world `injected.js` only for configured Immich URLs
 * (same scope as `isUrlEnabled`), instead of every http(s) page.
 */
async function syncRegisteredContentScripts(): Promise<void> {
  const enabledUrls = await loadEnabledUrlsFromSync();
  const matches = enabledUrlsToMatchPatterns(enabledUrls);

  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [CONTENT_SCRIPT_ID, INJECTED_MAIN_CS_ID],
    });
  } catch {
    /* not registered */
  }

  if (matches.length === 0) {
    return;
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches,
        js: ['content.js'],
        css: ['content.css'],
        runAt: 'document_start',
        allFrames: false,
      },
      {
        id: INJECTED_MAIN_CS_ID,
        matches,
        js: ['injected.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ]);
  } catch {
    /* Older Chromium without `world` on registerContentScripts — isolated + message fallback */
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: CONTENT_SCRIPT_ID,
          matches,
          js: ['content.js'],
          css: ['content.css'],
          runAt: 'document_start',
          allFrames: false,
        },
      ]);
    } catch {
      /* ignore */
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void syncRegisteredContentScripts();
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch(() => {
      /* ignore */
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void syncRegisteredContentScripts();
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage().catch(() => {
    /* ignore */
  });
});

void syncRegisteredContentScripts();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes[STORAGE_KEYS.enabledUrls]) {
    void syncRegisteredContentScripts();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'immich-ui-tweak:fetch-me-main') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: 'no-tab' });
      return false;
    }
    void chrome.scripting
      .executeScript({
        target: { tabId, allFrames: false },
        world: 'MAIN',
        func: async () => {
          const meUrl = new URL('/api/users/me', location.origin);
          const page = new URL(location.href);
          const key = page.searchParams.get('key');
          const slug = page.searchParams.get('slug');
          if (key) meUrl.searchParams.set('key', key);
          if (slug) meUrl.searchParams.set('slug', slug);
          const r = await fetch(meUrl.href, { credentials: 'include' });
          if (!r.ok) return { ok: false as const, status: r.status };
          return { ok: true as const, body: await r.json() };
        },
      })
      .then((results) => {
        const raw = results?.[0]?.result as
          | { ok: true; body: unknown }
          | { ok: false; status?: number }
          | undefined;
        if (raw && 'ok' in raw && raw.ok && 'body' in raw) {
          const userId = parseCurrentUserIdFromMeJson(raw.body);
          sendResponse({ ok: Boolean(userId), userId: userId ?? null });
        } else {
          sendResponse({ ok: false });
        }
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'immich-ui-tweak:fetch-asset-main' && typeof message.assetId === 'string') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: 'no-tab' });
      return false;
    }
    void chrome.scripting
      .executeScript({
        target: { tabId, allFrames: false },
        world: 'MAIN',
        func: async (assetId: string) => {
          const assetUrl = new URL(`/api/assets/${encodeURIComponent(assetId)}`, location.origin);
          const page = new URL(location.href);
          const key = page.searchParams.get('key');
          const slug = page.searchParams.get('slug');
          if (key) assetUrl.searchParams.set('key', key);
          if (slug) assetUrl.searchParams.set('slug', slug);
          const r = await fetch(assetUrl.href, { credentials: 'include' });
          if (!r.ok) return { ok: false as const, status: r.status };
          return { ok: true as const, body: await r.json() };
        },
        args: [message.assetId],
      })
      .then((results) => {
        const raw = results?.[0]?.result as
          | { ok: true; body: unknown }
          | { ok: false; status?: number }
          | undefined;
        if (raw && 'ok' in raw && raw.ok && 'body' in raw) {
          const ownerId = parseOwnerIdFromAssetJson(raw.body);
          const originalPath = parseOriginalPathFromAssetJson(raw.body);
          sendResponse({
            ok: Boolean(ownerId && originalPath),
            ownerId: ownerId ?? null,
            originalPath: originalPath ?? null,
          });
        } else {
          sendResponse({ ok: false });
        }
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type !== 'immich-ui-tweak:inject-main') {
    return false;
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    sendResponse({ ok: false, error: 'no-tab' });
    return false;
  }

  chrome.scripting
    .executeScript({
      target: { tabId, allFrames: false },
      files: ['injected.js'],
      world: 'MAIN',
    })
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));

  return true;
});
