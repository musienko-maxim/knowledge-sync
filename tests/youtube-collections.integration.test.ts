import type { Command } from 'commander';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';
import * as output from '../src/outputs/obsidian/export-projection.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { encodeMarkdownDestination } from '../src/outputs/obsidian/markdown-link.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';

const realOpen = sqlite.openStorage;
let directory: string;
let database: string;
let vault: string;
let opened: Storage[];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-collections-'));
  database = join(directory, 'items.sqlite');
  vault = join(directory, 'vault');
  await mkdir(vault);
  opened = [];
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', database);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected request')));
  vi.spyOn(sqlite, 'openStorage').mockImplementation((path) => {
    const store = realOpen(path);
    vi.spyOn(store, 'close');
    opened.push(store);
    return store;
  });
});

afterEach(async () => {
  for (const store of opened) store.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-collections-')) {
    throw new Error('Unexpected collection test cleanup path.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

function transport(title: string, ids: string[], filtered = false) {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title } }] }))
    .mockResolvedValueOnce(Response.json({ items: filtered ? [{ snippet: { title: 'Unavailable entry' } }]
      : ids.map((id) => ({ snippet: { title: `Video ${id}` }, contentDetails: { videoId: id } })) }));
}

function command(kind: 'sync' | 'sync-obsidian', id: string, auth = 'api-key') {
  let stdout = '';
  let stderr = '';
  const program = createProgram();
  function configure(current: Command) {
    current.exitOverride().configureOutput({
      writeOut: (text) => { stdout += text; }, writeErr: (text) => { stderr += text; },
    });
    current.commands.forEach(configure);
  }
  configure(program);
  return {
    run: () => program.parseAsync(['youtube', kind, id, '--auth', auth], { from: 'user' }),
    stdout: () => stdout, stderr: () => stderr,
  };
}

async function snapshot() {
  const store = realOpen(database);
  try {
    const items = await store.knowledgeItems.listAll();
    for (const item of items) expect(store.getImported(item)).toBeUndefined();
    return { items, collections: await store.collections.listAll(), memberships: await store.collectionMemberships.listAll() };
  } finally { store.close(); }
}

const relationships = [
  { source: 'youtube', collectionSourceId: 'PLA', itemSourceId: 'X' },
  { source: 'youtube', collectionSourceId: 'PLA', itemSourceId: 'Y' },
  { source: 'youtube', collectionSourceId: 'PLB', itemSourceId: 'X' },
  { source: 'youtube', collectionSourceId: 'PLB', itemSourceId: 'Z' },
];

function itemLink(item: KnowledgeItem): string {
  return `(../${encodeMarkdownDestination(basename(buildObsidianRelativePath(item)))})`;
}

it.each(['sync', 'sync-obsidian'] as const)
('persists shared videos and memberships through %s, retaining legacy counters and output', async (kind) => {
  transport('A', ['X', 'Y']);
  await command(kind, 'https://www.youtube.com/playlist?list=PLA').run();
  transport('B', ['X', 'Z']);
  const second = command(kind, 'PLB');
  await second.run();
  expect(second.stderr()).toBe('');
  const initial = await snapshot();
  expect(initial.items.map((item) => item.sourceId)).toEqual(['X', 'Y', 'Z']);
  expect(initial.collections).toEqual([
    { source: 'youtube', sourceId: 'PLA', title: 'A' },
    { source: 'youtube', sourceId: 'PLB', title: 'B' },
  ]);
  expect(initial.memberships).toEqual(relationships);
  expect(initial.items[0]!.collection).toBe('B');
  if (kind === 'sync-obsidian') {
    expect(second.stdout()).toContain('Sync: processed=2 new=1 changed=1 unchanged=0');
    expect(await readFile(join(vault, buildObsidianRelativePath(initial.items[0]!)), 'utf8')).toContain('collection: "B"');
    expect(await readdir(join(vault, 'youtube'))).toHaveLength(4);
    const notes = await readdir(join(vault, 'youtube', 'collections'));
    expect(notes.sort()).toEqual(initial.collections.map((collection) => basename(buildObsidianCollectionRelativePath(collection))).sort());
    const noteA = await readFile(join(vault, buildObsidianCollectionRelativePath(initial.collections[0]!)), 'utf8');
    const noteB = await readFile(join(vault, buildObsidianCollectionRelativePath(initial.collections[1]!)), 'utf8');
    expect(noteA).toContain(itemLink(initial.items[0]!));
    expect(noteA).toContain(itemLink(initial.items[1]!));
    expect(noteA).not.toContain(itemLink(initial.items[2]!));
    expect(noteB).toContain(itemLink(initial.items[0]!));
    expect(noteB).toContain(itemLink(initial.items[2]!));
    expect(noteB).not.toContain(itemLink(initial.items[1]!));
  } else expect(await readdir(vault)).toEqual([]);

  transport('B', ['X', 'Z']);
  const repeated = command(kind, 'PLB');
  await repeated.run();
  expect(await snapshot()).toEqual(initial);
  if (kind === 'sync-obsidian') expect(repeated.stdout()).toContain('new=0 changed=0 unchanged=2');

  // A complete new snapshot removes only A's stale edge; its item is retained.
  transport('Renamed A', ['X']);
  const renamed = command(kind, 'PLA');
  await renamed.run();
  const final = await snapshot();
  expect(final.items).toHaveLength(3);
  expect(final.collections).toEqual([{ source: 'youtube', sourceId: 'PLA', title: 'Renamed A' }, initial.collections[1]]);
  expect(final.memberships).toEqual(relationships.filter((edge) => edge.itemSourceId !== 'Y'));
  expect(renamed.stdout()).toContain('Memberships: removed=1');
  expect(final.items[0]!.collection).toBe('Renamed A');
  if (kind === 'sync-obsidian') {
    expect(renamed.stdout()).toContain('new=0 changed=1 unchanged=0');
    expect(await readFile(join(vault, buildObsidianRelativePath(final.items[0]!)), 'utf8')).toContain('collection: "Renamed A"');
    const collectionNote = await readFile(join(vault, buildObsidianCollectionRelativePath(final.collections[0]!)), 'utf8');
    expect(collectionNote).toContain('# Renamed A');
    expect(collectionNote).not.toContain(itemLink(final.items[1]!));
    expect(await readFile(join(vault, buildObsidianRelativePath(final.items[1]!)), 'utf8')).toContain('# Video Y');
    expect(await readdir(join(vault, 'youtube', 'collections'))).toHaveLength(3);
    const oldCollectionPath = buildObsidianCollectionRelativePath(initial.collections[0]!);
    expect(await readFile(join(vault, oldCollectionPath), 'utf8')).toContain('# A');
    const navigation = await readFile(join(vault, 'Knowledge Sync.md'), 'utf8');
    expect(navigation).toContain(encodeMarkdownDestination(buildObsidianCollectionRelativePath(final.collections[0]!)));
    expect(navigation).not.toContain(encodeMarkdownDestination(oldCollectionPath));
    expect(renamed.stdout()).toContain('old filenames may remain');
  }
  // One metadata + one item-page request per run, no discovery request.
  expect(fetch).toHaveBeenCalledTimes(8);
  for (const [url] of vi.mocked(fetch).mock.calls) expect(new URL(String(url)).searchParams.has('mine')).toBe(false);
  for (const store of opened) expect(store.close).toHaveBeenCalledTimes(1);
});

