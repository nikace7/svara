# API and event foundation

| Route                      | Behavior                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Process liveness without dependency queries                                        |
| `GET /api/v1/health/ready` | Database, Redis, writable media and worker heartbeat; 200 ready or 503 unavailable |
| `GET /api/openapi.json`    | Generated health, staff and bot draft API contract                                 |
| `GET /api/docs`            | Swagger UI in local mode                                                           |
| `GET /gateway-health`      | Caddy liveness                                                                     |

Worker health is internal at port 4101, `/health/live` and `/health/ready`.
Health checks never call providers. Worker heartbeat expires after 15 seconds,
so API readiness can lag a stopped worker by at most that TTL.

API responses use `Cache-Control: no-store` and a server-generated `x-request-id`.
Unknown routes return the blueprint's safe error envelope. Responses contain no
connection strings, storage paths, password hashes or provider keys.

```json
{
  "data": {
    "status": "ready",
    "dependencies": {
      "database": "ready",
      "redis": "ready",
      "media": "ready",
      "worker": "ready"
    },
    "service": "api",
    "providerMode": "fixture"
  }
}
```

## Contract generation

Nest Swagger decorators define HTTP types. `pnpm contracts:generate` builds the API
and creates an app without database/provider connections, then writes
`packages/contracts/openapi.json` and `packages/contracts/src/http.generated.ts`.
The browser uses generated types. `pnpm contracts:check` compares generated content
with disk and fails on drift without changing the files.

Zod schemas in `packages/contracts/src/events.ts` define protocol v1 metadata and
the first `device.updated` invalidation payload. Tests reject invalid UUIDs, dates,
versions, revisions and unknown properties. This is scaffolding: no Socket.IO
namespace, ticket exchange, room or device command exists yet.

## Staff identity

| Route                                                       | Behavior                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register`, `/auth/login`                 | Public credential admission; issue a host-only session cookie                            |
| `GET /api/v1/auth/session`, `/auth/csrf`                    | Resolve staff identity or session-bound CSRF without extending idle expiry               |
| `POST /api/v1/auth/logout`                                  | Idempotent logout and cookie clearing; requires Origin and CSRF when a cookie is present |
| `POST /api/v1/auth/organisation`                            | Switch to an enabled membership and rotate the cookie                                    |
| `POST /api/v1/auth/activate`, `/auth/recover`               | Consume one-use invitation/recovery credentials                                          |
| `GET /api/v1/members`                                       | List only the current organisation's members                                             |
| `POST /api/v1/members/invitations`, `/members/:id/recovery` | Owner-only, one-use access links returned once                                           |
| `PATCH /api/v1/members/:id`                                 | Owner-only role/access changes with last-owner protection and session revocation         |
| `PATCH /api/v1/organisation`                                | Owner-only name/timezone changes                                                         |

Staff mutations require exact Origin, JSON and `X-CSRF-Token` (except public
credential exchanges). All staff routes enforce the configured Host. Cookies are
HttpOnly, SameSite=Lax and Secure on HTTPS, with no Domain attribute. Tokens never
appear in authentication JSON. Use the generated OpenAPI document for body and
response schemas; see `M2-IDENTITY.md` for quotas and authority details. Authentication
HTTP tests load the compiled API so Nest's DTO decorator metadata is exercised.

## Bot drafts

| Route                           | Behavior                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/v1/bots`              | Current organisation's paginated list; search, page, pageSize and includeArchived filters |
| `POST /api/v1/bots`             | Owner/administrator creates an incomplete draft                                           |
| `GET /api/v1/bots/:id`          | Scoped draft read for staff                                                               |
| `PATCH /api/v1/bots/:id`        | Owner/administrator saves identity and draft with expectedRevision                        |
| `POST /api/v1/bots/:id/archive` | Revision-checked archive or restore using archived boolean                                |

These routes share staff cookies, Host/Origin, CSRF and Redis admission controls.
Bot bodies are bounded at 64 KiB to accommodate full bilingual Unicode drafts.
Missing revisions return 428; stale saves return 409 with `REVISION_CONFLICT` and
`currentRevision`; archived saves return 409 `ARCHIVED`. Foreign IDs return 404.
See `M3-AUTHORING.md` for transaction and editor behavior. The explicit reversible
archive endpoint currently replaces the blueprint's draft DELETE operation.

## Knowledge drafts

