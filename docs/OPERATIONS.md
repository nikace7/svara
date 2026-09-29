# Local operations — foundation and voice lab

## Configuration

`pnpm setup:local` creates `.env`, `.env.compose` and `.local/media`. Secrets are
random per setup and files are created exclusively. Incomplete existing settings
produce a named error rather than a guessed replacement password. Do not commit
either environment file.

Native URLs use loopback. Compose passes internal `postgres`/`redis` hosts explicitly.
Web receives preview flags, origin and server-only `API_INTERNAL_ORIGIN` for session
checks (Compose uses `http://api:4100`). Database/authentication secrets and the
media volume belong to API/worker/init jobs. Actual Azure/Gemini adapters and live
feasibility are M1; configuration validation alone does not establish live support.

Run one native or Compose stack at a time. The default Compose project is `svara`;
volumes are `svara_postgres_data`, `svara_redis_data`, and `svara_media_data`.
Native media uses `.local/media`; switching modes does not copy media between stores.
Both modes share the development database, so keep an existing media-backed demo
in its original mode unless its media files have also been transferred. Seed receipts
preserve database references; reseeding does not replace files in a different store.
Only the native override exposes PostgreSQL/Redis ports, both on loopback.

## Commands

| Command                             | Behavior                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm setup:local`                  | Generate missing local settings; preserve existing files                             |
| `pnpm infra:up` / `pnpm infra:down` | Start/stop native infrastructure; retain volumes                                     |
| `pnpm db:generate`                  | Generate ignored Prisma 7 client; no database needed                                 |
| `pnpm db:migrate`                   | Apply committed migrations only to local `svara_dev`                                 |
| `pnpm db:seed`                      | Build the inspector; verify local target; add staff and inspected authoring examples |
| `pnpm staff:recover --email ...`    | Explicit local password recovery; revoke sessions and grants, preserve access        |
| `pnpm db:test:prepare`              | Apply migrations only to local `svara_test`                                          |
| `pnpm dev`                          | Compile prerequisites and start coordinated app/package watchers                     |
| `pnpm demo:up` / `pnpm demo:down`   | Build/start or stop the full stack; retain volumes                                   |
| `pnpm test:integration:container`   | Run guarded migrations and real PostgreSQL/API tests in the demo                     |
| `pnpm test:container`               | Test production preview denial without network access                                |

Database guards validate protocol, host, exact database name, environment and absence
of URL options. The migration creates a Svara marker; seed checks it before writing.
Do not run raw migration commands against arbitrary existing credentials.

## Health and recovery

The studio polls real API readiness every 15 seconds. Dependency probes are bounded
and expose safe categories. Unknown/failed results cannot appear healthy. Worker
readiness includes the media queue, reconciliation and real image/video processing
probes. An unavailable parser leaves liveness healthy but readiness unavailable and
stops refreshing the heartbeat. See `MEDIA-INSPECTION.md` for recovery and cleanup.
Keep `WORKER_NAMESPACE` identical on API and worker (default `svara`). Separate
installations sharing Redis require distinct namespaces and database/media storage.

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

## Backup and restore

A backup is a PostgreSQL custom-format dump, a copy of the media files and a manifest with the
dump's SHA-256, the media file count and exact row counts for every table.

```sh
pnpm backup              # native mode: media from MEDIA_ROOT
pnpm backup --compose    # Compose demo: media from the stack's media volume
```

Each run writes a new `.local/backups/<timestamp>/` directory. The dump runs inside the running
`svara` PostgreSQL container, so no local client tools are needed and no password appears on a
command line. Row counts are taken before and after the dump; if anything changed meanwhile the
backup is refused and nothing is kept, so run it while the stack is idle. Copy the directory
somewhere safe together with `.local/setup/demo-staff.json`. A backup contains transcripts and
credential hashes, so treat it like the database itself.

Restoring never overwrites anything. It creates a new database and a new media directory, then
verifies both against the manifest:

```sh
pnpm restore .local/backups/<timestamp>                   # into svara_restore
pnpm restore .local/backups/<timestamp> svara_restore_2   # another name
```

The target must be `svara_restore` or `svara_restore_<suffix>`. `svara_dev`, `svara_test` or an
existing database or media directory is refused. The command reports the verified table, row
and media counts, or fails naming what differs.

To put a verified restore into use (native mode):

1. Stop the apps (Ctrl+C on `pnpm dev`) and leave only PostgreSQL and Redis running.
2. Rename the databases inside the container:
   ```sh
   docker compose --env-file .env.compose -f infra/compose.yaml exec -T postgres psql -U svara -d postgres -c 'ALTER DATABASE svara_dev RENAME TO svara_dev_previous' -c 'ALTER DATABASE svara_restore RENAME TO svara_dev'
   ```
3. Move `.local/media` aside and rename `.local/svara_restore-media` to `.local/media`.
4. Run `pnpm db:migrate`, which brings an older backup up to the current schema, then start the
   apps. The worker reconciles desired device state and ends stale conversations at startup.
   Kiosks reconnect and receive the current desired state.

Drop `svara_dev_previous` only once the restored copy has been checked in the studio. To drop a
restore you no longer need:

```sh
docker compose --env-file .env.compose -f infra/compose.yaml exec -T postgres dropdb -U svara svara_restore
```

## Resetting the local demo

```sh
pnpm demo:reset svara_dev
```

This deletes the native demo database and media, then migrates and seeds again. It refuses
unless:

- the target is the local `svara_dev` database with the Svara marker, in the local environment;
- `MEDIA_ROOT` is a `.local/media` directory;
- the database name is typed as the confirmation.

It takes a `pnpm backup` first, so `pnpm restore` can bring back the previous state. Staff
passwords come from `.local/setup/demo-staff.json` as they do for a normal seed.

The Compose demo keeps its data in volumes. Reset it with `pnpm demo:down`, then
`docker volume rm svara_postgres_data svara_media_data`, then `pnpm demo:up`. Take
`pnpm backup --compose` first.

## Retention

The worker applies retention at startup and hourly:

- **Transcripts:** questions, answers, citations and tool arguments and results are removed 30
  days after their conversation ended. Turn states, timings and counts remain, so analytics stay
  correct. Each expiry is audited as `conversation.transcript.expired`.
- **Expired or revoked credentials:** staff sessions, invitations and recovery links, device
  tickets and grants, and pairing codes are deleted seven days after they expire. A record that
  something still references stays.
- **Short-lived records:** expired publish idempotency records and unused visitor grants are
  deleted.

Staff can delete a transcript immediately from its session record.

## Stopping safely

- **Native:** Ctrl+C on `pnpm dev`, then `pnpm infra:down`.
- **Compose:** `pnpm demo:down`.

Both keep volumes. Answers in progress stop with the API process. The worker finishes its
current media job, reconciliation tick and retention pass within 25 seconds before exiting.
Nothing needs to be cleaned up by hand afterwards. At the next start, the worker ends
conversations whose idle or absolute deadline has passed, keeping their reserved allowance.
Devices reconcile their desired and applied release revisions.

## Configuration reference

| Setting                             | Where                  | Notes                                                                            |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`, `TEST_DATABASE_URL` | `.env`                 | Local `svara_dev` and `svara_test` only; scripts refuse any other target         |
| `REDIS_URL`, `WORKER_NAMESPACE`     | `.env`                 | Keep the namespace identical on API and worker                                   |
| `MEDIA_ROOT`                        | `.env`                 | Absolute `.local/media` path; Compose uses its own volume                        |
| `APP_ORIGIN`, `TRUST_PROXY_HOPS`    | `.env`, `.env.compose` | The exact browser origin; 0 native, 1 behind Caddy                               |
| `AUTH_TOKEN_PEPPER`                 | `.env`                 | Changing it invalidates every stored credential                                  |
| `PROVIDER_MODE`, `GEMINI_API_KEY`   | `.env` or inline       | `live` requires a key; never commit the key; the sidebar shows the mode in use   |
| Conversation limits                 | `CONVERSATION_LIMITS`  | 10 concurrent per organisation; 100 live sessions and 3,600 live seconds per day |

