import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';
import { BotService } from '../../packages/domain/dist/authoring/bots.js';
import { KnowledgeService } from '../../packages/domain/dist/authoring/knowledge.js';
import { staffFixture } from './staff-fixture.js';

describe('knowledge HTTP authoring', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let botId: string;
  beforeAll(async () => {
    staff = await staffFixture();
    const bots = new BotService(staff.service);
    botId = (await bots.create(staff.owner.token, { name: 'HTTP Knowledge' })).id;
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      authoring: bots,
      knowledge: new KnowledgeService(staff.service),
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (!staff) return;
    await staff.db.bot.deleteMany({
      where: { organisationId: staff.owner.identity.organisation.id },
    });
    await staff.close();
  });
  const http = () => request(app.getHttpServer());
  const headers = () => ({
    Host: 'localhost:4320',
    Origin: staff.options.origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const create = () =>
    http()
      .post(`/api/v1/bots/${botId}/knowledge`)
      .set(headers())
      .send({ type: 'FAQ', title: 'Opening hours' })
      .expect(201);
  const content = {
    type: 'FAQ',
    title: 'Opening hours',
    content: { en: 'Open weekdays.', ne: 'हप्ताका कार्यदिनमा खुला छ।' },
    question: { en: 'When are you open?', ne: 'कहिले खुल्छ?' },
  };

  it('requires current staff authority and returns specific approval translation errors', async () => {
    await http().get(`/api/v1/bots/${botId}/knowledge`).set('Host', 'localhost:4320').expect(401);
    await http()
      .post(`/api/v1/bots/${botId}/knowledge`)
      .set(headers())
      .unset('X-CSRF-Token')
      .send({ type: 'FAQ', title: 'Denied' })
      .expect(403);
    const entry = (await create()).body.data;
    expect(entry).not.toHaveProperty('organisationId');
    const incomplete = await http()
      .post(`/api/v1/knowledge/${entry.id}/approval`)
      .set(headers())
      .send({ expectedRevision: 1, approved: true })
      .expect(422);
    expect(incomplete.body.error).toMatchObject({
      code: 'INCOMPLETE_TRANSLATIONS',
      fieldErrors: { 'content.en': expect.any(Array), 'question.ne': expect.any(Array) },
    });
    await http()
      .patch(`/api/v1/knowledge/${entry.id}`)
      .set(headers())
      .send({ ...content, expectedRevision: 1 })
      .expect(200);
    const approved = await http()
      .post(`/api/v1/knowledge/${entry.id}/approval`)
      .set(headers())
      .send({ expectedRevision: 2, approved: true })
      .expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
    const excluded = await http()
      .post(`/api/v1/knowledge/${entry.id}/selection`)
      .set(headers())
      .send({ expectedRevision: 3, selected: false })
      .expect(200);
    expect(excluded.body.data).toMatchObject({ selected: false, status: 'APPROVED' });
  });
  it('validates revisions, foreign IDs and the generated contract', async () => {
    const entry = (await create()).body.data;
    await http().patch(`/api/v1/knowledge/${entry.id}`).set(headers()).send(content).expect(428);
    await http()
      .patch(`/api/v1/knowledge/${entry.id}`)
      .set(headers())
      .send({ ...content, expectedRevision: 2 })
      .expect(409);
    await http().get(`/api/v1/bots/${botId}/knowledge?status=invalid`).set(headers()).expect(400);
    await http()
      .patch(`/api/v1/knowledge/${entry.id}`)
      .set(headers())
      .send({ ...content, expectedRevision: 1, organisationId: 'injected' })
      .expect(400);
    const foreign = await staff.service.register({
      email: `knowledge-api-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign',
      organisationName: 'Foreign campus',
    });
    const other = {
      ...headers(),
      Cookie: `svara-session=${foreign.token}`,
      'X-CSRF-Token': foreign.csrfToken,
    };
    await http().get(`/api/v1/knowledge/${entry.id}`).set(other).expect(404);
    await http()
      .post(`/api/v1/knowledge/${entry.id}/approval`)
      .set(other)
      .send({ expectedRevision: 1, approved: false })
      .expect(404);
    await http()
      .delete(`/api/v1/knowledge/${entry.id}`)
      .set(other)
      .send({ expectedRevision: 1 })
      .expect(404);
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/knowledge/{id}/approval');
    expect(document.paths['/api/v1/knowledge/{id}/approval']?.post?.responses).toHaveProperty(
      '422',
    );
    await http()
      .delete(`/api/v1/knowledge/${entry.id}`)
      .set(headers())
      .send({ expectedRevision: 1 })
      .expect(200);
    await http().get(`/api/v1/knowledge/${entry.id}`).set(headers()).expect(404);
  });
  it('accepts full bounded Nepali entries without increasing credential request limits', async () => {
    const entry = (await create()).body.data;
    const input = {
      ...content,
      content: { en: 'क'.repeat(8000), ne: 'क'.repeat(8000) },
      question: { en: 'क'.repeat(500), ne: 'क'.repeat(500) },
      expectedRevision: 1,
    };
    expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(16384);
    await http().patch(`/api/v1/knowledge/${entry.id}`).set(headers()).send(input).expect(200);
    await http()
      .patch(`/api/v1/knowledge/${entry.id}`)
      .set(headers())
      .send({ payload: 'x'.repeat(66000) })
      .expect(413);
    await http()
      .post('/api/v1/auth/login')
      .set(headers())
      .send({ email: 'x'.repeat(17000), password: 'ignored' })
      .expect(413);
  });
});