| Route                                  | Behavior                                                          |
| -------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/v1/bots/:botId/knowledge`    | Scoped paginated summaries; title search, status and type filters |
| `POST /api/v1/bots/:botId/knowledge`   | Create an incomplete FAQ or reference note                        |
| `GET /api/v1/knowledge/:id`            | Read a scoped entry with both translations and current revisions  |
| `PATCH /api/v1/knowledge/:id`          | Save full entry text and clear previous approval                  |
| `POST /api/v1/knowledge/:id/approval`  | Approve or return to draft using the approved boolean             |
| `POST /api/v1/knowledge/:id/selection` | Include or exclude using the selected boolean; preserves approval |
| `DELETE /api/v1/knowledge/:id`         | Remove the draft entry and retain its audit history               |

All staff roles may read; owners and administrators may mutate. The same cookie,
Host/Origin, CSRF and Redis controls apply. Knowledge JSON bodies are bounded at
64 KiB. Each existing-entry mutation requires `expectedRevision`; missing/stale
revisions return 428/409. Archived parents return 409 `ARCHIVED`, and foreign IDs
return 404. Approval of incomplete translations returns 422
`INCOMPLETE_TRANSLATIONS`, with `fieldErrors` keyed by content/question and locale.
Successful entry mutations also advance the bot revision. Generated OpenAPI derives
body and response shapes from the shared strict contracts.

## Staff media

| Route                             | Behavior                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/v1/media`              | Owner/administrator streams one multipart upload; returns 202 processing metadata |
| `GET /api/v1/media`               | Staff lists scoped files with search, kind, state and pagination                  |
| `GET /api/v1/media/:id`           | Staff reads current processing metadata                                           |
| `DELETE /api/v1/media/:id`        | Owner/administrator requests revision-checked asynchronous removal                |
| `GET /api/v1/media/:id/content`   | Staff reads a READY object, including single byte ranges and HEAD                 |
| `GET /api/v1/media/:id/thumbnail` | Staff reads a READY image thumbnail                                               |

Upload requires the configured Host/Origin, staff cookie and rendered-session
`X-CSRF-Token`. The form contains `metadata` first (JSON with `filename`, `mimeType`
and `byteLength`), followed by one `file`. JPEG/PNG are limited to 10 MiB and MP4 to
50 MiB, with exact byte counting, bounded multipart overhead and a 120-second deadline.
Other staff mutations retain JSON-only admission. The body is streamed without
buffering the file in the API process.

No content is served until inspection records READY. Responses use no-store,
nosniff, same-origin resource policy, an encoded Content-Disposition filename and a
checksum ETag. Valid ranges return 206; invalid/multiple ranges return 416 with
`Content-Range: bytes */<size>`. If-Range mismatch returns the full object. Foreign
IDs return 404 before opening a file. Missing/stale deletion revisions return
428/409; uploads or inspections in progress return `MEDIA_BUSY` when deletion is
not permitted. A byte mismatch returns 422 `UPLOAD_LENGTH_MISMATCH`. Media quota
errors preserve actionable `MEDIA_QUOTA` feedback.

## Temporary M1 experiment

`POST /api/v1/feasibility/turn` is registered only when the API is explicitly local
and in fixture mode. Requests require a staff cookie, CSRF and the exact configured
Host/Origin. The studio page also retains its local/fixture gate. This endpoint is
an authenticated experiment; it does not create persisted conversation sessions.

`packages/contracts/src/feasibility.ts` is the canonical Zod request/event contract.
The temporary NDJSON transport is separate from the stable generated health OpenAPI
document. Each request selects `locale`, positive `generation`, and exactly one
`scenario` or `text` (1–1,000 trimmed UTF-16 code units). Unknown fields are rejected.

Events carry protocol version, server-generated turn ID, generation, monotonic
sequence, elapsed server milliseconds, stage, text and explicit fixture/text-only
provenance. The client validates events, UTF-8, line size, turn/generation/sequence
and terminal completion. A truncated or corrupt stream cannot become a completed
answer. It does not emit audio or execute tools.

JSON bodies are limited to 16 KiB. The process admits four streams, then returns
429 with Retry-After. A stream lasts at most ten seconds, honors HTTP backpressure,
and aborts when its client disconnects. Errors use the safe error envelope. No
audio, transcripts or request bodies are persisted or written to logs.
