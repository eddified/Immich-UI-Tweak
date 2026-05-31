import {
  parseExifLatLngFromAssetJson,
  parseOriginalPathFromAssetJson,
  parseOwnerIdFromAssetJson,
} from '../shared/asset-original-path';
import { parseOwnerPairsFromJson } from '../shared/bucket-parse';
import { parseJsonMaybeDoubleEncoded } from '../shared/json-parse';
import { parseCurrentUserIdFromMeJson, parseUserJson } from '../shared/immich-user';

declare global {
  interface Window {
    __immichUiTweakFetchPatched?: boolean;
  }
}

const MSG_SOURCE = 'immich-ui-tweak';
const MSG_TYPE = 'ownerPairs';
/** Emitted when Immich's own `fetch` returns `/api/users/me` — no extra requests from the extension. */
const MSG_CURRENT_USER = 'currentUser';
/** Single-asset GET body (same auth/cookies as the page — content script fetch may not see session). */
const MSG_ASSET_DETAIL = 'assetDetail';
/** `GET /api/users/:id` user DTO — partner badge cache; avoids duplicate fetch from content script. */
const MSG_USER_DETAIL = 'userDetail';

function shouldCloneApiResponse(urlStr: string, method: string): boolean {
  try {
    const u = new URL(urlStr, location.origin);
    const p = u.pathname;
    const m = method.toUpperCase();
    if (p === '/api/users/me') return true;
    if (p.includes('/api/timeline/bucket')) return true;
    if (p.includes('/api/search/')) return true;
    if (/^\/api\/assets\/[0-9a-f-]{36}\/?$/i.test(p)) return true;
    if (/^\/api\/users\/[0-9a-f-]{36}\/?$/i.test(p)) return m === 'GET';
    return false;
  } catch {
    return false;
  }
}

function emitPairs(body: unknown): void {
  const pairs = parseOwnerPairsFromJson(body);
  if (!pairs.length) return;
  window.postMessage({ source: MSG_SOURCE, type: MSG_TYPE, pairs }, '*');
}

function emitCurrentUserFromMeResponse(urlStr: string, body: unknown): void {
  try {
    if (new URL(urlStr, location.origin).pathname !== '/api/users/me') return;
  } catch {
    return;
  }
  const id = parseCurrentUserIdFromMeJson(body);
  if (!id) return;
  window.postMessage({ source: MSG_SOURCE, type: MSG_CURRENT_USER, userId: id }, '*');
}

function emitAssetDetailFromResponse(urlStr: string, body: unknown): void {
  try {
    const u = new URL(urlStr, location.origin);
    const m = u.pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/?$/i);
    if (!m) return;
    const assetId = m[1].toLowerCase();
    const ownerId = parseOwnerIdFromAssetJson(body);
    const originalPath = parseOriginalPathFromAssetJson(body);
    const ll = parseExifLatLngFromAssetJson(body);
    if (!ownerId && !originalPath && !ll) return;
    const latitude = ll ? ll.lat : null;
    const longitude = ll ? ll.lng : null;
    window.postMessage(
      {
        source: MSG_SOURCE,
        type: MSG_ASSET_DETAIL,
        assetId,
        ownerId,
        originalPath,
        latitude,
        longitude,
      },
      '*',
    );
  } catch {
    /* ignore */
  }
}

function emitUserDetailFromResponse(urlStr: string, body: unknown): void {
  try {
    const u = new URL(urlStr, location.origin);
    const m = u.pathname.match(/^\/api\/users\/([0-9a-f-]{36})\/?$/i);
    if (!m) return;
    const ownerId = m[1].toLowerCase();
    const user = parseUserJson(body);
    if (!user) return;
    window.postMessage({ source: MSG_SOURCE, type: MSG_USER_DETAIL, ownerId, user }, '*');
  } catch {
    /* ignore */
  }
}

function patchFetch(): void {
  if (window.__immichUiTweakFetchPatched) return;
  window.__immichUiTweakFetchPatched = true;

  const orig = window.fetch.bind(window);
  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await orig(input, init);
    let urlStr = '';
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.href;
    } else if (input instanceof Request) {
      urlStr = input.url;
    }

    const method =
      typeof init?.method === 'string'
        ? init.method
        : input instanceof Request
          ? input.method
          : 'GET';

    if (!res.ok || !shouldCloneApiResponse(urlStr, method)) {
      return res;
    }

    try {
      const clone = res.clone();
      void clone.text().then((text) => {
        try {
          const data = parseJsonMaybeDoubleEncoded(text);
          emitPairs(data);
          emitCurrentUserFromMeResponse(urlStr, data);
          emitAssetDetailFromResponse(urlStr, data);
          emitUserDetailFromResponse(urlStr, data);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }

    return res;
  };
}

patchFetch();
