import { describe, expect, it, vi } from 'vitest';
import { gaxios, OAuth2Client } from 'google-auth-library';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import { createAccessTokenProvider } from '../src/auth/google-oauth.js';
import { YouTubeApiClient } from '../src/collectors/youtube/youtube-client.js';
import { YouTubeCollector } from '../src/collectors/youtube/youtube-collector.js';
import { YouTubeError } from '../src/collectors/youtube/youtube-error.js';

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
    const original = new Error('fake-refresh fake-client-secret');
    const getAccessToken = async () => {
      if (mode === 'failure') throw original;
      return ' ';
    };
    const fetcher = vi.fn<typeof fetch>();
    const error = await new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher).getPlaylist('PLone').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as Error).message).toContain('access token is unavailable');
    expect((error as Error).message).not.toContain('auth login');
    expect((error as Error).message).not.toContain('fake-');
    expect((error as YouTubeError).accountFatal).toBe(true);
    if (mode === 'failure') expect((error as Error).cause).toBe(original);
    else expect((error as Error).cause).toBeInstanceOf(Error);
    expect(fetcher).not.toHaveBeenCalled();
  });

  describe.each([0, 2])('OAuth failure after %i successful requests', (successfulRequests) => {
    it.each([
      { name: 'invalid_grant', status: 400, code: 'invalid_grant', transport: undefined, hint: 'authorization is no longer valid', login: true },
      { name: 'network', status: undefined, code: undefined, transport: 'ECONNRESET', hint: 'network/transport error (ECONNRESET)', login: false },
      ...[500, 503, 408, 429].map((status) => ({ name: `HTTP ${status}`, status, code: undefined, transport: undefined,
        hint: `temporarily failed (HTTP ${status})`, login: false })),
      { name: 'unknown', status: 400, code: 'fake-secret-unknown', transport: undefined, hint: 'access-token refresh failed (HTTP 400)', login: false },
    ])('preserves the provider classification for $name through collection', async ({ status, code, transport, hint, login }) => {
      const options: gaxios.GaxiosOptionsPrepared = {
        url: new URL('https://oauth2.googleapis.com/token'), headers: new Headers(), responseType: 'json',
      };
      const response = status === undefined ? undefined : Object.assign(new Response(null, { status }), {
        data: { error: code, error_description: 'fake-secret-body' }, config: options,
      });
      const original = new gaxios.GaxiosError('fake-secret-message', options, response,
        transport ? Object.assign(new Error('fake-secret-cause'), { code: transport }) : undefined);
      const oauth = new OAuth2Client();
      const request = vi.spyOn(oauth.transporter, 'request');
      for (let index = 0; index < successfulRequests; index++) {
        // A short-lived token forces the real library to refresh before each next request.
        request.mockResolvedValueOnce({ data: { access_token: 'fake-access', expires_in: 1 } } as never);
      }
      request.mockRejectedValue(original);
      const store = {
        loadRefreshToken: vi.fn(async () => 'fake-refresh'),
        saveRefreshToken: vi.fn(async () => {}),
        deleteRefreshToken: vi.fn(async () => true),
      };
      const provider = createAccessTokenProvider({ client_id: 'fake-client', client_secret: 'fake-secret' }, store, () => oauth);
      let classified: unknown;
      const getAccessToken = async () => {
        try { return await provider(); } catch (error) { classified = error; throw error; }
      };
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ items: [{ snippet: { title: 'Learning' } }] }))
        .mockResolvedValueOnce(json({ items: [], nextPageToken: 'next' }));
      const collector = new YouTubeCollector(new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher), 'PLone');
      const error = await collector.collect().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(GoogleAuthError);
      expect(error).toBe(classified);
      expect((error as Error).cause).toBe(original);
      expect((error as Error).message).toContain(hint);
      expect((error as Error).message.includes('auth login')).toBe(login);
      expect((error as Error).message).not.toContain('fake-');
      expect(fetcher).toHaveBeenCalledTimes(successfulRequests);
      expect(request).toHaveBeenCalledTimes(successfulRequests + 1);
      expect(store.saveRefreshToken).not.toHaveBeenCalled();
      expect(store.deleteRefreshToken).not.toHaveBeenCalled();
    });

    it('sanitizes unclassified provider exceptions without requiring login', async () => {
      const getAccessToken = vi.fn<() => Promise<string>>();
      for (let index = 0; index < successfulRequests; index++) getAccessToken.mockResolvedValueOnce('fake-access');
      const original = new Error('fake-secret-message', { cause: new Error('fake-secret-cause') });
      getAccessToken.mockRejectedValue(original);
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(json({ items: [{ snippet: { title: 'Learning' } }] }))
        .mockResolvedValueOnce(json({ items: [], nextPageToken: 'next' }));
      const error = await new YouTubeCollector(new YouTubeApiClient({ kind: 'oauth', getAccessToken }, fetcher), 'PLone')
        .collect().catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(YouTubeError);
      expect((error as Error).message).toContain('access token is unavailable');
      expect((error as Error).message).not.toMatch(/fake-|auth login/);
      expect((error as Error).cause).toBe(original);
      expect((error as YouTubeError).accountFatal).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(successfulRequests);
    });
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
    expect(error).toBeInstanceOf(YouTubeError);
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

  it('hides arbitrary API response content including credentials other than its own key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: { message: 'fake-refresh-token', errors: [{ reason: 'bad secret-key' }, { reason: 'fake-client-secret' }] },
    }, 400));
    const error = await new YouTubeApiClient('secret-key', fetcher).getPlaylist('PL123').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as Error).message).toContain('playlist PL123: HTTP 400');
    expect((error as Error).message).not.toMatch(/fake-|secret-key|bad /);
    expect((error as Error).cause).toBeUndefined();
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

