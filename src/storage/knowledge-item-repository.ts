import type { KnowledgeItem } from '../core/models/knowledge-item.js';

/** Normalized item persistence, independent of import/output state. */
export interface KnowledgeItemRepository {
  findByIdentity(source: KnowledgeItem['source'], sourceId: string): Promise<KnowledgeItem | null>;
  upsert(item: KnowledgeItem): Promise<void>;
}
