# Task 021 — Facebook Saved JSON Import MVP

Status: DRAFT — awaiting implementation review.

## 1. Goal

Implement a safe, local-first importer for Facebook Saved Collections using the actual export structure verified in Task 022.

The importer must:

1. Read an extracted Facebook `collections.json` file.
2. Normalize supported Saved items.
3. Persist them in existing SQLite storage.
4. Persist Facebook collections and additive memberships.
5. Export Facebook Markdown notes to Obsidian when requested.
6. Include Facebook content in the existing `Knowledge Sync.md` navigation.
7. Preserve all previously stored YouTube and Facebook data.

Do not implement Graph API integration, scraping, remote content retrieval, or automatic scheduling.

## 2. Project context

Repository: `D:\codex\knowledge-sync`

Environment:
- Windows 11 / PowerShell
- Node.js / TypeScript
- Commander CLI
- SQLite / Drizzle
- Zod / Vitest
- Obsidian vault: `D:\obsidian`

Use `npm.cmd` in PowerShell.

Read before implementation:

- `AGENTS.md`
- `docs/SESSION_HANDOFF.md`
- Task 021 architecture-review findings
- Task 022 source-discovery findings
- Relevant source code and tests

Tasks 001–018 and 020 are accepted. Task 019 remains deferred.

Do not commit or push.

## 3. Verified input contract

The Task 022 discovery inspected one official Facebook JSON export.

Observed:

- `collections.json`: 14 collections
- 349 nested Saved occurrences
- 345 occurrences with URLs
- 270 distinct URLs
- 271 unique collection/item memberships
- 4 URL-less occurrences
- 1 empty collection

The separate `your_saved_items.json` has 351 save-activity records but insufficient identity and URL information for general-purpose import.

### MVP input

Support the actual verified structure of the extracted `collections.json`.

Do not require `your_saved_items.json`.

Do not support ZIP archives or generic Facebook export discovery in this MVP.

Unexpected file structures must fail explicitly, not be interpreted as empty successful imports.

## 4. CLI

Proposed command:

```powershell
node dist/cli/index.js facebook import `
  --file "D:\imports\collections.json" `
  --vault "D:\obsidian"
```

CLI contract:

- `--file`: required
- `--db`: optional, using established path precedence
- `--vault`: optional, explicitly enables Obsidian export
- Without `--vault`, perform database import only
- Validate paths before opening storage
- Reject a database located inside the effective Obsidian vault
- Always close storage resources
- Preserve existing YouTube CLI behavior

Report counts for:

- Input collections and entries
- Accepted distinct items
- Skipped unsupported entries
- Duplicates
- New / changed / unchanged items
- Added / existing memberships
- Database failures
- Note, collection, and navigation export outcomes

Do not print private URLs, account identifiers, personal text, or raw parser exceptions.

## 5. Facebook input parsing

Add a focused Facebook JSON parser under the existing collectors structure.

Use the verified `label_values` and nested section layout.

Recognize fields through their semantic labels, not positional indexes.

Support only structures observed in Task 022.

For each collection:

- Read the collection `fbid` as a string
- Read its decoded name
- Read its Saved-entry section
- Allow empty collections
- Ignore participant records as Saved items

For each Saved entry:

- Read a supported HTTP(S) URL
- Read an explicitly labelled nonempty title when available
- Read explicit nested Author metadata when present
- Read a nonempty description when available
- Preserve the parent collection relationship

Do not infer author from ambiguous generic `Ім’я` values.

Do not invent missing metadata.

## 6. Text encoding

The source discovery identified a mixed encoding condition affecting localized text.

Implement narrowly scoped, deterministic repair for the verified mojibake variant.

Requirements:

- Identify known labels and sections after appropriate normalization
- Preserve correctly encoded Unicode
- Never repair URLs or source identities
- Never globally transform arbitrary strings
- Avoid lossy replacement-character behavior
- Fail or report unsupported malformed text predictably
- Include real-format sanitized test fixtures

Encoding repair must be idempotent.

## 7. Item identity

Use URL-based bookmark identity.

Exact scheme:

```text
source   = facebook
sourceId = url-v1-<lowercase SHA-256 hex>
```

