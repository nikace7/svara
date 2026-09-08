# Implementation progress

Updated 2026-09-09. Evidence is local unless explicitly marked otherwise.

| Milestone                                | State       | Evidence / remaining work                                                                                          |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| M0 — Workspace and component foundation  | Complete    | Local native and production-container setup verified; health, builds, contracts and accessible gallery pass.       |
| M1 — Bilingual voice feasibility         | Partial     | Local fixture lab and audio/protocol checks pass. Live adapters and bilingual provider smoke tests remain pending. |
| M2 — Identity and tenant boundaries      | Complete    | Staff domain, HTTP, Redis limits, browser flows and guarded local seed/recovery verified.                          |
| M3 — Authoring and immutable publication | In progress | Bot drafts, bilingual knowledge and the media library implemented; presentations and immutable releases remain.    |
| M4 — Devices and dual displays           | Not started | Pairing, grants and release application pending.                                                                   |
| M5 — Schedules and commands              | Not started | Conflict checks, outbox and reconciliation pending.                                                                |
| M6 — Conversations and public assistant  | Not started | Grounding, tools, admission and visitor grants pending.                                                            |
| M7 — Analytics and operations            | Not started | Measured analytics, retention and recovery pending.                                                                |
| M8 — Evidence and handoff                | Not started | Final evaluations, screenshots and walkthrough pending.                                                            |

## Initial inspection

- Workspace contained only `docs/01-robot-voice.md`, with no Git repository or code.
- Docker daemon and Compose are available.
- Host Node is 24; project commands use the pinned Node 22 runtime.
- Existing Git author identity is configured and preserved.
- No provider keys have been loaded, no provider calls made, and no remote created.

## Active project objective

Complete all milestones step by step with Conventional Commits. The current user
request changes the visual direction to a professional light background with a
subtle purple gradient and asks for free demo APIs. The remaining M3–M8 scope is
unchanged. Missing provider accounts do not block independent product development.

## Scope of this build increment

The first increment completed the M0 foundation. The second implements M1's local
audio and fixture paths, while retaining an explicitly pending live gate. Later
milestones retain their status above. M2 includes real HTTP/browser staff
authentication and safe local provisioning. M3 includes bot drafts, knowledge and
the media library with durable inspection/cleanup and authenticated streaming.
Live voice remains pending account setup and provider adapters.

## M0 delivered

- Three applications and seven shared packages in a pinned pnpm workspace with
  strict TypeScript and enforced browser/server import boundaries.
- Validated settings, non-overwriting secret generation, safe local migration and
  test targets, initial PostgreSQL schema and idempotent synthetic organisation seed.
- Real API/worker health and Redis heartbeat, generated OpenAPI/HTTP types, and
  versioned event schemas. No fabricated business endpoints or operational metrics.
- Responsive studio shell and button/field/status/table/dialog gallery using Svara
  tokens, bundled licensed fonts, keyboard support and visible validation states.
- Native development and full Compose launch paths, CI definition, dependency audit
  remediation, Git conventions and operations/API/architecture documentation.

## Verification evidence — 2026-09-08

