import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importFacebookFile } from '../src/cli/facebook-import.js';
import { facebookFallbackTitle, facebookSourceId } from '../src/collectors/facebook/import.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import * as projection from '../src/outputs/obsidian/export-projection.js';
import * as application from '../src/application/import-facebook.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

let directory: string;
let file: string;
let db: string;
let vault: string;
const firstUrl = 'https://www.facebook.com/example/posts/111';
const secondUrl = 'https://example.test/article?order=original&value=2';
const saved = (url?: string, title?: string, description?: string, author?: string) => ({ dict: [
  ...(url ? [{ label: 'URL-адреса', value: url, href: url }] : []),
  ...(title ? [{ label: 'Назва', value: title }] : []),
  ...(description ? [{ label: 'Опис', value: description }] : []),
  ...(author ? [{ title: 'Автор', dict: [{ label: 'Ім’я', value: author }] }] : []),
] });
const collection = (id: string, entries: unknown[], title = 'Saved collection') => ({ fbid: id,
  label_values: [{ label: 'Назва', value: title }, { title: 'Збереження', dict: entries }] });
const writeInput = (collections: unknown[]) => writeFile(file, JSON.stringify(collections));

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-facebook-import-'));
  file = join(directory, 'collections.json');
  db = join(directory, 'items.sqlite');
  vault = join(directory, 'vault');
  await mkdir(vault);
  vi.stubEnv('DATABASE_PATH', db);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No network expected'); }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const path = resolve(directory);
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith('knowledge-sync-facebook-import-')) {
    throw new Error('Unexpected Facebook integration cleanup path');
  }
  await rm(path, { recursive: true, force: true });
});

async function snapshot() {
  const storage = sqlite.openStorage(db);
  try {
    return { items: await storage.knowledgeItems.listAll(), collections: await storage.collections.listAll(),
      memberships: await storage.collectionMemberships.listAll() };
  } finally { storage.close(); }
}

it('imports exact identities, duplicate occurrences and unique edges, including empty collections, then retries idempotently', async () => {
  await writeInput([
    collection('9007199254740993123456', [saved(firstUrl), saved(firstUrl), saved(secondUrl), saved()]),
    collection('222', [saved(firstUrl)]), collection('333', []),
  ]);
  const first = await importFacebookFile({ file });
  expect(first.failure).toBeUndefined();
  expect(first.input).toEqual({ inputCollections: 3, inputOccurrences: 5, urlOccurrences: 4,
    distinctItems: 2, duplicateItemOccurrences: 2, uniqueMemberships: 3, repeatedMembershipOccurrences: 1, skippedOccurrences: 1 });
  expect(first.items).toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });
  expect(first.collections).toEqual({ processed: 3, new: 3, changed: 0, unchanged: 0 });
  expect(first.memberships).toEqual({ processed: 3, new: 3, unchanged: 0 });
  expect(first.export).toEqual({ status: 'not-requested' });
  expect(await readdir(vault)).toEqual([]);
  const before = await snapshot();
  expect(before.collections.map(value => value.sourceId)).toContain('9007199254740993123456');
  expect(before.items.map(value => value.url).sort()).toEqual([firstUrl, secondUrl].sort());
  const storage = sqlite.openStorage(db);
  try { for (const item of before.items) expect(storage.getImported(item)).toBeUndefined(); }
  finally { storage.close(); }
  const again = await importFacebookFile({ file });
  expect(again.items).toEqual({ processed: 2, new: 0, changed: 0, unchanged: 2 });
  expect(again.collections).toEqual({ processed: 3, new: 0, changed: 0, unchanged: 3 });
  expect(again.memberships).toEqual({ processed: 3, new: 0, unchanged: 3 });
  expect(await snapshot()).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});

it('promotes an exact fallback after reopening SQLite and preserves sparse and legacy fields', async () => {
  await writeInput([collection('111', [saved(firstUrl)])]);
  await importFacebookFile({ file });
  const seed = sqlite.openStorage(db);
  const identity = { source: 'facebook', sourceId: facebookSourceId(firstUrl) };
  try {
    const item = await seed.knowledgeItems.findByIdentity(identity.source, identity.sourceId);
    expect(item?.title).toBe(facebookFallbackTitle(firstUrl));
    await seed.knowledgeItems.upsert({ ...item!, author: 'Retained author', description: 'Retained description',
      collection: 'Legacy title', publishedAt: '2022-01-01T00:00:00Z' });
    seed.recordImport({ ...identity, url: firstUrl, importedAt: new Date('2020-01-01') });
  } finally { seed.close(); }
  await writeInput([collection('111', [saved(firstUrl, 'Explicit title')])]);
  const result = await importFacebookFile({ file });
  expect(result.items).toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  expect((await snapshot()).items).toEqual([{ ...identity, url: firstUrl, title: 'Explicit title', author: 'Retained author',
    description: 'Retained description', collection: 'Legacy title', publishedAt: '2022-01-01T00:00:00Z' }]);
  const reopened = sqlite.openStorage(db);
  try { expect(reopened.getImported(identity)?.importedAt).toEqual(new Date('2020-01-01')); }
  finally { reopened.close(); }
});

