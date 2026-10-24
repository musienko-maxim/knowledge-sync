import type { Command } from 'commander';
import { importFacebookFile, type FacebookImportOptions } from './facebook-import.js';
import { formatFacebookImportResult } from './facebook-import-output.js';

export function addFacebookCommands(program: Command, run = importFacebookFile): void {
  program.command('facebook').description('Import a local Facebook Saved export')
    .command('import').description('Import extracted collections.json; optionally export all persisted sources')
    .requiredOption('--file <path>', 'extracted Facebook collections.json file')
    .option('--db <path>', 'SQLite path (overrides DATABASE_PATH; default: ./data/knowledge-sync.sqlite)')
    .option('--vault <path>', 'export to this existing vault (no export when omitted)')
    .action(async (options: FacebookImportOptions) => {
      let result;
      try { result = await run(options); } catch {
        // Even unexpected filesystem, parser and native SQLite exceptions may contain private data.
        program.error('Facebook import failed. Check input, configuration, and permissions.',
          { exitCode: 1, code: 'knowledge-sync.facebook-import' });
      }
      const formatted = formatFacebookImportResult(result);
      program.configureOutput().writeOut?.(formatted.output);
      if (formatted.errors) program.configureOutput().writeErr?.(formatted.errors);
      // Outside the catch so Commander exitOverride retains the original exit result.
      if (formatted.failed) program.error('Facebook import incomplete; completed SQLite writes remain committed.',
        { exitCode: 1, code: 'knowledge-sync.facebook-import' });
    });
}
