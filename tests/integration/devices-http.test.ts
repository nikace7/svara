import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../../apps/api/dist/app.js';
import { DeviceService, DeviceRuntime, DeviceError } from '../../packages/domain/dist/index.js';
import { staffFixture } from './staff-fixture.js';

describe('device and runtime HTTP authority', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let runtime: DeviceRuntime;
  let devices: DeviceService;
  let failLimits = false;
  let limitPairing = false;
  const calls: { bucket: string; maximum: number; windowMs: number }[] = [];
  const origin = 'http://localhost:4320';
  const base = { Host: 'localhost:4320', Origin: origin };
  const staffHeaders = () => ({
    ...base,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const server = () => app.getHttpServer();
  beforeAll(async () => {
    staff = await staffFixture();
    devices = new DeviceService(staff.service, staff.pepper);
    runtime = new DeviceRuntime(staff.db, staff.pepper);
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      devices,
      runtime: {
        service: runtime,
        origin,
        pepper: staff.pepper,
        consumeLimit: async (bucket, _key, maximum, windowMs) => {
          calls.push({ bucket, maximum, windowMs });
          if (failLimits) throw new Error('Redis unavailable');
          return limitPairing && bucket === 'pairing-ip' ? 17 : 0;
        },
      },
    });
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
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
  async function challenge() {
    const created = await request(server())
      .post('/api/v1/devices')
      .set(staffHeaders())
      .send({ name: 'HTTP kiosk' })
      .expect(201);
    return (
      await request(server())
        .post(`/api/v1/devices/${created.body.data.id}/pairing`)
        .set(staffHeaders())
        .send({ expectedRevision: created.body.data.revision })
        .expect(201)
    ).body.data as {
      id: string;
      deviceId: string;
      code: string;
      revision: number;
    };
  }
  async function pair() {
    const issued = await challenge();
    const paired = await request(server())
      .post('/api/v1/runtime/pair')
      .set(base)
      .send({ challengeId: issued.id, code: issued.code })
      .expect(201);
    const cookies = paired.headers['set-cookie'] as unknown as string[];
    const deviceCookie = cookies.find((item) => item.startsWith('svara-device='))!;
    return {
      issued,
      paired,
      cookies,
      cookie: deviceCookie.split(';')[0]!,
      token: deviceCookie.split(';')[0]!.slice('svara-device='.length),
    };
  }

  it('exposes scoped staff registry routes, strict inputs and conflict responses', async () => {
    await request(server()).get('/api/v1/devices').set(base).expect(401);
    await request(server())
      .post('/api/v1/devices')
      .set({ ...base, Cookie: `svara-session=${staff.owner.token}` })
      .send({ name: 'Denied' })
      .expect(403);
    await request(server())
      .post('/api/v1/devices')
      .set(staffHeaders())
      .send({ name: 'NUL\0kiosk' })
      .expect(400);
    const created = await request(server())
      .post('/api/v1/devices')
      .set(staffHeaders())
      .send({ name: 'Registry kiosk' })
      .expect(201);
    const device = created.body.data;
    expect(device).toMatchObject({
      name: 'Registry kiosk',
      paired: false,
      connection: 'NEVER_SEEN',
    });
    await request(server()).get('/api/v1/devices?limit=101').set(staffHeaders()).expect(400);
    await request(server()).get('/api/v1/devices?search=x%00y').set(staffHeaders()).expect(400);
    const page = await request(server())
      .get('/api/v1/devices?limit=1')
      .set(staffHeaders())
      .expect(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.page).toHaveProperty('nextCursor');
    const save = {
      name: 'Changed',
      enabled: true,
      maintenanceMode: true,
      capabilities: device.capabilities,
    };
    expect(
      (
        await request(server())
          .patch(`/api/v1/devices/${device.id}`)
          .set(staffHeaders())
          .send(save)
          .expect(428)
      ).body.error.code,
    ).toBe('PRECONDITION_REQUIRED');
    await request(server())
      .patch(`/api/v1/devices/${device.id}`)
      .set(staffHeaders())
      .send({ ...save, expectedRevision: 1 })
      .expect(200);
    expect(
      (
        await request(server())
          .patch(`/api/v1/devices/${device.id}`)
          .set(staffHeaders())
          .send({ ...save, expectedRevision: 1 })
          .expect(409)
      ).body.currentRevision,
    ).toBe(2);
    const foreign = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign',
      organisationName: 'Foreign',
    });
    await request(server())
      .get(`/api/v1/devices/${device.id}`)
      .set({ ...base, Cookie: `svara-session=${foreign.token}` })
      .expect(404);
    await staff.db.membership.update({
      where: { id: foreign.identity.membership.id },
      data: { role: 'VIEWER' },
    });
    await request(server())
      .post('/api/v1/devices')
      .set({ ...base, Cookie: `svara-session=${foreign.token}`, 'X-CSRF-Token': foreign.csrfToken })
      .send({ name: 'Denied' })
      .expect(403);
  });

  it('pairs anonymously into a separate HttpOnly cookie and requires device CSRF for tickets', async () => {
    const state = await pair();
    expect(state.cookies).toHaveLength(1);
    expect(state.cookies[0]).toMatch(/HttpOnly/);
    expect(state.cookies[0]).toMatch(/SameSite=Lax/);
    expect(state.cookies[0]).toMatch(/Path=\//);
    expect(state.cookies[0]).not.toMatch(/Domain=/);
    expect(JSON.stringify(state.paired.body)).not.toContain(state.token);
    expect(state.paired.headers['cache-control']).toBe('no-store');
    await request(server()).get('/api/v1/runtime/device').set(staffHeaders()).expect(401);
    await request(server())
      .get('/api/v1/devices')
      .set({ ...base, Cookie: state.cookie })
      .expect(401);
    const current = await request(server())
      .get('/api/v1/runtime/device')
      .set({ ...base, Cookie: state.cookie })
      .expect(200);
    expect(current.body.data.device.id).toBe(state.issued.deviceId);
    const data = { namespace: '/devices', role: 'DISPLAY' };
    await request(server())
      .post('/api/v1/runtime/tickets')
      .set({ ...base, Cookie: state.cookie })
      .send(data)
      .expect(403);
    const headers = { ...base, Cookie: state.cookie, 'X-CSRF-Token': current.body.data.csrfToken };
    await request(server())
      .post('/api/v1/runtime/tickets')
      .set(headers)
      .send({ ...data, namespace: '/voice' })
      .expect(400);
    const issued = await request(server())
      .post('/api/v1/runtime/tickets')
      .set(headers)
      .send(data)
      .expect(201);
    expect(await runtime.redeemTicket(issued.body.data.ticket, data)).toMatchObject({
      deviceId: state.issued.deviceId,
      role: 'DISPLAY',
    });
    await request(server())
      .post('/api/v1/runtime/pair')
      .set(base)
      .send({ challengeId: state.issued.id, code: state.issued.code })
      .expect(400);
  });

  it('validates host/origin and requires explicit cookie replacement without revoking another device', async () => {
    const first = await pair();
    const next = await challenge();
    const data = { challengeId: next.id, code: next.code };
    await request(server())
      .post('/api/v1/runtime/pair')
      .set({ ...base, Host: 'other.test' })
      .send(data)
      .expect(403);
    await request(server())
      .post('/api/v1/runtime/pair')
      .set({ ...base, Origin: 'https://other.test' })
      .send(data)
      .expect(403);
    await request(server())
      .post('/api/v1/runtime/pair')
      .set({ Host: base.Host })
      .send(data)
      .expect(403);
    await request(server())
      .post('/api/v1/runtime/pair')
      .set({ ...base, Cookie: first.cookie })
      .send(data)
      .expect(409);
    const replaced = await request(server())
      .post('/api/v1/runtime/pair')
      .set({ ...base, Cookie: first.cookie })
      .send({ ...data, replaceExisting: true })
      .expect(201);
    expect(replaced.body.data.device.id).toBe(next.deviceId);
    expect(await runtime.identity(first.token)).toMatchObject({ id: first.issued.deviceId });
    await request(server())
      .get('/api/v1/runtime/device')
      .set({ ...base, Cookie: `${first.cookie}; ${first.cookie}` })
      .expect(401);
    await request(server())
      .get('/api/v1/runtime/device')
      .set({ ...base, Authorization: `Bearer ${first.token}` })
      .expect(401);
  });

  it('uses the required pairing quota and fails closed when the Redis boundary is unavailable', async () => {
    const state = await pair();
    const next = await challenge();
    try {
      limitPairing = true;
      const limited = await request(server())
        .post('/api/v1/runtime/pair')
        .set(base)
        .send({ challengeId: next.id, code: next.code })
        .expect(429);
      expect(limited.headers['retry-after']).toBe('17');
      expect(calls).toContainEqual({ bucket: 'pairing-ip', maximum: 10, windowMs: 60000 });
      expect(
        (await staff.db.pairingChallenge.findUniqueOrThrow({ where: { id: next.id } })).redeemedAt,
      ).toBeNull();
      limitPairing = false;
      failLimits = true;
      await request(server())
        .get('/api/v1/runtime/device')
        .set({ ...base, Cookie: state.cookie })
        .expect(503);
      await request(server())
        .post('/api/v1/runtime/tickets')
        .set({ ...base, Cookie: state.cookie, 'X-CSRF-Token': state.paired.body.data.csrfToken })
        .send({ namespace: '/devices', role: 'PRIMARY' })
        .expect(503);
    } finally {
      failLimits = false;
      limitPairing = false;
    }
  });

  it('revokes active device authority without disabling the registry entry', async () => {
    const state = await pair();
    const issued = await runtime.issueTicket(state.token, {
      namespace: '/devices',
      role: 'PRIMARY',
    });
    const grant = await runtime.redeemTicket(issued.ticket, {
      namespace: '/devices',
      role: 'PRIMARY',
    });
    const device = await devices.get(staff.owner.token, state.issued.deviceId);
    const revoked = await request(server())
      .post(`/api/v1/devices/${device.id}/revoke`)
      .set(staffHeaders())
      .send({ expectedRevision: device.revision })
      .expect(200);
    expect(revoked.body.data).toMatchObject({ enabled: true, paired: false });
    await request(server())
      .get('/api/v1/runtime/device')
      .set({ ...base, Cookie: state.cookie })
      .expect(401);
    await expect(runtime.asGrant(grant.id, 'PRIMARY', async () => true)).rejects.toBeInstanceOf(
      DeviceError,
    );
  });
});
