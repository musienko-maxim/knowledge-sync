import type { Collector } from '../collectors/collector.js';
import { exportObsidianNotes, type ObsidianBatchExportResult } from '../outputs/obsidian/export-notes.js';
import type { KnowledgeItemRepository } from '../storage/knowledge-item-repository.js';
import { sync, type SyncResult } from './sync.js';

export interface SyncToObsidianResult {
  readonly sync: SyncResult;
  readonly export: ObsidianBatchExportResult;
}

/** Attempts every persisted item after successful sync. The caller owns storage; no rollback or retry. */
export async function syncToObsidian(
  collector: Collector,
  repository: KnowledgeItemRepository,
  vaultPath: string,
): Promise<SyncToObsidianResult> {
  const syncResult = await sync(collector, repository);
  const items = await repository.listAll();
  const exportResult = await exportObsidianNotes(vaultPath, items);
  return { sync: syncResult, export: exportResult };
}
