import { mkdir, mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { syncToObsidian } from '../src/application/sync-to-obsidian.js';
import type { Collector } from '../src/collectors/collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import * as batch from '../src/outputs/obsidian/export-notes.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { openStorage } from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

// A pass-through facade permits spying without replacing real exports in success cases.
vi.mock('../src/outputs/obsidian/export-notes.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/outputs/obsidian/export-notes.js')>(),
}));

let directory: string;
let vault: string;
let database: string;
let store: Storage;
const item: KnowledgeItem = {
  source: 'example', sourceId: 'a', url: 'https://example.com/a', title: 'Item A',
  description: 'Description', publishedAt: '2026-01-01T12:34:56.123+02:00',
};
function collector(items: KnowledgeItem[]): Collector {
  return { collect: vi.fn(async () => items) };
}
function notePath(value: KnowledgeItem) {
  return join(vault, buildObsidianRelativePath(value));
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-projection-'));
  vault = join(directory, 'vault');
  database = join(directory, 'items.sqlite');
  await mkdir(vault);
  store = openStorage(database);
});

afterEach(async () => {
  vi.restoreAllMocks();
  store.close();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-projection-')) {
    throw new Error('Unexpected orchestration-test cleanup path.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

it('exports new, changed, unchanged and previously persisted items from the ordered SQLite snapshot', async () => {
  const changedBefore = { ...item, sourceId: 'b', title: 'Old' };
  const changedAfter = { ...changedBefore, title: 'Updated' };
  const old = { ...item, source: 'earlier', sourceId: 'old' };
  const added = { ...item, sourceId: 'c', description: undefined };
  for (const value of [changedBefore, old, item]) await store.knowledgeItems.upsert(value);
  const read = vi.spyOn(store.knowledgeItems, 'listAll');
  const exportNotes = vi.spyOn(batch, 'exportObsidianNotes');
  const input = collector([added, changedAfter, { ...item }]);
  const result = await syncToObsidian(input, store.knowledgeItems, vault);
  expect(result.sync).toEqual({ processed: 3, new: 1, changed: 1, unchanged: 1 });
  expect(result.export).toEqual({ processed: 4, succeeded: 4, failed: 0, failures: [] });
  expect(input.collect).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  const snapshot = await read.mock.results[0]!.value as readonly KnowledgeItem[];
  expect(snapshot).toStrictEqual([old, item, changedAfter, {
    source: added.source, sourceId: added.sourceId, url: added.url, title: added.title, publishedAt: added.publishedAt,
  }]);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  for (const value of snapshot) {
    expect(await readFile(notePath(value), 'utf8')).toBe(renderKnowledgeItemMarkdown(value));
    expect(store.getImported(value)).toBeUndefined();
  }
});

it('exports one final persisted value per identity even when sync processes duplicates', async () => {
  const other = { ...item, sourceId: 'b' };
  const last = { ...item, title: 'Last value' };
  const result = await syncToObsidian(collector([item, other, last]), store.knowledgeItems, vault);
  expect(result.sync).toEqual({ processed: 3, new: 2, changed: 1, unchanged: 0 });
  expect(result.export).toEqual({ processed: 2, succeeded: 2, failed: 0, failures: [] });
  expect(await readFile(notePath(last), 'utf8')).toBe(renderKnowledgeItemMarkdown(last));
  expect(await store.knowledgeItems.listAll()).toStrictEqual([last, other]);
});

it('recovers a failed export on a later unchanged sync after reopening the persisted database', async () => {
  const other = { ...item, sourceId: 'b' };
  // An empty directory at the note destination makes a real write fail on all platforms.
  await mkdir(notePath(item), { recursive: true });
  const first = await syncToObsidian(collector([item, other]), store.knowledgeItems, vault);
  expect(first.sync).toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });
  expect(first.export).toMatchObject({ processed: 2, succeeded: 1, failed: 1 });
  expect(first.export.failures[0]).toMatchObject({ index: 0, item });
  expect(first.export.failures[0]!.error).toBeInstanceOf(Error);
  expect(await readFile(notePath(other), 'utf8')).toBe(renderKnowledgeItemMarkdown(other));

  store.close();
  store = openStorage(database);
  expect(await store.knowledgeItems.findByIdentity(item.source, item.sourceId)).toStrictEqual(item);
  expect(store.getImported(item)).toBeUndefined();
  await rmdir(notePath(item)); // Remove only the empty test obstruction.
  const read = vi.spyOn(store.knowledgeItems, 'listAll');
  const exportNotes = vi.spyOn(batch, 'exportObsidianNotes');
  const later = await syncToObsidian(collector([{ ...item }]), store.knowledgeItems, vault);
  expect(later.sync).toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
  expect(later.export).toEqual({ processed: 2, succeeded: 2, failed: 0, failures: [] });
  const snapshot = await read.mock.results[0]!.value as readonly KnowledgeItem[];
  expect(snapshot).toStrictEqual([item, other]);
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith(vault, snapshot);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  expect(await readFile(notePath(item), 'utf8')).toBe(renderKnowledgeItemMarkdown(item));
  expect(store.getImported(item)).toBeUndefined();
});

it('preserves earlier writes and performs no snapshot read or export after sync fails', async () => {
  const error = { reason: 'second write failed' };
  const original = store.knowledgeItems.upsert;
  vi.spyOn(store.knowledgeItems, 'upsert').mockImplementation(async (value) => {
    if (value.sourceId === 'b') throw error;
    await original(value);
  });
  const read = vi.spyOn(store.knowledgeItems, 'listAll');
  const exportNotes = vi.spyOn(batch, 'exportObsidianNotes');
  await expect(syncToObsidian(collector([item, { ...item, sourceId: 'b' }]), store.knowledgeItems, vault))
    .rejects.toBe(error);
  expect(read).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
  expect(await store.knowledgeItems.findByIdentity(item.source, item.sourceId)).toStrictEqual(item);
  expect(await readdir(vault)).toEqual([]);
});

it.each(['read', 'export'] as const)('preserves successful persistence after unexpected %s failure', async (phase) => {
  const error = { reason: 'unexpected phase failure' };
  const exportNotes = vi.spyOn(batch, 'exportObsidianNotes');
  if (phase === 'read') vi.spyOn(store.knowledgeItems, 'listAll').mockRejectedValue(error);
  else exportNotes.mockRejectedValue(error);
  await expect(syncToObsidian(collector([item]), store.knowledgeItems, vault)).rejects.toBe(error);
  expect(exportNotes).toHaveBeenCalledTimes(phase === 'read' ? 0 : 1);
  expect(await store.knowledgeItems.findByIdentity(item.source, item.sourceId)).toStrictEqual(item);
  expect(store.getImported(item)).toBeUndefined();
  expect(await readdir(vault)).toEqual([]);
});

it('exports retained items even when the current collection is empty', async () => {
  await store.knowledgeItems.upsert(item);
  const result = await syncToObsidian(collector([]), store.knowledgeItems, vault);
  expect(result.sync).toEqual({ processed: 0, new: 0, changed: 0, unchanged: 0 });
  expect(result.export).toEqual({ processed: 1, succeeded: 1, failed: 0, failures: [] });
  expect(await readFile(notePath(item), 'utf8')).toBe(renderKnowledgeItemMarkdown(item));
});

it('passes an empty database snapshot through the real batch exporter without vault access', async () => {
  const result = await syncToObsidian(collector([]), store.knowledgeItems, '\0');
  expect(result).toEqual({
    sync: { processed: 0, new: 0, changed: 0, unchanged: 0 },
    export: { processed: 0, succeeded: 0, failed: 0, failures: [] },
  });
});
