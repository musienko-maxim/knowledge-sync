import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import { renderKnowledgeItemMarkdown } from '../markdown.js';
import { buildCollectionProjections, type ObsidianProjectionSnapshot } from './collection-projection.js';
import { buildObsidianRelativePath } from './note-path.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import { renderCollectionMarkdown } from './collection-markdown.js';
import { NAVIGATION_FILENAME, renderNavigationMarkdown } from './navigation-markdown.js';
import { portablePathKey, type PathIdentity, type PathSuffix } from './readable-path.js';

export interface PlannedItem {
  readonly item: KnowledgeItem;
  readonly relativePath: string;
  readonly markdown: string;
}
export interface PlannedCollection {
  readonly collection: KnowledgeCollection;
  readonly relativePath: string;
  readonly markdown: string;
}
export interface ObsidianExportPlan {
  readonly items: readonly PlannedItem[];
  readonly collections: readonly PlannedCollection[];
  readonly navigation: { readonly relativePath: string; readonly markdown: string } | undefined;
}

export class ExportPlanError extends Error {
  constructor(public readonly code: 'PATH_COLLISION' | 'SUFFIX_COLLISION',
    public readonly firstIndex: number, public readonly secondIndex: number) {
    super(`Export plan refused: ${code} (entries ${firstIndex}, ${secondIndex}).`);
    this.name = 'ExportPlanError';
  }
}

function identityKey(entity: PathIdentity): string { return JSON.stringify([entity.source, entity.sourceId]); }
function compareIdentity(a: PathIdentity, b: PathIdentity): number {
  return a.source < b.source ? -1 : a.source > b.source ? 1 : a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

/** All destinations are derived once; rendering consumes only these stored mappings. */
export function buildObsidianExportPlan(
  snapshot: ObsidianProjectionSnapshot,
  options: { readonly suffixForIdentity?: PathSuffix } = {},
): ObsidianExportPlan {
  const items = snapshot.items.map((item) => Object.freeze({ ...item })).sort(compareIdentity);
  const collections = snapshot.collections.map((collection) => Object.freeze({ ...collection })).sort(compareIdentity);
  const memberships = snapshot.memberships.map((membership) => Object.freeze({ ...membership }));
  const projections = buildCollectionProjections(items, collections, memberships);
  const itemPaths = new Map(items.map((item) => [identityKey(item), buildObsidianRelativePath(item, options.suffixForIdentity)]));
  const collectionPaths = new Map(collections.map((collection) => [identityKey(collection),
    buildObsidianCollectionRelativePath(collection, options.suffixForIdentity)]));
  const paths = [...itemPaths.values(), ...collectionPaths.values()];
  const suffixes = new Map<string, number>();
  const equivalents = new Map<string, number>();
  for (const [index, path] of [...paths, NAVIGATION_FILENAME].entries()) {
    const key = portablePathKey(path);
    const equivalent = equivalents.get(key);
    if (equivalent !== undefined) throw new ExportPlanError('PATH_COLLISION', equivalent, index);
    for (const [previous, previousIndex] of equivalents) {
      if (key.startsWith(`${previous}/`) || previous.startsWith(`${key}/`)) {
        throw new ExportPlanError('PATH_COLLISION', previousIndex, index);
      }
    }
    equivalents.set(key, index);
    if (index < paths.length) {
      const suffix = /--([a-f0-9]{32})\.md$/.exec(path)![1]!;
      const collision = suffixes.get(suffix);
      if (collision !== undefined) throw new ExportPlanError('SUFFIX_COLLISION', collision, index);
      suffixes.set(suffix, index);
    }
  }
  const itemPath = (item: KnowledgeItem) => itemPaths.get(identityKey(item))!;
  const collectionPath = (collection: KnowledgeCollection) => collectionPaths.get(identityKey(collection))!;
  const plannedItems = Object.freeze(items.map((item) => Object.freeze({
    item, relativePath: itemPath(item), markdown: renderKnowledgeItemMarkdown(item),
  })));
  const plannedCollections = Object.freeze(projections.map((projection) => Object.freeze({
    collection: projection.collection,
    relativePath: collectionPath(projection.collection),
    markdown: renderCollectionMarkdown(projection, { collectionPath: collectionPath(projection.collection), itemPath }),
  })));
  const navigation = items.length || collections.length ? Object.freeze({
    relativePath: NAVIGATION_FILENAME,
    markdown: renderNavigationMarkdown({ items, collections, memberships }, { itemPath, collectionPath }),
  }) : undefined;
  return Object.freeze({ items: plannedItems, collections: plannedCollections, navigation });
}
