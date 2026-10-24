import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../markdown.js';
import { buildObsidianRelativePath } from './note-path.js';
import { writeObsidianNote } from './write-note.js';
import { facebookOwnershipPrefix } from './facebook-safety.js';
import { writeOwnedObsidianNote } from './write-owned-note.js';

/** Exports one item using the existing path, rendering, and writing contracts. */
export async function exportObsidianNote(
  vaultPath: string,
  item: KnowledgeItem,
): Promise<void> {
  const relativePath = buildObsidianRelativePath(item);
  const content = renderKnowledgeItemMarkdown(item);
  if (item.source === 'facebook') {
    return writeOwnedObsidianNote(vaultPath, relativePath, content, facebookOwnershipPrefix('item', item));
  }
  await writeObsidianNote(vaultPath, relativePath, content);
}
