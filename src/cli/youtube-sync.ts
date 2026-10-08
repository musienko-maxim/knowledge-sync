import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { syncCollection, type CollectionSyncResult } from '../application/sync-collection.js';
import { syncCollectionToObsidian, type SyncCollectionToObsidianResult } from '../application/sync-collection-to-obsidian.js';
import { loadGoogleClientConfig } from '../auth/google-client-config.js';
import { createAccessTokenProvider } from '../auth/google-oauth.js';
import { FileTokenStore } from '../auth/token-store.js';
import { YouTubeApiClient } from '../collectors/youtube/youtube-client.js';
import { YouTubeCollector } from '../collectors/youtube/youtube-collector.js';
import { openStorage } from '../storage/sqlite/storage.js';

export interface YouTubeSyncOptions {
  auth: 'api-key' | 'oauth';
  db?: string;
}

export interface YouTubeSyncObsidianOptions extends YouTubeSyncOptions {
  vault?: string;
}

/** Only deliberately safe configuration/storage diagnostics may be displayed. */
export class SyncCommandError extends Error {}

// Resolve existing ancestors so symlinks/junctions cannot route the DB into the vault.
async function canonicalPath(path: string): Promise<string> {
  try { return await realpath(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonicalPath(parent), relative(parent, path));
  }
}

export async function databasePath(
  override?: string,
  vault = process.env.OBSIDIAN_VAULT_PATH,
  vaultLabel = 'OBSIDIAN_VAULT_PATH',
): Promise<string> {
  const input = override ?? (process.env.DATABASE_PATH || './data/knowledge-sync.sqlite');
  if (!input.trim()) throw new SyncCommandError('Database path must not be blank. Set --db or DATABASE_PATH.');
  const path = resolve(input);
  if (vault?.trim()) {
    try {
      const fromVault = relative(await canonicalPath(resolve(vault)), await canonicalPath(path));
      if (!fromVault || (fromVault !== '..' && !fromVault.startsWith(`..${sep}`) && !isAbsolute(fromVault))) {
        throw new SyncCommandError(`The SQLite database must be outside ${vaultLabel}. Set --db or DATABASE_PATH.`);
      }
    } catch (cause) {
      if (cause instanceof SyncCommandError) throw cause;
      throw new SyncCommandError('Cannot validate the database location. Check database and vault paths and permissions.', { cause });
    }
  }
  return path;
}

async function createCollector(playlist: string, options: YouTubeSyncOptions): Promise<YouTubeCollector> {
  let client: YouTubeApiClient;
  if (options.auth === 'api-key') {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey?.trim()) throw new SyncCommandError('Set YOUTUBE_API_KEY in the process environment for --auth api-key.');
    client = new YouTubeApiClient({ kind: 'api-key', apiKey });
  } else {
    const config = await loadGoogleClientConfig();
    client = new YouTubeApiClient({ kind: 'oauth', getAccessToken: createAccessTokenProvider(config, new FileTokenStore()) });
  }
  // The collector constructor already delegates to the shared playlist parser.
  return new YouTubeCollector(client, playlist);
}

export function openDatabase(path: string): ReturnType<typeof openStorage> {
  try { return openStorage(path); } catch (cause) {
    throw new SyncCommandError('Cannot open the SQLite database. Check --db or DATABASE_PATH and directory permissions.', { cause });
  }
}

/** Concrete composition belongs here; sync remains independent of CLI/auth/SQLite. */
export async function syncYouTubePlaylist(playlist: string, options: YouTubeSyncOptions): Promise<CollectionSyncResult> {
  const collector = await createCollector(playlist, options);
  const path = await databasePath(options.db);
  const storage = openDatabase(path);
  try {
    return await syncCollection(collector, storage);
  } finally {
    storage.close();
  }
}

/** Resolve dependencies once; the application owns persistence and full-snapshot export. */
export async function syncYouTubePlaylistToObsidian(
  playlist: string,
  options: YouTubeSyncObsidianOptions,
): Promise<SyncCollectionToObsidianResult> {
  const vault = options.vault ?? process.env.OBSIDIAN_VAULT_PATH;
  if (!vault?.trim()) {
    throw new SyncCommandError('Set --vault or OBSIDIAN_VAULT_PATH to a nonblank Obsidian vault path.');
  }
  const collector = await createCollector(playlist, options);
  const path = await databasePath(options.db, vault, 'the selected Obsidian vault (--vault or OBSIDIAN_VAULT_PATH)');
  const storage = openDatabase(path);
  try {
    return await syncCollectionToObsidian(collector, storage, vault);
  } finally {
    storage.close();
  }
}
