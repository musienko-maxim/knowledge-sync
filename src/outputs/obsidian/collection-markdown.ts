import { posix } from 'node:path';
import { quoteYamlString } from '../yaml-string.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { CollectionProjection } from './collection-projection.js';
import { encodeMarkdownDestination, escapeMarkdownInline } from './markdown-link.js';
import { buildObsidianRelativePath } from './note-path.js';
import { escapeFacebookText } from './facebook-safety.js';
import { sealGeneratedMarkdown } from './generated-note.js';

export interface CollectionMarkdownDestinations {
  readonly collectionPath: string;
  readonly itemPath: (item: CollectionProjection['items'][number]) => string;
}

/** Pure deterministic rendering of a collection projection in its supplied item order. */
export function renderCollectionMarkdown(projection: CollectionProjection, destinations?: CollectionMarkdownDestinations): string {
  const { collection, items } = projection;
  const metadata = [['source', collection.source], ['sourceId', collection.sourceId], ['title', collection.title]]
    .map(([key, value]) => `${key}: ${quoteYamlString(value!)}`).join('\n');
  const directory = posix.dirname(destinations?.collectionPath ?? buildObsidianCollectionRelativePath(collection));
  const links = items.map((item) => {
    const relativePath = posix.relative(directory, destinations ? destinations.itemPath(item) : buildObsidianRelativePath(item));
    const label = item.source === 'facebook' ? escapeFacebookText(item.title) : escapeMarkdownInline(item.title);
    return `- [${label}](${encodeMarkdownDestination(relativePath)})`;
  });
  const facebook = collection.source === 'facebook';
  const title = (facebook ? escapeFacebookText : escapeMarkdownInline)(collection.title || collection.sourceId);
  return sealGeneratedMarkdown('collection', collection,
    `---\n${metadata}\n---\n\n# ${title}\n\n${links.length ? links.join('\n') : '_No items._'}\n`);
}
