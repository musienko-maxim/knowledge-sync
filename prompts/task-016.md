# Task 016 — Account-wide YouTube synchronization

Project:

```text
D:\codex\knowledge-sync
```

Environment:

```text
Windows / PowerShell
Node.js + TypeScript
SQLite + Drizzle ORM
Vitest
local-first architecture
```

Before doing anything, read:

```text
AGENTS.md
docs/SESSION_HANDOFF.md
prompts/task-016.md
```

Tasks 001–015 are already COMPLETED / ACCEPTED.

Task 015 introduced persistent YouTube collections and many-to-many playlist memberships.

Do not redesign or regress completed Tasks 001–015 unless you find a genuine architectural blocker.

Do not commit or push.

---

# Working mode for this task

This task must begin with an architecture/design review.

## Phase 1 — review only

Before implementation:

1. inspect the current codebase;
2. identify the existing playlist-discovery implementation used by:

```text
youtube playlists
```

3. identify the complete existing single-playlist synchronization path introduced/extended through Task 015;
4. identify how current CLI commands:
   - `youtube sync`
   - `youtube sync-obsidian`
   - `youtube playlists`
   are wired;
5. inspect current OAuth behavior and error propagation;
6. inspect current Obsidian batch export flow;
7. determine the smallest architecture-compatible implementation for Task 016.

Then report:

- whether this specification fits the current architecture;
- any genuine blockers;
- any ambiguities that must be resolved;
- any suggested adjustments that materially reduce risk or avoid duplication.

Do NOT implement anything during Phase 1.

Do NOT make speculative refactors.

Stop after the review and wait for approval before implementation.

Phase 1 was completed and the user approved implementation with all review
suggestions on 2026-10-05. The clarifications below govern Phase 2.

## Accepted review clarifications

- Initial authentication failure starts no playlist work. Authentication failure
  during a later request stops further playlists, retains earlier writes/results,
  and suppresses export. This fatal-error rule overrides the general final-export
  rule after successful discovery.
- Use structured failure classification, preserving existing safe messages and
  original errors. Google OAuth/provider failures and API credential rejection
  (HTTP 401 or known credential-rejection reasons) are fatal. API quota exhaustion
  is fatal because later playlists share the same quota. Ordinary API transport,
  server, inaccessible-playlist, and metadata failures remain per-playlist errors.
  Database initialization is fatal; during processing, structured SQLite errors
  for full disk, I/O, corruption, invalid database, read-only database, or failure
  to open the database are fatal. Constraints and other individual operation
  failures remain per-playlist failures. Do not infer classification from messages.
- Preserve aggregate results and original unknown errors through late fatal
  failures and snapshot/batch-export exceptions. Report unattempted playlists
  separately after a fatal stop; the attempted fatal playlist counts as failed.
  Discovery failure reports a fatal discovery outcome without starting any sync.
  Use explicit outcome tags so even a thrown `undefined` remains distinguishable
  from success. Per-note export failures retain the existing batch result.
- Sum item counters from successfully completed playlists only. Exclude partial
  writes from failed playlists because existing `SyncResult` has no partial
  result. Document that item counters are neither unique row counts nor a complete
  count of writes on failed runs. Legacy collection-title differences may still
  cause changed counters on repeated account runs.
- Add `--db <path>` with existing precedence: option, `DATABASE_PATH`, default
  `./data/knowledge-sync.sqlite`. Only an explicit `--vault <path>` requests
  export; `OBSIDIAN_VAULT_PATH` alone never enables it. Reject blank explicit
  options; preflight a requested vault as an existing directory before OAuth,
  discovery, or persistence. Preserve supplied nonblank path text. Keep the
  database outside the selected vault through existing canonical-path checks;
  without requested export, keep the ordinary sync environment-vault guard.
  Directory preflight does not guarantee later writes will succeed.
- Reuse one OAuth provider/client, `YouTubeAccount.listMyPlaylists()`, and one
  `syncCollection()` call per discovered playlist in discovery order. Do not call
  the CLI `playlists()` command or the fail-fast `collectYouTubeAccount()` helper
  as the account persistence orchestrator. Complete all discovery pages before
  processing any playlists; a later discovery-page failure starts no sync.
