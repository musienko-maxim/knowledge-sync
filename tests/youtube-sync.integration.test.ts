import Database from 'better-sqlite3';
import type { Command } from 'commander';
import { gaxios, OAuth2Client } from 'google-auth-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as googleConfig from '../src/auth/google-client-config.js';
import * as googleOAuth from '../src/auth/google-oauth.js';
import type { TokenStore } from '../src/auth/token-store.js';
import { createProgram } from '../src/cli/program.js';
import * as sqliteStorage from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';

const realOpenStorage = sqliteStorage.openStorage;
const realCreateProvider = googleOAuth.createAccessTokenProvider;
const config = { client_id: 'fake-client-id', client_secret: 'fake-client-secret' };
const firstPage = {
  items: [{
    snippet: { title: '  First video  ', description: 'Description', videoOwnerChannelTitle: 'Uploader' },
    contentDetails: { videoId: 'videoA', videoPublishedAt: '2025-01-01T00:00:00Z' },
  }],
  nextPageToken: 'page-two',
};
let directory: string;
let databasePath: string;
let stores: Storage[];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'knowledge-sync-cli-'));
  databasePath = join(directory, 'items.sqlite');
  stores = [];
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', databasePath);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', join(directory, 'vault'));
  vi.spyOn(sqliteStorage, 'openStorage').mockImplementation((path) => {
    const store = realOpenStorage(path);
    vi.spyOn(store, 'close');
    stores.push(store);
    return store;
  });
  // Fail safely if API-key composition accidentally attempts OAuth configuration.
  vi.spyOn(googleConfig, 'loadGoogleClientConfig').mockRejectedValue(new Error('Unexpected OAuth configuration access'));
  vi.spyOn(googleOAuth, 'createAccessTokenProvider').mockImplementation(() => {
    throw new Error('Unexpected OAuth provider creation');
  });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network request')));
});

