# API and event foundation

| Route                      | Behavior                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | Process liveness without dependency queries                                        |
| `GET /api/v1/health/ready` | Database, Redis, writable media and worker heartbeat; 200 ready or 503 unavailable |
| `GET /api/openapi.json`    | Generated health API contract                                                      |
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

Authentication, DTO mutation validation, CSRF, tenant policies and business routes
arrive in M2 onward. The health API cannot query the seeded organisation/user tables.

## Temporary M1 experiment

`POST /api/v1/feasibility/turn` is registered only when the API is explicitly local
and in fixture mode. Requests must have a loopback Host and the exact configured
Origin. The studio page has its own local/fixture/Host guard. This endpoint is not
a public assistant or an authenticated conversation session.

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
