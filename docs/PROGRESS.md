# Implementation progress

Updated 2026-09-29. Evidence is local unless explicitly marked otherwise.

| Milestone                                | State    | Evidence / remaining work                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Workspace and component foundation  | Complete | Local native and production-container setup verified; health, builds, contracts and accessible gallery pass.                                                                                                                                                                                                                    |
| M1 — Bilingual voice feasibility         | Partial  | Live gate and lab live turns work, typed or spoken, grounded in a chosen release. Real-key browser evidence, hardware barge-in and repeated sampling remain.                                                                                                                                                                    |
| M2 — Identity and tenant boundaries      | Complete | Staff domain, HTTP, Redis limits, browser flows and guarded local seed/recovery verified.                                                                                                                                                                                                                                       |
| M3 — Authoring and immutable publication | Complete | Bilingual editing, immutable publication, retained media and reusable inspected demo content verified.                                                                                                                                                                                                                          |
| M4 — Devices and dual displays           | Complete | Pairing, tickets, /devices gateway, verified release application, kiosk/display/simulator and revocation verified by the gate test.                                                                                                                                                                                             |
| M5 — Schedules and commands              | Complete | Conflict-safe schedules, overrides, monotonic desired state, outbox, worker and board; commands reach kiosks and are acknowledged.                                                                                                                                                                                              |
| M6 — Conversations and public assistant  | Complete | Scoped admission and limits, grounded cited turns, validated tools, kiosk slides, public links and visitor grants, playground and sessions verified by the gate tests. Live tool calling awaits a real-key run.                                                                                                                 |
| M7 — Analytics and operations            | Complete | Mode-separated measured analytics with audit counts, 30-day transcript retention, verified backup/restore into a separate database, guarded demo reset, failure journeys and three-width Nepali layouts. Operations socket deferred (ADR 028).                                                                                  |
| M8 — Evidence and handoff                | Complete | Fixed 40-case bilingual evaluation through the real pipeline, acceptance matrix, seven demo-mode screenshots, walkthrough, case study and the evaluation step in CI. Every case has a completed, correct live answer, across four models; one clean `--live` run on one model, fluent Nepali review and a GitHub CI run remain. |

## M8 evidence and handoff — 2026-09-29

Built on branch `claude/m8-evidence` from `main` after M7 was fast-forwarded. See
`EVALUATION.md`, `DEMO.md`, `CASE_STUDY.md` and ADR 029.

