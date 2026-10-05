import { stat } from 'node:fs/promises';
import { syncAccount, type AccountSyncResult } from '../application/sync-account.js';
import { loadGoogleClientConfig } from '../auth/google-client-config.js';
import { createAccessTokenProvider } from '../auth/google-oauth.js';
import { FileTokenStore } from '../auth/token-store.js';
import { createYouTubeAccountSource } from '../collectors/youtube/youtube-account-source.js';
import { YouTubeApiClient } from '../collectors/youtube/youtube-client.js';
import { databasePath, openDatabase, SyncCommandError } from './youtube-sync.js';

export interface YouTubeSyncAllOptions {
  db?: string;
  vault?: string;
}

/** OAuth-only setup; an explicit vault option is the sole export opt-in. */
export async function syncAllYouTubePlaylists(options: YouTubeSyncAllOptions): Promise<AccountSyncResult> {
  const vault = options.vault;
  if (vault !== undefined) {
    if (!vault.trim()) throw new SyncCommandError('The --vault path must not be blank.');
    try {
      if (!(await stat(vault)).isDirectory()) throw new Error('Not a directory');
    } catch (cause) {
      throw new SyncCommandError('The --vault path must be an existing directory. Check its path and permissions.', { cause });
    }
  }
  const path = vault === undefined
    ? await databasePath(options.db)
    : await databasePath(options.db, vault, 'the selected vault (--vault)');
  const config = await loadGoogleClientConfig();
  const getAccessToken = createAccessTokenProvider(config, new FileTokenStore());
  // Match playlist discovery's explicit authorization check before processing.
  await getAccessToken();
  const client = new YouTubeApiClient({ kind: 'oauth', getAccessToken });
  const storage = openDatabase(path);
  try {
    return await syncAccount(createYouTubeAccountSource(client), storage, vault);
  } finally {
    storage.close();
  }
}
