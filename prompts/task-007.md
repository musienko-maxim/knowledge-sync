# Task 007 — Sync Item Classification

## Status

IMPLEMENTED — 2026-09-28

Validation and implementation details: [session handoff](../docs/SESSION_HANDOFF.md).

## Accepted review clarifications

- Compare all six current persisted non-identity fields: `url`, `title`,
  `description`, `author`, `collection`, and `publishedAt`.
- Omitted optional fields and explicit `undefined` are equivalent. Empty strings
  remain distinct from absence. SQL NULL is mapped to omitted domain fields;
  do not add nullable fields to the domain.
- Compare `publishedAt` as its exact persisted string. Different timezone or
  precision representations count as changed even when they denote the same
  instant; do not add date normalization.
- The current domain has no structured metadata, so structured-comparison
  requirements are inapplicable and no deep-comparison utility is needed.
- Repeating a batch containing different versions of the same identity can
  still produce changed entries. Each lookup observes earlier writes, including
  writes from the current invocation; do not assume a repeated batch is unchanged.

## Goal

Extend the existing application-level `sync()` operation so that every collected `KnowledgeItem` is classified as exactly one of:

- `new`
- `changed`
- `unchanged`

The classification must be based on the current persisted state for the item's existing identity:

```text
(source, sourceId)
```

Task 007 is an application-layer enhancement.

It must not redesign collection membership, account-wide sync, CLI composition, repository identity, or persistence semantics established by Tasks 001–006.

---

# Existing architecture

Already implemented and accepted:

## Task 001

- project foundation
- domain model
- CLI bootstrap
- SQLite/Drizzle storage foundation

## Task 002

- YouTube public playlist collector
- playlist ID/URL parsing
- pagination
- normalized `KnowledgeItem[]`
- API-key collection

## Task 003

- Google OAuth Desktop flow
- PKCE
- token persistence outside repository
- token refresh
- owned playlist discovery
- OAuth collection
- refresh-error classification

## Task 004

`KnowledgeItemRepository` provides:

```ts
findByIdentity(source, sourceId)
upsert(item)
```

Identity is:

```text
(source, sourceId)
```

For YouTube:

```text
source = youtube
sourceId = videoId
```

SQLite/Drizzle persistence and row/domain mapping already exist.

## Task 005

Application operation:

```ts
sync(
  collector,
  repository,
): Promise<SyncResult>
```

Current semantics include:

- collector called once;
- complete collection before persistence;
- sequential processing;
- source order preserved;
- every collected item processed;
- duplicates processed and counted;
- awaited repository writes;
- errors propagate unchanged;
- earlier successful writes remain after later failure;
- no rollback;
- missing items are not deleted.

Current result includes:

```ts
{
  processed: number;
}
```

## Task 006

Manual CLI composition exists:

```text
youtube sync <playlist>
```

and already composes:

```text
YouTubeCollector
      ↓
sync()
      ↓
KnowledgeItemRepository
      ↓
SQLite
```

Task 007 must reuse this architecture rather than introducing another synchronization path.

---

# Required behavior

For each collected item, `sync()` must:

```text
1. find existing item by identity
2. classify incoming item
3. upsert incoming item
4. continue sequentially
```

Conceptually:

```ts
const existing = await repository.findByIdentity(
  item.source,
  item.sourceId,
);

const classification = classify(existing, item);

await repository.upsert(item);
```

Do not move classification into the CLI.

Do not make the YouTube collector responsible for classification.

Do not make SQLite-specific code responsible for application-level classification.

---

# Classification rules

Every successfully processed collected item must receive exactly one classification.

## new

An item is `new` when:

```ts
await repository.findByIdentity(
  item.source,
  item.sourceId,
)
```

returns no existing item.

Conceptually:

```text
existing item absent
    ↓
new
```

---

## unchanged

An item is `unchanged` when:

