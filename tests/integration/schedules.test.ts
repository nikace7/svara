import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';
import { KnowledgeService } from '../../packages/domain/src/authoring/knowledge.js';
import { ReleaseService } from '../../packages/domain/src/authoring/releases.js';
import { DeviceService } from '../../packages/domain/src/devices/service.js';
import { DeviceRuntime } from '../../packages/domain/src/devices/runtime.js';
import { ScheduleService } from '../../packages/domain/src/schedules/service.js';
import { CommandOutbox, DeviceCommands } from '../../packages/domain/src/schedules/outbox.js';
import { staffFixture } from './staff-fixture.js';

const minute = 60_000;
const iso = (date: Date) => date.toISOString();

describe('schedules, desired state and the durable command outbox', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let identity: IdentityService;
  let schedules: ScheduleService;
  let outbox: CommandOutbox;
  let commands: DeviceCommands;
  let devices: DeviceService;
  let runtime: DeviceRuntime;
  let releaseA: { id: string };
  let releaseB: { id: string };
  let preview: { id: string };
  // Whole minutes keep boundary arithmetic exact.
  let now = new Date(Math.ceil(Date.now() / minute) * minute + 60 * minute);
  const clock = () => new Date(now);

  beforeAll(async () => {
    staff = await staffFixture();
    identity = new IdentityService(staff.db, staff.pepper);
    schedules = new ScheduleService(identity, clock);
    outbox = new CommandOutbox(staff.db, clock);
    devices = new DeviceService(identity, staff.pepper, clock);
    runtime = new DeviceRuntime(staff.db, staff.pepper, clock);
    commands = new DeviceCommands(runtime, clock);
    const bots = new BotService(identity);
    const knowledge = new KnowledgeService(identity);
    const releases = new ReleaseService(identity, { providerMode: 'fixture' });
    const created = await bots.create(staff.owner.token, { name: 'Open house guide' });
    const bot = await bots.save(staff.owner.token, created.id, {
      name: created.name,
      description: 'Synthetic campus',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help visitors with the approved campus information.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'कृपया स्वागत कक्षमा सोध्नुहोस्।' },
      },
    });
    const entry = await knowledge.create(staff.owner.token, bot.id, {
      title: 'Reception',
      type: 'FAQ',
    });
    const saved = await knowledge.save(staff.owner.token, entry.id, {
      expectedRevision: entry.revision,
      title: entry.title,
      type: 'FAQ',
      content: { en: 'Reception is in room 12.', ne: 'स्वागत कक्ष कोठा १२ मा छ।' },
      question: { en: 'Where is reception?', ne: 'स्वागत कक्ष कहाँ छ?' },
    });
    await knowledge.approve(staff.owner.token, saved.id, {
      expectedRevision: saved.revision,
      approved: true,
    });
    const revision = async () => (await bots.get(staff.owner.token, bot.id)).revision;
    releaseA = await releases.publish(
      staff.owner.token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
    releaseB = await releases.publish(
      staff.owner.token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
    preview = await releases.preview(
      staff.owner.token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
  });

  afterAll(async () => {
    if (!staff) return;
    const organisations = await staff.db.organisation.findMany({
      where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      select: { id: true },
    });
    const where = { organisationId: { in: organisations.map((org) => org.id) } };
    await staff.db.deviceCommand.deleteMany({ where });
    await staff.db.desiredDeviceState.deleteMany({ where });
    await staff.db.deployment.deleteMany({ where });
    await staff.db.event.deleteMany({ where });
    await staff.db.deviceGrant.deleteMany({ where });
    await staff.db.deviceTicket.deleteMany({ where });
    await staff.db.deviceCredential.deleteMany({ where });
    await staff.db.pairingChallenge.deleteMany({ where });
    await staff.db.device.deleteMany({ where });
    await staff.db.idempotencyRecord.deleteMany({ where });
    await staff.db.botRelease.deleteMany({ where });
    await staff.db.bot.deleteMany({ where });
    await staff.close();
  });

  const device = () => devices.create(staff.owner.token, { name: `Kiosk ${randomUUID()}` });
  const later = (minutes: number) => new Date(now.getTime() + minutes * minute);
  const schedule = (deviceId: string, from: number, to: number, releaseId = releaseA.id) =>
    schedules.createDeployment(staff.owner.token, {
      deviceId,
      releaseId,
      startsAt: iso(later(from)),
      endsAt: iso(later(to)),
    });
  const desired = async (deviceId: string) =>
    (await schedules.timeline(staff.owner.token, deviceId)).desired;

  it('lets only one of two simultaneous overlapping schedules commit', async () => {
    const kiosk = await device();
    const results = await Promise.allSettled([
      schedule(kiosk.id, 60, 120),
      schedule(kiosk.id, 90, 150, releaseB.id),
    ]);
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toMatchObject({
      code: 'SCHEDULE_CONFLICT',
      conflictIds: [won[0]!.value.id],
    });
    // [start, end) intervals: a schedule touching the winner's end does not conflict.
    const end = (Date.parse(won[0]!.value.endsAt) - now.getTime()) / minute;
    expect((await schedule(kiosk.id, end, end + 30)).kind).toBe('SCHEDULED');
  });

  it('refuses previews, foreign resources, viewers and windows that cannot run', async () => {
    const kiosk = await device();
    await expect(schedule(kiosk.id, 10, 20, preview.id)).rejects.toMatchObject({
      code: 'RELEASE_NOT_SCHEDULABLE',
    });
    await expect(schedule(kiosk.id, -30, -10)).rejects.toMatchObject({ code: 'WINDOW_INVALID' });
    await expect(schedule(kiosk.id, 0, 32 * 24 * 60)).rejects.toMatchObject({
      code: 'WINDOW_INVALID',
    });
    const foreign = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign Owner',
      organisationName: 'Foreign Schedule Campus',
    });
    await expect(
      schedules.createDeployment(foreign.token, {
        deviceId: kiosk.id,
        releaseId: releaseA.id,
        startsAt: iso(later(10)),
        endsAt: iso(later(20)),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(schedules.timeline(foreign.token, kiosk.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const viewer = await staff.service.register({
      email: `viewer-${staff.suffix}`,
      password: staff.password,
      displayName: 'Schedule Viewer',
      organisationName: 'Viewer Schedule Campus',
    });
    await staff.db.membership.update({
      where: { id: viewer.identity.membership.id },
      data: { role: 'VIEWER' },
    });
    await expect(
      schedules.createDeployment(viewer.token, {
        deviceId: randomUUID(),
        releaseId: releaseA.id,
        startsAt: iso(later(10)),
        endsAt: iso(later(20)),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('switches desired state at boundary times and queues one command per revision', async () => {
    const kiosk = await device();
    const start = now;
    await schedule(kiosk.id, 60, 120);
    expect(await desired(kiosk.id)).toMatchObject({ revision: 0, releaseId: null });
    now = new Date(start.getTime() + 60 * minute);
    try {
      expect(await outbox.reconcileDue()).toBeGreaterThanOrEqual(1);
      expect(await desired(kiosk.id)).toMatchObject({ revision: 1, releaseId: releaseA.id });
      // A second tick at the same instant changes nothing.
      await outbox.reconcileDue();
      now = new Date(start.getTime() + 120 * minute);
      await outbox.reconcileDue();
      const timeline = await schedules.timeline(staff.owner.token, kiosk.id);
      expect(timeline.desired).toMatchObject({ revision: 2, releaseId: null, deploymentId: null });
      expect(timeline.commands.map((command) => [command.stateRevision, command.status])).toEqual([
        [2, 'QUEUED'],
        [1, 'SUPERSEDED'],
      ]);
    } finally {
      now = start;
    }
  });

  it('applies overrides before schedules, requires explicit replacement and restores on expiry', async () => {
    const kiosk = await device();
    const start = now;
    const scheduled = await schedule(kiosk.id, 0, 240);
    expect(await desired(kiosk.id)).toMatchObject({
      revision: 1,
      deploymentId: scheduled.id,
      releaseId: releaseA.id,
    });
    const first = await schedules.override(staff.owner.token, kiosk.id, {
      releaseId: releaseB.id,
    });
    expect(first).toMatchObject({ kind: 'OVERRIDE', state: 'ACTIVE' });
    expect(Date.parse(first.endsAt) - Date.parse(first.startsAt)).toBe(30 * minute);
    expect(await desired(kiosk.id)).toMatchObject({ revision: 2, deploymentId: first.id });
    await expect(
      schedules.override(staff.owner.token, kiosk.id, { releaseId: releaseA.id, minutes: 5 }),
    ).rejects.toMatchObject({ code: 'OVERRIDE_CONFLICT', conflictIds: [first.id] });
    const second = await schedules.override(staff.owner.token, kiosk.id, {
      releaseId: releaseA.id,
      minutes: 5,
      replaceOverrideId: first.id,
    });
    expect(await desired(kiosk.id)).toMatchObject({ revision: 3, deploymentId: second.id });
    now = new Date(start.getTime() + 5 * minute);
    try {
      await outbox.reconcileDue();
      expect(await desired(kiosk.id)).toMatchObject({
        revision: 4,
        deploymentId: scheduled.id,
        releaseId: releaseA.id,
      });
    } finally {
      now = start;
    }
  });

  it('recomputes immediately on cancel and refuses stale or closed changes', async () => {
    const kiosk = await device();
    const active = await schedule(kiosk.id, 0, 60);
    await expect(
      schedules.cancelDeployment(staff.owner.token, active.id, {}),
    ).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED' });
    await expect(
      schedules.cancelDeployment(staff.owner.token, active.id, { expectedRevision: 9 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
    const cancelled = await schedules.cancelDeployment(staff.owner.token, active.id, {
      expectedRevision: 1,
    });
    expect(cancelled.state).toBe('CANCELLED');
    expect(await desired(kiosk.id)).toMatchObject({ revision: 2, releaseId: null });
    await expect(
      schedules.saveDeployment(staff.owner.token, active.id, {
        releaseId: releaseA.id,
        eventId: null,
        startsAt: iso(later(0)),
        endsAt: iso(later(90)),
        expectedRevision: cancelled.revision,
      }),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_CLOSED' });
  });

  it('reconciles current truth after downtime instead of replaying elapsed boundaries', async () => {
    const kiosk = await device();
    const start = now;
    await schedule(kiosk.id, 60, 120);
    const second = await schedule(kiosk.id, 120, 180, releaseB.id);
    now = new Date(start.getTime() + 150 * minute);
    try {
      await new CommandOutbox(staff.db, clock).reconcileDue();
      const timeline = await schedules.timeline(staff.owner.token, kiosk.id);
      expect(timeline.desired).toMatchObject({ revision: 1, deploymentId: second.id });
      expect(timeline.commands).toHaveLength(1);
    } finally {
      now = start;
    }
  });

  it('retries unacknowledged commands with backoff and expires them', async () => {
    const kiosk = await device();
    const start = now;
    const active = await schedule(kiosk.id, 0, 1);
    const mine = async () =>
      (await outbox.claim(100)).filter((command) => command.deviceId === kiosk.id);
    try {
      expect(await mine()).toHaveLength(1);
      expect(await mine()).toHaveLength(0);
      now = new Date(start.getTime() + 1000);
      expect(await mine()).toHaveLength(1);
      now = new Date(start.getTime() + 2000);
      expect(await mine()).toHaveLength(0);
      now = new Date(start.getTime() + 3000);
      expect(await mine()).toHaveLength(1);
      const [sent] = (await schedules.timeline(staff.owner.token, kiosk.id)).commands;
      expect(sent).toMatchObject({ status: 'SENT', attempts: 3 });
      now = new Date(Date.parse(active.endsAt));
      await outbox.expire();
      const [expired] = (await schedules.timeline(staff.owner.token, kiosk.id)).commands;
      expect(expired).toMatchObject({ id: sent!.id, status: 'EXPIRED' });
    } finally {
      now = start;
    }
  });

  it('accepts acknowledgements only from the primary device and never repeats their effect', async () => {
    const kiosk = await device();
    const challenge = await devices.createPairing(staff.owner.token, kiosk.id, {
      expectedRevision: kiosk.revision,
    });
    const credential = await runtime.pair({ challengeId: challenge.id, code: challenge.code });
    const connect = async (role: 'PRIMARY' | 'DISPLAY') =>
      runtime.redeemTicket(
        (await runtime.issueTicket(credential.token, { namespace: '/devices', role })).ticket,
        { namespace: '/devices', role },
      );
    const primary = await connect('PRIMARY');
    const display = await connect('DISPLAY');
    await schedule(kiosk.id, 0, 60);
    const snapshot = await commands.snapshot(primary);
    expect(snapshot).toMatchObject({ revision: 1, releaseId: releaseA.id });
    const ack = { commandId: snapshot.commandId, appliedRevision: 1, result: 'APPLIED' };
    await expect(commands.acknowledge(display, ack)).rejects.toMatchObject({
      code: 'DISPLAY_READ_ONLY',
    });
    await expect(
      commands.acknowledge(primary, { ...ack, appliedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const first = await commands.acknowledge(primary, ack);
    expect(first).toMatchObject({ status: 'ACKNOWLEDGED', result: 'APPLIED' });
    const applied = await desired(kiosk.id);
    expect(applied).toMatchObject({ appliedRevision: 1, appliedReleaseId: releaseA.id });
    now = new Date(now.getTime() + 5000);
    const replay = await commands.acknowledge(primary, { ...ack, result: 'REJECTED' });
    expect(replay).toEqual(first);
    expect(await desired(kiosk.id)).toEqual(applied);
    const other = await device();
    await schedule(other.id, 0, 60);
    const foreign = (await schedules.timeline(staff.owner.token, other.id)).commands[0]!;
    await expect(
      commands.acknowledge(primary, { ...ack, commandId: foreign.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      staff.db.desiredDeviceState.update({ where: { deviceId: kiosk.id }, data: { revision: 0 } }),
    ).rejects.toThrow();
  });

  it('keeps events descriptive: edits never move deployments and archived events take none', async () => {
    const kiosk = await device();
    const event = await schedules.createEvent(staff.owner.token, {
      name: 'Open house — खुला दिवस',
      venue: 'Main hall',
      timezone: 'Asia/Kathmandu',
      suggestedStartsAt: iso(later(60)),
      suggestedEndsAt: iso(later(120)),
    });
    const booked = await schedules.createDeployment(staff.owner.token, {
      deviceId: kiosk.id,
      releaseId: releaseA.id,
      eventId: event.id,
      startsAt: iso(later(60)),
      endsAt: iso(later(120)),
    });
    const moved = await schedules.saveEvent(staff.owner.token, event.id, {
      name: event.name,
      venue: event.venue,
      timezone: event.timezone,
      suggestedStartsAt: iso(later(300)),
      suggestedEndsAt: iso(later(360)),
      expectedRevision: event.revision,
    });
    const board = await schedules.board(staff.owner.token, {
      from: iso(later(0)),
      to: iso(later(24 * 60)),
    });
    expect(board.deployments.find((item) => item.id === booked.id)).toMatchObject({
      startsAt: booked.startsAt,
      event: { id: event.id },
    });
    const archived = await schedules.archiveEvent(staff.owner.token, event.id, {
      archived: true,
      expectedRevision: moved.revision,
    });
    expect(archived.archivedAt).not.toBeNull();
    await expect(
      schedules.createDeployment(staff.owner.token, {
        deviceId: kiosk.id,
        releaseId: releaseA.id,
        eventId: event.id,
        startsAt: iso(later(200)),
        endsAt: iso(later(260)),
      }),
    ).rejects.toMatchObject({ code: 'EVENT_ARCHIVED' });
    const listed = await schedules.listEvents(staff.owner.token, {});
    expect(listed.items.map((item) => item.id)).not.toContain(event.id);
  });
});
