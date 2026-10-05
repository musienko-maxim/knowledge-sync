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
with an optional single final Obsidian export. Import recording remains deferred.

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
remaining playlists are counted as unattempted. No automatic retry or rollback occurs.

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
Export: attempted=3 succeeded=3 failed=0
```

Item counters sum processing events from **successfully completed playlists only**;
they exclude partial writes from failed playlists and are not unique video counts.
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
repair a missing membership even when the item itself is unchanged. Missing
items, playlists, and memberships are retained; this is observed membership
history, not reconciliation with current playlist contents.

`openStorage()` exposes `collections.upsert/listAll` and
`collectionMemberships.add/listAll` on the existing connection. SQLite enforces
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
creates, replaces, or deletes the separate relationships. Obsidian collection
pages and a projection of all memberships are deferred.

## Playlist sync and Obsidian export

```powershell
node dist/cli/index.js youtube sync-obsidian "https://www.youtube.com/playlist?list=PL123" --vault "D:\obsidian"
node dist/cli/index.js youtube sync-obsidian PL123 --auth oauth --db "D:\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

The separate `youtube sync-obsidian <playlist>` command collects and persists the
playlist, then attempts export of **every item in the selected database**, including
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
Export: attempted=15 succeeded=14 failed=1
```

Full success exits 0. Any export failures still print both statistics lines,
report each failed snapshot index (zero-based), quoted identity, and safe reason
to stderr, and exit 1. Fatal configuration/auth/collection/storage errors also
exit 1, using existing credential-safe diagnostics. Arbitrary error messages,
stacks, causes, and objects are not printed. Storage is closed before reporting
results or fatal application failures.

SQLite remains the source of truth; output failure does not undo successful
persistence. A later successful sync attempts unchanged items again. Generated
notes overwrite existing content at their paths, including local edits. There
is no retry, rollback, reconciliation, or deletion. An empty database snapshot
returns zero export counts without accessing the vault, so that result alone
does not prove a configured vault is usable.

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
mirrors SQLite: individual writes can fail and no reconciliation/deletion occurs.
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
completes collection/item/membership persistence before the same snapshot/export
sequence. Ordinary `youtube sync` uses
[`syncCollection`](src/application/sync-collection.ts) and performs no export.

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
  persistence, and provide the corresponding CLI operations.
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
  delegates sequentially with per-entry failure collection. These operations add
  no timestamps or import metadata.
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

Work stops at Task 016 account-wide synchronization. `youtube sync` collects,
classifies, and persists items and relationships into SQLite;
`youtube sync-obsidian` additionally exports the persisted
snapshot. `youtube sync-all` adds the OAuth account loop. None of these commands
records import/export state or manages Git. Reconciliation, collection pages,
and changes to legacy collection output remain deferred.