1. an item with the same `(source, sourceId)` already exists; and
2. its persisted domain state is semantically equivalent to the incoming item.

Identity itself does not make an item changed.

---

## changed

An item is `changed` when:

1. an item with the same `(source, sourceId)` already exists; and
2. at least one persisted non-identity field differs semantically.

Conceptually:

```text
same identity
+
different persisted state
    ↓
changed
```

---

# What must be compared

Before implementing comparison logic, inspect:

- the actual `KnowledgeItem` domain type;
- SQLite/Drizzle mapping;
- `KnowledgeItemRepository` behavior;
- nullable/optional-field normalization.

Comparison must be based on the actual persisted `KnowledgeItem` state.

Do not invent a manually selected subset such as:

```text
only title and author matter
```

unless that is already part of the established domain contract.

The general rule is:

> Compare all persisted non-identity `KnowledgeItem` fields.

Identity fields:

```text
source
sourceId
```

are used to locate the existing item and are not themselves change fields.

---

# Persisted-state equivalence

Classification must reflect the state that the repository actually persists, not accidental JavaScript representation differences.

Examples of accidental differences that must not produce false `changed` classifications include equivalent persisted representations caused by existing repository normalization.

For nullable/optional fields, follow the existing Task 004 persistence contract.

For example, if an optional value is canonically persisted and read back as `null`, an equivalent absent incoming value must not cause every later sync to appear changed solely because one side is represented as `undefined` and the other as `null`.

Do not redesign the domain model merely to solve comparison.

Use the smallest normalization/equality mechanism consistent with the existing persistence contract.

---

# Structured metadata equality

If `KnowledgeItem` contains persisted structured metadata, comparison must use structural/semantic equality rather than JavaScript reference equality.

Incorrect:

```ts
existing.metadata === incoming.metadata
```

when both contain equivalent independently created objects.

Equivalent objects must compare equal even if they are different object instances.

Object property insertion order alone must not produce `changed`.

For JSON-like values:

- object key order is not semantically significant;
- array order remains significant;
- primitive values must compare according to their actual persisted meaning.

Do not introduce a large generic deep-comparison library unless necessary.

Prefer a small project-local solution consistent with the actual `KnowledgeItem` shape.

---

# SyncResult

Extend the existing `SyncResult`.

It must retain:

```ts
processed: number
```

and add classification counters.

Required conceptual result:

```ts
type SyncResult = {
  processed: number;
  new: number;
  changed: number;
  unchanged: number;
};
```

Equivalent naming may be used only if required by an existing project convention, but the three classifications must remain clearly represented.

Do not remove or change the meaning of:

```ts
processed
```

---

# Result invariant

For every successfully completed sync:

```text
processed === new + changed + unchanged
```

Every processed item belongs to exactly one classification.

Example:

```ts
{
  processed: 42,
  new: 10,
  changed: 4,
  unchanged: 28,
}
```

---

# Persistence semantics remain unchanged

Task 007 adds observation/classification.

It must not optimize away existing persistence operations.

Every collected item must still receive:

```ts
repository.upsert(item)
```

including an `unchanged` item.

Therefore:

```text
unchanged
   ↓
upsert()
```

is expected behavior in Task 007.

Do NOT add:

```ts
if (classification === "unchanged") {
  continue;
}
```

or equivalent write-skipping behavior.

The purpose of Task 007 is classification, not persistence optimization.

This preserves Task 005 semantics.

---

# Processing order

Processing remains sequential and source ordered.

For each item:

```text
find current persisted state
        ↓
classify
        ↓
upsert
        ↓
next item
```

Do not classify all items against a single database snapshot taken before persistence.

Each item must be classified relative to the repository state at the moment that item is processed.

---

# Duplicate identities in one collection

Existing Task 005 behavior requires duplicates to remain processed.

Task 007 must give deterministic classification to duplicates.

Example with initially empty storage:

