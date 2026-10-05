import { asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CollectionMembershipRepository } from '../collection-membership-repository.js';
import { collectionMemberships } from './schema.js';

/** Uses the shared connection owned by openStorage. */
export function createCollectionMembershipRepository(db: BetterSQLite3Database): CollectionMembershipRepository {
  return {
    async add(membership) {
      db.insert(collectionMemberships).values(membership).onConflictDoNothing({
        target: [collectionMemberships.source, collectionMemberships.collectionSourceId,
          collectionMemberships.itemSourceId],
      }).run();
    },
    async listAll() {
      return db.select().from(collectionMemberships).orderBy(asc(collectionMemberships.source),
        asc(collectionMemberships.collectionSourceId), asc(collectionMemberships.itemSourceId)).all()
        .map((row) => ({ source: row.source, collectionSourceId: row.collectionSourceId,
          itemSourceId: row.itemSourceId }));
    },
  };
}
