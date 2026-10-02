# Task 012 — Batch / multi-item Obsidian export

Project:

`D:\codex\knowledge-sync`

## Context

Tasks 001–011 are completed and accepted.

The current single-item Obsidian export pipeline is:

```text
KnowledgeItem
    ↓
exportObsidianNote()
    ├── buildObsidianRelativePath()
    ├── renderKnowledgeItemMarkdown()
    └── writeObsidianNote()
            ↓
        Markdown file
```

Task 011 introduced:

```ts
exportObsidianNote(
  vaultPath: string,
  item: KnowledgeItem,
): Promise<void>
```

in:

```text
src/outputs/obsidian/export-note.ts
```

Task 011 is validated and accepted:

```text
155 focused tests
511 full-suite tests passed
1 expected Windows skip
typecheck passed
build passed
CLI startup/help passed
ks-verify passed
independent review clean
```

No dependencies were added.

Do not redesign or duplicate the single-item export pipeline.

---

# Goal

Add a batch/multi-item Obsidian exporter that exports a readonly collection of `KnowledgeItem`s sequentially, in input order, using the existing `exportObsidianNote()` function for every item.

The batch exporter must use best-effort semantics:

- individual item failures are captured;
- processing continues with later items;
- successful exports remain successful;
- the batch returns explicit statistics and failure details.

---

# Required API

Add:

```ts
exportObsidianNotes(
  vaultPath: string,
  items: readonly KnowledgeItem[],
): Promise<ObsidianBatchExportResult>
```

Use an appropriate file under:

```text
src/outputs/obsidian/
```

Prefer a simple name consistent with the existing structure, for example:

```text
export-notes.ts
```

Do not rename or change the existing `export-note.ts` contract.

---

# Result contract

Use:

```ts
export interface ObsidianExportFailure {
  readonly index: number;
  readonly item: KnowledgeItem;
  readonly error: unknown;
}

export interface ObsidianBatchExportResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failures: readonly ObsidianExportFailure[];
}
```

The exact export placement of these interfaces may remain in the batch exporter file unless the existing project structure clearly justifies another location.

Do not introduce a separate abstraction solely for these types unless necessary.

---

# Required semantics

## Sequential processing

Process items strictly in the original input order.

Equivalent behavioral model:

```ts
for (...) {
  await exportObsidianNote(vaultPath, item);
}
```

The next item must not begin exporting until the previous item's `exportObsidianNote()` call has settled.

Do not use:

```ts
Promise.all(...)
Promise.allSettled(...)
```

or any other concurrent execution strategy.

---

## Best-effort behavior

For each item:

```ts
try {
  await exportObsidianNote(vaultPath, item);
} catch (error) {
  // record failure and continue
}
```

An individual export failure must not stop processing of later items.

Example:

```text
item 0 → success
item 1 → failure
item 2 → success
```

must produce:

```text
processed = 3
succeeded = 2
failed = 1
```

and item 2 must actually be exported.

---

# Error semantics

Capture the original thrown value without transforming it.

For a failed item, record:

```ts
{
  index,
  item,
  error,
}
```

Requirements:

- `index` is zero-based and corresponds to the item's original position in `items`;
- `item` is the original `KnowledgeItem`;
- `error` is the exact value thrown by `exportObsidianNote()`;
- do not wrap it in another `Error`;
- do not convert it to a string;
- do not require `error instanceof Error`;
- keep the type as `unknown`.

Individual `exportObsidianNote()` failures must be represented in the returned result rather than causing the entire batch to reject.

Do not make an unnecessary global guarantee that the function can never reject for unrelated programming/runtime failures outside the per-item export call.

---

# Statistics invariants

For a normally completed batch:

```ts
result.processed === items.length
result.processed === result.succeeded + result.failed
result.failed === result.failures.length
```

For empty input:

```ts
[]
```

return:

```ts
{
  processed: 0,
  succeeded: 0,
  failed: 0,
  failures: [],
}
```

Do not throw for an empty collection.

---

# Input behavior

The batch exporter must:

- accept `readonly KnowledgeItem[]`;
- not mutate the input array;
- not mutate individual `KnowledgeItem`s;
- preserve caller-provided order;
- not sort;
- not deduplicate.

