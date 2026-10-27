import { Buffer } from 'node:buffer';
import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import { assertWindowsPathComponent, buildReadableFilename, type PathSuffix } from './readable-path.js';

function escapeByte(byte: number): string {
  return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function encodeObsidianPathComponent(value: string, field: 'source' | 'sourceId'): string {
  if (value.length === 0) throw new Error(`${field} must not be empty.`);
  // In Unicode mode this matches lone surrogates, but not valid surrogate pairs.
  if (/[\uD800-\uDFFF]/u.test(value)) throw new Error(`${field} must contain well-formed Unicode.`);

  const bytes = Buffer.from(value, 'utf8');
  let suffixStart = bytes.length;
  while (suffixStart > 0 && (bytes[suffixStart - 1] === 32 || bytes[suffixStart - 1] === 46)) suffixStart--;

  let encoded = '';
  for (const [index, byte] of bytes.entries()) {
    const literal = (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57)
      || byte === 45 || byte === 95 || (index < suffixStart && (byte === 32 || byte === 46));
    encoded += literal ? String.fromCharCode(byte) : escapeByte(byte);
  }

  // Uppercase and superscript device names are already protected by byte encoding.
  // Lowercase device basenames remain reserved before extensions, even after spaces.
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]) *(?:\.|$)/.test(encoded)) {
    encoded = escapeByte(encoded.charCodeAt(0)) + encoded.slice(1);
  }
  return encoded;
}

/** Current readable title plus stable source-qualified identity discriminator. */
export function buildObsidianRelativePath(item: KnowledgeItem, suffixForIdentity?: PathSuffix): string {
  const directory = encodeObsidianPathComponent(item.source, 'source');
  assertWindowsPathComponent(directory);
  return `${directory}/${buildReadableFilename('item', item, suffixForIdentity)}`;
}
