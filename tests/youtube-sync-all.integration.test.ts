import type { Command } from 'commander';
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
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
import * as collectionOutput from '../src/outputs/obsidian/export-collections.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';

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
  vi.spyOn(store.collections, 'listAll');
  vi.spyOn(store.collectionMemberships, 'listAll');
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

const reconciliationPlaylists: Playlist[] = [
  { id: 'PLA', title: 'A', videos: ['X', 'Y'] },
  { id: 'PLB', title: 'B', videos: ['X', 'Z'] },
  { id: 'PLC', title: 'C', videos: ['Q'] },
];

async function seedReconciliation(exportToVault: boolean) {
  // This retained playlist was added outside owned-playlist discovery.
  const store = realOpen(database);
  try {
    await store.collections.upsert({ source: 'youtube', sourceId: 'PLD', title: 'External D' });
    await store.knowledgeItems.upsert({ source: 'youtube', sourceId: 'R', title: 'Video R', url: 'https://www.youtube.com/watch?v=R' });
    await store.collectionMemberships.add({ source: 'youtube', collectionSourceId: 'PLD', itemSourceId: 'R' });
  } finally { store.close(); }
  transport(reconciliationPlaylists);
  await cli().run(exportToVault ? ['--vault', vault] : []);
  return snapshot();
}

it.each([false, true])('reconciles only successful discovered playlists and retains orphan items (vault=%s)', async (exportToVault) => {
  const before = await seedReconciliation(exportToVault);
  const collectionPaths = before.collections.map((collection) => join(vault, buildObsidianCollectionRelativePath(collection)));
  const beforeNotes = exportToVault ? await Promise.all(collectionPaths.map((path) => readFile(path, 'utf8'))) : [];
  const orphanPaths = before.items.filter((item) => ['Q', 'Y'].includes(item.sourceId))
    .map((item) => join(vault, buildObsidianRelativePath(item)));
  const orphanNotes = exportToVault ? await Promise.all(orphanPaths.map((path) => readFile(path, 'utf8'))) : [];
  transport([
    { ...reconciliationPlaylists[0]!, videos: ['X', 'W'] },
    { ...reconciliationPlaylists[1]!, failure: 404 },
    { ...reconciliationPlaylists[2]!, videos: [] },
  ]);
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const command = cli();
  await expect(command.run(exportToVault ? ['--vault', vault] : [])).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stdout()).toContain('Playlists: discovered=3 succeeded=2 failed=1 unattempted=0');
  expect(command.stdout()).toContain('Items: processed=2 new=1 changed=1 unchanged=0');
  expect(command.stdout()).toContain('Memberships: removed=2');
  expect(command.stderr()).not.toContain('fake-secret');
  const after = await snapshot();
  expect(after.collections).toEqual(before.collections);
  expect(after.items.map(({ sourceId }) => sourceId)).toEqual(['Q', 'R', 'W', 'X', 'Y', 'Z']);
  expect(after.memberships).toEqual([
    { source: 'youtube', collectionSourceId: 'PLA', itemSourceId: 'W' },
    { source: 'youtube', collectionSourceId: 'PLA', itemSourceId: 'X' },
    { source: 'youtube', collectionSourceId: 'PLB', itemSourceId: 'X' },
    { source: 'youtube', collectionSourceId: 'PLB', itemSourceId: 'Z' },
    { source: 'youtube', collectionSourceId: 'PLD', itemSourceId: 'R' },
  ]);
  if (exportToVault) {
    expect(exportNotes).toHaveBeenCalledTimes(1);
    expect(command.stdout()).toContain('Export: attempted=6 succeeded=6 failed=0');
    const notes = await Promise.all(collectionPaths.map((path) => readFile(path, 'utf8')));
    expect(notes[0]).toContain('[Video X]');
    expect(notes[0]).toContain('[Video W]');
    expect(notes[0]).not.toContain('[Video Y]');
    expect(notes[1]).toBe(beforeNotes[1]);
    expect(notes[2]).toContain('_No items._');
    expect(notes[2]).not.toContain('[Video Q]');
    expect(notes[3]).toBe(beforeNotes[3]);
    expect(await Promise.all(orphanPaths.map((path) => readFile(path, 'utf8')))).toEqual(orphanNotes);
  } else {
    expect(exportNotes).not.toHaveBeenCalled();
    expect(await readdir(vault)).toEqual([]);
  }
  const repeated = cli();
  await expect(repeated.run(exportToVault ? ['--vault', vault] : [])).rejects.toMatchObject({ exitCode: 1 });
  expect(repeated.stdout()).toContain('Items: processed=2 new=0 changed=0 unchanged=2');
  expect(repeated.stdout()).toContain('Memberships: removed=0');
  expect(await snapshot()).toEqual(after);
});

