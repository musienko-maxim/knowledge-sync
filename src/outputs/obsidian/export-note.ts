import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { renderKnowledgeItemMarkdown } from '../markdown.js';
import { buildObsidianRelativePath } from './note-path.js';
import { writeObsidianNote } from './write-note.js';

/** Exports one item using the existing path, rendering, and writing contracts. */
export async function exportObsidianNote(
  vaultPath: string,
  item: KnowledgeItem,
): Promise<void> {
  const relativePath = buildObsidianRelativePath(item);
  const content = renderKnowledgeItemMarkdown(item);
  await writeObsidianNote(vaultPath, relativePath, content);
}
