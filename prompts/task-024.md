# Task 024 — Portable Readable Markdown Filenames and Non-Destructive Export

**Project:** `knowledge-sync`  
**Status:** DRAFT SPECIFICATION — architecture review and approval required before implementation  
**Repository:** `D:\codex\knowledge-sync`  
**Target:** `prompts/task-024.md`

## 1. Objective

Give generated YouTube and Facebook item/collection notes **human-readable physical filenames** that work in Windows Explorer, VS Code, Git, Obsidian, or any other Markdown-capable tool. Preserve SQLite as the source of truth and the Markdown vault as a reproducible derived projection.

This task introduces one deterministic, source-neutral export plan and a **non-destructive export-only CLI**. It **does not** migrate or automatically delete historical output. The user accepts that filename paths may change when source titles change; immutable first-title filenames are **not required**.

## 2. Mandatory repository inspection

Before proposing implementation or editing code, read and follow:

- `AGENTS.md`
- `docs/SESSION_HANDOFF.md`
- `prompts/task-023.md`
- This specification
- The existing path builders, renderers, writers, storage, CLI, orchestration and relevant tests

Locate actual APIs and adapt the implementation to the repository; paths below reflect Codex's previous review, not an instruction to assume interfaces exist unchanged:

- `src/outputs/obsidian/note-path.ts`
- `src/outputs/obsidian/collection-path.ts`
- `src/outputs/obsidian/markdown-link.ts`
- `src/outputs/obsidian/collection-projection.ts`
- `src/outputs/obsidian/collection-markdown.ts`
- `src/outputs/obsidian/navigation-markdown.ts`
- `src/outputs/obsidian/export-projection.ts`
- `src/outputs/obsidian/write-note.ts`
- `src/outputs/obsidian/write-owned-note.ts`
- `src/storage/sqlite/storage.ts`
- Relevant snapshot-reading code and Commander CLI entry points

Respect existing uncommitted changes. **Do not auto-commit or push.**

## 3. Scope and exclusions

### In scope

1. Pure deterministic filename derivation for item and collection Markdown notes.
2. Shared in-memory export planning for note, collection and generated-navigation destinations.
3. Up-front validation of collisions, filesystem safety and destination paths.
4. Correct destination links in generated collection indexes and root navigation.
5. An export-only CLI that reads a consistent existing SQLite snapshot without import, sync or network access; add a genuine `--dry-run` mode.
6. A consistent, versioned ownership and content-integrity scheme for newly generated **item and collection** notes, including YouTube output.
7. Non-destructive staged publication, safe retries and actionable diagnostics.
8. Integration of the shared planner into every existing production export entry point, so later YouTube sync or Facebook import cannot regenerate old naming conventions.
9. Automated and temporary-vault E2E validation; documentation and handoff updates after approved implementation.

### Explicitly out of scope

- Automatic deletion or relocation of legacy Markdown files.
- Recursive clearing of `youtube/`, `facebook/` or any vault folder.
- Physical migration of an existing real vault, including a mass rename.
- Rewriting user-authored links, backlinks, attachments or third-party references.
- SQLite schema or persistent file-path registry.
- Changes to canonical `source`, `sourceId`, collection IDs or membership identities.
- Obsidian community plugins or dependence on an installed Obsidian application.
- AI-generated titles, metadata scraping, transcript work, full-text search, unrelated refactoring.
- Automatic commits or pushes.

**Important limitation:** without cleanup, a title change can leave an obsolete generated file alongside its newly named replacement. New generated links must target the current planned filename, but removing stale files belongs to a separate approved task. Report this clearly; do not imply this task eliminates stale notes.

## 4. Exact filename contract (version 1)

Keep established source directory boundaries and collection subdirectories. Examples are illustrative, not exact expected hashes:

```text
youtube/understanding-ai--<32-hex>.md
youtube/collections/my-learning--<32-hex>.md
facebook/interesting-article--<32-hex>.md
facebook/collections/ai-graphics--<32-hex>.md
```

