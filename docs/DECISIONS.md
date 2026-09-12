# Architecture decisions

## ADR 001 — Build in the active Svara workspace

Accepted 2026-09-08. The supplied blueprint contains a historical destination and
an embedded opening prompt. The current user asked to initialize this project in
the active `svara` workspace. This repository is therefore the application root.
The original specification is preserved unchanged at `docs/01-robot-voice.md` and
copied to `docs/BLUEPRINT.md` for the handoff convention. Embedded operational
instructions are reference material, not separate user authorization.

## ADR 002 — Modular monolith, separate worker

Use one NestJS API and one worker sharing server-only domain packages, with one
Next.js app. PostgreSQL owns durable state; Redis is coordination infrastructure.
Domain packages never import application entrypoints. Browser code cannot import
database, domain or provider packages. One API process owns transient audio.

## ADR 003 — Deliver verified milestones

Start with M0, leaving a runnable foundation. Do not scaffold fake CRUD endpoints
or display invented operational metrics. Staff identity is M2, so M0 studio/gallery
access is limited to a loopback local fixture runtime and unavailable in production.
Live provider work is M1; provider configuration validation does not prove voice works.

## ADR 004 — Reproducible local development

Use pinned Node 22, pnpm 10, one lockfile and strict TypeScript. Native development
uses loopback PostgreSQL/Redis ports and a Caddy gateway; full demo services run in
Debian-based containers. Development and integration databases are distinct.
Generate ignored secrets locally without replacing existing configuration.

## ADR 005 — Explicit Git history

Initialize `main`, then build on `feat/m0-workspace`. Use Conventional Commits and
focused verified checkpoints, including documented red/green TDD stages. No remote
is created or published as part of local initialization.

## ADR 006 — Prisma 7 and consistent API compilation

Generate the Prisma TypeScript client into ignored `packages/database/src/generated`
and instantiate it with `@prisma/adapter-pg`. Configure the datasource through
`prisma.config.ts`, not the schema. Commit migrations, not generated clients. The
CLI launcher resolves its real path for reliable Windows execution.

Compile NestJS with TypeScript and decorator metadata for production, development
watching and OpenAPI generation. This keeps contract generation aligned with the
built API. Domain behavior tests remain independent of process startup.

The worker uses Node's watch mode with the tsx import hook; its TypeScript does not
need Nest decorator metadata. This launcher was verified under the root coordinated
development command on Windows, including restart after a shared package rebuild.

## ADR 007 — Local preview and runtime separation

Native web uses 3001 because 3000 was occupied; Caddy preserves the public local URL
at port 4320. Containers keep port 3000 internally. The M0 studio and gallery are
request-rendered, guarded by local fixture mode and a loopback Host. A test verifies
they return 404 in production mode with networking disabled.

The web container has no database credentials, token pepper or media volume. Font
files are bundled from licensed, pinned Fontsource packages. A full staff guard
replaces the temporary local preview gate in M2.

## ADR 008 — Dependency maintenance

Pin compatible core packages and images; introduce later provider/job dependencies
when their implementation starts. The documented Prisma transitive overrides close
the initial audit findings while retaining the blueprint's Prisma 7 requirement.
See `docs/DEPENDENCIES.md` for versions, advisories and removal criteria.

## ADR 009 — Verify audio locally before identity and live admission

M1 adds independent audio processing and provider lifecycle interfaces, original
synthetic text scenarios, and a local feasibility lab. Microphone input remains
local in fixture mode. Speech clips and live provider credentials are unavailable;
scripted answers are text-only and the standalone speaker check uses a labelled
generated tone. The live SDK adapters, region/voice availability, recognition,
generation and synthesis quality are explicitly unverified and not presented as done.

Use an abortable, size/concurrency/deadline-bounded HTTP NDJSON endpoint for this
temporary experiment. Its host/origin/configuration gates prevent public exposure.
It does not add session records, release retrieval, tools or unauthenticated live
speech routes. M2 replaces the temporary studio gate with staff identity; the later
conversation runtime adds the specified authenticated Socket.IO protocol.

