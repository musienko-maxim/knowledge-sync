import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as application from '../src/application/sync-collection-to-obsidian.js';
import type { SyncToObsidianResult } from '../src/application/sync-to-obsidian.js';
import * as syncApplication from '../src/application/sync.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';
import { FileTokenStore } from '../src/auth/token-store.js';
import { syncYouTubePlaylistToObsidian } from '../src/cli/youtube-sync.js';
import * as parser from '../src/collectors/youtube/playlist-id.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import * as output from '../src/outputs/obsidian/export-notes.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

let directory: string;
let vault: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-obsidian-setup-'));
  vault = join(directory, 'vault');
  mkdirSync(vault);
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', '');
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
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
    knowledgeItems: { findByIdentity: vi.fn(), listAll: vi.fn(), upsert: vi.fn() },
    collections: { upsert: vi.fn(), listAll: vi.fn() },
    collectionMemberships: { add: vi.fn(), listAll: vi.fn() },
    getImported: vi.fn(), recordImport: vi.fn(), close: vi.fn(),
  };
  const result: SyncToObsidianResult = {
    sync: { processed: 7, new: 2, changed: 1, unchanged: 4 },
    export: { processed: 9, succeeded: 9, failed: 0, failures: [] },
  };
  const open = vi.spyOn(sqlite, 'openStorage').mockReturnValue(storage);
  const orchestrate = vi.spyOn(application, 'syncCollectionToObsidian').mockResolvedValue(result);
  const sync = vi.spyOn(syncApplication, 'sync');
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const collect = vi.spyOn(YouTubeCollector.prototype, 'collectCollection');
  const parse = vi.spyOn(parser, 'parsePlaylistId');
  const loadConfig = vi.spyOn(config, 'loadGoogleClientConfig')
    .mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
  const token = vi.fn(async () => 'fake-access');
  const provider = vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(token);
  return { storage, result, open, orchestrate, sync, exportNotes, collect, parse, loadConfig, token, provider };
}

