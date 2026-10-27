# knowledge-sync — Task 024 Real-Vault Pre-Deployment Assessment

## Role

Perform a strictly READ-ONLY pre-deployment assessment for Task 024.

Task 024 implementation and Windows acceptance are complete. The goal is to determine the safest and simplest way to deploy the new portable readable Markdown filenames into the real Obsidian vault.

This is an investigation and recommendation task, NOT an implementation or migration task.

## Environment

- Repository: `D:\codex\knowledge-sync`
- SQLite database: `D:\codex\knowledge-sync\data\knowledge-sync.sqlite`
- Real Obsidian vault: `D:\obsidian`
- Platform: Windows 11 / PowerShell
- Use `npm.cmd` instead of `npm` where applicable.

Read relevant documentation first:

- `AGENTS.md`
- `docs/SESSION_HANDOFF.md`
- `prompts/task-024.md`

Inspect actual implementation as needed. Do not assume CLI flags or internal behavior without verifying the code.

## Strict safety boundaries

This assessment must remain READ-ONLY.

Do NOT:

- Modify SQLite database files, WAL, SHM, or journal state.
- Trigger SQLite recovery, checkpointing, migrations, or initialization writes.
- Execute real export or synchronization.
- Delete, rename, move, or overwrite files in the vault.
- Modify any repository files, including documentation.
- Create backups yet.
- Execute git commit, push, reset, clean, or checkout.
- Install dependencies or run commands that generate files.
- Create reports or temporary artifacts inside the repository or vault.
- Implement new functionality.
- Start Task 025.

Use source inspection, metadata inspection, safe read-only commands, and stdout reporting.

If a command could cause writes, investigate its behavior before running it. If zero-write behavior cannot be established, skip the command and report the limitation.

## Investigation A — SQLite safety

Determine:

1. Whether the database exists and is accessible.
2. Whether `-wal`, `-shm`, or rollback-journal files exist.
3. Their sizes and relevant timestamps, if present.
4. Whether an application appears to be actively using the database.
5. Whether database access can be performed without creating or changing files.
6. Whether the existing export-only implementation can safely read the current database state.
7. Whether the current database needs any prerequisite action before deployment.

Do not assume that the absence of WAL/journal files proves that no writer is active.

Do not attempt recovery or checkpointing.

If reliable SQL inspection would require an operation that might modify database state, stop that part of the assessment and identify the limitation.

## Investigation B — Current database inventory

If safe read-only access is possible, determine:

- Current total KnowledgeItems.
- Item counts by source.
- Current collections by source.
- Membership counts.
- Any relevant invalid, missing, or inconsistent references.

Historical baseline (not necessarily current):

- 322 items.
- 28 collections.
- 323 memberships.
- 351 generated Markdown files.

Report actual numbers, not historical assumptions.

## Investigation C — Real vault inventory

Inspect existing files under `D:\obsidian`, focusing on Knowledge Sync generated outputs.

Determine:

1. Existing YouTube item files.
2. Existing Facebook item files.
3. Existing collection files.
4. Root `Knowledge Sync.md`.
5. Legacy filename patterns.
6. Any files already using Task 024 filename patterns.
7. Unknown, unexpected, or potentially user-owned files.
8. Existing ownership markers and fingerprints, where applicable.

Classify files conservatively:

- Confirmed generated.
- Likely legacy generated.
- User-owned or manually modified.
- Ambiguous / requires manual review.

Do not classify a file as safely removable based only on its directory or filename.

Inspect generated-note content or markers when necessary.

## Investigation D — Task 024 filename and collision analysis

Inspect the actual readable filename implementation and export plan.

Determine whether the current SQLite records could produce:

- File/path collisions.
- Existing target paths occupied by user-owned files.
- Case-insensitive Windows filename conflicts.
- Path length or invalid-character problems.
- Conflicts between legacy and new filenames.
- Unexpected collection or navigation targets.

Compare existing paths with expected new paths wherever safe and practical.

Prefer reusing existing pure planning functionality rather than implementing new analysis code.

Do not create persistent output files.

Report concrete conflicting paths if found.

