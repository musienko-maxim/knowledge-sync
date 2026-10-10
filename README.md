# knowledge-sync

A local-first CLI for collecting saved knowledge and exporting Markdown directly
into an existing Obsidian Vault. Synchronization is manual and infrequent;
`youtube sync-obsidian` collects, persists, and exports in one command.

## Current status

Task 001 established the domain model, collector and output interfaces, SQLite
synchronization state, and CLI help. Task 002 adds a YouTube playlist collector
that returns validated `KnowledgeItem[]`. Task 003 adds Google Desktop OAuth,
local authorization commands, and discovery of owned playlists. Task 004 adds a
SQLite-backed repository for normalized `KnowledgeItem` objects, separate from
import state. Task 005 connects a collector to that repository through an internal
`sync(collector, repository)` function. Task 006 exposes manual single-playlist
sync to SQLite through `youtube sync <playlist>`, using API-key or OAuth access.
Task 007 classifies each collected entry as new, changed, or unchanged against
its current stored state, while continuing to upsert every entry.
Task 008 adds a pure, deterministic `KnowledgeItem` Markdown renderer.
Task 009 adds a filesystem writer for already-rendered text at a caller-supplied
path below an existing vault. The Task 010 path builder maps stable item identity
to a relative note path. Task 011 composes these primitives to export one supplied
item. Task 012 exports a supplied array sequentially, collecting individual
failures and returning entry-based statistics. Task 013 adds `syncToObsidian`,
which syncs, reads all persisted items, and attempts their Obsidian export.
Task 014 exposes this through `youtube sync-obsidian`, reporting sync/export
statistics and non-zero status for incomplete export. Task 015 adds persistent
collections and many-to-many memberships to both single-playlist commands.
Task 016 adds OAuth-only account-wide synchronization through `youtube sync-all`,
with an optional single final Obsidian export. Task 017 adds deterministic collection
notes linked to existing item notes in both export commands. Task 018 reconciles
stale memberships after each complete successful playlist sync. Import recording remains deferred.
Task 020 adds a readable root `Knowledge Sync.md` navigation page to both export
commands, with deterministic links and protection for user-owned destination files.
Automated validation is complete; real-world Obsidian acceptance is a separate step.

## Development

Requires Node.js 24 or newer and npm. The SQLite driver uses a native module;
platforms without a prebuilt binary require native build tools.

```sh
npm install
npm run build
npm run typecheck
npm test
npm run dev -- --help
node dist/cli/index.js --help
npm exec --package=. -- knowledge-sync --help
```

Running the CLI without arguments also prints help. The package declares the
`knowledge-sync` executable; npm exec above runs it without a global installation.

## Configuration

`.env.example` is a reference template. Set supported variables in your shell's
process environment; the CLI does **not** automatically load `.env`.

The database path is selected in this order: `--db`, `DATABASE_PATH`, then
`./data/knowledge-sync.sqlite`. Relative paths use the current working directory;
missing parent directories are created. Blank explicit database paths are rejected.
Keep the database **outside the vault**. If `OBSIDIAN_VAULT_PATH` is set, the command
rejects database paths inside it, including existing symlink/junction aliases.
Without that setting, ordinary `youtube sync` requires you to choose an external
database location yourself. `youtube sync-obsidian` checks the database against
its effective vault (`--vault` over `OBSIDIAN_VAULT_PATH`), including aliases.
Startup and help do not access credentials or create a database.

API-key mode reads `YOUTUBE_API_KEY`; OAuth mode uses the existing external
credentials and refresh-token files and does not require an API key.

## Manual playlist synchronization

Sync exactly one playlist ID or supported YouTube playlist URL:

```powershell
# Set YOUTUBE_API_KEY in the process environment before using the default mode.
node dist/cli/index.js youtube sync PLxxxxxxxx
node dist/cli/index.js youtube sync "https://www.youtube.com/playlist?list=PLxxxxxxxx" --auth api-key

# After completing the OAuth setup below:
node dist/cli/index.js youtube sync PLxxxxxxxx --auth oauth --db D:\data\knowledge-sync.sqlite
```

