import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { gaxios, OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessTokenProvider, GoogleOAuth, youtubeReadonlyScope } from '../src/auth/google-oauth.js';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import type { TokenStore } from '../src/auth/token-store.js';

const config = { client_id: 'fake-client-id', client_secret: 'fake-client-secret' };
const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    const listening = server.listening;
    server.close();
    server.closeAllConnections();
    expect(listening, 'callback listener must close on every terminal path').toBe(false);
  }
});

function memoryStore(initial: string | null = 'fake-existing-refresh') {
  let token = initial;
  return {
    loadRefreshToken: vi.fn(async () => token),
    saveRefreshToken: vi.fn(async (replacement: string) => { token = replacement; }),
    deleteRefreshToken: vi.fn(async () => { const existed = token !== null; token = null; return existed; }),
  } satisfies TokenStore;
}

function setup(timeout = 2000) {
  const store = memoryStore();
  const client = new OAuth2Client({ clientId: config.client_id, clientSecret: config.client_secret });
  const exchange = vi.fn(async (..._args: unknown[]) => ({ tokens: { refresh_token: 'fake-new-refresh' }, res: null }));
  client.getToken = exchange;
  const server = createServer();
  servers.push(server);
  const listen = vi.spyOn(server, 'listen');
  const oauth = new GoogleOAuth(config, store, {
    createClient: () => client, createServer: () => server, callbackTimeoutMs: timeout,
  });
  return { store, client, exchange, oauth, server, listen };
}

function callbackFor(consent: string): URL {
  const url = new URL(consent);
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state', url.searchParams.get('state')!);
  callback.searchParams.set('code', 'fake-authorization-code');
  return callback;
}

