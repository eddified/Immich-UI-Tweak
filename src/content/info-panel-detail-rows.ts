/**
 * Collapse/expand Immich asset info panel file / camera / lens rows by SVG icon identity.
 * Does not touch Date (calendar) or Place (map pin) rows — those use outer <button> wrappers.
 */
import {
  type DetailRowKind,
  type DetailRowsExplicit,
  type ExtensionSettings,
  detailRowPanelMode,
} from '../shared/storage-types';

const TOOLBAR_ATTR = 'data-immich-ui-tweak-detail-rows-toolbar';
const ROW_MARKER = 'data-immich-ui-tweak-detail-row';
/** Row is fully hidden (no icon strip / no way to expand). */
const ROW_HIDDEN_ATTR = 'data-immich-ui-tweak-detail-row-hidden';
const TOGGLE_KIND = 'data-immich-ui-tweak-detail-row-kind';
const TOGGLE_ACTION = 'data-immich-ui-tweak-detail-row-action';
/** Transparent hit target on top of shadow-hosted icons (isolated collapsed row). */
const EXPAND_HIT = 'data-immich-ui-tweak-expand-hit';
/** Sibling nodes we set `pointer-events:none` on so the expand overlay receives the hit. */
const EXPAND_PEER_PE = 'data-immich-ui-tweak-expand-peer-pe';

/** @mdi/js 7.4.47 — Immich web uses ^7.4.47 */
const MDI_IMAGE_OUTLINE =
  'M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z';
const MDI_CAMERA =
  'M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z';
const MDI_CAMERA_IRIS =
  'M13.73,15L9.83,21.76C10.53,21.91 11.25,22 12,22C14.4,22 16.6,21.15 18.32,19.75L14.66,13.4M2.46,15C3.38,17.92 5.61,20.26 8.45,21.34L12.12,15M8.54,12L4.64,5.25C3,7 2,9.39 2,12C2,12.68 2.07,13.35 2.2,14H9.69M21.8,10H14.31L14.6,10.5L19.36,18.75C21,16.97 22,14.6 22,12C22,11.31 21.93,10.64 21.8,10M21.54,9C20.62,6.07 18.39,3.74 15.55,2.66L11.88,9M9.4,10.5L14.17,2.24C13.47,2.09 12.75,2 12,2C9.6,2 7.4,2.84 5.68,4.25L9.34,10.6L9.4,10.5Z';

const MDI_IMAGE_OUTLINE_ALT = MDI_IMAGE_OUTLINE.replace('H17.5', 'H17');

function firstSvgPathD(row: HTMLElement): string | null {
  const svg = row.querySelector<SVGSVGElement>(':scope > div:first-child svg');
  const path = svg?.querySelector('path');
  const d = path?.getAttribute('d');
  return d?.trim() ?? null;
}

function classifyDetailRow(row: HTMLElement): DetailRowKind | null {
  const d = firstSvgPathD(row);
  if (!d) return null;
  if (d === MDI_IMAGE_OUTLINE || d === MDI_IMAGE_OUTLINE_ALT) return 'file';
  if (d === MDI_CAMERA) return 'camera';
  if (d === MDI_CAMERA_IRIS) return 'lens';
  return null;
}

function findDetailsBlock(panel: HTMLElement): HTMLElement | null {
  const section = panel.querySelector<HTMLElement>('section.relative.p-2');
  if (!section) return null;
  for (const child of section.children) {
    if (
      child instanceof HTMLElement &&
      child.tagName === 'DIV' &&
      child.classList.contains('px-4') &&
      child.classList.contains('py-4')
    ) {
      return child;
    }
  }
  return null;
}

function listTargetRows(container: HTMLElement): { kind: DetailRowKind; el: HTMLElement }[] {
  const out: { kind: DetailRowKind; el: HTMLElement }[] = [];
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.classList.contains('flex') || !child.classList.contains('gap-4') || !child.classList.contains('py-4')) {
      continue;
    }
    if (child.closest('button')) continue;
    const kind = classifyDetailRow(child);
    if (kind) out.push({ kind, el: child });
  }
  return out;
}

export function effectiveRowCollapsed(
  kind: DetailRowKind,
  settings: ExtensionSettings,
  explicit: DetailRowsExplicit,
): boolean {
  const mode = detailRowPanelMode(settings, kind);
  if (mode === 'hide') return false;
  const v = explicit[kind];
  if (typeof v === 'boolean') return v;
  return mode === 'collapse';
}

