import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseServerConfig } from '../../packages/config/src/server.js';
import { PRESENTATION_LIMITS } from '../../packages/contracts/src/presentations.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';
import { PresentationService } from '../../packages/domain/src/authoring/presentations.js';
import { MediaService } from '../../packages/domain/src/media/service.js';
import { MediaStorage } from '../../packages/domain/src/media/storage.js';
import { MediaJobs } from '../../packages/domain/src/media/jobs.js';
import { MediaInspector } from '../../apps/worker/src/media/inspector.js';
import { imageFixture } from '../../apps/worker/test/media-fixtures.js';
import { staffFixture } from './staff-fixture.js';

const text = {
  title: { en: 'Welcome', ne: 'स्वागत छ' },
  body: { en: 'Please visit reception.', ne: 'कृपया स्वागत कक्षमा जानुहोस्।' },
  target: 'SECONDARY',
  durationSeconds: 12,
  mediaId: null,
};
describe('scoped presentation authoring on PostgreSQL', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let identity: IdentityService;
  let bots: BotService;
  let presentations: PresentationService;
  let media: MediaService;
  let jobs: MediaJobs;
  let root: string;
  beforeAll(async () => {
    staff = await staffFixture();
    identity = new IdentityService(staff.db, staff.pepper);
    bots = new BotService(identity);
    presentations = new PresentationService(identity);
    root = await mkdtemp(join(tmpdir(), 'svara-presentation-test-'));
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
        !basename(root).startsWith('svara-presentation-test-')
      )
        throw new Error('Unsafe presentation test cleanup target.');
      await rm(root, { recursive: true, force: true });
    }
  });
  async function create() {
    const bot = await bots.create(staff.owner.token, { name: 'Presentation guide' });
    const presentation = await presentations.create(staff.owner.token, {
      botId: bot.id,
      name: 'Welcome',
    });
    return { bot, presentation };
  }
  async function ready() {
    const bytes = await imageFixture();
    const entry = await media.reserve(staff.owner.token, {
      filename: 'Campus.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
    });
    await media.receive(
      staff.owner.token,
      entry.id,
      Readable.from([bytes]),
      AbortSignal.timeout(2000),
    );
    expect(await jobs.process(entry.id)).toBe('READY');
    return media.get(staff.owner.token, entry.id);
  }
  it('creates and selects presentations, preserves scoped selection and advances bot revisions', async () => {
    const { bot, presentation } = await create();
    expect(presentation).toMatchObject({ selected: true, revision: 1, botRevision: 2, slides: [] });
    const second = await presentations.create(staff.owner.token, {
      botId: bot.id,
      name: 'Office hours',
    });
    expect(second.selected).toBe(false);
    const list = await presentations.list(staff.owner.token, bot.id);
    expect(list).toMatchObject({ botRevision: 3, selectedPresentationId: presentation.id });
    expect(list.items).toHaveLength(2);
    await expect(
      presentations.select(staff.owner.token, bot.id, {
        presentationId: second.id,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 3 });
    expect(
      await presentations.select(staff.owner.token, bot.id, {
        presentationId: second.id,
        expectedRevision: 3,
      }),
    ).toEqual({ presentationId: second.id, botRevision: 4 });
    const saved = await presentations.save(staff.owner.token, second.id, {
      name: 'New office hours',
      expectedRevision: 1,
    });
    expect(saved).toMatchObject({
      name: 'New office hours',
      revision: 2,
      botRevision: 5,
      selected: true,
    });
    await expect(
      presentations.save(staff.owner.token, second.id, { name: 'Missing revision' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_REQUIRED' });
    await presentations.remove(staff.owner.token, second.id, { expectedRevision: 2 });
    expect(await presentations.list(staff.owner.token, bot.id)).toMatchObject({
      selectedPresentationId: null,
      botRevision: 6,
    });
    expect((await presentations.get(staff.owner.token, presentation.id)).selected).toBe(false);
  });
  it('saves bilingual slides and compacts ordering after revision-checked removal', async () => {
    const { presentation } = await create();
    const first = await presentations.createSlide(staff.owner.token, presentation.id, {
      expectedRevision: 1,
    });
    const id = first.slides[0]!.id;
    expect(first.slides[0]).toMatchObject({
      position: 0,
      revision: 1,
      complete: { en: false, ne: false },
    });
    const saved = await presentations.saveSlide(staff.owner.token, id, {
      ...text,
      expectedRevision: 1,
    });
    expect(saved).toMatchObject({ revision: 3, botRevision: 4 });
    expect(saved.slides[0]).toMatchObject({
      ...text,
      revision: 2,
      complete: { en: true, ne: true },
    });
    await expect(
      presentations.saveSlide(staff.owner.token, id, { ...text, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
    const added = await presentations.createSlide(staff.owner.token, presentation.id, {
      ...text,
      expectedRevision: 3,
    });
    const removed = await presentations.removeSlide(staff.owner.token, id, { expectedRevision: 2 });
    expect(removed).toMatchObject({ revision: 5, botRevision: 6 });
    expect(removed.slides).toHaveLength(1);
    expect(removed.slides[0]).toMatchObject({ id: added.slides[1]!.id, position: 0, revision: 2 });
    await expect(
      presentations.saveSlide(staff.owner.token, id, { ...text, expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('reorders the complete set atomically and permits only one stale concurrent writer', async () => {
    const { presentation } = await create();
    let current = presentation;
    for (let i = 0; i < 3; i++)
      current = await presentations.createSlide(staff.owner.token, presentation.id, {
        ...text,
        expectedRevision: current.revision,
      });
    const ids = current.slides.map((slide) => slide.id);
    for (const slideIds of [ids.slice(1), [ids[0]!, ids[1]!, randomUUID()]]) {
      await expect(
        presentations.reorder(staff.owner.token, presentation.id, {
          slideIds,
          expectedRevision: current.revision,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SLIDE_ORDER' });
    }
    await expect(
      presentations.reorder(staff.owner.token, presentation.id, {
        slideIds: [ids[0], ids[0]],
        expectedRevision: current.revision,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const before = (await bots.get(staff.owner.token, presentation.botId)).revision;
    const results = await Promise.allSettled(
      [[...ids].reverse(), [ids[1]!, ids[2]!, ids[0]!]].map((slideIds) =>
        presentations.reorder(staff.owner.token, presentation.id, {
          slideIds,
          expectedRevision: current.revision,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'REVISION_CONFLICT' },
    });
    const final = await presentations.get(staff.owner.token, presentation.id);
    expect(final.slides.map((slide) => slide.position)).toEqual([0, 1, 2]);
    expect(new Set(final.slides.map((slide) => slide.id))).toEqual(new Set(ids));
    expect(final.botRevision).toBe(before + 1);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: presentation.id, action: 'presentation.reordered' },
      }),
    ).toBe(1);
  });
  it('enforces tenant relationships and readonly roles at the service and database boundaries', async () => {
    const { bot, presentation } = await create();
    const otherBot = await create();
    const other = await identity.register({
      email: `other-${staff.suffix}`,
      displayName: 'Other',
      organisationName: 'Other campus',
      password: staff.password,
    });
    await expect(presentations.get(other.token, presentation.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(presentations.list(other.token, bot.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      presentations.create(other.token, { botId: bot.id, name: 'Foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      presentations.select(staff.owner.token, bot.id, {
        presentationId: otherBot.presentation.id,
        expectedRevision: presentation.botRevision,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      staff.db.botDraft.update({
        where: { botId: bot.id },
        data: { presentationId: otherBot.presentation.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      staff.db.presentation.create({
        data: { botId: bot.id, organisationId: other.identity.organisation.id, name: 'Injected' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const slide = (
      await presentations.createSlide(staff.owner.token, presentation.id, { expectedRevision: 1 })
    ).slides[0]!;
    await expect(
      presentations.saveSlide(other.token, slide.id, { ...text, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      staff.db.slide.create({
        data: {
          presentationId: presentation.id,
          organisationId: other.identity.organisation.id,
          position: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const invitation = await identity.invite(staff.owner.token, {
      email: `viewer-${staff.suffix}`,
      role: 'VIEWER',
    });
    await identity.activate({
      token: invitation.token,
      displayName: 'Viewer',
      password: staff.password,
    });
    const viewer = await identity.login({
      email: `viewer-${staff.suffix}`,
      password: staff.password,
    });
    expect((await presentations.get(viewer.token, presentation.id)).slides).toHaveLength(1);
    const mutations = [
      () => presentations.create(viewer.token, { botId: bot.id, name: 'Denied' }),
      () =>
        presentations.save(viewer.token, presentation.id, { name: 'Denied', expectedRevision: 2 }),
      () => presentations.remove(viewer.token, presentation.id, { expectedRevision: 2 }),
      () =>
        presentations.select(viewer.token, bot.id, { presentationId: null, expectedRevision: 3 }),
      () => presentations.createSlide(viewer.token, presentation.id, { expectedRevision: 2 }),
      () => presentations.saveSlide(viewer.token, slide.id, { ...text, expectedRevision: 1 }),
      () => presentations.removeSlide(viewer.token, slide.id, { expectedRevision: 1 }),
      () =>
        presentations.reorder(viewer.token, presentation.id, {
          slideIds: [slide.id],
          expectedRevision: 2,
        }),
    ];
    for (const mutation of mutations)
      await expect(mutation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await identity.logout(viewer.token);
    await expect(presentations.get(viewer.token, presentation.id)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
  it('protects READY media references from state changes and file cleanup until detached', async () => {
    const { presentation } = await create();
    const asset = await ready();
    const attached = await presentations.createSlide(staff.owner.token, presentation.id, {
      ...text,
      mediaId: asset.id,
      expectedRevision: 1,
    });
    expect(attached.slides[0]!.media).toMatchObject({ id: asset.id, state: 'READY', width: 30 });
    await expect(
      media.remove(staff.owner.token, asset.id, { expectedRevision: asset.revision }),
    ).rejects.toMatchObject({ code: 'MEDIA_IN_USE' });
    await expect(
      staff.db.mediaAsset.update({ where: { id: asset.id }, data: { state: 'DELETING' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await jobs.sweep();
    const file = await media.file(staff.owner.token, asset.id, false);
    await file.handle.close();
    const pending = await media.reserve(staff.owner.token, {
      filename: 'Pending.png',
      mimeType: 'image/png',
      byteLength: 20,
    });
    await expect(
      presentations.saveSlide(staff.owner.token, attached.slides[0]!.id, {
        ...text,
        mediaId: pending.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_NOT_READY' });
    await expect(
      staff.db.slide.update({
        where: { id: attached.slides[0]!.id },
        data: { mediaId: pending.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await presentations.removeSlide(staff.owner.token, attached.slides[0]!.id, {
      expectedRevision: 1,
    });
    await media.remove(staff.owner.token, asset.id, { expectedRevision: asset.revision });
    await jobs.sweep();
    await expect(media.get(staff.owner.token, asset.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('cannot race attachment against deletion into a broken media reference', async () => {
    const { presentation } = await create();
    const asset = await ready();
    const results = await Promise.allSettled([
      presentations.createSlide(staff.owner.token, presentation.id, {
        ...text,
        mediaId: asset.id,
        expectedRevision: 1,
      }),
      media.remove(staff.owner.token, asset.id, { expectedRevision: asset.revision }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toBeDefined();
    if (rejected?.status === 'rejected')
      expect(['MEDIA_IN_USE', 'MEDIA_NOT_READY']).toContain(rejected.reason.code);
    await jobs.sweep();
    const current = await presentations.get(staff.owner.token, presentation.id);
    if (current.slides.length) {
      const file = await media.file(staff.owner.token, asset.id, false);
      await file.handle.close();
    } else
      await expect(media.get(staff.owner.token, asset.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
  });
  it('rejects archived parents, invalid duration and full presentation limits', async () => {
    const { bot, presentation } = await create();
    const organisationId = staff.owner.identity.organisation.id;
    await staff.db.slide.createMany({
      data: Array.from({ length: PRESENTATION_LIMITS.slides }, (_, position) => ({
        presentationId: presentation.id,
        organisationId,
        position,
      })),
    });
    await expect(
      presentations.createSlide(staff.owner.token, presentation.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'SLIDE_LIMIT' });
    await expect(
      staff.db.slide.updateMany({
        where: { presentationId: presentation.id },
        data: { durationSeconds: 0 },
      }),
    ).rejects.toThrow();
    await staff.db.presentation.createMany({
      data: Array.from({ length: PRESENTATION_LIMITS.perBot - 1 }, (_, index) => ({
        botId: bot.id,
        organisationId,
        name: `Deck ${index}`,
      })),
    });
    await expect(
      presentations.create(staff.owner.token, { botId: bot.id, name: 'Too many' }),
    ).rejects.toMatchObject({ code: 'PRESENTATION_LIMIT' });
    await bots.archive(staff.owner.token, bot.id, { archived: true, expectedRevision: 2 });
    await expect(
      presentations.save(staff.owner.token, presentation.id, {
        name: 'Archived',
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    expect(
      (await presentations.get(staff.owner.token, presentation.id)).botArchivedAt,
    ).not.toBeNull();
  });
});
