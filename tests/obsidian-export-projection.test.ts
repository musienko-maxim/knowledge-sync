import { beforeEach, expect, it, vi } from 'vitest';
import { buildObsidianExportPlan } from '../src/outputs/obsidian/export-plan.js';
import { exportObsidianPlan, exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';
import { preflightObsidianPlan } from '../src/outputs/obsidian/preflight.js';
import { inspectExportTarget } from '../src/outputs/obsidian/safe-path.js';
import { writeGeneratedObsidianNote } from '../src/outputs/obsidian/write-generated-note.js';
import { writeNavigationNote } from '../src/outputs/obsidian/write-navigation.js';

vi.mock('../src/outputs/obsidian/preflight.js', async (original) => ({
  ...await original<typeof import('../src/outputs/obsidian/preflight.js')>(), preflightObsidianPlan: vi.fn(),
}));
vi.mock('../src/outputs/obsidian/safe-path.js', async (original) => ({
  ...await original<typeof import('../src/outputs/obsidian/safe-path.js')>(), inspectExportTarget: vi.fn(),
}));
vi.mock('../src/outputs/obsidian/write-generated-note.js', () => ({ writeGeneratedObsidianNote: vi.fn() }));
vi.mock('../src/outputs/obsidian/write-navigation.js', () => ({ writeNavigationNote: vi.fn() }));
const item = { source: 'youtube', sourceId: 'X', title: 'First', url: 'https://example.com' };
const collection = { source: 'youtube', sourceId: 'P', title: 'Collection' };
const snapshot = { items: [item, { ...item, sourceId: 'Y', title: 'Second' }], collections: [collection],
  memberships: [{ source: 'youtube', collectionSourceId: 'P', itemSourceId: 'X' }] };
const plan = buildObsidianExportPlan(snapshot);
const write = vi.mocked(writeGeneratedObsidianNote);
const navigation = vi.mocked(writeNavigationNote);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(preflightObsidianPlan).mockResolvedValue({ additions: 4, updates: 0, unchanged: 0, possibleLeftovers: 0, conflicts: [] });
  vi.mocked(inspectExportTarget).mockResolvedValue('absent');
  write.mockResolvedValue(undefined); navigation.mockResolvedValue(undefined);
});

it('preflights once, publishes mapped bytes in phase order, then root navigation', async () => {
  const result = await exportObsidianPlan('vault', plan);
  expect(preflightObsidianPlan).toHaveBeenCalledExactlyOnceWith('vault', plan);
  expect(write.mock.calls.map((args) => args[3])).toEqual(['item', 'item', 'collection']);
  expect(write.mock.calls[0]).toEqual(['vault', plan.items[0]!.relativePath, plan.items[0]!.markdown, 'item', plan.items[0]!.item]);
  expect(write.mock.invocationCallOrder.at(-1)).toBeLessThan(navigation.mock.invocationCallOrder[0]!);
  expect(navigation).toHaveBeenCalledWith('vault', plan.navigation!.markdown, expect.any(Function));
  expect(result).toMatchObject({ items: { succeeded: 2, failed: 0 }, collections: { status: 'completed', result: { succeeded: 1 } }, navigation: { status: 'completed' } });
});

it('retains ordinary item failures and skips both dependent phases, then retries successfully', async () => {
  write.mockRejectedValueOnce(undefined);
  const result = await exportObsidianPlan('vault', plan);
  expect(result.items).toMatchObject({ processed: 2, succeeded: 1, failed: 1, failures: [{ index: 0, error: undefined }] });
  expect(write.mock.calls.map((args) => args[3])).toEqual(['item', 'item']);
  expect(result.collections).toEqual({ status: 'skipped', reason: 'upstream-failure' });
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
  expect(navigation).not.toHaveBeenCalled();
  expect((await exportObsidianPlan('vault', plan)).navigation).toEqual({ status: 'completed' });
});

it('retains collection failures and skips navigation', async () => {
  write.mockImplementation(async (_vault, _path, _markdown, kind) => { if (kind === 'collection') throw undefined; });
  const result = await exportObsidianPlan('vault', plan);
  expect(result.items.failed).toBe(0);
  expect(result.collections).toMatchObject({ status: 'completed', result: { failed: 1, failures: [{ error: undefined }] } });
  expect(result.navigation).toEqual({ status: 'skipped', reason: 'upstream-failure' });
  expect(navigation).not.toHaveBeenCalled();
});

it.each([new Error('failure'), undefined])('retains original navigation errors (%j)', async (error) => {
  navigation.mockRejectedValue(error);
  const result = await exportObsidianPlan('vault', plan);
  expect(result.navigation).toEqual({ status: 'failed', stage: 'write', error });
  expect(result.items.succeeded).toBe(2);
});

it('blocks every write if root or any note conflicts in preflight', async () => {
  vi.mocked(preflightObsidianPlan).mockResolvedValue({ additions: 3, updates: 0, unchanged: 0, possibleLeftovers: 0,
    conflicts: [{ kind: 'navigation', index: 0, code: 'unowned-target' }] });
  await expect(exportObsidianPlan('vault', plan)).rejects.toThrow('preflight');
  expect(write).not.toHaveBeenCalled(); expect(navigation).not.toHaveBeenCalled();
});

it('awaits each item before advancing and awaits the navigation write', async () => {
  let release!: () => void;
  write.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
  const running = exportObsidianPlan('vault', plan);
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(navigation).not.toHaveBeenCalled();
  let finish!: () => void;
  navigation.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  release();
  await vi.waitFor(() => expect(navigation).toHaveBeenCalledTimes(1));
  let settled = false;
  void running.then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  finish(); await running; expect(settled).toBe(true);
});

it('rejects malformed complete snapshots before preflight or any write', async () => {
  for (const malformed of [
    { ...snapshot, items: [item, item] },
    { ...snapshot, collections: [collection, collection] },
    { ...snapshot, items: [] },
  ]) await expect(exportObsidianProjection('vault', malformed)).rejects.toThrow();
  expect(preflightObsidianPlan).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});

it('keeps an empty snapshot a no-op with an explicit navigation skip', async () => {
  expect((await exportObsidianProjection('missing-vault', { items: [], collections: [], memberships: [] })).navigation)
    .toEqual({ status: 'skipped', reason: 'empty-snapshot' });
  expect(write).not.toHaveBeenCalled(); expect(navigation).not.toHaveBeenCalled();
});