```text
incoming #1:
A title="One"

incoming #2:
A title="One"
```

Expected sequence:

```text
A #1:
no existing item
→ new
→ upsert

A #2:
existing item now matches
→ unchanged
→ upsert
```

Result:

```text
processed = 2
new = 1
changed = 0
unchanged = 1
```

---

Another example:

```text
incoming #1:
A title="One"

incoming #2:
A title="Two"
```

Expected:

```text
A #1 → new
A #2 → changed
```

Result:

```text
processed = 2
new = 1
changed = 1
unchanged = 0
```

This behavior follows naturally from sequential repository reads and writes.

Do not deduplicate the collected array before processing.

---

# Existing item followed by duplicates

Suppose storage initially contains:

```text
A title="Old"
```

Input:

```text
A title="New"
A title="New"
```

Expected:

```text
first A
Old → New
→ changed
→ upsert

second A
New → New
→ unchanged
→ upsert
```

Result:

```text
processed = 2
new = 0
changed = 1
unchanged = 1
```

This confirms that classification observes state produced by earlier items in the same sync invocation.

---

# Error behavior

Existing Task 005 failure semantics remain unchanged.

Errors from:

```ts
collector.collect()
repository.findByIdentity()
repository.upsert()
```

must propagate.

Do not wrap them in a new generic `SyncError`.

Do not add rollback.

Do not return a partial successful `SyncResult` after failure.

If:

```text
item 1 → successful
item 2 → successful
item 3 → failure
```

then:

- writes from items 1 and 2 remain;
- the error propagates;
- no final `SyncResult` is returned.

---

# Counter semantics

Classification counters describe successfully processed items in a successfully completed `sync()` result.

A final result is returned only when the operation completes successfully.

Keep counter updates consistent with successful sequential processing.

Do not introduce partial-result reporting on errors.

---

# Collector behavior must remain unchanged

Task 007 must preserve:

```text
collector.collect()
```

being invoked exactly once.

The entire collection must still complete before repository persistence begins.

Do not change the operation into streaming collection.

Do not interleave external collection/pagination with database writes if Task 005 currently guarantees complete collection first.

---

# Repository boundary

Use the existing:

```ts
findByIdentity(source, sourceId)
```

and:

```ts
upsert(item)
```

contracts.

Do not add a repository method such as:

```ts
classify()
```

or:

```ts
upsertAndClassify()
```

unless inspection proves an unavoidable architectural requirement.

Classification belongs to the application layer because it describes sync behavior rather than SQLite behavior.

No new DB query API should be necessary for this task.

---

# CLI behavior

Do not redesign Task 006 CLI output in Task 007.

The existing successful output may remain:

```text
Processed N items.
```

even though `SyncResult` now contains additional counters.

Do not require:

```text
New: ...
Changed: ...
Unchanged: ...
```

as part of Task 007.

CLI reporting of classifications can be considered separately later.

Update CLI-related types/tests only where required because `SyncResult` has been extended.

---

# Known collection limitation

`KnowledgeItem.collection` remains singular.

Same video in different playlists may overwrite collection context under current identity semantics.

This is an accepted existing limitation.

Task 007 must NOT redesign this.

If `collection` is a persisted non-identity field, then a change to its persisted value must follow the same classification rules as other persisted state.

Do not special-case it merely to work around the known multi-playlist limitation.

---

# Explicit non-goals

Do NOT implement any of the following in Task 007:

- account-wide YouTube sync;
- automatic owned-playlist synchronization;
- multi-playlist orchestration;
- multiple collections per item;
- `KnowledgeItem.collection` redesign;
- collection membership tables;
- identity redesign;
- deletion reconciliation;
- removal detection;
- deletion of missing items;
- `lastSeenAt`;
- `firstSeenAt`;
- change timestamps;
- change history;
- audit log;
- version history;
- event sourcing;
- rollback;
- whole-sync transactions;
- write-skipping optimization;
- batch persistence optimization;
- concurrent upserts;
- parallel processing;
- streaming collection;
- CLI classification reporting redesign;
- Markdown rendering;
- Obsidian output;
- Facebook support;
- AI classification;
- scheduler/background service;
- Git automation;
- new generic repository framework;
- new generic comparison library unless clearly necessary.

