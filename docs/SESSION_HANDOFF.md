# Project Session Handoff

Updated: 2026-09-22

## Current state

`knowledge-sync` has completed Tasks 001–003:

- Task 001: project foundation, domain model, SQLite synchronization state, output boundary, and CLI bootstrap.
- Task 002: public YouTube playlist collector with URL/ID parsing, pagination, normalized `KnowledgeItem` output, and API-key access.
- Task 003: Google Desktop OAuth with PKCE and loopback callback, external refresh-token storage, OAuth access-token refresh, owned-playlist discovery, account collection orchestration, and CLI commands.

The implementation stops at account access and playlist/video collection. SQLite import orchestration, Markdown rendering, Obsidian writing, Facebook, AI, scheduling, background services, and Git automation are not implemented.

## Important architecture

- `YouTubeCollector` remains dependent on the narrow `YouTubeClient` interface.
- API-key and OAuth authentication are explicit modes of `YouTubeApiClient`.
- The same OAuth-authenticated client is used for owned-playlist discovery and playlist-item retrieval.
- OAuth credentials and refresh tokens must remain outside the repository and are never stored in SQLite.
- `mine=true` discovers playlists owned by the authenticated account; it does not discover every saved or followed playlist.
- The singular `KnowledgeItem.collection` field remains the current playlist-membership limitation.

## Verification last completed

- `npm test`: 133 passed, 1 skipped on Windows for POSIX permissions.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Built CLI startup and help smoke tests: passed.
- Built OAuth command help: passed.
- No real credentials or tokens were added to the repository.

## Recovery and repository state

The `src/` and `tests/` directories were restored from the previous session and verified against the surviving compiled `dist/` output. No Git repository existed in the workspace at the time of this handoff; initialize it with `git init -b main` when ready. Review `.gitignore` before the first commit so `node_modules`, `dist`, `.env`, databases, temporary files, and OAuth credential/token files stay untracked.

## Next-session guidance

Read this handoff and the explicitly assigned task specification before changing code. Work only on the assigned task and stop at its boundary. Do not start SQLite synchronization, Markdown/Obsidian output, or any later integration unless a new task explicitly requests it.