afterEach(() => {
  for (const store of stores) store.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function command() {
  let output = '';
  let errors = '';
  const program = createProgram();
  const configure = (current: Command) => {
    current.configureOutput({
      writeOut: (text) => { output += text; },
      writeErr: (text) => { errors += text; },
    }).exitOverride();
    current.commands.forEach(configure);
  };
  configure(program);
  return {
    run: (args: string[] = []) => program.parseAsync(['youtube', 'sync', 'PL123', ...args], { from: 'user' }),
    program,
    output: () => output,
    errors: () => errors,
  };
}

function transport() {
  return vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Learning playlist' } }] }))
    .mockResolvedValueOnce(Response.json(firstPage))
    .mockResolvedValueOnce(Response.json({ items: [{
      snippet: { title: 'Second video' }, contentDetails: { videoId: 'videoB' },
    }] }));
}

async function expectClosed() {
  expect(stores).toHaveLength(1);
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
  await expect(stores[0]!.knowledgeItems.findByIdentity('youtube', 'videoA')).rejects.toThrow();
}

function expectNoPersistedItems() {
  const database = new Database(databasePath, { readonly: true });
  try {
    expect(database.prepare('SELECT COUNT(*) AS count FROM knowledge_items').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM imported_items').get()).toEqual({ count: 0 });
  } finally { database.close(); }
}

describe('YouTube sync command through real composition and SQLite', () => {
  it('collects every API-key page, persists normalized items, prints the count, and closes storage', async () => {
    const request = transport();
    const cli = command();
    await cli.program.parseAsync([
      'youtube', 'sync', 'https://www.youtube.com/playlist?list=PL123', '--db', databasePath,
    ], { from: 'user' });

    expect(cli.output()).toBe('Processed 2 items.\nMemberships: removed=0\n');
    expect(cli.errors()).toBe('');
    expect(sqliteStorage.openStorage).toHaveBeenCalledExactlyOnceWith(databasePath);
    await expectClosed();
    expect(request).toHaveBeenCalledTimes(3);
    const urls = request.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls[0]!.searchParams.get('id')).toBe('PL123');
    expect(urls[2]!.searchParams.get('pageToken')).toBe('page-two');
    for (const url of urls) expect(url.searchParams.get('key')).toBe('fake-api-key');
    expect(googleConfig.loadGoogleClientConfig).not.toHaveBeenCalled();
    expect(googleOAuth.createAccessTokenProvider).not.toHaveBeenCalled();

    const persisted = realOpenStorage(databasePath);
    try {
      expect(await persisted.knowledgeItems.findByIdentity('youtube', 'videoA')).toStrictEqual({
        source: 'youtube', sourceId: 'videoA', url: 'https://www.youtube.com/watch?v=videoA',
        title: 'First video', description: 'Description', author: 'Uploader',
        collection: 'Learning playlist', publishedAt: '2025-01-01T00:00:00Z',
      });
      expect(await persisted.knowledgeItems.findByIdentity('youtube', 'videoB')).toStrictEqual({
        source: 'youtube', sourceId: 'videoB', url: 'https://www.youtube.com/watch?v=videoB',
        title: 'Second video', collection: 'Learning playlist',
      });
      expect(persisted.getImported({ source: 'youtube', sourceId: 'videoA' })).toBeUndefined();
      expect(persisted.getImported({ source: 'youtube', sourceId: 'videoB' })).toBeUndefined();
    } finally { persisted.close(); }
  });

  it('succeeds for an empty playlist without recording any import', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Empty playlist' } }] }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    const cli = command();
    await cli.run();
    expect(cli.output()).toBe('Processed 0 items.\nMemberships: removed=0\n');
    await expectClosed();
    expectNoPersistedItems();
  });

  it('successfully persists an OAuth playlist without requiring an API key', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    vi.mocked(googleConfig.loadGoogleClientConfig).mockResolvedValue(config);
    const token = vi.fn(async () => 'fake-access-token');
    vi.mocked(googleOAuth.createAccessTokenProvider).mockReturnValue(token);
    const request = transport();
    const cli = command();
    await cli.run(['--auth', 'oauth']);
    expect(cli.output()).toBe('Processed 2 items.\nMemberships: removed=0\n');
    expect(cli.errors()).toBe('');
    expect(token).toHaveBeenCalledTimes(3);
    for (const [input, init] of request.mock.calls) {
      expect(new URL(String(input)).searchParams.has('key')).toBe(false);
      expect(init?.headers).toEqual({ Authorization: 'Bearer fake-access-token' });
    }
    await expectClosed();
    const database = new Database(databasePath, { readonly: true });
    try {
      expect(database.prepare('SELECT source_id FROM knowledge_items ORDER BY source_id').all())
        .toEqual([{ source_id: 'videoA' }, { source_id: 'videoB' }]);
      expect(database.prepare('SELECT COUNT(*) AS count FROM imported_items').get()).toEqual({ count: 0 });
    } finally { database.close(); }
  });

  it('keeps safe API diagnostics, hides response secrets, and closes without partial collection writes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Learning playlist' } }] }))
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json({ error: {
        message: 'fake-secret response body',
        errors: [{ reason: 'quotaExceeded' }, { reason: 'fake-secret-reason' }],
      } }, { status: 403 }));
    const cli = command();
    await expect(cli.run()).rejects.toMatchObject({ exitCode: 1 });
    expect(cli.errors()).toContain('HTTP 403 (quotaExceeded)');
    expect(cli.errors()).not.toContain('fake-');
    expect(cli.output()).toBe('');
    await expectClosed();
    expectNoPersistedItems();
  });

  it('hides response-supplied IDs and metadata in CLI validation failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Learning playlist' } }] }))
      .mockResolvedValueOnce(Response.json({ items: [{
        snippet: { title: 'Video title' },
        contentDetails: { videoId: 'fake-refresh-token', videoPublishedAt: 'fake-secret-date' },
      }] }));
    const cli = command();
    await expect(cli.run()).rejects.toMatchObject({ exitCode: 1 });
    expect(cli.errors()).toContain('Invalid YouTube video metadata.');
    expect(cli.errors()).not.toContain('fake-');
    expect(cli.output()).toBe('');
    await expectClosed();
    expectNoPersistedItems();
  });
});

function refreshError(status?: number, code?: string, transportCode?: string) {
  const options: gaxios.GaxiosOptionsPrepared = {
    url: new URL('https://oauth2.googleapis.com/token'), headers: new Headers(), responseType: 'json',
  };
  const response = status === undefined ? undefined : Object.assign(new Response(null, { status }), {
    data: { error: code ?? 'fake-secret-code', error_description: 'fake-refresh-token response body' }, config: options,
  });
  const cause = Object.assign(new Error('fake-client-secret transport failure'), { code: transportCode });
  return new gaxios.GaxiosError('fake-refresh-token failure', options, response, cause);
}

