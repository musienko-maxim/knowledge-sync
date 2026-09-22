import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { YouTubeAccountClient, YouTubeClient, YouTubePlaylistSummary } from './youtube-client.js';
import { YouTubeCollector } from './youtube-collector.js';

export class YouTubeAccount {
  constructor(private readonly client: YouTubeAccountClient) {}

  /** mine=true returns owned playlists, not all saved or followed playlists. */
  async listMyPlaylists(): Promise<YouTubePlaylistSummary[]> {
    const playlists: YouTubePlaylistSummary[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await this.client.listMyPlaylistsPage(pageToken);
      playlists.push(...page.items);
      pageToken = page.nextPageToken;
      if (pageToken) {
        if (seen.has(pageToken)) throw new Error('YouTube owned playlists returned a repeated page token.');
        seen.add(pageToken);
      }
    } while (pageToken);
    return playlists;
  }
}

export interface CollectedYouTubePlaylist {
  playlist: YouTubePlaylistSummary;
  items: KnowledgeItem[];
}

/** The same OAuth client performs discovery and reads each (possibly private) playlist. */
export async function collectYouTubeAccount(
  client: YouTubeClient & YouTubeAccountClient,
): Promise<CollectedYouTubePlaylist[]> {
  const playlists = await new YouTubeAccount(client).listMyPlaylists();
  const result: CollectedYouTubePlaylist[] = [];
  for (const playlist of playlists) {
    try {
      const items = await new YouTubeCollector(client, playlist.id).collect();
      result.push({ playlist, items });
    } catch {
      throw new Error(`Could not collect YouTube playlist ${playlist.id}. Check account authorization and playlist access.`);
    }
  }
  return result;
}
