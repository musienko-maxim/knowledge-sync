import {
  mergeFacebookItem,
  type FacebookConflictCode,
  type FacebookImport,
  type FacebookImportErrorCode,
  type FacebookInputCounters,
} from '../collectors/facebook/import.js';
import type { KnowledgeItem } from '../core/models/knowledge-item.js';
import { exportObsidianProjection, type ObsidianProjectionExportResult } from '../outputs/obsidian/export-projection.js';
import { ExportPreflightError, type PreflightConflict } from '../outputs/obsidian/preflight.js';
import { ExportPlanError } from '../outputs/obsidian/export-plan.js';
import { readObsidianSnapshot } from './read-obsidian-snapshot.js';
import type { CollectionSyncRepositories } from './sync-collection.js';

export interface FacebookEntityCounters {
  processed: number;
  new: number;
  changed: number;
  unchanged: number;
}

export type FacebookImportStage = 'input' | 'database' | 'collections' | 'items' | 'memberships' | 'snapshot' | 'export' | 'close';
export type FacebookImportFailureCode = FacebookImportErrorCode | 'VAULT_PATH_INVALID' |
  'DATABASE_SETUP_FAILED' | 'DATABASE_CLOSE_FAILED' | 'STORAGE_FAILED' | 'EXPORT_FAILED';

export interface FacebookImportResult {
  input: FacebookInputCounters;
  items: FacebookEntityCounters;
  collections: FacebookEntityCounters;
  memberships: { processed: number; new: number; unchanged: number };
  warnings: { code: FacebookConflictCode; count: number }[];
  failure?: { stage: FacebookImportStage; code: FacebookImportFailureCode };
  export:
    | { status: 'not-requested' | 'skipped' }
    | { status: 'failed'; conflicts?: readonly PreflightConflict[];
      planConflict?: Readonly<Pick<ExportPlanError, 'code' | 'firstIndex' | 'secondIndex'>> }
    | { status: 'completed'; result: ObsidianProjectionExportResult };
}

function initialResult(input: FacebookImport | undefined, exportRequested: boolean): FacebookImportResult {
  return {
    input: input ? { ...input.counters } : {
      inputOccurrences: 0, urlOccurrences: 0, distinctItems: 0,
      duplicateItemOccurrences: 0, uniqueMemberships: 0, repeatedMembershipOccurrences: 0,
      skippedOccurrences: 0, inputCollections: 0,
    },
    items: { processed: 0, new: 0, changed: 0, unchanged: 0 },
    collections: { processed: 0, new: 0, changed: 0, unchanged: 0 },
    memberships: { processed: 0, new: 0, unchanged: 0 },
    warnings: [],
    export: { status: exportRequested ? 'skipped' : 'not-requested' },
  };
}

/** Setup failures carry only fixed codes; raw filesystem and SQLite errors are private. */
export function facebookImportFailure(
  stage: FacebookImportStage,
  code: FacebookImportFailureCode,
  exportRequested: boolean,
  input?: FacebookImport,
): FacebookImportResult {
  return { ...initialResult(input, exportRequested), failure: { stage, code } };
}

const identityKey = (source: string, sourceId: string) => JSON.stringify([source, sourceId]);
const membershipKey = (source: string, collectionSourceId: string, itemSourceId: string) =>
  JSON.stringify([source, collectionSourceId, itemSourceId]);

function sameItem(left: KnowledgeItem, right: KnowledgeItem): boolean {
  return left.source === right.source && left.sourceId === right.sourceId &&
    left.url === right.url && left.title === right.title && left.description === right.description &&
    left.author === right.author && left.collection === right.collection && left.publishedAt === right.publishedAt;
}

/** Import a completely validated batch. Writes are additive and remain committed on failure. */
export async function importFacebook(
  input: FacebookImport,
  repositories: CollectionSyncRepositories,
  vaultPath?: string,
): Promise<FacebookImportResult> {
  const result = initialResult(input, vaultPath !== undefined);
  let stage: FacebookImportStage = 'collections';
  const warnings = new Map<FacebookConflictCode, number>();
  const addWarnings = (codes: readonly FacebookConflictCode[]) => {
    for (const code of new Set(codes)) warnings.set(code, (warnings.get(code) ?? 0) + 1);
    result.warnings = [...warnings].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([code, count]) => ({ code, count }));
  };
  try {
    const existingCollections = new Map((await repositories.collections.listAll())
      .map((collection) => [identityKey(collection.source, collection.sourceId), collection]));
    for (const collection of input.collections) {
      const key = identityKey(collection.source, collection.sourceId);
      const existing = existingCollections.get(key);
      const classification = !existing ? 'new' : existing.title === collection.title ? 'unchanged' : 'changed';
      await repositories.collections.upsert(collection);
      result.collections[classification]++;
      result.collections.processed++;
      existingCollections.set(key, collection);
    }

    stage = 'items';
    for (const candidate of input.items) {
      const existing = await repositories.knowledgeItems.findByIdentity(candidate.item.source, candidate.item.sourceId);
      const merged = mergeFacebookItem(candidate, existing ?? undefined);
      addWarnings(merged.warnings);
      const classification = !existing ? 'new' : sameItem(existing, merged.item) ? 'unchanged' : 'changed';
      await repositories.knowledgeItems.upsert(merged.item);
      result.items[classification]++;
      result.items.processed++;
    }

    stage = 'memberships';
    const existingMemberships = new Set((await repositories.collectionMemberships.listAll())
      .map((membership) => membershipKey(membership.source, membership.collectionSourceId, membership.itemSourceId)));
    for (const membership of input.memberships) {
      const key = membershipKey(membership.source, membership.collectionSourceId, membership.itemSourceId);
      const classification = existingMemberships.has(key) ? 'unchanged' : 'new';
      await repositories.collectionMemberships.add(membership);
      result.memberships[classification]++;
      result.memberships.processed++;
      existingMemberships.add(key);
    }

    if (vaultPath !== undefined) {
      stage = 'snapshot';
      const snapshot = await readObsidianSnapshot(repositories);
      stage = 'export';
      result.export = { status: 'completed', result: await exportObsidianProjection(vaultPath, snapshot) };
    }
  } catch (error) {
    result.failure = { stage, code: stage === 'export' ? 'EXPORT_FAILED' : 'STORAGE_FAILED' };
    if (stage === 'export') result.export = error instanceof ExportPreflightError
      ? { status: 'failed', conflicts: error.conflicts }
      : error instanceof ExportPlanError
        ? { status: 'failed', planConflict: { code: error.code, firstIndex: error.firstIndex, secondIndex: error.secondIndex } }
        : { status: 'failed' };
  }
  return result;
}
