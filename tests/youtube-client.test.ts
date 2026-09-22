import { describe, expect, it, vi } from 'vitest';
import { YouTubeApiClient } from '../src/collectors/youtube/youtube-client.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('YouTubeApiClient OAuth and account access', () => {
  it('sends a fresh Bearer header for each request and paginates the owned-playlist endpoint', async () => {
    const getAccessToken = vi.fn().mockResolvedValueOnce('fake-access-one').mockResolvedValueOnce('fake-access-two');
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [{ id: 'PLone', snippet: { title: 'One' } }], nextPageToken: 'next+/=' }))
      .mockResolvedValueOnce(json({ items: [] }));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher);
    expect(await client.listMyPlaylistsPage()).toEqual({ items: [{ id: 'PLone', title: 'One' }], nextPageToken: 'next+/=' });
    await client.listMyPlaylistsPage('next+/=');
    expect(fetcher.mock.calls.map(([url]) => Object.fromEntries(new URL(String(url)).searchParams))).toEqual([
      { part: 'snippet', mine: 'true', maxResults: '50' },
      { part: 'snippet', mine: 'true', maxResults: '50', pageToken: 'next+/=' },
    ]);
    expect(fetcher.mock.calls.map(([, options]) => options?.headers)).toEqual([
      { Authorization: 'Bearer fake-access-one' }, { Authorization: 'Bearer fake-access-two' },
    ]);
    expect(fetcher.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects account discovery in API-key mode without HTTP access', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new YouTubeApiClient({ kind: 'api-key', apiKey: 'fake-key' }, fetcher).listMyPlaylistsPage())
      .rejects.toThrow('requires OAuth authorization');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['failure', 'blank'])('safely rejects a token provider %s', async (mode) => {
    const getAccessToken = async () => {
      if (mode === 'failure') throw new Error('fake-refresh fake-client-secret');
      return ' ';
    };
    const fetcher = vi.fn<typeof fetch>();
    const error = await new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher).getPlaylist('PLone').catch((e: unknown) => e);
    expect((error as Error).message).toContain('knowledge-sync youtube auth login');
    expect((error as Error).message).not.toContain('fake-');
    expect((error as Error).cause).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'authError', 'auth login'],
    [403, 'invalidCredentials', 'auth login'],
    [403, 'quotaExceeded', 'quota or playlist access denied'],
    [403, 'playlistItemsNotAccessible', 'quota or playlist access denied'],
    [404, 'playlistNotFound', 'not found or inaccessible'],
  ])('distinguishes OAuth HTTP %s (%s) without echoing arbitrary API error content', async (status, reason, hint) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: {
      message: 'fake-client-secret', errors: [{ reason }, { reason: 'fake-access fake-refresh' }],
    } }, status));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' }, fetcher);
    const error = await client.listMyPlaylistsPage().catch((e: unknown) => e);
    expect((error as Error).message).toContain(hint);
    expect((error as Error).message).not.toContain('fake-');
    expect((error as Error).message).toContain(`HTTP ${status}`);
  });

  it.each([{}, { items: [{}] }, { items: [{ id: 'bad id', snippet: { title: 'Title' } }] },
    { items: [{ id: 'PLone', snippet: { title: ' ' } }] }, { items: [], nextPageToken: 123 }])
  ('rejects malformed account responses', async (body) => {
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' },
      vi.fn<typeof fetch>().mockResolvedValue(json(body)));
    await expect(client.listMyPlaylistsPage()).rejects.toThrow('Invalid YouTube owned playlists response');
  });

  it('does not leak a token echoed by a network error', async () => {
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' },
      vi.fn<typeof fetch>().mockRejectedValue(new Error('Authorization: Bearer fake-access')));
    const error = await client.listMyPlaylistsPage().catch((e: unknown) => e);
    expect((error as Error).message).toContain('network request failed');
    expect((error as Error).message).not.toContain('fake-access');
    expect((error as Error).cause).toBeUndefined();
  });
});

