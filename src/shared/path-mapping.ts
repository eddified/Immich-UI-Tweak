import type { PathMappingRow } from './storage-types';

/**
 * Trim, `\` → `/`, strip trailing `/` so `/a/b/` and `/a/b` are equivalent.
 * Preserves a sole `/` (filesystem root).
 */
export function normalizeMappingPathSide(s: string): string {
  const t = s.trim().replace(/\\/g, '/');
  if (t === '') {
    return '';
  }
  const noTrailing = t.replace(/\/+$/, '');
  if (noTrailing === '') {
    return '/';
  }
  return noTrailing;
}

export function normalizePathMappingRow(r: PathMappingRow): PathMappingRow {
  return {
    localPath: normalizeMappingPathSide(r.localPath),
    immichPath: normalizeMappingPathSide(r.immichPath),
  };
}

function normalizeComparablePath(s: string): string {
  return s.trim().replace(/\\/g, '/');
}

/**
 * True if `fullPath` is exactly `prefix`, or continues under it at a segment boundary.
 * `/a/b` is not a prefix of `/a/bcd.jpg` or `/a/bd` (avoids Docker-style `/data/up` matching `/data/upload/...`).
 */
export function pathPrefixMatches(fullPath: string, prefix: string): boolean {
  const f = normalizeComparablePath(fullPath);
  const p = normalizeMappingPathSide(prefix);
  if (!p) {
    return false;
  }
  if (p === '/') {
    return f.startsWith('/');
  }
  if (f === p) {
    return true;
  }
  return f.startsWith(`${p}/`);
}

/** Valid rows only: both sides non-empty after normalization. */
export function filterCompleteMappings(rows: PathMappingRow[]): PathMappingRow[] {
  return rows.map(normalizePathMappingRow).filter((r) => r.localPath !== '' && r.immichPath !== '');
}

/** Longest immich path first for prefix replacement. */
export function sortMappingsForReplace(mappings: PathMappingRow[]): PathMappingRow[] {
  const complete = filterCompleteMappings(mappings);
  return [...complete].sort((a, b) => b.immichPath.length - a.immichPath.length);
}

/**
 * Replace leading immich path with local path (longest path-prefix match wins).
 * Idempotent if local paths do not themselves start with an immich path-prefix.
 */
export function applyPathMappings(original: string, mappings: PathMappingRow[]): string {
  const sorted = sortMappingsForReplace(mappings);
  const work = normalizeComparablePath(original);
  for (const { localPath, immichPath } of sorted) {
    if (pathPrefixMatches(work, immichPath)) {
      if (work === immichPath) {
        return localPath;
      }
      return localPath + work.slice(immichPath.length);
    }
  }
  return original;
}

/**
 * True if `#detail-panel` folder-link text still looks like a displayed file path after mapping.
 * Immich shows POSIX server paths; Docker mappings may use local roots without a leading slash (`A/...`).
 */
export function folderLinkTextLooksLikePathDisplay(text: string, mappings: PathMappingRow[]): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith('/') || t.includes(':\\')) return true;
  for (const { localPath } of filterCompleteMappings(mappings)) {
    if (!localPath) continue;
    if (t === localPath || pathPrefixMatches(t, localPath)) return true;
  }
  if (/[\\/]/.test(t) && !/^https?:\/\//i.test(t)) return true;
  return false;
}
