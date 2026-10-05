import { beforeEach, expect, it, vi } from 'vitest';
import { syncAccount } from '../src/application/sync-account.js';
import { syncCollection, type CollectionSyncRepositories } from '../src/application/sync-collection.js';
import type { SyncResult } from '../src/application/sync.js';
import type { AccountSyncSource } from '../src/collectors/account-sync-source.js';
import type { CollectionCollector } from '../src/collectors/collection-collector.js';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../src/outputs/obsidian/export-notes.js';

vi.mock('../src/application/sync-collection.js', () => ({ syncCollection: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));

const runSync = vi.mocked(syncCollection);
const exportNotes = vi.mocked(exportObsidianNotes);
const playlists: readonly KnowledgeCollection[] = Object.freeze(['A', 'B', 'C'].map((sourceId) =>
  Object.freeze({ source: 'example', sourceId, title: `Playlist ${sourceId}` })));
const snapshot: readonly KnowledgeItem[] = Object.freeze([
  Object.freeze({ source: 'other', sourceId: 'old', title: 'Retained item', url: 'https://example.com/old' }),
]);
const one: SyncResult = { processed: 1, new: 1, changed: 0, unchanged: 0 };
const empty: SyncResult = { processed: 0, new: 0, changed: 0, unchanged: 0 };
const exported: ObsidianBatchExportResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };

function setup(collections: readonly KnowledgeCollection[] = playlists) {
  const collectors = collections.map((): CollectionCollector => ({ collectCollection: vi.fn() }));
  const source = {
    discover: vi.fn<AccountSyncSource['discover']>().mockResolvedValue(collections),
    createCollector: vi.fn<AccountSyncSource['createCollector']>((collection) => collectors[collections.indexOf(collection)]!),
    isFatalError: vi.fn<AccountSyncSource['isFatalError']>().mockReturnValue(false),
  } satisfies AccountSyncSource;
  const repositories = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn(async () => snapshot) },
    collections: { upsert: vi.fn(), listAll: vi.fn() },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn() },
  } satisfies CollectionSyncRepositories;
  return { source, repositories, collectors };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

beforeEach(() => {
  runSync.mockReset().mockResolvedValue(one);
  exportNotes.mockReset().mockResolvedValue(exported);
});

it('reuses complete playlist sync in discovery order and sums successful processing events', async () => {
  const { source, repositories, collectors } = setup();
  runSync.mockResolvedValueOnce({ processed: 3, new: 2, changed: 0, unchanged: 1 })
    .mockResolvedValueOnce({ processed: 2, new: 0, changed: 1, unchanged: 1 })
    .mockResolvedValueOnce(empty);
  expect(await syncAccount(source, repositories)).toEqual({
    playlists: { discovered: 3, succeeded: 3, failed: 0, unattempted: 0 },
    items: { processed: 5, new: 2, changed: 1, unchanged: 2 }, failures: [], export: { status: 'not-requested' },
  });
  expect(source.discover).toHaveBeenCalledExactlyOnceWith();
  expect(source.createCollector.mock.calls).toEqual(playlists.map((playlist) => [playlist]));
  expect(runSync.mock.calls).toEqual(collectors.map((collector) => [collector, repositories]));
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
});

it('counts one empty playlist as successful', async () => {
  const { source, repositories } = setup(playlists.slice(0, 1));
  runSync.mockResolvedValue(empty);
  const result = await syncAccount(source, repositories);
  expect(result.playlists).toEqual({ discovered: 1, succeeded: 1, failed: 0, unattempted: 0 });
  expect(result.items).toEqual(empty);
});

