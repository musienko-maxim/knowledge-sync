import type { CollectionMembership } from '../core/models/collection-membership.js';
import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';
import type { ItemIdentity } from '../core/models/knowledge-item.js';

export interface CollectionMembershipRepository {
  /** Idempotent insertion; both same-source parents must already exist. */
  add(membership: CollectionMembership): Promise<void>;
  /** Atomically removes only stale edges in this collection; desired items must share its source. */
  removeStaleForCollection(
    collection: Pick<KnowledgeCollection, 'source' | 'sourceId'>,
    desiredItems: readonly ItemIdentity[],
  ): Promise<number>;
  /** Ordered by source, collectionSourceId, then itemSourceId, ascending. */
  listAll(): Promise<readonly CollectionMembership[]>;
}
