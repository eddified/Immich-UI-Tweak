export const STORAGE_KEYS = {
  enabledUrls: 'enabledUrls',
  pathMappings: 'pathMappings',
  replaceFoldersPageNames: 'replaceFoldersPageNames',
  showPartnerIcons: 'showPartnerIcons',
  showOwnProfileIcon: 'showOwnProfileIcon',
  autoOpenFileLocation: 'autoOpenFileLocation',
  remapSlashToFocusSearch: 'remapSlashToFocusSearch',
  /** When true, show a Google Maps link (lat/lng) above the map in the asset info panel. */
  googleMapsLinkInInfoPanel: 'googleMapsLinkInInfoPanel',
  /** When true, hide Immich's OpenStreetMap-based map and show an embedded Google Map (same coordinates). */
  googleMapsEmbedInsteadOfOsmInInfoPanel: 'googleMapsEmbedInsteadOfOsmInInfoPanel',
  /** How the file-details row appears by default: `open`, `collapse`, or `hide`. */
  infoPanelDetailRowFile: 'infoPanelDetailRowFile',
  infoPanelDetailRowCamera: 'infoPanelDetailRowCamera',
  infoPanelDetailRowLens: 'infoPanelDetailRowLens',
} as const;

export type DetailRowKind = 'file' | 'camera' | 'lens';

export type DetailRowPanelMode = 'open' | 'collapse' | 'hide';

/** @deprecated Legacy sync booleans — read only for migration. */
const LEGACY_DETAIL_ROW_MODE_KEYS: Record<DetailRowKind, string> = {
  file: 'infoPanelDefaultCollapseFileRow',
  camera: 'infoPanelDefaultCollapseCameraRow',
  lens: 'infoPanelDefaultCollapseLensRow',
};

const DETAIL_ROW_MODE_STORAGE_KEYS: Record<DetailRowKind, string> = {
  file: STORAGE_KEYS.infoPanelDetailRowFile,
  camera: STORAGE_KEYS.infoPanelDetailRowCamera,
  lens: STORAGE_KEYS.infoPanelDetailRowLens,
};

/** Session-only collapsed overrides after the user toggles a row in the viewer (not persisted). Omitted keys follow sync defaults. */
export type DetailRowsExplicit = Partial<Record<DetailRowKind, boolean>>;

export function isDetailRowPanelMode(v: unknown): v is DetailRowPanelMode {
  return v === 'open' || v === 'collapse' || v === 'hide';
}

/** Read a row mode from sync, migrating legacy collapse booleans when the new key is absent. */
export function readDetailRowPanelModeFromSync(
  sync: Record<string, unknown>,
  newKey: string,
  legacyKey: string,
): DetailRowPanelMode {
  const raw = sync[newKey];
  if (isDetailRowPanelMode(raw)) return raw;
  if (typeof sync[legacyKey] === 'boolean') {
    return sync[legacyKey] ? 'collapse' : 'open';
  }
  return 'open';
}

export function readDetailRowPanelModeForKind(sync: Record<string, unknown>, kind: DetailRowKind): DetailRowPanelMode {
  return readDetailRowPanelModeFromSync(
    sync,
    DETAIL_ROW_MODE_STORAGE_KEYS[kind],
    LEGACY_DETAIL_ROW_MODE_KEYS[kind],
  );
}

export function detailRowPanelMode(settings: ExtensionSettings, kind: DetailRowKind): DetailRowPanelMode {
  switch (kind) {
    case 'file':
      return settings.infoPanelDetailRowFile;
    case 'camera':
      return settings.infoPanelDetailRowCamera;
    case 'lens':
      return settings.infoPanelDetailRowLens;
    default:
      return 'open';
  }
}

export const MAX_ENABLED_URLS = 32;

export interface PathMappingRow {
  localPath: string;
  immichPath: string;
}

export interface ExtensionSettings {
  enabledUrls: string[];
  pathMappings: PathMappingRow[];
  /** When true, relabel breadcrumb/sidebar text on Immich `/folders` routes using path mappings. */
  replaceFoldersPageNames: boolean;
  showPartnerIcons: boolean;
  showOwnProfileIcon: boolean;
  /** When true, the content script clicks Immich's "Show file location" when the info panel opens. */
  autoOpenFileLocation: boolean;
  /** When true, `/` focuses the navbar search instead of opening Immich's command palette. */
  remapSlashToFocusSearch: boolean;
  /** When true, inject a Google Maps deep link above the map in the photo info panel when GPS exists. */
  googleMapsLinkInInfoPanel: boolean;
  /** When true, replace the info panel's OSM map with an embedded Google Map (requires GPS). */
  googleMapsEmbedInsteadOfOsmInInfoPanel: boolean;
  /** Default presentation for the file row (filename, path, MP, resolution, size). */
  infoPanelDetailRowFile: DetailRowPanelMode;
  infoPanelDetailRowCamera: DetailRowPanelMode;
  infoPanelDetailRowLens: DetailRowPanelMode;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledUrls: ['https://demo.immich.app'],
  pathMappings: [],
  replaceFoldersPageNames: false,
  showPartnerIcons: true,
  showOwnProfileIcon: false,
  autoOpenFileLocation: true,
  remapSlashToFocusSearch: true,
  googleMapsLinkInInfoPanel: true,
  googleMapsEmbedInsteadOfOsmInInfoPanel: false,
  infoPanelDetailRowFile: 'open',
  infoPanelDetailRowCamera: 'open',
  infoPanelDetailRowLens: 'open',
};