it('preserves two completed reconciliations after a late fatal source error and skips remaining work and export', async () => {
  const before = await seedReconciliation(true);
  const collectionPaths = before.collections.map((collection) => join(vault, buildObsidianCollectionRelativePath(collection)));
  const notes = await Promise.all(collectionPaths.map((path) => readFile(path, 'utf8')));
  const request = transport([
    { ...reconciliationPlaylists[0]!, videos: ['X'] },
    { ...reconciliationPlaylists[1]!, videos: ['X'] },
    { ...reconciliationPlaylists[2]!, failure: 403, reason: 'quotaExceeded' },
    { id: 'PLD', title: 'External D', videos: [] },
  ]);
  request.mockClear();
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const exportCollections = vi.spyOn(collectionOutput, 'exportObsidianCollections');
  const result = await syncAllYouTubePlaylists({ vault });
  expect(result.playlists).toEqual({ discovered: 4, succeeded: 2, failed: 1, unattempted: 1 });
  expect(result.membershipsRemoved).toBe(2);
  expect(result.items).toEqual({ processed: 2, new: 0, changed: 2, unchanged: 0 });
  expect(result.fatal?.stage).toBe('playlist');
  expect(result.export.status).toBe('skipped');
  expect(exportNotes).not.toHaveBeenCalled();
  expect(exportCollections).not.toHaveBeenCalled();
  expect(request.mock.calls.some(([input]) => {
    const url = new URL(String(input));
    return (url.searchParams.get('id') ?? url.searchParams.get('playlistId')) === 'PLD';
  })).toBe(false);
  const after = await snapshot();
  expect(after.collections).toEqual(before.collections);
  expect(after.items.map(({ sourceId }) => sourceId)).toEqual(before.items.map(({ sourceId }) => sourceId));
  expect(after.memberships).toEqual(before.memberships.filter((edge) => !['Y', 'Z'].includes(edge.itemSourceId)));
  expect(await Promise.all(collectionPaths.map((path) => readFile(path, 'utf8')))).toEqual(notes);
});

