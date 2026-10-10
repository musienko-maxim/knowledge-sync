> Recovered from the preceding specification-authoring session on 2026-10-09.
> The preparation status and authoring-only instructions below are historical.
> Implementation was subsequently authorized in [prompts/task-020.md](../prompts/task-020.md).
> The current implementation/verification state is recorded in [SESSION_HANDOFF.md](SESSION_HANDOFF.md).

# Task 020 — Obsidian Navigation UX

Status: implementation specification complete; implementation NOT STARTED.
Prepared: 2026-10-09. This document incorporates the approved architecture and
all refinements from `prompts/new-inputs.md` and the review discussion. It is
self-contained. Creating this specification does not start implementation.

## 1. Goal and scope

Add one generated navigation page at `<vaultRoot>/Knowledge Sync.md` containing:

- `Collections`: every persisted Collection once, linked to its canonical note.
- `All items`: every persisted KnowledgeItem once, including shared items and
  items without current collection memberships.

Use the existing validated application snapshot. Preserve canonical item and
collection filenames, their Markdown bytes for the same inputs, existing links,
SQLite schema, OAuth, collection, and Task 018 reconciliation behavior.
The page describes persisted knowledge, not an exact mirror of currently
accessible YouTube playlists. No new dependencies are required.

Before implementation, read `AGENTS.md`, `docs/SESSION_HANDOFF.md`, this document,
and the actual affected source/tests. Inspect Git status and preserve existing
work. Tasks 001–018 are completed and accepted; Tasks 017–018 are committed in
`e9a86b7`, with conflict-resolution commit `4b5250c` at specification preparation.
Task 019 remains deferred. Do not commit or push without a separate instruction.

## 2. Existing architecture and affected files

Existing boundaries to reuse:

- `src/application/read-obsidian-snapshot.ts`: `readObsidianSnapshot()` reads
  items, collections, and memberships before output. Add no navigation-only read.
- `src/outputs/obsidian/collection-projection.ts`: `ObsidianProjectionSnapshot`
  and `buildCollectionProjections()` validate identities and relationships before
  writes. Duplicate identities/edges and missing parents remain errors, not
  inputs to silently deduplicate or repair.
- `src/outputs/obsidian/note-path.ts` and `collection-path.ts`: canonical paths.
- `src/outputs/obsidian/markdown-link.ts`: `escapeMarkdownInline()` and
  `encodeMarkdownDestination()` for distinct text/path escaping responsibilities.
- `src/outputs/obsidian/export-projection.ts`: shared ordered export composition.

Add these narrowly scoped modules:

| New module | Responsibility |
| --- | --- |
| `src/outputs/obsidian/navigation-markdown.ts` | Pure display normalization, sorting, labels, and complete document rendering; export the exact marker constant. |
| `src/outputs/obsidian/write-navigation.ts` | Fixed target filename, ownership checks, temporary-file preparation and replacement. |
| `src/cli/navigation-export-output.ts` | Shared safe formatting of navigation outcomes. |

Modify these existing modules during implementation:

| Existing module | Change |
| --- | --- |
| `src/outputs/obsidian/export-projection.ts` | Add the navigation outcome and phase after normal batches. |
| `src/application/sync-collection-to-obsidian.ts` | Forward navigation in `SyncCollectionToObsidianResult`. |
| `src/application/sync-account.ts` | Extend `AccountExportOutcome` and retain navigation in every requested-export result branch. |
| `src/cli/program.ts` | Single-playlist summary and exit status; keep commands/options compatible. |
| `src/cli/account-sync-output.ts` | Account summary and exit status using the shared navigation formatter. |

`src/cli/youtube-sync.ts` and `youtube-sync-all.ts` already delegate to these
application operations; preserve their configuration/auth/storage lifecycle.
Update their inferred or explicit types only if necessary for outcome propagation.
During implementation, update `README.md`, `src/outputs/obsidian/README.md`, and
`docs/SESSION_HANDOFF.md` to describe actual behavior and verification. Do not
change those documents during specification authoring.

