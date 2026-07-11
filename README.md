# Immich UI Tweak

<p align="center">
  <img src="chrome/src/icons/icon-128.png" alt="Immich UI Tweak" width="128" height="128" />
</p>

A browser extension (Chromium and Firefox) that improves the [Immich](https://immich.app/) web UI: partner avatars on the timeline, optional visibility of your own profile image, and **host path ↔ container path** mapping so “file location” paths match how you browse folders on your machine.

## Features

- **Partner avatars** — Shows partner users’ avatars on shared assets in the timeline (and related UI) when enabled.
- **Your profile icon** — Optional display of your own navbar-style avatar in the same contexts.
- **Forward slash remap** — Remaps forward slash key `/` to put focus in the search field.
- **Auto show File Location** - Automatically opens "File Location" in Info panel.
- **Path mapping** — Maps Immich’s in-container paths (e.g. under Docker) to paths on your host so the detail panel’s file location reads correctly on your system.
- **Folders page labels** — Optional relabeling of breadcrumb/sidebar text on `/folders` routes using the same mappings. (Beta/experimental)

## Permissions

The extension requests `storage`, and `scripting`, with broad `http://*/`* and `https://*/*` host permissions so you can add any Immich URL in options.

**Scoped activation**: Content scripts register **only** for Immich instance URLs you list in options (up to 32 origins). Default includes `https://demo.immich.app` for trying the demo.

## Repository layout

| Path | Description |
|------|-------------|
| [`chrome/`](chrome/) | Chromium Manifest V3 extension (npm project `immich-ui-tweak-chrome`) |
| [`firefox/`](firefox/) | Firefox WebExtension (npm project `immich-ui-tweak-firefox`) |
| [`shared/e2e/`](shared/e2e/) | Shared Playwright e2e test logic (same scenarios for both browsers) |

Each browser target is an independent npm project with its own `package.json`, build output (`dist/`), and unit tests. E2e tests share the same logical suite via `shared/e2e/`.

## Requirements

- Node.js 18+ (recommended: current LTS)
- Chromium-based browser or Firefox for loading the unpacked extension

## Build

### Chrome

```bash
cd chrome
npm install
npm run icons:render   # if dist/icons are missing
npm run build
```

Output: `chrome/dist/`

### Firefox

```bash
cd firefox
npm install
npm run icons:render   # if dist/icons are missing
npm run build
```

Output: `firefox/dist/`

E2e builds set `PLAYWRIGHT_BUILD=1` to swap in an event background script (Playwright’s Firefox cannot load MV3 service workers for temporary add-ons). A normal `npm run build` keeps the service-worker background for real Firefox installs.

## Install (unpacked)

### Chrome

1. Run `npm run build` in `chrome/`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. **Load unpacked** and choose `chrome/dist`.

### Firefox

1. Run `npm run build` in `firefox/` (this produces a Firefox MV3 build for Firefox 128+ with a background script fallback).
2. Open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** and choose `firefox/dist/manifest.json`.
4. On the options page, click **Allow on Immich URLs** and approve Firefox’s permission prompt, then **Save**.

**Important Firefox notes:**

- **Temporary add-ons are removed when Firefox exits.** After restarting Firefox you must load the add-on again from `about:debugging` (the old `moz-extension://…` URL will not work).
- **Firefox MV3 requires explicit site access.** Unlike Chrome, host permissions are opt-in. Until you allow access on your Immich URL(s), content scripts will not run and the UI tweaks will not appear. Use the **Firefox site access** section at the top of the options page (or right-click the toolbar icon → **Manage Extension** → allow the site).

On first install, the options page opens so you can set your Immich URL(s), toggles, and path mappings.

## Configuration

Open the extension’s **Options** (or right-click the toolbar icon → Options):

- **Enabled Immich URLs** — Full origins where the extension should run (e.g. `https://photos.example.com`).
- **Path mappings** — Rows of *local path* → *Immich (container) path*; both sides must be non-empty to apply.
- **Show partner icons** / **Show my profile icon** — UI visibility toggles.
- **Replace folder page names** — Use mappings to rewrite folder labels on the folders view.

Settings are stored in `browser.storage.sync`.

## Development

### Chrome

```bash
cd chrome
npm run dev:browser
```

Override the opened URL with `IMMICH_DEV_URL` if you use a local Immich dev server.

### Firefox

```bash
cd firefox
npm run dev:browser
```

### Source layout (both targets)

- `src/background.ts` — Background script; registers content scripts for configured URL patterns.
- `src/content/content.ts` — Isolated-world script (UI integration, storage-backed behavior).
- `src/content/injected.ts` — Main-world script for hooks that must run in the page context.
- `src/options/` — Options page UI.
- `src/shared/` — Shared types and helpers (path mapping, URL matching, Immich API parsing).

## Tests

### Chrome

```bash
cd chrome
npm run test:unit
npm run playwright:install   # first-time Chromium for Playwright
npm run test:e2e
```

### Firefox

```bash
cd firefox
npm run test:unit
npm run playwright:install   # first-time Firefox for Playwright
npm run test:e2e             # headless Firefox via playwright-webextext
```

Headed or UI mode (either project): `npm run test:e2e:headed`, `npm run test:e2e:ui`.

The shared e2e suite in `shared/e2e/` runs against both browsers. Firefox tests load the add-on via the remote debugging protocol (`playwright-webextext`) and seed extension settings through a content-script bridge (Playwright cannot navigate to `moz-extension://` URLs).

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