const refreshFailures = [
  { name: 'invalid_grant', failure: () => refreshError(400, 'invalid_grant'),
    message: 'Stored YouTube authorization is no longer valid (HTTP 400, invalid_grant). Run `knowledge-sync youtube auth login`.' },
  { name: 'network', failure: () => refreshError(undefined, undefined, 'EAI_AGAIN'),
    message: 'YouTube access-token refresh failed due to a network/transport error (EAI_AGAIN). Check connectivity and retry later.' },
  ...[503, 408, 429].map((status) => ({ name: `HTTP ${status}`, failure: () => refreshError(status),
    message: `Google access-token refresh temporarily failed (HTTP ${status}). Retry later.` })),
  { name: 'unknown', failure: () => new Error('fake-refresh-token unknown failure'),
    message: 'YouTube access-token refresh failed. Check connectivity and Google OAuth configuration.' },
];

describe.each(['initial request', 'pagination'])('OAuth sync failure during %s', (phase) => {
  it.each(refreshFailures)('preserves $name classification through provider, client, collector, and CLI', async ({ name, failure, message }) => {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    vi.mocked(googleConfig.loadGoogleClientConfig).mockResolvedValue(config);
    const tokenStore = {
      loadRefreshToken: vi.fn(async () => 'fake-refresh-token'),
      saveRefreshToken: vi.fn(async () => {}),
      deleteRefreshToken: vi.fn(async () => false),
    } satisfies TokenStore;
    const oauthClient = new OAuth2Client();
    const refresh = vi.spyOn(oauthClient.transporter, 'request').mockRejectedValue(failure());
    if (phase === 'pagination') {
      // Expired tokens force refresh on each request, including the next page.
      refresh.mockResolvedValueOnce({ data: { access_token: 'fake-access-token', expires_in: -1 } } as never)
        .mockResolvedValueOnce({ data: { access_token: 'fake-access-token', expires_in: -1 } } as never);
    }
    vi.mocked(googleOAuth.createAccessTokenProvider).mockImplementation((clientConfig) =>
      realCreateProvider(clientConfig, tokenStore, () => oauthClient));
    const request = transport();
    const cli = command();
    await expect(cli.run(['--auth', 'oauth'])).rejects.toMatchObject({ exitCode: 1 });
    expect(cli.errors()).toContain(message);
    expect(cli.errors()).not.toContain('fake-');
    if (name !== 'invalid_grant') expect(cli.errors()).not.toContain('auth login');
    expect(cli.output()).toBe('');
    expect(request).toHaveBeenCalledTimes(phase === 'pagination' ? 2 : 0);
    expect(refresh).toHaveBeenCalledTimes(phase === 'pagination' ? 3 : 1);
    for (const [input, init] of request.mock.calls) {
      expect(new URL(String(input)).searchParams.has('key')).toBe(false);
      expect(init?.headers).toEqual({ Authorization: 'Bearer fake-access-token' });
    }
    expect(tokenStore.saveRefreshToken).not.toHaveBeenCalled();
    expect(tokenStore.deleteRefreshToken).not.toHaveBeenCalled();
    await expectClosed();
    expectNoPersistedItems();
  });
});

it('hides an arbitrary provider failure without incorrectly recommending login', async () => {
  vi.stubEnv('YOUTUBE_API_KEY', undefined);
  vi.mocked(googleConfig.loadGoogleClientConfig).mockResolvedValue(config);
  vi.mocked(googleOAuth.createAccessTokenProvider).mockReturnValue(
    vi.fn<() => Promise<string>>().mockRejectedValue(new Error('fake-refresh-token fake-client-secret')),
  );
  const cli = command();
  await expect(cli.run(['--auth', 'oauth'])).rejects.toMatchObject({ exitCode: 1 });
  expect(cli.errors()).toContain('OAuth');
  expect(cli.errors()).not.toMatch(/fake-|auth login|no longer valid/);
  expect(fetch).not.toHaveBeenCalled();
  await expectClosed();
  expectNoPersistedItems();
});
