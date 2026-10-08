We are preparing **Task 018 — authoritative per-Collection membership reconciliation** for the `knowledge-sync` project.

Project path:

```text
D:\codex\knowledge-sync
```

Environment:

```text
Windows / PowerShell
Node.js + TypeScript
Commander CLI
SQLite + Drizzle ORM
Zod
Vitest
local-first architecture
```

Use `npm.cmd` in PowerShell where npm is needed.

Before doing anything else, read:

```text
AGENTS.md
docs/SESSION_HANDOFF.md
prompts/task-017.md
```

Then inspect the current implementation related to:

```text
KnowledgeItemRepository
CollectionRepository
CollectionMembershipRepository

single-playlist sync orchestration
syncCollectionToObsidian()
syncAccount()
youtube sync
youtube sync-obsidian
youtube sync-all

Task 015 collection/membership persistence
Task 016 account-wide sync/failure semantics
Task 017 collection-aware Obsidian projection
```

Tasks 001–017 are already COMPLETED / ACCEPTED.

Task 017 changes are currently uncommitted.

Do not commit or push.

Do not implement Task 018 yet.

---

# Task 018 goal

The goal is to introduce **safe reconciliation of CollectionMembership rows** after a complete successful synchronization of one Collection.

The narrow intended scope is:

```text
authoritative per-Collection membership reconciliation
```

Task 018 is NOT intended to introduce general database garbage collection, Collection deletion, KnowledgeItem deletion, or Obsidian filesystem cleanup.

---

# Core semantic rule

The central rule is:

```text
Absence is authoritative only inside a complete successfully observed scope.
```

For Task 018, the authoritative scope is one successfully synchronized Collection / playlist.

Example.

Persisted state:

```text
Collection A:
A → X
A → Y
A → Z
```

A complete successful new source snapshot contains:

```text
X
Z
W
```

Then Task 018 may safely produce:

```text
A → X
A → Z
A → W
```

and remove only:

```text
A → Y
```

It must NOT automatically delete:

```text
KnowledgeItem Y
Collection A
Obsidian note Y
```

---

# 1. Membership reconciliation only

Task 018 should remove stale:

```text
CollectionMembership
```

rows.

It should NOT automatically delete:

```text
KnowledgeItem
Collection
Obsidian files
```

A KnowledgeItem with zero CollectionMembership rows remains persisted.

A Collection with zero memberships remains persisted as a valid empty Collection.

Do not infer garbage-collection semantics from zero membership count.

---

# 2. Complete successful Collection snapshot is authoritative

A Collection snapshot is authoritative only after the full Collection synchronization has completed successfully.

The intended order is conceptually:

```text
collect complete playlist
↓
obtain complete observed item set
↓
persist/update Collection
↓
persist/update KnowledgeItems
↓
persist current CollectionMemberships
↓
ONLY AFTER ALL ABOVE SUCCEED
↓
remove stale memberships for that Collection
```

The destructive reconciliation phase must happen last.

Do not reconcile from a partially observed or partially persisted Collection.

---

# 3. Failure must never be interpreted as absence

If Collection synchronization fails, do not remove stale memberships for that Collection.

Examples:

```text
collector/network/API failure
authentication failure
inaccessible playlist
item persistence failure
membership persistence failure
unexpected application failure
```

must all result in:

```text
no destructive reconciliation for that Collection
```

Earlier additive writes may retain the project's existing partial-progress semantics.

But absence from a failed or incomplete sync must not be treated as authoritative.

---

# 4. Successful empty Collection is authoritative

A successful source response showing:

```text
Collection exists
0 items
```

is a complete authoritative snapshot.

Example persisted state:

```text
A → X
A → Y
```

Successful source snapshot:

```text
A = []
```

Expected reconciled membership state:

```text
no memberships for A
```

The Collection itself remains persisted.

KnowledgeItems X and Y remain persisted.

Task 017 Obsidian projection can then naturally render the Collection as empty.

---

# 5. Shared KnowledgeItems

Many-to-many semantics must be preserved.

