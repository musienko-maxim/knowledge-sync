import { beforeEach, expect, it, vi } from 'vitest';
import type { ObsidianProjectionSnapshot } from '../src/outputs/obsidian/collection-projection.js';
import { exportObsidianCollections } from '../src/outputs/obsidian/export-collections.js';
import { exportObsidianNotes } from '../src/outputs/obsidian/export-notes.js';
import { exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';
import { renderNavigationMarkdown } from '../src/outputs/obsidian/navigation-markdown.js';
import { writeNavigationNote } from '../src/outputs/obsidian/write-navigation.js';

vi.mock('../src/outputs/obsidian/export-notes.js', () => ({ exportObsidianNotes: vi.fn() }));
vi.mock('../src/outputs/obsidian/export-collections.js', () => ({ exportObsidianCollections: vi.fn() }));
vi.mock('../src/outputs/obsidian/navigation-markdown.js', () => ({ renderNavigationMarkdown: vi.fn() }));
vi.mock('../src/outputs/obsidian/write-navigation.js', () => ({ writeNavigationNote: vi.fn() }));
const renderNavigation = vi.mocked(renderNavigationMarkdown);
const writeNavigation = vi.mocked(writeNavigationNote);
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
  renderNavigation.mockReset().mockReturnValue('complete navigation');
  writeNavigation.mockReset().mockResolvedValue(undefined);
});

it('attempts collections after a normally completed item batch containing failures', async () => {
  const result = await exportObsidianProjection(' vault ', snapshot);
  expect(result.items).toBe(itemResult);
  expect(result.collections).toEqual({ status: 'completed', result: collectionResult });
  expect(exportItems).toHaveBeenCalledExactlyOnceWith(' vault ', snapshot.items);
  expect(exportCollections).toHaveBeenCalledExactlyOnceWith(' vault ', [{ collection, items: [item] }]);
  expect(result.navigation).toEqual({ status: 'completed' });
  expect(renderNavigation).toHaveBeenCalledExactlyOnceWith(snapshot);
  expect(writeNavigation).toHaveBeenCalledExactlyOnceWith(' vault ', 'complete navigation');
});

it.each([new Error('batch failed'), undefined])('propagates unexpected item-batch exception and skips collections (%j)', async (error) => {
  exportItems.mockRejectedValue(error);
  await expect(exportObsidianProjection('vault', snapshot)).rejects.toBe(error);
  expect(exportCollections).not.toHaveBeenCalled();
  expect(renderNavigation).not.toHaveBeenCalled();
  expect(writeNavigation).not.toHaveBeenCalled();
});

it.each([new Error('batch failed'), undefined])('retains item result and tags unexpected collection-batch exception (%j)', async (error) => {
  exportCollections.mockRejectedValue(error);
  const result = await exportObsidianProjection('vault', snapshot);
  expect(result.items).toBe(itemResult);
  expect(result.collections).toEqual({ status: 'failed', error });
  if (result.collections.status === 'failed') expect(result.collections.error).toBe(error);
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
  expect(renderNavigation).not.toHaveBeenCalled();
  expect(writeNavigation).not.toHaveBeenCalled();
});

it.each([
  { ...snapshot, items: [item, item] }, { ...snapshot, collections: [collection, collection] },
  { ...snapshot, memberships: [edge, edge] }, { ...snapshot, items: [] }, { ...snapshot, collections: [] },
])('rejects malformed complete snapshot before any output (%j)', async (malformed) => {
  await expect(exportObsidianProjection('vault', malformed)).rejects.toThrow(/Projection/);
  expect(exportItems).not.toHaveBeenCalled();
  expect(exportCollections).not.toHaveBeenCalled();
  expect(renderNavigation).not.toHaveBeenCalled();
  expect(writeNavigation).not.toHaveBeenCalled();
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

it('awaits the collection batch and navigation writer before completing', async () => {
  let finishCollections!: (result: typeof collectionResult) => void;
  let finishNavigation!: () => void;
  let navigationStarted!: () => void;
  const started = new Promise<void>((resolve) => { navigationStarted = resolve; });
  exportCollections.mockReturnValue(new Promise((resolve) => { finishCollections = resolve; }));
  writeNavigation.mockImplementation(() => {
    navigationStarted();
    return new Promise<void>((resolve) => { finishNavigation = resolve; });
  });
  let settled = false;
  const running = exportObsidianProjection('vault', snapshot).then((result) => { settled = true; return result; });
  await vi.waitFor(() => expect(exportCollections).toHaveBeenCalledTimes(1));
  expect(renderNavigation).not.toHaveBeenCalled();
  finishCollections(collectionResult);
  await started;
  expect(settled).toBe(false);
  finishNavigation();
  expect((await running).navigation).toEqual({ status: 'completed' });
});

it('attempts navigation after ordinary failures in both note batches', async () => {
  const failedCollections = { processed: 1, succeeded: 0, failed: 1,
    failures: [{ index: 0, collection, error: undefined }] };
  exportCollections.mockResolvedValue(failedCollections);
  const result = await exportObsidianProjection('vault', snapshot);
  expect(result).toEqual({ items: itemResult, collections: { status: 'completed', result: failedCollections },
    navigation: { status: 'completed' } });
  expect(writeNavigation).toHaveBeenCalledTimes(1);
});

for (const stage of ['render', 'write'] as const) {
  it.each([new Error('navigation failure'), { detail: 'failure' }, undefined])
  (`retains both batch results and the exact ${stage} failure (%j)`, async (error) => {
    if (stage === 'render') renderNavigation.mockImplementation(() => { throw error; });
    else writeNavigation.mockRejectedValue(error);
    const result = await exportObsidianProjection('vault', snapshot);
    expect(result).toEqual({ items: itemResult, collections: { status: 'completed', result: collectionResult },
      navigation: { status: 'failed', stage, error } });
    if (result.navigation.status === 'failed') expect(result.navigation.error).toBe(error);
    expect(writeNavigation).toHaveBeenCalledTimes(stage === 'render' ? 0 : 1);
  });
}

it('skips navigation entirely for an empty valid snapshot', async () => {
  const empty = { items: [], collections: [], memberships: [] };
  const zero = { processed: 0, succeeded: 0, failed: 0, failures: [] };
  exportItems.mockResolvedValue(zero);
  exportCollections.mockResolvedValue(zero);
  expect(await exportObsidianProjection('missing vault', empty)).toEqual({ items: zero,
    collections: { status: 'completed', result: zero },
    navigation: { status: 'skipped', reason: 'empty-snapshot' } });
  expect(renderNavigation).not.toHaveBeenCalled();
  expect(writeNavigation).not.toHaveBeenCalled();
});