Do not alter existing item/collection renderers, path builders, their ordering,
or `write-note.ts`. The generic item-only `syncToObsidian()` remains unchanged.

## 3. Data and rendering contract

Add the following pure API using the existing snapshot type:

```ts
export const NAVIGATION_MARKER = '<!-- knowledge-sync:generated-navigation:v1 -->';

export function renderNavigationMarkdown(
  snapshot: ObsidianProjectionSnapshot,
): string;
```

The caller supplies a snapshot already accepted by `buildCollectionProjections()`.
The renderer performs no I/O, reads no clock/configuration, and mutates neither
arrays nor entities. It uses `snapshot.collections` and `snapshot.items` directly
for entries; it never expands entries per membership or uses the legacy item
`collection` field to infer associations. Reuse existing validation rather than
adding a second domain model or generic navigation framework.

### 3.1 Display titles and sorting

For each title, in this exact order:

1. Normalize the title string with `.normalize('NFC')`.
2. Match the existing label helper's control conversion: replace
   `/\r\n|[\u0000-\u001f\u007f\u0085\u2028\u2029]/g` with a single space.
3. Collapse `/\s+/g` to a single space, then trim surrounding whitespace.
4. If empty, use `Untitled collection` or `Untitled item`, respectively.

This normalized display title is the common input to ordering, duplicate-title
detection, and label generation. In particular, `A\u0000B`, `A\nB`, and `A B`
form the same title group. Do not normalize stored titles, source strings,
source IDs, or path-builder inputs. The blank-item fallback is defensive rendering
behavior; it does not relax existing KnowledgeItem validation.

Sort each section independently by normalized title, then raw `source`, then raw
`sourceId`. Compare each string with JavaScript `<` and `>`; do not use locale
collation, lowercase identities, or change existing collection member ordering.
This is deterministic UTF-16 string ordering, not natural-language alphabetization.

### 3.2 Labels, links, and exact document layout

Detect equal normalized titles within each section. For every member of such a
group, append ` [source=<JSON string>, sourceId=<JSON string>]` to the title.
Serialize each raw identity component with `JSON.stringify()`, then replace any
remaining U+007F, U+0085, U+2028, or U+2029 characters in that serialized string
with literal lowercase `\uXXXX` escapes. These characters are not all escaped by
JSON serialization but would otherwise become spaces in the Markdown helper.
For example, IDs `a\u0085b` and `a b` must retain distinct visible suffixes.
Do not normalize identity suffixes or truncate them. Pass the entire resulting
label through `escapeMarkdownInline()`
exactly once. Unique titles use the normalized title without a suffix.

Use `buildObsidianCollectionRelativePath(collection)` for collection destinations
and `buildObsidianRelativePath(item)` for item destinations, then pass the literal
relative path through `encodeMarkdownDestination()`. Because the navigation page
is at the vault root, these existing paths are already relative to the page.
Do not decode persistent filenames. For example, item `youtube/X` has literal
path `youtube/%58.md` and Markdown destination `youtube/%2558.md`.

Render UTF-8 without BOM, using LF only and exactly one final LF. Layout:

```md
<!-- knowledge-sync:generated-navigation:v1 -->
# Knowledge Sync

Generated from persisted knowledge. Entries may include retained items and collections.

## Collections

<collection bullet links, one per line, or _No collections._>

## All items

<item bullet links, one per line, or _No items._>
```

Each bullet is `- [<escaped label>](<encoded destination>)`. Placeholder angle
brackets above are explanatory, not literal output. No timestamps, extra metadata,
collection counts, aliases, or reverse links are required. Both sections always
exist when rendered. The pure renderer may render an empty snapshot for unit
tests; orchestration must skip rendering/writing for a completely empty snapshot.

## 4. Dedicated navigation writer

