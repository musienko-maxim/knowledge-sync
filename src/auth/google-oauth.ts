import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { GoogleAuthError, loginInstruction, type GoogleClientConfig } from './google-client-config.js';
import type { TokenStore } from './token-store.js';

export const youtubeReadonlyScope = 'https://www.googleapis.com/auth/youtube.readonly';
type ClientFactory = (config: GoogleClientConfig) => OAuth2Client;
const createClient: ClientFactory = (config) => new OAuth2Client({
  clientId: config.client_id, clientSecret: config.client_secret,
  transporterOptions: { timeout: 30_000, retry: false },
});

interface LoginOptions {
  callbackTimeoutMs?: number;
  createClient?: ClientFactory;
  createServer?: () => Server;
}

export class GoogleOAuth {
  constructor(
    private readonly config: GoogleClientConfig,
    private readonly store: TokenStore,
    private readonly options: LoginOptions = {},
  ) {}

  async login(showConsentUrl: (url: string) => void): Promise<void> {
    const client = (this.options.createClient ?? createClient)(this.config);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const server = (this.options.createServer ?? createServer)();
    let timer: NodeJS.Timeout | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', () => reject(new GoogleAuthError('Cannot start the Google OAuth loopback listener on 127.0.0.1.')));
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new GoogleAuthError('Cannot determine the OAuth callback port.');
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;

      await new Promise<void>((resolve, reject) => {
        let claimed = false;
        let settled = false;
        const finish = (error?: GoogleAuthError, response?: ServerResponse) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const settle = () => error ? reject(error) : resolve();
          if (!response || response.destroyed) { settle(); return; }
          response.writeHead(error ? 400 : 200, {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'", Connection: 'close',
          });
          response.end(`<html><body><p>Authorization ${error ? 'failed. Check the terminal.' : 'succeeded.'} You may close this window.</p></body></html>`, settle);
          response.once('close', settle);
        };
        server.on('error', () => finish(new GoogleAuthError('Google OAuth callback listener failed. Try login again.')));
        server.on('request', (request, response) => {
          if (claimed || settled) { response.writeHead(409).end('Callback already handled.'); return; }
          claimed = true;
          clearTimeout(timer);
          void (async () => {
            const url = new URL(request.url ?? '/', redirectUri);
            if (request.method !== 'GET' || url.pathname !== '/oauth2/callback') {
              throw new GoogleAuthError('Invalid Google OAuth callback path or method. Try login again.');
            }
            const receivedState = url.searchParams.get('state') ?? '';
            if (url.searchParams.getAll('state').length !== 1
              || Buffer.byteLength(receivedState) !== Buffer.byteLength(state)
              || !timingSafeEqual(Buffer.from(receivedState), Buffer.from(state))) {
              throw new GoogleAuthError('Google OAuth callback state is missing or mismatched. Try login again.');
            }
            if (url.searchParams.has('error')) throw new GoogleAuthError('Google OAuth consent was denied or failed. Try login again.');
            const code = url.searchParams.get('code');
            if (!code?.trim() || url.searchParams.getAll('code').length !== 1) {
              throw new GoogleAuthError('Google OAuth callback has no valid authorization code. Try login again.');
            }
            let refreshToken: string | null | undefined;
            try {
              const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: redirectUri });
              refreshToken = tokens.refresh_token;
            } catch {
              throw new GoogleAuthError('Google OAuth code exchange failed. Try login again.');
            }
            if (!refreshToken?.trim()) throw new GoogleAuthError('Google login returned no refresh token. Retry login and grant offline consent.');
            await this.store.saveRefreshToken(refreshToken);
            finish(undefined, response);
          })().catch((error: unknown) => finish(error instanceof GoogleAuthError
            ? error : new GoogleAuthError('Google OAuth login failed. Try login again.'), response));
        });
        timer = setTimeout(() => finish(new GoogleAuthError('Google OAuth callback timed out. Try login again.')),
          this.options.callbackTimeoutMs ?? 5 * 60_000);
        try {
          showConsentUrl(client.generateAuthUrl({
            response_type: 'code', redirect_uri: redirectUri, scope: youtubeReadonlyScope,
            access_type: 'offline', prompt: 'consent', state,
            code_challenge: challenge, code_challenge_method: CodeChallengeMethod.S256,
          }));
        } catch {
          finish(new GoogleAuthError('Could not display the Google consent URL. Try login again.'));
        }
      });
    } finally {
      clearTimeout(timer);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  }
}

