import { beforeEach, expect, it, vi } from 'vitest';
import { syncAccount } from '../src/application/sync-account.js';
import { syncCollection, type CollectionSyncRepositories, type CollectionSyncResult } from '../src/application/sync-collection.js';
import type { AccountSyncSource } from '../src/collectors/account-sync-source.js';
import type { CollectionCollector } from '../src/collectors/collection-collector.js';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import { exportObsidianProjection, type ObsidianProjectionExportResult } from '../src/outputs/obsidian/export-projection.js';

vi.mock('../src/application/sync-collection.js', () => ({ syncCollection: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-projection.js', () => ({ exportObsidianProjection: vi.fn() }));
const runSync = vi.mocked(syncCollection);
const exportProjection = vi.mocked(exportObsidianProjection);
const playlists = ['A', 'B', 'C'].map((sourceId) => ({ source: 'example', sourceId, title: 'Playlist ' + sourceId }));
const item = { source: 'other', sourceId: 'old', title: 'Retained item', url: 'https://example.com/old' };
const snapshot = { items: [item], collections: playlists, memberships: [] };
const one = { processed: 1, new: 1, changed: 0, unchanged: 0 };
const empty = { processed: 0, new: 0, changed: 0, unchanged: 0 };
const oneCollection = { ...one, membershipsRemoved: 2 };
const items = { processed: 1, succeeded: 1, failed: 0, failures: [] };
const collections = { status: 'completed' as const, result: { processed: 3, succeeded: 3, failed: 0, failures: [] } };
const projection: ObsidianProjectionExportResult = { items, collections, navigation: { status: 'completed' } };
const completed = { status: 'completed', result: items, collections, navigation: { status: 'completed' } };
const skippedNavigation = { status: 'skipped', reason: 'upstream-failure' };

function setup(discovered: readonly KnowledgeCollection[] = playlists) {
  const collectors = discovered.map((): CollectionCollector => ({ collectCollection: vi.fn() }));
  const source = {
    discover: vi.fn<AccountSyncSource['discover']>().mockResolvedValue(discovered),
    createCollector: vi.fn<AccountSyncSource['createCollector']>((collection) => collectors[discovered.indexOf(collection)]!),
    isFatalError: vi.fn<AccountSyncSource['isFatalError']>().mockReturnValue(false),
  } satisfies AccountSyncSource;
  const repositories = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn(async () => snapshot.items) },
    collections: { upsert: vi.fn(), listAll: vi.fn(async () => playlists) },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn(async () => []), removeStaleForCollection: vi.fn() },
  } satisfies CollectionSyncRepositories;
  return { source, repositories, collectors };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}
beforeEach(() => {
  runSync.mockReset().mockResolvedValue(oneCollection);
  exportProjection.mockReset().mockResolvedValue(projection);
});

it('syncs playlists in discovery order and sums only successful processing events', async () => {
  const { source, repositories, collectors } = setup();
  runSync.mockResolvedValueOnce({ processed: 3, new: 2, changed: 0, unchanged: 1, membershipsRemoved: 2 })
    .mockResolvedValueOnce({ processed: 2, new: 0, changed: 1, unchanged: 1, membershipsRemoved: 3 })
    .mockResolvedValueOnce({ ...empty, membershipsRemoved: 4 });
  expect(await syncAccount(source, repositories)).toEqual({
    playlists: { discovered: 3, succeeded: 3, failed: 0, unattempted: 0 },
    membershipsRemoved: 9, items: { processed: 5, new: 2, changed: 1, unchanged: 2 },
    failures: [], export: { status: 'not-requested' },
  });
  expect(source.discover).toHaveBeenCalledExactlyOnceWith();
  expect(source.createCollector.mock.calls).toEqual(playlists.map((value) => [value]));
  expect(runSync.mock.calls).toEqual(collectors.map((value) => [value, repositories]));
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportProjection).not.toHaveBeenCalled();
});

it('counts an empty playlist as successfully synchronized', async () => {
  const { source, repositories } = setup(playlists.slice(0, 1));
  runSync.mockResolvedValue({ ...empty, membershipsRemoved: 3 });
  const result = await syncAccount(source, repositories);
  expect(result.playlists).toEqual({ discovered: 1, succeeded: 1, failed: 0, unattempted: 0 });
  expect(result.items).toEqual(empty);
  expect(result.membershipsRemoved).toBe(3);
});

