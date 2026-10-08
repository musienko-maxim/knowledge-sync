# Task 018 architecture review and implementation decisions

Reviewed on 2026-10-06 against [the supplied brief](../prompts/task-018.md),
the existing source, and [the handoff](SESSION_HANDOFF.md). The user explicitly
authorized implementation after a satisfactory review, superseding the brief's
review-only stopping point. The referenced `prompts/task-017.md` is absent; its
accepted behavior was checked through current code, tests, and the handoff.

## Architecture and call paths

The scope fits the existing architecture. All collection-aware commands converge
on [syncCollection](../src/application/sync-collection.ts):

- `youtube sync` → `syncYouTubePlaylist` → `syncCollection`.
- `youtube sync-obsidian` → `syncYouTubePlaylistToObsidian` →
  `syncCollectionToObsidian` → `syncCollection` → persisted snapshot → projection.
- `youtube sync-all` (with or without `--vault`) → `syncAllYouTubePlaylists` →
  `syncAccount` → sequential `syncCollection` calls → optional final projection.

Both API-key and OAuth single-playlist modes share this path. No CLI handler
decides whether a snapshot is authoritative. Generic `sync()` stays unchanged.

`syncCollection()` already collected every page before persistence, rejected
cross-source entries, upserted the collection, and awaited each item and membership
write. Reconciliation now runs only after those operations succeed, including for
an empty result. Any earlier exception skips removal. Removal failure rejects that
playlist, retaining the original error for existing account failure classification.

## Storage and atomicity

The [membership contract](../src/storage/collection-membership-repository.ts)
previously exposed only idempotent `add()` and ordered `listAll()`. The smallest
extension is a deletion-only operation returning the actual removal count:

```ts
removeStaleForCollection(
  collection: Pick<KnowledgeCollection, 'source' | 'sourceId'>,
  desiredItems: readonly ItemIdentity[],
): Promise<number>;
```

The application supplies a deduplicated set of composite identities. The repository
also rejects cross-source desired identities before mutation and deduplicates IDs
within that validated source scope. It does not infer source authority or insert
missing desired memberships.

The existing primary key `(source, collection_source_id, item_source_id)` supports
collection-prefix reads and exact-edge deletes. Both foreign keys enforce same-source
parents. The [SQLite implementation](../src/storage/sqlite/collection-membership-repository.ts)
uses one short synchronous Drizzle transaction on the existing connection: read
that collection, find stale IDs with a set, and delete only those edges using bounded
parameters. A later deletion failure rolls back all removals in that phase. Earlier
additive writes remain committed. Large desired sets do not hit SQL variable limits.
No schema, dependency, connection-lifecycle, or global transaction change is needed.

Collections store only source, ID, and title. There is no ownership or discovery-scope
provenance. Absence from account discovery therefore does not authorize any deletion.

## Results and compatibility

`CollectionSyncResult` extends the unchanged `SyncResult` with required
`membershipsRemoved`. Obsidian sync exposes that result at its existing `sync`
location; `AccountSyncResult` adds a separate top-level aggregate. Account item
counters and removals include only fully successful playlists. The CLI preserves
existing summary lines and adds `Memberships: removed=N`. Internal typed doubles
need the new method/field; scripts requiring exact stdout must accept the extra line.

Account failure semantics remain sequential and retain partial progress. Successful
playlists before and after a recoverable failure reconcile normally. A late fatal
error keeps prior reconciliations and suppresses later processing/export. There is
no global rollback. A removal error uses existing structured fatal classification.

Task 017's snapshot and projection already read authoritative membership rows.
Normal export updates collection links and renders empty collections; retained
items still get notes. Export failure cannot roll back SQLite reconciliation.
No filesystem scan or deletion is needed.

## Clarifications and truth table

The authoritative set is the complete **normalized** snapshot returned by the
existing collector, after all pages succeed. Existing filtering of entries without
usable identity/title remains unchanged; an all-filtered successful response is
an empty normalized snapshot. This does not claim API-level point-in-time isolation
while a playlist changes during pagination. The application retains its local,
manual synchronization model without cross-process snapshot guarantees.

| Situation | Behavior |
| --- | --- |
| Complete successful collection sync | Remove its stale memberships atomically |
| Successful empty/all-filtered collection | Remove its memberships; retain parents |
| Collector, lookup, item, or membership write failure | Skip destructive phase |
| Destructive-phase failure | Roll back all removals in that phase; fail collection |
| Recoverable failed account playlist | Retain prior edges/additive progress; continue |
| Successful account playlists | Reconcile independently |
| Late fatal account failure | Preserve completed reconciliations; stop and skip export |
| Inaccessible/private/403/404 playlist | No absence or deletion inference |
| Playlist absent from discovery | Retain collection and memberships |
| Item or collection with zero memberships | Retain entity |
| Export failure after reconciliation | Keep database changes; later export recovers |
| Repeated identical successful snapshot | Remove zero edges |

Legacy item collection-title text is never consulted by reconciliation. Duplicate
entries retain entry-based sync statistics but yield set-based desired memberships.
Equal IDs under different sources and shared items in other collections stay distinct.

The scope remains membership removal only. Regression coverage must include a real
SQLite failure after an earlier delete, large desired sets, pre-removal failure
ordering, both auth modes and all commands, account recoverable/fatal outcomes,
retained orphan item notes, and export-failure recovery. Completion evidence is
recorded in the handoff. No future deletion or garbage-collection task is included.