Hosting beyond this machine remains outside the supported setup. That means HTTPS, provider
quotas, permitted origins and durable off-machine backups. The image retains build and test
tools for reproducibility; smaller service-specific images can follow.

## Staff setup

Open `/login` and choose **Create a workspace**. Registration creates an owner and
a new organisation; it cannot join or take ownership of an existing organisation.
Owners invite staff and issue recovery links in `/studio/settings`. Links work once
and expire in 24 hours; share them privately yourself. No email is sent by this app.
An existing account accepts an invitation using its current password. Recovery for
accounts shared with another organisation requires the explicit local recovery
tool; an owner cannot take over another organisation's accounts.

Native `TRUST_PROXY_HOPS` defaults to 0. The Compose runtime uses 1 because API
traffic arrives only through Caddy on its private network. `APP_ORIGIN` must match
the gateway address exactly; use `http://localhost:4320`, including for staff forms.
Changing the pepper invalidates stored credentials; keep the generated value stable.
Do not manually reset Redis quotas to bypass a denied credential attempt.

Demo accounts are `owner@himal.svara.test`, `admin@himal.svara.test`,
`operator@himal.svara.test`, `viewer@himal.svara.test` and `owner@riverside.svara.test`.
The initial random passwords are in `.local/setup/demo-staff.json`, shared by native
and Compose seed runs and excluded from Git/images. Preserve this file with local
setup backups; a repeated seed never resets an account's current password or role.
Fresh Linux setup records the host UID/GID in `.env.compose` so the seed service
owns the private credential file. Existing Linux setups can set `SVARA_LOCAL_UID`
and `SVARA_LOCAL_GID` to their host IDs; Windows defaults to 1000.

