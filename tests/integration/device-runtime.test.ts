import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createApplication } from '../../apps/api/dist/app.js';
import { DeviceGateway } from '../../apps/api/dist/devices/gateway.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { parseServerConfig } from '../../packages/config/src/server.js';
import {
  BotService,
  DeviceCommands,
  DeviceReleases,
  DeviceRuntime,
  DeviceService,
  KnowledgeService,
  MediaJobs,
  MediaService,
  MediaStorage,
  PresentationService,
  ReleaseService,
  ScheduleService,
} from '../../packages/domain/dist/index.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

const freePort = () =>
  new Promise<number>((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
const next = <T>(socket: Socket, event: string) =>
  new Promise<T>((done) => socket.once(event, (value: T) => done(value)));
const meta = () => ({
  v: 1,
  eventId: randomUUID(),
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
});

describe('device runtime: sockets, manifests and scoped media', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let gateway: DeviceGateway;
  let devices: DeviceService;
  let schedules: ScheduleService;
  let jobs: MediaJobs;
  let root: string;
  let origin: string;
  let release: { id: string; snapshot: { media: { id: string; sha256: string }[] } };
  let otherMedia: { id: string };
  const sockets: Socket[] = [];
  const headers = () => ({
    Host: new URL(origin).host,
    Origin: origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    staff = await staffFixture();
    const port = await freePort();
    origin = `http://localhost:${port}`;
    root = await mkdtemp(join(tmpdir(), 'svara-device-runtime-'));
    const storage = await MediaStorage.open(root);
    const runtime = new DeviceRuntime(staff.db, staff.pepper);
    devices = new DeviceService(staff.service, staff.pepper);
    schedules = new ScheduleService(staff.service);
    gateway = new DeviceGateway({
      origin,
      runtime,
      commands: new DeviceCommands(runtime),
      silenceMs: 60_000,
    });
    const media = new MediaService(staff.service, staff.db, storage);
    const inspector = new MediaInspector(storage, parseServerConfig(process.env));
    jobs = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
    const token = staff.owner.token;
    const ready = async (filename: string) => {
      const bytes = await imageFixture();
      const asset = await media.reserve(token, {
        filename,
        mimeType: 'image/png',
        byteLength: bytes.length,
      });
      await media.receive(token, asset.id, Readable.from([bytes]), AbortSignal.timeout(2000));
      expect(await jobs.process(asset.id)).toBe('READY');
      return media.get(token, asset.id);
    };
    const bots = new BotService(staff.service);
    const created = await bots.create(token, { name: 'Kiosk guide' });
    const bot = await bots.save(token, created.id, {
      name: created.name,
      description: '',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Greet visitors.',
        greeting: { en: 'Welcome to campus.', ne: 'क्याम्पसमा स्वागत छ।' },
        fallback: { en: 'Ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
      },
    });
    const knowledge = new KnowledgeService(staff.service);
    const entry = await knowledge.create(token, bot.id, { title: 'Secret fees', type: 'FAQ' });
    const saved = await knowledge.save(token, entry.id, {
      expectedRevision: entry.revision,
      title: entry.title,
      type: 'FAQ',
      question: { en: 'Fees?', ne: 'शुल्क?' },
      content: { en: 'Internal fee table.', ne: 'आन्तरिक शुल्क।' },
    });
    await knowledge.approve(token, saved.id, { expectedRevision: saved.revision, approved: true });
    const image = await ready('Welcome.png');
    otherMedia = await ready('Unrelated.png');
    const presentations = new PresentationService(staff.service);
    const deck = await presentations.create(token, { botId: bot.id, name: 'Welcome' });
    await presentations.createSlide(token, deck.id, {
      expectedRevision: deck.revision,
      title: { en: 'Welcome', ne: 'स्वागत छ' },
      body: { en: 'Admissions: room 12.', ne: 'भर्ना: कोठा १२।' },
      mediaId: image.id,
      target: 'SECONDARY',
    });
    release = await new ReleaseService(staff.service, { providerMode: 'fixture' }).publish(
      token,
      bot.id,
      { expectedRevision: (await bots.get(token, bot.id)).revision },
      randomUUID(),
    );
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: { ...staff.options, origin },
      devices,
      schedules,
      deviceGateway: gateway,
      runtime: {
        service: runtime,
        releases: new DeviceReleases(runtime, storage),
        origin,
        pepper: staff.pepper,
        consumeLimit: async () => 0,
      },
    });
    await app.listen(port, '127.0.0.1');
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await gateway?.close();
    if (app) await app.close();
    await jobs?.close();
    if (staff) {
      const organisations = await staff.db.organisation.findMany({
        where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
        select: { id: true },
      });
      const where = { organisationId: { in: organisations.map((org) => org.id) } };
      await staff.db.deviceCommand.deleteMany({ where });
      await staff.db.desiredDeviceState.deleteMany({ where });
      await staff.db.deployment.deleteMany({ where });
      await staff.db.deviceGrant.deleteMany({ where });
      await staff.db.deviceTicket.deleteMany({ where });
      await staff.db.deviceCredential.deleteMany({ where });
      await staff.db.pairingChallenge.deleteMany({ where });
      await staff.db.device.deleteMany({ where });
      await staff.db.idempotencyRecord.deleteMany({ where });
      await staff.db.botRelease.deleteMany({ where });
      await staff.db.botDraft.updateMany({ where, data: { presentationId: null } });
      await staff.db.bot.deleteMany({ where });
      await staff.db.mediaAsset.deleteMany({ where });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-device-runtime-')
      )
        throw new Error('Unsafe device runtime cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });

  /** A paired kiosk: its device cookie and runtime CSRF token, as a browser profile holds them. */
  async function kiosk() {
    const device = await devices.create(staff.owner.token, { name: `Kiosk ${randomUUID()}` });
    const challenge = (
      await request(server())
        .post(`/api/v1/devices/${device.id}/pairing`)
        .set(headers())
        .send({ expectedRevision: device.revision })
        .expect(201)
    ).body.data;
    const paired = await request(server())
      .post('/api/v1/runtime/pair')
      .set({ Host: new URL(origin).host, Origin: origin })
      .send({ challengeId: challenge.id, code: challenge.code })
      .expect(201);
    const cookie = String(paired.headers['set-cookie']).split(';')[0]!;
    return { id: device.id, cookie, csrf: paired.body.data.csrfToken as string };
  }
  async function connect(device: { cookie: string; csrf: string }, role: 'PRIMARY' | 'DISPLAY') {
    const ticket = (
      await request(server())
        .post('/api/v1/runtime/tickets')
        .set({
          Host: new URL(origin).host,
          Origin: origin,
          Cookie: device.cookie,
          'X-CSRF-Token': device.csrf,
        })
        .send({ namespace: '/devices', role })
        .expect(201)
    ).body.data.ticket as string;
    const socket = io(`${origin}/devices`, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { Host: new URL(origin).host, Origin: origin },
      auth: { ticket, role },
      reconnection: false,
    });
    sockets.push(socket);
    return { socket, ticket };
  }
  const schedule = (deviceId: string) =>
    schedules.createDeployment(staff.owner.token, {
      deviceId,
      releaseId: release.id,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

  it('pushes desired state to the primary and mirrors the applied release to displays only', async () => {
    const device = await kiosk();
    await schedule(device.id);
    const { socket: primary } = await connect(device, 'PRIMARY');
    const desired = await next<{ commandId: string; revision: number; releaseId: string }>(
      primary,
      'release.desired',
    );
    expect(desired).toMatchObject({ v: 1, revision: 1, releaseId: release.id });
    const { socket: display } = await connect(device, 'DISPLAY');
    expect(await next(display, 'display.state')).toMatchObject({ revision: 0, releaseId: null });

    // A display can never acknowledge or apply anything.
    display.emit('command.ack', {
      ...meta(),
      commandId: desired.commandId,
      appliedRevision: 1,
      result: 'APPLIED',
    });
    expect(await next(display, 'device.error')).toMatchObject({ code: 'DISPLAY_READ_ONLY' });

    const mirrored = next(display, 'display.state');
    primary.emit('command.ack', {
      ...meta(),
      commandId: desired.commandId,
      appliedRevision: 1,
      result: 'APPLIED',
    });
    expect(await next(primary, 'command.acked')).toMatchObject({
      status: 'ACKNOWLEDGED',
      stateRevision: 1,
    });
    expect(await mirrored).toMatchObject({ revision: 1, releaseId: release.id });

    // A worker wake-up re-sends the current snapshot; the kiosk dedupes by command ID.
    const again = next(primary, 'release.desired');
    await gateway.wake([device.id]);
    expect(await again).toMatchObject({ commandId: desired.commandId, revision: 1 });
  });

  it('serves the manifest without knowledge and only this device’s release media', async () => {
    const device = await kiosk();
    const runtime = { Host: new URL(origin).host, Origin: origin, Cookie: device.cookie };
    const idle = await request(server()).get('/api/v1/runtime/manifest').set(runtime).expect(200);
    expect(idle.body.data).toEqual({
      view: 'desired',
      revision: 0,
      commandId: null,
      release: null,
    });
    const [asset] = release.snapshot.media;
    await request(server())
      .get(`/api/v1/runtime/media/${asset!.id}/content`)
      .set(runtime)
      .expect(404);
    await schedule(device.id);
    const manifest = await request(server())
      .get('/api/v1/runtime/manifest')
      .set(runtime)
      .expect(200);
    expect(manifest.body.data.release).toMatchObject({
      id: release.id,
      greeting: { en: 'Welcome to campus.' },
      slides: [{ target: 'SECONDARY', mediaId: asset!.id }],
      media: [{ id: asset!.id, sha256: asset!.sha256 }],
    });
    expect(JSON.stringify(manifest.body)).not.toMatch(/Internal fee table|knowledge|storageKey/);
    const file = await request(server())
      .get(`/api/v1/runtime/media/${asset!.id}/content`)
      .set(runtime)
      .buffer(true)
      .expect(200);
    expect(file.headers.etag).toBe(`"${asset!.sha256}"`);
    await request(server())
      .get(`/api/v1/runtime/media/${otherMedia.id}/content`)
      .set(runtime)
      .expect(404);
    await request(server())
      .get(`/api/v1/runtime/media/${asset!.id}/content`)
      .set({ Host: new URL(origin).host, Origin: origin })
      .expect(401);
  });

  it('refuses reused tickets, a second primary and foreign origins', async () => {
    const device = await kiosk();
    const { socket, ticket } = await connect(device, 'PRIMARY');
    await next(socket, 'release.desired');
    const reuse = io(`${origin}/devices`, {
      transports: ['websocket'],
      extraHeaders: { Host: new URL(origin).host, Origin: origin },
      auth: { ticket, role: 'PRIMARY' },
      reconnection: false,
    });
    sockets.push(reuse);
    expect((await next<Error>(reuse, 'connect_error')).message).toBe('INVALID_TICKET');
    const { socket: second } = await connect(device, 'PRIMARY');
    expect((await next<Error>(second, 'connect_error')).message).toBe('PRIMARY_CONFLICT');
    const foreign = io(`${origin}/devices`, {
      transports: ['websocket'],
      extraHeaders: { Origin: 'http://evil.example.test' },
      auth: { ticket: 'x'.repeat(43), role: 'PRIMARY' },
      reconnection: false,
    });
    sockets.push(foreign);
    await next(foreign, 'connect_error');
    expect(foreign.connected).toBe(false);
  });

  it('disconnects every window of a device the moment staff revoke it', async () => {
    const device = await kiosk();
    const { socket: primary } = await connect(device, 'PRIMARY');
    await next(primary, 'release.desired');
    const { socket: display } = await connect(device, 'DISPLAY');
    await next(display, 'display.state');
    const revoked = Promise.all([
      next(primary, 'device.error'),
      next(display, 'device.error'),
      next(primary, 'disconnect'),
      next(display, 'disconnect'),
    ]);
    const current = (await request(server()).get(`/api/v1/devices/${device.id}`).set(headers()))
      .body.data;
    await request(server())
      .post(`/api/v1/devices/${device.id}/revoke`)
      .set(headers())
      .send({ expectedRevision: current.revision })
      .expect(200);
    const [primaryError, displayError] = await revoked;
    expect(primaryError).toMatchObject({ code: 'DEVICE_REVOKED' });
    expect(displayError).toMatchObject({ code: 'DEVICE_REVOKED' });
    await request(server())
      .post('/api/v1/runtime/tickets')
      .set({
        Host: new URL(origin).host,
        Origin: origin,
        Cookie: device.cookie,
        'X-CSRF-Token': device.csrf,
      })
      .send({ namespace: '/devices', role: 'PRIMARY' })
      .expect(401);
  });
});
