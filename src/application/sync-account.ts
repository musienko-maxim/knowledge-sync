import type { AccountSyncSource } from '../collectors/account-sync-source.js';
import type { KnowledgeCollection } from '../core/models/knowledge-collection.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../outputs/obsidian/export-notes.js';
import { isFatalStorageError } from '../storage/storage-error.js';
import { syncCollection, type CollectionSyncRepositories } from './sync-collection.js';
import type { SyncResult } from './sync.js';

export interface PlaylistSyncFailure {
  playlistId: string;
  playlistTitle?: string;
  error: unknown;
}

export type AccountExportOutcome =
  | { status: 'not-requested' }
  | { status: 'skipped' }
  | { status: 'completed'; result: ObsidianBatchExportResult }
  | { status: 'failed'; stage: 'snapshot' | 'batch'; error: unknown };

export interface AccountSyncResult {
  playlists: { discovered: number; succeeded: number; failed: number; unattempted: number };
  /** Processing events from successful playlists only, excluding failed partial writes. */
  items: SyncResult;
  failures: PlaylistSyncFailure[];
  fatal?: { stage: 'discovery' | 'playlist'; error: unknown };
  export: AccountExportOutcome;
}

/** Sequential account sync with retained partial progress; caller owns storage. */
export async function syncAccount(
  source: AccountSyncSource,
  repositories: CollectionSyncRepositories,
  vaultPath?: string,
): Promise<AccountSyncResult> {
  const result: AccountSyncResult = {
    playlists: { discovered: 0, succeeded: 0, failed: 0, unattempted: 0 },
    items: { processed: 0, new: 0, changed: 0, unchanged: 0 },
    failures: [],
    export: { status: vaultPath === undefined ? 'not-requested' : 'skipped' },
  };
  let collections: readonly KnowledgeCollection[];
  try {
    collections = await source.discover();
  } catch (error) {
    result.fatal = { stage: 'discovery', error };
    return result;
  }
  result.playlists.discovered = collections.length;
  result.playlists.unattempted = collections.length;
  for (const collection of collections) {
    result.playlists.unattempted--;
    try {
      const synced = await syncCollection(source.createCollector(collection), repositories);
      result.playlists.succeeded++;
      result.items.processed += synced.processed;
      result.items.new += synced.new;
      result.items.changed += synced.changed;
      result.items.unchanged += synced.unchanged;
    } catch (error) {
      result.playlists.failed++;
      result.failures.push({ playlistId: collection.sourceId, playlistTitle: collection.title, error });
      if (source.isFatalError(error) || isFatalStorageError(error)) {
        result.fatal = { stage: 'playlist', error };
        return result;
      }
    }
  }
  if (vaultPath !== undefined) {
    let items;
    try {
      items = await repositories.knowledgeItems.listAll();
    } catch (error) {
      result.export = { status: 'failed', stage: 'snapshot', error };
      return result;
    }
    try {
      result.export = { status: 'completed', result: await exportObsidianNotes(vaultPath, items) };
    } catch (error) {
      result.export = { status: 'failed', stage: 'batch', error };
    }
  }
  return result;
}
