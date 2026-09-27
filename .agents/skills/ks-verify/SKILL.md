---
name: ks-verify
description: Validate knowledge-sync changes and review task completion evidence using its Windows-compatible tests, build, typecheck, and CLI smoke checks. Use for verification or completion review, not to expand implementation scope.
---

# Knowledge-sync verification

Read [AGENTS.md](../../../AGENTS.md), the assigned task, and
[package.json](../../../package.json). Follow
[the workflow](../../../docs/AGENT_WORKFLOW.md): one owner runs final checks after
writers finish. A read-only reviewer inspects results and requests execution from
the main agent; this skill does not grant write permission.

Inspect `git status --short` and the relevant diff. Separate this task's changes
from pre-existing edits. Do not stage, revert, commit, or push as part of checks.

For documentation-only changes, check referenced paths/anchors, status claims,
skill frontmatter when applicable, and `git diff --check`. Do not run application
tests solely for prose. Agent configuration changes also need format/discovery
checks; distinguish file validation from a real new-session discovery check.

For source/application configuration changes, use PowerShell-compatible commands
from the repository root (Node.js 24+). Install dependencies once if that has not
already been done for the current work. Run focused tests for affected behavior,
then the complete required checks. The existing commands are:

```powershell
npm.cmd install
npm.cmd test -- tests/google-oauth.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
node dist/cli/index.js
node dist/cli/index.js --help
npm.cmd exec --offline --package=. -- knowledge-sync --help
git diff --check
```

Replace the focused test path with the files relevant to the assignment. Run
build before built-CLI checks. Do not run concurrent installs/builds or repeat
passing suites unless a new change/failure justifies it. Check every exit code;
PowerShell may continue after a failed native command. If sandbox restrictions
block a necessary check, report/retry through the environment's normal approval
mechanism; do not weaken permissions or claim a blocked check passed.

SQLite tests use memory/temp files; OAuth tests use fake credentials/mocked
transport. CLI smoke checks stop at startup/help and do not authorize an account,
remove tokens, fetch real playlists, or write to the vault. A POSIX permissions
test is intentionally skipped on Windows; distinguish that from unexpected skips.

Return exact commands, outcomes, counts/skips, material limitations, files changed,
dependencies added (or none), and relevant architectural decisions. Historical
handoff results are not a fresh run. Check the assigned task's report requirements
and non-goals before declaring completion.
