# M2 — Identity and tenant boundaries

Identity gate passed, 2026-09-08. Domain/database, HTTP, browser staff flows and
safe local seed/recovery tooling are implemented and tested.
Future file, socket and job boundaries will be tested as those resources arrive.

## Implemented

- Atomic owner registration with one user, organisation, owner membership, audit
  record and session. Strict input schemas reject client-selected organisation IDs.
- Salted asynchronous scrypt password hashing (`N=32768, r=8, p=3`, 64-byte key),
  bounded 12–128-character passwords, and constant-time derived-key comparison.
  Unicode and whitespace in passwords are preserved.
- Random 256-bit session credentials stored only as peppered HMAC digests. CSRF
  tokens use a separate HMAC purpose bound to the session credential. The HTTP
  layer places the credential in a host-only HttpOnly, SameSite=Lax cookie and
  omits it from JSON. HTTPS uses Secure and the `__Host-` prefix.
- Eight-hour absolute and 30-minute idle expiry; membership/user status resolved
  inside each operation's transaction. Login and organisation switching issue new
  tokens. Logout is idempotent. Role/access and password changes revoke sessions.
- Owner-issued invitations and recovery grants with 24-hour expiry, one-use
  transactional consumption and issuer revalidation. An invitation to an existing
  account requires its current password and never changes it.
- Same-organisation member listing, owner-only settings/role changes and last-owner
  protection under concurrent writes. Cross-organisation member IDs return a domain
  `NOT_FOUND`; disallowed actions in one's own organisation return `FORBIDDEN`.
- Safe audit categories and identifiers without credentials or request payloads.
- Composite database foreign keys bind sessions, grant issuers/targets and audit
  actors to their organisation. Serializable transactions retry PostgreSQL write
  conflicts up to three times; external calls and password derivation stay outside
  transactions.

## Recovery scope

An organisation owner cannot reset another user's password if that account also
belongs to another organisation, including a disabled membership. This check runs
both when issuing and consuming recovery links. Otherwise an owner could use a
new membership to take over the user's other organisations. An authenticated owner
may recover their own account. The explicit `pnpm staff:recover --email ...` local
command supports recovery across memberships; there is no public reset bypass.

## Evidence

`tests/integration/identity.test.ts` uses only the guarded `svara_test` database and
cleans up its uniquely identified rows. Eleven tests cover atomic registration,
credential hashing, rotation, expiry, concurrent invitation consumption, role and
tenant denial, downgrade/disable revocation, existing-account invitation safety,
the simultaneous last-owner race, one-use recovery, recovery scope, link expiry,
revoked issuers, composite FK enforcement and safe settings/audit behavior.

Unit tests independently check password/token/expiry primitives, the full role
permission matrix, strict input contracts and browser CSRF ownership. Seven real
HTTP tests cover session cookies, rotation/logout, Origin/Host/CSRF rejection,
malformed and oversized bodies, generated contracts, role/tenant denial, revocation,
rate-limit failure and idle expiry during polling. An additional real Redis test
checks atomic shared admission and expiry. The authenticated fixture stream retains
its concurrency and disconnect tests.

The browser suite covers registration/login/logout, organisation edits, invitations,
viewer restrictions, recovery, last-owner protection and organisation switching.
Responsive/axe, keyboard navigation and real AudioWorklet cleanup tests continue
to run with authenticated staff contexts. Synthetic accounts use unique emails;
test artifacts and credentials are ignored by Git.

## HTTP and browser boundaries

All staff routes require the configured Host. Mutations require the exact Origin,
JSON bodies and, for authenticated operations, a session-bound CSRF header. Input
DTOs reject unknown properties, use explicit validation metadata and map errors to
safe messages. JSON bodies are limited to 16 KiB. The fixture endpoint now requires
staff authentication and rechecks session validity before each output event.

Credential attempts share Redis quotas of 30/IP and 10/normalised email per ten
minutes. General staff access is limited to 300/IP and 180/session per minute.
Redis keys contain purpose-bound HMAC digests, never plaintext subjects. Redis
failure denies admission with 503; rate denial returns 429 and Retry-After. Each
API process also admits at most four active password operations.

Native development trusts no forwarded addresses. The isolated Compose API trusts
one Caddy hop; its port is not published. Caddy owns the forwarded client address.
Do not copy this one-hop setting to an API exposed directly to arbitrary clients.

The Next studio layout resolves the opaque cookie through the internal API using
server-only HTTP, with a deadline and bounded response size. It forwards only the
staff cookie and configured gateway Host. Missing/expired sessions redirect to
`/login`; unavailable dependencies reach a retry screen. No database or pepper
enters the web app. Local experimental pages retain their separate production gate.

Background polling checks the session every 30 seconds without extending idle
expiry; focus/visibility checks refresh it sooner. A 401 removes the workspace and
its audio resources before sign-in navigation. Logout and workspace switching notify
other tabs through a credential-free BroadcastChannel message and discard the
router cache. Forms retain the CSRF token from their rendered session: a cookie
rotation cannot silently apply an old form to a different workspace. Invitation
and recovery credentials arrive in URL fragments, which are cleared on page load.

Password parameters follow [OWASP's scrypt profiles](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
using [Node's asynchronous crypto API](https://nodejs.org/docs/latest-v22.x/api/crypto.html).

## Local accounts and recovery

`pnpm db:seed` creates one owner per fictional organisation and administrator,
operator and viewer accounts for Himal. Random credentials are written exclusively
to ignored `.local/setup/demo-staff.json` before database changes. Compose mounts
that setup directory only into its seed/recovery service; native and container
setup reuse the same file. The seed refuses corrupt or missing prior credentials
and identity conflicts. It never overwrites existing names, passwords, roles or
disabled access. Initial passwords become historical after a password change.

Local recovery checks the local `svara_dev` target, environment and application
marker, requires an explicit email, writes a newly generated password to a unique
ignored recovery file, then resets only that account and revokes its sessions and
grants. It does not re-enable users or memberships. Audit entries identify local
operations with `actorKind=LOCAL` and no staff actor; a database check constraint
prevents mixing local and staff attribution. See `OPERATIONS.md` for commands.

Four additional PostgreSQL tests verify idempotent seeding, account-collision denial,
recovery across memberships, revocation and disabled-access preservation. Three
credential-file tests verify non-overwriting generation and missing/corrupt file
denial. The browser verifies all five generated credentials and role-aware settings.

File/socket/job scope enforcement extends these boundaries as resources are built
in M3–M6. No such resource endpoints exist yet.
