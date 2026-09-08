import type { PrismaClient } from './generated/client.js';

export async function seedOrganisations(db: PrismaClient): Promise<void> {
  for (const data of [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Himal Campus Visitor Centre' },
    { id: '20000000-0000-4000-8000-000000000001', name: 'Riverside Exhibition Centre' },
  ]) {
    await db.organisation.upsert({ where: { id: data.id }, create: data, update: {} });
  }
}
