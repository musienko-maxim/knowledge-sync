import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Command } from 'commander';
import { readReadonlyObsidianSnapshot, ReadonlySnapshotError } from '../storage/sqlite/read-only-snapshot.js';
import { buildObsidianExportPlan, ExportPlanError } from '../outputs/obsidian/export-plan.js';
import { exportObsidianPlan, type ObsidianProjectionExportResult } from '../outputs/obsidian/export-projection.js';
import { preflightObsidianPlan } from '../outputs/obsidian/preflight.js';
import { formatCollectionExportOutcome } from './collection-export-output.js';
import { formatNavigationExportOutcome } from './navigation-export-output.js';
import { formatObsidianExportFailure, formatObsidianPreflightConflicts, formatObsidianPreflightFailure } from './obsidian-export-failure.js';

export const STALE_OUTPUT_WARNING = 'Warning: old filenames may remain after title changes. Historical files are retained; no cleanup or backlink migration is performed.';

export interface ObsidianExportOptions {
  db: string;
  vault: string;
  dryRun?: boolean;
}

type Preflight = Awaited<ReturnType<typeof preflightObsidianPlan>>;

export interface ObsidianExportCommandResult {
  readonly dryRun: boolean;
  readonly empty: boolean;
  readonly preflight: Preflight;
  readonly projection?: ObsidianProjectionExportResult;
}

export class ObsidianExportCommandError extends Error {
  constructor(public readonly code: 'INVALID_PATHS' | 'DATABASE_INSIDE_VAULT' | 'EXPORT_PLAN_INVALID'
    | 'VAULT_PREFLIGHT_FAILED' | 'PUBLICATION_FAILED' | ExportPlanError['code'], cause?: unknown) {
    super(`Obsidian export failed: ${code}.`, { cause });
    this.name = 'ObsidianExportCommandError';
  }
}

async function validatePaths(options: ObsidianExportOptions): Promise<{ database: string; vault: string }> {
  if (!options.db?.trim() || !options.vault?.trim()) throw new ObsidianExportCommandError('INVALID_PATHS');
  const database = resolve(options.db);
  const vault = resolve(options.vault);
  try {
    const [canonicalDatabase, canonicalVault, vaultInfo] = await Promise.all([
      realpath(database), realpath(vault), stat(vault),
    ]);
    if (!vaultInfo.isDirectory()) throw new ObsidianExportCommandError('INVALID_PATHS');
    const below = relative(canonicalVault, canonicalDatabase);
    if (!below || (below !== '..' && !below.startsWith(`..${sep}`) && !isAbsolute(below))) {
      throw new ObsidianExportCommandError('DATABASE_INSIDE_VAULT');
    }
  } catch (error) {
    if (error instanceof ObsidianExportCommandError) throw error;
    throw new ObsidianExportCommandError('INVALID_PATHS', error);
  }
  return { database, vault };
}

/** Export-only composition: no writable storage initialization, imports or credentials. */
export async function exportObsidian(options: ObsidianExportOptions): Promise<ObsidianExportCommandResult> {
  const { database, vault } = await validatePaths(options);
  const snapshot = readReadonlyObsidianSnapshot(database);
  let plan;
  try { plan = buildObsidianExportPlan(snapshot); }
  catch (error) { throw new ObsidianExportCommandError(error instanceof ExportPlanError ? error.code : 'EXPORT_PLAN_INVALID', error); }
  let preflight;
  try { preflight = await preflightObsidianPlan(vault, plan); }
  catch (error) { throw new ObsidianExportCommandError('VAULT_PREFLIGHT_FAILED', error); }
  const base = { dryRun: options.dryRun === true, empty: !plan.items.length && !plan.collections.length, preflight };
  if (options.dryRun || preflight.conflicts.length > 0) return base;
  try { return { ...base, projection: await exportObsidianPlan(vault, plan) }; }
  catch (error) { throw new ObsidianExportCommandError('PUBLICATION_FAILED', error); }
}

/** Only fixed codes, counters and plan positions reach terminal diagnostics. */
export function formatObsidianExportResult(result: ObsidianExportCommandResult): { output: string; errors: string; failed: boolean } {
  const { preflight } = result;
  let output = `${result.dryRun ? 'Dry-run' : 'Plan'}: additions=${preflight.additions} updates=${preflight.updates} unchanged=${preflight.unchanged} conflicts=${preflight.conflicts.length}\n`;
  output += `Possible legacy/stale files: ${preflight.possibleLeftovers} (ownership not asserted; retained).\n`;
  output += `${STALE_OUTPUT_WARNING}\n`;
  if (result.empty) output += 'Empty snapshot: no files created or replaced.\n';
  let errors = formatObsidianPreflightConflicts(preflight.conflicts);
  let failed = preflight.conflicts.length > 0;
  if (result.projection) {
    const { items } = result.projection;
    output += `Export: attempted=${items.processed} succeeded=${items.succeeded} failed=${items.failed}\n`;
    errors += items.failures.map((failure) => formatObsidianExportFailure(failure) + '\n').join('');
    const collections = formatCollectionExportOutcome(result.projection.collections);
    const navigation = formatNavigationExportOutcome(result.projection.navigation);
    output += collections.output + navigation.output;
    errors += collections.errors + navigation.errors;
    failed ||= items.failed > 0 || collections.failed || navigation.failed;
  } else if (failed) {
    output += 'Items: skipped (preflight conflict)\nCollections: skipped (preflight conflict)\nNavigation: skipped (preflight conflict)\n';
  }
  return { output, errors, failed };
}

export function addObsidianExportCommands(program: Command, run = exportObsidian): void {
  program.command('export').description('Export persisted knowledge without source access')
    .command('obsidian').description('Publish readable Markdown from an existing SQLite database')
    .requiredOption('--db <path>', 'existing SQLite database outside the vault; no default or environment fallback')
    .requiredOption('--vault <path>', 'existing destination vault directory')
    .option('--dry-run', 'validate and report the plan without filesystem or database writes')
    .action(async (options: ObsidianExportOptions) => {
      let result;
      try { result = await run(options); }
      catch (error) {
        const details = formatObsidianPreflightFailure(error instanceof ObsidianExportCommandError ? error.cause : error);
        if (details) {
          program.configureOutput().writeErr?.(details);
          const reason = (error instanceof ObsidianExportCommandError ? error.cause : error) instanceof ExportPlanError
            ? 'plan conflict' : 'preflight conflict';
          program.configureOutput().writeOut?.(`Items: skipped (${reason})\nCollections: skipped (${reason})\nNavigation: skipped (${reason})\n`);
        }
        const code = error instanceof ReadonlySnapshotError || error instanceof ObsidianExportCommandError
          ? error.code : 'EXPORT_FAILED';
        return program.error(`Obsidian export unavailable: ${code}. Check explicit paths, database state and destination ownership.`,
          { exitCode: 1, code: 'knowledge-sync.obsidian-export' });
      }
      const formatted = formatObsidianExportResult(result);
      program.configureOutput().writeOut?.(formatted.output);
      if (formatted.errors) program.configureOutput().writeErr?.(formatted.errors);
      // Keep Commander exitOverride outside the catch to preserve its exit result.
      if (formatted.failed) program.error('Obsidian export incomplete; existing conflicts are retained and no cleanup was performed.',
        { exitCode: 1, code: 'knowledge-sync.obsidian-export' });
    });
}
