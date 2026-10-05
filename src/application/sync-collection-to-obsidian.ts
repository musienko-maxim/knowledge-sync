import type { CollectionCollector } from '../collectors/collection-collector.js';
import { exportObsidianNotes } from '../outputs/obsidian/export-notes.js';
import { syncCollection, type CollectionSyncRepositories } from './sync-collection.js';
import type { SyncToObsidianResult } from './sync-to-obsidian.js';

/** Export the full item snapshot only after all observed memberships are persisted. */
export async function syncCollectionToObsidian(
  collector: CollectionCollector,
  repositories: CollectionSyncRepositories,
  vaultPath: string,
): Promise<SyncToObsidianResult> {
  const syncResult = await syncCollection(collector, repositories);
  const items = await repositories.knowledgeItems.listAll();
  const exportResult = await exportObsidianNotes(vaultPath, items);
  return { sync: syncResult, export: exportResult };
}
