import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { buildObsidianRelativePath, encodeObsidianPathComponent } from '../src/outputs/obsidian/note-path.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { assertWindowsPathComponent, portablePathKey, readablePathSuffix, readableTitlePrefix } from '../src/outputs/obsidian/readable-path.js';

const item: KnowledgeItem = { source: 'youtube', sourceId: 'abc123', title: 'Title', url: 'https://example.com/item' };
const suffix = (kind: string, source = item.source, sourceId = item.sourceId) => createHash('sha256')
  .update(JSON.stringify(['knowledge-sync-readable-path-v1', kind, source, sourceId])).digest('hex').slice(0, 32);

describe('readable paths', () => {
  it('uses the exact versioned canonical identity tuple and current title', () => {
    expect(buildObsidianRelativePath(item)).toBe(`youtube/title--${suffix('item')}.md`);
    expect(buildObsidianCollectionRelativePath(item)).toBe(`youtube/collections/title--${suffix('collection')}.md`);
    expect(readablePathSuffix('item', item)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes only the prefix when a title changes, and ignores unrelated metadata', () => {
    expect(buildObsidianRelativePath({ ...item, title: 'New title!' })).toBe(`youtube/new-title--${suffix('item')}.md`);
    expect(buildObsidianRelativePath({ ...item, author: 'Changed', description: 'Changed', url: 'https://other.test/' }))
      .toBe(buildObsidianRelativePath(item));
  });

  it.each([
    ['Привіт Україно!', 'привіт-україно'], ['AI Україна 2026', 'ai-україна-2026'],
    ['Café', 'café'], ['Cafe\u0301', 'café'], ['İstanbul', 'i\u0307stanbul'],
    ['日本語', '日本語'], ['😀 A 🚀 B', 'a-b'], [' a///b\\c:*?"<>|.. ', 'a-b-c'],
    ['', 'untitled-item'], ['😀!!!', 'untitled-item'], ['\u0300\u0301', 'untitled-item'],
    ['\u0301a-\u0300b', 'a-b'], ['A\u0301', 'á'], ['123', '123'],
  ])('normalizes title %j to readable Unicode %j', (title, expected) => {
    expect(readableTitlePrefix(title, 'item')).toBe(expected);
    expect(buildObsidianRelativePath({ ...item, title })).toBe(`youtube/${expected}--${suffix('item')}.md`);
  });

  it('uses an entity-specific fallback', () => {
    expect(readableTitlePrefix('...', 'collection')).toBe('untitled-collection');
  });

  it('enforces code-point and UTF-8 limits without splitting graphemes', () => {
    expect(readableTitlePrefix('a'.repeat(81), 'item')).toBe('a'.repeat(80));
    expect(readableTitlePrefix('я'.repeat(81), 'item')).toBe('я'.repeat(80));
    expect(readableTitlePrefix('界'.repeat(81), 'item')).toBe('界'.repeat(53));
    expect(readableTitlePrefix('a'.repeat(79) + 'q\u0301', 'item')).toBe('a'.repeat(79));
    expect(readableTitlePrefix('a'.repeat(78) + 'q\u0301', 'item')).toBe('a'.repeat(78) + 'q\u0301');
    expect(readableTitlePrefix('a'.repeat(79) + '-b', 'item')).toBe('a'.repeat(79));
    expect(readableTitlePrefix('q' + '\u0301'.repeat(81), 'item')).toBe('untitled-item');
    const supplementaryLetter = '\u{10428}';
    expect(readableTitlePrefix(supplementaryLetter.repeat(50), 'item')).toBe(supplementaryLetter.repeat(40));
  });

  it.each([
    ['ABC', 'abc'], ['é', 'e\u0301'], ['a', ' a '], ['/', '\\'], ['a:b', 'a?b'],
  ])('keeps distinct identities %j and %j distinct without normalization', (left, right) => {
    expect(readablePathSuffix('item', { ...item, sourceId: left }))
      .not.toBe(readablePathSuffix('item', { ...item, sourceId: right }));
    expect(readablePathSuffix('item', { ...item, source: left }))
      .not.toBe(readablePathSuffix('item', { ...item, source: right }));
  });

  it('separates kind, source and sourceId even with identical titles', () => {
    expect(new Set([
      readablePathSuffix('item', item), readablePathSuffix('collection', item),
      readablePathSuffix('item', { ...item, source: 'facebook' }),
      readablePathSuffix('item', { ...item, sourceId: 'different' }),
    ]).size).toBe(4);
  });

  it.each(['source', 'sourceId'] as const)('rejects missing or malformed identity %s', (field) => {
    for (const value of ['', '\uD800', '\uDC00', 'x\uD800y']) {
      expect(() => buildObsidianRelativePath({ ...item, [field]: value })).toThrow(/empty|well-formed Unicode/);
      expect(() => buildObsidianCollectionRelativePath({ ...item, [field]: value })).toThrow(/empty|well-formed Unicode/);
    }
  });

  it('hashes long IDs without expanding the physical basename', () => {
    expect(buildObsidianRelativePath({ ...item, sourceId: 'A'.repeat(10000) }))
      .toMatch(/^youtube\/title--[0-9a-f]{32}\.md$/);
  });

  it('is deterministic and does not mutate frozen input', () => {
    const frozen = Object.freeze({ ...item, title: 'Привіт / world' });
    expect(buildObsidianRelativePath(frozen)).toBe(buildObsidianRelativePath({ ...frozen }));
    expect(frozen.title).toBe('Привіт / world');
  });
});

describe('portable source encoding and component safety', () => {
  it.each([
    ['ABC', '%41%42%43'], ['<', '%3C'], ['>', '%3E'], [':', '%3A'], ['"', '%22'],
    ['/', '%2F'], ['\\', '%5C'], ['|', '%7C'], ['?', '%3F'], ['*', '%2A'],
    ['%', '%25'], ['%3A', '%253%41'], ['é', '%C3%A9'], ['e\u0301', 'e%CC%81'],
    ['abc def', 'abc def'], ['abc.', 'abc%2E'], ['abc ', 'abc%20'], ['.', '%2E'], ['..', '%2E%2E'],
    ['con', '%63on'], ['nul.txt', '%6Eul.txt'], ['com1', '%63om1'],
    ['CON', '%43%4F%4E'], ['com¹', 'com%C2%B9'], ['lpt²', 'lpt%C2%B2'],
  ])('preserves the existing source-directory encoding %j', (raw, encoded) => {
    expect(encodeObsidianPathComponent(raw, 'source')).toBe(encoded);
    expect(buildObsidianRelativePath({ ...item, source: raw }).split('/')[0]).toBe(encoded);
  });

  it.each(Array.from({ length: 32 }, (_, byte) => byte))('encodes control byte %i in source directories', (byte) => {
    expect(encodeObsidianPathComponent(String.fromCharCode(byte), 'source'))
      .toBe(`%${byte.toString(16).toUpperCase().padStart(2, '0')}`);
  });

  it.each(['', '.', '..', 'con', 'NUL.txt', 'COM¹', 'lpt².txt', 'conin$', 'clock$',
    'a/b', 'a\\b', 'x:y', 'x\u0000y', 'trailing.', 'trailing ', '\uD800'])
  ('rejects unsafe complete Windows component %j on every host', (component) => {
    expect(() => assertWindowsPathComponent(component)).toThrow('Unsafe Windows path component');
  });

  it('reserved titles are safe when followed by the identity suffix', () => {
    expect(() => buildObsidianRelativePath({ ...item, title: 'CON' })).not.toThrow();
  });

  it('compares case and Unicode equivalences conservatively', () => {
    expect(portablePathKey('é/ß.md')).toBe(portablePathKey('e\u0301/SS.MD'));
    expect(portablePathKey('ς.md')).toBe(portablePathKey('σ.MD'));
  });
});
