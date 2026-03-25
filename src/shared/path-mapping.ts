import type { PathMappingRow } from './storage-types';

/** Valid rows only: both sides non-empty after trim. */
export function filterCompleteMappings(rows: PathMappingRow[]): PathMappingRow[] {
  return rows.filter((r) => r.localPath.trim() !== '' && r.immichPath.trim() !== '');
}

/** Longest immich path first for prefix replacement. */
export function sortMappingsForReplace(mappings: PathMappingRow[]): PathMappingRow[] {
  const complete = filterCompleteMappings(mappings);
  return [...complete].sort((a, b) => b.immichPath.trim().length - a.immichPath.trim().length);
}

/**
 * Replace leading immich path with local path (longest prefix wins).
 * Idempotent if local paths do not themselves start with an immich prefix.
 */
export function applyPathMappings(original: string, mappings: PathMappingRow[]): string {
  const sorted = sortMappingsForReplace(mappings);
  let out = original;
  for (const { localPath, immichPath } of sorted) {
    const imm = immichPath.trim();
    const loc = localPath.trim();
    if (out.startsWith(imm)) {
      return loc + out.slice(imm.length);
    }
  }
  return out;
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
    const loc = localPath.trim();
    if (!loc) continue;
    if (t === loc || t.startsWith(`${loc}/`) || t.startsWith(`${loc}\\`)) return true;
  }
  if (/[\\/]/.test(t) && !/^https?:\/\//i.test(t)) return true;
  return false;
}
