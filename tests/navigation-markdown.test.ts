import { describe, expect, it } from 'vitest';
import type { KnowledgeCollection } from '../src/core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../src/core/models/knowledge-item.js';
import type { ObsidianProjectionSnapshot } from '../src/outputs/obsidian/collection-projection.js';
import { NAVIGATION_MARKER, renderNavigationMarkdown } from '../src/outputs/obsidian/navigation-markdown.js';

const item: KnowledgeItem = { source: 'youtube', sourceId: 'X', title: 'Video X', url: 'https://example.com/X' };
const collection: KnowledgeCollection = { source: 'youtube', sourceId: 'PL1', title: 'Learning' };
const empty: ObsidianProjectionSnapshot = { items: [], collections: [], memberships: [] };

function bullets(snapshot: ObsidianProjectionSnapshot): string[] {
  return renderNavigationMarkdown(snapshot).split('\n').filter((line) => line.startsWith('- '));
}

describe('navigation Markdown', () => {
  it('renders the exact document layout, root-relative links, marker, and final LF', () => {
    expect(NAVIGATION_MARKER).toBe('<!-- knowledge-sync:generated-navigation:v1 -->');
    expect(renderNavigationMarkdown({ ...empty, collections: [collection], items: [item] })).toBe(
      '<!-- knowledge-sync:generated-navigation:v1 -->\n'
      + '# Knowledge Sync\n\n'
      + 'Generated from persisted knowledge. Entries may include retained items and collections.\n\n'
      + '## Collections\n\n'
      + '- [Learning](youtube/collections/%2550%254C1.md)\n\n'
      + '## All items\n\n'
      + '- [Video X](youtube/%2558.md)\n');
  });

  it.each([
    [empty, '_No collections._', '_No items._'],
    [{ ...empty, items: [item] }, '_No collections._', '- [Video X](youtube/%2558.md)'],
    [{ ...empty, collections: [collection] }, '- [Learning](youtube/collections/%2550%254C1.md)', '_No items._'],
  ])('keeps both sections when one or both arrays are empty', (snapshot, collections, items) => {
    const rendered = renderNavigationMarkdown(snapshot);
    expect(rendered).toContain(`## Collections\n\n${collections}\n\n## All items\n\n${items}\n`);
    expect(rendered.startsWith('\uFEFF')).toBe(false);
    expect(rendered).not.toContain('\r');
    expect(rendered.endsWith('\n\n')).toBe(false);
  });

  it('includes shared and unassociated items exactly once without using legacy collection text', () => {
    const snapshot = {
      items: [item, { ...item, sourceId: 'retained', title: 'Retained', collection: 'Unrelated legacy value' }],
      collections: [collection, { ...collection, sourceId: 'PL2', title: 'Other' }],
      memberships: [
        { source: 'youtube', collectionSourceId: 'PL1', itemSourceId: 'X' },
        { source: 'youtube', collectionSourceId: 'PL2', itemSourceId: 'X' },
      ],
    };
    expect(bullets(snapshot)).toEqual([
      '- [Learning](youtube/collections/%2550%254C1.md)',
      '- [Other](youtube/collections/%2550%254C2.md)',
      '- [Retained](youtube/retained.md)',
      '- [Video X](youtube/%2558.md)',
    ]);
  });

  it('does not mutate frozen arrays or entities and renders reordered snapshots identically', () => {
    const items = Object.freeze([Object.freeze(item), Object.freeze({ ...item, sourceId: 'a', title: 'Alpha' })]);
    const collections = Object.freeze([Object.freeze(collection), Object.freeze({ ...collection, sourceId: 'a', title: 'Alpha' })]);
    const memberships = Object.freeze([
      Object.freeze({ source: 'youtube', collectionSourceId: 'PL1', itemSourceId: 'X' }),
      Object.freeze({ source: 'youtube', collectionSourceId: 'a', itemSourceId: 'a' }),
    ]);
    const snapshot = Object.freeze({ items, collections, memberships });
    const before = JSON.stringify(snapshot);
    expect(renderNavigationMarkdown(snapshot)).toBe(renderNavigationMarkdown({
      items: [...items].reverse(), collections: [...collections].reverse(), memberships: [...memberships].reverse(),
    }));
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('uses the two blank-title fallbacks without changing stored values', () => {
    expect(bullets({ ...empty, items: [{ ...item, title: '\u0000\r\n\t \u0085' }],
      collections: [{ ...collection, title: '\u2028 \u2029' }] })).toEqual([
      '- [Untitled collection](youtube/collections/%2550%254C1.md)',
      '- [Untitled item](youtube/%2558.md)',
    ]);
  });

  it('normalizes NFC, whitespace and all specified controls before sorting and grouping', () => {
    const controls = '\u0000\u001f\u007f\u0085\u2028\u2029\r\n\t';
    const items = [
      { ...item, sourceId: 'b', title: `  Cafe\u0301${controls}B \u00a0 ` },
      { ...item, sourceId: 'a', title: 'Café B' },
      { ...item, sourceId: 'c', title: 'Café A' },
    ];
    expect(bullets({ ...empty, items })).toEqual([
      '- [Café A](youtube/c.md)',
      String.raw`- [Café B \[source="youtube", sourceId="a"\]](youtube/a.md)`,
      String.raw`- [Café B \[source="youtube", sourceId="b"\]](youtube/b.md)`,
    ]);
  });

  it('groups equivalent titles separately within each section', () => {
    const items = ['A\u0000B', 'A\nB', 'A B'].map((title, index) => ({ ...item, title, sourceId: `${index}` }));
    expect(bullets({ ...empty, items, collections: [{ ...collection, title: 'A B' }] })).toEqual([
      '- [A B](youtube/collections/%2550%254C1.md)',
      String.raw`- [A B \[source="youtube", sourceId="0"\]](youtube/0.md)`,
      String.raw`- [A B \[source="youtube", sourceId="1"\]](youtube/1.md)`,
      String.raw`- [A B \[source="youtube", sourceId="2"\]](youtube/2.md)`,
    ]);
  });

  it('suffixes every duplicate collection title using raw identities', () => {
    expect(bullets({ ...empty, collections: [collection, { ...collection, source: 'other' }] })).toEqual([
      String.raw`- [Learning \[source="other", sourceId="PL1"\]](other/collections/%2550%254C1.md)`,
      String.raw`- [Learning \[source="youtube", sourceId="PL1"\]](youtube/collections/%2550%254C1.md)`,
    ]);
  });

  it.each([
    ['\u007f', '007f'], ['\u0085', '0085'], ['\u2028', '2028'], ['\u2029', '2029'],
  ])('preserves identity control %s in a JSON suffix instead of turning it into a space', (control, code) => {
    const rendered = renderNavigationMarkdown({ ...empty, items: [
      { ...item, source: `s${control}x`, sourceId: `a${control}b`, title: 'Same' },
      { ...item, source: 's x', sourceId: 'a b', title: 'Same' },
    ] });
    expect(rendered).toContain(String.raw`Same \[source="s\\u${code}x", sourceId="a\\u${code}b"\]`);
    expect(rendered).toContain(String.raw`Same \[source="s x", sourceId="a b"\]`);
    expect(rendered).not.toContain(control);
  });

  it('JSON-escapes quotes, slashes and C0 controls before a single Markdown escaping pass', () => {
    const rendered = renderNavigationMarkdown({ ...empty, items: [
      { ...item, source: 'a"b\\c\n', sourceId: '<&[]\t', title: 'Same' },
      { ...item, title: 'Same' },
    ] });
    expect(rendered).toContain(String.raw`Same \[source="a\\"b\\\\c\\n", sourceId="&lt;&amp;\[\]\\t"\]`);
    expect(rendered).not.toContain('&amp;lt;');
  });

  it('sorts by UTF-16 title, then raw source and raw sourceId without locale or case folding', () => {
    const items = [
      { ...item, source: 'b', sourceId: 'b', title: 'Same' },
      { ...item, source: 'a', sourceId: 'a', title: 'Same' },
      { ...item, source: 'a', sourceId: 'A', title: 'Same' },
      { ...item, source: 'A', sourceId: 'z', title: 'Same' },
      { ...item, sourceId: 'z', title: 'a' },
      { ...item, sourceId: 'y', title: 'Z' },
      { ...item, sourceId: 'x', title: '😀' },
      { ...item, sourceId: 'w', title: '\ue000' },
    ];
    expect(bullets({ ...empty, items }).map((line) => line.slice(line.lastIndexOf('](') + 2, -1))).toEqual([
      '%2541/z.md', 'a/%2541.md', 'a/a.md', 'b/b.md',
      'youtube/y.md', 'youtube/z.md', 'youtube/x.md', 'youtube/w.md',
    ]);
  });

  it('escapes Markdown punctuation and HTML/entities exactly once', () => {
    const title = '\\`*_{}[]()#+-.!|~ &copy; <tag>';
    expect(bullets({ ...empty, items: [{ ...item, title }] })).toEqual([
      String.raw`- [\\\`\*\_\{\}\[\]\(\)\#\+\-\.\!\|\~ &amp;copy; &lt;tag&gt;](youtube/%2558.md)`,
    ]);
  });

  it.each([
    ['%', '%2525'], ['é', '%25C3%25A9'], ['e\u0301', 'e%25CC%2581'],
    ['X', '%2558'], ['x', 'x'], ['con', '%2563on'], ['CON', '%2543%254F%254E'],
  ])('keeps literal canonical identity encoding for %s, regardless of changed title', (sourceId, destination) => {
    const original = { ...item, sourceId, title: 'Original' };
    const updated = { ...original, title: 'Renamed' };
    expect(bullets({ ...empty, items: [original] })).toEqual([`- [Original](youtube/${destination}.md)`]);
    expect(bullets({ ...empty, items: [updated] })).toEqual([`- [Renamed](youtube/${destination}.md)`]);
    expect(bullets({ ...empty, collections: [{ ...collection, sourceId }] })).toEqual([
      `- [Learning](youtube/collections/${destination}.md)`,
    ]);
  });
});
