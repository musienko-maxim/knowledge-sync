import { describe, expect, it, vi } from 'vitest';
import { syncCollection, type CollectionSyncRepositories } from '../src/application/sync-collection.js';
import type { CollectedCollection, CollectionCollector } from '../src/collectors/collection-collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';

const collection = Object.freeze({ source: 'example', sourceId: 'collection-a', title: 'Collection A' });
const first: KnowledgeItem = Object.freeze({ source: 'example', sourceId: 'one', title: 'One', url: 'https://example.com/one' });
const second: KnowledgeItem = Object.freeze({ ...first, sourceId: 'two' });

function setup(items: KnowledgeItem[] = [first, second]) {
  const persisted = new Map<string, KnowledgeItem>();
  const collector = {
    collectCollection: vi.fn<CollectionCollector['collectCollection']>().mockResolvedValue({ collection, items }),
  };
  const repositories = {
    knowledgeItems: {
      findByIdentity: vi.fn(async (_source: string, sourceId: string) => persisted.get(sourceId) ?? null),
      upsert: vi.fn(async (item: KnowledgeItem) => { persisted.set(item.sourceId, item); }),
      listAll: vi.fn(async () => [...persisted.values()]),
    },
    collections: { upsert: vi.fn<CollectionSyncRepositories['collections']['upsert']>().mockResolvedValue(), listAll: vi.fn() },
    collectionMemberships: {
      add: vi.fn<CollectionSyncRepositories['collectionMemberships']['add']>().mockResolvedValue(),
      listAll: vi.fn(),
      removeStaleForCollection: vi.fn<CollectionSyncRepositories['collectionMemberships']['removeStaleForCollection']>().mockResolvedValue(0),
    },
  } satisfies CollectionSyncRepositories;
  return { collector, repositories, persisted };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe('syncCollection', () => {
  it('persists metadata, items, and memberships, retaining entry-based classification', async () => {
    const { collector, repositories } = setup([first, first, { ...first, title: 'Updated' }, second]);
    repositories.collectionMemberships.removeStaleForCollection.mockResolvedValue(3);
    expect(await syncCollection(collector, repositories)).toEqual({ processed: 4, new: 2, unchanged: 1, changed: 1, membershipsRemoved: 3 });
    expect(collector.collectCollection).toHaveBeenCalledExactlyOnceWith();
    expect(repositories.collections.upsert).toHaveBeenCalledExactlyOnceWith(collection);
    expect(repositories.collectionMemberships.add.mock.calls).toEqual(['one', 'one', 'one', 'two'].map((itemSourceId) => [{
      source: 'example', collectionSourceId: 'collection-a', itemSourceId,
    }]));
    expect(repositories.knowledgeItems.listAll).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.removeStaleForCollection).toHaveBeenCalledExactlyOnceWith(
      { source: collection.source, sourceId: collection.sourceId },
      [{ source: first.source, sourceId: first.sourceId }, { source: second.source, sourceId: second.sourceId }],
    );
  });

  it('persists an empty collection and reconciles against an empty desired membership set', async () => {
    const { collector, repositories } = setup([]);
    repositories.collectionMemberships.removeStaleForCollection.mockResolvedValue(2);
    expect(await syncCollection(collector, repositories)).toEqual({ processed: 0, new: 0, changed: 0, unchanged: 0, membershipsRemoved: 2 });
    expect(repositories.collections.upsert).toHaveBeenCalledExactlyOnceWith(collection);
    expect(repositories.knowledgeItems.findByIdentity).not.toHaveBeenCalled();
    expect(repositories.knowledgeItems.upsert).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.removeStaleForCollection).toHaveBeenCalledExactlyOnceWith(
      { source: collection.source, sourceId: collection.sourceId }, [],
    );
  });

  it('awaits complete collection, collection persistence, each item, and every membership before success', async () => {
    const { collector, repositories } = setup([first]);
    const collected = deferred<CollectedCollection>();
    const savedCollection = deferred<void>();
    const savedItem = deferred<void>();
    const savedMembership = deferred<void>();
    const reconciled = deferred<number>();
    const reconciliationStarted = deferred<void>();
    const collectionStarted = deferred<void>();
    const itemStarted = deferred<void>();
    const membershipStarted = deferred<void>();
    collector.collectCollection.mockReturnValue(collected.promise);
    repositories.collections.upsert.mockImplementation(() => { collectionStarted.resolve(); return savedCollection.promise; });
    repositories.knowledgeItems.upsert.mockImplementation(() => { itemStarted.resolve(); return savedItem.promise; });
    repositories.collectionMemberships.add.mockImplementation(() => { membershipStarted.resolve(); return savedMembership.promise; });
    repositories.collectionMemberships.removeStaleForCollection.mockImplementation(() => {
      reconciliationStarted.resolve(); return reconciled.promise;
    });
    let settled = false;
    const running = syncCollection(collector, repositories).then((result) => { settled = true; return result; });
    expect(repositories.collections.upsert).not.toHaveBeenCalled();
    collected.resolve({ collection, items: [first] });
    await collectionStarted.promise;
    expect(repositories.knowledgeItems.findByIdentity).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
    savedCollection.resolve();
    await itemStarted.promise;
    expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
    savedItem.resolve();
    await membershipStarted.promise;
    expect(settled).toBe(false);
    expect(repositories.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
    savedMembership.resolve();
    await reconciliationStarted.promise;
    expect(settled).toBe(false);
    reconciled.resolve(2);
    expect(await running).toEqual({ processed: 1, new: 1, changed: 0, unchanged: 0, membershipsRemoved: 2 });
  });

  it('waits for one membership before looking up or writing the next entry', async () => {
    const { collector, repositories } = setup();
    const savedMembership = deferred<void>();
    const membershipStarted = deferred<void>();
    repositories.collectionMemberships.add.mockImplementationOnce(() => {
      membershipStarted.resolve(); return savedMembership.promise;
    });
    const running = syncCollection(collector, repositories);
    await membershipStarted.promise;
    expect(repositories.knowledgeItems.findByIdentity).toHaveBeenCalledExactlyOnceWith(first.source, first.sourceId);
    expect(repositories.knowledgeItems.upsert).toHaveBeenCalledExactlyOnceWith(first);
    savedMembership.resolve();
    expect(await running).toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0, membershipsRemoved: 0 });
  });

  it('rejects a later cross-source item before any persistence', async () => {
    const { collector, repositories } = setup([first, { ...second, source: 'other' }]);
    await expect(syncCollection(collector, repositories)).rejects.toThrow('same source');
    expect(repositories.collections.upsert).not.toHaveBeenCalled();
    expect(repositories.knowledgeItems.findByIdentity).not.toHaveBeenCalled();
    expect(repositories.knowledgeItems.upsert).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.add).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
  });

  it('uses collection identity rather than legacy item collection text for memberships', async () => {
    const { collector, repositories } = setup([{ ...first, collection: 'Unrelated legacy title' }]);
    await syncCollection(collector, repositories);
    expect(repositories.collectionMemberships.add).toHaveBeenCalledExactlyOnceWith({
      source: 'example', collectionSourceId: 'collection-a', itemSourceId: 'one',
    });
    expect(repositories.collectionMemberships.removeStaleForCollection).toHaveBeenCalledExactlyOnceWith(
      { source: 'example', sourceId: 'collection-a' }, [{ source: 'example', sourceId: 'one' }],
    );
  });

  for (const phase of ['collect', 'collection', 'lookup', 'item', 'membership'] as const) {
    it.each([new Error('injected failure'), { reason: 'failure' }, undefined])
    (`propagates the original ${phase} failure and stops later operations (%j)`, async (error) => {
      const { collector, repositories, persisted } = setup();
      if (phase === 'collect') collector.collectCollection.mockRejectedValue(error);
      if (phase === 'collection') repositories.collections.upsert.mockRejectedValue(error);
      if (phase === 'lookup') repositories.knowledgeItems.findByIdentity.mockRejectedValue(error);
      if (phase === 'item') repositories.knowledgeItems.upsert.mockRejectedValue(error);
      if (phase === 'membership') repositories.collectionMemberships.add.mockRejectedValue(error);
      await expect(syncCollection(collector, repositories)).rejects.toBe(error);
      expect(repositories.collections.upsert).toHaveBeenCalledTimes(phase === 'collect' ? 0 : 1);
      expect(repositories.knowledgeItems.findByIdentity).toHaveBeenCalledTimes(['collect', 'collection'].includes(phase) ? 0 : 1);
      expect(repositories.knowledgeItems.upsert).toHaveBeenCalledTimes(['item', 'membership'].includes(phase) ? 1 : 0);
      expect(repositories.collectionMemberships.add).toHaveBeenCalledTimes(phase === 'membership' ? 1 : 0);
      expect([...persisted.values()]).toEqual(phase === 'membership' ? [first] : []);
      expect(repositories.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
    });
  }

  it.each(['lookup', 'item', 'membership'] as const)
  ('preserves earlier successful writes after a later %s failure', async (phase) => {
    const { collector, repositories, persisted } = setup([first, second, { ...first, sourceId: 'three' }]);
    const error = new Error('second entry failure');
    if (phase === 'lookup') repositories.knowledgeItems.findByIdentity.mockResolvedValueOnce(null).mockRejectedValueOnce(error);
    if (phase === 'item') repositories.knowledgeItems.upsert.mockImplementationOnce(async (item) => { persisted.set(item.sourceId, item); })
      .mockRejectedValueOnce(error);
    if (phase === 'membership') repositories.collectionMemberships.add.mockResolvedValueOnce().mockRejectedValueOnce(error);
    await expect(syncCollection(collector, repositories)).rejects.toBe(error);
    expect([...persisted.values()]).toEqual(phase === 'membership' ? [first, second] : [first]);
    expect(repositories.knowledgeItems.findByIdentity).toHaveBeenCalledTimes(2);
    expect(repositories.collectionMemberships.removeStaleForCollection).not.toHaveBeenCalled();
    expect(repositories.collectionMemberships.add.mock.calls[0]).toEqual([{
      source: 'example', collectionSourceId: 'collection-a', itemSourceId: 'one',
    }]);
  });

  it.each([new Error('removal failure'), { reason: 'removal failure' }, undefined])
  ('propagates the original reconciliation failure after retaining additive writes (%j)', async (error) => {
    const { collector, repositories, persisted } = setup();
    repositories.collectionMemberships.removeStaleForCollection.mockRejectedValue(error);
    await expect(syncCollection(collector, repositories)).rejects.toBe(error);
    expect([...persisted.values()]).toEqual([first, second]);
    expect(repositories.collectionMemberships.add).toHaveBeenCalledTimes(2);
    expect(repositories.collectionMemberships.removeStaleForCollection).toHaveBeenCalledTimes(1);
  });
});
