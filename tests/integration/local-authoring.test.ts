import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyBotDraft } from '../../packages/contracts/src/authoring.js';
import { releaseDetailSchema } from '../../packages/contracts/src/releases.js';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { seedLocalAuthoring } from '../../packages/domain/src/local/authoring.js';
import type { LocalAuthoringBundle } from '../../packages/domain/src/local/authoring.js';
import { ReleaseService } from '../../packages/domain/src/authoring/releases.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

describe('additive local authoring seed', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let storage: MediaStorage;
  let inspector: MediaInspector;
  let root: string;
  beforeAll(async () => {
    staff = await staffFixture();
    root = await mkdtemp(join(tmpdir(), 'svara-local-authoring-test-'));
    storage = await MediaStorage.open(root);
    inspector = new MediaInspector(storage, parseServerConfig(process.env));
  });
  afterAll(async () => {
    if (staff) {
      const organisations = await staff.db.organisation.findMany({
        where: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
        select: { id: true },
      });
      const where = { organisationId: { in: organisations.map((value) => value.id) } };
      await staff.db.applicationMetadata.deleteMany({
        where: { id: { in: organisations.map((value) => `local-authoring:v1:${value.id}`) } },
      });
      await staff.db.idempotencyRecord.deleteMany({ where });
      await staff.db.botRelease.deleteMany({ where });
      await staff.db.botDraft.updateMany({ where, data: { presentationId: null } });
      await staff.db.bot.deleteMany({ where });
      await staff.db.mediaAsset.deleteMany({ where });
      await staff.close();
    }
    if (root) {
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !basename(root).startsWith('svara-local-authoring-test-')
      )
        throw new Error('Unsafe fixture cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function fixture(): Promise<LocalAuthoringBundle> {
    const owner = await staff.service.register({
      email: `seed-${randomUUID()}-${staff.suffix}`,
      password: staff.password,
      displayName: 'Fixture Owner',
      organisationName: 'Synthetic authoring campus',
    });
    const config = {
      ...emptyBotDraft(),
      persona: 'Use only the synthetic campus content.',
      greeting: { en: 'Welcome to the demo.', ne: 'नमुना क्याम्पसमा स्वागत छ।' },
      fallback: { en: 'Ask the demo reception.', ne: 'नमुना स्वागत कक्षमा सोध्नुहोस्।' },
    };
    return {
      organisationId: owner.identity.organisation.id,
      actorUserId: owner.identity.user.id,
      media: [
        {
          key: 'map',
          filename: 'Synthetic map.png',
          mimeType: 'image/png',
          bytes: await imageFixture(),
        },
      ],
      bots: [
        {
          id: randomUUID(),
          name: 'Synthetic guide',
          description: 'Fictional demonstration content.',
          config,
          knowledge: [
            {
              title: 'Reception',
              type: 'FAQ',
              question: { en: 'Where is reception?', ne: 'स्वागत कक्ष कहाँ छ?' },
              content: {
                en: 'Demo reception is in room 12.',
                ne: 'नमुना स्वागत कक्ष कोठा १२ मा छ।',
              },
              approved: true,
              selected: true,
            },
          ],
          presentations: [
            {
              name: 'Welcome',
              selected: true,
              slides: [
                {
                  title: { en: 'Demo campus', ne: 'नमुना क्याम्पस' },
                  body: { en: 'Reception 12.', ne: 'स्वागत कक्ष १२।' },
                  mediaKey: 'map',
                  target: 'BOTH',
                  durationSeconds: 12,
                },
              ],
            },
          ],
          publish: true,
          afterPublishDraft: { ...config, greeting: { en: config.greeting.en, ne: '' } },
        },
      ],
    };
  }
  const run = (bundle: LocalAuthoringBundle) =>
    seedLocalAuthoring(staff.db, bundle, storage, inspector.inspect.bind(inspector));

  it('inspects real media and publishes a complete immutable example before creating an incomplete draft', async () => {
    const bundle = await fixture();
    expect(await run(bundle)).toBe(true);
    const bot = await staff.db.bot.findUniqueOrThrow({
      where: { id: bundle.bots[0]!.id },
      include: { draft: true, knowledge: true, releases: true },
    });
    expect(bot.revision).toBe(2);
    expect(bot.draft?.config).toMatchObject({ greeting: { ne: '' } });
    expect(bot.knowledge[0]?.approvedByMembershipId).toBeTruthy();
    expect(bot.releases).toHaveLength(1);
    const owner = await staff.service.login({
      email: (await staff.db.user.findUniqueOrThrow({ where: { id: bundle.actorUserId } })).email,
      password: staff.password,
    });
    const releases = new ReleaseService(staff.service, { providerMode: 'fixture' });
    const saved = releaseDetailSchema.parse(await releases.get(owner.token, bot.releases[0]!.id));
    expect(saved.snapshot.bot.config.greeting.ne).not.toBe('');
    expect(saved).toMatchObject({
      kind: 'PUBLISHED',
      version: 1,
      botRevision: 1,
      providerMode: 'fixture',
    });
    const result = await releases.search(owner.token, saved.id, {
      locale: 'ne',
      query: 'स्वागत कक्ष कहाँ छ?',
    });
    expect(result.passages[0]?.text).toContain('१२');
    const media = await staff.db.mediaAsset.findFirstOrThrow({
      where: { organisationId: bundle.organisationId },
    });
    expect(media).toMatchObject({ state: 'READY', width: 32, height: 24 });
    expect(await storage.checksum(media.storageKey!)).toEqual({
      sha256: media.sha256,
      byteLength: media.byteLength,
    });
    expect(
      await staff.db.staffSession.count({ where: { organisationId: bundle.organisationId } }),
    ).toBe(2); // Only register/login; seeding mints no credential.
    expect(
      await staff.db.auditEntry.findFirst({
        where: { organisationId: bundle.organisationId, action: 'authoring.seeded.local' },
      }),
    ).toMatchObject({ actorKind: 'LOCAL', actorMembershipId: null });
  });

  it('reruns preserve edits, archived guides, deleted children and changed owner access', async () => {
    const bundle = await fixture();
    await run(bundle);
    const id = bundle.bots[0]!.id;
    await staff.db.knowledgeEntry.deleteMany({ where: { botId: id } });
    await staff.db.bot.update({
      where: { id },
      data: { name: 'My edited guide', archivedAt: new Date(), revision: 3 },
    });
    await staff.db.user.update({
      where: { id: bundle.actorUserId },
      data: { disabled: true, passwordHash: 'preserved password hash' },
    });
    const files = await readdir(root);
    expect(await run(bundle)).toBe(false);
    expect(await staff.db.bot.findUnique({ where: { id } })).toMatchObject({
      name: 'My edited guide',
      revision: 3,
    });
    expect(await staff.db.knowledgeEntry.count({ where: { botId: id } })).toBe(0);
    expect(await staff.db.botRelease.count({ where: { botId: id } })).toBe(1);
    expect(await readdir(root)).toEqual(files);
    expect(await staff.db.user.findUnique({ where: { id: bundle.actorUserId } })).toMatchObject({
      disabled: true,
      passwordHash: 'preserved password hash',
    });
  });

  it('refuses a preexisting guide ID and cannot seed as an unrelated or disabled author', async () => {
    const bundle = await fixture();
    const id = bundle.bots[0]!.id;
    await staff.db.bot.create({
      data: {
        id,
        organisationId: staff.owner.identity.organisation.id,
        name: 'Unrelated existing guide',
      },
    });
    await expect(run(bundle)).rejects.toThrow('existing');
    expect(await staff.db.bot.count({ where: { organisationId: bundle.organisationId } })).toBe(0);
    bundle.bots[0]!.id = randomUUID();
    bundle.actorUserId = staff.owner.identity.user.id;
    await expect(run(bundle)).rejects.toThrow('author');
    expect(
      await staff.db.mediaAsset.count({ where: { organisationId: bundle.organisationId } }),
    ).toBe(0);
  });

  it('serializes concurrent seeds and commits one complete bundle', async () => {
    const bundle = await fixture();
    expect((await Promise.all([run(bundle), run(bundle)])).sort()).toEqual([false, true]);
    expect(await staff.db.bot.count({ where: { organisationId: bundle.organisationId } })).toBe(1);
    expect(
      await staff.db.mediaAsset.count({ where: { organisationId: bundle.organisationId } }),
    ).toBe(1);
    expect(
      await staff.db.botRelease.count({ where: { organisationId: bundle.organisationId } }),
    ).toBe(1);
  });

  it('rolls back a corrupt media result and can retry without adopting partial state', async () => {
    const bundle = await fixture();
    const files = await readdir(root);
    await expect(
      seedLocalAuthoring(staff.db, bundle, storage, async (claim, signal) => ({
        ...(await inspector.inspect(claim, signal)),
        sha256: '0'.repeat(64),
      })),
    ).rejects.toMatchObject({ code: 'INTEGRITY_MISMATCH' });
    expect(await staff.db.bot.count({ where: { organisationId: bundle.organisationId } })).toBe(0);
    expect(
      await staff.db.applicationMetadata.findUnique({
        where: { id: `local-authoring:v1:${bundle.organisationId}` },
      }),
    ).toBeNull();
    expect(await readdir(root)).toEqual(files);
    expect(await run(bundle)).toBe(true);
  });
});
