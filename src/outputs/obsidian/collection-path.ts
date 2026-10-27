import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import { encodeObsidianPathComponent } from './note-path.js';
import { assertWindowsPathComponent, buildReadableFilename, type PathSuffix } from './readable-path.js';

/** Collection namespace retains source encoding while the basename follows its title. */
export function buildObsidianCollectionRelativePath(collection: KnowledgeCollection, suffixForIdentity?: PathSuffix): string {
  const directory = encodeObsidianPathComponent(collection.source, 'source');
  assertWindowsPathComponent(directory);
  return `${directory}/collections/${buildReadableFilename('collection', collection, suffixForIdentity)}`;
}
