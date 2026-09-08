import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';
import { BotService } from '../../packages/domain/dist/authoring/bots.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { staffFixture } from './staff-fixture.js';

describe('bot authoring HTTP boundary', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  beforeAll(async () => {
    staff = await staffFixture();
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: staff.options,
      authoring: new BotService(staff.service),
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
  const auth = () => ({
    Host: 'localhost:4320',
    Origin: staff.options.origin,
    Cookie: `svara-session=${staff.owner.token}`,
    'X-CSRF-Token': staff.owner.csrfToken,
  });
  const create = () =>
    http().post('/api/v1/bots').set(auth()).send({ name: 'Campus guide' }).expect(201);

  it('requires staff, configured Origin and the rendered session CSRF token', async () => {
    await http().get('/api/v1/bots').set('Host', 'localhost:4320').expect(401);
    await http()
      .post('/api/v1/bots')
      .set(auth())
      .unset('X-CSRF-Token')
      .send({ name: 'Denied' })
      .expect(403);
    await http()
      .post('/api/v1/bots')
      .set(auth())
      .set('Origin', 'https://foreign.example')
      .send({ name: 'Denied' })
      .expect(403);
    const response = await create();
    expect(response.body.data.revision).toBe(1);
    expect(response.body.data).not.toHaveProperty('organisationId');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('reports missing and stale revisions without silently overwriting a saved draft', async () => {
    const bot = (await create()).body.data;
    const patch = () => http().patch(`/api/v1/bots/${bot.id}`).set(auth());
    const input = { name: 'Updated guide', description: '', draft: bot.draft };
    await patch().send(input).expect(428);
    await patch()
      .send({ ...input, expectedRevision: 1 })
      .expect(200);
    const conflict = await patch()
      .send({ ...input, expectedRevision: 1 })
      .expect(409);
    expect(conflict.body.error).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
    await http()
      .post(`/api/v1/bots/${bot.id}/archive`)
      .set(auth())
      .send({ archived: true, expectedRevision: 2 })
      .expect(200);
    const archived = await patch()
      .send({ ...input, expectedRevision: 3 })
      .expect(409);
    expect(archived.body.error.code).toBe('ARCHIVED');
  });
  it('accepts bounded full Nepali drafts while retaining smaller credential limits', async () => {
    const bot = (await create()).body.data;
    const draft = {
      ...emptyBotDraft(),
      persona: 'क'.repeat(4000),
      greeting: { en: 'क'.repeat(2000), ne: 'क'.repeat(2000) },
      fallback: { en: 'क'.repeat(2000), ne: 'क'.repeat(2000) },
    };
    const input = { name: 'मार्गदर्शक', description: 'क'.repeat(1000), draft, expectedRevision: 1 };
    expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(16384);
    await http().patch(`/api/v1/bots/${bot.id}`).set(auth()).send(input).expect(200);
    await http()
      .post('/api/v1/bots')
      .set(auth())
      .send({ name: 'x'.repeat(66000) })
      .expect(413);
    await http()
      .post('/api/v1/auth/login')
      .set(auth())
      .send({ email: 'x'.repeat(17000), password: 'ignored' })
      .expect(413);
  });
  it('validates query and nested input and denies cross-organisation draft IDs', async () => {
    const bot = (await create()).body.data;
    for (const query of [
      'page=-1',
      'includeArchived=no',
      'pageSize=51',
      'organisationId=other',
      'page=1&page=2',
    ])
      await http().get(`/api/v1/bots?${query}`).set(auth()).expect(400);
    await http()
      .post('/api/v1/bots')
      .set(auth())
      .send({ name: 'Injected', organisationId: 'other' })
      .expect(400);
    await http()
      .patch(`/api/v1/bots/${bot.id}`)
      .set(auth())
      .send({
        name: bot.name,
        description: '',
        expectedRevision: 1,
        draft: { ...bot.draft, secret: 'unknown' },
      })
      .expect(400);
    const list = await http()
      .get('/api/v1/bots?search=Campus&page=1&pageSize=1&includeArchived=true')
      .set(auth())
      .expect(200);
    expect(list.body.data.items).toHaveLength(1);
    const other = await staff.service.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign',
      organisationName: 'Other organisation',
    });
    const headers = {
      ...auth(),
      Cookie: `svara-session=${other.token}`,
      'X-CSRF-Token': other.csrfToken,
    };
    await http().get(`/api/v1/bots/${bot.id}`).set(headers).expect(404);
    await http()
      .patch(`/api/v1/bots/${bot.id}`)
      .set(headers)
      .send({ name: 'Foreign edit', description: '', draft: bot.draft, expectedRevision: 1 })
      .expect(404);
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/bots/{id}/archive');
    expect(document.paths['/api/v1/bots/{id}']?.patch?.responses).toHaveProperty('428');
  });
});
