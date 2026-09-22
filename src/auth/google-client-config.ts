import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Only deliberately safe messages may cross the CLI error boundary. */
export class GoogleAuthError extends Error {}

export const loginInstruction = 'Run `knowledge-sync youtube auth login`.';

const configSchema = z.object({
  installed: z.object({ client_id: z.string().trim().min(1), client_secret: z.string().trim().min(1) }),
});
export type GoogleClientConfig = z.infer<typeof configSchema>['installed'];

export function googleConfigPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory = homedir(),
): { credentialsFile: string; tokenFile: string } {
  const base = platform === 'win32'
    ? env.APPDATA || join(homeDirectory, 'AppData', 'Roaming')
    : platform === 'darwin' ? join(homeDirectory, 'Library', 'Application Support')
    : env.XDG_CONFIG_HOME || join(homeDirectory, '.config');
  const directory = resolve(base, 'knowledge-sync');
  return {
    credentialsFile: resolve(env.KNOWLEDGE_SYNC_GOOGLE_CREDENTIALS_FILE || join(directory, 'google-client-secret.json')),
    tokenFile: join(directory, 'youtube-oauth.json'),
  };
}

// Resolve existing ancestors too, so a symlink cannot place secrets in the repository.
async function canonicalPath(path: string): Promise<string> {
  try { return await realpath(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonicalPath(parent), relative(parent, path));
  }
}

export async function requireExternalSecretPath(path: string): Promise<void> {
  try {
    const repository = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
    const target = await canonicalPath(resolve(path));
    const fromRepository = relative(repository, target);
    if (!fromRepository || (!fromRepository.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      && fromRepository !== '..' && !isAbsolute(fromRepository))) {
      throw new GoogleAuthError('Google credentials and tokens must be stored outside the repository.');
    }
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError('Cannot validate the external Google configuration location. Check file permissions.');
  }
}

export async function loadGoogleClientConfig(path = googleConfigPaths().credentialsFile): Promise<GoogleClientConfig> {
  await requireExternalSecretPath(path);
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new GoogleAuthError(missing
      ? 'Google Desktop credentials file is missing. Install it in the config directory or set KNOWLEDGE_SYNC_GOOGLE_CREDENTIALS_FILE.'
      : 'Google Desktop credentials file is unreadable. Check file permissions.');
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    throw new GoogleAuthError('Google Desktop credentials file contains invalid JSON. Download a new Desktop app client file.');
  }
  const parsed = configSchema.safeParse(data);
  if (!parsed.success) {
    throw new GoogleAuthError('Invalid Google credentials: expected an installed Desktop app with client_id and client_secret.');
  }
  return parsed.data.installed;
}
