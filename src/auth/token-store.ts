import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { GoogleAuthError, googleConfigPaths, requireExternalSecretPath } from './google-client-config.js';

export interface TokenStore {
  loadRefreshToken(): Promise<string | null>;
  saveRefreshToken(token: string): Promise<void>;
  deleteRefreshToken(): Promise<boolean>;
}

const tokenSchema = z.object({ refresh_token: z.string().trim().min(1) }).strict();

export class FileTokenStore implements TokenStore {
  constructor(private readonly path = googleConfigPaths().tokenFile) {}

  async loadRefreshToken(): Promise<string | null> {
    await requireExternalSecretPath(this.path);
    let text: string;
    try { text = await readFile(this.path, 'utf8'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new GoogleAuthError('Local YouTube token file is unreadable. Check file permissions.');
    }
    try { return tokenSchema.parse(JSON.parse(text)).refresh_token; } catch {
      throw new GoogleAuthError('Local YouTube token file is malformed or contains a blank token. Run `knowledge-sync youtube auth login`.');
    }
  }

  async saveRefreshToken(token: string): Promise<void> {
    const parsed = tokenSchema.safeParse({ refresh_token: token });
    if (!parsed.success) throw new GoogleAuthError('Cannot save an empty YouTube refresh token.');
    await requireExternalSecretPath(this.path);
    const directory = dirname(this.path);
    const temporary = join(directory, `.youtube-oauth-${randomUUID()}.tmp`);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') await chmod(directory, 0o700);
      await writeFile(temporary, JSON.stringify(parsed.data) + '\n', { mode: 0o600, flag: 'wx', flush: true });
      await rename(temporary, this.path);
    } catch {
      throw new GoogleAuthError('Could not save the local YouTube refresh token. Check config directory permissions.');
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  async deleteRefreshToken(): Promise<boolean> {
    await requireExternalSecretPath(this.path);
    try { await unlink(this.path); return true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw new GoogleAuthError('Could not remove the local YouTube token. Check file permissions.');
    }
  }
}
