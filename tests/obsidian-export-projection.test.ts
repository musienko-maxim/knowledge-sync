import { beforeEach, expect, it, vi } from 'vitest';
import type { ObsidianProjectionSnapshot } from '../src/outputs/obsidian/collection-projection.js';
import { exportObsidianCollections } from '../src/outputs/obsidian/export-collections.js';
import { exportObsidianNotes } from '../src/outputs/obsidian/export-notes.js';
import { exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';

vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-collections.js', () => ({ exportObsidianCollections: vi.fn() }));
const exportItems = vi.mocked(exportObsidianNotes);
const exportCollections = vi.mocked(exportObsidianCollections);
const item = Object.freeze({ source: 'example', sourceId: 'x', title: 'X', url: 'https://example.com/x' });
const collection = Object.freeze({ source: 'example', sourceId: 'a', title: 'A' });
const edge = Object.freeze({ source: 'example', collectionSourceId: 'a', itemSourceId: 'x' });
const snapshot: ObsidianProjectionSnapshot = Object.freeze({ items: Object.freeze([item]),
  collections: Object.freeze([collection]), memberships: Object.freeze([edge]) });
const itemResult = { processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, item, error: undefined }] };
const collectionResult = { processed: 1, succeeded: 1, failed: 0, failures: [] };
beforeEach(() => {
  exportItems.mockReset().mockResolvedValue(itemResult);
  exportCollections.mockReset().mockResolvedValue(collectionResult);
});

it('attempts collections after a normally completed item batch containing failures', async () => {
  const result = await exportObsidianProjection(' vault ', snapshot);
  expect(result.items).toBe(itemResult);
  expect(result.collections).toEqual({ status: 'completed', result: collectionResult });
  expect(exportItems).toHaveBeenCalledExactlyOnceWith(' vault ', snapshot.items);
  expect(exportCollections).toHaveBeenCalledExactlyOnceWith(' vault ', [{ collection, items: [item] }]);
});

it.each([new Error('batch failed'), undefined])('propagates unexpected item-batch exception and skips collections (%j)', async (error) => {
  exportItems.mockRejectedValue(error);
  await expect(exportObsidianProjection('vault', snapshot)).rejects.toBe(error);
  expect(exportCollections).not.toHaveBeenCalled();
});

it.each([new Error('batch failed'), undefined])('retains item result and tags unexpected collection-batch exception (%j)', async (error) => {
  exportCollections.mockRejectedValue(error);
  const result = await exportObsidianProjection('vault', snapshot);
  expect(result.items).toBe(itemResult);
  expect(result.collections).toEqual({ status: 'failed', error });
  if (result.collections.status === 'failed') expect(result.collections.error).toBe(error);
});

it.each([
  { ...snapshot, items: [item, item] }, { ...snapshot, collections: [collection, collection] },
  { ...snapshot, memberships: [edge, edge] }, { ...snapshot, items: [] }, { ...snapshot, collections: [] },
])('rejects malformed complete snapshot before any output (%j)', async (malformed) => {
  await expect(exportObsidianProjection('vault', malformed)).rejects.toThrow(/Projection/);
  expect(exportItems).not.toHaveBeenCalled();
  expect(exportCollections).not.toHaveBeenCalled();
});

it('awaits item batch before starting collection batch', async () => {
  let finish!: (result: typeof itemResult) => void;
  exportItems.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const running = exportObsidianProjection('vault', snapshot);
  expect(exportCollections).not.toHaveBeenCalled();
  finish(itemResult);
  await running;
  expect(exportCollections).toHaveBeenCalledTimes(1);
});
