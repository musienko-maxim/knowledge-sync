# Task 019: transcript feasibility and architecture review

**Current status (2026-10-09): DEFERRED · LOW priority · Implementation NOT STARTED.**
The user deferred transcript enrichment until core collection, synchronization,
navigation, and search are sufficiently mature. See the
[Task 019 backlog record](../prompts/task-019.md) for the potential scope and
reasons. The review below is historical; its recommendations do not authorize
implementation or require an acquisition-route decision now.

Reviewed 2026-10-09 against [the supplied review brief](../prompts/task-019.md),
the actual source/tests, and current primary-source documentation.

**Conclusion: READY WITH CLARIFICATIONS for local transcript import.** Automated
acquisition for arbitrary videos in owned playlists does not yet have a verified
source meeting the brief's permission and reliability requirements. No production
implementation is recommended until the acquisition route is chosen.

At review time, the user's instruction permitted implementation if the review was satisfactory.
This is a substantive scope decision: importing an existing file does not deliver
automatic transcript collection. The brief itself calls the direction provisional
and requests discussion before a final implementation specification. This document
is the review, not that specification; the original brief is retained below the
current deferral record in `prompts/task-019.md`.

## 1. Current architecture

Tasks 017–018 are committed, contrary to the older status sentence in the brief.
The current branch includes conflict-resolution commit `4b5250c`. Task-entry local
changes are deletion of `prompts/task-018.md` and the new `prompts/task-019.md`;
both are preserved.

| Actual boundary | Current behavior and implication |
| --- | --- |
| [KnowledgeItem / ItemIdentity](../src/core/models/knowledge-item.ts) | Generic `(source, sourceId)` identity; scalar metadata; `description` is source metadata, not a content container. |
| [YouTubeClient / YouTubeApiClient](../src/collectors/youtube/youtube-client.ts) | Playlist metadata/items and owned-playlist discovery; no caption retrieval. Its request helper and safe errors are playlist-specific. |
| [YouTubeCollector.collectCollection](../src/collectors/youtube/youtube-collector.ts) | Completes pagination before returning; normalizes video IDs and metadata; filters invalid metadata entries. Transcript availability must not filter items. |
| [GoogleOAuthLogin](../src/auth/google-oauth.ts) and [token store](../src/auth/token-store.ts) | Existing login requests `youtube.readonly`; refresh and token storage already have separate failure handling. Local import needs neither login nor scope changes. |
| [sync](../src/application/sync.ts) | Explicit scalar-field classification, including description; upserts even unchanged entries. Adding transcript fields here would expand sync semantics. |
| [syncCollection](../src/application/sync-collection.ts) | Complete collection, collection upsert, item/membership writes, then deduplicated stale-edge removal. Earlier failure skips removal. |
| [syncAccount](../src/application/sync-account.ts) | Sequential playlists; recoverable failures continue, fatal failures suppress later processing/export; existing counters concern playlist metadata. |
| [Storage](../src/storage/storage.ts), [schema](../src/storage/sqlite/schema.ts), [openStorage](../src/storage/sqlite/storage.ts) | One SQLite/Drizzle lifecycle, composite keys/FKs, additive bootstrap DDL. Import-state records are separate from normalized items. |
| [readObsidianSnapshot](../src/application/read-obsidian-snapshot.ts), [exportObsidianProjection](../src/outputs/obsidian/export-projection.ts) | Items/collections/memberships are read before output; strict relationship validation, then item and collection batches. No transcript input exists. |
| [renderKnowledgeItemMarkdown](../src/outputs/markdown.ts), [note paths](../src/outputs/obsidian/note-path.ts), [writer](../src/outputs/obsidian/write-note.ts) | Stable identity paths; verbatim description; whole-file overwrite. Writes are non-atomic and do not delete notes. |
| [CLI program](../src/cli/program.ts), [YouTube composition](../src/cli/youtube-sync.ts) | Existing command summaries and failure codes must remain compatible. Reuse database-path/vault exclusion checks and close lifecycle. |

