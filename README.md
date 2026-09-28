# knowledge-sync

A local-first CLI for collecting saved knowledge and exporting Markdown directly
into an existing Obsidian Vault. Synchronization is manual and infrequent;
Markdown export remains planned.

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
Import/export orchestration, Markdown generation, and Obsidian output remain deferred.

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
Without that setting, choose an external database location yourself. No vault
content is written. Startup and help do not access credentials or create a database.

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
Collection failure writes no items. A persistence failure leaves earlier successful
writes intact and exits unsuccessfully; storage is closed in either case.
No import/export record is created by this command.

OAuth refresh failures preserve re-login guidance for `invalid_grant`, retry
guidance for network/transient failures, and safe diagnostics for unknown failures,
including refreshes during pagination. Raw error bodies and credential-bearing
causes are not printed. Account-wide synchronization and Markdown output remain deferred.

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

Planned flow:

```text
External Source → Collector → KnowledgeItem → SQLite items and import state
  → Markdown output → Local Obsidian Vault → Git managed separately
```

- `src/core/models`: source-independent Zod schema and inferred TypeScript types;
  publication dates are ISO 8601 strings with a timezone.
- `src/collectors`: asynchronous collector interface; raw source payloads stay here.
  YouTube uses a replaceable API client with API-key or OAuth authentication,
  preserving playlist/item order. Account discovery has its own narrow interface.
- `src/auth`: Desktop OAuth, external client configuration, and refresh-token storage.
- `src/application`: internal collection-to-persistence orchestration depending
  only on the `Collector` and `KnowledgeItemRepository` contracts.
- `src/storage`: `KnowledgeItemRepository` exposes asynchronous `findByIdentity`
  and `upsert` methods; the existing import-state interface stays synchronous.
  `openStorage(path).knowledgeItems` shares the same SQLite/Drizzle connection
  and `close()` lifecycle as import-state operations. Both `knowledge_items` and
  `imported_items` enforce `PRIMARY KEY (source, source_id)`. Item upserts replace
  normalized fields; repeated imports preserve the original URL and import time.
  Titles never determine identity.
- `src/outputs`: asynchronous output contract and reserved Obsidian directory.
  Future rendering must be deterministic and preserve original import timestamps.
- `src/cli`: Commander factory separated from the executable for testing;
  single-playlist composition owns authentication selection, database-path
  resolution, and storage cleanup around the existing application operation.

SQLite stores normalized items separately from synchronization metadata.
Optional domain fields use SQL NULL and are omitted on reads; empty text stays
empty and publication dates retain their original ISO string. Upserts insert or
replace the mutable fields for one identity, without adding timestamps or import
records. Additive `CREATE TABLE IF NOT EXISTS` bootstrap DDL also opens older
import-only databases without changing their records; no data migration is needed.

`sync(collector, repository)` awaits one complete collection, then processes each
entry sequentially: look up `(source, sourceId)`, classify, and await its upsert.
It returns `{ processed, new, changed, unchanged }` only on success, with
`processed === new + changed + unchanged`. Counts describe collected entries,
including duplicates, rather than unique rows or imports. Every entry is upserted,
including unchanged entries. The CLI continues to print only `Processed N items.`

Missing identities are new. Existing items are unchanged when all six persisted
non-identity fields match: `url`, `title`, `description`, `author`, `collection`,
and `publishedAt`; otherwise they are changed. Omitted optional fields and explicit
`undefined` are equivalent; empty text is distinct from absence. Dates compare as
exact stored strings, including timezone and precision, without normalization.

Each lookup observes earlier writes, so duplicates can be new then unchanged,
or new then changed. Repeating a batch with different versions of one identity
can still count changes. The last occurrence supplies the stored representation.
Items absent from a later run remain stored; there is no deduplication or removal
detection. The singular collection limitation also applies to classification.

Collector failure causes no repository calls. A lookup or upsert failure propagates unchanged
and stops later entries; earlier completed writes remain. There is no rollback,
automatic retry, or partial success result, and no guarantee that a rejecting
repository operation left its own item unchanged. An empty collection succeeds
with all four counters zero. The caller owns storage setup and cleanup, including on
failure. This operation does not record imports or orchestrate account-wide results.

Markdown in the vault will be the user-facing knowledge repository. Record
successful imports only after output has been written; output/import orchestration is deferred.
Git remains independently managed.

## MVP direction and scope

The MVP direction is (collection, normalization, persistence, and manual
single-playlist CLI synchronization are implemented; output is deferred):

```text
YouTube Playlist → KnowledgeItem → SQLite → Markdown → Obsidian
```

Facebook integration, AI processing, scheduling, background execution, Git
automation, web UI, Docker, and cloud infrastructure are out of scope.
Watch Later, arbitrary saved/followed-playlist discovery, and Likes synchronization
are unsupported. The collector handles one playlist at a time; account collection
calls it sequentially and preserves per-playlist groups. The singular `collection`
field still contains a playlist title; syncing the same video from another playlist
overwrites that context, and omitted collection metadata clears it. Multi-playlist
domain membership is not modeled yet.

Work stops at Task 007 item classification during manual synchronization into SQLite.
