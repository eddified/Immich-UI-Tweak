import { applyPathMappings, filterCompleteMappings } from './path-mapping';
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
 * True when no mapping row applies to `S` or `S_parent` (both stay the same after {@link applyPathMappings}).
 * In that case we must not overwrite Immich text: labels can be **collapsed** multi-segment `node.value`
 * strings, while our derived label uses single-segment parents and would truncate visible path info.
 */
/**
 * Deepest path among known explorer `path=` targets (breadcrumb and/or sidebar) that is a strict
 * prefix of `S`. If none, returns `''`. Do **not** use POSIX dirname: e.g. `/data/upload` with no
 * `/data` crumb would wrongly use `/data` as parent and break mapping to `/z`.
 */
export function deepestBreadcrumbParentPrefix(S: string, candidateParentPaths: string[]): string {
  let best = '';
  const s = pathKey(S);
  for (const raw of candidateParentPaths) {
    const pk = pathKey(raw);
    if (!pk || pk === s) continue;
    if (s.startsWith(`${pk}/`) || (pk === '/' && s !== '/')) {
      if (pk.length > best.length) best = pk;
    }
  }
  return best;
}

function pathKey(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '';
}

export function pathsUnchangedByMappings(
  S: string,
  S_parent: string,
  mappings: PathMappingRow[],
): boolean {
  if (filterCompleteMappings(mappings).length === 0) {
    return true;
  }
  const s = normalizeSeparators(S.trim());
  const sp = normalizeSeparators(S_parent.trim());
  const m = normalizeSeparators(applyPathMappings(S.trim(), mappings));
  const mp = normalizeSeparators(applyPathMappings(S_parent.trim(), mappings));
  return m === s && mp === sp;
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

  /* Root-relative folder (no mapped parent): show full mapped path so e.g. `/z` is not reduced to `z`. */
  if (!mp) {
    return m || fallback;
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