Add:

```ts
export const NAVIGATION_FILENAME = 'Knowledge Sync.md';
export async function writeNavigationNote(
  vaultPath: string,
  content: string,
): Promise<void>;
```

Use Node built-ins only. Validate nonblank vault input and an existing directory;
resolve relative vault paths against cwd without trimming meaningful path text.
Never create a missing vault. The target is the fixed filename joined to that root,
not a caller-supplied path. Canonical source directories cannot emit this literal
uppercase name; user-owned files can still occupy it.

The writer accepts only complete generated content beginning with the exact
marker plus LF, without BOM or CR, and ending in LF. Reject invalid supplied
content before filesystem mutation. The renderer defines the complete layout;
the writer need not parse the Markdown body.

### 4.1 Ownership

Use `lstat()` on the target, not `stat()` or an existence check that follows links.

| Target state | Required behavior |
| --- | --- |
| Absent (`ENOENT` from target `lstat`) | May create after validating the vault. |
| Regular file with recognized marker | May replace. |
| Regular file without recognized marker | Reject and preserve bytes. |
| Directory or other non-regular object | Reject and preserve it. |
| Symbolic link, including dangling link or directory junction recognized as a link | Reject without reading/writing its destination. |
| Other filesystem error | Reject with the original failure available internally. |

The marker must occupy the entire first logical line. Accept at most one leading
UTF-8 BOM, then exactly `<!-- knowledge-sync:generated-navigation:v1 -->`, followed
by LF, CRLF, or immediate EOF. Reject leading/trailing spaces on that line,
different versions, altered text, repeated BOMs, lone CR, or a marker occurring
later in the file. Read only enough bytes to recognize that prefix and terminator;
close the read handle before replacement. An owned page's body need not match
the last generated output: manual edits to recognized generated pages are replaced.

Expose a small typed writer error for deliberate conflicts, with fixed reasons
`unowned-target`, `non-regular-target`, `symlink-target`, `target-changed`, and
`invalid-content`. Preserve native filesystem failures rather than converting
arbitrary messages into public diagnostics. No force-overwrite option is added.

### 4.2 Preparation and replacement

Required operation order:

1. Finish rendering/validating the content before modifying the target.
2. Validate the vault and inspect target ownership as above.
3. Generate a unique sibling name, e.g. `.knowledge-sync-navigation-<uuid>.tmp`,
   using `node:crypto`. Open with exclusive `wx` creation. Track ownership only
   after creation succeeds. If it already exists, fail safely without touching it;
   another invocation may choose a different UUID.
4. Write the complete content through the temporary file handle, await completion,
   and close the handle before replacement. A write or close failure skips rename.
5. Recheck target type/ownership. An originally absent target must remain absent;
   an originally owned file must remain an owned regular file. Reject an observed
   incompatible transition as `target-changed`. These are checks, not locking.
6. Use `node:fs/promises.rename(tempPath, targetPath)` in the same directory.
   Do not truncate or unlink the canonical target first. Do not fall back to
   delete-then-rename, copying over the target, or direct writing on failure.
7. After successful rename the canonical page is complete and the invocation
   no longer owns a temporary pathname. Return success.

On failure, close any handle when possible and unlink only the temporary file
successfully created and tracked by this invocation. Cleanup failures must not
replace the primary error (even if the thrown value is `undefined`). Do not scan
for or remove files matching the temporary-name pattern. Never remove the target
as cleanup. Failures before replacement preserve the prior canonical file, or
leave it absent when it was absent originally. Retrying a transient failure must
be possible without requiring an ownership-marker repair.

An abruptly terminated process may leave its own partial temporary file. A later
run uses a new name and does not delete that artifact. No recovery journal or
general cleanup subsystem is included.

### 4.3 Windows semantics and limits

