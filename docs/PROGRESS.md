# Implementation progress

Updated 2026-09-08. Evidence is local unless explicitly marked otherwise.

| Milestone                                | State       | Evidence / remaining work                                                                                          |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| M0 — Workspace and component foundation  | Complete    | Local native and production-container setup verified; health, builds, contracts and accessible gallery pass.       |
| M1 — Bilingual voice feasibility         | Partial     | Local fixture lab and audio/protocol checks pass. Live adapters and bilingual provider smoke tests remain pending. |
| M2 — Identity and tenant boundaries      | Not started | Authentication, policies and adversarial access tests pending.                                                     |
| M3 — Authoring and immutable publication | Not started | Drafts, media, knowledge and releases pending.                                                                     |
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

## Scope of this build increment

The first increment completed the M0 foundation. The second implements M1's local
audio and fixture paths, while retaining an explicitly pending live gate. Later
milestones retain their status above. Authentication and live voice are not claimed.

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

Azure key/region and OpenAI key are absent; `ALLOW_LIVE_EVAL` is false. The live
SDK adapters, region/voice availability and actual English/Nepali STT → generation
→ TTS smoke results are still pending. M1 is therefore not marked complete.
Hands-free interruption and speaker feedback need the intended physical setup.
See `docs/M1-VOICE.md` for the precise scope. M2 can independently add staff identity
and tenant enforcement before any hosted studio access.
