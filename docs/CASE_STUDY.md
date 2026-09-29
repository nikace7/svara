# Case study: Svara, an independent recreation

This page separates two things that must not be confused:

1. **The original work.** Custom Robot Voice (CRV) was built during the author's
   employment. Only the author can describe it; see the section reserved below.
2. **This repository.** Svara is a fresh, independent recreation of the same kind of
   product, built from a written specification ([blueprint](BLUEPRINT.md)) with synthetic
   data. It uses no employer code, assets, credentials, databases or Git history.

Nothing in this repository is evidence of what the original system did, and nothing about
the original is claimed here.

## What Svara is

A bilingual English/Nepali visitor assistant with a staff studio for browser kiosks:

- **Authoring.** Staff write bilingual knowledge and presentations, review them, and
  publish immutable numbered releases.
- **Devices.** Kiosks pair with a one-time code and apply a release only after
  downloading and verifying it. They acknowledge every command, and a second screen
  mirrors what the kiosk has applied.
- **Scheduling.** Releases are scheduled per device with conflict checks and explicit
  overrides. A durable command outbox keeps desired and applied state apart, and
  reconciles after downtime without replaying elapsed boundaries.
- **Conversations.** Visitors ask on a kiosk or through a public link, typed or spoken.
  Answers are grounded in the release's approved knowledge and cite it; unsupported
  questions get the author's fallback. The model may move a slide only through a
  validated tool, and the answer reports it as applied only after the kiosk acknowledges.
- **Operations.** Mode-separated measured analytics, transcript retention, verified
  backup and restore into a separate database, and a guarded demo reset.

## Scope of the recreation

- **Built from the specification alone.** The earlier CRV checkout was read only for
  feature context (blueprint §18). Its documents disagreed with its own source, so
  nothing from it was treated as verified behaviour.
- **Deliberate departures from the specification**, each recorded as an ADR:
  - Gemini's free tier instead of OpenAI and Azure Speech (ADR 011), so the product runs
    on a free key;
  - conversation turns stream over HTTP instead of a voice socket (ADR 027);
  - the operations push socket is deferred in favour of HTTP polling (ADR 028);
  - a light studio theme (ADR 011).
- **Synthetic content only.** The organisations (Himal Campus, Riverside), rooms, hours
  and programmes are fictional and labelled so on screen.

## Evidence

All of it can be reproduced from this repository. Details are in [progress](PROGRESS.md)
and [evaluation](EVALUATION.md).

| Area                 | Evidence                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size                 | About 26,000 lines of application TypeScript and 14,700 lines of tests; over 200 commits since 2026-09-08. There are 29 ADRs.                                                                         |
| Unit tests           | Run by `pnpm check` with statement coverage above 95% (see progress for the latest count).                                                                                                            |
| Integration tests    | Against real PostgreSQL 17 and Redis: tenant isolation, revision conflicts, schedule races, pairing limits, command acknowledgement, admission limits, tool validation, retention.                    |
| Browser tests        | Playwright on a self-contained stack: pairing and revocation, schedules and overrides, kiosk slide commands, public links in both languages, failure journeys, layouts at three widths and 200% zoom. |
| Conversation quality | 40-case fixed bilingual set: en 14/14 answerable, ne 13/14; 0 invented claims and 0 unauthorized slide changes. Demo mode measures retrieval and grounding, not a language model.                     |
| Live provider        | One real-key gate (2026-09-25): English and Nepali question → grounded answer → speech → transcript. A browser run with a real key and the live evaluation are still pending.                         |
| Screenshots          | Seven captures of real screens in labelled demo mode; see [demo](DEMO.md).                                                                                                                            |
| Acceptance criteria  | 23 of 28 covered by automated tests; 5 partial, each with its gap stated (A01, A13, A24, A25, A28).                                                                                                   |

## What is not proven

- Live conversation quality, latency under real provider load, and hands-free barge-in on
  real hardware.
- Review of the Nepali answers and speech by a fluent speaker.
- A green CI run on GitHub: the workflow exists, but the repository has no remote.
- Production deployment: the product runs locally and in Docker Compose on one machine.

## For the author: the original CRV work

> **This section is intentionally empty.** Only the author can describe the original
> Custom Robot Voice work: their role, the team, what shipped, and what they may share
> under their employment terms. Keep it separate from the evidence above. Nothing above
> demonstrates anything about the original system.
