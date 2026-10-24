import type { Command } from 'commander';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import { addFacebookCommands } from '../src/cli/facebook.js';
import { Command as Commander } from 'commander';
import { openStorage } from '../src/storage/sqlite/storage.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';

let directory: string;
let database: string;
let vault: string;
let file: string;
const privateUrl = 'https://example.com/private-record?secret=synthetic';
const privateTitle = 'Synthetic private title';
const privateCollection = 'Synthetic private collection';
const fbid = '9007199254740993123456789';

function collection(id = fbid, name = privateCollection, entries: unknown[] = [
  { title: '', dict: [{ label: 'URL-адреса', value: privateUrl, href: privateUrl }, { label: 'Назва', value: privateTitle }] },
]) {
  return { fbid: id, label_values: [{ label: 'Назва', value: name }, { title: 'Збереження', dict: entries }] };
}

function cli(program = createProgram()) {
  let stdout = '';
  let stderr = '';
  const configure = (command: Command) => {
    command.exitOverride().configureOutput({ writeOut: (text) => { stdout += text; }, writeErr: (text) => { stderr += text; } });
    command.commands.forEach(configure);
  };
  configure(program);
  return { run: (args: string[]) => program.parseAsync(args, { from: 'user' }), stdout: () => stdout, stderr: () => stderr };
}

function args(exported = false) {
  return ['facebook', 'import', '--file', file, '--db', database, ...(exported ? ['--vault', vault] : [])];
}

async function snapshot() {
  const store = openStorage(database);
  try {
    const items = await store.knowledgeItems.listAll();
    for (const item of items) expect(store.getImported(item)).toBeUndefined();
    return { items, collections: await store.collections.listAll(), memberships: await store.collectionMemberships.listAll() };
  } finally { store.close(); }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-facebook-cli-'));
  database = join(directory, 'items.sqlite');
  vault = join(directory, 'vault');
  file = join(directory, 'collections.json');
  await mkdir(vault);
  await writeFile(file, JSON.stringify([collection()]));
  vi.stubEnv('DATABASE_PATH', database);
  vi.stubEnv('OBSIDIAN_VAULT_PATH', vault);
  vi.stubEnv('YOUTUBE_API_KEY', 'fake-api-key');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network request')));
});

afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  const cleanup = resolve(directory);
  if (dirname(cleanup) !== resolve(tmpdir()) || !basename(cleanup).startsWith('knowledge-sync-facebook-cli-')) throw new Error('Unsafe cleanup path.');
  await rm(cleanup, { recursive: true, force: true });
});

it('imports without network or implicit export, reports skips and distinct duplicates, and repeats unchanged', async () => {
  const saved = collection().label_values[1]!.dict!;
  await writeFile(file, JSON.stringify([
    collection(fbid, privateCollection, [...saved, ...saved, { title: '', dict: [] }]),
    collection('2', 'Second', saved), collection('3', 'Empty', []),
  ]));
  const first = cli();
  await first.run(args());
  expect(first.stdout()).toContain('Input: collections=3 occurrences=4 urls=3 skipped=1');
  expect(first.stdout()).toContain('Duplicates: items=2 memberships=1');
  expect(first.stdout()).toContain('Distinct: items=1 memberships=2');
  expect(first.stdout()).toContain('Items: processed=1 new=1 changed=0 unchanged=0');
  expect(first.stdout()).toContain('Collections: processed=3 new=3 changed=0 unchanged=0');
  expect(first.stdout()).toContain('Memberships: processed=2 new=2 unchanged=0');
  expect(first.stderr()).toBe('');
  expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(vault)).toEqual([]);
  const before = await snapshot();
  const second = cli(); await second.run(args());
  expect(second.stdout()).toContain('Items: processed=1 new=0 changed=0 unchanged=1');
  expect(second.stdout()).toContain('Memberships: processed=2 new=0 unchanged=2');
  expect(await snapshot()).toEqual(before);
});

