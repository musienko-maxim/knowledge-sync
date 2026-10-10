import { buildCollectionProjections, type ObsidianProjectionSnapshot } from './collection-projection.js';
import { exportObsidianCollections, type ObsidianCollectionBatchExportResult } from './export-collections.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from './export-notes.js';
import { renderNavigationMarkdown } from './navigation-markdown.js';
import { writeNavigationNote } from './write-navigation.js';

export type CollectionExportOutcome =
  | { status: 'completed'; result: ObsidianCollectionBatchExportResult }
  | { status: 'failed'; error: unknown };

export type NavigationExportOutcome =
  | { status: 'completed' }
  | { status: 'failed'; stage: 'render' | 'write'; error: unknown }
  | { status: 'skipped'; reason: 'empty-snapshot' | 'upstream-failure' };

export interface ObsidianProjectionExportResult {
  readonly items: ObsidianBatchExportResult;
  readonly collections: CollectionExportOutcome;
  readonly navigation: NavigationExportOutcome;
}

/** Validate the snapshot, export notes, then navigation while retaining each phase's results. */
export async function exportObsidianProjection(
  vaultPath: string,
  snapshot: ObsidianProjectionSnapshot,
): Promise<ObsidianProjectionExportResult> {
  const projections = buildCollectionProjections(snapshot.items, snapshot.collections, snapshot.memberships);
  const items = await exportObsidianNotes(vaultPath, snapshot.items);
  let collections: CollectionExportOutcome;
  try {
    collections = { status: 'completed', result: await exportObsidianCollections(vaultPath, projections) };
  } catch (error) {
    return {
      items, collections: { status: 'failed', error },
      navigation: { status: 'skipped', reason: 'upstream-failure' },
    };
  }
  if (snapshot.items.length === 0 && snapshot.collections.length === 0) {
    return { items, collections, navigation: { status: 'skipped', reason: 'empty-snapshot' } };
  }
  let markdown: string;
  try {
    markdown = renderNavigationMarkdown(snapshot);
  } catch (error) {
    return { items, collections, navigation: { status: 'failed', stage: 'render', error } };
  }
  try {
    await writeNavigationNote(vaultPath, markdown);
  } catch (error) {
    return { items, collections, navigation: { status: 'failed', stage: 'write', error } };
  }
  return { items, collections, navigation: { status: 'completed' } };
}