| Check                 | Result                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm check`          | Passes: format, lint, types, 219 unit tests at 95.87% statement coverage, contract drift, builds       |
| Integration tests     | 170 passed (31 files)                                                                                  |
| Live Playwright       | 13 passed, including the Nepali public page at 200% zoom                                               |
| `eval:conversations`  | en 14/14 answerable, 2/3 unsupported safe, 3/3 actions; ne 13/14, 3/3, 3/3; 0 unauthorized, 0 invented |
| `screenshots:handoff` | Seven captures in fixture mode, each inspected; three runs in a row passed                             |
| Fresh clone           | Format, lint and types pass; unit run blocked by the Windows path limit in a deep scratch folder       |

Fixed along the way:

- the demo generator moved slides for any mention of the campus;
- a kiosk with slides but no evidence spoke ungrounded model text;
- conversation cards clipped at 200% zoom in Nepali;
- the type check needed the API build first;
- delivery history called slide commands "go idle";
- the public page hid the Nepali slide text;
- the workspace mark was a fixed "S".

Open findings at the time: en-15 and ne-12 retrieval misses, since resolved (below). Not run here: the
`--live` evaluation (no key in this session), a fluent Nepali review, and CI on GitHub.

Afterwards, 2026-09-29: `main` was pushed to `nikace7/svara` with all six open Dependabot
pull requests (#6–#11) merged. Each merge regenerated the lockfile, and the ui package's
React peer requirement was raised to 19.3.0. `pnpm check`, integration (170) and live
Playwright (13) passed on the result. The duplicate `ci.yml` added in M8 was removed and
its evaluation step moved into `ci.yaml`. GitHub has not started any CI job: the
account's Actions billing is blocked.

A fresh clone at a short path now passes `pnpm check` in full (219 tests, 95.87%), closing
the Windows path-limit gap. Releases now freeze knowledge in the order it was written
(`createdAt`, then `id`), so the public page's suggested questions are the author's first
three FAQs instead of the first three by random id.

Retrieval now compares content words (ADR 030). The evaluation is en 14/14, 3/3, 3/3 and
ne 14/14, 3/3, 3/3 with 0 unauthorized and 0 invented; en-15 and ne-12 pass, ne-12 exactly at
the 0.25 threshold. 13 of 16 held-out paraphrases are asserted in
`tests/integration/releases.test.ts`; the old query got 11. Visitor and tool queries are now
normalized before search, as staff search already was, so exact-question matches count for
them too. `pnpm check`, integration (173) and live Playwright (13) pass; one earlier
Playwright run had a single failure that did not recur in three reruns.

The development database took migrations 0011–0014 after a `pg_dump` backup, and the
Compose demo was rebuilt on current `main`. The rebuild exposed an API crash on every boot:
the device-command subscriber was a plain copy of the lazy, no-offline-queue Redis client,
so SUBSCRIBE was rejected before it connected. The e2e harness never runs `main.ts`, so no
test had reached it. The subscriber now queues SUBSCRIBE until Redis is reachable, and
startup still does not wait on Redis. Redis shows the API subscribed.

`pnpm test:e2e` against the Compose stack then failed with 429s from the real staff request
quotas, not the sign-in quota. Two workers from one IP peaked at 306 of 300 requests a
minute, and one owner per worker pushed its session past 180 a minute. The suite now runs
one worker and rotates three fixture owners across spec files. It passes 38/38 twice, with
peaks of 230/300, 130/180 and 26 of 30 sign-ins; a second full run inside 10 minutes still
exceeds the sign-in quota (README). The API limits are unchanged. The superseded local
`codex/feat/device-pairing` draft (`5fb45fc`) was deleted: its three finished commits were
already in `main` and M4 rebuilt the rest.

## Live browser test on the local stack — 2026-10-01

The Compose stack ran with a live `gemini-3.6-flash` key (passed only through the environment)
and was driven through the real UI: a paired kiosk with a second display answering in English
and Nepali and showing slides on request, the Playground, a public assistant link on a phone,
Sessions and Analytics. Every flow answered with citations; slide commands were acknowledged
by the kiosk and recorded with timings. Speech failed on some answers (`TTS_UNAVAILABLE`,
recorded as such) while the text completed.

Fixed because of it:

- **The newest kiosk answer was out of view.** The conversation log stayed scrolled to the
  first question; it now follows the newest turn.
- **Visitors saw internal tool names** ("select_reference: done"). Only the slide outcome is
  shown; staff still see every tool in Sessions.
- **A per-minute rate limit read as "did not answer".** Bursts hit the free tier's
  per-minute cap; the 429's "retry in ~30s" was waited into the 20-second round deadline. A
  backoff hint over 5 s now fails at once as `PROVIDER_QUOTA`.
- **Out-of-date copy** on the overview (pairing "not available yet", "No devices paired" with
  kiosks online), the voice lab, the bots list and the voice settings.

Known, not changed: speech for each sentence is synthesized inside the 20-second generation
round, so slow speech can push a long answer past the deadline; the per-bot voice choice is
saved but live speech uses the server's single Gemini voice. Portfolio screenshots of every
screen are in ignored `artifacts/portfolio/`.

## Live evaluation completed across models — 2026-10-01

The 22 cases still without a live answer ran on `gemini-3-flash-preview`, spread across the
three keys with the new `--cases` option. All 40 cases now have at least one completed,
correct live answer (50 in all, none unauthorized or invented), across four models and
several code versions rather than in one run.

These runs found four more defects, all fixed with tests. The model was not told which screen
each slide is for, so it asked for the map on the wrong screen. In Nepali it wrote `[S1]`
instead of calling `show_slide`, and once showed a slide nobody asked for. Retry waits
ignored cancellation and deadlines, so one turn took 50 s to fail. An authored note ("Read
room numbers … clearly") was spoken to visitors. The evaluation kiosk now heartbeats every
10 s like a real one.

`pnpm check` (224 tests, 96.06% statements), integration (173) and the fixture evaluation
(40/40) pass.

## Live evaluation and Nepali review — 2026-09-30

The fixed set ran live for the first time, on the user's free-tier keys passed only through
the environment. No run finished: the free tier allows 20 generation requests per model
per project per day, the set needs about 80, and `gemini-3.8-flash` was overloaded (503)
most of the day. Across `gemini-3.6-flash` and `gemini-3.5-flash`, 20 answers completed
(8 English, 12 Nepali) and all 20 were grounded, cited and correct. See
[evaluation](EVALUATION.md#2-live-provider-evidence).

The live runs found five defects, all fixed with tests: answers repeated after a tool call;
a spent daily quota waited out the 60-second deadline and read as an outage; the
evaluation classed quota errors as unavailable, scored failed turns as safe refusals,
counted citations as unexpected tools, and crashed on a timeout or an expired kiosk lease.
It also gained `--locale` and now retries overload twice, as the API does.

A careful non-native review corrected four Nepali wordings on visitor-facing text (the
Hindi spelling अधूरो, "सिँढी चढ्न नपर्ने", the quoted Send button, and a transliterated
"deployment"). A fluent listener's review is still needed.

Docker Desktop stopped once during a run, with no crash logged. It was restarted, and
Postgres recovered cleanly. `pnpm demo:up` alone leaves Postgres and Redis unpublished
to the host. Native tests need `compose.native.yaml` as well.

`pnpm check` (223 tests), integration (173) and the fixture evaluation (40/40) pass.

## M7 analytics, resilience and operations — 2026-09-29

Built on branch `claude/m7-operations` from `main` after M6 was fast-forwarded. See
`M7-OPERATIONS.md`, the runbooks in `OPERATIONS.md` and ADR 028.

| Check             | Result                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`      | Passes: format, lint, types, 218 unit tests at 95.87% statement coverage, contract drift, builds                          |
| Integration tests | 170 passed (31 files), including retention and analytics against PostgreSQL                                               |
| Live Playwright   | 13 passed, including analytics, microphone/autoplay/quota/offline failure journeys, kiosk offline and three-width layouts |
| Backup / restore  | Running demo backed up (18 tables, 2,439 rows, 41 media files) and restored into `svara_restore_m7check`, verified        |
| Demo reset        | Verified against a throwaway PostgreSQL container, including restoring its pre-reset backup                               |