type Run = { start: number; end: number };

type DetailPanelApplyCache = {
  fp: string;
  rowRefs: HTMLElement[];
  toolbarExpandCount: number;
};

/** Avoid re-applying collapse UI on every MutationObserver tick (fights Svelte slide + causes a feedback loop). */
const detailPanelApplyCache = new WeakMap<HTMLElement, DetailPanelApplyCache>();

function collapseLayoutFingerprint(
  rowsAll: { kind: DetailRowKind; el: HTMLElement }[],
  items: { kind: DetailRowKind; collapsed: boolean; el: HTMLElement }[],
  runs: Run[],
  settings: ExtensionSettings,
  explicit: DetailRowsExplicit,
): string {
  const modeBits = rowsAll.map((r) => `${r.kind}:${detailRowPanelMode(settings, r.kind)}`).join('|');
  const rowBits = items.map((i) => `${i.kind}:${i.collapsed ? 'c' : 'e'}`).join(',');
  const runBits = runs.map((r) => `${r.start}-${r.end}`).join(';');
  const ex = (['file', 'camera', 'lens'] as const)
    .map((k) => {
      const v = explicit[k];
      return `${k}:${typeof v === 'boolean' ? (v ? '1' : '0') : '-'}`;
    })
    .join('');
  return `${modeBits}#${rowBits}#${runBits}#${ex}`;
}

function countToolbarExpandButtons(block: HTMLElement): number {
  const bar = block.querySelector(`[${TOOLBAR_ATTR}]`);
  if (!bar) return 0;
  return bar.querySelectorAll(`button[${TOGGLE_ACTION}="expand"]`).length;
}

function expectedToolbarExpandButtonCount(runs: Run[]): number {
  let n = 0;
  for (const r of runs) n += r.end - r.start + 1;
  return n;
}

function detailRowsDomMatchesIntent(
  panel: HTMLElement,
  block: HTMLElement,
  fp: string,
  rowRefs: HTMLElement[],
  rowsAll: { kind: DetailRowKind; el: HTMLElement }[],
  runs: Run[],
  items: { kind: DetailRowKind; collapsed: boolean; el: HTMLElement }[],
  settings: ExtensionSettings,
): boolean {
  const prev = detailPanelApplyCache.get(panel);
  if (!prev || prev.fp !== fp) return false;
  if (prev.rowRefs.length !== rowRefs.length || !prev.rowRefs.every((e, i) => e === rowRefs[i])) return false;
  const wantTb = expectedToolbarExpandButtonCount(runs);
  if (prev.toolbarExpandCount !== wantTb) return false;
  if (countToolbarExpandButtons(block) !== wantTb) return false;
  const wantIsolated = items.filter((it, i) => it.collapsed && !inAnyRun(i, runs)).length;
  const hits = block.querySelectorAll(`[${EXPAND_HIT}]`).length;
  const collapsedClassRows = block.querySelectorAll('.immich-ui-tweak-detail-row-collapsed').length;
  if (hits !== wantIsolated || collapsedClassRows !== wantIsolated) return false;
  for (const r of runs) {
    for (let k = r.start; k <= r.end; k++) {
      if (items[k].el.style.display !== 'none') return false;
    }
  }
  const wantHidden = rowsAll.filter((r) => detailRowPanelMode(settings, r.kind) === 'hide').length;
  const haveHidden = block.querySelectorAll(`[${ROW_HIDDEN_ATTR}]`).length;
  return wantHidden === haveHidden;
}

function findCollapsedRuns(items: { kind: DetailRowKind; el: HTMLElement; collapsed: boolean }[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < items.length) {
    if (!items[i].collapsed) {
      i++;
      continue;
    }
    const start = i;
    while (i < items.length && items[i].collapsed) i++;
    const end = i - 1;
    if (end - start + 1 >= 2) runs.push({ start, end });
  }
  return runs;
}

function inAnyRun(index: number, runs: Run[]): Run | null {
  for (const r of runs) {
    if (index >= r.start && index <= r.end) return r;
  }
  return null;
}

