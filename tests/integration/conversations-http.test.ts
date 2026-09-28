import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createApplication } from '../../apps/api/dist/app.js';
import { ActiveTurns } from '../../apps/api/dist/conversations/stream.js';
import { DeviceGateway } from '../../apps/api/dist/devices/gateway.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import {
  AssistantLinkService,
  BotService,
  ConversationService,
  ConversationSessions,
  DeviceCommands,
  DeviceReleases,
  DeviceRuntime,
  DeviceService,
  KnowledgeService,
  MediaStorage,
  PresentationService,
  PublicAssistants,
  ReleaseService,
  ScheduleService,
} from '../../packages/domain/dist/index.js';
import { FixtureAnswerGenerator } from '../../packages/providers/dist/index.js';
import { staffFixture } from './staff-fixture.js';

const freePort = () =>
  new Promise<number>((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
const meta = () => ({
  v: 1,
  eventId: randomUUID(),
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
});
type Event = { type: string; text: string; code?: string; tool?: { status: string }; seq: number };
const ndjson = (response: request.Response) =>
  String(response.body)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Event);
/** Buffers an NDJSON body as text; supertest only parses JSON and text/* on its own. */
const collect = ((response: NodeJS.ReadableStream, done: (error: null, body: string) => void) => {
  let data = '';
  response.setEncoding('utf8');
  response.on('data', (chunk: string) => (data += chunk));
  response.on('end', () => done(null, data));
}) as unknown as Parameters<request.Test['parse']>[0];

describe('conversation HTTP: playground, kiosk and public link', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let gateway: DeviceGateway;
  let devices: DeviceService;
  let schedules: ScheduleService;
  let origin: string;
  let root: string;
  let release: { id: string };
  const sockets: Socket[] = [];
  const server = () => app.getHttpServer();
  const host = () => ({ Host: new URL(origin).host, Origin: origin });
  const staffHeaders = () => ({
    ...host(),
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  let generation = 1;
  const question = (text: string, locale = 'en-US') => ({
    generation: generation++,
    clientMessageId: randomUUID(),
    locale,
    text,
  });

  beforeAll(async () => {
    staff = await staffFixture();
    origin = `http://localhost:${await freePort()}`;
    root = await mkdtemp(join(tmpdir(), 'svara-conversations-http-'));
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
    const token = staff.owner.token;
    const bots = new BotService(staff.service);
    const created = await bots.create(token, { name: 'Campus guide' });
    const bot = await bots.save(token, created.id, {
      name: created.name,
      description: '',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help visitors.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
        tools: ['lookup_knowledge', 'select_reference', 'show_slide'],
      },
    });
    const knowledge = new KnowledgeService(staff.service);
    const entry = await knowledge.create(token, bot.id, { title: 'Admissions', type: 'FAQ' });
    const saved = await knowledge.save(token, entry.id, {
      expectedRevision: entry.revision,
      title: entry.title,
      type: 'FAQ',
      question: { en: 'Where is admissions?', ne: 'भर्ना कहाँ छ?' },
      content: { en: 'Admissions is in room 12.', ne: 'भर्ना कोठा १२ मा छ।' },
    });
    await knowledge.approve(token, saved.id, { expectedRevision: saved.revision, approved: true });
    const presentations = new PresentationService(staff.service);
    const deck = await presentations.create(token, { botId: bot.id, name: 'Open house' });
    await presentations.createSlide(token, deck.id, {
      expectedRevision: deck.revision,
      title: { en: 'Admissions steps', ne: 'भर्ना चरणहरू' },
      body: { en: 'Apply online.', ne: 'अनलाइन आवेदन।' },
    });
    release = await new ReleaseService(staff.service, { providerMode: 'fixture' }).publish(
      token,
      bot.id,
      { expectedRevision: (await bots.get(token, bot.id)).revision },
      randomUUID(),
    );
    const service = new ConversationService(staff.db, staff.service, runtime, {
      providerMode: 'fixture',
      pepper: staff.pepper,
    });
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
      conversations: {
        service,
        sessions: new ConversationSessions(staff.service),
        links: new AssistantLinkService(staff.service),
        publics: new PublicAssistants(staff.db, storage, {
          pepper: staff.pepper,
          providerMode: 'fixture',
        }),
        streaming: {
          service,
          runner: {
            service,
            providers: { generator: new FixtureAnswerGenerator() },
            slides: { show: (deviceId, command) => gateway.showSlide(deviceId, command) },
          },
          active: new ActiveTurns(),
        },
        origin,
        pepper: staff.pepper,
        consumeLimit: async () => 0,
      },
    });
    await app.listen(Number(new URL(origin).port), '127.0.0.1');
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await gateway?.close();
    if (app) await app.close();
    if (root) await rm(root, { recursive: true, force: true });
    if (!staff) return;
    const organisations = await staff.db.organisation.findMany({
      where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      select: { id: true },
    });
    const where = { organisationId: { in: organisations.map((org) => org.id) } };
    await staff.db.toolExecution.deleteMany({ where });
    await staff.db.conversationTurn.deleteMany({ where });
    await staff.db.conversationSession.deleteMany({ where });
    await staff.db.visitorGrant.deleteMany({ where });
    await staff.db.assistantLink.deleteMany({ where });
    await staff.db.dailyUsage.deleteMany({ where });
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
    await staff.close();
  });

  const turn = (path: string, headers: Record<string, string>, body: object) =>
    request(server()).post(path).set(headers).send(body).buffer(true).parse(collect);

  it('runs a grounded playground turn, refuses stale generations and records the session', async () => {
    await request(server())
      .post('/api/v1/voice-sessions')
      .set({ ...staffHeaders(), 'X-CSRF-Token': 'wrong' })
      .send({ locale: 'en-US', releaseId: release.id })
      .expect(403);
    const admitted = await request(server())
      .post('/api/v1/voice-sessions')
      .set(staffHeaders())
      .send({ locale: 'en-US', releaseId: release.id })
      .expect(201);
    const session = admitted.body.data.session as { id: string };
    const answered = await turn(
      `/api/v1/voice-sessions/${session.id}/turns`,
      staffHeaders(),
      question('Where is admissions?'),
    ).expect(200);
    expect(answered.headers['content-type']).toContain('application/x-ndjson');
    const events = ndjson(answered);
    expect(events.map((event) => event.type)).toEqual(['transcript', 'answer', 'complete']);
    expect(events[1]!.text).toBe('Demo mode: Admissions is in room 12.');
    expect(events.at(-1)).toMatchObject({
      providerMode: 'fixture',
      audio: 'unavailable',
      citations: [{ title: 'Admissions' }],
    });
    const stale = await request(server())
      .post(`/api/v1/voice-sessions/${session.id}/turns`)
      .set(staffHeaders())
      .send({ ...question('Again'), generation: 1 })
      .expect(409);
    expect(stale.body.error.code).toBe('STALE_GENERATION');
    await request(server())
      .post(`/api/v1/voice-sessions/${session.id}/interrupt`)
      .set(staffHeaders())
      .send({ generation: 50 })
      .expect(200);
    const detail = await request(server())
      .get(`/api/v1/sessions/${session.id}`)
      .set(staffHeaders())
      .expect(200);
    expect(detail.body.data.turnList).toMatchObject([
      { state: 'COMPLETED', answer: 'Demo mode: Admissions is in room 12.' },
    ]);
    await request(server())
      .post(`/api/v1/voice-sessions/${session.id}/end`)
      .set(staffHeaders())
      .send({})
      .expect(200);
    const ended = await request(server())
      .post(`/api/v1/voice-sessions/${session.id}/turns`)
      .set(staffHeaders())
      .send(question('Anyone there?'))
      .expect(409);
    expect(ended.body.error.code).toBe('SESSION_ENDED');
    const page = await request(server()).get('/api/v1/sessions?limit=5').set(staffHeaders());
    expect(page.body.data[0]).toMatchObject({ id: session.id, status: 'ENDED' });
  });

  it('lets a paired kiosk ask for a slide and reports APPLIED only after its acknowledgement', async () => {
    const device = await devices.create(staff.owner.token, { name: `Kiosk ${randomUUID()}` });
    const challenge = (
      await request(server())
        .post(`/api/v1/devices/${device.id}/pairing`)
        .set(staffHeaders())
        .send({ expectedRevision: device.revision })
        .expect(201)
    ).body.data;
    const paired = await request(server())
      .post('/api/v1/runtime/pair')
      .set(host())
      .send({ challengeId: challenge.id, code: challenge.code })
      .expect(201);
    const kiosk = {
      ...host(),
      Cookie: String(paired.headers['set-cookie']).split(';')[0]!,
      'X-CSRF-Token': paired.body.data.csrfToken as string,
    };
    await request(server())
      .post('/api/v1/runtime/voice-sessions')
      .set(kiosk)
      .send({ locale: 'en-US' })
      .expect(409);
    await schedules.override(staff.owner.token, device.id, { releaseId: release.id, minutes: 30 });
    const ticket = (
      await request(server())
        .post('/api/v1/runtime/tickets')
        .set(kiosk)
        .send({ namespace: '/devices', role: 'PRIMARY' })
        .expect(201)
    ).body.data.ticket as string;
    const primary = io(`${origin}/devices`, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: host(),
      auth: { ticket, role: 'PRIMARY' },
      reconnection: false,
    });
    sockets.push(primary);
    const desired = await new Promise<{ commandId: string; revision: number }>((done) =>
      primary.once('release.desired', done),
    );
    primary.emit('command.ack', {
      ...meta(),
      commandId: desired.commandId,
      appliedRevision: desired.revision,
      result: 'APPLIED',
    });
    await new Promise((done) => primary.once('command.acked', done));
    const shown: { slideId: string; target: string }[] = [];
    primary.on(
      'slide.show',
      (command: { commandId: string; revision: number; slideId: string; target: string }) => {
        shown.push(command);
        primary.emit('command.ack', {
          ...meta(),
          commandId: command.commandId,
          appliedRevision: command.revision,
          result: 'APPLIED',
        });
      },
    );
    const admitted = await request(server())
      .post('/api/v1/runtime/voice-sessions')
      .set(kiosk)
      .send({ locale: 'en-US' })
      .expect(201);
    expect(admitted.body.data.tools).toContain('show_slide');
    const events = ndjson(
      await turn(
        `/api/v1/runtime/voice-sessions/${admitted.body.data.session.id}/turns`,
        kiosk,
        question('Show the admissions steps'),
      ).expect(200),
    );
    expect(shown).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual(['transcript', 'tool', 'answer', 'complete']);
    expect(events[1]!.tool).toMatchObject({ name: 'show_slide', status: 'APPLIED' });
    expect(events[2]!.text).toBe('Demo mode: the slide is on screen.');
    // Staff sessions cannot be driven with a kiosk cookie.
    const foreign = await request(server())
      .post('/api/v1/voice-sessions')
      .set(staffHeaders())
      .send({ locale: 'en-US', releaseId: release.id })
      .expect(201);
    await request(server())
      .post(`/api/v1/runtime/voice-sessions/${foreign.body.data.session.id}/turns`)
      .set(kiosk)
      .send(question('Hello'))
      .expect(404);
  });

  it('serves a public link without knowledge, binds visitors to it and stops when disabled', async () => {
    const link = (
      await request(server())
        .post('/api/v1/assistant-links')
        .set(staffHeaders())
        .send({ releaseId: release.id, label: 'Open day' })
        .expect(201)
    ).body.data as { id: string; slug: string; revision: number };
    const publicPath = `/api/v1/public/assistants/${link.slug}`;
    const config = await request(server()).get(publicPath).set(host()).expect(200);
    expect(config.body.data.suggestions.en).toEqual(['Where is admissions?']);
    expect(JSON.stringify(config.body)).not.toContain('Admissions is in room 12.');
    await request(server())
      .get('/api/v1/public/assistants/nosuchlink00000')
      .set(host())
      .expect(404);
    await request(server())
      .get(`${publicPath}/media/${randomUUID()}/content`)
      .set(host())
      .expect(404);
    await request(server())
      .post(`${publicPath}/grants`)
      .set({ Host: new URL(origin).host, Origin: 'https://evil.example' })
      .send({})
      .expect(403);
    const granted = await request(server())
      .post(`${publicPath}/grants`)
      .set(host())
      .send({})
      .expect(201);
    const cookie = String(granted.headers['set-cookie']).split(';')[0]!;
    expect(String(granted.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(JSON.stringify(granted.body)).not.toContain(cookie.split('=')[1]!);
    const visitor = { ...host(), Cookie: cookie, 'X-CSRF-Token': granted.body.data.csrfToken };
    await request(server())
      .post(`${publicPath}/voice-sessions`)
      .set({ ...visitor, 'X-CSRF-Token': 'wrong' })
      .send({ locale: 'ne-NP' })
      .expect(403);
    const admitted = await request(server())
      .post(`${publicPath}/voice-sessions`)
      .set(visitor)
      .send({ locale: 'ne-NP' })
      .expect(201);
    expect(admitted.body.data.tools).not.toContain('show_slide');
    const sessionId = admitted.body.data.session.id as string;
    const events = ndjson(
      await turn(
        `${publicPath}/voice-sessions/${sessionId}/turns`,
        visitor,
        question('भर्ना कहाँ छ?', 'ne-NP'),
      ).expect(200),
    );
    expect(events.find((event) => event.type === 'answer')!.text).toBe(
      'डेमो मोड: भर्ना कोठा १२ मा छ।',
    );
    await request(server())
      .patch(`/api/v1/assistant-links/${link.id}`)
      .set(staffHeaders())
      .send({
        releaseId: release.id,
        label: 'Open day',
        enabled: false,
        expiresAt: null,
        expectedRevision: link.revision,
      })
      .expect(200);
    await request(server()).get(publicPath).set(host()).expect(404);
    const closed = await request(server())
      .post(`${publicPath}/voice-sessions/${sessionId}/turns`)
      .set(visitor)
      .send(question('Still there?'))
      .expect(404);
    expect(closed.body.error.code).toBe('LINK_UNAVAILABLE');
  });
});
