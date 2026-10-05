import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import { exportObsidianNote } from '../src/outputs/obsidian/export-note.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { writeObsidianNote } from '../src/outputs/obsidian/write-note.js';

vi.mock('../src/outputs/markdown.js', () => ({ renderKnowledgeItemMarkdown: vi.fn() }));
vi.mock('../src/outputs/obsidian/note-path.js', () => ({ buildObsidianRelativePath: vi.fn() }));
vi.mock('../src/outputs/obsidian/write-note.js', () => ({ writeObsidianNote: vi.fn() }));

const pathBuilder = vi.mocked(buildObsidianRelativePath);
const renderer = vi.mocked(renderKnowledgeItemMarkdown);
const writer = vi.mocked(writeObsidianNote);
const item: KnowledgeItem = Object.freeze({
  source: ' example ', sourceId: ' Video1 ', title: ' Title ', url: 'https://example.com/item',
});
const vault = ' vault with spaces ';
const relativePath = 'source/ encoded-name .md';
const content = '\ufeffOpaque content\r\nwith trailing spaces  ';

beforeEach(() => {
  vi.resetAllMocks();
  pathBuilder.mockReturnValue(relativePath);
  renderer.mockReturnValue(content);
  writer.mockResolvedValue(undefined);
});

describe('exportObsidianNote composition', () => {
  it('calls each component once in order and forwards the original inputs and outputs', async () => {
    await expect(exportObsidianNote(vault, item)).resolves.toBeUndefined();
    expect(pathBuilder).toHaveBeenCalledExactlyOnceWith(item);
    expect(renderer).toHaveBeenCalledExactlyOnceWith(item);
    expect(pathBuilder.mock.calls[0]![0]).toBe(item);
    expect(renderer.mock.calls[0]![0]).toBe(item);
    expect(writer).toHaveBeenCalledExactlyOnceWith(vault, relativePath, content);
    expect(pathBuilder.mock.invocationCallOrder[0]!).toBeLessThan(renderer.mock.invocationCallOrder[0]!);
    expect(renderer.mock.invocationCallOrder[0]!).toBeLessThan(writer.mock.invocationCallOrder[0]!);
  });

  it('rejects with the original path error and skips rendering and writing', async () => {
    const error = new Error('Path failed');
    pathBuilder.mockImplementation(() => { throw error; });
    const result = exportObsidianNote(vault, item);
    await expect(result).rejects.toBe(error);
    expect(pathBuilder).toHaveBeenCalledTimes(1);
    expect(renderer).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  });

  it('rejects with the original rendering error and skips writing', async () => {
    const error = new Error('Rendering failed');
    renderer.mockImplementation(() => { throw error; });
    const result = exportObsidianNote(vault, item);
    await expect(result).rejects.toBe(error);
    expect(pathBuilder).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(writer).not.toHaveBeenCalled();
  });

  it('preserves the writer rejection without retrying', async () => {
    const error = new Error('Writing failed');
    writer.mockRejectedValue(error);
    await expect(exportObsidianNote(vault, item)).rejects.toBe(error);
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('waits for the writer to %s before settling', async (outcome) => {
    let resolveWrite!: () => void;
    let rejectWrite!: (reason: unknown) => void;
    writer.mockReturnValue(new Promise<void>((resolve, reject) => {
      resolveWrite = resolve;
      rejectWrite = reject;
    }));
    const result = exportObsidianNote(vault, item);
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const observed = result.then(onSuccess, onFailure);
    // Flush promise reactions without a timer while the writer is still pending.
    await Promise.resolve();
    expect(writer).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();

    if (outcome === 'resolve') {
      resolveWrite();
      await observed;
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(onFailure).not.toHaveBeenCalled();
    } else {
      const error = new Error('Deferred write failed');
      rejectWrite(error);
      await observed;
      expect(onFailure).toHaveBeenCalledExactlyOnceWith(error);
      expect(onSuccess).not.toHaveBeenCalled();
    }
  });
});