function clearToolbar(container: HTMLElement): void {
  for (const n of container.querySelectorAll(`[${TOOLBAR_ATTR}]`)) {
    if (!(n instanceof HTMLElement)) continue;
    const tw = n as ToolbarWithExpandPtr;
    const h = tw.__immichUiTweakToolbarExpandPtr;
    if (h) {
      n.removeEventListener('click', h, true);
      delete tw.__immichUiTweakToolbarExpandPtr;
    }
    n.remove();
  }
}

/** Avoid `display:none` on the content column — Immich `transition:slide` can throw `height: NaNpx` when the subtree is torn down mid-animation. */
function clearSecondColumnSoftHide(second: HTMLElement): void {
  second.style.removeProperty('display');
  second.style.removeProperty('overflow');
  second.style.removeProperty('max-height');
  second.style.removeProperty('opacity');
  second.style.removeProperty('pointer-events');
  second.style.removeProperty('margin');
  second.style.removeProperty('padding');
  second.style.removeProperty('border');
  second.style.removeProperty('min-height');
  second.style.removeProperty('line-height');
  second.removeAttribute('aria-hidden');
}

function applySecondColumnSoftHide(second: HTMLElement): void {
  clearSecondColumnSoftHide(second);
  Object.assign(second.style, {
    overflow: 'hidden',
    maxHeight: '0',
    opacity: '0',
    pointerEvents: 'none',
    margin: '0',
    padding: '0',
    border: 'none',
    minHeight: '0',
    lineHeight: '0',
  });
  second.setAttribute('aria-hidden', 'true');
}

type ColumnWithToggle = HTMLElement & {
  __immichUiTweakColToggle?: (e: Event) => void;
  /** Capture-phase click on the icon column so expand matches native button timing (mouseup). */
  __immichUiTweakExpandColPtr?: (e: MouseEvent) => void;
};

type ToolbarWithExpandPtr = HTMLElement & {
  __immichUiTweakToolbarExpandPtr?: (e: MouseEvent) => void;
};

function clearExpandColumnPointer(el: HTMLElement): void {
  const col = el as ColumnWithToggle;
  const h = col.__immichUiTweakExpandColPtr;
  if (h) {
    el.removeEventListener('click', h, true);
    delete col.__immichUiTweakExpandColPtr;
  }
}

/** Intercept on the column (capture, click) as a fallback when retargeting hides our overlay from composedPath(). */
function bindExpandColumnClickCapture(col: HTMLElement, kind: DetailRowKind): void {
  clearExpandColumnPointer(col);
  const h = (e: MouseEvent): void => {
    if (!pointerGate() || !userToggleHandler) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    userToggleHandler(kind, false);
  };
  (col as ColumnWithToggle).__immichUiTweakExpandColPtr = h;
  col.addEventListener('click', h, true);
}

function clearColumnToggleHandlers(el: HTMLElement): void {
  const col = el as ColumnWithToggle;
  const h = col.__immichUiTweakColToggle;
  if (h) {
    el.removeEventListener('click', h, true);
    el.removeEventListener('keydown', h, true);
    delete col.__immichUiTweakColToggle;
  }
}

function resetRowPresentation(row: HTMLElement): void {
  row.style.display = '';
  row.removeAttribute(ROW_HIDDEN_ATTR);
  row.classList.remove('immich-ui-tweak-detail-row-collapsed');
  const first = row.children[0] as HTMLElement | undefined;
  const second = row.children[1] as HTMLElement | undefined;
  if (second) {
    clearSecondColumnSoftHide(second);
  }
  if (first) {
    removeExpandOverlay(first);
    clearExpandColumnPointer(first);
    clearColumnToggleHandlers(first);
    first.removeAttribute(TOGGLE_KIND);
    first.removeAttribute(TOGGLE_ACTION);
    first.removeAttribute('role');
    first.removeAttribute('tabindex');
    first.removeAttribute('aria-expanded');
    first.removeAttribute('aria-label');
    first.style.cursor = '';
    first.style.position = '';
    first.style.zIndex = '';
    first.style.pointerEvents = '';
    const svg = first.querySelector<SVGSVGElement>('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = '';
      svg.style.height = '';
      svg.style.removeProperty('pointer-events');
    }
  }
}

function removeExpandOverlay(col: HTMLElement): void {
  for (const el of col.querySelectorAll(`[${EXPAND_PEER_PE}]`)) {
    if (el instanceof HTMLElement) {
      el.style.removeProperty('pointer-events');
      el.removeAttribute(EXPAND_PEER_PE);
    }
  }
  col.querySelector(`[${EXPAND_HIT}]`)?.remove();
}

