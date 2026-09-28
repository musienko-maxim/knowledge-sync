# Project Session Handoff

Updated: 2026-09-28

Latest checkpoint: [Tasks 005–007](sessions/2026-09-28-tasks-005-007-checkpoint.md).
The earlier [Task 004 checkpoint](sessions/2026-09-27-task-004-checkpoint.md)
is a historical record; PR #2 has since been merged.

## Current state

`knowledge-sync` has implementations for Tasks 001–007:

- Task 001: project foundation, domain model, SQLite synchronization state, output boundary, and CLI bootstrap.
- Task 002: public YouTube playlist collector with URL/ID parsing, pagination, normalized `KnowledgeItem` output, and API-key access.
- Task 003: Google Desktop OAuth with PKCE and loopback callback, external refresh-token storage, OAuth access-token refresh, owned-playlist discovery, account collection orchestration, and CLI commands.

- Task 004: normalized `KnowledgeItem` repository with SQLite/Drizzle persistence,
  independent of import-state tracking, using the existing database lifecycle.
- Task 005: internal `sync(collector, repository)` application operation connecting
  complete collection to sequential item upserts, with a `{ processed }` entry count.
- Task 006: manual `youtube sync <playlist>` CLI with explicit API-key/OAuth
  selection, database-path resolution, and storage cleanup around that operation.
- Task 007: application-level new/changed/unchanged classification against current
  persisted state, with sequential lookup/upsert and expanded result counters.

The working tree also contains the Task 003 refresh-error follow-up: invalid
authorization, network failures, transient server failures, and unknown errors
are distinguished while preserving causes and stored refresh tokens. README and
`.env.example` wording cleanup is included in the Task 004 iteration checkpoint.

Task 004 is described in the root `task-004.md`; its implementation is included
in the `iteration/task-004-persistence` checkpoint branch.
`docs/tasks/` is currently absent; use the exact task file named by the user.

The implementation stops at manual single-playlist collection, classification,
and persistence through the CLI. Account-wide synchronization, import/export orchestration,
Markdown rendering, Obsidian writing, Facebook, AI, scheduling, background services,
and Git automation remain unimplemented.

Task 005 was implemented according to the then-available `task-005.md`,
prepared from `prompts/create-task-005.md`; neither file is currently present.
The earlier specification session changed documentation only. The later explicitly
assigned implementation added `src/application/sync.ts`, five unit tests, four
integration tests, and README/CLI status wording updates. No contracts, schema,
configuration, or dependencies changed; no commits or pushes were made.

Task 006 was implemented according to the then-available `prompts/task-006.md`
(currently absent), including the four accepted review clarifications. Existing Task 005 work and
unrelated working-tree changes were preserved. No commits or pushes were made.

Task 007 is implemented according to [prompts/task-007.md](../prompts/task-007.md),
including accepted review clarifications on exact persisted strings, optional
values, the current scalar-only model, and duplicate behavior. Existing Task
005/006 work and unrelated changes were preserved. No commits or pushes were made.

## Important architecture

- `YouTubeCollector` remains dependent on the narrow `YouTubeClient` interface.
- API-key and OAuth authentication are explicit modes of `YouTubeApiClient`.
- The same OAuth-authenticated client is used for owned-playlist discovery and playlist-item retrieval.
- OAuth credentials and refresh tokens must remain outside the repository and are never stored in SQLite.
- `mine=true` discovers playlists owned by the authenticated account; it does not discover every saved or followed playlist.
- The singular `KnowledgeItem.collection` field remains the current playlist-membership limitation.

- `openStorage(path).knowledgeItems` implements async `findByIdentity` and `upsert`
  on the existing SQLite/Drizzle connection. `close()` closes both boundaries.
- `knowledge_items` stores every normalized field; `(source, source_id)` is its
  composite primary key. Optional values map to SQL NULL and back to absence;
  publication dates remain ISO strings. Upserts replace mutable fields but never
  record an import. `imported_items` retains its original conflict-do-nothing behavior.
- Additive bootstrap DDL creates the new table in legacy import-only databases;
  it does not transform existing tables/data or introduce a migration framework.
- Task 004 explicitly extends the earlier SQLite state-only policy. AGENTS.md and
  README now describe item persistence and import state separately.
- `sync` uses `Collector`, `KnowledgeItem`, and `KnowledgeItemRepository` contracts.
  It waits for the complete collection, then awaits each lookup and upsert in source order. `processed`
  counts entries, including duplicates; the last occurrence wins on success.
- Collector failure causes zero writes. A repository failure propagates unchanged,
  stops later entries, and leaves earlier completed writes persisted. There is no
  rollback or partial result; the rejecting write has no generic unchanged-state
  guarantee. Empty collection succeeds with zero processed entries.
