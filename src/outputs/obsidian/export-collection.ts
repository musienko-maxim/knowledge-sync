import { renderCollectionMarkdown } from './collection-markdown.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import type { CollectionProjection } from './collection-projection.js';
import { writeObsidianNote } from './write-note.js';
import { facebookOwnershipPrefix } from './facebook-safety.js';
import { writeOwnedObsidianNote } from './write-owned-note.js';

export async function exportObsidianCollection(vaultPath: string, projection: CollectionProjection): Promise<void> {
  const path = buildObsidianCollectionRelativePath(projection.collection);
  const content = renderCollectionMarkdown(projection);
  if (projection.collection.source === 'facebook') {
    return writeOwnedObsidianNote(vaultPath, path, content, facebookOwnershipPrefix('collection', projection.collection));
  }
  await writeObsidianNote(vaultPath, path, content);
}
