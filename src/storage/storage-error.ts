const fatalCodes = ['SQLITE_FULL', 'SQLITE_IOERR', 'SQLITE_CORRUPT', 'SQLITE_NOTADB',
  'SQLITE_READONLY', 'SQLITE_CANTOPEN'];

/** Inspect structured SQLite codes through wrappers without trusting error messages. */
export function isFatalStorageError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const code: unknown = 'code' in current ? current.code : undefined;
    if (typeof code === 'string' && fatalCodes.some((fatal) => code === fatal || code.startsWith(`${fatal}_`))) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