describe('Google OAuth Desktop login', () => {
  it('uses a dynamic loopback port, exact state, offline consent and fresh PKCE S256, then persists the refresh token', async () => {
    const consentUrls: URL[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { oauth, exchange, store, listen } = setup();
      let response: Promise<Response> | undefined;
      await oauth.login((consent) => {
        const url = new URL(consent);
        consentUrls.push(url);
        const redirect = new URL(url.searchParams.get('redirect_uri')!);
        expect(redirect.hostname).toBe('127.0.0.1');
        expect(Number(redirect.port)).toBeGreaterThan(0);
        expect(redirect.pathname).toBe('/oauth2/callback');
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
          response_type: 'code', scope: youtubeReadonlyScope, access_type: 'offline', prompt: 'consent',
          code_challenge_method: 'S256', client_id: config.client_id,
        });
        expect(url.searchParams.has('client_secret')).toBe(false);
        response = fetch(callbackFor(consent));
      });
      expect(listen).toHaveBeenCalledWith(0, '127.0.0.1', expect.any(Function));
      expect(exchange).toHaveBeenCalledTimes(1);
      const options = exchange.mock.calls[0]![0] as { code: string; codeVerifier: string; redirect_uri: string };
      expect(options.code).toBe('fake-authorization-code');
      expect(options.redirect_uri).toBe(consentUrls[attempt]!.searchParams.get('redirect_uri'));
      expect(options.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
      expect(createHash('sha256').update(options.codeVerifier).digest('base64url'))
        .toBe(consentUrls[attempt]!.searchParams.get('code_challenge'));
      expect(await store.loadRefreshToken()).toBe('fake-new-refresh');
      expect(store.saveRefreshToken).toHaveBeenCalledTimes(1);
      expect((await response)?.status).toBe(200);
      expect(await (await response)?.text()).toContain('You may close this window');
    }
    expect(consentUrls[0]!.searchParams.get('state')).not.toBe(consentUrls[1]!.searchParams.get('state'));
    expect(consentUrls[0]!.searchParams.get('code_challenge')).not.toBe(consentUrls[1]!.searchParams.get('code_challenge'));
  });

  it.each([
    ['denial', (url: URL) => url.searchParams.set('error', 'access_denied'), 'consent was denied'],
    ['missing code', (url: URL) => url.searchParams.delete('code'), 'no valid authorization code'],
    ['missing state', (url: URL) => url.searchParams.delete('state'), 'state is missing or mismatched'],
    ['wrong state', (url: URL) => url.searchParams.set('state', 'wrong'), 'state is missing or mismatched'],
    ['wrong equal-length state', (url: URL) => url.searchParams.set('state', 'x'.repeat(43)), 'state is missing or mismatched'],
    ['wrong path', (url: URL) => { url.pathname = '/wrong'; }, 'callback path or method'],
    ['duplicate code', (url: URL) => url.searchParams.append('code', 'other'), 'no valid authorization code'],
  ])('rejects %s without exchanging a code or destroying existing authorization', async (_name, modify, message) => {
    const { oauth, store, exchange } = setup();
    let response: Promise<Response> | undefined;
    const result = oauth.login((consent) => {
      const url = callbackFor(consent);
      modify(url);
      response = fetch(url);
    });
    await expect(result).rejects.toThrow(message);
    expect((await response)?.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
    expect(await store.loadRefreshToken()).toBe('fake-existing-refresh');
  });

  it.each(['exchange failure', 'missing refresh token', 'blank refresh token'])('rejects %s safely and preserves the previous token', async (scenario) => {
    const { oauth, exchange, store } = setup();
    if (scenario === 'exchange failure') exchange.mockRejectedValue(new Error('fake-client-secret fake-authorization-code'));
    else exchange.mockResolvedValue({ tokens: { refresh_token: scenario === 'blank refresh token' ? ' ' : '' }, res: null });
    let response: Promise<Response> | undefined;
    const error = await oauth.login((consent) => { response = fetch(callbackFor(consent)); }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/code exchange failed|no refresh token/);
    expect((error as Error).message).not.toContain('fake-');
    expect((error as Error).cause).toBeUndefined();
    expect((await response)?.status).toBe(400);
    expect(await store.loadRefreshToken()).toBe('fake-existing-refresh');
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('times out promptly without changing persistent authorization', async () => {
    const { oauth, store } = setup(20);
    await expect(oauth.login(() => {})).rejects.toThrow('callback timed out');
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('handles listener startup failure without leaking lower-level errors', async () => {
    const { oauth, server } = setup();
    vi.spyOn(server, 'listen').mockImplementation(() => {
      queueMicrotask(() => server.emit('error', new Error('fake-client-secret')));
      return server;
    });
    await expect(oauth.login(() => {})).rejects.toThrow('Cannot start the Google OAuth loopback listener');
  });

  it('closes on consent URL output failure', async () => {
    const { oauth } = setup();
    await expect(oauth.login(() => { throw new Error('fake-client-secret'); }))
      .rejects.toThrow('Could not display the Google consent URL');
  });

  it('accepts only one callback while exchanging a code', async () => {
    const { oauth, exchange } = setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    exchange.mockImplementation(async () => {
      await pending;
      return { tokens: { refresh_token: 'fake-new-refresh' }, res: null };
    });
    let callback: URL | undefined;
    let first: Promise<Response> | undefined;
    const login = oauth.login((url) => { callback = callbackFor(url); first = fetch(callback); });
    await vi.waitFor(() => expect(exchange).toHaveBeenCalledTimes(1));
    try { expect((await fetch(callback!)).status).toBe(409); } finally { release(); }
    await login;
    expect((await first)?.status).toBe(200);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});

describe('Google access-token provider', () => {
  it('requires locally stored authorization', async () => {
    const provider = createAccessTokenProvider(config, memoryStore(null));
    await expect(provider()).rejects.toThrow('No locally stored YouTube authorization');
    await expect(provider()).rejects.toThrow('knowledge-sync youtube auth login');
  });

  it('uses the library to refresh and cache access tokens and safely persists a rotated refresh token', async () => {
    const store = memoryStore();
    const client = new OAuth2Client({ clientId: config.client_id, clientSecret: config.client_secret });
    const request = vi.spyOn(client.transporter, 'request').mockImplementation(async () => ({
      data: { access_token: 'fake-access', refresh_token: 'fake-replacement-refresh', expires_in: 3600, token_type: 'Bearer' },
    }) as never);
    const provider = createAccessTokenProvider(config, store, () => client);
    expect(await provider()).toBe('fake-access');
    expect(await provider()).toBe('fake-access');
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.loadRefreshToken).toHaveBeenCalledTimes(1);
    expect(store.saveRefreshToken).toHaveBeenCalledExactlyOnceWith('fake-replacement-refresh');
    expect(client.credentials.refresh_token).toBe('fake-replacement-refresh');
  });

  function refreshError(status?: number, data?: unknown, cause?: unknown) {
    const options: gaxios.GaxiosOptionsPrepared = {
      url: new URL('https://oauth2.googleapis.com/token'), headers: new Headers(), responseType: 'json',
    };
    const response = status === undefined ? undefined
      : Object.assign(new Response(null, { status }), { data, config: options });
    return new gaxios.GaxiosError('fake-refresh fake-client-secret', options, response, cause);
  }

  async function failedRefresh(original: unknown) {
    const store = memoryStore();
    const client = new OAuth2Client();
    // Exercise getAccessToken/refreshAccessToken with the real library and a mocked transport.
    const request = vi.spyOn(client.transporter, 'request').mockRejectedValue(original);
    const provider = createAccessTokenProvider(config, store, () => client);
    const error = await provider().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleAuthError);
    expect((error as Error).cause).toBe(original);
    expect((error as Error).message).not.toContain('fake-');
    expect(await store.loadRefreshToken()).toBe('fake-existing-refresh');
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
    expect(store.deleteRefreshToken).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    return { error: error as GoogleAuthError, provider, request, store };
  }

  it('classifies invalid_grant as invalid authorization with re-login guidance', async () => {
    const { error } = await failedRefresh(refreshError(400, {
      error: 'invalid_grant', error_description: 'Token has been expired or revoked. fake-refresh',
    }));
    expect(error.message).toContain('authorization is no longer valid');
    expect(error.message).toContain('invalid_grant');
    expect(error.message).toContain('knowledge-sync youtube auth login');
  });

  it.each(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED', 'ENOTFOUND', 'TimeoutError'])
  ('preserves %s transport context without requiring login and permits a later refresh', async (code) => {
    const transport = code === 'TimeoutError' ? new DOMException('Timed out', 'TimeoutError')
      : Object.assign(new Error('fake-refresh transport failure'), { code });
    const original = refreshError(undefined, undefined, transport);
    const { error, provider, request, store } = await failedRefresh(original);
    expect(error.message).toContain(code);
    expect(error.message).toContain('Check connectivity and retry later');
    expect(error.message).not.toMatch(/expired|no longer valid|auth login/);
    expect((error.cause as gaxios.GaxiosError).cause).toBe(transport);
    request.mockResolvedValue({ data: { access_token: 'fake-recovered', expires_in: 3600 } } as never);
    expect(await provider()).toBe('fake-recovered');
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
    expect(store.deleteRefreshToken).not.toHaveBeenCalled();
  });

  it('recognizes a transport code nested under a fetch error', async () => {
    const transport = Object.assign(new Error('DNS lookup failed'), { code: 'EAI_AGAIN' });
    const original = refreshError(undefined, undefined, new TypeError('fetch failed', { cause: transport }));
    const { error } = await failedRefresh(original);
    expect(error.message).toContain('network/transport error (EAI_AGAIN)');
    expect(error.message).not.toContain('auth login');
  });

  it.each([500, 503, 429, 408])('reports HTTP %s as transient with status and retry guidance', async (status) => {
    const { error } = await failedRefresh(refreshError(status, 'fake-secret server response'));
    expect(error.message).toContain(`HTTP ${status}`);
    expect(error.message).toContain('Retry later');
    expect(error.message).not.toMatch(/expired|no longer valid|auth login/);
  });

  it.each(['server_error', 'temporarily_unavailable'])('recognizes OAuth %s as transient', async (code) => {
    const { error } = await failedRefresh(refreshError(400, { error: code }));
    expect(error.message).toContain(code);
    expect(error.message).toContain('Retry later');
    expect(error.message).not.toContain('auth login');
  });

  it('preserves other OAuth codes without blaming the refresh token', async () => {
    const { error } = await failedRefresh(refreshError(401, { error: 'invalid_client' }));
    expect(error.message).toContain('HTTP 401, invalid_client');
    expect(error.message).toContain('Google OAuth configuration');
    expect(error.message).not.toMatch(/invalid_grant|expired|no longer valid|auth login/);
  });

  it.each([
    new Error('fake-refresh https://example.invalid/?client_secret=fake-secret'),
    refreshError(400, { error: 'fake-secret unknown OAuth error' }),
    null,
  ])('preserves unclassified failures as causes without exposing raw messages or recommending login', async (original) => {
    const { error } = await failedRefresh(original);
    expect(error.message).toContain('access-token refresh failed');
    expect(error.message).not.toMatch(/invalid_grant|expired|no longer valid|auth login/);
  });

  it('rejects a blank access token', async () => {
    const client = new OAuth2Client();
    client.getAccessToken = vi.fn(async () => ({ token: ' ' }));
    await expect(createAccessTokenProvider(config, memoryStore(), () => client)()).rejects.toThrow('no access token');
  });
});
