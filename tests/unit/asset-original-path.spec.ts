import { describe, expect, it } from 'vitest';
import {
  folderPageHrefFromOrigin,
  parentDirForImmichFolderQuery,
  parseOriginalPathFromAssetJson,
  parseOwnerIdFromAssetJson,
} from '../../src/shared/asset-original-path';

describe('parentDirForImmichFolderQuery', () => {
  it('returns parent unix path', () => {
    expect(parentDirForImmichFolderQuery('/data/upload/foo.jpg')).toBe('/data/upload');
  });

  it('normalizes backslashes', () => {
    expect(parentDirForImmichFolderQuery(String.raw`D:\lib\a.jpg`)).toBe('D:/lib');
  });

  it('handles root file', () => {
    expect(parentDirForImmichFolderQuery('/file')).toBe('/');
  });
});

describe('folderPageHrefFromOrigin', () => {
  it('builds folders query like Immich Route.folders', () => {
    const h = folderPageHrefFromOrigin('https://ex.test', '/data/upload/x.jpg');
    expect(h).toBe('https://ex.test/folders?path=%2Fdata%2Fupload');
  });
});

describe('parseOriginalPathFromAssetJson', () => {
  it('reads originalPath from asset dto', () => {
    expect(parseOriginalPathFromAssetJson({ originalPath: '/a/b.jpg' })).toBe('/a/b.jpg');
  });

  it('unwraps data wrapper', () => {
    expect(parseOriginalPathFromAssetJson({ data: { originalPath: '/x' } })).toBe('/x');
  });
});

describe('parseOwnerIdFromAssetJson', () => {
  it('reads ownerId and lowercases', () => {
    expect(parseOwnerIdFromAssetJson({ ownerId: 'ABCDEF01-0000-4000-8000-000000000000' })).toBe(
      'abcdef01-0000-4000-8000-000000000000',
    );
  });

  it('unwraps data wrapper', () => {
    expect(parseOwnerIdFromAssetJson({ data: { ownerId: 'a' } })).toBe('a');
  });
});
