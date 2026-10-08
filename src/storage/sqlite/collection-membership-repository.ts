import { and, asc, eq } from 'drizzle-orm';
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
    async removeStaleForCollection(collection, desiredItems) {
      const desiredIds = new Set<string>();
      for (const item of desiredItems) {
        if (item.source !== collection.source) {
          throw new Error('Desired membership items must share the collection source.');
        }
        desiredIds.add(item.sourceId);
      }

      // A synchronous transaction protects the entire destructive phase, including
      // a failure after an earlier deletion. Desired IDs never become SQL parameters.
      return db.transaction((tx) => {
        const scope = and(eq(collectionMemberships.source, collection.source),
          eq(collectionMemberships.collectionSourceId, collection.sourceId));
        const existing = tx.select({ itemSourceId: collectionMemberships.itemSourceId })
          .from(collectionMemberships).where(scope)
          .orderBy(asc(collectionMemberships.itemSourceId)).all();
        let removed = 0;
        for (const membership of existing) {
          if (!desiredIds.has(membership.itemSourceId)) {
            removed += tx.delete(collectionMemberships).where(and(scope,
              eq(collectionMemberships.itemSourceId, membership.itemSourceId))).run().changes;
          }
        }
        return removed;
      });
    },
    async listAll() {
      return db.select().from(collectionMemberships).orderBy(asc(collectionMemberships.source),
        asc(collectionMemberships.collectionSourceId), asc(collectionMemberships.itemSourceId)).all()
        .map((row) => ({ source: row.source, collectionSourceId: row.collectionSourceId,
          itemSourceId: row.itemSourceId }));
    },
  };
}
