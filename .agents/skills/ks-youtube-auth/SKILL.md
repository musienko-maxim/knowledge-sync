---
name: ks-youtube-auth
description: Implement or review knowledge-sync YouTube collection and Google OAuth behavior, including token refresh errors, safe CLI messages, and mocked regression tests.
---

# Knowledge-sync YouTube and OAuth

Read the assigned task and [AGENTS.md](../../../AGENTS.md). Follow
[the workflow](../../../docs/AGENT_WORKFLOW.md) for assigned files. Relevant code:

- [OAuth](../../../src/auth/google-oauth.ts),
  [configuration](../../../src/auth/google-client-config.ts), and
  [token store](../../../src/auth/token-store.ts).
- [YouTube client](../../../src/collectors/youtube/youtube-client.ts),
  [collector](../../../src/collectors/youtube/youtube-collector.ts), and
  [account discovery](../../../src/collectors/youtube/youtube-account.ts).
- [CLI wiring](../../../src/cli/youtube.ts) and
  [CLI presentation](../../../src/cli/program.ts).

Google authorization already lives in `src/auth`; do not relocate it solely to
satisfy a general collector-location rule. Preserve the existing short-lived
loopback callback, PKCE, state validation, and listener cleanup unless that
behavior is explicitly assigned. This callback is not a background web service.

Keep OAuth and API-key modes explicit behind the narrow client interface.
Collectors return normalized domain items without SQLite or output dependencies.
Owned-playlist discovery uses `mine=true`; it is not discovery of every saved or
followed playlist. Preserve pagination/order and existing per-playlist grouping.
Do not claim that a live test proved private-playlist access unless visibility
was actually verified.

For refresh failures, inspect the installed google-auth-library/Gaxios error
shapes and mock its transport realistically. Separate structured `invalid_grant`
from network errors and temporary server failures. Preserve useful causes without
printing arbitrary error bodies or credential-bearing messages at the CLI.
Unknown failures should not become misleading re-login advice. Preserve stored
refresh tokens on failure; token rotation and successful refresh/caching need
regression coverage when affected. Do not add retries or automatic logout unless
explicitly requested.

Use fake credentials and isolated token stores. Do not read local OAuth secrets
or execute login, logout, status, or playlists against a real account as routine
verification. Live account actions require an explicit user assignment. The CLI
reads supported process environment variables and does not load `.env` itself.

Select relevant OAuth, token-store, client, collector, account, or CLI tests, then
use [ks-verify](../ks-verify/SKILL.md) for final validation. Report changes to user
guidance separately from authentication or token-persistence changes.