### 4.1 Stable suffix

For each generated entity define:

- `kind`: exactly `item` or `collection`.
- `source`: the existing source identifier, unchanged.
- `sourceId`: the full existing ID, unchanged.

Generate the suffix as the **first 32 lowercase hexadecimal characters** of SHA-256 over the UTF-8 bytes of the canonical JSON array:

```ts
JSON.stringify(["knowledge-sync-readable-path-v1", kind, source, sourceId])
```

The array positions and constant above are the serialization contract. Do **not** hash a mutable title, trim or case-fold source IDs, normalize identity strings, or replace identities in SQLite. Existing identity validity checks remain in force. Store/use full original identities in ownership metadata; the truncated suffix is only a physical filename discriminator, **not** an authority for ownership.

### 4.2 Readable prefix

1. Begin with the current persisted entity title, not a fetched or inferred title.
2. Normalize the display title to Unicode **NFC**, then perform JavaScript Unicode default (non-locale-specific) lowercase conversion.
3. Retain Unicode letters (`\p{L}`), combining marks (`\p{M}`) and numbers (`\p{N}`); replace each run of other characters with one ASCII hyphen. Trim leading/trailing hyphens and unsafe trailing spaces/dots.
4. When the result is empty, use `untitled-item` or `untitled-collection`.
5. Bound the prefix by **80 Unicode code points and 160 UTF-8 bytes**, whichever comes first. Do not split code points or leave a dangling combining mark at a truncation boundary. The suffix is never truncated.
6. Keep Ukrainian and other safe Unicode characters readable. Do not percent-encode the filename prefix. **Only Markdown link destinations** should use the repository's safe destination-encoding function.
7. Validate every final Windows path component, including reserved names, control characters, trailing dots/spaces and path separators. Preserve or strengthen the existing source-directory encoding protection.
8. A title change may change only the prefix; the suffix stays stable. Different source titles that normalize to the same prefix may retain the same filename.

The path builder must be deterministic and have no filesystem or SQLite side effects.

### 4.3 Collision and length policy

- Preflight **all** planned output paths, including the fixed root navigation path, for collisions on Windows case-insensitive filesystems, including case-only or Unicode-related filesystem equivalences that can be detected reliably. Detect duplicated suffixes assigned to different full identities.
- Validate destination containment and each absolute destination and temporary write path; initially use a **240 UTF-16 code-unit absolute-path portability budget** unless repository evidence shows a more appropriate conservative limit. This budget is a policy, not an OS guarantee.
- When a collision, unsafe path or length violation occurs, fail the plan **before any vault write**, naming both identities or offending paths in a privacy-conscious diagnostic.
- Do **not** resolve collisions by encounter-order `-1`, `-2` filenames. Do not overwrite an unknown occupant even when its basename has the expected suffix.
- Do not introduce new dependencies solely for string formatting when built-in platform facilities suffice.

## 5. One shared export plan

Construct a single immutable **in-memory** plan from a consistent database snapshot, before publication. It should contain at least:

- Each item's full identity, title, planned relative path and rendered destination.
- Each collection's full identity, title, planned relative path and membership destinations.
- The root navigation output location and all navigation destinations.
- Collision/invalid-path diagnostics and summary counts.
- Enough information for every writer and renderer to use **the same mapping**.

Do not independently recompute note destinations in collection or root navigation rendering. Reuse existing safe Markdown rendering/escaping behavior, including Facebook untrusted-text protections. Do not globally decode Facebook numeric entities without a separately proven rendering defect.

Existing YouTube and Facebook export routes must use this shared plan or a thin common adapter; none may create old-style filenames after Task 024 is implemented.

**Coordination with Task 023:** Task 023 remains responsible for grouping the root navigation by source. Task 024 must preserve the navigation layout that is already accepted at implementation time and update destinations to the new shared path plan. Do not silently implement unrelated Task 023 features. If the tasks' acceptance contracts conflict, flag the dependency before implementing.

