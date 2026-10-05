import { expect, it, vi } from 'vitest';
import { sync } from '../src/application/sync.js';
import type { Collector } from '../src/collectors/collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from '../src/storage/knowledge-item-repository.js';

const first: KnowledgeItem = {
  source: 'example', sourceId: 'z', url: 'https://example.com/z', title: 'First',
  description: '', author: 'Author', collection: 'Collection', publishedAt: '2026-01-01T12:00:00+02:00',
};
const second: KnowledgeItem = { ...first, sourceId: 'a', title: 'Second' };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function setup(items: KnowledgeItem[] = [], initial: KnowledgeItem[] = []) {
  const stored = new Map(initial.map((item) => [JSON.stringify([item.source, item.sourceId]), item]));
  return {
    collector: { collect: vi.fn<Collector['collect']>().mockResolvedValue(items) },
    repository: {
      listAll: vi.fn<KnowledgeItemRepository['listAll']>(),
      findByIdentity: vi.fn<KnowledgeItemRepository['findByIdentity']>().mockImplementation(
        async (source, sourceId) => stored.get(JSON.stringify([source, sourceId])) ?? null,
      ),
      upsert: vi.fn<KnowledgeItemRepository['upsert']>().mockImplementation(async (item) => {
        stored.set(JSON.stringify([item.source, item.sourceId]), item);
      }),
    },
  };
}

it('waits for collection, each sequential write, and the final write before returning', async () => {
  const collection = deferred<KnowledgeItem[]>();
  const firstWrite = deferred<void>();
  const secondWrite = deferred<void>();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const { collector, repository } = setup();
  collector.collect.mockReturnValue(collection.promise);
  repository.upsert
    .mockImplementationOnce(() => { firstStarted.resolve(); return firstWrite.promise; })
    .mockImplementationOnce(() => { secondStarted.resolve(); return secondWrite.promise; });

  let completed = false;
  const result = sync(collector, repository).then((value) => { completed = true; return value; });
  await Promise.resolve();
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.upsert).not.toHaveBeenCalled();
  expect(repository.findByIdentity).not.toHaveBeenCalled();
  expect(completed).toBe(false);

  collection.resolve([first, second]);
  await firstStarted.promise;
  await Promise.resolve();
  expect(repository.upsert).toHaveBeenCalledExactlyOnceWith(first);
  expect(repository.findByIdentity).toHaveBeenCalledExactlyOnceWith(first.source, first.sourceId);
  expect(completed).toBe(false);

  firstWrite.resolve();
  await secondStarted.promise;
  await Promise.resolve();
  expect(repository.upsert.mock.calls).toEqual([[first], [second]]);
  expect(completed).toBe(false);

  secondWrite.resolve();
  await expect(result).resolves.toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.findByIdentity.mock.calls).toEqual([[first.source, first.sourceId], [second.source, second.sourceId]]);
});

it('passes every item through unchanged in source order and counts duplicate identities', async () => {
  const items = [Object.freeze({ ...first }), Object.freeze({ ...second }),
    Object.freeze({ ...first, title: 'Last occurrence', collection: undefined })];
  const { collector, repository } = setup(items);
  await expect(sync(collector, repository)).resolves.toEqual({ processed: 3, new: 2, changed: 1, unchanged: 0 });
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.upsert.mock.calls).toEqual(items.map((item) => [item]));
  for (const [index, item] of items.entries()) {
    expect(repository.upsert.mock.calls[index]?.[0]).toBe(item);
  }
  expect(repository.findByIdentity.mock.calls).toEqual(items.map((item) => [item.source, item.sourceId]));
});

it('succeeds with zero processed entries for an empty collection without repository calls', async () => {
  const { collector, repository } = setup();
  await expect(sync(collector, repository)).resolves.toEqual({ processed: 0, new: 0, changed: 0, unchanged: 0 });
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.upsert).not.toHaveBeenCalled();
  expect(repository.findByIdentity).not.toHaveBeenCalled();
});

it('propagates the original collector error without repository calls', async () => {
  const { collector, repository } = setup();
  const error = new Error('Collection failed');
  collector.collect.mockRejectedValue(error);
  await expect(sync(collector, repository)).rejects.toBe(error);
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.upsert).not.toHaveBeenCalled();
  expect(repository.findByIdentity).not.toHaveBeenCalled();
});

