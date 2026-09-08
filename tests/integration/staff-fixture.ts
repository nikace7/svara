import { randomBytes, randomUUID } from 'node:crypto';
import { loadWorkspaceEnvironment } from '../../packages/config/src/server.js';
import { createDatabase } from '../../packages/database/src/index.js';
import { assertTestDatabase } from '../../packages/database/src/safety.js';
import { IdentityService } from '../../packages/domain/src/identity/service.js';

export async function staffFixture() {
  loadWorkspaceEnvironment();
  const url = process.env.TEST_DATABASE_URL ?? '';
  assertTestDatabase(url, 'test');
  const db = createDatabase(url);
  const pepper = randomBytes(48).toString('hex');
  const service = new IdentityService(db, pepper);
  const suffix = `${randomUUID()}@staff-http.example.test`;
  const password = 'Synthetic staff password 42!';
  const owner = await service.register({
    email: `owner-${suffix}`,
    password,
    displayName: 'Campus Owner',
    organisationName: 'HTTP Test Campus',
  });
  return {
    db,
    service,
    pepper,
    suffix,
    password,
    owner,
    options: { service, pepper, origin: 'http://localhost:4320', consumeLimit: async () => 0 },
    async close() {
      const organisations = await db.organisation.findMany({
        where: { memberships: { some: { user: { email: { endsWith: suffix } } } } },
        select: { id: true },
      });
      const where = { organisationId: { in: organisations.map((item) => item.id) } };
      await db.staffGrant.deleteMany({ where });
      await db.staffSession.deleteMany({ where });
      await db.auditEntry.deleteMany({ where });
      await db.membership.deleteMany({ where });
      await db.organisation.deleteMany({ where: { id: where.organisationId } });
      await db.user.deleteMany({ where: { email: { endsWith: suffix } } });
      await db.$disconnect();
    },
  };
}