it('merges complementary fields deterministically, preserves existing conflicts, and fills only missing stored values', async () => {
  await writeInput([collection('111', [saved(firstUrl, 'Stable title', 'Description'), saved(firstUrl, undefined, undefined, 'Author')])]);
  expect((await importFacebookFile({ file })).warnings).toEqual([]);
  await writeInput([collection('111', [saved(firstUrl, 'Conflicting title', 'Other description', 'Other author')])]);
  const conflicts = await importFacebookFile({ file });
  expect(conflicts.items).toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
  expect(conflicts.warnings).toEqual([
    { code: 'AUTHOR_CONFLICT', count: 1 }, { code: 'DESCRIPTION_CONFLICT', count: 1 }, { code: 'TITLE_CONFLICT', count: 1 },
  ]);
  expect((await snapshot()).items[0]).toMatchObject({ title: 'Stable title', description: 'Description', author: 'Author' });
});

it('retains omitted collections, items and memberships while deterministically updating collection names', async () => {
  await writeInput([collection('111', [saved(firstUrl), saved(secondUrl)]), collection('222', [saved(firstUrl)])]);
  await importFacebookFile({ file });
  await writeInput([collection('111', [saved(secondUrl)], 'New collection name')]);
  const result = await importFacebookFile({ file });
  expect(result.collections).toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  const state = await snapshot();
  expect(state.items).toHaveLength(2);
  expect(state.collections).toHaveLength(2);
  expect(state.memberships).toHaveLength(3);
  expect(state.collections.find(value => value.sourceId === '111')?.title).toBe('New collection name');
});

it.each(['json', 'structure', 'conflicting-names', 'utf8', 'missing'] as const)
('validates %s before opening or creating SQLite', async (kind) => {
  if (kind === 'json') await writeFile(file, '{private invalid content');
  if (kind === 'structure') await writeFile(file, '{"your_saved_items":[]}');
  if (kind === 'conflicting-names') await writeInput([collection('111', [], 'First'), collection('111', [], 'Second')]);
  if (kind === 'utf8') await writeFile(file, Buffer.from([0xff, 0xfe, 0xff]));
  const open = vi.spyOn(sqlite, 'openStorage');
  const result = await importFacebookFile({ file, db, vault });
  expect(result.failure?.stage).toBe('input');
  expect(result.items.processed).toBe(0);
  expect(result.export).toEqual({ status: 'skipped' });
  expect(open).not.toHaveBeenCalled();
  await expect(stat(db)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readdir(vault)).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('private');
});

it('honors explicit database precedence over environment and keeps environment vault import-only', async () => {
  await writeInput([collection('111', [])]);
  const explicit = join(directory, 'explicit.sqlite');
  const result = await importFacebookFile({ file, db: explicit });
  expect(result.failure).toBeUndefined();
  expect((await stat(explicit)).isFile()).toBe(true);
  await expect(stat(db)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readdir(vault)).toEqual([]);
});

it.each([false, true])('rejects database inside the vault (explicit export=%s)', async (exportRequested) => {
  await writeInput([collection('111', [])]);
  const invalidDb = join(vault, 'private.sqlite');
  const open = vi.spyOn(sqlite, 'openStorage');
  const result = await importFacebookFile({ file, db: invalidDb, ...(exportRequested ? { vault } : {}) });
  expect(result.failure).toEqual({ stage: 'database', code: 'DATABASE_SETUP_FAILED' });
  expect(open).not.toHaveBeenCalled();
  expect(await readdir(vault)).toEqual([]);
});

