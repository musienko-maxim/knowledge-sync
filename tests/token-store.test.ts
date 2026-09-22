import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileTokenStore } from '../src/auth/token-store.js';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-tokens-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('FileTokenStore', () => {
  it('creates the parent directory, persists only the refresh token, replaces atomically and deletes idempotently', async () => {
    const path = join(directory, 'nested', 'youtube-oauth.json');
    const store = new FileTokenStore(path);
    expect(await store.loadRefreshToken()).toBeNull();
    expect(await store.deleteRefreshToken()).toBe(false);
    await store.saveRefreshToken('fake-refresh-one');
    expect(await new FileTokenStore(path).loadRefreshToken()).toBe('fake-refresh-one');
    await store.saveRefreshToken('fake-refresh-two');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ refresh_token: 'fake-refresh-two' });
    expect(await readdir(join(directory, 'nested'))).toEqual(['youtube-oauth.json']);
    expect(await store.deleteRefreshToken()).toBe(true);
    expect(await store.deleteRefreshToken()).toBe(false);
    expect(await store.loadRefreshToken()).toBeNull();
  });

  it.each(['{fake-secret', '{}', '{"refresh_token":" "}', '{"refresh_token":123}',
    '{"refresh_token":"fake-refresh","access_token":"fake-access"}'])('rejects malformed token files without exposing content', async (contents) => {
    const path = join(directory, 'youtube-oauth.json');
    await writeFile(path, contents);
    await expect(new FileTokenStore(path).loadRefreshToken()).rejects.toThrow('token file is malformed');
  });

  it('rejects blank writes without replacing an existing authorization', async () => {
    const store = new FileTokenStore(join(directory, 'youtube-oauth.json'));
    await store.saveRefreshToken('fake-existing');
    await expect(store.saveRefreshToken(' ')).rejects.toThrow('empty YouTube refresh token');
    expect(await store.loadRefreshToken()).toBe('fake-existing');
  });

  it('reports filesystem failures safely and removes failed temporary writes', async () => {
    const path = join(directory, 'youtube-oauth.json');
    await mkdir(path);
    const store = new FileTokenStore(path);
    await expect(store.loadRefreshToken()).rejects.toThrow('token file is unreadable');
    await expect(store.saveRefreshToken('fake-secret')).rejects.toThrow('Could not save');
    await expect(store.deleteRefreshToken()).rejects.toThrow('Could not remove');
    expect(await readdir(directory)).toEqual(['youtube-oauth.json']);
  });

  it.runIf(process.platform !== 'win32')('uses restrictive POSIX directory and file permissions', async () => {
    const parent = join(directory, 'config');
    const path = join(parent, 'youtube-oauth.json');
    await new FileTokenStore(path).saveRefreshToken('fake-refresh');
    expect((await stat(parent)).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('rejects repository paths for every token operation', async () => {
    const store = new FileTokenStore(resolve('youtube-oauth.json'));
    await expect(store.loadRefreshToken()).rejects.toThrow('outside the repository');
    await expect(store.saveRefreshToken('fake-refresh')).rejects.toThrow('outside the repository');
    await expect(store.deleteRefreshToken()).rejects.toThrow('outside the repository');
  });

  it('rejects an external directory symlink pointing back into the repository', async () => {
    const link = join(directory, 'linked-repository');
    await symlink(resolve('.'), link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new FileTokenStore(join(link, 'youtube-oauth.json')).loadRefreshToken())
      .rejects.toThrow('outside the repository');
  });
});
