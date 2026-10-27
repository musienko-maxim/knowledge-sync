import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildObsidianExportPlan } from '../src/outputs/obsidian/export-plan.js';
import { exportObsidianPlan } from '../src/outputs/obsidian/export-projection.js';
import { preflightObsidianPlan } from '../src/outputs/obsidian/preflight.js';
import { resolveExportTarget, temporaryExportPath, validateAbsolutePath } from '../src/outputs/obsidian/safe-path.js';

const item = { source: 'youtube', sourceId: 'One', title: 'First', url: 'https://example.com/one' };
const collection = { source: 'youtube', sourceId: 'Playlist', title: 'Learning' };
const snapshot = { items: [item], collections: [collection], memberships: [{ source: 'youtube', collectionSourceId: 'Playlist', itemSourceId: 'One' }] };
let directory: string;
let vault: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'ks-preflight-')); vault = join(directory, 'vault'); await mkdir(vault); });
afterEach(async () => {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('ks-preflight-')) throw new Error('Invalid cleanup');
  await rm(directory, { recursive: true, force: true });
});

describe('global read-only preflight', () => {
  it('reports additions without creating directories and unchanged output after publishing', async () => {
    const plan = buildObsidianExportPlan(snapshot);
    expect(await preflightObsidianPlan(vault, plan)).toEqual({ additions: 3, updates: 0, unchanged: 0, possibleLeftovers: 0, conflicts: [] });
    expect(await readdir(vault)).toEqual([]);
    await exportObsidianPlan(vault, plan);
    expect(await preflightObsidianPlan(vault, plan)).toMatchObject({ additions: 0, updates: 0, unchanged: 3, conflicts: [] });
    const changed = buildObsidianExportPlan({ ...snapshot, items: [{ ...item, description: 'Changed metadata' }] });
    expect(await preflightObsidianPlan(vault, changed)).toMatchObject({ updates: 1, unchanged: 2 });
  });

  it.each(['item', 'collection', 'navigation'] as const)('blocks all writes for an unknown %s occupant', async (kind) => {
    const plan = buildObsidianExportPlan(snapshot);
    const entry = kind === 'item' ? plan.items[0]! : kind === 'collection' ? plan.collections[0]! : plan.navigation!;
    const target = join(vault, entry.relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, 'User content');
    const before = await readdir(vault, { recursive: true });
    expect((await preflightObsidianPlan(vault, plan)).conflicts).toContainEqual({ kind, index: 0, code: 'unowned-target' });
    await expect(exportObsidianPlan(vault, plan)).rejects.toThrow('preflight');
    expect(await readFile(target, 'utf8')).toBe('User content');
    expect(await readdir(vault, { recursive: true })).toEqual(before);
  });

  it('refuses manually edited generated notes and preserves all their bytes', async () => {
    const plan = buildObsidianExportPlan(snapshot);
    await exportObsidianPlan(vault, plan);
    const target = join(vault, plan.items[0]!.relativePath);
    const edited = (await readFile(target, 'utf8')) + 'Personal annotation';
    await writeFile(target, edited);
    expect((await preflightObsidianPlan(vault, plan)).conflicts).toEqual([{ kind: 'item', index: 0, code: 'modified-target' }]);
    await expect(exportObsidianPlan(vault, plan)).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe(edited);
  });

  it('retains title-change leftovers and reports possibilities without claiming ownership', async () => {
    const plan = buildObsidianExportPlan(snapshot);
    await exportObsidianPlan(vault, plan);
    const old = await readFile(join(vault, plan.items[0]!.relativePath));
    await writeFile(join(vault, 'youtube', 'legacy.md'), 'Unknown legacy');
    const next = buildObsidianExportPlan({ ...snapshot, items: [{ ...item, title: 'New title' }] });
    expect(await preflightObsidianPlan(vault, next)).toMatchObject({ additions: 1, updates: 2, possibleLeftovers: 2, conflicts: [] });
    await exportObsidianPlan(vault, next);
    expect(await readFile(join(vault, plan.items[0]!.relativePath))).toEqual(old);
    expect(await readFile(join(vault, 'youtube', 'legacy.md'), 'utf8')).toBe('Unknown legacy');
  });

  it('detects equivalent existing spelling on Windows and Linux before writes', async () => {
    const plan = buildObsidianExportPlan(snapshot);
    await mkdir(join(vault, 'YOUTUBE'));
    expect((await preflightObsidianPlan(vault, plan)).conflicts.some((value) => value.code === 'equivalent-path')).toBe(true);
    expect(await readdir(vault)).toEqual(['YOUTUBE']);
  });

  it.each(['root', 'source', 'collection', 'target'] as const)('rejects a real junction/symlink at %s', async (where) => {
    const plan = buildObsidianExportPlan(snapshot);
    const outside = join(directory, 'outside'); await mkdir(outside);
    const link = where === 'root' ? join(directory, 'linked') : where === 'source' ? join(vault, 'youtube')
      : where === 'collection' ? join(vault, 'youtube', 'collections') : join(vault, plan.items[0]!.relativePath);
    await mkdir(dirname(link), { recursive: true });
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    if (where === 'root') await expect(preflightObsidianPlan(link, plan)).rejects.toThrow('unsafe-path');
    else expect((await preflightObsidianPlan(vault, plan)).conflicts.some((value) => value.code === 'unsafe-path')).toBe(true);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('portable absolute and temporary path budgets', () => {
  it('rejects traversal and Windows syntax on every host', () => {
    for (const path of ['../escape.md', 'a/../b.md', 'a\\b.md', 'C:note.md', 'C:/note.md', '/note.md', 'con/file.md', 'a./note.md']) {
      expect(() => resolveExportTarget(vault, path)).toThrow();
    }
  });
  it('accepts exactly 240 UTF-16 code units and rejects 241', () => {
    const root = resolve(vault) + (process.platform === 'win32' ? '\\' : '/');
    expect(() => validateAbsolutePath(root + 'a'.repeat(240 - root.length))).not.toThrow();
    expect(() => validateAbsolutePath(root + 'a'.repeat(241 - root.length))).toThrow('path-too-long');
  });
  it('checks temporary names independently of short target names', () => {
    const folder = join(vault, 'a'.repeat(180 - vault.length));
    const target = join(folder, 'x.md');
    expect(() => validateAbsolutePath(target)).not.toThrow();
    expect(() => temporaryExportPath(target, 'navigation', '0'.repeat(36))).toThrow('path-too-long');
  });
});
