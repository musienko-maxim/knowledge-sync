import type { KnowledgeItem } from '../core/models/knowledge-item.js';

function quoteYamlString(value: string): string {
  // JSON supplies double-quote/backslash/control escaping. Also escape YAML
  // control characters and Unicode line separators to keep each scalar on one line.
  return JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\ufffe\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

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