- With zero discovered playlists, requested export still reads the entire selected
  database and invokes the batch exporter once. The snapshot includes retained
  items from other playlists/sources. No account partitioning or deletion is added.
- Escape playlist identity/title text in new diagnostics, retaining the existing
  safe error allowlist and hiding arbitrary messages, causes, and error objects.
- Add regressions for late authentication failure after prior success, combined
  playlist and snapshot/batch errors, late discovery failure, zero-playlist export
  of existing items, explicit option/environment behavior, and diagnostic controls.

---

# Goal

Add account-wide YouTube synchronization.

The intended user workflow is:

```text
OAuth account
    ↓
discover all owned playlists
    ↓
sync every playlist sequentially
    ↓
persist/update Collections
    ↓
persist/update KnowledgeItems
    ↓
persist CollectionMemberships
    ↓
aggregate account-wide result
    ↓
optionally export the final persisted SQLite snapshot to Obsidian once
```

The user must not need to provide playlist IDs manually.

---

# CLI

Add:

```powershell
node dist/cli/index.js youtube sync-all
```

Optional Obsidian projection:

```powershell
node dist/cli/index.js youtube sync-all --vault D:\obsidian
```

Semantics:

```text
youtube sync-all
```

performs account-wide synchronization into SQLite only.

```text
youtube sync-all --vault <path>
```

performs the same synchronization and then attempts one final Obsidian export from the persisted SQLite snapshot.

Do NOT add a separate:

```text
sync-all-obsidian
```

command for Task 016.

---

# Authentication

`youtube sync-all` is OAuth-only.

Do NOT add:

```text
--auth api-key
```

or:

```text
--auth oauth
```

to `sync-all`.

The command represents:

```text
synchronize my YouTube account
```

so OAuth identity is implicit.

Reuse the existing OAuth implementation and behavior.

Expected semantics:

```text
OAuth unavailable
→ fail before playlist processing

OAuth expired but refreshable
→ existing refresh behavior applies

OAuth invalid / refresh fails
→ preserve/propagate existing authentication failure behavior
→ no playlist processing
→ no Obsidian export
```

Do not create a second OAuth implementation.

---

# Playlist discovery

Reuse the existing owned-playlist discovery behavior currently used by:

```powershell
youtube playlists
```

Do not implement a second independent YouTube playlist discovery mechanism unless the current architecture makes reuse genuinely impossible.

If discovery logic is currently coupled too tightly to CLI presentation, perform only the smallest refactor required to expose it for reuse by the application orchestration.

The existing `youtube playlists` behavior must remain compatible.

Account-wide synchronization must include empty owned playlists.

---

# Existing data model

SQLite remains the source of truth.

Obsidian remains a derived projection.

For YouTube:

```text
Video
=
KnowledgeItem

Playlist
=
Collection

Video in N playlists
=
1 KnowledgeItem
+
N CollectionMembership rows
```

KnowledgeItem identity remains:

```text
source + sourceId
```

For YouTube:

```text
youtube + videoId
```

Collection identity remains:

```text
source + sourceId
```

For YouTube playlists:

```text
youtube + playlistId
```

Playlist title is metadata, not identity.

Do not change these identity rules.

---

# Reuse the complete existing playlist sync path

Task 016 must reuse the current complete single-playlist application flow responsible for:

```text
Collection persistence
+
KnowledgeItem persistence
+
CollectionMembership persistence
```

Do not bypass Task 015 behavior by invoking only an older lower-level item `sync()` path if that would omit collection or membership persistence.

Reuse the highest appropriate existing application abstraction.

Avoid duplicating single-playlist synchronization logic inside the new account-wide orchestrator.

---

# Processing order

Playlist processing must be sequential.

Conceptually:

```text
discover owned playlists

for each playlist in discovery order:
    process complete playlist sync
    aggregate result
    if this playlist fails:
        record failure
        continue with next playlist
```