it('keeps file collision protection and private diagnostic redaction across Facebook → YouTube → Facebook', async () => {
  await cli().run(args(true));
  const before = await snapshot();
  const item = before.items[0]!;
  const itemPath = join(vault, buildObsidianRelativePath(item));
  const collectionPath = join(vault, buildObsidianCollectionRelativePath(before.collections[0]!));
  const generated = await readFile(itemPath, 'utf8');
  await writeFile(itemPath, 'Personal note: do not replace\n');
  await writeFile(collectionPath, 'Personal collection: do not replace\n');
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/playlists')) return Response.json({ items: [{ snippet: { title: 'YouTube collection' } }] });
    return Response.json({ items: [{ snippet: { title: 'YouTube item' }, contentDetails: { videoId: 'public_video' } }] });
  });
  const youtube = cli();
  await expect(youtube.run(['youtube', 'sync-obsidian', 'PL_SYNTHETIC', '--db', database, '--vault', vault])).rejects.toMatchObject({ exitCode: 1 });
  const reimport = cli();
  await expect(reimport.run(args(true))).rejects.toMatchObject({ exitCode: 1 });
  for (const command of [youtube, reimport]) {
    const diagnostic = command.stdout() + command.stderr();
    for (const value of [privateUrl, privateTitle, privateCollection, fbid, item.sourceId, vault]) expect(diagnostic).not.toContain(value);
    expect(diagnostic).toContain('failed=1');
  }
  expect(await readFile(itemPath, 'utf8')).toBe('Personal note: do not replace\n');
  expect(await readFile(collectionPath, 'utf8')).toBe('Personal collection: do not replace\n');
  const navigation = await readFile(join(vault, 'Knowledge Sync.md'), 'utf8');
  expect(navigation).toContain(privateTitle);
  expect(navigation).toContain('YouTube item');
  const after = await snapshot();
  expect(after.items).toHaveLength(2);
  expect(after.collections).toHaveLength(2);
  expect(after.memberships).toHaveLength(2);
  // Restore only the generated bytes to demonstrate safe retry without changing identity.
  await writeFile(itemPath, generated);
  await rm(collectionPath);
  const recovered = cli(); await recovered.run(args(true));
  expect(recovered.stdout()).toContain('Items: processed=1 new=0 changed=0 unchanged=1');
  expect(await readFile(itemPath, 'utf8')).toBe(generated);
  const pages = await Promise.all([itemPath, collectionPath, join(vault, 'Knowledge Sync.md')].map((path) => readFile(path)));
  await cli().run(args(true));
  expect(await Promise.all([itemPath, collectionPath, join(vault, 'Knowledge Sync.md')].map((path) => readFile(path)))).toEqual(pages);
});

it('rejects invalid input without creating a database and never prints its contents', async () => {
  await writeFile(file, `{ ${privateTitle} ${privateUrl}`);
  const command = cli();
  await expect(command.run(args())).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stderr()).not.toContain(privateTitle);
  expect(command.stderr()).not.toContain(privateUrl);
  expect(await readdir(directory)).not.toContain('items.sqlite');
});

it('reports fixed metadata warning codes with exit 0 and rejects collection-name conflicts before writes', async () => {
  await writeFile(file, JSON.stringify([collection(fbid, privateCollection, [
    { dict: [{ label: 'URL-адреса', value: privateUrl }, { label: 'Назва', value: privateTitle }] },
    { dict: [{ label: 'URL-адреса', value: privateUrl }, { label: 'Назва', value: 'Conflicting private title' }] },
  ])]));
  const warned = cli();
  await warned.run(args());
  expect(warned.stdout()).toContain('Warning: TITLE_CONFLICT count=1');
  expect(warned.stdout()).not.toContain(privateTitle);
  expect(warned.stderr()).toBe('');
  const before = await snapshot();
  expect(before.items[0]!.title).toMatch(/^Facebook Saved — Link — [0-9a-f]{12}$/);
  await writeFile(file, JSON.stringify([collection(), collection(fbid, 'Conflicting private collection')]));
  const invalid = cli();
  await expect(invalid.run(args(true))).rejects.toMatchObject({ exitCode: 1 });
  expect(invalid.stderr()).toContain('COLLECTION_NAME_CONFLICT');
  expect(invalid.stderr()).not.toContain(privateCollection);
  expect(await snapshot()).toEqual(before);
  expect(await readdir(vault)).toEqual([]);
});

it('prints help and requires --file before any import', async () => {
  const help = cli();
  await expect(help.run(['facebook', 'import', '--help'])).rejects.toMatchObject({ exitCode: 0 });
  expect(help.stdout()).toContain('--file <path>');
  const missing = cli();
  await expect(missing.run(['facebook', 'import'])).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
  expect(await readdir(directory)).not.toContain('items.sqlite');
});

it('never discloses unexpected import exception messages', async () => {
  const program = new Commander();
  addFacebookCommands(program, async () => { throw new Error(privateUrl + privateTitle); });
  const command = cli(program);
  await expect(command.run(args())).rejects.toMatchObject({ exitCode: 1 });
  expect(command.stderr()).toContain('Facebook import failed. Check input');
  expect(command.stderr()).not.toContain(privateUrl);
  expect(command.stderr()).not.toContain(privateTitle);
});
