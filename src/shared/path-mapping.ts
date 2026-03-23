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
