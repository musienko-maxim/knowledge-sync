import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import { encodeObsidianPathComponent } from './note-path.js';

/** Stable collection namespace using the unchanged persistent identity encoding. */
export function buildObsidianCollectionRelativePath(collection: KnowledgeCollection): string {
  return `${encodeObsidianPathComponent(collection.source, 'source')}/collections/${encodeObsidianPathComponent(collection.sourceId, 'sourceId')}.md`;
}
