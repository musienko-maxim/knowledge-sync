import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { sync } from '../src/application/sync.js';
import type { Collector } from '../src/collectors/collector.js';
import type { YouTubeClient } from '../src/collectors/youtube/youtube-client.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import type { KnowledgeItemRepository } from '../src/storage/knowledge-item-repository.js';
import { openStorage } from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

const stores: Storage[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function open(path = ':memory:') {
  const store = openStorage(path);
  stores.push(store);
  return store;
}

function collector(items: KnowledgeItem[]): Collector {
  return { async collect() { return items; } };
}

const first: KnowledgeItem = {
  source: 'youtube', sourceId: 'videoA', url: 'https://example.com/videoA', title: 'First title',
  description: 'Description', author: 'Author', collection: 'First playlist',
  publishedAt: '2026-01-01T12:34:56.123+02:00',
};

it('counts duplicate entries while repeated runs preserve one row per composite identity', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-orchestration-'));
  directories.push(directory);
  const path = join(directory, 'items.sqlite');
  const store = open(path);
  const last = { ...first, title: 'Last occurrence', description: 'Last description' };
  const otherSource = { ...first, source: 'example', title: 'Other source' };
  const input = collector([first, otherSource, last]);

  const expectedResults = [
    { processed: 3, new: 2, changed: 1, unchanged: 0 },
    { processed: 3, new: 0, changed: 2, unchanged: 1 },
  ];
  for (const expected of expectedResults) {
    expect(await sync(input, store.knowledgeItems)).toEqual(expected);
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(last);
    expect(await store.knowledgeItems.findByIdentity(otherSource.source, otherSource.sourceId))
      .toStrictEqual(otherSource);
  }

  const raw = new Database(path, { readonly: true });
  try {
    expect(raw.prepare('SELECT source, source_id, COUNT(*) AS count FROM knowledge_items GROUP BY source, source_id ORDER BY source').all())
      .toEqual([
        { source: 'example', source_id: first.sourceId, count: 1 },
        { source: 'youtube', source_id: first.sourceId, count: 1 },
      ]);
    expect(raw.prepare('SELECT COUNT(*) AS count FROM imported_items').get()).toEqual({ count: 0 });
  } finally { raw.close(); }
});

it('classifies new, unchanged, then changed state across successive syncs against temporary SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-classification-'));
  directories.push(directory);
  const store = open(join(directory, 'items.sqlite'));
  const changed = { ...first, title: 'Changed title' };
  const upsert = vi.spyOn(store.knowledgeItems, 'upsert');

  expect(await sync(collector([first]), store.knowledgeItems))
    .toEqual({ processed: 1, new: 1, changed: 0, unchanged: 0 });
  expect(await sync(collector([{ ...first }]), store.knowledgeItems))
    .toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
  expect(await sync(collector([changed]), store.knowledgeItems))
    .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });

  expect(upsert.mock.calls).toEqual([[first], [first], [changed]]);
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(changed);
  expect(store.getImported(first)).toBeUndefined();
});

it('classifies identical duplicates against earlier writes for both new and existing identities', async () => {
  const store = open();
  const changed = { ...first, title: 'Changed title' };
  const upsert = vi.spyOn(store.knowledgeItems, 'upsert');

  expect(await sync(collector([first, { ...first }]), store.knowledgeItems))
    .toEqual({ processed: 2, new: 1, changed: 0, unchanged: 1 });
  expect(await sync(collector([changed, { ...changed }]), store.knowledgeItems))
    .toEqual({ processed: 2, new: 0, changed: 1, unchanged: 1 });

  expect(upsert.mock.calls).toEqual([[first], [first], [changed], [changed]]);
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(changed);
});

