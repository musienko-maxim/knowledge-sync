import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import { addObsidianExportCommands, formatObsidianExportResult, STALE_OUTPUT_WARNING } from '../src/cli/obsidian-export.js';
import { openStorage } from '../src/storage/sqlite/storage.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { encodeMarkdownDestination } from '../src/outputs/obsidian/markdown-link.js';
import * as googleConfig from '../src/auth/google-client-config.js';
import * as facebookImport from '../src/cli/facebook-import.js';
import * as exportPlan from '../src/outputs/obsidian/export-plan.js';

let directory: string;
let database: string;
let vault: string;
const youtube = { source: 'youtube', sourceId: 'video-A', title: 'Вивчаємо TypeScript', url: 'https://example.com/video' };
const facebook = { source: 'facebook', sourceId: 'private-fixture-id', title: 'Saved <script> & [link](url)', url: 'https://example.com/saved' };
const collection = { source: 'youtube', sourceId: 'playlist-A', title: 'Моя колекція' };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ks-export-cli-'));
  database = join(directory, 'items.sqlite');
  vault = join(directory, 'vault');
  await mkdir(vault);
  vi.stubEnv('YOUTUBE_API_KEY', undefined);
  vi.stubEnv('DATABASE_PATH', join(directory, 'unwanted.sqlite'));
  vi.stubEnv('OBSIDIAN_VAULT_PATH', join(directory, 'unwanted-vault'));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  vi.spyOn(googleConfig, 'loadGoogleClientConfig').mockRejectedValue(new Error('Unexpected credential access'));
  vi.spyOn(facebookImport, 'importFacebookFile').mockRejectedValue(new Error('Unexpected import'));
});

afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  expect(googleConfig.loadGoogleClientConfig).not.toHaveBeenCalled();
  expect(facebookImport.importFacebookFile).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('ks-export-cli-')) {
    throw new Error('Unexpected export test cleanup directory.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

function cli(program = createProgram()) {
  let output = '';
  let errors = '';
  function configure(command: Command): void {
    command.exitOverride().configureOutput({
      writeOut: (text) => { output += text; }, writeErr: (text) => { errors += text; },
    });
    command.commands.forEach(configure);
  }
  configure(program);
  return {
    run: (args = ['--db', database, '--vault', vault]) => program.parseAsync(['export', 'obsidian', ...args], { from: 'user' }),
    output: () => output, errors: () => errors,
  };
}

async function seed(items = [youtube, facebook]): Promise<void> {
  const storage = openStorage(database);
  try {
    for (const item of items) await storage.knowledgeItems.upsert(item);
    if (items.some((item) => item.sourceId === youtube.sourceId)) {
      await storage.collections.upsert(collection);
      await storage.collectionMemberships.add({ source: 'youtube', collectionSourceId: collection.sourceId, itemSourceId: youtube.sourceId });
    }
  } finally { storage.close(); }
}

async function inventory(root: string): Promise<Record<string, { bytes: string; modified: number }>> {
  const result: Record<string, { bytes: string; modified: number }> = {};
  async function visit(path: string, prefix: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const key = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), `${key}/`);
      else result[key] = { bytes: createHash('sha256').update(await readFile(join(path, entry.name))).digest('hex'), modified: (await stat(join(path, entry.name))).mtimeMs };
    }
  }
  await visit(root, '');
  return result;
}

