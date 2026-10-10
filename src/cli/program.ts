import { Command, Option } from 'commander';
import type { SyncCollectionToObsidianResult } from '../application/sync-collection-to-obsidian.js';
import { GoogleAuthError } from '../auth/google-client-config.js';
import { YouTubeError } from '../collectors/youtube/youtube-error.js';
import { youtubeCommands, type YouTubeCommands } from './youtube.js';
import { SyncCommandError, type YouTubeSyncOptions, type YouTubeSyncObsidianOptions } from './youtube-sync.js';
import { formatObsidianExportFailure } from './obsidian-export-failure.js';
import type { YouTubeSyncAllOptions } from './youtube-sync-all.js';
import type { AccountSyncResult } from '../application/sync-account.js';
import { formatAccountSyncResult } from './account-sync-output.js';
import { formatCollectionExportOutcome } from './collection-export-output.js';
import { formatNavigationExportOutcome } from './navigation-export-output.js';

export function createProgram(commands: YouTubeCommands = youtubeCommands): Command {
  const program = new Command()
    .name('knowledge-sync')
    .description('Local-first knowledge collection for Obsidian; manual YouTube playlist sync to SQLite.')
    .action(function (this: Command) { this.outputHelp(); });
  const youtube = program.command('youtube').description('YouTube account access, owned playlists, and playlist sync');
  const auth = youtube.command('auth').description('Manage local Google OAuth authorization');
  const write = (text: string) => program.configureOutput().writeOut?.(text + '\n');
  const fail = (error: unknown): void => {
    const safe = error instanceof GoogleAuthError || error instanceof YouTubeError || error instanceof SyncCommandError;
    program.error(safe ? error.message : 'YouTube command failed. Check configuration and try again.',
      { exitCode: 1, code: 'knowledge-sync.youtube' });
  };
  const action = <Args extends unknown[]>(run: (...args: Args) => Promise<void>) => async (...args: Args) => {
    try { await run(...args); } catch (error) { fail(error); }
  };
  auth.command('login').description('Authorize via Google Desktop OAuth (read-only)').action(action(async () => {
    await commands.login((url) => write(`Open this URL in your browser to authorize YouTube:\n${url}`));
    write('YouTube authorization saved locally.');
  }));
  auth.command('status').description('Check local authorization and access-token refresh').action(action(async () => {
    await commands.status();
    write('YouTube authorization is valid.');
  }));
  auth.command('logout').description('Remove local authorization only; does not revoke Google access').action(action(async () => {
    await commands.logout();
    write('Local logout complete. Google authorization has not been revoked.');
  }));
  youtube.command('playlists').description('List every playlist owned by the authorized user').action(action(async () => {
    const playlists = await commands.playlists();
    for (const playlist of playlists) write(`${playlist.id}\t${playlist.title}`);
    if (!playlists.length) write('No owned YouTube playlists found.');
  }));
  youtube.command('sync <playlist>').description('Sync one YouTube playlist into local SQLite')
    .addOption(new Option('--auth <mode>', 'authentication mode').choices(['api-key', 'oauth']).default('api-key'))
    .option('--db <path>', 'SQLite path (overrides DATABASE_PATH; default: ./data/knowledge-sync.sqlite)')
    .action(action(async (playlist: string, options: YouTubeSyncOptions) => {
      const result = await commands.sync(playlist, options);
      write(`Processed ${result.processed} items.`);
      write(`Memberships: removed=${result.membershipsRemoved}`);
    }));
  youtube.command('sync-obsidian <playlist>')
    .description('Sync a YouTube playlist to SQLite and export all persisted items and collections to Obsidian')
    .addOption(new Option('--auth <mode>', 'authentication mode').choices(['api-key', 'oauth']).default('api-key'))
    .option('--db <path>', 'SQLite path (overrides DATABASE_PATH; default: ./data/knowledge-sync.sqlite)')
    .option('--vault <path>', 'existing Obsidian vault (overrides OBSIDIAN_VAULT_PATH; required via option or environment)')
    .action(async (playlist: string, options: YouTubeSyncObsidianOptions) => {
      let result: SyncCollectionToObsidianResult;
      try { result = await commands.syncObsidian(playlist, options); } catch (error) { return fail(error); }
      write(`Sync: processed=${result.sync.processed} new=${result.sync.new} changed=${result.sync.changed} unchanged=${result.sync.unchanged}`);
      write(`Memberships: removed=${result.sync.membershipsRemoved}`);
      write(`Export: attempted=${result.export.processed} succeeded=${result.export.succeeded} failed=${result.export.failed}`);
      for (const failure of result.export.failures) {
        program.configureOutput().writeErr?.(formatObsidianExportFailure(failure) + '\n');
      }
      const collections = formatCollectionExportOutcome(result.collections);
      if (collections.output) program.configureOutput().writeOut?.(collections.output);
      if (collections.errors) program.configureOutput().writeErr?.(collections.errors);
      const navigation = formatNavigationExportOutcome(result.navigation);
      if (navigation.output) program.configureOutput().writeOut?.(navigation.output);
      if (navigation.errors) program.configureOutput().writeErr?.(navigation.errors);
      // Outside the fatal-error catch: exitOverride must not turn this into a second error.
      if (result.export.failed > 0 || collections.failed || navigation.failed) {
        program.error('Obsidian export incomplete; successful SQLite writes remain committed.',
          { exitCode: 1, code: 'knowledge-sync.obsidian-export' });
      }
    });
  youtube.command('sync-all').description('Sync every owned YouTube playlist using OAuth; optionally export to Obsidian')
    .option('--db <path>', 'SQLite path (overrides DATABASE_PATH; default: ./data/knowledge-sync.sqlite)')
    .option('--vault <path>', 'export once to this existing vault (no export when omitted)')
    .action(async (options: YouTubeSyncAllOptions) => {
      let result: AccountSyncResult;
      try { result = await commands.syncAll(options); } catch (error) { return fail(error); }
      const formatted = formatAccountSyncResult(result);
      program.configureOutput().writeOut?.(formatted.output);
      if (formatted.errors) program.configureOutput().writeErr?.(formatted.errors);
      // Keep the partial-result exit outside the fatal catch for exitOverride().
      if (formatted.failed) {
        program.error('Account synchronization incomplete; successful SQLite writes remain committed.',
          { exitCode: 1, code: 'knowledge-sync.account-sync' });
      }
    });
  return program;
}
