# Dependency choices and audit

## Runtime pins

Node 22.23.2, pnpm 10.34.5, Next.js 16.3.4, React 19.2.8, NestJS 11.2.3,
Prisma 7.10.0 and TypeScript 5.9.3 are pinned. PostgreSQL 17, Redis 7,
Caddy 2 and the Node container base are pinned to verified image digests.
One `pnpm-lock.yaml` covers all 11 projects.

The media worker pins Sharp 0.35.4 and BullMQ 6.3.4. FFmpeg and libseccomp come
from the Debian image's signed repositories; the current image resolved FFmpeg
5.1.9. Native Windows verification uses FFmpeg 9.0.1. The sandbox compiler exists
only in its build stage. See `MEDIA-INSPECTION.md` for supported inspection modes.
The API explicitly pins Busboy 1.6.0 for streaming multipart parsing, with
`@types/busboy` 1.5.4 for development. No native build script is required by this addition.

ESLint 9.39.5 is retained for `eslint-plugin-react` compatibility: the installed
React lint plugin does not declare ESLint 10 support. Revisit together with Next's
lint dependency set. This is a compatibility pin, not a claim that ESLint 9 is the
latest major.

## Initial audit checkpoint — 2026-09-08

`pnpm audit --prod` returned three advisories in Prisma's transitive tooling:

- `deepmerge-ts <8.0.0`: recursive object merging can exhaust the stack
  ([advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)).
- `mysql2 <3.22.0`: authentication plugin downgrade
  ([advisory](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)).
- `mysql2 <=3.23.0`: unbounded compressed input
  ([advisory](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)).

Svara uses PostgreSQL, not MySQL. The packages are nevertheless in the installed
dependency graph and will be patched rather than excluded from auditing. This
checkpoint records the failing audit before updating the lockfile.

## Remediation

`pnpm-workspace.yaml` overrides `deepmerge-ts` to 8.0.0 and `mysql2` to 3.23.1.
Prisma config loading and client generation pass with these overrides. The complete
`pnpm audit` now reports **no known vulnerabilities**, including development dependencies.
Keep the overrides until a compatible Prisma update resolves both transitively;
rerun migrations, integration tests and contract generation when updating them.

CI runs the dependency audit and all GitHub Actions are pinned to resolved commit
SHAs. Dependabot configuration is ready for a future GitHub remote; no remote or
hosted update job has been created in this local-only initialization.
