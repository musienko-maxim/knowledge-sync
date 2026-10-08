import type { CollectionExportOutcome } from '../outputs/obsidian/export-projection.js';
import { formatObsidianCollectionExportFailure } from './obsidian-export-failure.js';

/** Keep collection counts separate from the existing item export summary. */
export function formatCollectionExportOutcome(outcome: CollectionExportOutcome): { output: string; errors: string; failed: boolean } {
  if (outcome.status === 'failed') {
    return { output: '', errors: 'Obsidian collection batch export failed. Check the vault and collection data.\n', failed: true };
  }
  const result = outcome.result;
  return {
    output: `Collections: attempted=${result.processed} succeeded=${result.succeeded} failed=${result.failed}\n`,
    errors: result.failures.map((failure) => formatObsidianCollectionExportFailure(failure) + '\n').join(''),
    failed: result.failed > 0,
  };
}
