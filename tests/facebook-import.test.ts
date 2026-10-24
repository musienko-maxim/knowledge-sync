import { afterEach, describe, expect, it, vi } from 'vitest';
import { importFacebook } from '../src/application/import-facebook.js';
import { parseFacebookImport } from '../src/collectors/facebook/import.js';
import type { CollectionSyncRepositories } from '../src/application/sync-collection.js';
import * as projection from '../src/outputs/obsidian/export-projection.js';

const saved = (url: string, title?: string, description?: string) => ({ dict: [
  { label: 'URL-адреса', value: url },
  ...(title ? [{ label: 'Назва', value: title }] : []),
  ...(description ? [{ label: 'Опис', value: description }] : []),
] });
const collection = (id: string, entries: unknown[], title = 'Collection') => ({ fbid: id,
  label_values: [{ label: 'Назва', value: title }, { title: 'Збереження', dict: entries }] });
const input = () => parseFacebookImport(JSON.stringify([
  collection('111', [saved('https://example.test/one', 'First'), saved('https://example.test/two', 'Second')]),
  collection('222', []),
]));

function repositories(): CollectionSyncRepositories {
  return {
    collections: { listAll: vi.fn(async () => []), upsert: vi.fn(async () => {}) },
    knowledgeItems: { listAll: vi.fn(async () => []), findByIdentity: vi.fn(async () => null), upsert: vi.fn(async () => {}) },
    collectionMemberships: { listAll: vi.fn(async () => []), add: vi.fn(async () => {}),
      removeStaleForCollection: vi.fn(async () => { throw new Error('Destructive reconciliation is forbidden'); }) },
  };
}

afterEach(() => vi.restoreAllMocks());

