import { beforeEach, expect, it, vi } from 'vitest';
import { syncCollection, type CollectionSyncRepositories, type CollectionSyncResult } from '../src/application/sync-collection.js';
import { syncCollectionToObsidian } from '../src/application/sync-collection-to-obsidian.js';
import type { CollectionCollector } from '../src/collectors/collection-collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import type { CollectionMembership } from '../src/core/models/collection-membership.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../src/outputs/obsidian/export-notes.js';
import { exportObsidianCollections, type ObsidianCollectionBatchExportResult } from '../src/outputs/obsidian/export-collections.js';

vi.mock('../src/application/sync-collection.js', () => ({ syncCollection: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-collections.js', () => ({ exportObsidianCollections: vi.fn() }));

const runSync = vi.mocked(syncCollection);
const exportNotes = vi.mocked(exportObsidianNotes);
const exportCollections = vi.mocked(exportObsidianCollections);
const snapshot: readonly KnowledgeItem[] = Object.freeze([
  Object.freeze({ source: 'other', sourceId: 'old', title: 'Previously persisted', url: 'https://example.com/old' }),
]);
const syncResult: CollectionSyncResult = { processed: 1, new: 0, changed: 0, unchanged: 1, membershipsRemoved: 2 };
const exportResult: ObsidianBatchExportResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };
const collections: readonly KnowledgeCollection[] = Object.freeze([{ source: 'other', sourceId: 'collection', title: 'Retained collection' }]);
const memberships: readonly CollectionMembership[] = Object.freeze([{ source: 'other', collectionSourceId: 'collection', itemSourceId: 'old' }]);
const collectionExportResult: ObsidianCollectionBatchExportResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };

function setup() {
  const collector: CollectionCollector = { collectCollection: vi.fn() };
  const repositories = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn(async () => snapshot) },
    collections: { upsert: vi.fn(), listAll: vi.fn(async () => collections) },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn(async () => memberships), removeStaleForCollection: vi.fn() },
  } satisfies CollectionSyncRepositories;
  return { collector, repositories };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

beforeEach(() => {
  runSync.mockReset().mockResolvedValue(syncResult);
  exportNotes.mockReset().mockResolvedValue(exportResult);
  exportCollections.mockReset().mockResolvedValue(collectionExportResult);
});

it('awaits relationship synchronization and reconciliation, full snapshot, and export before returning the original results', async () => {
  const { collector, repositories } = setup();
  const synced = deferred<CollectionSyncResult>();
  const read = deferred<readonly KnowledgeItem[]>();
  const exported = deferred<ObsidianBatchExportResult>();
  const collectionsExported = deferred<ObsidianCollectionBatchExportResult>();
  const readStarted = deferred<void>();
  const exportStarted = deferred<void>();
  const collectionExportStarted = deferred<void>();
  runSync.mockReturnValue(synced.promise);
  repositories.knowledgeItems.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportNotes.mockImplementation(() => { exportStarted.resolve(); return exported.promise; });
  exportCollections.mockImplementation(() => { collectionExportStarted.resolve(); return collectionsExported.promise; });
  let settled = false;
  const running = syncCollectionToObsidian(collector, repositories, ' relative vault ')
    .then((result) => { settled = true; return result; });
  expect(runSync).toHaveBeenCalledExactlyOnceWith(collector, repositories);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
  synced.resolve(syncResult);
  await readStarted.promise;
  expect(exportNotes).not.toHaveBeenCalled();
  expect(settled).toBe(false);
  read.resolve(snapshot);
  await exportStarted.promise;
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith(' relative vault ', snapshot);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  expect(repositories.collections.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(repositories.collectionMemberships.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(exportCollections).not.toHaveBeenCalled();
  expect(settled).toBe(false);
  exported.resolve(exportResult);
  await collectionExportStarted.promise;
  expect(settled).toBe(false);
  expect(exportCollections).toHaveBeenCalledExactlyOnceWith(' relative vault ', [{ collection: collections[0], items: snapshot }]);
  collectionsExported.resolve(collectionExportResult);
  const result = await running;
  expect(result.sync).toBe(syncResult);
  expect(result.export).toBe(exportResult);
  expect(result.collections).toEqual({ status: 'completed', result: collectionExportResult });
  expect(collector.collectCollection).not.toHaveBeenCalled();
  expect(repositories.collections.upsert).not.toHaveBeenCalled();
  expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
});

it('exports the full persisted snapshot after an empty collection sync', async () => {
  const { collector, repositories } = setup();
  runSync.mockResolvedValue({ processed: 0, new: 0, changed: 0, unchanged: 0, membershipsRemoved: 2 });
  await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

it('returns partial export failures unchanged without retrying', async () => {
  const { collector, repositories } = setup();
  const partial: ObsidianBatchExportResult = {
    processed: 1, succeeded: 0, failed: 1,
    failures: [{ index: 0, item: snapshot[0]!, error: { reason: 'output failure' } }],
  };
  exportNotes.mockResolvedValue(partial);
  const result = await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(result.export).toBe(partial);
  expect(exportNotes).toHaveBeenCalledTimes(1);
  expect(exportCollections).toHaveBeenCalledTimes(1);
  expect(result.collections).toEqual({ status: 'completed', result: collectionExportResult });
});

for (const phase of ['sync', 'items', 'collections', 'memberships', 'export'] as const) {
  it.each([new Error('phase failure'), { reason: 'phase failure' }, undefined])
  (`preserves the original ${phase} failure and skips later phases (%j)`, async (error) => {
    const { collector, repositories } = setup();
    if (phase === 'sync') runSync.mockRejectedValue(error);
    if (phase === 'items') repositories.knowledgeItems.listAll.mockRejectedValue(error);
    if (phase === 'collections') repositories.collections.listAll.mockRejectedValue(error);
    if (phase === 'memberships') repositories.collectionMemberships.listAll.mockRejectedValue(error);
    if (phase === 'export') exportNotes.mockRejectedValue(error);
    await expect(syncCollectionToObsidian(collector, repositories, 'vault')).rejects.toBe(error);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(repositories.knowledgeItems.listAll).toHaveBeenCalledTimes(phase === 'sync' ? 0 : 1);
    expect(exportNotes).toHaveBeenCalledTimes(phase === 'export' ? 1 : 0);
    expect(exportCollections).not.toHaveBeenCalled();
  });
}

it.each([new Error('collection batch failure'), { reason: 'failure' }, undefined])
('retains item results and explicitly tags an unexpected collection batch exception (%j)', async (error) => {
  const { collector, repositories } = setup();
  exportCollections.mockRejectedValue(error);
  const result = await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(result.sync).toBe(syncResult);
  expect(result.export).toBe(exportResult);
  expect(result.collections).toEqual({ status: 'failed', error });
  if (result.collections.status === 'failed') expect(result.collections.error).toBe(error);
});

it('preserves ordinary collection note failures alongside completed item results', async () => {
  const { collector, repositories } = setup();
  const partial: ObsidianCollectionBatchExportResult = { processed: 1, succeeded: 0, failed: 1,
    failures: [{ index: 0, collection: collections[0]!, error: undefined }] };
  exportCollections.mockResolvedValue(partial);
  const result = await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(result.export).toBe(exportResult);
  expect(result.collections).toEqual({ status: 'completed', result: partial });
  if (result.collections.status === 'completed') expect(result.collections.result).toBe(partial);
});
