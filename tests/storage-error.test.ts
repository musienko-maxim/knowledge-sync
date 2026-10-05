import { expect, it } from 'vitest';
import { isFatalStorageError } from '../src/storage/storage-error.js';

it.each(['SQLITE_FULL', 'SQLITE_IOERR', 'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_READONLY', 'SQLITE_CANTOPEN',
  'SQLITE_IOERR_WRITE', 'SQLITE_CORRUPT_INDEX', 'SQLITE_READONLY_DIRECTORY', 'SQLITE_CANTOPEN_FULLPATH'])
('recognizes fatal structured SQLite code %s through error wrappers', (code) => {
  const underlying = Object.assign(new Error('Arbitrary private database message'), { code });
  expect(isFatalStorageError(new Error('Query failed', { cause: new Error('Wrapper', { cause: underlying }) }))).toBe(true);
});

it.each(['SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_FOREIGNKEY', 'SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_ERROR',
  'SQLITE_FULLER', 'SQLITE_IOERROR', 'sqlITE_FULL', '', 13, undefined])
('does not classify unrelated structured code %j as fatal', (code) => {
  expect(isFatalStorageError(Object.assign(new Error('SQLITE_FULL'), { code }))).toBe(false);
});

it.each([undefined, null, 'SQLITE_FULL', 13, false, {}, new Error('SQLITE_FULL: database full')])
('does not parse messages or crash on unknown thrown value %j', (error) => {
  expect(isFatalStorageError(error)).toBe(false);
});

it('supports plain coded objects and mixed wrapper chains', () => {
  expect(isFatalStorageError({ cause: new Error('Wrapper', { cause: { code: 'SQLITE_IOERR_READ' } }) })).toBe(true);
  expect(isFatalStorageError({ code: 'SQLITE_NOTADB' })).toBe(true);
});

it('terminates cyclic cause chains and still recognizes a fatal member', () => {
  const first = new Error('First');
  const second = { cause: first, code: 'SQLITE_CONSTRAINT' };
  first.cause = second;
  expect(isFatalStorageError(first)).toBe(false);
  second.code = 'SQLITE_READONLY';
  expect(isFatalStorageError(first)).toBe(true);
  const self = new Error('Self');
  self.cause = self;
  expect(isFatalStorageError(self)).toBe(false);
});
