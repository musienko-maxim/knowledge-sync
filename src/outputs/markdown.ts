import type { KnowledgeItem } from '../core/models/knowledge-item.js';
import { quoteYamlString } from './yaml-string.js';
import { escapeFacebookText, facebookOwnershipPrefix } from './obsidian/facebook-safety.js';

/** Pure rendering; Facebook text is literal, other sources retain legacy Markdown. */
export function renderKnowledgeItemMarkdown(item: KnowledgeItem): string {
  const fields: Array<[string, string | undefined]> = [
    ['source', item.source],
    ['sourceId', item.sourceId],
    ['url', item.url],
    ['title', item.title],
    ['author', item.author],
    ['collection', item.collection],
    ['publishedAt', item.publishedAt],
  ];
  const metadata = fields
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${quoteYamlString(value!)}`)
    .join('\n');
  const facebook = item.source === 'facebook';
  const title = facebook ? escapeFacebookText(item.title) : item.title;
  const description = facebook && item.description !== undefined ? escapeFacebookText(item.description, true) : item.description;
  const body = description === undefined
    ? `# ${title}\n`
    : `# ${title}\n\n${description}`;
  const prefix = facebook ? facebookOwnershipPrefix('item', item) : '---\n';
  const document = `${prefix}${metadata}\n---\n\n${body}`;
  return document.endsWith('\n') ? document : `${document}\n`;
}
