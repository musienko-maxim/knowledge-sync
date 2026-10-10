import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_MARKER } from '../src/outputs/obsidian/navigation-markdown.js';
import { NAVIGATION_FILENAME, writeNavigationNote } from '../src/outputs/obsidian/write-navigation.js';

vi.mock('node:fs/promises', async (importOriginal) => ({ ...await importOriginal<typeof import('node:fs/promises')>() }));
vi.mock('node:crypto', async (importOriginal) => ({ ...await importOriginal<typeof import('node:crypto')>() }));

let directory: string;
let vault: string;
let target: string;
const content = `${NAVIGATION_MARKER}\n\n# Knowledge Sync\n\n## Collections\n\n_No collections._\n\n## All items\n\n_No items._\n`;
const oldContent = `\ufeff${NAVIGATION_MARKER}\r\nManual edits to a recognized page are replaceable.\r\n`;

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'knowledge-sync-navigation-'));
  vault = join(directory, 'vault');
  target = join(vault, NAVIGATION_FILENAME);
  await fs.mkdir(vault);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-navigation-')) {
    throw new Error('Unexpected navigation-test cleanup path.');
  }
  await fs.rm(cleanup, { recursive: true, force: true });
});

describe('navigation writer real filesystem integration', () => {
  it('creates, replaces existing owned files, and preserves exact bytes on repeat on the host platform', async () => {
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target)).toEqual(Buffer.from(content));
    await fs.writeFile(target, oldContent);
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target)).toEqual(Buffer.from(content));
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target)).toEqual(Buffer.from(content));
    expect(await fs.readdir(vault)).toEqual([NAVIGATION_FILENAME]);
  });

  it('resolves relative vault paths and retains meaningful path whitespace', async () => {
    const spacedVault = join(directory, ' vault with spaces');
    await fs.mkdir(spacedVault);
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    await writeNavigationNote(' vault with spaces', content);
    expect(await fs.readFile(join(spacedVault, NAVIGATION_FILENAME), 'utf8')).toBe(content);
    expect(await fs.readdir(vault)).toEqual([]);
  });

  it('does not create a missing vault or accept a file as the root', async () => {
    await expect(writeNavigationNote(join(directory, 'missing', 'vault'), content)).rejects.toMatchObject({ code: 'ENOENT' });
    const file = join(directory, 'file');
    await fs.writeFile(file, 'User file');
    await expect(writeNavigationNote(file, content)).rejects.toThrow('existing directory');
    expect(await fs.readFile(file, 'utf8')).toBe('User file');
    expect((await fs.readdir(directory)).sort()).toEqual(['file', 'vault']);
  });

  it('preserves a user file and a target directory without temporary artifacts', async () => {
    await fs.writeFile(target, '# User page\n');
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'unowned-target' });
    expect(await fs.readFile(target, 'utf8')).toBe('# User page\n');
    await fs.unlink(target);
    await fs.mkdir(target);
    await fs.writeFile(join(target, 'user.txt'), 'Keep');
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'non-regular-target' });
    expect(await fs.readFile(join(target, 'user.txt'), 'utf8')).toBe('Keep');
    expect(await fs.readdir(vault)).toEqual([NAVIGATION_FILENAME]);
  });

  it.each(['write', 'close', 'rename'] as const)('preserves the old page after %s failure and succeeds on retry', async (stage) => {
    await fs.writeFile(target, oldContent);
    const error = Object.assign(new Error('Injected transient failure'), { code: 'EIO' });
    const originalOpen = fs.open;
    const renamer = vi.spyOn(fs, 'rename');
    const remover = vi.spyOn(fs, 'unlink');
    if (stage === 'rename') renamer.mockRejectedValueOnce(error);
    else vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      const handle = await originalOpen(path, flags, mode);
      if (flags === 'wx') {
        if (stage === 'write') vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
          await handle.write('Partial temporary bytes');
          throw error;
        });
        else {
          const close = handle.close.bind(handle);
          vi.spyOn(handle, 'close').mockImplementationOnce(async () => { await close(); throw error; });
        }
      }
      return handle;
    });
    await expect(writeNavigationNote(vault, content)).rejects.toBe(error);
    expect(await fs.readFile(target, 'utf8')).toBe(oldContent);
    expect(await fs.readdir(vault)).toEqual([NAVIGATION_FILENAME]);
    expect(remover).toHaveBeenCalledOnce();
    expect(remover.mock.calls[0]?.[0]).not.toBe(target);
    expect(dirname(String(remover.mock.calls[0]?.[0]))).toBe(vault);
    expect(renamer).toHaveBeenCalledTimes(stage === 'rename' ? 1 : 0);
    vi.restoreAllMocks();
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target, 'utf8')).toBe(content);
  });

  it('leaves an absent target absent after partial preparation fails', async () => {
    const open = fs.open;
    vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
        await handle.write('Partial bytes');
        throw undefined;
      });
      return handle;
    });
    await expect(writeNavigationNote(vault, content)).rejects.toBeUndefined();
    expect(await fs.readdir(vault)).toEqual([]);
    vi.restoreAllMocks();
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target, 'utf8')).toBe(content);
  });

  it('preserves an exclusive temp collision and an orphan while a new invocation retries', async () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const orphan = join(vault, `.knowledge-sync-navigation-${uuid}.tmp`);
    await fs.writeFile(orphan, 'Unrelated orphan bytes');
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(uuid);
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(orphan, 'utf8')).toBe('Unrelated orphan bytes');
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target, 'utf8')).toBe(content);
    expect(await fs.readFile(orphan, 'utf8')).toBe('Unrelated orphan bytes');
    expect((await fs.readdir(vault)).sort()).toEqual([basename(orphan), NAVIGATION_FILENAME].sort());
  });

  it('retains a primary undefined failure when cleanup fails; its orphan survives retry', async () => {
    await fs.writeFile(target, oldContent);
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(undefined);
    vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('Cleanup denied'));
    await expect(writeNavigationNote(vault, content)).rejects.toBeUndefined();
    const orphan = String(rename.mock.calls[0]?.[0]);
    expect(dirname(orphan)).toBe(vault);
    expect(await fs.readFile(orphan, 'utf8')).toBe(content);
    expect(await fs.readFile(target, 'utf8')).toBe(oldContent);
    vi.restoreAllMocks();
    await writeNavigationNote(vault, content);
    expect(await fs.readFile(target, 'utf8')).toBe(content);
    expect(await fs.readFile(orphan, 'utf8')).toBe(content);
  });

  it('rechecks ownership and preserves an observed user replacement', async () => {
    await fs.writeFile(target, oldContent);
    const open = fs.open;
    vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (flags === 'wx') {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, 'close').mockImplementationOnce(async () => {
          await close();
          await fs.writeFile(target, 'User replacement');
        });
      }
      return handle;
    });
    await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'target-changed' });
    expect(await fs.readFile(target, 'utf8')).toBe('User replacement');
    expect(await fs.readdir(vault)).toEqual([NAVIGATION_FILENAME]);
  });

  for (const kind of ['file', 'dir', 'dangling'] as const) {
    it(`attempts a real ${kind} symlink and rejects it without following its destination`, async (context) => {
      const destination = join(directory, 'link-destination');
      if (kind === 'file') await fs.writeFile(destination, oldContent);
      if (kind === 'dir') await fs.mkdir(destination);
      try {
        await fs.symlink(destination, target, kind === 'dir' ? 'dir' : 'file');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'ENOTSUP') throw error;
        console.warn(`Real ${kind} symlink unavailable on ${process.platform}: ${code}. Mocked link rejection still runs.`);
        context.skip(`Host does not permit ${kind} symlink creation: ${code}`);
      }
      await expect(writeNavigationNote(vault, content)).rejects.toMatchObject({ reason: 'symlink-target' });
      expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);
      if (kind === 'file') expect(await fs.readFile(destination, 'utf8')).toBe(oldContent);
      if (kind === 'dir') expect(await fs.readdir(destination)).toEqual([]);
      if (kind === 'dangling') await expect(fs.lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await fs.readdir(vault)).toEqual([NAVIGATION_FILENAME]);
    });
  }
});
