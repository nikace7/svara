# M4 — Paired devices and dual displays

A browser profile becomes one paired kiosk. Its primary window applies releases and
its display window mirrors what the primary applied. Staff pair, supervise and revoke
devices from the studio. Schedules drive what each device should run (see
`M5-SCHEDULES.md`).

## Authority

- **Pairing.** Staff create a six-character one-use code, valid for five minutes, with
  at most five failures per code and ten attempts per IP per minute. Redeeming it sets
  a separate HttpOnly device cookie (`__Host-svara-device` on HTTPS) that is never put
  in URLs or local storage. Creating a code revokes the device's earlier pairing.
  Re-pairing a browser that already has a working pairing needs `replaceExisting`.
- **Tickets.** `POST /runtime/tickets` exchanges the cookie and its CSRF token for a
  one-use, 60-second ticket scoped to the device, the `/devices` namespace and a role
  (`PRIMARY` or `DISPLAY`). The socket sends it in the handshake auth payload.
  Redemption is atomic and creates a lease; only one primary may hold a lease per
  device, and there are at most two displays.
- **Revocation.** Revoking, disabling or re-pairing a device revokes its credentials,
  tickets and leases in the same transaction. The gateway then disconnects every open
  window of that device at once. A missed heartbeat does the same within 35 seconds.

## Runtime protocol (`/devices`, protocol v1)

| Direction        | Event                           | Rule                                                                                             |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Server → primary | `release.desired`               | Sent on connect and on each worker wake-up: `commandId`, `revision`, `releaseId`, `deploymentId` |
| Primary → server | `command.ack` → `command.acked` | `APPLIED` or `REJECTED` with a reason code; a repeat returns the stored result                   |
| Server → display | `display.state`                 | The applied revision and release, refreshed after each applied acknowledgement                   |
| Either → server  | `device.heartbeat`              | Every 10 s; renews the lease                                                                     |
| Server → either  | `device.error`                  | `DISPLAY_READ_ONLY`, `GRANT_EXPIRED`, `DEVICE_REVOKED` and similar                               |

The server derives the device from the ticket. Rooms come from that actor, never from
client input. A display's `command.ack` is refused, and the display namespace offers
no voice or action events.

## Releases on the device

`GET /runtime/manifest` returns the desired release (`?view=applied` for displays):
greeting, slides with screen targets, and a media manifest with SHA-256 and length.
It never includes knowledge. `GET /runtime/media/:id/content` streams only media
referenced by the device's desired or applied release.

The kiosk downloads every asset its screen needs and checks each one's checksum and
length before swapping the whole release in at once. Only then does it acknowledge
`APPLIED`. A failed download or checksum keeps the previous complete release on
screen, states that it failed, and acknowledges `REJECTED` (`DOWNLOAD_FAILED` or
`CHECKSUM_MISMATCH`). Offline windows keep the last complete release and say so.
Revocation clears the downloaded object URLs.

## Studio

- **Devices:** register, pair (code, pairing ID and kiosk link), maintenance mode,
  enable or disable, revoke with confirmation, and presence (online, offline, never
  connected).
- **Device simulator:** frames `/kiosk` and `/display` side by side, in 16:9 or 9:16.
  The staff browser itself becomes the paired kiosk, so use a separate browser profile
  for a second kiosk.

## Evidence

- **Integration** (`device-runtime.test.ts`, `devices*.test.ts`) covers:
  - ticket reuse and a second primary;
  - foreign origins;
  - display restrictions;
  - media scope;
  - manifests without knowledge;
  - revocation, with a check that removing the disconnect hook fails the test.
- **Browser** (`devices.spec.ts`) runs the M4 gate end to end:
  - two kiosks in isolated contexts;
  - a display mirroring its kiosk;
  - a blocked download that keeps v1 on screen before v2 lands;
  - revocation reaching both windows of one kiosk while the other stays online.

## Not built

- **Voice on the kiosk.** Starting voice from a kiosk and closing voice sessions on a
  desired-state change belong to M6 admission.
- **Retention cleanup** of expired pairing codes, tickets and leases (M7).
- **Offline media cache.** Downloads are held in memory as verified object URLs, so a
  reload while offline shows nothing until the connection returns.
