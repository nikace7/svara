import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';
import { KnowledgeService } from '../../packages/domain/src/authoring/knowledge.js';

const bilingual = {
  type: 'FAQ',
  title: 'Office hours',
  content: { en: 'Open Monday to Friday.', ne: 'सोमबारदेखि शुक्रबारसम्म खुला छ।' },
  question: { en: 'When is the office open?', ne: 'कार्यालय कहिले खुल्छ?' },
};
describe('scoped knowledge review on PostgreSQL', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let bots: BotService;
  let knowledge: KnowledgeService;
  beforeAll(async () => {
    staff = await staffFixture();
    const identity = new IdentityService(staff.db, staff.pepper);
    bots = new BotService(identity);
    knowledge = new KnowledgeService(identity);
  });
  afterAll(async () => {
    if (!staff) return;
    await staff.db.bot.deleteMany({
      where: {
        organisation: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      },
    });
    await staff.close();
  });
  const create = async () => {
    const bot = await bots.create(staff.owner.token, { name: 'Knowledge guide' });
    const entry = await knowledge.create(staff.owner.token, bot.id, {
      type: 'FAQ',
      title: 'Office hours',
    });
    return { bot, entry };
  };
  it('creates incomplete drafts and gates approval on both languages with actionable errors', async () => {
    const { bot, entry } = await create();
    expect(entry).toMatchObject({ status: 'DRAFT', selected: true, revision: 1, botRevision: 2 });
    await expect(
      knowledge.approve(staff.owner.token, entry.id, { expectedRevision: 1, approved: true }),
    ).rejects.toMatchObject({
      code: 'INCOMPLETE_TRANSLATIONS',
      fieldErrors: { 'content.en': expect.any(Array), 'question.ne': expect.any(Array) },
    });
    expect((await bots.get(staff.owner.token, bot.id)).revision).toBe(2);
    const saved = await knowledge.save(staff.owner.token, entry.id, {
      ...bilingual,
      expectedRevision: 1,
    });
    const approved = await knowledge.approve(staff.owner.token, entry.id, {
      expectedRevision: saved.revision,
      approved: true,
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.botRevision).toBe(4);
  });
  it('preserves approval on selection changes but invalidates it when text is edited', async () => {
    const { bot, entry } = await create();
    await knowledge.save(staff.owner.token, entry.id, { ...bilingual, expectedRevision: 1 });
    await knowledge.approve(staff.owner.token, entry.id, { expectedRevision: 2, approved: true });
    const excluded = await knowledge.select(staff.owner.token, entry.id, {
      expectedRevision: 3,
      selected: false,
    });
    expect(excluded).toMatchObject({ status: 'APPROVED', selected: false, revision: 4 });
    const changed = await knowledge.save(staff.owner.token, entry.id, {
      ...bilingual,
      title: 'Changed hours',
      expectedRevision: 4,
    });
    expect(changed).toMatchObject({
      status: 'DRAFT',
      approvedAt: null,
      selected: false,
      revision: 5,
    });
    expect((await bots.get(staff.owner.token, bot.id)).revision).toBe(6);
    const list = await knowledge.list(staff.owner.token, bot.id, {
      search: 'Changed',
      status: 'DRAFT',
    });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty('content');
  });
  it('rejects missing revisions and permits one winner when approval races a save', async () => {
    const { entry } = await create();
    await expect(knowledge.save(staff.owner.token, entry.id, bilingual)).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
    });
    await knowledge.save(staff.owner.token, entry.id, { ...bilingual, expectedRevision: 1 });
    const results = await Promise.allSettled([
      knowledge.approve(staff.owner.token, entry.id, { expectedRevision: 2, approved: true }),
      knowledge.save(staff.owner.token, entry.id, {
        ...bilingual,
        title: 'New draft text',
        expectedRevision: 2,
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected').map((result) => result.reason.code),
    ).toEqual(['REVISION_CONFLICT']);
    expect((await knowledge.get(staff.owner.token, entry.id)).revision).toBe(3);
  });
  it('scopes children to their bot and organisation, including database foreign keys', async () => {
    const { bot, entry } = await create();
    const foreign = await staff.service.register({
      email: `knowledge-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign',
      organisationName: 'Other campus',
    });
    await expect(knowledge.get(foreign.token, entry.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(knowledge.list(foreign.token, bot.id, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      knowledge.save(foreign.token, entry.id, { ...bilingual, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      staff.db.knowledgeEntry.create({
        data: {
          organisationId: foreign.identity.organisation.id,
          botId: bot.id,
          type: 'NOTE',
          title: 'Wrong tenant',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('freezes children of archived bots and revision-checks deletion without deleting audit history', async () => {
    const { bot, entry } = await create();
    await bots.archive(staff.owner.token, bot.id, { expectedRevision: 2, archived: true });
    await expect(
      knowledge.save(staff.owner.token, entry.id, { ...bilingual, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    await expect(
      knowledge.remove(staff.owner.token, entry.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    expect((await knowledge.get(staff.owner.token, entry.id)).id).toBe(entry.id);
    await bots.archive(staff.owner.token, bot.id, { expectedRevision: 3, archived: false });
    await expect(
      knowledge.remove(staff.owner.token, entry.id, { expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await knowledge.remove(staff.owner.token, entry.id, { expectedRevision: 1 });
    await expect(knowledge.get(staff.owner.token, entry.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await bots.get(staff.owner.token, bot.id)).revision).toBe(5);
    expect(
      await staff.db.auditEntry.count({
        where: { targetId: entry.id, action: 'knowledge.deleted' },
      }),
    ).toBe(1);
  });
  it('restricts review to owners and administrators and rechecks revoked memberships', async () => {
    const { bot, entry } = await create();
    await knowledge.save(staff.owner.token, entry.id, { ...bilingual, expectedRevision: 1 });
    for (const role of ['ADMINISTRATOR', 'OPERATOR', 'VIEWER'] as const) {
      const email = `knowledge-${role}-${staff.suffix}`;
      const grant = await staff.service.invite(staff.owner.token, { email, role });
      await staff.service.activate({
        token: grant.token,
        displayName: role,
        password: staff.password,
      });
      const session = await staff.service.login({ email, password: staff.password });
      if (role === 'ADMINISTRATOR')
        await knowledge.approve(session.token, entry.id, { expectedRevision: 2, approved: true });
      else {
        expect((await knowledge.get(session.token, entry.id)).status).toBe('APPROVED');
        await expect(
          knowledge.create(session.token, bot.id, { type: 'NOTE', title: 'Denied' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
          knowledge.approve(session.token, entry.id, { expectedRevision: 3, approved: false }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
      await staff.service.logout(session.token);
      await expect(knowledge.get(session.token, entry.id)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    }
  });
});
