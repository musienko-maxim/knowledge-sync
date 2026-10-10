import { expect, it } from 'vitest';
import { formatNavigationExportOutcome } from '../src/cli/navigation-export-output.js';
import { NavigationWriteError, type NavigationWriteFailureReason } from '../src/outputs/obsidian/write-navigation.js';

it('formats successful navigation exactly', () => {
  expect(formatNavigationExportOutcome({ status: 'completed' })).toEqual({
    output: 'Navigation: succeeded=1 failed=0\n', errors: '', failed: false,
  });
});

it.each([
  ['empty-snapshot', 'empty snapshot'], ['upstream-failure', 'earlier export failure'],
] as const)('formats a %s skip exactly', (reason, label) => {
  expect(formatNavigationExportOutcome({ status: 'skipped', reason })).toEqual({
    output: `Navigation: skipped (${label})\n`, errors: '', failed: false,
  });
});

it.each([
  ['unowned-target', 'Navigation export refused: Knowledge Sync.md is not a recognized generated page.'],
  ['symlink-target', 'Navigation export refused: Knowledge Sync.md is a symbolic link.'],
  ['non-regular-target', 'Navigation export refused: Knowledge Sync.md is not a regular file.'],
  ['target-changed', 'Navigation export refused: the destination changed during export.'],
  ['invalid-content', 'Navigation export failed. Check the vault, destination ownership, and write permissions.'],
] satisfies [NavigationWriteFailureReason, string][])('formats typed %s refusal without error contents', (reason, message) => {
  const error = new NavigationWriteError(reason);
  error.message = 'fake-secret C:\\private\\vault';
  error.cause = new Error('private generated content');
  expect(formatNavigationExportOutcome({ status: 'failed', stage: 'write', error })).toEqual({
    output: 'Navigation: succeeded=0 failed=1\n', errors: `${message}\n`, failed: true,
  });
});

it.each([undefined, null, false, 0, '', 'fake-secret', { reason: 'unowned-target', message: 'fake-secret' },
  new Error('fake-secret C:\\private\\vault', { cause: 'private content' })])
('sanitizes arbitrary thrown values (%j) in either phase', (error) => {
  for (const stage of ['render', 'write'] as const) {
    expect(formatNavigationExportOutcome({ status: 'failed', stage, error })).toEqual({
      output: 'Navigation: succeeded=0 failed=1\n',
      errors: stage === 'render'
        ? 'Navigation rendering failed. Check persisted titles and identities.\n'
        : 'Navigation export failed. Check the vault, destination ownership, and write permissions.\n',
      failed: true,
    });
  }
});