it.each([false, true])('uses existing failure classification when reconciliation storage fails (fatal=%s)', async (fatal) => {
  const before = await seedReconciliation(false);
  const failure = new Error('fake-secret removal failed', fatal
    ? { cause: Object.assign(new Error('disk full'), { code: 'SQLITE_FULL' }) }
    : undefined);
  vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = track(realOpen(path));
    const remove = store.collectionMemberships.removeStaleForCollection.bind(store.collectionMemberships);
    vi.spyOn(store.collectionMemberships, 'removeStaleForCollection').mockImplementation(async (collection, desired) => {
      if (collection.sourceId === 'PLB') throw failure;
      return remove(collection, desired);
    });
    return store;
  });
  const request = transport([
    { ...reconciliationPlaylists[0]!, videos: ['X'] },
    { ...reconciliationPlaylists[1]!, videos: ['X'] },
    { ...reconciliationPlaylists[2]!, videos: [] },
  ]);
  request.mockClear();
  const exportNotes = vi.spyOn(output, 'exportObsidianNotes');
  const result = await syncAllYouTubePlaylists({ vault });
  expect(result.playlists).toEqual({ discovered: 3, succeeded: fatal ? 1 : 2, failed: 1, unattempted: fatal ? 1 : 0 });
  expect(result.membershipsRemoved).toBe(fatal ? 1 : 2);
  // The failed B sync wrote X but contributes neither item nor removal counts.
  expect(result.items).toEqual({ processed: 1, new: 0, changed: 1, unchanged: 0 });
  expect(result.failures[0]?.error).toBe(failure);
  const after = await snapshot();
  expect(after.collections).toEqual(before.collections);
  expect(after.items.map(({ sourceId }) => sourceId)).toEqual(before.items.map(({ sourceId }) => sourceId));
  expect(after.memberships).toEqual(before.memberships.filter((edge) => edge.itemSourceId !== 'Y' && (fatal || edge.itemSourceId !== 'Q')));
  if (fatal) {
    expect(result.fatal).toEqual({ stage: 'playlist', error: failure });
    expect(result.export.status).toBe('skipped');
    expect(exportNotes).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([input]) => {
      const url = new URL(String(input));
      return (url.searchParams.get('id') ?? url.searchParams.get('playlistId')) === 'PLC';
    })).toBe(false);
    expect(await readdir(vault)).toEqual([]);
  } else {
    expect(result.fatal).toBeUndefined();
    expect(result.export.status).toBe('completed');
    expect(exportNotes).toHaveBeenCalledTimes(1);
    const b = after.collections.find((collection) => collection.sourceId === 'PLB')!;
    expect(await readFile(join(vault, buildObsidianCollectionRelativePath(b)), 'utf8')).toContain('[Video Z]');
  }
});

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
    expect(stores[0]!.collections.listAll).toHaveBeenCalledTimes(1);
    expect(stores[0]!.collectionMemberships.listAll).toHaveBeenCalledTimes(1);
    return realExport(path, items);
  });
  const exportCollections = vi.spyOn(collectionOutput, 'exportObsidianCollections');
  const command = cli();
  await command.run(['--vault', vault]);
  expect(command.stdout()).toContain('Export: attempted=4 succeeded=4 failed=0');
  expect(exportNotes).toHaveBeenCalledTimes(1);
  expect(exportCollections).toHaveBeenCalledTimes(1);
  expect(stores[0]!.knowledgeItems.listAll).toHaveBeenCalledTimes(1);
  expect(await readFile(join(vault, buildObsidianRelativePath(prior)), 'utf8')).toContain('Retained item');
  const persisted = await snapshot();
  const paths = persisted.collections.map((collection) => join(vault, buildObsidianCollectionRelativePath(collection)));
  const notes = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
  expect(notes[0]).toContain('[Video X]');
  expect(notes[1]).toContain('[Video X]');
  expect(notes[2]).toContain('_No items._');
  const sharedItem = persisted.items.find((item) => item.sourceId === 'X')!;
  expect((await readdir(dirname(join(vault, buildObsidianRelativePath(sharedItem))))).filter((name) => name.endsWith('.md'))).toHaveLength(3);
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
  // A repeat rebuilds identical collection pages even though legacy item collection text changes during sync.
  exportNotes.mockRestore();
  await cli().run(['--vault', vault]);
  expect(await Promise.all(paths.map((path) => readFile(path, 'utf8')))).toEqual(notes);
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

