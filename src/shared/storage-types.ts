export const STORAGE_KEYS = {
  enabledUrls: 'enabledUrls',
  pathMappings: 'pathMappings',
  showPartnerIcons: 'showPartnerIcons',
} as const;

export const MAX_ENABLED_URLS = 32;

export interface PathMappingRow {
  localPath: string;
  immichPath: string;
}

export interface ExtensionSettings {
  enabledUrls: string[];
  pathMappings: PathMappingRow[];
  showPartnerIcons: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledUrls: ['https://demo.immich.app'],
  pathMappings: [],
  showPartnerIcons: true,
};
