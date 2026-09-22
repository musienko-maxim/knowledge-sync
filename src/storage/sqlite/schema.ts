import { primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const importedItems = sqliteTable('imported_items', {
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  url: text('url').notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [primaryKey({ columns: [table.source, table.sourceId] })]);