- Task 007 classifies immediately after each identity lookup against the current
  repository state. All six non-identity fields compare by exact string value;
  optional absence and explicit undefined are equal, empty text is distinct,
  and publication-date offsets/precision are preserved. There is no structured
  metadata in the current domain. Counters advance after successful upserts;
  `{ processed, new, changed, unchanged }` satisfies the sum invariant on success.
  Unchanged entries still upsert. Duplicates observe earlier writes, so a repeated
  batch with different versions of an identity can still count changes.
- The caller owns storage cleanup. Sync performs no deduplication, deletion,
  retries, or import recording. Items
  absent from later runs remain stored. Another playlist's value can overwrite
  singular `collection` context; omitted metadata clears it. Account-wide
  persistence orchestration remains deferred.
- `src/cli/youtube-sync.ts` composes the concrete client, collector, storage, and
  existing `sync()` exactly once. Storage closes in `finally` before the CLI
  prints `Processed N items.`. Task 007 extends only the application result;
  storage/domain contracts and CLI output remain unchanged.
- API-key mode is the default and reads `YOUTUBE_API_KEY` from the process
  environment. OAuth uses existing external credentials/provider/token storage;
  it requires no API key and never falls back between authentication modes.
  The CLI does not automatically load `.env`.
- DB precedence is `--db` then `DATABASE_PATH` then `./data/knowledge-sync.sqlite`;
  relative paths resolve against the working directory. Explicit blank paths
  fail. When `OBSIDIAN_VAULT_PATH` is configured, containment checks resolve
  existing ancestors and symlink/junction aliases to keep the DB outside it.
  Without a configured vault, users must choose an external DB location.
- The client now preserves known safe `GoogleAuthError` instances on every token
  request, including refresh during pagination. Unknown provider errors remain
  sanitized without misleading re-login advice. A small `YouTubeError` marker
  distinguishes safe parser/API/collector diagnostics for CLI display; known API
  reasons are allowlisted in both modes, and metadata errors use fixed messages.
  Credential-bearing error causes and arbitrary response details are not printed.

## Verification last completed

Task 007 implementation validation (2026-09-28):

- `npm.cmd install`: passed; dependencies up to date, no dependencies added.
- `npm.cmd test -- tests/sync.test.ts tests/cli.test.ts tests/youtube-sync.test.ts`:
  74 passed, three files.
- `npm.cmd test -- tests/sync.integration.test.ts tests/youtube-sync.integration.test.ts`:
  32 passed, two files. Total focused coverage: 106 passed.
- `npm.cmd test`: 263 passed, 1 intentional Windows skip for POSIX permissions,
  15 files. Task 007 adds 28 passing cases (18 unit, 10 integration).
- `npm.cmd run typecheck`: passed after integration.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Independent `ks_reviewer` inspection found no implementation issues. A duplicated
accepted-clarification section in the task document was removed following review.
Final whitespace, new documentation links, and directory checks passed.

Tests cover every compared field, exact date representations, optional-field
addition/removal, empty text, mixed counts, awaited lookup/write ordering,
duplicate transitions, successive SQLite syncs, and unchanged-item writes.
Original error identity, earlier persisted writes after lookup/upsert failure,
missing-item retention, separate import state, and Task 006 command behavior
remain covered. Tests use isolated SQLite and mocked collection/transport;
no live YouTube account, credentials, user database, or vault was used.

Task 007 files added: none. Files changed relative to the task-entry state:

- `src/application/sync.ts`
- `tests/sync.test.ts`, `tests/sync.integration.test.ts`
- `tests/cli.test.ts`, `tests/youtube-sync.test.ts` (expanded result fixtures)
- `README.md`, `prompts/task-007.md`, this handoff

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` structure is unchanged. No dependencies, database
schema changes, repository methods, or specification deviations were needed.

### Historical Task 006 verification

Task 006 implementation validation (2026-09-27):

- `npm.cmd install`: passed, dependencies up to date; no dependencies added.
- `npm.cmd test -- tests/cli.test.ts tests/youtube-sync.test.ts tests/youtube-sync.integration.test.ts tests/youtube-client.test.ts tests/youtube-collector.test.ts tests/youtube-playlist-id.test.ts`: 146 passed, six files.
- `npm.cmd test`: 235 passed, 1 intentionally skipped on Windows for POSIX permissions.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, new-file whitespace, Task 006 documentation references,
  and the reported directory layout: passed.

Tests use mocked API/OAuth transport and temporary SQLite databases; no live
credentials, account operations, or vault output were used. New tests enter the
real command/composition path, verify API-key and OAuth success, empty playlists,
safe failure diagnostics, zero writes after collection failure, actual storage
closure, and initial/pagination refresh classification. Unit tests cover path
precedence/vault exclusion, parsing, exactly-once delegation, and lazy help.
The test total increased by 66 passing cases from the Task 005 checkpoint.

Independent `ks_reviewer` review found a response-supplied video ID entering a
newly CLI-visible metadata error. The message is now fixed; unit and command-level
regressions cover the case. The reviewer confirmed the fix with no remaining
actionable findings. A test-table inference error found during typecheck was also
fixed before the final passing checks above.

Task 006 files added:

- `src/cli/youtube-sync.ts`
- `src/collectors/youtube/youtube-error.ts`
- `tests/youtube-sync.test.ts`
- `tests/youtube-sync.integration.test.ts`

Task 006 files changed:

- `src/cli/program.ts`, `src/cli/youtube.ts`
- `src/collectors/youtube/playlist-id.ts`, `youtube-client.ts`, `youtube-collector.ts`
- `tests/cli.test.ts`, `tests/youtube-client.test.ts`, `tests/youtube-collector.test.ts`, `tests/youtube-playlist-id.test.ts`
- `.env.example`, `README.md`, `prompts/task-006.md`, this handoff

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` layout is retained. No schema, dependencies, or
application sync semantics changed. No specification deviations were needed.

