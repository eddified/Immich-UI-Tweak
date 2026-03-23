import { describe, expect, it } from 'vitest';
import { isUrlEnabled, normalizeInstanceUrl } from '../../src/shared/url-match';

describe('normalizeInstanceUrl', () => {
  it('trims and drops trailing slash on path', () => {
    expect(normalizeInstanceUrl('  https://demo.immich.app/  ')).toBe('https://demo.immich.app');
  });

  it('keeps root slash for origin-only URL', () => {
    expect(normalizeInstanceUrl('https://demo.immich.app')).toBe('https://demo.immich.app');
  });
});

describe('isUrlEnabled', () => {
  it('matches when href starts with prefix', () => {
    expect(
      isUrlEnabled('https://demo.immich.app/photos/x', ['https://demo.immich.app']),
    ).toBe(true);
  });

  it('does not match different host', () => {
    expect(isUrlEnabled('https://evil.com/', ['https://demo.immich.app'])).toBe(false);
  });

  it('returns false for empty list', () => {
    expect(isUrlEnabled('https://demo.immich.app/', [])).toBe(false);
  });
});
