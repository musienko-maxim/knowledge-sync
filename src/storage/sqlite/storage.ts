import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ItemIdentity } from '../../core/models/knowledge-item.js';
import type { ImportedItem, SyncStorage } from '../storage.js';
import { importedItems } from './schema.js';

/** Use a database path outside the vault; this database contains state only. */
export function openStorage(databasePath: string): SyncStorage {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  try {
    // Bootstrap DDL matches schema.ts. Introduce versioned migrations when it evolves.
    sqlite.exec(`CREATE TABLE IF NOT EXISTS imported_items (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      PRIMARY KEY (source, source_id)
    )`);
    const db = drizzle(sqlite);
    return {
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
