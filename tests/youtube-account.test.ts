import { describe, expect, it, vi } from 'vitest';
import { collectYouTubeAccount, YouTubeAccount } from '../src/collectors/youtube/youtube-account.js';
import { YouTubeApiClient, type YouTubeAccountClient, type YouTubeClient } from '../src/collectors/youtube/youtube-client.js';

const first = { id: 'PLfirst', title: 'First' };
const second = { id: 'PLsecond', title: 'Second' };

describe('YouTubeAccount', () => {
  it('follows all pages, including an empty intermediate page, in API order', async () => {
    const listMyPlaylistsPage = vi.fn<YouTubeAccountClient['listMyPlaylistsPage']>()
      .mockResolvedValueOnce({ items: [second], nextPageToken: 'two' })
      .mockResolvedValueOnce({ items: [], nextPageToken: 'three' })
      .mockResolvedValueOnce({ items: [first] });
    expect(await new YouTubeAccount({ listMyPlaylistsPage }).listMyPlaylists()).toEqual([second, first]);
    expect(listMyPlaylistsPage.mock.calls).toEqual([[undefined], ['two'], ['three']]);
  });

  it('returns an empty array for an account with no owned playlists', async () => {
    const account = new YouTubeAccount({ listMyPlaylistsPage: async () => ({ items: [] }) });
    expect(await account.listMyPlaylists()).toEqual([]);
  });

  it('rejects cyclic pagination', async () => {
    const listMyPlaylistsPage = vi.fn<YouTubeAccountClient['listMyPlaylistsPage']>()
      .mockResolvedValue({ items: [], nextPageToken: 'again' });
    await expect(new YouTubeAccount({ listMyPlaylistsPage }).listMyPlaylists()).rejects.toThrow('repeated page token');
    expect(listMyPlaylistsPage).toHaveBeenCalledTimes(2);
  });

  it('propagates later-page failure instead of returning partial success', async () => {
    const listMyPlaylistsPage = vi.fn<YouTubeAccountClient['listMyPlaylistsPage']>()
      .mockResolvedValueOnce({ items: [first], nextPageToken: 'two' })
      .mockRejectedValueOnce(new Error('API quota failure'));
    await expect(new YouTubeAccount({ listMyPlaylistsPage }).listMyPlaylists()).rejects.toThrow('API quota failure');
  });
});

describe('account collection handoff', () => {
  it('uses the same authenticated API client for discovery and sequential collection, preserving grouping and video identity', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [first, second].map(({ id, title }) => ({ id, snippet: { title } })) }))
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: first.title } }] }))
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Shared video' }, contentDetails: { videoId: 'shared' } }] }))
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: second.title } }] }))
      .mockResolvedValueOnce(Response.json({ items: [{ snippet: { title: 'Shared video' }, contentDetails: { videoId: 'shared' } }] }));
    const getAccessToken = vi.fn(async () => 'fake-access');
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher);
    const results = await collectYouTubeAccount(client);
    expect(results.map((result) => result.playlist)).toEqual([first, second]);
    expect(results.map((result) => result.items[0]?.collection)).toEqual(['First', 'Second']);
    expect(results.map((result) => result.items[0]?.sourceId)).toEqual(['shared', 'shared']);
    expect(fetcher.mock.calls.map(([url]) => {
      const parsed = new URL(String(url));
      return [parsed.pathname, parsed.searchParams.get('id') ?? parsed.searchParams.get('playlistId')];
    })).toEqual([
      ['/youtube/v3/playlists', null],
      ['/youtube/v3/playlists', first.id], ['/youtube/v3/playlistItems', first.id],
      ['/youtube/v3/playlists', second.id], ['/youtube/v3/playlistItems', second.id],
    ]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(options?.headers).toEqual({ Authorization: 'Bearer fake-access' });
      expect(String(url)).not.toContain('fake-access');
      expect(new URL(String(url)).searchParams.has('key')).toBe(false);
    }
    expect(getAccessToken).toHaveBeenCalledTimes(5);
  });

  it('rejects the whole operation and identifies the affected playlist without forwarding unsafe errors', async () => {
    const client: YouTubeClient & YouTubeAccountClient = {
      listMyPlaylistsPage: async () => ({ items: [first, second, { id: 'PLthird', title: 'Third' }] }),
      getPlaylist: vi.fn(async (id) => {
        if (id === second.id) throw new Error('fake-access-token in request');
        return { title: first.title };
      }),
      listPlaylistItems: vi.fn(async () => ({ items: [] })),
    };
    const error = await collectYouTubeAccount(client).catch((e: unknown) => e);
    expect((error as Error).message).toContain('Could not collect YouTube playlist PLsecond');
    expect((error as Error).message).not.toContain('fake-access-token');
    expect(client.getPlaylist).toHaveBeenCalledTimes(2);
    expect(client.listPlaylistItems).toHaveBeenCalledTimes(1);
  });
});
