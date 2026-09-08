import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';

describe('scoped bot drafts on PostgreSQL', () => {
  let staff: Awaited<ReturnType<typeof staffFixture>>;
  let bots: BotService;
  beforeAll(async () => {
    staff = await staffFixture();
    bots = new BotService(new IdentityService(staff.db, staff.pepper));
  });
  afterAll(async () => {
    await staff.db.bot.deleteMany({
      where: {
        organisation: { memberships: { some: { user: { email: { endsWith: staff.suffix } } } } },
      },
    });
    await staff.close();
  });
  it('creates an organisation-scoped draft and rejects injected authority', async () => {
    const bot = await bots.create(staff.owner.token, {
      name: 'प्रवेश मार्गदर्शक',
      description: 'Admissions helper',
    });
    expect(bot.revision).toBe(1);
    expect(bot.draft.voiceNe).toBe('ne-NP-HemkalaNeural');
    expect(bot.draft.greeting.ne).toBe('');
    expect((await bots.list(staff.owner.token, {})).items.map((item) => item.id)).toContain(bot.id);
    await expect(
      bots.create(staff.owner.token, {
        name: 'Inject',
        description: '',
        organisationId: staff.owner.identity.organisation.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const other = await staff.service.register({
      email: `bot-foreign-${staff.suffix}`,
      password: staff.password,
      displayName: 'Foreign',
      organisationName: 'Foreign campus',
    });
    await expect(bots.get(other.token, bot.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await bots.list(other.token, {})).items).toHaveLength(0);
  });
  it('requires a revision and permits exactly one winner under concurrent saves', async () => {
    const bot = await bots.create(staff.owner.token, { name: 'Race Guide', description: '' });
    const input = { name: bot.name, description: '', draft: bot.draft };
    await expect(bots.save(staff.owner.token, bot.id, input)).rejects.toMatchObject({
      code: 'PRECONDITION_REQUIRED',
    });
    const results = await Promise.allSettled(
      ['A', 'B'].map((name) =>
        bots.save(staff.owner.token, bot.id, { ...input, name, expectedRevision: 1 }),
      ),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((item) => item.status === 'rejected').map((item) => item.reason.code),
    ).toEqual(['REVISION_CONFLICT']);
    expect((await bots.get(staff.owner.token, bot.id)).revision).toBe(2);
  });
  it('keeps archived drafts readable but excludes them from active lists and rejects edits', async () => {
    const bot = await bots.create(staff.owner.token, { name: 'Archive Guide', description: '' });
    const archived = await bots.archive(staff.owner.token, bot.id, {
      expectedRevision: 1,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect((await bots.list(staff.owner.token, {})).items.map((item) => item.id)).not.toContain(
      bot.id,
    );
    await expect(
      bots.save(staff.owner.token, bot.id, {
        name: 'Changed',
        description: '',
        draft: bot.draft,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' });
    await bots.archive(staff.owner.token, bot.id, { expectedRevision: 2, archived: false });
    expect((await bots.get(staff.owner.token, bot.id)).revision).toBe(3);
  });
  it('permits administrators to author and denies operators, viewers and revoked sessions', async () => {
    for (const role of ['ADMINISTRATOR', 'OPERATOR', 'VIEWER'] as const) {
      const email = `${role}-${staff.suffix}`;
      const grant = await staff.service.invite(staff.owner.token, { email, role });
      await staff.service.activate({
        token: grant.token,
        displayName: role,
        password: staff.password,
      });
      const session = await staff.service.login({ email, password: staff.password });
      if (role === 'ADMINISTRATOR')
        await expect(
          bots.create(session.token, { name: 'Admin bot', description: '' }),
        ).resolves.toBeDefined();
      else
        await expect(
          bots.create(session.token, { name: 'Forbidden bot', description: '' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await staff.service.logout(session.token);
      await expect(bots.list(session.token, {})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });
});