For explicit recovery in native mode:

```sh
pnpm staff:recover --email owner@himal.svara.test
```

For the running Compose database:

```sh
docker compose --env-file .env.compose -f infra/compose.yaml -f infra/compose.demo.yaml run --rm -T --no-deps seed node --import tsx scripts/recover-staff.ts --email owner@himal.svara.test
```

Both commands print the location of a new `.local/setup/recovery-<uuid>.json` file,
not the password. Only the named account is reset; disabled access remains disabled.
The original seed file is not updated. A missing original seed file must be restored
from its local backup before seeding again; do not delete it to generate replacements.

## Worklet assets and audio troubleshooting

The audio package compiles browser-safe ES modules. Web build/development startup
copies only `worklet.js`, `pcm.js` and `playback.js` to ignored `public/audio/`.
Docker copies these assets into Next's standalone public directory. No provider or
server module is included. Restart `pnpm dev` after changing worklet source; an
already loaded worklet cannot be hot-replaced within an existing AudioContext.

Use the local loopback URL in a browser supporting AudioWorklet and microphone
capture. Denied/unsupported access leaves text scenarios usable. Microphone frames
are acknowledged and discarded locally; a backlog above 500 ms stops capture.
The playback core accepts at most two seconds of 24 kHz PCM. The lab tone is only
600 ms and ends through an actual worklet segment-completion event.

Do not infer real speech quality or hands-free interruption from the tone/meter.
No provider keys are configured, no live adapters have been connected, and no
billable evaluation ran. The remaining live gate is tracked in `docs/M1-VOICE.md`.

## Repeating browser checks

The browser tests keep real credential quotas enabled: 30 requests per client
address and 10 per account in a ten-minute window. A complete run uses synthetic
accounts and several role-specific sign-ins. Immediately repeating the whole suite
can return HTTP 429 during otherwise valid login/register journeys. Honor the
response's `Retry-After` and let the window expire before rerunning those checks.
Keep the limiter enabled; do not clear shared Redis data to make a test pass.
Target an affected journey while iterating, then run the complete gate once after
the cooldown. Test fixtures never call live speech or generation providers.
