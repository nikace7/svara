# Implementation progress

Updated 2026-09-08. Evidence is local unless explicitly marked otherwise.

| Milestone                                | State       | Evidence / remaining work                                                                                    |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| M0 — Workspace and component foundation  | Complete    | Local native and production-container setup verified; health, builds, contracts and accessible gallery pass. |
| M1 — Bilingual voice feasibility         | Not started | Fixture audio pipeline and live bilingual smoke tests pending.                                               |
| M2 — Identity and tenant boundaries      | Not started | Authentication, policies and adversarial access tests pending.                                               |
| M3 — Authoring and immutable publication | Not started | Drafts, media, knowledge and releases pending.                                                               |
| M4 — Devices and dual displays           | Not started | Pairing, grants and release application pending.                                                             |
| M5 — Schedules and commands              | Not started | Conflict checks, outbox and reconciliation pending.                                                          |
| M6 — Conversations and public assistant  | Not started | Grounding, tools, admission and visitor grants pending.                                                      |
| M7 — Analytics and operations            | Not started | Measured analytics, retention and recovery pending.                                                          |
| M8 — Evidence and handoff                | Not started | Final evaluations, screenshots and walkthrough pending.                                                      |

## Initial inspection

- Workspace contained only `docs/01-robot-voice.md`, with no Git repository or code.
- Docker daemon and Compose are available.
- Host Node is 24; project commands use the pinned Node 22 runtime.
- Existing Git author identity is configured and preserved.
- No provider keys have been loaded, no provider calls made, and no remote created.

## Scope of this build increment

Complete the M0 foundation and its acceptance gate. Later milestones retain their
explicit status above. Authentication and live voice are not claimed by M0.

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

## Next increment

M1 begins with deterministic audio/protocol fixtures, capture/resampling/playback,
cancellation and a local feasibility page. English and Nepali live smoke results
remain pending until the required provider credentials are supplied. M2 adds staff
identity and tenant enforcement before any hosted studio access.
