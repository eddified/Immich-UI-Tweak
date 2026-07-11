import type { PathMappingRow } from './storage-types';

/**
 * Immich (server) path side: trim, `\` → `/`, strip trailing `/` so `/a/b/` and `/a/b` are equivalent.
 * Preserves a sole `/` (filesystem root). Do not use for Docker **local** paths; use {@link normalizeLocalMappingPathSide}.
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

/** After trim: Windows mode when `\` count strictly exceeds `/` count. */
export function localPathIsWindowsMode(trimmedLocalPath: string): boolean {
  const backslashes = (trimmedLocalPath.match(/\\/g) ?? []).length;
  const slashes = (trimmedLocalPath.match(/\//g) ?? []).length;
  return backslashes > slashes;
}

/**
 * Normalize Docker **local** path for storage: trim; preserve `\` and `/`; strip trailing `\` (Windows)
 * or trailing `/` (Linux) per {@link localPathIsWindowsMode}; sole `/` preserved in Linux mode.
 */
export function normalizeLocalMappingPathSide(s: string): string {
  const t = s.trim();
  if (t === '') {
    return '';
  }
  if (localPathIsWindowsMode(t)) {
    return t.replace(/\\+$/, '');
  }
  const noTrailing = t.replace(/\/+$/, '');
  if (noTrailing === '') {
    return '/';
  }
  return noTrailing;
}

export function normalizePathMappingRow(r: PathMappingRow): PathMappingRow {
  return {
    localPath: normalizeLocalMappingPathSide(r.localPath),
    immichPath: normalizeMappingPathSide(r.immichPath),
  };
}

function normalizeComparablePath(s: string): string {
  return s.trim().replace(/\\/g, '/');
}

/** Immich-derived suffix after prefix replace: POSIX unchanged; Windows maps `/` → `\`. */
export function formatImmichSuffixForLocalMode(suffix: string, windowsMode: boolean): string {
  if (!windowsMode) {
    return suffix;
  }
  return suffix.replace(/\//g, '\\');
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
      const windowsMode = localPathIsWindowsMode(localPath);
      if (work === immichPath) {
        return localPath;
      }
      const suffix = work.slice(immichPath.length);
      return localPath + formatImmichSuffixForLocalMode(suffix, windowsMode);
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
