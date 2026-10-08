import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import type { CollectionProjection } from './collection-projection.js';
import { exportObsidianCollection } from './export-collection.js';

export interface ObsidianCollectionExportFailure {
  readonly index: number;
  readonly collection: KnowledgeCollection;
  readonly error: unknown;
}

export interface ObsidianCollectionBatchExportResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failures: readonly ObsidianCollectionExportFailure[];
}

/** Sequential best-effort collection output, preserving input indexes and errors. */
export async function exportObsidianCollections(
  vaultPath: string,
  projections: readonly CollectionProjection[],
): Promise<ObsidianCollectionBatchExportResult> {
  const failures: ObsidianCollectionExportFailure[] = [];
  for (const [index, projection] of projections.entries()) {
    try {
      await exportObsidianCollection(vaultPath, projection);
    } catch (error) {
      failures.push({ index, collection: projection.collection, error });
    }
  }
  return { processed: projections.length, succeeded: projections.length - failures.length, failed: failures.length, failures };
}
