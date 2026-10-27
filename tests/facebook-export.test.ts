import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { formatObsidianCollectionExportFailure, formatObsidianExportFailure } from '../src/cli/obsidian-export-failure.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { renderCollectionMarkdown } from '../src/outputs/obsidian/collection-markdown.js';
import { exportObsidianCollection } from '../src/outputs/obsidian/export-collection.js';
import { exportObsidianNote } from '../src/outputs/obsidian/export-note.js';
import { exportObsidianProjection } from '../src/outputs/obsidian/export-projection.js';
import { facebookOwnershipPrefix } from '../src/outputs/obsidian/facebook-safety.js';
import { renderNavigationMarkdown } from '../src/outputs/obsidian/navigation-markdown.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

// Wrap real operations so failures exercise the actual temporary filesystem.
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), open: vi.fn(actual.open), lstat: vi.fn(actual.lstat) };
});

const item: KnowledgeItem = {
  source: 'facebook', sourceId: `url-v1-${'a'.repeat(64)}`,
  url: 'https://www.facebook.com/private-fixture?token=fake', title: 'Private fixture title',
  description: 'Private fixture description',
};
const collection = { source: 'facebook', sourceId: '123456789012345678901234567890', title: 'Private fixture collection' };
let directory: string;
let vault: string;
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await fs.mkdtemp(join(tmpdir(), 'knowledge-sync-facebook-export-'));
  vault = join(directory, 'vault');
  await fs.mkdir(vault);
});
afterEach(async () => {
  vi.restoreAllMocks();
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('knowledge-sync-facebook-export-')) throw new Error('Unexpected cleanup path.');
  await fs.rm(target, { recursive: true, force: true });
});

