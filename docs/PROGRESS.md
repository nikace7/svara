# Implementation progress

Updated 2026-09-08. Evidence is local unless explicitly marked otherwise.

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| M0 — Workspace and component foundation | In progress | Architecture read; new workspace inspected; repository conventions established. Runtime implementation and verification underway. |
| M1 — Bilingual voice feasibility | Not started | Fixture audio pipeline and live bilingual smoke tests pending. |
| M2 — Identity and tenant boundaries | Not started | Authentication, policies and adversarial access tests pending. |
| M3 — Authoring and immutable publication | Not started | Drafts, media, knowledge and releases pending. |
| M4 — Devices and dual displays | Not started | Pairing, grants and release application pending. |
| M5 — Schedules and commands | Not started | Conflict checks, outbox and reconciliation pending. |
| M6 — Conversations and public assistant | Not started | Grounding, tools, admission and visitor grants pending. |
| M7 — Analytics and operations | Not started | Measured analytics, retention and recovery pending. |
| M8 — Evidence and handoff | Not started | Final evaluations, screenshots and walkthrough pending. |

## Initial inspection

- Workspace contained only `docs/01-robot-voice.md`, with no Git repository or code.
- Docker daemon and Compose are available.
- Host Node is 24; the application will use the specified pinned Node 22 runtime.
- Existing Git author identity is configured; it will be preserved.
- No provider keys have been loaded, no provider calls made, and no remote created.

## Scope of this build increment

Complete the M0 foundation and its acceptance gate. Later milestones retain their
explicit status above. Authentication and live voice are not claimed by M0.
