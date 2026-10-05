import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { CollectionMembership } from '../src/core/models/collection-membership.js';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { createCollectionRepository } from '../src/storage/sqlite/collection-repository.js';
import { createCollectionMembershipRepository } from '../src/storage/sqlite/collection-membership-repository.js';
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

function close(store: Storage) {
  store.close();
  stores.delete(store);
}

function databasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-collections-'));
  directories.push(directory);
  return join(directory, 'collections.sqlite');
}

const collection: KnowledgeCollection = { source: 'youtube', sourceId: 'A', title: 'A title' };
const item: KnowledgeItem = { source: 'youtube', sourceId: 'X',
  url: 'https://example.com/X', title: 'Video X' };
const membership: CollectionMembership = { source: 'youtube', collectionSourceId: 'A', itemSourceId: 'X' };

async function expectDatabaseError(operation: Promise<unknown>, pattern: RegExp) {
  const error: unknown = await operation.catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(Error);
  const underlying = (error as Error).cause ?? error;
  expect((underlying as Error).message).toMatch(pattern);
}

it('starts with empty collections and memberships', async () => {
  const store = open();
  expect(await store.collections.listAll()).toStrictEqual([]);
  expect(await store.collectionMemberships.listAll()).toStrictEqual([]);
});

it('upserts collections idempotently and updates titles without changing identity or membership', async () => {
  const store = open();
  await store.collections.upsert(collection);
  await store.collections.upsert({ ...collection });
  await store.knowledgeItems.upsert(item);
  await store.collectionMemberships.add(membership);
  expect(await store.collections.listAll()).toStrictEqual([collection]);
  const renamed = { ...collection, title: 'Renamed playlist' };
  await store.collections.upsert(renamed);
  expect(await store.collections.listAll()).toStrictEqual([renamed]);
  expect(await store.collectionMemberships.listAll()).toStrictEqual([membership]);
  expect(store.getImported(item)).toBeUndefined();
});

it('keeps identical titles separate by source and ID', async () => {
  const store = open();
  const otherId = { ...collection, sourceId: 'B' };
  const otherSource = { ...collection, source: 'example' };
  for (const value of [collection, otherId, otherSource]) await store.collections.upsert(value);
  expect(await store.collections.listAll()).toStrictEqual([otherSource, collection, otherId]);
});

it('keeps one shared item and every many-to-many relationship when insertion is repeated', async () => {
  const store = open();
  for (const [collectionId, itemIds] of [['A', ['X', 'Y']], ['B', ['X', 'Z']]] as const) {
    await store.collections.upsert({ ...collection, sourceId: collectionId });
    for (const itemId of itemIds) {
      await store.knowledgeItems.upsert({ ...item, sourceId: itemId, collection: collectionId });
      const relation = { source: 'youtube', collectionSourceId: collectionId, itemSourceId: itemId };
      await store.collectionMemberships.add(relation);
      await store.collectionMemberships.add({ ...relation });
    }
  }
  expect((await store.knowledgeItems.listAll()).map((value) => value.sourceId)).toStrictEqual(['X', 'Y', 'Z']);
  expect((await store.collections.listAll()).map((value) => value.sourceId)).toStrictEqual(['A', 'B']);
  expect(await store.collectionMemberships.listAll()).toStrictEqual([
    membership, { ...membership, itemSourceId: 'Y' },
    { ...membership, collectionSourceId: 'B' },
    { ...membership, collectionSourceId: 'B', itemSourceId: 'Z' },
  ]);
  // Legacy text remains display metadata and never removes a prior relationship.
  expect((await store.knowledgeItems.findByIdentity('youtube', 'X'))?.collection).toBe('B');
  for (const sourceId of ['X', 'Y', 'Z']) expect(store.getImported({ source: 'youtube', sourceId })).toBeUndefined();
});

it.each(['collection', 'item'] as const)('rejects a membership whose %s parent is missing', async (missing) => {
  const store = open();
  if (missing !== 'collection') await store.collections.upsert(collection);
  if (missing !== 'item') await store.knowledgeItems.upsert(item);
  await expectDatabaseError(store.collectionMemberships.add(membership), /FOREIGN KEY constraint failed/);
  expect(await store.collectionMemberships.listAll()).toStrictEqual([]);
});

it.each(['collection', 'item'] as const)('rejects a %s parent that exists only under another source', async (wrongSource) => {
  const store = open();
  await store.collections.upsert({ ...collection, source: wrongSource === 'collection' ? 'example' : 'youtube' });
  await store.knowledgeItems.upsert({ ...item, source: wrongSource === 'item' ? 'example' : 'youtube' });
  await expectDatabaseError(store.collectionMemberships.add(membership), /FOREIGN KEY constraint failed/);
  expect(await store.collectionMemberships.listAll()).toStrictEqual([]);
});

it('isolates identical membership IDs across sources', async () => {
  const store = open();
  for (const source of ['youtube', 'example']) {
    await store.collections.upsert({ ...collection, source });
    await store.knowledgeItems.upsert({ ...item, source });
    await store.collectionMemberships.add({ ...membership, source });
  }
  expect(await store.collectionMemberships.listAll()).toStrictEqual([{ ...membership, source: 'example' }, membership]);
});

