/**
 * Remap `/` from Immich's command palette to focusing the main navbar search input
 * (`#main-search-bar` in navigation-bar.svelte). Uses capture phase so we run before
 * in-page shortcut handlers.
 */

const MAIN_SEARCH_ID = 'main-search-bar';
const MOBILE_SEARCH_BUTTON_ID = 'search-button';

export function isPlainSlashKey(ev: KeyboardEvent): boolean {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  return ev.key === '/' || ev.code === 'Slash';
}

function isTextLikeInput(el: HTMLInputElement): boolean {
  const t = el.type;
  return (
    t === 'text' ||
    t === 'search' ||
    t === 'url' ||
    t === 'email' ||
    t === 'password' ||
    t === 'tel' ||
    t === 'number' ||
    t === ''
  );
}

/** When true, `/` should reach the page (typing in a field, etc.). */
export function shouldPassSlashThrough(active: Element | null): boolean {
  if (!(active instanceof Element)) return false;
  if (active instanceof HTMLTextAreaElement) return true;
  if (active instanceof HTMLSelectElement) return true;
  if (active instanceof HTMLElement && active.isContentEditable) return true;
  if (active instanceof HTMLInputElement) {
    if (active.id === MAIN_SEARCH_ID) return true;
    if (isTextLikeInput(active)) return true;
  }
  return false;
}

function isUsableSearchInput(el: HTMLInputElement | null): el is HTMLInputElement {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  return Boolean(el.offsetParent);
}

function activateMobileSearchFallback(): boolean {
  const btn = document.getElementById(MOBILE_SEARCH_BUTTON_ID);
  if (!(btn instanceof HTMLElement)) return false;
  if (typeof btn.checkVisibility === 'function' && !btn.checkVisibility()) {
    return false;
  }
  btn.click();
  return true;
}

function onSlashKeydown(ev: KeyboardEvent): void {
  if (ev.repeat || !isPlainSlashKey(ev)) return;
  if (shouldPassSlashThrough(document.activeElement)) return;

  const input = document.getElementById(MAIN_SEARCH_ID);
  if (input instanceof HTMLInputElement && isUsableSearchInput(input)) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    input.focus();
    return;
  }

  if (activateMobileSearchFallback()) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
}

export function installSlashFocusSearch(isExtensionActive: () => boolean): () => void {
  const handler = (ev: KeyboardEvent): void => {
    if (!isExtensionActive()) return;
    onSlashKeydown(ev);
  };
  document.addEventListener('keydown', handler, true);
  return () => {
    document.removeEventListener('keydown', handler, true);
  };
}
