import { beforeEach, expect, it, vi } from 'vitest';
import { syncCollection, type CollectionSyncRepositories } from '../src/application/sync-collection.js';
import { syncCollectionToObsidian } from '../src/application/sync-collection-to-obsidian.js';
import type { SyncResult } from '../src/application/sync.js';
import type { CollectionCollector } from '../src/collectors/collection-collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../src/outputs/obsidian/export-notes.js';

vi.mock('../src/application/sync-collection.js', () => ({ syncCollection: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));

const runSync = vi.mocked(syncCollection);
const exportNotes = vi.mocked(exportObsidianNotes);
const snapshot: readonly KnowledgeItem[] = Object.freeze([
  Object.freeze({ source: 'other', sourceId: 'old', title: 'Previously persisted', url: 'https://example.com/old' }),
]);
const syncResult: SyncResult = { processed: 1, new: 0, changed: 0, unchanged: 1 };
const exportResult: ObsidianBatchExportResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };

function setup() {
  const collector: CollectionCollector = { collectCollection: vi.fn() };
  const repositories = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn(async () => snapshot) },
    collections: { upsert: vi.fn(), listAll: vi.fn() },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn() },
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
});

it('awaits relationship synchronization, full snapshot, and export before returning the original results', async () => {
  const { collector, repositories } = setup();
  const synced = deferred<SyncResult>();
  const read = deferred<readonly KnowledgeItem[]>();
  const exported = deferred<ObsidianBatchExportResult>();
  const readStarted = deferred<void>();
  const exportStarted = deferred<void>();
  runSync.mockReturnValue(synced.promise);
  repositories.knowledgeItems.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportNotes.mockImplementation(() => { exportStarted.resolve(); return exported.promise; });
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
  expect(settled).toBe(false);
  exported.resolve(exportResult);
  const result = await running;
  expect(result.sync).toBe(syncResult);
  expect(result.export).toBe(exportResult);
  expect(collector.collectCollection).not.toHaveBeenCalled();
  expect(repositories.collections.upsert).not.toHaveBeenCalled();
  expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
});

it('exports the full persisted snapshot after an empty collection sync', async () => {
  const { collector, repositories } = setup();
  runSync.mockResolvedValue({ processed: 0, new: 0, changed: 0, unchanged: 0 });
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
});

for (const phase of ['sync', 'snapshot', 'export'] as const) {
  it.each([new Error('phase failure'), { reason: 'phase failure' }, undefined])
  (`preserves the original ${phase} failure and skips later phases (%j)`, async (error) => {
    const { collector, repositories } = setup();
    if (phase === 'sync') runSync.mockRejectedValue(error);
    if (phase === 'snapshot') repositories.knowledgeItems.listAll.mockRejectedValue(error);
    if (phase === 'export') exportNotes.mockRejectedValue(error);
    await expect(syncCollectionToObsidian(collector, repositories, 'vault')).rejects.toBe(error);
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(repositories.knowledgeItems.listAll).toHaveBeenCalledTimes(phase === 'sync' ? 0 : 1);
    expect(exportNotes).toHaveBeenCalledTimes(phase === 'export' ? 1 : 0);
  });
}
