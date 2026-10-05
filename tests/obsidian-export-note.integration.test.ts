import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';
import { exportObsidianNote } from '../src/outputs/obsidian/export-note.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

let directory: string;
let vault: string;
const item: KnowledgeItem = {
  source: 'example', sourceId: 'Відео1', url: 'https://example.com/item',
  title: 'Привіт 世界 🚀', author: 'Автор', collection: 'Збережене',
  description: 'First line\r\nДругий рядок  \r\n\r\n',
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-export-'));
  vault = join(directory, 'vault');
  await mkdir(vault);
});

afterEach(async () => {
  const cleanupPath = resolve(directory);
  if (dirname(cleanupPath) !== resolve(tmpdir()) || !basename(cleanupPath).startsWith('knowledge-sync-export-')) {
    throw new Error('Unexpected export-test cleanup path.');
  }
  await rm(cleanupPath, { recursive: true, force: true });
});

describe('exportObsidianNote filesystem integration', () => {
  it('exports exact UTF-8 Markdown at the generated nested path without mutating the item', async () => {
    const frozen = Object.freeze({ ...item });
    const relativePath = buildObsidianRelativePath(frozen);
    expect(await readdir(vault)).toEqual([]);
    await expect(exportObsidianNote(vault, frozen)).resolves.toBeUndefined();
    const destination = join(vault, relativePath);
    const bytes = await readFile(destination);
    expect(bytes).toEqual(Buffer.from(renderKnowledgeItemMarkdown(frozen), 'utf8'));
    expect(bytes.toString('utf8')).toContain(item.title);
    expect(await readdir(vault)).toEqual([dirname(relativePath)]);
    expect(await readdir(dirname(destination))).toEqual([basename(relativePath)]);
    expect(frozen).toEqual(item);
  });

  it('overwrites the same identity with shorter changed content and preserves repeat output', async () => {
    const original = { ...item, description: 'Long description. '.repeat(50) };
    const updated = { ...item, title: 'Changed title', collection: 'Other collection', description: 'Short' };
    const relativePath = buildObsidianRelativePath(original);
    expect(buildObsidianRelativePath(updated)).toBe(relativePath);
    await exportObsidianNote(vault, original);
    await exportObsidianNote(vault, updated);
    const destination = join(vault, relativePath);
    expect(await readFile(destination, 'utf8')).toBe(renderKnowledgeItemMarkdown(updated));
    await exportObsidianNote(vault, updated);
    expect(await readFile(destination, 'utf8')).toBe(renderKnowledgeItemMarkdown(updated));
    expect(await readdir(dirname(destination))).toEqual([basename(relativePath)]);
  });

  it('propagates a missing-vault filesystem error without creating that vault', async () => {
    const missingVault = join(directory, 'missing', 'vault');
    await expect(exportObsidianNote(missingVault, item)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(directory)).toEqual(['vault']);
    expect(await readdir(vault)).toEqual([]);
  });
});
