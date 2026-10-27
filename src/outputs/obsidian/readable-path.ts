import { createHash } from 'node:crypto';

export type GeneratedEntityKind = 'item' | 'collection';
export interface PathIdentity { readonly source: string; readonly sourceId: string }
export type PathSuffix = (kind: GeneratedEntityKind, identity: PathIdentity) => string;

/** Identity bytes are never normalized or replaced before hashing. */
export function validatePathIdentity(identity: PathIdentity): void {
  for (const field of ['source', 'sourceId'] as const) {
    const value = identity[field];
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must not be empty.`);
    if (/[\uD800-\uDFFF]/u.test(value)) throw new Error(`${field} must contain well-formed Unicode.`);
  }
}

export const readablePathSuffix: PathSuffix = (kind, identity) => {
  validatePathIdentity(identity);
  return createHash('sha256').update(JSON.stringify([
    'knowledge-sync-readable-path-v1', kind, identity.source, identity.sourceId,
  ]), 'utf8').digest('hex').slice(0, 32);
};

/** Conservative portable equivalence, intentionally stricter than some filesystems. */
export function portablePathKey(path: string): string {
  return path.normalize('NFC').toUpperCase().normalize('NFC');
}

export function assertWindowsPathComponent(component: string): void {
  if (!component || component === '.' || component === '..'
    || /[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(component)
    || /[ .]$/.test(component) || /[\uD800-\uDFFF]/u.test(component)
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$|clock\$) *(?:\.|$)/i.test(component)) {
    throw new Error('Unsafe Windows path component.');
  }
}

export function readableTitlePrefix(title: string, kind: GeneratedEntityKind): string {
  const cleaned = title.normalize('NFC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/(^|-)\p{M}+/gu, '$1')
    .replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  let prefix = '';
  let points = 0;
  let bytes = 0;
  // Grapheme segmentation is locale independent; no base/mark cluster is cut.
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(cleaned)) {
    const segmentPoints = [...segment].length;
    const segmentBytes = Buffer.byteLength(segment, 'utf8');
    if (points + segmentPoints > 80 || bytes + segmentBytes > 160) break;
    prefix += segment;
    points += segmentPoints;
    bytes += segmentBytes;
  }
  return prefix.replace(/-+$/g, '') || `untitled-${kind}`;
}

export function buildReadableFilename(
  kind: GeneratedEntityKind,
  entity: PathIdentity & { readonly title: string },
  suffixForIdentity: PathSuffix = readablePathSuffix,
): string {
  validatePathIdentity(entity);
  const suffix = suffixForIdentity(kind, entity);
  if (!/^[a-f0-9]{32}$/.test(suffix)) throw new Error('Invalid readable-path suffix.');
  const filename = `${readableTitlePrefix(entity.title, kind)}--${suffix}.md`;
  assertWindowsPathComponent(filename);
  return filename;
}