---

# Architectural boundary

After Task 007, the flow should remain:

```text
Collector
   ↓
KnowledgeItem[]
   ↓
sync()
   │
   ├── repository.findByIdentity()
   │          ↓
   │      classification
   │     ┌────┼─────────┐
   │     ↓    ↓         ↓
   │    new changed unchanged
   │
   └── repository.upsert()
              ↓
          Repository
              ↓
            SQLite
```

Classification belongs to:

```text
application layer
```

not:

```text
CLI
collector
SQLite adapter
YouTube infrastructure
```

---

# Tests

Follow existing repository test conventions.

Add focused coverage for classification behavior.

## New item

Initial repository:

```text
empty
```

Incoming item:

```text
A
```

Expected:

```text
processed = 1
new = 1
changed = 0
unchanged = 0
```

Verify the item is still upserted.

---

## Unchanged item

Initial repository contains an item semantically identical to incoming `A`.

Expected:

```text
processed = 1
new = 0
changed = 0
unchanged = 1
```

Verify `upsert(A)` still occurs.

---

## Changed item

Initial repository contains the same identity with different persisted state.

Expected:

```text
processed = 1
new = 0
changed = 1
unchanged = 0
```

Verify incoming state is upserted.

---

# Persisted-field coverage

Inspect the actual `KnowledgeItem` fields.

Add enough tests to verify that changes in persisted non-identity state are detected.

Do not assume only `title` matters.

Where practical, test representative persisted fields individually.

Include nullable/optional values where applicable.

Important transitions include semantically meaningful cases such as:

```text
null/absent → value
value → null/absent
value A → value B
```

according to actual domain/persistence normalization.

---

# Structured metadata tests

If persisted metadata is structured, test:

```text
same semantic object
different object instances
→ unchanged
```

Test object key-order differences if relevant:

```text
{ a: 1, b: 2 }

vs

{ b: 2, a: 1 }

→ unchanged
```

Test an actual metadata value change:

```text
→ changed
```

If arrays are part of persisted metadata, preserve array-order semantics unless the existing domain contract explicitly says otherwise.

---

# Mixed batch

Test one sync containing a mixture of:

- new;
- changed;
- unchanged.

Verify exact counters and:

```text
processed === new + changed + unchanged
```

---

# Duplicate identity tests

Cover at least:

```text
new → unchanged
```

and:

```text
new → changed
```

within a single sync invocation.

Also cover, where useful:

```text
changed → unchanged
```

for an item that already existed before the sync.

---

# Ordering tests

Verify sequential operation order remains observable.

For each item, expected logical order is:

```text
findByIdentity
classify
upsert
```

before moving to the next item.

Do not allow implementation to perform all finds first and all writes afterward if that changes duplicate classification semantics.

---

# Existing Task 005 regression coverage

Ensure Task 005 guarantees remain true:

- collector called once;
- complete collection before persistence;
- source order preserved;
- sequential awaited writes;
- duplicate items counted;
- every item upserted;
- errors propagate unchanged;
- earlier writes remain after later failures;
- missing stored items are not deleted;
- no rollback.

Adjust existing test expectations only where required by the additional `findByIdentity()` calls and expanded `SyncResult`.

Do not weaken previous tests merely to accommodate the implementation.

---

# Failure tests

Add/retain coverage for:

```text
findByIdentity failure
```

Expected:

- error propagates;
- current item is not upserted after failed lookup.

Add/retain coverage for:

```text
upsert failure
```

Expected:

- error propagates;
- earlier successful writes remain;
- later items are not processed.

