import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import { YouTubeAccount } from '../src/collectors/youtube/youtube-account.js';
import { createYouTubeAccountSource } from '../src/collectors/youtube/youtube-account-source.js';
import type { YouTubeAccountClient, YouTubeClient } from '../src/collectors/youtube/youtube-client.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import { YouTubeError } from '../src/collectors/youtube/youtube-error.js';

function client() {
  return {
    listMyPlaylistsPage: vi.fn<YouTubeAccountClient['listMyPlaylistsPage']>().mockResolvedValue({ items: [] }),
    getPlaylist: vi.fn<YouTubeClient['getPlaylist']>().mockResolvedValue({ title: 'Current title' }),
    listPlaylistItems: vi.fn<YouTubeClient['listPlaylistItems']>().mockResolvedValue({ items: [] }),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('YouTube account synchronization source', () => {
  it('reuses owned-playlist discovery and preserves pagination order in normalized collections', async () => {
    const api = client();
    const discover = vi.spyOn(YouTubeAccount.prototype, 'listMyPlaylists');
    api.listMyPlaylistsPage.mockResolvedValueOnce({
      items: [{ id: 'PLz', title: 'Same title' }], nextPageToken: 'page-two',
    }).mockResolvedValueOnce({ items: [{ id: 'PLa', title: 'Same title' }] });
    const source = createYouTubeAccountSource(api);
    expect(await source.discover()).toEqual([
      { source: 'youtube', sourceId: 'PLz', title: 'Same title' },
      { source: 'youtube', sourceId: 'PLa', title: 'Same title' },
    ]);
    expect(discover).toHaveBeenCalledExactlyOnceWith();
    expect(api.listMyPlaylistsPage.mock.calls).toEqual([[undefined], ['page-two']]);
    expect(api.getPlaylist).not.toHaveBeenCalled();
    expect(api.listPlaylistItems).not.toHaveBeenCalled();
  });

  it('returns zero collections without performing any playlist collection', async () => {
    const api = client();
    expect(await createYouTubeAccountSource(api).discover()).toEqual([]);
    expect(api.getPlaylist).not.toHaveBeenCalled();
    expect(api.listPlaylistItems).not.toHaveBeenCalled();
  });

  it.each([new GoogleAuthError('Safe auth message.'), new Error('discovery failed'), { detail: 'unknown' }, undefined])
  ('preserves late discovery failures without returning a partial collection list (%j)', async (error) => {
    const api = client();
    api.listMyPlaylistsPage.mockResolvedValueOnce({
      items: [{ id: 'PLone', title: 'One' }], nextPageToken: 'page-two',
    }).mockRejectedValueOnce(error);
    await expect(createYouTubeAccountSource(api).discover()).rejects.toBe(error);
    expect(api.listMyPlaylistsPage).toHaveBeenCalledTimes(2);
    expect(api.getPlaylist).not.toHaveBeenCalled();
    expect(api.listPlaylistItems).not.toHaveBeenCalled();
  });

  it('uses the same client and existing collector, retaining empty-playlist metadata', async () => {
    const api = client();
    api.listMyPlaylistsPage.mockResolvedValue({ items: [{ id: 'PLone', title: 'Earlier discovery title' }] });
    const source = createYouTubeAccountSource(api);
    const collections = await source.discover();
    const collector = source.createCollector(collections[0]!);
    expect(collector).toBeInstanceOf(YouTubeCollector);
    expect(await collector.collectCollection()).toEqual({
      collection: { source: 'youtube', sourceId: 'PLone', title: 'Current title' }, items: [],
    });
    expect(api.getPlaylist).toHaveBeenCalledExactlyOnceWith('PLone');
    expect(api.listPlaylistItems).toHaveBeenCalledExactlyOnceWith('PLone', undefined);
    expect(api.listMyPlaylistsPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { error: new GoogleAuthError('Provider failed.'), fatal: true },
    { error: new YouTubeError('Safe failure.', { accountFatal: true }), fatal: true },
    { error: new YouTubeError('OAuth invalidCredentials quotaExceeded'), fatal: false },
    { error: new Error('OAuth invalidCredentials quotaExceeded'), fatal: false },
    { error: { accountFatal: true, message: 'Unknown object' }, fatal: false },
    { error: undefined, fatal: false },
  ])('classifies structured source failures without parsing messages ($fatal)', ({ error, fatal }) => {
    expect(createYouTubeAccountSource(client()).isFatalError(error)).toBe(fatal);
  });
});
