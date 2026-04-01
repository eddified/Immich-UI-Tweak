export const STORAGE_KEYS = {
  enabledUrls: 'enabledUrls',
  pathMappings: 'pathMappings',
  replaceFoldersPageNames: 'replaceFoldersPageNames',
  showPartnerIcons: 'showPartnerIcons',
  showOwnProfileIcon: 'showOwnProfileIcon',
  autoOpenFileLocation: 'autoOpenFileLocation',
  remapSlashToFocusSearch: 'remapSlashToFocusSearch',
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
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledUrls: ['https://demo.immich.app'],
  pathMappings: [],
  replaceFoldersPageNames: false,
  showPartnerIcons: true,
  showOwnProfileIcon: false,
  autoOpenFileLocation: true,
  remapSlashToFocusSearch: true,
};
