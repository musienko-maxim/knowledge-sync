import { posix } from 'node:path';
import { quoteYamlString } from '../yaml-string.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { CollectionProjection } from './collection-projection.js';
import { encodeMarkdownDestination, escapeMarkdownInline } from './markdown-link.js';
import { buildObsidianRelativePath } from './note-path.js';

/** Pure deterministic rendering of a collection projection in its supplied item order. */
export function renderCollectionMarkdown(projection: CollectionProjection): string {
  const { collection, items } = projection;
  const metadata = [['source', collection.source], ['sourceId', collection.sourceId], ['title', collection.title]]
    .map(([key, value]) => `${key}: ${quoteYamlString(value!)}`).join('\n');
  const directory = posix.dirname(buildObsidianCollectionRelativePath(collection));
  const links = items.map((item) => {
    const relativePath = posix.relative(directory, buildObsidianRelativePath(item));
    return `- [${escapeMarkdownInline(item.title)}](${encodeMarkdownDestination(relativePath)})`;
  });
  return `---\n${metadata}\n---\n\n# ${escapeMarkdownInline(collection.title || collection.sourceId)}\n\n${links.length ? links.join('\n') : '_No items._'}\n`;
}
