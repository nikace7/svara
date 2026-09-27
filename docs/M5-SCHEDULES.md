# M5 — Events, schedules and reliable commands

Scheduling, desired state, the command outbox, the worker and the studio board work
end to end, and M4's device gateway delivers each command to the paired kiosk, which
acknowledges it (see `M4-DEVICES.md`).

## Model

- **Event**: descriptive grouping (name, venue, time zone, suggested dates). Editing
  an event never moves a deployment; archived events take no new deployments.
- **Deployment**: one published release on one device for `[startsAt, endsAt)`,
  stored in UTC. `SCHEDULED` rows for a device may not overlap. An `OVERRIDE` starts
  when created, defaults to 30 minutes and lasts at most 24 hours; a running override
  is replaced only when the request names it (`replaceOverrideId`). Draft previews
  can never be scheduled.
- **DesiredDeviceState**: one row per device. An active override wins, then an active
  schedule; otherwise the device is idle. `revision` and `appliedRevision` only move
  forward; a database trigger rejects anything else.
- **DeviceCommand**: the durable outbox. Every desired-state change bumps the
  revision, supersedes undelivered commands and inserts the new `release.apply`
  command in the same transaction.

## Concurrency

Every staff change locks the device row, rechecks overlaps and re-derives desired
state inside the identity layer's serializable transaction. Two simultaneous
overlapping requests cannot both commit: the loser retries and gets `409
SCHEDULE_CONFLICT`, whose `conflictIds` name only the caller's own deployments.
Removing the overlap check makes the race test fail.

## Worker

`ScheduleLoop` runs every second and reconciles every fifth tick and at startup.
Reconciliation selects current truth and does not replay elapsed boundaries, so a
worker that was down for hours makes one change per device, not one per missed
boundary. The command scan expires stale commands, claims due ones under
`FOR UPDATE SKIP LOCKED`, sets the next retry after 1, 2, 4 and 8 s and then every
15 s, and publishes ID-only wake-ups on `<WORKER_NAMESPACE>:device-commands`.
PostgreSQL stays the journal, so a lost wake-up is repaired by the next scan.
Worker readiness reports `scheduling`.

## Device side

`DeviceCommands` runs under M4's live device grant (`DeviceRuntime.asGrant`):

- `snapshot` returns the desired revision, release and the current command ID. It is
  for reconnects.
- `acknowledge` accepts results only from the primary connection; a display gets
  `DISPLAY_READ_ONLY`. A repeated acknowledgement returns the stored result and
  changes nothing. A late acknowledgement for a superseded command is kept as
  telemetry but never revives the command, and the applied revision only moves
  forward.

## Delivery

The API subscribes to the wake-up channel and pushes the current desired snapshot to
each connected primary as `release.desired`. The kiosk downloads and verifies the
release, then calls `command.ack`. The command becomes `ACKNOWLEDGED` or `FAILED`, and
the studio's delivery history shows the result. Closing voice sessions on a
desired-state change belongs to M6 admission.

## Not built

- **Editing a deployment in the studio.** Cancel and reschedule instead; the API's
  `PATCH /deployments/:id` already supports editing.
- **Editing an event in the studio.** `PATCH /events/:id` supports it.
- **A calendar grid.** The board is a week list per device.
- **Daylight saving on the week view.** A week is seven 24-hour days, so zones with
  daylight saving shift by an hour at the week's edge. Kathmandu has none.
