import { describe, expect, it } from 'vitest';
import { knowledgeItemSchema } from '../src/core/models/knowledge-item.js';

const item = { source: 'example', sourceId: '123', title: 'A note', url: 'https://example.com/123' };

describe('KnowledgeItem validation', () => {
  it('accepts a source-independent item and optional metadata', () => {
    expect(knowledgeItemSchema.parse({ ...item, author: 'Author', collection: 'Saved',
      description: 'Description', publishedAt: '2026-01-01T12:00:00+02:00' })).toMatchObject(item);
    expect(knowledgeItemSchema.parse(item)).toEqual(item);
  });

  it.each([
    { source: ' ' }, { sourceId: '' }, { title: '' }, { url: 'not a URL' },
    { url: 'file:///private/note' }, { publishedAt: 'yesterday' },
  ])('rejects invalid fields: %j', (invalid) => {
    expect(knowledgeItemSchema.safeParse({ ...item, ...invalid }).success).toBe(false);
  });
});
