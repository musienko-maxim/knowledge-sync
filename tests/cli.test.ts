import { describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import { GoogleAuthError } from '../src/auth/google-client-config.js';
import type { YouTubeCommands } from '../src/cli/youtube.js';

it('prints help without requiring configuration or opening storage', () => {
  let output = '';
  const program = createProgram().configureOutput({ writeOut: (text) => { output += text; } }).exitOverride();
  expect(() => program.parse(['--help'], { from: 'user' })).toThrow(expect.objectContaining({ exitCode: 0 }));
  expect(output).toContain('Usage: knowledge-sync');
  expect(output).toMatch(/sync is not\s+implemented/);
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

describe('YouTube CLI commands', () => {
  it.each([{ args: [] }, { args: ['--help'] }, { args: ['youtube', '--help'] }, { args: ['youtube', 'auth', '--help'] }])
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
    expect(youtube.commands.map((command) => command.name())).toEqual(['auth', 'playlists']);
    expect(youtube.commands[0]!.commands.map((command) => command.name())).toEqual(['login', 'status', 'logout']);
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
