/**
 * Immich profile-image URLs (see web/src/lib/utils.ts getProfileImageUrl + authManager.params).
 */

import { appendSharedLinkSearchParams } from './immich-user';

/** e.g. https://host/api/users */
export function resolveImmichUsersApiBase(): string {
  const imgs = document.querySelectorAll<HTMLImageElement>('img[src*="/users/"][src*="profile-image"]');
  for (const img of imgs) {
    try {
      const u = new URL(img.currentSrc || img.src, location.href);
      const m = u.pathname.match(/^(.+\/users)\/[^/]+\/profile-image/);
      if (m) {
        return `${u.origin}${m[1]}`;
      }
    } catch {
      /* ignore */
    }
  }
  return `${location.origin}/api/users`;
}

/** Absolute URL including shared-link key/slug and optional cache buster (web uses updatedAt). */
export function profileImageAbsoluteUrl(ownerId: string, updatedAt?: string): string {
  const base = resolveImmichUsersApiBase();
  const url = new URL(
    `${base.replace(/\/$/, '')}/${encodeURIComponent(ownerId)}/profile-image`,
    location.href,
  );
  appendSharedLinkSearchParams(url);
  if (updatedAt) url.searchParams.set('updatedAt', updatedAt);
  return url.href;
}