| Check                    | Result                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`             | Passed formatting, lint, types, unit coverage, contract drift and all production builds                                                            |
| Unit tests               | 40 passed across 5 files                                                                                                                           |
| Foundation coverage      | 91.48% lines / 85.29% branches for the explicitly selected safety, configuration, contract and readiness modules; not whole-application coverage   |
| Integration tests        | 7 passed on native infrastructure and inside the built Linux container; real PostgreSQL constraints/Unicode/idempotent seed and HTTP behavior      |
| Playwright               | 10 passed against the production Compose stack, including axe checks, keyboard/focus, validation/search, unavailable health and responsive layouts |
| Viewports                | 360×800, 768×1024, 1440×900, 1920×1080 and 1080×1920; no horizontal overflow                                                                       |
| Production preview guard | Studio and gallery return 404 in production mode in a network-disabled container                                                                   |
| `pnpm audit`             | No known vulnerabilities in installed dependency groups at verification time                                                                       |
| Full Compose startup     | Migration/seed exit successfully; web, API, worker, PostgreSQL, Redis and Caddy healthy                                                            |
| Exact `pnpm dev` startup | Passed on Windows; all four API dependency checks ready; studio/gallery return 200                                                                 |
| Secret checks            | Generated configuration, media and Prisma client ignored; repository history scanned with Gitleaks                                                 |

Screenshots were captured from the real application in ignored
`artifacts/screenshots/` and reviewed at desktop/mobile sizes. These are M0 evidence,
not the later voice/device demonstrations. CI commands were exercised locally;
the GitHub workflow has not run remotely. No remote has been configured or pushed.

The Windows startup check exposed a worker watch launcher that did not launch the
process under coordinated development. Using Node's watch mode with the tsx import
hook restored startup and dependency-triggered restart; both were observed.

## M1 local increment — 2026-09-08

Implemented `/studio/voice-lab`: explicit English/Nepali scenarios, typed fixture
notice, Unicode subtitles, interruption, stage timings and readable failure states.
Microphone PCM remains local; a generated tone checks actual worklet playback.
No speech recording is bundled, so scripted answers are labelled text-only.

The shared audio core handles streaming low-pass resampling, PCM byte order and
3,200-byte input batches, output order/capacity, generation invalidation and Unicode
sentence segmentation. Provider interfaces and original synthetic scenario data
are server-only. An input-, concurrency- and deadline-bounded local HTTP stream
honors backpressure and disconnect cancellation.

| Check                                             | Result                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                      | Passed format, lint, types, coverage, contract drift and production builds                                                                                         |
| Unit suite                                        | 81 tests across 14 files passed                                                                                                                                    |
| Selected foundation/audio/fixture module coverage | 97.77% lines / 93.30% branches; excludes React rendering, worklet glue and HTTP glue, which are exercised through integration/browser tests                        |
| Integration suite                                 | 11 tests passed in the rebuilt Linux container, including admission capacity and disconnect recovery                                                               |
| Browser suite                                     | All 16 tests passed against rebuilt production containers                                                                                                          |
| Real browser audio processing                     | Chromium synthetic input produces 3,200-byte worklet frames; no POST uploads; language changes, End and navigation close tracks and contexts                       |
| Speaker processing                                | 24 kHz PCM tone played through the worklet queue; completion reported by the processor                                                                             |
| Error paths                                       | Denied/unsupported microphone, late permission grant, interrupted/stale streams, quota/speech errors, malformed/oversized input, cross-origin/host denial verified |
| Production denial                                 | Studio, gallery and voice lab return 404 in production mode; API route is absent when local access is disabled                                                     |
| Dependency audit                                  | No known vulnerabilities; no new external dependency was needed                                                                                                    |
| Fresh production walkthrough                      | No browser console errors; desktop Nepali and mobile screenshots reviewed                                                                                          |

Screenshots: `artifacts/screenshots/m1-voice-lab-desktop.png` and
`artifacts/screenshots/m1-voice-lab-mobile.png` (ignored local evidence).
No real microphone recording, provider request, remote CI run, push or public deployment
was performed. Full Compose services are healthy at `http://localhost:4320`.

## Remaining M1 gate and next independent increment

Azure key/region and Gemini key are not configured; `ALLOW_LIVE_EVAL` is false. The live
SDK adapters, region/voice availability and actual English/Nepali STT → generation
→ TTS smoke results are still pending. M1 is therefore not marked complete.
Hands-free interruption and speaker feedback need the intended physical setup.
See `docs/M1-VOICE.md` for the precise scope. M2 can independently add staff identity
and tenant enforcement before any hosted studio access.

## Light theme and M2 domain increment — 2026-09-08

- Replaced dark/cyan tokens with white surfaces, slate text, accessible muted
  purple controls and a subtle lavender workspace gradient. The full 16-test
  browser suite passed on the rebuilt light-theme app; desktop/mobile screenshots
  were reviewed.
- Added registration, session/role policies, organisation switching, invitations,
  recovery, last-owner protection and audit storage at the domain/database layer.
  Eleven new PostgreSQL integration tests pass. A dedicated RED/GREEN regression
  closes cross-tenant account takeover through owner-issued recovery.
- Default generation configuration now selects Gemini without requiring an OpenAI
  key. Both live provider adapters and billing-tier verification remain pending.
  The user has neither provider account yet and selected written setup instructions.
  See `docs/FREE-DEMO-SETUP.md`.
