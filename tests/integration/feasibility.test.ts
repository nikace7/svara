import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/app.js';

describe('local-only fixture HTTP stream', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  beforeAll(async () => {
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      feasibilityOrigin: 'http://localhost:4320',
      probe: async () => ({ status: 'ready', dependencies: {} }),
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  const post = () =>
    request(app.getHttpServer())
      .post('/api/v1/feasibility/turn')
      .set('Host', 'localhost:4320')
      .set('Origin', 'http://localhost:4320');

  it('streams ordered versioned events and never advertises fixture speech', async () => {
    const response = await post()
      .send({ locale: 'ne-NP', generation: 1, scenario: 'supported_faq' })
      .expect(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    const events = response.text
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line));
    expect(events.at(-1).type).toBe('complete');
    expect(
      events.every(
        (event, seq) => event.v === 1 && event.seq === seq && event.audio === 'unavailable',
      ),
    ).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects cross-origin calls, non-loopback hosts and malformed input', async () => {
    const body = { locale: 'en-US', generation: 1, text: 'Hello' };
    await post().set('Origin', 'https://evil.example').send(body).expect(403);
    await post().set('Host', 'evil.example').send(body).expect(403);
    await post()
      .send({ ...body, scenario: 'supported_faq' })
      .expect(400);
    await post()
      .send({ ...body, text: 'x'.repeat(17000) })
      .expect(413);
  });
  it('does not register the endpoint outside the local fixture gate', async () => {
    const locked = await createApplication({
      providerMode: 'fixture',
      localDocs: false,
      probe: async () => ({ status: 'ready', dependencies: {} }),
    });
    try {
      await locked.init();
      await request(locked.getHttpServer()).post('/api/v1/feasibility/turn').send({}).expect(404);
    } finally {
      await locked.close();
    }
  });
  it('bounds concurrent streams and releases capacity when clients disconnect', async () => {
    const isolated = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      feasibilityOrigin: 'http://localhost:4320',
      probe: async () => ({ status: 'ready', dependencies: {} }),
    });
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    try {
      await isolated.listen(0, '127.0.0.1');
      const url = `${await isolated.getUrl()}/api/v1/feasibility/turn`;
      const init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4320' },
        body: JSON.stringify({ locale: 'en-US', generation: 1, scenario: 'interrupt_answer' }),
      };
      const responses = await Promise.all(
        controllers.map((controller) => fetch(url, { ...init, signal: controller.signal })),
      );
      expect(responses.every((response) => response.status === 200)).toBe(true);
      const busy = await fetch(url, init);
      expect(busy.status).toBe(429);
      expect(busy.headers.get('retry-after')).toBe('2');
      expect((await busy.json()).error.retryable).toBe(true);
      controllers.forEach((controller) => controller.abort());
      // Probe liveness of admission after disconnect; close each probe immediately.
      await expect
        .poll(async () => {
          const controller = new AbortController();
          const response = await fetch(url, { ...init, signal: controller.signal });
          const status = response.status;
          controller.abort();
          return status;
        })
        .toBe(200);
    } finally {
      controllers.forEach((controller) => controller.abort());
      await isolated.close();
    }
  });
});
