import type { ItemIdentity } from '../core/models/knowledge-item.js';

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
