# Task 024 — Gate A: Read-Only Backup Preflight

## Objective

Prepare a safe, verifiable backup procedure before Task 024 Phase 1 real-vault deployment.

**This is an investigation-only task. Do not create backups or modify any files.**

The current stage is Gate A — Backup Preparation. No backup creation, export, cleanup, migration, rollback, commit, or push is authorized.

## 1. Read project instructions and specification

Review:

- `AGENTS.md`
- `docs/SESSION_HANDOFF.md`
- `prompts/task-024.md`
- `prompts/task-024-real-vault-deployment-phase-1.md`

The last document is the canonical Phase 1 deployment specification.

Follow its safety requirements, approval boundaries, and acceptance criteria.

Do not reopen completed implementation reviews or architecture decisions unless a new material blocker is discovered.

## 2. Environment

- OS: Windows 11
- Shell: PowerShell
- Repository: `D:\codex\knowledge-sync`
- SQLite: `D:\codex\knowledge-sync\data\knowledge-sync.sqlite`
- Obsidian vault: `D:\obsidian`
- Backup root: `D:\knowledge-sync-backups`

Existing historical backup:

`D:\knowledge-sync-backups\task021-20261014-011117`

This historical backup must remain completely untouched.

Use the existing validated built CLI for future deployment. Do not rebuild the project.

## 3. READ-ONLY investigation

### A. Storage and paths

Inspect:

1. Existence and accessibility of the SQLite database.
2. Existence and accessibility of the Obsidian vault.
3. Database file size.
4. Total vault size, including hidden files and `.obsidian` configuration.
5. Available free disk space on the destination volume.
6. Existing backup root and potential destination collisions.
7. Whether any reparse points, junctions, symbolic links, or unusual filesystem entries could affect backup completeness.

Estimate storage required for both backups and verification metadata.

Do not create directories or temporary files.

### B. SQLite preflight

Inspect without writing:

1. SQLite header validity.
2. Reported journal mode, using a method that does not modify the database.
3. Presence and metadata of `-wal`, `-shm`, and `-journal` sidecars.
4. Relevant running processes and available indications of concurrent database writers.
5. File access limitations or locking concerns.
6. Whether the proposed backup method can produce a transactionally consistent database copy.

Treat process inspection as advisory: absence of a visible writer does not prove exclusive access.

Do not run commands that could change SQLite state or create sidecars.

Do not open the database through a potentially writing connection.

If a fully read-only check cannot be guaranteed, report the limitation instead of executing it.

### C. Vault inventory and baseline

Determine:

1. Total number of files and directories.
2. Total Markdown files.
3. Legacy generated Markdown count.
4. External/user-owned Markdown count.
5. Root `Knowledge Sync.md` status.
6. Whether the current inventory still matches the previous assessment.

Previous assessment recorded:

- 322 KnowledgeItems.
- 28 collections.
- 323 memberships.
- 350 legacy generated Markdown files.
- 161 external Markdown files.
- 1 root navigation file.
- 512 total Markdown files.

These numbers are historical expectations, not assumed current facts.

Propose a deterministic baseline manifest containing relative paths, file sizes, SHA-256 hashes and modification timestamps.

The initial baseline must be captured before backup creation during the authorized execution stage.

For this preflight, inspect and report only. Do not write a manifest.

## 4. Propose backup procedure

Recommend a specific, minimal-risk backup procedure for:

### SQLite

Prefer an SQLite-supported online backup mechanism that produces a consistent database snapshot.

The canonical Phase 1 quiescent-window requirement applies even when using
SQLite's online backup API. The proposed procedure must:

- Establish and maintain a quiescent window before and throughout backup.
- Capture source hashes, sizes, modification times, and SQLite sidecar state before backup.
- Recheck source hashes, sizes, modification times, and sidecars after backup.
- Detect and report any source changes during the backup window.
- Treat detected changes as a failed unchanged-source acceptance condition; stop and investigate.
- Avoid claiming exclusive writer control based solely on process inspection.

