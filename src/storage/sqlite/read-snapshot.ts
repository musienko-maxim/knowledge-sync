import type Database from 'better-sqlite3';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { knowledgeItemSchema } from '../../core/models/knowledge-item.js';
import type { KnowledgeSnapshot } from '../knowledge-snapshot.js';
import { toKnowledgeItem } from './knowledge-item-repository.js';
import { collectionMemberships, collections, knowledgeItems } from './schema.js';

// Unlike collector validation, reading storage must not trim or otherwise
// transform identity/title strings. Blank titles have an output-layer fallback.
const identity = z.string().min(1).refine((value) => !/[\uD800-\uDFFF]/u.test(value));
const itemSchema = z.object({
  source: identity, sourceId: identity, title: z.string(),
  url: knowledgeItemSchema.shape.url,
  description: z.string().optional(), author: z.string().optional(),
  collection: z.string().optional(), publishedAt: knowledgeItemSchema.shape.publishedAt,
});
const collectionSchema = z.object({ source: identity, sourceId: identity, title: z.string() });
const membershipSchema = z.object({ source: identity, collectionSourceId: identity, itemSourceId: identity });

function key(source: string, sourceId: string): string { return JSON.stringify([source, sourceId]); }

/** Validate original SQLite identity bytes before the driver's forgiving UTF-8 string decoding. */
function validateIdentityEncoding(sqlite: Database.Database): void {
  const encoding = sqlite.pragma('encoding', { simple: true });
  if (encoding !== 'UTF-8' && encoding !== 'UTF-16le' && encoding !== 'UTF-16be') throw new Error('Snapshot encoding is incompatible.');
  const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
  const identities = [
    ['knowledge_items', ['source', 'source_id']],
    ['collections', ['source', 'source_id']],
    ['collection_memberships', ['source', 'collection_source_id', 'item_source_id']],
  ] as const;
  for (const [table, columns] of identities) {
    // All SQL identifiers are fixed repository constants, never external values.
    const rows = sqlite.prepare(`SELECT ${columns.map((column) => `CAST(${column} AS BLOB) AS ${column}`).join(', ')} FROM ${table}`).all();
    for (const row of rows as Record<string, unknown>[]) {
      for (const column of columns) {
        const bytes = row[column];
        if (!Buffer.isBuffer(bytes)) throw new Error('Snapshot identity encoding is invalid.');
        decoder.decode(bytes);
      }
    }
  }
}

/** Synchronous reads stay inside one SQLite transaction; no awaited callbacks. */
export function readSqliteSnapshot(sqlite: Database.Database): KnowledgeSnapshot {
  const db = drizzle(sqlite);
  return sqlite.transaction(() => {
    // Real tables only: a view is not a compatible persisted domain schema.
    const tables = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as { name: string }[];
    const names = new Set(tables.map(({ name }) => name));
    if (!['knowledge_items', 'collections', 'collection_memberships'].every((name) => names.has(name))) {
      throw new Error('Snapshot schema is incompatible.');
    }
    validateIdentityEncoding(sqlite);
    const items = db.select().from(knowledgeItems).orderBy(asc(knowledgeItems.source), asc(knowledgeItems.sourceId))
      .all().map(toKnowledgeItem).map((item) => itemSchema.parse(item));
    const savedCollections = db.select().from(collections).orderBy(asc(collections.source), asc(collections.sourceId))
      .all().map((row) => collectionSchema.parse(row));
    const memberships = db.select().from(collectionMemberships).orderBy(asc(collectionMemberships.source),
      asc(collectionMemberships.collectionSourceId), asc(collectionMemberships.itemSourceId))
      .all().map((row) => membershipSchema.parse(row));

    const itemKeys = new Set(items.map(({ source, sourceId }) => key(source, sourceId)));
    const collectionKeys = new Set(savedCollections.map(({ source, sourceId }) => key(source, sourceId)));
    const edgeKeys = new Set<string>();
    if (itemKeys.size !== items.length || collectionKeys.size !== savedCollections.length) {
      throw new Error('Snapshot identities are duplicated.');
    }
    for (const membership of memberships) {
      const edge = JSON.stringify([membership.source, membership.collectionSourceId, membership.itemSourceId]);
      if (edgeKeys.has(edge) || !itemKeys.has(key(membership.source, membership.itemSourceId))
        || !collectionKeys.has(key(membership.source, membership.collectionSourceId))) {
        throw new Error('Snapshot membership is invalid.');
      }
      edgeKeys.add(edge);
    }
    return { items, collections: savedCollections, memberships };
  })();
}
