# Task 024 — Real-Vault Deployment: Phase 1

## 1. Purpose and status

This specification defines the controlled initial deployment of Task 024 portable readable Markdown filenames into the real Obsidian vault.

Task 024 implementation and Windows acceptance are complete.

Phase 1 uses an **additive in-place export**:

- Generate 350 new readable Markdown files from SQLite.
- Replace the existing `Knowledge Sync.md` navigation file.
- Preserve all 350 legacy Markdown files.
- Preserve all user-owned content.
- Verify export correctness and idempotency.

Legacy cleanup is explicitly excluded from Phase 1.

This document belongs to Task 024. It does not define or authorize Task 025 or any subsequent implementation task.

**Current authorization status: specification only. No real deployment has been authorized.**

## 2. Environment

- Repository: `D:\codex\knowledge-sync`
- SQLite: `D:\codex\knowledge-sync\data\knowledge-sync.sqlite`
- Obsidian vault: `D:\obsidian`
- OS: Windows 11
- Shell: PowerShell
- CLI: existing verified Node.js build

Relevant documentation:

- [Repository instructions](../AGENTS.md)
- [Session handoff](../docs/SESSION_HANDOFF.md)
- [Task 024 implementation specification](task-024.md)

Do not rebuild, install dependencies, or change source code as part of deployment.

Use the existing built CLI directly.

## 3. Previous assessment findings

The following figures were reported by the completed read-only pre-deployment assessment. They are historical assessment evidence, not fresh verification performed by this specification.

| Metric | Previously reported result |
|---|---:|
| KnowledgeItems | 322 |
| YouTube items | 52 |
| Facebook items | 270 |
| Collections | 28 |
| Memberships | 323 |
| Legacy item/collection Markdown | 350 |
| Other Markdown outside generated areas | 161 |
| Total Markdown, including root navigation | 512 |
| Planned additions | 350 |
| Planned updates | 1 |
| Planned conflicts | 0 |

Additional reported findings:

- SQLite was observed in rollback-journal mode, without WAL, SHM, or journal sidecars.
- The read-only database snapshot was consistent.
- All 350 legacy Markdown files matched reconstructed legacy rendering byte-for-byte.
- No occupied new item/collection targets or Windows path collisions were identified.
- Static scanning found no references from the 161 external Markdown files to legacy generated files.
- The root navigation file matched reconstructed legacy output.
- Root manual-modification history remains UNKNOWN.
- The real-vault dry-run completed successfully.
- No real export, cleanup, or backup creation occurred during assessment.

These findings must be revalidated where specified below.

Evidence provenance: these are supplied prior assessment results. No persistent completed assessment report was located in the repository documentation reviewed for this refinement. The [assessment brief](real-vault-assesment.md) defines the investigation; it is not a completed report or execution transcript. The original terminal/chat output, exact manifest, hashes, and scan details are not available as a linked report here. This specification and the handoff record the supplied summary, not independent confirmation of those observations.

Static scanning does not prove the absence of every possible backlink. The counts and collision findings describe the previously assessed state, not a guarantee about the current vault. No real SQLite or vault access was performed during this documentation refinement.

## 4. Core safety invariants

Throughout Phase 1:

1. SQLite remains unchanged.
2. All 350 legacy Markdown files remain in place and unmodified.
3. All user-owned files remain unmodified.
4. After Gate B approval, the only authorized existing-file replacement is `D:\obsidian\Knowledge Sync.md`.
5. Exactly 350 new item/collection Markdown files may be created.
6. No existing files may be deleted or renamed during export. Any later targeted rollback requires Gate C approval; legacy files remain protected throughout.
7. No schema changes, migrations, synchronization, or remote API calls are permitted.
8. No source-code modifications or new dependencies are permitted.
9. No commit or push as part of Phase 1.
10. Unexpected changes require an immediate stop and investigation.

File ownership and fingerprint consistency are not deletion authorization.

## 5. Approval gates

### Gate A — Backup authorization

Before creating backups:

- Present the intended backup destinations and procedure.
- Confirm a quiescent deployment window.
- Obtain explicit user approval for backup creation.

Backup creation must not modify the source SQLite or vault.

### Gate B — Real export authorization

After backup verification, baseline capture, and final dry-run:

- Present actual dry-run results.
- Confirm the exact additions and replacement target.
- Obtain explicit approval to execute the initial real export, replace `Knowledge Sync.md`, and perform the repeat export after initial verification succeeds.

Do not interpret approval for backup creation as approval for export.

### Gate C — Rollback authorization

