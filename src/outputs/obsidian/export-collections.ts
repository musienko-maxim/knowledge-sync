import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import type { CollectionProjection } from './collection-projection.js';
import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { CollectionMembership } from '../../core/models/collection-membership.js';
import { buildObsidianExportPlan } from './export-plan.js';
import { exportObsidianPlan } from './export-projection.js';

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

/** Collection-only adapter: render links from one validated plan without publishing member notes. */
export async function exportObsidianCollections(
  vaultPath: string,
  projections: readonly CollectionProjection[],
): Promise<ObsidianCollectionBatchExportResult> {
  const items = new Map<string, KnowledgeItem>();
  const memberships: CollectionMembership[] = [];
  for (const projection of projections) {
    for (const item of projection.items) {
      if (item.source !== projection.collection.source) throw new Error('Projection membership requires the same source.');
      const key = JSON.stringify([item.source, item.sourceId]);
      const existing = items.get(key);
      if (existing && (Object.keys({ ...existing, ...item }) as (keyof KnowledgeItem)[])
        .some((field) => existing[field] !== item[field])) {
        throw new Error('Projection contains conflicting values for one item identity.');
      }
      items.set(key, item);
      memberships.push({ source: projection.collection.source,
        collectionSourceId: projection.collection.sourceId, itemSourceId: item.sourceId });
    }
  }
  const plan = buildObsidianExportPlan({ items: [...items.values()],
    collections: projections.map((projection) => projection.collection), memberships });
  const result = await exportObsidianPlan(vaultPath, Object.freeze({ ...plan, items: Object.freeze([]), navigation: undefined }));
  if (result.collections.status === 'failed') throw result.collections.error;
  if (result.collections.status === 'skipped') throw new Error('Collection publication was skipped.');
  return result.collections.result;
}
