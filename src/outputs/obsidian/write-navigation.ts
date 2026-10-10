import { randomUUID } from 'node:crypto';
import { lstat, open, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NAVIGATION_MARKER } from './navigation-markdown.js';

export const NAVIGATION_FILENAME = 'Knowledge Sync.md';

export type NavigationWriteFailureReason =
  | 'unowned-target'
  | 'non-regular-target'
  | 'symlink-target'
  | 'target-changed'
  | 'invalid-content';

export class NavigationWriteError extends Error {
  constructor(public readonly reason: NavigationWriteFailureReason) {
    super(`Navigation write refused: ${reason}.`);
    this.name = 'NavigationWriteError';
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function hasOwnershipMarker(path: string): Promise<boolean> {
  // Enough for one UTF-8 BOM, the exact marker, and a CRLF terminator.
  // Never read the entire user file just to establish ownership.
  const prefix = Buffer.alloc(Buffer.byteLength(NAVIGATION_MARKER, 'utf8') + 5);
  const handle = await open(path, 'r');
  let length = 0;
  try {
    while (length < prefix.length) {
      const { bytesRead } = await handle.read(prefix, length, prefix.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
  await handle.close();
  const text = prefix.subarray(0, length).toString('utf8').replace(/^\uFEFF/, '');
  return text === NAVIGATION_MARKER
    || text.startsWith(`${NAVIGATION_MARKER}\n`)
    || text.startsWith(`${NAVIGATION_MARKER}\r\n`);
}

async function inspectTarget(path: string): Promise<'absent' | 'owned'> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return 'absent';
    throw error;
  }
  if (info.isSymbolicLink()) throw new NavigationWriteError('symlink-target');
  if (!info.isFile()) throw new NavigationWriteError('non-regular-target');
  if (!await hasOwnershipMarker(path)) throw new NavigationWriteError('unowned-target');
  return 'owned';
}

/**
 * Prepares a complete sibling file before replacement. Assumes one writer and
 * no concurrent external edits: the final ownership recheck is not a lock and
 * cannot eliminate the race between checking and renaming. Abrupt termination
 * may leave an orphaned temporary file, which later runs deliberately preserve.
 */
export async function writeNavigationNote(vaultPath: string, content: string): Promise<void> {
  if (!content.startsWith(`${NAVIGATION_MARKER}\n`) || content.includes('\r') || !content.endsWith('\n')) {
    throw new NavigationWriteError('invalid-content');
  }
  if (!vaultPath.trim()) throw new Error('Vault path must not be blank.');
  const vault = resolve(vaultPath);
  if (!(await stat(vault)).isDirectory()) throw new Error('Vault path must be an existing directory.');

  const target = join(vault, NAVIGATION_FILENAME);
  const original = await inspectTarget(target);
  const temporary = join(vault, `.knowledge-sync-navigation-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(temporary, 'wx');
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.close();
    handle = undefined;

    let current;
    try {
      current = await inspectTarget(target);
    } catch (error) {
      if (error instanceof NavigationWriteError || isMissing(error)) {
        throw new NavigationWriteError('target-changed');
      }
      throw error;
    }
    if (current !== original) throw new NavigationWriteError('target-changed');
    await rename(temporary, target);
    created = false;
  } catch (error) {
    // Cleanup must never mask the original error, including rejection with undefined.
    if (handle) await handle.close().catch(() => {});
    if (created) await unlink(temporary).catch(() => {});
    throw error;
  }
}
