import { expect, it, vi } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';
import { BotService } from '../../packages/domain/src/authoring/bots.js';

it('retries raw SQL serialization failures but never retries a constraint error', async () => {
  const staff = await staffFixture();
  const identity = new IdentityService(staff.db, staff.pepper);
  const organisationId = staff.owner.identity.organisation.id;
  let attempts = 0;
  let constraintAttempts = 0;
  try {
    await identity.asStaff(staff.owner.token, 'author', async (tx) => {
      if (++attempts === 1)
        await tx.$executeRaw`DO $$ BEGIN RAISE EXCEPTION 'Synthetic serialization conflict' USING ERRCODE = '40001'; END $$`;
      await tx.bot.create({ data: { organisationId, name: 'After raw query contention' } });
    });
    expect(attempts).toBe(2);
    expect(await staff.db.bot.count({ where: { organisationId } })).toBe(1);
    await expect(
      identity.asStaff(staff.owner.token, 'author', async (tx) => {
        constraintAttempts++;
        await tx.$executeRaw`DO $$ BEGIN RAISE EXCEPTION 'Synthetic constraint failure' USING ERRCODE = '23514'; END $$`;
      }),
    ).rejects.toMatchObject({ code: 'P2010' });
    expect(constraintAttempts).toBe(1);
  } finally {
    await staff.db.bot.deleteMany({ where: { organisationId } });
    await staff.close();
  }
});

it('allows five bounded serialization retries without duplicate writes or cached authority', async () => {
  const staff = await staffFixture();
  const identity = new IdentityService(staff.db, staff.pepper);
  const bots = new BotService(identity);
  const organisationId = staff.owner.identity.organisation.id;
  const conflict = Object.assign(new Error('Simulated serialization failure'), { code: 'P2034' });
  const transaction = vi.spyOn(staff.db, '$transaction');
  try {
    for (let attempt = 0; attempt < 5; attempt++) transaction.mockRejectedValueOnce(conflict);
    await bots.create(staff.owner.token, { name: 'After contention' });
    expect(transaction).toHaveBeenCalledTimes(6);
    expect(await staff.db.bot.count({ where: { organisationId } })).toBe(1);
    expect(
      await staff.db.auditEntry.count({ where: { organisationId, action: 'bot.created' } }),
    ).toBe(1);
    transaction.mockClear();
    for (let attempt = 0; attempt < 6; attempt++) transaction.mockRejectedValueOnce(conflict);
    await expect(bots.create(staff.owner.token, { name: 'Beyond retry budget' })).rejects.toBe(
      conflict,
    );
    expect(transaction).toHaveBeenCalledTimes(6);
    transaction.mockClear();
    transaction.mockImplementationOnce(async () => {
      await identity.logout(staff.owner.token);
      throw conflict;
    });
    await expect(
      bots.create(staff.owner.token, { name: 'Revoked during contention' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(await staff.db.bot.count({ where: { organisationId } })).toBe(1);
  } finally {
    transaction.mockRestore();
    await staff.db.botDraft.deleteMany({ where: { organisationId } });
    await staff.db.bot.deleteMany({ where: { organisationId } });
    await staff.close();
  }
});

it('completes a burst of independent authoring requests using the same staff session', async () => {
  const staff = await staffFixture();
  const identity = new IdentityService(staff.db, staff.pepper);
  const bots = new BotService(identity);
  const organisationId = staff.owner.identity.organisation.id;
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        bots.create(staff.owner.token, { name: `Concurrent author ${index}` }),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'P2034' });
    }
    expect(results.map((result) => result.status)).toEqual(Array(12).fill('fulfilled'));
    expect(await staff.db.bot.count({ where: { organisationId } })).toBe(12);
    expect(
      await staff.db.auditEntry.count({ where: { organisationId, action: 'bot.created' } }),
    ).toBe(12);
    await identity.logout(staff.owner.token);
    await expect(bots.create(staff.owner.token, { name: 'Revoked' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  } finally {
    await staff.db.botDraft.deleteMany({ where: { organisationId } });
    await staff.db.bot.deleteMany({ where: { organisationId } });
    await staff.close();
  }
});

it('retries serializable conflicts raised by the driver at commit, rerunning staff authority', async () => {
  const staff = await staffFixture();
  const identity = new IdentityService(staff.db, staff.pepper);
  const organisationId = staff.owner.identity.organisation.id;
  let readers = 0;
  let writers = 0;
  let releaseReaders!: () => void;
  let releaseWriters!: () => void;
  const readBarrier = new Promise<void>((resolve) => {
    releaseReaders = resolve;
  });
  const writeBarrier = new Promise<void>((resolve) => {
    releaseWriters = resolve;
  });
  const attempts = [0, 0];
  try {
    const results = await Promise.allSettled(
      [0, 1].map((index) =>
        identity.asStaff(
          staff.owner.token,
          'author',
          async (tx, { member }) => {
            const firstAttempt = ++attempts[index]! === 1;
            expect(member.organisationId).toBe(organisationId);
            await tx.bot.count({ where: { organisationId } });
            if (firstAttempt) {
              if (++readers === 2) releaseReaders();
              await readBarrier;
            }
            const bot = await tx.bot.create({
              data: { organisationId, name: `Commit race ${index}` },
            });
            if (firstAttempt) {
              if (++writers === 2) releaseWriters();
              await writeBarrier;
            }
            return bot.id;
          },
          false,
        ),
      ),
    );
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(attempts.reduce((sum, value) => sum + value, 0)).toBe(3);
    expect(await staff.db.bot.count({ where: { organisationId } })).toBe(2);
  } finally {
    await staff.db.bot.deleteMany({ where: { organisationId } });
    await staff.close();
  }
});
