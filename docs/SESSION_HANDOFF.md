# Project Session Handoff

Updated: 2026-09-27

## Current state

`knowledge-sync` has implementations for Tasks 001–004:

- Task 001: project foundation, domain model, SQLite synchronization state, output boundary, and CLI bootstrap.
- Task 002: public YouTube playlist collector with URL/ID parsing, pagination, normalized `KnowledgeItem` output, and API-key access.
- Task 003: Google Desktop OAuth with PKCE and loopback callback, external refresh-token storage, OAuth access-token refresh, owned-playlist discovery, account collection orchestration, and CLI commands.

- Task 004: normalized `KnowledgeItem` repository with SQLite/Drizzle persistence,
  independent of import-state tracking, using the existing database lifecycle.

The working tree also contains the Task 003 refresh-error follow-up: invalid
authorization, network failures, transient server failures, and unknown errors
are distinguished while preserving causes and stored refresh tokens. README and
`.env.example` wording cleanup is included in the Task 004 iteration checkpoint.

Task 004 is described in the root `task-004.md`; its implementation is included
in the `iteration/task-004-persistence` checkpoint branch.
`docs/tasks/` is currently absent; use the exact task file named by the user.

The implementation stops at collection and independent persistence boundaries.
Collector-to-repository orchestration, SQLite import orchestration, Markdown
rendering, Obsidian writing, Facebook, AI, scheduling, background services, and
Git automation are not implemented.

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

## Verification last completed

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

## Recovery and repository state

The `src/` and `tests/` directories were restored in an earlier session and verified
against the surviving compiled `dist/` output. Git is now initialized with an
`origin` remote. PR #1 was merged and local `main` was updated to `b0f46fe`.
The `iteration/task-004-persistence` checkpoint collects Task 004 persistence,
the OAuth refresh-error follow-up, documentation cleanup, and repository agent
configuration. Inspect current Git status before editing; do not initialize Git
again or assume later pending edits belong to a newly assigned task.

## Repository development helpers

Read [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for the reusable explorer, implementer,
and reviewer roles and persistence, YouTube/OAuth, and verification skills.
Native definitions live under `.codex/agents/`; skills live under `.agents/skills/`.
Use only the roles/skills needed for the current assignment. These are development
helpers, not application agents or automatic task execution.

## Next-session guidance

Read this handoff and the explicitly assigned task specification before changing code. Work only on the assigned task and stop at its boundary. Do not start SQLite synchronization, Markdown/Obsidian output, or any later integration unless a new task explicitly requests it.