function refreshFailure(cause: unknown): GoogleAuthError {
  // Gaxios exposes OAuth response data/status and wraps transport errors in cause.
  const failure = (cause !== null && typeof cause === 'object' ? cause : {}) as {
    response?: { status?: unknown; data?: unknown };
    status?: unknown;
  };
  const rawStatus = failure.response?.status ?? failure.status;
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus)
    && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  const data = failure.response?.data;
  const oauthCode = data !== null && typeof data === 'object' && 'error' in data ? data.error : undefined;
  // Only known codes and HTTP status enter CLI output; arbitrary messages/bodies
  // can contain credentials. Keep the full original error in cause for diagnosis.
  const knownCode = typeof oauthCode === 'string' && [
    'invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client',
    'invalid_scope', 'unsupported_grant_type', 'access_denied', 'server_error', 'temporarily_unavailable',
  ].includes(oauthCode) ? oauthCode : undefined;
  const details = [status ? `HTTP ${status}` : '', knownCode].filter(Boolean).join(', ');
  const context = details ? ` (${details})` : '';

  if ((status !== undefined && (status >= 500 || status === 429 || status === 408))
    || knownCode === 'server_error' || knownCode === 'temporarily_unavailable') {
    return new GoogleAuthError(`Google access-token refresh temporarily failed${context}. Retry later.`, { cause });
  }
  if (knownCode === 'invalid_grant') {
    return new GoogleAuthError(`Stored YouTube authorization is no longer valid${context}. ${loginInstruction}`, { cause });
  }
  const seen = new Set<object>();
  let transport: unknown = cause;
  while (transport !== null && typeof transport === 'object' && !seen.has(transport)) {
    seen.add(transport);
    const { code, cause: inner } = transport as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && [
      'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED',
      'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE', 'TimeoutError', 'AbortError',
    ].includes(code)) {
      return new GoogleAuthError(`YouTube access-token refresh failed due to a network/transport error (${code}). Check connectivity and retry later.`, { cause });
    }
    transport = inner;
  }
  return new GoogleAuthError(`YouTube access-token refresh failed${context}. Check connectivity and Google OAuth configuration.`, { cause });
}

/** The library caches access tokens in memory and refreshes them when necessary. */
export function createAccessTokenProvider(
  config: GoogleClientConfig,
  store: TokenStore,
  factory: ClientFactory = createClient,
): () => Promise<string> {
  let client: OAuth2Client | undefined;
  let replacement: string | undefined;
  return async () => {
    if (!client) {
      const refreshToken = await store.loadRefreshToken();
      if (!refreshToken) throw new GoogleAuthError(`No locally stored YouTube authorization. ${loginInstruction}`);
      client = factory(config);
      client.setCredentials({ refresh_token: refreshToken });
      client.on('tokens', (tokens) => {
        if (tokens.refresh_token?.trim()) replacement = tokens.refresh_token;
      });
    }
    let token: string | null | undefined;
    try { token = (await client.getAccessToken()).token; } catch (cause) {
      throw refreshFailure(cause);
    }
    if (!token?.trim()) throw new GoogleAuthError(`Google returned no access token. ${loginInstruction}`);
    if (replacement) {
      await store.saveRefreshToken(replacement);
      client.setCredentials({ ...client.credentials, refresh_token: replacement });
      replacement = undefined;
    }
    return token;
  };
}
