import { expect, it } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { buildCollectionProjections, type ObsidianProjectionSnapshot } from '../src/outputs/obsidian/collection-projection.js';

const x: KnowledgeItem = Object.freeze({ source: 'youtube', sourceId: 'X', title: 'X', url: 'https://example.com/X', collection: 'Wrong title' });
const y = Object.freeze({ ...x, sourceId: 'Y' });
const a = Object.freeze({ source: 'youtube', sourceId: 'A', title: 'A' });
const b = Object.freeze({ ...a, sourceId: 'B' });
const ax = Object.freeze({ source: 'youtube', collectionSourceId: 'A', itemSourceId: 'X' });

it('joins shared items with complete identities, sorts deterministically and preserves readonly inputs/references', () => {
  const otherItem = Object.freeze({ ...x, source: 'other' });
  const otherCollection = Object.freeze({ ...a, source: 'other' });
  const items = Object.freeze([y, x, otherItem]);
  const collections = Object.freeze([b, a, otherCollection]);
  const memberships = Object.freeze([
    Object.freeze({ ...ax, itemSourceId: 'Y' }), Object.freeze({ ...ax, source: 'other' }),
    Object.freeze({ ...ax, collectionSourceId: 'B' }), ax,
  ]);
  const result = buildCollectionProjections(items, collections, memberships);
  expect(result).toEqual([{ collection: otherCollection, items: [otherItem] },
    { collection: a, items: [x, y] }, { collection: b, items: [x] }]);
  expect(result[1]!.collection).toBe(a);
  expect(result[1]!.items[0]).toBe(x);
  expect(result[2]!.items[0]).toBe(x);
  expect(items).toEqual([y, x, otherItem]);
  expect(collections).toEqual([b, a, otherCollection]);
  expect(memberships).toHaveLength(4);
});

it('keeps empty collections and never infers memberships from legacy collection text', () => {
  expect(buildCollectionProjections([{ ...x, collection: a.title }], [a], [])).toEqual([{ collection: a, items: [] }]);
  expect(buildCollectionProjections([], [], [])).toEqual([]);
});

it('does not conflate identities containing delimiter-like characters', () => {
  const left = { ...x, source: 'a/b', sourceId: 'c' };
  const right = { ...x, source: 'a', sourceId: 'b/c' };
  const collections = [{ ...a, source: left.source }, { ...a, source: right.source }];
  const memberships = [left, right].map((item) => ({ source: item.source, collectionSourceId: 'A', itemSourceId: item.sourceId }));
  expect(buildCollectionProjections([left, right], collections, memberships)).toEqual([
    { collection: collections[1], items: [right] }, { collection: collections[0], items: [left] },
  ]);
});

const malformed: Array<{ name: string; snapshot: ObsidianProjectionSnapshot; pattern: RegExp }> = [
  { name: 'duplicate item', snapshot: { items: [x, { ...x }], collections: [a], memberships: [] }, pattern: /duplicate item/ },
  { name: 'duplicate collection', snapshot: { items: [x], collections: [a, { ...a }], memberships: [] }, pattern: /duplicate collection/ },
  { name: 'duplicate edge', snapshot: { items: [x], collections: [a], memberships: [ax, { ...ax }] }, pattern: /duplicate membership/ },
  { name: 'missing item', snapshot: { items: [y], collections: [a], memberships: [ax] }, pattern: /missing item/ },
  { name: 'missing collection', snapshot: { items: [x], collections: [b], memberships: [ax] }, pattern: /missing collection/ },
  { name: 'wrong item source', snapshot: { items: [{ ...x, source: 'other' }], collections: [a], memberships: [ax] }, pattern: /missing item/ },
  { name: 'wrong collection source', snapshot: { items: [x], collections: [{ ...a, source: 'other' }], memberships: [ax] }, pattern: /missing collection/ },
  { name: 'empty item identity', snapshot: { items: [{ ...x, sourceId: '' }], collections: [], memberships: [] }, pattern: /must not be empty/ },
  { name: 'malformed collection Unicode', snapshot: { items: [], collections: [{ ...a, sourceId: '\ud800' }], memberships: [] }, pattern: /well-formed Unicode/ },
];

it.each(malformed)('rejects $name without silently repairing the snapshot', ({ snapshot, pattern }) => {
  expect(() => buildCollectionProjections(snapshot.items, snapshot.collections, snapshot.memberships)).toThrow(pattern);
});