it('enforces collection identity and membership uniqueness in SQLite itself', async () => {
  const path = databasePath();
  const store = open(path);
  await store.collections.upsert(collection);
  await store.knowledgeItems.upsert(item);
  await store.collectionMemberships.add(membership);
  const raw = new Database(path);
  try {
    expect(() => raw.prepare('INSERT INTO collections VALUES (?, ?, ?)')
      .run(collection.source, collection.sourceId, 'Duplicate')).toThrow(/UNIQUE constraint failed/);
    expect(() => raw.prepare('INSERT INTO collection_memberships VALUES (?, ?, ?)')
      .run(membership.source, membership.collectionSourceId, membership.itemSourceId)).toThrow(/UNIQUE constraint failed/);
    expect(raw.prepare('SELECT COUNT(*) AS count FROM collection_memberships').get()).toEqual({ count: 1 });
  } finally { raw.close(); }
});

it('lists explicit source/identity order even with reversed unordered scans', async () => {
  const path = databasePath();
  const store = open(path);
  const expectedCollections: KnowledgeCollection[] = [];
  const expectedMemberships: CollectionMembership[] = [];
  for (const source of ['youtube', 'example']) {
    for (const collectionSourceId of ['B', 'A']) {
      const value = { ...collection, source, sourceId: collectionSourceId };
      await store.collections.upsert(value);
      expectedCollections.unshift(value);
      for (const itemSourceId of ['Y', 'X']) {
        await store.knowledgeItems.upsert({ ...item, source, sourceId: itemSourceId });
        const relation = { source, collectionSourceId, itemSourceId };
        await store.collectionMemberships.add(relation);
        expectedMemberships.unshift(relation);
      }
    }
  }
  const raw = new Database(path);
  try {
    const db = drizzle(raw);
    for (const reverse of [0, 1]) {
      raw.pragma(`reverse_unordered_selects = ${reverse}`);
      expect(await createCollectionRepository(db).listAll()).toStrictEqual(expectedCollections);
      expect(await createCollectionMembershipRepository(db).listAll()).toStrictEqual(expectedMemberships);
    }
  } finally { raw.close(); }
});

it('upgrades legacy items/import state without backfilling titles and preserves new relationships after reopen', async () => {
  const path = databasePath();
  const importedAt = new Date('2026-01-01T00:00:00.123Z');
  const legacyItem = { ...item, description: '', author: 'An author', collection: 'Legacy playlist title',
    publishedAt: '2026-01-01T12:34:56.123+02:00' };
  const raw = new Database(path);
  try {
    raw.exec(`CREATE TABLE imported_items (
      source TEXT NOT NULL, source_id TEXT NOT NULL, url TEXT NOT NULL,
      imported_at INTEGER NOT NULL, PRIMARY KEY (source, source_id)
    );
    CREATE TABLE knowledge_items (
      source TEXT NOT NULL, source_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, author TEXT, collection TEXT, published_at TEXT,
      PRIMARY KEY (source, source_id)
    )`);
    raw.prepare('INSERT INTO imported_items VALUES (?, ?, ?, ?)')
      .run(item.source, item.sourceId, item.url, importedAt.getTime());
    raw.prepare('INSERT INTO knowledge_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(legacyItem.source, legacyItem.sourceId, legacyItem.url, legacyItem.title,
        legacyItem.description, legacyItem.author, legacyItem.collection, legacyItem.publishedAt);
  } finally { raw.close(); }

  const first = open(path);
  expect(await first.knowledgeItems.listAll()).toStrictEqual([legacyItem]);
  expect(await first.collections.listAll()).toStrictEqual([]);
  expect(await first.collectionMemberships.listAll()).toStrictEqual([]);
  await first.collections.upsert(collection);
  await first.collectionMemberships.add(membership);
  close(first);

  const reopened = open(path);
  expect(await reopened.knowledgeItems.listAll()).toStrictEqual([legacyItem]);
  expect(await reopened.collections.listAll()).toStrictEqual([collection]);
  expect(await reopened.collectionMemberships.listAll()).toStrictEqual([membership]);
  expect(reopened.recordImport({ ...item, url: 'https://example.com/new', importedAt: new Date() })).toBe(false);
  expect(reopened.getImported(item)).toStrictEqual({ source: item.source, sourceId: item.sourceId, url: item.url, importedAt });
  // Both relationship constraints remain enabled on the new connection.
  await expectDatabaseError(reopened.collectionMemberships.add({ ...membership, collectionSourceId: 'missing' }),
    /FOREIGN KEY constraint failed/);
  await expectDatabaseError(reopened.collectionMemberships.add({ ...membership, itemSourceId: 'missing' }),
    /FOREIGN KEY constraint failed/);
  await reopened.knowledgeItems.upsert({ ...item, title: 'Updated after migration' });
  expect((await reopened.knowledgeItems.findByIdentity(item.source, item.sourceId))?.title).toBe('Updated after migration');
  expect(await reopened.collectionMemberships.listAll()).toStrictEqual([membership]);
});

it('rejects operations after the shared connection closes and preserves database errors', async () => {
  const store = open();
  close(store);
  for (const operation of [() => store.collections.upsert(collection), () => store.collections.listAll(),
    () => store.collectionMemberships.add(membership), () => store.collectionMemberships.listAll()]) {
    await expectDatabaseError(operation(), /not open|closed/i);
  }
});
