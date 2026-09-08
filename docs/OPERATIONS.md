# Local operations — M0

## Configuration

`pnpm setup:local` creates `.env`, `.env.compose` and `.local/media`. Secrets are
random per setup and files are created exclusively. Incomplete existing settings
produce a named error rather than a guessed replacement password. Do not commit
either environment file.

Native URLs use loopback. Compose passes internal `postgres`/`redis` hosts explicitly.
Web receives only preview flags and origin. Database/authentication secrets and the
media volume belong to API/worker/init jobs. Actual Azure/OpenAI adapters and live
feasibility are M1; configuration validation alone does not establish live support.

Run one native or Compose stack at a time. The default Compose project is `svara`;
volumes are `svara_postgres_data`, `svara_redis_data`, and `svara_media_data`.
Native media uses `.local/media`; switching modes does not copy media between stores.
Only the native override exposes PostgreSQL/Redis ports, both on loopback.

## Commands

| Command                             | Behavior                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| `pnpm setup:local`                  | Generate missing local settings; preserve existing files          |
| `pnpm infra:up` / `pnpm infra:down` | Start/stop native infrastructure; retain volumes                  |
| `pnpm db:generate`                  | Generate ignored Prisma 7 client; no database needed              |
| `pnpm db:migrate`                   | Apply committed migrations only to local `svara_dev`              |
| `pnpm db:seed`                      | Verify Svara marker; idempotently add two fictional organisations |
| `pnpm db:test:prepare`              | Apply migrations only to local `svara_test`                       |
| `pnpm dev`                          | Compile prerequisites and start coordinated app/package watchers  |
| `pnpm demo:up` / `pnpm demo:down`   | Build/start or stop the full stack; retain volumes                |
| `pnpm test:integration:container`   | Run guarded migrations and real PostgreSQL/API tests in the demo  |
| `pnpm test:container`               | Test production preview denial without network access             |

Database guards validate protocol, host, exact database name, environment and absence
of URL options. The migration creates a Svara marker; seed checks it before writing.
Do not run raw migration commands against arbitrary existing credentials.

## Health and recovery

The studio polls real API readiness every 15 seconds. Dependency probes are bounded
and expose safe categories. Unknown/failed results cannot appear healthy. The worker
currently performs dependency checks and heartbeat only; domain jobs are later work.

```sh
docker compose --env-file .env.compose -f infra/compose.yaml -f infra/compose.demo.yaml ps
docker compose --env-file .env.compose -f infra/compose.yaml -f infra/compose.demo.yaml logs --tail 50 api worker
```

Migration and seed jobs should exit successfully. Web, API, worker, PostgreSQL,
Redis and Caddy should be healthy. Apps never migrate/reset data on their own
startup. Built services start through Node directly without package downloads;
Debian images include OpenSSL for Prisma migration tooling.

To switch modes, stop apps with Ctrl+C and `pnpm infra:down`, or stop the full demo
with `pnpm demo:down`, before starting the other mode. Do not stop unrelated services
to free a port. Changing `.env` does not change a password already stored in a
PostgreSQL volume; preserve its original generated credentials.

## Later operations

Reset, backup/restore, retention, account recovery, provider evaluation and public
hosting are not implemented in M0. The initial image retains build/test tools for
reproducibility; smaller service-specific images can follow. Do not expose this
unauthenticated local foundation as a hosted product.
