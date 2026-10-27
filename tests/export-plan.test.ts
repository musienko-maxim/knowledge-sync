import { describe, expect, it, vi } from 'vitest';
import { buildObsidianExportPlan, ExportPlanError } from '../src/outputs/obsidian/export-plan.js';
import { readablePathSuffix } from '../src/outputs/obsidian/readable-path.js';
import { encodeMarkdownDestination } from '../src/outputs/obsidian/markdown-link.js';

const youtube = { source: 'youtube', sourceId: 'X', title: 'Привіт AI', url: 'https://example.test/video' };
const facebook = { source: 'facebook', sourceId: 'url:private-id', title: '<script> [private](url)', url: 'https://example.test/post' };
const collection = { source: 'youtube', sourceId: 'PL1', title: 'Моя колекція' };
const fbCollection = { source: 'facebook', sourceId: 'FB1', title: 'Facebook [collection]' };
const snapshot = {
  items: [youtube, facebook], collections: [collection, fbCollection],
  memberships: [{ source: 'youtube', collectionSourceId: 'PL1', itemSourceId: 'X' },
    { source: 'facebook', collectionSourceId: 'FB1', itemSourceId: 'url:private-id' }],
};

describe('immutable shared export plan', () => {
  it('derives each destination exactly once and shares it across links', () => {
    const hash = vi.fn(readablePathSuffix);
    const plan = buildObsidianExportPlan(snapshot, { suffixForIdentity: hash });
    expect(hash).toHaveBeenCalledTimes(4);
    for (const entry of plan.items) {
      expect(plan.navigation!.markdown).toContain(`](${encodeMarkdownDestination(entry.relativePath)})`);
      const matched = plan.collections.find((value) => value.collection.source === entry.item.source)!;
      expect(matched.markdown).toContain(`](${encodeMarkdownDestination(`../${entry.relativePath.split('/')[1]}`)})`);
    }
    for (const entry of plan.collections) {
      expect(plan.navigation!.markdown).toContain(`](${encodeMarkdownDestination(entry.relativePath)})`);
    }
    expect(plan.navigation!.relativePath).toBe('Knowledge Sync.md');
    expect(plan.navigation!.markdown).toContain('## Collections');
    expect(plan.navigation!.markdown).toContain('## All items');
    const facebookBody = plan.items[0]!.markdown.split('\n---\n')[1]!;
    expect(facebookBody).not.toContain('<script>');
    expect(facebookBody).not.toContain('[private](url)');
  });

  it('has stable order and bytes independent of input order', () => {
    expect(buildObsidianExportPlan(snapshot)).toEqual(buildObsidianExportPlan({
      items: [...snapshot.items].reverse(), collections: [...snapshot.collections].reverse(),
      memberships: [...snapshot.memberships].reverse(),
    }));
  });

  it('owns immutable clones so later input changes cannot change the plan', () => {
    const mutable = { items: [{ ...youtube }], collections: [], memberships: [] };
    const plan = buildObsidianExportPlan(mutable);
    const before = JSON.stringify(plan);
    mutable.items[0]!.title = 'Changed after planning';
    mutable.items.push({ ...youtube, sourceId: 'new' });
    expect(JSON.stringify(plan)).toBe(before);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.items)).toBe(true);
    expect(Object.isFrozen(plan.items[0])).toBe(true);
    expect(Object.isFrozen(plan.items[0]!.item)).toBe(true);
    expect(Object.isFrozen(plan.navigation)).toBe(true);
  });

  it('updates only current generated paths/links after title changes', () => {
    const original = buildObsidianExportPlan(snapshot);
    const renamed = buildObsidianExportPlan({ ...snapshot, items: [{ ...youtube, title: 'Renamed' }, facebook] });
    const oldPath = original.items.find((entry) => entry.item.source === 'youtube')!.relativePath;
    const newPath = renamed.items.find((entry) => entry.item.source === 'youtube')!.relativePath;
    expect(newPath).not.toBe(oldPath);
    expect(newPath.split('--')[1]).toBe(oldPath.split('--')[1]);
    expect(renamed.navigation!.markdown).toContain(encodeMarkdownDestination(newPath));
    expect(renamed.navigation!.markdown).not.toContain(encodeMarkdownDestination(oldPath));
  });

  it('does not plan navigation for an empty snapshot', () => {
    expect(buildObsidianExportPlan({ items: [], collections: [], memberships: [] }))
      .toEqual({ items: [], collections: [], navigation: undefined });
  });

  it('fails injected suffix collisions even when paths differ', () => {
    expect(() => buildObsidianExportPlan(snapshot, { suffixForIdentity: () => 'a'.repeat(32) }))
      .toThrow(/SUFFIX_COLLISION/);
  });

  it('detects case-insensitive/Unicode path collisions without numbering', () => {
    const items = [{ ...youtube, sourceId: '1', title: 'ς' }, { ...youtube, sourceId: '2', title: 'σ' }];
    expect(() => buildObsidianExportPlan({ items, collections: [], memberships: [] },
      { suffixForIdentity: () => 'a'.repeat(32) })).toThrow(/PATH_COLLISION/);
  });

  it('detects a source directory conflicting with the root navigation file', () => {
    expect(() => buildObsidianExportPlan({ items: [{ ...youtube, source: 'knowledge sync.md' }],
      collections: [], memberships: [] })).toThrow(/PATH_COLLISION/);
  });

  it('reports collision indexes without revealing private content or identities', () => {
    try {
      buildObsidianExportPlan(snapshot, { suffixForIdentity: () => 'a'.repeat(32) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ExportPlanError);
      expect((error as ExportPlanError).firstIndex).toBe(0);
      expect((error as Error).message).not.toMatch(/private|url:|script/);
    }
  });

  it('rejects duplicate identities and invalid membership joins before rendering', () => {
    expect(() => buildObsidianExportPlan({ ...snapshot, items: [youtube, youtube] })).toThrow(/duplicate item/);
    expect(() => buildObsidianExportPlan({ ...snapshot, items: [youtube] })).toThrow(/missing item/);
    expect(() => buildObsidianExportPlan({ ...snapshot, memberships: [snapshot.memberships[0]!, snapshot.memberships[0]!] }))
      .toThrow(/duplicate membership/);
  });
});
