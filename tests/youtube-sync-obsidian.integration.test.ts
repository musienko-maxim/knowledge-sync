import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import * as sqlite from '../src/storage/sqlite/storage.js';
import type { Storage } from '../src/storage/storage.js';
import * as config from '../src/auth/google-client-config.js';
import * as oauth from '../src/auth/google-oauth.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';

const realOpen = sqlite.openStorage;
let directory: string;
let vault: string;
let database: string;
let stores: Storage[];
const video = { source: 'youtube', sourceId: 'videoA', title: 'Video A', url: 'https://www.youtube.com/watch?v=videoA' };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-cli-obsidian-'));
  vault = join(directory, 'vault');
  database = join(directory, 'items.sqlite');
  await mkdir(vault);
  stores = [];
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubEnv('DATABASE_PATH', database);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network request')));
  vi.spyOn(config, 'loadGoogleClientConfig').mockRejectedValue(new Error('Unexpected credential access'));
  vi.spyOn(sqlite, 'openStorage').mockImplementation((path) => {
    const store = realOpen(path);
    vi.spyOn(store, 'close');
    stores.push(store);
    return store;
  });
});

afterEach(async () => {
  for (const store of stores) store.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-cli-obsidian-')) {
    throw new Error('Unexpected CLI integration cleanup path.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

function transport(empty = false) {
  return vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Playlist' } }] }))
    .mockResolvedValueOnce(Response.json({ items: empty ? [] : [{
      snippet: { title: 'Video A', description: 'Description', videoOwnerChannelTitle: 'Author' },
      contentDetails: { videoId: video.sourceId },
    }] }));
}

function cli() {
  let output = '';
  let errors = '';
  const program = createProgram();
  const configure = (command: Command) => {
    command.exitOverride().configureOutput({
      writeOut: (text) => { output += text; },
      writeErr: (text) => { errors += text; },
    });
    command.commands.forEach(configure);
  };
  configure(program);
  return {
    run: (args: string[] = []) => program.parseAsync(['youtube', 'sync-obsidian', 'PL123', ...args], { from: 'user' }),
    output: () => output, errors: () => errors,
  };
}

async function expectClosed() {
  for (const store of stores) {
    expect(store.close).toHaveBeenCalledTimes(1);
    await expect(store.knowledgeItems.listAll()).rejects.toThrow();
  }
}

it('runs the command through real persistence and full-snapshot export including another source', async () => {
  const prior = { source: 'example', sourceId: 'old', title: 'Previously stored', url: 'https://example.com' };
  const seed = realOpen(database);
  try { await seed.knowledgeItems.upsert(prior); } finally { seed.close(); }
  transport();
  const command = cli();
  await command.run(['--db', database, '--vault', vault]);
  expect(command.output()).toBe('Sync: processed=1 new=1 changed=0 unchanged=0\nMemberships: removed=0\nExport: attempted=2 succeeded=2 failed=0\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=1 failed=0\n');
  expect(command.errors()).toBe('');
  const navigation = await readFile(join(vault, 'Knowledge Sync.md'), 'utf8');
  expect(navigation).toContain('<!-- knowledge-sync:generated-navigation:v1 -->\n');
  expect(navigation).toContain('Previously stored');
  expect(navigation).toContain('Video A');
  expect(navigation).toContain('Playlist');
  expect(config.loadGoogleClientConfig).not.toHaveBeenCalled();
  await expectClosed();
  const persisted = realOpen(database);
  try {
    const snapshot = await persisted.knowledgeItems.listAll();
    expect(snapshot).toHaveLength(2);
    for (const item of snapshot) {
      expect(await readFile(join(vault, buildObsidianRelativePath(item)), 'utf8')).toBe(renderKnowledgeItemMarkdown(item));
      expect(persisted.getImported(item)).toBeUndefined();
    }
  } finally { persisted.close(); }
});

it('supports OAuth without an API key through the real collector and output pipeline', async () => {
  vi.stubEnv('YOUTUBE_API_KEY', undefined);
  vi.mocked(config.loadGoogleClientConfig).mockResolvedValue({ client_id: 'fake-id', client_secret: 'fake-secret' });
  const provider = vi.spyOn(oauth, 'createAccessTokenProvider').mockReturnValue(vi.fn(async () => 'fake-access'));
  const requests = transport();
  const command = cli();
  await command.run(['--auth', 'oauth']);
  expect(command.errors()).toBe('');
  expect(command.output()).toContain('Export: attempted=1 succeeded=1 failed=0');
  expect(provider).toHaveBeenCalledTimes(1);
  for (const [url, options] of requests.mock.calls) {
    expect(String(url)).not.toContain('key=');
    expect(options?.headers).toEqual({ Authorization: 'Bearer fake-access' });
  }
  await expectClosed();
});

it('refuses user navigation content, retains committed data and note results, then succeeds on retry', async () => {
  const target = join(vault, 'Knowledge Sync.md');
  const userContent = 'Personal dashboard\nprivate content\n';
  await writeFile(target, userContent);
  transport();
  const first = cli();
  await expect(first.run()).rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
  expect(first.output()).toBe('Sync: processed=1 new=1 changed=0 unchanged=0\nMemberships: removed=0\nExport: attempted=1 succeeded=1 failed=0\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=0 failed=1\n');
  expect(first.errors()).toContain('Navigation export refused: Knowledge Sync.md is not a recognized generated page.\n');
  expect(first.errors()).not.toMatch(/private content|YouTube command failed/);
  expect(first.errors()).not.toContain(vault);
  expect(await readFile(target, 'utf8')).toBe(userContent);
  const notePath = join(vault, buildObsidianRelativePath(video));
  const note = await readFile(notePath, 'utf8');
  const persisted = realOpen(database);
  let before;
  try {
    before = { items: await persisted.knowledgeItems.listAll(), collections: await persisted.collections.listAll(), memberships: await persisted.collectionMemberships.listAll() };
    expect(before.items).toHaveLength(1);
    expect(before.collections).toHaveLength(1);
    expect(before.memberships).toHaveLength(1);
  } finally { persisted.close(); }
  await expectClosed();
  await rename(target, join(vault, 'Personal dashboard.md'));
  transport();
  const retry = cli();
  await retry.run();
  expect(retry.output()).toContain('Sync: processed=1 new=0 changed=0 unchanged=1');
  expect(retry.output()).toContain('Navigation: succeeded=1 failed=0\n');
  expect(retry.errors()).toBe('');
  expect(await readFile(target, 'utf8')).toContain('<!-- knowledge-sync:generated-navigation:v1 -->\n');
  expect(await readFile(notePath, 'utf8')).toBe(note);
  expect(await readFile(join(vault, 'Personal dashboard.md'), 'utf8')).toBe(userContent);
  const reopened = realOpen(database);
  try {
    expect({ items: await reopened.knowledgeItems.listAll(), collections: await reopened.collections.listAll(), memberships: await reopened.collectionMemberships.listAll() }).toEqual(before);
  } finally { reopened.close(); }
  await expectClosed();
});

it('reports a returned write failure once, closes storage, and exports unchanged data on the next command', async () => {
  const destination = join(vault, buildObsidianRelativePath(video));
  await mkdir(destination, { recursive: true });
  transport();
  const first = cli();
  await expect(first.run()).rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
  expect(first.output()).toBe('Sync: processed=1 new=1 changed=0 unchanged=0\nMemberships: removed=0\nExport: attempted=1 succeeded=0 failed=1\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=1 failed=0\n');
  expect(first.errors()).toContain('index 0 (source="youtube", sourceId="videoA")');
  expect(first.errors().match(/Export failed at index/g)).toHaveLength(1);
  expect(first.errors()).not.toMatch(/YouTube command failed|fake-/);
  await expectClosed();
  const persisted = realOpen(database);
  try {
    expect(await persisted.knowledgeItems.findByIdentity(video.source, video.sourceId)).not.toBeNull();
    expect(await persisted.collections.listAll()).toEqual([{ source: 'youtube', sourceId: 'PL123', title: 'Playlist' }]);
    expect(await persisted.collectionMemberships.listAll()).toEqual([
      { source: 'youtube', collectionSourceId: 'PL123', itemSourceId: video.sourceId },
    ]);
  }
  finally { persisted.close(); }
  await rmdir(destination);
  transport();
  const later = cli();
  await later.run();
  expect(later.output()).toBe('Sync: processed=1 new=0 changed=0 unchanged=1\nMemberships: removed=0\nExport: attempted=1 succeeded=1 failed=0\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=1 failed=0\n');
  expect(later.errors()).toBe('');
  expect(await readFile(destination, 'utf8')).toContain('# Video A');
  await expectClosed();
});

it('fails collection export for an empty playlist and nonexistent vault', async () => {
  transport(true);
  const command = cli();
  await expect(command.run(['--vault', join(directory, 'missing')])).rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
  expect(command.output()).toBe('Sync: processed=0 new=0 changed=0 unchanged=0\nMemberships: removed=0\nExport: attempted=0 succeeded=0 failed=0\nCollections: attempted=1 succeeded=0 failed=1\nNavigation: succeeded=0 failed=1\n');
  expect(command.errors()).toContain('Collection export failed at index 0');
  expect(await readdir(directory)).not.toContain('missing');
  await expectClosed();
});

it('keeps safe collector errors, hides transport details, and closes without writing notes', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: { message: 'fake-secret', errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }));
  const command = cli();
  await expect(command.run()).rejects.toMatchObject({ exitCode: 1 });
  expect(command.output()).toBe('');
  expect(command.errors()).toContain('HTTP 403 (quotaExceeded)');
  expect(command.errors()).not.toContain('fake-');
  expect(await readdir(vault)).toEqual([]);
  await expectClosed();
});

