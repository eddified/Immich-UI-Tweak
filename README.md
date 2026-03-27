# Immich UI Tweak

<p align="center">
  <img src="src/icons/icon-128.png" alt="Immich UI Tweak" width="128" height="128" />
</p>

A Chromium Manifest V3 browser extension that improves the [Immich](https://immich.app/) web UI: partner avatars on the timeline, optional visibility of your own profile image, and **host path ↔ container path** mapping so “file location” paths match how you browse folders on your machine.

## Features

- **Partner avatars** — Shows partner users’ avatars on shared assets in the timeline (and related UI) when enabled.
- **Your profile icon** — Optional display of your own navbar-style avatar in the same contexts.
- **Path mapping** — Maps Immich’s in-container paths (e.g. under Docker) to paths on your host so the detail panel’s file location reads correctly on your system.
- **Folders page labels** — Optional relabeling of breadcrumb/sidebar text on `/folders` routes using the same mappings.
- **Scoped activation** — Content scripts register only for Immich instance URLs you list in options (up to 32 origins). Default includes `https://demo.immich.app` for trying the demo.

## Permissions

The extension requests `storage`, `scripting`, and `tabs`, with broad `http://*/`* and `https://*/*` host permissions so you can add any Immich URL in options. Only URLs you save are used to register scripts.

## Requirements

- Node.js 18+ (recommended: current LTS)
- Chromium-based browser for loading the unpacked extension

## Build

```bash
npm install
npm run icons:render   # if dist/icons are missing (generates PNGs under src/icons)
npm run build
```

Output goes to `dist/`.

## Install (unpacked)

1. Run `npm run build`.
2. Open `chrome://extensions` (or your browser’s equivalent).
3. Enable **Developer mode**.
4. **Load unpacked** and choose the `dist` directory.

On first install, the options page opens so you can set your Immich URL(s), toggles, and path mappings.

## Configuration

Open the extension’s **Options** (or right-click the toolbar icon → Options, depending on the browser):

- **Enabled Immich URLs** — Full origins where the extension should run (e.g. `https://photos.example.com`).
- **Path mappings** — Rows of *local path* → *Immich (container) path*; both sides must be non-empty to apply.
- **Show partner icons** / **Show my profile icon** — UI visibility toggles.
- **Replace folder page names** — Use mappings to rewrite folder labels on the folders view.

Settings are stored in `chrome.storage.sync`.

## Development

- **Watch/build and try in a browser** (Playwright Chromium, extension preloaded, demo-oriented preset):
  ```bash
  npm run dev:browser
  ```
  Override the opened URL with `IMMICH_DEV_URL` if you use a local Immich dev server.
- Source layout:
  - `src/background.ts` — Service worker; registers content scripts for configured URL patterns.
  - `src/content/content.ts` — Isolated-world script (UI integration, storage-backed behavior).
  - `src/content/injected.ts` — Main-world script for hooks that must run in the page context.
  - `src/options/` — Options page UI.
  - `src/shared/` — Shared types and helpers (path mapping, URL matching, Immich API parsing).

## Tests

```bash
npm run test:unit          # Vitest
npm run playwright:install # first-time Chromium for Playwright
npm run test:e2e           # build + Playwright
```

Headed or UI mode: `npm run test:e2e:headed`, `npm run test:e2e:ui`.

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).