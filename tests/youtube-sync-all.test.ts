import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as application from '../src/application/sync-account.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';
import { FileTokenStore } from '../src/auth/token-store.js';
import { createProgram } from '../src/cli/program.js';
import { syncAllYouTubePlaylists } from '../src/cli/youtube-sync-all.js';
import type { AccountSyncSource } from '../src/collectors/account-sync-source.js';
import * as accountSource from '../src/collectors/youtube/youtube-account-source.js';
import { YouTubeApiClient } from '../src/collectors/youtube/youtube-client.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

let directory: string;
let vault: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-all-setup-'));
  vault = join(directory, 'vault');
  mkdirSync(vault);
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', '');
  vi.stubEnv('OBSIDIAN_VAULT_PATH', '');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const storage: Storage = {
    knowledgeItems: { findByIdentity: vi.fn(), upsert: vi.fn(), listAll: vi.fn() },
    collections: { upsert: vi.fn(), listAll: vi.fn() },
    collectionMemberships: { removeStaleForCollection: vi.fn(), add: vi.fn(), listAll: vi.fn() },
    getImported: vi.fn(), recordImport: vi.fn(), close: vi.fn(),
  };
  const result: application.AccountSyncResult = {
    membershipsRemoved: 2,
    playlists: { discovered: 2, succeeded: 2, failed: 0, unattempted: 0 },
    items: { processed: 3, new: 2, changed: 0, unchanged: 1 },
    failures: [], export: { status: 'not-requested' },
  };
  const source: AccountSyncSource = { discover: vi.fn(), createCollector: vi.fn(), isFatalError: vi.fn() };
  const makeSource = vi.spyOn(accountSource, 'createYouTubeAccountSource').mockReturnValue(source);
  const open = vi.spyOn(sqlite, 'openStorage').mockReturnValue(storage);
  const sync = vi.spyOn(application, 'syncAccount').mockResolvedValue(result);
  const loadConfig = vi.spyOn(config, 'loadGoogleClientConfig')
    .mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
  const token = vi.fn(async () => 'fake-access');
  const provider = vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(token);
  return { storage, result, source, makeSource, open, sync, loadConfig, token, provider };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe('OAuth account sync composition', () => {
  it('creates one OAuth provider/client and delegates once with the original source, storage, and result', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    const { result, storage, source, makeSource, sync, loadConfig, provider, token } = setup();
    expect(await syncAllYouTubePlaylists({})).toBe(result);
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith();
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      { client_id: 'fake-id', client_secret: 'fake-secret' }, expect.any(FileTokenStore),
    );
    expect(token).toHaveBeenCalledExactlyOnceWith();
    expect(makeSource).toHaveBeenCalledExactlyOnceWith(expect.any(YouTubeApiClient));
    expect(sync).toHaveBeenCalledExactlyOnceWith(source, storage, undefined);
    expect(storage.close).toHaveBeenCalledTimes(1);
    for (const spy of [source.discover, source.createCollector, storage.knowledgeItems.upsert,
      storage.collections.upsert, storage.collectionMemberships.add, storage.recordImport, fetch]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('awaits the authorization check before opening SQLite and awaits application completion before closing', async () => {
    const { token, open, sync, result, storage } = setup();
    const authorized = deferred<string>();
    const authorizationStarted = deferred<void>();
    const synced = deferred<application.AccountSyncResult>();
    const syncStarted = deferred<void>();
    token.mockImplementation(() => { authorizationStarted.resolve(); return authorized.promise; });
    sync.mockImplementation(() => { syncStarted.resolve(); return synced.promise; });
    const running = syncAllYouTubePlaylists({});
    await authorizationStarted.promise;
    expect(open).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    authorized.resolve('fake-access');
    await syncStarted.promise;
    expect(open).toHaveBeenCalledTimes(1);
    expect(storage.close).not.toHaveBeenCalled();
    synced.resolve(result);
    expect(await running).toBe(result);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    { env: 'environment.sqlite', options: { db: 'chosen/items.sqlite' }, expected: 'chosen/items.sqlite' },
    { env: 'environment.sqlite', options: {}, expected: 'environment.sqlite' },
    { env: '', options: {}, expected: './data/knowledge-sync.sqlite' },
    { env: undefined, options: {}, expected: './data/knowledge-sync.sqlite' },
  ])('retains option/environment/default database precedence ($expected)', async ({ env, options, expected }) => {
    vi.stubEnv('DATABASE_PATH', env);
    const { open } = setup();
    await syncAllYouTubePlaylists(options);
    expect(open).toHaveBeenCalledExactlyOnceWith(resolve(expected));
  });

  it('does not request export or preflight a vault supplied only through the environment', async () => {
    vi.stubEnv('OBSIDIAN_VAULT_PATH', join(directory, 'nonexistent-environment-vault'));
    const { source, storage, sync } = setup();
    await syncAllYouTubePlaylists({});
    expect(sync).toHaveBeenCalledExactlyOnceWith(source, storage, undefined);
  });

  it('keeps the ordinary environment-vault DB guard without requesting export', async () => {
    vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
    const { loadConfig, provider, open, sync } = setup();
    await expect(syncAllYouTubePlaylists({ db: join(vault, 'items.sqlite') }))
      .rejects.toThrow('must be outside OBSIDIAN_VAULT_PATH');
    for (const spy of [loadConfig, provider, open, sync, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it('uses only the selected explicit vault for export and containment, preserving nonblank path text', async () => {
    vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
    const selected = join(directory, ' selected vault ');
    mkdirSync(selected);
    const { source, storage, sync, open } = setup();
    const db = join(vault, 'items.sqlite');
    await syncAllYouTubePlaylists({ db, vault: selected });
    expect(open).toHaveBeenCalledExactlyOnceWith(db);
    expect(sync).toHaveBeenCalledExactlyOnceWith(source, storage, selected);
    expect(process.env.OBSIDIAN_VAULT_PATH).toBe(vault);
  });

  it.each([
    { options: { db: '' }, hint: 'Database path must not be blank' },
    { options: { db: ' \t ' }, hint: 'Database path must not be blank' },
    { options: { vault: '' }, hint: 'The --vault path must not be blank' },
    { options: { vault: ' \t ' }, hint: 'The --vault path must not be blank' },
  ])('rejects blank explicit options before OAuth or storage ($options)', async ({ options, hint }) => {
    vi.stubEnv('DATABASE_PATH', join(directory, 'fallback.sqlite'));
    vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
    const { loadConfig, provider, open, sync } = setup();
    await expect(syncAllYouTubePlaylists(options)).rejects.toThrow(hint);
    for (const spy of [loadConfig, provider, open, sync, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it.each(['missing', 'file'])('preflights an explicit %s vault before OAuth, discovery, or storage', async (kind) => {
    const selected = join(directory, kind);
    if (kind === 'file') writeFileSync(selected, 'isolated fixture');
    const { loadConfig, provider, token, open, sync, makeSource } = setup();
    await expect(syncAllYouTubePlaylists({ vault: selected })).rejects.toMatchObject({
      message: 'The --vault path must be an existing directory. Check its path and permissions.',
      cause: expect.any(Error),
    });
    for (const spy of [loadConfig, provider, token, open, sync, makeSource, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it('guards the selected vault through a junction alias and accepts a sibling database', async () => {
    const alias = join(directory, 'alias');
    symlinkSync(vault, alias, process.platform === 'win32' ? 'junction' : 'dir');
    vi.stubEnv('OBSIDIAN_VAULT_PATH', join(directory, 'overridden'));
    const { loadConfig, open, sync } = setup();
    await expect(syncAllYouTubePlaylists({ vault, db: join(alias, 'nested', 'items.sqlite') }))
      .rejects.toThrow('must be outside the selected vault');
    await expect(syncAllYouTubePlaylists({ vault: alias, db: join(vault, 'items.sqlite') }))
      .rejects.toThrow('must be outside the selected vault');
    expect(loadConfig).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    const db = join(directory, 'vault-other', 'items.sqlite');
    await syncAllYouTubePlaylists({ vault, db });
    expect(open).toHaveBeenCalledExactlyOnceWith(db);
  });

  it.each(['configuration', 'authorization'])('preserves %s errors without API-key fallback or database access', async (stage) => {
    const { loadConfig, provider, token, open, sync, makeSource } = setup();
    const error = new config.GoogleAuthError('OAuth authorization unavailable.');
    if (stage === 'configuration') loadConfig.mockRejectedValue(error);
    else token.mockRejectedValue(error);
    await expect(syncAllYouTubePlaylists({})).rejects.toBe(error);
    if (stage === 'configuration') expect(provider).not.toHaveBeenCalled();
    for (const spy of [open, sync, makeSource, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it('preserves the safe database-open diagnostic and does not start discovery', async () => {
    const { open, sync, makeSource, storage } = setup();
    const cause = new Error('fake-secret lower-level details');
    open.mockImplementation(() => { throw cause; });
    await expect(syncAllYouTubePlaylists({})).rejects.toMatchObject({
      message: 'Cannot open the SQLite database. Check --db or DATABASE_PATH and directory permissions.', cause,
    });
    for (const spy of [sync, makeSource, storage.close, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it.each([new Error('application failed'), { detail: 'unknown failure' }, undefined])
  ('closes storage and preserves any thrown application value (%j)', async (error) => {
    const { sync, storage } = setup();
    sync.mockRejectedValue(error);
    await expect(syncAllYouTubePlaylists({})).rejects.toBe(error);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('returns fatal and partial application outcomes unchanged while closing storage', async () => {
    const { sync, storage, result } = setup();
    const partial: application.AccountSyncResult = {
      ...result,
      playlists: { discovered: 3, succeeded: 1, failed: 1, unattempted: 1 },
      failures: [{ playlistId: 'PLtwo', error: undefined }],
      fatal: { stage: 'playlist', error: undefined },
      export: { status: 'skipped', navigation: { status: 'skipped', reason: 'upstream-failure' } },
    };
    sync.mockResolvedValue(partial);
    expect(await syncAllYouTubePlaylists({ vault })).toBe(partial);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it.each([{ args: [] }, { args: ['--help'] }, { args: ['youtube', 'sync-all', '--help'] }])
  ('keeps real startup/help lazy ($args)', async ({ args }) => {
    const { loadConfig, provider, token, open, sync, makeSource } = setup();
    const loadToken = vi.spyOn(FileTokenStore.prototype, 'loadRefreshToken');
    const program = createProgram();
    const configure = (command: import('commander').Command) => {
      command.exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
      command.commands.forEach(configure);
    };
    configure(program);
    if (args.includes('--help')) await expect(program.parseAsync(args, { from: 'user' })).rejects.toMatchObject({ exitCode: 0 });
    else await program.parseAsync(args, { from: 'user' });
    for (const spy of [loadConfig, provider, token, loadToken, open, sync, makeSource, fetch]) expect(spy).not.toHaveBeenCalled();
  });
});
