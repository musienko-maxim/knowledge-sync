import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { KnowledgeItem } from '../../core/models/knowledge-item.js';
import type { KnowledgeCollection } from '../../core/models/knowledge-collection.js';
import type { CollectionMembership } from '../../core/models/collection-membership.js';

export const FACEBOOK_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, collections: 5_000,
  occurrences: 100_000, depth: 32, string: 65_536, collectionId: 128 });
export type FacebookConflictCode = 'TITLE_CONFLICT' | 'DESCRIPTION_CONFLICT' | 'AUTHOR_CONFLICT';
export type FacebookImportErrorCode = 'INPUT_READ_FAILED' | 'INPUT_TOO_LARGE' | 'INVALID_UTF8' |
  'INVALID_JSON' | 'INVALID_STRUCTURE' | 'INPUT_LIMIT_EXCEEDED' | 'INVALID_UNICODE' |
  'INVALID_COLLECTION_ID' | 'COLLECTION_NAME_CONFLICT' | 'INVALID_URL' | 'URL_MISMATCH';
export class FacebookImportError extends Error {
  constructor(readonly code: FacebookImportErrorCode) { super(code); this.name = 'FacebookImportError'; }
}
export interface FacebookItemCandidate { item: KnowledgeItem; conflicts: FacebookConflictCode[] }
export interface FacebookInputCounters {
  inputCollections: number; inputOccurrences: number; urlOccurrences: number;
  distinctItems: number; duplicateItemOccurrences: number; uniqueMemberships: number;
  repeatedMembershipOccurrences: number; skippedOccurrences: number;
}
export interface FacebookImport {
  collections: KnowledgeCollection[]; items: FacebookItemCandidate[];
  memberships: CollectionMembership[]; counters: FacebookInputCounters; warnings: FacebookConflictCode[];
}
const fail = (code: FacebookImportErrorCode): never => { throw new FacebookImportError(code); };
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_STRUCTURE');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) return fail('INVALID_STRUCTURE'); return value; }
function string(value: unknown): string { if (typeof value !== 'string') return fail('INVALID_STRUCTURE'); return value; }
const ordinal = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Only the observed, reversible UTF-8-as-Latin-1 Cyrillic variant is repaired. */
export function repairFacebookText(value: string): string {
  if (!/[ÐÑ]/u.test(value) || [...value].some(char => char.codePointAt(0)! > 255)) return value;
  try {
    const bytes = Buffer.from(value, 'latin1');
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/[\u0400-\u04ff]/u.test(repaired) || /[ÐÑ]/u.test(repaired) ||
      !Buffer.from(repaired, 'utf8').equals(bytes)) return value;
    return repaired;
  } catch { return value; }
}
function text(value: unknown): string { return repairFacebookText(string(value)).trim(); }
function label(entry: Record<string, unknown>, key = 'label'): string | undefined {
  const value = own(entry, key); return value === undefined ? undefined : repairFacebookText(string(value));
}

