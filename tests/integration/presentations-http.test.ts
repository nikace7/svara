import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';
import { BotService, PresentationService } from '../../packages/domain/dist/index.js';
import { staffFixture } from './staff-fixture.js';

describe('presentation HTTP authoring', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let bots: BotService;
  beforeAll(async () => {
    staff = await staffFixture();
    bots = new BotService(staff.service);
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      authoring: bots,
      presentations: new PresentationService(staff.service),
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (!staff) return;
    const organisationId = staff.owner.identity.organisation.id;
    await staff.db.botDraft.updateMany({
      where: { organisationId },
      data: { presentationId: null },
    });
    await staff.db.bot.deleteMany({ where: { organisationId } });
    await staff.close();
  });
  const http = () => request(app.getHttpServer());
  const headers = () => ({
    Host: 'localhost:4320',
    Origin: staff.options.origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const create = async () => {
    const bot = await bots.create(staff.owner.token, { name: 'HTTP presentation' });
    return (
      await http()
        .post('/api/v1/presentations')
        .set(headers())
        .send({ botId: bot.id, name: 'Welcome' })
        .expect(201)
    ).body.data;
  };
  it('authors, reorders and selects structured bilingual presentations through the API', async () => {
    const deck = await create();
    expect(deck).toMatchObject({ selected: true, slides: [], revision: 1 });
    expect(deck).not.toHaveProperty('organisationId');
    const list = await http()
      .get(`/api/v1/presentations?botId=${deck.botId}`)
      .set(headers())
      .expect(200);
    expect(list.body.data.selectedPresentationId).toBe(deck.id);
    const one = (
      await http()
        .post(`/api/v1/presentations/${deck.id}/slides`)
        .set(headers())
        .send({ expectedRevision: 1 })
        .expect(201)
    ).body.data;
    const id = one.slides[0].id;
    const fields = {
      title: { en: 'Welcome', ne: 'स्वागत छ' },
      body: { en: 'क'.repeat(2000), ne: 'क'.repeat(2000) },
      target: 'SECONDARY',
      durationSeconds: 18,
      mediaId: null,
      expectedRevision: 1,
    };
    const saved = await http()
      .patch(`/api/v1/slides/${id}`)
      .set(headers())
      .send(fields)
      .expect(200);
    expect(saved.body.data.slides[0]).toMatchObject({
      title: fields.title,
      target: 'SECONDARY',
      revision: 2,
    });
    const two = (
      await http()
        .post(`/api/v1/presentations/${deck.id}/slides`)
        .set(headers())
        .send({ expectedRevision: 3 })
        .expect(201)
    ).body.data;
    const nextId = two.slides[1].id;
    const reordered = await http()
      .put(`/api/v1/presentations/${deck.id}/order`)
      .set(headers())
      .send({ slideIds: [nextId, id], expectedRevision: 4 })
      .expect(200);
    expect(reordered.body.data.slides.map((slide: { id: string }) => slide.id)).toEqual([
      nextId,
      id,
    ]);
    const renamed = await http()
      .patch(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .send({ name: 'Visitor welcome', expectedRevision: 5 })
      .expect(200);
    expect(renamed.body.data.name).toBe('Visitor welcome');
    const selection = await http()
      .put(`/api/v1/bots/${deck.botId}/presentation`)
      .set(headers())
      .send({ presentationId: null, expectedRevision: renamed.body.data.botRevision })
      .expect(200);
    expect(selection.body.data.presentationId).toBeNull();
    const removed = await http()
      .delete(`/api/v1/slides/${nextId}`)
      .set(headers())
      .send({ expectedRevision: 2 })
      .expect(200);
    expect(removed.body.data.slides).toHaveLength(1);
    expect(removed.body.data.slides[0]).toMatchObject({ id, position: 0 });
    await http()
      .delete(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .send({ expectedRevision: removed.body.data.revision })
      .expect(200);
    await http().get(`/api/v1/presentations/${deck.id}`).set(headers()).expect(404);
  });
  it('requires current staff, exact origin, JSON and explicit revisions', async () => {
    const deck = await create();
    await http().get(`/api/v1/presentations/${deck.id}`).set('Host', 'localhost:4320').expect(401);
    await http()
      .patch(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .unset('X-CSRF-Token')
      .send({ name: 'Denied', expectedRevision: 1 })
      .expect(403);
    await http()
      .patch(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .set('Origin', 'https://foreign.test')
      .send({ name: 'Denied', expectedRevision: 1 })
      .expect(403);
    await http()
      .post('/api/v1/presentations')
      .set(headers())
      .field('name', 'Multipart')
      .expect(400);
    await http()
      .patch(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .send({ name: 'Missing revision' })
      .expect(428);
    const stale = await http()
      .patch(`/api/v1/presentations/${deck.id}`)
      .set(headers())
      .send({ name: 'Stale', expectedRevision: 2 })
      .expect(409);
    expect(stale.body.error).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
    await http()
      .post(`/api/v1/presentations/${deck.id}/slides`)
      .set(headers())
      .send({ expectedRevision: 1, organisationId: deck.botId })
      .expect(400);
    await http()
      .post(`/api/v1/presentations/${deck.id}/slides`)
      .set(headers())
      .send({ expectedRevision: 1, payload: 'x'.repeat(66000) })
      .expect(413);
    await http()
      .get(`/api/v1/presentations?botId=${deck.botId}&organisationId=injected`)
      .set(headers())
      .expect(400);
    await http().get('/api/v1/presentations?botId=invalid').set(headers()).expect(400);
    const invalid = await http()
      .put(`/api/v1/presentations/${deck.id}/order`)
      .set(headers())
      .send({ slideIds: [deck.id], expectedRevision: 1 })
      .expect(409);
    expect(invalid.body.error).toMatchObject({
      code: 'INVALID_SLIDE_ORDER',
      message: expect.stringContaining('every current slide'),
    });
  });
  it('denies foreign objects and viewer mutations and publishes matching OpenAPI routes', async () => {
    const deck = await create();
    const other = await staff.service.register({
      email: `presentation-foreign-${staff.suffix}`,
      displayName: 'Other',
      organisationName: 'Other',
      password: staff.password,
    });
    const foreign = {
      ...headers(),
      Cookie: `svara-session=${other.token}`,
      'X-CSRF-Token': other.csrfToken,
    };
    await http().get(`/api/v1/presentations/${deck.id}`).set(foreign).expect(404);
    await http()
      .delete(`/api/v1/presentations/${deck.id}`)
      .set(foreign)
      .send({ expectedRevision: 1 })
      .expect(404);
    const grant = await staff.service.invite(staff.owner.token, {
      email: `presentation-viewer-${staff.suffix}`,
      role: 'VIEWER',
    });
    await staff.service.activate({
      token: grant.token,
      displayName: 'Viewer',
      password: staff.password,
    });
    const viewer = await staff.service.login({
      email: `presentation-viewer-${staff.suffix}`,
      password: staff.password,
    });
    const readOnly = {
      ...headers(),
      Cookie: `svara-session=${viewer.token}`,
      'X-CSRF-Token': viewer.csrfToken,
    };
    await http().get(`/api/v1/presentations/${deck.id}`).set(readOnly).expect(200);
    await http()
      .post(`/api/v1/presentations/${deck.id}/slides`)
      .set(readOnly)
      .send({ expectedRevision: 1 })
      .expect(403);
    await http()
      .put(`/api/v1/bots/${deck.botId}/presentation`)
      .set(readOnly)
      .send({ presentationId: null, expectedRevision: deck.botRevision })
      .expect(403);
    const document = createOpenApiDocument(app);
    for (const path of [
      '/api/v1/presentations',
      '/api/v1/presentations/{id}',
      '/api/v1/presentations/{id}/slides',
      '/api/v1/presentations/{id}/order',
      '/api/v1/slides/{id}',
      '/api/v1/bots/{botId}/presentation',
    ])
      expect(document.paths).toHaveProperty(path);
    expect(document.paths['/api/v1/presentations/{id}/order']?.put?.responses).toHaveProperty(
      '409',
    );
    expect(document.paths['/api/v1/slides/{id}']?.patch?.responses).toHaveProperty('428');
  });
});
