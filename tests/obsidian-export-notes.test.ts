import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { exportObsidianNote } from '../src/outputs/obsidian/export-note.js';
import { exportObsidianNotes } from '../src/outputs/obsidian/export-notes.js';

vi.mock('../src/outputs/obsidian/export-note.js', () => ({ exportObsidianNote: vi.fn() }));

const exportOne = vi.mocked(exportObsidianNote);
const vault = ' relative vault with spaces ';
const itemA: KnowledgeItem = Object.freeze({
  source: 'example', sourceId: 'z-last', title: 'Z', url: 'https://example.com/z',
});
const itemB: KnowledgeItem = Object.freeze({
  source: 'example', sourceId: 'a-first', title: 'A', url: 'https://example.com/a',
});
const itemC: KnowledgeItem = Object.freeze({ ...itemA, sourceId: 'middle', title: 'M' });

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((fulfill, fail) => { resolve = fulfill; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  exportOne.mockReset().mockResolvedValue(undefined);
});

describe('exportObsidianNotes', () => {
  it.each(['', '\0', 'missing/vault'])('returns zeros for empty input without accessing vault %j', async (path) => {
    await expect(exportObsidianNotes(path, Object.freeze([]))).resolves.toEqual({
      processed: 0, succeeded: 0, failed: 0, failures: [],
    });
    expect(exportOne).not.toHaveBeenCalled();
  });

  it('exports one successful item exactly once', async () => {
    await expect(exportObsidianNotes(vault, [itemA])).resolves.toEqual({
      processed: 1, succeeded: 1, failed: 0, failures: [],
    });
    expect(exportOne).toHaveBeenCalledExactlyOnceWith(vault, itemA);
  });

  it('preserves the frozen array, item references, original order, and vault string', async () => {
    const items = Object.freeze([itemA, itemB, itemC]);
    const original = items.map((item) => ({ ...item }));
    const result = await exportObsidianNotes(vault, items);
    expect(result).toEqual({ processed: 3, succeeded: 3, failed: 0, failures: [] });
    expect(exportOne).toHaveBeenCalledTimes(items.length);
    items.forEach((item, index) => {
      expect(exportOne.mock.calls[index]![0]).toBe(vault);
      expect(exportOne.mock.calls[index]![1]).toBe(item);
    });
    expect(items).toEqual(original);
  });

  it('counts duplicate references and different versions of the same identity independently', async () => {
    const updated = Object.freeze({ ...itemA, title: 'Updated' });
    const items = Object.freeze([itemA, itemA, updated, itemB]);
    const error = new Error('Later duplicate write failed');
    exportOne.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    const result = await exportObsidianNotes(vault, items);
    expect(result).toEqual({
      processed: 4, succeeded: 3, failed: 1, failures: [{ index: 2, item: updated, error }],
    });
    expect(exportOne).toHaveBeenCalledTimes(4);
    items.forEach((item, index) => expect(exportOne.mock.calls[index]![1]).toBe(item));
    expect(result.failures[0]!.item).toBe(updated);
    expect(result.failures[0]!.error).toBe(error);
  });

  it.each(['throw', 'reject'] as const)('continues after a middle item fails by %s', async (mode) => {
    const error = new Error('Item failed');
    exportOne.mockResolvedValueOnce(undefined).mockImplementationOnce(() => {
      if (mode === 'throw') throw error;
      return Promise.reject(error);
    });
    const result = await exportObsidianNotes(vault, [itemA, itemB, itemC]);
    expect(result).toEqual({
      processed: 3, succeeded: 2, failed: 1, failures: [{ index: 1, item: itemB, error }],
    });
    expect(exportOne).toHaveBeenCalledTimes(3);
    expect(exportOne).toHaveBeenNthCalledWith(3, vault, itemC);
    expect(result.failures[0]!.item).toBe(itemB);
    expect(result.failures[0]!.error).toBe(error);
  });

  it('collects multiple failures in ascending input-index order and satisfies all count invariants', async () => {
    const items = Object.freeze([itemA, itemB, itemC, itemA]);
    const errors = [new Error('First'), new Error('Second'), new Error('Third')];
    exportOne.mockRejectedValueOnce(errors[0]).mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(errors[1]).mockRejectedValueOnce(errors[2]);
    const result = await exportObsidianNotes(vault, items);
    expect(result.processed).toBe(items.length);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(3);
    expect(result.processed).toBe(result.succeeded + result.failed);
    expect(result.failed).toBe(result.failures.length);
    expect(result.failures.map((failure) => failure.index)).toEqual([0, 2, 3]);
    result.failures.forEach((failure, index) => {
      expect(failure.item).toBe(items[failure.index]);
      expect(failure.error).toBe(errors[index]);
    });
    expect(exportOne).toHaveBeenCalledTimes(items.length);
  });

  it.each(['failure', 123, { code: 'TEST' }, null, undefined])('preserves non-Error rejection %j', async (error) => {
    exportOne.mockRejectedValueOnce(error);
    const result = await exportObsidianNotes(vault, [itemA, itemB]);
    expect(result).toEqual({
      processed: 2, succeeded: 1, failed: 1, failures: [{ index: 0, item: itemA, error }],
    });
    expect(result.failures[0]!.error).toBe(error);
    expect(result.failures[0]!.item).toBe(itemA);
    expect(exportOne).toHaveBeenNthCalledWith(2, vault, itemB);
  });

  it('returns one failure per item when the single-item exporter rejects an invalid vault', async () => {
    const error = new Error('Vault path must not be blank.');
    exportOne.mockRejectedValue(error);
    const items = Object.freeze([itemA, itemB, itemC]);
    const result = await exportObsidianNotes('', items);
    expect(result).toEqual({
      processed: 3, succeeded: 0, failed: 3,
      failures: items.map((item, index) => ({ index, item, error })),
    });
    expect(exportOne).toHaveBeenCalledTimes(3);
    items.forEach((item, index) => expect(exportOne).toHaveBeenNthCalledWith(index + 1, '', item));
  });

  it.each([
    { firstRejects: false, lastRejects: false }, { firstRejects: false, lastRejects: true },
    { firstRejects: true, lastRejects: false }, { firstRejects: true, lastRejects: true },
  ])('awaits each item and the final settlement (%j)', async ({ firstRejects, lastRejects }) => {
    const first = deferred();
    const last = deferred();
    const lastStarted = deferred();
    exportOne.mockReturnValueOnce(first.promise).mockImplementationOnce(() => {
      lastStarted.resolve();
      return last.promise;
    });
    const batch = exportObsidianNotes(vault, [itemA, itemB]);
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const observed = batch.then(onSuccess, onFailure);
    await Promise.resolve();
    expect(exportOne).toHaveBeenCalledExactlyOnceWith(vault, itemA);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();

    const firstError = new Error('First item failed');
    if (firstRejects) first.reject(firstError);
    else first.resolve();
    await lastStarted.promise;
    await Promise.resolve();
    expect(exportOne).toHaveBeenCalledTimes(2);
    expect(exportOne).toHaveBeenNthCalledWith(2, vault, itemB);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();

    const lastError = new Error('Last item failed');
    if (lastRejects) last.reject(lastError);
    else last.resolve();
    await observed;
    const failures = [
      ...(firstRejects ? [{ index: 0, item: itemA, error: firstError }] : []),
      ...(lastRejects ? [{ index: 1, item: itemB, error: lastError }] : []),
    ];
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith({
      processed: 2, succeeded: 2 - failures.length, failed: failures.length, failures,
    });
    expect(onFailure).not.toHaveBeenCalled();
  });
});