function validateStrings(value: unknown, depth = 0): void {
  if (depth > FACEBOOK_LIMITS.depth) fail('INPUT_LIMIT_EXCEEDED');
  if (typeof value === 'string') {
    if (value.length > FACEBOOK_LIMITS.string) fail('INPUT_LIMIT_EXCEEDED');
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_UNICODE');
      } else if (code >= 0xdc00 && code <= 0xdfff) fail('INVALID_UNICODE');
    }
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) { validateStrings(key, depth); validateStrings(nested, depth + 1); }
  }
}
// Reject excessive container nesting before JSON.parse allocates its object graph.
function validateDepth(input: string): void {
  let depth = 0, quoted = false, escaped = false;
  for (const char of input) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') { if (++depth > FACEBOOK_LIMITS.depth) fail('INPUT_LIMIT_EXCEEDED'); }
    else if (char === ']' || char === '}') depth--;
  }
}
function validatedUrl(value: unknown): string {
  const raw = string(value);
  if (!raw || raw.trim() !== raw || /[\u0000-\u0020\u007f]/u.test(raw)) fail('INVALID_URL');
  try { const parsed = new URL(raw); if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) fail('INVALID_URL'); }
  catch { fail('INVALID_URL'); }
  return raw;
}
export function facebookSourceId(url: string): string {
  return `url-v1-${createHash('sha256').update(url, 'utf8').digest('hex')}`;
}
export function facebookFallbackTitle(url: string): string {
  const parsed = new URL(url);
  let kind = 'Link';
  if (['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(parsed.hostname)) {
    const path = parsed.pathname;
    if (/^\/groups\/[^/]+\/posts\/[^/]+\/?$/u.test(path)) kind = 'Group post';
    else if (/^\/reel\/[^/]+\/?$/u.test(path)) kind = 'Reel';
    else if (/^\/[^/]+\/videos\/[^/]+\/?$/u.test(path) || /^\/watch\/?$/u.test(path) ||
      (path === '/video.php' && parsed.searchParams.has('v'))) kind = 'Video';
    else if (/^\/[^/]+\/posts\/[^/]+\/?$/u.test(path) ||
      (['/permalink.php', '/story.php'].includes(path) && parsed.searchParams.has('story_fbid'))) kind = 'Post';
  }
  return `Facebook Saved — ${kind} — ${facebookSourceId(url).slice(7, 19)}`;
}
type Fields = { title: Set<string>; description: Set<string>; author: Set<string> };
const codes = { title: 'TITLE_CONFLICT', description: 'DESCRIPTION_CONFLICT', author: 'AUTHOR_CONFLICT' } as const;
const fields = ['title', 'description', 'author'] as const;
function add(set: Set<string>, value: unknown): void { const clean = text(value); if (clean) set.add(clean); }

export function parseFacebookImport(input: string): FacebookImport {
  if (Buffer.byteLength(input, 'utf8') > FACEBOOK_LIMITS.bytes) fail('INPUT_TOO_LARGE');
  validateDepth(input);
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return fail('INVALID_JSON'); }
  validateStrings(parsed);
  const roots = array(parsed);
  if (roots.length > FACEBOOK_LIMITS.collections) fail('INPUT_LIMIT_EXCEEDED');
  const collections = new Map<string, Set<string>>();
  const items = new Map<string, { url: string; fields: Fields }>();
  const memberships = new Map<string, CollectionMembership>();
  const counters: FacebookInputCounters = { inputCollections: roots.length, inputOccurrences: 0, urlOccurrences: 0,
    distinctItems: 0, duplicateItemOccurrences: 0, uniqueMemberships: 0, repeatedMembershipOccurrences: 0, skippedOccurrences: 0 };
  for (const root of roots) {
    const collection = object(root), id = string(own(collection, 'fbid'));
    if (!/^[0-9]+$/u.test(id) || id.length > FACEBOOK_LIMITS.collectionId) fail('INVALID_COLLECTION_ID');
    const names = collections.get(id) ?? new Set<string>(); collections.set(id, names);
    const metadata = array(own(collection, 'label_values'));
    let savedSections = 0;
    let hasName = false;
    for (const rawEntry of metadata) {
      const entry = object(rawEntry);
      if (label(entry) === 'Назва') {
        const name = text(own(entry, 'value'));
        if (name) { names.add(name); hasName = true; }
      }
      if (label(entry, 'title') !== 'Збереження') continue;
      savedSections++;
      for (const rawSaved of array(own(entry, 'dict'))) {
        if (++counters.inputOccurrences > FACEBOOK_LIMITS.occurrences) fail('INPUT_LIMIT_EXCEEDED');
        const saved = object(rawSaved);
        const values: Fields = { title: new Set(), description: new Set(), author: new Set() };
        const urls = new Set<string>();
        for (const rawField of array(own(saved, 'dict'))) {
          const field = object(rawField), fieldLabel = label(field);
          if (fieldLabel === 'URL-адреса') {
            const url = validatedUrl(own(field, 'value'));
            if (own(field, 'href') !== undefined && string(own(field, 'href')) !== url) fail('URL_MISMATCH');
            urls.add(url);
          } else if (fieldLabel === 'Назва') add(values.title, own(field, 'value'));
          else if (fieldLabel === 'Опис') add(values.description, own(field, 'value'));
          else if (label(field, 'title') === 'Автор') {
            for (const rawAuthor of array(own(field, 'dict'))) {
              const author = object(rawAuthor);
              if (label(author) === 'Ім’я') add(values.author, own(author, 'value'));
            }
          }
        }
        if (urls.size > 1) fail('URL_MISMATCH');
        if (!urls.size) { counters.skippedOccurrences++; continue; }
        counters.urlOccurrences++;
        const url = [...urls][0]!, sourceId = facebookSourceId(url);
        const candidate = items.get(sourceId) ?? { url, fields: { title: new Set<string>(), description: new Set<string>(), author: new Set<string>() } };
        for (const field of fields) for (const value of values[field]) candidate.fields[field].add(value);
        items.set(sourceId, candidate);
        const membership = { source: 'facebook', collectionSourceId: id, itemSourceId: sourceId };
        memberships.set(JSON.stringify([id, sourceId]), membership);
      }
    }
    if (!savedSections || !hasName) fail('INVALID_STRUCTURE');
    if (names.size > 1) fail('COLLECTION_NAME_CONFLICT');
  }
  const normalized: FacebookItemCandidate[] = [...items].sort(([a], [b]) => ordinal(a, b)).map(([sourceId, candidate]) => {
    const item: KnowledgeItem = { source: 'facebook', sourceId, url: candidate.url, title: facebookFallbackTitle(candidate.url) };
    const conflicts: FacebookConflictCode[] = [];
    for (const field of fields) {
      if (candidate.fields[field].size === 1) item[field] = [...candidate.fields[field]][0]!;
      else if (candidate.fields[field].size > 1) conflicts.push(codes[field]);
    }
    return { item, conflicts: conflicts.sort() };
  });
  counters.distinctItems = items.size;
  counters.duplicateItemOccurrences = counters.urlOccurrences - items.size;
  counters.uniqueMemberships = memberships.size;
  counters.repeatedMembershipOccurrences = counters.urlOccurrences - memberships.size;
  return {
    collections: [...collections].sort(([a], [b]) => ordinal(a, b)).map(([sourceId, names]) => ({ source: 'facebook', sourceId, title: [...names][0]! })),
    items: normalized,
    memberships: [...memberships.values()].sort((a, b) => ordinal(a.collectionSourceId, b.collectionSourceId) || ordinal(a.itemSourceId, b.itemSourceId)),
    counters, warnings: [...new Set(normalized.flatMap(candidate => candidate.conflicts))].sort(),
  };
}