describe('export obsidian CLI', () => {
  it('shows help without opening a database or requiring credentials', async () => {
    const command = cli();
    await expect(command.run(['--help'])).rejects.toMatchObject({ exitCode: 0 });
    expect(command.output()).toContain('--dry-run');
    expect(command.output()).toMatch(/no default or\s+environment fallback/);
    expect(await readdir(directory)).toEqual(['vault']);
  });

  it.each([{ args: [] }, { args: ['--vault', 'unused'] }, { args: ['--db', 'unused'] }])('requires explicit paths even with environment values ($args)', async ({ args }) => {
    const command = cli();
    await expect(command.run(args)).rejects.toMatchObject({ exitCode: 1 });
    expect(await readdir(directory)).toEqual(['vault']);
  });

  it.each(['missing', 'blank', 'inside-vault', 'missing-vault'])('rejects %s paths without creating anything', async (mode) => {
    await seed();
    if (mode === 'inside-vault') {
      const inside = openStorage(join(vault, 'inside.sqlite'));
      inside.close();
    }
    const before = await inventory(directory);
    const command = cli();
    const db = mode === 'missing' ? join(directory, 'missing.sqlite')
      : mode === 'blank' ? ' ' : mode === 'inside-vault' ? join(vault, 'inside.sqlite') : database;
    const destination = mode === 'missing-vault' ? join(directory, 'missing-vault') : vault;
    await expect(command.run(['--db', db, '--vault', destination, '--dry-run'])).rejects.toMatchObject({ exitCode: 1 });
    expect(command.errors()).toContain(mode === 'inside-vault' ? 'DATABASE_INSIDE_VAULT' : 'INVALID_PATHS');
    expect(command.errors()).not.toContain(directory);
    expect(await inventory(directory)).toEqual(before);
  });

  it('dry-runs mixed-source output with zero file or directory changes', async () => {
    await seed();
    const before = await inventory(directory);
    const command = cli();
    await command.run(['--db', database, '--vault', vault, '--dry-run']);
    expect(command.output()).toContain('Dry-run: additions=4 updates=0 unchanged=0 conflicts=0');
    expect(command.output()).toContain(STALE_OUTPUT_WARNING);
    expect(command.errors()).toBe('');
    expect(await inventory(directory)).toEqual(before);
    expect(await readdir(vault)).toEqual([]);
  });

  it('exports, repeats byte-identically, then updates title links while retaining the old file', async () => {
    await seed();
    const first = cli();
    await first.run();
    expect(first.errors()).toBe('');
    expect(first.output()).toContain('Export: attempted=2 succeeded=2 failed=0');
    expect(first.output()).toContain('Collections: attempted=1 succeeded=1 failed=0');
    const oldPath = buildObsidianRelativePath(youtube);
    const oldBytes = await readFile(join(vault, oldPath));
    const initial = await inventory(directory);
    const second = cli();
    await second.run();
    expect(second.output()).toContain('Plan: additions=0 updates=0 unchanged=4 conflicts=0');
    expect(await inventory(directory)).toEqual(initial);
    const changed = { ...youtube, title: 'Нова назва' };
    const storage = openStorage(database);
    try { await storage.knowledgeItems.upsert(changed); } finally { storage.close(); }
    const beforeDryRun = await inventory(directory);
    const dryRun = cli();
    await dryRun.run(['--db', database, '--vault', vault, '--dry-run']);
    expect(dryRun.output()).toContain('additions=1 updates=2 unchanged=1 conflicts=0');
    expect(dryRun.output()).toContain('Possible legacy/stale files: 1');
    expect(await inventory(directory)).toEqual(beforeDryRun);
    const renamed = cli();
    await renamed.run();
    expect(await readFile(join(vault, oldPath))).toEqual(oldBytes);
    const newPath = buildObsidianRelativePath(changed);
    expect(newPath).not.toBe(oldPath);
    const navigation = await readFile(join(vault, 'Knowledge Sync.md'), 'utf8');
    expect(navigation).toContain(encodeMarkdownDestination(newPath));
    expect(navigation).not.toContain(encodeMarkdownDestination(oldPath));
    const index = await readFile(join(vault, buildObsidianCollectionRelativePath(collection)), 'utf8');
    expect(index).toContain(encodeMarkdownDestination(`../${basename(newPath)}`));
    const persisted = openStorage(database);
    try {
      expect(await persisted.knowledgeItems.findByIdentity(youtube.source, youtube.sourceId)).toEqual(changed);
      expect(persisted.getImported(youtube)).toBeUndefined();
    } finally { persisted.close(); }
  });

  it.each([false, true])('preflights root ownership before any item write (dry-run=%s)', async (dryRun) => {
    await seed();
    await writeFile(join(vault, 'Knowledge Sync.md'), 'Personal dashboard\n');
    const before = await inventory(directory);
    const command = cli();
    await expect(command.run(['--db', database, '--vault', vault, ...(dryRun ? ['--dry-run'] : [])])).rejects.toMatchObject({ exitCode: 1 });
    expect(command.output()).toContain('Items: skipped (preflight conflict)');
    expect(command.errors()).toContain('kind=navigation');
    expect(command.errors()).not.toMatch(/Personal dashboard|private-fixture-id|script|example\.com/);
    expect(command.errors()).not.toContain(vault);
    expect(await inventory(directory)).toEqual(before);
  });

  it('refuses a manually edited generated item and preserves every file', async () => {
    await seed();
    await cli().run();
    const target = join(vault, buildObsidianRelativePath(facebook));
    await writeFile(target, `${await readFile(target, 'utf8')}Personal addition\n`);
    const before = await inventory(directory);
    const command = cli();
    await expect(command.run()).rejects.toMatchObject({ exitCode: 1 });
    expect(command.errors()).toContain('kind=item');
    expect(command.errors()).not.toMatch(/Personal addition|private-fixture-id|script|example\.com/);
    expect(await inventory(directory)).toEqual(before);
  });

  it.each(['wal', 'journal', 'incompatible'])('rejects %s databases without modifying DB, sidecars or vault', async (kind) => {
    await seed();
    if (kind === 'journal') await writeFile(`${database}-journal`, 'potential-recovery-state');
    else {
      const sqlite = new Database(database);
      try {
        if (kind === 'wal') sqlite.pragma('journal_mode = WAL');
        else sqlite.exec('DROP TABLE collection_memberships');
      } finally { sqlite.close(); }
    }
    const before = await inventory(directory);
    const command = cli();
    await expect(command.run(['--db', database, '--vault', vault, '--dry-run'])).rejects.toMatchObject({ exitCode: 1 });
    expect(command.errors()).toContain(kind === 'wal' ? 'WAL_UNSUPPORTED' : kind === 'journal' ? 'JOURNAL_STATE_UNSUPPORTED' : 'DATABASE_INCOMPATIBLE');
    expect(await inventory(directory)).toEqual(before);
    expect(await readdir(vault)).toEqual([]);
  });

  it.each([false, true])('leaves empty snapshots and existing navigation untouched (dry-run=%s)', async (dryRun) => {
    await seed([]);
    await writeFile(join(vault, 'Knowledge Sync.md'), 'Personal empty vault dashboard\n');
    const before = await inventory(directory);
    const command = cli();
    await command.run(['--db', database, '--vault', vault, ...(dryRun ? ['--dry-run'] : [])]);
    expect(command.output()).toContain('Empty snapshot: no files created or replaced.');
    expect(command.errors()).toBe('');
    expect(await inventory(directory)).toEqual(before);
  });

  it('redacts arbitrary command exceptions and preserves the Commander failure code', async () => {
    const program = new Command();
    addObsidianExportCommands(program, vi.fn().mockRejectedValue(new Error('private-title token path')));
    const command = cli(program);
    await expect(command.run()).rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
    expect(command.errors()).toContain('EXPORT_FAILED');
    expect(command.errors()).not.toMatch(/private-title|token path/);
  });

  it.each([
    { code: 'SUFFIX_COLLISION', dryRun: false }, { code: 'SUFFIX_COLLISION', dryRun: true },
    { code: 'PATH_COLLISION', dryRun: false }, { code: 'PATH_COLLISION', dryRun: true },
  ])('preserves $code plan indexes without publishing or exposing content (dry-run=$dryRun)', async ({ code, dryRun }) => {
    await seed(code === 'PATH_COLLISION' ? [facebook, { ...facebook, sourceId: 'other-private-fixture-id' }] : [youtube, facebook]);
    const build = exportPlan.buildObsidianExportPlan;
    vi.spyOn(exportPlan, 'buildObsidianExportPlan').mockImplementation((snapshot) =>
      build(snapshot, { suffixForIdentity: () => '0'.repeat(32) }));
    const before = await inventory(directory);
    const command = cli();
    await expect(command.run(['--db', database, '--vault', vault, ...(dryRun ? ['--dry-run'] : [])]))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
    expect(command.errors()).toContain(`Export plan refused: ${code} at entries 0 and 1.`);
    expect(command.errors()).toContain(`Obsidian export unavailable: ${code}.`);
    expect(command.output()).toContain('Items: skipped (plan conflict)\nCollections: skipped (plan conflict)\nNavigation: skipped (plan conflict)');
    expect(command.errors() + command.output()).not.toMatch(/private-fixture-id|Saved|script|example\.com/);
    expect(await inventory(directory)).toEqual(before);
    expect(await readdir(vault)).toEqual([]);
  });

  it('reports collection and navigation skips after item failure', () => {
    const formatted = formatObsidianExportResult({
      dryRun: false, empty: false,
      preflight: { additions: 4, updates: 0, unchanged: 0, possibleLeftovers: 0, conflicts: [] },
      projection: {
        items: { processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0, item: facebook, error: new Error('private') }] },
        collections: { status: 'skipped', reason: 'upstream-failure' },
        navigation: { status: 'skipped', reason: 'upstream-failure' },
      },
    });
    expect(formatted.failed).toBe(true);
    expect(formatted.output).toContain('Collections: skipped (earlier export failure)');
    expect(formatted.output).toContain('Navigation: skipped (earlier export failure)');
    expect(formatted.errors).not.toContain('private');
  });
});
