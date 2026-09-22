# knowledge-sync

A local-first CLI for collecting saved knowledge and exporting Markdown directly
into an existing Obsidian Vault. Synchronization will be manual and infrequent.

## Current status

Task 001 established the domain model, collector and output interfaces, SQLite
synchronization state, and CLI help. Task 002 adds a YouTube playlist collector
that returns validated `KnowledgeItem[]`. Task 003 adds Google Desktop OAuth,
local authorization commands, and discovery of owned playlists. Video collection
is available in code; CLI synchronization, storage orchestration, and Markdown
generation remain deferred.

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

`.env.example` documents independent `OBSIDIAN_VAULT_PATH` and `DATABASE_PATH`
settings. Copy it to `.env` and supply your existing vault path when configuring
future synchronization. Keep the database **outside the vault**; the suggested
location is `./data/knowledge-sync.sqlite`, relative to the working directory.
The bootstrap help command does not load configuration or create a database.
Environment loading and path validation will be wired when a real command needs
them. The storage factory currently accepts an explicit database path.

`YOUTUBE_API_KEY` is also documented in `.env.example`. Task 002's API client takes
the key explicitly; it does not read `.env` or environment variables. See
[architecture and collector usage](docs/architecture.md) for the code-level entry point.

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
client for discovery and item retrieval, including private playlists, and retains
playlist grouping without cross-playlist deduplication.

## Architecture

Planned flow:

```text
External Source → Collector → KnowledgeItem → SQLite synchronization state
  → Markdown output → Local Obsidian Vault → Git managed separately
```

- `src/core/models`: source-independent Zod schema and inferred TypeScript types;
  publication dates are ISO 8601 strings with a timezone.
- `src/collectors`: asynchronous collector interface; raw source payloads stay here.
  YouTube uses a replaceable API client with API-key or OAuth authentication,
  preserving playlist/item order. Account discovery has its own narrow interface.
- `src/auth`: Desktop OAuth, external client configuration, and refresh-token storage.
- `src/storage`: synchronous state interface, matching the local SQLite driver.
  Drizzle maps the minimal table; bootstrap DDL initializes new databases.
  A composite primary key `(source, sourceId)` identifies imports. Repeated imports
  preserve the original URL and import time. Titles never determine identity.
- `src/outputs`: asynchronous output contract and reserved Obsidian directory.
  Future rendering must be deterministic and preserve original import timestamps.
- `src/cli`: Commander factory separated from the executable for testing.

SQLite is synchronization metadata only. Markdown in the vault will be the
user-facing knowledge repository. Record successful imports only after output
has been written; orchestration is deferred. Git remains independently managed.

## MVP direction and scope

The MVP direction is (only collection and normalization are implemented):

```text
YouTube Playlist → KnowledgeItem → SQLite → Markdown → Obsidian
```

Facebook integration, AI processing, scheduling, background execution, Git
automation, web UI, Docker, and cloud infrastructure are out of scope.
Watch Later, arbitrary saved/followed-playlist discovery, and Likes synchronization
are unsupported. The collector handles one playlist at a time; account collection
calls it sequentially and preserves per-playlist groups. The singular `collection`
field still contains a playlist title; multi-playlist domain membership is not
modeled yet.

Task specifications live in `docs/tasks/`:

- [Task 001 — Project Bootstrap](docs/tasks/TASK-001-bootstrap.md)
- [Task 002 — YouTube Playlist Collector](docs/tasks/TASK-002-youtube-collector.md)
- [Task 003 — YouTube Account Access](docs/tasks/TASK-003-youtube-account-access.md)

Work stops at Task 003 for review.