export function mergeFacebookItem(candidate: FacebookItemCandidate, existing?: KnowledgeItem): { item: KnowledgeItem; warnings: FacebookConflictCode[] } {
  const warnings = new Set(candidate.conflicts);
  if (!existing) return { item: { ...candidate.item }, warnings: [...warnings].sort() };
  const item = { ...existing, source: candidate.item.source, sourceId: candidate.item.sourceId, url: candidate.item.url };
  for (const field of fields) {
    const incoming = candidate.item[field], stored = existing[field];
    if (candidate.conflicts.includes(codes[field])) continue;
    if (!incoming?.trim()) continue;
    const fallback = field === 'title' ? facebookFallbackTitle(candidate.item.url) : undefined;
    if (field === 'title' && incoming === fallback) continue;
    if (!stored?.trim() || (field === 'title' && stored === fallback)) item[field] = incoming;
    else if (stored !== incoming) warnings.add(codes[field]);
  }
  return { item, warnings: [...warnings].sort() };
}

export async function readFacebookImport(file: string): Promise<FacebookImport> {
  let bytes: Buffer;
  try {
    const handle = await open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) fail('INPUT_READ_FAILED');
      if (stat.size > FACEBOOK_LIMITS.bytes) fail('INPUT_TOO_LARGE');
      // One extra byte detects growth after stat without ever reading an unbounded file.
      const buffer = Buffer.alloc(FACEBOOK_LIMITS.bytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > FACEBOOK_LIMITS.bytes) fail('INPUT_TOO_LARGE');
      bytes = buffer.subarray(0, total);
    } finally { await handle.close(); }
  } catch (error) { if (error instanceof FacebookImportError) throw error; return fail('INPUT_READ_FAILED'); }
  let decoded: string;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail('INVALID_UTF8'); }
  return parseFacebookImport(decoded);
}
