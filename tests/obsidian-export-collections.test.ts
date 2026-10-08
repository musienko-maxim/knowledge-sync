import { beforeEach, expect, it, vi } from 'vitest';
import type { CollectionProjection } from '../src/outputs/obsidian/collection-projection.js';
import { exportObsidianCollection } from '../src/outputs/obsidian/export-collection.js';
import { exportObsidianCollections } from '../src/outputs/obsidian/export-collections.js';

vi.mock('../src/outputs/obsidian/export-collection.js', () => ({ exportObsidianCollection: vi.fn() }));
const exportOne = vi.mocked(exportObsidianCollection);
const projections: readonly CollectionProjection[] = Object.freeze(['B', 'A', 'C'].map((sourceId) => Object.freeze({
  collection: Object.freeze({ source: 'example', sourceId, title: sourceId }), items: Object.freeze([]),
})));
beforeEach(() => { exportOne.mockReset().mockResolvedValue(); });

it('returns an empty result without touching even an invalid vault', async () => {
  expect(await exportObsidianCollections('\0', [])).toEqual({ processed: 0, succeeded: 0, failed: 0, failures: [] });
  expect(exportOne).not.toHaveBeenCalled();
});

it.each([new Error('write failed'), undefined, null, { code: 'TEST' }])
('continues after individual failures preserving original collection identity/error (%j)', async (error) => {
  exportOne.mockRejectedValueOnce(error).mockResolvedValueOnce().mockRejectedValueOnce(error);
  const result = await exportObsidianCollections(' vault ', projections);
  expect(result).toEqual({ processed: 3, succeeded: 1, failed: 2, failures: [
    { index: 0, collection: projections[0]!.collection, error },
    { index: 2, collection: projections[2]!.collection, error },
  ] });
  expect(result.failures[0]!.collection).toBe(projections[0]!.collection);
  expect(result.failures[0]!.error).toBe(error);
  expect(exportOne.mock.calls).toEqual(projections.map((projection) => [' vault ', projection]));
});

it('awaits every collection and the final settlement sequentially', async () => {
  let finishFirst!: () => void;
  let finishLast!: () => void;
  let lastStarted!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const last = new Promise<void>((resolve) => { finishLast = resolve; });
  const started = new Promise<void>((resolve) => { lastStarted = resolve; });
  exportOne.mockReturnValueOnce(first).mockImplementationOnce(() => { lastStarted(); return last; });
  let settled = false;
  const running = exportObsidianCollections('vault', projections.slice(0, 2)).then((result) => { settled = true; return result; });
  expect(exportOne).toHaveBeenCalledTimes(1);
  finishFirst();
  await started;
  expect(exportOne).toHaveBeenCalledTimes(2);
  expect(settled).toBe(false);
  finishLast();
  expect(await running).toEqual({ processed: 2, succeeded: 2, failed: 0, failures: [] });
});
