# Task 024 — Gate B1: Final Read-Only Export Preflight

Gate A backup creation and verification is complete.

Verified backup directory:

`D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z`

Canonical deployment specification:

`prompts/task-024-real-vault-deployment-phase-1.md`

## Objective

Prepare for Gate B real-vault export without executing it.

This is a strictly READ-ONLY preflight. Gate B2 real export is NOT authorized.

## Procedure

1. Read `AGENTS.md`, the canonical deployment specification, and `docs/SESSION_HANDOFF.md`.

2. Verify the existing Gate A evidence and backup readiness:
   - Confirm backup files and evidence are present.
   - Inspect `evidence/result.json`.
   - Confirm recorded verification status.
   - Do not modify or regenerate backup evidence.

3. Revalidate the current source state against the Gate A baseline:
   - SQLite SHA-256, size and modification time.
   - SQLite WAL/journal sidecar state.
   - Vault paths, hashes, file sizes and modification times.
   - Detect any modifications since Gate A.
   - Confirm no unexpected database or vault writers.

4. Execute the existing built export-only CLI in `--dry-run` mode:

   `node dist/cli/index.js export obsidian --db "D:\codex\knowledge-sync\data\knowledge-sync.sqlite" --vault "D:\obsidian" --dry-run`

5. Require these exact results:

   - additions=350
   - updates=1
   - unchanged=0
   - conflicts=0

6. Inspect the planned changes:
   - Exactly 350 new readable Markdown files.
   - Exactly one existing file update: `D:\obsidian\Knowledge Sync.md`.
   - No legacy deletions.
   - No modifications to external/user-owned files.
   - No target path collisions.
   - Correct source/collection relationships and generated navigation.
   - Verify the root navigation ownership conditions specified in the canonical procedure.

7. After dry-run, verify that SQLite and the real vault are unchanged from the preflight baseline.

8. Report:
   - Gate A backup validity and current availability.
   - Source baseline comparison.
   - Exact dry-run counts.
   - Unexpected changes or safety findings.
   - Gate B2 readiness verdict: READY or BLOCKED.
   - Exact proposed real-export command and post-export verification procedure.

## Restrictions

Do not:

- Execute real export.
- Modify SQLite or vault files.
- Create or change backups.
- Delete legacy Markdown.
- Perform cleanup or rollback.
- Modify repository files.
- Build, migrate, commit or push.
- Proceed automatically to Gate B2.

If baseline comparison, ownership checks, or dry-run acceptance fails, STOP and report the findings.

**Stop after the Gate B1 report. Real export requires separate explicit user approval.**