Authentication is explicit (`api-key` by default, or `oauth`); failures never
trigger a fallback to another mode. Successful runs print `Processed N items.`
and a separate `Memberships: removed=N` line.
The count is collected entries processed, including duplicate identities, rather
than new or changed rows. Existing items are upserted; missing items are retained.
Collection failure writes no items, collections, or memberships. A persistence
failure leaves earlier successful writes intact and exits unsuccessfully;
storage is closed in either case.
No import/export record is created by this command.

OAuth refresh failures preserve re-login guidance for `invalid_grant`, retry
guidance for network/transient failures, and safe diagnostics for unknown failures,
including refreshes during pagination. Raw error bodies and credential-bearing
causes are not printed.

## Account-wide synchronization

After the OAuth setup below, synchronize all **owned** playlists:

```powershell
node dist/cli/index.js youtube sync-all
node dist/cli/index.js youtube sync-all --db "D:\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

`sync-all` is OAuth-only and has no `--auth` option. It reuses one OAuth
provider/client, completes owned-playlist discovery, then synchronizes playlists
sequentially in discovery order through the existing collection-aware path.
Empty playlists are persisted. Shared videos remain one item with multiple
memberships. Discovery covers owned playlists, not all saved/followed playlists.

Only an explicit `--vault` enables export; `OBSIDIAN_VAULT_PATH` alone does not.
A requested vault must be a nonblank existing directory, checked before OAuth or
persistence. This does not guarantee later note writes will succeed. Database
precedence is `--db`, `DATABASE_PATH`, then `./data/knowledge-sync.sqlite`.
The database must be outside the selected vault, including symlink/junction aliases.
Without `--vault`, the ordinary environment-vault containment guard still applies.
No configuration file is loaded automatically.

Ordinary playlist access, API transport/server, metadata, and individual operation
failures are recorded and later playlists continue. Earlier successful writes
remain, including partial writes from a failed playlist. OAuth/provider failures,
API credential rejection, quota exhaustion, and structured SQLite full-disk, I/O,
corruption, invalid-database, read-only, or cannot-open errors stop further work
and suppress export. Initial setup/discovery failures start no playlist sync.
Previously completed work and failures remain reportable after a late fatal error;
remaining playlists are counted as unattempted. There is no automatic retry or global
rollback. Each successful playlist keeps its reconciliation; failed or unattempted
playlists retain their previous memberships plus any earlier additive progress.

When requested and no fatal error interrupted the run, one snapshot read and one
batch export follow all playlist attempts—even if every playlist failed or none
were discovered. The snapshot contains **all persisted items**, including other
sources and retained playlists. Playlist failures, snapshot/batch exceptions, and
individual note failures remain observable together. Export never undoes SQLite
writes. Exit status is zero only when all requested work succeeds.

Example summary:

```text
Playlists: discovered=3 succeeded=2 failed=1 unattempted=0
Items: processed=4 new=3 changed=1 unchanged=0
Memberships: removed=2
Export: attempted=3 succeeded=3 failed=0
Collections: attempted=2 succeeded=2 failed=0
```

Item counters sum processing events from **successfully completed playlists only**;
they exclude partial writes from failed playlists and are not unique video counts.
Membership removal counts likewise include only successfully reconciled playlists.
The legacy collection title still affects classification, so a shared video can
count as changed on repeated account runs. Failure diagnostics quote/escape
playlist identities and titles and do not dump unknown errors or credential causes.

## Collections and memberships

One `KnowledgeItem` represents one source item (one video for YouTube). A
`KnowledgeCollection` represents a playlist, identified by `(source, sourceId)`,
with a mutable title. `CollectionMembership` relates the two using
`(source, collectionSourceId, itemSourceId)`. Titles never identify relationships.
The same video can belong to several playlists while remaining one item and one
Markdown note. Repeated membership persistence is idempotent.

Both single-playlist commands collect all pages before any domain writes. They
persist the collection, then sequentially classify/upsert each item and add its
membership. An empty playlist, including one with no usable entries, still
persists its collection and updates its title. A persistence failure stops later
entries and skips export without rolling back earlier writes. A later run can
repair a missing membership even when the item itself is unchanged.

Only after all collection, item, and current membership writes succeed does
`syncCollection()` remove stale memberships for that collection. The desired set
uses source plus item ID, deduplicating repeated entries without changing item
counters. A successful empty or all-filtered normalized snapshot removes every
membership in that collection. Collector errors, including failed pagination or
inaccessible playlists, never authorize removal. Existing collector filtering is
unchanged: reconciliation describes the complete normalized snapshot, not raw
unusable API entries.

The destructive phase runs in a short SQLite transaction: a failed removal restores
all deletions in that phase while retaining earlier additive writes. It uses the
existing composite index and bounded queries, without a schema change or a transaction
around the whole sync. Items, collections, import metadata, other collections'
memberships, and Obsidian files are retained. Absence from account discovery does
not authorize removal; the schema has no account-ownership provenance. Legacy
`KnowledgeItem.collection` text is never used for reconciliation.

`openStorage()` exposes `collections.upsert/listAll` and
`collectionMemberships.add/listAll/removeStaleForCollection` on the existing connection. SQLite enforces
same-source composite foreign keys to existing collections and items, and a
unique relationship triple. Lists are ordered by source and identity components.
Playlist position and repeated occurrences within one playlist are not modeled.

Opening an older database adds the new tables without changing existing items
or import records. There is no historical membership backfill: old `collection`
text is a title, not a playlist ID, and overwritten associations cannot be
recovered from it. Re-sync playlists to populate their authoritative relationships.

`KnowledgeItem.collection` remains **legacy compatibility metadata** containing
the last synchronized playlist title. Existing classification and Markdown still
include it, so alternating playlists can mark a shared video changed and update
its displayed collection. It cannot express complete membership and never
creates, replaces, or deletes the separate relationships. Collection notes use only
these authoritative relationships, never the legacy title field.

## Playlist sync and Obsidian export

```powershell
node dist/cli/index.js youtube sync-obsidian "https://www.youtube.com/playlist?list=PL123" --vault "D:\obsidian"
node dist/cli/index.js youtube sync-obsidian PL123 --auth oauth --db "D:\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

