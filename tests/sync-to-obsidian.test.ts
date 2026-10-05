import { beforeEach, expect, it, vi } from 'vitest';
import { sync, type SyncResult } from '../src/application/sync.js';
import { syncToObsidian } from '../src/application/sync-to-obsidian.js';
import type { Collector } from '../src/collectors/collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../src/outputs/obsidian/export-notes.js';
import type { KnowledgeItemRepository } from '../src/storage/knowledge-item-repository.js';

vi.mock('../src/application/sync.js', () => ({ sync: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));

const runSync = vi.mocked(sync);
const exportNotes = vi.mocked(exportObsidianNotes);
const vault = ' relative vault ';
const item: KnowledgeItem = Object.freeze({
  source: 'example', sourceId: 'persisted', url: 'https://example.com/item', title: 'Persisted',
});
const snapshot = Object.freeze([item]);
const syncResult: SyncResult = { processed: 3, new: 1, changed: 1, unchanged: 1 };
const exportResult: ObsidianBatchExportResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };

function setup(items: readonly KnowledgeItem[] = snapshot) {
  const collector: Collector = { collect: vi.fn() };
  const repository = {
    findByIdentity: vi.fn<KnowledgeItemRepository['findByIdentity']>(),
    upsert: vi.fn<KnowledgeItemRepository['upsert']>(),
    listAll: vi.fn<KnowledgeItemRepository['listAll']>().mockResolvedValue(items),
  };
  return { collector, repository };
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

it('awaits each phase and the final export, forwarding exact inputs and nested results', async () => {
  const synced = deferred<SyncResult>();
  const read = deferred<readonly KnowledgeItem[]>();
  const exported = deferred<ObsidianBatchExportResult>();
  const readStarted = deferred<void>();
  const exportStarted = deferred<void>();
  const { collector, repository } = setup();
  runSync.mockReturnValue(synced.promise);
  repository.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportNotes.mockImplementation(() => { exportStarted.resolve(); return exported.promise; });
  let settled = false;
  const result = syncToObsidian(collector, repository, vault).then((value) => { settled = true; return value; });
  expect(runSync).toHaveBeenCalledExactlyOnceWith(collector, repository);
  expect(repository.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();

  synced.resolve(syncResult);
  await readStarted.promise;
  expect(repository.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(exportNotes).not.toHaveBeenCalled();
  expect(settled).toBe(false);

  read.resolve(snapshot);
  await exportStarted.promise;
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith(vault, snapshot);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  expect(settled).toBe(false);

  exported.resolve(exportResult);
  const completed = await result;
  expect(completed).toEqual({ sync: syncResult, export: exportResult });
  expect(completed.sync).toBe(syncResult);
  expect(completed.export).toBe(exportResult);
  expect(collector.collect).not.toHaveBeenCalled();
  expect(repository.findByIdentity).not.toHaveBeenCalled();
  expect(repository.upsert).not.toHaveBeenCalled();
});

it.each([
  { processed: 1, new: 1, changed: 0, unchanged: 0 },
  { processed: 1, new: 0, changed: 1, unchanged: 0 },
  { processed: 1, new: 0, changed: 0, unchanged: 1 },
  { processed: 0, new: 0, changed: 0, unchanged: 0 },
])('exports the entire persisted snapshot regardless of sync counters %j', async (statistics) => {
  const { collector, repository } = setup();
  runSync.mockResolvedValue(statistics);
  const result = await syncToObsidian(collector, repository, vault);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  expect(result.sync).toBe(statistics);
  expect(result.export).toBe(exportResult);
});

it('returns partial export failures unchanged without rejecting or retrying', async () => {
  const error = { reason: 'write failed' };
  const partial: ObsidianBatchExportResult = {
    processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, item, error }],
  };
  exportNotes.mockResolvedValue(partial);
  const { collector, repository } = setup();
  const result = await syncToObsidian(collector, repository, vault);
  expect(result.export).toBe(partial);
  expect(result.export.failures[0]!.item).toBe(item);
  expect(result.export.failures[0]!.error).toBe(error);
  expect(exportNotes).toHaveBeenCalledTimes(1);
});

it('delegates an empty snapshot and the original vault string to the normal exporter', async () => {
  const empty = Object.freeze([]);
  const zeros = { processed: 0, succeeded: 0, failed: 0, failures: [] };
  exportNotes.mockResolvedValue(zeros);
  const { collector, repository } = setup(empty);
  const result = await syncToObsidian(collector, repository, '\0');
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith('\0', empty);
  expect(exportNotes.mock.calls[0]![1]).toBe(empty);
  expect(result.export).toBe(zeros);
});

for (const phase of ['sync', 'read', 'export'] as const) {
  for (const mode of ['throw', 'reject'] as const) {
    it.each([new Error('phase failure'), { reason: 'failure' }, undefined])(
      `propagates the original ${phase} ${mode} value %j and skips later phases`, async (error) => {
        const { collector, repository } = setup();
        const fail = () => {
          if (mode === 'throw') throw error;
          return Promise.reject(error);
        };
        if (phase === 'sync') runSync.mockImplementation(fail);
        else if (phase === 'read') repository.listAll.mockImplementation(fail);
        else exportNotes.mockImplementation(fail);
        await expect(syncToObsidian(collector, repository, vault)).rejects.toBe(error);
        expect(runSync).toHaveBeenCalledTimes(1);
        expect(repository.listAll).toHaveBeenCalledTimes(phase === 'sync' ? 0 : 1);
        expect(exportNotes).toHaveBeenCalledTimes(phase === 'export' ? 1 : 0);
      },
    );
  }
}