If the same item appears multiple times, export it multiple times.

Example:

```ts
[itemA, itemA, itemB]
```

must result in three calls to `exportObsidianNote()`.

---

# Delegation requirement

The batch layer must reuse:

```ts
exportObsidianNote()
```

for every item.

Do not duplicate the Task 011 pipeline inside the batch exporter.

The batch exporter should not directly reimplement calls to:

```ts
buildObsidianRelativePath()
renderKnowledgeItemMarkdown()
writeObsidianNote()
```

The intended architecture is:

```text
exportObsidianNotes()
        ↓
for each KnowledgeItem
        ↓
exportObsidianNote()
        ↓
buildObsidianRelativePath()
renderKnowledgeItemMarkdown()
writeObsidianNote()
```

The batch layer owns only orchestration, ordering, failure collection and statistics.

---

# Interaction with existing components

## Existing writer / path builder / renderer

Do not change the contracts or behavior introduced by Tasks 008–011 unless an actual implementation blocker is discovered.

In particular, Task 012 must not introduce new logic for:

- filename/path generation;
- Markdown rendering;
- filesystem write semantics;
- collision resolution.

---

## sync()

Do not integrate Task 012 into `sync()`.

Keep these flows independent for now:

```text
Collector
   ↓
sync()
   ↓
Repository
```

and:

```text
KnowledgeItem[]
   ↓
exportObsidianNotes()
   ↓
Obsidian vault
```

Do not:

```ts
sync(..., exporter)
```

and do not trigger Obsidian export automatically from `sync()`.

Any higher-level orchestration between sync and export is outside Task 012.

---

## CLI

Do not add or modify CLI commands for batch Obsidian export in this task.

Do not add CLI formatting or CLI-specific result types.

The API should simply be usable by a future CLI task.

---

# Tests

Add focused tests for the batch exporter.

At minimum cover:

1. empty input;
2. one successful item;
3. multiple successful items;
4. items processed in original input order;
5. strict sequential execution;
6. one failure does not prevent later items from exporting;
7. multiple failures are collected;
8. correct zero-based failure index;
9. correct item stored in each failure;
10. original thrown value is preserved unchanged;
11. correct `processed`;
12. correct `succeeded`;
13. correct `failed`;
14. `failed === failures.length`;
15. `processed === succeeded + failed`;
16. `vaultPath` is passed unchanged;
17. every item is passed unchanged to `exportObsidianNote()`;
18. duplicate items are not deduplicated;
19. input order is not sorted or transformed.

For strict sequential behavior, do not rely only on mock invocation order.

Use a controlled pending Promise/deferred mechanism so the test proves:

```text
item 0 started
item 0 still pending
item 1 has NOT started
item 0 settles
item 1 starts
```

A concurrent implementation such as `Promise.all()` must fail this test.

Also include the key behavioral scenario:

```text
item 0 → success
item 1 → throws
item 2 → success
```

and verify that item 2 was processed.

---

# Integration testing

Do not duplicate the full filesystem/path/renderer integration coverage already established by Tasks 008–011.

A small integration smoke test may be added if it fits the existing test structure naturally, but it is not required merely to retest the existing single-item pipeline.

Prefer focused orchestration tests.

---

# Non-goals

Task 012 must not add:

- concurrency;
- parallel filesystem writes;
- retries;
- rollback;
- transactional batch behavior;
- deletion;
- reconciliation;
- stale-note detection;
- filesystem scanning;
- collision detection or resolution;
- changed/unchanged detection;
- output diffing;
- progress callbacks;
- logging frameworks;
- CLI commands;
- sync integration;
- automatic playlist discovery;
- new persistence/schema behavior;
- Task 013 work.

Do not classify exports as:

```text
new
changed
unchanged
```

The existing writer semantics remain unchanged.

---

# Compatibility

Preserve all accepted behavior from Tasks 001–011.

Do not modify unrelated existing user changes.

Do not add dependencies unless absolutely necessary; none should be needed for this task.

Do not commit or push.

---

# Documentation

Update only the documentation necessary to reflect the new batch export API and its semantics.

