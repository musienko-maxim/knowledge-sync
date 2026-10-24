# Task 021: Facebook Saved source format

The implementation assignment is [task-021-implementation.md](../prompts/task-021-implementation.md).
The earlier [review prompt](../prompts/task-021.md) remains historical review context.

## Read-only source evidence

Reinspection on 2026-10-11 read only the Saved-related archive entries in
`D:\imports\facebook-saved.zip`. Private records were not copied into the repository.
The implemented parser was run directly against the collections entry through an
in-memory pipe; only numeric counts and fixed warning codes were printed.

Supported entry:
`your_facebook_activity/saved_items_and_collections/collections.json` (444,615 bytes).
The neighboring `your_saved_items.json` (167,918 bytes) is outside the supported
input format. The CLI accepts the extracted collections JSON, not a ZIP archive.

| Measure | Fresh parser result |
| --- | ---: |
| Collections | 14 |
| Saved occurrences | 349 |
| URL-bearing occurrences | 345 |
| Distinct exact URLs / items | 270 |
| Unique collection/item memberships | 271 |
| Duplicate item occurrences | 75 |
| Repeated membership occurrences | 74 |
| URL-less skips | 4 |
| Empty collections | 1 |

No metadata conflicts were reported for this archive. These are source/parser
counts; persistence and generated-output acceptance are separate checks.

## Recognized structure

The root is an array. Each collection has an exact decimal-string `fbid` and a
`label_values` array. A localized label identifies the collection name. The Saved
section uses `title` and `dict`, not `label` and `value`:

```json
[
  {
    "fbid": "900719925474099312345678",
    "label_values": [
      { "label": "Назва", "value": "Example collection" },
      {
        "title": "Збереження",
        "dict": [
          {
            "title": "",
            "dict": [
              {
                "label": "URL-адреса",
                "value": "https://www.facebook.com/example/posts/123?ref=saved",
                "href": "https://www.facebook.com/example/posts/123?ref=saved"
              },
              { "label": "Назва", "value": "Example title" },
              { "label": "Опис", "value": "Example description" },
              { "title": "Автор", "dict": [{ "label": "Ім’я", "value": "Example author" }] }
            ]
          }
        ]
      }
    ]
  }
]
```

All values above are synthetic. The checked-in
[fixture](../tests/fixtures/facebook/collections.json) also covers empty
collections, unsupported URL-less records, correct Unicode, participant sections,
group information, and generic names that must not become author metadata.

Verified Saved fields include 345 URL labels (344 also have `href`), 307 explicit
title labels, one description, 38 explicit author dictionaries, and 38 group
dictionaries. There are 226 generic name labels; they are intentionally ignored.
There are 349 viewed-time fields and one message field; neither maps to domain
publication time or invented content. Participant information is also ignored.
The authoritative URL is `value`; present `href` must match it exactly.

## Encoding contract

The observed export is valid UTF-8 JSON containing Unicode escapes for Latin-1
code points that represent original UTF-8 bytes. For example, synthetic `Назва`
appears as `\u00d0\u009d\u00d0\u00b0\u00d0\u00b7\u00d0\u00b2\u00d0\u00b0`.

Repair is limited to labels and textual metadata. The entire string must consist
of code points at most 255 and contain `Ð` or `Ñ`. Its Latin-1 bytes must decode as
strict UTF-8, round-trip exactly, contain Cyrillic, and leave no `Ð`/`Ñ` repair
signature. Only one such layer is repaired. The result is idempotent. Correct
Unicode, invalid candidates, mixed already-correct Unicode, and unsupported
encoding variants remain unchanged. This deliberately is not a universal
mojibake detector. Tests derive an escaped synthetic variant from the fixture;
no private sample strings are retained.

URLs and FBIDs never pass through repair, trimming, Unicode normalization, URL
canonicalization, or numeric conversion. Text metadata is trimmed after repair.

## Identity, duplicates, and metadata

Items use source `facebook` and `url-v1-` followed by the full lowercase SHA-256
digest of exact validated URL UTF-8 bytes. HTTP(S) URLs must have a hostname,
contain no ASCII whitespace/control characters, and have no leading/trailing
whitespace. Equivalent-looking URL spellings intentionally remain distinct.

Fallback titles are `Facebook Saved — <Type> — <first 12 hash characters>`.
The frozen classifier recognizes exact Facebook hosts (`facebook.com`, `www`,
`m`, or `web` subdomain), then these paths: `/groups/<id>/posts/<id>` (Group post),
`/reel/<id>` (Reel), `/<id>/videos/<id>`, `/watch`, or `/video.php?v=...` (Video),
and `/<id>/posts/<id>` or `/permalink.php`/`/story.php` with `story_fbid` (Post).
Other valid URLs use Link. Trailing slashes are supported on the path families
other than PHP endpoints; query strings do not affect classification.

Each field accumulates distinct nonempty values, so input order cannot select a
winner. Complementary fields merge. Multiple titles produce fallback; conflicting
optional fields are omitted for new items. Warning codes are `TITLE_CONFLICT`,
`DESCRIPTION_CONFLICT`, and `AUTHOR_CONFLICT`. Stored meaningful values win when
incoming values conflict. Exact fallback recomputation permits later promotion
to an unambiguous explicit title. Sparse updates preserve stored omitted optional
metadata, including legacy `collection` and `publishedAt` fields.

Collections use the exact FBID string. Conflicting names for an ID within one
file reject the whole input before persistence. Across imports a single validated
incoming name is authoritative, so an older archive can revert a collection name.
Membership edges are deduplicated separately from items. The application persists
them additively; absence in an archive never requests deletion.

## Validation and public API

[The parser](../src/collectors/facebook/import.ts) exports `readFacebookImport`,
`parseFacebookImport`, `mergeFacebookItem`, identity/fallback helpers, input and
candidate types, and `FacebookImportError` with fixed private-data-free codes.
Candidates retain per-item conflict codes for merging against stored values.
Returned collections, items, memberships, and warning codes have stable ordering.

Input is limited to 16 MiB, 5,000 root collections, 100,000 Saved occurrences,
32 container levels, 65,536 UTF-16 code units per string (including object keys),
and 128 decimal digits per collection ID. File reads are bounded to the limit
plus one byte even if the file grows after stat. UTF-8 decoding is fatal, lone
surrogates are rejected, nesting is checked before JSON parsing, and metadata
property reads use own-property access. Unsupported root/required section shapes,
invalid URLs, mismatched URL fields, and malformed recognized metadata fail the
input; recognized Saved records without a URL are counted skips.

Tests: [facebook-parser.test.ts](../tests/facebook-parser.test.ts). Initial focused
verification passed 48 tests. Full application, export, and cross-command checks
belong to the integrated Task 021 validation.
