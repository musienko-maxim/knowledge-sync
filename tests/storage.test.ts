import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { openStorage } from '../src/storage/sqlite/storage.js';
import type { SyncStorage } from '../src/storage/storage.js';

const stores: SyncStorage[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const item = { source: 'example', sourceId: '123', url: 'https://example.com/123',
  importedAt: new Date('2026-01-01T00:00:00.123Z') };

it('uses both identity fields and preserves original metadata on repeat imports', () => {
  const store = openStorage(':memory:');
  stores.push(store);
  expect(store.getImported(item)).toBeUndefined();
  expect(store.recordImport(item)).toBe(true);
  expect(store.recordImport({ ...item, url: 'https://example.com/changed', importedAt: new Date() })).toBe(false);
  expect(store.getImported(item)).toEqual(item);
  expect(store.recordImport({ ...item, source: 'another-source' })).toBe(true);
  expect(store.recordImport({ ...item, sourceId: '456' })).toBe(true);
  expect(store.getImported({ source: 'unknown', sourceId: item.sourceId })).toBeUndefined();
});

it('persists state across reopening and enforces uniqueness in SQLite itself', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-'));
  directories.push(directory);
  const path = join(directory, 'nested', 'state.sqlite');
  const first = openStorage(path);
  try { first.recordImport(item); } finally { first.close(); }
  const reopened = openStorage(path);
  stores.push(reopened);
  expect(reopened.getImported(item)).toEqual(item);
  const raw = new Database(path);
  try {
    expect(() => raw.prepare('INSERT INTO imported_items VALUES (?, ?, ?, ?)')
      .run(item.source, item.sourceId, item.url, Date.now())).toThrow(/UNIQUE constraint failed/);
  } finally { raw.close(); }
});