Fixed along the way: blocked autoplay stopped answer text; kiosks took up to 45 seconds to
notice a lost network; Devanagari labels were letter-spaced apart; the sidebar always said
"Fixture mode"; conversation failures were English-only.

Not run here: the Docker demo stack and the base Playwright suite, whose stack on port
4320 is still built from an older checkout. Live timings come from the stub-provider
stack, not a real key.

## M6 conversations and public assistant — 2026-09-28

Built on branch `claude/m6-conversations` from `main` after M4 and M5 were
fast-forwarded. See `M6-CONVERSATIONS.md` and ADR 027, which records the deliberate
departures: HTTP turn streams instead of a `/voice` socket, and PostgreSQL-serialized
admission instead of a Redis lease.

| Check             | Result                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`      | Passes: format, lint, types, 216 unit tests at 95.84% statement coverage, contract drift, builds                             |
| Integration tests | 168 passed (31 files), including 11 conversation tests and HTTP tests with a real socket acknowledging a slide               |
| Live Playwright   | 9 passed, including the M6 gate: bilingual visitor until the link is disabled, kiosk slide on its display, interrupt, record |

Not run here: the Docker demo stack and the base Playwright suite, whose stack on
port 4320 is built from the main checkout. Live Gemini tool calling has only been
exercised against recorded request and response shapes, not with a real key; it joins
M1's pending real-key evidence.

## M4 devices finished — 2026-09-27

Took over the stalled device line: the earlier session's uncommitted HTTP layer
(registry, pairing and runtime tickets) is committed as-is, and its red-phase tests pass.
Added the `/devices` Socket.IO gateway, device-scoped manifests and media, the kiosk,
display and simulator pages, and the Devices studio page. See `M4-DEVICES.md`.

| Check             | Result                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm check`      | Passes: format, lint, types, 197 unit tests at 94.63% coverage, contract drift, builds          |
| Integration tests | 157 passed (29 files), including 4 new device-runtime socket and HTTP tests                     |
| Live Playwright   | 6 passed, including the M4 gate: two isolated kiosks, display mirror, failed update, revocation |

The main checkout still holds that session's uncommitted copies of these files; they
are superseded by the commits on `claude/m5-schedules` and were left untouched.

## M5 schedules and commands — 2026-09-27

Built on branch `claude/m5-schedules`, stacked on M4's three committed device commits
because every M5 table references `Device`. See `M5-SCHEDULES.md` and ADR 026.
Events, deployments, overrides, monotonic desired state and the command outbox commit
together. The worker reconciles current truth and retries commands with backoff. The
studio board (Events & Deployments) schedules, overrides, cancels and shows delivery
history in the organisation's time zone.