Example:

```text
A → X
B → X
```

If a successful synchronization of A no longer contains X:

```text
remove:
A → X
```

but preserve:

```text
B → X
KnowledgeItem X
```

Reconciliation must always be scoped to one Collection.

---

# 6. Duplicate source entries

Synchronization statistics may retain existing entry-based semantics.

However, desired Collection membership is set-based.

Example collected entries:

```text
X
X
Y
```

must produce desired membership set:

```text
A → X
A → Y
```

not duplicate membership edges.

Use the authoritative KnowledgeItem composite identity:

```text
source + sourceId
```

when deriving the desired set.

---

# 7. All Collection-aware sync workflows should use the same reconciliation semantics

If the actual architecture supports it, successful Collection synchronization should reconcile memberships regardless of which supported workflow initiated it.

Review at least:

```text
youtube sync <playlistIdOrUrl>
youtube sync-obsidian <playlistIdOrUrl>
youtube sync-all
youtube sync-all --vault <path>
```

and both supported single-playlist auth modes where applicable.

Do not implement reconciliation independently inside CLI handlers.

Prefer a shared application-level Collection synchronization mechanism.

Report the actual current call graph before recommending where reconciliation belongs.

---

# 8. Account-wide synchronization semantics

For account-wide sync:

```text
A → success
B → recoverable failure
C → success
```

expected behavior should be conceptually:

```text
A → reconcile
B → do NOT reconcile
C → reconcile
```

A failed playlist must not prevent already successful playlists from retaining their reconciliation results if that matches current Task 016 partial-progress semantics.

For a late fatal account/shared-infrastructure failure:

```text
A success + reconciled
B success + reconciled
C fatal failure
```

the intended behavior is:

```text
preserve A reconciliation
preserve B reconciliation
stop further playlist processing
retain existing Task 016 fatal/export semantics
```

Do not introduce global rollback.

Please verify this against the current `syncAccount()` outcome model.

---

# 9. Absence from account discovery is NOT yet authoritative for Collection deletion

Task 018 must NOT interpret this:

```text
previous SQLite Collections:
A
B
C

current successful owned-playlist discovery:
A
B
```

as sufficient evidence to delete:

```text
Collection C
```

The reason is that the current persisted Collection model may not record enough provenance to distinguish:

```text
owned playlist discovered by sync-all
```

from:

```text
public/external playlist previously synchronized explicitly
```

or other sync scopes.

Unless current code already stores sufficient authoritative ownership/scope provenance, Collection deletion is OUT OF SCOPE.

Please verify this assumption against the real schema.

If the schema unexpectedly already supports safe account-scope provenance, report it, but do not expand Task 018 automatically.

---

# 10. Inaccessible / private / deleted-looking playlist is not automatic deletion evidence

Do NOT treat:

```text
404
403
private playlist
permission change
OAuth/account-access change
temporary API failure
```

as equivalent to an authoritative delete instruction.

For Task 018:

```text
cannot read Collection
≠ Collection deleted
```

No destructive membership reconciliation should occur unless the Collection contents were completely and successfully observed.

---

# 11. Legacy KnowledgeItem.collection is not authoritative

Task 018 must NOT use:

```text
KnowledgeItem.collection
```

to infer, reconstruct, delete, or repair CollectionMembership rows.

It remains compatibility metadata from earlier tasks.

Reconciliation uses only the authoritative:

```text
Collection
CollectionMembership
```

model and the newly observed Collection snapshot.

Do not rewrite legacy `KnowledgeItem.collection` as part of membership reconciliation.

---

# 12. Obsidian is not reconciled directly

Task 018 should not scan or delete Obsidian files.

Expected flow:

```text
successful source sync
↓
SQLite membership reconciliation
↓
SQLite remains source of truth
↓
existing Task 017 Obsidian projection reads current SQLite state
↓
Collection note is overwritten with current membership links
```

If SQLite changes from:

```text
A → X
A → Y
```

to:

```text
A → X
```

Task 017 projection should naturally update A's Collection note.

