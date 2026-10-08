import type { KnowledgeItem } from '../core/models/knowledge-item.js';
import { quoteYamlString } from './yaml-string.js';

/** Pure rendering; supplied title/description Markdown and newlines stay verbatim. */
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
  const body = item.description === undefined
    ? `# ${item.title}\n`
    : `# ${item.title}\n\n${item.description}`;
  const document = `---\n${metadata}\n---\n\n${body}`;
  return document.endsWith('\n') ? document : `${document}\n`;
}