describe('YouTube account failure classification', () => {
  it('defaults existing YouTube errors to recoverable and retains ErrorOptions compatibility', () => {
    const cause = new Error('original');
    const error = new YouTubeError('Safe diagnostic.', { cause });
    expect(error.cause).toBe(cause);
    expect(error.accountFatal).toBe(false);
    expect(new YouTubeError().accountFatal).toBe(false);
  });

  it.each([
    { status: 401, reasons: [], fatal: true },
    { status: 400, reasons: ['keyInvalid'], fatal: true },
    { status: 403, reasons: ['authError'], fatal: true },
    { status: 403, reasons: ['invalidCredentials'], fatal: true },
    { status: 400, reasons: ['unauthorized'], fatal: true },
    { status: 403, reasons: ['quotaExceeded'], fatal: true },
    { status: 403, reasons: ['dailyLimitExceeded'], fatal: true },
    { status: 403, reasons: ['forbidden', 'dailyLimitExceeded'], fatal: true },
    { status: 403, reasons: ['playlistItemsNotAccessible'], fatal: false },
    { status: 403, reasons: ['insufficientPermissions'], fatal: false },
    { status: 403, reasons: ['forbidden'], fatal: false },
    { status: 404, reasons: ['playlistNotFound'], fatal: false },
    { status: 500, reasons: ['backendError'], fatal: false },
    { status: 503, reasons: [], fatal: false },
    { status: 429, reasons: [], fatal: false },
    { status: 400, reasons: ['fake-secret-unauthorized'], fatal: false },
  ])('uses structured HTTP $status reasons $reasons to classify fatal=$fatal', async ({ status, reasons, fatal }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: {
      message: 'fake-secret quotaExceeded invalidCredentials',
      errors: reasons.map((reason) => ({ reason })),
    } }, status));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' }, fetcher);
    const error = await client.getPlaylist('PLone').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as YouTubeError).accountFatal).toBe(fatal);
    expect((error as Error).message).not.toContain('fake-secret');
    expect((error as Error).cause).toBeUndefined();
  });

  it.each([200, 401, 403, 503])('retains HTTP %i classification when JSON cannot be read', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('fake-secret invalidCredentials', { status }));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' }, fetcher);
    const error = await client.getPlaylist('PLone').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as YouTubeError).accountFatal).toBe(status === 401);
    expect((error as Error).message).toContain(`HTTP ${status}, unreadable JSON response`);
    expect((error as Error).message).not.toContain('fake-secret');
  });

  it.each([{ secret: 'fake-refresh' }, undefined])('preserves unknown provider failures internally (%j)', async (cause) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => { throw cause; } }, fetcher);
    const error = await client.getPlaylist('PLone').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(YouTubeError);
    expect((error as YouTubeError).accountFatal).toBe(true);
    expect((error as Error).cause).toBe(cause);
    expect((error as Error).message).not.toContain('fake-refresh');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps ordinary API transport failures recoverable with a safe message', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('fake-secret quotaExceeded'));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' }, fetcher);
    const error = await client.getPlaylist('PLone').catch((failure: unknown) => failure);
    expect((error as YouTubeError).accountFatal).toBe(false);
    expect((error as Error).message).not.toContain('fake-secret');
    expect((error as Error).cause).toBeUndefined();
  });

  it('keeps malformed successful metadata recoverable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ invalid: 'fake-secret' }));
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: async () => 'fake-access' }, fetcher);
    const error = await client.getPlaylist('PLone').catch((failure: unknown) => failure);
    expect((error as YouTubeError).accountFatal).toBe(false);
    expect((error as Error).message).not.toContain('fake-secret');
  });
});
