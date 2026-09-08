import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import { seedOrganisations } from '../../packages/database/src/seed.js';

loadWorkspaceEnvironment();
const url = process.env.TEST_DATABASE_URL ?? '';
assertTestDatabase(url, 'test');
const db = createDatabase(url);
const organisationId = randomUUID();
beforeAll(async () => {
  await db.$connect();
});
afterAll(async () => {
  await db.organisation.deleteMany({ where: { id: organisationId } });
  await db.$disconnect();
});

describe('PostgreSQL foundation', () => {
  it('applies the application marker and preserves Unicode and timezone', async () => {
    expect(await db.applicationMetadata.findUnique({ where: { id: 'svara' } })).toMatchObject({
      schemaVersion: 1,
    });
    const organisation = await db.organisation.create({
      data: { id: organisationId, name: 'हिमाल क्याम्पस परीक्षण' },
    });
    expect(organisation.timezone).toBe('Asia/Kathmandu');
    expect(organisation.name).toBe('हिमाल क्याम्पस परीक्षण');
  });

  it('seeds idempotently without replacing a user-created organisation', async () => {
    await seedOrganisations(db);
    await seedOrganisations(db);
    expect(
      await db.organisation.count({
        where: {
          id: {
            in: ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'],
          },
        },
      }),
    ).toBe(2);
    expect(await db.organisation.findUnique({ where: { id: organisationId } })).not.toBeNull();
  });

  it('rejects a membership with nonexistent parent records at the database boundary', async () => {
    await expect(
      db.membership.create({
        data: { organisationId: randomUUID(), userId: randomUUID(), role: 'VIEWER' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
