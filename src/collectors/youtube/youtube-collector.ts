import { knowledgeItemSchema, type KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { Collector } from '../collector.js';
import { parsePlaylistId } from './playlist-id.js';
import type { YouTubeClient, YouTubePlaylistItem } from './youtube-client.js';
import { YouTubeError } from './youtube-error.js';

export class YouTubeCollector implements Collector {
  private readonly playlistId: string;

  constructor(private readonly client: YouTubeClient, playlistInput: string) {
    this.playlistId = parsePlaylistId(playlistInput);
  }

  async collect(): Promise<KnowledgeItem[]> {
    const playlist = await this.client.getPlaylist(this.playlistId);
    const items: KnowledgeItem[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await this.client.listPlaylistItems(this.playlistId, pageToken);
      for (const entry of page.items) {
        const item = normalizeVideo(entry, playlist.title);
        if (item) items.push(item);
      }
      pageToken = page.nextPageToken;
      if (pageToken) {
        if (seenTokens.has(pageToken)) {
          throw new YouTubeError(`YouTube playlist ${this.playlistId} returned a repeated page token.`);
        }
        seenTokens.add(pageToken);
      }
    } while (pageToken);
    return items;
  }
}

function normalizeVideo(entry: YouTubePlaylistItem, collection: string): KnowledgeItem | undefined {
  const videoId = [entry.contentDetails?.videoId, entry.snippet?.resourceId?.videoId]
    .find((id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id));
  const title = entry.snippet?.title;
  if (!videoId || !title?.trim()) return undefined;

  const result = knowledgeItemSchema.safeParse({
    source: 'youtube',
    sourceId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    description: entry.snippet?.description ?? undefined,
    author: entry.snippet?.videoOwnerChannelTitle ?? undefined,
    collection,
    publishedAt: entry.contentDetails?.videoPublishedAt ?? undefined,
  });
  if (!result.success) {
    throw new YouTubeError('Invalid YouTube video metadata.', { cause: result.error });
  }
  return result.data;
}
