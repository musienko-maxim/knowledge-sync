# Project Session Handoff

Updated: 2026-10-27

## Task 024 Gate A/B1 evidence reconciliation — 2026-10-27

**DOCUMENTATION ONLY — GATE B2 NOT EXECUTED; REAL DEPLOYMENT PENDING SEPARATE EXPLICIT AUTHORIZATION.**

This checkpoint updates deployment status; the earlier preparation and implementation
entries below remain historical records of their own session scopes.

Gate A completed and was verified. The exact verified backup location is:
`D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z`.
Read-only inspection of its existing evidence during this reconciliation confirmed:

- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\result.json`
  records `passed=true`, `failure=null`, at `2026-10-26T23:43:39.719Z`.
- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\sqlite-verification.json`
  records SQLite integrity `ok`, 322 items, 28 collections, 323 memberships,
  and zero invalid membership references.
- `D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\vault-backup-manifest.json`
  records 605 files and 101 directories verified by Gate A. The existing
  `evidence\baseline.json` and `evidence\post-backup.json` record matching counts.

This confirms the recorded Gate A results, not a fresh live-source comparison or
a new byte-for-byte backup verification. The source baseline reference is
`D:\knowledge-sync-backups\task024-predeploy-20261026-233422Z\evidence\baseline.json`;
it is Gate A evidence, not proof of Gate B1 execution.

**Gate B1 reported PASSED:** the user supplied the prior result of 350 additions,
1 update, 0 unchanged, and 0 conflicts. No persistent Gate B1 execution report,
log, or B1-specific baseline was located in the repository or the supplied backup's
evidence directory. The [B1 prompt](../prompts/task-024-gate-b1-final-preflight.md)
is a procedure, not a completed report. This evidence gap remains unresolved;
no execution evidence has been invented or regenerated.

The renamed [Gate B2 real-export prompt](../prompts/task-024-gate-b2-real-export.md)
requires fresh read-only B1 acceptance checks immediately before any separately
authorized B2 execution, including baseline/backup revalidation, quiescence,
sidecar checks, exact dry-run counts and targets, ownership/path/link checks,
and confirmation that the dry-run leaves the sources unchanged. Changed inputs
require renewed verification and approval of the changed plan under the
[canonical Phase 1 specification](../prompts/task-024-real-vault-deployment-phase-1.md).

The B2 prompt now distinguishes identity, ownership, SHA-256 fingerprint, path,
and link validation for the 350 new item/collection files from root navigation's
marker, expected-content, and link checks. `Knowledge Sync.md` does not require
an item/collection fingerprint; its historical manual-modification status remains
UNKNOWN, and its marker alone does not prove the absence of past manual edits.

Gate B2 has not been executed. No live SQLite or vault inspection, dry-run,
export, backup modification, cleanup, migration, rollback, commit, or push was
performed during this documentation reconciliation. Only the renamed B2 prompt
and this handoff were changed. Legacy cleanup and Task 025 remain excluded;
all 350 legacy files must remain intact. Stop here: real deployment requires
separate explicit user approval.

## Task 024 Phase 1 preparation — 2026-10-27

**READ-ONLY ASSESSMENT PREVIOUSLY REPORTED COMPLETE — REAL DEPLOYMENT PENDING.**

The completed read-only real-vault assessment was reported after the implementation
checkpoint below. The following findings are supplied prior assessment evidence,
not fresh verification by this documentation session:

- 322 KnowledgeItems: 52 YouTube and 270 Facebook; 28 collections and 323 memberships.
- 350 legacy item/collection Markdown files reportedly matched reconstructed
  legacy rendering byte-for-byte. Another 161 Markdown files were outside the
  generated areas: 512 Markdown files total, including root navigation.
- SQLite was reported in rollback-journal mode without WAL, SHM, or journal
  sidecars, with a consistent read-only snapshot.
- No occupied new targets or Windows path conflicts were identified. Static
  scanning found no backlinks from the 161 external Markdown files to legacy
  generated files; this is limited scan evidence, not proof about all references.
- `Knowledge Sync.md` reportedly matched reconstructed legacy output. Its
  historical manual-modification status remains UNKNOWN; marker-only ownership
  does not detect historical manual edits.
- Real-vault dry-run reportedly succeeded with 350 additions, one root navigation
  update, and zero conflicts. No real export, cleanup, or backup creation occurred
  during that assessment.

No persistent completed assessment report was located in the repository
documentation reviewed for this refinement. The
[assessment brief](../prompts/real-vault-assesment.md) is an investigation
specification, not a results report. Original terminal/chat output, exact manifests,
hashes, and scan details are not available as a linked report here. The supplied
findings are recorded with that evidence gap; current state still requires the
checks specified for future deployment.

The canonical [Phase 1 deployment specification](../prompts/task-024-real-vault-deployment-phase-1.md)
now contains the complete additive deployment procedure: fresh verified SQLite
and full-vault backups, a path/hash/mtime baseline, exactly 350 planned additions
and one root replacement, separate item/collection fingerprint and root-marker
validation, protected-file checks, and repeat-export acceptance of 0 additions,
0 updates, 351 unchanged, and 0 conflicts with unchanged bytes and mtimes.

Authorization boundaries remain explicit:

- **Gate A:** present backup destinations and procedure, then obtain explicit
  approval before creating backups. Preserve the historical Task 021 backup.
- **Gate B:** after verified backups, baseline capture, and exact final dry-run,
  obtain explicit approval for initial export, replacement of `Knowledge Sync.md`,
  and repeat export after successful initial verification. Gate A does not grant
  Gate B approval.
- **Gate C:** on failure, stop exports, preserve state, compare against the
  baseline, and report partial publication. Obtain separate explicit approval
  before removing new files or restoring root navigation; no automatic rollback.

Legacy cleanup remains excluded, including after successful verification; all
350 legacy files must remain in place. Task 025 has not started. This documentation
update grants no backup, deployment, rollback, cleanup, commit, or push authority.
No real database or vault access was performed in this session. Only the canonical
Phase 1 specification and this handoff were edited; useful historical checkpoints
below are retained and describe their own session scopes.

## Task 024 implementation — 2026-10-26

The user approved the architecture review with explicit changes in
[prompts/task-024.md](../prompts/task-024.md), then repeatedly resumed work after
usage-limit interruptions. The task file now retains that authorization and the
finalized contract. Implementation is authorized; real-vault deployment is not.
Preserve the pre-existing review/handoff edits and `prompts/arc-review.md`.
Do not commit or push automatically.

Implemented:

- Readable Unicode current-title prefixes plus the specified 32-hex SHA-256
  source/kind/full-ID suffix; no identity changes, path registry or schema changes.
- One immutable shared path/render plan, full destination preflight, portable
  collision/path budgets and all-source ancestor/junction checks. All production
  exporters and item/collection-only batch adapters use the new contracts.
- Versioned full-identity ownership and exact-byte SHA-256 fingerprints for new
  items/collections. The parser accepts only its documented generated YAML grammar.
  Unknown, old-format and modified targets are preserved. Navigation retains its
  separate marker-only ownership protection and current combined-section layout.
- Phase-gated atomic per-file publication: item failures skip collections/root;
  collection failures skip root. Identical files keep bytes and modification times.
  Title changes produce current links/new paths while old files remain untouched.
- `export obsidian --db <existing.sqlite> --vault <existing-directory> [--dry-run]`.
  Explicit paths only, consistent read transaction, no source/network credentials,
  no writable initialization, no schema creation. Conservative header/filesystem
  checks reject WAL/journal/sidecar states; no recovery/checkpoint/repair is tried.
  SQLite temporary storage is memory-only. Dry-run does not write files or sidecars.
- Storage-owned snapshots for existing export flows; strict original identity-byte
  validation before the SQLite driver's string decoding, including UTF-8/UTF-16.
- Privacy-safe collision codes/indexes and explicit skipped phases in all CLI routes.
  Possible leftovers are informational and never authorize adoption or cleanup.

New source files: `src/cli/obsidian-export.ts`,
`src/outputs/obsidian/{export-plan,generated-note,preflight,readable-path,safe-path,write-generated-note}.ts`,
`src/storage/knowledge-snapshot.ts` and
`src/storage/sqlite/{read-only-snapshot,read-snapshot}.ts`.
Existing application, CLI, renderer/path/publisher and storage files are integrated;
the existing directory structure is retained:
`src/{application,auth,cli,collectors,core/models,outputs/obsidian,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts`.

New regression files: `tests/{export-plan,generated-note,obsidian-export-cli,obsidian-preflight,readonly-snapshot}.test.ts`.
Existing tests intentionally change title-independent filename expectations and
continuation-after-failure behavior. Updated documentation: task specification,
README, [output contract](../src/outputs/obsidian/README.md), and this handoff.

**IMPLEMENTED AND VERIFIED — temporary-vault acceptance complete.**

Final verification:

- `npm.cmd install` passed, with no dependency/version changes. Audit reported
  five findings (two moderate, three high); dependency remediation is outside scope.
- Focused storage, naming/rendering, CLI, publication and safety suites passed.
  Exact-byte YAML parser and malformed SQLite identity-byte regressions also pass.
- Final `npm.cmd test`: **1,243 passed, 4 skipped, 54 files passed**. The skips
  are the existing POSIX-permission test and three navigation file-symlink tests
  unavailable on Windows. Real directory-junction safety regressions pass.
  A sandboxed diagnostic run hit `uv_os_get_passwd ENOMEM` in tsx subprocess
  tests; the approved escalated final full run passed. Earlier failures from
  obsolete filename/publication assertions were updated to the approved contracts.
- `npm.cmd run typecheck` and `npm.cmd run build` passed.
- Built startup/top-level help, `export obsidian --help`, YouTube sync-obsidian help,
  Facebook import help and packaged `knowledge-sync --help` passed.
- Built CLI temporary E2E passed: 2 mixed-source items, 1 collection, 4 Markdown
  files; zero-write dry-run, repeat byte/mtime identity, then title change with 5
  files and updated links while old bytes remain. Temporary files were removed.
- Independent architecture/security review has no remaining actionable findings.
  Review fixes reject ambiguous duplicate YAML keys even with recomputed digests,
  reject corrupted identity bytes before decoder replacement, and retain safe
  collision details in Facebook/export-only errors.
- Windows executed; real junction cases pass. Linux was not executed because WSL
  is not installed. Portable naming/path policies are exercised on Windows too.
- `git diff --check` and 18 current local documentation links passed. No package
  manifest or lockfile dependency changes. Temporary diagnostic reports removed.

Known limits: WAL/journal states intentionally unsupported by export-only;
no automatic historical-file cleanup/migration or backlink repair; root navigation
body edits remain replaceable under its dedicated marker. One writer and no
concurrent external changes are assumed; preflight/open and check/rename races
are not eliminated. No cross-file transaction or universal power-loss durability.
During this implementation verification, the real DB, `D:\obsidian`, and verified
Task 021 backup were not accessed. The later read-only assessment is recorded
above as previously reported evidence; it did not execute deployment.
No dependencies, architecture expansion, commits or pushes were added.
No implementation deviations from the finalized specification; Linux execution
is the disclosed verification limitation. No open code-review findings remain.

Before separately authorized real-vault use: inventory actual output, confirm fresh
DB/vault backups, run dry-run and review links/conflicts. Preserve the historical
backup. Migration/cleanup requires a separate reviewed task. Do not start Task 023
or any next task automatically.

## Revised readable-filename architecture review — 2026-10-25

The user requested a read-only architecture review of the revised
[filename proposal](../prompts/arc-review.md). This version supersedes the earlier
presentation-only/plugin preference: the user requires readable physical Markdown
filenames that work in Windows Explorer, accepts title-driven path changes, and
allows a controlled rebuild of generated output. The review was returned in the
conversation. No implementation, tests, SQLite access, vault access, or backup
access was performed. `prompts/arc-review.md` remains an untracked user file and
must be preserved.