it.each(['snapshot', 'collection-read', 'membership-read', 'batch', 'note', 'collection-batch', 'collection-note'] as const)
('reports playlist failure alongside a final %s failure', async (failure) => {
  await seed();
  transport([{ ...playlists[0]!, failure: 404 }, playlists[1]!]);
  if (['snapshot', 'collection-read', 'membership-read'].includes(failure)) vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = track(realOpen(path));
    if (failure === 'snapshot') vi.mocked(store.knowledgeItems.listAll).mockRejectedValue(undefined);
    if (failure === 'collection-read') vi.mocked(store.collections.listAll).mockRejectedValue(undefined);
    if (failure === 'membership-read') vi.mocked(store.collectionMemberships.listAll).mockRejectedValue(undefined);
    return store;
  });
  if (failure === 'batch') vi.spyOn(output, 'exportObsidianNotes').mockRejectedValue(new Error('fake-secret'));
  if (failure === 'collection-batch') vi.spyOn(collectionOutput, 'exportObsidianCollections').mockRejectedValue(undefined);
  if (failure === 'note') await mkdir(join(vault, buildObsidianRelativePath(prior)), { recursive: true });
  if (failure === 'collection-note') await mkdir(join(vault, buildObsidianCollectionRelativePath({ source: 'youtube', sourceId: 'PLB', title: 'B' })), { recursive: true });
  const command = cli();
  await expect(command.run(['--vault', vault])).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stdout()).toContain('succeeded=1 failed=1');
  expect(command.stderr()).toContain('Playlist failed');
  expect(command.stderr()).toMatch(/Obsidian export failed|Obsidian batch export failed|Export failed at index|Collection/i);
  expect(command.stderr()).not.toContain('fake-secret');
  expect((await snapshot()).memberships).toHaveLength(2);
  expect(stores[0]!.close).toHaveBeenCalledTimes(1);
});

it('exports retained collections with no discovered playlists and no items', async () => {
  const retained = { source: 'other', sourceId: 'collection', title: 'Retained empty collection' };
  const store = realOpen(database);
  try { await store.collections.upsert(retained); } finally { store.close(); }
  transport([]);
  const result = await syncAllYouTubePlaylists({ vault });
  expect(result.playlists).toEqual({ discovered: 0, succeeded: 0, failed: 0, unattempted: 0 });
  expect(result.export).toMatchObject({ status: 'completed', result: { processed: 0 },
    collections: { status: 'completed', result: { processed: 1, succeeded: 1, failed: 0 } } });
  expect(await readFile(join(vault, buildObsidianCollectionRelativePath(retained)), 'utf8'))
    .toContain('# Retained empty collection\n\n_No items._\n');
});

it('recovers after collection-only output failure without changing persisted memberships', async () => {
  transport(playlists);
  const blocked = join(vault, buildObsidianCollectionRelativePath({ source: 'youtube', sourceId: 'PLA', title: 'A' }));
  await mkdir(blocked, { recursive: true });
  const first = await syncAllYouTubePlaylists({ vault });
  expect(first.export).toMatchObject({ status: 'completed', result: { processed: 3, succeeded: 3, failed: 0 },
    collections: { status: 'completed', result: { processed: 3, succeeded: 2, failed: 1 } } });
  const persisted = await snapshot();
  await rmdir(blocked);
  const second = await syncAllYouTubePlaylists({ vault });
  expect(second.export).toMatchObject({ status: 'completed', result: { failed: 0 },
    collections: { status: 'completed', result: { processed: 3, succeeded: 3, failed: 0 } } });
  expect(await snapshot()).toEqual(persisted);
  expect(await readFile(blocked, 'utf8')).toContain('[Video X]');
});

it('still exports collections after an item failure and recovers on the next run', async () => {
  transport(playlists);
  const blocked = join(vault, buildObsidianRelativePath({ source: 'youtube', sourceId: 'X', title: 'Video X', url: 'https://www.youtube.com/watch?v=X' }));
  await mkdir(blocked, { recursive: true });
  const first = await syncAllYouTubePlaylists({ vault });
  expect(first.export).toMatchObject({ status: 'completed', result: { failed: 1 },
    collections: { status: 'completed', result: { processed: 3, succeeded: 3, failed: 0 } } });
  await rmdir(blocked);
  const second = await syncAllYouTubePlaylists({ vault });
  expect(second.export).toMatchObject({ status: 'completed', result: { failed: 0 },
    collections: { status: 'completed', result: { failed: 0 } } });
  expect(await readFile(blocked, 'utf8')).toContain('Video X');
});
