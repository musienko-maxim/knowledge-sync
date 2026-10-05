import { asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CollectionRepository } from '../collection-repository.js';
import { collections } from './schema.js';

/** Uses the shared connection owned by openStorage. */
export function createCollectionRepository(db: BetterSQLite3Database): CollectionRepository {
  return {
    async upsert(collection) {
      db.insert(collections).values(collection).onConflictDoUpdate({
        target: [collections.source, collections.sourceId],
        set: { title: collection.title },
      }).run();
    },
    async listAll() {
      return db.select().from(collections)
        .orderBy(asc(collections.source), asc(collections.sourceId)).all()
        .map((row) => ({ source: row.source, sourceId: row.sourceId, title: row.title }));
    },
  };
}
