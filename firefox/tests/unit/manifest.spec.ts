import { describe, expect, it } from 'vitest';
import manifest from '../../src/manifest.json';

describe('firefox manifest', () => {
  it('requests runtime-grantable host permissions instead of required host permissions', () => {
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
  });

  it('includes Firefox-compatible MV3 background scripts fallback', () => {
    expect(manifest.background).toEqual({
      scripts: ['background.js'],
      service_worker: 'background.js',
    });
  });
});
