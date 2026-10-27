import type { ObsidianProjectionSnapshot } from '../outputs/obsidian/collection-projection.js';
import type { CollectionSyncRepositories } from './sync-collection.js';

/** Production storage supplies a consistent transaction; standalone repository adapters do not. */
export async function readObsidianSnapshot(
  repositories: CollectionSyncRepositories,
): Promise<ObsidianProjectionSnapshot> {
  if (repositories.readSnapshot) return repositories.readSnapshot();
  const items = await repositories.knowledgeItems.listAll();
  const collections = await repositories.collections.listAll();
  const memberships = await repositories.collectionMemberships.listAll();
  return { items, collections, memberships };
}