The separate `youtube sync-obsidian <playlist>` command collects and persists the
playlist, then attempts export of **every item and collection in the selected database**, including
other playlists/sources and unchanged items. Ordinary `youtube sync` remains
SQLite-only and does not accept `--vault`.

Authentication remains `--auth api-key` (default, using `YOUTUBE_API_KEY`) or
`--auth oauth`. Database precedence remains `--db` → `DATABASE_PATH` →
`./data/knowledge-sync.sqlite`. Vault precedence is `--vault` →
`OBSIDIAN_VAULT_PATH` → configuration error, with no implicit default or automatic
vault creation. The CLI reads process environment variables, not `.env` files.
An explicit blank `--vault` fails without falling back; missing/blank environment
configuration also fails before dependency setup. Nonblank paths retain their
supplied text; relative paths use the working directory. SQLite must be outside
the selected vault, including symlink/junction aliases. An overridden environment
vault does not govern that check.

Example output (counts may differ because export covers persisted identities):

```text
Sync: processed=12 new=2 changed=1 unchanged=9
Memberships: removed=2
Export: attempted=15 succeeded=14 failed=1
Collections: attempted=3 succeeded=3 failed=0
Navigation: succeeded=1 failed=0
```

Full success exits 0. Navigation failures print a safe diagnostic and exit 1 while
retaining completed item and collection results. Individual export failures still print separate item and collection counts,
report each failed snapshot index (zero-based), quoted identity, and safe reason
to stderr, and exit 1. Fatal configuration/auth/collection/storage errors also
exit 1, using existing credential-safe diagnostics. Arbitrary error messages,
stacks, causes, and objects are not printed. Storage is closed before reporting
results or fatal application failures.

