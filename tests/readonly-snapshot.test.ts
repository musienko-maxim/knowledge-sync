import Database from 'better-sqlite3';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openStorage } from '../src/storage/sqlite/storage.js';
import { readReadonlyObsidianSnapshot, ReadonlySnapshotError } from '../src/storage/sqlite/read-only-snapshot.js';
import { readSqliteSnapshot } from '../src/storage/sqlite/read-snapshot.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'knowledge-sync-readonly-'));
  directories.push(path);
  return path;
}

async function fixture() {
  const root = directory();
  const path = join(root, 'knowledge.sqlite');
  const store = openStorage(path);
  try {
    await store.knowledgeItems.upsert({ source: 'youtube', sourceId: 'item', title: 'Before', url: 'https://example.com/item' });
    await store.collections.upsert({ source: 'youtube', sourceId: 'collection', title: 'Before' });
    await store.collectionMemberships.add({ source: 'youtube', collectionSourceId: 'collection', itemSourceId: 'item' });
  } finally { store.close(); }
  return { root, path };
}

function inventory(root: string): unknown {
  return readdirSync(root).sort().map((name) => {
    const path = join(root, name);
    const stat = lstatSync(path);
    return { name, size: stat.size, mtime: stat.mtimeMs,
      bytes: stat.isFile() ? readFileSync(path).toString('hex') : null };
  });
}

function expectCode(path: string, code: ReadonlySnapshotError['code']): void {
  try { readReadonlyObsidianSnapshot(path); throw new Error('Expected read-only rejection.'); } catch (error) {
    expect(error).toBeInstanceOf(ReadonlySnapshotError);
    expect((error as ReadonlySnapshotError).code).toBe(code);
    expect((error as Error).message).toBe(`Read-only export unavailable: ${code}.`);
    expect((error as Error).cause).toBeUndefined();
  }
}

