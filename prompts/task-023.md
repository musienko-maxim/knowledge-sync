# Task 023 — Unified Obsidian Readability & Navigation UX
## Architecture and Root-Cause Review

**Mode: REVIEW ONLY — NO IMPLEMENTATION**

### 1. Role and objective

Act as a senior TypeScript software architect, Obsidian integration specialist, and independent reviewer.

Investigate readability and navigation issues in the existing `knowledge-sync` Obsidian output for both YouTube and Facebook.

Identify root causes, evaluate safe improvements, and recommend a minimal implementation scope for Task 023.

Do not implement, refactor, modify files, or migrate data.

### 2. Project context

Repository: `D:\codex\knowledge-sync`

Environment:

- Windows 11 / PowerShell
- Node.js / TypeScript
- Commander CLI
- SQLite / Drizzle ORM
- Zod / Vitest
- Obsidian vault: `D:\obsidian`

Use `npm.cmd` in PowerShell.

Current project status:

- Tasks 001–018 completed
- Task 019 deferred
- Task 020 completed and accepted
- Task 021 completed and accepted, including real E2E and manual Obsidian verification
- Task 022 supplied the Facebook export source-format discovery

Current persisted content:

- 52 YouTube items
- 270 Facebook items
- 28 total collections
- 323 memberships

Task 021 validation:

- 1,188 tests passed
- Four expected skips
- Successful build, typecheck, and CLI checks
- Successful real E2E
- Independent review without remaining findings
- Successful repeat-import idempotency
- User-confirmed Obsidian navigation and original URL behavior

Real E2E backup:

`D:\knowledge-sync-backups\task021-20261014-011117`

The backup must remain untouched.

### 3. Required preliminary inspection

Before making recommendations, read:

1. `AGENTS.md`
2. `docs/SESSION_HANDOFF.md`
3. Relevant Task 020 implementation and documentation
4. Relevant Task 021 implementation and documentation
5. Existing KnowledgeItem and KnowledgeCollection models
6. SQLite repositories
7. Markdown renderer and export orchestration
8. Navigation renderer and writer
9. Collection index renderer
10. Identity-based Obsidian filename mapping
11. Ownership and filesystem-safety implementations
12. Relevant unit and integration tests

Inspect the Git working tree.

Preserve all uncommitted changes.

Use actual discovered repository paths in the report.

### 4. Observed problems

The user manually inspected `D:\obsidian\Knowledge Sync.md`.

The generated navigation is functionally working, but several readability problems were observed.

#### Problem A — HTML entities in visible titles

Examples:

- `AI&#43;Graphics`
- `&#45;`
- `&#91;`
- `&#61;`
- `&#37;`
- `&#46;`

Some YouTube titles display numeric HTML entities instead of their intended characters.

Similar issues may exist in Facebook and collection navigation.

Determine whether these representations originate in:

- Original provider metadata
- SQLite stored values
- Markdown rendering
- Markdown link-label escaping
- Collection or navigation rendering
- Obsidian Live Preview
- Obsidian Reading View

Do not assume that the importer is responsible.

Compare the same representative title through the complete pipeline:

Provider/normalized metadata → KnowledgeItem → SQLite → Markdown → Obsidian

Identify the exact transformation stage where the display changes.

Distinguish source-title decoding from output-context escaping.

Determine why any existing escaping produces literal visible entities instead of the intended text.

Recommend a correction compatible with Obsidian's Markdown parsing and links.

Do not globally decode HTML entities without considering safety, double decoding, and untrusted source content.

#### Problem B — Navigation readability

The current `Knowledge Sync.md` contains:

- One combined Collections section
- One large `All items` section
- Both YouTube and Facebook content
- More than 300 items

This is functional but difficult to scan.

Evaluate a more readable navigation structure.

Conceptual example:

Knowledge Sync

YouTube
- Collections
- All YouTube videos

Facebook Saved
- Collections
- All Facebook items

Consider:

