import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';
import type { CollectionCollector } from './collection-collector.js';

/** Source-specific account discovery and failure classification for application sync. */
export interface AccountSyncSource {
  discover(): Promise<readonly KnowledgeCollection[]>;
  createCollector(collection: KnowledgeCollection): CollectionCollector;
  isFatalError(error: unknown): boolean;
}