Appending transcripts directly to generated item notes would lose them on the next
export. Putting transcripts into `description` would also alter classification and
be overwritten by ordinary metadata sync. Keep `KnowledgeItem.description`
unchanged.

## 2. Acquisition feasibility: facts and unresolved assumptions

The official API's `captions.list` returns track metadata, not subtitle text, and
costs 50 quota units. `captions.download` costs 200 units and requires permission
to edit the video. Both document `youtube.force-ssl` or `youtubepartner`, rather
than this application's current read-only scope. Adding consent alone would not
grant rights over unrelated videos. Listing tracks and downloading one therefore
costs 250 units before other calls. [List documentation](https://developers.google.com/youtube/v3/docs/captions/list),
[download documentation](https://developers.google.com/youtube/v3/docs/captions/download).

Official track metadata includes BCP-47 language and track kind, including `ASR`.
`isAutoSynced` concerns timing synchronization and must not be mistaken for
automatically generated wording. [Caption resource](https://developers.google.com/youtube/v3/docs/captions).

YouTube's terms restrict automated access and downloading/reuse except where
authorized. A publicly visible subtitle track, a library licence, or payment for
a provider does not itself demonstrate the required permissions. This review has
not established a permission basis for general third-party-video extraction.
[YouTube terms, Permissions and Restrictions](https://www.youtube.com/t/terms).

| Approach | Coverage, languages and caption types | Permissions, cost, reliability and integration |
| --- | --- | --- |
| Official Data API | Editable videos with accessible tracks; not arbitrary videos merely saved in a playlist. Language and track metadata are available. | Official supported interface; additional OAuth consent and actual edit permission; quota as above. Network dependency, but persisted data can remain local. Existing HTTP/auth infrastructure could support a separately scoped adapter later. |
| User-supplied SRT/VTT | Any already stored item for which the user has an appropriately obtained file. Language and human/automatic origin cannot be assumed from a file extension. | No API credentials, quotas or remote dependency. Rights/provenance still matter. Reliable acquisition boundary, but manual effort and parser compatibility are real costs. A bounded parser may need no new dependency. |
| Hosted provider: Supadata evaluated as an example | Advertises public-video transcripts and multilingual timestamped/plain-text output. Availability and actual returned language must be checked. | API key, paid credits/plan limits, third-party processing and service dependency. Built-in `fetch` could avoid an SDK. Technical availability does not settle permission or content rights. Not selected. |
| Unofficial extraction libraries | Can retrieve some public human/automatic captions and languages; no guarantee for every video or deployment. | Undocumented endpoints; upstream breakage and blocking, no supported YouTube quota contract. npm dependency for Node libraries; Python library adds a runtime/toolchain. Credential/cookie handling and transitive dependencies would need review. Not recommended for this task. |

Supadata documents `native`, `auto`, and `generate` modes. `auto` can fall back to
AI transcription, which is outside this task; any future adapter must request
`native`. A preferred language can fall back to another language, so the adapter
must validate the response language. The documented response does not establish
human versus automatic caption origin; represent unknown rather than guessing.
[Provider endpoint documentation](https://docs.supadata.ai/get-transcript).

The provider documents one credit for existing captions and higher charges for
generated transcripts; plan rate limits and exhausted monthly credits are separate
operational conditions. Exact subscription prices are not needed to select this
review's scope and no plan was purchased. [Provider pricing explanation](https://supadata.ai/mcp),
[limit documentation](https://docs.supadata.ai/errors/limit-exceeded).

Supadata's terms retain original creators' rights, place platform-terms compliance
on the caller, and describe best-effort availability. These are not evidence of a
YouTube permission grant for this use case. I cannot verify this provider as a
compliant, reliable automated source for arbitrary saved videos from the reviewed
documentation. This is a limited finding, not a claim that no such arrangement can
exist. [Provider terms](https://supadata.ai/legal/terms).

The Node `youtube-transcript` project explicitly warns that its unofficial API may
break. The Python `youtube-transcript-api` documents IP blocking, currently broken
cookie authentication, and dependence on undocumented endpoints. Their warnings
support a maintenance concern; this review does not claim either package contains
malware. Do not add cookies, rotating proxies or other restriction workarounds to
this application. [Node project](https://github.com/Kakulukian/youtube-transcript),
[Python project](https://github.com/jdepoix/youtube-transcript-api).

No live account, video-caption request, provider credential, or real user file was
used. API capability statements above are verified documentation facts; provider
performance and the availability of suitable local files remain untested.

## 3. Domain alternatives and recommendation

| Alternative | Assessment |
| --- | --- |
| Add transcript fields to KnowledgeItem | Couples large, multi-language content to metadata collection, classification and rendering. Not recommended. |
| Separate Transcript entity | Recommended. Shares item identity, has an independent lifecycle, and supports multiple languages without playlist duplication. |
| Generic enrichment model | Too broad for one content type and an unchosen provider. Defer. |
| Keep only a file reference outside SQLite | Useful as an input artifact, but inadequate as authoritative application storage; moving the file would prevent reprojection. |

Initial proposal: one current accepted transcript per `(source, sourceId, language)`.
A later import in the same canonical language replaces that selected track only
when normalized content/provenance differs. Different languages coexist. Multiple
human/automatic tracks in the same language, competing providers, native track IDs
and revision history are deferred, not silently promised by this key.

Store ordered timestamped segments and derive plain text. Acquisition provenance
(`local-file`) is independent of caption kind (`human`, `automatic`, `unknown`). A
manually supplied file defaults to unknown kind, not human. Require an explicit
language tag; do not infer it from filenames or pretend to verify the spoken
language. Canonicalize language tags consistently before lookup or insertion.

Do not add timestamps solely for this feature. If added later, preserve first-import
time and change update time only on material content/provenance changes. Provider
revision timestamps and local import times are different concepts. A missing row
means not stored, not unavailable on YouTube. Do not persist guessed absence.

Illustrative boundaries, not an approved implementation specification:

```ts
interface Transcript extends ItemIdentity {
  language: string;
  provider: 'local-file';
  captionKind: 'human' | 'automatic' | 'unknown';
  segments: readonly {
    startMs: number;
    endMs: number;
    text: string;
  }[];
}

interface TranscriptRepository {
  find(item: ItemIdentity, language: string): Promise<Transcript | null>;
  listForItem(item: ItemIdentity): Promise<readonly Transcript[]>;
  upsert(transcript: Transcript): Promise<'created' | 'updated' | 'unchanged'>;
}
```

A future network adapter can return a tagged result such as `available`,
`unavailable` with a reason, or an operational error. Do not add an unused provider
framework to the local-file implementation.

## 4. Persistence and migration

Add one `transcripts` table through the existing schema and additive bootstrap,
with a composite primary key on source/item/language and a composite FK to
`knowledge_items(source, source_id)`. No cascading deletion or collection key.
Use one validated JSON segment payload per row rather than a segment-table system
without a query requirement. Storage maps and validates rows at its boundary.

Require an existing item; do not fabricate metadata to satisfy the FK. Add
`Storage.transcripts` on the same connection, preserving all current repositories,
connection cleanup and original import-state records. Importing a transcript must
not call `recordImport()`.

Normalize and validate the complete input before mutation. Use an atomic upsert;
if classification requires read/compare/write, do that short sequence in one
synchronous SQLite transaction. Identical normalized input is an unchanged result,
without timestamp churn. Failed replacement preserves the previous valid row.

No existing tables need transformation, backfill or rebuilding. Verify reopening
an existing database and all current FK/uniqueness behavior. Transcript storage
must be untouched by metadata upserts and Task 018 membership removal.

## 5. Workflow and smallest useful Task 019

Retrieval during playlist sync would couple optional content to authoritative
membership snapshots. Automatic enrichment immediately after sync still expands
command duration, quota consumption and failure reporting. Prefer an explicit,
separate per-item operation after metadata has been persisted.

**Recommended minimum, conditional on local files meeting the user's goal:**

1. Import a bounded UTF-8 SRT file for an existing YouTube item.
2. Require explicit language; optional caption-kind metadata defaults to unknown.
3. Persist normalized cues with the identity/replacement policy above.
4. Report created/updated/unchanged and safe errors; leave existing sync commands
   and all Obsidian output unchanged.

Proposed CLI:

```text
knowledge-sync youtube transcript import <videoId> <file> --language <tag> [--kind <kind>] [--db <path>]
```

No OAuth or remote video lookup; use the stored item's identity. Reuse database
path precedence, vault exclusion and storage cleanup. A local valid import can
succeed even if the video is currently inaccessible online. The operation does
not certify content ownership or availability.

Start with one explicitly documented SRT subset. Support BOM, LF/CRLF, numbered
multiline cues, valid integer-millisecond timing, and Unicode. Preserve legitimate
overlaps and repeated wording; do not deduplicate cues using text alone. Define
size/cue limits and reject malformed or empty content before writes. Treat markup
as inert text in the initial parser rather than claiming full subtitle styling.
The final specification must define these limits and exact normalization rules.
SRT has encoding and formatting variations; accepting only UTF-8 is an intentional
initial restriction. [Library of Congress SRT description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml).

Evaluate VTT as a follow-up using its actual grammar: cue identifiers/settings,
NOTE/STYLE/REGION blocks, cue markup and overlapping timings require deliberate
handling. It is not merely SRT with a different decimal separator.
[WebVTT specification](https://www.w3.org/TR/webvtt1/).

This MVP establishes ingestion and persistence; it does **not** yet make transcripts
visible in Obsidian. If that visibility is required in Task 019, explicitly expand
the scope to include the export operation below before implementation.

## 6. Obsidian projection

Embedding content makes existing notes large and requires coordinated changes to
snapshot inputs, renderer contracts, export batches and errors. Appending after
rendering is insufficient because later exports overwrite the whole file.

Recommend a separate explicit transcript export in the next task. Read persisted
SQLite transcripts, not original files, and write stable notes such as
`<encoded-source>/transcripts/<encoded-item-id>/<encoded-language>.md`. Reuse
the existing path encoder and separate Markdown destination encoder. Render cue
text as literal safe text; preserve deterministic ordering/newlines and avoid
run-time timestamps. Do not delete absent transcript notes.

Include a link from transcript to its existing item note. Obsidian backlinks can
provide reverse discovery; an explicit item-to-transcript link does not exist
unless the item renderer is deliberately extended later. Existing collection
pages continue linking to the same item notes. A backlink can remain unresolved
until the item note is exported, just as current failed item exports can leave
collection links unresolved.

Keep normal sync/export commands byte-compatible in the minimum scope. A separate
export command permits recovery after a file has moved and after output failure.
Do not make recovery depend on reimporting the original input file.

## 7. Failure and consistency model

| Situation | Recommended behavior |
| --- | --- |
| No stored transcript | Not imported; no claim about remote subtitles. |
| Missing subtitles from an approved future provider | Explicit expected absence; retain any previously stored transcript. |
| Requested language unavailable | Explicit absence; no silent fallback or translation. Invalid local language syntax is an input error. |
| Private/deleted/inaccessible video | Preserve items, collections, memberships and transcripts. Do not infer deletion from 403/404. Local-file import needs no remote check. |
| Provider authorization failure | Operational error; no empty success, no token deletion, no playlist-sync failure. |
| Rate limit or quota exhaustion | Distinguish temporary throttling from budget exhaustion; stop the explicit request and report safely. Do not busy-loop. |
| Temporary network/provider failure | Error with original cause retained internally; allow a later explicit retry without overwriting valid content. |
| Missing/unreadable file, unsupported format, malformed/empty cues | Nonzero input failure before transcript writes; preserve the prior row. |
| SQLite write failure | Nonzero persistence failure; atomic replacement preserves the previous transcript. |
| Future Obsidian export failure | Retain committed SQLite data; nonzero export result; re-export from SQLite. |

Expected provider absence is a distinct result from an error; an explicit request
for an unavailable track should report that requested work was not fulfilled.
No negative cache, retry engine, attempt-history table or scheduler is necessary
for local import. SQLite provides durable accepted content, not a cache TTL policy.
An interrupted run can be repeated safely; transactions yield either the previous
or the new complete transcript, never partially written cue sequences.

## 8. Tests and acceptance criteria

Use synthetic subtitle fixtures and in-memory/temporary SQLite only. No live
YouTube or paid-provider requests are needed.

- Parser: BOM/newlines, multiline/Unicode text, exact milliseconds, overlaps,
  repeated phrases, invalid ranges/order/encoding, empty input and limits.
- Language/kind: canonical equivalents share a slot, distinct languages coexist,
  absent kind is unknown, and user-declared metadata is not guessed from content.
- Repository: direct FK/uniqueness constraints, different sources sharing an ID,
  repeated identical import, changed replacement, preserved old row on failure,
  persisted reopen and additive upgrade with existing import/collection data intact.
- Application/CLI: missing item/file, parser/storage errors and safe diagnostics;
  no collector/OAuth calls, exact result counts, DB exclusion guard and cleanup.
- Compatibility: repeated metadata sync leaves transcripts intact; a shared video
  in two playlists still has one transcript per language; membership reconciliation
  and failure ordering remain unchanged; current item/collection output stays exact.
- Future export: stable collision-safe paths and links, deterministic bytes,
  safe literal cue text, export failure retaining DB state and reprojection without
  access to the original file.

Existing anchors include [item repository tests](../tests/knowledge-item-repository.test.ts),
[collection repository tests](../tests/collection-repositories.test.ts),
[sync classification tests](../tests/sync.test.ts),
[collection sync tests](../tests/sync-collection.test.ts),
[collector pagination tests](../tests/youtube-collector.test.ts),
[account orchestration tests](../tests/sync-account.test.ts),
[snapshot tests](../tests/read-obsidian-snapshot.test.ts), and
[Obsidian integration tests](../tests/obsidian-projection.integration.test.ts).

For implementation, require install, focused and full tests, typecheck, build,
built/packaged CLI startup/help and independent review using `ks-verify`. The last
recorded suite had 951 passes and one expected Windows skip; those checks belong
to the preceding PR conflict-resolution work, not this review. This review changes
documentation only, so runtime checks and dependency installation were not repeated.

## 9. Decisions and follow-up roadmap

The blocking product decision is whether a local-file workflow is useful. No
authorized file supply has been established. If automatic retrieval of arbitrary
playlist videos is essential, do not substitute a manual importer and call the
original goal achieved: first select a provider/permission arrangement and validate
its coverage, provenance, language behavior, costs and availability.

Recommended defaults for an implementation specification, if local import is accepted:
UTF-8 SRT first; explicit language; unknown caption kind unless declared; one
selected track per language with replacement; SQLite persistence first; transcript
Obsidian export as the next separately assigned task. These are proposed choices,
not requirements silently added to the supplied brief.

Follow-up order:

1. Approve the acquisition route and minimum scope, then prepare the implementation
   specification with exact parser limits and acceptance cases.
2. Implement local import/persistence if selected.
3. Add explicit transcript export from SQLite and, if useful, VTT import.
4. Consider an official editable-video adapter or a separately vetted provider;
   only then define network retries, refresh/negative-cache policy and batch work.
5. Add multiple simultaneous tracks/providers or version history only when needed.

Non-goals remain scheduling, background work, reconciliation redesign, audio/video
downloads, speech-to-text, translation, LLM summaries, embeddings/RAG, generic
enrichment infrastructure, unrelated npm audit remediation, commits and pushes.

**READY WITH CLARIFICATIONS:** the repository can support a small separate
transcript feature, but automated acquisition is unresolved and the recommended
manual alternative requires a product choice before implementation.
