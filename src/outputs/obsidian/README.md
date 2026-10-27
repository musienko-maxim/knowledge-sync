# Obsidian output contract

Task 024 uses a reproducible, non-destructive projection of persisted knowledge.
SQLite owns identities and metadata; generated files have no persistent path registry.

## Plan and paths

[buildObsidianExportPlan](export-plan.ts) validates the snapshot, clones/freezes
entities, sorts by raw source/ID and calculates each path exactly once.
Collection and root-navigation renderers receive that mapping. Duplicate entities,
duplicate/dangling memberships, suffix collisions and portable path collisions
fail before publication. The plan stores paths and complete rendered Markdown.

[Readable paths](readable-path.ts) use `<title-prefix>--<32-hex>.md` within the
existing byte-encoded source directory; collections retain `collections/`.
The suffix is SHA-256 over UTF-8
`JSON.stringify(["knowledge-sync-readable-path-v1", kind, source, sourceId])`,
truncated to 32 lowercase hex characters. Identity strings are never normalized.
The suffix is a filename discriminator, not ownership authority.

Prefixes apply NFC then JavaScript default lowercase, keep Unicode letters,
marks and numbers, replace other runs with `-`, and remove unattached leading
marks. Complete graphemes fit both 80 code points and 160 UTF-8 bytes; trailing
hyphens are removed. Empty results use `untitled-item` or `untitled-collection`.
Safe Ukrainian and other Unicode text stays readable. The conservative portable
comparison key is NFC → default uppercase → NFC. Windows device names, invalid
characters and unsafe trailing dots/spaces are rejected. Absolute destination
and sibling temporary paths have a 240 UTF-16-code-unit portability budget on
both Windows and Linux. This is a policy, not an OS capability guarantee.

[Markdown destination encoding](markdown-link.ts) is separate from filenames:
encode each literal path segment, preserving `/`. Facebook text escaping remains
context-specific and is not globally decoded. Navigation retains the existing
Collections / All items layout, title normalization/order and duplicate labels.

## Ownership v1 and exact-byte fingerprints

[generated-note.ts](generated-note.ts) places this fixed header at byte zero:

```yaml
---
knowledge_sync: "generated-note-v1"
knowledge_sync_identity: "<base64url token>"
knowledge_sync_sha256: "<64 lowercase hexadecimal characters>"
source: "youtube"
sourceId: "example"
title: "Example"
---
```

The identity token is unpadded base64url of UTF-8
`JSON.stringify([kind, source, sourceId])`. It retains the full original strings.
The SHA-256 fingerprint covers **every other byte**: concatenate bytes before
and after the 64 ASCII digest characters, excluding those characters only.
The field name, quotes, newline, all ownership data, ordinary frontmatter and
body are included. Generation uses UTF-8 without BOM and canonical LF.

Verification never normalizes existing bytes. Missing/malformed markers,
unknown versions, identity mismatches, CRLF conversion, invalid UTF-8 and content
edits are rejected. The header grammar is deliberately limited to the exact
three ownership lines above, followed by unique plain keys from
`source`, `sourceId`, `url`, `title`, `author`, `collection`, `publishedAt`, each
with a JSON-compatible quoted string scalar. Arbitrary YAML keys, escaped or
quoted keys, aliases, explicit-key syntax, duplicate keys and additional fields
are unsupported in v1. This rejects duplicate ownership even with a recomputed
digest. Fingerprints detect accidental changes; they do not authenticate authors.

Root navigation remains an explicit exception: its existing first-line marker
`<!-- knowledge-sync:generated-navigation:v1 -->` authorizes replacement, with
one optional BOM and LF/CRLF/EOF accepted. Its body has no content fingerprint,
so user edits below that marker can be replaced.

## Preflight and publication

[preflightObsidianPlan](preflight.ts) performs no writes. It validates all expected
paths, portable equivalent existing names, ancestors including vault ancestors,
regular-file targets and ownership. Symlinks/junctions block export. A root
navigation conflict blocks notes too. Missing generated subdirectories are only
created after successful global preflight. Possible leftovers are counted only
in planned source/collection directories by listing names and using `lstat`;
unknown files are not read or claimed as generated.

[exportObsidianPlan](export-projection.ts) rechecks preflight, publishes all items,
then collections only if every item succeeded, then root navigation only if every
collection succeeded. Phase results preserve original failures and explicitly
mark dependent phases skipped. Identical bytes are not rewritten. Empty snapshots
are no-ops, preserving any existing navigation page.

[writeGeneratedObsidianNote](write-generated-note.ts) verifies the full identity
and fingerprint, prepares an exclusively created sibling temporary file, closes
it, rechecks ancestors/ownership/previous bytes and renames into place. It never
unlinks the canonical target to retry. Failure cleanup touches only its own temp
file; interrupted-run orphans remain. Navigation retains its tested atomic writer
with all-source path checks immediately before replacement.

One writer and no concurrent external filesystem or database changes are assumed.
Preflight-to-open and check-to-rename races remain; rechecks are not locks. There
is no transaction spanning SQLite and the vault or the whole set of files, and
no universal power-loss guarantee. Partial successful publication remains for
retry. There is no cleanup phase: historical/modified/unknown files and user
backlinks remain untouched. Title changes leave old paths alongside new ones.

## Integration

The [storage snapshot](../../storage/sqlite/read-snapshot.ts) validates rows,
original identity byte encoding and relationships in one synchronous transaction.
[Export-only reading](../../storage/sqlite/read-only-snapshot.ts) adds conservative
existing-file/header/sidecar preflight, rejects WAL/journal states, opens strictly
read-only with memory temporary storage, and closes on every outcome. It performs
no bootstrap, checkpoint, recovery, repair or source/network access.

YouTube single-playlist/account sync and Facebook import share the same planner
and publisher. The [item batch](export-notes.ts) and
[collection batch](export-collections.ts) use thin plan adapters, suppressing root
navigation; collection-only export also suppresses item publication. Their error
indexes follow deterministic plan order. Duplicate identities fail preflight.
The older [item-only application](../../application/sync-to-obsidian.ts) remains
item-only. Single-item/collection wrappers use the same readable paths, sealed
rendering and verified writer.

The legacy [opaque writer](write-note.ts) and [old prefix writer](write-owned-note.ts)
remain as existing low-level APIs, but production generated exports no longer
use their legacy overwrite/ownership contracts. No new dependencies, schema,
import records, source identities, network integration or Git automation are added.
