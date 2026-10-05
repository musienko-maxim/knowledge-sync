import type { Command } from 'commander';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';
import { createProgram } from '../src/cli/program.js';
import { syncAllYouTubePlaylists } from '../src/cli/youtube-sync-all.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';
import * as output from '../src/outputs/obsidian/export-notes.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

const realOpen = sqlite.openStorage;
const realExport = output.exportObsidianNotes;
const prior = { source: 'other', sourceId: 'old', title: 'Retained item', url: 'https://example.com/old' };
let directory: string;
let database: string;
let vault: string;
let stores: Storage[];
let token: ReturnType<typeof vi.fn<() => Promise<string>>>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-account-'));
  database = join(directory, 'items.sqlite');
  vault = join(directory, 'vault');
  await mkdir(vault);
  stores = [];
  vi.stubEnv('DATABASE_PATH', database);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
  vi.stubEnv('YOUTUBE_API_KEY', undefined);
  vi.spyOn(config, 'loadGoogleClientConfig').mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
  token = vi.fn<() => Promise<string>>().mockResolvedValue('fake-access');
  vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(token);
  vi.spyOn(sqlite, 'openStorage').mockImplementation((path) => track(realOpen(path)));
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected request')));
});

afterEach(async () => {
  for (const store of stores) store.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-account-')) {
    throw new Error('Unexpected account integration cleanup path.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

function track(store: Storage) {
  stores.push(store);
  vi.spyOn(store, 'close');
  vi.spyOn(store.knowledgeItems, 'listAll');
  return store;
}

function cli() {
  let stdout = '';
  let stderr = '';
  const program = createProgram();
  const configure = (command: Command) => {
    command.exitOverride().configureOutput({ writeOut: (text) => { stdout += text; }, writeErr: (text) => { stderr += text; } });
    command.commands.forEach(configure);
  };
  configure(program);
  return {
    run: (args: string[] = []) => program.parseAsync(['youtube', 'sync-all', ...args], { from: 'user' }),
    stdout: () => stdout, stderr: () => stderr,
  };
}

interface Playlist { id: string; title: string; videos: string[]; failure?: number; reason?: string }
function transport(playlists: Playlist[]) {
  return vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(init?.headers).toEqual({ Authorization: 'Bearer fake-access' });
    expect(url.searchParams.has('key')).toBe(false);
    if (url.searchParams.get('mine') === 'true') {
      return Response.json({ items: playlists.map(({ id, title }) => ({ id, snippet: { title } })) });
    }
    const playlist = playlists.find(({ id }) => id === (url.searchParams.get('id') ?? url.searchParams.get('playlistId')));
    if (!playlist) throw new Error('Unexpected playlist');
    if (playlist.failure) return Response.json({ error: { message: 'fake-secret', errors: [{ reason: playlist.reason ?? 'playlistNotFound' }] } }, { status: playlist.failure });
    if (url.pathname.endsWith('/playlists')) return Response.json({ items: [{ snippet: { title: playlist.title } }] });
    return Response.json({ items: playlist.videos.map((id) => ({ snippet: { title: `Video ${id}` }, contentDetails: { videoId: id } })) });
  });
}

async function seed() {
  const store = realOpen(database);
  try { await store.knowledgeItems.upsert(prior); } finally { store.close(); }
}

async function snapshot() {
  const store = realOpen(database);
  try {
    const items = await store.knowledgeItems.listAll();
    for (const item of items) expect(store.getImported(item)).toBeUndefined();
    return { items, collections: await store.collections.listAll(), memberships: await store.collectionMemberships.listAll() };
  } finally { store.close(); }
}

const playlists: Playlist[] = [
  { id: 'PLA', title: 'A', videos: ['X', 'Y'] },
  { id: 'PLB', title: 'B', videos: ['X', 'Z'] },
  { id: 'PLC', title: 'Empty', videos: [] },
];

it('syncs owned playlists including empty ones, without exporting merely because the environment names a vault', async () => {
  const request = transport(playlists);
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const command = cli();
  await command.run();
  expect(command.stdout()).toContain('Playlists: discovered=3 succeeded=3 failed=0 unattempted=0');
  expect(command.stdout()).toContain('Items: processed=4 new=3 changed=1 unchanged=0');
  expect(command.stderr()).toBe('');
  const persisted = await snapshot();
  expect(persisted.items.map(({ sourceId }) => sourceId)).toEqual(['X', 'Y', 'Z']);
  expect(persisted.collections).toHaveLength(3);
  expect(persisted.memberships).toHaveLength(4);
  expect(request).toHaveBeenCalledTimes(7);
  expect(exportNotes).not.toHaveBeenCalled();
  expect(await readdir(vault)).toEqual([]);
  expect(stores[0]!.knowledgeItems.listAll).not.toHaveBeenCalled();
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
  const repeated = cli();
  await repeated.run();
  expect(repeated.stdout()).toContain('processed=4 new=0 changed=2 unchanged=2');
  expect(await snapshot()).toEqual(persisted);
});

it('reads and exports the full persisted snapshot exactly once after all playlists', async () => {
  await seed();
  const request = transport(playlists);
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes').mockImplementation(async (path, items) => {
    expect(request).toHaveBeenCalledTimes(7);
    return realExport(path, items);
  });
  const command = cli();
  await command.run(['--vault', vault]);
  expect(command.stdout()).toContain('Export: attempted=4 succeeded=4 failed=0');
  expect(exportNotes).toHaveBeenCalledTimes(1);
  expect(stores[0]!.knowledgeItems.listAll).toHaveBeenCalledTimes(1);
  expect(await readFile(join(vault, buildObsidianRelativePath(prior)), 'utf8')).toContain('Retained item');
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
});