Explain:

- Tool or API to use.
- Exact PowerShell commands or script.
- How consistency is achieved.
- How concurrent writers are handled.
- What prerequisites must be satisfied.
- How the resulting backup is verified.

Avoid a raw database file copy unless its consistency can be established under the actual journal and writer conditions.

### Obsidian vault

Propose a complete filesystem backup preserving the vault's contents, including:

- Hidden files and directories.
- `.obsidian` configuration.
- `.git` directory and all Git metadata, if present.
- User-authored files, attachments, and generated Markdown.
- Full relative directory structure.

Unsupported filesystem entries, unresolved reparse points, or inaccessible files
must block a successful completeness claim. Do not silently skip them.

Explain:

- Copy mechanism.
- Treatment of hidden files and reparse points.
- Protection against concurrent modifications.
- How to detect copy failures and incomplete transfers.
- Verification of file contents and completeness.

Do not assume a successful copy command alone proves completeness.

## 5. Backup destinations

Propose a fresh timestamped directory:

`D:\knowledge-sync-backups\task024-predeploy-<timestamp>`

Use clearly separated destinations for:

- SQLite backup.
- Complete vault backup.
- Verification manifests and reports.

Provide concrete proposed paths and check that the selected directory will not overwrite existing data.

Do not create the destination during preflight.

## 6. Backup verification plan

Specify how to verify:

### SQLite backup

- Backup file exists and is nonempty.
- SQLite header is valid.
- `PRAGMA integrity_check` returns `ok` when run against the backup, not the live database.
- Expected schema and historical counts are present: 322 KnowledgeItems,
  28 collections, and 323 memberships.
- Membership referential integrity holds: every membership references an
  existing item and an existing collection using their full logical identities.
- SHA-256 hash is recorded.
- Source and backup consistency limitations are documented.

Any difference from historical expectations must be reported and investigated,
not silently accepted or corrected. Detected source hash, size, modification-time,
or sidecar changes fail unchanged-source acceptance even if the backup itself
passes integrity checks.

### Vault backup

- File and directory inventory is complete.
- Relative paths match the source baseline.
- SHA-256 hashes match for every regular file.
- File sizes match.
- Relevant modification timestamps are preserved or their differences explained.
- No unexpected files are missing or added.
- Any unsupported filesystem entries are explicitly reported.

Distinguish content verification from metadata verification.

Do not claim an atomic vault snapshot if the proposed mechanism does not provide one.

## 7. Required output

Return a structured Gate A Preflight Report containing:

1. **Environment findings** — actual paths, sizes, free space and relevant filesystem characteristics.
2. **SQLite safety assessment** — journal/sidecar state, potential writers and backup mechanism.
3. **Vault inventory** — actual current counts, size and any deviations.
4. **Recommended procedure** — exact commands, sequence and destinations.
5. **Verification plan** — SHA-256, file completeness and SQLite integrity.
6. **Risks and prerequisites** — including concurrent modifications, insufficient space and filesystem limitations.
7. **Gate A readiness verdict** — READY, BLOCKED or NEEDS CLARIFICATION, with reasons.
8. **Approval request** — precisely identify what would be created or modified during the next authorized step.

Keep the procedure straightforward. Avoid new frameworks, schema changes or implementation work.

## 8. Strict stop boundary

**STOP after producing the preflight report.**

Do not:

- Create backups or directories.
- Modify SQLite or the Obsidian vault.
- Execute real export or cleanup.
- Create manifests on disk.
- Modify repository files or documentation.
- Run builds, migrations or other potentially writing commands.
- Commit or push.
- Automatically proceed to Gate B.

Only explicitly read-only inspection commands are authorized.

If any inspection is potentially mutating, do not execute it.

Wait for explicit user approval before performing the proposed Gate A backup procedure.
