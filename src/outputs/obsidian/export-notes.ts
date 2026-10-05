import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { exportObsidianNote } from './export-note.js';

export interface ObsidianExportFailure {
  readonly index: number;
  readonly item: KnowledgeItem;
  readonly error: unknown;
}

export interface ObsidianBatchExportResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failures: readonly ObsidianExportFailure[];
}

/** Counts sequential export-call outcomes, including duplicates; does not roll back writes. */
export async function exportObsidianNotes(
  vaultPath: string,
  items: readonly KnowledgeItem[],
): Promise<ObsidianBatchExportResult> {
  const failures: ObsidianExportFailure[] = [];
  let processed = 0;
  for (const [index, item] of items.entries()) {
    try {
      await exportObsidianNote(vaultPath, item);
    } catch (error) {
      failures.push({ index, item, error });
    }
    processed++;
  }
  return {
    processed,
    succeeded: processed - failures.length,
    failed: failures.length,
    failures,
  };
}
