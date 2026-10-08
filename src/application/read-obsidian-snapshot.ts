import type { ObsidianProjectionSnapshot } from '../outputs/obsidian/collection-projection.js';
import type { CollectionSyncRepositories } from './sync-collection.js';

/** Finish all reads before output. Sequential reads are not a cross-process transaction. */
export async function readObsidianSnapshot(
  repositories: CollectionSyncRepositories,
): Promise<ObsidianProjectionSnapshot> {
  const items = await repositories.knowledgeItems.listAll();
  const collections = await repositories.collections.listAll();
  const memberships = await repositories.collectionMemberships.listAll();
  return { items, collections, memberships };
}