Do NOT parallelize playlists.

In particular, do not introduce:

```ts
Promise.all(...)
```

for playlist synchronization.

Sequential processing is intentional for deterministic persistence, failure behavior, SQLite interaction, and tests.

---

# Failure semantics

There are two levels of failure behavior.

## Within a playlist

Preserve existing Task 015 semantics.

If one playlist fails partway through processing:

```text
earlier successful writes remain
processing of that playlist stops
later writes for that playlist do not execute
error is surfaced to account orchestration
no rollback
```

Do not change the established partial-progress semantics.

## Across playlists

A failure of one playlist must NOT stop account-wide processing.

Example:

```text
IT          OK
drones      OK
EnglishAI   FAILED
cinema      OK
Sport       OK
```

Expected:

```text
IT          persisted
drones      persisted
EnglishAI   recorded as failed
cinema      still processed
Sport       still processed
```

Any partial successful writes made before the EnglishAI failure remain persisted.

Continue processing remaining playlists.

---

# Fatal account-level failures

Failures that prevent account orchestration from starting or continuing meaningfully remain fatal.

Examples:

```text
OAuth unavailable
OAuth cannot be refreshed
owned-playlist discovery fails
database initialization fails
invalid vault configuration
```

A fatal account-level failure stops the operation.

Do not reinterpret every infrastructure failure as a recoverable playlist failure.

Use the current architecture and error boundaries to distinguish account-level prerequisites from individual playlist work-unit failures.

---

# Account-wide result

Do not modify existing `SyncResult` unless implementation proves this genuinely necessary.

Prefer a separate account-wide result type.

Conceptually:

```ts
interface YouTubeAccountSyncResult {
  playlists: {
    discovered: number;
    succeeded: number;
    failed: number;
  };

  items: {
    processed: number;
    new: number;
    changed: number;
    unchanged: number;
  };

  failures: PlaylistSyncFailure[];
}
```

Conceptual failure entry:

```ts
interface PlaylistSyncFailure {
  playlistId: string;
  playlistTitle?: string;
  error: unknown;
}
```

Exact type/file names may follow existing project conventions.

Do not unnecessarily expose CLI formatting concerns inside the application result type.

Preserve original errors internally where the existing architecture does so.

CLI output should use safe failure diagnostics.

---

# Aggregate item statistics

Account-wide item statistics are processing-event statistics.

They are NOT unique-item counts.

Example:

```text
Playlist A:
  Video X
  Video Y

Playlist B:
  Video X
  Video Z
```

Expected account-wide processing:

```text
processed = 4
```

not:

```text
processed = 3
```

SQLite still contains only:

```text
3 unique KnowledgeItems
```

and:

```text
4 memberships
```

assuming all four playlist-item relationships are distinct.

Aggregate item statistics are the sum of successful per-playlist `SyncResult` values only.

Do not add a global pre-sync deduplication layer.

Duplicate videos across playlists must still pass through each relevant playlist flow so that all memberships are persisted.

---

# Duplicate-video persistence requirement

This scenario is mandatory:

```text
Playlist A → Video X
Playlist B → Video X
```

After successful account synchronization:

```text
KnowledgeItems:
  X
```

```text
Collections:
  A
  B
```

```text
Memberships:
  A → X
  B → X
```

Video X must not be duplicated as two KnowledgeItems.

Both memberships must exist.

The item may count as two processing events in account statistics.

---

# Empty playlists

Empty playlists are first-class Collections.

Account-wide discovery must not filter them out.

For an empty playlist:

```text
Collection persisted/updated
KnowledgeItems added = 0
Memberships added = 0
playlist counted as succeeded
```

Existing Task 015 semantics for empty playlist title updates must remain intact.

Do not create fake KnowledgeItems for empty playlists.

---

# Obsidian export

When `--vault` is absent:

```text
perform account synchronization
do not export
```

When `--vault` is supplied:

```text
discover playlists
↓
process every playlist sequentially
↓
collect playlist failures
↓
read final persisted SQLite snapshot once
↓
perform one Obsidian batch export
```

