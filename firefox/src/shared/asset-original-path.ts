/**
 * Mirrors Immich web `getParentPath` + `Route.folders({ path })` for folder deep-links.
 */
export function parentDirForImmichFolderQuery(originalPath: string): string {
  const n = originalPath.trim().replace(/\\/g, '/');
  const last = n.lastIndexOf('/');
  if (last > 0) return n.slice(0, last);
  if (last === 0) return '/';
  return n;
}

export function folderPageHref(originalPath: string): string {
  const parent = parentDirForImmichFolderQuery(originalPath);
  const q = new URLSearchParams({ path: parent }).toString();
  return `${location.origin}/folders?${q}`;
}

export function folderPageHrefFromOrigin(origin: string, originalPath: string): string {
  const parent = parentDirForImmichFolderQuery(originalPath);
  const q = new URLSearchParams({ path: parent }).toString();
  return `${origin.replace(/\/$/, '')}/folders?${q}`;
}

export function parseOriginalPathFromAssetJson(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if ('data' in o && o.data !== undefined) {
    return parseOriginalPathFromAssetJson(o.data);
  }
  const p = o.originalPath;
  if (typeof p === 'string' && p.trim()) return p;
  return null;
}

export function parseOwnerIdFromAssetJson(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if ('data' in o && o.data !== undefined) {
    return parseOwnerIdFromAssetJson(o.data);
  }
  const id = o.ownerId;
  if (typeof id === 'string' && id.trim()) return id.toLowerCase();
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** GPS from Immich asset DTO (`exifInfo.latitude` / `longitude`). */
export function parseExifLatLngFromAssetJson(data: unknown): { lat: number; lng: number } | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if ('data' in o && o.data !== undefined) {
    return parseExifLatLngFromAssetJson(o.data);
  }
  const exif = o.exifInfo;
  if (exif != null && typeof exif === 'object') {
    const e = exif as Record<string, unknown>;
    const lat = toFiniteNumber(e.latitude);
    const lng = toFiniteNumber(e.longitude);
    if (lat !== null && lng !== null) return { lat, lng };
  }
  const latTop = toFiniteNumber(o.latitude);
  const lngTop = toFiniteNumber(o.longitude);
  if (latTop !== null && lngTop !== null) return { lat: latTop, lng: lngTop };
  return null;
}