Update:

```text
README.md
```

and relevant Obsidian output documentation if the project currently documents output APIs there.

Update:

```text
docs/SESSION_HANDOFF.md
```

with the factual final state of Task 012.

Do not document future Task 013 implementation as completed.

---

# Validation

Run the relevant focused tests, then the complete existing validation expected by the project.

At minimum:

```text
focused Task 012 tests
full test suite
typecheck
build
CLI startup/help checks
ks-verify checks
```

Preserve the existing intentional Windows skip if still applicable.

Run an independent review after implementation if that workflow remains available.

---

# Completion report

When finished, report:

- files added;
- files modified;
- final API;
- exact batch semantics;
- exact failure semantics;
- focused test count/result;
- full-suite result;
- expected skips;
- typecheck result;
- build result;
- CLI startup/help result;
- ks-verify result;
- independent review result;
- whether dependencies changed;
- whether any specification deviations were necessary;
- confirmation that no commits/pushes were performed;
- confirmation that Task 013 was not started.

If you discover an architectural conflict with existing code, stop before redesigning accepted Tasks 008–011 and report the conflict with the smallest viable options.
-----------
## Success semantics

Batch statistics are entry-based and describe the outcome of individual `exportObsidianNote()` calls.

A successful entry means:

```text
the corresponding exportObsidianNote() call resolved successfully
```

It does **not** mean:

- a unique output file was created;
- that file still contains that entry's content after the whole batch completes;
- the batch is atomic;
- an earlier successful write cannot later be overwritten or affected by another input entry.

Counters apply to input entries, not unique destination paths.

For example, if two input items resolve to the same destination path, both are still processed independently and counted independently according to their individual export-call outcomes.

Existing writer overwrite and non-atomic filesystem semantics remain unchanged.

The batch layer must not add collision detection, transactional writes, rollback, or destination-path deduplication.


## Invalid vault semantics

Do not add global or pre-flight vault validation to the batch exporter.

Vault validation remains part of the existing single-item export/write pipeline.

For a non-empty batch, if the supplied vault path is invalid and `exportObsidianNote()` fails for each item, the batch must continue sequentially and return one failure for each affected input entry.

Example:

```text
items.length = 3
invalid vault
```

may produce:

```text
processed = 3
succeeded = 0
failed = 3
failures.length = 3
```

subject to the existing single-item exporter behavior.

For an empty batch:

```ts
items = []
```

the batch exporter must immediately return:

```ts
{
  processed: 0,
  succeeded: 0,
  failed: 0,
  failures: [],
}
```

without validating, accessing, probing, creating, or otherwise touching `vaultPath`.

Do not introduce batch-level filesystem validation.


## Additional test requirements

In addition to the previously listed tests, explicitly verify:

### Sequential behavior after asynchronous rejection

Use a deferred/pending Promise and verify that when an item eventually rejects:

```text
item 0 starts
item 0 remains pending
item 1 has not started

item 0 rejects

only after that rejection settles:
item 1 starts
```

A rejected item must therefore obey the same strict sequential boundary as a successful item.


### Batch completion boundary

Verify that the Promise returned by `exportObsidianNotes()` remains pending while the final item's export Promise remains pending.

The batch must not resolve before the final input entry has settled.


### All items fail

Verify a batch where every item fails.

For `N` input items:

```text
processed === N
succeeded === 0
failed === N
failures.length === N
```

All items must still be attempted sequentially.


### Non-Error thrown values

Verify that thrown values which are not `Error` instances are retained exactly.

Examples may include:

```ts
"failure"
123
{ code: "TEST" }
```

Do not normalize or wrap these values.

Use identity checks where appropriate.


### Item reference identity

For a failed item:

```ts
failure.item === originalItem
```

must hold.

Do not clone, reconstruct, normalize, or otherwise replace the original `KnowledgeItem` reference.


### Failure ordering

`failures` must appear in ascending input-index order.

Example:

```text
item 0 → failure
item 1 → success
item 2 → failure
item 3 → failure
```

must produce failure indexes:

```ts
[0, 2, 3]
```

This follows naturally from sequential processing, but it is part of the observable batch contract and must be tested.