The inspected environment runs Node `v24.18.0` on Windows with libuv `1.52.1`;
`package.json` requires Node 24 or newer. Node documents replacement of an existing
file by `rename` and exclusive creation with `wx`. Use the supported APIs rather
than shell commands or a platform-specific helper. See the official
[Node file-system documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrenameoldpath-newpath-callback)
and [open flags](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-system-flags).

Same-directory replacement avoids a deliberate cross-volume copy. Verify real
creation and replacement of an existing owned file on Windows in isolated tests.
If the platform denies replacement (for example, permissions or sharing locks),
report failure and retain the prior page; do not weaken the strategy. The native
implementation can be inspected in
[libuv 1.52.1 Windows filesystem source](https://github.com/libuv/libuv/blob/v1.52.1/src/win/fs.c).

Assume one active navigation writer per vault and no concurrent external edits
to the target, vault path, or temporary file. Ownership prechecks do not provide
race-free protection against replacement between checks and rename. Preserve
existing vault-root resolution behavior; target-link rejection is not a promise
of general ancestor/reparse-point hardening. No filesystem locks are required.

Do not claim universal atomicity or power-loss durability on every filesystem.
The task prevents intentional partial writes to the canonical target and verifies
ordinary failure recovery on the supported local environment. It does not require
a directory fsync protocol, network-filesystem guarantees, or preservation of file
timestamps/ACLs across replacement. Unsupported replacement must fail safely.

## 5. Shared orchestration and result contracts

Add the following to `src/outputs/obsidian/export-projection.ts`:

```ts
export type NavigationExportOutcome =
  | { status: 'completed' }
  | { status: 'failed'; stage: 'render' | 'write'; error: unknown }
  | { status: 'skipped'; reason: 'empty-snapshot' | 'upstream-failure' };

export interface ObsidianProjectionExportResult {
  readonly items: ObsidianBatchExportResult;
  readonly collections: CollectionExportOutcome;
  readonly navigation: NavigationExportOutcome;
}
```

Keep the existing item result and `CollectionExportOutcome` contracts intact.
Tagged outcomes must preserve arbitrary thrown values, including `undefined`.
Do not infer failure from the truthiness of an error.

`exportObsidianProjection(vaultPath, snapshot)` must:

1. Call the existing strict `buildCollectionProjections()` before any output.
2. Await the existing item batch, then the existing collection batch.
3. After both normally return, attempt navigation once using the same snapshot.
4. Catch renderer failure as `failed/render`, skipping the navigation writer.
5. Catch writer failure as `failed/write`; retain both prior batch results.

The outcome rules are:

| Condition | Navigation | Existing behavior preserved |
| --- | --- | --- |
| Invalid snapshot | No navigation; validation exception propagates | No writes. |
| Unexpected item-batch exception | No navigation; exact exception propagates | Collection batch not attempted; no fabricated item result. |
| Unexpected collection-batch exception | `skipped/upstream-failure` | Return original item result and existing `collections: failed` outcome. |
| Ordinary individual item/collection failures | Attempt after both batches finish | Preserve failures and continue-on-error behavior. |
| Completely empty valid snapshot | `skipped/empty-snapshot` | Existing zero-count batch results; no renderer/writer or vault access. |
| Nonempty valid snapshot | Render both sections and attempt writing | Collection-only and item-only snapshots are valid. |

A completely empty snapshot has no items, collections, or memberships. Validate
first: dangling memberships must fail, not masquerade as empty. Do not delete or
update an old navigation page on an empty snapshot; it can remain stale.
Navigation describes persisted state, so links may point to notes whose current
export failed. Do not prune entries according to per-note write success.

## 6. Application outcome propagation

`SyncCollectionToObsidianResult` in
`src/application/sync-collection-to-obsidian.ts` gains required
`readonly navigation: NavigationExportOutcome`. Forward it from the shared
projection alongside existing `sync`, `export`, and `collections` fields.
Sync/snapshot failures and propagated item-batch exceptions still reject; no
navigation result is fabricated when this operation returns no result.

Extend `AccountExportOutcome` in `src/application/sync-account.ts` as follows:

```ts
type SkippedNavigation = Extract<NavigationExportOutcome, { status: 'skipped' }>;

export type AccountExportOutcome =
  | { status: 'not-requested' }
  | { status: 'skipped'; navigation: SkippedNavigation }
  | { status: 'completed'; result: ObsidianBatchExportResult;
      collections?: CollectionExportOutcome; navigation: NavigationExportOutcome }
  | { status: 'failed'; stage: 'snapshot' | 'batch'; error: unknown;
      navigation: SkippedNavigation }
  | { status: 'failed'; stage: 'collections'; result: ObsidianBatchExportResult;
      error: unknown; navigation: SkippedNavigation };
```

Retain the existing optional `collections` field for compatibility, while the
actual completed projection always supplies it. Requested export starts with
`navigation: { status: 'skipped', reason: 'upstream-failure' }` and carries this
through fatal account exits, snapshot failures, and unexpected batch failures.
Forward projection navigation on normally completed batches. On unexpected
collection-batch failure retain the current `failed/collections` branch and its
original error/item result, plus the skipped navigation outcome.

An account `export.status: completed` means the batch orchestration returned;
it does not mean all individual or navigation exports succeeded. A navigation
failure stays inside that branch so item and collection results are not lost.
The CLI must inspect it. `not-requested` remains exactly as before with no
navigation work or output. No new database reads or rollback are added.

## 7. CLI contract

The affected commands are:

- `youtube sync-obsidian <playlist>` with its existing auth/db/vault options.
- `youtube sync-all --vault <path>` with its existing OAuth-only behavior.

Do not change arguments, option precedence, validation, storage closure, safe
existing diagnostics, item counters, collection counters, or membership counters.
Ordinary `youtube sync`, `youtube sync-all` without `--vault`, and help remain
unchanged. Do not create navigation from generic item-only export APIs.

Add `formatNavigationExportOutcome(outcome)` in
`src/cli/navigation-export-output.ts`, returning
`{ output: string; errors: string; failed: boolean }`, like the collection formatter.
Each nonempty returned string ends with one LF. Exact summary lines:

| Outcome | stdout | stderr | Formatter failed |
| --- | --- | --- | --- |
| completed | `Navigation: succeeded=1 failed=0` | none | false |
| failed/render | `Navigation: succeeded=0 failed=1` | `Navigation rendering failed. Check persisted titles and identities.` | true |
| failed/write | `Navigation: succeeded=0 failed=1` | Fixed safe write diagnostic below | true |
| skipped/empty-snapshot | `Navigation: skipped (empty snapshot)` | none | false |
| skipped/upstream-failure | `Navigation: skipped (earlier export failure)` | none; retain existing upstream diagnostics | false |

Write diagnostics for typed ownership conflicts:

- Unowned: `Navigation export refused: Knowledge Sync.md is not a recognized generated page.`
- Symlink: `Navigation export refused: Knowledge Sync.md is a symbolic link.`
- Non-regular: `Navigation export refused: Knowledge Sync.md is not a regular file.`
- Changed: `Navigation export refused: the destination changed during export.`
- Invalid content or any other failure: `Navigation export failed. Check the vault, destination ownership, and write permissions.`

Do not print raw exceptions, supplied absolute paths, content, or arbitrary causes.
Keep original errors internally. Add the navigation summary after existing export
summaries using this formatter in both `program.ts` and `account-sync-output.ts`.
For account early-failure branches, print skipped navigation after any existing
summaries. When single-playlist orchestration rejects without a result, preserve
the current fatal CLI path without inventing summary counters.

A navigation failure OR any existing failure condition yields exit status 1.
An empty-snapshot skip is successful unless another operation failed. An upstream
skip retains the existing upstream nonzero status. Keep the current placement of
Commander error handling so exit overrides do not produce duplicate fatal messages.

## 8. Implementation sequence

1. Confirm entry Git state, read repository workflow/verification instructions,
   and preserve unrelated work. Use bounded delegation and independent review
   according to `docs/AGENT_WORKFLOW.md`; do not assign overlapping writers.
2. Implement the pure renderer and deterministic fixture tests.
3. Implement the dedicated writer and ownership/failure tests, including real
   temporary-directory Windows replacement coverage.
4. Add the shared navigation outcome/phase and extend application propagation.
5. Add shared CLI formatting, integration, and regression coverage.
6. Update implementation documentation only after behavior is verified.
7. Complete focused checks and repository-wide validation; review the final diff
   and report limitations. Do not start Task 019 or another task.

## 9. Automated test matrix

No live YouTube calls, credentials, real database, or real vault are test fixtures.
Use deterministic content and mocks with isolated temporary directories/databases.
Randomized temporary names are not part of generated document bytes. Check every
cleanup target stays inside its test directory before recursive deletion.

| Files | Required coverage |
| --- | --- |
| New `tests/navigation-markdown.test.ts` | Exact layout/newlines; both sections; no input mutation; reordered arrays; shared and unassociated items; one empty section; blank-title fallbacks; NFC, whitespace, and control conversion; duplicate display titles and identity suffix escaping, including `a\u0085b` versus `a b`; title changes retain link targets; ordinal ordering with source/ID ties; Markdown/HTML punctuation; literal percent signs, Unicode, case-distinct and reserved-name identities. |
| New `tests/obsidian-write-navigation.test.ts` | Marker with/without BOM, LF/CRLF/EOF; leading/trailing spaces, wrong version, lone CR, repeated BOM and later marker rejected; invalid generated content; target absence; owned and unowned regular files; directories; file/directory/dangling symlinks; native errors; missing vault; exclusive temp collision preserves unrelated file; no direct target truncation or deletion. |
| New `tests/obsidian-write-navigation.integration.test.ts` | Actual creation and replacement; unchanged content bytes on repeat; old page preserved after injected temporary-write/close/rename failure; retry succeeds; absent target stays absent on preparation failure; owned temporary cleanup only; cleanup failure retains primary error; orphan fixture survives and does not prevent retry; recognized manual edits are replaced; real Windows replacement. |
| `tests/obsidian-export-projection.test.ts` | Phase order; one navigation attempt; ordinary note failures continue; unexpected item exception propagates; collection exception retains item result and skips navigation; invalid snapshot writes nothing; render/write failures retain original errors, including thrown `undefined`; empty skip. |
| `tests/obsidian-projection.integration.test.ts` | New root page plus unchanged item/collection bytes/paths; shared and retained item links; shuffled input yields identical navigation bytes; empty, item-only, collection-only snapshots; user conflict preserves target while note results remain; recovery after navigation failure. |
| `tests/sync-collection-to-obsidian.test.ts`, `tests/sync-account.test.ts` | Exact result propagation; existing sync and fatal/recoverable behavior; snapshot/batch/collection failure branches; no extra repository reads; no-export path; empty skip; SQLite progress retained. |
| New `tests/navigation-export-output.test.ts` | Exact safe output for every outcome/conflict; no raw error leakage; failure flag; arbitrary thrown values. |
| `tests/cli.test.ts`, `tests/youtube-sync-obsidian.test.ts`, `tests/youtube-sync-all.test.ts` | Both CLI summaries and exit codes; help stays lazy; rendering/writing failure; earlier failure and empty skips; no-export output unchanged. |
| `tests/youtube-sync-obsidian.integration.test.ts`, `tests/youtube-sync-all.integration.test.ts` | Real command composition with mocked transport and temporary storage/vault; successful page, ownership refusal, unchanged existing summaries, closed storage, committed data after failure and retry. |

Retain existing regression suites including `obsidian-note-path.test.ts`,
`collection-markdown.test.ts`, `markdown.test.ts`, `collection-projection.test.ts`,
`sync-collection.test.ts`, and generic `sync-to-obsidian` tests. Fixture type updates
may be necessary; do not weaken existing assertions to accommodate unrelated changes.

On Windows, real symlink creation may require privileges. Always run deterministic
mocked `lstat` tests for each link type. Attempt real symlink integration where
supported; report a specific platform/permission limitation if it cannot run,
rather than silently skipping all ownership coverage. Regular-file replacement,
directory conflict, byte preservation, and retry must have real filesystem tests.
Tests injecting interruption verify failed preparation, not universal power-loss
durability. Include a changed-target recheck case without claiming concurrency safety.

## 10. Acceptance and verification

Automated acceptance requires the matrix above plus repository-required install,
full tests, typecheck, build, CLI startup and help checks during implementation:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node dist/cli/index.js
node dist/cli/index.js --help
node dist/cli/index.js youtube sync-obsidian --help
node dist/cli/index.js youtube sync-all --help
npm.cmd exec --offline --package=. -- knowledge-sync --help
git diff --check
```

No dependencies should be added. If a genuine blocker requires one, report it
before adding it. Do not perform unrelated npm audit remediation.

Manual acceptance for a later explicitly authorized real-vault run uses:

```powershell
node dist/cli/index.js youtube sync-all --vault "D:\obsidian"
```

For a nonempty snapshot, confirm:

1. The root page has the exact marker, readable headings, all persisted
   collections, and all persisted items exactly once.
2. `Sport` opens its existing collection note and its item link still opens the
   existing video note. Direct All items links also open canonical notes.
3. Existing canonical paths are unchanged; equivalent source input preserves
   existing item/collection Markdown bytes. No migration or duplicate page occurs.
4. Repeated equivalent snapshots produce identical navigation bytes, not a promise
   of unchanged modification times.
5. Conflicts and transient failures produce safe diagnostics/nonzero status and
   preserve unrelated user files. Exercise fault cases in fixtures, not by
   intentionally damaging the real vault.

Do not run real synchronization or modify the real vault during specification
preparation. Report automated versus manual evidence separately; do not claim
manual acceptance unless it was actually observed.

The implementation completion report must include changed files/directory layout,
dependencies added (expected none), architecture decisions, checks/results,
platform limitations, and any justified deviations, with independent review.
Specification authoring requires only reference, completeness, formatting, and
scope verification; no dependency installation, builds, or tests are needed now.

## 11. Non-goals and known limitations

- No filename migration, renaming, note deletion, new database schema, OAuth or
  collector change, playlist reconciliation redesign, or new provider.
- No transcript work, search infrastructure, RAG/LLMs, schedulers, cloud services,
  community plugins, automatic bookmarks, or Git automation.
- No aliases, existing collection reordering, per-note navigation backlinks,
  general locking, background cleanup, or generic navigation framework.
- Encoded filenames remain visible in the file explorer. The improvement is a
  readable entry page, not a change to explorer filename display.
- Existing item/collection writer overwrite and non-atomic behavior remain.
  User edits to those files are not preserved; recognized navigation-page edits
  are also replaceable. Path-length limitations remain.
- Full snapshot reads remain sequential, without cross-process isolation.
  Retained data can outlive remote availability; a fully empty snapshot leaves
  previous output untouched, including a potentially stale navigation page.
- Failed note exports can leave navigation links unresolved until a later run.
  Committed SQLite changes and successful earlier writes are never rolled back.
- The dedicated writer assumes no concurrent external modifications. Check/rename
  races, power-loss durability, and orphan temporary files are documented limits.

No unresolved architectural decision blocks implementation against this contract.
Implementation itself requires a separate assignment. The specification-authoring
step changes only this file, with no source, tests, database, vault, dependencies,
other documentation, commits, or pushes changed by that step.