### Historical Task 005 verification

Task 005 implementation validation (2026-09-27):

- `npm.cmd install`: passed; dependencies already up to date, no dependencies added.
- `npm.cmd test -- tests/sync.test.ts tests/sync.integration.test.ts`: 9 passed.
- `npm.cmd test`: 169 passed, 1 intentionally skipped on Windows for POSIX permissions.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, local documentation references, and new-source whitespace
  checks: passed. Package files and existing domain/storage/collector code are unchanged.

Tests use isolated SQLite and mocked collection clients; no real credentials,
network collection, or vault writes were used.
Independent `ks_reviewer` inspection of implementation, tests, and README found
no actionable issues. Its final handoff review encountered a usage limit; the
main agent completed the final handoff, reference, and diff checks.

### Historical Task 004 verification

- Focused repository/storage/domain tests: 19 passed, including 10 new repository cases.
- `npm test`: 160 passed, 1 skipped on Windows for POSIX permissions.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Built CLI startup and help smoke tests: passed.
- Built OAuth command help: passed.
- No real credentials or tokens were added to the repository.

These checks were completed for Task 004. Independent `ks_reviewer` review found
no actionable issues. The first full run also discovered two temporary task-entry
test snapshots; renaming those copies out of test discovery resolved that harness
issue and the unmodified full test command then passed. No runtime test settings
were changed. Unrelated pre-existing changes were checked against task-entry copies.

## Current checkpoint and repository state

The user authorized preparing a commit for PR and pushing on 2026-09-28.
Fetching origin confirmed PR #2 merged Task 004 into `origin/main` at `5324ad2`.
Branch `iteration/task-007-sync-classification` starts from that merge and
collects the dependent Tasks 005–007 implementations, tests, and documentation.
No application files changed during commit preparation after the recorded
passing checks. PR title and description are in the latest checkpoint above.

The local deletions of `instructions.txt` and `task-004.md` are unrelated and
excluded from this checkpoint. Earlier task specifications absent from the
workspace have not been reconstructed. Check Git for the final commit/push
state; earlier statements that no commits were made describe implementation
sessions before this explicit authorization.

### Historical recovery and Task 004 checkpoint

The `src/` and `tests/` directories were restored in an earlier session and verified
against the surviving compiled `dist/` output. Git is now initialized with an
`origin` remote. PR #1 was merged and local `main` was updated to `b0f46fe`.
The `iteration/task-004-persistence` checkpoint collects Task 004 persistence,
the OAuth refresh-error follow-up, documentation cleanup, and repository agent
configuration. Commit `3e26d97` was pushed on that branch and matched its remote
tracking branch. A Task 004 PR was not created in this session: GitHub CLI was
unavailable and the GitHub integration was not installed/connected. Check actual
remote PR status before creating one; it may change outside this session.

The working tree was clean after the push. This handoff update and the linked
session conclusion are subsequent local documentation changes, not part of that
checkpoint commit. Inspect current Git status before editing; do not initialize
Git again or assume later pending edits belong to a newly assigned task.

## Repository development helpers

Read [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for the reusable explorer, implementer,
and reviewer roles and persistence, YouTube/OAuth, and verification skills.
Native definitions live under `.codex/agents/`; skills live under `.agents/skills/`.
Use only the roles/skills needed for the current assignment. These are development
helpers, not application agents or automatic task execution.

## Next-session guidance

Read this handoff and the explicitly assigned task specification before changing code. Task 007 sync item classification is complete; its Tasks 005–007 checkpoint branch is `iteration/task-007-sync-classification`. Check actual Git/PR state before further work. Work only on the assigned task and stop at its boundary. Do not start account-wide synchronization, import/export orchestration, Markdown/Obsidian output, or any later integration unless a new task explicitly requests it.
