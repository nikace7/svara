# M2 — Identity and tenant boundaries

In progress, 2026-09-08. This increment implements and tests the **domain/database
layer**. The API does not yet expose staff authentication, and the web still uses
the temporary local preview gate. Cookie/Origin/CSRF enforcement, rate limits,
sign-in/onboarding/settings screens and safe account seeds are the next increment.

## Implemented

- Atomic owner registration with one user, organisation, owner membership, audit
  record and session. Strict input schemas reject client-selected organisation IDs.
- Salted asynchronous scrypt password hashing (`N=32768, r=8, p=3`, 64-byte key),
  bounded 12–128-character passwords, and constant-time derived-key comparison.
  Unicode and whitespace in passwords are preserved.
- Random 256-bit session credentials stored only as peppered HMAC digests. CSRF
  tokens use a separate HMAC purpose bound to the session credential. The HTTP
  layer must put the credential in a cookie and omit it from JSON responses.
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
may recover their own account. A scoped local recovery command remains to be built
for multi-organisation recovery; there is no public reset bypass.

## Evidence

`tests/integration/identity.test.ts` uses only the guarded `svara_test` database and
cleans up its uniquely identified rows. Eleven tests cover atomic registration,
credential hashing, rotation, expiry, concurrent invitation consumption, role and
tenant denial, downgrade/disable revocation, existing-account invitation safety,
the simultaneous last-owner race, one-use recovery, recovery scope, link expiry,
revoked issuers, composite FK enforcement and safe settings/audit behavior.

Unit tests independently check password/token/expiry primitives, the full role
permission matrix and strict input contracts. This is not evidence that HTTP or
browser authentication works; those layers are still pending.

Password parameters follow [OWASP's scrypt profiles](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
using [Node's asynchronous crypto API](https://nodejs.org/docs/latest-v22.x/api/crypto.html).

## Remaining M2 work

1. Nest DTOs and generated OpenAPI/forms contract parity; safe error mapping.
2. Host-only HttpOnly cookies, synchronizer CSRF verification, exact Origin checks,
   explicitly trusted gateway handling and Redis-backed admission/rate limits.
3. Registration/login, invitation activation/recovery, organisation switch,
   member/settings screens, logout and expired-session navigation.
4. Replace the temporary studio guard, protect the fixture lab as staff-only and
   test every role through HTTP and actual browser journeys.
5. Safe local staff seed/recovery tooling and operational instructions.
6. Extend the established tenant scope to file/socket/job resources as those
   resources are implemented in M3–M6. No such resource endpoints exist yet.
