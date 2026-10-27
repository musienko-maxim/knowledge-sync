import type { CollectionMembership } from '../core/models/collection-membership.js';
import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../core/models/knowledge-item.js';

/** A consistent view of normalized storage, independent of any output format. */
export interface KnowledgeSnapshot {
  readonly items: readonly KnowledgeItem[];
  readonly collections: readonly KnowledgeCollection[];
  readonly memberships: readonly CollectionMembership[];
}