Do NOT perform a full Obsidian export after each playlist.

The final export should reuse the existing persisted-snapshot / batch-export architecture where possible.

---

# Export after partial playlist failures

Playlist failures do NOT prevent the final requested Obsidian export.

Example:

```text
12 playlists discovered
11 playlists succeeded
1 playlist failed
```

With:

```text
--vault <path>
```

Expected:

```text
process all playlists
↓
preserve successful and partial persisted progress
↓
attempt one final Obsidian export from current SQLite state
↓
report playlist failure
↓
overall command exits non-zero
```

SQLite remains authoritative.

Obsidian should project the actual persisted state rather than remain stale solely because one playlist failed.

Use this simple rule:

```text
if owned-playlist discovery succeeded
and --vault was validly requested
and no fatal account-level failure interrupted processing
then attempt one final export after playlist processing
```

This applies even if all individual playlists fail after successful discovery.

Do not add rollback.

---

# Combined playlist and export failures

Both categories must remain observable.

Example:

```text
Playlist A failed
Playlist B succeeded
final Obsidian export failed
```

Expected:

```text
Playlist A failure remains reported
Obsidian export failure remains reported
successful DB progress remains persisted
overall result is failure / non-zero exit
```

Do not allow one failure category to hide the other.

Preserve existing Obsidian partial-export behavior where applicable.

---

# Exit-code semantics

Exit with success only when all requested work succeeds.

Conceptually:

```text
exit 0
```

only if:

```text
owned-playlist discovery succeeded
AND
every discovered playlist succeeded
AND
requested Obsidian export succeeded
```

Otherwise:

```text
exit non-zero
```

Partial success is still an operational failure for CLI exit status, even though successful progress is intentionally preserved.

---

# CLI output

Keep output concise and consistent with existing CLI conventions.

A successful or partially successful account summary should expose at least:

```text
Playlists: <discovered> discovered, <succeeded> succeeded, <failed> failed
Items: <processed> processed, <new> new, <changed> changed, <unchanged> unchanged
```

When playlists fail, report safe identifying information such as:

```text
Failed playlists:
- EnglishAI (PLxxxx): <safe error message>
```

Exact wording may follow existing CLI style.

Do not print unnecessary stack traces during normal CLI usage.

If Obsidian export is requested, preserve or adapt the existing export statistics/diagnostic conventions rather than inventing an unrelated output style.

---

# Legacy KnowledgeItem.collection

Do not redesign or remove the legacy:

```text
KnowledgeItem.collection
```

field in Task 016.

It remains for compatibility with Tasks 001–014 and current Markdown behavior.

It is NOT authoritative for many-to-many playlist membership.

Authoritative playlist relationships remain:

```text
Collection
+
CollectionMembership
```

Task 016 must not attempt to solve the legacy-field projection problem.

---

# No reconciliation or deletion

Task 016 is additive/update-oriented only.

Absence must not imply deletion.

Do NOT implement:

```text
playlist no longer discovered
→ delete Collection
```

Do NOT implement:

```text
video no longer present in playlist
→ delete KnowledgeItem
```

Do NOT implement:

```text
membership not observed during current sync
→ delete CollectionMembership
```

Do not add `lastSeen`.

Reconciliation / deletion semantics belong to a later task.

---

# Compatibility requirements

The following existing commands must remain compatible:

```text
youtube playlists
youtube sync <playlistIdOrUrl>
youtube sync-obsidian <playlistIdOrUrl>
youtube auth login
youtube auth status
youtube auth logout
```

Existing API-key and OAuth behavior for the single-playlist commands must remain unchanged unless a genuine bug/blocker requires correction.

Do not repurpose `sync-all` work into a redesign of existing commands.

---

# Tests

Add focused unit/integration tests appropriate to the current architecture.

At minimum cover the following behaviors.

## Discovery

```text
reuses existing owned-playlist discovery abstraction
zero owned playlists
discovery failure
missing OAuth authorization
invalid/unrefreshable OAuth
```

## Successful orchestration