describe('YouTubeApiClient', () => {
  it('uses one metadata request and one request per page with the required parts and page size', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [{ snippet: { title: 'Learning' } }] }))
      .mockResolvedValueOnce(json({ items: [{ snippet: { title: 'First' }, contentDetails: { videoId: 'a' } }],
        nextPageToken: 'next+/=' }))
      .mockResolvedValueOnce(json({ items: [{ snippet: { title: 'Second' }, contentDetails: { videoId: 'b' } }] }));
    const client = new YouTubeApiClient('test-key', fetcher);
    const items = await new YouTubeCollector(client, 'PL123').collect();
    expect(items.map((item) => item.sourceId)).toEqual(['a', 'b']);
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/youtube/v3/playlists', '/youtube/v3/playlistItems', '/youtube/v3/playlistItems',
    ]);
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({ part: 'snippet', id: 'PL123', key: 'test-key' });
    expect(Object.fromEntries(urls[1]!.searchParams)).toEqual({
      part: 'snippet,contentDetails', playlistId: 'PL123', maxResults: '50', key: 'test-key',
    });
    expect(urls[2]!.searchParams.get('pageToken')).toBe('next+/=');
    expect(urls.every((url) => url.origin === 'https://www.googleapis.com')).toBe(true);
  });

  it('rejects a missing key before requesting anything', () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => new YouTubeApiClient(' ', fetcher)).toThrow('API key is required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('distinguishes a missing or inaccessible playlist from an accessible empty playlist', async () => {
    const client = new YouTubeApiClient('test-key', vi.fn<typeof fetch>().mockResolvedValue(json({ items: [] })));
    await expect(client.getPlaylist('PL123')).rejects.toThrow('PL123 was not found or is inaccessible');
  });

  it.each([
    [400, 'keyInvalid', 'API request failed'],
    [401, 'unauthorized', 'Invalid API credentials'],
    [403, 'playlistItemsNotAccessible', 'Playlist inaccessible'],
    [403, 'quotaExceeded', 'check API key and quota'],
    [404, 'playlistNotFound', 'Playlist not found'],
    [500, 'backendError', 'API request failed'],
  ])('reports HTTP %i and API reason %s with playlist context', async (status, reason, hint) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: { errors: [{ reason }] } }, status));
    const error = await new YouTubeApiClient('test-key', fetcher).listPlaylistItems('PL123').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`playlist PL123: HTTP ${status} (${reason})`);
    expect((error as Error).message).toContain(hint);
  });

  it('reports network failures without leaking credentials through errors or causes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('fetch failed: ?key=secret-key'));
    const error = await new YouTubeApiClient('secret-key', fetcher).getPlaylist('PL123').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('playlist PL123: network request failed');
    expect((error as Error).message).not.toContain('secret-key');
    expect((error as Error).cause).toBeUndefined();
  });

  it('redacts the API key if returned in an API error reason', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: { errors: [{ reason: 'bad secret-key' }] },
    }, 400));
    await expect(new YouTubeApiClient('secret-key', fetcher).getPlaylist('PL123'))
      .rejects.toThrow('bad [redacted]');
  });

  it.each([200, 503])('reports unreadable JSON with HTTP %i context', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('not JSON', { status }));
    await expect(new YouTubeApiClient('test-key', fetcher).getPlaylist('PL123'))
      .rejects.toThrow(`playlist PL123: HTTP ${status}, unreadable JSON response`);
  });

  it('rejects malformed success payloads rather than treating them as empty playlists', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json({ unexpected: true }));
    const client = new YouTubeApiClient('test-key', fetcher);
    await expect(client.getPlaylist('PL123')).rejects.toThrow('Invalid YouTube playlist metadata response for PL123');
    await expect(client.listPlaylistItems('PL123')).rejects.toThrow('Invalid YouTube playlist items response for PL123');
  });
});
