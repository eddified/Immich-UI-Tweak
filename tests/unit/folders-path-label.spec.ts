import { describe, expect, it } from 'vitest';
import type { PathMappingRow } from '../../src/shared/storage-types';
import {
  lastServerPathSegment,
  mappedFolderDisplayLabel,
  parentServerFolderPath,
  parseFoldersPathQuery,
} from '../../src/shared/folders-path-label';

describe('parseFoldersPathQuery', () => {
  it('returns decoded path from /folders?path=...', () => {
    expect(parseFoldersPathQuery('https://immich.test/folders?path=%2Fdata%2Fupload')).toBe('/data/upload');
  });

  it('returns null when path param missing', () => {
    expect(parseFoldersPathQuery('https://immich.test/folders')).toBeNull();
  });

  it('accepts nested pathname /folders/photos/id', () => {
    expect(
      parseFoldersPathQuery('https://immich.test/folders/photos/abc?path=%2Fdata%2Fu'),
    ).toBe('/data/u');
  });

  it('returns null for empty path param', () => {
    expect(parseFoldersPathQuery('https://immich.test/folders?path=')).toBeNull();
  });

  it('returns null when not a folders URL', () => {
    expect(parseFoldersPathQuery('https://immich.test/photos/x')).toBeNull();
  });
});

describe('parentServerFolderPath', () => {
  it('returns empty for root-ish paths', () => {
    expect(parentServerFolderPath('')).toBe('');
    expect(parentServerFolderPath('/')).toBe('');
    expect(parentServerFolderPath('/data')).toBe('');
  });

  it('strips last segment for parent folder', () => {
    expect(parentServerFolderPath('/data/upload')).toBe('/data');
  });
});

describe('lastServerPathSegment', () => {
  it('returns last segment', () => {
    expect(lastServerPathSegment('/data/upload')).toBe('upload');
  });
});

describe('mappedFolderDisplayLabel', () => {
  it('shows relative tail after longest-prefix mapping', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/var/test', immichPath: '/data/upload' },
      { localPath: '/x', immichPath: '/data' },
    ];
    const S = '/data/upload/photos';
    const Sp = parentServerFolderPath(S);
    expect(mappedFolderDisplayLabel(S, Sp, rows)).toBe('photos');
  });

  it('uses longest immich prefix for mapping', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/short', immichPath: '/data' },
      { localPath: '/var/deep', immichPath: '/data/upload' },
    ];
    const S = '/data/upload/foo';
    const Sp = '/data/upload';
    expect(mappedFolderDisplayLabel(S, Sp, rows)).toBe('foo');
  });

  it('falls back to last server segment when relative mapping fails', () => {
    const rows: PathMappingRow[] = [{ localPath: '/z', immichPath: '/unrelated' }];
    expect(mappedFolderDisplayLabel('/data/foo', '/data', rows)).toBe('foo');
  });
});