```text
one playlist
multiple playlists
empty playlist
all playlists succeed
aggregate statistics are correct
```

## Partial playlist failure

```text
first playlist fails
middle playlist fails
last playlist fails
multiple playlists fail
later playlists still execute
successful writes remain persisted
partial writes from the failed playlist follow existing Task 015 semantics
failures are retained/reported
```

## Duplicate video

Required integration scenario:

```text
Playlist A → Video X
Playlist B → Video X
```

Verify:

```text
one KnowledgeItem X
two Collections
two CollectionMemberships
processed statistics count both playlist occurrences
```

## Export

```text
no --vault → no export
--vault → exactly one final export
export occurs only after playlist processing completes
partial playlist failure does not suppress final export
all playlist failures after successful discovery do not automatically suppress requested final export
export failure does not rollback DB
playlist failures + export failure are both observable
```

## Exit behavior

```text
all work succeeds → exit 0
one playlist fails → non-zero
multiple playlists fail → non-zero
discovery fails → non-zero
requested export fails → non-zero
```

## Regression

Verify existing behavior remains intact for:

```text
youtube playlists
youtube sync
youtube sync-obsidian
```

Use existing test helpers and architectural boundaries where possible.

Do not overfit tests to implementation details when behavior can be tested through stable public/application boundaries.

---

# Validation

After implementation, run the appropriate full validation for this repository.

At minimum:

```text
focused Task 016 tests
full test suite
typecheck
build
built CLI startup/help checks
packaged CLI startup/help checks if this repository currently uses them
ks-verify if available/configured
```

Also perform an independent review if that is part of the existing project workflow.

Report exact results.

If there is an expected platform-specific skip, report it explicitly.

---

# Documentation

Update documentation consistently with prior tasks.

At minimum inspect/update as appropriate:

```text
README.md
docs/SESSION_HANDOFF.md
prompts/task-016.md
```

and any relevant source-local README/documentation already used for YouTube/application/Obsidian behavior.

`docs/SESSION_HANDOFF.md` must record:

```text
Task 016 status
implemented architecture
important semantics
failure behavior
CLI usage
validation results
files changed/added
known limitations
next recommended step
```

Do not start Task 017.

---

# Non-goals

The following are explicitly OUT OF SCOPE for Task 016:

```text
playlist reconciliation
membership reconciliation
deletion semantics
lastSeen
retry engine
rollback
transaction redesign
parallel playlist processing
generic multi-source orchestration redesign
scheduler
background sync
automatic periodic sync
YouTube transcripts
subtitles
video downloads
thumbnails
comments
watch history
subscriptions
Obsidian Collection pages
Obsidian folder/layout redesign
removal or migration of KnowledgeItem.collection
auto commit
auto push
```

Do not add new dependencies unless genuinely necessary and explicitly justify them first.

Prefer no new dependencies.

---

# Architectural target

The intended structure is conceptually:

```text
CLI
 ↓
existing OAuth layer
 ↓
existing owned-playlist discovery
 ↓
account-wide application orchestrator
 ↓
for each playlist sequentially:
    existing complete Task 015 playlist sync
 ↓
aggregate account result + playlist failures
 ↓
optional final persisted snapshot read
 ↓
single existing-style Obsidian batch export
 ↓
CLI summary
 ↓
exit status
```

Keep CLI concerns at the CLI boundary.

Keep orchestration in the application layer.

Reuse existing collectors, repositories, OAuth infrastructure, playlist synchronization behavior, and Obsidian export behavior.

Do not introduce a parallel architecture for account-wide sync.

---

# Core Task 016 contract

In one sentence:

```text
Implement OAuth-only sequential account-wide YouTube playlist discovery and
synchronization, continuing across individual playlist failures, preserving
partial persistence, aggregating processing-level statistics, optionally
exporting the final persisted SQLite snapshot to Obsidian exactly once, and
returning a non-zero CLI status if any playlist or requested export fails.
```

Remember:

```text
Phase 1 first:
review architecture only
report blockers/clarifications
do not implement
wait for approval
```
