import { and, asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from '../knowledge-item-repository.js';
import { knowledgeItems } from './schema.js';

function toKnowledgeItem(row: typeof knowledgeItems.$inferSelect): KnowledgeItem {
  return {
    source: row.source,
    sourceId: row.sourceId,
    url: row.url,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.author === null ? {} : { author: row.author }),
    ...(row.collection === null ? {} : { collection: row.collection }),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt }),
  };
}

/** Uses the caller's Drizzle connection; openStorage owns opening and closing it. */
export function createKnowledgeItemRepository(db: BetterSQLite3Database): KnowledgeItemRepository {
  return {
    async findByIdentity(source, sourceId) {
      const row = db.select().from(knowledgeItems).where(and(
        eq(knowledgeItems.source, source), eq(knowledgeItems.sourceId, sourceId),
      )).get();
      return row ? toKnowledgeItem(row) : null;
    },
    async listAll() {
      return db.select().from(knowledgeItems)
        .orderBy(asc(knowledgeItems.source), asc(knowledgeItems.sourceId))
        .all().map(toKnowledgeItem);
    },
    async upsert(item) {
      const fields = {
        url: item.url,
        title: item.title,
        // Explicit NULL clears old metadata; Drizzle skips undefined update values.
        description: item.description ?? null,
        author: item.author ?? null,
        collection: item.collection ?? null,
        publishedAt: item.publishedAt ?? null,
      };
      db.insert(knowledgeItems).values({ source: item.source, sourceId: item.sourceId, ...fields })
        .onConflictDoUpdate({ target: [knowledgeItems.source, knowledgeItems.sourceId], set: fields }).run();
    },
  };
}