describe('Facebook shared export protection', () => {
  it('creates owned files deterministically and preserves the old path on title changes', async () => {
    const projection = { collection, items: [item] };
    await exportObsidianNote(vault, item);
    await exportObsidianCollection(vault, projection);
    const itemPath = join(vault, buildObsidianRelativePath(item));
    const collectionPath = join(vault, buildObsidianCollectionRelativePath(collection));
    const bytes = await fs.readFile(itemPath);
    expect(bytes.toString()).toBe(renderKnowledgeItemMarkdown(item));
    expect(bytes.toString()).toMatch(/^---\nknowledge_sync: /);
    expect(bytes.toString()).toContain('url-v1-' + 'a'.repeat(64));
    expect(await fs.readFile(collectionPath, 'utf8')).toBe(renderCollectionMarkdown(projection));
    await exportObsidianNote(vault, item);
    expect(await fs.readFile(itemPath)).toEqual(bytes);
    await exportObsidianNote(vault, { ...item, title: 'Updated' });
    expect(await fs.readFile(itemPath)).toEqual(bytes);
    expect(await fs.readFile(join(vault, buildObsidianRelativePath({ ...item, title: 'Updated' })), 'utf8'))
      .toBe(renderKnowledgeItemMarkdown({ ...item, title: 'Updated' }));
    expect((await fs.readdir(dirname(itemPath))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each(['item', 'collection'] as const)('preserves unowned and differently owned %s collisions', async (entity) => {
    const identity = entity === 'item' ? item : collection;
    const path = join(vault, entity === 'item' ? buildObsidianRelativePath(item) : buildObsidianCollectionRelativePath(collection));
    await fs.mkdir(dirname(path), { recursive: true });
    const write = () => entity === 'item' ? exportObsidianNote(vault, item) : exportObsidianCollection(vault, { collection, items: [item] });
    const prefix = facebookOwnershipPrefix(entity, identity);
    for (const previous of [
      'User note',
      prefix.replace('version\\\":1', 'version\\\":2'),
      facebookOwnershipPrefix(entity === 'item' ? 'collection' : 'item', identity),
      facebookOwnershipPrefix(entity, { ...identity, source: 'youtube' }),
      facebookOwnershipPrefix(entity, { ...identity, sourceId: identity.sourceId + 'other' }),
      prefix.replace(/\n$/, 'trailing\n'),
    ]) {
      expect(previous).not.toBe(prefix);
      await fs.writeFile(path, previous, 'utf8');
      await expect(write()).rejects.toMatchObject({ code: 'unowned-target' });
      expect(await fs.readFile(path, 'utf8')).toBe(previous);
    }
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it.each(['item', 'collection'] as const)('preserves old %s bytes and supports retry after rename failure', async (entity) => {
    const write = (title: string) => entity === 'item'
      ? exportObsidianNote(vault, { ...item, description: title })
      : exportObsidianCollection(vault, { collection, items: [{ ...item, title }] });
    const path = join(vault, entity === 'item' ? buildObsidianRelativePath(item) : buildObsidianCollectionRelativePath(collection));
    await write('Old');
    const old = await fs.readFile(path);
    const failure = Object.assign(new Error(item.url), { code: 'EPERM' });
    vi.mocked(fs.rename).mockRejectedValueOnce(failure);
    await expect(write('New')).rejects.toBe(failure);
    expect(await fs.readFile(path)).toEqual(old);
    expect((await fs.readdir(dirname(path))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await write('New');
    expect(await fs.readFile(path)).not.toEqual(old);
  });

  it.each(['write', 'close'] as const)('preserves old bytes on temporary %s failure', async (operation) => {
    await exportObsidianNote(vault, item);
    const path = join(vault, buildObsidianRelativePath(item));
    const old = await fs.readFile(path);
    const actualOpen = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
    const failure = new Error('fixture failure');
    vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      const handle = await actualOpen(...args);
      if (operation === 'write') {
        const write = handle.writeFile.bind(handle);
        vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => { await write('partial'); throw failure; });
      } else {
        const close = handle.close.bind(handle);
        vi.spyOn(handle, 'close').mockImplementationOnce(async () => { await close(); throw failure; });
      }
      return handle;
    });
    await expect(exportObsidianNote(vault, { ...item, description: 'New' })).rejects.toBe(failure);
    expect(await fs.readFile(path)).toEqual(old);
    expect((await fs.readdir(dirname(path))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('never deletes a preexisting exclusive temporary-file collision', async () => {
    const actualOpen = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
    let orphan: string | undefined;
    vi.mocked(fs.open).mockImplementationOnce(async (path, flags, mode) => {
      expect(flags).toBe('wx');
      orphan = String(path);
      await fs.writeFile(path, 'Preexisting orphan');
      return actualOpen(path, flags, mode);
    });
    await expect(exportObsidianNote(vault, item)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(orphan!, 'utf8')).toBe('Preexisting orphan');
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it.each(['facebook', 'facebook/collections', 'vault'] as const)('rejects a real directory junction at %s', async (component) => {
    const outside = join(directory, 'outside');
    await fs.mkdir(outside);
    const path = component === 'vault' ? join(directory, 'linked-vault') : join(vault, component);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.symlink(outside, path, 'junction');
    const selectedVault = component === 'vault' ? path : vault;
    await expect(exportObsidianCollection(selectedVault, { collection, items: [item] })).rejects.toMatchObject({ code: 'unsafe-path' });
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('rejects a linked ancestor above the configured vault', async () => {
    const link = join(directory, 'linked-parent');
    await fs.symlink(vault, link, 'junction');
    await fs.mkdir(join(vault, 'nested'));
    await expect(exportObsidianNote(join(link, 'nested'), item)).rejects.toMatchObject({ code: 'unsafe-path' });
    expect(await fs.readdir(join(vault, 'nested'))).toEqual([]);
  });

  it.each([false, true])('refuses navigation through a linked vault for a Facebook snapshot (mixed=%s)', async (mixed) => {
    const link = join(directory, 'linked-vault');
    await fs.symlink(vault, link, 'junction');
    const youtube = { ...item, source: 'youtube', sourceId: 'fixture-youtube-id' };
    await expect(exportObsidianProjection(link, {
      items: mixed ? [item, youtube] : [item], collections: [collection], memberships: [],
    })).rejects.toMatchObject({ code: 'unsafe-path' });
    await expect(fs.lstat(join(vault, 'Knowledge Sync.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.lstat(join(vault, 'facebook'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an ordinary file as an intermediate directory', async () => {
    await fs.writeFile(join(vault, 'facebook'), 'Preserve intermediate file');
    await expect(exportObsidianNote(vault, item)).rejects.toMatchObject({ code: 'unsafe-path' });
    expect(await fs.readFile(join(vault, 'facebook'), 'utf8')).toBe('Preserve intermediate file');
  });

  it('rejects a destination directory/junction without touching its contents', async () => {
    const path = join(vault, buildObsidianRelativePath(item));
    await fs.mkdir(dirname(path));
    const outside = join(directory, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, 'keep'), 'Preserve');
    await fs.symlink(outside, path, 'junction');
    await expect(exportObsidianNote(vault, item)).rejects.toMatchObject({ code: 'unsafe-path' });
    expect(await fs.readFile(join(outside, 'keep'), 'utf8')).toBe('Preserve');
  });

  it('rejects mocked dangling/file links before opening the target', async () => {
    const path = join(vault, buildObsidianRelativePath(item));
    await fs.mkdir(dirname(path));
    const actual = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).lstat;
    vi.mocked(fs.lstat).mockImplementation(async (...args) => {
      if (args[0] === path) return { isSymbolicLink: () => true, isFile: () => false } as Awaited<ReturnType<typeof fs.lstat>>;
      return actual(...args);
    });
    await expect(exportObsidianNote(vault, item)).rejects.toMatchObject({ code: 'unsafe-path' });
    expect(fs.open).not.toHaveBeenCalled();
  });

  it('rechecks ownership after preparation and preserves newly observed user content', async () => {
    await exportObsidianNote(vault, item);
    const path = join(vault, buildObsidianRelativePath(item));
    const actualOpen = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
    vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      const handle = await actualOpen(...args);
      const write = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'writeFile').mockImplementationOnce(async (...writeArgs) => {
        await write(...writeArgs);
        await fs.writeFile(path, 'New user content');
      });
      return handle;
    });
    await expect(exportObsidianNote(vault, { ...item, description: 'changed' })).rejects.toMatchObject({ code: 'unowned-target' });
    expect(await fs.readFile(path, 'utf8')).toBe('New user content');
  });

  it('blocks the whole mixed-source projection before writing when Facebook has a collision', async () => {
    const youtube = { source: 'youtube', sourceId: 'video-id', url: 'https://www.youtube.com/watch?v=video-id', title: '**Legacy title**', description: '<b>Legacy</b>' };
    const path = join(vault, buildObsidianRelativePath(item));
    await fs.mkdir(dirname(path));
    await fs.writeFile(path, 'User note');
    await expect(exportObsidianProjection(vault, { items: [item, youtube], collections: [collection], memberships: [] }))
      .rejects.toThrow('preflight');
    expect(await fs.readFile(path, 'utf8')).toBe('User note');
    await expect(fs.lstat(join(vault, buildObsidianRelativePath(youtube)))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.lstat(join(vault, 'Knowledge Sync.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('Facebook literal rendering and diagnostics', () => {
  it('neutralizes HTML, links, embeds, math, tags, block IDs, code and frontmatter injection', () => {
    const hostile = '<script>alert(1)</script> ![[secret]] [click](javascript:evil) $math$ ==highlight== #tag ^block &lt;b&gt; `code`\n---\n# heading\nhttps://private.invalid';
    const entry = { ...item, title: hostile, description: hostile };
    const note = renderKnowledgeItemMarkdown(entry).split('\n---\n\n')[1]!;
    const index = renderCollectionMarkdown({ collection: { ...collection, title: hostile }, items: [entry] }).split('\n---\n\n')[1]!;
    const navigation = renderNavigationMarkdown({ items: [entry], collections: [], memberships: [] });
    for (const body of [note, index, navigation]) {
      for (const unsafe of ['<script>', '![[', '](javascript:', '$math$', '==highlight==', '#tag', '^block', '`code`', 'https://private.invalid', '&lt;b&gt;']) expect(body).not.toContain(unsafe);
      expect(body).toContain('&#60;script&#62;');
      expect(body).toContain('&#36;math&#36;');
    }
  });

  it('redacts Facebook identity/content/errors while retaining useful YouTube identity diagnostics', () => {
    const error = Object.assign(new Error(JSON.stringify({ item, collection })), { code: 'EPERM' });
    const diagnostics = [
      formatObsidianExportFailure({ index: 2, item, error }),
      formatObsidianCollectionExportFailure({ index: 3, collection, error }),
    ].join('\n');
    expect(diagnostics).toContain('EPERM');
    expect(diagnostics).toContain('index 2');
    for (const privateValue of [item.sourceId, item.url, item.title, item.description!, collection.sourceId, collection.title]) expect(diagnostics).not.toContain(privateValue);
    expect(formatObsidianExportFailure({ index: 0, item: { ...item, source: 'youtube' }, error })).toContain(item.sourceId);
  });
});