it('awaits complete discovery, each playlist, snapshot, and final export before settling', async () => {
  const { source, repositories, collectors } = setup(playlists.slice(0, 2));
  const discovered = deferred<readonly KnowledgeCollection[]>();
  const first = deferred<SyncResult>();
  const second = deferred<SyncResult>();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const read = deferred<readonly KnowledgeItem[]>();
  const readStarted = deferred<void>();
  const exportedResult = deferred<ObsidianBatchExportResult>();
  const exportStarted = deferred<void>();
  source.discover.mockReturnValue(discovered.promise);
  runSync.mockImplementationOnce(() => { firstStarted.resolve(); return first.promise; })
    .mockImplementationOnce(() => { secondStarted.resolve(); return second.promise; });
  repositories.knowledgeItems.listAll.mockImplementation(() => { readStarted.resolve(); return read.promise; });
  exportNotes.mockImplementation(() => { exportStarted.resolve(); return exportedResult.promise; });
  let settled = false;
  const running = syncAccount(source, repositories, ' relative vault ').then((value) => { settled = true; return value; });
  expect(source.createCollector).not.toHaveBeenCalled();
  expect(runSync).not.toHaveBeenCalled();
  discovered.resolve(playlists.slice(0, 2));
  await firstStarted.promise;
  expect(runSync).toHaveBeenCalledExactlyOnceWith(collectors[0], repositories);
  expect(source.createCollector).toHaveBeenCalledTimes(1);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  first.resolve(one);
  await secondStarted.promise;
  expect(runSync).toHaveBeenCalledTimes(2);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
  second.resolve(one);
  await readStarted.promise;
  expect(repositories.knowledgeItems.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(exportNotes).not.toHaveBeenCalled();
  read.resolve(snapshot);
  await exportStarted.promise;
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith(' relative vault ', snapshot);
  expect(exportNotes.mock.calls[0]![1]).toBe(snapshot);
  expect(settled).toBe(false);
  exportedResult.resolve(exported);
  expect((await running).export).toEqual({ status: 'completed', result: exported });
});

it.each([undefined, 'vault'])('handles zero playlists with requested export = %j', async (vault) => {
  const { source, repositories } = setup([]);
  const result = await syncAccount(source, repositories, vault);
  expect(result.playlists).toEqual({ discovered: 0, succeeded: 0, failed: 0, unattempted: 0 });
  expect(result.items).toEqual(empty);
  expect(source.createCollector).not.toHaveBeenCalled();
  expect(runSync).not.toHaveBeenCalled();
  if (vault === undefined) {
    expect(result.export).toEqual({ status: 'not-requested' });
    expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
    expect(exportNotes).not.toHaveBeenCalled();
  } else {
    expect(result.export).toEqual({ status: 'completed', result: exported });
    expect(repositories.knowledgeItems.listAll).toHaveBeenCalledExactlyOnceWith();
    expect(exportNotes).toHaveBeenCalledExactlyOnceWith(vault, snapshot);
  }
});

it.each([new Error('Discovery failed'), { reason: 'Discovery failed' }, undefined])
('returns an explicit fatal discovery outcome without playlist or persistence work (%j)', async (error) => {
  const { source, repositories } = setup();
  source.discover.mockRejectedValue(error);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result).toEqual({ playlists: { discovered: 0, succeeded: 0, failed: 0, unattempted: 0 },
    items: empty, failures: [], fatal: { stage: 'discovery', error }, export: { status: 'skipped' } });
  expect(result.fatal!.error).toBe(error);
  expect(source.createCollector).not.toHaveBeenCalled();
  expect(runSync).not.toHaveBeenCalled();
  expect(repositories.collections.upsert).not.toHaveBeenCalled();
  expect(repositories.knowledgeItems.upsert).not.toHaveBeenCalled();
  expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
});

it.each([[0], [1], [2], [0, 2], [0, 1, 2]])
('continues after recoverable failure indexes %j and still exports once', async (...failedIndexes) => {
  const { source, repositories } = setup();
  const errors = playlists.map((playlist) => ({ failed: playlist.sourceId }));
  for (const [index] of playlists.entries()) {
    if (failedIndexes.includes(index)) runSync.mockRejectedValueOnce(errors[index]);
    else runSync.mockResolvedValueOnce(one);
  }
  const result = await syncAccount(source, repositories, 'vault');
  const succeeded = playlists.length - failedIndexes.length;
  expect(result.playlists).toEqual({ discovered: 3, succeeded, failed: failedIndexes.length, unattempted: 0 });
  expect(result.items).toEqual({ processed: succeeded, new: succeeded, changed: 0, unchanged: 0 });
  expect(result.failures).toEqual(failedIndexes.map((index) => ({ playlistId: playlists[index]!.sourceId,
    playlistTitle: playlists[index]!.title, error: errors[index] })));
  for (const [index, failure] of result.failures.entries()) expect(failure.error).toBe(errors[failedIndexes[index]!]);
  expect(result).not.toHaveProperty('fatal');
  expect(runSync).toHaveBeenCalledTimes(3);
  expect(result.export).toEqual({ status: 'completed', result: exported });
  expect(repositories.knowledgeItems.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(exportNotes).toHaveBeenCalledExactlyOnceWith('vault', snapshot);
});

it('retains a collector-construction failure and continues with later playlists', async () => {
  const { source, repositories, collectors } = setup();
  source.createCollector.mockImplementationOnce(() => { throw undefined; });
  const result = await syncAccount(source, repositories);
  expect(result.failures).toEqual([{ playlistId: 'A', playlistTitle: 'Playlist A', error: undefined }]);
  expect(result.playlists).toEqual({ discovered: 3, succeeded: 2, failed: 1, unattempted: 0 });
  expect(runSync.mock.calls).toEqual(collectors.slice(1).map((collector) => [collector, repositories]));
});

it.each([new Error('Authentication failed'), undefined])
('stops on a source-classified late fatal failure while retaining earlier summary (%j)', async (error) => {
  const { source, repositories } = setup();
  runSync.mockResolvedValueOnce(one).mockRejectedValueOnce(error);
  source.isFatalError.mockImplementation((value) => value === error);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.playlists).toEqual({ discovered: 3, succeeded: 1, failed: 1, unattempted: 1 });
  expect(result.items).toEqual(one);
  expect(result.failures).toEqual([{ playlistId: 'B', playlistTitle: 'Playlist B', error }]);
  expect(result.fatal).toEqual({ stage: 'playlist', error });
  expect(result.fatal!.error).toBe(error);
  expect(result.export).toEqual({ status: 'skipped' });
  expect(runSync).toHaveBeenCalledTimes(2);
  expect(source.createCollector).toHaveBeenCalledTimes(2);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
});

