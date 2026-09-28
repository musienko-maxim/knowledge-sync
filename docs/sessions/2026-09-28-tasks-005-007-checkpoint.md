# Tasks 005–007 checkpoint

Date: 2026-09-28. Branch: `iteration/task-007-sync-classification`.
Base: `origin/main` at `5324ad2`, which merged Task 004 in PR #2.

Tasks 005–007 were implemented and validated before the user authorized this
combined commit and push. They depend on one another and were all uncommitted.
The existing local deletions of `instructions.txt` and `task-004.md` are excluded.
Use Git for the final commit hash and push state.

## Proposed PR title

Add manual YouTube playlist sync with persisted-item classification

## Proposed PR description

Adds `youtube sync <playlist>` to collect one playlist and persist normalized
items in SQLite using explicit API-key or OAuth authentication. The application
classifies each entry as new, changed, or unchanged against its current stored
state and returns `{ processed, new, changed, unchanged }`; the CLI prints
`Processed N items.` after closing storage.

- Collect once, then await each identity lookup and upsert in source order.
  Duplicate entries observe earlier writes; unchanged entries still upsert.
  Failures preserve earlier writes, propagate unchanged from the application,
  and do not return a partial result or record imports.
- Compare all six persisted non-identity fields. Omitted optional values equal
  explicit undefined; empty text is distinct, and dates retain exact strings.
- Resolve the DB from `--db`, `DATABASE_PATH`, or the default. A configured vault
  path enables containment checks, including existing symlink/junction aliases.
- Preserve classified OAuth refresh errors across pagination and expose only
  deliberately safe CLI diagnostics. Authentication never falls back between modes.

Validation: 106 focused tests passed; full suite 263 passed and one intentional
Windows skip for POSIX permissions. Dependency installation, build, typecheck,
CLI startup/help and packaged CLI help passed. Independent review has no
outstanding findings. Tests use isolated SQLite and mocked API/OAuth transport.

No dependencies or schema changes. Markdown output, account-wide sync, deletion
reconciliation, and import/export orchestration remain outside this change.

## Implementation and verification record

See [SESSION_HANDOFF.md](../SESSION_HANDOFF.md) for detailed file inventory and
commands, and [Task 007](../../prompts/task-007.md) for the accepted specification.
Do not start another task without an explicit assignment.