## 6. Export-only command and read-only SQLite access

Implement a source-neutral CLI form:

```text
knowledge-sync export obsidian --db <existing.sqlite> --vault <destination>
knowledge-sync export obsidian --db <existing.sqlite> --vault <destination> --dry-run
```

Follow the repository's actual CLI conventions and document concrete invocation from PowerShell (`npm.cmd` when applicable).

Requirements:

1. Open an **existing** SQLite database strictly read-only. No schema creation, migration, directory creation for the DB, data edits or implicit writable initialization. Missing/incompatible databases fail before vault writes.
2. Load items, collections and memberships in one consistent read snapshot/transaction. Preserve deterministic ordering.
3. Do not invoke YouTube OAuth, Facebook imports, network requests, source discovery or external metadata services.
4. Validate the destination and planned paths before writing; avoid creating directories until validation succeeds.
5. `--dry-run` performs **zero writes** to the vault and database (including creating directories or temporary files). It reports intended additions/updates, potential legacy leftovers, collisions and other blockers, without asserting ownership for unknown files.
6. Normal mode writes only planned generated output after ownership/path preflight; print outcome counts and identify retained conflicts.
7. Empty snapshots must never authorize deletion. The behavior for generating an empty navigation page must be documented and tested.
8. No full import/archive or network credentials are needed.

Do not read/write a different default SQLite file implicitly when the supplied `--db` is absent or wrong.

## 7. Ownership, fingerprints and overwrite safety

Newly generated item and collection Markdown files must carry a deterministic, **versioned** generated-file marker with **full kind/source/sourceId** and a SHA-256 fingerprint of the generated content. Preserve valid YAML frontmatter and the existing human-readable `title` property. Define and document a single parseable marker layout, escaping rules, newline normalization and fingerprint computation so verification is unambiguous.

The fingerprint covers **every other byte** of the note, excluding only its own fingerprint field according to the specified canonical procedure. Reject missing, malformed or duplicated marker/fingerprint fields. A fingerprint is an accidental-edit detector, **not** a cryptographic authorization mechanism.

Before replacing an existing destination:

- Verify it is a generated file with the expected full identity, marker version and valid stored fingerprint, and that it is not user-modified.
- Refuse unknown, old-format-without-verifiable-ownership, modified or conflicting files. Never silently adopt legacy content just because the name or hash looks right.
- Treat symlinks/junctions, traversal and destinations escaping the allowed vault root as blocking safety conflicts. Check paths both at planning and immediately before replacement; avoid following external links.
- Preserve prior file bytes when validation or writing fails. Prefer existing tested atomic per-file writer primitives when compatible with these guarantees.

Root navigation retains its dedicated existing ownership protection; integrate its publication into the phase-gated process without weakening this protection. Do not assume Facebook's existing identity prefix or the legacy YouTube writer already satisfies all these checks.

## 8. Publication, failures and retries

Use the following order:

```text
Consistent SQLite snapshot
  -> Plan all output paths and links
  -> Preflight destination / collisions / existing occupants
  -> Publish all item notes
  -> Publish all collection notes (only if all items succeeded)
  -> Publish root navigation (only if all collections succeeded)
  -> Report results; NO automatic obsolete-file deletion
```

A failed write must not cause the next phase or any cleanup to proceed. There is no claim of a transaction across the whole vault: partial newly written files are permitted, but previously existing files must not be corrupted. Retry from the same database state and filesystem state must converge to identical bytes and paths when no conflicts or manual edits intervene.

On title changes, current plan links point to the new filename. The former file remains untouched in this task. Include a clear stale-file warning and provide enough information for a future reviewed cleanup plan.

## 9. Legacy projection and real-vault boundary

The historical handoff records **322 KnowledgeItems, 28 collections, 351 generated Markdown files**. These figures are not a live manifest.

