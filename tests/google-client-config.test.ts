import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { googleConfigPaths, loadGoogleClientConfig } from '../src/auth/google-client-config.js';

const directories: string[] = [];
async function credentialFile(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-sync-config-'));
  directories.push(directory);
  const path = join(directory, 'client.json');
  await writeFile(path, contents);
  return path;
}
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('Google Desktop client configuration', () => {
  it('resolves platform defaults and a credentials override independently of token storage', () => {
    const home = resolve('test-home');
    expect(googleConfigPaths({}, 'linux', home)).toEqual({
      credentialsFile: join(home, '.config', 'knowledge-sync', 'google-client-secret.json'),
      tokenFile: join(home, '.config', 'knowledge-sync', 'youtube-oauth.json'),
    });
    expect(googleConfigPaths({ XDG_CONFIG_HOME: join(home, 'xdg') }, 'linux', home).tokenFile)
      .toBe(join(home, 'xdg', 'knowledge-sync', 'youtube-oauth.json'));
    expect(googleConfigPaths({}, 'darwin', home).tokenFile)
      .toBe(join(home, 'Library', 'Application Support', 'knowledge-sync', 'youtube-oauth.json'));
    expect(googleConfigPaths({ APPDATA: join(home, 'roaming') }, 'win32', home).tokenFile)
      .toBe(join(home, 'roaming', 'knowledge-sync', 'youtube-oauth.json'));
    const paths = googleConfigPaths({ KNOWLEDGE_SYNC_GOOGLE_CREDENTIALS_FILE: join(home, 'override.json') }, 'linux', home);
    expect(paths.credentialsFile).toBe(join(home, 'override.json'));
    expect(paths.tokenFile).toBe(join(home, '.config', 'knowledge-sync', 'youtube-oauth.json'));
  });

  it('loads installed credentials without using supplied endpoint URLs', async () => {
    const path = await credentialFile(JSON.stringify({ installed: {
      client_id: 'fake-client', client_secret: 'fake-secret', token_uri: 'https://untrusted.invalid',
    } }));
    expect(await loadGoogleClientConfig(path)).toEqual({ client_id: 'fake-client', client_secret: 'fake-secret' });
  });

  it.each([
    ['{fake-secret', 'invalid JSON'],
    [JSON.stringify({ web: { client_id: 'fake-client', client_secret: 'fake-secret' } }), 'expected an installed Desktop app'],
    [JSON.stringify({ installed: { client_id: 'fake-client' } }), 'client_id and client_secret'],
    [JSON.stringify({ installed: { client_id: ' ', client_secret: 'fake-secret' } }), 'client_id and client_secret'],
  ])('rejects malformed credentials safely', async (contents, message) => {
    const path = await credentialFile(contents);
    const error = await loadGoogleClientConfig(path).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).not.toContain('fake-secret');
    expect((error as Error).cause).toBeUndefined();
  });

  it('distinguishes missing and unreadable credentials', async () => {
    const path = await credentialFile('{}');
    await expect(loadGoogleClientConfig(path + '.missing')).rejects.toThrow('credentials file is missing');
    await expect(loadGoogleClientConfig(directories[0])).rejects.toThrow('credentials file is unreadable');
  });

  it('rejects credential paths within the repository before reading them', async () => {
    await expect(loadGoogleClientConfig(resolve('google-client-secret.json'))).rejects.toThrow('outside the repository');
  });
});