## Investigation E — Manual modifications and root navigation

Evaluate:

- Whether existing generated notes have ownership markers.
- Whether legacy notes can be reliably distinguished from user-authored notes.
- Whether existing Markdown content differs from expected generated content, where safely determinable.
- Whether `Knowledge Sync.md` contains potentially user-authored modifications.
- Whether overwriting root navigation would discard any meaningful manual content.

If modification status cannot be verified reliably, mark it UNKNOWN rather than treating it as safe.

## Investigation F — User-authored backlinks

Perform a read-only assessment of links pointing to legacy generated Markdown files.

Include, where relevant:

- Obsidian wikilinks.
- Markdown links.
- Relative path links.
- Filename-based links.
- Links from user-owned notes to generated items or collections.

Distinguish:

- References inside generated content, which can be regenerated.
- References inside user-owned content, which must be protected.
- Ambiguous references.

Do not modify links.

Report the number and examples of affected user-owned files, if identifiable.

Explain any coverage limitations, including references that cannot be resolved reliably through static scanning.

## Investigation G — Dry-run feasibility

Inspect the actual export-only CLI and `--dry-run` implementation.

Determine:

1. The exact supported command.
2. Whether it can operate without modifying SQLite or vault files.
3. Whether it initializes or modifies other persistent files.
4. Whether existing WAL/journal state prevents it from running.
5. What deployment-relevant information it reports.

Only execute a dry-run if both its implementation and the observed environment establish that it is safe and side-effect-free for the protected database, vault, and repository.

If this cannot be established, do NOT execute it. Report the correct command and unmet preconditions instead.

## Investigation H — Deployment recommendation

Compare the simplest viable approaches:

**Option A — In-place export followed by separately approved legacy cleanup.**

**Option B — Rebuild only confirmed generated Markdown output, preserving SQLite and all user-owned content.**

**Option C — Staged export into an isolated vault/output location, followed by a separately approved deployment.**

Recommend ONE preferred approach based on observed facts.

Avoid introducing:

- SQLite path registry.
- New migration frameworks.
- New permanent metadata tables.
- Obsidian display-name plugins.
- Unnecessary implementation tasks.

Include how to handle legacy paths, backlinks, ambiguous files, and the root navigation note.

## Investigation I — Backup and rollback proposal

Do NOT create backups.

Propose:

- A consistent SQLite backup method suitable for the observed database state.
- A suitable vault backup method.
- Verification of backup integrity and completeness.
- A reversible deployment sequence.
- Recovery steps if export or validation fails.
- Specific safeguards for user-owned content.

Preserve the historical backup at:

`D:\knowledge-sync-backups\task021-20261014-011117`

Do not modify it.

## Required final report

Return a concise, evidence-based assessment using these sections:

### 1. Deployment readiness
READY / BLOCKED / NEEDS MANUAL REVIEW, with explanation.

### 2. SQLite state
Observed database, WAL, journal, and process state. State whether database inventory was safely accessible.

### 3. Current inventory
Actual item, collection, membership, and Markdown counts where determinable.

### 4. Legacy classification
Counts of confirmed generated, likely legacy, user-owned, ambiguous, and new-format files.

### 5. Collision and overwrite risks
Concrete findings with paths.

### 6. Backlink risks
Affected user-owned files and references, if found.

### 7. Root navigation risk
State of `Knowledge Sync.md`.

### 8. Dry-run
Command, safety verification, execution status, and result if executed.

### 9. Recommended deployment strategy
Choose one approach and explain why.

### 10. Backup and rollback plan
Specific steps without executing them.

### 11. Approval-gated action plan
Provide an ordered list of actions for a future deployment session.

### 12. Blockers and unanswered questions
Only genuine blockers or material unknowns.

## Completion requirements

- Zero modifications to SQLite, vault, and repository.
- No implementation.
- No real export.
- No cleanup.
- No backup creation.
- No commit or push.
- Clearly distinguish observed evidence from assumptions.
- Where practical, cite repository paths, functions, commands, and relevant file locations.

Stop after delivering the assessment and await explicit authorization for deployment.
