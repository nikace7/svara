# Contributing to Svara

## Git workflow

`main` is the integration branch. Use focused branches named `feat/<milestone-or-feature>`,
`fix/<issue>`, `docs/<topic>` or `chore/<maintenance>`.
Codex-created branches use the `codex/` prefix, for example
`codex/feat/media-authoring`. Existing feature branches keep their recorded names.

Use Conventional Commits: `type(scope): imperative description`. Types include
`feat`, `fix`, `test`, `refactor`, `docs`, `build`, `ci` and `chore`.
Scopes should name an app, package or concern: `web`, `api`, `database`, `contracts`,
`infra`, `workspace`.

Commit coherent changes as work progresses. For behavior changes, record the
failing test and then the passing implementation in separate TDD checkpoints.
Clearly identify intentionally failing test checkpoints in the commit body. The
branch must pass all required checks before integration; never merge a red checkpoint
alone. Preserve this history unless a maintainer explicitly requests a rewrite.

Stage specific files or reviewed groups; inspect the staged diff before committing.
Never commit secrets, generated local configuration, recordings, dependencies or
build outputs. Do not bypass hooks, signing or CI. Do not change global Git identity.
Repository publication and remote pushes are separate from local development.

## Engineering rules

- Read the blueprint and current progress before changing a milestone.
- Keep controllers thin; domain services own transactions and explicit tenant scope.
- Web code may import only browser-safe contracts, UI and audio packages.
- Pin dependencies and commit one pnpm lockfile. Generate Prisma clients at setup/build.
- Validate configuration and inputs; never log secrets or conversation payloads.
- Add behavioral tests and record actual evidence in `docs/PROGRESS.md`.
- Keep fixture and live results visibly separate. Never imply an unbuilt feature works.
- Changes must pass formatting, lint, type checks, unit tests, contract drift checks,
  relevant integration/browser tests and production builds.
