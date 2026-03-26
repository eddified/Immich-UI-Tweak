# Folders path mapping (breadcrumbs + sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Immich `/folders` routes, show mapped path **labels** in the breadcrumb bar and sidebar folder tree using existing `PathMappingRow` settings, without modifying any link `href` or query strings.

**Architecture:** Add a small **pure** module (`src/shared/folders-path-label.ts`) that parses `path=` from folders URLs, computes parent server paths, and derives display text via `applyPathMappings` + relative tail vs parent. Add a **content** module (`src/content/folders-path-relabel.ts`) that, only when the pathname starts with `/folders` and mappings exist, finds breadcrumb and tree label nodes and sets `textContent`. Reuse the existing `scheduleDomUpdate` + `MutationObserver` pipeline in `content.ts` (no second global observer unless profiling shows it is required).

**Tech Stack:** TypeScript, Chrome extension MV3, Vitest (`npm run test:unit`), Playwright (`npm run test:e2e` optional).

**Spec:** `docs/superpowers/specs/2026-03-24-folders-path-mapping-design.md`

---

## File map (before tasks)

| File | Responsibility |
|------|------------------|
| **Create** `src/shared/folders-path-label.ts` | Parse folders `path` query; normalize server paths; `parentServerFolderPath()`; `mappedFolderDisplayLabel(S, S_parent, mappings)` — **no DOM**. |
| **Create** `src/content/folders-path-relabel.ts` | `applyFoldersPathRelabel(settings: ExtensionSettings): void` — narrow selectors, `textContent` only, never set `href`. |
| **Modify** `src/content/content.ts` | Call relabel from `scheduleDomUpdate` after existing work when URL is folders; keep `removeExtensionElements` consistent (no stale labels — usually DOM replacement handles this). |
| **Create** `tests/unit/folders-path-label.spec.ts` | Vitest coverage for parsing, parent path, label derivation (including longest-prefix mapping). |
| **Optional** `tests/e2e/folders-path-mapping.spec.ts` | Assert visible text vs `href` if a stable demo/fixture exists. |

---

### Task 1: Pure path helpers + unit tests (TDD)

**Files:**
- Create: `src/shared/folders-path-label.ts`
- Create: `tests/unit/folders-path-label.spec.ts`
- Test: `tests/unit/folders-path-label.spec.ts`

- [ ] **Step 1: Write failing tests for `parseFoldersPathQuery`**

```typescript
import { describe, expect, it } from 'vitest';
import { parseFoldersPathQuery } from '../../src/shared/folders-path-label';

describe('parseFoldersPathQuery', () => {
  it('returns decoded path from /folders?path=...', () => {
    expect(parseFoldersPathQuery('https://immich.test/folders?path=%2Fdata%2Fupload')).toBe('/data/upload');
  });
  it('returns null when path param missing', () => {
    expect(parseFoldersPathQuery('https://immich.test/folders')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (missing module / function)**

Run: `npx vitest run tests/unit/folders-path-label.spec.ts`
Expected: FAIL (export not found or file missing)

- [ ] **Step 3: Implement `parseFoldersPathQuery(href: string): string | null`**

Use `new URL(href)`; require `pathname` ends with `/folders` or matches Immich’s pattern (`/folders` only per `Route.folders`); read `searchParams.get('path')`; return decoded string or `null` if absent.

- [ ] **Step 4: Add tests + implementation for `parentServerFolderPath`**

Behavior (POSIX-style, align with spec §5.2):

- `''` → `''`
- `/` → `''`
- `/data` → `''` (single segment under root)
- `/data/upload` → `/data`

```typescript
it('strips last segment for parent folder', () => {
  expect(parentServerFolderPath('/data/upload')).toBe('/data');
});
```

- [ ] **Step 5: Add tests + implementation for `mappedFolderDisplayLabel`**

Inputs: `S`, `S_parent`, `mappings: PathMappingRow[]`. Use `applyPathMappings` from `./path-mapping` for `M` and `M_parent`. Compute **relative** display: normalized separators; if `M_parent` is empty, show `M` with leading slashes trimmed appropriately; else if `M` starts with mapped parent prefix, show remainder; else **fallback** to last path segment of `S` (Immich’s original segment text) so UI does not go blank.

Include a case with **overlapping** `immichPath` rows proving **longest-prefix** behavior (reuse rows from `path-mapping.spec.ts` style).

- [ ] **Step 6: Run unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/folders-path-label.ts tests/unit/folders-path-label.spec.ts
git commit -m "feat: add folders path label helpers and unit tests"
```

---

### Task 2: DOM relabeling module (no `href` mutations)

**Files:**
- Create: `src/content/folders-path-relabel.ts`
- Modify: `src/content/folders-path-relabel.ts` (as you build)
- Test: manual + existing unit tests only (DOM module tested via Task 4 e2e or manual)

- [ ] **Step 1: Implement `isFoldersExplorerRoute(): boolean`**

`location.pathname === '/folders' || location.pathname.startsWith('/folders/')` — matches Immich nested routes under folders.

