import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';
import { KnowledgeService } from '../../packages/domain/src/authoring/knowledge.js';
import { PresentationService } from '../../packages/domain/src/authoring/presentations.js';
import {
  ReleaseService,
  releaseSnapshotHash,
} from '../../packages/domain/src/authoring/releases.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaJobs } from '../../packages/domain/src/media/jobs.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

describe('immutable release assembly on PostgreSQL', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let identity: IdentityService;
  let bots: BotService;
  let knowledge: KnowledgeService;
  let presentations: PresentationService;
  let releases: ReleaseService;
  let media: MediaService;
  let jobs: MediaJobs;
  let root: string;
  beforeAll(async () => {
    staff = await staffFixture();
    identity = new IdentityService(staff.db, staff.pepper);
    bots = new BotService(identity);
    knowledge = new KnowledgeService(identity);
    presentations = new PresentationService(identity);
    releases = new ReleaseService(identity, { providerMode: 'fixture' });
    root = await mkdtemp(join(tmpdir(), 'svara-release-test-'));
    const storage = await MediaStorage.open(root);
    media = new MediaService(identity, staff.db, storage);
    const inspector = new MediaInspector(storage, parseServerConfig(process.env));
    jobs = new MediaJobs(staff.db, storage, inspector.inspect.bind(inspector));
  });
  afterAll(async () => {
    await jobs?.close();
    if (staff) {
      const organisations = await staff.db.organisation.findMany({
        where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
        select: { id: true },
      });
      const organisationId = { in: organisations.map((entry) => entry.id) };
      await staff.db.idempotencyRecord.deleteMany({ where: { organisationId } });
      await staff.db.botRelease.deleteMany({ where: { organisationId } });
      await staff.db.botDraft.updateMany({
        where: { organisationId },
        data: { presentationId: null },
      });
      await staff.db.bot.deleteMany({ where: { organisationId } });
      await staff.db.mediaAsset.deleteMany({ where: { organisationId } });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-release-test-')
      )
        throw new Error('Unsafe release test cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function readyBot() {
    const created = await bots.create(staff.owner.token, { name: 'Campus guide' });
    return bots.save(staff.owner.token, created.id, {
      name: created.name,
      description: 'Synthetic campus',
      expectedRevision: created.revision,
      draft: {
        ...emptyBotDraft(),
        persona: 'Help visitors with the approved campus information.',
        greeting: { en: 'Welcome.', ne: 'स्वागत छ।' },
        fallback: { en: 'Please ask reception.', ne: 'कृपया स्वागत कक्षमा सोध्नुहोस्।' },
      },
    });
  }
  async function entry(botId: string, approved = true) {
    const created = await knowledge.create(staff.owner.token, botId, {
      title: 'Reception 12',
      type: 'FAQ',
    });
    const saved = await knowledge.save(staff.owner.token, created.id, {
      expectedRevision: created.revision,
      title: created.title,
      type: 'FAQ',
      content: { en: 'Admissions reception is in room 12.', ne: 'भर्ना कक्ष कोठा १२ मा छ।' },
      question: { en: 'Where is admissions reception?', ne: 'भर्ना कक्ष कहाँ छ?' },
    });
    return approved
      ? knowledge.approve(staff.owner.token, saved.id, {
          expectedRevision: saved.revision,
          approved: true,
        })
      : saved;
  }
  async function readyMedia() {
    const bytes = await imageFixture();
    const asset = await media.reserve(staff.owner.token, {
      filename: 'Welcome.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
    });
    await media.receive(
      staff.owner.token,
      asset.id,
      Readable.from([bytes]),
      AbortSignal.timeout(2000),
    );
    expect(await jobs.process(asset.id)).toBe('READY');
    return media.get(staff.owner.token, asset.id);
  }
  async function revision(botId: string) {
    return (await bots.get(staff.owner.token, botId)).revision;
  }

  it('reports actionable readiness without writing releases and rejects stale validation', async () => {
    const blank = await bots.create(staff.owner.token, { name: 'Incomplete guide' });
    const readiness = await releases.validate(staff.owner.token, blank.id, {
      expectedRevision: blank.revision,
    });
    expect(readiness).toMatchObject({
      canPreview: false,
      canPublish: false,
      providerMode: 'fixture',
    });
    expect(readiness.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'draft.greeting.en',
        'draft.greeting.ne',
        'draft.fallback.en',
        'draft.fallback.ne',
      ]),
    );
    expect(await staff.db.botRelease.count({ where: { botId: blank.id } })).toBe(0);
    await expect(
      releases.publish(
        staff.owner.token,
        blank.id,
        { expectedRevision: blank.revision },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RELEASE_NOT_READY' });
    const bot = await readyBot();
    const draft = await entry(bot.id, false);
    const checked = await releases.validate(staff.owner.token, bot.id, {
      expectedRevision: draft.botRevision,
    });
    expect(checked).toMatchObject({ canPreview: true, canPublish: false });
    expect(checked.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNAPPROVED_KNOWLEDGE',
          path: `knowledge.${draft.id}.status`,
          blocks: 'PUBLISH',
        }),
      ]),
    );
    await expect(
      releases.validate(staff.owner.token, bot.id, { expectedRevision: bot.revision }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(
      releases.publish(staff.owner.token, bot.id, {}, randomUUID()),
    ).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED' });
  });

  it('publishes one consistent version under duplicate retries and freezes draft content and media', async () => {
    const bot = await readyBot();
    const approved = await entry(bot.id);
    const excluded = await entry(bot.id, false);
    await knowledge.select(staff.owner.token, excluded.id, {
      expectedRevision: excluded.revision,
      selected: false,
    });
    const asset = await readyMedia();
    const deck = await presentations.create(staff.owner.token, { botId: bot.id, name: 'Welcome' });
    const savedDeck = await presentations.createSlide(staff.owner.token, deck.id, {
      expectedRevision: deck.revision,
      title: { en: 'Welcome', ne: 'स्वागत छ' },
      body: { en: '', ne: '' },
      mediaId: asset.id,
    });
    const expectedRevision = await revision(bot.id);
    const key = randomUUID();
    const [first, replay] = await Promise.all([
      releases.publish(staff.owner.token, bot.id, { expectedRevision }, key),
      releases.publish(staff.owner.token, bot.id, { expectedRevision }, key),
    ]);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      kind: 'PUBLISHED',
      version: 1,
      botRevision: expectedRevision,
      previewExpiresAt: null,
    });
    expect(first.snapshotHash).toBe(releaseSnapshotHash(first.snapshot));
    expect(first.snapshot.knowledge.map((row) => row.id)).toEqual([approved.id]);
    expect(first.snapshot.media).toMatchObject([
      { id: asset.id, sha256: asset.sha256, byteLength: asset.byteLength },
    ]);
    expect(JSON.stringify(first)).not.toContain('storageKey');
    await knowledge.remove(staff.owner.token, approved.id, { expectedRevision: approved.revision });
    await presentations.remove(staff.owner.token, savedDeck.id, {
      expectedRevision: savedDeck.revision,
    });
    expect(await releases.get(staff.owner.token, first.id)).toEqual(first);
    expect(await releases.publish(staff.owner.token, bot.id, { expectedRevision }, key)).toEqual(
      first,
    );
    await expect(
      media.remove(staff.owner.token, asset.id, { expectedRevision: asset.revision }),
    ).rejects.toMatchObject({ code: 'MEDIA_IN_USE' });
    await expect(
      staff.db.mediaAsset.update({ where: { id: asset.id }, data: { state: 'DELETING' } }),
    ).rejects.toThrow();
    await expect(
      staff.db.mediaAsset.update({ where: { id: asset.id }, data: { sha256: 'b'.repeat(64) } }),
    ).rejects.toThrow();
    expect(await staff.db.botRelease.count({ where: { botId: bot.id } })).toBe(1);
    expect(await staff.db.releaseKnowledge.count({ where: { releaseId: first.id } })).toBe(2);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: first.id, action: 'release.published' },
      }),
    ).toBe(1);
    const record = await staff.db.idempotencyRecord.findFirstOrThrow({
      where: { releaseId: first.id },
    });
    expect(JSON.stringify(record)).not.toContain(key);
    await expect(
      releases.publish(
        staff.owner.token,
        bot.id,
        { expectedRevision: await revision(bot.id) },
        key,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('allocates distinct monotonic published versions without promoting previews', async () => {
    const bot = await readyBot();
    const draft = await entry(bot.id, false);
    let now = Date.now();
    const clocked = new ReleaseService(identity, {
      providerMode: 'fixture',
      clock: () => new Date(now),
    });
    const key = randomUUID();
    const preview = await clocked.preview(
      staff.owner.token,
      bot.id,
      { expectedRevision: draft.botRevision },
      key,
    );
    expect(preview).toMatchObject({ kind: 'PREVIEW', version: null });
    expect(preview.snapshot.knowledge[0]?.status).toBe('DRAFT');
    expect(Date.parse(preview.previewExpiresAt!) - Date.parse(preview.createdAt)).toBe(
      30 * 60 * 1000,
    );
    now += 31 * 60 * 1000;
    await expect(
      clocked.search(staff.owner.token, preview.id, { locale: 'en', query: 'reception' }),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
    expect(await clocked.get(staff.owner.token, preview.id)).toEqual(preview);
    expect(
      await clocked.preview(
        staff.owner.token,
        bot.id,
        { expectedRevision: draft.botRevision },
        key,
      ),
    ).toEqual(preview);
    await knowledge.approve(staff.owner.token, draft.id, {
      expectedRevision: draft.revision,
      approved: true,
    });
    const expectedRevision = await revision(bot.id);
    const versions = await Promise.all(
      Array.from({ length: 3 }, () =>
        releases.publish(staff.owner.token, bot.id, { expectedRevision }, randomUUID()),
      ),
    );
    expect(versions.map((release) => release.version).sort()).toEqual([1, 2, 3]);
    expect(new Set(versions.map((release) => release.snapshotHash)).size).toBe(1);
    expect(versions.every((release) => release.id !== preview.id)).toBe(true);
    const page = await releases.list(staff.owner.token, bot.id, { kind: 'PUBLISHED', pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items.map((release) => release.version)).toEqual([3, 2]);
  });

  it('rejects direct snapshot and search projection mutations and cross-tenant associations', async () => {
    const bot = await readyBot();
    await entry(bot.id);
    const released = await releases.publish(
      staff.owner.token,
      bot.id,
      { expectedRevision: await revision(bot.id) },
      randomUUID(),
    );
    await expect(
      staff.db.botRelease.update({ where: { id: released.id }, data: { version: 7 } }),
    ).rejects.toThrow();
    await expect(
      staff.db.botRelease.update({ where: { id: released.id }, data: { snapshot: {} } }),
    ).rejects.toThrow();
    await expect(
      staff.db.releaseKnowledge.updateMany({
        where: { releaseId: released.id },
        data: { content: 'Changed after publication' },
      }),
    ).rejects.toThrow();
    await expect(
      staff.db.releaseKnowledge.deleteMany({ where: { releaseId: released.id } }),
    ).rejects.toThrow();
    await expect(staff.db.bot.delete({ where: { id: bot.id } })).rejects.toThrow();
    const foreign = await identity.register({
      email: `foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign owner',
      organisationName: 'Other workspace',
    });
    for (const action of [
      () => releases.get(foreign.token, released.id),
      () => releases.list(foreign.token, bot.id, {}),
      () => releases.search(foreign.token, released.id, { locale: 'en', query: 'reception' }),
      () =>
        releases.publish(
          foreign.token,
          bot.id,
          { expectedRevision: released.botRevision },
          randomUUID(),
        ),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    const projection = await staff.db.releaseKnowledge.findFirstOrThrow({
      where: { releaseId: released.id },
    });
    await expect(
      staff.db.releaseKnowledge.create({
        data: {
          ...projection,
          organisationId: foreign.identity.organisation.id,
          entryId: randomUUID(),
        },
      }),
    ).rejects.toThrow();
    expect(await releases.get(staff.owner.token, released.id)).toEqual(released);
  });

  it('restricts release writes to authors and preserves archived historical snapshots', async () => {
    const bot = await readyBot();
    const release = await releases.publish(
      staff.owner.token,
      bot.id,
      { expectedRevision: bot.revision },
      randomUUID(),
    );
    const viewerEmail = `viewer-${staff.suffix}`;
    const invited = await identity.invite(staff.owner.token, {
      email: viewerEmail,
      role: 'VIEWER',
    });
    await identity.activate({
      token: invited.token,
      password: staff.password,
      displayName: 'Release viewer',
    });
    const viewer = await identity.login({ email: viewerEmail, password: staff.password });
    expect(await releases.get(viewer.token, release.id)).toEqual(release);
    await expect(
      releases.publish(viewer.token, bot.id, { expectedRevision: bot.revision }, randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      releases.preview(viewer.token, bot.id, { expectedRevision: bot.revision }, randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const current = await bots.get(staff.owner.token, bot.id);
    await bots.archive(staff.owner.token, bot.id, {
      expectedRevision: current.revision,
      archived: true,
    });
    expect(await releases.get(staff.owner.token, release.id)).toEqual(release);
    await expect(
      releases.publish(
        staff.owner.token,
        bot.id,
        { expectedRevision: await revision(bot.id) },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    await identity.logout(viewer.token);
    await expect(releases.get(viewer.token, release.id)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('searches only pinned bilingual projections with stable references and bounded passages', async () => {
    const bot = await readyBot();
    const approved = await entry(bot.id);
    const release = await releases.publish(
      staff.owner.token,
      bot.id,
      { expectedRevision: await revision(bot.id) },
      randomUUID(),
    );
    for (const [locale, query] of [
      ['en', 'Where is admissions reception?'],
      ['ne', '  भर्ना\u00a0कक्ष कहाँ छ?  '],
    ] as const) {
      const result = await releases.search(staff.owner.token, release.id, { locale, query });
      expect(result).toMatchObject({
        releaseId: release.id,
        snapshotHash: release.snapshotHash,
        locale,
      });
      expect(result.passages[0]?.entryId).toBe(approved.id);
      expect(result.passages[0]?.text).toContain(locale === 'en' ? 'room 12' : 'कोठा १२');
    }
    expect(
      (
        await releases.search(staff.owner.token, release.id, {
          locale: 'ne',
          query: 'सगरमाथाको उचाइ',
        })
      ).passages,
    ).toEqual([]);
    await knowledge.remove(staff.owner.token, approved.id, { expectedRevision: approved.revision });
    expect(
      (await releases.search(staff.owner.token, release.id, { locale: 'en', query: 'admissions' }))
        .passages[0]?.entryId,
    ).toBe(approved.id);
    const large = await readyBot();
    for (let index = 0; index < 6; index++) {
      const created = await knowledge.create(staff.owner.token, large.id, {
        title: `Campus ${index}`,
        type: 'NOTE',
      });
      const saved = await knowledge.save(staff.owner.token, created.id, {
        expectedRevision: created.revision,
        type: 'NOTE',
        title: created.title,
        question: { en: '', ne: '' },
        content: { en: 'Campus welcome. '.repeat(450), ne: 'क्याम्पसमा स्वागत छ। '.repeat(300) },
      });
      await knowledge.approve(staff.owner.token, saved.id, {
        expectedRevision: saved.revision,
        approved: true,
      });
    }
    const larger = await releases.publish(
      staff.owner.token,
      large.id,
      { expectedRevision: await revision(large.id) },
      randomUUID(),
    );
    const result = await releases.search(staff.owner.token, larger.id, {
      locale: 'en',
      query: 'Campus',
    });
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages.length).toBeLessThanOrEqual(5);
    expect(
      result.passages.reduce(
        (sum, passage) =>
          sum + Array.from([passage.title, passage.question, passage.text].join('\n')).length,
        0,
      ),
    ).toBeLessThanOrEqual(6000);
    expect(result.passages.some((passage) => passage.truncated)).toBe(true);
  });
});
