import { describe, expect, it } from 'vitest';
import {
  applyPathMappings,
  filterCompleteMappings,
  folderLinkTextLooksLikePathDisplay,
  normalizeMappingPathSide,
  pathPrefixMatches,
  sortMappingsForReplace,
} from '../../src/shared/path-mapping';
import type { PathMappingRow } from '../../src/shared/storage-types';

describe('normalizeMappingPathSide', () => {
  it('trims trailing slashes on the right (POSIX)', () => {
    expect(normalizeMappingPathSide('/a/b/c/')).toBe('/a/b/c');
    expect(normalizeMappingPathSide('/a/b/c///')).toBe('/a/b/c');
    expect(normalizeMappingPathSide('/a/b/c')).toBe('/a/b/c');
  });

  it('treats trailing slashes as equivalent to no trailing slash', () => {
    expect(normalizeMappingPathSide('/data/upload/')).toBe('/data/upload');
  });

  it('preserves root as a single slash', () => {
    expect(normalizeMappingPathSide('/')).toBe('/');
    expect(normalizeMappingPathSide('//')).toBe('/');
  });

  it('trims whitespace and normalizes backslashes before stripping trailing slashes', () => {
    expect(normalizeMappingPathSide('  C:\\foo\\bar\\  ')).toBe('C:/foo/bar');
  });

  it('maps empty or whitespace-only to empty', () => {
    expect(normalizeMappingPathSide('')).toBe('');
    expect(normalizeMappingPathSide('   ')).toBe('');
  });
});

describe('pathPrefixMatches', () => {
  it('does not treat /a/b as a prefix of /a/bcd.jpg (segment boundary)', () => {
    expect(pathPrefixMatches('/a/bcd.jpg', '/a/b')).toBe(false);
  });

  it('does not treat /a/b as a prefix of /a/bd', () => {
    expect(pathPrefixMatches('/a/bd', '/a/b')).toBe(false);
  });

  it('matches exact path and children under a directory', () => {
    expect(pathPrefixMatches('/a/b', '/a/b')).toBe(true);
    expect(pathPrefixMatches('/a/b/file.jpg', '/a/b')).toBe(true);
    expect(pathPrefixMatches('/a/b/sub/x', '/a/b')).toBe(true);
  });

  it('does not match /data/up to /data/upload/... (docker partial dirname)', () => {
    expect(pathPrefixMatches('/data/upload/1234.jpg', '/data/up')).toBe(false);
    expect(pathPrefixMatches('/data/upload', '/data/up')).toBe(false);
  });

  it('matches when immich prefix is stored with trailing slash (normalized)', () => {
    expect(pathPrefixMatches('/data/upload/x', '/data/upload/')).toBe(true);
  });

  it('does not match single-letter local roots inside a longer segment (e.g. A vs Ab)', () => {
    expect(pathPrefixMatches('Ab', 'A')).toBe(false);
    expect(pathPrefixMatches('A/user/x', 'A')).toBe(true);
  });

  it('treats / as matching any absolute POSIX path', () => {
    expect(pathPrefixMatches('/data/x', '/')).toBe(true);
    expect(pathPrefixMatches('rel/x', '/')).toBe(false);
  });
});

describe('filterCompleteMappings', () => {
  it('drops rows with only one side', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/a', immichPath: '/b' },
      { localPath: '', immichPath: '/x' },
      { localPath: '/y', immichPath: '  ' },
    ];
    expect(filterCompleteMappings(rows)).toEqual([{ localPath: '/a', immichPath: '/b' }]);
  });

  it('normalizes trailing slashes on both sides when filtering', () => {
    const rows: PathMappingRow[] = [{ localPath: '/local/', immichPath: '/immich///' }];
    expect(filterCompleteMappings(rows)).toEqual([{ localPath: '/local', immichPath: '/immich' }]);
  });
});

describe('sortMappingsForReplace', () => {
  it('orders longest immich path first', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/short', immichPath: '/data' },
      { localPath: '/long', immichPath: '/data/upload' },
    ];
    expect(sortMappingsForReplace(rows).map((r) => r.immichPath)).toEqual([
      '/data/upload',
      '/data',
    ]);
  });
});

describe('applyPathMappings', () => {
  it('replaces longest matching prefix', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/var/test', immichPath: '/data/upload' },
      { localPath: '/x', immichPath: '/data' },
    ];
    const out = applyPathMappings('/data/upload/foo.jpg', rows);
    expect(out).toBe('/var/test/foo.jpg');
  });

  it('does not replace when immich path is only a string prefix of a path segment (docker /data/up vs upload)', () => {
    const rows: PathMappingRow[] = [{ localPath: '/Z', immichPath: '/data/up' }];
    expect(applyPathMappings('/data/upload/1234.jpg', rows)).toBe('/data/upload/1234.jpg');
  });

  it('is idempotent after replace', () => {
    const rows: PathMappingRow[] = [{ localPath: '/var/test', immichPath: '/data/upload' }];
    const once = applyPathMappings('/data/upload/a.jpg', rows);
    expect(applyPathMappings(once, rows)).toBe(once);
  });
});

describe('folderLinkTextLooksLikePathDisplay', () => {
  const dockerStyle: PathMappingRow[] = [
    { localPath: 'A', immichPath: '/usr/src/app/upload/library' },
    { localPath: 'B', immichPath: '/usr/src/app/upload' },
  ];

  it('accepts POSIX server paths', () => {
    expect(folderLinkTextLooksLikePathDisplay('/usr/src/app/upload/x.jpg', dockerStyle)).toBe(true);
  });

  it('accepts mapped paths with local root and no leading slash', () => {
    expect(folderLinkTextLooksLikePathDisplay('A/user/uuid/file.jpg', dockerStyle)).toBe(true);
    expect(folderLinkTextLooksLikePathDisplay('B/user/uuid/file.jpg', dockerStyle)).toBe(true);
  });

  it('rejects empty and bare URLs', () => {
    expect(folderLinkTextLooksLikePathDisplay('', dockerStyle)).toBe(false);
    expect(folderLinkTextLooksLikePathDisplay('https://x/y', dockerStyle)).toBe(false);
  });
});
