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

Task 021 adds local Facebook Saved import from an extracted `collections.json`.
It shares the existing SQLite repositories and optional full-snapshot export.
Real-vault acceptance is a separate step.

Task 024 adds portable readable filenames, a shared immutable export plan,
content fingerprints and non-destructive phased publication for every source.
`export obsidian --db ... --vault ... [--dry-run]` exports existing SQLite without
synchronization or credentials. These rules supersede the earlier identity-only
filename and overwrite behavior described in the historical task progression.

## Facebook Saved import

```powershell
node dist/cli/index.js facebook import --file "D:\imports\collections.json" --db "D:\data\knowledge-sync.sqlite"
node dist/cli/index.js facebook import --file "D:\imports\collections.json" --db "D:\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

Use the extracted Facebook `collections.json`, with the verified Ukrainian
labels described in [the source-format report](docs/task-021-source-format.md).
ZIP archives and `your_saved_items.json` are unsupported command inputs. The
importer makes no network requests. Correct Unicode is preserved; a narrow,
strict repair handles the verified encoding defect in labels and metadata.
URLs and collection identifiers are never repaired or canonicalized.

Item identity is `facebook` plus `url-v1-` and the full lowercase SHA-256 of the
exact validated URL's UTF-8 bytes. Collection identity uses its original decimal
FBID string. Different URLs remain different items even when they lead to the
same content. Repeated records and membership edges are deduplicated separately.
Missing URLs are counted as skipped entries; malformed recognized input fails
before opening the database. File limits are 16 MiB, 5,000 collections, 100,000
Saved occurrences, nesting depth 32, 65,536 UTF-16 units per string, and 128
decimal digits per collection ID.

Complementary metadata is merged field by field. Conflicting nonempty optional
values are omitted for new items; a conflicting title uses a deterministic
`Facebook Saved — <Type> — <12 hash characters>` fallback. Existing meaningful
values survive conflicts and sparse updates. An exact recomputed fallback can
be promoted to an unambiguous explicit title. Save times are not publication
dates. Collection titles update from the supplied archive, so an older archive
can revert a collection's name. Conflicting names for one ID within a file fail
validation.

Persistence is sequential: collections, items, then unique memberships. Membership
writes are additive; missing entries never remove stored relationships or files.
A storage failure stops the run, retains completed writes and counters, and
suppresses export. Retrying converges without duplicating records. Item import
does not record synchronization/import-state metadata.

Only explicit `--vault` enables export; `OBSIDIAN_VAULT_PATH` alone does not.
Database path precedence remains `--db`, `DATABASE_PATH`, then
`./data/knowledge-sync.sqlite`, with the existing vault-exclusion checks.
Export uses every persisted source, collection, and membership, including retained
items, to generate notes, collection pages, and `Knowledge Sync.md`.

Facebook notes and collection pages carry an ownership marker identifying the
version, entity kind, source, and complete identity. Export refuses unowned
collisions and symlink/junction paths, checks intermediate directories, and uses
exclusive temporary files followed by replacement. Failed replacement preserves
existing bytes. Facebook text is rendered literally. These protections also
apply to every source when a YouTube or Facebook command exports stored records.
Task 024 adds content fingerprints and readable filenames; old files remain
untouched. Keep personal edits in separate notes; modified generated destinations
block replacement.

CLI summaries distinguish input occurrences, URL-bearing entries, duplicate items,
repeated memberships, skips, persistence results, and export results. Warning and
failure diagnostics omit Facebook URLs, FBIDs, and private metadata. Handled skips
and metadata warnings exit successfully; invalid input, storage failures, and
requested export failures exit 1. Concurrent external edits and universal
power-loss durability are not guaranteed; abruptly interrupted writes can leave
temporary files.

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

For synchronization/import commands, the database path is selected in this order: `--db`, `DATABASE_PATH`, then
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
Collections: skipped (earlier export failure)
Navigation: skipped (earlier export failure)
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
notes replace only verified unmodified generated destinations. There
is no automatic retry, output rollback, or file deletion. A completely empty projection
(no items or collections) returns zero counts without accessing the vault. An empty
playlist still produces a collection note: unlike the earlier item-only behavior,
`sync-obsidian` with an empty playlist and a nonexistent vault now fails.

## Readable Markdown export

Task 024 uses the current persisted title plus a stable identity suffix for
physical filenames:

```text
youtube/understanding-ai--<32-hex>.md
youtube/collections/my-learning--<32-hex>.md
facebook/цікава-стаття--<32-hex>.md
```

Titles use NFC, default lowercase and Unicode letters/marks/numbers. Prefixes
are bounded to 80 code points and 160 UTF-8 bytes without splitting graphemes.
The suffix is the first 32 lowercase SHA-256 hex characters of UTF-8
`JSON.stringify(["knowledge-sync-readable-path-v1", kind, source, sourceId])`,
where kind is `item` or `collection`. Full original identities remain unchanged
in SQLite and ownership metadata. Source directories retain their safe byte
encoding. Windows-invalid components, portable case/Unicode collisions, and
absolute target or temporary paths exceeding 240 UTF-16 units block export.

A title change creates a new filename; **the old file remains**. Generated links
point to current planned destinations. Historical files are never adopted,
renamed or deleted automatically. Removing them later can break user-authored
backlinks, which this tool does not rewrite.

## Export existing SQLite without synchronization

Both paths are required; this command has no environment/default database
fallback and never opens writable storage or requests source credentials.
The vault must already exist, and SQLite must be outside it.

```powershell
npm.cmd run build
node dist/cli/index.js export obsidian --db "D:\data\knowledge-sync.sqlite" --vault "D:\scratch\export-vault" --dry-run
node dist/cli/index.js export obsidian --db "D:\data\knowledge-sync.sqlite" --vault "D:\scratch\export-vault"
npm.cmd exec --offline --package=. -- knowledge-sync export obsidian --help
```

`--dry-run` reads one consistent SQLite transaction, renders the same immutable
plan used by publication, and checks all expected destinations. It creates no
files/directories and modifies neither SQLite nor its sidecars. Output reports
additions, updates, unchanged files, blockers and possible legacy/stale files.
The leftover count covers existing Markdown files in the planned source and
collection directories; it does not assert ownership or inventory the entire
vault. Blockers exit 1 and include safe codes and plan indexes rather than
private Facebook names, IDs or URLs.

The initial reader conservatively rejects WAL-mode headers, any `-wal`, `-shm`
or `-journal` sidecar, symlinks/junctions, incompatible schemas and malformed
stored records. Even stale or empty sidecars are refused. It does not checkpoint,
recover, convert or repair databases, and uses memory for SQLite temporary
storage. Do not delete sidecars to work around rejection. Database and filesystem
preflight assume no concurrent external changes during export.

## Publication and generated-file ownership

All production export commands share the same planner and safe publication:

```text
Consistent SQLite snapshot → immutable paths/rendered content → full preflight
  → item notes → collection notes → Knowledge Sync.md
