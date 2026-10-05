import type { KnowledgeItem } from '../core/models/knowledge-item.js';

/** Normalized item persistence, independent of import/output state. */
export interface KnowledgeItemRepository {
  findByIdentity(source: KnowledgeItem['source'], sourceId: string): Promise<KnowledgeItem | null>;
  /** All persisted items ordered by source, then sourceId, ascending. */
  listAll(): Promise<readonly KnowledgeItem[]>;
  upsert(item: KnowledgeItem): Promise<void>;
}
