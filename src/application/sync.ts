import type { Collector } from '../collectors/collector.js';
import type { KnowledgeItem } from '../core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from '../storage/knowledge-item-repository.js';

export interface SyncResult {
  /** Successfully persisted array entries, including duplicate identities. */
  processed: number;
  new: number;
  changed: number;
  unchanged: number;
}

// All persisted non-identity fields are strings; missing optional properties read
// as undefined. Preserve empty text and exact publication-date representations.
function samePersistedState(existing: KnowledgeItem, incoming: KnowledgeItem): boolean {
  return existing.url === incoming.url
    && existing.title === incoming.title
    && existing.description === incoming.description
    && existing.author === incoming.author
    && existing.collection === incoming.collection
    && existing.publishedAt === incoming.publishedAt;
}

/** Stops on the first failure without rolling back earlier writes. The caller owns storage. */
export async function sync(
  collector: Collector,
  repository: KnowledgeItemRepository,
): Promise<SyncResult> {
  const items = await collector.collect();
  const result: SyncResult = { processed: 0, new: 0, changed: 0, unchanged: 0 };
  for (const item of items) {
    const existing = await repository.findByIdentity(item.source, item.sourceId);
    const classification = existing === null ? 'new'
      : samePersistedState(existing, item) ? 'unchanged' : 'changed';
    await repository.upsert(item);
    result.processed++;
    result[classification]++;
  }
  return result;
}