## ADR 010 — One owner for capture, playback and answer cancellation

Capture uses the actual AudioContext sample rate, a causal 63-tap low-pass filter
and continuous-phase conversion to 16 kHz before PCM16 framing. Playback uses a
bounded ordered 24 kHz queue at the context's output rate. The worklet and unit
tests share the same processing implementation; copied assets are build outputs.

A generation counter is invalidated before its AbortController fires. End,
language change, hidden/disposed pages and terminal audio errors release owned
tracks, nodes, ports and contexts. Permission granted after cancellation is
immediately released. Stream sequence failures produce retry guidance. No late
response is accepted as part of a newer generation.

## ADR 011 — Light professional studio and free-tier demo providers

Accepted 2026-09-08 from the user's revised direction. White surfaces, slate text,
muted purple controls and a restrained lavender gradient replace the original
dark/cyan palette. Existing typography, accessible components and responsive
layout constraints remain the foundation.

The user's free-demo requirement supersedes the blueprint's fixed OpenAI choice:
prepare Gemini free-tier generation with Azure Speech F0 for both locales. Keep
one recognition/generation/synthesis pipeline and its cancellation contracts.
`GENERATION_PROVIDER=gemini` is the default; OpenAI requires explicit selection.
Provider accounts, SDK adapters, real tier/voice availability and the bilingual
live evaluation remain pending. Configuration does not prove a key is on a free
billing plan. The user selected account setup instructions, now recorded in
`docs/FREE-DEMO-SETUP.md`. No paid fallback or account upgrade is authorized.

## ADR 012 — Transactional staff identity and scoped recovery

Use opaque random session credentials with purpose-separated HMAC digests and
asynchronous bounded scrypt password derivation. Resolve live membership inside
the same serializable transaction as each domain operation. Retry serialization
conflicts without changing session or tenant authority. Composite membership/
organisation relationships apply to session, grant and audit records.

Invitations to existing users require their current password. A tenant owner cannot
issue or consume password recovery for another user with memberships outside that
tenant. A regression test demonstrated the otherwise possible cross-tenant account
takeover. Own-account recovery remains available to an authenticated owner;
multi-organisation recovery is available through the guarded local CLI (ADR 014).
See `docs/M2-IDENTITY.md` for the implemented scope.

## ADR 013 — Staff HTTP authority and browser session ownership

Replace the M0 studio preview gate with a server-resolved opaque staff cookie.
Experimental voice/gallery pages keep their additional local-only restriction.
This supersedes the unauthenticated studio behavior recorded in ADRs 003 and 007.
The web app receives no database credentials or auth pepper. Server session reads
use the configured internal API and gateway Host with bounded native HTTP, because
the pinned Node fetch implementation rewrites a caller-supplied Host header.

Require exact Origin and session-bound CSRF for authenticated mutations. Keep the
CSRF token attached to the rendered workspace rather than fetching a replacement
just before submission: after a cookie rotates in another tab, the old form must
fail instead of changing the newly selected organisation. Session changes discard
the router cache and audio resources. Background polls do not renew idle expiry.

Use atomic Redis quotas with HMAC-digested subjects, a process-local cap on expensive
password operations, and failure-closed admission. Trust one proxy hop only on the
unpublished Compose API behind Caddy; native development trusts none. HTTP tests
import compiled Nest code so DTO metadata matches the actual production runtime.

## ADR 014 — Local credentials and explicit recovery

Generate distinct random passwords for fictional demo accounts into one ignored,
private setup file before the seed transaction. Repeated seeds preserve identities,
passwords and changed membership access. Conflicting identities, altered credential
inventories or a missing file after seeding fail without inventing replacement keys.
The Compose seed shares the host file using the local UID/GID; running application
services do not mount it. Recovery is a guarded local CLI with a separately written
one-time password file, session/grant revocation and access-state preservation.
Audit rows explicitly distinguish LOCAL from STAFF actors with a database constraint.

