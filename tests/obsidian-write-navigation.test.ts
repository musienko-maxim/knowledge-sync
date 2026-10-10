import * as fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_MARKER } from '../src/outputs/obsidian/navigation-markdown.js';
import { NAVIGATION_FILENAME, NavigationWriteError, writeNavigationNote } from '../src/outputs/obsidian/write-navigation.js';

vi.mock('node:fs/promises', () => ({
  lstat: vi.fn(), stat: vi.fn(), open: vi.fn(), rename: vi.fn(), unlink: vi.fn(),
}));
vi.mock('node:crypto', () => ({ randomUUID: () => 'test-unique-id' }));

const vault = resolve('navigation-test-vault');
const target = join(vault, NAVIGATION_FILENAME);
const temporary = join(vault, '.knowledge-sync-navigation-test-unique-id.tmp');
const content = `${NAVIGATION_MARKER}\n# Knowledge Sync\n`;
const missing = Object.assign(new Error('Missing'), { code: 'ENOENT' });
const regular = { isSymbolicLink: () => false, isFile: () => true } as Stats;
let reader: FileHandle;
let writer: FileHandle;
let readLengths: number[];

function markerFile(text: string, chunkSize = Infinity): void {
  const bytes = Buffer.from(text, 'utf8');
  vi.mocked(fs.lstat).mockResolvedValue(regular);
  reader = {
    read: vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
      readLengths.push(length);
      const bytesRead = Math.min(length, chunkSize, Math.max(0, bytes.length - position));
      bytes.copy(buffer, offset, position, position + bytesRead);
      return { bytesRead, buffer };
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileHandle;
}

beforeEach(() => {
  vi.resetAllMocks();
  readLengths = [];
  vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as Stats);
  markerFile(content);
  writer = { writeFile: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) } as unknown as FileHandle;
  vi.mocked(fs.open).mockImplementation(async (path, flags) => {
    if (path === target && flags === 'r') return reader;
    if (path === temporary && flags === 'wx') return writer;
    throw new Error('Unexpected path or non-exclusive/direct-target write');
  });
  vi.mocked(fs.rename).mockResolvedValue(undefined);
  vi.mocked(fs.unlink).mockResolvedValue(undefined);
});

