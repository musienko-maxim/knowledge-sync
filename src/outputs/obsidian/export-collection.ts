import { renderCollectionMarkdown } from './collection-markdown.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { CollectionProjection } from './collection-projection.js';
import { writeObsidianNote } from './write-note.js';

export async function exportObsidianCollection(vaultPath: string, projection: CollectionProjection): Promise<void> {
  const path = buildObsidianCollectionRelativePath(projection.collection);
  const content = renderCollectionMarkdown(projection);
  await writeObsidianNote(vaultPath, path, content);
}
