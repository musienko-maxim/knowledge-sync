---
name: ks-persistence
description: Implement or review knowledge-sync domain identity and SQLite/Drizzle persistence, including row mapping and storage regression tests. Use only for an explicitly assigned storage or domain task.
---

# Knowledge-sync persistence

Read the exact assigned specification and [AGENTS.md](../../../AGENTS.md).
Use [the workflow](../../../docs/AGENT_WORKFLOW.md) for file ownership. Inspect
the current code before assuming a repository interface or migration exists:

- [KnowledgeItem](../../../src/core/models/knowledge-item.ts): source-independent
  Zod schema; identity is `source + sourceId`. Sources are non-empty strings, not
  a YouTube-only enum. `publishedAt` is an ISO string with timezone; optional
  fields permit absence, not arbitrary database nulls.
- [Storage contract](../../../src/storage/storage.ts) and
  [SQLite lifecycle](../../../src/storage/sqlite/storage.ts): `openStorage`
  currently owns the better-sqlite3 connection, bootstrap DDL, Drizzle adapter,
  and close/error cleanup.
- [Schema](../../../src/storage/sqlite/schema.ts) and
  [storage tests](../../../tests/storage.test.ts): current import-state identity
  and original import metadata must remain stable.

Keep task-requested normalized-item persistence distinct from import-state
tracking. The current import record uses conflict-do-nothing semantics; do not
silently replace that with domain-item update semantics. A future domain
repository must not mark an item imported just because it was collected/stored.
The task specification must authorize any expansion beyond synchronization state.

Reuse the existing connection/lifecycle and schema strategy. Keep Drizzle rows
inside storage and map explicitly to the domain. Convert SQL NULL to omitted
optional fields when the domain requires that; preserve empty strings. Avoid
lossy date conversion and timestamps that change on identical input. Protect
identity in SQLite itself. Do not introduce collector calls, sync commands,
Markdown, or a second connection framework as part of storage work.

For changes that add upserts, test insertion, identical repeated input, updates
and removal of optional metadata, different sources sharing an ID, different IDs
sharing a source, and missing records. Exercise actual SQLite constraints, not
only mocked repository calls. For lifecycle/schema changes, also verify reopening
a temporary file and compatibility with existing import metadata. Use in-memory
or isolated temporary databases, never the user's database or vault.

Run focused storage/domain tests and hand final validation to the assigned owner
using [ks-verify](../ks-verify/SKILL.md). Report identity, mapping, migration, and
upsert decisions with any remaining ambiguity; do not implement the next layer.
