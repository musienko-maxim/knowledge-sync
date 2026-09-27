import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { knowledgeItemSchema, type KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { openStorage } from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

const stores = new Set<Storage>();
const directories: string[] = [];
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function open(path = ':memory:') {
  const store = openStorage(path);
  stores.add(store);
  return store;
}

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-repository-'));
  directories.push(directory);
  return join(directory, 'items.sqlite');
}

const required: KnowledgeItem = {
  source: 'youtube', sourceId: 'videoA', url: 'https://example.com/videoA', title: 'A title',
};
const complete: KnowledgeItem = {
  ...required, description: 'A description', author: 'An author', collection: 'A collection',
  publishedAt: '2026-01-01T12:34:56.123+02:00',
};

it('inserts and reconstructs all domain fields without changing the publication date', async () => {
  const repository = open().knowledgeItems;
  await repository.upsert(complete);
  const result = await repository.findByIdentity(complete.source, complete.sourceId);
  expect(result).toStrictEqual(complete);
  expect(knowledgeItemSchema.safeParse(result).success).toBe(true);
});

it('returns null for an unknown identity', async () => {
  expect(await open().knowledgeItems.findByIdentity('youtube', 'missing')).toBeNull();
});

it('keeps repeated upserts to one row and enforces composite uniqueness in SQLite', async () => {
  const path = databasePath();
  const repository = open(path).knowledgeItems;
  await repository.upsert(complete);
  await repository.upsert({ ...complete });
  expect(await repository.findByIdentity(complete.source, complete.sourceId)).toStrictEqual(complete);
  const raw = new Database(path);
  try {
    expect(raw.prepare('SELECT COUNT(*) AS count FROM knowledge_items').get()).toEqual({ count: 1 });
    expect(() => raw.prepare('INSERT INTO knowledge_items (source, source_id, url, title) VALUES (?, ?, ?, ?)')
      .run(complete.source, complete.sourceId, complete.url, complete.title)).toThrow(/UNIQUE constraint failed/);
  } finally { raw.close(); }
});

it('updates all normalized fields for an existing identity', async () => {
  const repository = open().knowledgeItems;
  await repository.upsert(complete);
  const updated = { ...complete, url: 'https://example.com/changed', title: 'Changed title',
    description: 'Changed description', author: 'Changed author', collection: 'Changed collection',
    publishedAt: '2026-09-26T10:00:00Z' };
  await repository.upsert(updated);
  expect(await repository.findByIdentity(complete.source, complete.sourceId)).toStrictEqual(updated);
});

it('isolates different sources and IDs even when titles are the same', async () => {
  const repository = open().knowledgeItems;
  const otherSource = { ...required, source: 'example', author: 'Other source' };
  const otherId = { ...required, sourceId: 'videoB', author: 'Other ID' };
  for (const item of [required, otherSource, otherId]) await repository.upsert(item);
  for (const item of [required, otherSource, otherId]) {
    expect(await repository.findByIdentity(item.source, item.sourceId)).toStrictEqual(item);
  }
});

it.each([
  { name: 'omitted', item: required },
  { name: 'explicitly undefined', item: { ...required, description: undefined, author: undefined,
    collection: undefined, publishedAt: undefined } },
])('round-trips $name optional fields as absence and clears previous metadata', async ({ item }) => {
  const repository = open().knowledgeItems;
  await repository.upsert(item);
  expect(await repository.findByIdentity(item.source, item.sourceId)).toStrictEqual(required);
  await repository.upsert(complete);
  await repository.upsert(item);
  expect(await repository.findByIdentity(item.source, item.sourceId)).toStrictEqual(required);
});

it('preserves empty optional text instead of converting it to null or absence', async () => {
  const repository = open().knowledgeItems;
  const item = { ...required, description: '', author: '', collection: '' };
  await repository.upsert(item);
  expect(await repository.findByIdentity(item.source, item.sourceId)).toStrictEqual(item);
});

it('adds item persistence to a legacy database and preserves import state across reopening', async () => {
  const path = databasePath();
  const importedAt = new Date('2026-01-01T00:00:00.123Z');
  const legacy = new Database(path);
  try {
    legacy.exec(`CREATE TABLE imported_items (
      source TEXT NOT NULL, source_id TEXT NOT NULL, url TEXT NOT NULL,
      imported_at INTEGER NOT NULL, PRIMARY KEY (source, source_id)
    )`);
    legacy.prepare('INSERT INTO imported_items VALUES (?, ?, ?, ?)')
      .run(complete.source, complete.sourceId, complete.url, importedAt.getTime());
  } finally { legacy.close(); }
  const first = open(path);
  expect(await first.knowledgeItems.findByIdentity(complete.source, complete.sourceId)).toBeNull();
  await first.knowledgeItems.upsert(complete);
  expect(first.recordImport({ ...complete, url: 'https://example.com/new', importedAt: new Date() })).toBe(false);
  first.close();
  stores.delete(first);
  const reopened = open(path);
  expect(await reopened.knowledgeItems.findByIdentity(complete.source, complete.sourceId)).toStrictEqual(complete);
  expect(reopened.getImported(complete)).toEqual({ source: complete.source, sourceId: complete.sourceId,
    url: complete.url, importedAt });
  const unimported = { ...required, sourceId: 'not-imported' };
  await reopened.knowledgeItems.upsert(unimported);
  expect(reopened.getImported(unimported)).toBeUndefined();
});

it('rejects operations after the shared connection is closed without swallowing the database failure', async () => {
  const store = open();
  store.close();
  stores.delete(store);
  for (const operation of [() => store.knowledgeItems.upsert(required),
    () => store.knowledgeItems.findByIdentity(required.source, required.sourceId)]) {
    const error = await operation().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    const underlying = (error as Error).cause ?? error;
    expect((underlying as Error).message).toMatch(/not open|closed/i);
  }
});
