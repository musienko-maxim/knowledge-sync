import Database from 'better-sqlite3';
import { closeSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import type { KnowledgeSnapshot } from '../knowledge-snapshot.js';
import { readSqliteSnapshot } from './read-snapshot.js';

export type ReadonlySnapshotErrorCode = 'DATABASE_REQUIRED' | 'DATABASE_UNAVAILABLE'
  | 'UNSAFE_DATABASE_PATH' | 'INVALID_DATABASE_HEADER' | 'WAL_UNSUPPORTED'
  | 'JOURNAL_STATE_UNSUPPORTED' | 'DATABASE_INCOMPATIBLE';

/** Safe codes only: native SQLite/filesystem errors can contain private data. */
export class ReadonlySnapshotError extends Error {
  constructor(public readonly code: ReadonlySnapshotErrorCode) {
    super(`Read-only export unavailable: ${code}.`);
    this.name = 'ReadonlySnapshotError';
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function preflight(databasePath: string): string {
  if (!databasePath.trim() || databasePath === ':memory:') throw new ReadonlySnapshotError('DATABASE_REQUIRED');
  const path = resolve(databasePath);
  const root = parse(path).root;
  let current = root;
  for (const part of relative(root, dirname(path)).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new ReadonlySnapshotError('UNSAFE_DATABASE_PATH');
  }
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new ReadonlySnapshotError('UNSAFE_DATABASE_PATH');
  // Even empty/stale sidecars are refused: opening SQLite is not a repair step.
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { lstatSync(path + suffix); } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    throw new ReadonlySnapshotError(suffix === '-journal' ? 'JOURNAL_STATE_UNSUPPORTED' : 'WAL_UNSUPPORTED');
  }
  const header = Buffer.alloc(100);
  const fd = openSync(path, 'r');
  let length = 0;
  try {
    while (length < header.length) {
      const read = readSync(fd, header, length, header.length - length, length);
      if (!read) break;
      length += read;
    }
  } finally { closeSync(fd); }
  if (length !== header.length || !header.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) {
    throw new ReadonlySnapshotError('INVALID_DATABASE_HEADER');
  }
  if (header[18] === 2 || header[19] === 2) throw new ReadonlySnapshotError('WAL_UNSUPPORTED');
  if (header[18] !== 1 || header[19] !== 1) throw new ReadonlySnapshotError('INVALID_DATABASE_HEADER');
  return path;
}

/** No bootstrap, recovery, sidecar writes or disk-backed temporary tables. */
export function readReadonlyObsidianSnapshot(databasePath: string): KnowledgeSnapshot {
  let path: string;
  try { path = preflight(databasePath); } catch (error) {
    if (error instanceof ReadonlySnapshotError) throw error;
    throw new ReadonlySnapshotError('DATABASE_UNAVAILABLE');
  }
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(path, { readonly: true, fileMustExist: true });
    sqlite.pragma('temp_store = MEMORY');
    sqlite.pragma('query_only = ON');
    sqlite.pragma('trusted_schema = OFF');
    return readSqliteSnapshot(sqlite);
  } catch {
    throw new ReadonlySnapshotError('DATABASE_INCOMPATIBLE');
  } finally {
    try { sqlite?.close(); } catch { throw new ReadonlySnapshotError('DATABASE_INCOMPATIBLE'); }
  }
}
