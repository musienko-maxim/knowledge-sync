import { describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

const item: KnowledgeItem = {
  source: 'youtube', sourceId: 'abc123', title: 'Title', url: 'https://example.com/item',
};

function expectComponents(raw: string, encoded: string) {
  expect(buildObsidianRelativePath({ ...item, source: raw, sourceId: raw })).toBe(`${encoded}/${encoded}.md`);
}

describe('buildObsidianRelativePath', () => {
  it('maps identity to exactly one source directory and a note filename', () => {
    expect(buildObsidianRelativePath(item)).toBe('youtube/abc123.md');
    expect(buildObsidianRelativePath({ ...item, sourceId: 'ufRBJ1yLQ2o' }))
      .toBe('youtube/uf%52%42%4A1y%4C%512o.md');
  });

  it.each([
    { title: 'Changed title' }, { description: 'Changed description' },
    { author: 'Changed author' }, { collection: 'Another playlist' },
    { publishedAt: '2026-01-10T12:00:00+02:00' }, { url: 'https://example.com/changed' },
  ])('ignores mutable metadata %j', (change) => {
    expect(buildObsidianRelativePath({ ...item, ...change })).toBe(buildObsidianRelativePath(item));
  });

  it('separates sources sharing the same sourceId', () => {
    expect(buildObsidianRelativePath({ ...item, source: 'example' })).toBe('example/abc123.md');
    expect(buildObsidianRelativePath({ ...item, source: 'example' })).not.toBe(buildObsidianRelativePath(item));
  });

  it.each([
    ['abc-123_def', 'abc-123_def'], ['ABC', '%41%42%43'], ['Video1', '%56ideo1'],
    ['<', '%3C'], ['>', '%3E'], [':', '%3A'], ['"', '%22'], ['/', '%2F'], ['\\', '%5C'],
    ['|', '%7C'], ['?', '%3F'], ['*', '%2A'], ['%', '%25'], ['%3A', '%253%41'],
    ['a:b', 'a%3Ab'], ['a?b', 'a%3Fb'], ['a/b\\c', 'a%2Fb%5Cc'],
    ['!#$&\'()+,;=@[]^`{}~', '%21%23%24%26%27%28%29%2B%2C%3B%3D%40%5B%5D%5E%60%7B%7D%7E'],
    ['\u007f', '%7F'], ['Тест', '%D0%A2%D0%B5%D1%81%D1%82'],
    ['тест', '%D1%82%D0%B5%D1%81%D1%82'], ['日本語', '%E6%97%A5%E6%9C%AC%E8%AA%9E'],
    ['🚀', '%F0%9F%9A%80'], ['é', '%C3%A9'], ['e\u0301', 'e%CC%81'],
    ['abc def', 'abc def'], [' abc ', ' abc%20'], [' ', '%20'], ['  ', '%20%20'],
    ['abc  ', 'abc%20%20'], ['abc.def', 'abc.def'], ['.hidden', '.hidden'],
    ['abc.', 'abc%2E'], ['abc..', 'abc%2E%2E'], ['abc . ', 'abc%20%2E%20'],
    ['abc. .', 'abc%2E%20%2E'], ['.', '%2E'], ['..', '%2E%2E'],
    [' ../escape ', ' ..%2Fescape%20'], ['C:\\outside', '%43%3A%5Coutside'],
  ])('encodes both identity components %j as %s', (raw, encoded) => {
    expectComponents(raw, encoded);
  });

  it.each(Array.from({ length: 32 }, (_, byte) => byte))('escapes control byte %i', (byte) => {
    expectComponents(String.fromCharCode(byte), `%${byte.toString(16).toUpperCase().padStart(2, '0')}`);
  });

  const devices = ['con', 'prn', 'aux', 'nul',
    ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)];
  it.each(devices)('protects reserved device %s and extension forms in both components', (name) => {
    const initial = `%${name.charCodeAt(0).toString(16).toUpperCase()}`;
    for (const suffix of ['', '.txt', '.tar.gz', ' .txt']) {
      expectComponents(name + suffix, initial + name.slice(1) + suffix);
    }
    const mixed = name[0]!.toUpperCase() + name.slice(1);
    expectComponents(mixed, `%${mixed.charCodeAt(0).toString(16).toUpperCase()}` + name.slice(1));
  });

  it.each([
    ['CON', '%43%4F%4E'], ['NUL.tar.gz', '%4E%55%4C.tar.gz'],
    ['CoN.txt', '%43o%4E.txt'], ['con .txt', '%63on .txt'],
    ['com¹', 'com%C2%B9'], ['com²', 'com%C2%B2'], ['com³', 'com%C2%B3'],
    ['lpt¹', 'lpt%C2%B9'], ['lpt²', 'lpt%C2%B2'], ['lpt³', 'lpt%C2%B3'],
    ['COM¹', '%43%4F%4D%C2%B9'], ['LPT².txt', '%4C%50%54%C2%B2.txt'],
    ['console', 'console'], ['conifer.txt', 'conifer.txt'], ['com10', 'com10'],
    ['con ', 'con%20'], ['con.', 'con%2E'], ['%63on', '%2563on'],
  ])('handles device-name boundaries and already-safe encodings %j', (raw, encoded) => {
    expectComponents(raw, encoded);
  });

  it.each([
    ['ABC', 'abc'], ['YouTube', 'youtube'], ['Video1', 'video1'], ['Тест', 'тест'],
    ['É', 'é'], ['CON', 'con'], ['Con', 'con'], [':', '%3A'], ['/', '\\'],
    ['a:b', 'a?b'], ['con', '%63on'], ['abc ', 'abc%20'], ['é', 'e\u0301'],
  ])('keeps %j and %j distinct under case-insensitive comparison', (first, second) => {
    for (const field of ['source', 'sourceId'] as const) {
      const firstPath = buildObsidianRelativePath({ ...item, [field]: first });
      const secondPath = buildObsidianRelativePath({ ...item, [field]: second });
      expect(firstPath.toLowerCase()).not.toBe(secondPath.toLowerCase());
    }
  });

  it('always generates one slash regardless of slashes in either identity field', () => {
    const path = buildObsidianRelativePath({ ...item, source: '../source', sourceId: '..\\note/../id' });
    expect(path).toBe('..%2Fsource/..%5Cnote%2F..%2Fid.md');
    expect(path.split('/')).toHaveLength(2);
    expect(path).not.toContain('\\');
  });

  it('adds one extension without interpreting an identity suffix', () => {
    expect(buildObsidianRelativePath({ ...item, sourceId: 'foo.md' })).toBe('youtube/foo.md.md');
    expect(buildObsidianRelativePath({ ...item, sourceId: 'foo.MD' })).toBe('youtube/foo.%4D%44.md');
    expect(buildObsidianRelativePath({ ...item, sourceId: 'foo.' })).toBe('youtube/foo%2E.md');
  });

  it.each(['source', 'sourceId'] as const)('rejects empty %s without a fallback', (field) => {
    expect(() => buildObsidianRelativePath({ ...item, [field]: '' })).toThrow(`${field} must not be empty`);
  });

  it.each(['\uD800', '\uD801', '\uDC00', 'x\uD800y', '\uDC00\uD800', '\uD800\uD800\uDC00'])
  ('rejects malformed UTF-16 %j in either field without replacement', (value) => {
    for (const field of ['source', 'sourceId'] as const) {
      expect(() => buildObsidianRelativePath({ ...item, [field]: value })).toThrow(`${field} must contain well-formed Unicode`);
    }
  });

  it('preserves valid surrogate pairs and a literal Unicode replacement character', () => {
    expectComponents('\uD800\uDC00', '%F0%90%80%80');
    expectComponents('\uFFFD', '%EF%BF%BD');
  });

  it('does not truncate long identities or encoded output', () => {
    const raw = 'A'.repeat(1024);
    expectComponents(raw, '%41'.repeat(1024));
  });

  it('is deterministic without mutating frozen input', () => {
    const original = { ...item, sourceId: ' A/Тест ', collection: 'Saved' };
    const frozen = Object.freeze({ ...original });
    const path = buildObsidianRelativePath(frozen);
    expect(buildObsidianRelativePath(frozen)).toBe(path);
    expect(buildObsidianRelativePath({ ...original })).toBe(path);
    expect(frozen).toEqual(original);
  });
});
