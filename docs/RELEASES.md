# Immutable releases

The database, domain layer, protected staff HTTP routes and studio release workspace
are implemented. Staff can validate a draft, save previews, publish numbered versions
and inspect frozen bilingual content. Runtime admission remains a later increment.
The current Voice lab still uses synthetic scenarios.

## Staff workflow

Open a bot's Releases section. Recheck draft reads its current revision and readiness;
issue links open the affected identity, knowledge entry or presentation. Owners and
administrators can save a ready preview or publish a ready version. Viewers and
operators can inspect snapshots and query knowledge. Archived bots retain history
and inspection but have no capture controls.

Each confirmation creates one UUID retry key and pins the displayed root revision.
A network failure or server error retains both. Retry request, including after closing
and reopening that dialog, retrieves the original result. A definite rejection asks
staff to close and recheck instead of silently adopting a newer revision. A retry
attempt is held only while the release page remains mounted; after leaving/reloading,
inspect history before initiating another capture with a new key.

History has server-side kind filters and ten-row pagination. Snapshot inspection
shows the original bot/configuration, knowledge approval state, ordered slides and
media manifest. Content language and landscape/portrait preview controls do not edit
the snapshot. Both display targets are shown and videos stay muted. Reload preview
media retries a failed private content request without changing the selected release.

Knowledge inspection sends a CSRF-protected POST so question text is not placed in
the URL. It accepts at most 500 characters and rejects NUL before PostgreSQL search.
The client validates release ID, hash and locale before displaying passages, cancels
queries on locale changes/unmount, and clears results when switching releases. Empty
matches show the frozen fallback as reference text; no model answer is generated.
Expired previews retain content inspection and explain how to create a new preview.
Query inputs/results are not persisted in browser storage.

## Capture and publication

`ReleaseService` resolves current staff authority inside each serializable
transaction. Inspection is available to staff; preview and publication require
owner/administrator authority. All draft captures require `expectedRevision`.
Knowledge and presentation edits already advance that root revision. A stale
capture fails without allocating a version or writing a partial release.

Publication locks the bot row and increments a separate version counter. It freezes
the bot identity/configuration, selected knowledge, selected presentation in slide
order, and a deduplicated media manifest. Canonical sorted object keys make the
SHA-256 snapshot hash independent of JSONB key ordering. Array order and original
text remain meaningful. No storage paths, provider keys or staff/session tokens are
included in the snapshot. Provider mode is explicit, including fixture publication.

Readiness checks require persona, bilingual greeting/fallback, supported voices and
tools, complete selected knowledge/slide translations and READY media. A selected
presentation needs a slide; the Show slide tool needs a selected presentation.
Knowledge and presentations are otherwise optional. A snapshot supports at most
200 selected knowledge entries, 50 slides and 4 MiB of serialized JSON.

Published releases require every selected knowledge entry to be approved. Staff
previews also permit selected DRAFT entries for author testing and freeze their
actual status for inspection.
Both kinds still require complete translations. Publication creates a distinct
PUBLISHED row; it never promotes or rewrites a preview.

## Retries and retention

An idempotency key is required for either capture operation. It must be 16–128
ASCII letters, digits, underscores or hyphens; a fresh UUID is suitable. Scope is
the current membership and operation. Store a SHA-256 key hash, request hash and
release reference for 24 hours. The request hash includes operation, bot ID and
expected revision. Reusing a key with another request returns
`IDEMPOTENCY_CONFLICT`; replay returns the original immutable result even after
draft changes. Authority is checked again on replay. After expiry the same key can
capture a new release using a valid current revision.

PREVIEW versions are null and new retrieval expires exactly 30 minutes after
creation. Historical reads and an unexpired idempotency replay retain the original
preview result. These are inspection operations, not permission to admit a new
conversation. Runtime admission must separately enforce staff-only preview use,
expiry and published-only device/share deployment when that layer is built.

Bot deletion cannot cascade release history. Database triggers reject release
updates and independent projection changes/deletes. Explicit parent deletion is
reserved for later retention maintenance; there is no release deletion API.
Idempotency references restrict parent deletion. Future conversation/history
references must also restrict cleanup. A retention worker has not yet been added.

## Projection and media integrity

Migration 010 adds `BotRelease`, `ReleaseKnowledge`, `ReleaseMedia` and
`IdempotencyRecord`. Each projection includes organisation, release and snapshot
hash in its foreign key. Insert triggers compare projection text and media
checksums/lengths with the frozen snapshot; a deferred commit constraint requires
exactly two locale rows per knowledge entry and every manifest reference.
Knowledge draft IDs are stable references without foreign keys back to mutable
draft entries. Deleting draft content leaves historical retrieval intact.

Media references include fixed READY state, SHA-256 and byte length. The database
rejects asset deletion or changes to those referenced fields. The media service
returns `MEDIA_IN_USE` for either a slide or saved release reference. Removing a
slide therefore does not release a file retained by a published or preview snapshot.

## Bilingual retrieval

Search always includes organisation, pinned release, snapshot hash and locale.
English uses a generated full-text vector plus trigram matching; Nepali uses exact
FAQ/phrase matching and trigrams without English stemming. Canonical normalization
preserves Devanagari marks and numbers, collapsing only whitespace and case.
PostgreSQL generates normalized projection fields from frozen text so callers
cannot supply unrelated search text. GIN indexes cover text vectors and trigrams;
the similarity threshold is transaction-local at 0.25.

Exact FAQ questions rank above exact phrases and fuzzy/full-text matches. Full-text
rank is normalized to prevent repetition in a long note overpowering that priority.
Results return at most five stable entry references. Titles, questions, separating
newlines and passage bodies together fit 6,000 Unicode code points; truncation never
splits a surrogate pair. Zero matches returns an empty passage list. Runtime use of
the frozen fallback and model/tool grounding remains a later step.

See [PostgreSQL generated search columns](https://www.postgresql.org/docs/17/textsearch-tables.html),
[trigram indexes](https://www.postgresql.org/docs/17/pgtrgm.html) and
[deferred constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html)
for the underlying database mechanisms.
