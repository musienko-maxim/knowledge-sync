import type { CollectionMembership } from '../core/models/collection-membership.js';

export interface CollectionMembershipRepository {
  /** Idempotent insertion; both same-source parents must already exist. */
  add(membership: CollectionMembership): Promise<void>;
  /** Ordered by source, collectionSourceId, then itemSourceId, ascending. */
  listAll(): Promise<readonly CollectionMembership[]>;
}
