import { MAX_ENABLED_URLS } from './storage-types';

/** Normalize for stable storage and display (trim, drop trailing slash except root). */
export function normalizeInstanceUrl(url: string): string {
  const t = url.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    let path = u.pathname;
    if (path === '/' || path === '') {
      path = '';
    } else if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return t.replace(/\/+$/, '') || t;
  }
}

/**
 * Path from an allowlist entry must match the page path at a segment boundary:
 * `/immich` matches `/immich` and `/immich/...` but not `/immichacked`.
 */
function pathnameAllowedByPrefix(pagePathname: string, allowedPathname: string): boolean {
  const allowed = allowedPathname.replace(/\/+$/, '') || '/';
  if (allowed === '/') {
    return true;
  }
  if (pagePathname === allowed) {
    return true;
  }
  return pagePathname.startsWith(`${allowed}/`);
}

/**
 * True when `href` is under the same origin as the entry and the path prefix matches
 * with host/path boundaries (avoids `example.com` matching `example.com.evil` or `/a` matching `/ab`).
 */
export function isUrlEnabled(href: string, enabledPrefixes: string[]): boolean {
  if (!enabledPrefixes.length) return false;

  let page: URL;
  try {
    page = new URL(href);
  } catch {
    return false;
  }

  for (const raw of enabledPrefixes) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let allowed: URL;
    try {
      allowed = new URL(trimmed);
    } catch {
      continue;
    }

    if (allowed.origin !== page.origin) {
      continue;
    }
    if (!pathnameAllowedByPrefix(page.pathname, allowed.pathname)) {
      continue;
    }
    return true;
  }

  return false;
}

/**
 * Chrome `registerContentScripts` match patterns for the user's Immich instances.
 * Kept in sync with {@link isUrlEnabled} (origin + path segment prefix, no `/a` → `/ab` bleed).
 */
export function enabledUrlsToMatchPatterns(enabledUrls: string[]): string[] {
  const out = new Set<string>();
  for (const raw of enabledUrls.slice(0, MAX_ENABLED_URLS)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let u: URL;
    try {
      u = new URL(trimmed);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      continue;
    }

    const scheme = u.protocol === 'https:' ? 'https' : 'http';
    const hostPort = u.host;
    const pathname = u.pathname || '/';
    const path =
      pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

    const origin = `${scheme}://${hostPort}`;

    if (path === '' || path === '/') {
      out.add(`${origin}/*`);
      continue;
    }

    out.add(`${origin}${path}`);
    out.add(`${origin}${path}/`);
    out.add(`${origin}${path}/*`);
  }
  return [...out];
}
