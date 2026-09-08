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
multi-organisation local recovery tooling is pending. See `docs/M2-IDENTITY.md` for
the implemented scope and remaining local recovery tooling.

## ADR 013 — Staff HTTP authority and browser session ownership

Replace the M0 studio preview gate with a server-resolved opaque staff cookie.
Experimental voice/gallery pages keep their additional local-only restriction.
This supersedes the unauthenticated studio behavior recorded in ADRs 003 and 008.
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
