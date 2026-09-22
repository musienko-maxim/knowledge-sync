import { Command } from 'commander';
import { GoogleAuthError } from '../auth/google-client-config.js';
import { youtubeCommands, type YouTubeCommands } from './youtube.js';

export function createProgram(commands: YouTubeCommands = youtubeCommands): Command {
  const program = new Command()
    .name('knowledge-sync')
    .description('Local-first knowledge collection for Obsidian; sync is not implemented.')
    .action(function (this: Command) { this.outputHelp(); });
  const youtube = program.command('youtube').description('YouTube account access and owned playlists');
  const auth = youtube.command('auth').description('Manage local Google OAuth authorization');
  const write = (text: string) => program.configureOutput().writeOut?.(text + '\n');
  const action = (run: () => Promise<void>) => async () => {
    try { await run(); } catch (error) {
      program.error(error instanceof GoogleAuthError ? error.message : 'YouTube command failed. Check configuration and try again.',
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
  return program;
}