it('exports retained data after discovering zero playlists', async () => {
  await seed();
  transport([]);
  const command = cli();
  await command.run(['--vault', vault]);
  expect(command.stdout()).toContain('discovered=0 succeeded=0 failed=0 unattempted=0');
  expect(command.stdout()).toContain('Export: attempted=1 succeeded=1 failed=0');
  expect(await readFile(join(vault, buildObsidianRelativePath(prior)), 'utf8')).toContain('Retained item');
});

it.each([[0], [1], [2], [0, 2], [0, 1, 2]])
('continues after recoverable playlist failures and still exports (%j)', async (...failed: number[]) => {
  await seed();
  transport(playlists.map((playlist, index) => failed.includes(index) ? { ...playlist, failure: 404 } : playlist));
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const command = cli();
  await expect(command.run(['--vault', vault])).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stdout()).toContain(`discovered=3 succeeded=${3 - failed.length} failed=${failed.length} unattempted=0`);
  expect(command.stderr().match(/Playlist failed/g)).toHaveLength(failed.length);
  expect(command.stderr()).not.toContain('fake-secret');
  expect(exportNotes).toHaveBeenCalledTimes(1);
  expect(await readFile(join(vault, buildObsidianRelativePath(prior)), 'utf8')).toContain('Retained item');
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
});

it('exports partial persistence but excludes failed-playlist writes from aggregate counters', async () => {
  vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = track(realOpen(path));
    const add = store.collectionMemberships.add.bind(store.collectionMemberships);
    vi.spyOn(store.collectionMemberships, 'add').mockImplementation(async (membership) => {
      if (membership.itemSourceId === 'Y') throw new Error('fake-secret constraint');
      await add(membership);
    });
    return store;
  });
  transport([{ id: 'PLA', title: 'A', videos: ['X', 'Y', 'Z'] }, { id: 'PLB', title: 'B', videos: ['W'] }]);
  const command = cli();
  await expect(command.run(['--vault', vault])).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stdout()).toContain('Items: processed=1 new=1 changed=0 unchanged=0');
  expect(command.stdout()).toContain('Export: attempted=3 succeeded=3 failed=0');
  const persisted = await snapshot();
  expect(persisted.items.map(({ sourceId }) => sourceId)).toEqual(['W', 'X', 'Y']);
  expect(persisted.memberships).toHaveLength(2);
});

it.each(['refresh', 'credentials', 'quota', 'storage'] as const)
('stops after a late fatal %s error, retains results and writes, and skips export', async (failure) => {
  const entries = playlists.map((playlist) => ({ ...playlist }));
  if (failure === 'credentials') entries[1] = { ...entries[1]!, failure: 401, reason: 'invalidCredentials' };
  if (failure === 'quota') entries[1] = { ...entries[1]!, failure: 403, reason: 'quotaExceeded' };
  if (failure === 'refresh') {
    let calls = 0;
    token.mockImplementation(async () => {
      if (++calls === 5) throw new GoogleAuthError('Authorization refresh failed.');
      return 'fake-access';
    });
  }
  if (failure === 'storage') vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = track(realOpen(path));
    const upsert = store.collections.upsert.bind(store.collections);
    vi.spyOn(store.collections, 'upsert').mockImplementation(async (collection) => {
      if (collection.sourceId === 'PLB') throw new Error('fake-secret query', { cause: Object.assign(new Error('disk'), { code: 'SQLITE_FULL' }) });
      await upsert(collection);
    });
    return store;
  });
  transport(entries);
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const result = await syncAllYouTubePlaylists({ vault });
  expect(result.playlists).toEqual({ discovered: 3, succeeded: 1, failed: 1, unattempted: 1 });
  expect(result.items.processed).toBe(2);
  expect(result.fatal?.stage).toBe('playlist');
  expect(result.export.status).toBe('skipped');
  expect(exportNotes).not.toHaveBeenCalled();
  expect((await snapshot()).collections.map(({ sourceId }) => sourceId)).toEqual(['PLA']);
  expect(await readdir(vault)).toEqual([]);
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
});

it('does no playlist writes when discovery fails on a later page', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ id: 'PLA', snippet: { title: 'A' } }], nextPageToken: 'next' }))
    .mockResolvedValueOnce(Response.json({ error: { errors: [{ reason: 'backendError' }] } }, { status: 503 }));
  const result = await syncAllYouTubePlaylists({ vault });
  expect(result.fatal?.stage).toBe('discovery');
  expect(result.export.status).toBe('skipped');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await snapshot()).toEqual({ items: [], collections: [], memberships: [] });
});

it.each(['snapshot', 'batch', 'note'] as const)
('reports playlist failure alongside a final %s failure', async (failure) => {
  await seed();
  transport([{ ...playlists[0]!, failure: 404 }, playlists[1]!]);
  if (failure === 'snapshot') vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = track(realOpen(path));
    vi.mocked(store.knowledgeItems.listAll).mockRejectedValue(undefined);
    return store;
  });
  if (failure === 'batch') vi.spyOn(output, 'exportObsidianNotes').mockRejectedValue(new Error('fake-secret'));
  if (failure === 'note') await mkdir(join(vault, buildObsidianRelativePath(prior)), { recursive: true });
  const command = cli();
  await expect(command.run(['--vault', vault])).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stdout()).toContain('succeeded=1 failed=1');
  expect(command.stderr()).toContain('Playlist failed');
  expect(command.stderr()).toMatch(/Obsidian export failed|Obsidian batch export failed|Export failed at index/);
  expect(command.stderr()).not.toContain('fake-secret');
  expect((await snapshot()).memberships).toHaveLength(2);
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
});
