import type { ItemIdentity } from '../core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from './knowledge-item-repository.js';
import type { CollectionRepository } from './collection-repository.js';
import type { CollectionMembershipRepository } from './collection-membership-repository.js';
import type { KnowledgeSnapshot } from './knowledge-snapshot.js';

export interface ImportedItem extends ItemIdentity {
  url: string;
  importedAt: Date;
}

export interface SyncStorage {
  getImported(identity: ItemIdentity): ImportedItem | undefined;
  /** Returns false for existing identities; preserves original import metadata. */
  recordImport(item: ImportedItem): boolean;
  close(): void;
}

/** All persistence boundaries share one database lifecycle. */
export interface Storage extends SyncStorage {
  /** Read all normalized entities in one synchronous storage transaction. */
  readSnapshot(): KnowledgeSnapshot;
  readonly knowledgeItems: KnowledgeItemRepository;
  readonly collections: CollectionRepository;
  readonly collectionMemberships: CollectionMembershipRepository;
}
