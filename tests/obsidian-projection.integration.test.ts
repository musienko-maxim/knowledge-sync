import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import type { ObsidianProjectionSnapshot } from '../src/outputs/obsidian/collection-projection.js';
import { exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

let directory: string;
let vault: string;
const item = { source: 'example', sourceId: 'X', title: 'Привіт [X]', url: 'https://example.com/X' };
const otherItem = { ...item, sourceId: 'collections', title: 'Other' };
const a = { source: 'example', sourceId: 'A', title: 'Collection A' };
const b = { ...a, sourceId: 'B', title: 'Collection B' };
const snapshot: ObsidianProjectionSnapshot = {
  items: [item, otherItem], collections: [a, b], memberships: [
    { source: 'example', collectionSourceId: 'A', itemSourceId: 'X' },
    { source: 'example', collectionSourceId: 'B', itemSourceId: 'X' },
    { source: 'example', collectionSourceId: 'B', itemSourceId: 'collections' },
  ],
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-projection-'));
  vault = join(directory, 'vault');
  await mkdir(vault);
});
afterEach(async () => {
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-projection-')) {
    throw new Error('Unexpected projection-test cleanup path.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

it('writes one shared item and collection links, preserves item bytes and repeats identical output', async () => {
  const result = await exportObsidianProjection(vault, snapshot);
  expect(result.items).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
  expect(result.collections).toMatchObject({ status: 'completed', result: { processed: 2, succeeded: 2, failed: 0 } });
  const paths = [buildObsidianRelativePath(item), buildObsidianRelativePath(otherItem),
    buildObsidianCollectionRelativePath(a), buildObsidianCollectionRelativePath(b)];
  const first = await Promise.all(paths.map((path) => readFile(join(vault, path))));
  expect(first[0]).toEqual(Buffer.from(renderKnowledgeItemMarkdown(item), 'utf8'));
  expect(first[2]!.toString('utf8')).toContain('- [Привіт \\[X\\]](../%2558.md)');
  expect(first[3]!.toString('utf8')).toContain('(../collections.md)');
  expect(await readdir(join(vault, 'example'))).toEqual(['%58.md', 'collections', 'collections.md']);
  await exportObsidianProjection(vault, { ...snapshot, memberships: [...snapshot.memberships].reverse() });
  expect(await Promise.all(paths.map((path) => readFile(join(vault, path))))).toEqual(first);
  await exportObsidianProjection(vault, { ...snapshot, collections: [{ ...a, title: 'Renamed' }, b] });
  expect(await readFile(join(vault, paths[2]!), 'utf8')).toContain('# Renamed\n');
  expect(await readdir(join(vault, 'example', 'collections'))).toEqual(['%41.md', '%42.md']);
});

it('exports collection-only snapshots, fails missing vaults, and keeps an entirely empty projection a no-op', async () => {
  const only = { items: [], collections: [a], memberships: [] };
  const result = await exportObsidianProjection(vault, only);
  expect(result.items.processed).toBe(0);
  expect(result.collections).toMatchObject({ status: 'completed', result: { succeeded: 1 } });
  expect(await readFile(join(vault, buildObsidianCollectionRelativePath(a)), 'utf8')).toContain('_No items._\n');
  const missing = join(directory, 'missing');
  expect((await exportObsidianProjection(missing, only)).collections)
    .toMatchObject({ status: 'completed', result: { processed: 1, failed: 1 } });
  expect(await exportObsidianProjection(missing, { items: [], collections: [], memberships: [] })).toEqual({
    items: { processed: 0, succeeded: 0, failed: 0, failures: [] },
    collections: { status: 'completed', result: { processed: 0, succeeded: 0, failed: 0, failures: [] } },
  });
  expect(await readdir(directory)).toEqual(['vault']);
});

it.each(['item', 'collection'] as const)('recovers after a partial %s write failure without suppressing later writes', async (phase) => {
  const blockedPath = join(vault, phase === 'item' ? buildObsidianRelativePath(item) : buildObsidianCollectionRelativePath(a));
  await mkdir(blockedPath, { recursive: true });
  const partial = await exportObsidianProjection(vault, snapshot);
  expect(partial.items.failed).toBe(phase === 'item' ? 1 : 0);
  expect(partial.collections).toMatchObject({ status: 'completed', result: { failed: phase === 'collection' ? 1 : 0 } });
  // Later items and collections still reach disk regardless of the earlier failure.
  expect(await readFile(join(vault, buildObsidianRelativePath(otherItem)), 'utf8')).toBe(renderKnowledgeItemMarkdown(otherItem));
  expect(await readFile(join(vault, buildObsidianCollectionRelativePath(b)), 'utf8')).toContain('# Collection B');
  const resolvedBlock = resolve(blockedPath);
  if (!resolvedBlock.startsWith(`${resolve(vault)}${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Unexpected blocked output path.');
  }
  await rm(resolvedBlock, { recursive: true });
  const recovered = await exportObsidianProjection(vault, snapshot);
  expect(recovered.items.failed).toBe(0);
  expect(recovered.collections).toMatchObject({ status: 'completed', result: { failed: 0, succeeded: 2 } });
  expect(await readFile(resolvedBlock, 'utf8')).toContain(phase === 'item' ? '# Привіт [X]' : '# Collection A');
});

it('rejects malformed relationships without writing any files', async () => {
  await expect(exportObsidianProjection(vault, { ...snapshot, memberships: [...snapshot.memberships, {
    source: 'example', collectionSourceId: 'A', itemSourceId: 'missing',
  }] })).rejects.toThrow('missing item');
  expect(await readdir(vault)).toEqual([]);
});
