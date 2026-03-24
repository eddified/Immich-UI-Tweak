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

  it('does not match longer host that merely string-extends the allowed host', () => {
    expect(
      isUrlEnabled('https://demo.immich.app.attacker.test/photos', ['https://demo.immich.app']),
    ).toBe(false);
  });

  it('does not match path that extends the allowed path without a segment boundary', () => {
    expect(
      isUrlEnabled('https://demo.immich.app/teamfoo/x', ['https://demo.immich.app/team']),
    ).toBe(false);
  });

  it('matches path prefix at a segment boundary', () => {
    expect(
      isUrlEnabled('https://demo.immich.app/team/photos/x', ['https://demo.immich.app/team']),
    ).toBe(true);
  });

  it('matches exact path prefix', () => {
    expect(isUrlEnabled('https://demo.immich.app/team', ['https://demo.immich.app/team'])).toBe(
      true,
    );
  });

  it('returns false for empty list', () => {
    expect(isUrlEnabled('https://demo.immich.app/', [])).toBe(false);
  });

  it('returns false when prefix is not a valid URL', () => {
    expect(isUrlEnabled('https://demo.immich.app/photos', ['not-a-valid-url'])).toBe(false);
  });
});