SQLite remains the source of truth; output failure does not undo successful
persistence. A later successful sync attempts unchanged items again. Generated
notes overwrite existing content at their paths, including local edits. There
is no automatic retry, output rollback, vault scanning, or file deletion. A completely empty projection
(no items or collections) returns zero counts without accessing the vault. An empty
playlist still produces a collection note: unlike the earlier item-only behavior,
`sync-obsidian` with an empty playlist and a nonexistent vault now fails.

## Markdown rendering

`renderKnowledgeItemMarkdown(item: KnowledgeItem): string` is exported from
`src/outputs/markdown.ts`. It performs no I/O and does not mutate or revalidate
the supplied item. It is independent of synchronization and the CLI.

The document contains YAML front matter in this order: `source`, `sourceId`,
`url`, `title`, `author`, `collection`, `publishedAt`. All values are double-quoted
with deterministic escaping. Optional metadata is omitted only when undefined;
empty author/collection strings remain explicit `""`. Publication dates retain
their supplied representation. Description appears only in the body.

After the closing front-matter delimiter and a blank line, the renderer prefixes
the verbatim title with `# `. An absent description leaves the body as
`# <title>\n`; an empty description produces `# <title>\n\n`. A present description
follows that blank line unchanged. The renderer appends a final `\n` only if the
assembled document does not already end with one.

Generated separators use LF on every platform. Supplied title and description
content retains whitespace, CRLF, trailing blank lines, and Markdown syntax.
Consequently, the output need not be entirely LF, and arbitrary title content
may produce more than one heading or other Markdown structures. This renderer
does not sanitize Markdown or generate filenames, write files, or record imports.

## Obsidian note writing

`writeObsidianNote(vaultPath, relativePath, content): Promise<void>` is exported
from `src/outputs/obsidian/write-note.ts`. The caller supplies final Markdown text
and the destination path; the writer does not render, generate filenames, read
configuration, or participate in sync. The existing `Output.write(item)` interface
is unchanged.

The vault must already exist and be a directory. Blank vault paths are rejected;
relative vault paths resolve against the working directory. Destination paths
must be relative and resolve strictly below the vault root. Empty/root-equivalent
paths and traversal outside the vault are rejected before filesystem changes.
Contained normalization such as `folder/../note.md` is allowed. Path rules are
native to the host: Windows handles both separators and rejects rooted, drive-qualified
(including `C:note.md`), and UNC destinations; POSIX keeps its native filename semantics.
Otherwise valid path values are not trimmed or sanitized.

Missing parent directories below the vault are created recursively. Existing
files are overwritten completely with UTF-8 text, without adding a BOM or changing
content, whitespace, Unicode normalization, or line endings. Repeated writes
produce the same file content; filesystem errors propagate. Containment is lexical
only, so symlinks are followed normally. Writes are not atomic and a failed write
may leave a truncated or partially written file. The writer does not discover
vaults, read configuration, or orchestrate batches.

## Single-item Obsidian export

[`exportObsidianNote(vaultPath, item): Promise<void>`](src/outputs/obsidian/export-note.ts)
exports a supplied `KnowledgeItem` into an existing vault. It calls the existing
path builder, then renderer, then awaits one writer call. Inputs, generated path,
and Markdown content pass through unchanged; errors reject with the original
failure. It reads no configuration or database and does not record an import.

The pure [path builder](src/outputs/obsidian/note-path.ts) maps only `source` and
`sourceId` to `<encoded-source>/<encoded-sourceId>.md`. Metadata changes do not
move the note. Encoding protects identity distinctions on case-insensitive
filesystems, escapes unsafe characters, and protects Windows device names.
It does not truncate long identities, so native filesystem length limits can
still cause an export to fail.

