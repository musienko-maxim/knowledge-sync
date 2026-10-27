import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CollectionProjection } from '../src/outputs/obsidian/collection-projection.js';
import { exportObsidianCollections } from '../src/outputs/obsidian/export-collections.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { encodeMarkdownDestination } from '../src/outputs/obsidian/markdown-link.js';
import * as writer from '../src/outputs/obsidian/write-generated-note.js';

vi.mock('../src/outputs/obsidian/write-generated-note.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/outputs/obsidian/write-generated-note.js')>(),
}));

let directory: string;
let vault: string;
const item = Object.freeze({ source: 'example', sourceId: 'saved', title: 'Збережене', url: 'https://example.com/saved' });
const projections: readonly CollectionProjection[] = Object.freeze(['B', 'A', 'C'].map((sourceId) => Object.freeze({
  collection: Object.freeze({ source: 'example', sourceId, title: sourceId }), items: Object.freeze([item]),
})));

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ks-collection-batch-'));
  vault = join(directory, 'vault');
  await mkdir(vault);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('ks-collection-batch-')) throw new Error('Unexpected cleanup path.');
  await rm(cleanup, { recursive: true, force: true });
});

it('returns empty results without touching even an invalid vault', async () => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  expect(await exportObsidianCollections('\0', [])).toEqual({ processed: 0, succeeded: 0, failed: 0, failures: [] });
  expect(write).not.toHaveBeenCalled();
});

it('shares readable membership destinations while publishing collections only', async () => {
  const before = JSON.stringify(projections);
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  expect(await exportObsidianCollections(vault, projections)).toEqual({ processed: 3, succeeded: 3, failed: 0, failures: [] });
  expect(write.mock.calls.map((call) => [call[3], call[4].sourceId])).toEqual([['collection', 'A'], ['collection', 'B'], ['collection', 'C']]);
  expect(JSON.stringify(projections)).toBe(before);
  expect(await readdir(vault)).toEqual(['example']);
  expect(await readdir(join(vault, 'example'))).toEqual(['collections']);
  for (const projection of projections) {
    const bytes = await readFile(join(vault, buildObsidianCollectionRelativePath(projection.collection)), 'utf8');
    expect(bytes).toContain(encodeMarkdownDestination('../' + basename(buildObsidianRelativePath(item))));
  }
  const paths = projections.map((projection) => join(vault, buildObsidianCollectionRelativePath(projection.collection)));
  const first = await Promise.all(paths.map((path) => readFile(path)));
  await exportObsidianCollections(vault, [...projections].reverse());
  expect(await Promise.all(paths.map((path) => readFile(path)))).toEqual(first);
});

it.each(['conflicting-item', 'duplicate-edge', 'duplicate-collection', 'wrong-source'])
('rejects %s before writing collections', async (mode) => {
  let invalid: readonly CollectionProjection[];
  if (mode === 'conflicting-item') invalid = [projections[0]!, { ...projections[1]!, items: [{ ...item, title: 'Other title' }] }];
  else if (mode === 'duplicate-edge') invalid = [{ ...projections[0]!, items: [item, item] }];
  else if (mode === 'duplicate-collection') invalid = [projections[0]!, projections[0]!];
  else invalid = [{ ...projections[0]!, items: [{ ...item, source: 'other' }] }];
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  await expect(exportObsidianCollections(vault, invalid)).rejects.toThrow(/Projection/);
  expect(write).not.toHaveBeenCalled();
  expect(await readdir(vault)).toEqual([]);
});

it('preflights a later collection before publishing any earlier collection', async () => {
  const target = join(vault, buildObsidianCollectionRelativePath(projections[0]!.collection));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, 'Personal collection\n');
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  await expect(exportObsidianCollections(vault, projections)).rejects.toMatchObject({
    conflicts: [{ index: 1, kind: 'collection', code: 'unowned-target' }],
  });
  expect(write).not.toHaveBeenCalled();
  expect(await readdir(dirname(target))).toEqual([basename(target)]);
  expect(await readFile(target, 'utf8')).toBe('Personal collection\n');
});

it.each([new Error('write failed'), undefined, null, { code: 'TEST' }])
('continues within the collection phase and retains planned identities/errors (%j)', async (error) => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote')
    .mockRejectedValueOnce(error).mockResolvedValueOnce().mockRejectedValueOnce(error);
  const result = await exportObsidianCollections(vault, projections);
  expect(result).toEqual({ processed: 3, succeeded: 1, failed: 2, failures: [
    { index: 0, collection: projections[1]!.collection, error },
    { index: 2, collection: projections[2]!.collection, error },
  ] });
  expect(result.failures[0]!.error).toBe(error);
  expect(write.mock.calls.every((call) => call[3] === 'collection')).toBe(true);
  expect(await readdir(vault)).toEqual([]);
});

it('awaits collection writes and the final settlement sequentially', async () => {
  let finishFirst!: () => void, finishLast!: () => void, firstStarted!: () => void, lastStarted!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const last = new Promise<void>((resolve) => { finishLast = resolve; });
  const startedFirst = new Promise<void>((resolve) => { firstStarted = resolve; });
  const startedLast = new Promise<void>((resolve) => { lastStarted = resolve; });
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote')
    .mockImplementationOnce(() => { firstStarted(); return first; })
    .mockImplementationOnce(() => { lastStarted(); return last; });
  let settled = false;
  const running = exportObsidianCollections(vault, projections.slice(0, 2)).then((result) => { settled = true; return result; });
  await startedFirst;
  expect(write).toHaveBeenCalledTimes(1);
  finishFirst();
  await startedLast;
  expect(write).toHaveBeenCalledTimes(2);
  expect(settled).toBe(false);
  finishLast();
  expect(await running).toEqual({ processed: 2, succeeded: 2, failed: 0, failures: [] });
});
