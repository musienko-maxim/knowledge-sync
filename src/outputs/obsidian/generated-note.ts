import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';

export type GeneratedKind = 'item' | 'collection';
export interface GeneratedIdentity { readonly source: string; readonly sourceId: string }

export class GeneratedNoteError extends Error {
  constructor(public readonly code: 'invalid-content' | 'unowned-target' | 'modified-target' | 'identity-mismatch') {
    super(`Generated note verification failed: ${code}.`);
    this.name = 'GeneratedNoteError';
  }
}

function identityToken(kind: GeneratedKind, identity: GeneratedIdentity): string {
  return Buffer.from(JSON.stringify([kind, identity.source, identity.sourceId]), 'utf8').toString('base64url');
}

const marker = 'knowledge_sync: "generated-note-v1"\n';
const header = /^---\nknowledge_sync: "generated-note-v1"\nknowledge_sync_identity: "([A-Za-z0-9_-]+)"\nknowledge_sync_sha256: "([0-9a-f]{64})"\n/;

/** Hash every byte except the 64 ASCII hexadecimal bytes of the fingerprint value. */
function fingerprint(bytes: Buffer, offset: number): string {
  return createHash('sha256').update(bytes.subarray(0, offset)).update(bytes.subarray(offset + 64)).digest('hex');
}

/** Reserved metadata precedes ordinary frontmatter; identity is canonical JSON encoded as base64url. */
export function sealGeneratedMarkdown(kind: GeneratedKind, identity: GeneratedIdentity, markdown: string): string {
  const canonical = markdown.replace(/\r\n?/g, '\n');
  if (!canonical.startsWith('---\n')) throw new GeneratedNoteError('invalid-content');
  const prefix = `---\n${marker}knowledge_sync_identity: "${identityToken(kind, identity)}"\nknowledge_sync_sha256: "`;
  const document = `${prefix}${'0'.repeat(64)}"\n${canonical.slice(4)}`;
  const offset = Buffer.byteLength(prefix);
  const digest = fingerprint(Buffer.from(document, 'utf8'), offset);
  const sealed = `${prefix}${digest}${document.slice(prefix.length + 64)}`;
  verifyGeneratedNote(Buffer.from(sealed, 'utf8'), kind, identity);
  return sealed;
}

/** Existing bytes are never normalized: CRLF, BOM, invalid UTF-8 and edits are observable. */
export function verifyGeneratedNote(bytes: Buffer, kind: GeneratedKind, identity: GeneratedIdentity): void {
  if (!isUtf8(bytes)) throw new GeneratedNoteError('invalid-content');
  const text = bytes.toString('utf8');
  const match = header.exec(text);
  if (!match) throw new GeneratedNoteError('unowned-target');
  const end = text.indexOf('\n---\n', 3);
  if (end < match[0].length - 1) throw new GeneratedNoteError('invalid-content');
  // Accept only the exact v1 generated frontmatter grammar, not arbitrary YAML.
  // This rejects quoted/escaped keys, explicit YAML keys, aliases and duplicate fields
  // even when somebody supplies a newly computed (non-authenticating) fingerprint.
  const seen = new Set<string>();
  for (const line of text.slice(match[0].length, end).split('\n')) {
    const field = /^(source|sourceId|url|title|author|collection|publishedAt): (".*")$/.exec(line);
    if (!field || seen.has(field[1]!)) throw new GeneratedNoteError('invalid-content');
    seen.add(field[1]!);
    try { if (typeof JSON.parse(field[2]!) !== 'string') throw new Error(); }
    catch { throw new GeneratedNoteError('invalid-content'); }
  }
  if (match[1] !== identityToken(kind, identity)) throw new GeneratedNoteError('identity-mismatch');
  const offset = Buffer.byteLength(match[0].slice(0, match[0].lastIndexOf(match[2]!)), 'utf8');
  if (fingerprint(bytes, offset) !== match[2]) throw new GeneratedNoteError('modified-target');
}
