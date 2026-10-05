import type { AccountSyncResult } from '../application/sync-account.js';
import { GoogleAuthError } from '../auth/google-client-config.js';
import { YouTubeError } from '../collectors/youtube/youtube-error.js';
import { formatObsidianExportFailure, quoteDiagnosticValue } from './obsidian-export-failure.js';
import { SyncCommandError } from './youtube-sync.js';

function safeReason(error: unknown): string {
  return error instanceof GoogleAuthError || error instanceof YouTubeError || error instanceof SyncCommandError
    ? error.message : 'Synchronization failed. Check source access and database configuration.';
}

/** Formats retained outcomes without exposing arbitrary errors, causes, or paths. */
export function formatAccountSyncResult(result: AccountSyncResult): { output: string; errors: string; failed: boolean } {
  const { playlists, items } = result;
  const output = [
    `Playlists: discovered=${playlists.discovered} succeeded=${playlists.succeeded} failed=${playlists.failed} unattempted=${playlists.unattempted}`,
    `Items: processed=${items.processed} new=${items.new} changed=${items.changed} unchanged=${items.unchanged}`,
  ];
  const errors = result.failures.map((failure) => {
    const title = failure.playlistTitle === undefined ? '' : `, title=${quoteDiagnosticValue(failure.playlistTitle)}`;
    return `Playlist failed (id=${quoteDiagnosticValue(failure.playlistId)}${title}): ${safeReason(failure.error)}`;
  });
  if (result.fatal) errors.push(`Account sync stopped during ${result.fatal.stage}: ${safeReason(result.fatal.error)}`);
  const exported = result.export;
  if (exported.status === 'completed') {
    output.push(`Export: attempted=${exported.result.processed} succeeded=${exported.result.succeeded} failed=${exported.result.failed}`);
    errors.push(...exported.result.failures.map(formatObsidianExportFailure));
  } else if (exported.status === 'failed') {
    errors.push(exported.stage === 'snapshot'
      ? 'Obsidian export failed while reading the persisted snapshot. Check the database.'
      : 'Obsidian batch export failed. Check the vault and item data.');
  } else if (exported.status === 'skipped') {
    errors.push('Obsidian export skipped because account synchronization stopped.');
  }
  return {
    output: output.join('\n') + '\n',
    errors: errors.length ? errors.join('\n') + '\n' : '',
    failed: result.fatal !== undefined || playlists.failed > 0 || exported.status === 'failed'
      || (exported.status === 'completed' && exported.result.failed > 0),
  };
}
