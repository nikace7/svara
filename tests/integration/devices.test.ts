import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeviceService } from '../../packages/domain/src/devices/service.js';
import { DeviceRuntime } from '../../packages/domain/src/devices/runtime.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { staffFixture } from './staff-fixture.js';

describe('device registry, pairing and connection authority', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let devices: DeviceService;
  let runtime: DeviceRuntime;
  let now = new Date();
  const clock = () => new Date(now);
  beforeAll(async () => {
    staff = await staffFixture();
    devices = new DeviceService(new IdentityService(staff.db, staff.pepper), staff.pepper, clock);
    runtime = new DeviceRuntime(staff.db, staff.pepper, clock);
  });
  afterAll(async () => {
    if (!staff) return;
    const organisations = await staff.db.organisation.findMany({
      where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      select: { id: true },
    });
    const where = { organisationId: { in: organisations.map((org) => org.id) } };
    await staff.db.deviceGrant.deleteMany({ where });
    await staff.db.deviceTicket.deleteMany({ where });
    await staff.db.deviceCredential.deleteMany({ where });
    await staff.db.pairingChallenge.deleteMany({ where });
    await staff.db.device.deleteMany({ where });
    await staff.close();
  });
  async function fixture() {
    now = new Date();
    const device = await devices.create(staff.owner.token, { name: `Kiosk ${randomUUID()}` });
    const challenge = await devices.createPairing(staff.owner.token, device.id, {
      expectedRevision: device.revision,
    });
    return { device, challenge };
  }
  async function paired() {
    const result = await fixture();
    return {
      ...result,
      credential: await runtime.pair({
        challengeId: result.challenge.id,
        code: result.challenge.code,
      }),
    };
  }
  const ticket = (token: string, role: 'PRIMARY' | 'DISPLAY' = 'PRIMARY') =>
    runtime.issueTicket(token, { namespace: '/devices', role });
  const connect = async (token: string, role: 'PRIMARY' | 'DISPLAY' = 'PRIMARY') =>
    runtime.redeemTicket((await ticket(token, role)).ticket, { namespace: '/devices', role });

  it('scopes registry reads and changes to current staff roles with revision conflict protection', async () => {
    const device = await devices.create(staff.owner.token, { name: 'Lobby — स्वागत कक्ष' });
    expect(device).toMatchObject({
      revision: 1,
      enabled: true,
      connection: 'NEVER_SEEN',
      paired: false,
    });
    expect(JSON.stringify(device)).not.toMatch(/token|Hash|credential/i);
    const foreign = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign Owner',
      organisationName: 'Foreign Device Campus',
    });
    await expect(devices.get(foreign.token, device.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const viewer = await staff.service.register({
      email: `viewer-${staff.suffix}`,
      password: staff.password,
      displayName: 'Device Viewer',
      organisationName: 'Viewer Campus',
    });
    await staff.db.membership.update({
      where: { id: viewer.identity.membership.id },
      data: { role: 'VIEWER' },
    });
    await expect(devices.create(viewer.token, { name: 'Denied' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await staff.db.membership.update({
      where: { id: viewer.identity.membership.id },
      data: { role: 'OPERATOR' },
    });
    expect(await devices.create(viewer.token, { name: 'Operator kiosk' })).toMatchObject({
      name: 'Operator kiosk',
    });
    const input = {
      name: 'Updated lobby',
      enabled: true,
      maintenanceMode: true,
      capabilities: device.capabilities,
    };
    await expect(devices.save(staff.owner.token, device.id, input)).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
    });
    const updated = await devices.save(staff.owner.token, device.id, {
      ...input,
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({ revision: 2, maintenanceMode: true });
    await expect(
      devices.save(staff.owner.token, device.id, { ...input, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
    const page = await devices.list(staff.owner.token, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect((await devices.list(foreign.token, {})).items).toHaveLength(0);
  });

  it('atomically consumes one challenge, stores hashes only and never mints a staff session', async () => {
    const { device, challenge } = await fixture();
    expect(challenge.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(new Date(challenge.expiresAt).getTime() - now.getTime()).toBe(300000);
    const sessions = await staff.db.staffSession.count();
    const results = await Promise.allSettled([
      runtime.pair({ challengeId: challenge.id, code: challenge.code }),
      runtime.pair({ challengeId: challenge.id, code: challenge.code }),
    ]);
    const successes = results.filter((value) => value.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    expect(results.find((value) => value.status === 'rejected')).toMatchObject({
      reason: { code: 'INVALID_PAIRING' },
    });
    const issued = successes[0]!;
    if (issued.status !== 'fulfilled') throw new Error('Expected credential.');
    expect(issued.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await staff.db.deviceCredential.findFirstOrThrow({
      where: { deviceId: device.id },
    });
    expect(stored.tokenHash).not.toBe(issued.value.token);
    expect(
      (await staff.db.pairingChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).codeHash,
    ).not.toBe(challenge.code);
    expect(await runtime.identity(issued.value.token)).toMatchObject({
      id: device.id,
      name: device.name,
    });
    expect(await staff.db.staffSession.count()).toBe(sessions);
    expect(await staff.db.deviceCredential.count({ where: { deviceId: device.id } })).toBe(1);
    const audits = JSON.stringify(
      await staff.db.auditEntry.findMany({ where: { targetId: device.id } }),
    );
    expect(audits).not.toContain(challenge.code);
    expect(audits).not.toContain(issued.value.token);
  });

  it('commits incorrect-code attempts, stops at five and expires at the exact deadline', async () => {
    const { challenge } = await fixture();
    const wrong = challenge.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => runtime.pair({ challengeId: challenge.id, code: wrong })),
    );
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(
      (await staff.db.pairingChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).attempts,
    ).toBe(5);
    await expect(
      runtime.pair({ challengeId: challenge.id, code: challenge.code }),
    ).rejects.toMatchObject({ code: 'INVALID_PAIRING' });
    const next = await fixture();
    now = new Date(next.challenge.expiresAt);
    await expect(
      runtime.pair({ challengeId: next.challenge.id, code: next.challenge.code }),
    ).rejects.toMatchObject({ code: 'INVALID_PAIRING' });
  });

  it('regeneration revokes the unclaimed credential and old challenges without changing another device', async () => {
    const first = await paired();
    const other = await paired();
    const oldTicket = await ticket(first.credential.token);
    const current = await devices.get(staff.owner.token, first.device.id);
    const regenerated = await devices.createPairing(staff.owner.token, first.device.id, {
      expectedRevision: current.revision,
    });
    await expect(runtime.identity(first.credential.token)).rejects.toMatchObject({
      code: 'DEVICE_UNAUTHENTICATED',
    });
    await expect(
      runtime.redeemTicket(oldTicket.ticket, { namespace: '/devices', role: 'PRIMARY' }),
    ).rejects.toMatchObject({ code: 'INVALID_TICKET' });
    await expect(
      runtime.pair({ challengeId: first.challenge.id, code: first.challenge.code }),
    ).rejects.toMatchObject({ code: 'INVALID_PAIRING' });
    expect(await runtime.identity(other.credential.token)).toMatchObject({ id: other.device.id });
    expect(
      await runtime.pair({ challengeId: regenerated.id, code: regenerated.code }),
    ).toHaveProperty('token');
  });

  it('uses purpose-separated ticket hashes, immutable roles and one-use 60-second redemption', async () => {
    const { credential } = await paired();
    const issued = await ticket(credential.token, 'DISPLAY');
    expect(new Date(issued.expiresAt).getTime() - now.getTime()).toBe(60000);
    await expect(
      runtime.redeemTicket(issued.ticket, { namespace: '/devices', role: 'PRIMARY' }),
    ).rejects.toMatchObject({ code: 'INVALID_TICKET' });
    await expect(runtime.identity(issued.ticket)).rejects.toMatchObject({
      code: 'DEVICE_UNAUTHENTICATED',
    });
    const result = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        runtime.redeemTicket(issued.ticket, { namespace: '/devices', role: 'DISPLAY' }),
      ),
    );
    expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    const expired = await ticket(credential.token);
    now = new Date(expired.expiresAt);
    await expect(
      runtime.redeemTicket(expired.ticket, { namespace: '/devices', role: 'PRIMARY' }),
    ).rejects.toMatchObject({ code: 'INVALID_TICKET' });
  });

  it('allows one primary lease, consumes conflicting attempts and bounds display connections', async () => {
    const { credential } = await paired();
    const issued = await Promise.all([ticket(credential.token), ticket(credential.token)]);
    const attempts = await Promise.allSettled(
      issued.map((value) =>
        runtime.redeemTicket(value.ticket, { namespace: '/devices', role: 'PRIMARY' }),
      ),
    );
    expect(attempts.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.find((value) => value.status === 'rejected')).toMatchObject({
      reason: { code: 'PRIMARY_CONFLICT' },
    });
    for (const value of issued)
      await expect(
        runtime.redeemTicket(value.ticket, { namespace: '/devices', role: 'PRIMARY' }),
      ).rejects.toMatchObject({ code: 'INVALID_TICKET' });
    const display = await connect(credential.token, 'DISPLAY');
    await connect(credential.token, 'DISPLAY');
    await expect(connect(credential.token, 'DISPLAY')).rejects.toMatchObject({
      code: 'CONNECTION_LIMIT',
    });
    await expect(
      runtime.asGrant(display.id, 'PRIMARY', async () => 'command'),
    ).rejects.toMatchObject({ code: 'DISPLAY_READ_ONLY' });
    expect(await runtime.asGrant(display.id, 'DISPLAY', async (_tx, actor) => actor.role)).toBe(
      'DISPLAY',
    );
  });

  it('derives presence from the primary lease, expires at 35 seconds and rejects late ownership', async () => {
    const { device, credential } = await paired();
    const display = await connect(credential.token, 'DISPLAY');
    await runtime.heartbeat(display.id);
    expect(await devices.get(staff.owner.token, device.id)).toMatchObject({
      connection: 'NEVER_SEEN',
      lastSeenAt: null,
    });
    const primary = await connect(credential.token);
    await runtime.heartbeat(primary.id);
    expect(await devices.get(staff.owner.token, device.id)).toMatchObject({ connection: 'ONLINE' });
    now = new Date(now.getTime() + 35000);
    expect(await devices.get(staff.owner.token, device.id)).toMatchObject({
      connection: 'OFFLINE',
    });
    await expect(runtime.heartbeat(primary.id)).rejects.toMatchObject({ code: 'GRANT_EXPIRED' });
    const next = await connect(credential.token);
    await runtime.closeGrant(primary.id);
    expect(await runtime.asGrant(next.id, 'PRIMARY', async () => true)).toBe(true);
    await runtime.closeGrant(next.id);
    expect(await devices.get(staff.owner.token, device.id)).toMatchObject({
      connection: 'OFFLINE',
    });
  });

  it('revokes active grants and tickets atomically; re-enabling never revives an old credential', async () => {
    const { device, credential } = await paired();
    const primary = await connect(credential.token);
    const pending = await ticket(credential.token, 'DISPLAY');
    const current = await devices.get(staff.owner.token, device.id);
    const disabled = await devices.save(staff.owner.token, device.id, {
      name: current.name,
      capabilities: current.capabilities,
      maintenanceMode: false,
      enabled: false,
      expectedRevision: current.revision,
    });
    await expect(runtime.asGrant(primary.id, 'PRIMARY', async () => true)).rejects.toMatchObject({
      code: 'GRANT_EXPIRED',
    });
    await expect(
      runtime.issueTicket(credential.token, { namespace: '/devices', role: 'DISPLAY' }),
    ).rejects.toMatchObject({ code: 'DEVICE_UNAUTHENTICATED' });
    await expect(
      runtime.redeemTicket(pending.ticket, { namespace: '/devices', role: 'DISPLAY' }),
    ).rejects.toMatchObject({ code: 'INVALID_TICKET' });
    await expect(
      devices.createPairing(staff.owner.token, device.id, { expectedRevision: disabled.revision }),
    ).rejects.toMatchObject({ code: 'DEVICE_DISABLED' });
    await devices.save(staff.owner.token, device.id, {
      name: current.name,
      capabilities: current.capabilities,
      maintenanceMode: false,
      enabled: true,
      expectedRevision: disabled.revision,
    });
    await expect(runtime.identity(credential.token)).rejects.toMatchObject({
      code: 'DEVICE_UNAUTHENTICATED',
    });
  });

  it('bounds outstanding tickets and allows fresh tickets after expiry', async () => {
    const { credential } = await paired();
    for (let n = 0; n < 4; n++) await ticket(credential.token);
    await expect(ticket(credential.token)).rejects.toMatchObject({ code: 'TICKET_LIMIT' });
    now = new Date(now.getTime() + 60000);
    expect(await ticket(credential.token)).toHaveProperty('ticket');
  });

  it('rejects database scope mismatches and invalid challenge/lease state', async () => {
    const first = await paired();
    const other = await paired();
    const stored = await staff.db.deviceCredential.findFirstOrThrow({
      where: { deviceId: first.device.id },
    });
    await expect(
      staff.db.deviceCredential.update({
        where: { id: stored.id },
        data: { deviceId: other.device.id },
      }),
    ).rejects.toThrow();
    await expect(
      staff.db.pairingChallenge.update({
        where: { id: first.challenge.id },
        data: { attempts: 6 },
      }),
    ).rejects.toThrow();
    const grant = await connect(first.credential.token, 'DISPLAY');
    await expect(
      staff.db.deviceGrant.update({ where: { id: grant.id }, data: { role: 'PRIMARY' } }),
    ).rejects.toThrow();
    await expect(
      staff.db.deviceGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(0) } }),
    ).rejects.toThrow();
  });
});
