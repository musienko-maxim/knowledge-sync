import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';

export interface CollectionRepository {
  /** Insert or update metadata using source + sourceId identity. */
  upsert(collection: KnowledgeCollection): Promise<void>;
  /** All collections ordered by source, then sourceId, ascending. */
  listAll(): Promise<readonly KnowledgeCollection[]>;
}
