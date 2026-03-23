export type OwnerPair = { assetId: string; ownerId: string };

function zipParallelArrays(ids: unknown, ownerIds: unknown): OwnerPair[] {
  if (!Array.isArray(ids) || !Array.isArray(ownerIds)) return [];
  const out: OwnerPair[] = [];
  const n = Math.min(ids.length, ownerIds.length);
  for (let i = 0; i < n; i++) {
    const assetId = ids[i];
    const ownerId = ownerIds[i];
    if (typeof assetId === 'string' && typeof ownerId === 'string') {
      out.push({ assetId, ownerId });
    }
  }
  return out;
}

function fromAssetItems(items: unknown): OwnerPair[] {
  if (!Array.isArray(items)) return [];
  const out: OwnerPair[] = [];
  for (const item of items) {
    if (item && typeof item === 'object' && 'id' in item && 'ownerId' in item) {
      const id = (item as { id: unknown }).id;
      const ownerId = (item as { ownerId: unknown }).ownerId;
      if (typeof id === 'string' && typeof ownerId === 'string') {
        out.push({ assetId: id, ownerId });
      }
    }
  }
  return out;
}

/**
 * Extract assetId -> ownerId pairs from various Immich API JSON shapes.
 */
export function parseOwnerPairsFromJson(data: unknown): OwnerPair[] {
  if (data == null) return [];

  let body: unknown = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return [];
    }
  }

  if (typeof body !== 'object' || body === null) return [];

  const o = body as Record<string, unknown>;

  if ('data' in o && o.data !== undefined) {
    return parseOwnerPairsFromJson(o.data);
  }

  const fromParallel = zipParallelArrays(o.id, o.ownerId);
  if (fromParallel.length) return fromParallel;

  if (o.assets && typeof o.assets === 'object' && o.assets !== null) {
    const a = o.assets as Record<string, unknown>;
    const items = fromAssetItems(a.items);
    if (items.length) return items;
  }

  if ('items' in o) {
    const items = fromAssetItems(o.items);
    if (items.length) return items;
  }

  if ('id' in o && 'ownerId' in o && typeof o.id === 'string' && typeof o.ownerId === 'string') {
    return [{ assetId: o.id, ownerId: o.ownerId }];
  }

  return [];
}
