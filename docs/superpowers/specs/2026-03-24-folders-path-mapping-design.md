# Folders UI path mapping (extension-only) — design spec

**Status:** Approved for implementation planning  
**Product:** immich-ui-helper (browser extension)  
**Date:** 2026-03-24

---

## 1. Goal

When the user opens Immich’s **Folders** experience (`/folders` and routes that reuse the same explorer chrome), **breadcrumb** and **sidebar folder tree** labels should show **mapped paths** (e.g. host-side paths the user configured), so Docker-in-container paths are easier to recognize. **Navigation must continue to use Immich’s canonical server paths in URLs** — the extension does not change Immich server or web source code.

---

## 2. Non-goals

- Changing Immich upstream UI or API behavior.
- Rewriting **links** or **URL state** (see §4).
- Mapping path text on **every** Immich page; initial scope is **breadcrumbs + sidebar tree** on the folders explorer only (not `TreeItemThumbnails` folder tiles in the main content area, asset names, or other routes) unless explicitly expanded later.

---

## 3. Background (current extension behavior)

The extension already stores **`PathMappingRow`** entries (`immichPath` → `localPath`) and applies **`applyPathMappings()`** (`src/shared/path-mapping.ts`) in the **asset detail panel** so the visible file-location string can differ from the server path while the folder **`href`** still targets Immich’s `/folders?path=…` with the **server** path. This feature extends the same *display vs wire* idea to the Folders page chrome.

Immich web (reference only):

- Folders page: `(user)/folders/...` uses `Breadcrumbs` and `TreeItems` / `tree.svelte`.
- Breadcrumb segments: links with `getLink(parent.path)`; current folder is a `<p>` (not a link).
- Sidebar tree: each row is an `<a href={getLink(node.path)}>` with label text in a `span` (e.g. `node.value`).

Full server paths appear in **`path`** query parameters; visible text is often a **segment** or collapsed segment, not the full path string.

---

## 4. Hard requirements

### 4.1 Visible paths only

Updates are limited to **user-visible label text** (e.g. `textContent` on the same elements Immich uses for display). Do not inject rich HTML for mapped text unless unavoidable; prefer plain text.

### 4.2 Never change links

**Do not** modify:

- `href`, `action`, `src`, or any attribute that defines navigation or resource fetch targets  
- Query string values inside those attributes (e.g. `path=` on `/folders` links)  
- `history` / `location` / SPA router state  

**Rationale:** Immich routing and APIs expect **server-side** paths in URLs. Changing links would break navigation or create inconsistent state.

### 4.3 Reuse existing mapping configuration

Use existing storage keys and helpers: **`filterCompleteMappings`**, **`sortMappingsForReplace`**, **`applyPathMappings`**. If there are no complete mapping rows, the feature is a no-op (consistent with detail-panel behavior).

---

## 5. Functional design

### 5.1 Parsing

- From each in-scope folders URL (current page and/or candidate link), parse the **`path`** query value (decode per standard URL decoding).
- Treat missing or invalid `path` as **no relabel** for that target (keep Immich’s text).

### 5.2 Label content

For each **link** that points to `/folders` with a `path` query:

- Let **`S`** = parsed server path for that link’s destination folder.
- Let **`M`** = `applyPathMappings(S, mappings)`.
- Let **`S_parent`** = parsed server path for the **parent** folder of that link in the breadcrumb/tree hierarchy (root → empty string), derived from **`S`** by removing the last path segment (same semantics as Immich’s tree parent), not from visible text.
- Let **`M_parent`** = `applyPathMappings(S_parent, mappings)`.
- **Display label** = the path remainder of **`M`** after **`M_parent`**, with separators normalized consistently (e.g. `/`); if empty, fall back to Immich’s original visible text or last segment as needed so the UI never goes blank incorrectly.

For the **breadcrumb current folder** (`<p>`, not a link):

- Derive **`S`** from the **current page** URL `path=` query (canonical current folder).
- Set visible text to the appropriate mapped segment (e.g. relative tail vs parent, aligned with the same rules as sibling links so the trail reads consistently).

**Note:** Exact edge cases (root folder, collapsed tree nodes where `node.value` spans multiple segments) must be handled in implementation with unit tests; the implementation may normalize paths (e.g. POSIX `/`, trim) in one place to avoid drift.

### 5.3 DOM scope (initial)

| Area | Include |
|------|---------|
| Breadcrumb `nav` | `a[href*="/folders"]` segment labels + final current-folder `<p>` |
| Sidebar explorer | `TreeItems` / `tree.svelte` rows: label inside `a[href*="/folders"]` (e.g. the `span` carrying folder name) |

| Exclude (unless scope expanded) |
|----------------------------------|
| `TreeItemThumbnails` folder tiles in main scroll area |
| Asset filenames, other routes |

Selectors should be **as narrow as practical** and centralized so Immich upgrades only require touching one module.

### 5.4 Lifecycle and idempotency

- Immich/Svelte will **re-render** DOM on navigation. The extension must **re-apply** relabeling after such updates (e.g. debounced `MutationObserver` on a stable ancestor, and/or hooks aligned with existing content-script scheduling such as `requestAnimationFrame` passes — follow patterns already used in `content.ts`).

- Mark processed nodes with a **`data-immich-ui-helper-…`** attribute to avoid redundant work or fighting Immich updates; **re-process when `href` or pathname/search changes** so labels stay correct.

- **Do not** change `href` when reconciling — only text.

---

## 6. Security and privacy

- Mappings are **user-supplied** extension settings; treat them as configuration, not trusted content from the network.
- Set **text** only; do not assign untrusted strings to **`innerHTML`**.
- Logging must not print full paths if logs could leak sensitive directory layout (follow project logging rules).

---

## 7. Testing

- **Unit tests:** URL → parsed `path`; parent-path helper; label derivation for `(S, S_parent, mappings)` including longest-prefix mapping order and Windows-style mapped roots if supported by existing mapping semantics.
- **E2E (optional):** Folders page on a test instance with known tree + mappings, asserting visible text while **asserting `href` unchanged** (or unchanged query values).

---

## 8. Risks and follow-ups

- **Immich DOM or route changes** may break selectors; mitigate with a single relabeling module and version-tested E2E where feasible.
- Users may request **tooltips** (`title`) showing server path; not in scope unless added later — and still must not alter links.
- Expanding to **TreeItemThumbnails** or other surfaces is a separate design increment.

---

## 9. Next step

After this spec is reviewed and accepted, use the **writing-plans** superpower skill to produce an implementation plan (`docs/superpowers/plans/…`) with bite-sized tasks, exact file paths, and test commands.