- Clear source grouping
- Existing collection names
- Item ordering
- Long titles
- Fallback titles
- Link readability
- Large navigation pages
- Obsidian compatibility
- Deterministic generation

Compare options such as:

A. One navigation page grouped by source.

B. One root navigation page linking to separate generated source indexes.

C. Improved existing sections without additional generated files.

D. Other minimal alternatives supported by the current architecture.

Recommend the smallest useful change.

Do not introduce a new navigation framework.

#### Problem C — Encoded filenames in Obsidian sidebar

The existing canonical Markdown filenames contain encoded source identities.

These filenames may appear difficult to read in the Obsidian file explorer.

Investigate whether better human-readable navigation is possible without changing canonical filenames.

Evaluate:

- Obsidian aliases
- Display labels in Markdown links
- Generated indexes
- Existing frontmatter
- Other native Obsidian capabilities

Important:

Do not claim that aliases change the Obsidian file explorer display unless independently verified.

Canonical filenames and paths must remain stable.

Do not propose a filename migration for Task 023.

If human-readable sidebar filenames cannot be achieved safely without renaming files or installing plugins, document that limitation.

#### Problem D — Duplicate Knowledge Sync title

The user sees the document title and an additional `Knowledge Sync` heading in the content.

Investigate whether this is caused by:

- Obsidian's inline-title setting
- An explicit Markdown H1
- Navigation renderer output
- Live Preview behavior

Determine whether the preferred solution belongs in Obsidian configuration rather than generated Markdown.

Preserve ordinary Markdown compatibility outside Obsidian.

Do not change generated ownership metadata merely to hide the duplicate heading.

#### Problem E — Facebook fallback titles

Most imported Facebook items lack meaningful titles.

The verified Facebook export contained only five distinct items with explicit nonempty titles.

Current fallback convention:

`Facebook Saved — <Type> — <12-character hash>`

Evaluate improvements to readability.

Constraints:

- Preserve the existing full stable sourceId
- Do not rename Markdown files
- Do not change URL-based identities
- Do not fabricate original titles
- Do not use private Facebook APIs
- Do not scrape Facebook
- Do not fetch linked content without a separately approved design
- Do not introduce AI enrichment in this task

Consider improving presentation through:

- Shorter or clearer type labels
- Collection context
- Available verified metadata
- Better note layout
- Non-destructive display-only transformations

Determine what is possible using existing metadata.

Separate achievable improvements from enhancements requiring additional data collection.

### 5. Shared rendering architecture

Inspect how the current renderers handle:

- YouTube titles
- Facebook titles
- Collection names
- Item descriptions
- Authors
- Source URLs
- Navigation links
- Collection membership links
- Markdown and YAML escaping
- HTML entities
- Unicode and control characters

Identify duplicated rendering or escaping logic.

Determine whether reusable display-text utilities would help.

Avoid a broad refactor.

Prefer context-specific escaping over one universal transformation.

Review how formatting behaves with:

- Square brackets
- Parentheses
- Ampersands
- Plus signs
- Hyphens
- Hash characters
- Quotes
- Pipes
- Backticks
- HTML-like text
- Unicode
- Newlines
- Long titles

Ensure untrusted Facebook metadata cannot become active HTML, embedded links, or unexpected Markdown structure.

Preserve source URLs and source identities exactly.

### 6. Data and projection invariants

SQLite remains the source of truth.

Obsidian remains a derived projection.

Task 023 should primarily affect the presentation layer.

Preserve:

- KnowledgeItem identity
- Collection identity
- Membership relations
- Canonical Markdown filenames
- Ownership markers
- Existing generated-file safety
- Non-destructive Facebook import semantics
- YouTube synchronization behavior
- Deterministic output

Do not propose schema migrations unless a concrete verified blocker requires one.

Do not modify existing stored metadata merely to improve how titles are displayed.

Consider the consequences of changing generated Markdown bytes intentionally while retaining stable paths and identities.

### 7. Export ownership and regeneration

Task 021 introduced stronger Facebook file ownership protection.

Review how readability changes interact with:

- Navigation ownership
- Facebook note ownership
- Facebook collection ownership
- Legacy YouTube notes
- User-created files
- Existing collection indexes
- Atomic replacement
- Failure recovery
- Partial export failures

Any future implementation must preserve these protections.

Do not modify ownership markers or regenerate existing files during this review.

Evaluate whether presentation improvements can be applied safely through existing export commands.

Recommend a safe regeneration and verification strategy.

### 8. UX proposal

Prepare a compact proposed layout for the root `Knowledge Sync.md`.

Use a Markdown example with synthetic item names and links.

The proposal should demonstrate:

- Distinct YouTube and Facebook sections
- Readable collection links
- Readable item links
- Clear hierarchy
- Avoidance of excessively long lists where practical

Do not include actual private Facebook URLs or content.

Consider standard Obsidian functionality first.

Avoid requiring third-party themes, CSS snippets, or plugins for the MVP.

### 9. Risk assessment

Identify risks involving:

- Markdown escaping regressions
- Double-encoded text
- Broken internal links
- Unsafe Markdown injection
- Filename changes
- Loss of generated ownership protection
- Loss of user notes
- Rewriting unrelated files
- Unintended YouTube output changes
- Facebook fallback identity changes
- Performance with larger libraries
- Cross-platform Markdown compatibility

Rank findings as:

- BLOCKER
- IMPORTANT
- OPTIONAL
- VERIFIED

Explain which concerns are defects and which are UX limitations.

### 10. Testing recommendations

Propose tests for:

- Correct display of formerly entity-escaped punctuation
- Source text already containing HTML entities
- Single- versus double-encoding behavior
- Safe Markdown link labels
- Unicode
- Untrusted Facebook metadata
- Grouped navigation
- Deterministic ordering
- Large item lists
- Existing filename and identity preservation
- Existing ownership markers
- Unowned-file collisions
- Failed write recovery
- YouTube/Facebook cross-source compatibility
- Stable links after regeneration

Include temporary-vault E2E with representative YouTube and Facebook items.

If Markdown output changes intentionally, distinguish expected presentation changes from unauthorized file modifications.

Do not require old and new navigation bytes to be identical when the task intentionally changes the navigation layout.

Require idempotent regenerated output.

### 11. Proposed task scope

Recommend a realistic MVP for Task 023.

Classify improvements into:

**Must have**

Fixes essential to basic readability and safe navigation.

**Should have**

Moderate UX improvements with low architectural risk.

**Deferred**

Improvements needing extra metadata, plugins, API integration, schema changes, or major redesign.

Evaluate whether Facebook fallback-title enrichment should remain separate from the first readability MVP.

Avoid expanding Task 023 into a general metadata enrichment project.

### 12. Required report

Return:

1. Executive conclusion
2. Root-cause findings for HTML entities
3. Actual relevant source files and implementation paths
4. YouTube versus Facebook rendering differences
5. Current navigation limitations
6. Proposed improved navigation layout
7. Encoded filename/sidebar findings
8. Duplicate-heading analysis
9. Safe display-text strategy
10. Facebook fallback-title options and limitations
11. Ownership and compatibility impact
12. Minimal recommended implementation scope
13. Test strategy
14. Risks and blockers
15. Decisions required before implementation
16. Final verdict: READY FOR SPECIFICATION or NEED MORE INVESTIGATION

Cite concrete repository files and functions.

Separate verified repository behavior from assumptions about Obsidian UI.

Provide one preferred architecture with a rationale, not merely a list of possibilities.

### 13. Constraints

This is a read-only architecture review.

Do not:

- Implement code
- Modify SQLite
- Modify real Obsidian files
- Regenerate notes
- Create migrations
- Change filenames
- Install dependencies
- Add plugins
- Modify repository files
- Commit or push

Read-only inspection of relevant generated files is permitted where necessary, but do not collect, expose, or print unrelated private vault content or Facebook URLs.

Return the findings in the Codex conversation.

Wait for explicit authorization before implementation.