it('returns safe setup and close failures while preserving successful counters', async () => {
  await writeInput([collection('111', [])]);
  const blankVault = await importFacebookFile({ file, vault: ' ' });
  expect(blankVault.failure).toEqual({ stage: 'database', code: 'VAULT_PATH_INVALID' });
  const realOpen = sqlite.openStorage;
  const open = vi.spyOn(sqlite, 'openStorage').mockImplementation(() => { throw new Error('private path'); });
  expect((await importFacebookFile({ file })).failure).toEqual({ stage: 'database', code: 'DATABASE_SETUP_FAILED' });
  open.mockImplementation(path => {
    const storage = realOpen(path);
    const close = storage.close;
    storage.close = () => { close(); throw new Error('private path'); };
    return storage;
  });
  const result = await importFacebookFile({ file });
  expect(result.failure).toEqual({ stage: 'close', code: 'DATABASE_CLOSE_FAILED' });
  expect(result.collections.processed).toBe(1);
  expect(JSON.stringify(result)).not.toContain('private');
});

it('closes SQLite even after an unexpected application rejection', async () => {
  await writeInput([collection('111', [])]);
  vi.spyOn(application, 'importFacebook').mockRejectedValue(new Error('private unexpected failure'));
  const realOpen = sqlite.openStorage;
  const close = vi.fn();
  vi.spyOn(sqlite, 'openStorage').mockImplementation(path => {
    const storage = realOpen(path);
    const original = storage.close;
    storage.close = () => { close(); original(); };
    return storage;
  });
  const result = await importFacebookFile({ file });
  expect(result.failure).toEqual({ stage: 'database', code: 'STORAGE_FAILED' });
  expect(close).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain('private');
});

it.each(['collections', 'items', 'memberships'] as const)
('retries safely after a partial %s failure using actual SQLite writes', async stage => {
  await writeInput([collection('111', [saved(firstUrl), saved(secondUrl)]), collection('222', [])]);
  const realOpen = sqlite.openStorage;
  const exportSpy = vi.spyOn(projection, 'exportObsidianProjection');
  const close = vi.fn();
  const open = vi.spyOn(sqlite, 'openStorage').mockImplementationOnce(path => {
    const storage = realOpen(path);
    const realClose = storage.close;
    storage.close = () => { close(); realClose(); };
    if (stage === 'collections') {
      const original = storage.collections.upsert;
      let calls = 0;
      storage.collections.upsert = async value => { if (++calls === 2) throw new Error('private'); await original(value); };
    } else if (stage === 'items') {
      const original = storage.knowledgeItems.upsert;
      let calls = 0;
      storage.knowledgeItems.upsert = async value => { if (++calls === 2) throw new Error('private'); await original(value); };
    } else {
      const original = storage.collectionMemberships.add;
      let calls = 0;
      storage.collectionMemberships.add = async value => { if (++calls === 2) throw new Error('private'); await original(value); };
    }
    return storage;
  });
  const first = await importFacebookFile({ file, vault });
  expect(first.failure).toEqual({ stage, code: 'STORAGE_FAILED' });
  expect(first[stage].processed).toBe(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(exportSpy).not.toHaveBeenCalled();
  open.mockRestore();
  const retained = await snapshot();
  expect(retained[stage]).toHaveLength(1);
  const retry = await importFacebookFile({ file });
  expect(retry.failure).toBeUndefined();
  expect(retry[stage].new).toBe(1);
  expect(retry[stage].unchanged).toBe(1);
  const completed = await snapshot();
  expect(completed.items).toHaveLength(2);
  expect(completed.collections).toHaveLength(2);
  expect(completed.memberships).toHaveLength(2);
});

it('exports the full multi-source snapshot only on explicit request and preserves repeated Markdown bytes', async () => {
  const prior = { source: 'youtube', sourceId: 'previous', title: 'Existing video', url: 'https://www.youtube.com/watch?v=previous' };
  const seed = sqlite.openStorage(db);
  try { await seed.knowledgeItems.upsert(prior); } finally { seed.close(); }
  await writeInput([collection('111', [saved(firstUrl, 'Saved title')])]);
  const first = await importFacebookFile({ file, vault });
  expect(first.failure).toBeUndefined();
  expect(first.export.status).toBe('completed');
  if (first.export.status !== 'completed') throw new Error('Expected projection result');
  expect(first.export.result.items).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
  expect(first.export.result.navigation.status).toBe('completed');
  const state = await snapshot();
  const paths = [...state.items.map(item => join(vault, buildObsidianRelativePath(item))), join(vault, 'Knowledge Sync.md')];
  const before = await Promise.all(paths.map(path => readFile(path)));
  const second = await importFacebookFile({ file, vault });
  expect(second.failure).toBeUndefined();
  expect(second.items.unchanged).toBe(1);
  expect(await Promise.all(paths.map(path => readFile(path)))).toEqual(before);
  const navigation = await readFile(join(vault, 'Knowledge Sync.md'), 'utf8');
  expect(navigation).toContain('Existing video');
  expect(navigation).toContain('Saved title');
});