The item note for Y remains because KnowledgeItem Y remains persisted.

No new filesystem deletion logic is required for Task 018.

---

# 13. Obsidian export failure must not roll back SQLite reconciliation

If membership reconciliation succeeds but the later Obsidian export fails:

```text
SQLite reconciliation remains committed
```

Do not roll it back.

SQLite remains source of truth.

A later successful projection export should recover the vault representation.

Preserve the existing persistence-before-output architecture.

---

# 14. Reconciliation should be idempotent

Example:

First successful sync removes three stale memberships:

```text
removed = 3
```

Running the same complete source snapshot again should result in:

```text
removed = 0
```

with identical final database state.

---

# 15. Reconciliation result should be additive

Do not change the meaning of existing sync counters:

```text
processed
new
changed
unchanged
```

If Task 018 exposes reconciliation statistics, add them separately.

Conceptually:

```text
membershipsRemoved
```

or an equivalent nested result.

Do not reinterpret existing counters to include deletion counts.

For account-wide aggregation, only successfully reconciled Collections should contribute reconciliation removal counts.

Review current result types first and recommend the least disruptive additive shape.

---

# 16. Atomic destructive reconciliation for one Collection

This is one of the main points requiring architecture review.

The preferred guarantee is:

```text
stale membership removal for one Collection is atomic
```

If persisted stale memberships are:

```text
A → X
A → Y
A → Z
```

and all three must be removed, Task 018 should preferably avoid a state where:

```text
A → X removed
A → Y deletion failed
A → Z not attempted
```

leaves an accidental partially reconciled destructive state.

Preferred semantics:

```text
either all requested stale edges for Collection A are removed
or none of those stale-edge removals are applied
```

This does NOT imply a transaction around the entire Collection synchronization.

The intended atomicity boundary is only the destructive reconciliation operation for one Collection.

Please inspect the current Drizzle/SQLite repository implementation and determine the smallest compatible way to guarantee this.

Possible implementation shapes may include:

```text
one SQL DELETE statement
```

or:

```text
a short repository-level SQLite transaction around stale-edge deletion
```

but do not assume either approach before reviewing the actual code.

Report whether atomic reconciliation can be provided without schema redesign or broad transaction refactoring.

---

# 17. Application vs repository responsibility

Business semantics should remain in the application layer.

The application layer decides:

```text
this Collection snapshot completed successfully
therefore reconciliation is allowed
```

The storage layer should perform the requested membership state change safely.

Do not make the repository infer whether a source snapshot is authoritative.

Potential repository approaches include, conceptually:

```ts
reconcileForCollection(collectionIdentity, desiredItemIdentities)
```

or:

```ts
listForCollection(collectionIdentity)
deleteManyAtomically(staleMembershipIdentities)
```

Do NOT commit to these exact signatures yet.

Review the existing repository style and recommend the least disruptive API.

---

# 18. No schema change unless genuinely required

The expected Task 018 implementation should be possible using the existing:

```text
KnowledgeItems
Collections
CollectionMemberships
```

schema.

Prefer repository/query changes over schema changes.

If real code inspection reveals that atomic/safe per-Collection reconciliation cannot be implemented correctly without a schema change, report the blocker clearly.

Do not add a schema change during this review.

---

# 19. Expected absence/deletion truth table

Please validate or correct this intended behavior:

| Situation | Intended action |
|---|---|
| Complete successful playlist sync | Reconcile stale memberships |
| Successful empty playlist | Remove all memberships for that Collection |
| Collector/API failure | No reconciliation |
| Item persistence failure | No reconciliation |
| Current membership persistence failure | No reconciliation |
| Recoverable playlist failure in sync-all | No reconciliation for failed playlist |
| Successful playlists before/after recoverable failure | Reconcile normally |
| Late fatal account failure | Preserve reconciliation already completed |
| Playlist inaccessible/private/404 | No destructive inference |
| Playlist absent from account discovery | Keep Collection |
| KnowledgeItem reaches zero memberships | Keep KnowledgeItem |
| Collection reaches zero memberships | Keep Collection |
| Obsidian export fails after DB reconciliation | Keep DB reconciliation |
| Second identical successful sync | Remove zero memberships |