it.each(['sync', 'sync-obsidian'] as const)
('persists and renames empty/all-filtered playlists through %s', async (kind) => {
  transport('Empty', []);
  await command(kind, 'PLA').run();
  expect(await snapshot()).toEqual({
    collections: [{ source: 'youtube', sourceId: 'PLA', title: 'Empty' }], items: [], memberships: [],
  });
  transport('Renamed empty', [], true);
  const filtered = command(kind, 'PLA');
  await filtered.run();
  expect(filtered.stderr()).toBe('');
  expect(await snapshot()).toEqual({
    collections: [{ source: 'youtube', sourceId: 'PLA', title: 'Renamed empty' }], items: [], memberships: [],
  });
  if (kind === 'sync-obsidian') {
    const note = await readFile(join(vault, buildObsidianCollectionRelativePath({ source: 'youtube', sourceId: 'PLA', title: 'Renamed empty' })), 'utf8');
    expect(note).toContain('# Renamed empty');
    expect(note).toContain('_No items._');
    expect(await readFile(join(vault, buildObsidianCollectionRelativePath({ source: 'youtube', sourceId: 'PLA', title: 'Empty' })), 'utf8')).toContain('# Empty');
  } else expect(await readdir(vault)).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(['sync', 'sync-obsidian'] as const)
('does not persist any collection or item when a later page fails through %s', async (kind) => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'A' } }] }))
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'X' }, contentDetails: { videoId: 'X' } }], nextPageToken: 'next' }))
    .mockResolvedValueOnce(Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }));
  const failed = command(kind, 'PLA');
  await expect(failed.run()).rejects.toMatchObject({ exitCode: 1 });
  expect(failed.stdout()).toBe('');
  expect(await snapshot()).toEqual({ collections: [], items: [], memberships: [] });
  expect(await readdir(vault)).toEqual([]);
  expect(opened[0]!.close).toHaveBeenCalledTimes(1);
});

