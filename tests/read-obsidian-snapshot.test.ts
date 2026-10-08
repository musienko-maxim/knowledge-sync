import { expect, it, vi } from 'vitest';
import { readObsidianSnapshot } from '../src/application/read-obsidian-snapshot.js';
import type { CollectionSyncRepositories } from '../src/application/sync-collection.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import type { CollectionMembership } from '../src/core/models/collection-membership.js';

const items: readonly KnowledgeItem[] = Object.freeze([{ source: 'example', sourceId: 'item', title: 'Item', url: 'https://example.com' }]);
const collections: readonly KnowledgeCollection[] = Object.freeze([{ source: 'example', sourceId: 'collection', title: 'Collection' }]);
const memberships: readonly CollectionMembership[] = Object.freeze([{ source: 'example', collectionSourceId: 'collection', itemSourceId: 'item' }]);

function setup() {
  return {
    knowledgeItems: { upsert: vi.fn(), findByIdentity: vi.fn(), listAll: vi.fn(async () => items) },
    collections: { upsert: vi.fn(), listAll: vi.fn(async () => collections) },
    collectionMemberships: { removeStaleForCollection: vi.fn(), add: vi.fn(), listAll: vi.fn(async () => memberships) },
  } satisfies CollectionSyncRepositories;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

it('awaits each ordered repository read before returning their original readonly arrays', async () => {
  const repositories = setup();
  const itemRead = deferred<readonly KnowledgeItem[]>();
  const collectionRead = deferred<readonly KnowledgeCollection[]>();
  const membershipRead = deferred<readonly CollectionMembership[]>();
  const collectionStarted = deferred<void>();
  const membershipStarted = deferred<void>();
  repositories.knowledgeItems.listAll.mockReturnValue(itemRead.promise);
  repositories.collections.listAll.mockImplementation(() => { collectionStarted.resolve(); return collectionRead.promise; });
  repositories.collectionMemberships.listAll.mockImplementation(() => { membershipStarted.resolve(); return membershipRead.promise; });
  let settled = false;
  const running = readObsidianSnapshot(repositories).then((value) => { settled = true; return value; });
  expect(repositories.knowledgeItems.listAll).toHaveBeenCalledExactlyOnceWith();
  expect(repositories.collections.listAll).not.toHaveBeenCalled();
  expect(repositories.collectionMemberships.listAll).not.toHaveBeenCalled();
  itemRead.resolve(items);
  await collectionStarted.promise;
  expect(repositories.collectionMemberships.listAll).not.toHaveBeenCalled();
  collectionRead.resolve(collections);
  await membershipStarted.promise;
  expect(settled).toBe(false);
  membershipRead.resolve(memberships);
  const snapshot = await running;
  expect(snapshot.items).toBe(items);
  expect(snapshot.collections).toBe(collections);
  expect(snapshot.memberships).toBe(memberships);
});

it.each(['knowledgeItems', 'collections', 'collectionMemberships'] as const)
('propagates a %s read failure and does not start later reads', async (failedRepository) => {
  const repositories = setup();
  repositories[failedRepository].listAll.mockRejectedValue(undefined);
  await expect(readObsidianSnapshot(repositories)).rejects.toBeUndefined();
  const order = ['knowledgeItems', 'collections', 'collectionMemberships'] as const;
  for (const [index, name] of order.entries()) {
    expect(repositories[name].listAll).toHaveBeenCalledTimes(index <= order.indexOf(failedRepository) ? 1 : 0);
  }
});