If deployment or verification fails:

- Stop operations.
- Preserve the observed filesystem state.
- Report partial results.
- Propose a targeted rollback.

Do not remove files or restore navigation without separate explicit approval.

### Legacy cleanup

Removal of legacy files requires separate future authorization and is outside Phase 1.

## 6. Preparation and baseline

Establish a quiescent deployment window.

Confirm that knowledge-sync writers and relevant vault-editing or synchronization activity are quiescent before proceeding, and maintain that condition through backup, export, and verification.

Retain the accepted no-concurrent-writer assumption. Process inspection is evidence, not absolute proof.

If active database writes or unexpected vault modifications are detected, stop and reassess.

Before backup or export, capture a read-only source baseline:

- SQLite path, size, SHA-256, mtime, and journal/sidecar state.
- Complete vault relative-path inventory.
- File sizes, SHA-256 hashes, and modification times.
- Legacy generated-file paths.
- Protected user-owned file paths.
- Current root-navigation bytes/hash.
- Expected replacement root-navigation content or its SHA-256 hash.
- Expected 350 new target paths.

Store deployment evidence outside the protected repository and vault.

Choose fresh backup and evidence destinations outside both trees and outside the historical Task 021 backup. Include these destinations in the Gate A plan.

The baseline must distinguish original files from planned new files and support post-deployment verification.

Confirm final Windows target-path lengths, case-insensitive uniqueness, and absence of occupied target paths.

Do not rely solely on the historical assessment.

## 7. Mandatory backup and verification

After Gate A approval, create fresh backups.

### SQLite

Use a consistent backup procedure appropriate to the observed database state.

For a quiescent rollback-mode database with no relevant sidecar files, a controlled file copy may be used after confirming its prerequisites.

If WAL, rollback-journal, recovery-required state, or active writes are detected, stop and reassess the backup procedure.

Verify:

- Backup completeness.
- Source and backup hashes where applicable.
- SQLite integrity on the backup.
- Expected snapshot counts and logical consistency.

Require a successful SQLite integrity check on the backup and validate 322 items, 28 collections, 323 memberships, and valid membership references. Recheck source hashes, modification times, and sidecar state against the baseline after backup creation; any source change invalidates this deployment attempt.

Do not perform checkpointing, recovery, or migrations on the source database.

### Obsidian vault

Back up the complete vault, including:

- Generated Markdown.
- User-owned Markdown.
- Attachments and other files.
- `.obsidian` configuration.
- Hidden files and Git metadata where present.

Verify backup completeness using the captured inventory, file sizes, and cryptographic hashes.

Record the backup location and verification results.

Preserve the historical backup:

`D:\knowledge-sync-backups\task021-20261014-011117`

Do not overwrite, move, or delete it.

**If either backup cannot be verified, Phase 1 must stop before export.**

## 8. Final dry-run

Use the existing verified built CLI:

```powershell
node dist/cli/index.js export obsidian --db "D:\codex\knowledge-sync\data\knowledge-sync.sqlite" --vault "D:\obsidian" --dry-run
```

Expected exact result:

| Counter | Expected |
|---|---:|
| additions | 350 |
| updates | 1 |
| unchanged | 0 |
| conflicts | 0 |

The single planned update must be:

`D:\obsidian\Knowledge Sync.md`

Confirm this target using the export plan or equivalent verified evidence; counters alone are insufficient.

Revalidate the 350 proposed additions against the baseline and destination filesystem.

If any count, target, database state, or collision result differs from the required plan or captured baseline, stop and report the discrepancy. Confirm that the baseline still holds immediately before export; changed inputs require renewed verification and approval of the changed plan.

Dry-run must not modify SQLite, the vault, or repository data.

## 9. Initial real export

Execute this section only after Gate B approval.

Command:

```powershell
node dist/cli/index.js export obsidian --db "D:\codex\knowledge-sync\data\knowledge-sync.sqlite" --vault "D:\obsidian"
```

Expected behavior:

- Create exactly 350 new readable item/collection Markdown files.
- Update the single root navigation file.
- Leave all legacy Markdown files untouched.
- Leave all user-owned content untouched.
- Leave SQLite untouched.

Record:

- CLI result and exit status.
- Actual created paths.
- Any modified paths.
- Publication errors or warnings.
- Unexpected files or filesystem changes.

No legacy cleanup is authorized.

## 10. Post-export verification

Compare the resulting filesystem against the pre-deployment baseline.

### New Markdown

Verify:

