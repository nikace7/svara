import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApplication } from '../../apps/api/dist/app.js';
import { FeasibilityEventSchema } from '../../packages/contracts/dist/index.js';
import type { FeasibilityEvent } from '../../packages/contracts/dist/index.js';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { BotService, KnowledgeService, ReleaseService } from '../../packages/domain/dist/index.js';
import { GeminiError } from '../../packages/providers/dist/index.js';
import { staffFixture } from './staff-fixture.js';

/** Stub providers: this suite proves the live HTTP path, not provider behaviour.
 * The real providers are exercised by `pnpm eval:gemini`. */
const answer = ['भर्ना कार्यालय कोठा A-101 मा छ। ', 'यो १० बजे खुल्छ।'];
let quotaExhausted = false;
let spoken = 0;
let grounded: readonly { id: string; text: string }[] = [];
const liveVoice = {
  generator: {
    async *generate(input: { passages: readonly { id: string; text: string }[] }) {
      grounded = input.passages;
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
};

describe('live voice HTTP stream', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  let fixtureApp: Awaited<ReturnType<typeof createApplication>>;
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let releases: ReleaseService;
  let release: { id: string };
  let entryId: string;
  let now = Date.now();
  /** A preview captures draft knowledge, so no approval step is needed to search it. */
  async function groundedRelease() {
    const bots = new BotService(staff.service);
    const knowledge = new KnowledgeService(staff.service);
    const token = staff.owner.token;
    const bot = await bots.create(token, { name: 'Live campus guide' });
    const ready = await bots.save(token, bot.id, {
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
    const created = await knowledge.create(token, ready.id, { title: 'Admissions', type: 'FAQ' });
    const saved = await knowledge.save(token, created.id, {
      expectedRevision: created.revision,
      title: created.title,
      type: 'FAQ',
      question: { en: 'Where is the admissions office?', ne: 'भर्ना कार्यालय कहाँ छ?' },
      content: { en: 'Admissions is in room 12.', ne: 'भर्ना कार्यालय कोठा १२ मा छ।' },
    });
    const preview = await releases.preview(
      token,
      ready.id,
      { expectedRevision: saved.botRevision },
      randomUUID(),
    );
    return { release: preview, entryId: saved.id };
  }
  beforeAll(async () => {
    staff = await staffFixture();
    releases = new ReleaseService(staff.service, {
      providerMode: 'live',
      clock: () => new Date(now),
    });
    const base = {
      localDocs: true,
      feasibilityOrigin: 'http://localhost:4320',
      identity: staff.options,
      probe: async () => ({ status: 'ready' as const, dependencies: {} }),
    };
    app = await createApplication({ ...base, providerMode: 'live', liveVoice, releases });
    // Voice providers alone are not enough: live answers need a release to ground them.
    fixtureApp = await createApplication({ ...base, providerMode: 'live', liveVoice });
    await Promise.all([app.init(), fixtureApp.init()]);
    ({ release, entryId } = await groundedRelease());
  });
  afterAll(async () => {
    await Promise.all([app?.close(), fixtureApp?.close()]);
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
      .send({
        locale: 'ne-NP',
        generation: 3,
        text: 'भर्ना कार्यालय कहाँ छ?',
        releaseId: release.id,
      })
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
    // The generator saw the chosen release's own Nepali passage, not built-in demo text.
    expect(grounded.map((passage) => passage.id)).toEqual([entryId]);
    expect(grounded[0]!.text).toContain('भर्ना कार्यालय कोठा १२ मा छ।');

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
      .send({ locale: 'en-US', generation: 4, text: 'Where is admissions?', releaseId: release.id })
      .expect(200);
    const stream = events(response.text);
    expect(stream.at(-1)!.type).toBe('error');
    expect(stream.at(-1)!.code).toBe('PROVIDER_QUOTA');
    expect(stream.at(-1)!.text).not.toMatch(/429/);
    quotaExhausted = false;
  });

  it('refuses fixture scenarios and keeps the existing request guards in live mode', async () => {
    const body = { locale: 'en-US', generation: 5, text: 'Hello', releaseId: release.id };
    await post().send({ locale: 'en-US', generation: 5, scenario: 'supported_faq' }).expect(400);
    await post().send({ locale: 'en-US', generation: 5, text: 'Hello' }).expect(400);
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

  it("grounds only in an unexpired release from the caller's own workspace", async () => {
    const body = { locale: 'en-US', generation: 7, text: 'Where is the admissions office?' };
    const unknown = await post()
      .send({ ...body, releaseId: randomUUID() })
      .expect(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    const foreign = await staff.service.register({
      email: `live-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Other owner',
      organisationName: 'Other campus',
    });
    await request(app.getHttpServer())
      .post('/api/v1/feasibility/turn')
      .set('Host', 'localhost:4320')
      .set('Origin', 'http://localhost:4320')
      .set('Cookie', `svara-session=${foreign.token}`)
      .set('X-CSRF-Token', foreign.csrfToken)
      .send({ ...body, releaseId: release.id })
      .expect(404);
    const started = now;
    now += 31 * 60 * 1000;
    try {
      const expired = await post()
        .send({ ...body, releaseId: release.id })
        .expect(410);
      expect(expired.body.error.code).toBe('PREVIEW_EXPIRED');
    } finally {
      now = started;
    }
  });

  it('exposes no voice route in live mode without providers and a release service', async () => {
    await post(fixtureApp)
      .send({ locale: 'en-US', generation: 6, text: 'Hello', releaseId: release.id })
      .expect(404);
  });
});
