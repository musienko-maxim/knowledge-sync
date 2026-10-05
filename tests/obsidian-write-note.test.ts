import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeObsidianNote } from '../src/outputs/obsidian/write-note.js';

// A configurable facade preserves real filesystem calls except where a test
// injects failures or guards against writes outside its temporary fixture.
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
}));

let directory: string;
let vault: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'knowledge-sync-writer-'));
  vault = join(directory, 'vault');
  await fs.mkdir(vault);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const cleanupPath = resolve(directory);
  if (dirname(cleanupPath) !== resolve(tmpdir()) || !basename(cleanupPath).startsWith('knowledge-sync-writer-')) {
    throw new Error('Unexpected writer-test cleanup path.');
  }
  await fs.rm(cleanupPath, { recursive: true, force: true });
});

describe('writeObsidianNote', () => {
  it('writes to the requested location and returns no result', async () => {
    expect(await writeObsidianNote(vault, 'note.md', '# A note\n')).toBeUndefined();
    expect(await fs.readFile(join(vault, 'note.md'), 'utf8')).toBe('# A note\n');
    expect(await fs.readdir(vault)).toEqual(['note.md']);
  });

  it.each([
    '', 'No final newline', 'LF\nSecond line\n', 'CRLF\r\nSecond line\r\n',
    'Trailing blank lines\n\n\n', 'Mixed\r\nline endings\nand spaces  ',
    'Привіт 世界 🚀 e\u0301 é', '---\ntitle: "true"\n---\n\n# **Title**\n[link](url)\n',
    '\ufeffSupplied BOM is content',
  ])('preserves exact UTF-8 content %j without adding a BOM or formatting', async (content) => {
    await writeObsidianNote(vault, 'note.md', content);
    const bytes = await fs.readFile(join(vault, 'note.md'));
    expect(bytes).toEqual(Buffer.from(content, 'utf8'));
    expect(bytes.toString('utf8')).toBe(content);
  });

  it('creates nested parents only below the existing vault', async () => {
    await writeObsidianNote(vault, 'youtube/drones/video.md', 'Nested');
    expect(await fs.readFile(join(vault, 'youtube', 'drones', 'video.md'), 'utf8')).toBe('Nested');
    expect(await fs.readdir(directory)).toEqual(['vault']);
  });

  it('fully overwrites a longer file and repeated writes leave identical content', async () => {
    const destination = join(vault, 'note.md');
    await fs.writeFile(destination, 'Old content much longer than replacement', 'utf8');
    await writeObsidianNote(vault, 'note.md', 'New');
    expect(await fs.readFile(destination, 'utf8')).toBe('New');
    await writeObsidianNote(vault, 'note.md', 'New');
    expect(await fs.readFile(destination, 'utf8')).toBe('New');
    expect(await fs.readdir(vault)).toEqual(['note.md']);
    await writeObsidianNote(vault, 'note.md', '');
    expect((await fs.stat(destination)).size).toBe(0);
  });

  it('allows contained parent-segment normalization without creating discarded directories', async () => {
    await writeObsidianNote(vault, 'folder/../note.md', 'Contained');
    expect(await fs.readFile(join(vault, 'note.md'), 'utf8')).toBe('Contained');
    expect(await fs.readdir(vault)).toEqual(['note.md']);
  });

  it('accepts a relative vault path resolved against the working directory', async () => {
    // The temp directory can be on another Windows drive; mocked cwd keeps this
    // test relative without changing process-global cwd or the real filesystem root.
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    await writeObsidianNote('vault', 'note.md', 'Relative vault');
    expect(await fs.readFile(join(vault, 'note.md'), 'utf8')).toBe('Relative vault');
  });

  it('preserves meaningful whitespace in vault and destination names', async () => {
    const spacedVault = join(directory, ' vault with spaces');
    await fs.mkdir(spacedVault);
    await writeObsidianNote(spacedVault, ' notes with spaces/ note .md', '  Content  ');
    expect(await fs.readFile(join(spacedVault, ' notes with spaces', ' note .md'), 'utf8')).toBe('  Content  ');
  });

  it('accepts names beginning with two dots that are not parent segments', async () => {
    await writeObsidianNote(vault, '..notes/note.md', 'Not traversal');
    expect(await fs.readFile(join(vault, '..notes', 'note.md'), 'utf8')).toBe('Not traversal');
  });

  it.each(['', ' ', '\t\n'])('rejects blank vault path %j before filesystem changes', async (path) => {
    const makeDirectory = vi.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Unexpected mkdir'));
    const write = vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Unexpected write'));
    await expect(writeObsidianNote(path, 'note.md', 'Text')).rejects.toThrow('Vault path must not be blank');
    expect(makeDirectory).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  const invalidPaths = [
    '', ' ', '.', './', 'folder/..', '../outside.md', '../../outside.md',
    'nested/../../outside.md', '../vault-other/note.md', '/outside/note.md',
    ...(process.platform === 'win32' ? [
      '..\\outside.md', '..\\..\\outside.md', 'nested\\..\\..\\outside.md',
      'nested/..\\../outside.md', 'folder\\..',
      'C:\\outside\\note.md', 'C:/outside/note.md', 'C:note.md', 'C:',
      '\\outside\\note.md', '\\\\server\\share\\note.md', '\\\\?\\C:\\outside\\note.md',
    ] : []),
  ];
  it.each(invalidPaths)('rejects unsafe or root-equivalent note path %j before filesystem changes', async (path) => {
    // Also prevent accidental writes outside the fixture if validation regresses.
    const makeDirectory = vi.spyOn(fs, 'mkdir').mockRejectedValue(new Error('Unexpected mkdir'));
    const write = vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Unexpected write'));
    await expect(writeObsidianNote(vault, path, 'Text')).rejects.toThrow('Note path must');
    expect(makeDirectory).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(await fs.readdir(vault)).toEqual([]);
    expect(await fs.readdir(directory)).toEqual(['vault']);
  });

  it('rejects an absolute destination even when it points inside the vault', async () => {
    await expect(writeObsidianNote(vault, join(vault, 'note.md'), 'Text')).rejects.toThrow('relative path');
    expect(await fs.readdir(vault)).toEqual([]);
  });

  if (process.platform === 'win32') {
    it('accepts both Windows separators and mixed-case vault paths', async () => {
      await writeObsidianNote(vault.toUpperCase(), 'youtube\\drones/video.md', 'Windows path');
      expect(await fs.readFile(join(vault, 'youtube', 'drones', 'video.md'), 'utf8')).toBe('Windows path');
    });
  } else {
    it.each(['..\\note.md', 'C:note.md'])('uses native POSIX filenames without translating %j', async (path) => {
      await writeObsidianNote(vault, path, 'Native path');
      expect(await fs.readdir(vault)).toEqual([path]);
      expect(await fs.readFile(join(vault, path), 'utf8')).toBe('Native path');
    });
  }

  it('does not create a missing vault or its hierarchy', async () => {
    const missingVault = join(directory, 'missing', 'vault');
    await expect(writeObsidianNote(missingVault, 'nested/note.md', 'Text')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readdir(directory)).toEqual(['vault']);
  });

  it('rejects a regular file as the vault root without changing it', async () => {
    const file = join(directory, 'file');
    await fs.writeFile(file, 'Original');
    await expect(writeObsidianNote(file, 'nested/note.md', 'Text')).rejects.toThrow('existing directory');
    expect(await fs.readFile(file, 'utf8')).toBe('Original');
  });

  it('propagates a native error when a destination parent is a file', async () => {
    const parent = join(vault, 'blocked');
    await fs.writeFile(parent, 'Original');
    await expect(writeObsidianNote(vault, 'blocked/nested/note.md', 'Text'))
      .rejects.toMatchObject({ code: expect.any(String) });
    expect(await fs.readFile(parent, 'utf8')).toBe('Original');
  });

  it('propagates a native error when the destination is a directory', async () => {
    const destination = join(vault, 'note.md');
    await fs.mkdir(destination);
    await expect(writeObsidianNote(vault, 'note.md', 'Text')).rejects.toMatchObject({ code: expect.any(String) });
    expect((await fs.stat(destination)).isDirectory()).toBe(true);
  });

  it.each(['stat', 'mkdir', 'writeFile'] as const)('preserves the original %s failure', async (operation) => {
    const error = Object.assign(new Error('Injected filesystem failure'), { code: 'EIO' });
    vi.spyOn(fs, operation).mockRejectedValue(error);
    await expect(writeObsidianNote(vault, 'note.md', 'Text')).rejects.toBe(error);
  });
});