**RECOMMENDATION: readable current-title prefixes plus a deterministic suffix,
without a persistent path registry.** A proposed suffix is a truncated SHA-256
over a versioned, source-qualified identity tuple including entity kind; full
identity remains authoritative in SQLite and generated metadata. Slugs should
preserve Ukrainian/Unicode letters, use deterministic normalization, and handle
Windows-invalid names, case-insensitive collisions, malformed Unicode, and path
budgets. The exact slug/suffix contract remains to be specified; the review's
example lengths are proposals, not accepted requirements.

The existing architecture has no path registry. `src/outputs/obsidian/note-path.ts`
and `collection-path.ts` currently derive paths from identity only. Notes include
title frontmatter, but navigation, collection links, writers, and projection
validation independently call those current path builders. If implemented, one
export plan must calculate each target once and feed all note/index links.

An export-only command needs a new read-only SQLite snapshot path: current
`openStorage()` creates directories and bootstraps tables, so it is unsuitable.
The snapshot must be consistent, the database must already exist, and errors
must occur before vault writes. The command must not fetch YouTube data, require
credentials, or import Facebook data.

**Cleanup is the main safety risk.** Existing Facebook ownership checks validate
an identity prefix but not user edits elsewhere in a note. Legacy YouTube writes
do not have equivalent ownership protection. New generated files should carry
versioned full-identity ownership data and a content fingerprint for detecting
ordinary edits; fingerprints are provenance checks, not authentication. Legacy
files need a one-time reviewed allowlist of exact paths, identities, and content
hashes. Unknown or modified files should be preserved.

Publish all new items, then collections, then root navigation. Any failure
suppresses cleanup. On complete publication, retire only verified obsolete files
whose identity has a successfully published replacement. Compare Windows
equivalent paths so a case-only title change cannot delete its new target. Prune
old collection indexes before item notes; stop cleanup on conflicts or errors.
Empty snapshots and identities absent from the snapshot never trigger broad
deletion. Interrupted runs may leave duplicate generated files for retry.

Generated links can be rebuilt, but user-authored backlinks to old filenames
cannot be guaranteed. This compatibility consequence requires explicit
acceptance or separately scoped reference migration. No global filesystem or
SQLite transaction is available.

The review recommends a **separate implementation task**, since the work changes
filename compatibility and adds export-only reading, ownership/fingerprint
behavior, phased publication, and cleanup. Relevant areas include
`src/outputs/obsidian/{note-path,collection-path,collection-markdown,navigation-markdown,export-projection,write-owned-note}.ts`,
`src/outputs/markdown.ts`, `src/storage/sqlite/storage.ts`,
`src/application/read-obsidian-snapshot.ts`, `src/cli/program.ts`, and existing
path, Markdown, projection, Facebook export, and CLI tests. Existing tests that
assert title-independent paths and export continuation after note failures must
change intentionally.

No implementation is authorized by this review. Before implementation, specify
the final naming/collision rules, legacy-file adoption and deletion policy,
backlink compatibility choice, export-only command behavior, and acceptance
tests. Any real-vault rebuild needs separate explicit authorization and a fresh
backup; preserve the recorded Task 021 backup.

## Task 021 implementation recovery — 2026-10-11

The user asked to resume after a token-limit interruption. Entry-state inspection
found the approved [implementation assignment](../prompts/task-021-implementation.md)
and the preserved [review prompt](../prompts/task-021.md), both untracked, with
`prompts/task-022.md` already deleted. The implementation assignment explicitly
records approval to proceed. No source changes had started. This task resumes
Facebook Saved JSON import; the review-only prompt is retained as historical
context. The deletion is preserved. Do not commit or push automatically.

**IMPLEMENTED — AWAITING REAL E2E ACCEPTANCE.** Implementation and verification
finished after the second usage-limit resumption on 2026-10-12. The command is
`facebook import --file <collections.json> [--db <path>] [--vault <path>]`.

The parser validates the whole bounded input before SQLite is opened. Exact URL
SHA-256 identities, string FBIDs, strict localized format/Unicode handling,
deterministic duplicate merging, safe conflict codes, and exact fallback promotion
are implemented. Collections, items, and unique memberships persist sequentially;
memberships are additive. Sparse updates preserve legacy metadata. Failures stop
later writes, retain completed counters, suppress export, and close storage.
There is no schema migration, dependency addition, or import-state recording.

Explicit `--vault` exports the full multi-source snapshot with existing paths and
navigation. Shared exporters protect Facebook item/collection ownership, reject
symlinks/junctions and unsafe intermediate directories, use exclusively created
sibling temporary files and failure-safe rename, and render untrusted text
literally. Mixed-source navigation validates vault ancestors. Shared diagnostics
redact Facebook identities/content even when invoked through YouTube commands.
Existing YouTube Markdown bytes and filenames are preserved.

Fresh verification:

- `npm.cmd install`: passed; no dependency changes. The pre-existing one-high
  audit finding remains outside this task's scope.
- Focused export verification: 155 tests across 10 files; initial parser
  verification: 48 tests. Integrated CLI regressions include Facebook import →
  YouTube export → Facebook reimport with item and collection collisions and
  diagnostic redaction.
- Final `npm.cmd test`: **1,188 passed, 4 skipped, 49 files passed**. Skips remain
  the existing POSIX-permission case and three navigation real-symlink cases on
  Windows. New real Windows junction checks pass.
