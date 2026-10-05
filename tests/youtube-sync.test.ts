import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as application from '../src/application/sync-collection.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';
import { FileTokenStore } from '../src/auth/token-store.js';
import { createProgram } from '../src/cli/program.js';
import { syncYouTubePlaylist } from '../src/cli/youtube-sync.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import * as parser from '../src/collectors/youtube/playlist-id.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

const directories: string[] = [];
beforeEach(() => {
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', '');
  vi.stubEnv('OBSIDIAN_VAULT_PATH', '');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const storage: Storage = {
    knowledgeItems: { findByIdentity: vi.fn(), listAll: vi.fn(), upsert: vi.fn() },
    collections: { upsert: vi.fn(), listAll: vi.fn() },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn() },
    getImported: vi.fn(), recordImport: vi.fn(), close: vi.fn(),
  };
  const open = vi.spyOn(sqlite, 'openStorage').mockReturnValue(storage);
  const sync = vi.spyOn(application, 'syncCollection').mockResolvedValue({ processed: 7, new: 2, changed: 1, unchanged: 4 });
  const collect = vi.spyOn(YouTubeCollector.prototype, 'collectCollection');
  const parse = vi.spyOn(parser, 'parsePlaylistId');
  const loadConfig = vi.spyOn(config, 'loadGoogleClientConfig')
    .mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
  const token = vi.fn(async () => 'fake-access');
  const provider = vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(token);
  return { storage, open, sync, collect, parse, loadConfig, token, provider };
}

describe('single-playlist composition', () => {
  it.each(['PLone', 'https://www.youtube.com/playlist?list=PLone'])
  ('delegates %s parsing and persistence without collecting or writing independently', async (playlist) => {
    const { storage, sync, collect, parse, loadConfig, provider } = setup();
    expect(await syncYouTubePlaylist(playlist, { auth: 'api-key' })).toEqual({ processed: 7, new: 2, changed: 1, unchanged: 4 });
    expect(parse).toHaveBeenCalledExactlyOnceWith(playlist);
    expect(sync).toHaveBeenCalledExactlyOnceWith(expect.any(YouTubeCollector), storage);
    expect(collect).not.toHaveBeenCalled();
    expect(storage.knowledgeItems.upsert).not.toHaveBeenCalled();
    expect(storage.recordImport).not.toHaveBeenCalled();
    expect(storage.close).toHaveBeenCalledTimes(1);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('uses the existing OAuth configuration/provider and token store without an API key', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    const { provider, loadConfig, token, sync } = setup();
    await syncYouTubePlaylist('PLone', { auth: 'oauth' });
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith();
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      { client_id: 'fake-id', client_secret: 'fake-secret' }, expect.any(FileTokenStore),
    );
    expect(token).not.toHaveBeenCalled(); // Token retrieval belongs to client requests.
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', '  '])('rejects missing/blank API keys (%j) without opening storage or falling back', async (key) => {
    vi.stubEnv('YOUTUBE_API_KEY', key);
    const { open, sync, loadConfig } = setup();
    await expect(syncYouTubePlaylist('PLone', { auth: 'api-key' })).rejects.toThrow('Set YOUTUBE_API_KEY');
    expect(open).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it('preserves configuration failures in OAuth mode without falling back to an available API key', async () => {
    const { loadConfig, open, sync } = setup();
    const error = new config.GoogleAuthError('Google Desktop credentials file is missing.');
    loadConfig.mockRejectedValue(error);
    await expect(syncYouTubePlaylist('PLone', { auth: 'oauth' })).rejects.toBe(error);
    expect(open).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('rejects malformed playlist input before opening storage', async () => {
    const { open, sync } = setup();
    await expect(syncYouTubePlaylist('https://example.com/?list=PLone', { auth: 'api-key' }))
      .rejects.toThrow('Unsupported YouTube playlist URL');
    expect(open).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('closes storage and propagates a sync failure unchanged', async () => {
    const { storage, sync } = setup();
    const error = new Error('injected repository failure');
    sync.mockRejectedValue(error);
    await expect(syncYouTubePlaylist('PLone', { auth: 'api-key' })).rejects.toBe(error);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('reports a safe actionable storage-open failure without invoking sync', async () => {
    const { open, sync } = setup();
    const cause = new Error('fake-secret lower-level details');
    open.mockImplementation(() => { throw cause; });
    await expect(syncYouTubePlaylist('PLone', { auth: 'api-key' })).rejects.toMatchObject({
      message: 'Cannot open the SQLite database. Check --db or DATABASE_PATH and directory permissions.', cause,
    });
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([
    { env: 'env.sqlite', options: { auth: 'api-key' as const, db: 'chosen/items.sqlite' }, expected: 'chosen/items.sqlite' },
    { env: 'env.sqlite', options: { auth: 'api-key' as const }, expected: 'env.sqlite' },
    { env: '', options: { auth: 'api-key' as const }, expected: './data/knowledge-sync.sqlite' },
    { env: undefined, options: { auth: 'api-key' as const }, expected: './data/knowledge-sync.sqlite' },
  ])('resolves database precedence against the working directory ($expected)', async ({ env, options, expected }) => {
    vi.stubEnv('DATABASE_PATH', env);
    const { open } = setup();
    await syncYouTubePlaylist('PLone', options);
    expect(open).toHaveBeenCalledExactlyOnceWith(resolve(expected));
  });

  it.each(['', '  '])('rejects an explicit blank database override instead of falling back (%j)', async (db) => {
    const { open } = setup();
    await expect(syncYouTubePlaylist('PLone', { auth: 'api-key', db })).rejects.toThrow('Database path must not be blank');
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects paths inside the configured vault, including a directory junction, and accepts a sibling', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-path-'));
    directories.push(directory);
    const vault = join(directory, 'vault');
    mkdirSync(vault);
    const alias = join(directory, 'alias');
    symlinkSync(vault, alias, process.platform === 'win32' ? 'junction' : 'dir');
    vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
    const { open } = setup();
    for (const db of [vault, join(vault, 'nested', 'items.sqlite'), join(alias, 'nested', 'items.sqlite')]) {
      await expect(syncYouTubePlaylist('PLone', { auth: 'api-key', db })).rejects.toThrow('must be outside OBSIDIAN_VAULT_PATH');
    }
    expect(open).not.toHaveBeenCalled();
    const sibling = join(directory, 'vault-other', 'items.sqlite');
    await syncYouTubePlaylist('PLone', { auth: 'api-key', db: sibling });
    expect(open).toHaveBeenCalledExactlyOnceWith(sibling);
  });

  it.each([[], ['--help'], ['youtube', '--help'], ['youtube', 'sync', '--help'], ['youtube', 'sync-obsidian', '--help']])
  ('real startup/help does not access credentials, authenticate, fetch, or open storage (%j)', async (...args: string[]) => {
    const { loadConfig, provider, open, sync } = setup();
    const loadToken = vi.spyOn(FileTokenStore.prototype, 'loadRefreshToken');
    const program = createProgram();
    const configure = (command: import('commander').Command) => {
      command.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
      command.commands.forEach(configure);
    };
    configure(program);
    if (args.includes('--help')) await expect(program.parseAsync(args, { from: 'user' })).rejects.toMatchObject({ exitCode: 0 });
    else await program.parseAsync(args, { from: 'user' });
    for (const spy of [loadConfig, provider, open, sync, loadToken, fetch]) expect(spy).not.toHaveBeenCalled();
  });
});