Each call writes the item, including repeated unchanged items. Existing content
is overwritten through the writer; this single-item function applies no
incremental-export policy.
The writer's lexical containment and non-atomic behavior still apply: failures
can leave created directories or partial content. `sync-obsidian` reaches this
function through application orchestration and the batch exporter.

## Batch Obsidian export

[`exportObsidianNotes(vaultPath, items): Promise<ObsidianBatchExportResult>`](src/outputs/obsidian/export-notes.ts)
accepts `readonly KnowledgeItem[]` and awaits `exportObsidianNote()` once per
entry in input order, including duplicates. An individual failure is captured
and processing continues. The batch waits for the final entry to settle.

The result contains `processed`, `succeeded`, `failed`, and `failures`. Each
failure stores its zero-based `index`, original `item` reference, and unchanged
`error: unknown`, in ascending input order. On normal completion,
`processed === items.length`, `processed === succeeded + failed`, and
`failed === failures.length`. No input array or item is mutated.

Success means that entry's export call resolved; it does not count unique files
or guarantee final file contents. A later duplicate may overwrite an earlier
entry's note, and a failed non-atomic write can leave partial content. There is
no deduplication, retry, rollback, or collision detection.

Vault validation stays in the single-item pipeline. An invalid vault that fails
every export produces one failure per entry. Empty input returns all-zero counts
and an empty failures array without accessing the vault. The batch has no CLI,
sync, configuration, or persistence integration.

## Sync to Obsidian

[`syncToObsidian(collector, repository, vaultPath)`](src/application/sync-to-obsidian.ts)
awaits the existing `sync()`, then `repository.listAll()`, then
`exportObsidianNotes(vaultPath, items)`. It returns `SyncToObsidianResult` with the
original nested `{ sync, export }` results. The caller owns storage setup/cleanup
and supplies the existing vault path; this operation does not load configuration.

SQLite is the source of truth for export. Every persisted `KnowledgeItem` is
attempted on every successful sync, including unchanged items and items absent
from the current collection. `listAll()` reads the full snapshot in explicit
ascending `source`, then `sourceId` order. Duplicate collected identities resolve
to their final stored value, so sync and export entry counts can differ.

This full projection is an export policy, not a guarantee that the vault exactly
mirrors SQLite: individual writes can fail and no filesystem cleanup occurs.
An item whose export fails remains persisted and will be attempted on a later
successful sync even if classified unchanged. There is no durable export-state
tracking or import recording. Existing notes are overwritten, including local
edits at their generated paths; writes retain the existing non-atomic behavior.

Sync failure skips the snapshot read and export. Read failure skips export.
These failures and unexpected exporter-level failures propagate unchanged;
earlier successful persistence remains committed. Normal per-item output failures
resolve through `ObsidianBatchExportResult.failures` in the nested export result.
There are no retries, rollback, compensating writes, or transactions spanning
SQLite and the filesystem. Empty snapshots use the normal exporter and access
no vault. This generic use case remains available. The CLI now uses
[`syncCollectionToObsidian`](src/application/sync-collection-to-obsidian.ts), which
completes collection/item/membership persistence and reconciliation before the shared collection-aware
snapshot/export sequence described below. Ordinary `youtube sync` uses
[`syncCollection`](src/application/sync-collection.ts) and performs no export.

## Collection notes and full projection

Both export commands share [readObsidianSnapshot](src/application/read-obsidian-snapshot.ts)
and [exportObsidianProjection](src/outputs/obsidian/export-projection.ts). All three
repository reads complete before any filesystem output. The pure projection builder
rejects duplicate identities/edges and missing parents before writing. Joins use
complete source plus ID identities; collection/member order uses ordinal source/ID
comparison, independent of titles and input order. The sequential reads assume a
single manual writer; they are not a transactionally isolated cross-process snapshot.

