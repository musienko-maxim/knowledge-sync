import { GoogleAuthError, googleConfigPaths, loadGoogleClientConfig } from '../auth/google-client-config.js';
import { createAccessTokenProvider, GoogleOAuth } from '../auth/google-oauth.js';
import { FileTokenStore } from '../auth/token-store.js';
import { YouTubeAccount } from '../collectors/youtube/youtube-account.js';
import { YouTubeApiClient, type YouTubePlaylistSummary } from '../collectors/youtube/youtube-client.js';

export interface YouTubeCommands {
  login(showConsentUrl: (url: string) => void): Promise<void>;
  status(): Promise<void>;
  logout(): Promise<void>;
  playlists(): Promise<YouTubePlaylistSummary[]>;
}

/** Configuration and token files are accessed only when a command is invoked. */
export const youtubeCommands: YouTubeCommands = {
  async login(showConsentUrl) {
    const paths = googleConfigPaths();
    const config = await loadGoogleClientConfig(paths.credentialsFile);
    await new GoogleOAuth(config, new FileTokenStore(paths.tokenFile)).login(showConsentUrl);
  },
  async status() {
    const config = await loadGoogleClientConfig();
    await createAccessTokenProvider(config, new FileTokenStore())();
  },
  async logout() { await new FileTokenStore().deleteRefreshToken(); },
  async playlists() {
    const config = await loadGoogleClientConfig();
    const getAccessToken = createAccessTokenProvider(config, new FileTokenStore());
    // Validate first so missing/malformed local authorization has a specific safe error.
    await getAccessToken();
    const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken });
    try { return await new YouTubeAccount(client).listMyPlaylists(); } catch (error) {
      // This concrete client and account service produce credential-safe errors.
      throw new GoogleAuthError(error instanceof Error ? error.message : 'Could not list owned YouTube playlists.');
    }
  },
};