- Build/test first with temporary databases and empty temporary vaults.
- Preserve the verified historical backup at `D:\knowledge-sync-backups\task021-20261014-011117`.
- Do not delete, rename or automatically overwrite existing real-vault legacy notes.
- Do not rewrite arbitrary user-authored backlinks or external references. Old links may break if the old files are manually removed later; make this explicit.
- Before any approved real-vault use, inventory the actual notes, confirm a **fresh** backup of DB and vault, run `--dry-run`, review generated-link behavior and obtain explicit authorization.
- If transitioning the existing vault requires cleaning old notes, stop and specify a **separate** cleanup/migration task with an allowlist, ownership/content-hash checks and rollback. Never infer that deleting everything under a source directory is safe.

The task is accepted based on temporary-vault E2E; real-vault migration is **not** a condition of Task 024 completion.

## 10. Tests and acceptance criteria

Add/extend relevant unit, integration and CLI tests, including:

**Naming and plan**

- Ukrainian, mixed Cyrillic/Latin, accented Unicode, combining marks, emoji, punctuation, empty/fallback titles.
- Stable 32-hex suffix on title changes; differences for case-distinct identities and item vs collection; same title with different identities.
- Filename truncation, UTF-8 byte and code-point budgets, complete Windows path and temporary-write path budgets.
- Reserved Windows names/characters, case-insensitive collisions, injected hash-collision scenario, malformed identity Unicode.
- No order-dependent numbering or path generation; deterministic sorting and repeat runs.

**Links and projection**

- Correct item, collection and root links for mixed YouTube/Facebook data, memberships and renamed titles.
- Existing Facebook escaping and Markdown-injection safety unchanged.
- All entry points use the shared plan, never resurrect legacy filenames.
- Empty-snapshot behavior defined.

**Storage / CLI / safety**

- Missing/incompatible database fails before vault write; DB not created or mutated.
- Export-only executes without credentials/import or network.
- `--dry-run` produces **zero** filesystem/database modifications.
- Exact valid ownership/fingerprint permits safe repeat update; unknown occupant, changed content, identity mismatch, malformed/duplicate marker blocks replacement.
- Existing unowned legacy notes are preserved; symlink/junction and traversal attempts are rejected.
- Item failure suppresses collections/root; collection failure suppresses root; errors never trigger cleanup.
- Retry after injected failures; exact repeat export yields byte-identical projection and unchanged identities.
- Title change produces a new path and updated generated links; old path remains, reported as a legacy/stale possibility, **not** auto-deleted.

Validation must include:

- Focused and full Vitest suites.
- Typecheck, build and built/packaged CLI help/startup checks.
- Temporary SQLite + temporary-vault E2E, including second identical export and title change.
- Independent code/architecture review and relevant project verification workflows.
- Explicit record of tests, skips, changed files and open findings.

## 11. Implementation stages

1. Inspect current repository and review this specification for conflicts; request clarification **before** editing implementation if safety or contract blockers exist.
2. Implement/test pure filename derivation and shared plan.
3. Implement strict read-only snapshot access and export-only `--dry-run`.
4. Introduce safe ownership/fingerprint handling, collision preflight and staged publication.
5. Route all existing export call sites through the shared plan; update link renderers and compatibility tests.
6. Complete temporary-vault E2E and failure/retry tests, docs and handoff, then independent review.
7. **Stop** before real-vault migration/cleanup; do not proceed without new user authorization.

## 12. Deliverables and stop conditions

Deliver:

- Tested implementation with documented `export obsidian` / `--dry-run` behavior.
- Updated tests and affected docs, including `docs/SESSION_HANDOFF.md`.
- Summary of file changes, exact validation results, known limitations and non-destructive real-vault acceptance instructions.

**Do not** change real `D:\obsidian`, the real SQLite database, or verified backups during development/test. Never auto-commit or push. Preserve unrelated edits.

**Before any implementation, perform a specification/architecture review only and report blocking findings.** The user will explicitly authorize implementation in a subsequent step.
