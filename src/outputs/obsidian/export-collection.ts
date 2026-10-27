import { renderCollectionMarkdown } from './collection-markdown.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { CollectionProjection } from './collection-projection.js';
import { writeGeneratedObsidianNote } from './write-generated-note.js';

export async function exportObsidianCollection(vaultPath: string, projection: CollectionProjection): Promise<void> {
  const path = buildObsidianCollectionRelativePath(projection.collection);
  const content = renderCollectionMarkdown(projection);
  await writeGeneratedObsidianNote(vaultPath, path, content, 'collection', projection.collection);
}
