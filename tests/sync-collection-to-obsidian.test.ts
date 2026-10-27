import { beforeEach, expect, it, vi } from 'vitest';
import { syncCollection, type CollectionSyncRepositories, type CollectionSyncResult } from '../src/application/sync-collection.js';
import { syncCollectionToObsidian } from '../src/application/sync-collection-to-obsidian.js';
import type { CollectionCollector } from '../src/collectors/collection-collector.js';
import { exportObsidianProjection, type ObsidianProjectionExportResult } from '../src/outputs/obsidian/export-projection.js';

vi.mock('../src/application/sync-collection.js', () => ({ syncCollection: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-projection.js', () => ({ exportObsidianProjection: vi.fn() }));
const runSync = vi.mocked(syncCollection);
const exportProjection = vi.mocked(exportObsidianProjection);
const item = { source: 'other', sourceId: 'old', title: 'Previously persisted', url: 'https://example.com/old' };
const collection = { source: 'other', sourceId: 'collection', title: 'Retained collection' };
const snapshot = { items: [item], collections: [collection],
  memberships: [{ source: 'other', collectionSourceId: 'collection', itemSourceId: 'old' }] };
const syncResult: CollectionSyncResult = { processed: 1, new: 0, changed: 0, unchanged: 1, membershipsRemoved: 2 };
const batch = { processed: 1, succeeded: 1, failed: 0, failures: [] };
const completed: ObsidianProjectionExportResult = {
  items: batch, collections: { status: 'completed', result: batch }, navigation: { status: 'completed' },
};

function setup() {
  const collector: CollectionCollector = { collectCollection: vi.fn() };
  const repositories = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn(async () => snapshot.items) },
    collections: { upsert: vi.fn(), listAll: vi.fn(async () => snapshot.collections) },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn(async () => snapshot.memberships), removeStaleForCollection: vi.fn() },
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
  exportProjection.mockReset().mockResolvedValue(completed);
});

it('awaits reconciliation, complete snapshot and shared publication before returning results', async () => {
  const { collector, repositories } = setup();
  const synced = deferred<CollectionSyncResult>();
  const read = deferred<typeof snapshot.items>();
  const published = deferred<ObsidianProjectionExportResult>();
  const readStarted = deferred<void>();
  const exportStarted = deferred<void>();
  runSync.mockReturnValue(synced.promise);
  repositories.knowledgeItems.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportProjection.mockImplementation(() => { exportStarted.resolve(); return published.promise; });
  let settled = false;
  const running = syncCollectionToObsidian(collector, repositories, ' relative vault ')
    .then((result) => { settled = true; return result; });
  expect(runSync).toHaveBeenCalledExactlyOnceWith(collector, repositories);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  synced.resolve(syncResult);
  await readStarted.promise;
  expect(exportProjection).not.toHaveBeenCalled();
  read.resolve(snapshot.items);
  await exportStarted.promise;
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith(' relative vault ', snapshot);
  expect(settled).toBe(false);
  published.resolve(completed);
  const result = await running;
  expect(result.sync).toBe(syncResult);
  expect(result.export).toBe(completed.items);
  expect(result.collections).toBe(completed.collections);
  expect(result.navigation).toBe(completed.navigation);
  expect(collector.collectCollection).not.toHaveBeenCalled();
  expect(repositories.collections.upsert).not.toHaveBeenCalled();
});

it('exports full persisted data even after an empty collection sync', async () => {
  const { collector, repositories } = setup();
  runSync.mockResolvedValue({ processed: 0, new: 0, changed: 0, unchanged: 0, membershipsRemoved: 2 });
  await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

it('uses the consistent storage snapshot capability when available', async () => {
  const { collector, repositories } = setup();
  const readSnapshot = vi.fn(() => snapshot);
  await syncCollectionToObsidian(collector, { ...repositories, readSnapshot }, 'vault');
  expect(readSnapshot).toHaveBeenCalledExactlyOnceWith();
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

for (const phase of ['sync', 'items', 'collections', 'memberships', 'export'] as const) {
  it.each([new Error('phase failure'), { reason: 'failure' }, undefined])(
    'retains original ' + phase + ' exception and prevents later work (%j)', async (error) => {
      const { collector, repositories } = setup();
      if (phase === 'sync') runSync.mockRejectedValue(error);
      if (phase === 'items') repositories.knowledgeItems.listAll.mockRejectedValue(error);
      if (phase === 'collections') repositories.collections.listAll.mockRejectedValue(error);
      if (phase === 'memberships') repositories.collectionMemberships.listAll.mockRejectedValue(error);
      if (phase === 'export') exportProjection.mockRejectedValue(error);
      await expect(syncCollectionToObsidian(collector, repositories, 'vault')).rejects.toBe(error);
      expect(exportProjection).toHaveBeenCalledTimes(phase === 'export' ? 1 : 0);
    });
}

it('preserves partial item results and explicit downstream skips without retrying', async () => {
  const { collector, repositories } = setup();
  const result: ObsidianProjectionExportResult = {
    items: { processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, item, error: undefined }] },
    collections: { status: 'skipped', reason: 'upstream-failure' },
    navigation: { status: 'skipped', reason: 'upstream-failure' },
  };
  exportProjection.mockResolvedValue(result);
  expect(await syncCollectionToObsidian(collector, repositories, 'vault')).toEqual({
    sync: syncResult, export: result.items, collections: result.collections, navigation: result.navigation,
  });
  expect(exportProjection).toHaveBeenCalledTimes(1);
});

it.each([new Error('collection failed'), undefined])('forwards collection failure and skipped navigation (%j)', async (error) => {
  const { collector, repositories } = setup();
  exportProjection.mockResolvedValue({ ...completed, collections: { status: 'failed', error },
    navigation: { status: 'skipped', reason: 'upstream-failure' } });
  const result = await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(result.export).toBe(batch);
  expect(result.collections).toEqual({ status: 'failed', error });
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
});

it('preserves a completed collection batch containing failures and skipped navigation', async () => {
  const { collector, repositories } = setup();
  const collections = { status: 'completed' as const, result: {
    processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, collection, error: undefined }],
  } };
  exportProjection.mockResolvedValue({ ...completed, collections,
    navigation: { status: 'skipped', reason: 'upstream-failure' } });
  const result = await syncCollectionToObsidian(collector, repositories, 'vault');
  expect(result.collections).toBe(collections);
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
});

for (const stage of ['render', 'write'] as const) {
  it.each([new Error('navigation failed'), undefined])('forwards navigation ' + stage + ' failure (%j)', async (error) => {
    const { collector, repositories } = setup();
    exportProjection.mockResolvedValue({ ...completed, navigation: { status: 'failed', stage, error } });
    const result = await syncCollectionToObsidian(collector, repositories, 'vault');
    expect(result.navigation).toEqual({ status: 'failed', stage, error });
    expect(result.export).toBe(batch);
  });
}

it('forwards the publisher empty-snapshot no-op', async () => {
  const { collector, repositories } = setup();
  repositories.knowledgeItems.listAll.mockResolvedValue([]);
  repositories.collections.listAll.mockResolvedValue([]);
  repositories.collectionMemberships.listAll.mockResolvedValue([]);
  exportProjection.mockResolvedValue({ ...completed, navigation: { status: 'skipped', reason: 'empty-snapshot' } });
  const result = await syncCollectionToObsidian(collector, repositories, 'missing vault');
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('missing vault', { items: [], collections: [], memberships: [] });
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'empty-snapshot' });
});
