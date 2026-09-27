import type { ItemIdentity } from '../core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from './knowledge-item-repository.js';

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

/** Both persistence boundaries share one database lifecycle. */
export interface Storage extends SyncStorage {
  readonly knowledgeItems: KnowledgeItemRepository;
}
