import { parseCurrentUserIdFromMeJson } from './shared/immich-user';
import { parseOriginalPathFromAssetJson, parseOwnerIdFromAssetJson } from './shared/asset-original-path';

const INJECTED_MAIN_CS_ID = 'immich-ui-helper-injected-main';

/**
 * Register `injected.js` in the page's main world at `document_start` so `fetch` is patched
 * before Immich's first API call. Message-based `executeScript` from the isolated content script
 * can run too late on cold loads (race with getAssetInfo).
 */
async function registerMainWorldInjected(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [INJECTED_MAIN_CS_ID] });
  } catch {
    /* not registered */
  }
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: INJECTED_MAIN_CS_ID,
        matches: ['http://*/*', 'https://*/*'],
        js: ['injected.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ]);
  } catch {
    /* Older Chromium without `world` on registerContentScripts — content script fallback only */
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void registerMainWorldInjected();
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch(() => {
      /* ignore */
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void registerMainWorldInjected();
});

void registerMainWorldInjected();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'immich-ui-helper:fetch-me-main') {
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

  if (message?.type === 'immich-ui-helper:fetch-asset-main' && typeof message.assetId === 'string') {
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

  if (message?.type !== 'immich-ui-helper:inject-main') {
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
    .catch((err: Error) => sendResponse({ ok: false, error: String(err.message) }));

  return true;
});
