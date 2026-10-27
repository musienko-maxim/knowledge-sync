import type { ObsidianProjectionSnapshot } from './collection-projection.js';
import { readFile } from 'node:fs/promises';
import type { ObsidianCollectionBatchExportResult, ObsidianCollectionExportFailure } from './export-collections.js';
import type { ObsidianBatchExportResult, ObsidianExportFailure } from './export-notes.js';
import { buildObsidianExportPlan, type ObsidianExportPlan } from './export-plan.js';
import { ExportPreflightError, preflightObsidianPlan } from './preflight.js';
import { inspectExportTarget, resolveExportTarget, temporaryExportPath } from './safe-path.js';
import { writeGeneratedObsidianNote } from './write-generated-note.js';
import { writeNavigationNote } from './write-navigation.js';

export type CollectionExportOutcome =
  | { status: 'completed'; result: ObsidianCollectionBatchExportResult }
  | { status: 'failed'; error: unknown }
  | { status: 'skipped'; reason: 'upstream-failure' };

export type NavigationExportOutcome =
  | { status: 'completed' }
  | { status: 'failed'; stage: 'render' | 'write'; error: unknown }
  | { status: 'skipped'; reason: 'empty-snapshot' | 'upstream-failure' };

export interface ObsidianProjectionExportResult {
  readonly items: ObsidianBatchExportResult;
  readonly collections: CollectionExportOutcome;
  readonly navigation: NavigationExportOutcome;
}

/** Re-preflight an immutable plan immediately before phased publication. No legacy cleanup. */
export async function exportObsidianPlan(vault: string, plan: ObsidianExportPlan): Promise<ObsidianProjectionExportResult> {
  const checked = await preflightObsidianPlan(vault, plan);
  if (checked.conflicts.length) throw new ExportPreflightError(checked.conflicts);
  const failures: ObsidianExportFailure[] = [];
  for (const [index, entry] of plan.items.entries()) {
    try { await writeGeneratedObsidianNote(vault, entry.relativePath, entry.markdown, 'item', entry.item); }
    catch (error) { failures.push({ index, item: entry.item, error }); }
  }
  const items = { processed: plan.items.length, succeeded: plan.items.length - failures.length, failed: failures.length, failures };
  if (items.failed) return {
    items, collections: { status: 'skipped', reason: 'upstream-failure' },
    navigation: { status: 'skipped', reason: 'upstream-failure' },
  };
  const collectionFailures: ObsidianCollectionExportFailure[] = [];
  for (const [index, entry] of plan.collections.entries()) {
    try { await writeGeneratedObsidianNote(vault, entry.relativePath, entry.markdown, 'collection', entry.collection); }
    catch (error) { collectionFailures.push({ index, collection: entry.collection, error }); }
  }
  const collections: CollectionExportOutcome = { status: 'completed', result: {
    processed: plan.collections.length, succeeded: plan.collections.length - collectionFailures.length,
    failed: collectionFailures.length, failures: collectionFailures,
  } };
  if (collectionFailures.length) return { items, collections, navigation: { status: 'skipped', reason: 'upstream-failure' } };
  if (!plan.navigation) return { items, collections, navigation: { status: 'skipped', reason: 'empty-snapshot' } };
  try {
    const target = resolveExportTarget(vault, plan.navigation.relativePath);
    temporaryExportPath(target, 'navigation', '0'.repeat(36));
    const state = await inspectExportTarget(vault, target);
    if (state === 'file' && (await readFile(target)).equals(Buffer.from(plan.navigation.markdown, 'utf8'))) {
      return { items, collections, navigation: { status: 'completed' } };
    }
    await writeNavigationNote(vault, plan.navigation.markdown, async () => { await inspectExportTarget(vault, target); });
    return { items, collections, navigation: { status: 'completed' } };
  } catch (error) {
    return { items, collections, navigation: { status: 'failed', stage: 'write', error } };
  }
}

/** Every production full-snapshot exporter uses this one plan and publication pipeline. */
export async function exportObsidianProjection(vault: string, snapshot: ObsidianProjectionSnapshot): Promise<ObsidianProjectionExportResult> {
  return exportObsidianPlan(vault, buildObsidianExportPlan(snapshot));
}
