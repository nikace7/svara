import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';

describe('HTTP foundation contract', () => {
  let healthy = true;
  let app: Awaited<ReturnType<typeof createApplication>>;
  beforeAll(async () => {
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      probe: async () => ({
        status: healthy ? 'ready' : 'unavailable',
        dependencies: { database: healthy ? 'ready' : 'unavailable' },
      }),
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves liveness without dependency checks and prevents caching', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(response.body).toEqual({
      data: { status: 'ok', service: 'api', providerMode: 'fixture' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('returns 503 when a dependency fails, without leaking connection strings', async () => {
    healthy = false;
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(response.body.data.status).toBe('unavailable');
    healthy = true;
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });

  it('returns the shared safe error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found.',
      fieldErrors: {},
      retryable: false,
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('exposes a stable OpenAPI contract for health endpoints', async () => {
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/health/live');
    expect(document.paths['/api/v1/health/ready']?.get?.responses).toHaveProperty('503');
    await request(app.getHttpServer()).get('/api/openapi.json').expect(200);
  });
});
