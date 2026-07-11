import { enabledUrlsToMatchPatterns } from './url-match';

/** Firefox MV3 treats manifest host_permissions as opt-in; Chromium grants them at install. */
export function firefoxHostPermissionsOptIn(): boolean {
  return typeof (chrome.runtime as { getBrowserInfo?: unknown }).getBrowserInfo === 'function';
}

function permissionsContains(origins: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    if (!chrome.permissions?.contains) {
      resolve(true);
      return;
    }
    chrome.permissions.contains({ origins }, (granted) => {
      void chrome.runtime.lastError;
      resolve(Boolean(granted));
    });
  });
}

function permissionsRequest(origins: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    if (!chrome.permissions?.request) {
      resolve(false);
      return;
    }
    chrome.permissions.request({ origins }, (granted) => {
      void chrome.runtime.lastError;
      resolve(Boolean(granted));
    });
  });
}

export async function hasHostPermissionsForEnabledUrls(enabledUrls: string[]): Promise<boolean> {
  if (!firefoxHostPermissionsOptIn()) {
    return true;
  }
  const origins = enabledUrlsToMatchPatterns(enabledUrls);
  if (origins.length === 0) {
    return true;
  }
  return permissionsContains(origins);
}

export async function requestHostPermissionsForEnabledUrls(enabledUrls: string[]): Promise<boolean> {
  if (!firefoxHostPermissionsOptIn()) {
    return true;
  }
  const origins = enabledUrlsToMatchPatterns(enabledUrls);
  if (origins.length === 0) {
    return true;
  }
  return permissionsRequest(origins);
}