## ADR 015 — Scoped drafts before immutable releases

The bot domain reuses transactional staff authority and requires explicit revisions
for save, archive and restore. A bot/draft composite foreign key enforces tenant
identity. Domain schemas also supply OpenAPI shapes, avoiding separate authoring
DTO definitions that can drift. Full bilingual payloads have a route-specific 64 KiB
limit. Use an explicit reversible archive endpoint while only drafts exist; actual
deletion and release/media reference policy will be implemented with those resources.

The editor saves explicitly, retains both language buffers and preserves local text
on conflict. It does not automatically adopt a new revision to force a stale save.
Readiness, knowledge approval and published versions will derive from persisted
resources when those subsequent authoring increments are implemented.

## ADR 016 — Versioned knowledge review and release inclusion

Keep entry approval separate from inclusion in the next release. Changing inclusion
does not alter the reviewed content; saving text resets approval to DRAFT. Require
both translations before approval, while permitting incomplete draft saves. Store
the approving membership and date under an organisation-scoped composite foreign
key. Approval is a staff review record, not a claim of automated fact verification.

Every entry mutation increments its revision and the root bot revision atomically.
This gives later release assembly one draft revision that also covers knowledge
changes. Explicit expected revisions prevent approving or deleting a version that
another author has changed. Draft deletion retains audit history; release snapshots
will copy approved content independently of mutable entry records.

## ADR 017 — Retry known serialization failures at query and commit boundaries

The pinned Prisma pg adapter can raise a raw `DriverAdapterError` with cause kind
`TransactionWriteConflict` when PostgreSQL rejects COMMIT. Query conflicts normally
arrive wrapped as Prisma P2034. A deterministic integration race demonstrated that
handling P2034 alone lets commit conflicts escape as HTTP 500.

Recognize both exact conflict forms under the existing maximum of three retries.
Rerun the whole transaction, including session, membership and revision checks.
Do not retry unrelated adapter errors or perform external side effects within the
transaction callback. The regression synchronizes two predicate reads and inserts,
forcing the conflict at commit, and verifies both operations complete without
duplicate rows after the losing transaction retries.

## ADR 018 — Private media inspection before READY publication

Separate reservation, bounded byte receipt, inspection and database publication.
Receiving completion rechecks current staff authority. Inspection outputs use
generated asset/lease keys and never overwrite another attempt's files. Database
state, leases and conditional completion will remain authoritative over queue jobs.
Preserve private files when commit acknowledgement is uncertain; reconcile later.

Re-encode images and regenerate their thumbnails. Inspect H.264/AAC MP4 metadata
without transcoding or exposing quarantine. Use an unprivileged Linux
Landlock/seccomp helper for ffprobe, with narrow runtime-loader permissions and
bounded processes, output and resources. Missing sandbox support fails closed.
Native development is an explicit configuration choice rejected in production.
See `MEDIA-INSPECTION.md` for current implementation boundaries and tests.

## ADR 019 — Space serialization retries under concurrent staff activity

The full media browser gate observed an exhausted P2034 retry during bot creation.
A PostgreSQL regression reproduced failed requests when twelve independent bot
creates used one staff session. Immediate retries repeatedly collided with the
same competing transactions.

Retain three retries and the exact conflict classification from ADR 017. Add
exponential delay with independent jitter: 50–99 ms, 100–199 ms and 200–399 ms.
Delay occurs after rollback and outside the transaction. Each attempt still
resolves current staff authority and rechecks revisions; there is no access cache
or change to session expiry. The regression verifies all twelve bots and audits
exist exactly once, plus denial after session revocation. Other errors still
propagate, and an exhausted retry budget remains an error.

## ADR 020 — Scoped presentation ordering and READY media references

