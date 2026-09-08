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
