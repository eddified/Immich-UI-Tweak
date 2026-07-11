import { describe, expect, it } from 'vitest';
import { parseOwnerPairsFromJson } from '../../src/shared/bucket-parse';

describe('parseOwnerPairsFromJson', () => {
  it('zips parallel id and ownerId arrays', () => {
    const pairs = parseOwnerPairsFromJson({
      id: ['a1', 'a2'],
      ownerId: ['o1', 'o2'],
    });
    expect(pairs).toEqual([
      { assetId: 'a1', ownerId: 'o1' },
      { assetId: 'a2', ownerId: 'o2' },
    ]);
  });

  it('unwraps data wrapper', () => {
    const pairs = parseOwnerPairsFromJson({
      data: { id: ['x'], ownerId: ['y'] },
    });
    expect(pairs).toEqual([{ assetId: 'x', ownerId: 'y' }]);
  });

  it('reads search assets.items', () => {
    const pairs = parseOwnerPairsFromJson({
      assets: {
        items: [
          { id: 'i1', ownerId: 'u1' },
          { id: 'i2', ownerId: 'u2' },
        ],
      },
    });
    expect(pairs).toEqual([
      { assetId: 'i1', ownerId: 'u1' },
      { assetId: 'i2', ownerId: 'u2' },
    ]);
  });

  it('reads folder asset arrays', () => {
    const pairs = parseOwnerPairsFromJson([
      { id: 'f1', ownerId: 'u1' },
      { id: 'f2', ownerId: 'u2' },
    ]);
    expect(pairs).toEqual([
      { assetId: 'f1', ownerId: 'u1' },
      { assetId: 'f2', ownerId: 'u2' },
    ]);
  });

  it('reads single asset', () => {
    expect(parseOwnerPairsFromJson({ id: 'one', ownerId: 'two' })).toEqual([
      { assetId: 'one', ownerId: 'two' },
    ]);
  });
});
