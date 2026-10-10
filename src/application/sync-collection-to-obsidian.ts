import type { CollectionCollector } from '../collectors/collection-collector.js';
import { exportObsidianProjection, type CollectionExportOutcome, type NavigationExportOutcome } from '../outputs/obsidian/export-projection.js';
import { readObsidianSnapshot } from './read-obsidian-snapshot.js';
import { syncCollection, type CollectionSyncRepositories, type CollectionSyncResult } from './sync-collection.js';
import type { SyncToObsidianResult } from './sync-to-obsidian.js';

export interface SyncCollectionToObsidianResult extends SyncToObsidianResult {
  readonly sync: CollectionSyncResult;
  readonly collections: CollectionExportOutcome;
  readonly navigation: NavigationExportOutcome;
}

/** Export the complete persisted projection only after membership reconciliation succeeds. */
export async function syncCollectionToObsidian(
  collector: CollectionCollector,
  repositories: CollectionSyncRepositories,
  vaultPath: string,
): Promise<SyncCollectionToObsidianResult> {
  const syncResult = await syncCollection(collector, repositories);
  const snapshot = await readObsidianSnapshot(repositories);
  const projection = await exportObsidianProjection(vaultPath, snapshot);
  return { sync: syncResult, export: projection.items, collections: projection.collections, navigation: projection.navigation };
}