describe('YouTube to Obsidian composition', () => {
  it.each(['PLone', 'https://www.youtube.com/playlist?list=PLone'])
  ('delegates %s to the application exactly once and returns the original result', async (playlist) => {
    const { result, storage, orchestrate, sync, exportNotes, collect, parse, loadConfig, provider } = setup();
    expect(await syncYouTubePlaylistToObsidian(playlist, { auth: 'api-key' })).toBe(result);
    expect(parse).toHaveBeenCalledExactlyOnceWith(playlist);
    expect(orchestrate).toHaveBeenCalledExactlyOnceWith(expect.any(YouTubeCollector), storage, vault);
    for (const spy of [sync, exportNotes, collect, storage.knowledgeItems.listAll,
      storage.knowledgeItems.upsert, storage.recordImport, loadConfig, provider, fetch]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('reuses OAuth configuration, provider and token store without fetching tokens in setup', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    const { provider, loadConfig, token, orchestrate } = setup();
    await syncYouTubePlaylistToObsidian('PLone', { auth: 'oauth' });
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith();
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      { client_id: 'fake-id', client_secret: 'fake-secret' }, expect.any(FileTokenStore),
    );
    expect(token).not.toHaveBeenCalled();
    expect(orchestrate).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', '  '])('rejects missing/blank API keys (%j) without OAuth fallback', async (key) => {
    vi.stubEnv('YOUTUBE_API_KEY', key);
    const { open, orchestrate, loadConfig } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key' })).rejects.toThrow('Set YOUTUBE_API_KEY');
    for (const spy of [open, orchestrate, loadConfig]) expect(spy).not.toHaveBeenCalled();
  });

  it('preserves OAuth configuration failure without falling back to API key', async () => {
    const { loadConfig, open, orchestrate } = setup();
    const error = new config.GoogleAuthError('Google Desktop credentials file is missing.');
    loadConfig.mockRejectedValue(error);
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'oauth' })).rejects.toBe(error);
    expect(open).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();
  });

  it('reuses playlist validation before storage opening', async () => {
    const { open, orchestrate } = setup();
    await expect(syncYouTubePlaylistToObsidian('https://example.com/?list=PLone', { auth: 'api-key' }))
      .rejects.toThrow('Unsupported YouTube playlist URL');
    expect(open).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '  '])('rejects missing/blank vault environment (%j) before any dependency setup', async (value) => {
    vi.stubEnv('OBSIDIAN_VAULT_PATH', value);
    const { open, orchestrate, loadConfig, provider, parse, collect } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'oauth' }))
      .rejects.toThrow('Set --vault or OBSIDIAN_VAULT_PATH');
    for (const spy of [open, orchestrate, loadConfig, provider, parse, collect, fetch]) expect(spy).not.toHaveBeenCalled();
  });

  it.each(['', ' \t '])('rejects an explicit blank vault (%j) without falling back to the environment', async (value) => {
    const { open, orchestrate, loadConfig, parse } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'oauth', vault: value }))
      .rejects.toThrow('Set --vault or OBSIDIAN_VAULT_PATH');
    for (const spy of [open, orchestrate, loadConfig, parse]) expect(spy).not.toHaveBeenCalled();
  });

  it('passes a nonblank vault override unchanged and does not mutate the environment', async () => {
    const { orchestrate, storage } = setup();
    const selected = join(directory, ' vault with spaces ');
    await syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', vault: selected });
    expect(orchestrate).toHaveBeenCalledExactlyOnceWith(expect.any(YouTubeCollector), storage, selected);
    expect(process.env.OBSIDIAN_VAULT_PATH).toBe(vault);
  });

  it.each([
    { env: 'env.sqlite', db: 'chosen/items.sqlite', expected: 'chosen/items.sqlite' },
    { env: 'env.sqlite', expected: 'env.sqlite' },
    { env: '', expected: './data/knowledge-sync.sqlite' },
    { env: undefined, expected: './data/knowledge-sync.sqlite' },
  ])('retains database precedence ($expected)', async ({ env, db, expected }) => {
    vi.stubEnv('DATABASE_PATH', env);
    const { open } = setup();
    await syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', ...(db === undefined ? {} : { db }) });
    expect(open).toHaveBeenCalledExactlyOnceWith(resolve(expected));
  });

  it.each(['', '  '])('rejects an explicit blank DB (%j) without falling back', async (db) => {
    vi.stubEnv('DATABASE_PATH', join(directory, 'fallback.sqlite'));
    const { open } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', db }))
      .rejects.toThrow('Database path must not be blank');
    expect(open).not.toHaveBeenCalled();
  });

  it('guards the selected vault including existing-ancestor aliases and accepts a sibling', async () => {
    const alias = join(directory, 'alias');
    symlinkSync(vault, alias, process.platform === 'win32' ? 'junction' : 'dir');
    vi.stubEnv('OBSIDIAN_VAULT_PATH', join(directory, 'overridden'));
    const { open, orchestrate } = setup();
    for (const selected of [vault, alias]) {
      for (const db of [vault, join(vault, 'missing', 'items.sqlite'), join(alias, 'missing', 'items.sqlite')]) {
        await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', vault: selected, db }))
          .rejects.toThrow('must be outside the selected Obsidian vault');
      }
    }
    expect(open).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();
    const sibling = join(directory, 'vault-other', 'items.sqlite');
    await syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', vault, db: sibling });
    expect(open).toHaveBeenCalledExactlyOnceWith(sibling);
  });

  it('uses the environment vault for containment when no override is provided', async () => {
    const { open } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', db: join(vault, 'items.sqlite') }))
      .rejects.toThrow('must be outside the selected Obsidian vault');
    expect(open).not.toHaveBeenCalled();
  });

  it('does not let an overridden environment vault govern database containment', async () => {
    const { open } = setup();
    const db = join(vault, 'items.sqlite');
    const selected = join(directory, 'selected-vault');
    await syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', vault: selected, db });
    expect(open).toHaveBeenCalledExactlyOnceWith(db);
    expect(process.env.OBSIDIAN_VAULT_PATH).toBe(vault);
  });

  it('preserves safe DB-validation context without leaking its cause', async () => {
    const { open, orchestrate } = setup();
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key', vault: `${vault}\0fake-secret` })).rejects.toMatchObject({
      message: 'Cannot validate the database location. Check database and vault paths and permissions.',
      cause: expect.any(Error),
    });
    expect(open).not.toHaveBeenCalled();
    expect(orchestrate).not.toHaveBeenCalled();
  });

  it('preserves safe storage-open context without invoking the application', async () => {
    const { open, orchestrate, storage } = setup();
    const cause = new Error('fake-secret lower-level details');
    open.mockImplementation(() => { throw cause; });
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key' })).rejects.toMatchObject({
      message: 'Cannot open the SQLite database. Check --db or DATABASE_PATH and directory permissions.', cause,
    });
    expect(orchestrate).not.toHaveBeenCalled();
    expect(storage.close).not.toHaveBeenCalled();
  });

  it('returns partial failures unchanged and closes storage without retrying', async () => {
    const { orchestrate, storage } = setup();
    const result: SyncToObsidianResult = {
      sync: { processed: 1, new: 1, changed: 0, unchanged: 0 },
      export: {
        processed: 1, succeeded: 0, failed: 1,
        failures: [{ index: 0, item: { source: 'youtube', sourceId: 'one', title: 'One', url: 'https://example.com/one' }, error: new Error('output failed') }],
      },
    };
    orchestrate.mockResolvedValue(result);
    expect(await syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key' })).toBe(result);
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it.each([new Error('injected failure'), { detail: 'non-Error failure' }, undefined])
  ('closes storage while preserving a thrown application value (%j)', async (error) => {
    const { orchestrate, storage } = setup();
    orchestrate.mockRejectedValue(error);
    await expect(syncYouTubePlaylistToObsidian('PLone', { auth: 'api-key' })).rejects.toBe(error);
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });
});