| Check             | Result                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Unit tests        | 192 passed, 95.69% statement coverage (M4's two red contract tests excluded)                                         |
| Integration tests | 148 passed, including 12 new schedule tests; M4's five red device-HTTP tests still fail with 404s                    |
| Live Playwright   | 5 passed: schedule, conflict, override, delivery history and end override (axe), events at 360 px                    |
| Gate checks       | Race: removing the overlap check fails the test. Boundaries, override expiry, restart and duplicate acks are covered |

`pnpm check` cannot pass on this branch until M4's device HTTP layer lands. Its lint,
type and test failures are confined to M4's own red-phase test files. Nothing reaches
a real device yet.

## Spoken questions in the live lab — 2026-09-27

"Ask by voice" records up to 15 seconds of 16 kHz PCM16 and sends it once with the turn
request; the microphone is released before the upload. The API transcribes it with
`GeminiSpeechRecognizer` before the stream opens, then grounds and answers the transcript
exactly like a typed question, so the question event shows what was heard. Recognition
failure is a 502, provider quota a 503 (the studio treats 429 as its own rate limit) and
silence a 422, each with a readable message. Only the turn route accepts the larger
700 KB body; recordings and transcripts are never stored.

Integration tests caught a real defect before it shipped: replaying a Node `Buffer` by
`slice().buffer` handed the recognizer the whole shared allocation for every frame, which
would have sent the provider corrupted audio. Frames are now copied, and the unit test
uses a `Buffer` so the old code fails it.

| Check             | Result                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Unit tests        | 175 passed (28 files), 95.53% statement coverage                                           |
| Integration tests | 126 passed (24 files): transcription, grounding, 502/503/422, odd audio and size guards    |
| Live Playwright   | 3 passed; Chromium's synthetic microphone records, uploads once and gets a grounded answer |
| `pnpm check`      | Format, lint, types, contracts and production build clean                                  |

No real-key spoken question has been run: recognition quality in either language is
still covered only by the earlier `pnpm eval:gemini` round trip.

## Playwright coverage for the live lab — 2026-09-27

`pnpm test:e2e:live` drives the live-mode voice lab in Chromium. The Compose demo is
fixture mode, so the suite starts its own stack (`tests/e2e/live-stack.ts`): the built
web app in live mode, the real API wiring against the test database, and a same-origin
gateway on port 4330. Only Gemini is stubbed, and its stub answers from the top passage
it receives, so release text can reach the page only if grounding worked. CI runs it in
the native phase, before switching to the Compose stack.

| Journey                         | Asserted                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Grounded answer, both languages | Picker selects the new preview; the request carries its `releaseId`; English and Nepali answers quote it  |
| Speech                          | Stub PCM plays through the real worklet queue to "Answer finished"                                        |
| Empty, failed, refused          | No releases disables Ask; quota shows its alert; an intercepted 410 shows its message; no 360 px overflow |
| Accessibility                   | axe finds no violations on the live lab                                                                   |

Both journeys pass. A deliberate break (dropping the retrieved passages in the built API)
fails the grounded journey on the missing room 12 text. The default `pnpm test:e2e` run
ignores this spec, since it needs a live-mode stack.

## Live answers grounded in a chosen release — 2026-09-27

Live lab turns no longer read two hardcoded campus sentences from `apps/api/src/main.ts`.
The operator picks a bot and one of its saved releases; each typed question is searched
against that release's frozen knowledge with the same `ReleaseService.search` the release
inspector uses, under the caller's own staff session, and the passages it returns are the
only reference text the model receives. Retrieval happens before the stream opens, so an
unknown or foreign release is a 404 and an expired preview a 410 rather than a broken
stream. Live mode now also requires a release service; voice providers alone no longer
expose the route.

| Check             | Result                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Unit tests        | 171 passed (28 files), 95.42% statement coverage                                                   |
| Integration tests | 124 passed (24 files), including 5 live-route tests: grounding, tenancy, expiry and route exposure |
| `pnpm check`      | Format, lint, types, contracts and production build clean                                          |
| Browser           | Pickers load the seeded Himal bots; Version 1 retrieves the room 12 admissions passage             |

The browser run used a deliberately invalid provider key: the release lookup succeeded,
then Gemini refused the key and the lab showed the readable provider failure, with no key
or provider detail in the API log. A real-key spoken answer is still the outstanding
evidence step.

## Branch lines merged — 2026-09-26

The authoring line (media library, presentations, immutable releases, demo content)
and the voice line (Gemini adapters, live gate, live lab turns) were developed
separately and are now one history: `main` fast-forwarded to the authoring tip, then
the four voice commits were rebased on top. Conflicts were confined to wiring and
documentation — `apps/api/src/app.ts` and `main.ts` (both additive), `apps/api/package.json`,
`pnpm-lock.yaml` and this file. The whole `pnpm check` chain was re-run on the result;
the counts below are from that run, not from either branch alone. Device pairing (M4)
remains on its own branch and is not merged.

## Live turns in the Voice lab — 2026-09-26

`/studio/voice-lab` runs live Gemini turns under `PROVIDER_MODE=live`, local host and
staff session only: typed question, grounded subtitles and real 24 kHz speech
playback. Microphone input stays local and is not uploaded, so browser recognition
is still pending. `docs/M1-VOICE.md` records the transport, backpressure and limits.

| Check                 | Result                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Unit tests            | 171 passed (28 files) on the merged line                                                      |
| Integration tests     | 123 passed (24 files) on real PostgreSQL, including 4 live-route tests against stub providers |
| Contract drift        | OpenAPI and HTTP types match the API                                                          |
| Lint / format / types | Clean, including the web app and root project                                                 |
| Production build      | All three applications and seven packages build                                               |

The live route tests assert ordered audio packets, segment/end framing, a readable
quota failure, refusal of fixture scenarios in live mode, the unchanged origin/host/
size/authentication guards, and a 404 when live mode is configured without providers.
They use stub providers deliberately: real provider behaviour is covered by
`pnpm eval:gemini`, and burning free-tier quota inside a test suite would make it
non-deterministic.

**Not yet verified:** no browser run with a real key has been recorded, so actual
speech playback in Chromium, autoplay behaviour and the answer/audio timing under
real latency remain unobserved. That is the next evidence step; Playwright coverage
for the live path followed on 2026-09-27.

## Live Gemini gate passed — 2026-09-25

Ran `pnpm eval:gemini` with a real free-tier key. Both locales completed the full
question → grounded answer → 24 kHz speech → 16 kHz round-trip transcript path.
Nepali answered and transcribed correctly in Devanagari. Timings, the single-sample
caveat and the six provider-contract corrections this run exposed (retired
`gemini-2.5-flash`, per-day-per-model quota, WAV container instead of raw L16,
`audioTranscription` field, CRLF SSE frames, default thinking consuming the output
budget) are recorded in `docs/M1-VOICE.md`.

Adapter fixes from those findings: WAV container parsing with format validation,
transcription-part extraction, reasoning-part filtering, CRLF-tolerant SSE parsing,
`thinkingConfig.thinkingBudget = 0`, bounded 429/503 retry honouring the server's
backoff hint, and a separate `GEMINI_STT_MODEL`. 123 unit tests pass (28 for the
adapter, 93% lines); lint, format and root typecheck pass.

Still pending for M1: the Voice lab UI remains fixture-only, latency is
REST-buffered rather than conversational, pronunciation needs a human listener, and
hands-free barge-in needs the physical setup and the Live API session.

## Gemini adapters — 2026-09-21

Gemini-only free-tier pipeline selected (ADR 011 amendment): `SPEECH_PROVIDER`,
`GEMINI_TTS_MODEL` and `GEMINI_VOICE` settings; `GeminiAnswerGenerator`,
`GeminiSpeechSynthesizer` and `GeminiSpeechRecognizer` in `@svara/providers` using
global `fetch` with the key in a header only; `pnpm eval:gemini` live gate script.
15 adapter unit tests cover prompt grounding, SSE chunking, quota/unavailable
mapping, audio-format rejection, WAV framing and cancellation. 117 unit tests pass;
lint, format and root typecheck pass. No provider call was made: no key is
configured, so live behaviour, Nepali quality and rate limits remain unverified.

## Initial inspection

- Workspace contained only `docs/01-robot-voice.md`, with no Git repository or code.
- Docker daemon and Compose are available.
- Host Node is 24; project commands use the pinned Node 22 runtime.
- Existing Git author identity is configured and preserved.
- No provider keys have been loaded, no provider calls made, and no remote created.

## Active project objective

Complete all milestones step by step with Conventional Commits. The current user
request changes the visual direction to a professional light background with a
subtle purple gradient and asks for free demo APIs. The remaining M4–M8 scope is
unchanged. Missing provider accounts do not block independent product development.

## Scope of this build increment

The first increment completed the M0 foundation. The second implements M1's local
audio and fixture paths, while retaining an explicitly pending live gate. Later
milestones retain their status above. M2 includes real HTTP/browser staff
authentication and safe local provisioning. M3 includes bot drafts, knowledge and
the media library with durable inspection/cleanup and authenticated streaming,
plus ordered presentation drafts with protected media references and screen previews.
Staff release readiness, preview/publication, history and frozen bilingual query
inspection are also implemented and verified. Additive demo content now includes
three fictional guides and a complete published campus release with inspected media.
Live voice adapters, the passing provider gate and live lab turns are merged from
the voice line; browser evidence for live playback remains pending.

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

## M3 presentation authoring — 2026-09-12

Presentations now persist under their bot with ordered bilingual slides, screen
targets, durations and optional READY media. Staff API routes support selection,
rename, slide editing, complete reorder and removal. Child mutations advance the
presentation and root bot revisions, retain scoped authority and record audits.
Database constraints prevent cross-bot selection, foreign/unready media attachment
and deletion of an asset while a slide references it. ADR 020 records this boundary.

The studio adds an outline, primary/secondary canvas previews and English/Nepali
properties. Authors can create multiple presentations, select one for the bot,
attach inspected files, rename, reorder and remove slides. Viewers and operators
inspect; archived bots retain readable previews. Videos stay muted. Explicit saves,
navigation prompts and confirmed reloads preserve local text during conflicts.
Media selection supports search and pagination. The layout retains white surfaces
and restrained lavender, with a stacked mobile editor.

The integration gate repeatedly reproduced exhaustion of the prior three session
serialization retries. Five bounded retries now pass the twelve-request burst;
an injected-conflict regression also verifies exhaustion and session revocation
during retry. Authority and idle expiry rules are unchanged (ADR 021). The fresh
dependency audit reported five transitive advisories; scoped js-yaml 4.3.2 and multer
2.3.0 overrides resolve them, with exact changes recorded in `DEPENDENCIES.md`.

Browser tests initially exposed selector mistakes around required labels and Next's
route announcer; selectors now use accessible textbox names and the actual conflict
alert. Visual review added a focus-restoration assertion before mobile capture.
A real aborted-image request reproduced a preview error that survived saved-data
reload; remounting the previews on reload now restores the image. Separate RED/GREEN
commits retain the missing route, audit, contention and media-recovery checkpoints.

Verified at this checkpoint:

- `pnpm check` passed formatting, lint, types, **127 unit tests**, generated contract
  drift and all production builds after dependency patching. The final preview change
  also passed targeted lint/types, root test types and a fresh production image build.
- Configured-subset coverage is **96.67% lines / 90.67% branches**; this is not
  whole-application coverage. Presentation contracts are now included in that subset.
- **98 integration tests** passed natively; all **98** also passed inside the final
  patched Linux image, including real database/media races, HTTP and worker recovery.
- All **32 browser journeys** passed against that final image, including three
  presentation journeys, real image/video decoding, media-in-use rejection, bilingual
  persistence, ordering, selection/rename/removal, conflict retention, reload recovery,
  viewer/archive controls, axe checks and the mobile overflow/focus checks.
- The network-disabled production preview guard and restricted media sandbox passed.
  All nine migrations are applied; migration/seed init jobs succeeded and all six
  long-running services are healthy. Only `127.0.0.1:4320` is exposed.
- `pnpm audit --audit-level=low` found no known vulnerabilities. Gitleaks scanned all
  **15 implementation commits** since `4e8268c` through `9f24b42`, with no detected
  secrets. Subsequent changes in this checkpoint are documentation only.

Desktop and mobile screenshots were reviewed in
`artifacts/screenshots/m3-presentation-editor.png` and
`artifacts/screenshots/m3-presentation-mobile.png` (ignored local evidence).
No provider account was created, key loaded, live API called or remote push performed.
The original specifications and existing local credentials remain intact.

Next: immutable preview/published releases, release readiness, idempotent publication,
release media references and release-local knowledge query inspection. M1 live voice
and M3–M8 remain on the active project objective. Account setup instructions remain
available in `FREE-DEMO-SETUP.md`; fixture mode supports continued local development.

## M3 immutable release domain — 2026-09-12

The release database and domain layer now capture immutable preview/published
snapshots from one expected root draft revision. Published numbering uses a locked
bot row and a separate counter. Capture includes selected bilingual knowledge,
ordered slides and deduplicated READY media checksums/lengths. Canonical hashing
survives JSONB key ordering. Published knowledge must be approved; staff previews
may freeze selected DRAFT content with its actual status. Provider mode is recorded
explicitly, and fixture releases need no external account.

Hashed idempotency keys are scoped by membership and operation for 24 hours.
Concurrent retries return one original result; changed payloads conflict. Preview
retrieval expires after 30 minutes while historical inspection remains available.
Migration 010 protects immutable rows, complete matching locale projections and
media references, including after source draft deletion. Release-local retrieval
supports English full text and bilingual exact/trigram matching, stable IDs, five
passages and a combined 6,000-code-point text budget. ADRs 022–023 and `RELEASES.md`
record the implementation and its remaining runtime/retention boundaries.

Regression tests exposed and fixed three gaps: an unenforced aggregate response
budget, repetition overpowering exact FAQ ranking, and raw SQL serialization errors
escaping the retry handler. The installed Prisma adapter wraps raw write conflicts
inside P2010 metadata. The fix recognizes that exact driver-conflict form, preserves
bounded retries and fresh authority, and leaves constraint failures non-retryable.
A test fixture also needed its validated snapshot type rather than nullable Prisma
read JSON when constructing an intentionally incomplete row.

The full browser gate exposed a duplicate-label selector during language switching.
Base UI briefly retains the outgoing inert panel; tests now select the named language
panel and textbox role. All three presentation journeys then passed. An immediate
whole-suite repeat reached the existing credential rate limit. The final browser
run passed after the real cooldown; the limiter and shared Redis state were preserved.

Verified at this checkpoint:

- `pnpm check` passed formatting, lint, types, **133 unit tests**, generated API
  contract checks and every production build. Configured-subset coverage remains
  **96.67% lines / 90.67% branches**, not whole-application or release-service coverage.
- All **108 native integration tests** passed. The **13 release/transaction tests**
  also passed inside the rebuilt Linux image, including real inspected media,
  separate sign-ins, cross-bot key collisions, expiry and direct database constraints.
- All **32 browser journeys** passed against the rebuilt demo after the selector
  correction and credential cooldown. The test-only change also passed targeted
  lint, formatting and root test types.
- The common production image built successfully. Migration/seed completed and all
  six long-running Compose services became healthy; native database/Redis ports
  were closed again when restoring the full demo.
- Gitleaks scanned the **ten implementation/test commits** from `6d1c0e3` through
  `74c69e0` with no detected leaks. Remaining checkpoint changes are documentation.

Staff release HTTP routes, studio readiness/history controls, snapshot/query
inspection and synthetic release examples remain the next M3 increment. The
current Voice lab still uses fixture scenarios. Runtime preview admission, device
deployment, public sharing and retention cleanup are not provided by this domain
checkpoint. No provider account was created, key used, live API called or remote
push performed. The complete project goal remains active.

## M3 release API and studio — 2026-09-12

Implemented protected staff routes for readiness, preview/publication, history,
snapshot detail and pinned knowledge inspection. Shared strict contracts generate
the OpenAPI request/response shapes. Capture requires the expected root revision and
an idempotency header; query uses POST to keep text out of URLs and rejects NUL.
HTTP regressions cover current authority, tenants, CSRF, Host/Origin, stale revisions,
unready drafts, duplicate keys, preview expiry and bounded inputs.

The Releases workspace now links readiness issues to draft editors and provides
confirmation dialogs, ten-row history pages, kind filters and bilingual immutable
inspection. Lost-response retries retain the exact key and revision even when the
dialog is closed and reopened. A stale capture requires an explicit draft recheck.
Snapshot content includes approval state, original configuration, ordered slides and
retained media checksums. Primary/secondary previews support landscape and portrait;
private video stays muted, and failed media requests can be reloaded.

Knowledge inspection validates returned release ID, hash and locale, clears results
when selecting another snapshot, and cancels requests on locale changes/unmount.
Zero matches show the saved fallback as reference text. Expired previews deny new
queries while keeping their content readable. No model answer or provider call is
made by these controls. Retry keys currently remain in memory only; after leaving
or reloading the page, inspect history before starting another capture.

Verification at implementation commit `864db46`:

- `pnpm check` passed formatting, lint, types, **133 unit tests**, generated-contract
  drift checks and all production builds. Configured-subset coverage remains
  **96.67% lines / 90.67% branches**; this is not whole-application coverage.
- All **112 integration tests** passed inside the rebuilt Linux image. The four new
  release HTTP tests also passed on native infrastructure during their RED/GREEN
  implementation. No test database reset or destructive migration was required.
- All **36 browser journeys** passed in the final run, including four release flows,
  lost-response recovery, frozen bilingual retrieval, mismatched response rejection,
  expiry feedback, viewer/archive restrictions, 11-version paging, retained media
  after presentation deletion, muted playback, axe and mobile overflow checks.
- The new media journey initially used an exact label selector that included the
  required-field marker. Selecting the textbox by accessible role/name fixed that
  test. The final suite passed with the real credential limiter enabled after its
  cooldown; no shared quotas were reset.
- The final common image built successfully. The production preview guard and
  restricted media sandbox passed; migration/seed completed and all six long-running
  Compose services are healthy. Only the loopback gateway is exposed.
- Gitleaks found no secrets in the staged implementation and the implementation
  history from `7021fc1` through `864db46`. Subsequent checkpoint changes are docs.

Desktop/mobile and portrait screenshots were reviewed in ignored
`artifacts/screenshots/m3-releases.png`, `m3-releases-mobile.png` and
`m3-release-portrait.png`. The interface uses white surfaces, restrained lavender
gradients and readable contrast. No dependencies were added in this increment.

Next: reusable synthetic demonstration bots/content/media, then paired devices and
dual displays. M1 live provider adapters, conversation admission, public sharing,
scheduling, analytics and retention remain on the active project objective. The
Voice lab still uses synthetic scenarios; authored release search does not yet run
a voice conversation. Azure/Gemini account setup remains documented in
`FREE-DEMO-SETUP.md`. No account was created, key loaded, provider called or remote
push performed.

## M3 reusable demo content — 2026-09-12

Implementation commit `3b5f4b2` completes reusable authoring examples. Himal has
Campus Admissions Guide and Campus Event Host, 12 approved bilingual FAQs, four
approved notes, one unapproved/unselected fee draft and five presentations. Riverside
has its own unrelated exhibition guide. All facts are synthetic. Original map artwork
passes real image inspection and private media delivery.

Admissions version 1 captures 13 selected entries, two slides and the retained map.
Its current revision 2 deliberately lacks a Nepali greeting, while the published
snapshot remains complete. English/Nepali inspection retrieves the room 12 passage;
the unsupported tuition-fee query returns no approved passage and shows the saved
fallback. This is release inspection, not a generated voice conversation. Nepali
copy still needs independent human review in the later bilingual evaluation gate.

Local bundle receipts and per-organisation locks make repeated setup additive.
Tests cover changed content/access, archived roots, deleted children, foreign IDs,
concurrent seeds, corrupt image output and a lost commit acknowledgement. Seeded
publication shares the normal capture primitive and creates no staff session.
ADRs 022–025 and `DEMO-CONTENT.md` explain these boundaries.

Verified at this checkpoint:

- `pnpm check` passed formatting, lint, types, **133 unit tests**, generated-contract
  drift checks and all production builds. Configured-subset coverage is still
  **96.67% lines / 90.67% branches**, not whole-application coverage. Subsequent
  overview copy/link and seed command changes passed targeted lint/types and builds.
- The full native integration run passed **118 tests in 23 files**. After adding the
  lost-acknowledgement regression, all **seven seed integration tests** passed on both
  native infrastructure and Linux. The latest test file was mounted read-only into
  the current Linux image; its runtime implementation was unchanged.
- The full browser run passed **36 of 37 journeys**. The remaining existing identity
  journey reached the real shared 300-request/minute limit when reloading members;
  the UI offered Retry members after nine seconds. That complete journey passed on
  a targeted retry after cooldown. All 37 journeys are covered across these runs;
  this is not a claim of one uninterrupted 37-test pass. No quotas were reset.
- The seeded owner journey passed Nepali retrieval, private map decoding, screen
  targeting, unsupported-query fallback, cross-tenant denial, axe and mobile overflow
  checks. Desktop/mobile screenshots in `artifacts/screenshots/m3-seeded-campus.png`
  and `m3-seeded-campus-mobile.png` were reviewed.
- The common image built successfully. Compose migration/seed completed and all six
  long-running services are healthy. Initial seeding added three guides; a second
  seed run added zero. Only the loopback gateway is exposed.
- Review found that fresh native seeding needs the emitted image child. `db:seed`
  now compiles shared packages and the worker first. CI seeds authoring examples
  only during Compose startup, avoiding references to a different media store.
- Gitleaks found no secrets in staged implementation or the three implementation/test
  commits after `5b5e5e1` through `3b5f4b2`. The remaining checkpoint changes are docs.

M3's immutable bilingual publication gate is complete. Next is M4 pairing, scoped
runtime grants, two displays and atomic release application. M1 live speech still
awaits provider accounts/adapters; setup instructions remain in `FREE-DEMO-SETUP.md`.
No account, key, provider call, remote push or public deployment was used. The full
project objective remains active, with M4–M8 and live validation still outstanding.