- [ ] **Step 2: Define centralized selectors (comment with Immich file references)**

Per spec §5.3 and reference Svelte:

- Breadcrumb: `nav` containing `ol.flex` with links `a[href*="/folders"][href*="path="]` — **only** `a` whose **link text** is the segment (underline class in Immich). Target the **anchor’s text node** by setting `textContent` on the `<a>` (replaces children including `whitespace-pre-wrap` structure — **verify in browser**: Immich uses `<a class="... whitespace-pre-wrap">{parent.value}</a>`; if setting `textContent` on `<a>` breaks layout, set text on **innermost** text-only path; adjust selectors to the `span` inside `a` for tree rows per `tree.svelte` line 45).

**Important:** After inspecting Immich DOM, prefer:

- Breadcrumb: direct child text of `a` OR single text node — **do not** strip `href`.
- Tree: `a[href*="/folders"] span.font-mono` or the specific `span` with `text-nowrap` for the folder name.

- [ ] **Step 3: Implement `applyFoldersPathRelabel(settings: ExtensionSettings): void`**

Guard: `!isFoldersExplorerRoute()` → return. Guard: `filterCompleteMappings(settings.pathMappings).length === 0` → return.

For **each** matching `a`:

1. Read `href` **once** (string).
2. `S = parseFoldersPathQuery(href)`; if null, skip.
3. `S_parent = parentServerFolderPath(S)`.
4. `next = mappedFolderDisplayLabel(S, S_parent, settings.pathMappings)`.
5. If the target text node’s current display equals `next`, skip (idempotency).
6. Set **text only** on the chosen label element; **never** assign `href`, `title`, or `innerHTML` with untrusted HTML (use `textContent`).

For **breadcrumb current folder** `<p class="cursor-default whitespace-pre-wrap">` (see `breadcrumbs.svelte`):

1. `S = parseFoldersPathQuery(location.href)` (current page).
2. Parent for the **current** node is `parentServerFolderPath(S)`.
3. Same `mappedFolderDisplayLabel` with `S_parent` = parent of current folder.
4. Set `textContent` on that `p`.

Mark elements with `data-immich-ui-tweak-folders-label="1"` **after** successful write if useful for debugging; optional.

- [ ] **Step 4: Self-review checklist**

- [ ] No line sets `element.href` or `link.setAttribute('href', ...)`.
- [ ] No `innerHTML` with mapping output.
- [ ] `TreeItemThumbnails` in main content **not** selected (out of scope).

- [ ] **Step 5: Commit**

```bash
git add src/content/folders-path-relabel.ts
git commit -m "feat: relabel folders breadcrumb and tree paths without touching hrefs"
```

---

### Task 3: Integrate into `content.ts`

**Files:**
- Modify: `src/content/content.ts` (near `scheduleDomUpdate` / `expandAndRewriteFilePath`)

- [ ] **Step 1: Import and invoke**

Inside `scheduleDomUpdate`’s rAF callback, after `expandAndRewriteFilePath()` (or immediately after path-related work), call `applyFoldersPathRelabel(settings)` when `settingsHydrated` and URL enabled.

- [ ] **Step 2: Build extension**

Run: `npm run build`
Expected: esbuild completes without errors

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/content/content.ts
git commit -m "feat: run folders path relabel from content script scheduleDomUpdate"
```

---

### Task 4 (optional): Playwright smoke for `href` stability

**Files:**
- Create: `tests/e2e/folders-path-mapping.spec.ts`
- May modify: `tests/e2e/fixtures.ts` if new helpers needed

- [ ] **Step 1: Add e2e that navigates to `/folders` on configured base URL**

Only if the project’s `.env` / fixtures already support a host with folders enabled; otherwise skip with `test.skip` and a comment pointing to spec §7.

- [ ] **Step 2: Assert**

After extension behavior (load packed extension in fixture): for at least one `a[href*="/folders"]`, `href` before === `href` after relabel (string match); visible text may differ when mappings apply.

Run: `npm run test:e2e`
Expected: PASS or skipped tests not failing the run

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/folders-path-mapping.spec.ts
git commit -m "test(e2e): smoke folders path relabel without href mutation"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: `test:unit` + `test:e2e` PASS (or e2e skipped cleanly)

- [ ] **Step 2: Manual check on real Immich**

Load unpacked extension, configure one mapping, open `/folders`, confirm breadcrumb + sidebar labels and **click** still navigates correctly.

---

## Plan review

Per superpowers **writing-plans**: run **plan-document-reviewer** subagent with this plan path + spec path if that prompt exists in your environment. This repo does not ship `plan-document-reviewer-prompt.md`; perform a **human or self-review** against `docs/superpowers/specs/2026-03-24-folders-path-mapping-design.md` §4–§5 before merging.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-24-folders-path-mapping.md`. Two execution options:

**1. Subagent-driven (recommended)** — Dispatch a fresh subagent per task; review between tasks.

**2. Inline execution** — Run tasks in one session using superpowers:executing-plans with checkpoints.

**Which approach?**
