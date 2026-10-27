# Task 024 — Gate B2: Real-Vault Export Authorization

**Current status: documentation reconciled; Gate B2 has not been executed and real export is NOT authorized. Separate explicit user approval is required.**

When explicitly approved, this procedure authorizes **Gate B2 — Real-Vault Export and Verification ONLY**, including replacement of `Knowledge Sync.md` and the repeat export after successful initial verification. This document alone does not grant that approval.

Canonical specification:
`prompts/task-024-real-vault-deployment-phase-1.md`

Verified backup:
`D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z`

## Evidence and prerequisites

Gate A completed and was verified. During documentation reconciliation, read-only inspection of the existing evidence confirmed:

- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\result.json`: `passed=true`, `failure=null`, recorded at `2026-10-26T23:43:39.719Z`.
- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\sqlite-verification.json`: integrity `ok`, 322 items, 28 collections, 323 memberships, zero invalid membership references.
- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\vault-backup-manifest.json`: 605 files and 101 directories; the Gate A baseline and post-backup inventories record the same counts.

The existing Gate A source baseline is:
`D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\baseline.json`.
These are Gate A evidence, not Gate B1 execution evidence. Reading these records does not freshly verify the live sources or reverify every backup byte.

**Gate B1 evidence gap:** the user reports Gate B1 PASSED with dry-run results of 350 additions, 1 update, 0 unchanged, and 0 conflicts. No persistent Gate B1 execution report, log, or B1-specific baseline was located in the repository or the supplied backup's evidence directory during this reconciliation. The [Gate B1 prompt](task-024-gate-b1-final-preflight.md) is a procedure, not an execution report. The reported result is preserved with that attribution; no evidence file or execution log has been reconstructed.

Fresh read-only acceptance checks from the Gate B1 prompt are required immediately before any separately authorized B2 execution. They must verify backup evidence and availability, compare current SQLite and complete vault state against the Gate A baseline, check quiescence and sidecars, and run the existing built CLI with `--dry-run`. Require exactly 350 additions, 1 update, 0 unchanged, and 0 conflicts; verify all planned targets, root ownership, paths and links, and unchanged source state after dry-run. Counters alone are insufficient. Stop on any discrepancy; changed inputs require renewed verification and approval of the changed plan under the canonical specification.

## Authorization

Proceed with the real export only after separate explicit user approval, successful fresh read-only B1 acceptance, and confirmation that all Gate B1 safety conditions remain satisfied. This reconciliation does not execute those acceptance checks or authorize export.

1. Confirm the quiescent window is still active.
2. Revalidate source baselines and backup availability immediately before export.
3. Stop if any unexpected source changes, writers, sidecars, conflicts, or other blockers are detected.
4. Execute the existing validated built CLI:

```powershell
node dist/cli/index.js export obsidian --db "D:\codex\knowledge-sync\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

5. Verify:
   - Exactly 350 new Markdown files.
   - Exactly one existing-file replacement: `Knowledge Sync.md`.
   - No legacy deletions.
   - No changes to user-owned files.
   - SQLite and sidecar state unchanged.
   - For all 350 new item/collection files: correct full identities, valid ownership markers, valid SHA-256 content fingerprints under the implemented Task 024 rules, and correct generated paths and links.
   - For `Knowledge Sync.md` separately: recognized root ownership marker, expected generated content and collection coverage, and correct navigation links resolving to the planned readable paths. Do not require item/collection fingerprints from this root file.
   - Historical manual-modification status of `Knowledge Sync.md` remains UNKNOWN. Its marker-only ownership does not prove that historical manual edits never occurred.

6. Only after successful initial verification, repeat the export and require:
   - additions=0
   - updates=0
   - unchanged=351
   - conflicts=0

7. Verify identical bytes and modification times for all 351 generated outputs after the repeat export.
   Reconfirm that all legacy files, user-owned files, other pre-existing files except the authorized root replacement, and SQLite remain unchanged against the baseline, including sizes, hashes, modification times, and sidecar state. No unexplained filesystem differences are acceptable.

## Strict boundaries

- No legacy cleanup.
- No migrations or database changes.
- No repository source changes.
- No automatic rollback.
- No commits or pushes.
- No Task 025 work.
- Stop and report if any acceptance criterion fails.

Return a complete Gate B2 execution and verification report.

Do not proceed beyond Gate B2 without separate authorization.
