import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FACEBOOK_LIMITS, FacebookImportError, facebookFallbackTitle, facebookSourceId,
  mergeFacebookItem, parseFacebookImport, readFacebookImport, repairFacebookText } from '../src/collectors/facebook/import.js';

const url = 'https://www.facebook.com/example/posts/123?ref=saved';
const field = (label: string, value: unknown) => ({ label, value });
const record = (extra: unknown[] = [], rawUrl: unknown = url) => ({ title: '', dict: [field('URL-адреса', rawUrl), ...extra] });
const collection = (records: unknown[] = [record()], id = '900719925474099312345678', name = 'Example') => ({
  fbid: id, label_values: [field('Назва', name), { title: 'Збереження', dict: records }],
});
const parse = (roots: unknown[] = [collection()]) => parseFacebookImport(JSON.stringify(roots));
const candidate = (extra: unknown[] = []) => parse([collection([record(extra)])]).items[0]!;
const moji = (text: string) => Buffer.from(text, 'utf8').toString('latin1');
const temp: string[] = [];
afterEach(async () => {
  for (const path of temp.splice(0)) {
    const target = resolve(path);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('facebook-parser-')) throw new Error('Unsafe temporary path');
    await rm(target, { recursive: true, force: true });
  }
});
async function file(bytes: string | Uint8Array) { const path = await mkdtemp(join(tmpdir(), 'facebook-parser-')); temp.push(path); const name = join(path, 'collections.json'); await writeFile(name, bytes); return name; }