describe('read-only SQLite snapshot', () => {
  it('reads repeatable deterministic data without altering database bytes, mtimes or directory entries', async () => {
    const { root, path } = await fixture();
    const store = openStorage(path);
    try {
      await store.knowledgeItems.upsert({ source: 'facebook', sourceId: ' saved ', title: '',
        url: 'https://example.com/saved', description: '', author: ' author ', publishedAt: '2026-01-01T12:00:00+02:00' });
      store.recordImport({ source: 'youtube', sourceId: 'item', url: 'https://example.com/item', importedAt: new Date(123) });
    } finally { store.close(); }
    const before = inventory(root);
    const snapshot = readReadonlyObsidianSnapshot(path);
    expect(snapshot.items).toEqual([
      { source: 'facebook', sourceId: ' saved ', title: '', url: 'https://example.com/saved',
        description: '', author: ' author ', publishedAt: '2026-01-01T12:00:00+02:00' },
      { source: 'youtube', sourceId: 'item', title: 'Before', url: 'https://example.com/item' },
    ]);
    expect(snapshot.collections).toEqual([{ source: 'youtube', sourceId: 'collection', title: 'Before' }]);
    expect(snapshot.memberships).toEqual([{ source: 'youtube', collectionSourceId: 'collection', itemSourceId: 'item' }]);
    expect(readReadonlyObsidianSnapshot(path)).toEqual(snapshot);
    expect(inventory(root)).toEqual(before);
  });

  it('returns an empty snapshot without creating import state or auxiliary tables', () => {
    const path = join(directory(), 'empty.sqlite');
    openStorage(path).close();
    const before = readFileSync(path);
    expect(readReadonlyObsidianSnapshot(path)).toEqual({ items: [], collections: [], memberships: [] });
    expect(readFileSync(path)).toEqual(before);
  });

  it.each(['', '   ', ':memory:'])('requires an existing file path: %j', (path) => {
    expectCode(path, 'DATABASE_REQUIRED');
  });

  it('does not create a missing database or its parent', () => {
    const root = directory();
    expectCode(join(root, 'missing', 'db.sqlite'), 'DATABASE_UNAVAILABLE');
    expect(readdirSync(root)).toEqual([]);
  });

  it('rejects a directory as the database', () => {
    expectCode(directory(), 'UNSAFE_DATABASE_PATH');
  });

  it.each(['-wal', '-shm', '-journal'])('rejects %s even when empty, preserving all files', async (suffix) => {
    const { root, path } = await fixture();
    writeFileSync(path + suffix, Buffer.alloc(0));
    const before = inventory(root);
    expectCode(path, suffix === '-journal' ? 'JOURNAL_STATE_UNSUPPORTED' : 'WAL_UNSUPPORTED');
    expect(inventory(root)).toEqual(before);
  });

  it('rejects potential hot journal bytes without recovery', async () => {
    const { root, path } = await fixture();
    writeFileSync(path + '-journal', Buffer.from('d9d505f920a163d700000001', 'hex'));
    const before = inventory(root);
    expectCode(path, 'JOURNAL_STATE_UNSUPPORTED');
    expect(inventory(root)).toEqual(before);
  });

  it('rejects a WAL-mode database header even after sidecars disappear', async () => {
    const { root, path } = await fixture();
    const raw = new Database(path);
    try { raw.pragma('journal_mode = WAL'); } finally { raw.close(); }
    expect(readdirSync(root)).toEqual(['knowledge.sqlite']);
    const before = inventory(root);
    expectCode(path, 'WAL_UNSUPPORTED');
    expect(inventory(root)).toEqual(before);
  });

  it('rejects a live WAL database and leaves main/WAL/SHM bytes unchanged', async () => {
    const { root, path } = await fixture();
    const raw = new Database(path);
    try {
      raw.pragma('journal_mode = WAL');
      raw.prepare('UPDATE knowledge_items SET title = ?').run('Changed in WAL');
      const before = inventory(root);
      expectCode(path, 'WAL_UNSUPPORTED');
      expect(inventory(root)).toEqual(before);
    } finally { raw.close(); }
  });

  it.each([Buffer.alloc(0), Buffer.alloc(99), Buffer.alloc(100, 42)])('rejects invalid SQLite header without changing it', (bytes) => {
    const root = directory();
    const path = join(root, 'invalid.sqlite');
    writeFileSync(path, bytes);
    const before = inventory(root);
    expectCode(path, 'INVALID_DATABASE_HEADER');
    expect(inventory(root)).toEqual(before);
  });

  it.each([18, 19])('rejects unsupported header mode at byte %i', async (offset) => {
    const { path } = await fixture();
    const bytes = readFileSync(path);
    bytes[offset] = 3;
    writeFileSync(path, bytes);
    expectCode(path, 'INVALID_DATABASE_HEADER');
    expect(readFileSync(path)).toEqual(bytes);
  });

  it('rejects linked database ancestors (Windows junction or POSIX directory symlink)', async () => {
    const { root, path } = await fixture();
    const link = join(directory(), 'linked');
    symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
    const before = inventory(root);
    expectCode(join(link, 'knowledge.sqlite'), 'UNSAFE_DATABASE_PATH');
    expect(inventory(root)).toEqual(before);
    expect(readReadonlyObsidianSnapshot(path).items).toHaveLength(1);
  });

  it.each([
    'DROP TABLE collection_memberships',
    'ALTER TABLE knowledge_items DROP COLUMN title',
    'ALTER TABLE collections RENAME TO original_collections; CREATE VIEW collections AS SELECT * FROM original_collections',
    "UPDATE knowledge_items SET url = 'private-invalid-url'",
    "UPDATE knowledge_items SET source_id = ''",
    "UPDATE knowledge_items SET published_at = 'not-a-date'",
    "UPDATE collection_memberships SET item_source_id = 'missing'",
  ])('rejects incompatible schema/data without exposing stored values: %s', async (sql) => {
    const { root, path } = await fixture();
    const raw = new Database(path);
    try { raw.pragma('foreign_keys = OFF'); raw.exec(sql); } finally { raw.close(); }
    const before = inventory(root);
    expectCode(path, 'DATABASE_INCOMPATIBLE');
    expect(inventory(root)).toEqual(before);
    // A failure has released the read transaction and connection.
    const check = new Database(path);
    try { check.exec('BEGIN EXCLUSIVE; ROLLBACK'); } finally { check.close(); }
  });

  it('rejects duplicate identities in an incompatible unconstrained table', async () => {
    const { path } = await fixture();
    const raw = new Database(path);
    try {
      raw.pragma('foreign_keys = OFF');
      raw.exec('CREATE TABLE duplicate_items AS SELECT * FROM knowledge_items; INSERT INTO duplicate_items SELECT * FROM knowledge_items; DROP TABLE knowledge_items; ALTER TABLE duplicate_items RENAME TO knowledge_items');
    } finally { raw.close(); }
    expectCode(path, 'DATABASE_INCOMPATIBLE');
  });

  it('rejects malformed identity bytes rather than silently exporting decoder replacements', async () => {
    const { root, path } = await fixture();
    const raw = new Database(path);
    try {
      raw.pragma('foreign_keys = OFF');
      raw.exec("UPDATE knowledge_items SET source_id = CAST(X'80' AS TEXT); UPDATE collection_memberships SET item_source_id = CAST(X'80' AS TEXT)");
    } finally { raw.close(); }
    const before = inventory(root);
    expectCode(path, 'DATABASE_INCOMPATIBLE');
    expect(inventory(root)).toEqual(before);
  });

  it.each(['UTF-8', 'UTF-16le', 'UTF-16be'])('preserves valid identity Unicode in a %s database', async (encoding) => {
    const path = join(directory(), 'encoded.sqlite');
    const raw = new Database(path);
    try { raw.pragma(`encoding = '${encoding}'`); raw.exec('CREATE TABLE encoding_fixture (value TEXT)'); }
    finally { raw.close(); }
    const storage = openStorage(path);
    const item = { source: '\ufeffТест', sourceId: '日本語-\ufffd', title: 'Valid', url: 'https://example.com' };
    try { await storage.knowledgeItems.upsert(item); } finally { storage.close(); }
    expect(readReadonlyObsidianSnapshot(path).items).toEqual([item]);
  });
});

