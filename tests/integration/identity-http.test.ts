import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/src/app.js';
import { staffFixture } from './staff-fixture.js';

describe('staff HTTP authority', () => {
  let fixture: Awaited<ReturnType<typeof staffFixture>>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let limited = false;
  let redisFailed = false;
  beforeAll(async () => {
    fixture = await staffFixture();
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      feasibilityOrigin: fixture.options.origin,
      probe: async () => ({ status: 'ready', dependencies: {} }),
      identity: {
        ...fixture.options,
        consumeLimit: async () => {
          if (redisFailed) throw new Error('private redis connection');
          return limited ? 60 : 0;
        },
      },
    });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await fixture?.close();
  });
  const http = () => request(app.getHttpServer());
  const cookie = () => `svara-session=${fixture.owner.token}`;
  const post = (path: string) =>
    http()
      .post(`/api/v1/${path}`)
      .set('Host', 'localhost:4320')
      .set('Origin', fixture.options.origin);

  it('requires authentication for identity and fixture data without leaking credentials', async () => {
    const denied = await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .expect(401);
    expect(denied.body.error.code).toBe('UNAUTHENTICATED');
    const response = await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .set('Cookie', cookie())
      .expect(200);
    expect(response.body.data.identity.user.id).toBe(fixture.owner.identity.user.id);
    expect(response.body.data.csrfToken).toBe(fixture.owner.csrfToken);
    expect(response.text).not.toContain(fixture.owner.token);
    expect(response.headers['cache-control']).toBe('no-store');
    await post('feasibility/turn')
      .send({ locale: 'en-US', generation: 1, text: 'Hello' })
      .expect(401);
    await post('feasibility/turn')
      .set('Cookie', cookie())
      .send({ locale: 'en-US', generation: 1, text: 'Hello' })
      .expect(403);
  });

  it('sets host-only cookies and rotates credentials without returning a bearer in JSON', async () => {
    const response = await post('auth/login')
      .set('Cookie', cookie())
      .send({ email: fixture.owner.identity.user.email, password: fixture.password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Path=/');
    expect(cookies[0]).not.toContain('Domain=');
    expect(response.body.data).not.toHaveProperty('token');
    const newCookie = cookies[0]!.split(';')[0]!;
    await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .set('Cookie', cookie())
      .expect(401);
    await post('auth/logout')
      .set('Cookie', newCookie)
      .set('X-CSRF-Token', response.body.data.csrfToken)
      .send({})
      .expect(200);
    await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .set('Cookie', newCookie)
      .expect(401);
    fixture.owner = await fixture.service.login({
      email: fixture.owner.identity.user.email,
      password: fixture.password,
    });
  });

  it('rejects foreign/missing Origin, spoofed Host, duplicate cookies and invalid CSRF', async () => {
    const body = { email: fixture.owner.identity.user.email, password: fixture.password };
    await post('auth/login').set('Origin', 'https://evil.example').send(body).expect(403);
    await http().post('/api/v1/auth/login').set('Host', 'localhost:4320').send(body).expect(403);
    await post('auth/login').set('Host', 'evil.example').send(body).expect(403);
    await post('auth/logout').set('Cookie', cookie()).send({}).expect(403);
    await post('auth/logout')
      .set('Cookie', cookie())
      .set('X-CSRF-Token', 'x'.repeat(43))
      .send({})
      .expect(403);
    await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .set('Cookie', `${cookie()}; ${cookie()}`)
      .expect(401);
    await http()
      .get('/api/v1/auth/session')
      .set('Host', 'localhost:4320')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie())
      .expect(403);
  });

  it('validates DTOs, unknown fields, body limits and generates stable auth contracts', async () => {
    const bad = await post('auth/register')
      .send({
        email: 'wrong',
        password: 'short',
        displayName: '',
        organisationName: 'Campus',
        organisationId: 'injected',
      })
      .expect(400);
    expect(bad.text).not.toContain('short');
    expect(bad.body.error.fieldErrors.email).toBeDefined();
    await post('auth/login')
      .send({ email: 'x'.repeat(17000), password: 'ignored' })
      .expect(413);
    await post('auth/login').set('Content-Type', 'application/json').send('{invalid').expect(400);
    const document = createOpenApiDocument(app);
    for (const path of [
      '/auth/register',
      '/auth/session',
      '/auth/activate',
      '/members/invitations',
      '/organisation',
    ])
      expect(document.paths).toHaveProperty(`/api/v1${path}`);
    expect(document.components?.schemas?.RegisterDto).toHaveProperty('required');
  });

  it('enforces role/tenant checks and immediately rejects downgraded sessions through HTTP', async () => {
    const csrf = fixture.owner.csrfToken;
    const invitation = await post('members/invitations')
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf)
      .send({ email: `viewer-${fixture.suffix}`, role: 'VIEWER' })
      .expect(201);
    const link = new URL(invitation.body.data.url);
    expect(link.origin).toBe(fixture.options.origin);
    expect(link.search).toBe('');
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    await post('auth/activate')
      .send({ token, password: fixture.password, displayName: 'Viewer' })
      .expect(200);
    const login = await post('auth/login')
      .send({ email: `viewer-${fixture.suffix}`, password: fixture.password })
      .expect(200);
    const viewerCookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const viewerCsrf = login.body.data.csrfToken;
    await post('members/invitations')
      .set('Cookie', viewerCookie)
      .set('X-CSRF-Token', viewerCsrf)
      .send({ email: `no-${fixture.suffix}`, role: 'OWNER' })
      .expect(403);
    await http()
      .patch('/api/v1/members/10000000-0000-4000-8000-000000000099')
      .set('Host', 'localhost:4320')
      .set('Origin', fixture.options.origin)
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf)
      .send({ role: 'VIEWER', enabled: true })
      .expect(404);
    await http()
      .patch(`/api/v1/members/${login.body.data.identity.membership.id}`)
      .set('Host', 'localhost:4320')
      .set('Origin', fixture.options.origin)
      .set('Cookie', cookie())
      .set('X-CSRF-Token', csrf)
      .send({ role: 'VIEWER', enabled: false })
      .expect(200);
    await http()
      .get('/api/v1/members')
      .set('Host', 'localhost:4320')
      .set('Cookie', viewerCookie)
      .expect(401);
  });

  it('fails closed on Redis failure and exposes retry-after on rate denial', async () => {
    limited = true;
    const limitedResponse = await post('auth/login')
      .send({ email: 'synthetic@example.test', password: 'synthetic password' })
      .expect(429);
    expect(limitedResponse.headers['retry-after']).toBe('60');
    limited = false;
    redisFailed = true;
    const unavailable = await post('auth/login')
      .send({ email: 'synthetic@example.test', password: 'synthetic password' })
      .expect(503);
    expect(unavailable.text).not.toContain('private redis');
    redisFailed = false;
  });
});
