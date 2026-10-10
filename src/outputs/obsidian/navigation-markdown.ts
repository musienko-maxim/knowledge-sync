import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { ObsidianProjectionSnapshot } from './collection-projection.js';
import { encodeMarkdownDestination, escapeMarkdownInline } from './markdown-link.js';
import { buildObsidianRelativePath } from './note-path.js';

export const NAVIGATION_MARKER = '<!-- knowledge-sync:generated-navigation:v1 -->';

interface NavigationEntry {
  readonly title: string;
  readonly source: string;
  readonly sourceId: string;
}

function displayTitle(title: string, fallback: string): string {
  return title.normalize('NFC')
    .replace(/\r\n|[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ').trim() || fallback;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identityLabel(value: string): string {
  // Preserve characters JSON leaves literal but the Markdown helper converts to spaces.
  return JSON.stringify(value).replace(/[\u007f\u0085\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function renderSection<T extends NavigationEntry>(
  entries: readonly T[],
  fallback: string,
  empty: string,
  buildPath: (entry: T) => string,
): string {
  const titles = new Map<string, number>();
  const normalized = entries.map((entry) => {
    const title = displayTitle(entry.title, fallback);
    titles.set(title, (titles.get(title) ?? 0) + 1);
    return { entry, title };
  });
  normalized.sort((left, right) => compare(left.title, right.title)
    || compare(left.entry.source, right.entry.source)
    || compare(left.entry.sourceId, right.entry.sourceId));
  const links = normalized.map(({ entry, title }) => {
    const label = titles.get(title)! > 1
      ? `${title} [source=${identityLabel(entry.source)}, sourceId=${identityLabel(entry.sourceId)}]`
      : title;
    return `- [${escapeMarkdownInline(label)}](${encodeMarkdownDestination(buildPath(entry))})`;
  });
  return links.length ? links.join('\n') : empty;
}

/** Pure navigation for an already validated snapshot, independent of membership counts. */
export function renderNavigationMarkdown(snapshot: ObsidianProjectionSnapshot): string {
  const collections = renderSection(snapshot.collections, 'Untitled collection', '_No collections._',
    buildObsidianCollectionRelativePath);
  const items = renderSection(snapshot.items, 'Untitled item', '_No items._', buildObsidianRelativePath);
  return `${NAVIGATION_MARKER}\n# Knowledge Sync\n\n`
    + 'Generated from persisted knowledge. Entries may include retained items and collections.\n\n'
    + `## Collections\n\n${collections}\n\n## All items\n\n${items}\n`;
}