it.each(['description', 'author', 'collection', 'publishedAt'] as const)(
  'normalizes omitted and undefined %s while detecting addition and clearing through SQLite',
  async (field) => {
    const store = open();
    const requiredOnly: KnowledgeItem = {
      source: first.source, sourceId: first.sourceId, url: first.url, title: first.title,
    };
    const explicitUndefined = { ...requiredOnly, [field]: undefined };
    const withValue = { ...requiredOnly, [field]: first[field] };

    expect(await sync(collector([requiredOnly]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 1, changed: 0, unchanged: 0 });
    expect(await sync(collector([explicitUndefined]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId))
      .toStrictEqual(requiredOnly);
    expect(await sync(collector([withValue]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId))
      .toStrictEqual(withValue);
    expect(await sync(collector([explicitUndefined]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId))
      .toStrictEqual(requiredOnly);
    expect(await sync(collector([requiredOnly]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
  },
);

it.each(['description', 'author', 'collection'] as const)(
  'keeps empty %s distinct from absence after SQLite round trips',
  async (field) => {
    const store = open();
    const requiredOnly: KnowledgeItem = {
      source: first.source, sourceId: first.sourceId, url: first.url, title: first.title,
    };
    const empty = { ...requiredOnly, [field]: '' };
    await sync(collector([requiredOnly]), store.knowledgeItems);
    expect(await sync(collector([empty]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(empty);
    expect(await sync(collector([{ ...empty }]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 0, unchanged: 1 });
    expect(await sync(collector([requiredOnly]), store.knowledgeItems))
      .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
    expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId))
      .toStrictEqual(requiredOnly);
  },
);

it('updates and clears metadata, retains absent items, and preserves independent import state', async () => {
  const store = open();
  const absentLater = { ...first, sourceId: 'videoB', title: 'Retained video' };
  const imported = {
    source: first.source, sourceId: first.sourceId, url: first.url,
    importedAt: new Date('2026-01-02T00:00:00.123Z'),
  };
  store.recordImport(imported);
  expect(await sync(collector([first, absentLater]), store.knowledgeItems))
    .toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });

  const updated = {
    ...first, url: 'https://example.com/updated', title: 'Updated title',
    description: 'Updated description', author: 'Updated author', collection: 'Second playlist',
    publishedAt: '2026-02-01T10:00:00Z',
  };
  expect(await sync(collector([updated]), store.knowledgeItems))
    .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(updated);
  expect(store.getImported(first)).toStrictEqual(imported);

  const requiredOnly: KnowledgeItem = {
    source: first.source, sourceId: first.sourceId, url: updated.url, title: updated.title,
  };
  expect(await sync(collector([requiredOnly]), store.knowledgeItems))
    .toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(requiredOnly);
  expect(await store.knowledgeItems.findByIdentity(absentLater.source, absentLater.sourceId))
    .toStrictEqual(absentLater);
  expect(store.getImported(first)).toStrictEqual(imported);
  expect(store.getImported(absentLater)).toBeUndefined();
});

it('keeps successful SQLite writes when a later repository call rejects and stops subsequent writes', async () => {
  const store = open();
  const failing = { ...first, sourceId: 'videoB' };
  const later = { ...first, sourceId: 'videoC' };
  const error = new Error('Injected persistence failure');
  const upsert = vi.fn<KnowledgeItemRepository['upsert']>().mockImplementation(async (item) => {
    if (item.sourceId === failing.sourceId) throw error;
    await store.knowledgeItems.upsert(item);
  });
  const repository: KnowledgeItemRepository = {
    listAll: vi.fn(store.knowledgeItems.listAll),
    findByIdentity: vi.fn(store.knowledgeItems.findByIdentity),
    upsert,
  };

  await expect(sync(collector([first, failing, later]), repository)).rejects.toBe(error);
  expect(upsert.mock.calls).toEqual([[first], [failing]]);
  expect(repository.findByIdentity).toHaveBeenCalledTimes(2);
  expect(repository.findByIdentity).not.toHaveBeenCalledWith(later.source, later.sourceId);
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(first);
  expect(await store.knowledgeItems.findByIdentity(later.source, later.sourceId)).toBeNull();
  expect(store.getImported(first)).toBeUndefined();
});

it('preserves earlier SQLite writes after a lookup failure and stops before current and later writes', async () => {
  const store = open();
  const failing = { ...first, sourceId: 'videoB' };
  const later = { ...first, sourceId: 'videoC' };
  const error = new Error('Injected lookup failure');
  const findByIdentity = vi.fn<KnowledgeItemRepository['findByIdentity']>()
    .mockImplementation(async (source, sourceId) => {
      if (sourceId === failing.sourceId) throw error;
      return store.knowledgeItems.findByIdentity(source, sourceId);
    });
  const upsert = vi.fn(store.knowledgeItems.upsert);

  await expect(sync(collector([first, failing, later]), {
    findByIdentity, upsert, listAll: vi.fn(store.knowledgeItems.listAll),
  })).rejects.toBe(error);
  expect(findByIdentity.mock.calls).toEqual([
    [first.source, first.sourceId], [failing.source, failing.sourceId],
  ]);
  expect(upsert.mock.calls).toEqual([[first]]);
  expect(await store.knowledgeItems.findByIdentity(first.source, first.sourceId)).toStrictEqual(first);
  expect(await store.knowledgeItems.findByIdentity(failing.source, failing.sourceId)).toBeNull();
  expect(await store.knowledgeItems.findByIdentity(later.source, later.sourceId)).toBeNull();
  expect(store.getImported(first)).toBeUndefined();
});

it('connects the real YouTube collector and SQLite repository through a mocked paginated client', async () => {
  const store = open();
  const client = {
    getPlaylist: vi.fn<YouTubeClient['getPlaylist']>().mockResolvedValue({ title: 'Learning playlist' }),
    listPlaylistItems: vi.fn<YouTubeClient['listPlaylistItems']>()
      .mockResolvedValueOnce({ items: [{
        snippet: { title: '  First video  ', description: 'Video description', videoOwnerChannelTitle: 'Uploader' },
        contentDetails: { videoId: 'videoA', videoPublishedAt: '2025-01-01T00:00:00Z' },
      }], nextPageToken: 'next-page' })
      .mockResolvedValueOnce({ items: [{
        snippet: { title: 'Second video' }, contentDetails: { videoId: 'videoB' },
      }] }),
  };
  const youtube = new YouTubeCollector(client, 'https://www.youtube.com/playlist?list=PL123');

  expect(await sync(youtube, store.knowledgeItems))
    .toEqual({ processed: 2, new: 2, changed: 0, unchanged: 0 });
  expect(await store.knowledgeItems.findByIdentity('youtube', 'videoA')).toStrictEqual({
    source: 'youtube', sourceId: 'videoA', url: 'https://www.youtube.com/watch?v=videoA',
    title: 'First video', description: 'Video description', author: 'Uploader',
    collection: 'Learning playlist', publishedAt: '2025-01-01T00:00:00Z',
  });
  expect(await store.knowledgeItems.findByIdentity('youtube', 'videoB')).toStrictEqual({
    source: 'youtube', sourceId: 'videoB', url: 'https://www.youtube.com/watch?v=videoB',
    title: 'Second video', collection: 'Learning playlist',
  });
  expect(client.getPlaylist).toHaveBeenCalledExactlyOnceWith('PL123');
  expect(client.listPlaylistItems.mock.calls).toEqual([['PL123', undefined], ['PL123', 'next-page']]);
  expect(store.getImported({ source: 'youtube', sourceId: 'videoA' })).toBeUndefined();
  expect(store.getImported({ source: 'youtube', sourceId: 'videoB' })).toBeUndefined();
});