- All 350 expected files exist.
- Paths match the planned readable filename format.
- Source identity suffixes are correct.
- Ownership markers are valid.
- Content fingerprints match the implemented Task 024 rules.
- No unexpected additional files exist.
- Relevant generated collection and item links resolve.

Fingerprint verification applies to **350 item and collection files only**.

### Root navigation

Validate `Knowledge Sync.md` separately:

- Recognized root navigation ownership marker.
- Expected generated content.
- Expected collection coverage and navigation structure.
- Links targeting the correct readable Markdown paths.
- No unexpected or unresolved generated targets.

The root file uses marker-only ownership. Do not apply the item/collection fingerprint requirement to it.

Its marker does not prove that historical manual edits never occurred.

### Existing files

Verify using recorded SHA-256 hashes, sizes, and modification times:

- All 350 legacy Markdown files remain unchanged.
- All protected user-owned files remain unchanged.
- All other pre-existing files remain unchanged, except the authorized root navigation file.
- No pre-existing files were deleted.
- SQLite bytes and modification time remain unchanged, and no unexpected journal/sidecar changes occurred.

Any discrepancy must be reported.

## 11. Repeat-export acceptance

After successful initial verification, perform the same export again to test idempotency.

Expected exact result:

| Counter | Expected |
|---|---:|
| additions | 0 |
| updates | 0 |
| unchanged | 351 |
| conflicts | 0 |

The 351 unchanged outputs consist of:

- 350 item and collection notes.
- One root navigation file.

Verify that all 351 output files retain identical bytes and modification times across the repeat export.

Also confirm that legacy files, user-owned files, and SQLite remain unchanged.

If the repeat export attempts a write or fails any required invariant, report the failure rather than accepting Phase 1.

## 12. Failure handling

If initial export, repeat export, or any verification fails:

1. Stop further export operations.
2. Do not execute the repeat export when initial verification failed.
3. Preserve the current filesystem state.
4. Record actual additions, modifications, and failures.
5. Compare the state against the captured baseline.
6. Determine whether publication was partial.
7. Identify any affected protected files.
8. Propose targeted recovery actions.
9. Request separate approval before rollback.

No automatic rollback is permitted.

A possible authorized rollback may remove only newly deployed files verified by both the deployment manifest and matching current hashes.

Restoration of `Knowledge Sync.md` may occur only after confirming that doing so will not overwrite subsequent user changes.

Ambiguous or changed files must be preserved for manual review.

## 13. Phase 1 acceptance criteria

Phase 1 can be accepted only if:

- Fresh SQLite and full-vault backups were verified before export.
- Explicit Gate A approval was obtained before backup creation.
- Final dry-run matched exactly 350 additions, one root update, zero unchanged, and zero conflicts.
- Explicit Gate B approval was obtained.
- Initial export completed successfully.
- All 350 readable Markdown files passed validation.
- Root navigation passed its separate checks.
- All legacy and user-owned files remained unchanged.
- SQLite remained unchanged.
- Repeat export reported 0 additions, 0 updates, 351 unchanged, and 0 conflicts.
- All repeat-export output bytes and mtimes remained unchanged.
- No unexplained filesystem differences remain.

Successful automated verification should be followed by manual inspection in Obsidian.

Any unmet criterion must be documented; acceptance must not be claimed prematurely.

## 14. Reporting

The deployment report must contain:

1. Gate A authorization and backup verification results.
2. Baseline inventory summary.
3. Final dry-run results.
4. Gate B authorization.
5. Initial export results.
6. Root navigation validation.
7. Item/collection fingerprint validation.
8. Protected-file comparison results.
9. Repeat-export counts and metadata comparison.
10. Errors, deviations, or remaining uncertainty.
11. Final Phase 1 acceptance recommendation.
12. Exact newly created paths or a reproducible manifest reference.

Keep deployment evidence outside the protected vault and repository working files.

## 15. Phase 1 exclusions

This phase does not authorize:

- Deleting 350 legacy Markdown files.
- Removing whole source directories.
- Renaming user-owned files.
- Rewriting user-authored backlinks.
- Changing SQLite schema or stored data.
- Implementing migration or cleanup tools.
- Beginning Task 025.
- Commit or push.

Legacy cleanup will be evaluated separately after successful real-vault acceptance.

## 16. Current status

This is the canonical standalone Phase 1 specification. Documentation refinement is complete; Task 025 has not started.

The previous assessment supports technical readiness for additive deployment, subject to renewed preflight verification.

Fresh backup creation, real export, rollback, and legacy cleanup are not authorized by this document alone.
