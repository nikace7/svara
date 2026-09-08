import { expect, it } from 'vitest';
import { staffFixture } from './staff-fixture.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';

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
