[`writeObsidianNote(vaultPath, relativePath, content)`](write-note.ts) writes supplied
UTF-8 text into an existing vault directory and returns `Promise<void>`. It creates
missing parents below that root and overwrites the destination completely.
Content is opaque: no BOM, newline, or formatting is added; supplied content,
including any existing BOM, is preserved. Filesystem errors propagate.

Blank vault paths and blank/root-equivalent destinations are rejected. Native
path resolution must keep the destination strictly below the root. Contained
`folder/../note.md` is allowed; escapes and native rooted/drive-qualified paths
are rejected before filesystem changes. Relative vault paths resolve against cwd.
Windows recognizes both separators; POSIX uses its native filename semantics.
Otherwise valid path values are not trimmed or sanitized.

Containment is lexical only; symlinks are followed normally. Writes are not atomic;
failed writes can leave partial content. The writer does not discover vaults, read
configuration, render Markdown, select filenames, or integrate with sync/import state.

[`buildObsidianRelativePath(item)`](note-path.ts) is the pure identity mapping to
`<encoded-source>/<encoded-sourceId>.md`. It ignores mutable metadata, preserves
identity distinctions through byte encoding, and does not truncate long names.
The pure renderer remains in [../markdown.ts](../markdown.ts), independently of
the path builder and writer.

[`exportObsidianNote(vaultPath, item): Promise<void>`](export-note.ts) composes the
path builder, renderer, and awaited writer in that order, once each. It forwards
the original inputs and generated outputs unchanged. Path or rendering failures
skip later steps; all failures reject with their original value. Success returns
no result and occurs only after writing completes. The supplied item is not mutated.

The exporter inherits the writer's containment, overwrite, and failure semantics;
an encoded path can still exceed native filesystem length limits. It does not
load configuration, access SQLite, record imports, select items, or integrate with
sync or the CLI. `Output.write(item)` remains unchanged. No Obsidian API or Git
automation is used.

[`exportObsidianNotes(vaultPath, items): Promise<ObsidianBatchExportResult>`](export-notes.ts)
accepts a readonly item array and awaits the single-item exporter sequentially in
input order. It attempts duplicate entries independently, forwarding the original
vault string and item references without mutating inputs. Per-item failures are
captured and later entries continue; the result waits for the final settlement.

The same module exports `ObsidianBatchExportResult` and `ObsidianExportFailure`.
The result has `processed`, `succeeded`, `failed`, and `failures`; each failure
retains its zero-based `index`, original `item`, and exact `error: unknown`.
Failures are ordered by input index. Counts describe entry outcomes, not unique
files or preserved final contents. Later duplicate writes may replace or damage
earlier output under the writer's existing non-atomic semantics.

Empty input returns zero counts and no failures without touching the vault.
There is no batch-level vault validation: if the single-item exporter fails for
every entry, every failure is recorded. The batch adds no retries, deduplication,
rollback, concurrency, or sync/CLI/database integration.

The application-level [syncToObsidian](../../application/sync-to-obsidian.ts)
composes successful sync, an ordered repository snapshot read, and this batch API.
Every persisted item is attempted, including unchanged and previously retained
items. Partial output failures leave persistence intact and are returned normally;
the full snapshot allows a later run to attempt failed notes again. It guarantees
no exact vault mirror, reconciliation, deletion, retry, rollback, or export-state
tracking. The batch implementation remains independent of storage and the CLI.

Task 015's [syncCollectionToObsidian](../../application/sync-collection-to-obsidian.ts)
is the single-playlist CLI path. It completes collection, item, and membership
persistence before reading the same full item snapshot. A relationship-write
failure skips export; an output failure leaves all completed database writes intact.
The generic `syncToObsidian` API and the output primitives remain unchanged.

SQLite collections and memberships are authoritative for observed playlist
associations. Markdown still exposes only the legacy `KnowledgeItem.collection`
title from the last synchronized playlist, so alternating playlists can change
that field in a shared video's note. There is one note per item identity, no
collection pages, and no projection of complete membership yet. Historical
memberships are populated by re-syncing playlists, never inferred from old titles.

Task 016's [syncAccount](../../application/sync-account.ts) optionally invokes one
final snapshot read and batch export after all playlists. Recoverable playlist
failures do not suppress that export, including when all playlists fail or
discovery returns no playlists. Fatal account errors skip export. Snapshot and
unexpected batch exceptions are retained alongside the accumulated playlist
results, while individual note failures keep the existing batch result semantics.
The selected database's entire item snapshot remains the projection source.
