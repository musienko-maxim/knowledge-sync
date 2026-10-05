import type { ObsidianExportFailure } from '../outputs/obsidian/export-notes.js';

// Public diagnostics are fixed text; raw messages, paths, causes, and objects may contain secrets.
function reason(error: unknown): string {
  const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'ENOENT': return 'Vault or destination parent does not exist (ENOENT).';
    case 'EACCES': return 'Permission denied while writing the note (EACCES).';
    case 'EPERM': return 'Operation not permitted while writing the note (EPERM).';
    case 'EISDIR': return 'A directory occupies the note destination (EISDIR).';
    case 'ENOTDIR': return 'A path component is not a directory (ENOTDIR).';
    case 'ENAMETOOLONG': return 'The note path exceeds filesystem limits (ENAMETOOLONG).';
    case 'ENOSPC': return 'No space available for the note (ENOSPC).';
    case 'EROFS': return 'The destination filesystem is read-only (EROFS).';
    case 'EBUSY': return 'The note destination is busy (EBUSY).';
    case 'EIO': return 'Filesystem input/output failure (EIO).';
  }
  if (error instanceof Error) {
    // These are the existing writer/path-builder contract errors, containing no supplied values.
    switch (error.message) {
      case 'Vault path must not be blank.':
      case 'Vault path must be an existing directory.':
      case 'Note path must be a non-empty relative path within the vault.':
      case 'Note path must resolve below the vault root without escaping it.':
      case 'source must not be empty.':
      case 'sourceId must not be empty.':
      case 'source must contain well-formed Unicode.':
      case 'sourceId must contain well-formed Unicode.':
        return error.message;
    }
  }
  return 'Export failed. Check the vault path, permissions, and item identity.';
}

export function quoteDiagnosticValue(value: string): string {
  return JSON.stringify(value).replace(/[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** One line per failed snapshot entry, preserving the application's zero-based index. */
export function formatObsidianExportFailure(failure: ObsidianExportFailure): string {
  return `Export failed at index ${failure.index} (source=${quoteDiagnosticValue(failure.item.source)}, sourceId=${quoteDiagnosticValue(failure.item.sourceId)}): ${reason(failure.error)}`;
}
