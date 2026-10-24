import {
  facebookImportFailure,
  importFacebook,
  type FacebookImportResult,
} from '../application/import-facebook.js';
import { FacebookImportError, readFacebookImport, type FacebookImport } from '../collectors/facebook/import.js';
import { databasePath, openDatabase } from './youtube-sync.js';

export interface FacebookImportOptions {
  file: string;
  db?: string;
  vault?: string;
}

/** Input validation precedes even opening SQLite. Only an explicit --vault requests output. */
export async function importFacebookFile(options: FacebookImportOptions): Promise<FacebookImportResult> {
  const exportRequested = options.vault !== undefined;
  let input: FacebookImport;
  try {
    input = await readFacebookImport(options.file);
  } catch (error) {
    return facebookImportFailure('input', error instanceof FacebookImportError ? error.code : 'INPUT_READ_FAILED', exportRequested);
  }

  let storage: ReturnType<typeof openDatabase>;
  try {
    if (exportRequested && !options.vault?.trim()) {
      return facebookImportFailure('database', 'VAULT_PATH_INVALID', exportRequested, input);
    }
    // Environment vault configuration still protects the database location in import-only mode.
    const path = await databasePath(options.db, options.vault ?? process.env.OBSIDIAN_VAULT_PATH,
      'the selected Obsidian vault');
    storage = openDatabase(path);
  } catch {
    return facebookImportFailure('database', 'DATABASE_SETUP_FAILED', exportRequested, input);
  }

  let result = facebookImportFailure('database', 'STORAGE_FAILED', exportRequested, input);
  try {
    result = await importFacebook(input, storage, options.vault);
  } catch {
    // The application retains ordinary partial failures. Unexpected exceptions still close SQLite.
  } finally {
    try {
      storage.close();
    } catch {
      result.failure ??= { stage: 'close', code: 'DATABASE_CLOSE_FAILED' };
    }
  }
  return result;
}
