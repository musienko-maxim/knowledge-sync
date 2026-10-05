import { GoogleAuthError } from '../../auth/google-client-config.js';
import type { AccountSyncSource } from '../account-sync-source.js';
import { YouTubeAccount } from './youtube-account.js';
import type { YouTubeAccountClient, YouTubeClient } from './youtube-client.js';
import { YouTubeCollector } from './youtube-collector.js';
import { YouTubeError } from './youtube-error.js';

/** Reuse owned-playlist discovery and one authenticated client for every collection. */
export function createYouTubeAccountSource(client: YouTubeClient & YouTubeAccountClient): AccountSyncSource {
  return {
    discover: async () => (await new YouTubeAccount(client).listMyPlaylists()).map((playlist) => ({
      source: 'youtube', sourceId: playlist.id, title: playlist.title,
    })),
    createCollector: (collection) => new YouTubeCollector(client, collection.sourceId),
    isFatalError: (error) => error instanceof GoogleAuthError
      || (error instanceof YouTubeError && error.accountFatal),
  };
}
