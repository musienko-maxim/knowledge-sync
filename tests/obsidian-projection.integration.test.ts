import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildObsidianExportPlan } from '../src/outputs/obsidian/export-plan.js';
import { exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';
import { encodeMarkdownDestination } from '../src/outputs/obsidian/markdown-link.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
let directory: string;
let vault: string;
const item = { source: 'youtube', sourceId: 'X', title: 'Привіт [X]', url: 'https://example.com/X' };
const other = { source: 'facebook', sourceId: 'url-v1-fixture', title: 'Another item', url: 'https://example.com/other' };
const collection = { source: 'youtube', sourceId: 'A', title: 'Learning' };
const snapshot = { items: [item, other], collections: [collection], memberships: [
  { source: 'youtube', collectionSourceId: 'A', itemSourceId: 'X' },
] };

beforeEach(async () => {
  vi.clearAllMocks();
  directory = await fs.mkdtemp(join(tmpdir(), 'ks-projection-'));
  vault = join(directory, 'vault'); await fs.mkdir(vault);
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('ks-projection-')) throw new Error('Invalid cleanup');
  await fs.rm(directory, { recursive: true, force: true });
});

it('publishes mixed-source notes and resolvable links, then repeats byte-identical output without rewriting', async () => {
  const plan = buildObsidianExportPlan(snapshot);
  const result = await exportObsidianProjection(vault, snapshot);
  expect(result.items).toMatchObject({ succeeded: 2, failed: 0 });
  expect(result.collections).toMatchObject({ status: 'completed', result: { succeeded: 1, failed: 0 } });
  expect(result.navigation).toEqual({ status: 'completed' });
  const entries = [...plan.items, ...plan.collections, plan.navigation!];
  for (const entry of entries) {
    const bytes = await fs.readFile(join(vault, entry.relativePath), 'utf8');
    expect(bytes).toBe(entry.markdown);
    for (const match of bytes.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = posix.join(posix.dirname(entry.relativePath), decodeURIComponent(match[1]!));
      expect(entries.some((entry) => entry.relativePath === destination)).toBe(true);
      await expect(fs.stat(join(vault, destination))).resolves.toBeDefined();
    }
  }
  const before = await Promise.all(entries.map(async ({ relativePath }) => ({
    bytes: await fs.readFile(join(vault, relativePath)), mtime: (await fs.stat(join(vault, relativePath))).mtimeMs,
  })));
  vi.mocked(fs.rename).mockClear();
  await exportObsidianProjection(vault, { ...snapshot, items: [...snapshot.items].reverse() });
  expect(fs.rename).not.toHaveBeenCalled();
  expect(await Promise.all(entries.map(async ({ relativePath }) => ({
    bytes: await fs.readFile(join(vault, relativePath)), mtime: (await fs.stat(join(vault, relativePath))).mtimeMs,
  })))).toEqual(before);
});

it('renames via new destinations, updates generated links and retains historical bytes', async () => {
  const original = buildObsidianExportPlan(snapshot);
  await exportObsidianProjection(vault, snapshot);
  const changed = { ...snapshot, items: [{ ...item, title: 'Renamed video' }, other], collections: [{ ...collection, title: 'Renamed collection' }] };
  const next = buildObsidianExportPlan(changed);
  await exportObsidianProjection(vault, changed);
  for (const entry of [...original.items, ...original.collections]) expect(await fs.readFile(join(vault, entry.relativePath), 'utf8')).toBe(entry.markdown);
  const navigation = await fs.readFile(join(vault, next.navigation!.relativePath), 'utf8');
  for (const entry of [...next.items, ...next.collections]) expect(navigation).toContain(`](${encodeMarkdownDestination(entry.relativePath)})`);
  const newItem = next.items.find((entry) => entry.item.source === 'youtube')!;
  expect(await fs.readFile(join(vault, next.collections[0]!.relativePath), 'utf8')).toContain(
    `](${encodeMarkdownDestination(posix.relative(posix.dirname(next.collections[0]!.relativePath), newItem.relativePath))})`);
});

it.each(['item', 'collection'] as const)('suppresses dependent phases after a real %s rename failure and converges on retry', async (phase) => {
  const plan = buildObsidianExportPlan(snapshot);
  const actual = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).rename;
  let failed = false;
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    const selected = phase === 'item' ? !String(to).includes('collections') : String(to).includes('collections');
    if (!failed && selected) { failed = true; throw Object.assign(new Error('Injected failure'), { code: 'EIO' }); }
    return actual(from, to);
  });
  const partial = await exportObsidianProjection(vault, snapshot);
  expect(partial.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
  if (phase === 'item') {
    expect(partial.items.failed).toBe(1);
    expect(partial.collections).toEqual({ status: 'skipped', reason: 'upstream-failure' });
    await expect(fs.lstat(join(vault, plan.collections[0]!.relativePath))).rejects.toMatchObject({ code: 'ENOENT' });
  } else {
    expect(partial.items.failed).toBe(0);
    expect(partial.collections).toMatchObject({ status: 'completed', result: { failed: 1 } });
  }
  await expect(fs.lstat(join(vault, 'Knowledge Sync.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fs.readdir(vault, { recursive: true })).filter((path) => path.endsWith('.tmp'))).toEqual([]);
  expect((await exportObsidianProjection(vault, snapshot)).navigation).toEqual({ status: 'completed' });
  for (const entry of [...plan.items, ...plan.collections, plan.navigation!]) expect(await fs.readFile(join(vault, entry.relativePath), 'utf8')).toBe(entry.markdown);
});

it('preflights user-owned navigation before all note writes, then recovers after the user moves it', async () => {
  const target = join(vault, 'Knowledge Sync.md');
  await fs.writeFile(target, 'My own notes\r\nPreserve');
  await expect(exportObsidianProjection(vault, snapshot)).rejects.toThrow('preflight');
  expect(await fs.readdir(vault)).toEqual(['Knowledge Sync.md']);
  expect(await fs.readFile(target, 'utf8')).toBe('My own notes\r\nPreserve');
  await fs.rename(target, join(vault, 'Personal.md'));
  expect((await exportObsidianProjection(vault, snapshot)).navigation).toEqual({ status: 'completed' });
  expect(await fs.readFile(join(vault, 'Personal.md'), 'utf8')).toBe('My own notes\r\nPreserve');
});

it('exports collection-only data and keeps an empty snapshot a no-op even for a missing vault', async () => {
  const result = await exportObsidianProjection(vault, { items: [], collections: [collection], memberships: [] });
  expect(result.collections).toMatchObject({ status: 'completed', result: { succeeded: 1 } });
  const target = join(vault, 'Knowledge Sync.md');
  const before = await fs.readFile(target);
  const empty = { items: [], collections: [], memberships: [] };
  expect((await exportObsidianProjection(vault, empty)).navigation).toEqual({ status: 'skipped', reason: 'empty-snapshot' });
  expect(await fs.readFile(target)).toEqual(before);
  expect((await exportObsidianProjection(join(directory, 'missing'), empty)).items.processed).toBe(0);
  await expect(exportObsidianProjection(join(directory, 'missing'), snapshot)).rejects.toThrow('missing-vault');
});

it('rejects dangling memberships before filesystem output', async () => {
  await expect(exportObsidianProjection(vault, { ...snapshot, items: [] })).rejects.toThrow('missing item');
  expect(await fs.readdir(vault)).toEqual([]);
});
