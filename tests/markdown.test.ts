import { describe, expect, it } from 'vitest';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../src/outputs/markdown.js';

const item: KnowledgeItem = {
  source: 'example', sourceId: 'item-123', url: 'https://example.com/123', title: 'A note',
};
const frontMatter = '---\nsource: "example"\nsourceId: "item-123"\n'
  + 'url: "https://example.com/123"\ntitle: "A note"\n---\n\n';

describe('renderKnowledgeItemMarkdown', () => {
  it('renders required metadata in order, a title, and exact structural spacing', () => {
    expect(renderKnowledgeItemMarkdown(item)).toBe(frontMatter + '# A note\n');
  });

  it('renders all optional metadata in order and keeps description in the body', () => {
    expect(renderKnowledgeItemMarkdown({
      ...item, author: 'An author', collection: 'Saved',
      publishedAt: '2026-01-10T12:00:00+02:00', description: 'Description text.',
    })).toBe('---\nsource: "example"\nsourceId: "item-123"\n'
      + 'url: "https://example.com/123"\ntitle: "A note"\n'
      + 'author: "An author"\ncollection: "Saved"\npublishedAt: "2026-01-10T12:00:00+02:00"\n'
      + '---\n\n# A note\n\nDescription text.\n');
  });

  it('treats explicitly undefined optional fields like omitted fields', () => {
    expect(renderKnowledgeItemMarkdown({
      ...item, author: undefined, collection: undefined, publishedAt: undefined, description: undefined,
    })).toBe(renderKnowledgeItemMarkdown(item));
  });

  it.each(['author', 'collection'] as const)('serializes an empty %s explicitly', (field) => {
    expect(renderKnowledgeItemMarkdown({ ...item, [field]: '' }))
      .toBe(frontMatter.replace('\n---\n\n', `\n${field}: ""\n---\n\n`) + '# A note\n');
  });

  it.each([
    ['quote "inside"', '"quote \\"inside\\""'],
    ['C:\\notes\\file', '"C:\\\\notes\\\\file"'],
    ['Hello: world', '"Hello: world"'],
    ['Channel #1', '"Channel #1"'],
    ['true', '"true"'],
    ['false', '"false"'],
    ['null', '"null"'],
    ['2026-01-10', '"2026-01-10"'],
    ['Привіт 世界 🚀', '"Привіт 世界 🚀"'],
    ['  padded  ', '"  padded  "'],
    ['first\nsecond', '"first\\nsecond"'],
    ['first\r\nsecond', '"first\\r\\nsecond"'],
    ['\t\u0000\b\f', '"\\t\\u0000\\b\\f"'],
    ['\u007f\u0085\u009f', '"\\u007f\\u0085\\u009f"'],
    ['\u2028\u2029', '"\\u2028\\u2029"'],
    ['\ufffe\uffff', '"\\ufffe\\uffff"'],
  ])('quotes and escapes metadata %j without changing its value', (value, quoted) => {
    const output = renderKnowledgeItemMarkdown({ ...item, author: value });
    expect(output).toBe(frontMatter.replace('\n---\n\n', `\nauthor: ${quoted}\n---\n\n`) + '# A note\n');
  });

  it.each([
    '2026-01-10T12:00:00Z',
    '2026-01-10T14:00:00+02:00',
    '2026-01-10T12:00:00.1200Z',
  ])('preserves publication date representation %s', (publishedAt) => {
    expect(renderKnowledgeItemMarkdown({ ...item, publishedAt }))
      .toContain(`\npublishedAt: "${publishedAt}"\n`);
  });

  it.each([
    [undefined, '# A note\n'],
    ['', '# A note\n\n'],
    ['Text', '# A note\n\nText\n'],
    ['Text\n', '# A note\n\nText\n'],
    ['Text\n\n', '# A note\n\nText\n\n'],
    ['First\n\nSecond', '# A note\n\nFirst\n\nSecond\n'],
    ['First\r\nSecond\r\n', '# A note\n\nFirst\r\nSecond\r\n'],
    ['Text\r', '# A note\n\nText\r\n'],
    ['  **bold**\n\n[link](https://example.com)  ', '# A note\n\n  **bold**\n\n[link](https://example.com)  \n'],
    ['\n\n', '# A note\n\n\n\n'],
  ])('preserves description %j and applies the final-newline rule', (description, body) => {
    expect(renderKnowledgeItemMarkdown({ ...item, description })).toBe(frontMatter + body);
  });

  it('distinguishes absent description from an explicit empty string', () => {
    expect(renderKnowledgeItemMarkdown({ ...item, description: '' }))
      .not.toBe(renderKnowledgeItemMarkdown(item));
  });

  it.each([
    ['**bold** [link](url) # title', '"**bold** [link](url) # title"'],
    ['First\nSecond', '"First\\nSecond"'],
    ['First\r\nSecond', '"First\\r\\nSecond"'],
    ['  padded title  ', '"  padded title  "'],
    ['Title\n\n', '"Title\\n\\n"'],
  ])('keeps title %j verbatim after the heading prefix', (title, quoted) => {
    expect(renderKnowledgeItemMarkdown({ ...item, title }))
      .toBe(frontMatter.replace('title: "A note"', `title: ${quoted}`) + `# ${title}\n`);
  });

  it('does not reparse or trim supplied identity strings', () => {
    expect(renderKnowledgeItemMarkdown({ ...item, source: ' example ', sourceId: ' item-123 ' }))
      .toBe(frontMatter.replace('"example"', '" example "').replace('"item-123"', '" item-123 "') + '# A note\n');
  });

  it('uses LF for generated separators even when title and description contain CRLF', () => {
    expect(renderKnowledgeItemMarkdown({ ...item, title: 'A\r\nB', description: 'C\r\nD' }))
      .toBe('---\nsource: "example"\nsourceId: "item-123"\nurl: "https://example.com/123"\n'
        + 'title: "A\\r\\nB"\n---\n\n# A\r\nB\n\nC\r\nD\n');
  });

  it('is deterministic and does not mutate a frozen input', () => {
    const original = {
      ...item, author: '', collection: 'Saved', description: 'Text\r\n\r\n',
      publishedAt: '2026-01-10T12:00:00+02:00',
    };
    const frozen = Object.freeze({ ...original });
    const first = renderKnowledgeItemMarkdown(frozen);
    expect(renderKnowledgeItemMarkdown(frozen)).toBe(first);
    expect(renderKnowledgeItemMarkdown({ ...original })).toBe(first);
    expect(frozen).toEqual(original);
  });
});
