import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { buildObsidianExportPlan } from './export-plan.js';
import { exportObsidianPlan } from './export-projection.js';

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

/** Item-only adapter: validate the entire snapshot and all destinations before publishing. */
export async function exportObsidianNotes(
  vaultPath: string,
  items: readonly KnowledgeItem[],
): Promise<ObsidianBatchExportResult> {
  const plan = buildObsidianExportPlan({ items, collections: [], memberships: [] });
  const result = await exportObsidianPlan(vaultPath, Object.freeze({ ...plan, navigation: undefined }));
  return result.items;
}