Collector failure behavior remains unchanged.

---

# Integration tests

Use real repository + temporary SQLite where existing project conventions make this useful.

At minimum verify realistic persistence behavior for:

```text
new
→ later unchanged
→ later changed
```

across successive calls to `sync()`.

Example:

```text
sync #1
A title="One"
→ new

sync #2
A title="One"
→ unchanged

sync #3
A title="Two"
→ changed
```

Use no external YouTube network access.

Task 007 is about application/persistence semantics, not YouTube API behavior.

---

# Documentation

Update relevant documentation to describe the extended `SyncResult` and classification semantics.

Update:

```text
docs/SESSION_HANDOFF.md
```

with the final Task 007 state and validation results.

Do not document deletion/reconciliation or account-wide behavior as implemented.

---

# Repository workflow

Before implementation:

1. Read `AGENTS.md`.
2. Read `docs/SESSION_HANDOFF.md`.
3. Read `docs/AGENT_WORKFLOW.md`.
4. Read this task file completely.
5. Run:

```powershell
git status --short
```

6. Preserve unrelated uncommitted changes.
7. Inspect:
   - `KnowledgeItem`;
   - repository interface;
   - repository/domain mapping;
   - current `sync()`;
   - Task 005 tests;
   - Task 006 integration with `SyncResult`.

Use:

- `ks_explorer`
- `ks_implementer`
- `ks_reviewer`

only as needed.

Use `$ks-verify` for final validation.

Do not commit or push unless explicitly requested.

---

# Validation

Run repository-standard validation.

At minimum ensure:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

and relevant CLI startup/help smoke checks pass.

Use `$ks-verify` for final verification.

Report:

- files added;
- files changed;
- tests added/changed;
- focused test result;
- full-suite result;
- intentional skips;
- typecheck result;
- build result;
- CLI smoke result;
- independent review findings;
- any deviations from this task.

---

# Acceptance criteria

Task 007 is complete when:

1. `sync()` classifies every successfully processed item as exactly one of:
   - `new`
   - `changed`
   - `unchanged`.

2. Classification uses current repository state retrieved through:

```ts
findByIdentity(source, sourceId)
```

3. Missing identity is classified as `new`.

4. Existing semantically equivalent persisted state is classified as `unchanged`.

5. Existing identity with different persisted non-identity state is classified as `changed`.

6. Comparison covers the actual persisted `KnowledgeItem` state rather than an arbitrary field subset.

7. Existing nullable/optional normalization does not create false changes.

8. Structured metadata uses semantic/structural equality where applicable.

9. `SyncResult` retains `processed`.

10. `SyncResult` exposes counts for:
    - `new`
    - `changed`
    - `unchanged`.

11. Successful results satisfy:

```text
processed === new + changed + unchanged
```

12. Every collected item is still passed to `upsert()`, including `unchanged` items.

13. Collector is still invoked once.

14. Complete collection still happens before persistence begins.

15. Processing remains sequential.

16. Source order remains preserved.

17. Duplicate identities are not deduplicated.

18. Duplicate classifications observe state written earlier during the same sync.

19. `findByIdentity()` errors propagate.

20. `upsert()` errors propagate.

21. Earlier successful writes remain after a later failure.

22. No rollback is introduced.

23. Missing stored items are not deleted.

24. No deletion/reconciliation behavior is introduced.

25. No account-wide or multi-playlist orchestration is introduced.

26. `KnowledgeItem.collection` is not redesigned.

27. Identity remains `(source, sourceId)`.

28. Task 006 CLI composition remains functional.

29. CLI classification output redesign is not required.

30. Focused tests pass.

31. Full test suite passes except intentional existing skips.

32. Typecheck passes.

33. Build passes.

34. CLI startup/help smoke passes.

35. `docs/SESSION_HANDOFF.md` records the completed state and validation.

36. No unrelated changes are introduced.

37. No commit or push is performed.