describe('navigation writer ownership and operation contract', () => {
  it.each(['', '\ufeff'].flatMap((bom) => ['\n', '\r\n', ''].map((ending) => `${bom}${NAVIGATION_MARKER}${ending}`)))
    ('accepts exact first marker line %j', async (old) => {
      markerFile(old);
      await writeNavigationNote(vault, content);
      expect(fs.rename).toHaveBeenCalledWith(temporary, target);
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(reader.close).toHaveBeenCalledTimes(2);
    });

  it.each([
    ` ${NAVIGATION_MARKER}\n`, `${NAVIGATION_MARKER} \n`, NAVIGATION_MARKER.replace(':v1', ':v2'),
    `${NAVIGATION_MARKER}\r`, `${NAVIGATION_MARKER}\rbody`, `\ufeff\ufeff${NAVIGATION_MARKER}\n`,
    `User page\n${NAVIGATION_MARKER}\n`, '\n' + NAVIGATION_MARKER, '',
  ])('rejects unowned first line %j before preparing a file', async (old) => {
    markerFile(old);
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'unowned-target' });
    expect(fs.open).toHaveBeenCalledTimes(1);
    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it('reads a bounded prefix, handles short reads, and closes each reader before rename', async () => {
    markerFile(`\ufeff${NAVIGATION_MARKER}\r\n${'x'.repeat(100_000)}`, 2);
    await writeNavigationNote(vault, content);
    expect(Math.max(...readLengths)).toBe(Buffer.byteLength(NAVIGATION_MARKER) + 5);
    expect(vi.mocked(reader.read).mock.calls.length).toBeLessThan(60);
    const renameOrder = vi.mocked(fs.rename).mock.invocationCallOrder[0]!;
    expect(vi.mocked(reader.close).mock.invocationCallOrder.every((order) => order < renameOrder)).toBe(true);
    expect(vi.mocked(writer.close).mock.invocationCallOrder[0]).toBeLessThan(renameOrder);
    expect(writer.writeFile).toHaveBeenCalledWith(content, 'utf8');
  });

  it.each(['', NAVIGATION_MARKER, `${NAVIGATION_MARKER}\nNo final LF`, `\ufeff${content}`, content.replaceAll('\n', '\r\n'), `${NAVIGATION_MARKER}\nbody\r\n`, ` ${content}`])
    ('rejects invalid generated content %j before filesystem access', async (invalid) => {
      await expect(writeNavigationNote(vault, invalid)).rejects.toBeInstanceOf(NavigationWriteError);
      await expect(writeNavigationNote(vault, invalid)).rejects.toMatchObject({ reason: 'invalid-content' });
      expect(fs.stat).not.toHaveBeenCalled();
      expect(fs.open).not.toHaveBeenCalled();
    });

  it.each(['', ' ', '\t\n'])('rejects blank vault %j', async (invalid) => {
    await expect(writeNavigationNote(invalid, content)).rejects.toThrow('must not be blank');
    expect(fs.stat).not.toHaveBeenCalled();
  });

  it('creates an absent target only via exclusive sibling preparation and rename', async () => {
    vi.mocked(fs.lstat).mockRejectedValue(missing);
    await writeNavigationNote(vault, content);
    expect(fs.open).toHaveBeenCalledExactlyOnceWith(temporary, 'wx');
    expect(fs.lstat).toHaveBeenCalledTimes(2);
    expect(fs.rename).toHaveBeenCalledExactlyOnceWith(temporary, target);
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it.each(['file link', 'directory link', 'dangling link'])('rejects %s without following it', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true, isFile: () => false } as Stats);
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'symlink-target' });
    expect(fs.open).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it.each(['directory', 'other non-regular object'])('rejects %s', async () => {
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => false, isFile: () => false } as Stats);
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'non-regular-target' });
    expect(fs.open).not.toHaveBeenCalled();
  });

  it.each(['stat', 'lstat', 'open'] as const)('preserves native %s exceptions and arbitrary undefined', async (operation) => {
    for (const error of [Object.assign(new Error('Private native details'), { code: 'EACCES' }), undefined]) {
      vi.mocked(fs[operation]).mockRejectedValueOnce(error);
      await expect(writeNavigationNote(vault, content)).rejects.toBe(error);
    }
    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('preserves a read failure even when reader close also fails', async () => {
    vi.mocked(reader.read).mockRejectedValueOnce(undefined);
    vi.mocked(reader.close).mockRejectedValueOnce(new Error('Close failure'));
    await expect(writeNavigationNote(vault, content)).rejects.toBeUndefined();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it('preserves a read-handle close failure before preparation', async () => {
    const error = new Error('Close failure');
    vi.mocked(reader.close).mockRejectedValueOnce(error);
    await expect(writeNavigationNote(vault, content)).rejects.toBe(error);
    expect(writer.writeFile).not.toHaveBeenCalled();
  });

  it('never cleans an exclusive-name collision', async () => {
    vi.mocked(fs.lstat).mockRejectedValue(missing);
    const error = Object.assign(new Error('Collision'), { code: 'EEXIST' });
    vi.mocked(fs.open).mockRejectedValueOnce(error);
    await expect(writeNavigationNote(vault, content)).rejects.toBe(error);
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it('preserves a native target-recheck failure and removes only its owned temporary file', async () => {
    const error = Object.assign(new Error('Recheck denied'), { code: 'EACCES' });
    vi.mocked(fs.lstat).mockResolvedValueOnce(regular).mockRejectedValueOnce(error);
    await expect(writeNavigationNote(vault, content)).rejects.toBe(error);
    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledExactlyOnceWith(temporary);
  });

  it('retains an undefined write failure despite both close and unlink cleanup failures', async () => {
    vi.mocked(writer.writeFile).mockRejectedValueOnce(undefined);
    vi.mocked(writer.close).mockRejectedValueOnce(new Error('Close denied'));
    vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('Unlink denied'));
    await expect(writeNavigationNote(vault, content)).rejects.toBeUndefined();
    expect(writer.close).toHaveBeenCalledOnce();
    expect(fs.unlink).toHaveBeenCalledExactlyOnceWith(temporary);
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it.each(['absent-to-owned', 'owned-to-absent', 'owned-to-link', 'owned-to-directory', 'owned-to-unowned'])
    ('rejects observed target transition %s and cleans only its temporary file', async (transition) => {
      if (transition === 'absent-to-owned') vi.mocked(fs.lstat).mockRejectedValueOnce(missing);
      else if (transition === 'owned-to-absent') vi.mocked(fs.lstat).mockResolvedValueOnce(regular).mockRejectedValueOnce(missing);
      else if (transition === 'owned-to-unowned') {
        vi.mocked(writer.writeFile).mockImplementationOnce(async () => {
          markerFile('User content');
        });
      } else {
        vi.mocked(fs.lstat).mockResolvedValueOnce(regular).mockResolvedValueOnce({
          isSymbolicLink: () => transition === 'owned-to-link', isFile: () => false,
        } as Stats);
      }
      await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'target-changed' });
      expect(fs.rename).not.toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalledExactlyOnceWith(temporary);
    });
});