Presentations and slides belong to a bot and organisation through composite foreign
keys. BotDraft selection includes the bot ID as well as organisation ID, so another
bot's presentation cannot be selected even inside the same organisation. Child edits
advance both presentation and root bot revisions for later consistent release assembly.

Use a deferred unique constraint on `(presentationId, position)` while applying a
complete reorder. The API requires the exact current ID set and revision before any
position changes. The transaction commits only a unique, bounded order; deleting a
slide compacts it and advances the revisions of moved slides. PostgreSQL's
[constraint timing](https://www.postgresql.org/docs/17/sql-set-constraints.html)
supports checking this uniqueness at transaction completion.

Make an optional slide media reference include `(mediaId, organisationId, mediaState)`.
A check constraint requires both media fields to be null or the state to be explicitly
READY. The referenced asset key includes its state, with RESTRICT on update and delete.
This protects files at the database boundary: attaching an unready or foreign asset
fails, and a referenced READY asset cannot enter DELETING while a worker could remove
its bytes. Application checks return actionable errors; concurrent direct writes remain
subject to the same constraints. Release snapshots must extend this protection later.

## ADR 021 — Extend the measured session contention retry budget

The presentation integration gate repeatedly reproduced a P2034 failure in the existing
twelve-request same-session authoring test. The three retries from ADR 019 still exhausted
under local database latency because every mutation updates the same session activity row.

Allow five retries, keeping the existing exponential backoff with independent jitter,
exact conflict classification and full transaction rerun. Delays range from 50–99 ms
through 800–1,599 ms, with total retry sleep bounded below 3.1 seconds. This changes no
authority, idle expiry or revision rules. The operation can still fail once the budget
is exhausted; unrelated errors are never retried. A deterministic regression injects
five conflicts, proves one bot and audit commit, checks failure after six attempts and
revokes the session during a retry to verify authority is resolved again.

## ADR 022 — Immutable release captures with matching projections

Capture one root draft revision under serializable staff authority and a bot row
lock. Allocate published versions from a separate counter; previews use null
versions and a 30-minute admission deadline. Neither changes the draft revision or
its modification time. Snapshot object keys are canonicalized for SHA-256, with
array order and original bilingual text preserved. Publication always requires
approved selected knowledge; staff previews may freeze selected DRAFT content for
testing and retain that status explicitly.

Keep safe idempotency results as release references, scoped by membership and
operation, with hashed keys/requests and a 24-hour lifetime. Replays recheck current
authority but do not reread the changed draft. Separate sessions sharing a key
return the same capture; different requests sharing a key conflict.

Generate immutable, snapshot-matching per-locale knowledge projections and media
references in the same transaction. Deferred completeness checks prevent partial
assembly. Media foreign keys include READY state, SHA-256 and length; draft deletion
cannot remove files retained by a release. Preserve history with restrictive bot
and idempotency relations. Future runtime/history references and retention jobs
extend this boundary; they are not implemented by the capture service.

Search only the pinned projection, using English full-text search and bilingual
trigrams/exact matching. Normalize full-text rank below exact-match tiers. Charge
all returned passage text, including title/question/newlines, against one 6,000
Unicode-code-point budget. See `RELEASES.md` for limits and outstanding integration.

## ADR 023 — Recognize raw SQL write conflicts without broad retries

The multi-session preview regression exposed a PostgreSQL row-lock serialization
failure wrapped as Prisma P2010. The installed pg adapter places the exact
`DriverAdapterError` / `TransactionWriteConflict` in `meta.driverAdapterError`,
rather than the older top-level `meta.code` shape. Recognize this verified wrapper
in addition to the existing P2034 and direct commit-conflict forms.

Keep the five-retry budget, jitter and fresh authority checks from ADR 021.
Constraint failures and unrelated raw-query errors propagate without retries. A
focused PostgreSQL regression raises SQLSTATE 40001 and 23514 to verify that
distinction; the release regression also runs concurrent requests through two
separate authenticated sessions.