it.each(['sync', 'sync-obsidian'] as const)
('retains earlier progress, safely fails, and repairs membership on the next %s', async (kind) => {
  vi.mocked(sqlite.openStorage).mockImplementationOnce((path) => {
    const store = realOpen(path);
    opened.push(store);
    vi.spyOn(store, 'close');
    const add = store.collectionMemberships.add.bind(store.collectionMemberships);
    vi.spyOn(store.collectionMemberships, 'add').mockImplementation(async (membership) => {
      if (membership.itemSourceId === 'Y') throw new Error('fake-secret-storage-error');
      await add(membership);
    });
    return store;
  });
  const exportNotes = vi.spyOn(output, 'exportObsidianProjection');
  transport('A', ['X', 'Y', 'Z']);
  const failed = command(kind, 'PLA');
  await expect(failed.run()).rejects.toMatchObject({ exitCode: 1 });
  expect(failed.stdout()).toBe('');
  expect(failed.stderr()).not.toContain('fake-secret');
  expect(exportNotes).not.toHaveBeenCalled();
  const partial = await snapshot();
  expect(partial.items.map((item) => item.sourceId)).toEqual(['X', 'Y']);
  expect(partial.collections).toHaveLength(1);
  expect(partial.memberships).toEqual([relationships[0]]);
  expect(opened[0]!.close).toHaveBeenCalledTimes(1);

  transport('A', ['X', 'Y', 'Z']);
  const recovered = command(kind, 'PLA');
  await recovered.run();
  const final = await snapshot();
  expect(final.items).toHaveLength(3);
  expect(final.memberships.map((membership) => membership.itemSourceId)).toEqual(['X', 'Y', 'Z']);
  if (kind === 'sync-obsidian') expect(recovered.stdout()).toContain('new=1 changed=0 unchanged=2');
});

it.each((['sync', 'sync-obsidian'] as const).flatMap((kind) =>
  (['api-key', 'oauth'] as const).map((auth) => ({ kind, auth }))))
('reconciles complete normalized snapshots with $kind using $auth, retaining data on failed pagination', async ({ kind, auth }) => {
  if (auth === 'oauth') {
    vi.stubEnv('YOUTUBE_API_KEY', undefined);
    vi.spyOn(config, 'loadGoogleClientConfig').mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
    vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(vi.fn(async () => 'fake-access'));
  }
  transport('A', ['X', 'Y', 'Z']);
  await command(kind, 'PLA', auth).run();
  const initial = await snapshot();
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'A' } }] }))
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Video X' }, contentDetails: { videoId: 'X' } }], nextPageToken: 'next' }))
    .mockRejectedValueOnce(new Error('fake-secret transport failure'));
  const failed = command(kind, 'PLA', auth);
  await expect(failed.run()).rejects.toMatchObject({ exitCode: 1 });
  expect(await snapshot()).toEqual(initial);
  expect(failed.stdout()).toBe('');
  expect(failed.stderr()).not.toContain('fake-secret');

  transport('A', ['X', 'X', 'W']);
  const mixed = command(kind, 'PLA', auth);
  await mixed.run();
  expect(mixed.stdout()).toContain('Memberships: removed=2');
  if (kind === 'sync-obsidian') expect(mixed.stdout()).toContain('processed=3 new=1 changed=0 unchanged=2');
  const reconciled = await snapshot();
  expect(reconciled.memberships.map((edge) => edge.itemSourceId)).toEqual(['W', 'X']);
  expect(reconciled.items.map((item) => item.sourceId)).toEqual(['W', 'X', 'Y', 'Z']);
  transport('A', ['X', 'X', 'W']);
  const repeated = command(kind, 'PLA', auth);
  await repeated.run();
  expect(repeated.stdout()).toContain('Memberships: removed=0');
  expect(await snapshot()).toEqual(reconciled);

  // Existing collector filtering defines the normalized authoritative snapshot.
  transport('A', [], true);
  const empty = command(kind, 'PLA', auth);
  await empty.run();
  expect(empty.stdout()).toContain('Memberships: removed=2');
  const final = await snapshot();
  expect(final.memberships).toEqual([]);
  expect(final.items).toEqual(reconciled.items);
  expect(final.collections).toEqual(reconciled.collections);
  if (kind === 'sync-obsidian') {
    expect(await readFile(join(vault, buildObsidianCollectionRelativePath(final.collections[0]!)), 'utf8')).toContain('_No items._');
    for (const item of final.items) {
      expect(await readFile(join(vault, buildObsidianRelativePath(item)), 'utf8')).toContain(`# ${item.title}`);
    }
  }
});

it('keeps reconciliation committed after collection export fails and recovers on the next export', async () => {
  transport('A', ['X', 'Y']);
  await command('sync-obsidian', 'PLA').run();
  const initial = await snapshot();
  const note = join(vault, buildObsidianCollectionRelativePath(initial.collections[0]!));
  const itemNote = join(vault, buildObsidianRelativePath(initial.items[1]!));
  const retainedText = await readFile(itemNote, 'utf8');
  await rm(note);
  await mkdir(note);
  transport('A', ['X']);
  const failed = command('sync-obsidian', 'PLA');
  await expect(failed.run()).rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
  expect(failed.stdout()).toContain('Items: skipped (preflight conflict)');
  expect(failed.stdout()).toContain('Collections: skipped (preflight conflict)');
  expect((await snapshot()).memberships).toEqual([relationships[0]]);
  expect(await readFile(itemNote, 'utf8')).toBe(retainedText);
  await rm(note, { recursive: true });
  transport('A', ['X']);
  const recovered = command('sync-obsidian', 'PLA');
  await recovered.run();
  expect(recovered.stdout()).toContain('Memberships: removed=0');
  expect(await readFile(note, 'utf8')).toContain(itemLink(initial.items[0]!));
  expect(await readFile(note, 'utf8')).not.toContain(itemLink(initial.items[1]!));
  expect(await readFile(itemNote, 'utf8')).toBe(retainedText);
});