```

Every known path/ownership conflict, including the root navigation page, blocks
publication before writes. Runtime item failures skip collections and navigation;
collection failures skip navigation. Within a phase, results retain successful
and failed writes. There is no transaction across the vault: successfully
published files remain and a retry converges. Export never reverses committed
SQLite synchronization/import changes. Empty snapshots leave the vault untouched.

New item/collection notes contain versioned full-identity ownership and a SHA-256
content fingerprint in valid YAML frontmatter. Unknown, legacy, wrong-identity
or manually edited destinations are preserved and reported as conflicts.
Verification hashes actual stored bytes; newline conversion counts as an edit.
Keep personal annotations in separate notes. Full serialization and hashing
rules are documented in [the output contract](src/outputs/obsidian/README.md).

All sources use ancestor/target symlink and junction checks, exclusively created
sibling temporary files, ownership rechecks and atomic per-file replacement.
Failures preserve prior target bytes; unchanged output is not rewritten. Only
the current invocation's temporary file is cleaned up on an ordinary failure.
Abrupt interruption can leave temporary files, which subsequent runs preserve.
One writer and no concurrent external edits are required: rechecks are not locks,
and universal power-loss durability is not promised. Fingerprints detect edits;
they are not authentication.

The older item-only `syncToObsidian()` and batch APIs use the shared naming,
planning and ownership rules without generating root navigation. The legacy
opaque `writeObsidianNote()` primitive remains available for its original low-level
contract; production generated exports use the safe generated-note writer.

## Rendering and navigation

Item/collection Markdown retains quoted source metadata and human-readable
`title` frontmatter. Generation uses UTF-8/LF without a BOM. Existing Facebook
literal-text protections remain; YouTube body formatting retains its existing
Markdown behavior. SQLite values and original source URLs are not rewritten.

`Knowledge Sync.md` retains the accepted **Collections** and **All items** layout,
including retained/unassociated items once each. Display titles use NFC,
control-to-space conversion, collapsed whitespace and fallbacks; sorting uses
display title then raw source/ID. Duplicate display titles receive identity
labels. Collection links and root links consume the shared planned destinations,
with separate Markdown destination encoding. Task 023 source grouping is not
included.

Navigation retains its dedicated first-line marker
`<!-- knowledge-sync:generated-navigation:v1 -->`. It is intentionally different
from item/collection fingerprints: edits below a valid navigation marker can be
replaced. Unknown navigation pages, directories and links block global preflight.
A completely empty snapshot preserves any existing navigation page.

## Existing-vault boundary

Task 024 is validated using temporary SQLite databases and temporary vaults.
Before a separately authorized real-vault run, inventory actual output, confirm
fresh DB/vault backups, run `--dry-run`, and review planned links/conflicts.
Preserve the historical Task 021 backup. Any cleanup or physical migration needs
its own reviewed allowlist, ownership/content checks and rollback plan. Task 024
does not migrate the real vault.

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
  persistence, and use one storage-owned transaction before the shared full projection.
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
- `src/outputs`: pure Markdown rendering, readable path derivation and one immutable
  export plan; full destination preflight precedes phased publication through
  fingerprint-aware atomic writers. Batch adapters reuse that plan. These
  operations add no timestamps, path registry or import metadata.
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

Live Facebook collection, AI processing, scheduling, background execution, Git
automation, web UI, Docker, and cloud infrastructure are out of scope.
Watch Later, arbitrary saved/followed-playlist discovery, and Likes synchronization
are unsupported. The collector handles one playlist at a time; account collection
calls it sequentially and preserves per-playlist groups. Single-playlist sync now
persists many-to-many membership. The singular `collection` field retains its
compatibility behavior described above. `sync-all` now persists every owned
playlist sequentially and optionally exports once after the loop.

The current scope includes Task 020 navigation and Task 021 local Facebook import.
`youtube sync` collects,
classifies, and persists items and relationships in SQLite, then removes stale
memberships after a complete successful collection sync;
`youtube sync-obsidian` additionally exports the persisted
snapshot. `youtube sync-all` adds the OAuth account loop. None of these commands
records import/export state or manages Git. Collection/item deletion, filesystem
cleanup, and changes to legacy item-note collection metadata remain deferred.