/** Full-cell invisible button so expand works even when Immich icons live in closed / retargeted shadow DOM. */
function addExpandHitOverlay(col: HTMLElement, kind: DetailRowKind): void {
  removeExpandOverlay(col);
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute(EXPAND_HIT, '1');
  b.setAttribute(TOGGLE_KIND, kind);
  b.setAttribute(TOGGLE_ACTION, 'expand');
  b.setAttribute('aria-label', `Expand ${kind} details`);
  b.setAttribute('aria-expanded', 'false');
  b.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    'right:0',
    'bottom:0',
    'width:100%',
    'min-height:44px',
    'min-width:44px',
    'padding:0',
    'margin:0',
    'border:0',
    'border-radius:8px',
    'background:transparent',
    'cursor:pointer',
    'z-index:2147483646',
    'box-sizing:border-box',
    'pointer-events:auto',
  ].join(';');
  col.appendChild(b);
  /* Immich icon hosts sit above the overlay in hit order unless they ignore pointer events. */
  for (const child of [...col.children]) {
    if (child === b || !(child instanceof HTMLElement)) continue;
    child.setAttribute(EXPAND_PEER_PE, '1');
    child.style.setProperty('pointer-events', 'none');
  }
}

function svgIconButton(kind: DetailRowKind, action: 'expand' | 'collapse', sizePx: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(TOGGLE_KIND, kind);
  btn.setAttribute(TOGGLE_ACTION, action);
  btn.setAttribute('aria-label', action === 'expand' ? `Expand ${kind} details` : `Collapse ${kind} details`);
  btn.setAttribute('aria-expanded', action === 'expand' ? 'false' : 'true');
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'padding:4px',
    'margin:0',
    'border:none',
    'background:transparent',
    'cursor:pointer',
    'border-radius:6px',
    'color:inherit',
  ].join(';');
  const pathD =
    kind === 'file' ? MDI_IMAGE_OUTLINE : kind === 'camera' ? MDI_CAMERA : MDI_CAMERA_IRIS;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sizePx}" height="${sizePx}" aria-hidden="true"><path fill="currentColor" d="${pathD}"/></svg>`;
  /* Expand taps use global activation + (merged strip) toolbar capture click. */
  btn.querySelector('svg')?.style.setProperty('pointer-events', 'none');
  return btn;
}

function decorateIconColumn(
  col: HTMLElement,
  kind: DetailRowKind,
  action: 'expand' | 'collapse',
  iconSizePx: number,
): void {
  removeExpandOverlay(col);
  clearExpandColumnPointer(col);
  clearColumnToggleHandlers(col);

  col.setAttribute(TOGGLE_KIND, kind);
  col.setAttribute(TOGGLE_ACTION, action);
  col.style.position = 'relative';
  col.style.zIndex = '1';
  col.style.pointerEvents = 'auto';
  const svg = col.querySelector<SVGSVGElement>('svg');
  if (svg) {
    svg.setAttribute('width', String(iconSizePx));
    svg.setAttribute('height', String(iconSizePx));
    /* Let the overlay (expand) or column handler (collapse) receive the gesture. */
    svg.style.setProperty('pointer-events', 'none');
  }

  if (action === 'expand') {
    col.removeAttribute('role');
    col.removeAttribute('tabindex');
    col.removeAttribute('aria-expanded');
    col.removeAttribute('aria-label');
    col.style.cursor = '';
    addExpandHitOverlay(col, kind);
    bindExpandColumnClickCapture(col, kind);
    return;
  }

  col.setAttribute('role', 'button');
  col.setAttribute('tabindex', '0');
  col.setAttribute('aria-expanded', 'true');
  col.setAttribute('aria-label', `Collapse ${kind} details`);
  col.style.cursor = 'pointer';
  bindColumnToggleHandlers(col, kind, action);
}

let userToggleHandler: ((kind: DetailRowKind, collapsed: boolean) => void) | null = null;

/** Set from content script: only handle expand gestures on allowlisted Immich URLs after sync hydrate. */
let pointerGate: () => boolean = () => false;

export function setDetailRowPointerGate(fn: () => boolean): void {
  pointerGate = fn;
}

let globalExpandClickInstalled = false;