- Next: M2 cookie/CSRF/Origin/rate-limit HTTP layer, generated contracts and staff
  onboarding/settings screens. Then continue M3–M8 in order. See `docs/M2-IDENTITY.md`.

Verification for this increment:

| Check                    | Result                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`             | Passed format, lint, all types, contract drift and all production builds                                             |
| Unit suite               | 89 tests across 16 files passed                                                                                      |
| Selected module coverage | 98.02% lines / 93.60% branches; database identity service is exercised separately through integration tests          |
| Integration suite        | All 22 passed both natively and in the rebuilt Linux container                                                       |
| Browser suite            | All 16 passed on the light-theme build; all five responsive/axe checks passed again after refining the gradient fade |
| Production preview gate  | Studio/gallery/voice lab remain unavailable in production mode                                                       |
| Compose                  | New migration and seed complete; all six long-running services healthy                                               |
| Dependency audit         | No known vulnerabilities                                                                                             |

Final screenshots reviewed: `artifacts/screenshots/light-studio-desktop.png` and
`artifacts/screenshots/light-studio-mobile.png`. Conventional Commits on
`feat/light-theme-identity` preserve each test/implementation checkpoint. The
original supplied blueprint files are unchanged. No provider call, account
creation, remote push or hosted deployment was performed.

## M2 HTTP and staff browser increment — 2026-09-08

- Connected the domain to Nest staff endpoints, strict validated DTOs, safe errors,
  host-only cookies, exact Host/Origin and CSRF checks, generated OpenAPI and Redis
  quotas. Admission fails closed when Redis cannot answer.
- Added light-theme registration/login, activation/recovery, staff-only studio,
  organisation settings, member management, invitations, role-aware controls,
  workspace switching and logout. Local gallery/lab restrictions remain in addition
  to staff authentication; the fixture stream revalidates sessions during output.
- Closed two regressions with failing tests and separate implementation commits:
  background session polling must not extend idle expiry, and stale forms must
  retain their original CSRF authority after another tab changes the active cookie.
- Kept provider setup in fixture mode. The free account guide is ready; no Azure,
  Gemini or OpenAI call or account creation occurred.

Verification includes real PostgreSQL/Redis/API tests in the built Linux image,
browser journeys against Compose and a network-disabled production guard check.
The browser suite retains the audio cleanup, accessible dialog and responsive
layout checks from earlier increments. Selected unit coverage does not represent
coverage of all React or database code; those layers use integration/browser tests.

| Check                   | Result                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | Passed formatting, lint, types, contract drift and all production builds                                    |
| Unit suite              | 92 tests across 17 files passed; selected modules retain 98.02% line / 93.60% branch coverage               |
| Linux integration suite | 30 tests across 6 files passed against guarded PostgreSQL and Redis                                         |
| Browser suite           | All 21 journeys passed; latest build passed 20 together, with the quota-denied journey passing after expiry |
| Production guard        | Studio redirects to sign-in; experimental pages remain denied in a network-disabled container               |
| Dependency audit        | No known vulnerabilities at verification time                                                               |
| Compose                 | All six long-running services healthy after rebuilding staff authentication                                 |

Reviewed screenshots: `artifacts/screenshots/m2-login-1440.png`,
`artifacts/screenshots/m2-login-360.png` and `artifacts/screenshots/m2-settings-mobile.png`.

An extra repeated browser run reached the real 30/IP credential quota and displayed
Retry-After. The quota stayed enabled; the denied journey was rerun after expiry.
No rate-limit keys or application data were reset to make tests pass.

The remaining local staff tooling from this increment was delivered below.
M3–M8 and live M1 provider validation remain on the active project goal.

## M2 completion and M3 draft increment — 2026-09-08

M2 is complete for the resources implemented so far. Five fictional staff accounts
span all four roles and two organisations. Their distinct random passwords live in
an ignored private local file. Native and Compose seeds reuse it without overwriting
changed accounts or inventing missing replacement passwords. The guarded recovery
CLI revokes sessions and grants while preserving disabled/enabled access. LOCAL
audit actors are distinguished from STAFF actors by database constraints.

M3 now has scoped, persisted bot drafts and a strict generated HTTP contract. Reads
and writes resolve current staff authority within the domain transaction. Required
revisions prevent concurrent overwrites. Archive/restore preserves the draft. The
light-theme editor supports bilingual buffers, explicit saving, read-only roles and
conflict recovery that retains local text until the author chooses to discard it.
See `docs/M3-AUTHORING.md` for the remaining authoring/publication scope.

- M2 local tooling: 95 unit tests and 34 integration tests passed; the integration
  suite ran natively and in Linux. A browser journey signed in all five seeded roles.
- M3 draft code: `pnpm check` passed, including 97 unit tests, contract drift checks,
  type/lint/format checks and all production builds. All 42 integration tests passed
  on native infrastructure and in Linux. One additional safe diagnostic test then
  passed with the five-test HTTP foundation group on both runtimes (43 distinct
  integration tests verified across these runs).

Browser verification: the full production run passed all 22 existing journeys. The
three new bot journeys passed after correcting a selector that matched both a
region and a text field, scoping selectors to their language panels during tab
transitions, naming the editor's complementary landmark, and waiting for confirmed
archive success before navigation. All 25 distinct journeys have passed across
these runs. New checks include role-read-only controls, direct HTTP write denial,
two-tab revision conflicts, explicit discard confirmation and mobile archive/search.

The initial archive request returned one HTTP 500. Its cause was not captured by
the previous minimal logs and has not reproduced in subsequent archive runs. This
remains an open diagnostic observation, not a claimed root-cause fix. Server logs
now retain bounded Prisma error codes with request IDs, with a regression test
ensuring exception details never reach logs or client responses. No further failed
requests appeared in the rebuilt API's logs during the final bot journeys.

The rebuilt Compose stack has six healthy long-running services. Migration and seed
jobs succeed and preserve existing generated credentials. The network-disabled
production guard test passes. Desktop/mobile screenshots were reviewed at
`artifacts/screenshots/m3-bot-editor-desktop.png` and
`artifacts/screenshots/m3-bot-editor-mobile.png`. The final UI/diagnostic changes
passed type/lint/format checks and the Linux production build.

No live provider call or account creation was made. The supplied specification
files remain unchanged. No remote has been configured or pushed.

## M3 bilingual knowledge increment — 2026-09-08

FAQ and reference entries now have scoped storage, generated HTTP contracts and
light-theme studio screens. Authors can save incomplete translations, review both
languages, approve a specific revision and choose release inclusion independently.
Text edits clear approval; inclusion changes preserve it. Entry mutations increment
the root bot revision, archived bots are frozen, and conflicting saves keep local
text until explicit discard. Lists support title search, review/type filters and
pagination. Deleting a draft entry preserves its audit record.

Migration 006 adds composite organisation foreign keys and approval consistency
constraints. The API enforces staff authority, JSON/Origin/CSRF, quotas, strict input
and explicit revisions. Both full Unicode payloads and missing-translation errors
are covered by HTTP tests. See `M3-AUTHORING.md` and ADR 016 for the data model.

The first complete browser run passed 25 of 27 journeys, including both new
knowledge journeys and their accessibility checks. Two failures prompted separate
regressions and fixes:

- A deterministic PostgreSQL race reproduced a raw pg adapter conflict raised at
  COMMIT, outside the previous P2034-only retry. The shared transaction boundary now
  recognizes that exact conflict kind under the existing three-retry bound and
  reruns current authority and revision checks. ADR 017 records the evidence. This
  fixes the reproduced failure path; the exact exception from the earlier archive
  request was not retained, so its historical attribution remains unconfirmed.
- The viewer browser test inherited the worker's owner cookie. Its sign-in then
  correctly revoked the owner's session, causing the following overview test to
  redirect. Explicit empty storage isolates the second actor. An added assertion
  verifies the original owner remains signed in. No application access rule was
  relaxed to make the test pass.

After those fixes, `pnpm check` passed formatting, lint, types, all 100 unit tests,
contract drift and production builds. All 53 native integration tests passed,
including the new commit-time race.

Final rebuilt-image verification passed all 53 Linux integration tests and all 27
browser journeys together. The network-disabled production guard also passed.
All six long-running Compose services are healthy; migration and seed jobs completed.
The rebuilt API logged no failed requests during the final full browser run.
Desktop and mobile screenshots were reviewed at
`artifacts/screenshots/m3-knowledge-editor.png` and
`artifacts/screenshots/m3-knowledge-mobile.png`. No live provider call, account
creation or remote push was performed. The original supplied blueprints are unchanged.

Live provider adapters, accounts and the bilingual live gate remain pending. Media,
presentations, releases and query inspection against a pinned release are the next
M3 work. Approval and inclusion alone do not publish content or drive the Voice lab.

## M3 media storage and inspection foundation — 2026-09-08

Media reservations, exact streaming receipt, scoped metadata, current-authority
completion checks and revision-aware deletion requests are implemented. Private
UUID keys, checksums and quarantine states prevent uninspected files from becoming
available. Migrations 007/008 add tenant constraints, leases, inspection metadata,
READY/rejection invariants and SYSTEM audit actors. See `MEDIA-INSPECTION.md`.

The standalone inspector now re-encodes JPEG/PNG with orientation and metadata
stripping, produces bounded PNG thumbnails and validates H.264/AAC MP4 metadata.
Input signatures, source integrity, dimensions, duration, parser time and process
output are bounded. Existing outputs are preserved; failed attempts clean only
their own generated outputs. Sharp and BullMQ are pinned, and native development
now compiles child inspection programs when source changes.

ffprobe runs through an unprivileged Linux Landlock/seccomp helper in the demo
image. Its real runtime regression verifies denied file/network/process access
and successful inspection of a generated H.264 clip. The first Linux clip test
identified an ELF-loader execute denial; a separate regression/fix pair added the
specific loader permissions while retaining the other restrictions. Native Windows
uses an explicit development mode; production configuration requires the sandbox.

Verification completed:

- `pnpm check` passed format, lint, types, contracts, production builds and the
  then-current 115 unit tests. Subsequent test additions passed their format,
  lint/type checks and all **120 unit tests**. Coverage now includes media contracts,
  storage, ranges, metadata policy and process supervision: **97.87% lines and
  93.61% branches** across the configured source subset, not the whole application.
- All **63 integration tests** passed natively and in the rebuilt Linux demo,
  including real image processing and sandboxed video inspection. The 19 focused
  media unit tests also passed in a restricted Linux container.
- The sandbox runtime gate and network-disabled production preview guard passed.
  All six long-running demo services are healthy; migration and seed jobs succeeded.
- Dependency audit found no known vulnerabilities. A history scan through the
  implementation/docs checkpoint covered 92 commits with no detected secrets.
  Supplied blueprints remain unchanged; no provider call or remote push was made.

This increment does **not** complete the media feature. The worker still runs its
health/heartbeat loop. Durable job claims and conditional READY publication,
reconciliation, expired/orphan/deletion cleanup, scoped upload/range handlers and
the studio media library are the next M3 work. No new UI was introduced in this
increment; the previous 27-journey browser result remains the last full UI gate.
Presentations, immutable releases and subsequent milestones remain on the active goal.

## M3 durable media worker — 2026-09-08

The worker now discovers quarantined uploads from PostgreSQL, processes BullMQ
notifications and conditionally publishes READY metadata under a current lease.
Duplicate notifications, expired claims, stale output and lost commit acknowledgement
are covered by integration tests. Inspection and audit state commit together.
Cleanup expires abandoned uploads, removes deletion requests and scans bounded
batches of aged generated orphan files while preserving active and referenced files.
A regression corrected the retention anchor to completed receipt, giving a late
upload its full 24-hour quarantine window.

Actual PNG and H.264 processing probes gate worker readiness. A missing parser leaves
liveness available, pauses inspection and lets the heartbeat expire. Retryable parser
failure pauses the consumer immediately so other queued uploads retain their attempts.
Redis outage tests use a local relay to interrupt only test connections and verify
recovery both at startup and after readiness. Graceful shutdown cancels inspection
before closing dependencies; Compose's 30-second grace exceeds the worker's 25-second
deadline. Queue and heartbeat namespaces are validated and shared by API/worker.

The first queue integration exposed a producer startup command issued before Redis
was ready. Waiting for connection initialization, while keeping reconciliation
nonblocking when disconnected, restored recovery. Separate RED/GREEN commits retain
this work and the parser-pause regression on `codex/feat/media-authoring`.

Verified at this checkpoint:

- `pnpm check` passed formatting, lint, types, all **121 unit tests**, contract drift
  and production builds. Configured-subset coverage is **96.50% lines / 90.49% branches**;
  it does not represent whole-application coverage. Database/queue orchestration is
  exercised by real integration tests.
- All **81 integration tests** passed natively and in the rebuilt Linux image,
  including the compiled worker process, durable claims, cleanup and queue recovery.
- Sandbox restrictions and actual H.264 inspection passed in the restricted image.
  The network-disabled production preview guard passed.
- The browser overview/readiness journey passed against the rebuilt demo. There are
  no UI changes in this increment; the preceding full **27-journey** browser gate
  remains the last complete UI run.
- All six long-running Compose services are healthy; migration/seed completed.
  Native database/Redis ports are closed again by the demo configuration.
- Dependency audit found no known vulnerabilities. Gitleaks scanned all 106 commits
  through `6f995cf` with no detected secrets; subsequent changes are the Compose
  shutdown grace and this progress record. No account creation, provider call, remote
  push or public deployment occurred.

Media HTTP admission/upload/range serving and the studio library are next. Release
reference protection must be added with presentations/releases before those references
can exist. M1 live adapters and M3–M8 remain on the active goal. The account instructions
are available in `FREE-DEMO-SETUP.md`; the local demo stays in fixture mode.

## M3 media API and studio library — 2026-09-09

The staff API now accepts one bounded multipart upload with metadata before file
bytes, verifies exact receipt, and returns processing metadata. It retains current
session/tenant/role checks, Host/Origin/CSRF admission and private storage. Extra
form parts, content mismatches and malformed input cannot publish quarantined bytes.
READY content and thumbnails support authenticated HEAD, byte ranges and If-Range;
foreign IDs return not found. Deletion is revision checked and completed by the worker.
OpenAPI and generated HTTP types describe these routes.

`/studio/media` adds real uploads, processing/rejection feedback, filename/type/status
filters, pagination, private image/video previews and confirmed removal. Owners and
administrators author; operators and viewers inspect. Upload cancellation and leaving
the page stop the client request. The responsive layout uses the light studio palette
and a subtle purple upload panel. Screenshot review reproduced thumbnail overflow
that obscured filenames and an incorrect breadcrumb; separate regression/fix commits
corrected both. Preview dialogs restore focus to the initiating button.

The first full browser gate found a P2034 failure during bot creation. A PostgreSQL
regression reproduced exhausted immediate retries with twelve independent creates
using the same staff session. Three bounded delays with jitter now let competing
commits finish while retaining transactional authority, revision checks and expiry.
The regression verifies twelve bots and twelve audits, plus revocation denial.
ADR 019 records the retry policy. The failing and passing stages remain separate
Conventional Commits; test retries and admission limits were not relaxed.

Verified at this checkpoint:

- `pnpm check` passed formatting, lint, types, **123 unit tests**, contract drift and
  all production builds. Configured-subset coverage is **96.50% lines / 90.49% branches**;
  this does not represent whole-application coverage.
- All **87 integration tests** passed natively and inside the rebuilt Linux image.
  New coverage includes real multipart/private range serving and concurrent staff
  authoring, alongside the existing database, worker and recovery checks.
- All **29 browser journeys** passed against the rebuilt demo, including both new
  media flows, actual image decoding, HTTP 206 video playback, rejection/removal,
  focus restoration, axe checks and mobile layout. The API logged no failed requests
  during this final complete run.
- The restricted media sandbox gate and network-disabled production preview guard
  passed. All six long-running Compose services are healthy; migration/seed succeeded,
  and only the local gateway port is exposed.
- Dependency audit found no known vulnerabilities. Gitleaks scanned the eight
  implementation commits since `d3f4eb8` through `1bc1ff7` with no detected secrets.
  Subsequent changes at this checkpoint are documentation only.

Desktop/mobile media screenshots were reviewed in
`artifacts/screenshots/m3-media-library.png` and
`artifacts/screenshots/m3-media-mobile.png` (ignored local evidence). The original
supplied blueprints and existing local credentials are preserved. No account was
created, provider called, remote configured or push performed.

The next M3 increment is presentation authoring: scoped presentations and ordered
bilingual slides, primary/secondary targets, media references and a real canvas.
Add reference protection before slide/release references can exist. Immutable
preview/published snapshots and release-local query inspection follow. Live M1 and
M3–M8 remain on the active goal; missing provider accounts do not block this work.
