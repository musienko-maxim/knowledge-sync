import { Command, Option } from 'commander';
import { GoogleAuthError } from '../auth/google-client-config.js';
import { YouTubeError } from '../collectors/youtube/youtube-error.js';
import { youtubeCommands, type YouTubeCommands } from './youtube.js';
import { SyncCommandError, type YouTubeSyncOptions } from './youtube-sync.js';

export function createProgram(commands: YouTubeCommands = youtubeCommands): Command {
  const program = new Command()
    .name('knowledge-sync')
    .description('Local-first knowledge collection for Obsidian; manual YouTube playlist sync to SQLite.')
    .action(function (this: Command) { this.outputHelp(); });
  const youtube = program.command('youtube').description('YouTube account access, owned playlists, and playlist sync');
  const auth = youtube.command('auth').description('Manage local Google OAuth authorization');
  const write = (text: string) => program.configureOutput().writeOut?.(text + '\n');
  const action = <Args extends unknown[]>(run: (...args: Args) => Promise<void>) => async (...args: Args) => {
    try { await run(...args); } catch (error) {
      const safe = error instanceof GoogleAuthError || error instanceof YouTubeError || error instanceof SyncCommandError;
      program.error(safe ? error.message : 'YouTube command failed. Check configuration and try again.',
        { exitCode: 1, code: 'knowledge-sync.youtube' });
    }
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
    }));
  return program;
}