- Final `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- Built CLI startup, top-level help, Facebook import help, and YouTube
  sync-obsidian help: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, whitespace checks for new source/tests/docs, and 35 local
  references in the current task documentation: passed.
- Independent read-only implementation/security review found one duplicate
  collection blank-name validation order issue. It is fixed by requiring a name
  in each record, with both-order regression coverage. No findings remain.
- An outdated help-text assertion failed in the initial full run; updated for
  the new command description before the final passing run.

Temporary E2E against the verified archive passed: **270 items, 14 collections,
271 memberships, 285 Markdown files**. A second import after reopening SQLite
reported all items/collections/memberships unchanged and identical generated
Markdown bytes, with no metadata warnings. No import-state records were created.
The source was read only, and private extracted JSON, SQLite, and output files
were held in an isolated OS temporary directory and removed after verification.

Read-only parsing of the original archive freshly confirmed 14 collections,
349 occurrences, 345 URL-bearing occurrences, 270 distinct items, 271 unique
memberships, 75 duplicate items, 74 repeated memberships, four URL-less skips,
and one empty collection. No private records were copied into the repository.
Only temporary SQLite/vault E2E is authorized; do not access the real database
or `D:\obsidian`.

Files added by implementation:

- `src/collectors/facebook/import.ts`
- `src/application/import-facebook.ts`
- `src/cli/facebook.ts`, `facebook-import.ts`, `facebook-import-output.ts`
- `src/outputs/obsidian/facebook-safety.ts`, `write-owned-note.ts`
- `tests/facebook-parser.test.ts`, `facebook-import.test.ts`,
  `facebook-import.integration.test.ts`, `facebook-cli.integration.test.ts`,
  `facebook-export.test.ts`, and `tests/fixtures/facebook/collections.json`
- [Source-format evidence](task-021-source-format.md)

Updated existing files: `src/cli/program.ts`, `src/cli/obsidian-export-failure.ts`,
`src/outputs/markdown.ts`, `src/outputs/obsidian/{collection-markdown,export-note,export-collection,export-projection,navigation-markdown}.ts`,
`tests/cli.test.ts`, `README.md`, `src/outputs/obsidian/README.md`, and this handoff.
The approved implementation and historical review prompts were already untracked
at task entry; the deleted Task 022 prompt was not restored.

Directory layout remains `src/{application,auth,cli,collectors,core/models,outputs/obsidian,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts`, with the new `collectors/facebook` and
sanitized `tests/fixtures/facebook` directories. No architecture deviations:
Task 021 explicitly authorizes local Facebook import beyond the earlier MVP scope.
Raw Facebook structures and normalization remain inside the collector directory.

Known limits: this recognizes the verified localized collections format only,
not arbitrary Facebook exports; the encoding repair is deliberately narrow.
Exact URL spellings define identity; no canonicalization or remote content fetch
is attempted. Older archives can revert collection names. Missing entries do not
remove data. Generated pages are replaceable and collisions need user resolution.
One writer and no concurrent external filesystem edits are assumed; rechecks are
not locks and no universal power-loss durability is promised. Abrupt termination
may leave orphan temporary files. Ownership markers are provenance conventions,
not cryptographic authentication. No commits or pushes were made.

Remaining acceptance: a separately authorized import using the user's chosen
real database/vault, followed by Obsidian navigation and link inspection. Do not
run it automatically or proceed to another task.

Previous implementation: the user confirmed Task 020 is finished on 2026-10-10
and requested conflict resolution and merge of PR #6. Fresh automated checks
pass. See the PR #6 checkpoint below; earlier no-commit/no-push statements
describe the implementation session before this publication authorization.

Latest real-world milestone: the first real-world YouTube → SQLite → Obsidian E2E validation
is **VALIDATED**, as recorded in [the milestone brief](../prompts/malestone1.md).
Tasks 001–018 are **COMPLETED / ACCEPTED**. See the E2E evidence and updated
roadmap below. That earlier milestone update changed documentation only.

Task 019 — YouTube Transcript Enrichment is **DEFERRED**, **LOW** priority,
with implementation **NOT STARTED**.
The [architecture review](task-019-review.md) is retained as historical analysis.
Revisit when core knowledge collection, synchronization, navigation, and search
capabilities are sufficiently mature. No acquisition route was selected; no
implementation or follow-up task is authorized by this deferral.

Previous implementation checkpoint: PR #5 conflict resolution merges `origin/main` into
`iteration/task-017-18-sync`, preserving the completed Tasks 017 and 018.
Fresh verification passed; see the current checkpoint below.
The resumed implementation authorization
and decisions are recorded in [the Task 018 review](task-018-review.md), which
supersedes the supplied brief's review-only stopping point. Previous checkpoint:
[Tasks 008–016 PR preparation](sessions/2026-10-05-tasks-008-016-pr.md).
The [Tasks 008–012 checkpoint](sessions/2026-10-02-tasks-008-012-checkpoint.md) is historical.
The [Tasks 005–007 checkpoint](sessions/2026-09-28-tasks-005-007-checkpoint.md)
is historical; PR #3 has since been merged.
The earlier [Task 004 checkpoint](sessions/2026-09-27-task-004-checkpoint.md)
is a historical record; PR #2 has since been merged.

## PR #6 conflict-resolution checkpoint — 2026-10-10

The user created [PR #6](https://github.com/musienko-maxim/knowledge-sync/pull/6)
from `task22` at `36ddc3b` and explicitly authorized resolving conflicts and
merging it. The working tree was clean at entry. Despite the branch/PR naming,
the implemented feature is Task 020 navigation; the Facebook draft in
`prompts/task-022.md` remains unimplemented.

Fetched `origin/main` at `b6153b5`, the squash merge of PR #5. Its complete tree
is identical to ancestor `4b5250c` on this branch. The squash ancestry caused
16 conflicted files and reintroduced the previously deleted
`prompts/task-018.md`. Resolution preserves all original PR files and that
deletion. Before this handoff update, both index and working tree exactly
matched `36ddc3b`; no independent main changes were lost.

Fresh checks: `npm.cmd install`, full Vitest suite (**1,082 passed, 4 skipped,
44 files**), typecheck, build, built CLI startup, and top-level plus YouTube
sync command help all passed. Skips remain the Windows POSIX-permissions case
and three real-symlink cases. Dependency installation changed no dependencies;
the existing one-high-severity audit finding remains outside this merge scope.
No real account, SQLite database, or Obsidian vault was used.

`npm.cmd exec --offline --package=. -- knowledge-sync --help` passed on an
approved escalated rerun after the sandboxed invocation stalled and was stopped.
Independent read-only review found no actionable conflict-resolution issues;
`git diff --check` passed.

No runtime, test, schema, dependency, or directory-layout changes were needed.
The existing `src/{application,auth,cli,collectors,core/models,outputs/obsidian,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts` layout is retained. No specification
deviations. Publication uses normal merge ancestry; check PR #6 and Git for
the final merge and publication state.

## Task 020 resumed implementation checkpoint — 2026-10-09

The user's earlier instruction was to read the updated `prompts/task-020.md` and
start implementation; the current request resumes that work after a usage-limit
interruption. The task file contains the implementation assignment, replacing
the detailed specification created earlier. The complete approved contract,
including its final identity-control escaping refinement, was recovered from
that session and retained in [task-020-specification.md](task-020-specification.md).
Its authoring-only status is historical; the current assignment authorizes code,
tests, documentation, and verification without commits, pushes, or a live run.

Implemented behavior:

- Both export commands now generate one root `Knowledge Sync.md` page after
  normal item/collection batches, listing every persisted collection and item.
  Retained/unassociated items stay visible and shared items appear once.
- Pure display normalization uses NFC, existing control conversion, collapsed
  whitespace, fallbacks, and ordinal title/source/ID ordering. Duplicate titles
  receive identity suffixes; canonical paths and existing note bytes are preserved.
- A dedicated writer recognizes the exact generated-navigation marker and rejects
  user files, directories, and symlinks. It prepares an exclusively created sibling
  file, closes it, rechecks ownership, and renames it into place. Failure recovery
  preserves the previous canonical page and only cleans its own temporary file.
- Navigation render/write failures retain existing batch results and original
  errors, including `undefined`. Unexpected item-batch exceptions still propagate;
  collection-batch exceptions retain item results and explicitly skip navigation.
  Normal per-note failures still allow navigation. Empty snapshots leave it untouched.
- Both application flows and CLI commands propagate outcomes. Navigation failure
  produces safe diagnostics and exit 1; non-export command behavior is unchanged.

Fresh verification:

- `npm.cmd install`: passed, dependencies unchanged. Existing audit output still
  reports one high-severity finding; no unrelated dependency remediation included.
- Renderer: 24 passing tests. Writer: 56 passed, three real-symlink cases skipped
  after Windows returned `EPERM`; deterministic mocked link rejection passes.
- Projection and application focused suite: 95 passed in four files.
- CLI focused suite: 192 passed in six files. Its initial sandbox subprocess
  error (`uv_os_get_passwd ENOMEM`) was resolved by an approved escalated rerun.
- `npm.cmd test`: **1,082 passed, 4 skipped, 44 files passed**. Skips are the
  existing POSIX-permissions test on Windows plus the three real-symlink cases.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- Built CLI startup, top-level help, and `youtube sync`, `sync-obsidian`, and
  `sync-all` help: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Independent `ks_reviewer` review found no outstanding correctness, safety, or
scope issues. An in-progress test marker typo was corrected before passing
verification. The reviewer inspected the final source, tests, documentation, and
reported evidence read-only. `git diff --check`, new-file whitespace, documentation
links, and Task 020 handoff paths passed.

Real Windows creation/replacement, unchanged bytes, partial temporary-write,
close/rename failure preservation, retries, exclusive collision and orphan
preservation are covered. Command integration uses mocked transport and temporary
SQLite/vaults, proving user-file preservation, retained database progress, closed
storage, and recovery. No real SQLite database, Obsidian vault, or YouTube account
was used. Manual Obsidian click-through acceptance is pending separately.

Task 020 implementation files (including work recovered at resumption):

- New: `src/outputs/obsidian/navigation-markdown.ts`,
  `src/outputs/obsidian/write-navigation.ts`,
  `src/cli/navigation-export-output.ts`.
- Updated: `src/outputs/obsidian/export-projection.ts`,
  `src/application/sync-collection-to-obsidian.ts`, `src/application/sync-account.ts`,
  `src/cli/program.ts`, `src/cli/account-sync-output.ts`.
- New tests: `tests/navigation-markdown.test.ts`,
  `tests/navigation-export-output.test.ts`, `tests/obsidian-write-navigation.test.ts`,
  `tests/obsidian-write-navigation.integration.test.ts`.
- Updated tests: `tests/obsidian-export-projection.test.ts`,
  `tests/obsidian-projection.integration.test.ts`, `tests/sync-account.test.ts`,
  `tests/sync-collection-to-obsidian.test.ts`, `tests/cli.test.ts`,
  `tests/youtube-sync-obsidian.test.ts`, `tests/youtube-sync-all.test.ts`,
  `tests/youtube-sync-obsidian.integration.test.ts`,
  `tests/youtube-sync-all.integration.test.ts`.
- Documentation: `README.md`, `src/outputs/obsidian/README.md`, this handoff,
  and the recovered `docs/task-020-specification.md`.

The existing `src/{application,auth,cli,collectors,core/models,outputs/obsidian,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts` layout is retained. No dependencies, schema,
canonical path, or synchronization changes; no architecture deviations. The extra
specification archive restores the lost reviewable contract without replacing the
user's current implementation assignment.

Known limits: one writer and no concurrent external edits are assumed; target
rechecks do not eliminate TOCTOU races. No universal power-loss durability is
promised. Abrupt termination can leave orphan temporary files, deliberately retained.
Generated page edits are replaceable; empty snapshots can leave an old page, and
failed note writes can leave unresolved links. Encoded explorer filenames remain.

Unrelated entry-state work was preserved: the Task 019 review/deferral and E2E
milestone documentation, `prompts/new-inputs.md`, the current task assignment,
and the deletion of `prompts/task-018.md`. Task 019 and Task 021 were not started.

## Current state

`knowledge-sync` has implementations for Tasks 001–018:

- Task 001: project foundation, domain model, SQLite synchronization state, output boundary, and CLI bootstrap.
- Task 002: public YouTube playlist collector with URL/ID parsing, pagination, normalized `KnowledgeItem` output, and API-key access.
- Task 003: Google Desktop OAuth with PKCE and loopback callback, external refresh-token storage, OAuth access-token refresh, owned-playlist discovery, account collection orchestration, and CLI commands.

- Task 004: normalized `KnowledgeItem` repository with SQLite/Drizzle persistence,
  independent of import-state tracking, using the existing database lifecycle.
- Task 005: internal `sync(collector, repository)` application operation connecting
  complete collection to sequential item upserts, with a `{ processed }` entry count.
- Task 006: manual `youtube sync <playlist>` CLI with explicit API-key/OAuth
  selection, database-path resolution, and storage cleanup around that operation.
- Task 007: application-level new/changed/unchanged classification against current
  persisted state, with sequential lookup/upsert and expanded result counters.
- Task 008: pure deterministic Markdown rendering of a supplied `KnowledgeItem`,
  independent of synchronization, filesystem writing, and Obsidian.
- Task 009: standalone filesystem writer accepting an existing vault, a relative
  destination path, and already-rendered text; independent of rendering and sync.
- Task 010: existing pure identity-to-path mapping in `note-path.ts`, with tests
  already present at Task 011 entry. No historical Task 010 completion/acceptance
  record was available; fresh regression evidence is recorded below.
- Task 011: single-item export composition of the existing path builder, renderer,
  and writer, without sync, CLI, database, or import-state integration.
- Task 012: sequential batch export through the single-item exporter, with
  best-effort continuation, per-entry statistics, and original failure details.
- Task 013: application-level sync-to-Obsidian orchestration, with a full ordered
  persisted snapshot read after successful sync and before batch export.
- Task 014: separate `youtube sync-obsidian <playlist>` CLI command using the
  existing application orchestration, auth, and database conventions, with vault
  resolution, safe per-item failure reporting, and non-zero status on incomplete export.
- Task 015: separate collections and same-source many-to-many memberships in
  SQLite, additive schema upgrade, and collection-aware single-playlist sync for
  both existing commands. Legacy collection text/output/classification is retained.
- Task 016: OAuth-only `youtube sync-all`, sequential owned-playlist sync,
  retained playlist/fatal/export outcomes, successful-playlist item counters,
  and one optional final full-snapshot export after recoverable failures.
- Task 017: shared collection-aware Obsidian projection for both export commands,
  with strict snapshot joins, stable collection pages, relative item links, separate
  collection results, and preserved existing item paths, Markdown, and counters.
- Task 018: authoritative per-collection membership reconciliation after complete
  successful persistence, atomic stale-edge removal, separate removal counts,
  and retention of items, collections, and files.

The working tree also contains the Task 003 refresh-error follow-up: invalid
authorization, network failures, transient server failures, and unknown errors
are distinguished while preserving causes and stored refresh tokens. README and
`.env.example` wording cleanup is included in the Task 004 iteration checkpoint.

Task 004 is described in the root `task-004.md`; its implementation is included
in the `iteration/task-004-persistence` checkpoint branch.
`docs/tasks/` is currently absent; use the exact task file named by the user.

Ordinary `youtube sync` performs manual single-playlist collection, classification,
and item/collection/membership persistence. `youtube sync-obsidian` now invokes
`syncCollectionToObsidian()` to export
all persisted items. Separate renderer, path builder, writer, and single/batch
export APIs remain available. `youtube sync-all` discovers all owned playlists
and persists them sequentially; only explicit `--vault` enables one final export.
Import-state orchestration, Facebook, AI,
scheduling, background services, and Git automation remain unimplemented.

Task 005 was implemented according to the then-available `task-005.md`,
prepared from `prompts/create-task-005.md`; neither file is currently present.
The earlier specification session changed documentation only. The later explicitly
assigned implementation added `src/application/sync.ts`, five unit tests, four
integration tests, and README/CLI status wording updates. No contracts, schema,
configuration, or dependencies changed; no commits or pushes were made.

Task 006 was implemented according to the then-available `prompts/task-006.md`
(currently absent), including the four accepted review clarifications. Existing Task 005 work and
unrelated working-tree changes were preserved. No commits or pushes were made.

Task 007 is implemented according to [prompts/task-007.md](../prompts/task-007.md),
including accepted review clarifications on exact persisted strings, optional
values, the current scalar-only model, and duplicate behavior. Existing Task
005/006 work and unrelated changes were preserved. No commits or pushes were made.

Task 008 is implemented according to the original `prompts/task-008.md` reviewed
in this session and the accepted `prompts/task-008-updated.md` clarifications
(that file is now absent).
The original specification was replaced by that clarification file before
implementation; its remaining requirements were retained from the session.
`prompts/task-007.md` is also now locally deleted; the preceding link records its
historical specification location. Pre-existing deletions were preserved.
No commits or pushes were made during Task 008.

Task 009 is implemented according to [prompts/task-009-updated.md](../prompts/task-009-updated.md),
including the user's accepted path clarifications appended to that specification.
Task 008 source/tests and unrelated pre-existing deletions were preserved.
No commits or pushes were made during Task 009.

## First real-world E2E milestone — 2026-10-09

Status: **VALIDATED**. The user supplied the successful real-run output and manual
Obsidian confirmation in [prompts/malestone1.md](../prompts/malestone1.md).
The read-only database inspection was performed earlier in this session.
No synchronization, database inspection, or vault writes were repeated for this
documentation update.

Validated local locations (observed run context, not application defaults):

- SQLite: `D:\codex\knowledge-sync\data\knowledge-sync.sqlite`
- Obsidian vault: `D:\obsidian`

The database inspection used a read-only connection and verified table/column
names against the project schema and actual SQLite schema. With no supplied
`--db` override and `DATABASE_PATH` unset, `./data/knowledge-sync.sqlite` resolved
relative to `D:\codex\knowledge-sync`. No database records were changed.

| Database check | Result |
| --- | ---: |
| KnowledgeItems | 52 |
| Collections | 14 |
| CollectionMemberships | 52 |
| Items belonging to more than one Collection | 0 |
| Duplicate `(source, sourceId)` groups | 0 |

The user reported that repeating this command:

```powershell
node dist/cli/index.js youtube sync-all --vault "D:\obsidian"
```

produced:

```text
Playlists: discovered=14 succeeded=14 failed=0 unattempted=0
Items: processed=52 new=0 changed=0 unchanged=52
Memberships: removed=0
Export: attempted=52 succeeded=52 failed=0
Collections: attempted=14 succeeded=14 failed=0
```

The user manually confirmed that generated Markdown files are present, video
metadata and descriptions are visible, collection index notes are generated,
and YouTube URLs and metadata are present. The `Sport` collection note links to
its video note, and clicking that link opens the correct note.

This validates the real collection/persistence/export path and unchanged-item
classification on a repeated run for this dataset. There were no shared items
across collections, so this real run does not exercise many-to-many membership.
No membership removals occurred. Successful export counts do not independently
prove byte-for-byte file stability; no file comparison was reported. These
observations supplement the historical automated verification below.

Known UX issue: percent-encoded identifiers in generated filenames make the
Obsidian file explorer difficult to navigate. Filenames and path-generation
logic remain unchanged; navigation improvements belong to a separately assigned
Task 020 review.

## Roadmap and priorities

- **Tasks 001–018:** COMPLETED / ACCEPTED.
- **Real-world E2E milestone:** VALIDATED.
- **Task 019:** DEFERRED — transcript enrichment, automatic retrieval, and related
  exports; implementation NOT STARTED, priority LOW. Retain
  [the architecture review](task-019-review.md) for a future revisit.
- **Task 020:** IMPLEMENTED / AUTOMATED VALIDATION PASSED — readable Obsidian
  navigation. Manual real-world acceptance is pending separately.

| Priority | Direction |
| --- | --- |
| P0 | Maintain reliable YouTube → SQLite → Obsidian synchronization. |
| P1 | Improve Obsidian usability and navigation. |
| P2 | Search and local KnowledgeItem browsing. |
| Backlog | Additional knowledge sources. |
| Deferred | Transcript enrichment, automatic transcript retrieval, and related exports. |

Revisit transcripts when core knowledge collection, synchronization, navigation,
and search capabilities are sufficiently mature. No separate TODO/backlog
document was found; this handoff remains the roadmap rather than introducing a
new backlog system. Each future task still requires an explicit assignment.

## Important architecture

- Task 018 extends the shared `syncCollection()` path used by both single-playlist
  commands and account sync. Only after full collection and all additive writes
  succeed does it call `removeStaleForCollection()` with deduplicated composite
  item identities. Successful empty/all-filtered normalized snapshots remove all
  memberships in that collection; failures before removal skip the destructive phase.
- The existing SQLite connection runs the scoped read/deletes in one short
  synchronous transaction. Any deletion failure rolls back that entire removal
  phase; earlier additive writes remain committed. No schema changes, item or
  collection deletion, discovery-based removal, or filesystem cleanup are added.
- `CollectionSyncResult.membershipsRemoved` and the separate account aggregate
  preserve existing item counters. Only successful playlists contribute to totals;
  recoverable/fatal failures retain existing account semantics. Each CLI adds
  `Memberships: removed=N`. Projection reads the reconciled database; export
  failures leave it committed, and orphan items and their notes remain retained.

- Task 017 adds `readObsidianSnapshot()` and `exportObsidianProjection()` shared by
  `syncCollectionToObsidian()` and `syncAccount()`. All three repository reads and
  strict pure projection validation precede output. Composite source/ID identities
  govern both sides of each membership; duplicate identities/edges and missing
  parents fail before writes. Legacy collection-title text never defines membership.
- Collection paths reuse the existing persistent encoder at
  `<encoded-source>/collections/<encoded-collection-id>.md`. A separate Markdown
  destination encoder handles literal percent signs and other URL-sensitive text.
  Collection YAML preserves raw source/sourceId/title in that order; inline text
  escapes Markdown/HTML and normalizes line breaks. Empty titles display sourceId,
  empty collections display `_No items._`, and output ends with exactly one LF.
- Item export results keep their existing locations and meaning. Collection results
  are additive. Individual item failures allow collection export; unexpected item
  batch exceptions stop later output. Unexpected collection exceptions preserve
  completed item results and original errors through tagged outcomes, including
  thrown `undefined`; account outcomes also retain prior playlist results. CLI
  summaries are separate and either phase's failure causes nonzero status.
- Empty persisted collections now write notes: an empty playlist with a nonexistent
  vault intentionally fails export. A projection with no items or collections
  remains a filesystem-free no-op. Generic `syncToObsidian()` stays item-only.
  Sequential snapshot reads assume local/manual use, not cross-process isolation.
  Writes still overwrite local edits, remain non-atomic, and do not delete stale
  notes. Task 018 reconciles database memberships before output. Failed item writes
  may leave collection links
  unresolved until a later successful run.

- Task 016's `syncAccount(source, repositories, vaultPath?)` completes discovery
  before invoking `syncCollection()` sequentially in discovery order. The small
  `AccountSyncSource` boundary supplies discovery, collector creation, and fatal
  source-error classification. `createYouTubeAccountSource()` reuses one client
  with existing `YouTubeAccount` and `YouTubeCollector`; no alternative discovery
  or account collection implementation is introduced.
- `AccountSyncResult` contains discovered/succeeded/failed/unattempted playlist
  counts, item counters summed only from successful playlist results, original
  playlist failures, optional tagged fatal stage/error, and a tagged export outcome
  (not-requested, skipped, completed batch result, or snapshot/batch exception).
  Failed partial writes remain persisted but are excluded from item counters.
  A fatal attempted playlist counts as failed; later entries remain unattempted.
- Google auth/provider errors, API credential rejection, and quota exhaustion
  are fatal. `YouTubeError.accountFatal` carries structured classification while
  existing safe diagnostic text remains unchanged. SQLite FULL/IOERR/CORRUPT/
  NOTADB/READONLY/CANTOPEN codes, including extended codes through cycle-safe cause
  chains, also stop the run. Ordinary API transport/server/access/metadata and
  individual constraint failures continue to later playlists. No message parsing,
  retry, rollback, reconciliation, or schema change is added.
- Only explicit `sync-all --vault <path>` enables export; its existing-directory
  preflight and database containment guard precede OAuth/setup. `--db` retains
  the existing option/env/default precedence. Without export, the environment
  vault guard still applies. One OAuth provider/client and one storage lifecycle
  serve the run; storage closes before presentation even on failure.
- Recoverable playlist failures (including all failures) and zero discovered
  playlists still permit one requested full snapshot/export, including retained
  items from other sources. Fatal discovery/playlist outcomes suppress export.
  Snapshot and unexpected batch errors retain earlier summaries and failures;
  thrown `undefined` is represented explicitly. The CLI reports every category,
  escapes playlist titles/IDs, and exits nonzero if requested work is incomplete.

- Task 015 adds `KnowledgeCollection` (`source`, `sourceId`, `title`) and
  `CollectionMembership` (`source`, `collectionSourceId`, `itemSourceId`).
  `Storage.collections` exposes `upsert/listAll`; `Storage.collectionMemberships`
  exposes `add/listAll`. Lists explicitly order ascending source and identity
  components. They share the existing connection and close lifecycle.
- Additive bootstrap DDL adds `collections` (composite identity primary key) and
  `collection_memberships` (unique triple primary key). Same-source composite
  foreign keys require both parents; connection initialization enables enforcement.
  Existing item/import rows, original timestamps, and legacy collection text are
  untouched. No title-based backfill occurs; re-sync fills authoritative membership.
- `YouTubeCollector.collectCollection()` returns normalized collection context and
  items using the existing single metadata request. `collect()` remains compatible.
  Empty/all-filtered playlists retain their collection context. Discovery, client,
  OAuth, and existing account collection remained unchanged in Task 015; its
  account-wide sync command was deferred until Task 016 above.
- `syncCollection()` collects completely, rejects cross-source items before any
  writes, upserts the collection, and reuses generic `sync()` with an adapter that
  awaits each item upsert then membership add. Unchanged items still acquire
  missing memberships. Failure stops later entries and retains earlier writes,
  with no rollback of additive writes, retries, or import recording. Task 018 then
  removes stale memberships atomically after all these writes succeed.
- `syncCollectionToObsidian()` waits for all persistence before the full ordered
  item/collection/membership snapshot and shared projection exporter. Read failures
  skip output; export phases use the Task 017 outcomes described above. Both CLI
  commands retain existing item results, auth, configuration, safe
  diagnostics, and finally-based cleanup. Generic `sync()` and `syncToObsidian()`
  remain available unchanged; the earlier Task 014 delegation below is historical.
- `KnowledgeItem.collection` remains last-synchronized-playlist title metadata for
  compatibility. It still affects item classification and Markdown; alternating
  playlists can change both without modifying other memberships. The relationship
  tables reflect each collection's last successful normalized snapshot after
  Task 018 reconciliation; failed and unattempted collections retain prior edges.
  Playlist position and repeated occurrences within a playlist are omitted.

- `youtube sync-obsidian <playlist>` accepts `--auth <api-key|oauth>` (default
  `api-key`), `--db <path>`, and `--vault <path>`. The existing `youtube sync`
  command retains its options, SQLite-only behavior, and auth semantics. Task 018
  adds a separate membership-removal summary to its existing processed count.
- `src/cli/youtube-sync.ts` exports `YouTubeSyncObsidianOptions` and
  `syncYouTubePlaylistToObsidian()`. Small shared collector/open helpers reuse
  authentication and storage setup. The new composition validates vault presence
  before dependency setup, invokes `syncCollectionToObsidian()` exactly once, and closes
  storage in `finally` before presentation, including partial or fatal failures.
- Vault precedence is `--vault` then `OBSIDIAN_VAULT_PATH`, otherwise configuration
  error. Explicit blank overrides never fall back; blank env values also fail.
  Nonblank path text is forwarded unchanged. No implicit vault, `.env` loading,
  discovery, or creation is added. DB precedence remains `--db`, `DATABASE_PATH`,
  then `./data/knowledge-sync.sqlite`. Existing canonical ancestor checks reject
  databases inside the effective selected vault, including symlink/junction
  aliases. Overridden environment vaults do not govern the new command's guard.
- CLI stdout prints deterministic sync counters and export attempted/succeeded/
  failed counters. Full success exits 0; partial export and fatal failures exit 1.
  Partial failures retain their application result, print available statistics,
  and report each zero-based index and escaped identity to stderr. A separate
  presentation helper emits fixed filesystem/contract diagnostics or a safe
  unknown-error fallback; arbitrary error messages/causes/objects are not dumped.
  Partial-result exit handling sits outside the fatal catch so `exitOverride()`
  does not print a second misleading fatal error. Original errors remain internal.
- Every persisted item remains an export candidate, including other sources and
  playlists. Partial output failure never rolls back committed SQLite writes.
  A later unchanged sync can export again. Empty snapshots access no vault and
  may succeed with a configured nonexistent vault. No retries, reconciliation,
  deletion, durable export-state tracking, application contract changes, or schema
  changes were introduced by Task 014. Task 015 adds the relationship schema and
  collection-aware orchestration described above.

- `src/application/sync-to-obsidian.ts` exports
  `syncToObsidian(collector, repository, vaultPath): Promise<SyncToObsidianResult>`.
  It awaits the unchanged `sync()`, then `repository.listAll()`, then the unchanged
  `exportObsidianNotes()`, returning their original results as `{ sync, export }`.
  The existing mutable `SyncResult` interface is preserved exactly.
- `KnowledgeItemRepository.listAll(): Promise<readonly KnowledgeItem[]>` reads all
  normalized items using explicit ascending `source`, then `sourceId` order and
  the existing row mapper. Optional NULLs become absent properties, empty strings
  and exact date text are preserved. No schema, connection, or import-state
  change was needed; the caller still owns storage lifecycle.
- SQLite is the source of truth for export. Every persisted item is attempted
  after successful sync, including unchanged items and items missing from current
  collection. Duplicate collection entries collapse through existing upserts;
  sync and export counts can differ. “Full projection” describes attempted export,
  not a guaranteed vault mirror: writes can fail and filesystem cleanup is absent.
  Existing overwrite and non-atomic output behavior remain in effect.
- Sync failure skips read/export; read failure skips export. Both and unexpected
  batch-level failures propagate the original thrown value. Ordinary per-item
  failures resolve in the nested export result. No output failure rolls back
  persistence; there is no retry, compensation, durable export-state tracking,
  import recording, or transaction spanning SQLite and the filesystem. A later
  successful sync attempts unchanged items again. Empty snapshots pass through
  the batch exporter without vault access. Task 014 adds the CLI integration above.

- `src/outputs/obsidian/export-notes.ts` exports
  `exportObsidianNotes(vaultPath, items: readonly KnowledgeItem[])` returning
  `Promise<ObsidianBatchExportResult>`, plus the result and failure interfaces.
  It awaits `exportObsidianNote` for each entry in original order. Exceptions or
  rejections from an entry are retained as `{ index, item, error }`, preserving
  the original item reference and unknown error value, then processing continues.
  Failures appear in ascending input-index order. The final result is returned
  only after the last entry settles: `processed === succeeded + failed`,
  `processed === items.length`, and `failed === failures.length`.
- Counts describe export-call outcomes, including duplicate references and
  different versions of the same identity. They do not guarantee distinct files
  or preserved final content; later writes can overwrite or partially damage
  earlier output. No retries, rollback, deduplication, concurrency, or global
  vault validation are added. Empty input returns zeros without accessing the
  vault; an invalid vault produces per-entry failures from the existing exporter.
  The array and items are not mutated. Batch export has no sync, CLI, database,
  import-state, or configuration integration.

- `src/outputs/obsidian/export-note.ts` exports
  `exportObsidianNote(vaultPath, item): Promise<void>`. It calls
  `buildObsidianRelativePath(item)`, `renderKnowledgeItemMarkdown(item)`, and
  `writeObsidianNote(vaultPath, relativePath, content)` in order, exactly once on
  success. Inputs and outputs pass through unchanged. Synchronous component
  exceptions become promise rejections with the original value; later steps are
  skipped after failure. The promise settles only after the awaited writer.
  There is no validation, configuration discovery, database access, import record,
  retry, batch policy, or sync/CLI integration. `Output.write(item)` is unchanged.
- The pre-existing Task 010 `buildObsidianRelativePath(item)` in `note-path.ts`
  maps identity to `<encoded-source>/<encoded-sourceId>.md`, ignoring metadata.
  It uses UTF-8 byte escapes for uppercase/non-ASCII/unsafe characters and trailing
  spaces/periods, protects reserved device names, and rejects empty or malformed
  Unicode identities. It performs no I/O and does not truncate; generated paths
  can exceed native filesystem limits. Task 011 reuses it unchanged and inherits
  writer failures and non-atomic behavior rather than providing rollback.

- `src/outputs/obsidian/write-note.ts` exports
  `writeObsidianNote(vaultPath, relativePath, content): Promise<void>`. It imports
  only Node filesystem/path APIs, with no renderer, domain, sync, storage, CLI,
  or configuration dependency. The existing `Output.write(item)` stays unchanged.
- Blank vault paths are rejected; relative vault paths resolve against cwd.
  Native path parsing rejects rooted/drive-qualified note paths (including Windows
  `C:note.md`). Resolve/relative checks reject blank/root-equivalent destinations
  and escapes before filesystem changes. Contained `folder/../note.md` is allowed.
  Windows recognizes both separators; POSIX keeps native filename semantics.
  Otherwise valid path values are not trimmed or sanitized.
- The vault must already exist and be a directory, checked before recursive parent
  creation. The writer overwrites the destination with unchanged UTF-8 text and
  adds no BOM or newline. Native filesystem failures propagate unchanged; explicit
  contract failures use plain errors. Containment is lexical only, symlinks are
  followed normally, and writes are non-atomic: failure can leave partial content.
  No export orchestration, filename generation, or import recording is added.

- `src/outputs/markdown.ts` exports
  `renderKnowledgeItemMarkdown(item: KnowledgeItem): string`. It imports only the
  domain type and performs no I/O, validation, input mutation, or sync integration.
- YAML front matter uses the fixed order `source`, `sourceId`, `url`, `title`,
  `author`, `collection`, `publishedAt`. All values are double-quoted with JSON
  escaping plus explicit escapes for remaining YAML control characters and Unicode
  line separators. Undefined metadata is omitted; empty strings are serialized.
  Dates retain their exact representation; description is body content only.
- Rendering uses `---\n<metadata>\n---\n\n`, then `# ` plus the verbatim title.
  Absent description yields the body `# <title>\n`; a present description yields
  `# <title>\n\n<description>`. Append a final LF only if the assembled string
  does not already end with LF. Empty description therefore ends in two LFs.
  Generated separators use LF, while supplied CRLF, whitespace, Markdown, and
  trailing blank lines remain untouched. Arbitrary title content is not guaranteed
  to produce one literal Markdown heading. No new dependency or domain field is added.

- `YouTubeCollector` remains dependent on the narrow `YouTubeClient` interface.
- API-key and OAuth authentication are explicit modes of `YouTubeApiClient`.
- The same OAuth-authenticated client is used for owned-playlist discovery and playlist-item retrieval.
- OAuth credentials and refresh tokens must remain outside the repository and are never stored in SQLite.
- `mine=true` discovers playlists owned by the authenticated account; it does not discover every saved or followed playlist.
- The singular `KnowledgeItem.collection` field remains legacy output metadata;
  Task 015's separate tables preserve all observed playlist memberships.

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
- `sync` uses `Collector`, `KnowledgeItem`, and `KnowledgeItemRepository` contracts.
  It waits for the complete collection, then awaits each lookup and upsert in source order. `processed`
  counts entries, including duplicates; the last occurrence wins on success.
- Collector failure causes zero writes. A repository failure propagates unchanged,
  stops later entries, and leaves earlier completed writes persisted. There is no
  rollback or partial result; the rejecting write has no generic unchanged-state
  guarantee. Empty collection succeeds with zero processed entries.
- Task 007 classifies immediately after each identity lookup against the current
  repository state. All six non-identity fields compare by exact string value;
  optional absence and explicit undefined are equal, empty text is distinct,
  and publication-date offsets/precision are preserved. There is no structured
  metadata in the current domain. Counters advance after successful upserts;
  `{ processed, new, changed, unchanged }` satisfies the sum invariant on success.
  Unchanged entries still upsert. Duplicates observe earlier writes, so a repeated
  batch with different versions of an identity can still count changes.
- The caller owns storage cleanup. Sync performs no deduplication, deletion,
  retries, or import recording. Items
  absent from later runs remain stored. Another playlist's value can overwrite
  singular `collection` context; omitted metadata clears it. Task 016 layers
  account-wide orchestration over the existing per-collection semantics.
- `src/cli/youtube-sync.ts` composes the concrete client, collector, storage, and
  `syncCollection()` exactly once for ordinary sync. Storage closes in `finally`
  before the CLI
  prints `Processed N items.`. Task 007 extends only the application result;
  storage/domain contracts and CLI output remain unchanged.
- API-key mode is the default and reads `YOUTUBE_API_KEY` from the process
  environment. OAuth uses existing external credentials/provider/token storage;
  it requires no API key and never falls back between authentication modes.
  The CLI does not automatically load `.env`.
- DB precedence is `--db` then `DATABASE_PATH` then `./data/knowledge-sync.sqlite`;
  relative paths resolve against the working directory. Explicit blank paths
  fail. When `OBSIDIAN_VAULT_PATH` is configured, containment checks resolve
  existing ancestors and symlink/junction aliases to keep the DB outside it.
  Without a configured vault, users must choose an external DB location.
- The client now preserves known safe `GoogleAuthError` instances on every token
  request, including refresh during pagination. Unknown provider errors remain
  sanitized without misleading re-login advice. A small `YouTubeError` marker
  distinguishes safe parser/API/collector diagnostics for CLI display; known API
  reasons are allowlisted in both modes, and metadata errors use fixed messages.
  Credential-bearing error causes and arbitrary response details are not printed.

## Verification last completed

### Task 018 verification

Task 018 follows [prompts/task-018.md](../prompts/task-018.md) with the implementation
authorization and clarifications recorded in [its review](task-018-review.md).
On 2026-10-09, resumed the existing implementation, completed independent read-only
review and fresh `ks-persistence`/`ks-verify` checks, and corrected the remaining
README/handoff status. No source fixes were needed during this continuation.
The Task 017 specification referenced by the brief is absent; its accepted behavior
remains documented in the historical section below and covered by current tests.

- `npm.cmd install`: passed, dependencies up to date; none added. npm still reports
  one high-severity audit finding in the existing dependency tree; no audit fix applied.
- Focused `npm.cmd test -- tests/collection-repositories.test.ts tests/sync-collection.test.ts tests/sync-account.test.ts tests/youtube-collections.integration.test.ts tests/youtube-sync-all.integration.test.ts tests/cli.test.ts`:
  **195 passed in six files**.
- `npm.cmd test`: **951 passed, one expected Windows POSIX-permissions skip,
  40 files** (19 more passing cases than the Task 017 checkpoint).
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- `node dist/cli/index.js`, `node dist/cli/index.js --help`, and built
  `youtube sync --help`, `youtube sync-obsidian --help`, `youtube sync-all --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, new-file whitespace, current documentation references, and
  the reported directory layout: passed. Historical links to removed task briefs
  remain historical; no missing specifications were recreated.
- Independent `ks_reviewer` review found no actionable correctness issues or
  missing required regression cases. Tests cover actual SQLite rollback after an
  earlier deletion, scoped identities/shared items, duplicate/empty snapshots,
  large desired sets, pre-removal failures, both auth modes and all sync commands,
  account recoverable/fatal outcomes, idempotency, and export-failure recovery.

Checks used mocked transport and temporary databases/vaults; no live user account,
database, or vault was used. No new runtime dependencies, schema changes, or new
directories. The layout remains `src/{application,auth,cli,collectors,core/models,
outputs/obsidian,storage/sqlite}`, `tests`, `data`, `docs`, and `prompts`.

Task 018 changes extend `src/storage/{collection-membership-repository,
sqlite/collection-membership-repository}.ts`, `src/application/{sync-collection,
sync-collection-to-obsidian,sync-account}.ts`, `src/cli/{youtube-sync,program,
account-sync-output}.ts`, their existing storage/application/CLI/integration tests,
README, output README, this handoff, and the new supplied brief/review documents.
Existing Task 017 work and unrelated local deletions were preserved. No commits
or pushes were made. No implementation-scope deviations; the earlier explicit
implementation approval supersedes the brief's review-only instructions.

### Historical Task 017 verification

Task 017 follows [prompts/task-017.md](../prompts/task-017.md), which already contains
the accepted architecture clarifications. On 2026-10-06, resumed the existing
implementation, completed two independent read-only reviews and fresh `ks-verify`
checks, and updated the remaining output documentation and handoff. No source fixes
were required during this continuation. No commits or pushes were made.

- `npm.cmd install`: passed; no dependencies added. npm reported one high-severity
  audit finding in the existing dependency tree; dependency remediation was outside
  this task and no audit fix was applied.
- Focused `npm.cmd test --` run: **446 passed in 15 files**: `collection-markdown`,
  `collection-projection`, `obsidian-export-collections`, `obsidian-export-projection`,
  `obsidian-projection.integration`, `read-obsidian-snapshot`,
  `sync-collection-to-obsidian`, `sync-account`, `youtube-sync-obsidian`,
  `youtube-sync-obsidian.integration`, `youtube-collections.integration`,
  `youtube-sync-all.integration`, `cli`, `markdown`, and `obsidian-note-path`
  (each under `tests/` with `.test.ts` suffix).
- `npm.cmd test`: **932 passed, one expected Windows POSIX-permissions skip,
  40 files**. This is 91 more passing cases than the Task 016 checkpoint.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- `node dist/cli/index.js`, `node dist/cli/index.js --help`, and built
  `youtube sync-obsidian --help` / `youtube sync-all --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync` and its `--help`: passed.
- Independent `ks_reviewer` reviews of the output implementation/tests and the
  application/CLI integration/tests found no actionable correctness issues.
  Final documentation review identified one sorting-attribution wording issue;
  it was corrected to attribute member ordering to the projection builder.
- `git diff --check`, new-file whitespace, current documentation references,
  and the reported directory layout: passed.

The first focused run had 444 passes and two CLI subprocess failures caused by
the known sandbox `uv_os_get_passwd` restriction in `tsx`. The approved outside-
sandbox rerun passed all 446; the full suite then passed outside the sandbox as
well. Tests used mocked API/OAuth and temporary databases/vaults; no live user
account, database, or vault was used. No test/security settings were weakened.

Files added:

- `src/application/read-obsidian-snapshot.ts`
- `src/cli/collection-export-output.ts`
- `src/outputs/yaml-string.ts`
- `src/outputs/obsidian/{collection-markdown,collection-path,collection-projection,
  export-collection,export-collections,export-projection,markdown-link}.ts`
- `tests/{collection-markdown,collection-projection,obsidian-export-collections,
  obsidian-export-projection,obsidian-projection.integration,read-obsidian-snapshot}.test.ts`
- The supplied `prompts/task-017.md` accepted specification.

Files changed:

- `src/application/{sync-account,sync-collection-to-obsidian}.ts`
- `src/cli/{account-sync-output,obsidian-export-failure,program,youtube-sync}.ts`
- `src/outputs/markdown.ts`, `src/outputs/obsidian/note-path.ts`
- `tests/{cli,sync-account,sync-collection-to-obsidian,youtube-collections.integration,
  youtube-sync-all.integration,youtube-sync-obsidian.integration,youtube-sync-obsidian}.test.ts`
- `README.md`, `src/outputs/obsidian/README.md`, this handoff.

No schema/dependency changes, new directories, or specification deviations.
The layout remains `src/{application,auth,cli,collectors,core/models,outputs/obsidian,
storage/sqlite}`, `tests`, `data`, `docs`, and `prompts`. Existing unrelated deletions
of `instructions.txt`, `prompts/task-007.md`, `prompts/task-012.md`,
`prompts/task-016.md`, and `task-004.md` were preserved. Task 018 was not started.

### Task 016 verification

Task 016 is implemented according to [prompts/task-016.md](../prompts/task-016.md),
including the user-approved Phase 1 findings and accepted clarifications.
The `ks-youtube-auth` and `ks-verify` workflows were used; storage error review
retains the existing persistence contracts.

- `npm.cmd install`: passed; dependencies up to date, none added.
- Focused command `npm.cmd test -- tests/sync-account.test.ts tests/storage-error.test.ts tests/youtube-account-source.test.ts tests/youtube-client.test.ts tests/youtube-sync-all.test.ts tests/youtube-sync-all.integration.test.ts tests/cli.test.ts`:
  249 passed in seven files.
- `npm.cmd test`: 841 passed, one expected Windows POSIX-permissions skip,
  34 files. Task 016 adds 147 passing cases.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- `node dist/cli/index.js` and `node dist/cli/index.js --help`: passed.
- Built `youtube sync-all --help`, `youtube sync --help`,
  `youtube sync-obsidian --help`, and `youtube playlists --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync` and its `--help`:
  passed. The new command exposes `--db` and explicit `--vault`, without `--auth`.
- Independent read-only source/test and final documentation reviews found no
  actionable issues. Reference, whitespace, and task-scope checks passed;
  the `ks-verify` workflow is complete with no unresolved findings.

The full suite ran outside the sandbox using the existing test approval because
known `tsx` subprocess tests require Windows user-information access. Focused
tests, typecheck, build, and CLI smoke checks passed normally. No test/security
settings were weakened. All API/OAuth transport was mocked, using fake credentials
and temporary SQLite/vault fixtures; no live account or user data was accessed.

Tests cover complete/failed paginated discovery, one/many/empty playlists,
shared-video membership and event counts, first/middle/last/multiple/all recoverable
failures, partial writes excluded from sums, awaited ordering, late auth/quota/
SQLite fatal stops, preserved unknown errors, zero-playlist export of retained
data, single final snapshot/export, combined playlist/snapshot/batch/note failures,
explicit vault opt-in/preflight, canonical DB containment, storage cleanup,
safe escaped metadata/errors, and exit status. Existing commands and auth behavior
remain protected by the full regression suite.

Files added for Task 016:

- `src/collectors/account-sync-source.ts`, `src/collectors/youtube/youtube-account-source.ts`
- `src/application/sync-account.ts`, `src/storage/storage-error.ts`
- `src/cli/youtube-sync-all.ts`, `src/cli/account-sync-output.ts`
- `tests/sync-account.test.ts`, `tests/storage-error.test.ts`,
  `tests/youtube-account-source.test.ts`, `tests/youtube-sync-all.test.ts`,
  `tests/youtube-sync-all.integration.test.ts`

Files changed for Task 016:

- `src/collectors/youtube/youtube-client.ts`, `youtube-error.ts`
- `src/cli/program.ts`, `youtube.ts`, `youtube-sync.ts` (existing helper exports),
  `obsidian-export-failure.ts` (shared quoting helper export)
- `tests/cli.test.ts`, `tests/youtube-client.test.ts`
- `README.md`, `.env.example`, `src/outputs/obsidian/README.md`, this handoff,
  and the supplied `prompts/task-016.md` (accepted clarifications).

No dependencies, schema changes, or specification deviations. Existing directory
layout remains `src/{application,auth,cli,collectors,core/models,outputs,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts`. No new directories or framework were needed.
Legacy collection title, observed-not-reconciled memberships, owned-only discovery,
and failed-playlist counter limitations remain documented. Existing Task 013–015
work and unrelated deletions were preserved; the now-absent Task 015 specification
is a historical reference below, not reconstructed. No commits or pushes were made.
Task 017 had not started at that historical checkpoint; see its verification above.

### Task 015 verification

Task 015 implementation and validation (2026-10-05), following
[prompts/task-015.md](../prompts/task-015.md) and its accepted review clarifications,
using `ks-persistence`, `ks-youtube-auth`, and `ks-verify`:

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/youtube-collections.integration.test.ts`: 8 passed.
- Focused run of `collection-repositories`, `sync-collection`,
  `sync-collection-to-obsidian`, `youtube-collector`, `youtube-collections.integration`,
  `youtube-sync`, `youtube-sync-obsidian`, `youtube-sync.integration`, and
  `youtube-sync-obsidian.integration` test files: 146 passed in nine files.
- `npm.cmd test`: 694 passed, one intentional Windows POSIX-permissions skip,
  29 files. Task 015 adds 60 passing cases across new and existing files.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js` and `node dist/cli/index.js --help`: passed.
- Built CLI `youtube sync --help`, `youtube sync-obsidian --help`, and
  `youtube playlists --help`: passed. Full-suite mocked command/account tests
  verify playlist discovery without accessing a live account.
- Packaged CLI startup and `--help`: passed.
- `ks-verify` checks, final whitespace/reference checks, and independent read-only
  review: passed; no unresolved findings.

The initial focused run passed 144 tests but hit the known sandbox restriction
on Windows user-information access in two `tsx` subprocess tests
(`uv_os_get_passwd`). The authorized outside-sandbox rerun passed all 146;
the full suite also ran outside the sandbox. No test or runtime security
settings were weakened. All source transport was mocked; database/vault fixtures
were isolated temporary files. No real credentials or account actions were used.

Coverage proves additive upgrade of a populated pre-Task-015 database, preserved
legacy text and original import metadata, no unsafe backfill, idempotent and
source-isolated memberships, enforced foreign keys before/after reopen, explicit
read ordering, and shared storage cleanup. Application tests prove phase/entry
ordering, original error propagation, cross-source rejection before writes, and
retained partial progress. Both CLI paths cover A→X/Y plus B→X/Z yielding three
items/four memberships, repeat/rename/empty/all-filtered cases, legacy counters and
Markdown, no deletion after missing entries, no writes after collection failure,
and recovery of a failed membership for an unchanged item. Output failure retains
collection/membership rows as well as items.

Files added for Task 015:

- `src/core/models/knowledge-collection.ts`, `collection-membership.ts`
- `src/storage/collection-repository.ts`, `collection-membership-repository.ts`
- `src/storage/sqlite/collection-repository.ts`, `collection-membership-repository.ts`
- `src/collectors/collection-collector.ts`
- `src/application/sync-collection.ts`, `sync-collection-to-obsidian.ts`
- `tests/collection-repositories.test.ts`, `sync-collection.test.ts`,
  `sync-collection-to-obsidian.test.ts`, `youtube-collections.integration.test.ts`

Files changed for Task 015:

- `src/core/models/knowledge-item.ts` (legacy metadata comment)
- `src/storage/storage.ts`, `src/storage/sqlite/schema.ts`, `src/storage/sqlite/storage.ts`
- `src/collectors/youtube/youtube-collector.ts`, `src/cli/youtube-sync.ts`
- `tests/youtube-collector.test.ts`, `tests/youtube-sync.test.ts`,
  `tests/youtube-sync-obsidian.test.ts`, `tests/youtube-sync-obsidian.integration.test.ts`
- `README.md`, `src/outputs/obsidian/README.md`, this handoff, and the supplied
  untracked `prompts/task-015.md` (accepted review clarifications).

Directory layout remains `src/{application,auth,cli,collectors,core/models,outputs,
storage/sqlite}`, `tests`, `data`, `docs`, and `prompts`; the new files extend the
existing application/domain/storage boundaries. No dependencies, new commands,
authentication changes, or specification deviations. The new schema/API and
legacy behavior are described under Important architecture above. Historical
memberships require re-sync, and positions/reconciliation/full membership output
remain deliberately deferred. Existing Task 013/014 work and unrelated local
deletions were preserved. No commits or pushes were made. Task 016 is not started.

### Historical Task 014 verification

Task 014 implementation validation (2026-10-04), using `ks-youtube-auth` and
`ks-verify`, against [prompts/task-014.md](../prompts/task-014.md), including the
accepted review clarifications appended there:

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/cli.test.ts tests/youtube-sync.test.ts tests/youtube-sync.integration.test.ts tests/youtube-sync-obsidian.test.ts tests/youtube-sync-obsidian.integration.test.ts`:
  133 passed in five files.
- `npm.cmd test`: 634 passed, 1 intentional Windows skip for POSIX permissions,
  25 files. Task 014 adds 64 passing cases.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js` and `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `node dist/cli/index.js youtube sync-obsidian --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync`: passed.

Coverage includes command registration/help, ID/URL parsing, API-key/OAuth reuse,
vault/DB precedence and blank values, selected-vault containment through junction
aliases, unchanged ordinary-sync behavior, exactly-once application delegation,
cleanup on every result/failure, safe diagnostics for unknown thrown values, and
partial-result exit status without duplicate fatal messages. Integration tests
use mocked YouTube transport, real SQLite, and temporary existing vaults. They
verify retained items from another source, real Markdown output, persistence
surviving a blocked note destination, and successful later unchanged export.
Two separate Node process tests prove actual exit codes 0/1. Empty-snapshot
no-vault-access behavior and collector failure cleanup remain covered.

Initial checks exposed a help-line wrapping assertion and TypeScript return-flow/
fixture typing issues; these were fixed before passing validation. Child-process
tests initially hit the sandbox's Windows user-information restriction in `tsx`
(`uv_os_get_passwd`); approved reruns outside the sandbox passed. Packaged CLI
startup also passed outside the sandbox after its sandboxed npm invocation stalled
without output and was stopped. No runtime security or test settings were weakened.
All transport was mocked; no real credentials, account, database, or vault was used.

Files added:

- `src/cli/obsidian-export-failure.ts`
- `tests/youtube-sync-obsidian.test.ts`
- `tests/youtube-sync-obsidian.integration.test.ts`

Files changed for Task 014:

- `src/cli/program.ts`, `src/cli/youtube.ts`, `src/cli/youtube-sync.ts`
- `tests/cli.test.ts`, `tests/youtube-sync.test.ts` (new help case in the latter)
- `.env.example`, `README.md`, this handoff
- `prompts/task-014.md` (accepted review clarifications; supplied untracked)

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` layout is unchanged. The diagnostic helper belongs
to CLI presentation. No dependencies, schema, application, collector, auth, or
exporter contract changes; no specification deviations. The independent reviewer
found no actionable implementation/test issues and flagged one duplicated task
clarification section, which was removed. Its final documentation/evidence review
also found no unresolved issues. The `ks-verify` workflow passed, including
`git diff --check`, new-file whitespace, task-reference, clarification-uniqueness,
and reported-directory checks. Task-entry SHA-256 comparisons confirm all 48
unassigned source/test/package files are unchanged, including Task 013 work.

Existing Task 013 work and unrelated deletions were preserved. `prompts/task-013.md`
was already absent at Task 014 entry; references below record its historical
location. No commits or pushes were made. Task 015 has not started; further work
requires an explicitly assigned specification.

### Historical Task 013 verification

Task 013 implementation validation (2026-10-04), using `ks-persistence` and
`ks-verify`, against [prompts/task-013.md](../prompts/task-013.md) and the accepted
review clarifications appended there:

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/sync-to-obsidian.test.ts tests/sync-to-obsidian.integration.test.ts tests/knowledge-item-repository.test.ts`:
  50 passed in three files (25 orchestration unit, 8 integration, 17 storage).
- `npm.cmd test`: 570 passed, 1 intentional Windows skip for POSIX permissions,
  23 files. Task 013 adds 40 passing cases.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Unit coverage uses deferred promises to prove strict phase order and final export
settlement, original snapshot/result forwarding, all sync counter categories,
partial export results, empty snapshots, and unchanged thrown values (including
objects/undefined) from synchronous throws and asynchronous rejections in every
phase. Integration tests use temporary SQLite and a temporary vault for mixed
classification, retained items, duplicate identities, actual Markdown output,
and persistence surviving failures. Recovery coverage causes a real write failure
with a directory at one note path, verifies another note still exports, reopens
SQLite, removes that test obstruction, and proves the unchanged item is exported
successfully on the later run without output-state tracking. Storage ordering is
tested with reversed unordered SQLite scans as well as shuffled insertion order.
No real account, credentials, user database, or vault was used.

Files added:

- `src/application/sync-to-obsidian.ts`
- `tests/sync-to-obsidian.test.ts`
- `tests/sync-to-obsidian.integration.test.ts`

Files changed:

- `src/storage/knowledge-item-repository.ts`
- `src/storage/sqlite/knowledge-item-repository.ts`
- `tests/knowledge-item-repository.test.ts`
- `tests/sync.test.ts`, `tests/sync.integration.test.ts`, `tests/youtube-sync.test.ts`
  (existing repository fixtures adapted to the new required method)
- `README.md`, `src/outputs/obsidian/README.md`, this handoff
- `prompts/task-013.md` (accepted clarifications only; supplied untracked at entry)

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` layout remains. The new use case sits beside `sync.ts`;
no directory, dependency, schema, CLI, `sync()`, or exporter behavior changes.
There are no specification deviations. Independent `ks_reviewer` completion
review found no actionable code, test, or documentation issues. The `ks-verify`
workflow passed, including final documentation-link, new-file whitespace,
directory-structure, and `git diff --check` validation. Git diff confirms the
schema, package files, CLI, original sync, renderer, path builder, writer, and
exporters remain unchanged. There are no unresolved findings.
Pre-existing deletions of `instructions.txt`, `prompts/task-007.md`,
`prompts/task-012.md`, and `task-004.md` remain untouched. No commits or pushes
were made. Task 014 has not started.

### Historical Task 012 verification

Task 012 implementation validation (2026-10-02), using `ks-verify`, against
[prompts/task-012.md](../prompts/task-012.md), including its appended success,
invalid-vault, and additional-test requirements:

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/obsidian-export-notes.test.ts`: 19 passed in one file.
- `npm.cmd test`: 530 passed, 1 intentional Windows skip for POSIX permissions,
  21 files.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Focused tests mock only the single-item exporter. They cover empty input even
with invalid vault strings, one/multiple successes, unchanged forwarding and
frozen input, duplicate references and different versions of the same identity,
continuation after synchronous throws/asynchronous rejections, ordered failures,
all-failed batches, original item/error references, and non-Error rejection values
including null/undefined. Deferred promises verify strict sequencing after both
success and failure and that the batch waits for the final entry in all four
first/last success/failure combinations. No timers or new filesystem test matrix
were needed; existing real single-item integration tests passed in the full suite.
No real vault, account, or database was used.

Files added: `src/outputs/obsidian/export-notes.ts` and
`tests/obsidian-export-notes.test.ts`. Files changed: `README.md`,
`src/outputs/obsidian/README.md`, and this handoff. The existing
`src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`, `data`,
`docs`, and `prompts` layout is retained; `export-notes.ts` sits beside
`export-note.ts`, `note-path.ts`, and `write-note.ts`.
No dependencies or specification deviations. SHA-256 comparisons confirm
pre-existing source/test files, package files, and the Task 012 specification
are unchanged; the assigned Obsidian README is the only changed file among those
baseline paths. Independent `ks_reviewer` inspection found no code or test issues.
Final documentation and validation-evidence review also found no actionable issues.
The `ks-verify` workflow passed, including `git diff --check`, new-file whitespace,
Task 012 documentation references, directory structure, and baseline preservation.

The working tree remains uncommitted: the two Task 012 files are new, the three
documentation files are modified, and pre-existing changes/deletions remain.
`prompts/task-012.md` was supplied before implementation and remains unchanged;
`prompts/task-011.md` was already absent at Task 012 entry. No commits or pushes
were made, and Task 013 was not started.

### Historical Task 011 verification

Task 011 implementation validation (2026-10-02), using `ks-verify`, against
`prompts/task-011.md` (now absent; this records its historical location):

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/obsidian-export-note.test.ts tests/obsidian-export-note.integration.test.ts tests/obsidian-note-path.test.ts`:
  155 passed in three files: 6 exporter unit cases, 3 exporter integration cases,
  and 146 existing Task 010 path-builder cases.
- `npm.cmd test`: 511 passed, 1 intentional Windows skip for POSIX permissions,
  20 files.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

New tests verify exact call order/counts, original object and argument forwarding,
path/renderer error short-circuiting, original writer rejection, and deferred
writer fulfillment/rejection without sleeps. Real temporary-directory tests
verify exact UTF-8 Markdown bytes, Unicode, generated source-directory creation,
immutable input, a shorter metadata update at the same identity path, repeat
output, and missing-vault failure. No real vault, account, or database was used.
This is fresh Task 010 regression coverage during Task 011, not a reconstruction
of earlier Task 010 validation or an assertion of historical acceptance.

Task 011 files added:

- `src/outputs/obsidian/export-note.ts`
- `tests/obsidian-export-note.test.ts`
- `tests/obsidian-export-note.integration.test.ts`

Task 011 files changed: `README.md`, `src/outputs/obsidian/README.md`, and this
handoff. Existing `src/{application,auth,cli,collectors,core,outputs,storage}`,
`tests`, `data`, `docs`, and `prompts` directories remain; the Obsidian directory
now contains `export-note.ts`, `note-path.ts`, `write-note.ts`, and its README.
No dependencies or specification deviations. SHA-256 comparisons confirm all
pre-existing source/test files, package files, and the Task 011 specification
  are unchanged; only the assigned Obsidian README changed within those baseline
paths. Existing user deletions and untracked Task 008–010 work were preserved.
Independent `ks_reviewer` review found no implementation or test issues.
The `ks-verify` checks above passed, as did `git diff --check`, new-file whitespace,
new documentation references, and the directory-layout check.

The working tree remains uncommitted: the three documentation files are modified,
the three new Task 011 files are untracked, and the pre-existing deleted
`instructions.txt`, `prompts/task-007.md`, `task-004.md`, untracked Task 008–010
source/tests, and untracked `prompts/task-011.md` remain. No commits or pushes
were made. Task 012 was not started.

### Historical Task 009 verification

Task 009 implementation validation (2026-09-28), using `ks-verify`:

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/obsidian-write-note.test.ts`: 50 passed, one file.
- `npm.cmd test`: 356 passed, 1 intentional Windows skip for POSIX permissions,
  17 files.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Tests cover UTF-8 bytes and exact text (including supplied BOM, Unicode, mixed
newlines, empty content, and absent final newline), recursive parents, complete
overwrite, repeat writes, native path semantics, mandatory Windows drive-relative
rejection, traversal/root equivalence, contained normalization, existing vault
validation, and unchanged filesystem error propagation. All writer tests use
temporary directories; unsafe-path tests guard filesystem mutations. No real vault,
account, or database was used. POSIX-only native-name cases are included for a
POSIX run but were not executed during this Windows validation.

The first focused run found a test-only ESM namespace spying failure. A pass-through
Vitest mock facade made the required filesystem spies configurable, and all 50
tests then passed using real filesystem operations except injected failures/guards.

Files added: `src/outputs/obsidian/write-note.ts`, `tests/obsidian-write-note.test.ts`.
Files changed: `README.md`, `src/outputs/obsidian/README.md`, this handoff, and
`prompts/task-009-updated.md` (accepted clarifications only).
The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` layout is retained. The Obsidian output directory now
contains the standalone writer and its README. No dependencies, schema, renderer,
storage, or sync/CLI behavior changed, and there are no specification deviations.
Hashes of the Task 008 renderer/tests and package files match the Task 009 entry state.
Independent `ks_reviewer` inspection found no implementation or test issues.
Its documentation review found a duplicated accepted-clarification section in
the task file; that duplicate was removed before completion.
The reviewer confirmed no remaining findings. The `ks-verify` workflow passed,
including final new-file whitespace, documentation reference, directory structure,
and `git diff --check` validation. Unrelated pre-existing changes remain untouched.

### Historical Task 008 verification

Task 008 implementation validation (2026-09-28):

- `npm.cmd install`: passed; dependencies up to date, none added.
- `npm.cmd test -- tests/markdown.test.ts`: 43 passed, one file.
- `npm.cmd test`: 306 passed, 1 intentional Windows skip for POSIX permissions,
  16 files.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

The focused tests use explicit output assertions covering field order, quoting,
Unicode/control characters, optional/empty metadata, exact publication dates,
all amended description/newline cases, verbatim titles, deterministic output,
and frozen input preservation. Full-suite checks use existing isolated SQLite
and mocked transports; no real account, database, or vault was used.

Files added: `src/outputs/markdown.ts`, `tests/markdown.test.ts`.
Files changed: `README.md`, `src/outputs/obsidian/README.md`, this handoff.
The existing directory layout is retained; `src/outputs` now includes the pure
renderer alongside `output.ts` and the reserved `obsidian` writer directory.
There are no changes to dependencies, domain/storage contracts, schema, sync,
or CLI behavior, and no specification deviations. Independent `ks_reviewer`
inspection of implementation, tests, documentation, and validation evidence found
no actionable issues. The `ks-verify` workflow passed, including final whitespace,
new documentation reference, and directory checks. The pre-existing local
deletions of `instructions.txt`, `prompts/task-007.md`, and `task-004.md`, and the
user-supplied untracked clarification file, were preserved.

### Historical Task 007 verification

Task 007 implementation validation (2026-09-28):

- `npm.cmd install`: passed; dependencies up to date, no dependencies added.
- `npm.cmd test -- tests/sync.test.ts tests/cli.test.ts tests/youtube-sync.test.ts`:
  74 passed, three files.
- `npm.cmd test -- tests/sync.integration.test.ts tests/youtube-sync.integration.test.ts`:
  32 passed, two files. Total focused coverage: 106 passed.
- `npm.cmd test`: 263 passed, 1 intentional Windows skip for POSIX permissions,
  15 files. Task 007 adds 28 passing cases (18 unit, 10 integration).
- `npm.cmd run typecheck`: passed after integration.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

Independent `ks_reviewer` inspection found no implementation issues. A duplicated
accepted-clarification section in the task document was removed following review.
Final whitespace, new documentation links, and directory checks passed.

Tests cover every compared field, exact date representations, optional-field
addition/removal, empty text, mixed counts, awaited lookup/write ordering,
duplicate transitions, successive SQLite syncs, and unchanged-item writes.
Original error identity, earlier persisted writes after lookup/upsert failure,
missing-item retention, separate import state, and Task 006 command behavior
remain covered. Tests use isolated SQLite and mocked collection/transport;
no live YouTube account, credentials, user database, or vault was used.

Task 007 files added: none. Files changed relative to the task-entry state:

- `src/application/sync.ts`
- `tests/sync.test.ts`, `tests/sync.integration.test.ts`
- `tests/cli.test.ts`, `tests/youtube-sync.test.ts` (expanded result fixtures)
- `README.md`, `prompts/task-007.md`, this handoff

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` structure is unchanged. No dependencies, database
schema changes, repository methods, or specification deviations were needed.

### Historical Task 006 verification

Task 006 implementation validation (2026-09-27):

- `npm.cmd install`: passed, dependencies up to date; no dependencies added.
- `npm.cmd test -- tests/cli.test.ts tests/youtube-sync.test.ts tests/youtube-sync.integration.test.ts tests/youtube-client.test.ts tests/youtube-collector.test.ts tests/youtube-playlist-id.test.ts`: 146 passed, six files.
- `npm.cmd test`: 235 passed, 1 intentionally skipped on Windows for POSIX permissions.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `node dist/cli/index.js youtube sync --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, new-file whitespace, Task 006 documentation references,
  and the reported directory layout: passed.

Tests use mocked API/OAuth transport and temporary SQLite databases; no live
credentials, account operations, or vault output were used. New tests enter the
real command/composition path, verify API-key and OAuth success, empty playlists,
safe failure diagnostics, zero writes after collection failure, actual storage
closure, and initial/pagination refresh classification. Unit tests cover path
precedence/vault exclusion, parsing, exactly-once delegation, and lazy help.
The test total increased by 66 passing cases from the Task 005 checkpoint.

Independent `ks_reviewer` review found a response-supplied video ID entering a
newly CLI-visible metadata error. The message is now fixed; unit and command-level
regressions cover the case. The reviewer confirmed the fix with no remaining
actionable findings. A test-table inference error found during typecheck was also
fixed before the final passing checks above.

Task 006 files added:

- `src/cli/youtube-sync.ts`
- `src/collectors/youtube/youtube-error.ts`
- `tests/youtube-sync.test.ts`
- `tests/youtube-sync.integration.test.ts`

Task 006 files changed:

- `src/cli/program.ts`, `src/cli/youtube.ts`
- `src/collectors/youtube/playlist-id.ts`, `youtube-client.ts`, `youtube-collector.ts`
- `tests/cli.test.ts`, `tests/youtube-client.test.ts`, `tests/youtube-collector.test.ts`, `tests/youtube-playlist-id.test.ts`
- `.env.example`, `README.md`, `prompts/task-006.md`, this handoff

The existing `src/{application,auth,cli,collectors,core,outputs,storage}`, `tests`,
`data`, `docs`, and `prompts` layout is retained. No schema, dependencies, or
application sync semantics changed. No specification deviations were needed.

### Historical Task 005 verification

Task 005 implementation validation (2026-09-27):

- `npm.cmd install`: passed; dependencies already up to date, no dependencies added.
- `npm.cmd test -- tests/sync.test.ts tests/sync.integration.test.ts`: 9 passed.
- `npm.cmd test`: 169 passed, 1 intentionally skipped on Windows for POSIX permissions.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- `node dist/cli/index.js`: passed.
- `node dist/cli/index.js --help`: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.
- `git diff --check`, local documentation references, and new-source whitespace
  checks: passed. Package files and existing domain/storage/collector code are unchanged.

Tests use isolated SQLite and mocked collection clients; no real credentials,
network collection, or vault writes were used.
Independent `ks_reviewer` inspection of implementation, tests, and README found
no actionable issues. Its final handoff review encountered a usage limit; the
main agent completed the final handoff, reference, and diff checks.

### Historical Task 004 verification

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

## Current checkpoint and repository state

Tasks 017 and 018 are complete in commit `e9a86b7` on
`iteration/task-017-18-sync`, published as [PR #5](https://github.com/musienko-maxim/knowledge-sync/pull/5).
The user authorized resolving its conflicts and updating the PR on 2026-10-09.
Fetched `origin/main` at `a7144bf`, the squash merge of PR #4; its tree exactly
matches the branch's Task 016 checkpoint `392fb44`. Merging it caused 25 conflicts
because the squash commit did not retain the original ancestry. Resolution keeps
the Tasks 017–018 versions and their existing historical-document deletions,
including two briefs Git automatically reintroduced. Before this handoff update,
the resolved index and working tree exactly matched `e9a86b7`.

Fresh conflict-resolution verification:

- `npm.cmd install`: passed; no dependencies added. The existing high-severity
  audit finding remains; no dependency fixes were included.
- `npm.cmd test`: 951 passed, one expected Windows POSIX-permissions skip, 40 files.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- Built CLI startup, top-level help, and `youtube sync`, `sync-obsidian`, and
  `sync-all` help: passed.
- `npm.cmd exec --offline --package=. -- knowledge-sync --help`: passed.

No runtime, test, schema, dependency, or directory-layout changes were needed.
The existing `src/{application,auth,cli,collectors,core/models,outputs/obsidian,storage/sqlite}`,
`tests`, `data`, `docs`, and `prompts` layout is retained. No specification deviations.
The earlier PR-preparation record below is historical. Check Git and PR #5 for
the final merge-commit and publication state.

The user authorized preparing a PR after Task 016 completion. A fresh fetch
confirmed `origin/main` is still `193e837` (Tasks 001–007), and the remote exposes
only PR refs 1–3. New branch `iteration/task-016-account-sync` starts at the
Task 012 checkpoint `733345a` and packages completed Tasks 008–016 together.
The latest checkpoint above contains the PR title/body and scope. Unrelated local
deletions of `instructions.txt`, `prompts/task-007.md`, `prompts/task-012.md`, and
`task-004.md` are excluded; no missing specifications were recreated. No runtime
files changed during preparation after validation. Check Git/upstream and the
remote PR for final commit, push, and publication state. Earlier no-commit/no-push
statements record implementation before this explicit PR request.

### Historical Tasks 008–012 checkpoint

The user authorized creating a PR on 2026-10-02. Fetching origin confirmed PR #3
merged Tasks 005–007 into `origin/main` at `193e837`. Its tree matches the previous
local Task 007 branch, so a fresh `iteration/task-012-obsidian-export` branch was
created from that base without changing application files. It packages completed
Tasks 008–012, their tests, the current Task 012 specification, and documentation.
The unrelated local deletions of `instructions.txt`, `prompts/task-007.md`, and
`task-004.md` are excluded. No missing historical task files were reconstructed.
The latest checkpoint above contains the PR title, description, and validation.
Check Git and the remote PR for final publication state; older no-commit/no-push
statements describe implementation before this explicit authorization.

### Historical Tasks 005–007 checkpoint

The user authorized preparing a commit for PR and pushing on 2026-09-28.
Fetching origin confirmed PR #2 merged Task 004 into `origin/main` at `5324ad2`.
Branch `iteration/task-007-sync-classification` starts from that merge and
collects the dependent Tasks 005–007 implementations, tests, and documentation.
No application files changed during commit preparation after the recorded
passing checks. PR title and description are in the latest checkpoint above.

The local deletions of `instructions.txt` and `task-004.md` are unrelated and
excluded from this checkpoint. Earlier task specifications absent from the
workspace have not been reconstructed. Check Git for the final commit/push
state; earlier statements that no commits were made describe implementation
sessions before this explicit authorization.

### Historical recovery and Task 004 checkpoint

The `src/` and `tests/` directories were restored in an earlier session and verified
against the surviving compiled `dist/` output. Git is now initialized with an
`origin` remote. PR #1 was merged and local `main` was updated to `b0f46fe`.
The `iteration/task-004-persistence` checkpoint collects Task 004 persistence,
the OAuth refresh-error follow-up, documentation cleanup, and repository agent
configuration. Commit `3e26d97` was pushed on that branch and matched its remote
tracking branch. A Task 004 PR was not created in this session: GitHub CLI was
unavailable and the GitHub integration was not installed/connected. Check actual
remote PR status before creating one; it may change outside this session.

The working tree was clean after the push. This handoff update and the linked
session conclusion are subsequent local documentation changes, not part of that
checkpoint commit. Inspect current Git status before editing; do not initialize
Git again or assume later pending edits belong to a newly assigned task.

## Repository development helpers

Read [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for the reusable explorer, implementer,
and reviewer roles and persistence, YouTube/OAuth, and verification skills.
Native definitions live under `.codex/agents/`; skills live under `.agents/skills/`.
Use only the roles/skills needed for the current assignment. These are development
helpers, not application agents or automatic task execution.

## Next-session guidance

Task 019 is deferred by the user's 2026-10-09 decision. Do not resume transcript
implementation or acquisition research without a new assignment. Its potential
scope, including future search/RAG, is backlog context only and does not change
the current MVP constraints. Task 020 implementation and automated validation are
complete; see its checkpoint above. Manual real-world acceptance requires a
separate assignment. Do not restart implementation or begin another task.

Read this handoff and the explicitly assigned task specification before changing
code. Tasks 017 and 018 implementation, validation, documentation, and independent
review are complete. The historical specification was `prompts/task-018.md`
(currently locally deleted); accepted implementation decisions remain in
[its review](task-018-review.md).
Their changes are committed in `e9a86b7`; see the current PR #5 checkpoint above.
The previous checkpoint contains the prepared Tasks 008–016 PR description and
historical validation evidence; check actual Git/upstream/PR state if assigned
publication work.
Task 010 code and tests were already present at Task 011
entry; the milestone brief now records Tasks 001–018 as accepted, without
reconstructing a separate historical Task 010 acceptance record. Work only on an
explicitly assigned task. Import-state orchestration remains unimplemented.
Do not begin the next task without a separate explicit assignment. The later PR #5
conflict-resolution request authorizes its merge commit and push; Task 018's earlier
implementation-only authorization is historical.