it('awaits discovery, each playlist, complete snapshot and shared export before settling', async () => {
  const { source, repositories, collectors } = setup(playlists.slice(0, 2));
  const discovered = deferred<readonly KnowledgeCollection[]>();
  const first = deferred<CollectionSyncResult>();
  const second = deferred<CollectionSyncResult>();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const read = deferred<typeof snapshot.items>();
  const readStarted = deferred<void>();
  const published = deferred<ObsidianProjectionExportResult>();
  const publishStarted = deferred<void>();
  source.discover.mockReturnValue(discovered.promise);
  runSync.mockImplementationOnce(() => { firstStarted.resolve(); return first.promise; })
    .mockImplementationOnce(() => { secondStarted.resolve(); return second.promise; });
  repositories.knowledgeItems.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportProjection.mockImplementation(() => { publishStarted.resolve(); return published.promise; });
  let settled = false;
  const running = syncAccount(source, repositories, ' relative vault ').then((value) => { settled = true; return value; });
  expect(source.createCollector).not.toHaveBeenCalled();
  discovered.resolve(playlists.slice(0, 2));
  await firstStarted.promise;
  expect(runSync).toHaveBeenCalledExactlyOnceWith(collectors[0], repositories);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  first.resolve(oneCollection);
  await secondStarted.promise;
  expect(runSync).toHaveBeenCalledTimes(2);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  second.resolve(oneCollection);
  await readStarted.promise;
  expect(exportProjection).not.toHaveBeenCalled();
  read.resolve(snapshot.items);
  await publishStarted.promise;
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith(' relative vault ', snapshot);
  expect(settled).toBe(false);
  published.resolve(projection);
  expect((await running).export).toEqual(completed);
});

it('uses the storage-owned consistent snapshot capability for final export', async () => {
  const { source, repositories } = setup([]);
  const readSnapshot = vi.fn(() => snapshot);
  await syncAccount(source, { ...repositories, readSnapshot }, 'vault');
  expect(readSnapshot).toHaveBeenCalledExactlyOnceWith();
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

it.each([undefined, 'vault'])('handles no discovered playlists with optional export (%j)', async (vault) => {
  const { source, repositories } = setup([]);
  const result = await syncAccount(source, repositories, vault);
  expect(result.playlists).toEqual({ discovered: 0, succeeded: 0, failed: 0, unattempted: 0 });
  expect(result.items).toEqual(empty);
  expect(runSync).not.toHaveBeenCalled();
  if (vault === undefined) {
    expect(result.export).toEqual({ status: 'not-requested' });
    expect(exportProjection).not.toHaveBeenCalled();
  } else {
    expect(result.export).toEqual(completed);
    expect(exportProjection).toHaveBeenCalledExactlyOnceWith(vault, snapshot);
  }
});

it.each([new Error('Discovery failed'), { reason: 'failure' }, undefined])
('retains fatal discovery failures without persistence/export work (%j)', async (error) => {
  const { source, repositories } = setup();
  source.discover.mockRejectedValue(error);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.fatal).toEqual({ stage: 'discovery', error });
  expect(result.fatal!.error).toBe(error);
  expect(result.export).toEqual({ status: 'skipped', navigation: skippedNavigation });
  expect(source.createCollector).not.toHaveBeenCalled();
  expect(runSync).not.toHaveBeenCalled();
  expect(repositories.knowledgeItems.upsert).not.toHaveBeenCalled();
  expect(exportProjection).not.toHaveBeenCalled();
});

it.each([[0], [1], [2], [0, 2], [0, 1, 2]])
('continues after recoverable failures %j and exports once', async (...failedIndexes) => {
  const { source, repositories } = setup();
  const errors = playlists.map((value) => ({ failed: value.sourceId }));
  playlists.forEach((_, index) => {
    if (failedIndexes.includes(index)) runSync.mockRejectedValueOnce(errors[index]);
    else runSync.mockResolvedValueOnce(oneCollection);
  });
  const result = await syncAccount(source, repositories, 'vault');
  const succeeded = playlists.length - failedIndexes.length;
  expect(result.playlists).toEqual({ discovered: 3, succeeded, failed: failedIndexes.length, unattempted: 0 });
  expect(result.items).toEqual({ processed: succeeded, new: succeeded, changed: 0, unchanged: 0 });
  expect(result.membershipsRemoved).toBe(succeeded * 2);
  expect(result.failures).toEqual(failedIndexes.map((index) => ({
    playlistId: playlists[index]!.sourceId, playlistTitle: playlists[index]!.title, error: errors[index],
  })));
  expect(result).not.toHaveProperty('fatal');
  expect(result.export).toEqual(completed);
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

it('retains collector-construction failures and continues', async () => {
  const { source, repositories, collectors } = setup();
  source.createCollector.mockImplementationOnce(() => { throw undefined; });
  const result = await syncAccount(source, repositories);
  expect(result.failures).toEqual([{ playlistId: 'A', playlistTitle: 'Playlist A', error: undefined }]);
  expect(runSync.mock.calls).toEqual(collectors.slice(1).map((value) => [value, repositories]));
});

it.each([new Error('Authentication failed'), undefined])('stops on late source-classified fatal failure (%j)', async (error) => {
  const { source, repositories } = setup();
  runSync.mockResolvedValueOnce(oneCollection).mockRejectedValueOnce(error);
  source.isFatalError.mockImplementation((value) => value === error);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.playlists).toEqual({ discovered: 3, succeeded: 1, failed: 1, unattempted: 1 });
  expect(result.items).toEqual(one);
  expect(result.fatal).toEqual({ stage: 'playlist', error });
  expect(result.export).toEqual({ status: 'skipped', navigation: skippedNavigation });
  expect(runSync).toHaveBeenCalledTimes(2);
  expect(exportProjection).not.toHaveBeenCalled();
});

it('retains recoverable failures before a fatal storage failure', async () => {
  const { source, repositories } = setup([...playlists, { source: 'example', sourceId: 'D', title: 'Playlist D' }]);
  const recoverable = new Error('Playlist inaccessible');
  const fatal = new Error('Database wrapper', { cause: { code: 'SQLITE_IOERR_WRITE' } });
  runSync.mockRejectedValueOnce(recoverable).mockResolvedValueOnce(oneCollection).mockRejectedValueOnce(fatal);
  const result = await syncAccount(source, repositories);
  expect(result.playlists).toEqual({ discovered: 4, succeeded: 1, failed: 2, unattempted: 1 });
  expect(result.failures.map((value) => value.error)).toEqual([recoverable, fatal]);
  expect(result.fatal!.error).toBe(fatal);
  expect(result.export).toEqual({ status: 'not-requested' });
});

it('treats constraint failures as recoverable', async () => {
  const { source, repositories } = setup();
  runSync.mockRejectedValueOnce(Object.assign(new Error('Constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }));
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.playlists.failed).toBe(1);
  expect(result).not.toHaveProperty('fatal');
  expect(result.export).toEqual(completed);
});

for (const phase of ['items', 'collections', 'memberships', 'batch'] as const) {
  it.each([new Error('Export failed'), { reason: 'failure' }, undefined])(
    'preserves sync summary after ' + phase + ' exception (%j)', async (error) => {
      const { source, repositories } = setup();
      const playlistError = new Error('Playlist failed');
      runSync.mockRejectedValueOnce(playlistError);
      if (phase === 'items') repositories.knowledgeItems.listAll.mockRejectedValue(error);
      if (phase === 'collections') repositories.collections.listAll.mockRejectedValue(error);
      if (phase === 'memberships') repositories.collectionMemberships.listAll.mockRejectedValue(error);
      if (phase === 'batch') exportProjection.mockRejectedValue(error);
      const result = await syncAccount(source, repositories, 'vault');
      expect(result.playlists).toEqual({ discovered: 3, succeeded: 2, failed: 1, unattempted: 0 });
      expect(result.failures[0]!.error).toBe(playlistError);
      expect(result.export).toEqual({ status: 'failed', stage: phase === 'batch' ? 'batch' : 'snapshot',
        error, navigation: skippedNavigation });
      expect(exportProjection).toHaveBeenCalledTimes(phase === 'batch' ? 1 : 0);
    });
}

it('preserves item failures and skipped phases without retries', async () => {
  const { source, repositories } = setup();
  const partial = { processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, item, error: undefined }] };
  exportProjection.mockResolvedValue({ items: partial, collections: { status: 'skipped', reason: 'upstream-failure' },
    navigation: { status: 'skipped', reason: 'upstream-failure' } });
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.export).toEqual({ status: 'completed', result: partial,
    collections: { status: 'skipped', reason: 'upstream-failure' }, navigation: skippedNavigation });
  expect(exportProjection).toHaveBeenCalledTimes(1);
});

it.each([new Error('Collection failed'), { detail: 'failure' }, undefined])
('retains item output on unexpected collection failure (%j)', async (error) => {
  const { source, repositories } = setup();
  exportProjection.mockResolvedValue({ ...projection, collections: { status: 'failed', error },
    navigation: { status: 'skipped', reason: 'upstream-failure' } });
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.export).toEqual({ status: 'failed', stage: 'collections', result: items, error, navigation: skippedNavigation });
});