describe('verified Facebook collections format', () => {
  it('recognizes only explicit metadata and leaves save time unmapped', async () => {
    const result = parseFacebookImport(await readFile(new URL('./fixtures/facebook/collections.json', import.meta.url), 'utf8'));
    expect(result.items[0]!.item).toEqual({ source: 'facebook', sourceId: facebookSourceId(url), url,
      title: 'Корисний приклад 🙂', description: 'A sanitized description.', author: 'Example author' });
    expect(result.collections.map(c => c.sourceId)).toEqual(['002', '900719925474099312345678']);
    expect(result.counters).toEqual({ inputCollections: 2, inputOccurrences: 2, urlOccurrences: 1, distinctItems: 1,
      duplicateItemOccurrences: 0, uniqueMemberships: 1, repeatedMembershipOccurrences: 0, skippedOccurrences: 1 });
  });
  it('reads the Unicode-escaped mojibake variant with the identical result', async () => {
    const original = await readFile(new URL('./fixtures/facebook/collections.json', import.meta.url), 'utf8');
    const converted = JSON.parse(original, (_key, value: unknown) => typeof value === 'string' ? moji(value) : value);
    const escaped = JSON.stringify(converted).replace(/[\u0080-\uffff]/gu, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    expect(parseFacebookImport(escaped)).toEqual(parseFacebookImport(original));
  });
  it.each(['Українська — 🙂', 'Café', 'Ångström', 'Plain ASCII', 'Correct 😀 Unicode', 'Ð is literal', 'Ñandú'])('preserves correct text: %s', value => {
    expect(repairFacebookText(value)).toBe(value);
  });
  it('repairs only a strict reversible layer and is idempotent', () => {
    const repaired = repairFacebookText(moji('Назва — приклад 🙂'));
    expect(repaired).toBe('Назва — приклад 🙂');
    expect(repairFacebookText(repaired)).toBe(repaired);
    expect(repairFacebookText(moji('Назва') + 'é')).toBe(moji('Назва') + 'é');
    expect(repairFacebookText(moji('Назва') + 'Українська')).toBe(moji('Назва') + 'Українська');
  });
  it('ignores inherited/prototype-sensitive keys and unrelated metadata', () => {
    const raw = JSON.stringify([collection([record([field('Ім’я', 'not author')])])]).replace('"fbid":', '"__proto__":{"label":"Назва","value":"private"},"fbid":');
    expect(parseFacebookImport(raw).items[0]!.item.author).toBeUndefined();
    expect(({} as Record<string, unknown>).label).toBeUndefined();
  });
  it.each([{}, { saved_items: [] }, [ { fbid: '1', label_values: [] } ], [ { fbid: '1', label_values: [field('Назва', 'Example'), { title: 'Збереження', dict: {} }] } ]])('rejects unsupported root/section shape', root => {
    expect(() => parseFacebookImport(JSON.stringify(root))).toThrow(FacebookImportError);
  });
});

describe('identity and deterministic conflicts', () => {
  it('hashes exact UTF-8 URL bytes without normalization', () => {
    const variants = ['https://EXAMPLE.com/a', 'https://example.com/a', 'https://example.com/a?x=1&y=2', 'https://example.com/a?y=2&x=1', 'https://example.com/%61', 'https://example.com/а'];
    expect(new Set(variants.map(facebookSourceId)).size).toBe(variants.length);
    for (const value of variants) expect(facebookSourceId(value)).toBe('url-v1-' + createHash('sha256').update(value, 'utf8').digest('hex'));
    const raw = 'https://example.com/' + moji('Назва');
    expect(parse([collection([record([], raw)])]).items[0]!.item.url).toBe(raw);
  });
  it.each([
    ['https://www.facebook.com/example/posts/123', 'Post'],
    ['https://facebook.com/groups/abc/posts/123', 'Group post'],
    ['https://m.facebook.com/reel/123', 'Reel'],
    ['https://web.facebook.com/example/videos/123', 'Video'],
    ['https://www.facebook.com/watch/?v=123', 'Video'],
    ['https://facebook.com/story.php?story_fbid=123&id=456', 'Post'],
    ['https://facebook.com.evil.test/reel/123', 'Link'],
    ['https://example.com/reel/123', 'Link'],
  ])('freezes fallback family %s', (value, kind) => {
    expect(facebookFallbackTitle(value)).toBe(`Facebook Saved — ${kind} — ${facebookSourceId(value).slice(7, 19)}`);
  });
  it('merges complementary fields and counts item and edge duplication independently', () => {
    const a = record([field('Назва', 'Title')]), b = record([field('Опис', 'Description')]);
    const roots = [collection([a, b, a]), collection([b], '2')];
    const result = parse(roots);
    expect(parse([collection([b], '2'), collection([a, b, a].reverse())])).toEqual(result);
    expect(result.items[0]!.item).toMatchObject({ title: 'Title', description: 'Description' });
    expect(result.counters).toMatchObject({ inputOccurrences: 4, distinctItems: 1, duplicateItemOccurrences: 3,
      uniqueMemberships: 2, repeatedMembershipOccurrences: 2 });
  });
  it('conflicting duplicates have no last-record winner', () => {
    const a = record([field('Назва', 'A'), field('Опис', 'One'), { title: 'Автор', dict: [field('Ім’я', 'Author A')] }]);
    const b = record([field('Назва', 'B'), field('Опис', 'Two'), { title: 'Автор', dict: [field('Ім’я', 'Author B')] }]);
    const result = parse([collection([a, b])]);
    expect(parse([collection([b, a])])).toEqual(result);
    expect(result.items[0]).toEqual({ item: { source: 'facebook', sourceId: facebookSourceId(url), url, title: facebookFallbackTitle(url) },
      conflicts: ['AUTHOR_CONFLICT', 'DESCRIPTION_CONFLICT', 'TITLE_CONFLICT'] });
    expect(mergeFacebookItem(result.items[0]!, { ...candidate().item, title: 'Stored', description: 'Prior description', author: 'Prior author' }).item)
      .toMatchObject({ title: 'Stored', description: 'Prior description', author: 'Prior author' });
  });
  it('promotes only exactly recomputed fallback and preserves legacy sparse fields', () => {
    const incoming = candidate([field('Назва', 'Explicit title')]);
    const existing = { ...candidate().item, collection: 'Legacy', publishedAt: '2020-01-01T00:00:00Z', description: 'Saved description' };
    expect(mergeFacebookItem(incoming, existing)).toEqual({ item: { ...existing, title: 'Explicit title' }, warnings: [] });
    expect(mergeFacebookItem(incoming, { ...existing, title: existing.title + ' suffix' }).warnings).toEqual(['TITLE_CONFLICT']);
    expect(mergeFacebookItem(candidate(), { ...existing, title: 'Meaningful' }).item.title).toBe('Meaningful');
  });
  it('preserves meaningful stored conflicting fields while filling omitted fields', () => {
    const incoming = candidate([field('Назва', 'New'), field('Опис', 'New description'), { title: 'Автор', dict: [field('Ім’я', 'New author')] }]);
    const result = mergeFacebookItem(incoming, { ...candidate().item, title: 'Old', description: 'Old description' });
    expect(result.item).toMatchObject({ title: 'Old', description: 'Old description', author: 'New author' });
    expect(result.warnings).toEqual(['DESCRIPTION_CONFLICT', 'TITLE_CONFLICT']);
  });
  it('rejects conflicting collection names regardless of order', () => {
    for (const roots of [[collection([], '1', 'A'), collection([], '1', 'B')], [collection([], '1', 'B'), collection([], '1', 'A')]]) {
      expect(() => parse(roots)).toThrow('COLLECTION_NAME_CONFLICT');
    }
  });
  it('requires each duplicate collection record to have its own nonempty name regardless of order', () => {
    const named = collection([], '1', 'Named');
    const blank = collection([], '1', ' ');
    for (const roots of [[named, blank], [blank, named]]) {
      expect(() => parse(roots)).toThrow('INVALID_STRUCTURE');
    }
  });
});

describe('validation bounds and private errors', () => {
  it.each([null, 1, 'javascript:secret', 'file:///private', ' https://example.com/private', 'https://example.com/\nprivate'])('rejects unsafe URL input', raw => {
    expect(() => parse([collection([record([], raw)])])).toThrow(FacebookImportError);
  });
  it('requires value/href equality and rejects multiple distinct URLs', () => {
    expect(() => parse([collection([{ dict: [{ ...field('URL-адреса', url), href: url + '&private=1' }] }])])).toThrow('URL_MISMATCH');
    expect(() => parse([collection([record([field('URL-адреса', url + '&private=1')])])])).toThrow('URL_MISMATCH');
  });
  it.each(['', '12a', '-1', '1'.repeat(129)])('rejects invalid FBID', id => {
    expect(() => parse([collection([], id)])).toThrow('INVALID_COLLECTION_ID');
  });
  it('rejects numeric FBIDs and accepts exactly 128 digits', () => {
    expect(() => parse([{ ...collection(), fbid: 123 }])).toThrow('INVALID_STRUCTURE');
    expect(parse([collection([], '1'.repeat(128))]).collections[0]!.sourceId).toHaveLength(128);
  });
  it('enforces collection, occurrence and string limits', () => {
    expect(() => parse(Array.from({ length: FACEBOOK_LIMITS.collections + 1 }, () => collection([])))).toThrow('INPUT_LIMIT_EXCEEDED');
    expect(() => parse([collection(Array.from({ length: FACEBOOK_LIMITS.occurrences + 1 }, () => ({ dict: [] })))] )).toThrow('INPUT_LIMIT_EXCEEDED');
    expect(() => parse([collection([record([field('Опис', 'a'.repeat(FACEBOOK_LIMITS.string + 1))])])])).toThrow('INPUT_LIMIT_EXCEEDED');
    expect(candidate([field('Опис', 'a'.repeat(FACEBOOK_LIMITS.string))]).item.description).toHaveLength(FACEBOOK_LIMITS.string);
  });
  it('rejects excessive nesting before parsing but brackets inside strings are harmless', () => {
    expect(() => parseFacebookImport('['.repeat(33) + ']'.repeat(33))).toThrow('INPUT_LIMIT_EXCEEDED');
    expect(candidate([field('Назва', '['.repeat(100))]).item.title).toHaveLength(100);
  });
  it.each(['\ud800', '\udc00', 'a\ud800b'])('rejects lone surrogates everywhere', value => {
    expect(() => parse([collection([record([field('Опис', value)])])])).toThrow('INVALID_UNICODE');
    expect(() => parseFacebookImport(JSON.stringify([{ ...collection(), [value]: 'ignored' }]))).toThrow('INVALID_UNICODE');
  });
  it('reads strict UTF-8 only and returns sanitized IO/parse errors', async () => {
    expect(await readFacebookImport(await file(JSON.stringify([collection()])))).toEqual(parse());
    await expect(readFacebookImport(await file(Uint8Array.from([0xc3, 0x28])))).rejects.toThrow('INVALID_UTF8');
    await expect(readFacebookImport(await file('{"secret":"private record"'))).rejects.toThrow('INVALID_JSON');
    await expect(readFacebookImport('missing-private-file.json')).rejects.toThrow('INPUT_READ_FAILED');
  });
  it('rejects oversized buffers/files without disclosing contents', async () => {
    const oversized = ' '.repeat(FACEBOOK_LIMITS.bytes + 1);
    expect(() => parseFacebookImport(oversized)).toThrow('INPUT_TOO_LARGE');
    await expect(readFacebookImport(await file(oversized))).rejects.toThrow('INPUT_TOO_LARGE');
  });
});
