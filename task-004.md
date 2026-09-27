Project: `knowledge-sync`
Path: `D:\codex\knowledge-sync`

Implement Task 004: persistence of normalized `KnowledgeItem` objects in SQLite.

This task adds only the persistence boundary and SQLite-backed repository for `KnowledgeItem`.

Do not implement sync orchestration yet.

## Context

Existing project stack:

- Node.js
- TypeScript
- Commander CLI
- SQLite
- Drizzle ORM
- Zod
- Vitest

Existing completed functionality:

- Task 001: project bootstrap, domain model, CLI, SQLite foundation
- Task 002: YouTube public playlist collector
- Task 003: Google OAuth account access and authenticated YouTube collection

Collectors currently produce normalized:

```ts
KnowledgeItem[]
```

The current identity rule is:

```text
source + sourceId
```

For YouTube:

```text
source = "youtube"
sourceId = videoId
```

Task 004 must persist normalized domain items locally.

## Primary architecture

Implement this boundary:

```text
KnowledgeItem
    ↓
KnowledgeItemRepository
    ↓
SQLite / Drizzle
```

The repository must not know about:

- YouTube playlists
- OAuth
- CLI commands
- Obsidian
- Markdown
- AI
- synchronization scheduling

Likewise, collectors must remain independent from SQLite.

## Required scope

### 1. Define a repository contract

Introduce a narrow domain/application-facing repository interface for `KnowledgeItem`.

The exact location should follow the project's existing organization and naming conventions.

Conceptually it should support at least:

```ts
interface KnowledgeItemRepository {
  findByIdentity(
    source: KnowledgeItem["source"],
    sourceId: string,
  ): Promise<KnowledgeItem | null>;

  upsert(item: KnowledgeItem): Promise<void>;
}
```

Adjust exact types if the existing domain model already exposes a better source type.

Do not add generic CRUD methods that are not currently required.

Avoid interfaces such as:

```ts
save()
deleteAll()
findEverything()
updateWhatever()
```

unless clearly justified by current requirements.

### 2. SQLite schema

Persist the normalized `KnowledgeItem`.

Inspect the current `KnowledgeItem` type before designing the table.

Persist all fields that are part of the normalized domain representation and are required to reconstruct a `KnowledgeItem`.

Do not invent future AI/Obsidian fields.

The database must enforce uniqueness of:

```text
(source, sourceId)
```

This identity must be protected at the database level with a unique constraint/index, not only in application code.

### 3. SQLite repository implementation

Implement a Drizzle-backed repository.

Required behavior:

#### findByIdentity

Given:

```text
source + sourceId
```

return:

```ts
KnowledgeItem
```

or:

```ts
null
```

if no record exists.

#### upsert

If identity does not exist:

```text
INSERT
```

If the same identity already exists:

```text
UPDATE normalized stored fields
```

The operation should be deterministic and idempotent for identical input.

Calling:

```ts
upsert(item)
upsert(item)
```

must not create duplicate rows.

### 4. Preserve domain types

Do not leak raw database row shapes into the rest of the application.

Keep a clear mapping:

```text
DB row ↔ KnowledgeItem
```

If dates are represented differently in SQLite than in the domain model, conversion must happen inside the persistence boundary.

Do not change `KnowledgeItem` merely to make database storage easier unless there is a strong architectural reason.

### 5. Database lifecycle

Reuse the existing database/Drizzle infrastructure created in Task 001.

Do not introduce a second SQLite connection abstraction if one already exists.

Follow the project's existing schema/migration strategy.

If schema changes require a migration, add the minimal migration needed.

Do not redesign the whole database layer.

## Tests

Add focused tests for the repository.

At minimum test:

### Insert

```text
repository.upsert(item)
repository.findByIdentity(...)
→ returns equivalent KnowledgeItem
```

### Idempotency

```text
repository.upsert(item)
repository.upsert(item)
```

must result in one logical record.

### Update

Given the same:

```text
source + sourceId
```

but changed normalized fields, for example title or metadata:

```text
upsert(original)
upsert(updated)
```

then:

```text
findByIdentity(...)
```

must return the updated representation.

### Identity isolation

Items with different identities must remain separate.

Examples:

```text
youtube + videoA
youtube + videoB
```

and if the domain allows multiple source types:

```text
sourceA + sameId
sourceB + sameId
```

must not collide.

### Missing item

Unknown identity:

```ts
findByIdentity(...)
```

returns:

```ts
null
```

### Optional/null fields

If `KnowledgeItem` has optional or nullable fields, verify round-trip behavior.

Do not silently convert:

```text
undefined ↔ null
```

in a way that violates the existing domain contract.

## Important non-goals

Do NOT implement:

- collector → repository orchestration
- sync service
- sync CLI command
- playlist-wide synchronization
- deletion/removal detection
- reconciliation states such as new/changed/unchanged
- Markdown rendering
- Obsidian output
- filesystem writes for knowledge items
- Facebook
- AI classification
- scheduler
- automatic Git operations
- automatic retries
- background synchronization

Task 004 stops at:

```text
KnowledgeItem ↔ repository ↔ SQLite
```

## Architectural constraints

Collectors must continue to work without SQLite.

Bad:

```ts
class YouTubeCollector {
  constructor(private db: Database) {}
}
```

Good:

```text
Collector → KnowledgeItem[]
```

independent of persistence.

Do not make `YouTubeCollector` call the repository.

The future orchestration layer will connect them in a separate task.

## Error handling

Follow existing project error conventions.

Do not swallow SQLite/Drizzle failures.

Persistence-specific failures should retain useful causes where practical.

Do not add a large new error hierarchy for this task unless the project already uses one.

## CLI

Do not add a new CLI command for Task 004 unless an existing Task 001 persistence command already requires updating.

This task is primarily an internal architecture/persistence capability.

## Documentation

Update documentation only where necessary to accurately reflect that `KnowledgeItem` persistence is now implemented.

Do not claim that synchronization or Obsidian output is implemented.

If README contains a planned architecture section such as:

```text
collection → normalization → persistence → output
```

update only the implementation-status wording where appropriate.

## Validation

After implementation run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Use the actual script names from `package.json` if they differ.

Also run relevant focused repository tests.

Review the final diff for unrelated changes.

Do not commit or push.

## Final report

Report:

1. Files added/changed.
2. Repository interface and its location.
3. Database schema/table changes.
4. Exact unique identity constraint used.
5. How DB rows map to/from `KnowledgeItem`.
6. Upsert semantics.
7. Migration/schema strategy used.
8. Tests added.
9. Focused and full validation results.
10. Any design decisions or ambiguities discovered.
11. Confirmation that no sync orchestration, CLI sync command, Markdown, or Obsidian output was added.

Keep the implementation minimal and within Task 004 scope.
