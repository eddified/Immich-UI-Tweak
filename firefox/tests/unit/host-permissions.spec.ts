import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('firefoxHostPermissionsOptIn', () => {
  it('is true when runtime.getBrowserInfo exists (Firefox)', async () => {
    vi.stubGlobal('chrome', {
      runtime: { getBrowserInfo: () => Promise.resolve({ name: 'Firefox' }) },
      permissions: { contains: vi.fn(), request: vi.fn() },
    });
    const { firefoxHostPermissionsOptIn } = await import('../../src/shared/host-permissions');
    expect(firefoxHostPermissionsOptIn()).toBe(true);
  });

  it('is false on Chromium-like runtimes', async () => {
    vi.stubGlobal('chrome', {
      runtime: {},
      permissions: { contains: vi.fn(), request: vi.fn() },
    });
    const { firefoxHostPermissionsOptIn } = await import('../../src/shared/host-permissions');
    expect(firefoxHostPermissionsOptIn()).toBe(false);
  });
});

describe('requestHostPermissionsForEnabledUrls', () => {
  it('calls permissions.request immediately without a contains preflight', async () => {
    const contains = vi.fn();
    const request = vi.fn((_permissions, cb: (granted: boolean) => void) => cb(true));
    vi.stubGlobal('chrome', {
      runtime: { getBrowserInfo: () => Promise.resolve({ name: 'Firefox' }), lastError: undefined },
      permissions: { contains, request },
    });

    const { requestHostPermissionsForEnabledUrls } = await import('../../src/shared/host-permissions');
    await expect(requestHostPermissionsForEnabledUrls(['https://demo.immich.app'])).resolves.toBe(true);

    expect(contains).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      { origins: ['https://demo.immich.app/*'] },
      expect.any(Function),
    );
  });
});
