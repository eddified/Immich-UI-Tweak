import { applyPathMappings } from './path-mapping';
import type { PathMappingRow } from './storage-types';

/**
 * Parse `path` query from an Immich `/folders` URL (any nested path under `/folders`).
 * Returns `null` if missing or empty (caller skips relabel).
 */
export function parseFoldersPathQuery(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'https://placeholder.invalid');
  } catch {
    return null;
  }
  if (!url.pathname.startsWith('/folders')) {
    return null;
  }
  const raw = url.searchParams.get('path');
  if (raw === null || raw === '') {
    return null;
  }
  return raw;
}

/**
 * Parent folder path for a server-side folder path (POSIX-style).
 * `/data` → `''`; `/data/upload` → `/data`.
 */
export function parentServerFolderPath(path: string): string {
  const n = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!n || n === '/') {
    return '';
  }
  const i = n.lastIndexOf('/');
  if (i <= 0) {
    return '';
  }
  return n.slice(0, i);
}

/** Last path segment for fallback labels (Immich segment text). */
export function lastServerPathSegment(path: string): string {
  const n = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!n) {
    return '';
  }
  const i = n.lastIndexOf('/');
  if (i < 0) {
    return n;
  }
  return n.slice(i + 1);
}

function normalizeSeparators(s: string): string {
  return s.replace(/\\/g, '/');
}

/**
 * Visible label for one folder crumb: mapped tail of `S` relative to mapped `S_parent`.
 * Falls back to {@link lastServerPathSegment}(`S`) when mapping cannot produce a relative tail.
 */
export function mappedFolderDisplayLabel(
  S: string,
  S_parent: string,
  mappings: PathMappingRow[],
): string {
  const fallback = lastServerPathSegment(S);
  const M = applyPathMappings(S.trim(), mappings);
  const M_parent = applyPathMappings(S_parent.trim(), mappings);
  const m = normalizeSeparators(M);
  const mp = normalizeSeparators(M_parent);

  if (!mp) {
    const t = m.replace(/^\/+/, '');
    return t || fallback;
  }

  const mpSlash = mp.endsWith('/') ? mp : `${mp}/`;
  if (m === mp || m === `${mp}/`) {
    return fallback;
  }
  if (m.startsWith(mpSlash)) {
    const rest = m.slice(mpSlash.length);
    return rest.replace(/^\/+/, '') || fallback;
  }

  return fallback;
}
