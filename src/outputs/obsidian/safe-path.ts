import { lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep, win32 } from 'node:path';
import { assertWindowsPathComponent, portablePathKey } from './readable-path.js';

export class ExportPathError extends Error {
  constructor(public readonly code: 'unsafe-path' | 'path-too-long' | 'equivalent-path' | 'missing-vault') {
    super(`Export destination refused: ${code}.`);
    this.name = 'ExportPathError';
  }
}

export function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Conservative portable budget applies on Linux as well as Windows. */
export function validateAbsolutePath(path: string): void {
  if (path.length > 240) throw new ExportPathError('path-too-long');
  const root = parse(path).root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) assertWindowsPathComponent(component);
}

export function resolveExportTarget(vaultPath: string, relativePath: string): string {
  if (!vaultPath.trim() || !relativePath || relativePath.includes('\\') || isAbsolute(relativePath)
    || win32.parse(relativePath).root || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new ExportPathError('unsafe-path');
  }
  for (const component of relativePath.split('/')) assertWindowsPathComponent(component);
  const vault = resolve(vaultPath);
  const target = resolve(vault, relativePath);
  const below = relative(vault, target);
  if (!below || below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below)) throw new ExportPathError('unsafe-path');
  validateAbsolutePath(target);
  return target;
}

/** Check equivalent existing names even when the host filesystem is case-sensitive. */
async function rejectAlias(parent: string, component: string): Promise<void> {
  const key = portablePathKey(component);
  const names = await readdir(parent);
  if (names.some((name) => name !== component && portablePathKey(name) === key)) {
    throw new ExportPathError('equivalent-path');
  }
}

/** No following links, including vault ancestors. Missing generated directories may be created only by the writer. */
export async function inspectExportDirectories(vaultPath: string, targetDirectory: string, create = false): Promise<boolean> {
  if (!vaultPath.trim()) throw new ExportPathError('missing-vault');
  const vault = resolve(vaultPath);
  const path = resolve(targetDirectory);
  const below = relative(vault, path);
  if (below === '..' || below.startsWith(`..${sep}`) || isAbsolute(below)) throw new ExportPathError('unsafe-path');
  validateAbsolutePath(path);
  let current = parse(path).root;
  const rootInfo = await lstat(current);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new ExportPathError('unsafe-path');
  for (const component of relative(current, path).split(sep).filter(Boolean)) {
    // Only require exact casing below the selected vault: configured Windows drive/ancestor casing is not ownership.
    const parent = current;
    current = join(current, component);
    const fromVault = relative(vault, current);
    const generated = Boolean(fromVault) && fromVault !== '..' && !fromVault.startsWith(`..${sep}`) && !isAbsolute(fromVault);
    if (generated) await rejectAlias(parent, component);
    let info;
    try { info = await lstat(current); } catch (error) {
      if (!isMissing(error)) throw error;
      if (!generated) throw new ExportPathError('missing-vault');
      if (!create) return false;
      try { await mkdir(current); } catch (creationError) {
        if (!(typeof creationError === 'object' && creationError !== null && 'code' in creationError && creationError.code === 'EEXIST')) throw creationError;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new ExportPathError('unsafe-path');
  }
  return true;
}

export async function inspectExportTarget(vault: string, target: string): Promise<'absent' | 'file'> {
  if (!await inspectExportDirectories(vault, dirname(target))) return 'absent';
  await rejectAlias(dirname(target), parse(target).base);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new ExportPathError('unsafe-path');
    return 'file';
  } catch (error) {
    if (isMissing(error)) return 'absent';
    throw error;
  }
}

export function temporaryExportPath(target: string, kind: 'note' | 'navigation', id: string): string {
  const temporary = join(dirname(target), `.knowledge-sync-${kind}-${id}.tmp`);
  validateAbsolutePath(temporary);
  return temporary;
}
