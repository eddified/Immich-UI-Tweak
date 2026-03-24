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