it('retains earlier recoverable failures when a later storage error stops the account', async () => {
  const { source, repositories } = setup([...playlists, { source: 'example', sourceId: 'D', title: 'Playlist D' }]);
  const recoverable = new Error('Playlist inaccessible');
  const fatal = new Error('Database wrapper', { cause: { code: 'SQLITE_IOERR_WRITE' } });
  runSync.mockRejectedValueOnce(recoverable).mockResolvedValueOnce(one).mockRejectedValueOnce(fatal);
  const result = await syncAccount(source, repositories);
  expect(result.playlists).toEqual({ discovered: 4, succeeded: 1, failed: 2, unattempted: 1 });
  expect(result.items).toEqual(one);
  expect(result.failures.map((failure) => failure.error)).toEqual([recoverable, fatal]);
  expect(result.fatal!.error).toBe(fatal);
  expect(result.export).toEqual({ status: 'not-requested' });
  expect(runSync).toHaveBeenCalledTimes(3);
  expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportNotes).not.toHaveBeenCalled();
});

it('treats structured constraint errors as recoverable playlist failures', async () => {
  const { source, repositories } = setup();
  const error = Object.assign(new Error('Constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  runSync.mockRejectedValueOnce(error);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.playlists).toEqual({ discovered: 3, succeeded: 2, failed: 1, unattempted: 0 });
  expect(result).not.toHaveProperty('fatal');
  expect(result.export).toEqual({ status: 'completed', result: exported });
});

for (const stage of ['snapshot', 'batch'] as const) {
  it.each([new Error('Export phase failed'), { reason: 'Export phase failed' }, undefined])
  (`preserves playlist failures and successful summary after ${stage} exception (%j)`, async (error) => {
    const { source, repositories } = setup();
    const playlistError = new Error('Playlist failed');
    runSync.mockRejectedValueOnce(playlistError);
    if (stage === 'snapshot') repositories.knowledgeItems.listAll.mockRejectedValue(error);
    else exportNotes.mockRejectedValue(error);
    const result = await syncAccount(source, repositories, 'vault');
    expect(result.playlists).toEqual({ discovered: 3, succeeded: 2, failed: 1, unattempted: 0 });
    expect(result.items).toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });
    expect(result.failures[0]!.error).toBe(playlistError);
    expect(result.export).toEqual({ status: 'failed', stage, error });
    if (result.export.status === 'failed') expect(result.export.error).toBe(error);
    expect(result).not.toHaveProperty('fatal');
    expect(repositories.knowledgeItems.listAll).toHaveBeenCalledExactlyOnceWith();
    expect(exportNotes).toHaveBeenCalledTimes(stage === 'batch' ? 1 : 0);
  });
}

it('preserves partial export result and playlist errors without retries', async () => {
  const { source, repositories } = setup();
  const playlistError = new Error('Playlist failed');
  const partial: ObsidianBatchExportResult = { processed: 1, succeeded: 0, failed: 1,
    failures: [{ index: 0, item: snapshot[0]!, error: undefined }] };
  runSync.mockRejectedValueOnce(playlistError);
  exportNotes.mockResolvedValue(partial);
  const result = await syncAccount(source, repositories, 'vault');
  expect(result.failures[0]!.error).toBe(playlistError);
  expect(result.export).toEqual({ status: 'completed', result: partial });
  if (result.export.status === 'completed') expect(result.export.result).toBe(partial);
  expect(exportNotes).toHaveBeenCalledTimes(1);
});