it('persists collections, items and unique memberships in sequence without export or destructive reconciliation', async () => {
  const batch = input();
  const store = repositories();
  const calls: string[] = [];
  vi.mocked(store.collections.upsert).mockImplementation(async () => { calls.push('collection'); });
  vi.mocked(store.knowledgeItems.upsert).mockImplementation(async () => { calls.push('item'); });
  vi.mocked(store.collectionMemberships.add).mockImplementation(async () => { calls.push('membership'); });
  const exportSpy = vi.spyOn(projection, 'exportObsidianProjection');
  expect(await importFacebook(batch, store)).toEqual({
    input: batch.counters,
    collections: { processed: 2, new: 2, changed: 0, unchanged: 0 },
    items: { processed: 2, new: 2, changed: 0, unchanged: 0 },
    memberships: { processed: 2, new: 2, unchanged: 0 }, warnings: [], export: { status: 'not-requested' },
  });
  expect(calls).toEqual(['collection', 'collection', 'item', 'item', 'membership', 'membership']);
  expect(store.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
  expect(store.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(exportSpy).not.toHaveBeenCalled();
});

it('classifies collection changes, unchanged items and existing memberships against stored state', async () => {
  const batch = input();
  const store = repositories();
  vi.mocked(store.collections.listAll).mockResolvedValue([
    { ...batch.collections[0]!, title: 'Old name' }, batch.collections[1]!,
  ]);
  vi.mocked(store.knowledgeItems.findByIdentity).mockImplementation(async (_source, id) =>
    batch.items.find(candidate => candidate.item.sourceId === id)!.item);
  vi.mocked(store.collectionMemberships.listAll).mockResolvedValue(batch.memberships);
  const result = await importFacebook(batch, store);
  expect(result.collections).toEqual({ processed: 2, new: 0, changed: 1, unchanged: 1 });
  expect(result.items).toEqual({ processed: 2, new: 0, changed: 0, unchanged: 2 });
  expect(result.memberships).toEqual({ processed: 2, new: 0, unchanged: 2 });
});

it('preserves stored meaningful metadata and legacy optionals while reporting fixed conflict counts', async () => {
  const batch = parseFacebookImport(JSON.stringify([collection('111', [
    saved('https://example.test/one', 'New title', 'New description'),
    saved('https://example.test/one', 'Other title', 'Other description'),
  ])]));
  const store = repositories();
  const existing = { ...batch.items[0]!.item, title: 'Stored title', description: 'Stored description',
    author: 'Stored author', collection: 'Legacy collection', publishedAt: '2020-01-01T00:00:00Z' };
  vi.mocked(store.knowledgeItems.findByIdentity).mockResolvedValue(existing);
  const result = await importFacebook(batch, store);
  expect(store.knowledgeItems.upsert).toHaveBeenCalledExactlyOnceWith(existing);
  expect(result.items).toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
  expect(result.warnings).toEqual([{ code: 'DESCRIPTION_CONFLICT', count: 1 }, { code: 'TITLE_CONFLICT', count: 1 }]);
});

describe('partial storage failures', () => {
  it.each(['collections', 'items', 'memberships'] as const)('retains only completed %s writes and suppresses export', async (stage) => {
    const batch = input();
    const store = repositories();
    const method = stage === 'collections' ? store.collections.upsert : stage === 'items' ? store.knowledgeItems.upsert : store.collectionMemberships.add;
    vi.mocked(method).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('https://private.test/secret private metadata'));
    const exportSpy = vi.spyOn(projection, 'exportObsidianProjection');
    const result = await importFacebook(batch, store, 'unused-vault');
    expect(result.failure).toEqual({ stage, code: 'STORAGE_FAILED' });
    expect(result[stage].processed).toBe(1);
    expect(result[stage].new).toBe(1);
    expect(result.export).toEqual({ status: 'skipped' });
    expect(exportSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('private');
    if (stage === 'collections') {
      expect(store.knowledgeItems.upsert).not.toHaveBeenCalled();
      expect(store.collectionMemberships.add).not.toHaveBeenCalled();
    } else if (stage === 'items') expect(store.collectionMemberships.add).not.toHaveBeenCalled();
    expect(store.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
  });

  it.each(['collections', 'items', 'memberships'] as const)('stops when the %s state lookup fails', async (stage) => {
    const store = repositories();
    const method = stage === 'collections' ? store.collections.listAll : stage === 'items'
      ? store.knowledgeItems.findByIdentity : store.collectionMemberships.listAll;
    vi.mocked(method).mockRejectedValueOnce(undefined);
    const result = await importFacebook(input(), store, 'unused-vault');
    expect(result.failure).toEqual({ stage, code: 'STORAGE_FAILED' });
    expect(result[stage].processed).toBe(0);
    expect(result.export).toEqual({ status: 'skipped' });
  });
});

it('finishes full snapshot reads before exporting all sources and retains projection outcomes', async () => {
  const store = repositories();
  const snapshot = {
    items: [{ source: 'youtube', sourceId: 'prior', title: 'Prior', url: 'https://example.test/prior' }],
    collections: [{ source: 'youtube', sourceId: 'list', title: 'Prior list' }],
    memberships: [{ source: 'youtube', collectionSourceId: 'list', itemSourceId: 'prior' }],
  };
  vi.mocked(store.knowledgeItems.listAll).mockResolvedValue(snapshot.items);
  vi.mocked(store.collections.listAll).mockResolvedValue(snapshot.collections);
  vi.mocked(store.collectionMemberships.listAll).mockResolvedValue(snapshot.memberships);
  const exported: projection.ObsidianProjectionExportResult = {
    items: { processed: 1, succeeded: 0, failed: 1, failures: [] },
    collections: { status: 'failed', error: new Error('retained internally') },
    navigation: { status: 'skipped', reason: 'upstream-failure' },
  };
  const exportSpy = vi.spyOn(projection, 'exportObsidianProjection').mockResolvedValue(exported);
  const result = await importFacebook(input(), store, 'fake-vault');
  expect(exportSpy).toHaveBeenCalledExactlyOnceWith('fake-vault', snapshot);
  expect(result.export).toEqual({ status: 'completed', result: exported });
  expect(result.failure).toBeUndefined();
});

it('retains persistence counters when snapshot reading fails and never starts export', async () => {
  const store = repositories();
  vi.mocked(store.knowledgeItems.listAll).mockRejectedValue(new Error('private'));
  const exportSpy = vi.spyOn(projection, 'exportObsidianProjection');
  const result = await importFacebook(input(), store, 'fake-vault');
  expect(result.failure).toEqual({ stage: 'snapshot', code: 'STORAGE_FAILED' });
  expect(result.items.processed).toBe(2);
  expect(result.memberships.processed).toBe(2);
  expect(result.export).toEqual({ status: 'skipped' });
  expect(exportSpy).not.toHaveBeenCalled();
});

it('converts unexpected export exceptions to a safe failure without losing persistence counters', async () => {
  vi.spyOn(projection, 'exportObsidianProjection').mockRejectedValue(new Error('private metadata'));
  const result = await importFacebook(input(), repositories(), 'fake-vault');
  expect(result.failure).toEqual({ stage: 'export', code: 'EXPORT_FAILED' });
  expect(result.export).toEqual({ status: 'failed' });
  expect(result.items.processed).toBe(2);
  expect(JSON.stringify(result)).not.toContain('private');
});