Hash the UTF-8 bytes of the exact validated input URL string.

Do not normalize or rewrite the URL before hashing.

Preserve:
- Original path spelling
- Query parameters
- Case
- Percent encoding
- Other identity-relevant URL details

Reject invalid or unsupported URLs.

Do not use titles, timestamps, archive positions, or collection membership as identity.

URL aliases are not merged automatically.

Identity compatibility must be validated against existing `(source, sourceId)` constraints and filename mapping.

## 8. Deduplication

Normalize and deduplicate records before persistence.

For records with the same URL:

- Produce one KnowledgeItem
- Union established collection memberships
- Prefer nonempty metadata over missing or empty metadata
- Resolve complementary metadata independently of input order

For conflicting nonempty metadata within one import:

- Report a deterministic conflict
- Do not silently apply last-record-wins
- Preserve existing stored data
- Define explicit per-field handling and test it

Four URL-less occurrences in the verified sample must be skipped with diagnostic counts.

Do not synthesize placeholder identities for them.

## 9. KnowledgeItem mapping

Reuse the existing KnowledgeItem domain model.

Mapping:

- `source`: facebook
- `sourceId`: versioned URL hash
- `url`: original validated URL
- `title`: explicit nonempty exported title or deterministic fallback
- `author`: only explicit supported Author metadata
- `description`: supported nonempty description
- `publishedAt`: omitted
- Legacy scalar `collection`: omitted

Fallback titles must:

- Be nonempty and human-readable
- Distinguish observed URL categories when possible
- Include a short deterministic identity suffix
- Never depend on record ordering
- Never overwrite a previously stored meaningful title

Do not fetch original Facebook content.

## 10. Metadata updates

Existing repository upsert behavior may clear omitted optional fields.

Therefore implement a safe merge of imported metadata with existing stored items.

Rules:

- Missing new metadata preserves existing data
- Empty new metadata does not erase useful existing data
- Explicit titles are preferred over generated fallbacks
- Repeated import of identical input is idempotent
- Conflicting nonempty metadata is handled deterministically and reported

Do not silently replace a meaningful existing title with a generic fallback.

## 11. Collections

Reuse existing KnowledgeCollection storage.

Collection identity:

```text
source   = facebook
sourceId = collection.fbid
```

Preserve the full decimal identifier as a string.

Never convert Facebook IDs to JavaScript Number.

Map the verified decoded collection name into the existing collection title field.

Support:
- Empty collections
- Distinct IDs with identical names
- Multiple memberships
- Existing collection records
- Collection title updates

Document that older imports can revert a collection name if no independent archive-freshness guarantee exists.

Do not infer collection membership from item titles or URL similarity.

## 12. Membership policy

Use strictly additive membership writes.

Persist each distinct pair:

```text
(collection identity, item identity)
```

Requirements:

- Repeated edges are idempotent
- One item may belong to multiple collections
- Missing entries do not delete existing memberships
- Missing collections do not trigger deletion
- Failed imports never initiate destructive reconciliation

Do not call the existing destructive collection synchronization path for Facebook imports.

## 13. Persistence and failure handling

Validate the recognized input structure before starting persistence.

Recommended order:

1. Parse and validate input
2. Normalize and deduplicate
3. Persist collections
4. Persist items
5. Persist verified memberships
6. Read complete SQLite snapshot
7. Optionally export Obsidian projection

Preserve existing source-of-truth semantics.

A storage failure should stop persistence, report completed progress, and suppress the export phase.

Previously committed successful writes remain available for recovery.

A later retry must converge without duplicate items or memberships.

Do not claim archive-wide atomicity unless the actual implementation supplies it.

Unsupported individual records may be skipped with diagnostics; unsupported overall archive structure must fail before database writes.

## 14. Obsidian output

Reuse existing Obsidian infrastructure wherever possible:

- Identity-based note paths
- Markdown rendering
- Batch export
- Collection indexes
- Full SQLite snapshot
- Task 020 navigation

Facebook notes must have:

- Readable title
- Original URL
- Available supported metadata
- Correct links from collection indexes

The existing `Knowledge Sync.md` must include both YouTube and Facebook.

