/**
 * Immich user API + avatar styling (aligned with web UserAvatar: profileImagePath + name[0] + avatarColor).
 */

export type ImmichUserPublic = {
  id: string;
  name: string;
  email?: string;
  profileImagePath: string;
  avatarColor: string;
  profileChangedAt?: string;
};

/** Match user-avatar.svelte Tailwind bg-* (approximate for extension CSS). */
export const AVATAR_COLOR_BG: Record<string, string> = {
  primary: 'rgb(66 80 228)',
  pink: 'rgb(244 114 182)',
  red: 'rgb(239 68 68)',
  yellow: 'rgb(234 179 8)',
  blue: 'rgb(59 130 246)',
  green: 'rgb(22 163 74)',
  purple: 'rgb(147 51 234)',
  orange: 'rgb(234 88 12)',
  gray: 'rgb(107 114 128)',
  amber: 'rgb(217 119 6)',
};

export function avatarInitialLetter(name: string, email?: string): string {
  const s = (name || email || '?').trim();
  const ch = s[0];
  return ch ? ch.toUpperCase() : '?';
}

export function appendSharedLinkSearchParams(target: URL): void {
  const page = new URL(location.href);
  const key = page.searchParams.get('key');
  const slug = page.searchParams.get('slug');
  if (key) target.searchParams.set('key', key);
  if (slug) target.searchParams.set('slug', slug);
}

/** GET /api/users/:id — same auth as Immich web. */
export function userDetailAbsoluteUrl(ownerId: string): string {
  const base = `${location.origin}/api/users`;
  const url = new URL(`${base.replace(/\/$/, '')}/${encodeURIComponent(ownerId)}`, location.href);
  appendSharedLinkSearchParams(url);
  return url.href;
}

/** UUID in `/api/users/{id}/profile-image` (navbar UserAvatar uses the same URL shape as our badges). */
const PROFILE_IMAGE_PATH_USER_RE =
  /\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/profile-image/i;

/**
 * Parse user id from a profile-image `img.src` / `currentSrc` (e.g. Immich top-nav avatar).
 * No network — reuses the URL the web app already requested.
 */
export function parseUserIdFromProfileImageUrl(src: string, baseHref?: string): string | null {
  try {
    const base = baseHref ?? (typeof location !== 'undefined' ? location.href : 'https://localhost/');
    const path = new URL(src, base).pathname;
    const m = path.match(PROFILE_IMAGE_PATH_USER_RE);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** `GET /api/users/me` JSON (or `{ data: user }`) — same shape as other user DTOs when `name` is present. */
export function parseCurrentUserIdFromMeJson(body: unknown): string | null {
  const u = parseUserJson(body);
  if (u) return u.id.toLowerCase();
  if (body != null && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const inner = (o.data as Record<string, unknown> | undefined) ?? o;
    const id = inner.id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return id.toLowerCase();
  }
  return null;
}

/** Unwrap Nest / OpenAPI `{ data: T }` or plain `T`. */
export function parseUserJson(body: unknown): ImmichUserPublic | null {
  if (body == null || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const u = (o.data as Record<string, unknown> | undefined) ?? o;
  if (typeof u.id !== 'string' || typeof u.name !== 'string') return null;
  return {
    id: u.id,
    name: u.name,
    email: typeof u.email === 'string' ? u.email : undefined,
    profileImagePath: typeof u.profileImagePath === 'string' ? u.profileImagePath : '',
    avatarColor: typeof u.avatarColor === 'string' ? u.avatarColor : 'gray',
    profileChangedAt: typeof u.profileChangedAt === 'string' ? u.profileChangedAt : undefined,
  };
}
