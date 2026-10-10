import type { NavigationExportOutcome } from '../outputs/obsidian/export-projection.js';
import { NavigationWriteError } from '../outputs/obsidian/write-navigation.js';

function writeReason(error: unknown): string {
  if (error instanceof NavigationWriteError) {
    switch (error.reason) {
      case 'unowned-target': return 'Navigation export refused: Knowledge Sync.md is not a recognized generated page.';
      case 'non-regular-target': return 'Navigation export refused: Knowledge Sync.md is not a regular file.';
      case 'symlink-target': return 'Navigation export refused: Knowledge Sync.md is a symbolic link.';
      case 'target-changed': return 'Navigation export refused: the destination changed during export.';
    }
  }
  return 'Navigation export failed. Check the vault, destination ownership, and write permissions.';
}

/** Public diagnostics never expose native errors, paths, or supplied content. */
export function formatNavigationExportOutcome(outcome: NavigationExportOutcome): { output: string; errors: string; failed: boolean } {
  if (outcome.status === 'skipped') {
    const reason = outcome.reason === 'empty-snapshot' ? 'empty snapshot' : 'earlier export failure';
    return { output: `Navigation: skipped (${reason})\n`, errors: '', failed: false };
  }
  if (outcome.status === 'completed') {
    return { output: 'Navigation: succeeded=1 failed=0\n', errors: '', failed: false };
  }
  const reason = outcome.stage === 'render'
    ? 'Navigation rendering failed. Check persisted titles and identities.' : writeReason(outcome.error);
  return { output: 'Navigation: succeeded=0 failed=1\n', errors: `${reason}\n`, failed: true };
}