it('propagates the original repository error and stops before later entries without retrying', async () => {
  const third = { ...first, sourceId: 'later' };
  const { collector, repository } = setup([first, second, third]);
  const error = new Error('Persistence failed');
  repository.upsert.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
  await expect(sync(collector, repository)).rejects.toBe(error);
  expect(collector.collect).toHaveBeenCalledTimes(1);
  expect(repository.upsert.mock.calls).toEqual([[first], [second]]);
  expect(repository.findByIdentity.mock.calls).toEqual([[first.source, first.sourceId], [second.source, second.sourceId]]);
});

it('awaits each lookup before writing and finishes that write before the next lookup', async () => {
  const lookup = deferred<KnowledgeItem | null>();
  const lookupStarted = deferred<void>();
  const writeStarted = deferred<void>();
  const write = deferred<void>();
  const events: string[] = [];
  const { collector, repository } = setup([first, second]);
  repository.findByIdentity.mockImplementationOnce(() => {
    events.push('find first'); lookupStarted.resolve(); return lookup.promise;
  }).mockImplementationOnce(async () => { events.push('find second'); return null; });
  repository.upsert.mockImplementationOnce(() => {
    events.push('write first'); writeStarted.resolve(); return write.promise;
  }).mockImplementationOnce(async () => { events.push('write second'); });
  const result = sync(collector, repository);
  await lookupStarted.promise;
  expect(events).toEqual(['find first']);
  expect(repository.upsert).not.toHaveBeenCalled();
  lookup.resolve({ ...first });
  await writeStarted.promise;
  expect(events).toEqual(['find first', 'write first']);
  write.resolve();
  await expect(result).resolves.toEqual({ processed: 2, new: 1, changed: 0, unchanged: 1 });
  expect(events).toEqual(['find first', 'write first', 'find second', 'write second']);
});

it('classifies a mixed batch and still writes independently constructed unchanged items', async () => {
  const changed = { ...second, title: 'Updated' };
  const newItem = { ...first, source: 'other-source' };
  const items = [{ ...first }, changed, newItem];
  const { collector, repository } = setup(items, [first, second]);
  const result = await sync(collector, repository);
  expect(result).toEqual({ processed: 3, new: 1, changed: 1, unchanged: 1 });
  expect(result.processed).toBe(result.new + result.changed + result.unchanged);
  expect(repository.upsert.mock.calls).toEqual(items.map((item) => [item]));
});

it.each([
  { url: 'https://example.com/updated' },
  { title: 'Updated title' },
  { description: 'Updated description' },
  { author: 'Updated author' },
  { collection: 'Updated collection' },
  { publishedAt: '2026-02-01T12:00:00+02:00' },
  // Same instant, different persisted representations must still count as changed.
  { publishedAt: '2026-01-01T10:00:00Z' },
  { publishedAt: '2026-01-01T12:00:00.000+02:00' },
])('detects persisted field changes: %j', async (update) => {
  const incoming = { ...first, ...update };
  const { collector, repository } = setup([incoming], [first]);
  await expect(sync(collector, repository)).resolves.toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  expect(repository.upsert).toHaveBeenCalledExactlyOnceWith(incoming);
});

it.each(['description', 'author', 'collection', 'publishedAt'] as const)(
  'handles absence, explicit undefined, addition and removal for %s', async (field) => {
    const absent = { ...first };
    delete absent[field];
    const explicit = { ...absent, [field]: undefined };
    const { collector, repository } = setup([absent, explicit, first, absent], [explicit]);
    await expect(sync(collector, repository)).resolves.toEqual({ processed: 4, new: 0, changed: 2, unchanged: 2 });
    expect(repository.upsert.mock.calls).toEqual([[absent], [explicit], [first], [absent]]);
  },
);

it.each(['description', 'author', 'collection'] as const)('distinguishes empty %s from absence', async (field) => {
  const absent = { ...first };
  delete absent[field];
  const empty = { ...absent, [field]: '' };
  const { collector, repository } = setup([empty, { ...empty }, absent], [absent]);
  await expect(sync(collector, repository)).resolves.toEqual({ processed: 3, new: 0, changed: 2, unchanged: 1 });
  expect(repository.upsert).toHaveBeenCalledTimes(3);
});

it('stops on the original lookup failure without writing that item or processing later entries', async () => {
  const error = new Error('Lookup failed');
  const { collector, repository } = setup([first, second, { ...first, sourceId: 'later' }]);
  repository.findByIdentity.mockResolvedValueOnce(null).mockRejectedValueOnce(error);
  await expect(sync(collector, repository)).rejects.toBe(error);
  expect(repository.upsert).toHaveBeenCalledExactlyOnceWith(first);
  expect(repository.findByIdentity.mock.calls).toEqual([[first.source, first.sourceId], [second.source, second.sourceId]]);
});
