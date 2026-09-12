import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';
import { BotService, KnowledgeService, ReleaseService } from '../../packages/domain/dist/index.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { staffFixture } from './staff-fixture.js';

describe('staff release HTTP boundary', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let bots: BotService;
  let knowledge: KnowledgeService;
  let now = Date.now();
  beforeAll(async () => {
    staff = await staffFixture();
    bots = new BotService(staff.service);
    knowledge = new KnowledgeService(staff.service);
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      authoring: bots,
      releases: new ReleaseService(staff.service, {
        providerMode: 'fixture',
        clock: () => new Date(now),
      }),
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (!staff) return;
    const organisations = await staff.db.organisation.findMany({
      where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      select: { id: true },
    });
    const where = { organisationId: { in: organisations.map((row) => row.id) } };
    await staff.db.idempotencyRecord.deleteMany({ where });
    await staff.db.botRelease.deleteMany({ where });
    await staff.db.bot.deleteMany({ where });
    await staff.close();
  });
  const http = () => request(app.getHttpServer());
  const headers = () => ({
    Host: 'localhost:4320',
    Origin: staff.options.origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  async function ready() {
    const bot = await bots.create(staff.owner.token, { name: 'HTTP campus guide' });
    return bots.save(staff.owner.token, bot.id, {
      name: bot.name,
      description: '',
      expectedRevision: bot.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help with campus information.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Ask reception.', ne: 'स्वागत कक्षमा सोध्नुहोस्।' },
      },
    });
  }
  it('returns actionable readiness and creates one immutable publication under retries', async () => {
    const blank = await bots.create(staff.owner.token, { name: 'Incomplete' });
    const validation = await http()
      .post(`/api/v1/bots/${blank.id}/releases/validate`)
      .set(headers())
      .send({ expectedRevision: blank.revision })
      .expect(200);
    expect(validation.body.data).toMatchObject({
      canPreview: false,
      canPublish: false,
      providerMode: 'fixture',
    });
    const rejected = await http()
      .post(`/api/v1/bots/${blank.id}/releases`)
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({ expectedRevision: blank.revision })
      .expect(422);
    expect(rejected.body.error).toMatchObject({ code: 'RELEASE_NOT_READY', retryable: false });
    expect(rejected.body.error.fieldErrors).toHaveProperty('draft.greeting.ne');
    const bot = await ready();
    const key = randomUUID();
    const path = `/api/v1/bots/${bot.id}/releases`;
    const payload = { expectedRevision: bot.revision };
    const first = await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    const replay = await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(first.body.data).toMatchObject({
      kind: 'PUBLISHED',
      version: 1,
      providerMode: 'fixture',
      botRevision: bot.revision,
    });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.data).not.toHaveProperty('organisationId');
    expect(JSON.stringify(first.body)).not.toContain('storageKey');
    const loaded = await http()
      .get(`/api/v1/releases/${first.body.data.id}`)
      .set(headers())
      .expect(200);
    expect(loaded.body.data).toEqual(first.body.data);
    const list = await http().get(`${path}?kind=PUBLISHED&pageSize=1`).set(headers()).expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(list.body.data.items[0]).not.toHaveProperty('snapshot');
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', key)
      .send({ expectedRevision: bot.revision + 1 })
      .expect(409)
      .expect((response) => expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT'));
  });
  it('rejects missing authority, forged scope, stale revisions, keys and invalid text before SQL', async () => {
    const bot = await ready();
    const path = `/api/v1/bots/${bot.id}/releases`;
    const payload = { expectedRevision: bot.revision };
    await http().get(path).set('Host', 'localhost:4320').expect(401);
    await http().post(path).set(headers()).unset('X-CSRF-Token').send(payload).expect(403);
    await http()
      .post(path)
      .set(headers())
      .set('Origin', 'https://foreign.test')
      .send(payload)
      .expect(403);
    await http().post(path).set(headers()).set('Host', 'foreign.test').send(payload).expect(403);
    await http().post(path).set(headers()).send(payload).expect(428);
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', 'short')
      .send(payload)
      .expect(400);
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(428);
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({ expectedRevision: 1 })
      .expect(409);
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({ ...payload, organisationId: randomUUID() })
      .expect(400);
    await http()
      .post(path)
      .set(headers())
      .set('Idempotency-Key', randomUUID())
      .send({ ...payload, padding: 'x'.repeat(70000) })
      .expect(413);
    await http().get(`${path}?organisationId=forged`).set(headers()).expect(400);
    await http().get(`${path}?page=0`).set(headers()).expect(400);
    await http().get('/api/v1/releases/invalid').set(headers()).expect(400);
    const release = (
      await http()
        .post(path)
        .set(headers())
        .set('Idempotency-Key', randomUUID())
        .send(payload)
        .expect(201)
    ).body.data;
    for (const query of ['', 'x'.repeat(501), 'desk\u0000room'])
      await http()
        .post(`/api/v1/releases/${release.id}/knowledge/query`)
        .set(headers())
        .send({ locale: 'en', query })
        .expect(400);
    await http()
      .post(`/api/v1/releases/${release.id}/knowledge/query`)
      .set(headers())
      .unset('X-CSRF-Token')
      .send({ locale: 'en', query: 'desk' })
      .expect(403);
  });
  it('inspects frozen bilingual preview knowledge and enforces expiry without erasing history', async () => {
    const bot = await ready();
    const created = await knowledge.create(staff.owner.token, bot.id, {
      title: 'Reception',
      type: 'FAQ',
    });
    const saved = await knowledge.save(staff.owner.token, created.id, {
      expectedRevision: created.revision,
      title: created.title,
      type: 'FAQ',
      question: { en: 'Where is reception?', ne: 'स्वागत कक्ष कहाँ छ?' },
      content: { en: 'Reception is in room 12.', ne: 'स्वागत कक्ष कोठा १२ मा छ।' },
    });
    const preview = (
      await http()
        .post(`/api/v1/bots/${bot.id}/preview`)
        .set(headers())
        .set('Idempotency-Key', randomUUID())
        .send({ expectedRevision: saved.botRevision })
        .expect(201)
    ).body.data;
    expect(preview).toMatchObject({ kind: 'PREVIEW', version: null });
    expect(preview.snapshot.knowledge[0].status).toBe('DRAFT');
    const result = await http()
      .post(`/api/v1/releases/${preview.id}/knowledge/query`)
      .set(headers())
      .send({ locale: 'ne', query: 'स्वागत कक्ष कहाँ छ?' })
      .expect(200);
    expect(result.body.data).toMatchObject({
      releaseId: preview.id,
      snapshotHash: preview.snapshotHash,
      locale: 'ne',
    });
    expect(result.body.data.passages[0].entryId).toBe(saved.id);
    now += 31 * 60 * 1000;
    const expired = await http()
      .post(`/api/v1/releases/${preview.id}/knowledge/query`)
      .set(headers())
      .send({ locale: 'en', query: 'reception' })
      .expect(410);
    expect(expired.body.error.code).toBe('PREVIEW_EXPIRED');
    await http().get(`/api/v1/releases/${preview.id}`).set(headers()).expect(200);
  });
  it('enforces tenant and role scope and documents routes and retry headers', async () => {
    const bot = await ready();
    const release = (
      await http()
        .post(`/api/v1/bots/${bot.id}/releases`)
        .set(headers())
        .set('Idempotency-Key', randomUUID())
        .send({ expectedRevision: bot.revision })
        .expect(201)
    ).body.data;
    const foreign = await staff.service.register({
      email: `release-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Other owner',
      organisationName: 'Other',
    });
    const other = {
      ...headers(),
      Cookie: `svara-session=${foreign.token}`,
      'X-CSRF-Token': foreign.csrfToken,
    };
    await http().get(`/api/v1/releases/${release.id}`).set(other).expect(404);
    await http().get(`/api/v1/bots/${bot.id}/releases`).set(other).expect(404);
    await http()
      .post(`/api/v1/releases/${release.id}/knowledge/query`)
      .set(other)
      .send({ locale: 'en', query: 'reception' })
      .expect(404);
    const grant = await staff.service.invite(staff.owner.token, {
      email: `release-viewer-${staff.suffix}`,
      role: 'VIEWER',
    });
    await staff.service.activate({
      token: grant.token,
      password: staff.password,
      displayName: 'Viewer',
    });
    const viewer = await staff.service.login({
      email: `release-viewer-${staff.suffix}`,
      password: staff.password,
    });
    const view = {
      ...headers(),
      Cookie: `svara-session=${viewer.token}`,
      'X-CSRF-Token': viewer.csrfToken,
    };
    await http().get(`/api/v1/releases/${release.id}`).set(view).expect(200);
    await http()
      .post(`/api/v1/bots/${bot.id}/releases`)
      .set(view)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedRevision: bot.revision })
      .expect(403);
    await http()
      .post(`/api/v1/bots/${bot.id}/preview`)
      .set(view)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedRevision: bot.revision })
      .expect(403);
    const document = createOpenApiDocument(app);
    for (const path of [
      '/api/v1/bots/{botId}/preview',
      '/api/v1/bots/{botId}/releases',
      '/api/v1/bots/{botId}/releases/validate',
      '/api/v1/releases/{id}',
      '/api/v1/releases/{id}/knowledge/query',
    ])
      expect(document.paths).toHaveProperty(path);
    expect(document.paths['/api/v1/bots/{botId}/releases']?.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true }),
      ]),
    );
    expect(document.paths['/api/v1/releases/{id}/knowledge/query']?.post?.responses).toHaveProperty(
      '410',
    );
  });
});
