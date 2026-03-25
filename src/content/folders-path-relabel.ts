import {
  mappedFolderDisplayLabel,
  parentServerFolderPath,
  parseFoldersPathQuery,
  pathsUnchangedByMappings,
} from '../shared/folders-path-label';
import { filterCompleteMappings } from '../shared/path-mapping';
import type { ExtensionSettings } from '../shared/storage-types';

/**
 * Immich `(user)/folders/...` routes (see `web` Route.folders).
 */
function isFoldersExplorerRoute(): boolean {
  const p = location.pathname;
  return p === '/folders' || p.startsWith('/folders/');
}

/**
 * Breadcrumb bar: `breadcrumbs.svelte` — `nav.flex.items-center.py-2`, segment links in `ol.flex`.
 * Sidebar tree: `tree.svelte` / `tree-items.svelte` — `ul.list-none.ms-2`, label in `span.font-mono`.
 * Does not match `tree-item-thumbnails.svelte` (uses `<button>`, not `a[href]`).
 */
function relabelFolderAnchor(
  anchor: HTMLAnchorElement,
  mappings: ExtensionSettings['pathMappings'],
  textEl: HTMLElement,
): void {
  const S = parseFoldersPathQuery(anchor.href);
  if (S === null) {
    return;
  }
  const S_parent = parentServerFolderPath(S);
  if (pathsUnchangedByMappings(S, S_parent, mappings)) {
    return;
  }
  const next = mappedFolderDisplayLabel(S, S_parent, mappings);
  if (textEl.textContent?.trim() !== next) {
    textEl.textContent = next;
  }
}

/**
 * Rewrites visible folder labels on the Folders explorer page only.
 * Never sets `href`, `search`, or other navigation attributes.
 */
export function applyFoldersPathRelabel(settings: ExtensionSettings): void {
  if (!isFoldersExplorerRoute()) {
    return;
  }
  if (filterCompleteMappings(settings.pathMappings).length === 0) {
    return;
  }

  const { pathMappings } = settings;

  const breadcrumbNav = document.querySelector('nav.flex.items-center.py-2');
  if (breadcrumbNav) {
    for (const a of breadcrumbNav.querySelectorAll<HTMLAnchorElement>(
      'ol.flex a[href*="/folders"][href*="path="]',
    )) {
      relabelFolderAnchor(a, pathMappings, a);
    }

    const currentCrumb = breadcrumbNav.querySelector<HTMLParagraphElement>(
      'ol.flex li p.cursor-default.whitespace-pre-wrap',
    );
    if (currentCrumb) {
      const S = parseFoldersPathQuery(location.href);
      if (S !== null) {
        const Sp = parentServerFolderPath(S);
        if (!pathsUnchangedByMappings(S, Sp, pathMappings)) {
          const next = mappedFolderDisplayLabel(S, Sp, pathMappings);
          if (currentCrumb.textContent?.trim() !== next) {
            currentCrumb.textContent = next;
          }
        }
      }
    }
  }

  for (const span of document.querySelectorAll<HTMLSpanElement>(
    'ul.list-none.ms-2 a[href*="/folders"] span.font-mono.whitespace-pre-wrap',
  )) {
    const a = span.closest('a');
    if (!a?.href) {
      continue;
    }
    relabelFolderAnchor(a, pathMappings, span);
  }
}
