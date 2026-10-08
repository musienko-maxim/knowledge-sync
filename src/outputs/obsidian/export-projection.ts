import { buildCollectionProjections, type ObsidianProjectionSnapshot } from './collection-projection.js';
import { exportObsidianCollections, type ObsidianCollectionBatchExportResult } from './export-collections.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from './export-notes.js';

export type CollectionExportOutcome =
  | { status: 'completed'; result: ObsidianCollectionBatchExportResult }
  | { status: 'failed'; error: unknown };

export interface ObsidianProjectionExportResult {
  readonly items: ObsidianBatchExportResult;
  readonly collections: CollectionExportOutcome;
}

/** Validate the entire snapshot, export items, then collections without losing item results. */
export async function exportObsidianProjection(
  vaultPath: string,
  snapshot: ObsidianProjectionSnapshot,
): Promise<ObsidianProjectionExportResult> {
  const projections = buildCollectionProjections(snapshot.items, snapshot.collections, snapshot.memberships);
  const items = await exportObsidianNotes(vaultPath, snapshot.items);
  try {
    return { items, collections: { status: 'completed', result: await exportObsidianCollections(vaultPath, projections) } };
  } catch (error) {
    return { items, collections: { status: 'failed', error } };
  }
}
