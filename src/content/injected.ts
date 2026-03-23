import { parseOwnerPairsFromJson } from '../shared/bucket-parse';
import { parseJsonMaybeDoubleEncoded } from '../shared/json-parse';
import { parseCurrentUserIdFromMeJson } from '../shared/immich-user';

declare global {
  interface Window {
    __immichUiHelperFetchPatched?: boolean;
  }
}

const MSG_SOURCE = 'immich-ui-helper';
const MSG_TYPE = 'ownerPairs';
/** Emitted when Immich's own `fetch` returns `/api/users/me` — no extra requests from the extension. */
const MSG_CURRENT_USER = 'currentUser';

function shouldCloneApiResponse(urlStr: string): boolean {
  try {
    const u = new URL(urlStr, location.origin);
    const p = u.pathname;
    if (p === '/api/users/me') return true;
    if (p.includes('/api/timeline/bucket')) return true;
    if (p.includes('/api/search/metadata')) return true;
    if (/^\/api\/assets\/[0-9a-f-]{36}$/i.test(p)) return true;
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

function patchFetch(): void {
  if (window.__immichUiHelperFetchPatched) return;
  window.__immichUiHelperFetchPatched = true;

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

    if (!res.ok || !shouldCloneApiResponse(urlStr)) {
      return res;
    }

    try {
      const clone = res.clone();
      void clone.text().then((text) => {
        try {
          const data = parseJsonMaybeDoubleEncoded(text);
          emitPairs(data);
          emitCurrentUserFromMeResponse(urlStr, data);
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
