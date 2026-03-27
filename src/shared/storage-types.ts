export const STORAGE_KEYS = {
  enabledUrls: 'enabledUrls',
  pathMappings: 'pathMappings',
  replaceFoldersPageNames: 'replaceFoldersPageNames',
  showPartnerIcons: 'showPartnerIcons',
  showOwnProfileIcon: 'showOwnProfileIcon',
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
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledUrls: ['https://demo.immich.app'],
  pathMappings: [],
  replaceFoldersPageNames: false,
  showPartnerIcons: true,
  showOwnProfileIcon: false,
};