describe('storage-owned consistent snapshot', () => {
  it('openStorage exposes the validated snapshot used by existing export commands', async () => {
    const { path } = await fixture();
    const store = openStorage(path);
    try { expect(store.readSnapshot()).toEqual(readReadonlyObsidianSnapshot(path)); } finally { store.close(); }
  });

  it('retains one read version if another connection commits between table queries', async () => {
    const { path } = await fixture();
    const writer = new Database(path);
    writer.pragma('journal_mode = WAL');
    let changed = false;
    const reader = new Database(path, { readonly: true, verbose(sql) {
      if (!changed && typeof sql === 'string' && /^select .* from "collections"/i.test(sql)) {
        changed = true;
        writer.transaction(() => {
          writer.prepare('UPDATE knowledge_items SET title = ?').run('After');
          writer.prepare('UPDATE collections SET title = ?').run('After');
          writer.prepare('DELETE FROM collection_memberships').run();
        })();
      }
    } });
    try {
      const snapshot = readSqliteSnapshot(reader);
      expect(changed).toBe(true);
      expect(snapshot.items[0]?.title).toBe('Before');
      expect(snapshot.collections[0]?.title).toBe('Before');
      expect(snapshot.memberships).toHaveLength(1);
      const subsequent = readSqliteSnapshot(reader);
      expect(subsequent.items[0]?.title).toBe('After');
      expect(subsequent.collections[0]?.title).toBe('After');
      expect(subsequent.memberships).toEqual([]);
    } finally { reader.close(); writer.close(); }
  });
});
