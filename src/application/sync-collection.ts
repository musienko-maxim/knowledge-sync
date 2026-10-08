import type { CollectionCollector } from '../collectors/collection-collector.js';
import type { ItemIdentity } from '../core/models/knowledge-item.js';
import type { Storage } from '../storage/storage.js';
import { sync, type SyncResult } from './sync.js';

export type CollectionSyncRepositories = Pick<Storage,
  'knowledgeItems' | 'collections' | 'collectionMemberships'>;

export interface CollectionSyncResult extends SyncResult {
  /** Stale relationships removed after this collection was successfully persisted. */
  membershipsRemoved: number;
}

/** Reconcile only a complete, successfully persisted collection. The caller owns storage. */
export async function syncCollection(
  collector: CollectionCollector,
  repositories: CollectionSyncRepositories,
): Promise<CollectionSyncResult> {
  const { collection, items } = await collector.collectCollection();
  if (items.some((item) => item.source !== collection.source)) {
    throw new Error('Collection membership requires items from the same source.');
  }

  await repositories.collections.upsert(collection);
  // Reuse item classification, while awaiting membership even for unchanged items.
  const result = await sync({ collect: async () => items }, {
    findByIdentity: (source, sourceId) => repositories.knowledgeItems.findByIdentity(source, sourceId),
    listAll: () => repositories.knowledgeItems.listAll(),
    upsert: async (item) => {
      await repositories.knowledgeItems.upsert(item);
      await repositories.collectionMemberships.add({
        source: collection.source,
        collectionSourceId: collection.sourceId,
        itemSourceId: item.sourceId,
      });
    },
  });
  const desiredItems = new Map<string, ItemIdentity>();
  for (const { source, sourceId } of items) {
    desiredItems.set(JSON.stringify([source, sourceId]), { source, sourceId });
  }
  const membershipsRemoved = await repositories.collectionMemberships.removeStaleForCollection(
    { source: collection.source, sourceId: collection.sourceId }, [...desiredItems.values()],
  );
  return { ...result, membershipsRemoved };
}
