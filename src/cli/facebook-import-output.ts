import type { FacebookImportResult } from '../application/import-facebook.js';
import { formatCollectionExportOutcome } from './collection-export-output.js';
import { formatNavigationExportOutcome } from './navigation-export-output.js';
import { formatObsidianExportFailure } from './obsidian-export-failure.js';

/** Only counters and fixed application codes reach the public import summary. */
export function formatFacebookImportResult(result: FacebookImportResult): { output: string; errors: string; failed: boolean } {
  const input = result.input;
  let output = `Input: collections=${input.inputCollections} occurrences=${input.inputOccurrences} urls=${input.urlOccurrences} skipped=${input.skippedOccurrences}\n`;
  output += `Duplicates: items=${input.duplicateItemOccurrences} memberships=${input.repeatedMembershipOccurrences}\n`;
  output += `Distinct: items=${input.distinctItems} memberships=${input.uniqueMemberships}\n`;
  for (const [label, counters] of [['Items', result.items], ['Collections', result.collections]] as const) {
    output += `${label}: processed=${counters.processed} new=${counters.new} changed=${counters.changed} unchanged=${counters.unchanged}\n`;
  }
  output += `Memberships: processed=${result.memberships.processed} new=${result.memberships.new} unchanged=${result.memberships.unchanged}\n`;
  for (const warning of result.warnings) output += `Warning: ${warning.code} count=${warning.count}\n`;
  let errors = result.failure ? `Facebook import failed: stage=${result.failure.stage} code=${result.failure.code}. Completed SQLite writes are retained.\n` : '';
  let failed = result.failure !== undefined;
  if (result.export.status === 'completed') {
    const exported = result.export.result;
    output += `Export: attempted=${exported.items.processed} succeeded=${exported.items.succeeded} failed=${exported.items.failed}\n`;
    for (const failure of exported.items.failures) errors += formatObsidianExportFailure(failure) + '\n';
    const collections = formatCollectionExportOutcome(exported.collections);
    const navigation = formatNavigationExportOutcome(exported.navigation);
    output += collections.output + navigation.output;
    errors += collections.errors + navigation.errors;
    failed ||= exported.items.failed > 0 || collections.failed || navigation.failed;
  } else {
    output += `Export: ${result.export.status}\n`;
    failed ||= result.export.status === 'failed';
  }
  return { output, errors, failed };
}
