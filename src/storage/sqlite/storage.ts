import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ItemIdentity } from '../../core/models/knowledge-item.js';
import type { ImportedItem, Storage } from '../storage.js';
import { importedItems } from './schema.js';
import { createKnowledgeItemRepository } from './knowledge-item-repository.js';

/** Use a database path outside the vault for normalized items and import state. */
export function openStorage(databasePath: string): Storage {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  try {
    // Additive bootstrap DDL matches schema.ts and upgrades existing state-only databases.
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
    const db = drizzle(sqlite);
    return {
      knowledgeItems: createKnowledgeItemRepository(db),
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
