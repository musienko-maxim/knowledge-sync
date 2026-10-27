import { randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GeneratedNoteError, verifyGeneratedNote, type GeneratedIdentity, type GeneratedKind } from './generated-note.js';
import { inspectExportDirectories, inspectExportTarget, resolveExportTarget, temporaryExportPath } from './safe-path.js';

/** Single writer, no concurrent external edits. The recheck is not an OS lock. */
export async function writeGeneratedObsidianNote(
  vault: string, relativePath: string, content: string, kind: GeneratedKind, identity: GeneratedIdentity,
): Promise<void> {
  const expected = Buffer.from(content, 'utf8');
  verifyGeneratedNote(expected, kind, identity);
  const target = resolveExportTarget(vault, relativePath);
  const temporary = temporaryExportPath(target, 'note', randomUUID());
  const inspect = async (): Promise<Buffer | undefined> => {
    if (await inspectExportTarget(vault, target) === 'absent') return undefined;
    const bytes = await readFile(target);
    verifyGeneratedNote(bytes, kind, identity);
    return bytes;
  };
  const original = await inspect();
  if (original?.equals(expected)) return;
  await inspectExportDirectories(vault, dirname(target), true);
  let handle: FileHandle | undefined;
  let created = false;
  try {
    handle = await open(temporary, 'wx');
    created = true;
    await handle.writeFile(expected);
    await handle.close();
    handle = undefined;
    const current = await inspect();
    if (original === undefined ? current !== undefined : current === undefined || !original.equals(current)) {
      throw new GeneratedNoteError('modified-target');
    }
    await rename(temporary, target);
    created = false;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (created) await unlink(temporary).catch(() => {});
    throw error;
  }
}
