import { describe, expect, it, vi } from 'vitest';
import type { Collector } from '../src/collectors/collector.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import type { YouTubeClient, YouTubePlaylistItem } from '../src/collectors/youtube/youtube-client.js';
import { YouTubeError } from '../src/collectors/youtube/youtube-error.js';

function video(id: string): YouTubePlaylistItem {
  return { snippet: { title: `Video ${id}` }, contentDetails: { videoId: id } };
}

function fakeClient() {
  return {
    getPlaylist: vi.fn<YouTubeClient['getPlaylist']>().mockResolvedValue({ title: 'Learning' }),
    listPlaylistItems: vi.fn<YouTubeClient['listPlaylistItems']>().mockResolvedValue({ items: [] }),
  };
}

describe('YouTubeCollector', () => {
  it('maps video identity, uploader and video publication time, not playlist item metadata', async () => {
    const client = fakeClient();
    const entry = {
      id: 'playlist-item-id',
      snippet: {
        title: 'A video', description: 'Description', videoOwnerChannelTitle: 'Uploader',
        channelTitle: 'Playlist owner', publishedAt: '2026-09-01T00:00:00Z',
        resourceId: { videoId: 'video-123' }, position: 42,
      },
      contentDetails: { videoId: 'video-123', videoPublishedAt: '2024-01-01T00:00:00Z' },
    };
    client.listPlaylistItems.mockResolvedValue({ items: [entry] });
    const collector: Collector = new YouTubeCollector(client, 'https://www.youtube.com/watch?v=other&list=PL123');
    expect(await collector.collect()).toEqual([{
      source: 'youtube', sourceId: 'video-123', url: 'https://www.youtube.com/watch?v=video-123',
      title: 'A video', description: 'Description', author: 'Uploader', collection: 'Learning',
      publishedAt: '2024-01-01T00:00:00Z',
    }]);
    expect(client.getPlaylist).toHaveBeenCalledExactlyOnceWith('PL123');
    expect(client.listPlaylistItems).toHaveBeenCalledExactlyOnceWith('PL123', undefined);
  });

  it('follows every page token and preserves order, including repeated videos', async () => {
    const client = fakeClient();
    client.listPlaylistItems
      .mockResolvedValueOnce({ items: [video('z'), video('a')], nextPageToken: 'page-two' })
      .mockResolvedValueOnce({ items: [video('z'), video('b')] });
    const items = await new YouTubeCollector(client, 'PL123').collect();
    expect(items.map((item) => item.sourceId)).toEqual(['z', 'a', 'z', 'b']);
    expect(client.listPlaylistItems.mock.calls).toEqual([['PL123', undefined], ['PL123', 'page-two']]);
    expect(client.getPlaylist).toHaveBeenCalledTimes(1);
  });

  it('continues through an empty page if there is a next token', async () => {
    const client = fakeClient();
    client.listPlaylistItems.mockResolvedValueOnce({ items: [], nextPageToken: 'next' })
      .mockResolvedValueOnce({ items: [video('a')], nextPageToken: '' });
    expect(await new YouTubeCollector(client, 'PL123').collect()).toHaveLength(1);
    expect(client.listPlaylistItems).toHaveBeenCalledTimes(2);
  });

  it('allows absent optional metadata without falling back to playlist owner or added time', async () => {
    const client = fakeClient();
    const entry = {
      snippet: { title: 'Private video', channelTitle: 'Wrong owner', publishedAt: '2026-01-01T00:00:00Z',
        resourceId: { videoId: 'private-id' } },
    };
    client.listPlaylistItems.mockResolvedValue({ items: [entry, {
      snippet: { title: 'Deleted video', description: null, videoOwnerChannelTitle: null },
      contentDetails: { videoId: 'deleted-id', videoPublishedAt: null },
    }] });
    const items = await new YouTubeCollector(client, 'PL123').collect();
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.author).toBeUndefined();
      expect(item.description).toBeUndefined();
      expect(item.publishedAt).toBeUndefined();
    }
    expect(items[0]?.sourceId).toBe('private-id');
  });

  it('skips unusable IDs and titles without inventing identity', async () => {
    const client = fakeClient();
    client.listPlaylistItems.mockResolvedValue({ items: [
      {}, video(''), video(' '), video('a&b'), video('https://example.com'),
      { snippet: { title: 'No ID' } },
      { contentDetails: { videoId: 'no-title' } },
      { snippet: { title: ' ' }, contentDetails: { videoId: 'blank-title' } },
      video('valid'),
    ] });
    expect((await new YouTubeCollector(client, 'PL123').collect()).map((item) => item.sourceId))
      .toEqual(['valid']);
  });

  it('uses the domain schema to reject invalid normalized metadata', async () => {
    const client = fakeClient();
    client.listPlaylistItems.mockResolvedValue({ items: [{
      ...video('a'), contentDetails: { videoId: 'fake-secret-id', videoPublishedAt: 'fake-secret-metadata' },
    }] });
    const error = await new YouTubeCollector(client, 'PL123').collect().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as Error).message).toBe('Invalid YouTube video metadata.');
    expect((error as Error).message).not.toContain('fake-secret');
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it('returns an empty array for an accessible empty playlist', async () => {
    expect(await new YouTubeCollector(fakeClient(), 'PL123').collect()).toEqual([]);
  });

  it('surfaces metadata failures without requesting items', async () => {
    const client = fakeClient();
    client.getPlaylist.mockRejectedValue(new Error('Playlist PL123 inaccessible'));
    await expect(new YouTubeCollector(client, 'PL123').collect()).rejects.toThrow('PL123 inaccessible');
    expect(client.listPlaylistItems).not.toHaveBeenCalled();
  });

  it('surfaces later page failures instead of returning partial success', async () => {
    const client = fakeClient();
    client.listPlaylistItems.mockResolvedValueOnce({ items: [video('a')], nextPageToken: 'next' })
      .mockRejectedValueOnce(new Error('API request failure'));
    await expect(new YouTubeCollector(client, 'PL123').collect()).rejects.toThrow('API request failure');
  });

  it('fails on cyclic pagination instead of looping indefinitely', async () => {
    const client = fakeClient();
    client.listPlaylistItems.mockResolvedValue({ items: [], nextPageToken: 'same' });
    await expect(new YouTubeCollector(client, 'PL123').collect()).rejects.toThrow('PL123 returned a repeated page token');
    expect(client.listPlaylistItems).toHaveBeenCalledTimes(2);
  });
});