it.each([false, true])('uses actual process status for the built-in CLI path (blocked note: %s)', async (blocked) => {
  if (blocked) await mkdir(join(vault, buildObsidianRelativePath(video)), { recursive: true });
  // Only network transport is replaced in this separate Node process; CLI, SQLite and exports are real.
  const preload = `globalThis.fetch = async (input) => Response.json({ items: new URL(input).pathname.endsWith('/playlists')
    ? [{ snippet: { title: 'Playlist' } }]
    : [{ snippet: { title: 'Video A' }, contentDetails: { videoId: 'videoA' } }] });`;
  const child = spawnSync(process.execPath, [
    '--import', 'tsx', '--import', 'data:text/javascript,' + encodeURIComponent(preload),
    'src/cli/index.ts', 'youtube', 'sync-obsidian', 'PL123', '--db', database, '--vault', vault,
  ], { cwd: resolve('.'), env: { ...process.env, YOUTUBE_API_KEY: 'fake-api-key' }, encoding: 'utf8', timeout: 15000, windowsHide: true });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(blocked ? 1 : 0);
  expect(child.stdout, child.stderr).toContain('Sync: processed=1 new=1 changed=0 unchanged=0');
  expect(child.stdout).toContain(blocked ? 'Export: attempted=1 succeeded=0 failed=1' : 'Export: attempted=1 succeeded=1 failed=0');
  if (blocked) {
    expect(child.stderr.match(/Export failed at index/g)).toHaveLength(1);
    expect(child.stderr).not.toContain('YouTube command failed');
  } else expect(child.stderr).toBe('');
  const persisted = realOpen(database);
  try { expect(await persisted.knowledgeItems.findByIdentity(video.source, video.sourceId)).not.toBeNull(); }
  finally { persisted.close(); }
});