function isExpandControlInDetailPanel(node: HTMLElement): boolean {
  if (node.matches(`button[${EXPAND_HIT}]`)) {
    return Boolean(node.closest('#detail-panel'));
  }
  if (node.tagName === 'BUTTON' && node.getAttribute(TOGGLE_ACTION) === 'expand') {
    return Boolean(node.closest(`[${TOOLBAR_ATTR}]`)?.closest('#detail-panel'));
  }
  return false;
}

function tryHandleExpandActivation(ev: MouseEvent | PointerEvent, node: HTMLElement | null): boolean {
  if (!node || !userToggleHandler) return false;
  if (!isExpandControlInDetailPanel(node)) return false;
  if (node.matches(`button[${EXPAND_HIT}]`)) {
    const kind = node.getAttribute(TOGGLE_KIND) as DetailRowKind | null;
    if (!kind) return false;
    ev.preventDefault();
    ev.stopPropagation();
    userToggleHandler(kind, false);
    return true;
  }
  if (node.tagName === 'BUTTON' && node.getAttribute(TOGGLE_ACTION) === 'expand') {
    const bar = node.closest(`[${TOOLBAR_ATTR}]`);
    if (!bar) return false;
    const kind = node.getAttribute(TOGGLE_KIND) as DetailRowKind | null;
    if (!kind) return false;
    ev.preventDefault();
    ev.stopPropagation();
    userToggleHandler(kind, false);
    return true;
  }
  return false;
}

function composedPathTouchesDetailPanel(path: EventTarget[]): boolean {
  for (const n of path) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.id === 'detail-panel') return true;
    if (n.closest('#detail-panel')) return true;
  }
  return false;
}

/**
 * Clicks on shadow-internal icons never include our sibling overlay button in `composedPath()`.
 * Isolated rows use capture `click` on the icon column as a fallback; `elementsFromPoint` covers
 * toolbar + overlay hits; keyboard still delivers `click` on real buttons.
 */
function handleGlobalExpandActivation(ev: MouseEvent | PointerEvent): void {
  if (!pointerGate() || !userToggleHandler) return;
  if (ev.button !== 0) return;

  const path = ev.composedPath();
  if (!composedPathTouchesDetailPanel(path)) return;

  for (const n of path) {
    if (n instanceof HTMLElement && tryHandleExpandActivation(ev, n)) return;
  }

  let stack: Element[];
  try {
    stack = document.elementsFromPoint(ev.clientX, ev.clientY);
  } catch {
    return;
  }
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    if (tryHandleExpandActivation(ev, node)) return;
  }
}

function ensureGlobalExpandClick(): void {
  if (globalExpandClickInstalled) return;
  globalExpandClickInstalled = true;
  window.addEventListener('click', handleGlobalExpandActivation, true);
}

/**
 * Direct listeners on the icon column (capture phase) so clicks that originate inside
 * `@immich/ui` Shadow DOM still hit our handler when they bubble/retarget through the host.
 */
function bindColumnToggleHandlers(
  el: HTMLElement,
  kind: DetailRowKind,
  action: 'expand' | 'collapse',
): void {
  clearColumnToggleHandlers(el);
  const col = el as ColumnWithToggle;
  const h = (e: Event): void => {
    if (e.type === 'keydown') {
      const key = (e as KeyboardEvent).key;
      if (key !== 'Enter' && key !== ' ') return;
    }
    e.preventDefault();
    e.stopPropagation();
    userToggleHandler?.(kind, action === 'collapse');
  };
  col.__immichUiTweakColToggle = h;
  el.addEventListener('click', h, true);
  el.addEventListener('keydown', h, true);
}

/** Register handler for icon clicks (collapse = true, expand = false). */
export function setDetailRowUserToggleHandler(fn: ((kind: DetailRowKind, collapsed: boolean) => void) | null): void {
  userToggleHandler = fn;
  if (fn) ensureGlobalExpandClick();
}

export function cleanupDetailPanelDetailRowsInDocument(): void {
  document.querySelectorAll('#detail-panel').forEach((p) => {
    if (!(p instanceof HTMLElement)) return;
    cleanupDetailPanelDetailRows(p);
  });
}

export function cleanupDetailPanelDetailRows(panel: HTMLElement): void {
  detailPanelApplyCache.delete(panel);
  const block = findDetailsBlock(panel);
  if (block) {
    clearToolbar(block);
    for (const { el } of listTargetRows(block)) {
      resetRowPresentation(el);
      el.removeAttribute(ROW_MARKER);
    }
  }
  panel.querySelectorAll(`[${ROW_MARKER}]`).forEach((row) => {
    if (row instanceof HTMLElement) {
      resetRowPresentation(row);
      row.removeAttribute(ROW_MARKER);
    }
  });
}

