import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../../apps/api/dist/app.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import {
  BotService,
  DeviceService,
  KnowledgeService,
  ReleaseService,
  ScheduleService,
} from '../../packages/domain/dist/index.js';
import { staffFixture } from './staff-fixture.js';

const minute = 60_000;

describe('schedule HTTP routes', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let devices: DeviceService;
  let published: { id: string };
  let preview: { id: string };
  const origin = 'http://localhost:4320';
  const headers = (session = staff.owner) => ({
    Host: 'localhost:4320',
    Origin: origin,
    Cookie: `svara-session=${session.token}`,
    'X-CSRF-Token': session.csrfToken,
  });
  const server = () => app.getHttpServer();
  const at = (minutes: number) => new Date(Date.now() + minutes * minute).toISOString();

  beforeAll(async () => {
    staff = await staffFixture();
    devices = new DeviceService(staff.service, staff.pepper);
    const bots = new BotService(staff.service);
    const knowledge = new KnowledgeService(staff.service);
    const releases = new ReleaseService(staff.service, { providerMode: 'fixture' });
    const token = staff.owner.token;
    const created = await bots.create(token, { name: 'Schedule guide' });
    const bot = await bots.save(token, created.id, {
      name: created.name,
      description: '',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help with campus information.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
      },
    });
    const entry = await knowledge.create(token, bot.id, { title: 'Admissions', type: 'FAQ' });
    const saved = await knowledge.save(token, entry.id, {
      expectedRevision: entry.revision,
      title: entry.title,
      type: 'FAQ',
      question: { en: 'Where is admissions?', ne: 'भर्ना कहाँ छ?' },
      content: { en: 'Room 12.', ne: 'कोठा १२।' },
    });
    await knowledge.approve(token, saved.id, { expectedRevision: saved.revision, approved: true });
    const revision = async () => (await bots.get(token, bot.id)).revision;
    published = await releases.publish(
      token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
    preview = await releases.preview(
      token,
      bot.id,
      { expectedRevision: await revision() },
      randomUUID(),
    );
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      schedules: new ScheduleService(staff.service),
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
    await staff.db.deviceCommand.deleteMany({ where });
    await staff.db.desiredDeviceState.deleteMany({ where });
    await staff.db.deployment.deleteMany({ where });
    await staff.db.event.deleteMany({ where });
    await staff.db.device.deleteMany({ where });
    await staff.db.idempotencyRecord.deleteMany({ where });
    await staff.db.botRelease.deleteMany({ where });
    await staff.db.bot.deleteMany({ where });
    await staff.close();
  });

  it('schedules, reports conflicts with their IDs and cancels with revision checks', async () => {
    const kiosk = await devices.create(staff.owner.token, { name: 'Lobby kiosk' });
    const body = { deviceId: kiosk.id, releaseId: published.id, startsAt: at(0), endsAt: at(60) };
    await request(server())
      .post('/api/v1/deployments')
      .set({ ...headers(), 'X-CSRF-Token': 'wrong' })
      .send(body)
      .expect(403);
    const created = await request(server())
      .post('/api/v1/deployments')
      .set(headers())
      .send(body)
      .expect(201);
    expect(created.body.data).toMatchObject({ state: 'ACTIVE', release: { version: 1 } });
    const conflict = await request(server())
      .post('/api/v1/deployments')
      .set(headers())
      .send({ ...body, startsAt: at(30), endsAt: at(90) })
      .expect(409);
    expect(conflict.body.error).toMatchObject({
      code: 'SCHEDULE_CONFLICT',
      conflictIds: [created.body.data.id],
      retryable: false,
    });
    const refused = await request(server())
      .post('/api/v1/deployments')
      .set(headers())
      .send({ ...body, releaseId: preview.id, startsAt: at(120), endsAt: at(180) })
      .expect(422);
    expect(refused.body.error.code).toBe('RELEASE_NOT_SCHEDULABLE');
    const timeline = await request(server())
      .get(`/api/v1/devices/${kiosk.id}/timeline`)
      .set(headers())
      .expect(200);
    expect(timeline.body.data.desired).toMatchObject({ revision: 1, releaseId: published.id });
    expect(timeline.body.data.commands[0]).toMatchObject({ status: 'QUEUED', stateRevision: 1 });
    const path = `/api/v1/deployments/${created.body.data.id}/cancel`;
    await request(server()).post(path).set(headers()).send({}).expect(428);
    const stale = await request(server())
      .post(path)
      .set(headers())
      .send({ expectedRevision: 5 })
      .expect(409);
    expect(stale.body.error).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
    const cancelled = await request(server())
      .post(path)
      .set(headers())
      .send({ expectedRevision: 1 })
      .expect(200);
    expect(cancelled.body.data.state).toBe('CANCELLED');
  });

  it('shows the board, takes explicit overrides and keeps other organisations out', async () => {
    const kiosk = await devices.create(staff.owner.token, { name: 'Hall kiosk' });
    const override = await request(server())
      .post(`/api/v1/devices/${kiosk.id}/override`)
      .set(headers())
      .send({ releaseId: published.id, minutes: 15 })
      .expect(201);
    const blocked = await request(server())
      .post(`/api/v1/devices/${kiosk.id}/override`)
      .set(headers())
      .send({ releaseId: published.id })
      .expect(409);
    expect(blocked.body.error).toMatchObject({
      code: 'OVERRIDE_CONFLICT',
      conflictIds: [override.body.data.id],
    });
    const board = await request(server())
      .get('/api/v1/deployments')
      .query({ from: at(-60), to: at(24 * 60) })
      .set(headers())
      .expect(200);
    expect(
      board.body.data.devices.find((item: { id: string }) => item.id === kiosk.id),
    ).toMatchObject({ desired: { deploymentId: override.body.data.id } });
    await request(server())
      .get('/api/v1/deployments')
      .query({ from: at(0), to: at(60 * 24 * 40) })
      .set(headers())
      .expect(400);
    const foreign = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign Owner',
      organisationName: 'Foreign HTTP Campus',
    });
    await request(server())
      .get(`/api/v1/devices/${kiosk.id}/timeline`)
      .set(headers(foreign))
      .expect(404);
    await request(server())
      .get(`/api/v1/deployments/${override.body.data.id}`)
      .set(headers(foreign))
      .expect(404);
    const foreignBoard = await request(server())
      .get('/api/v1/deployments')
      .query({ from: at(-60), to: at(60) })
      .set(headers(foreign))
      .expect(200);
    expect(foreignBoard.body.data).toEqual({ devices: [], deployments: [] });
  });

  it('keeps event archive and restore behind revisions and viewer roles out of changes', async () => {
    const created = await request(server())
      .post('/api/v1/events')
      .set(headers())
      .send({ name: 'Open house', timezone: 'Asia/Kathmandu' })
      .expect(201);
    const archived = await request(server())
      .post(`/api/v1/events/${created.body.data.id}/archive`)
      .set(headers())
      .send({ archived: true, expectedRevision: created.body.data.revision })
      .expect(200);
    const listed = await request(server())
      .get('/api/v1/events')
      .query({ archived: 'true' })
      .set(headers())
      .expect(200);
    expect(listed.body.data.items.map((item: { id: string }) => item.id)).toContain(
      archived.body.data.id,
    );
    const viewer = await staff.service.register({
      email: `viewer-${staff.suffix}`,
      password: staff.password,
      displayName: 'Viewer',
      organisationName: 'Viewer HTTP Campus',
    });
    await staff.db.membership.update({
      where: { id: viewer.identity.membership.id },
      data: { role: 'VIEWER' },
    });
    await request(server())
      .post('/api/v1/events')
      .set(headers(viewer))
      .send({ name: 'Not allowed', timezone: 'Asia/Kathmandu' })
      .expect(403);
    await request(server()).get('/api/v1/events').set(headers(viewer)).expect(200);
  });
});
