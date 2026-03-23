/** Normalize for stable prefix comparison (trim, drop trailing slash except root). */
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

export function isUrlEnabled(href: string, enabledPrefixes: string[]): boolean {
  if (!enabledPrefixes.length) return false;
  for (const raw of enabledPrefixes) {
    const prefix = normalizeInstanceUrl(raw);
    if (!prefix) continue;
    if (href.startsWith(prefix)) return true;
    if (href.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
