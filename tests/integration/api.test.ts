import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApplication, createOpenApiDocument } from '../../apps/api/dist/app.js';

describe('HTTP foundation contract', () => {
  let healthy = true;
  let probeFailure: Error | undefined;
  let app: Awaited<ReturnType<typeof createApplication>>;
  beforeAll(async () => {
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      probe: async () => {
        if (probeFailure) throw probeFailure;
        return {
          status: healthy ? 'ready' : 'unavailable',
          dependencies: { database: healthy ? 'ready' : 'unavailable' },
        };
      },
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

  it('records a safe database error code for diagnosis without exposing exception details', async () => {
    probeFailure = Object.assign(new Error('private database detail'), { code: 'P2034' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(500);
      const record = JSON.parse(String(log.mock.calls[0]?.[0]));
      expect(record).toMatchObject({
        event: 'request.failed',
        databaseCode: 'P2034',
        requestId: response.body.requestId,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain('private database detail');
      expect(response.text).not.toContain('P2034');
      expect(response.text).not.toContain('private database detail');
    } finally {
      probeFailure = undefined;
      log.mockRestore();
    }
  });
});
