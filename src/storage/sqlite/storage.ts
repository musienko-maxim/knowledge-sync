import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ItemIdentity } from '../../core/models/knowledge-item.js';
import type { ImportedItem, Storage } from '../storage.js';
import { importedItems } from './schema.js';
import { createKnowledgeItemRepository } from './knowledge-item-repository.js';
import { createCollectionRepository } from './collection-repository.js';
import { createCollectionMembershipRepository } from './collection-membership-repository.js';

/** Use a database path outside the vault for normalized items and import state. */
export function openStorage(databasePath: string): Storage {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  try {
    sqlite.pragma('foreign_keys = ON');
    // Additive bootstrap DDL preserves existing items and original import metadata.
    // Use versioned migrations when existing tables need transformation.
    sqlite.exec(`CREATE TABLE IF NOT EXISTS imported_items (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      PRIMARY KEY (source, source_id)
    )`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS knowledge_items (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      author TEXT,
      collection TEXT,
      published_at TEXT,
      PRIMARY KEY (source, source_id)
    )`);
    // Legacy item.collection titles cannot safely identify or backfill collections.
    sqlite.exec(`CREATE TABLE IF NOT EXISTS collections (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      PRIMARY KEY (source, source_id)
    )`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS collection_memberships (
      source TEXT NOT NULL,
      collection_source_id TEXT NOT NULL,
      item_source_id TEXT NOT NULL,
      PRIMARY KEY (source, collection_source_id, item_source_id),
      FOREIGN KEY (source, collection_source_id) REFERENCES collections (source, source_id),
      FOREIGN KEY (source, item_source_id) REFERENCES knowledge_items (source, source_id)
    )`);
    const db = drizzle(sqlite);
    return {
      knowledgeItems: createKnowledgeItemRepository(db),
      collections: createCollectionRepository(db),
      collectionMemberships: createCollectionMembershipRepository(db),
      getImported(identity: ItemIdentity) {
        return db.select().from(importedItems).where(and(
          eq(importedItems.source, identity.source),
          eq(importedItems.sourceId, identity.sourceId),
        )).get();
      },
      recordImport(item: ImportedItem) {
        return db.insert(importedItems).values(item).onConflictDoNothing({
          target: [importedItems.source, importedItems.sourceId],
        }).run().changes === 1;
      },
      close() { sqlite.close(); },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
