import type { CollectionCollector } from '../collectors/collection-collector.js';
import type { Storage } from '../storage/storage.js';
import { sync, type SyncResult } from './sync.js';

export type CollectionSyncRepositories = Pick<Storage,
  'knowledgeItems' | 'collections' | 'collectionMemberships'>;

/** Add observed relationships without reconciliation. The caller owns storage. */
export async function syncCollection(
  collector: CollectionCollector,
  repositories: CollectionSyncRepositories,
): Promise<SyncResult> {
  const { collection, items } = await collector.collectCollection();
  if (items.some((item) => item.source !== collection.source)) {
    throw new Error('Collection membership requires items from the same source.');
  }

  await repositories.collections.upsert(collection);
  // Reuse item classification, while awaiting membership even for unchanged items.
  return sync({ collect: async () => items }, {
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
}
