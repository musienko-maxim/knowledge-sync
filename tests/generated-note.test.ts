import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sealGeneratedMarkdown, verifyGeneratedNote } from '../src/outputs/obsidian/generated-note.js';

const identity = { source: 'facebook', sourceId: 'id-Україна-"\\\n' };
const original = '---\nsource: "facebook"\ntitle: "Title"\n---\n\n# Title\n\nBody\n';
const seal = () => sealGeneratedMarkdown('item', identity, original);

describe('generated note v1 byte fingerprint', () => {
  it('records canonical full identity and hashes every byte except the fingerprint value', () => {
    const note = seal();
    const token = /^knowledge_sync_identity: "(.+)"$/m.exec(note)![1]!;
    expect(JSON.parse(Buffer.from(token, 'base64url').toString())).toEqual(['item', identity.source, identity.sourceId]);
    const match = /^knowledge_sync_sha256: "([a-f0-9]{64})"$/m.exec(note)!;
    const valueOffset = match.index + 'knowledge_sync_sha256: "'.length;
    const excluded = note.slice(0, valueOffset) + note.slice(valueOffset + 64);
    expect(match[1]).toBe(createHash('sha256').update(excluded).digest('hex'));
    expect(() => verifyGeneratedNote(Buffer.from(note), 'item', identity)).not.toThrow();
    expect(seal()).toBe(note);
    expect(note).toContain('title: "Title"');
  });

  it('canonicalizes generation to LF but verifies existing bytes without normalization', () => {
    expect(sealGeneratedMarkdown('item', identity, original.replaceAll('\n', '\r\n'))).toBe(seal());
    for (const edited of [seal().replaceAll('\n', '\r\n'), '\ufeff' + seal(), seal().replace('Body', 'Body\r')]) {
      expect(() => verifyGeneratedNote(Buffer.from(edited), 'item', identity)).toThrow();
    }
  });

  it.each([
    (value: string) => value.replace('Body', 'Edited'),
    (value: string) => value.replace('title: "Title"', 'title: "Changed"'),
    (value: string) => value.slice(0, -1),
    (value: string) => value + '\n',
    (value: string) => value.replace('generated-note-v1', 'generated-note-v2'),
    (value: string) => value.replace(/^knowledge_sync_sha256:.*\n/m, ''),
    (value: string) => value.replace(/^knowledge_sync_sha256:.*$/m, 'knowledge_sync_sha256: "bad"'),
    (value: string) => value.replace('title: ', 'knowledge_sync: "duplicate"\ntitle: '),
    (value: string) => value.replace('title: ', '"knowledge_sync_sha256": "duplicate"\ntitle: '),
  ])('rejects altered/malformed/duplicated ownership or content', (change) => {
    expect(() => verifyGeneratedNote(Buffer.from(change(seal())), 'item', identity)).toThrow();
  });

  it('checks full kind/source/sourceId even if the fingerprint is valid', () => {
    for (const changed of [{ ...identity, sourceId: 'other' }, { ...identity, source: 'youtube' }]) {
      expect(() => verifyGeneratedNote(Buffer.from(seal()), 'item', changed)).toThrow('identity-mismatch');
    }
    expect(() => verifyGeneratedNote(Buffer.from(seal()), 'collection', identity)).toThrow('identity-mismatch');
    expect(() => verifyGeneratedNote(Buffer.from([0xff]), 'item', identity)).toThrow('invalid-content');
    expect(() => verifyGeneratedNote(Buffer.from(original), 'item', identity)).toThrow('unowned-target');
  });

  it.each(['? knowledge_sync\n: "duplicate"', '"knowledge_\\u0073ync": "duplicate"',
    'knowledge_sync_identity: "duplicate"', 'title: "duplicate"', '<<: *alias'])
  ('rejects unsupported or duplicate YAML syntax even with a recomputed fingerprint (%s)', (extra) => {
    const edited = seal().replace('\n---\n\n', `\n${extra}\n---\n\n`);
    const match = /^knowledge_sync_sha256: "([a-f0-9]{64})"$/m.exec(edited)!;
    const offset = match.index + 'knowledge_sync_sha256: "'.length;
    const digest = createHash('sha256').update(edited.slice(0, offset) + edited.slice(offset + 64)).digest('hex');
    const forged = edited.slice(0, offset) + digest + edited.slice(offset + 64);
    expect(() => verifyGeneratedNote(Buffer.from(forged), 'item', identity)).toThrow('invalid-content');
  });
});
