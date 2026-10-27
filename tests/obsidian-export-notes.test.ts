import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { exportObsidianNotes } from '../src/outputs/obsidian/export-notes.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import * as writer from '../src/outputs/obsidian/write-generated-note.js';

vi.mock('../src/outputs/obsidian/write-generated-note.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/outputs/obsidian/write-generated-note.js')>(),
}));

let directory: string;
let vault: string;
const itemA: KnowledgeItem = Object.freeze({ source: 'example', sourceId: 'z-last', title: 'Z', url: 'https://example.com/z' });
const itemB: KnowledgeItem = Object.freeze({ source: 'example', sourceId: 'a-first', title: 'A', url: 'https://example.com/a' });
const itemC: KnowledgeItem = Object.freeze({ ...itemA, sourceId: 'middle', title: 'M' });

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((fulfill, fail) => { resolve = fulfill; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ks-item-batch-'));
  vault = join(directory, 'vault');
  await mkdir(vault);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('ks-item-batch-')) throw new Error('Unexpected cleanup path.');
  await rm(cleanup, { recursive: true, force: true });
});

it.each(['', '\0', 'missing/vault'])('keeps empty batches a no-op for vault %j', async (path) => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  expect(await exportObsidianNotes(path, Object.freeze([]))).toEqual({ processed: 0, succeeded: 0, failed: 0, failures: [] });
  expect(write).not.toHaveBeenCalled();
});

it('publishes one readable generated item without navigation or collection output', async () => {
  expect(await exportObsidianNotes(vault, [itemA])).toEqual({ processed: 1, succeeded: 1, failed: 0, failures: [] });
  expect(await readFile(join(vault, buildObsidianRelativePath(itemA)), 'utf8')).toBe(renderKnowledgeItemMarkdown(itemA));
  expect(await readdir(vault)).toEqual(['example']);
  expect(await readdir(join(vault, 'example'))).toEqual([basename(buildObsidianRelativePath(itemA))]);
});

it('publishes a deterministic sorted snapshot without mutating frozen inputs', async () => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  const items = Object.freeze([itemA, itemB, itemC]);
  const before = JSON.stringify(items);
  expect(await exportObsidianNotes(vault, items)).toEqual({ processed: 3, succeeded: 3, failed: 0, failures: [] });
  expect(write.mock.calls.map((call) => call[4].sourceId)).toEqual(['a-first', 'middle', 'z-last']);
  expect(JSON.stringify(items)).toBe(before);
  const bytes = await Promise.all(items.map((item) => readFile(join(vault, buildObsidianRelativePath(item)))));
  await exportObsidianNotes(vault, [...items].reverse());
  expect(await Promise.all(items.map((item) => readFile(join(vault, buildObsidianRelativePath(item)))))).toEqual(bytes);
});

it.each([false, true])('rejects duplicate identities before any write (changed title=%s)', async (changed) => {
  const duplicate = changed ? { ...itemA, title: 'Updated' } : itemA;
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  await expect(exportObsidianNotes(vault, [itemB, itemA, duplicate])).rejects.toThrow(/duplicate item identity/);
  expect(write).not.toHaveBeenCalled();
  expect(await readdir(vault)).toEqual([]);
});

it('preflights every item before publishing an otherwise writable earlier item', async () => {
  const blocked = join(vault, buildObsidianRelativePath(itemA));
  await mkdir(dirname(blocked), { recursive: true });
  await writeFile(blocked, 'Personal content\n');
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  await expect(exportObsidianNotes(vault, [itemB, itemA])).rejects.toMatchObject({
    conflicts: [{ index: 1, kind: 'item', code: 'unowned-target' }],
  });
  expect(write).not.toHaveBeenCalled();
  expect(await readFile(blocked, 'utf8')).toBe('Personal content\n');
  await expect(readFile(join(vault, buildObsidianRelativePath(itemB)))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects an invalid vault globally instead of recording fictitious per-item write attempts', async () => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote');
  await expect(exportObsidianNotes('', [itemA, itemB])).rejects.toMatchObject({ code: 'missing-vault' });
  expect(write).not.toHaveBeenCalled();
});

it.each(['failure', 123, { code: 'TEST' }, null, undefined])('retains write failures and continues the current item phase (%j)', async (error) => {
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote').mockRejectedValueOnce(error);
  const result = await exportObsidianNotes(vault, [itemA, itemB]);
  expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1, failures: [{ index: 0, item: itemB, error }] });
  expect(result.failures[0]!.error).toBe(error);
  expect(write).toHaveBeenCalledTimes(2);
  expect(await readFile(join(vault, buildObsidianRelativePath(itemA)), 'utf8')).toBe(renderKnowledgeItemMarkdown(itemA));
  expect(await readdir(vault)).not.toContain('Knowledge Sync.md');
});

it('retains multiple failures in planned order with valid counts', async () => {
  const errors = [new Error('first'), new Error('last')];
  vi.spyOn(writer, 'writeGeneratedObsidianNote').mockRejectedValueOnce(errors[0]).mockResolvedValueOnce().mockRejectedValueOnce(errors[1]);
  const result = await exportObsidianNotes(vault, [itemA, itemB, itemC]);
  expect(result).toEqual({ processed: 3, succeeded: 1, failed: 2,
    failures: [{ index: 0, item: itemB, error: errors[0] }, { index: 2, item: itemA, error: errors[1] }] });
});

it.each([false, true])('awaits sequential writes and final settlement (first rejects=%s)', async (firstRejects) => {
  const first = deferred(), last = deferred(), firstStarted = deferred(), lastStarted = deferred();
  const write = vi.spyOn(writer, 'writeGeneratedObsidianNote')
    .mockImplementationOnce(() => { firstStarted.resolve(); return first.promise; })
    .mockImplementationOnce(() => { lastStarted.resolve(); return last.promise; });
  let settled = false;
  const batch = exportObsidianNotes(vault, [itemA, itemB]).then((result) => { settled = true; return result; });
  await firstStarted.promise;
  expect(write).toHaveBeenCalledTimes(1);
  expect(settled).toBe(false);
  if (firstRejects) first.reject(undefined); else first.resolve();
  await lastStarted.promise;
  expect(write).toHaveBeenCalledTimes(2);
  expect(settled).toBe(false);
  last.resolve();
  expect(await batch).toEqual({ processed: 2, succeeded: firstRejects ? 1 : 2, failed: firstRejects ? 1 : 0,
    failures: firstRejects ? [{ index: 0, item: itemB, error: undefined }] : [] });
});
