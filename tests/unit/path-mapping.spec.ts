import { describe, expect, it } from 'vitest';
import {
  applyPathMappings,
  filterCompleteMappings,
  sortMappingsForReplace,
} from '../../src/shared/path-mapping';
import type { PathMappingRow } from '../../src/shared/storage-types';

describe('filterCompleteMappings', () => {
  it('drops rows with only one side', () => {
    const rows: PathMappingRow[] = [
      { localPath: '/a', immichPath: '/b' },
      { localPath: '', immichPath: '/x' },
      { localPath: '/y', immichPath: '  ' },
    ];
    expect(filterCompleteMappings(rows)).toEqual([{ localPath: '/a', immichPath: '/b' }]);
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

  it('is idempotent after replace', () => {
    const rows: PathMappingRow[] = [{ localPath: '/var/test', immichPath: '/data/upload' }];
    const once = applyPathMappings('/data/upload/a.jpg', rows);
    expect(applyPathMappings(once, rows)).toBe(once);
  });
});
