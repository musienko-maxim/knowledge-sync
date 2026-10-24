import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

export class OwnedNoteWriteError extends Error {
  constructor(public readonly reason: 'unowned-target' | 'unsafe-path' | 'target-changed' | 'invalid-content') {
    super(`Owned note write refused: ${reason}.`);
    this.name = 'OwnedNoteWriteError';
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Check every ancestor, including configured vault ancestors; lstat detects Windows junctions. */
async function checkDirectories(path: string, createBelow?: string): Promise<void> {
  const root = parse(path).root;
  let current = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, component);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      const below = createBelow === undefined ? '' : relative(createBelow, current);
      if (!isMissing(error) || !below || below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below)) throw error;
      try { await mkdir(current); } catch (creationError) {
        if (!(typeof creationError === 'object' && creationError !== null && 'code' in creationError && creationError.code === 'EEXIST')) throw creationError;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new OwnedNoteWriteError('unsafe-path');
  }
}

/** Also used before the shared navigation writer for snapshots containing Facebook. */
export async function validateOwnedVaultPath(vaultPath: string): Promise<void> {
  if (!vaultPath.trim()) throw new Error('Vault path must not be blank.');
  await checkDirectories(resolve(vaultPath));
}

async function inspectTarget(path: string, prefix: string): Promise<'absent' | 'owned'> {
  let info;
  try { info = await lstat(path); } catch (error) {
    if (isMissing(error)) return 'absent';
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) throw new OwnedNoteWriteError('unsafe-path');
  const expected = Buffer.from(prefix, 'utf8');
  const buffer = Buffer.alloc(expected.length);
  const handle = await open(path, 'r');
  let length = 0;
  try {
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
  await handle.close();
  if (length !== expected.length || !buffer.equals(expected)) throw new OwnedNoteWriteError('unowned-target');
  return 'owned';
}

/**
 * One writer, no concurrent external filesystem edits. Rechecks reduce races but
 * are not an OS sandbox/lock. Never delete the canonical target to retry rename.
 */
export async function writeOwnedObsidianNote(vaultPath: string, relativePath: string, content: string, prefix: string): Promise<void> {
  if (!content.startsWith(prefix) || !prefix.startsWith('---\nknowledge_sync: ') || !prefix.endsWith('\n')) {
    throw new OwnedNoteWriteError('invalid-content');
  }
  if (!vaultPath.trim()) throw new Error('Vault path must not be blank.');
  if (!relativePath.trim() || parse(relativePath).root) throw new OwnedNoteWriteError('unsafe-path');
  const vault = resolve(vaultPath);
  const target = resolve(vault, relativePath);
  const below = relative(vault, target);
  if (!below || below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below)) throw new OwnedNoteWriteError('unsafe-path');
  await checkDirectories(vault);
  await checkDirectories(dirname(target), vault);
  const original = await inspectTarget(target, prefix);
  const temporary = join(dirname(target), `.knowledge-sync-owned-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(temporary, 'wx');
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.close();
    handle = undefined;
    await checkDirectories(dirname(target));
    const current = await inspectTarget(target, prefix);
    if (current !== original) throw new OwnedNoteWriteError('target-changed');
    await rename(temporary, target);
    created = false;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (created) await unlink(temporary).catch(() => {});
    throw error;
  }
}
