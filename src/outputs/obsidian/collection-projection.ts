import type { CollectionMembership } from '../../core/models/collection-membership.js';
import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { buildObsidianCollectionRelativePath } from './collection-path.js';
import { buildObsidianRelativePath } from './note-path.js';

export interface CollectionProjection {
  readonly collection: KnowledgeCollection;
  readonly items: readonly KnowledgeItem[];
}

export interface ObsidianProjectionSnapshot {
  readonly items: readonly KnowledgeItem[];
  readonly collections: readonly KnowledgeCollection[];
  readonly memberships: readonly CollectionMembership[];
}

function identity(source: string, sourceId: string): string {
  return JSON.stringify([source, sourceId]);
}

function compareIdentity(a: { source: string; sourceId: string }, b: { source: string; sourceId: string }): number {
  return a.source < b.source ? -1 : a.source > b.source ? 1 : a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

/** Strict pure join; validates all identities/edges before returning any projection. */
export function buildCollectionProjections(
  items: readonly KnowledgeItem[],
  collections: readonly KnowledgeCollection[],
  memberships: readonly CollectionMembership[],
): readonly CollectionProjection[] {
  const itemByIdentity = new Map<string, KnowledgeItem>();
  for (const item of items) {
    buildObsidianRelativePath(item);
    const key = identity(item.source, item.sourceId);
    if (itemByIdentity.has(key)) throw new Error('Projection contains a duplicate item identity.');
    itemByIdentity.set(key, item);
  }
  const projectionByIdentity = new Map<string, { collection: KnowledgeCollection; items: KnowledgeItem[] }>();
  for (const collection of collections) {
    buildObsidianCollectionRelativePath(collection);
    const key = identity(collection.source, collection.sourceId);
    if (projectionByIdentity.has(key)) throw new Error('Projection contains a duplicate collection identity.');
    projectionByIdentity.set(key, { collection, items: [] });
  }
  const seenMemberships = new Set<string>();
  for (const membership of memberships) {
    const edge = JSON.stringify([membership.source, membership.collectionSourceId, membership.itemSourceId]);
    if (seenMemberships.has(edge)) throw new Error('Projection contains a duplicate membership.');
    seenMemberships.add(edge);
    const projection = projectionByIdentity.get(identity(membership.source, membership.collectionSourceId));
    const item = itemByIdentity.get(identity(membership.source, membership.itemSourceId));
    if (!projection) throw new Error('Projection membership references a missing collection.');
    if (!item) throw new Error('Projection membership references a missing item.');
    projection.items.push(item);
  }
  return [...projectionByIdentity.values()].sort((a, b) => compareIdentity(a.collection, b.collection))
    .map(({ collection, items: members }) => ({ collection, items: members.sort(compareIdentity) }));
}