Do not generate global navigation from the current Facebook batch alone.

Do not rename existing YouTube Markdown files.

## 15. Obsidian safety

The architecture review identified insufficient ownership protection in the ordinary note writer.

For newly generated Facebook item and collection files:

- Require explicit generated ownership metadata
- Verify expected source and identity before replacement
- Never overwrite existing unowned user files
- Reject unsafe path traversal
- Reject symlink-based path escapes
- Use safe, atomic replacement where technically possible
- Report collisions without destroying existing files

These protections must be enforced in the shared export path.

A later YouTube export processing stored Facebook records must not bypass Facebook ownership protection.

Do not migrate or rewrite existing YouTube files merely to add Facebook support.

Imported Facebook titles, descriptions, and authors are untrusted text.

Render them safely, without interpreting embedded HTML or Markdown as executable or structural instructions.

Preserve underlying normalized metadata separately from its safe Markdown representation.

## 16. Input safety

The parser must:

- Bound input file size
- Bound nesting depth, record count, and text lengths
- Validate root structure and required fields
- Validate URL schemes
- Handle malformed Unicode and malformed JSON
- Avoid network requests
- Avoid arbitrary filesystem traversal
- Avoid outputting personal record contents in errors

Do not install dependencies unless an independently reviewed implementation need is established.

## 17. Required tests

### Unit tests

- Verified JSON structures
- Encoding repair and idempotency
- Correctly encoded text preservation
- URL validation
- Stable SHA-256 identities
- Fallback titles
- Complementary metadata merging
- Conflicting metadata
- Duplicate records
- Empty collections
- Missing URLs
- Invalid FBIDs
- Large decimal FBIDs preserved as strings

### Repository and application tests

- New Facebook items
- Existing item updates
- Sparse metadata preservation
- Repeated identical imports
- Multiple memberships
- Duplicate membership edges
- No destructive reconciliation
- Recoverable persistence failure
- Invalid input without writes

### Obsidian tests

- Facebook note creation
- Facebook collection indexes
- Complete multi-source navigation
- User-created file preservation
- Ownership marker verification
- Symlink rejection
- Safe untrusted-text rendering
- Existing YouTube filename and byte preservation

### Integration regression

Test this sequence:

```text
Facebook import
    ↓
YouTube export
    ↓
Facebook reimport
    ↓
Verify SQLite + Obsidian
```

Facebook notes must remain protected throughout.

## 18. Real E2E acceptance

First perform E2E with a temporary SQLite database and temporary Obsidian vault.

Use a sanitized or safely handled representation of the verified export.

Expected logical results for the inspected sample:

```text
Distinct items:       270
Collections:          14
Unique memberships:   271
URL-less entries:       4
```

Do not assume that all 270 items are new if the database already contains Facebook records.

Verify that a second import produces no duplicate identities or memberships.

Verify deterministic output bytes under repeated identical inputs.

Before touching real data:

- Back up the SQLite database
- Back up relevant Obsidian files
- Obtain explicit user authorization
- Confirm safe rollback procedures

The real vault must not be modified during architecture review.

## 19. Exclusions

Do not implement:

- Facebook Graph API / OAuth
- Browser scraping
- Cookie extraction
- Remote content fetching
- Full-post reconstruction
- Video or media downloading
- `your_saved_items.json` ingestion
- Direct ZIP input
- Destructive reconciliation
- URL alias resolution
- Automatic scheduling
- Full-text search
- AI enrichment
- YouTube transcripts
- Database schema migration without demonstrated necessity

## 20. Implementation workflow

Before implementation, perform a final review of this specification against the repository.

Report:

1. Architectural blockers
2. Unresolved ambiguity
3. Scope concerns
4. Existing APIs that should be reused
5. Required security changes
6. Suggested implementation stages
7. Test and E2E strategy

Do not begin implementation until the user explicitly approves the final specification.

During implementation, preserve unrelated working-tree changes.

Run focused tests, full Vitest suite, typecheck, build, and CLI checks.

Perform independent review.

Update `docs/SESSION_HANDOFF.md` and relevant documentation only during approved implementation.

Do not commit or push automatically.