Collection notes live at `<encoded-source>/collections/<encoded-collection-id>.md`.
The existing byte encoder is reused, so renames retain paths and equal titles with
different IDs remain separate. Existing item paths and Markdown bytes are unchanged.
Collection front matter is ordered `source`, `sourceId`, `title`; it preserves an
empty raw title while the heading falls back to the collection ID. Headings and
link labels escape Markdown/HTML and normalize embedded line breaks. Member links
use relative paths with a separate URL encoding pass: a literal `%58.md` file is
linked as `../%2558.md`. Notes use LF and one final newline. Empty collections show
`_No items._`.

Item export runs first. Individual item failures do not suppress collection notes;
links can therefore temporarily point to missing item notes. An unexpected item
batch exception stops the collection phase. An unexpected collection batch exception
retains completed item counts and the original error in a tagged failure outcome.
The CLI prints safe diagnostics and exits nonzero for either batch's failures.
Rerunning retries every persisted note and repairs partial output. There is no
stale-file deletion, durable export tracking, or atomic
multi-file write. Existing generated notes, including local edits, are overwritten.
Reconciled memberships naturally disappear from collection links on the next export;
orphan item notes remain because their items remain persisted. An export failure
does not roll back reconciliation, and a later successful export repairs the projection.

## Navigation page

Both `youtube sync-obsidian` and `youtube sync-all --vault <path>` generate
`Knowledge Sync.md` at the vault root after the item and collection batches.
Open it in Obsidian for readable **Collections** and **All items** links. Every
persisted entity appears once, including shared items and items whose memberships
were removed. Canonical filenames and existing item/collection Markdown stay the
same; encoded filenames are still visible in the file explorer.

Display titles use NFC, control-to-space conversion, collapsed whitespace, and
empty-title fallbacks. Each section sorts by normalized title, then source and
ID, using locale-independent comparison. Equal normalized titles receive an
identity suffix. Links encode literal filenames separately from display text.
Equivalent snapshots produce identical navigation bytes, without timestamps.

The page is owned by the generator only when its first line is exactly
`<!-- knowledge-sync:generated-navigation:v1 -->` (an optional UTF-8 BOM and
LF/CRLF are recognized). A user-owned file, directory, or symlink at that path
is preserved and reported as a failed navigation export. Move a conflicting user
note to another filename before retrying. Edits to a recognized generated page
are replaced on the next run.

The dedicated writer prepares and closes a complete sibling temporary file before
renaming it over the destination. Preparation/replacement failures preserve the
previous page. Cleanup removes only temporary files created by that invocation;
an abrupt stop may leave an orphan that future runs preserve. Use one writer per
vault with no concurrent external edits: ownership checks do not eliminate
check/rename races or promise power-loss durability on every filesystem.

Ordinary note failures still allow navigation generation, so some links can remain
unresolved until a successful rerun. Unexpected batch exceptions skip navigation.
A completely empty snapshot also skips it and leaves any previous page untouched.
SQLite progress and successful earlier writes remain after navigation failure.
Non-export commands do not create or report navigation.

## YouTube account setup

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** for that project.
3. Configure the Google OAuth consent screen (Google Auth Platform branding/audience).
4. Create an OAuth client with application type **Desktop app** and download its JSON.
5. If the app is in **Testing**, add your intended Google account as a test user.
6. Place the JSON at the default credentials location below, or export
   `KNOWLEDGE_SYNC_GOOGLE_CREDENTIALS_FILE` with its path outside the repository.
   The CLI reads this environment variable directly; it does not load `.env`.
7. Run `knowledge-sync youtube auth login` and open the printed consent URL in your
   browser. Only `youtube.readonly` access is requested. Login waits up to five
   minutes for a loopback callback; no manual authorization-code copy/paste is used.
8. Verify access with `knowledge-sync youtube auth status`, then
   `knowledge-sync youtube playlists`.

If the executable is not installed, substitute `node dist/cli/index.js` for
`knowledge-sync` after `npm run build`.

