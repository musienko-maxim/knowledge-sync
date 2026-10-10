import { describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import type { YouTubeCommands } from '../src/cli/youtube.js';
import { SyncCommandError } from '../src/cli/youtube-sync.js';
import { YouTubeError } from '../src/collectors/youtube/youtube-error.js';
import type { NavigationExportOutcome } from '../src/outputs/obsidian/export-projection.js';

const completedNavigation = { status: 'completed' } as const;
const skippedNavigation = { status: 'skipped', reason: 'upstream-failure' } as const;

it('prints help without requiring configuration or opening storage', () => {
  let output = '';
  const program = createProgram().configureOutput({ writeOut: (text) => { output += text; } }).exitOverride();
  expect(() => program.parse(['--help'], { from: 'user' })).toThrow(expect.objectContaining({ exitCode: 0 }));
  expect(output).toContain('Usage: knowledge-sync');
  expect(output).toMatch(/manual YouTube playlist sync to\s+SQLite/);
});

it('starts with no arguments and rejects unimplemented commands', () => {
  let output = '';
  createProgram().configureOutput({ writeOut: (text) => { output += text; } }).parse([], { from: 'user' });
  expect(output).toContain('Usage: knowledge-sync');
  const program = createProgram().configureOutput({ writeErr: () => {} }).exitOverride();
  expect(() => program.parse(['sync'], { from: 'user' })).toThrow();
});

function setupCommands() {
  const commands = {
    login: vi.fn<YouTubeCommands['login']>().mockResolvedValue(undefined),
    status: vi.fn<YouTubeCommands['status']>().mockResolvedValue(undefined),
    logout: vi.fn<YouTubeCommands['logout']>().mockResolvedValue(undefined),
    playlists: vi.fn<YouTubeCommands['playlists']>().mockResolvedValue([{ id: 'PLone', title: 'One' }, { id: 'PLtwo', title: 'Two' }]),
    sync: vi.fn<YouTubeCommands['sync']>().mockResolvedValue({ membershipsRemoved: 0, processed: 42, new: 10, changed: 4, unchanged: 28 }),
    syncAll: vi.fn<YouTubeCommands['syncAll']>().mockResolvedValue({
      membershipsRemoved: 0,
      playlists: { discovered: 2, succeeded: 2, failed: 0, unattempted: 0 },
      items: { processed: 4, new: 3, changed: 1, unchanged: 0 },
      failures: [], export: { status: 'not-requested' },
    }),
    syncObsidian: vi.fn<YouTubeCommands['syncObsidian']>().mockResolvedValue({
      navigation: completedNavigation,
      collections: { status: 'completed', result: { processed: 1, succeeded: 1, failed: 0, failures: [] } },
      sync: { membershipsRemoved: 0, processed: 3, new: 1, changed: 1, unchanged: 1 },
      export: { processed: 5, succeeded: 5, failed: 0, failures: [] },
    }),
  };
  let output = '';
  let errors = '';
  const outputOptions = {
    writeOut: (text) => { output += text; }, writeErr: (text) => { errors += text; },
  } satisfies import('commander').OutputConfiguration;
  const program = createProgram(commands);
  const configure = (command: import('commander').Command) => {
    command.configureOutput(outputOptions).exitOverride();
    command.commands.forEach(configure);
  };
  configure(program);
  return { commands, program, output: () => output, errors: () => errors };
}

describe('account sync CLI', () => {
  it.each(['snapshot', 'batch'] as const)('prints skipped navigation after an earlier %s failure', async (stage) => {
    const { commands, program, output, errors } = setupCommands();
    const base = await commands.syncAll({});
    commands.syncAll.mockResolvedValue({ ...base,
      export: { status: 'failed', stage, error: undefined, navigation: skippedNavigation },
    });
    await expect(program.parseAsync(['youtube', 'sync-all', '--vault', 'vault'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.account-sync' });
    expect(output()).toBe('Playlists: discovered=2 succeeded=2 failed=0 unattempted=0\nItems: processed=4 new=3 changed=1 unchanged=0\nMemberships: removed=0\nNavigation: skipped (earlier export failure)\n');
    expect(errors()).not.toContain('YouTube command failed');
  });
  it.each([false, true])('fails for collection output while retaining item counters (unexpected=%s)', async (unexpected) => {
    const { commands, program, output, errors } = setupCommands();
    const result = { processed: 2, succeeded: 2, failed: 0, failures: [] };
    commands.syncAll.mockResolvedValue({
      membershipsRemoved: 0,
      playlists: { discovered: 1, succeeded: 1, failed: 0, unattempted: 0 },
      items: { processed: 2, new: 2, changed: 0, unchanged: 0 }, failures: [],
      export: unexpected ? { status: 'failed', stage: 'collections', result, error: undefined, navigation: skippedNavigation } : {
        status: 'completed', result, navigation: completedNavigation, collections: { status: 'completed', result: {
          processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0,
            collection: { source: 'youtube', sourceId: 'PLone', title: 'Private title' }, error: new Error('fake-secret') }],
        } },
      },
    });
    await expect(program.parseAsync(['youtube', 'sync-all', '--vault', 'vault'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.account-sync' });
    expect(output()).toContain('Export: attempted=2 succeeded=2 failed=0');
    expect(output()).toContain('Playlists: discovered=1 succeeded=1 failed=0');
    if (unexpected) expect(errors()).toContain('collection batch export failed');
    else {
      expect(output()).toContain('Collections: attempted=1 succeeded=0 failed=1');
      expect(errors()).toContain('sourceId="PLone"');
    }
    expect(errors()).not.toMatch(/fake-secret|Private title|YouTube command failed/);
  });

  it('prints help without running setup', async () => {
    const { commands, program, output } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync-all', '--help'], { from: 'user' })).rejects.toMatchObject({ exitCode: 0 });
    expect(output()).toContain('--vault');
    expect(output()).toContain('--db');
    expect(output()).not.toContain('--auth');
    for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
  });

  it.each([[], ['--db', 'items.sqlite', '--vault', 'chosen vault']])
  ('passes only explicit account options and prints a summary (%j)', async (...args: string[]) => {
    const { commands, program, output, errors } = setupCommands();
    await program.parseAsync(['youtube', 'sync-all', ...args], { from: 'user' });
    expect(commands.syncAll).toHaveBeenCalledExactlyOnceWith(args.length ? { db: 'items.sqlite', vault: 'chosen vault' } : {});
    expect(output()).toContain('Playlists: discovered=2 succeeded=2 failed=0 unattempted=0');
    expect(output()).toContain('Items: processed=4 new=3 changed=1 unchanged=0');
    expect(errors()).toBe('');
    expect(output()).not.toContain('Navigation:');
  });

  it.each([['--auth', 'oauth'], ['--auth', 'api-key'], ['PL123'], ['--db'], ['--vault']])
  ('rejects unsupported/malformed arguments (%j)', async (...args: string[]) => {
    const { commands, program } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync-all', ...args], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
    expect(commands.syncAll).not.toHaveBeenCalled();
  });

  it('keeps playlist and unexpected export failures observable and escapes metadata', async () => {
    const { commands, program, output, errors } = setupCommands();
    commands.syncAll.mockResolvedValue({
      membershipsRemoved: 0,
      playlists: { discovered: 2, succeeded: 1, failed: 1, unattempted: 0 },
      items: { processed: 1, new: 1, changed: 0, unchanged: 0 },
      failures: [{ playlistId: 'PLbad', playlistTitle: 'bad\n\u001b[31m\u202e', error: new Error('fake-secret') }],
      export: { status: 'failed', stage: 'snapshot', error: { detail: 'fake-secret' }, navigation: skippedNavigation },
    });
    await expect(program.parseAsync(['youtube', 'sync-all', '--vault', 'vault'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.account-sync' });
    expect(output()).toContain('succeeded=1 failed=1');
    expect(errors()).toContain('Playlist failed');
    expect(errors()).toContain('snapshot');
    expect(errors()).toContain('bad\\n\\u001b[31m\\u202e');
    expect(errors()).not.toMatch(/fake-secret|\u001b|\u202e|YouTube command failed/);
    expect(errors().match(/Account synchronization incomplete/g)).toHaveLength(1);
  });

  it('reports partial export diagnostics with a nonzero result even if playlists succeeded', async () => {
    const { commands, program, errors, output } = setupCommands();
    commands.syncAll.mockResolvedValue({
      membershipsRemoved: 0,
      playlists: { discovered: 0, succeeded: 0, failed: 0, unattempted: 0 },
      items: { processed: 0, new: 0, changed: 0, unchanged: 0 }, failures: [],
      export: { status: 'completed', navigation: completedNavigation, result: { processed: 1, succeeded: 0, failed: 1, failures: [{
        index: 0, item: { source: 'other', sourceId: 'old', title: 'Old', url: 'https://example.com' }, error: new Error('fake-secret'),
      }] } },
    });
    await expect(program.parseAsync(['youtube', 'sync-all', '--vault', 'vault'], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
    expect(output()).toContain('Export: attempted=1 succeeded=0 failed=1');
    expect(errors()).toContain('Export failed at index 0');
    expect(errors()).not.toContain('fake-secret');
  });

  it('prints a late fatal failure and unattempted count while hiding unknown details', async () => {
    const { commands, program, errors, output } = setupCommands();
    commands.syncAll.mockResolvedValue({
      membershipsRemoved: 0,
      playlists: { discovered: 3, succeeded: 1, failed: 1, unattempted: 1 },
      items: { processed: 1, new: 1, changed: 0, unchanged: 0 },
      failures: [{ playlistId: 'PLbad', error: undefined }],
      fatal: { stage: 'playlist', error: undefined }, export: { status: 'skipped', navigation: skippedNavigation },
    });
    await expect(program.parseAsync(['youtube', 'sync-all'], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
    expect(output()).toContain('unattempted=1');
    expect(errors()).toContain('Account sync stopped during playlist');
    expect(errors()).toContain('Obsidian export skipped');
    expect(output()).toContain('Navigation: skipped (earlier export failure)\n');
  });
});

describe('navigation CLI outcomes', () => {
  const outcomes: NavigationExportOutcome[] = [
    { status: 'completed' },
    { status: 'skipped', reason: 'empty-snapshot' },
    { status: 'failed', stage: 'render', error: undefined },
    { status: 'failed', stage: 'write', error: new Error('fake-secret C:\\private\\vault') },
  ];
  for (const command of ['sync-all', 'sync-obsidian'] as const) {
    it.each(outcomes)(`${command} reports navigation $status $stage and preserves existing summaries`, async (navigation) => {
      const { commands, program, output, errors } = setupCommands();
      const collections = { status: 'completed' as const, result: { processed: 1, succeeded: 1, failed: 0, failures: [] } };
      if (command === 'sync-all') {
        const base = await commands.syncAll({});
        commands.syncAll.mockResolvedValue({ ...base, export: {
          status: 'completed', result: { processed: 5, succeeded: 5, failed: 0, failures: [] }, collections, navigation,
        } });
      } else {
        const base = await commands.syncObsidian('PLone', { auth: 'api-key' });
        commands.syncObsidian.mockResolvedValue({ ...base, navigation });
      }
      const running = program.parseAsync(['youtube', command, ...(command === 'sync-obsidian' ? ['PLone'] : []), '--vault', 'vault'], { from: 'user' });
      if (navigation.status === 'failed') {
        await expect(running).rejects.toMatchObject({ exitCode: 1,
          code: command === 'sync-all' ? 'knowledge-sync.account-sync' : 'knowledge-sync.obsidian-export' });
        expect(output()).toContain('Navigation: succeeded=0 failed=1\n');
        expect(errors().match(/incomplete;/g)).toHaveLength(1);
        expect(errors()).toContain(navigation.stage === 'render' ? 'Navigation rendering failed.' : 'Navigation export failed.');
      } else {
        await running;
        expect(errors()).toBe('');
        expect(output()).toContain(navigation.status === 'completed' ? 'Navigation: succeeded=1 failed=0\n' : 'Navigation: skipped (empty snapshot)\n');
      }
      expect(output()).toContain('Export: attempted=5 succeeded=5 failed=0\nCollections: attempted=1 succeeded=1 failed=0\nNavigation:');
      expect(errors()).not.toMatch(/fake-secret|private|YouTube command failed/);
    });
  }
});

describe('YouTube CLI commands', () => {
  it.each([{ args: [] }, { args: ['--help'] }, { args: ['youtube', '--help'] }, { args: ['youtube', 'auth', '--help'] }, { args: ['youtube', 'sync', '--help'] }, { args: ['youtube', 'sync-obsidian', '--help'] }])
  ('initializes and prints help without executing any OAuth/file operations ($args)', async ({ args }) => {
    const { commands, program, output } = setupCommands();
    if (args.includes('--help')) {
      await expect(program.parseAsync(args, { from: 'user' })).rejects.toMatchObject({ exitCode: 0 });
    } else await program.parseAsync(args, { from: 'user' });
    expect(output()).toContain('Usage: knowledge-sync');
    for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
  });

  it('exposes the required command tree', () => {
    const { program } = setupCommands();
    const youtube = program.commands.find((command) => command.name() === 'youtube')!;
    expect(youtube.commands.map((command) => command.name())).toEqual(['auth', 'playlists', 'sync', 'sync-obsidian', 'sync-all']);
    expect(youtube.commands[0]!.commands.map((command) => command.name())).toEqual(['login', 'status', 'logout']);
  });

  it.each([
    { args: ['PLone'], playlist: 'PLone', options: { auth: 'api-key' } },
    { args: ['PLone', '--auth', 'api-key'], playlist: 'PLone', options: { auth: 'api-key' } },
    { args: ['https://www.youtube.com/playlist?list=PLone', '--auth', 'oauth', '--db', 'my data/items.sqlite'],
      playlist: 'https://www.youtube.com/playlist?list=PLone', options: { auth: 'oauth', db: 'my data/items.sqlite' } },
  ])('routes sync input/options and prints only the processed count ($args)', async ({ args, playlist, options }) => {
    const { program, commands, output, errors } = setupCommands();
    await program.parseAsync(['youtube', 'sync', ...args], { from: 'user' });
    expect(commands.sync).toHaveBeenCalledExactlyOnceWith(playlist, options);
    expect(output()).toBe('Processed 42 items.\nMemberships: removed=0\n');
    expect(errors()).toBe('');
    expect(commands.playlists).not.toHaveBeenCalled();
    expect(commands.login).not.toHaveBeenCalled();
  });

  it.each([
    [], ['PLone', 'PLtwo'], ['PLone', '--auth', 'automatic'],
    ['PLone', '--auth'], ['PLone', '--db'], ['PLone', '--api-key', 'fake-secret'],
  ])('rejects invalid sync arguments before execution (%j)', async (...args) => {
    const { program, commands } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync', ...args], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(commands.sync).not.toHaveBeenCalled();
  });

  it('does not print success or expose arbitrary sync errors', async () => {
    const { program, commands, output, errors } = setupCommands();
    commands.sync.mockRejectedValue(new Error('fake-access fake-client-secret'));
    await expect(program.parseAsync(['youtube', 'sync', 'PLone'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(output()).toBe('');
    expect(errors()).toContain('YouTube command failed');
    expect(errors()).not.toContain('fake-');
  });

  it('prints the consent URL and a token-free login success message', async () => {
    const { commands, program, output } = setupCommands();
    commands.login.mockImplementation(async (showUrl) => { showUrl('https://accounts.google.com/consent'); });
    await program.parseAsync(['youtube', 'auth', 'login'], { from: 'user' });
    expect(output()).toContain('https://accounts.google.com/consent');
    expect(output()).toContain('authorization saved locally');
    expect(commands.login).toHaveBeenCalledTimes(1);
  });

  it('reports valid authorization', async () => {
    const { program, output } = setupCommands();
    await program.parseAsync(['youtube', 'auth', 'status'], { from: 'user' });
    expect(output()).toContain('authorization is valid');
  });

  it.each([
    'Google Desktop credentials file is missing.',
    'Invalid Google credentials: expected an installed Desktop app.',
    'No locally stored YouTube authorization. Run `knowledge-sync youtube auth login`.',
    'Stored YouTube authorization is no longer valid (HTTP 400, invalid_grant). Run `knowledge-sync youtube auth login`.',
    'YouTube access-token refresh failed due to a network/transport error (EAI_AGAIN). Check connectivity and retry later.',
    'Google access-token refresh temporarily failed (HTTP 503). Retry later.',
  ])('reports non-zero status safely: %s', async (message) => {
    const { commands, program, errors } = setupCommands();
    commands.status.mockRejectedValue(new GoogleAuthError(message, { cause: new Error('fake-refresh fake-client-secret') }));
    await expect(program.parseAsync(['youtube', 'auth', 'status'], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
    expect(errors()).toContain(message);
    expect(errors()).not.toContain('fake-');
  });

  it.each(['login', 'logout'])('returns a failure exit code for failed %s without exposing lower-level errors', async (command) => {
    const { commands, program, errors } = setupCommands();
    commands[command as 'login' | 'logout'].mockRejectedValue(new Error('fake-refresh fake-client-secret'));
    await expect(program.parseAsync(['youtube', 'auth', command], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
    expect(errors()).toContain('YouTube command failed');
    expect(errors()).not.toContain('fake-');
  });

  it('reports local-only logout and succeeds repeatedly', async () => {
    const { program, commands, output } = setupCommands();
    await program.parseAsync(['youtube', 'auth', 'logout'], { from: 'user' });
    await program.parseAsync(['youtube', 'auth', 'logout'], { from: 'user' });
    expect(commands.logout).toHaveBeenCalledTimes(2);
    expect(output()).toContain('Local logout complete. Google authorization has not been revoked.');
  });

  it('prints all playlist IDs and titles in API order without invoking collection or auth commands', async () => {
    const { program, commands, output } = setupCommands();
    await program.parseAsync(['youtube', 'playlists'], { from: 'user' });
    expect(output()).toBe('PLone\tOne\nPLtwo\tTwo\n');
    expect(commands.login).not.toHaveBeenCalled();
    expect(commands.status).not.toHaveBeenCalled();
    expect(commands.logout).not.toHaveBeenCalled();
  });
});

describe('YouTube sync-obsidian CLI', () => {
  it.each([false, true])('fails for collection-only errors with safe diagnostics (unexpected=%s)', async (unexpected) => {
    const { commands, program, output, errors } = setupCommands();
    commands.syncObsidian.mockResolvedValue({
      navigation: unexpected ? skippedNavigation : completedNavigation,
      sync: { membershipsRemoved: 0, processed: 0, new: 0, changed: 0, unchanged: 0 },
      export: { processed: 0, succeeded: 0, failed: 0, failures: [] },
      collections: unexpected ? { status: 'failed', error: undefined } : { status: 'completed', result: {
        processed: 1, succeeded: 0, failed: 1, failures: [{ index: 0,
          collection: { source: 'youtube', sourceId: 'PL\n\u001b\u202e', title: 'Private title' }, error: new Error('fake-secret') }],
      } },
    });
    await expect(program.parseAsync(['youtube', 'sync-obsidian', 'PLone'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
    expect(output()).toContain('Export: attempted=0 succeeded=0 failed=0');
    if (unexpected) expect(errors()).toContain('collection batch export failed');
    else {
      expect(output()).toContain('Collections: attempted=1 succeeded=0 failed=1');
      expect(errors()).toContain('PL\\n\\u001b\\u202e');
    }
    expect(errors()).not.toMatch(/fake-secret|Private title|\u001b|\u202e|YouTube command failed/);
  });

  it('documents options, the auth default, and export of all persisted items in help', async () => {
    const { program, output } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync-obsidian', '--help'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 0 });
    expect(output()).toContain('sync-obsidian [options] <playlist>');
    expect(output()).toContain('all persisted items');
    expect(output()).toContain('--auth <mode>');
    expect(output()).toMatch(/default:\s+"api-key"/);
    expect(output()).toContain('--db <path>');
    expect(output()).toContain('--vault <path>');
    expect(output()).toContain('OBSIDIAN_VAULT_PATH');
  });

  it.each([
    { args: ['PLone'], playlist: 'PLone', options: { auth: 'api-key' } },
    { args: ['PLone', '--auth', 'api-key', '--vault', ' vault '], playlist: 'PLone', options: { auth: 'api-key', vault: ' vault ' } },
    { args: ['https://www.youtube.com/playlist?list=PLone', '--auth', 'oauth', '--db', 'db/items.sqlite', '--vault', 'notes'],
      playlist: 'https://www.youtube.com/playlist?list=PLone', options: { auth: 'oauth', db: 'db/items.sqlite', vault: 'notes' } },
  ])('delegates once and prints both independent sets of counters ($args)', async ({ args, playlist, options }) => {
    const { program, commands, output, errors } = setupCommands();
    await program.parseAsync(['youtube', 'sync-obsidian', ...args], { from: 'user' });
    expect(commands.syncObsidian).toHaveBeenCalledExactlyOnceWith(playlist, options);
    expect(commands.sync).not.toHaveBeenCalled();
    expect(output()).toBe('Sync: processed=3 new=1 changed=1 unchanged=1\nMemberships: removed=0\nExport: attempted=5 succeeded=5 failed=0\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=1 failed=0\n');
    expect(errors()).toBe('');
  });

  it.each([[], ['PLone', 'extra'], ['PLone', '--auth', 'apikey'], ['PLone', '--auth', 'automatic'],
    ['PLone', '--auth'], ['PLone', '--db'], ['PLone', '--vault']])('rejects invalid arguments %j before execution', async (...args) => {
    const { program, commands } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync-obsidian', ...args], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(commands.syncObsidian).not.toHaveBeenCalled();
  });

  it('prints escaped failed identities and safe reasons once, then exits without a false fatal diagnostic', async () => {
    const { program, commands, output, errors } = setupCommands();
    const item = Object.freeze({ source: 'other\n\u001b[31m', sourceId: 'a\"\u009b\u202e', title: 'secret-title', url: 'https://example.com' });
    const failure = Object.assign(new Error('fake-token path'), { code: 'EACCES', cause: new Error('fake-secret') });
    const result = Object.freeze({
      navigation: completedNavigation,
      collections: { status: 'completed' as const, result: { processed: 1, succeeded: 1, failed: 0, failures: [] } },
      sync: Object.freeze({ membershipsRemoved: 0, processed: 1, new: 1, changed: 0, unchanged: 0 }),
      export: Object.freeze({ processed: 2, succeeded: 1, failed: 1,
        failures: Object.freeze([Object.freeze({ index: 1, item, error: failure })]) }),
    });
    commands.syncObsidian.mockResolvedValue(result);
    await expect(program.parseAsync(['youtube', 'sync-obsidian', 'PLone'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.obsidian-export' });
    expect(output()).toBe('Sync: processed=1 new=1 changed=0 unchanged=0\nMemberships: removed=0\nExport: attempted=2 succeeded=1 failed=1\nCollections: attempted=1 succeeded=1 failed=0\nNavigation: succeeded=1 failed=0\n');
    expect(errors()).toContain('index 1 (source="other\\n\\u001b[31m", sourceId="a\\"\\u009b\\u202e")');
    expect(errors()).toContain('Permission denied while writing the note (EACCES).');
    expect(errors()).toContain('successful SQLite writes remain committed');
    expect(errors().match(/Export failed at index/g)).toHaveLength(1);
    expect(errors()).not.toMatch(/fake-|secret-title|YouTube command failed|\u001b|\u009b|\u202e/);
    expect(commands.syncObsidian).toHaveBeenCalledTimes(1);
    expect(result.export.failures[0]!.error).toBe(failure);
  });

  it.each([
    { error: Object.assign(new Error('secret path'), { code: 'ENOENT' }), expected: 'does not exist (ENOENT)' },
    { error: new Error('Vault path must be an existing directory.'), expected: 'Vault path must be an existing directory.' },
    { error: new Error('sourceId must contain well-formed Unicode.'), expected: 'sourceId must contain well-formed Unicode.' },
    { error: new Error('fake-token'), expected: 'Check the vault path, permissions, and item identity.' },
    { error: { code: 'fake-token', message: 'fake-secret' }, expected: 'Check the vault path, permissions, and item identity.' },
    { error: 'fake-token', expected: 'Check the vault path, permissions, and item identity.' },
    { error: null, expected: 'Check the vault path, permissions, and item identity.' },
    { error: undefined, expected: 'Check the vault path, permissions, and item identity.' },
  ])('reports safe diagnostics for captured errors: $expected', async ({ error, expected }) => {
    const { program, commands, errors } = setupCommands();
    commands.syncObsidian.mockResolvedValue({
      navigation: completedNavigation,
      collections: { status: 'completed', result: { processed: 1, succeeded: 1, failed: 0, failures: [] } },
      sync: { membershipsRemoved: 0, processed: 0, new: 0, changed: 0, unchanged: 0 },
      export: { processed: 1, succeeded: 0, failed: 1,
        failures: [{ index: 0, item: { source: 'example', sourceId: 'a', title: 'A', url: 'https://example.com' }, error }] },
    });
    await expect(program.parseAsync(['youtube', 'sync-obsidian', 'PLone'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(errors()).toContain(expected);
    expect(errors()).not.toMatch(/fake-|secret path|YouTube command failed/);
  });

  it.each([
    new GoogleAuthError('Run auth login.', { cause: new Error('fake-token') }),
    new SyncCommandError('Set --vault or OBSIDIAN_VAULT_PATH.'),
    new YouTubeError('YouTube request failed (HTTP 403).'),
    new Error('fake-secret'), undefined,
  ])('preserves safe fatal guidance and sanitizes arbitrary thrown values %j', async (error) => {
    const { program, commands, output, errors } = setupCommands();
    commands.syncObsidian.mockRejectedValue(error);
    await expect(program.parseAsync(['youtube', 'sync-obsidian', 'PLone'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1, code: 'knowledge-sync.youtube' });
    expect(output()).toBe('');
    expect(errors()).toContain(error instanceof GoogleAuthError || error instanceof SyncCommandError || error instanceof YouTubeError
      ? error.message : 'YouTube command failed');
    expect(errors()).not.toContain('fake-');
  });

  it('keeps --vault unavailable to ordinary sync', async () => {
    const { program, commands } = setupCommands();
    await expect(program.parseAsync(['youtube', 'sync', 'PLone', '--vault', 'notes'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(commands.sync).not.toHaveBeenCalled();
  });
});
