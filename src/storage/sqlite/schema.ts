import { primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const importedItems = sqliteTable('imported_items', {
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  url: text('url').notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [primaryKey({ columns: [table.source, table.sourceId] })]);

export const knowledgeItems = sqliteTable('knowledge_items', {
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  author: text('author'),
  collection: text('collection'),
  publishedAt: text('published_at'),
}, (table) => [primaryKey({ columns: [table.source, table.sourceId] })]);
