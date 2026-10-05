import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../core/models/knowledge-item.js';

export interface CollectedCollection {
  readonly collection: KnowledgeCollection;
  readonly items: KnowledgeItem[];
}

/** Collection context survives even when the source contains no usable items. */
export interface CollectionCollector {
  collectCollection(): Promise<CollectedCollection>;
}
