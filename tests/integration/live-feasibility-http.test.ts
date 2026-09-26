import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../../apps/api/dist/app.js';
import { FeasibilityEventSchema } from '../../packages/contracts/dist/index.js';
import type { FeasibilityEvent } from '../../packages/contracts/dist/index.js';
import { GeminiError } from '../../packages/providers/dist/index.js';
import { staffFixture } from './staff-fixture.js';

/** Stub providers: this suite proves the live HTTP path, not provider behaviour.
 * The real providers are exercised by `pnpm eval:gemini`. */
const answer = ['भर्ना कार्यालय कोठा A-101 मा छ। ', 'यो १० बजे खुल्छ।'];
let quotaExhausted = false;
let spoken = 0;
const liveVoice = {
  generator: {
    async *generate() {
      if (quotaExhausted) throw new GeminiError('PROVIDER_QUOTA', 429, 'quota exhausted');
      yield* answer;
    },
  },
  synthesizer: {
    async *synthesize() {
      // Six thousand bytes for the first sentence splits into two packets; ordering must survive.
      const first = spoken++ === 0;
      yield new ArrayBuffer(first ? 4800 : 2400);
      if (first) yield new ArrayBuffer(1200);
    },
  },
  passages: [{ id: 'admissions', text: 'Room A-101, open 10:00-16:00.' }],
};

describe('live voice HTTP stream', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  let fixtureApp: Awaited<ReturnType<typeof createApplication>>;
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    staff = await staffFixture();
    const base = {
      localDocs: true,
      feasibilityOrigin: 'http://localhost:4320',
      identity: staff.options,
      probe: async () => ({ status: 'ready' as const, dependencies: {} }),
    };
    app = await createApplication({ ...base, providerMode: 'live', liveVoice });
    fixtureApp = await createApplication({ ...base, providerMode: 'live' });
    await Promise.all([app.init(), fixtureApp.init()]);
  });
  afterAll(async () => {
    await Promise.all([app?.close(), fixtureApp?.close()]);
    await staff?.close();
  });
  const post = (target = app) =>
    request(target.getHttpServer())
      .post('/api/v1/feasibility/turn')
      .set('Host', 'localhost:4320')
      .set('Origin', 'http://localhost:4320')
      .set('Cookie', `svara-session=${staff.owner.token}`)
      .set('X-CSRF-Token', staff.owner.csrfToken);
  const events = (text: string): FeasibilityEvent[] =>
    text
      .trim()
      .split('\n')
      .map((line) => FeasibilityEventSchema.parse(JSON.parse(line)));

  it('streams a grounded answer with ordered playable audio packets', async () => {
    quotaExhausted = false;
    spoken = 0;
    const response = await post()
      .send({ locale: 'ne-NP', generation: 3, text: 'भर्ना कार्यालय कहाँ छ?' })
      .expect(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    const stream = events(response.text);
    expect(stream.map((event) => event.type)).toEqual([
      'transcript',
      'answer',
      'audio',
      'audio',
      'answer',
      'audio',
      'complete',
    ]);
    expect(stream.every((event, seq) => event.seq === seq && event.v === 1)).toBe(true);
    expect(stream.every((event) => event.providerMode === 'live')).toBe(true);
    expect(stream.every((event) => event.audio === 'streaming')).toBe(true);
    expect(stream[0]!.text).toBe('भर्ना कार्यालय कहाँ छ?');

    const audio = stream.filter((event) => event.type === 'audio');
    expect(audio.map((event) => event.segment)).toEqual([0, 0, 1]);
    expect(audio.map((event) => event.end)).toEqual([false, true, true]);
    expect(audio.map((event) => Buffer.from(event.pcm!, 'base64').byteLength)).toEqual([
      4800, 1200, 2400,
    ]);
    // No event may carry a provider key or raw provider diagnostics.
    expect(response.text).not.toMatch(/apiKey|x-goog|AQ\./i);
  });

  it('reports provider quota as a readable terminal event, not a broken stream', async () => {
    quotaExhausted = true;
    const response = await post()
      .send({ locale: 'en-US', generation: 4, text: 'Where is admissions?' })
      .expect(200);
    const stream = events(response.text);
    expect(stream.at(-1)!.type).toBe('error');
    expect(stream.at(-1)!.code).toBe('PROVIDER_QUOTA');
    expect(stream.at(-1)!.text).not.toMatch(/429/);
    quotaExhausted = false;
  });

  it('refuses fixture scenarios and keeps the existing request guards in live mode', async () => {
    const body = { locale: 'en-US', generation: 5, text: 'Hello' };
    await post().send({ locale: 'en-US', generation: 5, scenario: 'supported_faq' }).expect(400);
    await post().set('Origin', 'https://evil.example').send(body).expect(403);
    await post().set('Host', 'evil.example').send(body).expect(403);
    await post()
      .send({ ...body, text: 'x'.repeat(17000) })
      .expect(413);
    await request(app.getHttpServer())
      .post('/api/v1/feasibility/turn')
      .set('Host', 'localhost:4320')
      .set('Origin', 'http://localhost:4320')
      .send(body)
      .expect(401);
  });

  it('exposes no voice route in live mode when no providers were supplied', async () => {
    await post(fixtureApp).send({ locale: 'en-US', generation: 6, text: 'Hello' }).expect(404);
  });
});
