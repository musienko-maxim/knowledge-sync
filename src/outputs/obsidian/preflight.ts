import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ObsidianExportPlan } from './export-plan.js';
import { GeneratedNoteError, verifyGeneratedNote, type GeneratedKind } from './generated-note.js';
import { NAVIGATION_MARKER } from './navigation-markdown.js';
import { ExportPathError, inspectExportDirectories, inspectExportTarget, isMissing, resolveExportTarget, temporaryExportPath } from './safe-path.js';
import { portablePathKey } from './readable-path.js';

export interface PreflightConflict { readonly index: number; readonly kind: GeneratedKind | 'navigation'; readonly code: string }
export interface PlanPreflight {
  readonly additions: number;
  readonly updates: number;
  readonly unchanged: number;
  readonly possibleLeftovers: number;
  readonly conflicts: readonly PreflightConflict[];
}
export class ExportPreflightError extends Error {
  constructor(public readonly conflicts: readonly PreflightConflict[]) {
    super('Export preflight failed; existing files are preserved.');
    this.name = 'ExportPreflightError';
  }
}

export function hasNavigationOwnership(bytes: Buffer): boolean {
  const text = bytes.subarray(0, Buffer.byteLength(NAVIGATION_MARKER) + 5).toString('utf8').replace(/^\uFEFF/, '');
  return text === NAVIGATION_MARKER || text.startsWith(`${NAVIGATION_MARKER}\n`) || text.startsWith(`${NAVIGATION_MARKER}\r\n`);
}

export function safePreflightCode(error: unknown): string {
  if (error instanceof GeneratedNoteError || error instanceof ExportPathError) return error.code;
  // Do not pass native messages or arbitrary error.code strings through to the CLI.
  return 'unavailable-destination';
}

/** Read-only bounded inventory of source roots/collection directories; unrelated files are never ownership claims. */
async function countPossibleLeftovers(vault: string, paths: readonly string[]): Promise<number> {
  const expected = new Set(paths.map(portablePathKey));
  const directories = new Set(paths.map((path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '').filter(Boolean));
  let count = 0;
  for (const relativeDirectory of directories) {
    const target = resolveExportTarget(vault, `${relativeDirectory}/inventory-placeholder`);
    if (!await inspectExportDirectories(vault, dirname(target))) continue;
    for (const name of await readdir(dirname(target))) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const relativePath = `${relativeDirectory}/${name}`;
      if (expected.has(portablePathKey(relativePath))) continue;
      // lstat only: do not read or follow unknown occupants.
      try { if ((await lstat(join(dirname(target), name))).isFile()) count++; } catch (error) { if (!isMissing(error)) throw error; }
    }
  }
  return count;
}

/** No mkdir, temporary files or database writes. Every destination is checked before any publication. */
export async function preflightObsidianPlan(vaultPath: string, plan: ObsidianExportPlan): Promise<PlanPreflight> {
  if (!plan.items.length && !plan.collections.length && !plan.navigation) {
    return { additions: 0, updates: 0, unchanged: 0, possibleLeftovers: 0, conflicts: [] };
  }
  const vault = resolve(vaultPath);
  await inspectExportDirectories(vaultPath, vault);
  const entries = [
    ...plan.items.map((entry, index) => ({ ...entry, identity: entry.item, kind: 'item' as const, index })),
    ...plan.collections.map((entry, index) => ({ ...entry, identity: entry.collection, kind: 'collection' as const, index })),
    ...(plan.navigation ? [{ ...plan.navigation, identity: undefined, kind: 'navigation' as const, index: 0 }] : []),
  ];
  let additions = 0, updates = 0, unchanged = 0;
  const conflicts: PreflightConflict[] = [];
  for (const entry of entries) {
    try {
      const target = resolveExportTarget(vault, entry.relativePath);
      temporaryExportPath(target, entry.kind === 'navigation' ? 'navigation' : 'note', '0'.repeat(36));
      const expected = Buffer.from(entry.markdown, 'utf8');
      if (entry.kind !== 'navigation') verifyGeneratedNote(expected, entry.kind, entry.identity!);
      else if (!hasNavigationOwnership(expected)) throw new GeneratedNoteError('invalid-content');
      if (await inspectExportTarget(vault, target) === 'absent') { additions++; continue; }
      const bytes = await readFile(target);
      if (entry.kind === 'navigation') {
        if (!hasNavigationOwnership(bytes)) throw new GeneratedNoteError('unowned-target');
      } else verifyGeneratedNote(bytes, entry.kind, entry.identity!);
      if (bytes.equals(expected)) unchanged++; else updates++;
    } catch (error) {
      conflicts.push({ index: entry.index, kind: entry.kind, code: safePreflightCode(error) });
    }
  }
  // Inventory is informational; a traversal/read error still blocks publication rather than hiding it.
  let possibleLeftovers = 0;
  try { possibleLeftovers = await countPossibleLeftovers(vault, entries.map((entry) => entry.relativePath)); } catch (error) {
    conflicts.push({ index: 0, kind: 'navigation', code: safePreflightCode(error) });
  }
  return { additions, updates, unchanged, possibleLeftovers, conflicts };
}
