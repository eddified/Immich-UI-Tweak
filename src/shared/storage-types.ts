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
} as const;

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
};