Report any case where the current architecture makes this impossible or ambiguous.

---

# 20. Required tests / validation areas

Please review whether the eventual implementation can cover at least the following.

## Basic reconciliation

```text
one stale membership removed
multiple stale memberships removed
no stale memberships
new + retained + removed memberships together
```

## Empty Collection

```text
successful empty playlist removes all Collection memberships
Collection remains
KnowledgeItems remain
```

## Many-to-many

```text
shared item removed from Collection A
same item remains member of Collection B
KnowledgeItem remains
```

## Failure safety

```text
collector failure → no reconciliation
item persistence failure → no reconciliation
membership persistence failure → no reconciliation
unexpected playlist failure → no destructive inference
```

## Account-wide behavior

```text
successful playlist reconciles
recoverable failed playlist does not reconcile
later successful playlist still reconciles
late fatal account error preserves earlier successful reconciliation
```

## Identity / duplicates

```text
duplicate collected item entries deduplicate desired membership set
same sourceId under different sources remains distinct
legacy item.collection is ignored
```

## Retention

```text
zero-membership KnowledgeItem retained
zero-membership Collection retained
playlist absent from discovery retained
inaccessible playlist retained
```

## Idempotency

```text
first run removes stale memberships
second identical run removes zero
final state identical
```

## Atomic destructive phase

Include a test proving the agreed atomic behavior when stale-membership removal itself fails.

The test must demonstrate that Task 018 does not leave an unintended partially deleted stale-membership set for one Collection.

## Obsidian integration

```text
successful reconciliation changes subsequent Collection-note projection
removed membership disappears from Collection note
KnowledgeItem note remains
Obsidian export failure does not roll back DB reconciliation
later export recovers projection
```

## Compatibility

Ensure no regressions in accepted behavior from at least:

```text
Task 015 — persistent Collections and memberships
Task 016 — account-wide sync and failure semantics
Task 017 — collection-aware Obsidian projection
```

and existing single-playlist synchronization behavior.

---

# 21. Explicit non-goals

Keep OUT OF SCOPE:

```text
Collection deletion
KnowledgeItem deletion
garbage collection
orphan-item deletion
filesystem deletion
Obsidian vault scanning
stale-note cleanup
account ownership schema
sync-scope provenance schema
lastSeen
tombstones
soft delete
retention policy
GC timestamps
scheduler
background sync
parallel sync
transcripts
subtitles
video downloads
thumbnails
comments
watch history
subscriptions
generic multi-source redesign
auto commit
auto push
```

Do not begin a future Collection-deletion or garbage-collection task.

---

# Your task now

**Do NOT implement Task 018 yet.**

Perform an architecture/design review against the actual current repository.

Report:

1. Whether authoritative per-Collection membership reconciliation fits the current architecture.
2. The actual current call path for single-playlist and account-wide membership persistence.
3. The best existing layer/function in which successful reconciliation should be triggered.
4. The current capabilities of `CollectionMembershipRepository`.
5. Whether existing queries/indexes are sufficient to reconcile one Collection efficiently.
6. Whether atomic stale-edge removal can be guaranteed without schema changes.
7. The smallest compatible repository API change you recommend.
8. Any conflicts with existing partial-progress semantics.
9. Any ambiguity around failures and when reconciliation may begin.
10. Any result-type / CLI compatibility risks.
11. Whether Task 017 projection naturally reflects reconciled state without additional filesystem logic.
12. Any missing edge cases or tests.
13. Whether the proposed scope is appropriately narrow.
14. Your recommended final clarifications before implementation.

Be concrete.

Reference actual current files, functions, repository types, queries, tests, and call paths where relevant.

Do not modify files.

Do not create `prompts/task-018.md` yet unless explicitly asked after this review.

Do not implement anything.

Do not commit or push.

After the architecture review, stop and wait for approval.