/**
 * Apply collapse/expand UI for file, camera, and lens rows inside `#detail-panel`.
 */
export function applyInfoPanelDetailRows(
  panel: HTMLElement,
  settings: ExtensionSettings,
  explicit: DetailRowsExplicit,
): void {
  const block = findDetailsBlock(panel);
  if (!block) {
    detailPanelApplyCache.delete(panel);
    return;
  }

  const rows = listTargetRows(block);
  if (rows.length === 0) {
    clearToolbar(block);
    detailPanelApplyCache.delete(panel);
    return;
  }

  const visibleRows = rows.filter((r) => detailRowPanelMode(settings, r.kind) !== 'hide');
  const items = visibleRows.map((r) => ({
    ...r,
    collapsed: effectiveRowCollapsed(r.kind, settings, explicit),
  }));

  const runs = findCollapsedRuns(items);
  const fp = collapseLayoutFingerprint(rows, items, runs, settings, explicit);
  const rowRefs = rows.map((r) => r.el);
  const wantTbButtons = expectedToolbarExpandButtonCount(runs);
  if (detailRowsDomMatchesIntent(panel, block, fp, rowRefs, rows, runs, items, settings)) {
    return;
  }

  clearToolbar(block);
  for (const { el } of rows) {
    resetRowPresentation(el);
    el.removeAttribute(ROW_MARKER);
  }

  for (const { el, kind } of rows) {
    if (detailRowPanelMode(settings, kind) === 'hide') {
      el.setAttribute(ROW_HIDDEN_ATTR, '1');
      el.style.display = 'none';
    }
  }

  if (visibleRows.length === 0) {
    detailPanelApplyCache.set(panel, {
      fp,
      rowRefs: [...rowRefs],
      toolbarExpandCount: 0,
    });
    return;
  }

  const stripIconPx = 14;

  for (let i = 0; i < items.length; i++) {
    const { el, kind, collapsed } = items[i];
    el.setAttribute(ROW_MARKER, kind);

    if (!collapsed) {
      const first = el.children[0] as HTMLElement | undefined;
      if (first) decorateIconColumn(first, kind, 'collapse', 24);
      continue;
    }

    const run = inAnyRun(i, runs);
    if (run) {
      el.style.display = 'none';
      continue;
    }

    /* Isolated collapsed */
    el.classList.add('immich-ui-tweak-detail-row-collapsed');
    const first = el.children[0] as HTMLElement | undefined;
    const second = el.children[1] as HTMLElement | undefined;
    if (second) applySecondColumnSoftHide(second);
    if (first) decorateIconColumn(first, kind, 'expand', stripIconPx);
  }

  for (const run of runs) {
    const bar = document.createElement('div');
    bar.setAttribute(TOOLBAR_ATTR, '1');
    bar.style.cssText = [
      'display:flex',
      'flex-direction:row',
      'align-items:center',
      'gap:10px',
      'padding:4px 0',
      'position:relative',
      'z-index:2147483645',
      'pointer-events:auto',
    ].join(';');
    for (let k = run.start; k <= run.end; k++) {
      bar.appendChild(svgIconButton(items[k].kind, 'expand', stripIconPx));
    }
    const toolbarExpandClick = (e: MouseEvent): void => {
      if (!pointerGate() || !userToggleHandler) return;
      if (e.button !== 0) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest('button');
      if (!btn || !bar.contains(btn) || btn.getAttribute(TOGGLE_ACTION) !== 'expand') return;
      const rowKind = btn.getAttribute(TOGGLE_KIND) as DetailRowKind | null;
      if (!rowKind) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      userToggleHandler(rowKind, false);
    };
    (bar as ToolbarWithExpandPtr).__immichUiTweakToolbarExpandPtr = toolbarExpandClick;
    bar.addEventListener('click', toolbarExpandClick, true);
    const anchor = items[run.start].el;
    anchor.parentElement?.insertBefore(bar, anchor);
  }

  detailPanelApplyCache.set(panel, {
    fp,
    rowRefs: [...rowRefs],
    toolbarExpandCount: wantTbButtons,
  });
}
