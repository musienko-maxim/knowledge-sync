import { expect, it } from 'vitest';
import { renderCollectionMarkdown } from '../src/outputs/obsidian/collection-markdown.js';
import { buildObsidianCollectionRelativePath } from '../src/outputs/obsidian/collection-path.js';
import { encodeMarkdownDestination, escapeMarkdownInline } from '../src/outputs/obsidian/markdown-link.js';
import { buildObsidianRelativePath } from '../src/outputs/obsidian/note-path.js';

const collection = { source: 'youtube', sourceId: 'PL123', title: 'Learning' };
const item = { source: 'youtube', sourceId: 'X', title: 'Video X', url: 'https://example.com/X' };

it('renders ordered YAML, a heading and double-encoded persistent-percent link with exactly one final LF', () => {
  expect(renderCollectionMarkdown({ collection, items: [item] })).toBe(
    '---\nsource: "youtube"\nsourceId: "PL123"\ntitle: "Learning"\n---\n\n# Learning\n\n- [Video X](../%2558.md)\n');
});

it('preserves empty title metadata while using sourceId for its display heading', () => {
  expect(renderCollectionMarkdown({ collection: { ...collection, title: '' }, items: [] })).toBe(
    '---\nsource: "youtube"\nsourceId: "PL123"\ntitle: ""\n---\n\n# PL123\n\n_No items._\n');
});

it('escapes YAML and inline text independently, preserving Unicode and normalizing line boundaries', () => {
  const title = 'Привіт [x] & <b>\r\n*hello* \\ world\u2028next';
  const rendered = renderCollectionMarkdown({ collection: { ...collection, title }, items: [{ ...item, title }] });
  expect(rendered).toContain('title: "Привіт [x] & <b>\\r\\n*hello* \\\\ world\\u2028next"\n');
  const display = 'Привіт \\[x\\] &amp; &lt;b&gt; \\*hello\\* \\\\ world next';
  expect(rendered).toContain(`# ${display}\n`);
  expect(rendered).toContain(`- [${display}](../%2558.md)\n`);
  expect(rendered).not.toContain('\r');
  expect(rendered.endsWith('\n\n')).toBe(false);
});

it('documents exact Markdown inline escaping including formatting and entity syntax', () => {
  expect(escapeMarkdownInline('\\`*_{}[]()#+-.!|~ &copy; <tag>\r\nnext\nline\rfinal'))
    .toBe('\\\\\\`\\*\\_\\{\\}\\[\\]\\(\\)\\#\\+\\-\\.\\!\\|\\~ &amp;copy; &lt;tag&gt; next line final');
});

it.each([
  ['../%58.md', '../%2558.md'],
  ['../space here.md', '../space%20here.md'],
  ['../Привіт.md', '../%D0%9F%D1%80%D0%B8%D0%B2%D1%96%D1%82.md'],
  ["../a#b?c[d](e)!'*.md", '../a%23b%3Fc%5Bd%5D%28e%29%21%27%2A.md'],
])('URL-encodes literal destination %s separately from the persistent path', (path, expected) => {
  expect(encodeMarkdownDestination(path)).toBe(expected);
});

it('uses existing encoding for both identity components and keeps title-independent paths', () => {
  expect(buildObsidianCollectionRelativePath(collection)).toBe('youtube/collections/%50%4C123.md');
  expect(buildObsidianCollectionRelativePath({ ...collection, title: 'Renamed' })).toBe(buildObsidianCollectionRelativePath(collection));
  expect(buildObsidianCollectionRelativePath({ ...collection, sourceId: 'OTHER' })).not.toBe(buildObsidianCollectionRelativePath(collection));
  const unusual = { ...collection, source: 'YouTube/Привіт', sourceId: 'ID % / ?' };
  const itemPath = buildObsidianRelativePath({ ...item, ...unusual });
  const [source, file] = itemPath.split('/');
  expect(buildObsidianCollectionRelativePath(unusual)).toBe(`${source}/collections/${file}`);
});

it('keeps a literal collections item distinct from the collection directory and uses the same path in links', () => {
  const named = { ...item, sourceId: 'collections' };
  expect(buildObsidianRelativePath(named)).toBe('youtube/collections.md');
  expect(buildObsidianCollectionRelativePath({ ...collection, sourceId: 'collections' })).toBe('youtube/collections/collections.md');
  expect(renderCollectionMarkdown({ collection, items: [named] })).toContain('(../collections.md)');
});

it('links spaces and Unicode identities to the literal filesystem path', () => {
  const named = { ...item, sourceId: 'space Привіт %' };
  const relative = buildObsidianRelativePath(named).slice('youtube/'.length);
  expect(renderCollectionMarkdown({ collection, items: [named] })).toContain(`(${encodeMarkdownDestination(`../${relative}`)})`);
});

it.each([
  ['con', '%63on'], ['nul.txt', '%6Eul.txt'], ['com1', '%63om1'],
  ['CON', '%43%4F%4E'], ['name.', 'name%2E'], ['name ', 'name%20'],
])('preserves Windows-safe identity encoding for collection source/ID %s', (value, encoded) => {
  expect(buildObsidianCollectionRelativePath({ ...collection, source: value, sourceId: value }))
    .toBe(`${encoded}/collections/${encoded}.md`);
});

it('keeps case-distinct collection identities in distinct literal paths', () => {
  const upper = buildObsidianCollectionRelativePath({ ...collection, source: 'Source', sourceId: 'ID' });
  const lower = buildObsidianCollectionRelativePath({ ...collection, source: 'source', sourceId: 'id' });
  expect(upper.toLowerCase()).not.toBe(lower.toLowerCase());
});

it.each([
  { source: '', sourceId: 'id' }, { source: 'source', sourceId: '' },
  { source: '\ud800', sourceId: 'id' }, { source: 'source', sourceId: '\udfff' },
])('rejects invalid collection identity %j before deriving a path', (identity) => {
  expect(() => buildObsidianCollectionRelativePath({ ...collection, ...identity }))
    .toThrow(/must not be empty|well-formed Unicode/);
});