it('retains collection note failures and skipped navigation', async () => {
  const { source, repositories } = setup();
  const partial = { status: 'completed' as const, result: { processed: 3, succeeded: 2, failed: 1,
    failures: [{ index: 1, collection: playlists[1]!, error: undefined }] } };
  exportProjection.mockResolvedValue({ ...projection, collections: partial,
    navigation: { status: 'skipped', reason: 'upstream-failure' } });
  expect((await syncAccount(source, repositories, 'vault')).export)
    .toEqual({ status: 'completed', result: items, collections: partial, navigation: skippedNavigation });
});

for (const stage of ['render', 'write'] as const) {
  it.each([new Error('Navigation failed'), undefined])('preserves navigation ' + stage + ' failure (%j)', async (error) => {
    const { source, repositories } = setup();
    exportProjection.mockResolvedValue({ ...projection, navigation: { status: 'failed', stage, error } });
    expect((await syncAccount(source, repositories, 'vault')).export)
      .toEqual({ status: 'completed', result: items, collections, navigation: { status: 'failed', stage, error } });
  });
}

it('forwards empty snapshot no-op', async () => {
  const { source, repositories } = setup([]);
  repositories.knowledgeItems.listAll.mockResolvedValue([]);
  repositories.collections.listAll.mockResolvedValue([]);
  exportProjection.mockResolvedValue({ ...projection, navigation: { status: 'skipped', reason: 'empty-snapshot' } });
  expect((await syncAccount(source, repositories, 'missing vault')).export)
    .toMatchObject({ status: 'completed', navigation: { status: 'skipped', reason: 'empty-snapshot' } });
  expect(exportProjection).toHaveBeenCalledExactlyOnceWith('missing vault', { items: [], collections: [], memberships: [] });
});
