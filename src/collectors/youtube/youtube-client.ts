import { z } from 'zod';
import { GoogleAuthError } from '../../auth/google-client-config.js';
import { YouTubeError } from './youtube-error.js';

// Only the external fields needed for collection are modeled here.
const playlistItemSchema = z.object({
  snippet: z.object({
    title: z.string().nullish(),
    description: z.string().nullish(),
    videoOwnerChannelTitle: z.string().nullish(),
    resourceId: z.object({ videoId: z.string().nullish() }).nullish(),
  }).nullish(),
  contentDetails: z.object({
    videoId: z.string().nullish(),
    videoPublishedAt: z.string().nullish(),
  }).nullish(),
});

const playlistResponseSchema = z.object({
  items: z.array(z.object({ snippet: z.object({ title: z.string().trim().min(1) }) })),
});
const itemsResponseSchema = z.object({
  items: z.array(playlistItemSchema),
  nextPageToken: z.string().optional(),
});
const apiErrorSchema = z.object({
  error: z.object({
    errors: z.array(z.object({ reason: z.string() })).optional(),
  }),
});

export type YouTubePlaylistItem = z.infer<typeof playlistItemSchema>;
export type YouTubePlaylistPage = z.infer<typeof itemsResponseSchema>;

const accountResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    snippet: z.object({ title: z.string().trim().min(1) }),
  })),
  nextPageToken: z.string().optional(),
});

export interface YouTubePlaylistSummary { id: string; title: string }
export interface YouTubePlaylistListPage {
  items: YouTubePlaylistSummary[];
  nextPageToken?: string | undefined;
}
export interface YouTubeAccountClient {
  listMyPlaylistsPage(pageToken?: string): Promise<YouTubePlaylistListPage>;
}
export type YouTubeAuthentication =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; getAccessToken: () => Promise<string> };

/** Authentication belongs to the client, not the collector. */
export interface YouTubeClient {
  getPlaylist(playlistId: string): Promise<{ title: string }>;
  listPlaylistItems(playlistId: string, pageToken?: string): Promise<YouTubePlaylistPage>;
}

export class YouTubeApiClient implements YouTubeClient, YouTubeAccountClient {
  private readonly authentication: YouTubeAuthentication;

  // Keep Task 002's string constructor as shorthand for explicit API-key mode.
  constructor(authentication: YouTubeAuthentication | string, private readonly fetcher: typeof fetch = fetch) {
    const auth = typeof authentication === 'string' ? { kind: 'api-key' as const, apiKey: authentication } : authentication;
    this.authentication = auth.kind === 'api-key' ? { kind: 'api-key', apiKey: auth.apiKey.trim() } : auth;
    if (this.authentication.kind === 'api-key' && !this.authentication.apiKey) {
      throw new YouTubeError('A YouTube API key is required for public playlist access.');
    }
  }

  async listMyPlaylistsPage(pageToken?: string): Promise<YouTubePlaylistListPage> {
    if (this.authentication.kind !== 'oauth') throw new YouTubeError('Owned playlist discovery requires OAuth authorization. Run `knowledge-sync youtube auth login`.');
    const params: Record<string, string> = { part: 'snippet', mine: 'true', maxResults: '50' };
    if (pageToken) params.pageToken = pageToken;
    const data = await this.request('playlists', undefined, params);
    const parsed = accountResponseSchema.safeParse(data);
    if (!parsed.success) throw new YouTubeError('Invalid YouTube owned playlists response.');
    return {
      items: parsed.data.items.map(({ id, snippet }) => ({ id, title: snippet.title })),
      nextPageToken: parsed.data.nextPageToken,
    };
  }

  async getPlaylist(playlistId: string): Promise<{ title: string }> {
    const data = await this.request('playlists', playlistId, { part: 'snippet', id: playlistId });
    const parsed = playlistResponseSchema.safeParse(data);
    if (!parsed.success) throw new YouTubeError(`Invalid YouTube playlist metadata response for ${playlistId}.`);
    const playlist = parsed.data.items[0];
    if (!playlist) throw new YouTubeError(`YouTube playlist ${playlistId} was not found or is inaccessible.`);
    return { title: playlist.snippet.title };
  }

  async listPlaylistItems(playlistId: string, pageToken?: string): Promise<YouTubePlaylistPage> {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails', playlistId, maxResults: '50',
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await this.request('playlistItems', playlistId, params);
    const parsed = itemsResponseSchema.safeParse(data);
    if (!parsed.success) throw new YouTubeError(`Invalid YouTube playlist items response for ${playlistId}.`);
    return parsed.data;
  }

  private async request(
    resource: 'playlists' | 'playlistItems',
    playlistId: string | undefined,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    const auth = this.authentication;
    const headers: Record<string, string> = {};
    if (auth.kind === 'api-key') {
      url.search = new URLSearchParams({ ...params, key: auth.apiKey }).toString();
    } else {
      url.search = new URLSearchParams(params).toString();
      let token: string;
      try {
        token = await auth.getAccessToken();
        if (!token?.trim()) throw new Error();
      } catch (error) {
        if (error instanceof GoogleAuthError) throw error;
        throw new YouTubeError('YouTube OAuth access token is unavailable. Check connectivity and Google OAuth configuration.');
      }
      headers.Authorization = `Bearer ${token}`;
    }
    const context = playlistId === undefined
      ? `YouTube ${resource}.list for owned playlists`
      : `YouTube ${resource}.list for playlist ${playlistId}`;
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(30_000), headers });
    } catch {
      // Fetch errors can include the request URL and therefore the API key.
      throw new YouTubeError(`${context}: network request failed or timed out.`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new YouTubeError(`${context}: HTTP ${response.status}, unreadable JSON response.`);
    }
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(data);
      const rawReasons = parsed.success ? parsed.data.error.errors?.map(({ reason }) => reason) ?? [] : [];
      // Either mode may echo credentials not known to this client. Emit only known reason codes.
      const knownReasons = ['keyInvalid', 'authError', 'invalidCredentials', 'unauthorized', 'quotaExceeded', 'dailyLimitExceeded',
        'forbidden', 'insufficientPermissions', 'playlistItemsNotAccessible', 'playlistNotFound', 'backendError'];
      const reasons = rawReasons.filter((reason) => knownReasons.includes(reason)).join(', ');
      const detail = reasons ? ` (${reasons})` : '';
      if (auth.kind === 'oauth') {
        const needsLogin = response.status === 401 || (response.status === 403
          && rawReasons.some((reason) => ['authError', 'invalidCredentials', 'unauthorized'].includes(reason)));
        const hint = needsLogin ? 'OAuth authorization failed. Run `knowledge-sync youtube auth login`.'
          : response.status === 403 ? 'API quota or playlist access denied; check quota, account ownership, and read-only permission.'
          : response.status === 404 ? 'Playlist not found or inaccessible.' : 'YouTube API request failed.';
        throw new YouTubeError(`${context}: HTTP ${response.status}${detail}. ${hint}`);
      }
      const hint = response.status === 404 ? 'Playlist not found.'
        : response.status === 401 ? 'Invalid API credentials.'
        : response.status === 403 ? 'Playlist inaccessible or API access denied; check API key and quota.'
        : 'API request failed; check API key and request parameters.';
      throw new YouTubeError(`${context}: HTTP ${response.status}${detail}. ${hint}`);
    }
    return data;
  }
}
