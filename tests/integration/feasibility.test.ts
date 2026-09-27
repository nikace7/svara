import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createApplication } from '../../apps/api/dist/app.js';
import { staffFixture } from './staff-fixture.js';

describe('local-only fixture HTTP stream', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    staff = await staffFixture();
    app = await createApplication({
      providerMode: 'fixture',
      localDocs: true,
      feasibilityOrigin: 'http://localhost:4320',
      identity: staff.options,
      probe: async () => ({ status: 'ready', dependencies: {} }),
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await staff.close();
  });
  const post = () =>
    request(app.getHttpServer())
      .post('/api/v1/feasibility/turn')
      .set('Host', 'localhost:4320')
      .set('Origin', 'http://localhost:4320')
      .set('Cookie', `svara-session=${staff.owner.token}`)
      .set('X-CSRF-Token', staff.owner.csrfToken);

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
      .send({ locale: 'en-US', generation: 1, audio: Buffer.alloc(3200).toString('base64') })
      .expect(400);
    await post()
      .send({ ...body, text: 'x'.repeat(800_000) })
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
      identity: staff.options,
      probe: async () => ({ status: 'ready', dependencies: {} }),
    });
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    try {
      await isolated.listen(0, '127.0.0.1');
      const url = `${await isolated.getUrl()}/api/v1/feasibility/turn`;
      const init = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:4320',
          Host: 'localhost:4320',
          Cookie: `svara-session=${staff.owner.token}`,
          'X-CSRF-Token': staff.owner.csrfToken,
        },
        body: JSON.stringify({ locale: 'en-US', generation: 1, scenario: 'interrupt_answer' }),
      };
      // Node fetch rewrites Host. Native HTTP exercises the same Host the gateway forwards.
      const stream = (signal?: AbortSignal) =>
        new Promise<IncomingMessage>((resolve, reject) => {
          const outgoing = httpRequest(
            url,
            { method: init.method, headers: init.headers, ...(signal ? { signal } : {}) },
            resolve,
          );
          outgoing.on('error', reject);
          outgoing.end(init.body);
        });
      const responses = await Promise.all(
        controllers.map((controller) => stream(controller.signal)),
      );
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
      const busy = await stream();
      expect(busy.statusCode).toBe(429);
      expect(busy.headers['retry-after']).toBe('2');
      let busyBody = '';
      for await (const chunk of busy) busyBody += String(chunk);
      expect(JSON.parse(busyBody).error.retryable).toBe(true);
      controllers.forEach((controller) => controller.abort());
      // Probe liveness of admission after disconnect; close each probe immediately.
      await expect
        .poll(async () => {
          const controller = new AbortController();
          const response = await stream(controller.signal);
          const status = response.statusCode;
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