> For an External OAuth app whose publishing status is Testing, Google normally
> issues refresh tokens that expire after 7 days when non-profile scopes such as
> YouTube read-only are requested. Weekly use may therefore require login again
> until the OAuth app configuration is moved out of Testing or an applicable
> administrative exception exists.

See Google's [Desktop OAuth guide](https://developers.google.com/identity/protocols/oauth2/native-app)
and [refresh-token expiration guidance](https://developers.google.com/identity/protocols/oauth2#expiration).

| Platform | Default configuration directory |
| --- | --- |
| Windows | `%APPDATA%\knowledge-sync\` |
| macOS | `~/Library/Application Support/knowledge-sync/` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/knowledge-sync/` |

The credentials filename is `google-client-secret.json`; the token filename is
`youtube-oauth.json` in the same default configuration directory. Overriding the
credentials path does not move token storage. Only the refresh token is persisted,
using an atomic replacement and restrictive POSIX permissions where supported.
Access tokens stay in memory. Both files must remain outside the repository;
tokens are never stored in SQLite. Protect the config directory with your OS
account permissions; this task does not add encryption or an OS keychain.

`knowledge-sync youtube auth status` reports missing/invalid configuration,
missing authorization, or unusable authorization with a non-zero exit code;
successful status verifies that an access token can be obtained/refreshed.
`knowledge-sync youtube auth logout` removes only the local refresh token and is
safe to repeat. It does **not** revoke access in Google; remote revocation is out
of scope.

`youtube playlists` lists IDs and titles for playlists **owned by** the authorized
user, following all API pages in order. The API's `mine=true` does not enumerate
every playlist the user has viewed, followed, or saved. This command does not
collect videos. Code-level account collection uses the same OAuth-authenticated
client for discovery and item retrieval and retains playlist grouping without
cross-playlist deduplication. The OAuth-authenticated path is intended to support
playlists accessible to the authorized account, including owned private playlists.
OAuth collection passed a live smoke test, but the tested playlist's visibility
was not verified; private-playlist access was not independently confirmed.

## Architecture

Application orchestration flow (exposed by `youtube sync-obsidian`):

```text
CollectionCollector → syncCollection() → SQLite source of truth → persisted snapshot
  → Obsidian export → Local Obsidian Vault → Git managed separately
```

- `src/core/models`: source-independent Zod schema and inferred TypeScript types;
  publication dates are ISO 8601 strings with a timezone.
- `src/collectors`: asynchronous collector interface; raw source payloads stay here.
  YouTube uses a replaceable API client with API-key or OAuth authentication,
  preserving playlist/item order. Account discovery has its own narrow interface.
- `src/auth`: Desktop OAuth, external client configuration, and refresh-token storage.
- `src/application`: `sync()` collects, classifies, and persists through contracts;
  `syncToObsidian()` then reads the persisted snapshot and invokes batch export.
  The collection-aware variants reuse item classification, await membership
  persistence, and read all three repositories before the shared full projection.
  `syncAccount()` awaits discovery, sequential `syncCollection()` calls, and an
  optional final snapshot/export. Tagged results retain partial summaries and
  original fatal/export errors. Source-specific acquisition and fatal API
  classification are supplied by the small `AccountSyncSource` boundary.
- `src/storage`: `KnowledgeItemRepository` exposes asynchronous `findByIdentity`
  and `upsert` methods plus ordered `listAll()`; the existing import-state interface stays synchronous.
  `openStorage(path).knowledgeItems` shares the same SQLite/Drizzle connection
  and `close()` lifecycle as import-state operations. Both `knowledge_items` and
  `imported_items` enforce `PRIMARY KEY (source, source_id)`. Item upserts replace
  normalized fields; repeated imports preserve the original URL and import time.
  Titles never determine identity. `collections` and `collection_memberships`
  track source collections and their many-to-many item relationships separately.
- `src/outputs`: pure Markdown renderer and asynchronous output contract;
  `obsidian/note-path.ts` maps identity to a relative path, `write-note.ts` writes
  supplied text, and `export-note.ts` composes them for one item. `export-notes.ts`
  delegates sequentially with per-entry failure collection. Collection projection,
  path/render/link helpers, and collection exporters reuse these contracts and the
  same writer. These operations add no timestamps or import metadata.
- `src/cli`: Commander factory separated from the executable for testing;
  single-playlist composition owns authentication selection, database-path
  resolution, and storage cleanup. `sync-obsidian` also resolves the vault, invokes
  the existing higher-level application operation, and presents output/exit status.

SQLite stores normalized items separately from synchronization metadata.
Optional domain fields use SQL NULL and are omitted on reads; empty text stays
empty and publication dates retain their original ISO string. Upserts insert or
replace the mutable fields for one identity, without adding timestamps or import
records. Additive `CREATE TABLE IF NOT EXISTS` bootstrap DDL also opens older
import-only and pre-Task-015 databases without changing their records. New
relationship tables start empty; historical title text is not migrated into IDs.

`sync(collector, repository)` awaits one complete collection, then processes each
entry sequentially: look up `(source, sourceId)`, classify, and await its upsert.
It returns `{ processed, new, changed, unchanged }` only on success, with
`processed === new + changed + unchanged`. Counts describe collected entries,
including duplicates, rather than unique rows or imports. Every entry is upserted,
including unchanged entries. Ordinary `youtube sync` prints only `Processed N items.`

Missing identities are new. Existing items are unchanged when all six persisted
non-identity fields match: `url`, `title`, `description`, `author`, `collection`,
and `publishedAt`; otherwise they are changed. Omitted optional fields and explicit
`undefined` are equivalent; empty text is distinct from absence. Dates compare as
exact stored strings, including timezone and precision, without normalization.

Each lookup observes earlier writes, so duplicates can be new then unchanged,
or new then changed. Repeating a batch with different versions of one identity
can still count changes. The last occurrence supplies the stored representation.
Items absent from a later run remain stored; there is no deduplication or removal
detection. The legacy singular collection limitation still applies to item
classification, while the separate membership rows retain all observed associations.

Collector failure causes no repository calls. A lookup or upsert failure propagates unchanged
and stops later entries; earlier completed writes remain. There is no rollback,
automatic retry, or partial success result, and no guarantee that a rejecting
repository operation left its own item unchanged. An empty collection succeeds
with all four counters zero. The caller owns storage setup and cleanup, including on
failure. This operation does not record imports or orchestrate account-wide results.

Markdown in the vault is the derived user-facing knowledge output. The application
orchestration connects persistence to output; import-state orchestration is deferred.
Git remains independently managed.

## MVP direction and scope

The MVP direction is (collection, normalization, persistence, manual
single-playlist CLI synchronization, pure Markdown rendering, stable note paths,
single-item/batch filesystem export, sync/export orchestration, and CLI export
are implemented):

```text
YouTube Playlist → KnowledgeItem → SQLite → Markdown → Obsidian
```

Facebook integration, AI processing, scheduling, background execution, Git
automation, web UI, Docker, and cloud infrastructure are out of scope.
Watch Later, arbitrary saved/followed-playlist discovery, and Likes synchronization
are unsupported. The collector handles one playlist at a time; account collection
calls it sequentially and preserves per-playlist groups. Single-playlist sync now
persists many-to-many membership. The singular `collection` field retains its
compatibility behavior described above. `sync-all` now persists every owned
playlist sequentially and optionally exports once after the loop.

Work stops at Task 018 per-collection membership reconciliation. `youtube sync` collects,
classifies, and persists items and relationships in SQLite, then removes stale
memberships after a complete successful collection sync;
`youtube sync-obsidian` additionally exports the persisted
snapshot. `youtube sync-all` adds the OAuth account loop. None of these commands
records import/export state or manages Git. Collection/item deletion, filesystem
cleanup, and changes to legacy item-note collection metadata remain deferred.
